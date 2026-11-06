-- The shipped chat and Crush Live clients submit the existing user_reports
-- form. Keep that real form usable inside one synthetic cohort without
-- notifying the staff queue or introducing reports about real people.
INSERT INTO social_demo_private.relations(relation,owners,parents)
 VALUES('public.user_reports','{reporter_id,reported_user_id}','{}');
ALTER TABLE public.user_reports ADD COLUMN social_demo_cohort_id uuid REFERENCES social_demo_private.cohorts(id);
CREATE INDEX ON public.user_reports(social_demo_cohort_id) WHERE social_demo_cohort_id IS NOT NULL;
CREATE TRIGGER "000_social_demo_scope" BEFORE INSERT OR UPDATE OR DELETE ON public.user_reports
 FOR EACH ROW EXECUTE FUNCTION social_demo_private.scope_row();
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_demo_read_boundary ON public.user_reports;
CREATE POLICY social_demo_scope_boundary ON public.user_reports AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(public.social_demo_row_visible(social_demo_cohort_id)) WITH CHECK(public.social_demo_row_visible(social_demo_cohort_id));

-- DEFINER is needed to validate participation without disclosing another
-- person's rows. The cohort is already derived by scope_row, not by the client.
CREATE FUNCTION social_demo_private.guard_user_report_context() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.social_demo_cohort_id IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND (NEW.reporter_id,NEW.reported_user_id,NEW.context,NEW.context_id)
  IS NOT DISTINCT FROM (OLD.reporter_id,OLD.reported_user_id,OLD.context,OLD.context_id) THEN RETURN NEW;END IF;
 IF NEW.context='chat' THEN
  -- Current mobile/web chat forms omit context_id. In that case require an
  -- actual shared conversation; an explicit id must identify that conversation.
  IF NOT EXISTS(SELECT 1 FROM public.conversations c
   JOIN public.conversation_participants a ON a.conversation_id=c.id AND a.user_id=NEW.reporter_id
   JOIN public.conversation_participants b ON b.conversation_id=c.id AND b.user_id=NEW.reported_user_id
   WHERE c.social_demo_cohort_id=NEW.social_demo_cohort_id AND (NEW.context_id IS NULL OR c.id=NEW.context_id))
  THEN RAISE EXCEPTION 'social_demo_report_context_forbidden' USING ERRCODE='42501';END IF;
 ELSIF NEW.context='profile' THEN
  -- The ordinary profile form omits context_id; Crush Live sends the event id.
  IF NEW.context_id IS NOT NULL AND NEW.context_id<>NEW.reported_user_id
   AND NOT EXISTS(SELECT 1 FROM public.social_demo_visible_events e
    JOIN public.event_participants a ON a.event_id=e.id AND a.user_id=NEW.reporter_id AND a.status IN('registered','attended')
    JOIN public.event_participants b ON b.event_id=e.id AND b.user_id=NEW.reported_user_id AND b.status IN('registered','attended')
    WHERE e.id=NEW.context_id AND e.social_demo_cohort_id=NEW.social_demo_cohort_id)
  THEN RAISE EXCEPTION 'social_demo_report_context_forbidden' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'social_demo_report_context_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_demo_private.guard_user_report_context() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER "001_social_demo_report_context" BEFORE INSERT OR UPDATE ON public.user_reports
 FOR EACH ROW EXECUTE FUNCTION social_demo_private.guard_user_report_context();

-- Preserve all existing RLS/ACL for invoker readers and filter definer readers
-- as well. The view exposes no new columns and receives no write privileges.
CREATE VIEW public.social_demo_visible_user_reports WITH(security_invoker=true) AS
 SELECT * FROM public.user_reports WHERE public.social_demo_row_visible(social_demo_cohort_id);
REVOKE ALL ON public.social_demo_visible_user_reports FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE reader text;BEGIN
 FOREACH reader IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(reader,'public.user_reports','SELECT') THEN
   EXECUTE format('GRANT SELECT ON public.social_demo_visible_user_reports TO %I',reader);
  END IF;
 END LOOP;
END $$;
DO $$DECLARE f record;d text;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('public','private','workspace_private','social_private') AND p.prokind='f'
 AND pg_get_functiondef(p.oid) ~* '\m(FROM|JOIN)\s+(public\.)?user_reports\M' LOOP
  SELECT pg_get_functiondef(f.signature) INTO d;
  EXECUTE regexp_replace(d,'\m(FROM|JOIN)\s+(public\.)?user_reports\M','\1 public.social_demo_visible_user_reports','gi');
 END LOOP;
 SELECT pg_get_functiondef('public.avisar_denuncia()'::regprocedure) INTO d;
 IF strpos(d,'BEGIN')=0 THEN RAISE EXCEPTION 'social_demo_report_notice_changed';END IF;
 EXECUTE regexp_replace(d,'\mBEGIN\M','BEGIN IF NEW.social_demo_cohort_id IS NOT NULL THEN RETURN NEW;END IF;');
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;
 IF strpos(d,'RAISE EXCEPTION ''social_demo_operation_disabled''')=0 THEN RAISE EXCEPTION 'social_demo_report_request_changed';END IF;
 EXECUTE replace(d,'RAISE EXCEPTION ''social_demo_operation_disabled''',
  'IF route=''/user_reports'' AND method IN(''GET'',''HEAD'',''POST'') THEN RETURN;END IF; RAISE EXCEPTION ''social_demo_operation_disabled''');
END $$;
NOTIFY pgrst,'reload schema';
