-- Atomic report sanction with a unique strike per report and verified admin+AAL2 access.
-- Manual strikes with report_id=NULL retain their existing entry point.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF to_regprocedure('public.issue_strike_from_report(uuid,text)') IS NOT NULL
 OR to_regclass('public.user_strikes_one_per_report_idx') IS NOT NULL
 THEN RAISE EXCEPTION 'strike_contract_drift'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_strikes WHERE report_id IS NOT NULL GROUP BY report_id HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM public.user_strikes s JOIN public.user_reports r ON r.id=s.report_id WHERE s.user_id IS DISTINCT FROM r.reported_user_id)
 THEN RAISE EXCEPTION 'existing_report_strikes_need_review'; END IF;
 IF replace(pg_get_functiondef('public.handle_new_strike()'::regprocedure),chr(13),'')
 IS DISTINCT FROM $expected$CREATE OR REPLACE FUNCTION public.handle_new_strike()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer; v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id=NEW.user_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_profile.role='admin' THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.user_strikes WHERE user_id=NEW.user_id;
  UPDATE public.profiles SET strikes_count=v_count,updated_at=now() WHERE id=NEW.user_id;
  IF v_count>=3 THEN
    IF v_profile.is_discarded IS NOT TRUE OR v_profile.self_deleted IS TRUE THEN
      INSERT INTO public.discarded_records(original_table,original_id,data,deleted_by,reason)
      VALUES('profiles',NEW.user_id,to_jsonb(v_profile),NEW.issued_by,'3 strikes reached - auto discard');
    END IF;
    UPDATE public.profiles SET is_discarded=true,self_deleted=false,
      discarded_by=NEW.issued_by,discarded_at=coalesce(discarded_at,now()),updated_at=now() WHERE id=NEW.user_id;
  END IF;
  RETURN NEW;
END $function$
$expected$
 THEN RAISE EXCEPTION 'strike_trigger_drift'; END IF;
END $guard$;

CREATE UNIQUE INDEX user_strikes_one_per_report_idx ON public.user_strikes(report_id)
 WHERE report_id IS NOT NULL;

-- Also orders old direct INSERTs before the unique check/FK AFTER triggers:
-- target profile -> report -> insert -> existing third-strike trigger.
CREATE FUNCTION public.guard_report_strike_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE v_target_role text; v_report_target uuid; v_status text;
BEGIN
 IF current_user IN ('anon','authenticated') THEN
   IF NOT public.is_admin() OR COALESCE(auth.jwt()->>'aal','')<>'aal2'
   THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
   NEW.issued_by:=auth.uid();
 END IF;
 SELECT role INTO v_target_role FROM public.profiles WHERE id=NEW.user_id FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'strike_target_missing' USING ERRCODE='P0002'; END IF;
 IF v_target_role='admin' THEN RAISE EXCEPTION 'admin_account_protected' USING ERRCODE='42501'; END IF;
 IF NEW.report_id IS NOT NULL THEN
   SELECT reported_user_id,status INTO v_report_target,v_status
    FROM public.user_reports WHERE id=NEW.report_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found' USING ERRCODE='P0002'; END IF;
   IF v_report_target IS DISTINCT FROM NEW.user_id
   THEN RAISE EXCEPTION 'report_target_mismatch' USING ERRCODE='22023'; END IF;
   IF v_status IS DISTINCT FROM 'pending'
   THEN RAISE EXCEPTION 'report_already_resolved' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $function$;
ALTER FUNCTION public.guard_report_strike_insert() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_report_strike_insert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_guard_report_strike_insert BEFORE INSERT ON public.user_strikes
 FOR EACH ROW EXECUTE FUNCTION public.guard_report_strike_insert();

CREATE FUNCTION public.issue_strike_from_report(p_report_id uuid,p_admin_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_target uuid;
 v_target_role text;
 v_report public.user_reports%ROWTYPE;
 v_strike public.user_strikes%ROWTYPE;
 v_already boolean;
 v_note text:=COALESCE(NULLIF(btrim(p_admin_notes),''),'Strike emitido');
BEGIN
 IF v_actor IS NULL OR COALESCE(auth.jwt()->>'aal','')<>'aal2' OR NOT public.is_admin()
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 IF p_report_id IS NULL OR length(v_note)>2000
 THEN RAISE EXCEPTION 'invalid_strike_input' USING ERRCODE='22023'; END IF;
 -- Read identity only, then lock profiles in UUID order. Revalidate report afterwards.
 SELECT reported_user_id INTO v_target FROM public.user_reports WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.profiles WHERE id IN(v_actor,v_target) ORDER BY id FOR NO KEY UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_actor AND role='admin' AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_target_role FROM public.profiles WHERE id=v_target;
 IF NOT FOUND THEN RAISE EXCEPTION 'strike_target_missing' USING ERRCODE='P0002'; END IF;
 IF v_target_role='admin' THEN RAISE EXCEPTION 'admin_account_protected' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_report FROM public.user_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found' USING ERRCODE='P0002'; END IF;
 IF v_report.reported_user_id IS DISTINCT FROM v_target
 THEN RAISE EXCEPTION 'report_changed_retry' USING ERRCODE='40001'; END IF;
 IF v_report.status IS NULL OR v_report.status='dismissed'
 THEN RAISE EXCEPTION 'report_already_resolved' USING ERRCODE='55000'; END IF;

 SELECT * INTO v_strike FROM public.user_strikes WHERE report_id=p_report_id;
 v_already:=FOUND;
 IF v_already THEN
   IF v_strike.user_id IS DISTINCT FROM v_target
   THEN RAISE EXCEPTION 'report_target_mismatch' USING ERRCODE='22023'; END IF;
   IF v_report.status IN ('reviewed','actioned') THEN
     RETURN jsonb_build_object('strike_id',v_strike.id,'report_id',p_report_id,'user_id',v_target,
       'already_issued',true,'report_status',v_report.status);
   END IF;
 ELSE
   IF v_report.status IS DISTINCT FROM 'pending'
   THEN RAISE EXCEPTION 'report_already_resolved' USING ERRCODE='55000'; END IF;
   INSERT INTO public.user_strikes(user_id,issued_by,report_id,reason)
    VALUES(v_target,v_actor,p_report_id,'Reporte: '||v_report.reason) RETURNING * INTO v_strike;
 END IF;
 -- Repair a pending legacy report that already has its one strike without reissuing it.
 UPDATE public.user_reports SET status='reviewed',admin_notes=v_note,
   reviewed_by=v_actor,reviewed_at=now() WHERE id=p_report_id;
 INSERT INTO public.admin_actions(actor_id,action,target_table,target_id,changes)
 VALUES(v_actor,CASE WHEN v_already THEN 'resolve_existing_report_strike' ELSE 'issue_strike_from_report' END,
   'user_reports',p_report_id::text,
   jsonb_build_object('strike_id',v_strike.id,'reported_user_id',v_target,'admin_notes',v_note));
 RETURN jsonb_build_object('strike_id',v_strike.id,'report_id',p_report_id,'user_id',v_target,
   'already_issued',v_already,'report_status','reviewed');
END $function$;
ALTER FUNCTION public.issue_strike_from_report(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.issue_strike_from_report(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue_strike_from_report(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.issue_strike_from_report(uuid,text) IS
 'Admin+AAL2, one strike per report and atomic review. Derives target/reason from the report, supports safe legacy reconciliation, preserves the third-strike trigger.';
NOTIFY pgrst,'reload schema';
COMMIT;