-- Reviewed against production definitions; local synthetic rehearsal 174/174 PASS.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE analytics_targets(signature text PRIMARY KEY, definition_md5 text NOT NULL) ON COMMIT DROP;
INSERT INTO analytics_targets VALUES
 ('public.admin_ambassador_leads(integer)', '15f768791685eac609f8545fd3ecc67b'),
 ('public.admin_content_inventory()', '8572861dba5c29e9137268c9dd168c47'),
 ('public.admin_engagement_metrics(integer)', '5508a386bc9a63234b106782dfd57aa8'),
 ('public.admin_event_creator_revenue(integer)', 'cea6b34f9a5ad880a8ad1c199a1d501e'),
 ('public.admin_growth_attribution(integer)', '14dc7b784501b8676d08b70548f046b8'),
 ('public.admin_kpis_summary(integer)', '644545aa58c13f2138ee9d4f5ee07893'),
 ('public.admin_monetization_summary(jsonb)', 'b13c1c35b615d651ff8510366ac506aa'),
 ('public.admin_security_summary(integer)', 'dce25c117f915db237315ebff3c43853'),
 ('public.admin_signups_daily(date,date,jsonb)', '60054bf78d515b6cd22325dc71451a05'),
 ('public.admin_top_careers(integer,jsonb)', 'bdcba849431985dec42ac678bc18b808'),
 ('public.admin_top_cities(integer,jsonb)', '870cab0a626fe04ae1f7045837a2dbf6'),
 ('public.admin_top_universities(integer,jsonb)', '178515c6f99ebd1c9db673303ce74b7d'),
 ('public.admin_users_demographics(jsonb)', 'd3e514ecf9e8947ecae4e629026ee8e0');

CREATE TEMP TABLE analytics_global_guards(signature text PRIMARY KEY, definition_md5 text NOT NULL) ON COMMIT DROP;
INSERT INTO analytics_global_guards VALUES
 ('public._admin_required()', 'e0d3fddedc2cac46c1f4473219030f89'),
 ('public.is_admin()', '204699a08fc504391a9bf0e2041e3933'),
 ('public.is_staff()', '10ef37e89482cdbe7705bdd80db07627');

DO $audit$
DECLARE
 r record; v_oid oid; v_old jsonb; v_new jsonb; v_definition text;
 needle constant text := 'PERFORM public._admin_required();';
 replacement text := needle || E'\n    IF coalesce(auth.jwt()->>''aal'','''') <> ''aal2'' THEN RAISE EXCEPTION ''mfa_required''; END IF;';
BEGIN
 IF (SELECT count(*) FROM analytics_targets) <> 13 THEN RAISE EXCEPTION 'invalid_target_count'; END IF;
 FOR r IN SELECT * FROM analytics_targets ORDER BY signature LOOP
  v_oid := to_regprocedure(r.signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'missing_function: %', r.signature; END IF;
  SELECT to_jsonb(p),pg_get_functiondef(p.oid) INTO v_old,v_definition FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_definition) IS DISTINCT FROM r.definition_md5 THEN RAISE EXCEPTION 'definition_drift: %',r.signature; END IF;
  IF (v_old->>'prosecdef')::boolean IS NOT TRUE
     OR (length(v_definition)-length(replace(v_definition,needle,'')))/length(needle) <> 1
  THEN RAISE EXCEPTION 'unexpected_guard: %',r.signature; END IF;

  EXECUTE replace(v_definition,needle,replacement);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',r.signature);

  SELECT to_jsonb(p) INTO v_new FROM pg_proc p WHERE p.oid=v_oid;
  IF (v_old - 'prosrc' - 'proacl') IS DISTINCT FROM (v_new - 'prosrc' - 'proacl')
     OR v_new->>'prosrc' IS DISTINCT FROM replace(v_old->>'prosrc',needle,replacement)
  THEN RAISE EXCEPTION 'unexpected_catalog_change: %',r.signature; END IF;
  IF has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
     OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
               WHERE p.oid=v_oid AND a.grantee=0 AND a.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'unexpected_execute_acl: %',r.signature; END IF;
 END LOOP;
END $audit$;

DO $policy_guard$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_policy
  WHERE polrelid='public.profiles'::regclass AND polname='Staff read all profiles'
    AND polcmd='r' AND polpermissive
    AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
    AND pg_get_expr(polqual,polrelid) IN ('is_staff()','public.is_staff()')
 ) THEN RAISE EXCEPTION 'staff_policy_drift'; END IF;
END $policy_guard$;

ALTER POLICY "Staff read all profiles" ON public.profiles
 USING ((SELECT public.is_staff()) AND coalesce((SELECT auth.jwt()->>'aal'),'')='aal2');

-- Restrictive SELECT also closes the two permissive is_admin() paths.
-- Self reads and the existing non-staff permissions retain their prior scope.
CREATE POLICY "Staff MFA for other profiles"
 ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT auth.uid())=id OR (SELECT public.is_staff()) IS NOT TRUE OR coalesce((SELECT auth.jwt()->>'aal'),'')='aal2');

DO $unchanged$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM analytics_global_guards LOOP
  IF md5(pg_get_functiondef(to_regprocedure(r.signature))) IS DISTINCT FROM r.definition_md5
  THEN RAISE EXCEPTION 'global_guard_changed: %',r.signature; END IF;
 END LOOP;
END $unchanged$;

NOTIFY pgrst, 'reload schema';
COMMIT;
