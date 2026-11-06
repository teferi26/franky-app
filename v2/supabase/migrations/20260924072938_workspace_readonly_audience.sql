-- Hotfix: PostgREST GET/HEAD transactions are READ ONLY. Profile RLS reaches
-- workspace_chat_access -> event_audience_eligible, whose row locks caused
-- SQLSTATE 25006 even when reading one's own profile after Google login.
-- Preserve the exact current authorization predicates and every write-path
-- lock. Only READ ONLY transactions use the private non-locking copies.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $patch$
DECLARE spec record; original text; reader text; dispatch text; locks integer;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('verified_affiliation','p_user,p_university',2),
  ('event_audience_eligible','p_event,p_user',5)
 ) AS specifications(name,arguments,expected_locks) LOOP
  SELECT pg_get_functiondef(to_regprocedure('workspace_private.'||spec.name||'(uuid,uuid)')) INTO original;
  IF original IS NULL THEN RAISE EXCEPTION 'readonly_audience_missing_function: %',spec.name; END IF;
  dispatch:=E'\n IF current_setting(''transaction_read_only'')=''on'' THEN\n  RETURN workspace_private.'||spec.name||'_readonly('||spec.arguments||E');\n END IF;\n';
  -- Reapplying the hotfix rebuilds from the same locked body, never a wrapper
  -- that would recurse. Unexpected production definitions fail closed.
  original:=replace(original,dispatch,'');
  IF strpos(original,spec.name||'_readonly(')>0 THEN
   RAISE EXCEPTION 'readonly_audience_dispatch_changed: %',spec.name;
  END IF;
  SELECT count(*) INTO locks FROM regexp_matches(original,' FOR SHARE( OF (m,c|i|p,d,v))?;','g');
  IF locks<>spec.expected_locks THEN RAISE EXCEPTION 'readonly_audience_lock_shape_changed: % (%)',spec.name,locks; END IF;
  reader:=replace(original,'FUNCTION workspace_private.'||spec.name||'(','FUNCTION workspace_private.'||spec.name||'_readonly(');
  IF reader=original THEN RAISE EXCEPTION 'readonly_audience_signature_changed: %',spec.name; END IF;
  reader:=regexp_replace(reader,' FOR SHARE( OF (m,c|i|p,d,v))?;',';','g');
  IF strpos(reader,'FOR SHARE')>0 OR strpos(reader,'FOR UPDATE')>0 THEN
   RAISE EXCEPTION 'readonly_audience_unhandled_lock: %',spec.name;
  END IF;
  IF spec.name='event_audience_eligible' THEN
   IF strpos(reader,'workspace_private.verified_affiliation(')=0 THEN RAISE EXCEPTION 'readonly_affiliation_call_changed'; END IF;
   reader:=replace(reader,'workspace_private.verified_affiliation(','workspace_private.verified_affiliation_readonly(');
  END IF;
  EXECUTE reader;
  EXECUTE format('ALTER FUNCTION workspace_private.%I(uuid,uuid) STABLE',spec.name||'_readonly');
  EXECUTE format('REVOKE ALL ON FUNCTION workspace_private.%I(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role',spec.name||'_readonly');
  IF strpos(original,'BEGIN')=0 THEN RAISE EXCEPTION 'readonly_audience_body_changed: %',spec.name; END IF;
  EXECUTE regexp_replace(original,'\mBEGIN\M','BEGIN'||dispatch);
 END LOOP;
END $patch$;

COMMENT ON FUNCTION workspace_private.event_audience_eligible_readonly(uuid,uuid) IS
 'Internal read-only audience resolver. Same authorization predicates as the locked write resolver; no row locks and no new client grants.';
COMMENT ON FUNCTION workspace_private.verified_affiliation_readonly(uuid,uuid) IS
 'Internal read-only affiliation resolver. No identity/evidence returned; admission writes retain the original row locks.';
NOTIFY pgrst,'reload schema';
COMMIT;
