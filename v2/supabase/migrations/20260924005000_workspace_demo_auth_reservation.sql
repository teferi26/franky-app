-- Reserve identity BEFORE GoTrue's first INSERT (app_metadata arrives later in v2.197.0).
CREATE TABLE workspace_private.demo_auth_reservations (
 user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE CHECK(email ~ '^[a-z0-9._+-]+@demo\.franky\.invalid$'),
 scenario text NOT NULL CHECK(scenario IN('owner','agency','community','leisure','university','creator')),
 cohort_id uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE workspace_private.demo_auth_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_private.demo_auth_reservations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_workspace_demo_auth_identity(p_email text,p_scenario text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r workspace_private.demo_auth_reservations%ROWTYPE; u uuid;BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_required';END IF;
 SELECT * INTO r FROM workspace_private.demo_auth_reservations WHERE email=p_email;
 IF FOUND THEN
  IF r.scenario<>p_scenario THEN RAISE EXCEPTION 'demo_reservation_mismatch';END IF;
  RETURN jsonb_build_object('user_id',r.user_id,'cohort_id',r.cohort_id,'reserved',true,'created',EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id));
 END IF;
 -- Exact-email recovery of a previously protected demo; never scan real users.
 SELECT a.id INTO u FROM auth.users a JOIN public.workspace_demo_accounts d ON d.user_id=a.id
 WHERE lower(a.email)=p_email AND a.raw_app_meta_data->>'workspace_demo_scenario'=p_scenario AND a.deleted_at IS NULL;
 RETURN CASE WHEN u IS NULL THEN NULL ELSE jsonb_build_object('user_id',u,'reserved',false,'created',true) END;
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_demo_auth_identity(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_demo_auth_identity(text,text) TO service_role;

CREATE FUNCTION public.reserve_workspace_demo_auth(p_email text,p_scenario text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r workspace_private.demo_auth_reservations%ROWTYPE;BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_required';END IF;
 IF p_email IS NULL OR p_email !~ '^[a-z0-9._+-]+@demo\.franky\.invalid$'
 OR p_scenario IS NULL OR p_scenario NOT IN('owner','agency','community','leisure','university','creator') THEN RAISE EXCEPTION 'invalid_demo_identity';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_email,24005000));
 SELECT * INTO r FROM workspace_private.demo_auth_reservations WHERE email=p_email;
 IF FOUND THEN
  IF r.scenario<>p_scenario THEN RAISE EXCEPTION 'demo_reservation_mismatch';END IF;
  RETURN public.get_workspace_demo_auth_identity(p_email,p_scenario);
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_email) THEN RAISE EXCEPTION 'existing_account_cannot_become_demo';END IF;
 INSERT INTO workspace_private.demo_auth_reservations(email,scenario) VALUES(p_email,p_scenario) RETURNING * INTO r;
 RETURN jsonb_build_object('user_id',r.user_id,'cohort_id',r.cohort_id,'reserved',true,'created',false);
END $$;
REVOKE ALL ON FUNCTION public.reserve_workspace_demo_auth(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_workspace_demo_auth(text,text) TO service_role;

DO $$DECLARE d text;anchor text:='IF scenario IS NULL THEN RETURN NEW;END IF;';BEGIN
 SELECT pg_get_functiondef('workspace_private.reserve_new_demo_identity()'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'workspace_auth_reservation_trigger_changed';END IF;
 EXECUTE replace(d,anchor,$patch$
 -- workspace_demo_pre_auth_reservation_v1: no client-supplied metadata involved.
 IF EXISTS(SELECT 1 FROM workspace_private.demo_auth_reservations WHERE user_id=NEW.id OR email=lower(NEW.email)) THEN
  IF NOT EXISTS(SELECT 1 FROM workspace_private.demo_auth_reservations WHERE user_id=NEW.id AND email=lower(NEW.email)) THEN RAISE EXCEPTION 'demo_reservation_mismatch';END IF;
  INSERT INTO public.workspace_demo_accounts(user_id,cohort_id)
  SELECT NEW.id,r.cohort_id FROM workspace_private.demo_auth_reservations r WHERE r.user_id=NEW.id;
  RETURN NEW;
 END IF;
 IF scenario IS NULL THEN
  IF lower(coalesce(NEW.email,'')) ~ '@demo\.franky\.invalid$' THEN RAISE EXCEPTION 'demo_identity_not_reserved';END IF;
  RETURN NEW;
 END IF;
 $patch$);
END $$;

CREATE OR REPLACE FUNCTION public.workspace_demo_provisioning_ready() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_required';END IF;
 RETURN EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='aaa_workspace_reserve_demo' AND tgenabled IN('O','A'))
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created' AND tgenabled IN('O','A'))
 AND strpos(pg_get_functiondef('workspace_private.reserve_new_demo_identity()'::regprocedure),'workspace_demo_pre_auth_reservation_v1')>0
 AND to_regclass('workspace_private.demo_auth_reservations') IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.workspace_demo_provisioning_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_demo_provisioning_ready() TO service_role;
NOTIFY pgrst,'reload schema';
