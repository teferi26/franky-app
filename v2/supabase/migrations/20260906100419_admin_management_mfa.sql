-- Harden administrative access: 245 local RLS/ACL checks passed; preserve own-row rights.
-- Snapshot: 22 policies / 5 tables (17 privileged, 5 own-row). Preserves ordinary own-row permissions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
DECLARE actual jsonb;
BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(ARRAY['admin_actions','discarded_records','leisure_spot_suggestions','user_reports','user_strikes'])) <> 22 THEN RAISE EXCEPTION 'management_policy_count_drift'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='admin_actions' AND policyname='Admins read admin_actions';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_admin()","roles":["public"],"tablename":"admin_actions","permissive":"PERMISSIVE","policyname":"Admins read admin_actions","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','admin_actions: Admins read admin_actions'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='admin_actions' AND policyname='Staff view admin actions';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_staff()","roles":["authenticated"],"tablename":"admin_actions","permissive":"PERMISSIVE","policyname":"Staff view admin actions","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','admin_actions: Staff view admin actions'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='discarded_records' AND policyname='Only admins insert discarded';
 IF actual IS DISTINCT FROM '{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"discarded_records","permissive":"PERMISSIVE","policyname":"Only admins insert discarded","schemaname":"public","with_check":"is_admin()"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','discarded_records: Only admins insert discarded'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='discarded_records' AND policyname='Only admins see discarded';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_admin()","roles":["public"],"tablename":"discarded_records","permissive":"PERMISSIVE","policyname":"Only admins see discarded","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','discarded_records: Only admins see discarded'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='discarded_records' AND policyname='Staff view discarded records';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_staff()","roles":["authenticated"],"tablename":"discarded_records","permissive":"PERMISSIVE","policyname":"Staff view discarded records","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','discarded_records: Staff view discarded records'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='leisure_spot_suggestions' AND policyname='Admins can manage suggestions';
 IF actual IS DISTINCT FROM '{"cmd":"ALL","qual":"is_admin()","roles":["public"],"tablename":"leisure_spot_suggestions","permissive":"PERMISSIVE","policyname":"Admins can manage suggestions","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','leisure_spot_suggestions: Admins can manage suggestions'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='leisure_spot_suggestions' AND policyname='Staff view leisure suggestions';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_staff()","roles":["authenticated"],"tablename":"leisure_spot_suggestions","permissive":"PERMISSIVE","policyname":"Staff view leisure suggestions","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','leisure_spot_suggestions: Staff view leisure suggestions'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='leisure_spot_suggestions' AND policyname='Users can submit suggestions';
 IF actual IS DISTINCT FROM '{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"leisure_spot_suggestions","permissive":"PERMISSIVE","policyname":"Users can submit suggestions","schemaname":"public","with_check":"(auth.uid() = user_id)"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','leisure_spot_suggestions: Users can submit suggestions'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='leisure_spot_suggestions' AND policyname='Users see own suggestions';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"(auth.uid() = user_id)","roles":["public"],"tablename":"leisure_spot_suggestions","permissive":"PERMISSIVE","policyname":"Users see own suggestions","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','leisure_spot_suggestions: Users see own suggestions'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Admins delete reports';
 IF actual IS DISTINCT FROM '{"cmd":"DELETE","qual":"is_admin()","roles":["public"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Admins delete reports","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Admins delete reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Admins insert reports';
 IF actual IS DISTINCT FROM '{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Admins insert reports","schemaname":"public","with_check":"is_admin()"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Admins insert reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Admins read reports';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_admin()","roles":["public"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Admins read reports","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Admins read reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Admins update reports';
 IF actual IS DISTINCT FROM '{"cmd":"UPDATE","qual":"is_admin()","roles":["public"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Admins update reports","schemaname":"public","with_check":"is_admin()"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Admins update reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Staff view reports';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_staff()","roles":["authenticated"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Staff view reports","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Staff view reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Users can create reports';
 IF actual IS DISTINCT FROM '{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Users can create reports","schemaname":"public","with_check":"(auth.uid() = reporter_id)"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Users can create reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_reports' AND policyname='Users can view own reports';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"(auth.uid() = reporter_id)","roles":["public"],"tablename":"user_reports","permissive":"PERMISSIVE","policyname":"Users can view own reports","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_reports: Users can view own reports'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_strikes' AND policyname='Admins delete strikes';
 IF actual IS DISTINCT FROM '{"cmd":"DELETE","qual":"is_admin()","roles":["public"],"tablename":"user_strikes","permissive":"PERMISSIVE","policyname":"Admins delete strikes","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_strikes: Admins delete strikes'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_strikes' AND policyname='Admins insert strikes';
 IF actual IS DISTINCT FROM '{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"user_strikes","permissive":"PERMISSIVE","policyname":"Admins insert strikes","schemaname":"public","with_check":"is_admin()"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_strikes: Admins insert strikes'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_strikes' AND policyname='Admins read strikes';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_admin()","roles":["public"],"tablename":"user_strikes","permissive":"PERMISSIVE","policyname":"Admins read strikes","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_strikes: Admins read strikes'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_strikes' AND policyname='Admins update strikes';
 IF actual IS DISTINCT FROM '{"cmd":"UPDATE","qual":"is_admin()","roles":["public"],"tablename":"user_strikes","permissive":"PERMISSIVE","policyname":"Admins update strikes","schemaname":"public","with_check":"is_admin()"}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_strikes: Admins update strikes'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_strikes' AND policyname='Staff view strikes';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"is_staff()","roles":["authenticated"],"tablename":"user_strikes","permissive":"PERMISSIVE","policyname":"Staff view strikes","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_strikes: Staff view strikes'; END IF;
 SELECT to_jsonb(p) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename='user_strikes' AND policyname='Users can view own strikes';
 IF actual IS DISTINCT FROM '{"cmd":"SELECT","qual":"(auth.uid() = user_id)","roles":["public"],"tablename":"user_strikes","permissive":"PERMISSIVE","policyname":"Users can view own strikes","schemaname":"public","with_check":null}'::jsonb THEN RAISE EXCEPTION 'management_policy_drift: %','user_strikes: Users can view own strikes'; END IF;
 IF replace(pg_get_functiondef('public.is_admin()'::regprocedure),chr(13),'') IS DISTINCT FROM replace( $expected_is_admin$CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND is_discarded IS NOT TRUE
    );
END;
$function$
$expected_is_admin$,chr(13),'') THEN RAISE EXCEPTION 'management_function_drift: %','is_admin()'; END IF;
 IF replace(pg_get_functiondef('public.log_admin_action(uuid,text,text,text,jsonb)'::regprocedure),chr(13),'') IS DISTINCT FROM replace( $expected_log_admin_action$CREATE OR REPLACE FUNCTION public.log_admin_action(p_admin_id uuid, p_action text, p_target_type text, p_target_id text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor_email text;
BEGIN
    -- Only admins should be able to log admin actions. If the caller isn't
    -- the admin they claim to be, refuse silently.
    IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
        RETURN;
    END IF;
    IF NOT public.is_admin() THEN
        RETURN;
    END IF;

    SELECT email INTO v_actor_email FROM auth.users WHERE id = p_admin_id;

    INSERT INTO public.admin_actions (actor_id, actor_email, action, target_table, target_id, changes)
    VALUES (p_admin_id, v_actor_email, p_action, p_target_type, p_target_id, COALESCE(p_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
    -- Never let an audit-log failure cascade into the main operation.
    NULL;
END;
$function$
$expected_log_admin_action$,chr(13),'') THEN RAISE EXCEPTION 'management_function_drift: %','log_admin_action(uuid,text,text,text,jsonb)'; END IF;
 IF replace(pg_get_functiondef('public.is_staff()'::regprocedure),chr(13),'') IS DISTINCT FROM replace( $expected_is_staff$CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'analyst')
          AND is_discarded IS NOT TRUE
    );
END;
$function$
$expected_is_staff$,chr(13),'') THEN RAISE EXCEPTION 'management_function_drift: %','is_staff()'; END IF;
END $guard$;

ALTER POLICY "Admins read admin_actions" ON public.admin_actions USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Staff view admin actions" ON public.admin_actions USING ((SELECT public.is_staff()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Only admins insert discarded" ON public.discarded_records WITH CHECK ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Only admins see discarded" ON public.discarded_records USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Staff view discarded records" ON public.discarded_records USING ((SELECT public.is_staff()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins can manage suggestions" ON public.leisure_spot_suggestions USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2') WITH CHECK ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Staff view leisure suggestions" ON public.leisure_spot_suggestions USING ((SELECT public.is_staff()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins delete reports" ON public.user_reports USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins insert reports" ON public.user_reports WITH CHECK ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins read reports" ON public.user_reports USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins update reports" ON public.user_reports USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2') WITH CHECK ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Staff view reports" ON public.user_reports USING ((SELECT public.is_staff()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins delete strikes" ON public.user_strikes USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins insert strikes" ON public.user_strikes WITH CHECK ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins read strikes" ON public.user_strikes USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Admins update strikes" ON public.user_strikes USING ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2') WITH CHECK ((SELECT public.is_admin()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');
ALTER POLICY "Staff view strikes" ON public.user_strikes USING ((SELECT public.is_staff()) AND coalesce((SELECT auth.jwt()->>'aal'),'') = 'aal2');

CREATE OR REPLACE FUNCTION public.log_admin_action(p_admin_id uuid, p_action text, p_target_type text, p_target_id text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor_email text;
BEGIN
    -- Only admins should be able to log admin actions. If the caller isn't
    -- the admin they claim to be, refuse silently.
    IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
        RETURN;
    END IF;
    IF NOT public.is_admin() OR coalesce(auth.jwt()->>'aal','') <> 'aal2' THEN
        RETURN;
    END IF;

    SELECT email INTO v_actor_email FROM auth.users WHERE id = p_admin_id;

    INSERT INTO public.admin_actions (actor_id, actor_email, action, target_table, target_id, changes)
    VALUES (p_admin_id, v_actor_email, p_action, p_target_type, p_target_id, COALESCE(p_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
    -- Never let an audit-log failure cascade into the main operation.
    NULL;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid,text,text,text,jsonb) FROM PUBLIC, anon;
-- CREATE OR REPLACE preserves owner/OID/signature/defaults/config and explicit grants.
-- Audit/strike/notification triggers remain unchanged. Own-row policies remain unchanged.

NOTIFY pgrst, 'reload schema';
COMMIT;

