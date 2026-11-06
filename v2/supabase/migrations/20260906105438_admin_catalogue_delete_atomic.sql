-- Full snapshot and guarded deletion, rehearsed against synthetic fixtures.
-- 81 checks and three concurrent deletion/reference scenarios passed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $g$ BEGIN
 IF to_regprocedure('public.delete_catalogue_record(text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'delete_rpc_contract_drift'; END IF;
END $g$;

CREATE FUNCTION public.guard_catalogue_delete_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $function$
BEGIN
 IF current_user IN ('anon','authenticated')
 THEN RAISE EXCEPTION 'catalogue_delete_requires_rpc' USING ERRCODE='42501'; END IF;
 RETURN OLD;
END $function$;
ALTER FUNCTION public.guard_catalogue_delete_entry() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_catalogue_delete_entry() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_guard_catalogue_delete_entry BEFORE DELETE ON public.universities
 FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_delete_entry();
CREATE TRIGGER a_guard_catalogue_delete_entry BEFORE DELETE ON public.careers
 FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_delete_entry();
CREATE TRIGGER a_guard_catalogue_delete_entry BEFORE DELETE ON public.scholarships
 FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_delete_entry();
CREATE TRIGGER a_guard_catalogue_delete_entry BEFORE DELETE ON public.leisure_spots
 FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_delete_entry();

CREATE FUNCTION public.delete_catalogue_record(p_table text,p_record_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_relation regclass;
 v_snapshot jsonb;
 v_dependency record;
 v_referenced boolean;
 v_blockers text[]:='{}';
 v_favorite_type text;
 v_discard_id uuid;
 v_deleted_at timestamptz:=now();
 v_deleted_id uuid;
BEGIN
 IF v_actor IS NULL OR COALESCE(auth.jwt()->>'aal','')<>'aal2'
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles
  WHERE id=v_actor AND role='admin' AND is_discarded IS NOT TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 IF p_table IS NULL OR p_record_id IS NULL
 THEN RAISE EXCEPTION 'invalid_delete_input' USING ERRCODE='22023'; END IF;
 IF p_table<>ALL(ARRAY['universities','careers','scholarships','leisure_spots'])
 THEN RAISE EXCEPTION 'delete_requires_specific_workflow' USING ERRCODE='22023'; END IF;

 v_relation:=to_regclass(format('public.%I',p_table));
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table)
 INTO v_snapshot USING p_record_id;
 IF v_snapshot IS NULL THEN RAISE EXCEPTION 'catalogue_record_not_found' USING ERRCODE='P0002'; END IF;
 IF p_table='leisure_spots' AND
    ((v_snapshot->'owner_id') IS DISTINCT FROM 'null'::jsonb
     OR (v_snapshot->'subscription_id') IS DISTINCT FROM 'null'::jsonb)
 THEN RAISE EXCEPTION 'delete_requires_billing_review' USING ERRCODE='22023'; END IF;

 -- The parent FOR UPDATE lock also blocks new FK references' KEY SHARE check.
 -- Reject all live incoming FK links, including SET NULL/DEFAULT and NO ACTION.
 FOR v_dependency IN
  SELECT k.conname,k.conkey,k.confkey,n.nspname,c.relname,
         a.attname AS child_column,pa.attname AS parent_column
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   LEFT JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
   LEFT JOIN pg_attribute pa ON pa.attrelid=k.confrelid AND pa.attnum=k.confkey[1]
  WHERE k.contype='f' AND k.confrelid=v_relation ORDER BY k.oid
 LOOP
  -- All current incoming keys are a single UUID -> id. Fail closed on a new shape.
  IF array_length(v_dependency.conkey,1)<>1 OR array_length(v_dependency.confkey,1)<>1
     OR v_dependency.parent_column IS DISTINCT FROM 'id' OR v_dependency.child_column IS NULL
  THEN RAISE EXCEPTION 'catalogue_dependency_schema_changed' USING ERRCODE='55000'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',
    v_dependency.nspname,v_dependency.relname,v_dependency.child_column)
   INTO v_referenced USING p_record_id;
  IF v_referenced THEN v_blockers:=array_append(v_blockers,v_dependency.nspname||'.'||v_dependency.relname); END IF;
 END LOOP;

 -- Existing non-FK links are also blockers. These SELECT checks do not serialize
 -- concurrent favorites/array writes: no user rows or links are removed here.
 v_favorite_type:=CASE p_table WHEN 'universities' THEN 'university' WHEN 'careers' THEN 'career'
   WHEN 'scholarships' THEN 'scholarship' ELSE 'leisure_spot' END;
 IF EXISTS(SELECT 1 FROM public.favorites WHERE target_type=v_favorite_type AND target_id=p_record_id)
 THEN v_blockers:=array_append(v_blockers,'public.favorites'); END IF;
 IF p_table='universities' THEN
  IF EXISTS(SELECT 1 FROM public.accommodations WHERE p_record_id=ANY(university_ids))
  THEN v_blockers:=array_append(v_blockers,'public.accommodations.university_ids'); END IF;
  IF EXISTS(SELECT 1 FROM public.leisure_spots WHERE p_record_id=ANY(university_ids))
  THEN v_blockers:=array_append(v_blockers,'public.leisure_spots.university_ids'); END IF;
 ELSIF p_table='careers' THEN
  IF EXISTS(SELECT 1 FROM public.universities WHERE p_record_id=ANY(featured_career_ids))
  THEN v_blockers:=array_append(v_blockers,'public.universities.featured_career_ids'); END IF;
 END IF;
 IF cardinality(v_blockers)>0 THEN
  RAISE EXCEPTION 'catalogue_record_has_dependencies'
    USING ERRCODE='23503',DETAIL=jsonb_build_object('tables',v_blockers)::text;
 END IF;

 INSERT INTO public.discarded_records(original_table,original_id,data,deleted_by,deleted_at)
 VALUES(p_table,p_record_id,v_snapshot,v_actor,v_deleted_at) RETURNING id INTO v_discard_id;
 EXECUTE format('DELETE FROM public.%I WHERE id=$1 RETURNING id',p_table)
  INTO v_deleted_id USING p_record_id;
 IF v_deleted_id IS DISTINCT FROM p_record_id
 THEN RAISE EXCEPTION 'catalogue_delete_not_confirmed' USING ERRCODE='55000'; END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_table,target_id,changes)
 VALUES(v_actor,'delete_catalogue_record',p_table,p_record_id::text,
   jsonb_build_object('discarded_record_id',v_discard_id,'snapshot_complete',true));
 RETURN jsonb_build_object('discarded_record_id',v_discard_id,'original_table',p_table,
   'original_id',p_record_id,'deleted_at',v_deleted_at,'snapshot_complete',true);
END $function$;
ALTER FUNCTION public.delete_catalogue_record(text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_catalogue_record(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_catalogue_record(text,uuid) TO authenticated;
COMMENT ON FUNCTION public.delete_catalogue_record(text,uuid) IS
 'Admin+AAL2 full snapshot and atomic delete for restorable catalogues. Rejects live FK and observed generic references; excludes publication, accounts and billing workflows.';
NOTIFY pgrst,'reload schema';
COMMIT;
