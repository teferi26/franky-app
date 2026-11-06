-- Alta de Franky Pro sobre organizaciones y facturación existentes.
-- No abre ventas ni modifica los contratos anteriores.
ALTER TABLE public.organization_billing_configuration
  ADD COLUMN pro_sales_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.organization_billing_accounts
  ADD COLUMN self_service boolean NOT NULL DEFAULT false;
ALTER TABLE public.organization_billing_quotes
  ADD COLUMN checkout_scope text NOT NULL DEFAULT 'organization'
    CHECK (checkout_scope IN ('organization', 'pro')),
  ADD COLUMN trial_days integer NOT NULL DEFAULT 0
    CHECK (trial_days IN (0, 7)),
  ADD CONSTRAINT pro_trial_scope CHECK (trial_days = 0 OR (checkout_scope = 'pro' AND NOT founder));
ALTER TABLE public.organization_entitlement_grants
  ADD COLUMN trial_attempt_id uuid UNIQUE REFERENCES public.organization_checkout_attempts(id),
  ADD CONSTRAINT pro_trial_grant CHECK (
    trial_attempt_id IS NULL OR (source = 'stripe' AND period_id IS NULL AND ends_at <= starts_at + interval '7 days')
  );
ALTER TABLE public.pro_profiles
  ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{7,25}$');
ALTER TABLE public.organization_plan_versions
  DROP CONSTRAINT organization_plan_versions_monthly_cents_check,
  DROP CONSTRAINT organization_plan_versions_check,
  ADD CHECK (monthly_cents BETWEEN 0 AND 1000000),
  ADD CHECK (founder_cents BETWEEN 0 AND annual_cents);
CREATE UNIQUE INDEX pro_onboarding_request_once
  ON public.organization_audit(actor_id, (details->>'request_key'))
  WHERE action = 'pro.onboarding';

-- Los espacios Pro tienen acceso propio; los demás mantienen el despliegue cerrado.
CREATE OR REPLACE FUNCTION public.workspace_require(p_organization_id uuid, p_permission text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.workspace_api_enabled() AND NOT EXISTS (
    SELECT 1 FROM public.organization_billing_accounts
    WHERE organization_id = p_organization_id AND self_service
  ) THEN
    RAISE EXCEPTION 'workspace_unavailable' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_organization_permission(p_organization_id, p_permission) THEN
    RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_my_workspaces()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name), '[]') FROM (
    SELECT o.id, o.kind, o.subtype, o.name, o.slug, o.city, o.verification_status,
      o.status, o.demo_cohort_id, m.role, public.workspace_role_permissions(m.role) permissions
    FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id = o.id
    WHERE m.user_id = auth.uid() AND public.has_organization_permission(o.id, 'resource.read')
      AND ((public.get_workspace_access()->>'enabled')::boolean OR EXISTS (
        SELECT 1 FROM public.organization_billing_accounts a WHERE a.organization_id = o.id AND a.self_service
      ))
  ) x
$$;

CREATE FUNCTION public.get_pro_checkout_configuration()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN
    RAISE EXCEPTION 'organization_billing_forbidden';
  END IF;
  RETURN (
    SELECT jsonb_build_object('environment', environment, 'sales_enabled', pro_sales_enabled,
      'provider_ready', provider_ready)
    FROM public.organization_billing_configuration WHERE singleton
  );
END $$;

-- El alta general y Pro comparten la misma creación y el mismo límite.
CREATE FUNCTION workspace_private.create_workspace_record(
  p_kind text, p_name text, p_subtype text, p_city text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid := gen_random_uuid(); actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN
    RAISE EXCEPTION 'workspace_creation_unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('housing','community','leisure') THEN
    RAISE EXCEPTION 'invalid_workspace_kind';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,42));
  IF (SELECT count(*) FROM public.organization_memberships
    WHERE user_id = actor AND role = 'owner' AND status = 'active') >= 10 THEN
    RAISE EXCEPTION 'workspace_limit';
  END IF;
  INSERT INTO public.organizations(id,kind,name,slug,subtype,city,created_by,billing_owner_id)
  VALUES(org,p_kind,btrim(p_name),p_kind || '-' || replace(org::text,'-',''),
    p_subtype,nullif(btrim(p_city),''),actor,actor);
  INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(org,actor,'owner');
  INSERT INTO public.organization_audit(organization_id,actor_id,action) VALUES(org,actor,'organization.created');
  RETURN org;
END $$;
REVOKE ALL ON FUNCTION workspace_private.create_workspace_record(text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_workspace(
  p_kind text, p_name text, p_subtype text DEFAULT NULL, p_city text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid;
BEGIN
  IF auth.uid() IS NULL OR (public.get_workspace_access()->>'can_create')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'workspace_creation_unavailable' USING ERRCODE = '42501';
  END IF;
  org := workspace_private.create_workspace_record(p_kind,p_name,p_subtype,p_city);
  RETURN (SELECT x FROM jsonb_array_elements(public.list_my_workspaces()) x WHERE x->>'id' = org::text);
END $$;

CREATE FUNCTION public.prepare_pro_onboarding(
  p_data jsonb, p_request_key uuid, p_interval text, p_base_cents integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  org uuid;
  sector text := p_data->>'sector';
  kind text;
  slug text;
  fingerprint text;
  previous public.organization_audit;
  cfg public.organization_billing_configuration;
  plan public.organization_plan_versions;
  mapping public.organization_provider_prices;
  account public.organization_billing_accounts;
  quote public.organization_billing_quotes;
  attempt public.organization_checkout_attempts;
  amount integer;
  trial integer;
BEGIN
  IF actor IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.workspace_demo_accounts WHERE user_id = actor)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor AND email_confirmed_at IS NOT NULL
      AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= clock_timestamp()))
  THEN RAISE EXCEPTION 'organization_billing_forbidden'; END IF;
  IF p_request_key IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR octet_length(p_data::text) > 4096
    OR p_data - ARRAY['sector','name','city','address','phone','attribution'] <> '{}'::jsonb
    OR length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 3 AND 100
    OR length(btrim(coalesce(p_data->>'city',''))) NOT BETWEEN 2 AND 100
    OR length(btrim(coalesce(p_data->>'address',''))) NOT BETWEEN 3 AND 300
    OR coalesce(p_data->>'phone','') !~ '^\+?[0-9 ()-]{7,25}$'
    OR p_interval IS NULL OR p_interval NOT IN ('month','year')
    OR sector IS NULL OR sector NOT IN (
      'hairdresser','beauty','cafe','bar','restaurant','pub','nightclub',
      'sports','academy','culture','sports_facility','coworking','agency','landlord','community'
    )
  THEN RAISE EXCEPTION 'pro_invalid_input'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 2809));
  fingerprint := encode(extensions.digest(jsonb_build_array(p_data, p_interval, p_base_cents)::text, 'sha256'), 'hex');
  SELECT * INTO previous FROM public.organization_audit
  WHERE actor_id = actor AND action = 'pro.onboarding' AND details->>'request_key' = p_request_key::text;
  IF FOUND THEN
    IF previous.details->>'fingerprint' <> fingerprint THEN RAISE EXCEPTION 'organization_billing_request_conflict'; END IF;
    IF NOT organization_billing_private.manager(previous.organization_id, actor) THEN
      RAISE EXCEPTION 'organization_billing_forbidden';
    END IF;
    RETURN jsonb_build_object('organization_id', previous.organization_id,
      'attempt_id', previous.details->>'attempt_id');
  END IF;
  SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;
  SELECT * INTO plan FROM public.organization_plan_versions
  WHERE plan_key = 'pro_' || sector AND version = 1 AND status = 'active';
  SELECT * INTO mapping FROM public.organization_provider_prices
  WHERE plan_key = plan.plan_key AND plan_version = plan.version
    AND environment = cfg.environment AND interval = p_interval AND verified;
  amount := CASE WHEN p_interval = 'year' THEN plan.annual_cents ELSE plan.monthly_cents END;
  IF NOT cfg.pro_sales_enabled OR NOT cfg.provider_ready OR cfg.portal_config_id IS NULL
    OR plan.plan_key IS NULL OR mapping.price_id IS NULL OR amount IS NULL
    OR amount <= 0 OR amount IS DISTINCT FROM p_base_cents
    OR plan.categories IS DISTINCT FROM ARRAY[sector]
  THEN RAISE EXCEPTION 'organization_sales_disabled'; END IF;
  kind := CASE WHEN sector IN ('agency','landlord') THEN 'housing'
    WHEN sector = 'community' THEN 'community' ELSE 'leisure' END;
  org := workspace_private.create_workspace_record(kind,p_data->>'name',sector,p_data->>'city');
  slug := left(trim(both '-' FROM regexp_replace(
    lower(extensions.unaccent(btrim(p_data->>'name'))), '[^a-z0-9]+', '-', 'g'
  )), 28);
  IF length(slug) < 3 THEN slug := 'negocio'; END IF;
  slug := slug || '-' || left(replace(org::text, '-', ''), 10);
  INSERT INTO public.organization_billing_accounts(organization_id,legal_name,entity_key,country,verified,self_service)
  VALUES(org,btrim(p_data->>'name'),'pro:' || org::text,'ES',false,true) RETURNING * INTO account;
  PERFORM public.pro_save_profile(org, jsonb_build_object(
    'vertical',sector,'public_slug',slug,'address',btrim(p_data->>'address'),'published',false
  ));
  UPDATE public.pro_profiles SET phone = btrim(p_data->>'phone') WHERE organization_id = org;
  IF kind = 'leisure' THEN
    PERFORM public.professional_save_record(org,'settings',NULL,jsonb_build_object(
      'category',sector,'timezone','Europe/Madrid'
    ));
  END IF;
  -- Una prueba por titular y entorno, también ante dos altas simultáneas.
  trial := CASE WHEN EXISTS (
    SELECT 1 FROM public.organization_checkout_attempts a
    JOIN public.organization_billing_quotes q ON q.id = a.quote_id
    WHERE a.actor_id = actor AND a.environment = cfg.environment AND q.trial_days > 0
      AND (a.status IN ('creating','open','pending','paid') OR EXISTS (
        SELECT 1 FROM public.organization_subscriptions s WHERE s.attempt_id = a.id
      ))
  ) THEN 0 ELSE 7 END;
  INSERT INTO public.organization_billing_quotes(
    organization_id,actor_id,account_id,account_revision,legal_name,country,environment,
    plan_key,plan_version,interval,founder,first_base_cents,renewal_base_cents,
    terms_version,terms,modules,limits,price_id,product_id,coupon_id,expires_at,checkout_scope,trial_days
  ) VALUES(
    org,actor,account.id,account.revision,account.legal_name,account.country,cfg.environment,
    plan.plan_key,plan.version,p_interval,false,amount,amount,plan.terms_version,plan.terms,
    plan.modules,plan.limits,mapping.price_id,mapping.product_id,NULL,
    clock_timestamp()+interval '10 minutes','pro',trial
  ) RETURNING * INTO quote;
  INSERT INTO public.organization_checkout_attempts(
    organization_id,actor_id,quote_id,account_id,request_key,fingerprint,environment
  ) VALUES(org,actor,quote.id,account.id,p_request_key,fingerprint,cfg.environment) RETURNING * INTO attempt;
  INSERT INTO public.organization_audit(organization_id,actor_id,action,details)
  VALUES(org,actor,'pro.onboarding',jsonb_build_object(
    'request_key',p_request_key,'fingerprint',fingerprint,'attempt_id',attempt.id,
    'attribution',coalesce(p_data->'attribution','[]'::jsonb)
  ));
  RETURN jsonb_build_object('organization_id',org,'attempt_id',attempt.id);
END $$;

-- El contexto anterior conserva sus validaciones; solo el contrato nuevo lee
-- la bandera de Pro y los días de prueba guardados en su propuesta inmutable.
ALTER FUNCTION public.service_get_organization_checkout(uuid,uuid)
  SET SCHEMA organization_billing_private;
CREATE FUNCTION public.service_get_organization_checkout(p_attempt_id uuid,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; q public.organization_billing_quotes; a public.organization_billing_accounts; cfg public.organization_billing_configuration;
BEGIN
  SELECT b.* INTO q FROM public.organization_billing_quotes b
    JOIN public.organization_checkout_attempts c ON c.quote_id = b.id WHERE c.id = p_attempt_id;
  IF q.checkout_scope = 'pro' THEN
    PERFORM organization_billing_private.service();
    SELECT * INTO a FROM public.organization_billing_accounts WHERE id = q.account_id;
    SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;
    IF NOT a.self_service OR (p_actor_id IS NOT NULL AND (
      NOT organization_billing_private.manager(q.organization_id,p_actor_id)
      OR a.administratively_suspended OR a.revision <> q.account_revision
    )) THEN RAISE EXCEPTION 'organization_billing_forbidden'; END IF;
    result := organization_billing_private.service_get_organization_checkout(p_attempt_id,NULL);
    result := result || jsonb_build_object('checkout_scope','pro','trial_days',q.trial_days,
      'sales_enabled',cfg.pro_sales_enabled AND cfg.environment = q.environment
        AND NOT a.administratively_suspended AND a.revision = q.account_revision,
      'provider_ready',cfg.provider_ready AND cfg.environment = q.environment
        AND NOT a.administratively_suspended AND a.revision = q.account_revision);
  ELSE
    result := organization_billing_private.service_get_organization_checkout(p_attempt_id,p_actor_id);
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION organization_billing_private.grant_for(p_org uuid)
RETURNS public.organization_entitlement_grants LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g FROM public.organization_entitlement_grants g
  JOIN public.organizations o ON o.id = g.organization_id
  LEFT JOIN public.organization_billing_accounts b ON b.organization_id = o.id
  WHERE o.id = p_org AND o.status = 'active' AND o.demo_cohort_id IS NULL
    AND NOT coalesce(b.administratively_suspended,false)
    AND NOT g.revoked AND g.starts_at <= clock_timestamp() AND g.ends_at > clock_timestamp()
    AND (g.source = 'pilot' OR (g.environment = (
      SELECT environment FROM public.organization_billing_configuration WHERE singleton
    ) AND (
      EXISTS (
        SELECT 1 FROM public.organization_subscription_periods r
        JOIN public.organization_subscriptions s ON s.id = r.subscription_id
        JOIN public.organization_checkout_attempts a ON a.id = s.attempt_id
        JOIN public.organization_billing_quotes q ON q.id = a.quote_id
        JOIN public.organization_plan_versions p ON p.plan_key = q.plan_key AND p.version = q.plan_version
        WHERE r.id = g.period_id AND (
          EXISTS(SELECT 1 FROM public.professional_settings ps WHERE ps.organization_id = p_org AND ps.category = ANY(p.categories))
          OR (q.checkout_scope = 'pro' AND EXISTS(
            SELECT 1 FROM public.pro_profiles pr WHERE pr.organization_id = p_org AND pr.vertical = ANY(p.categories)
          ))
        )
      ) OR EXISTS (
        SELECT 1 FROM public.organization_checkout_attempts a
        JOIN public.organization_billing_quotes q ON q.id = a.quote_id
        JOIN public.organization_subscriptions s ON s.attempt_id = a.id
        JOIN public.pro_profiles pr ON pr.organization_id = a.organization_id
        JOIN public.organization_plan_versions p ON p.plan_key = q.plan_key AND p.version = q.plan_version
        WHERE a.id = g.trial_attempt_id AND a.organization_id = p_org
          AND q.checkout_scope = 'pro' AND q.trial_days = 7 AND b.self_service
          AND s.status = 'trialing' AND pr.vertical = ANY(p.categories)
      )
    )))
  ORDER BY g.ends_at DESC,g.id LIMIT 1
$$;

CREATE FUNCTION public.service_reconcile_pro_trial(p_payload jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.organization_checkout_attempts; q public.organization_billing_quotes; s public.organization_subscriptions;
  stamp bigint; start_at timestamptz; end_at timestamptz; prior public.organization_entitlement_grants;
BEGIN
  PERFORM organization_billing_private.service();
  SELECT * INTO a FROM public.organization_checkout_attempts WHERE id = (p_payload->>'attempt_id')::uuid;
  IF a.id IS NULL THEN RAISE EXCEPTION 'organization_billing_not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));
  SELECT * INTO q FROM public.organization_billing_quotes WHERE id = a.quote_id;
  SELECT * INTO s FROM public.organization_subscriptions WHERE attempt_id = a.id;
  stamp := (p_payload->>'provider_snapshot_ms')::bigint;
  IF q.checkout_scope <> 'pro' OR s.id IS NULL OR s.subscription_id IS DISTINCT FROM p_payload->>'subscription_id'
    OR s.customer_id IS DISTINCT FROM p_payload->>'customer_id' OR s.environment IS DISTINCT FROM p_payload->>'environment'
    OR stamp IS NULL OR stamp > extract(epoch FROM clock_timestamp())*1000+60000
    OR stamp < extract(epoch FROM clock_timestamp())*1000-300000
  THEN RAISE EXCEPTION 'organization_billing_provider_mismatch'; END IF;
  IF s.snapshot_ms > stamp THEN RETURN; END IF;
  SELECT * INTO prior FROM public.organization_entitlement_grants WHERE trial_attempt_id = a.id;
  IF s.status = 'trialing' THEN
    start_at := (p_payload->>'trial_start')::timestamptz;
    end_at := (p_payload->>'trial_end')::timestamptz;
    IF q.trial_days <> 7 OR start_at IS NULL OR end_at IS NULL
      OR end_at <> start_at + interval '7 days'
      OR start_at < a.created_at - interval '1 minute'
      OR start_at > a.created_at + interval '24 hours'
      OR (prior.id IS NOT NULL AND (prior.starts_at <> start_at OR prior.ends_at <> end_at))
    THEN RAISE EXCEPTION 'pro_trial_invalid'; END IF;
    INSERT INTO public.organization_entitlement_grants(
      organization_id,source,trial_attempt_id,environment,starts_at,ends_at,modules,limits,reason
    ) VALUES(a.organization_id,'stripe',a.id,a.environment,start_at,end_at,q.modules,q.limits,'verified_trial')
    ON CONFLICT(trial_attempt_id) DO NOTHING;
    UPDATE public.pro_profiles SET published = true WHERE organization_id = a.organization_id;
  ELSE
    UPDATE public.organization_entitlement_grants SET revoked = true WHERE trial_attempt_id = a.id;
    IF s.status = 'active' AND (organization_billing_private.grant_for(a.organization_id)).id IS NOT NULL THEN
      UPDATE public.pro_profiles SET published = true WHERE organization_id = a.organization_id;
    END IF;
  END IF;
END $$;

CREATE FUNCTION public.get_pro_onboarding_status(p_organization_id uuid,p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.organization_checkout_attempts; slug text; g public.organization_entitlement_grants;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_session_usable()
    OR NOT organization_billing_private.manager(p_organization_id,auth.uid()) THEN
    RAISE EXCEPTION 'organization_billing_forbidden';
  END IF;
  SELECT c.* INTO a FROM public.organization_checkout_attempts c
    JOIN public.organization_billing_quotes q ON q.id = c.quote_id
    WHERE c.id = p_attempt_id AND c.organization_id = p_organization_id AND q.checkout_scope = 'pro';
  IF a.id IS NULL THEN RAISE EXCEPTION 'organization_billing_forbidden'; END IF;
  SELECT public_slug INTO slug FROM public.pro_profiles WHERE organization_id = p_organization_id;
  g := organization_billing_private.grant_for(p_organization_id);
  RETURN jsonb_build_object('organization_id',p_organization_id,'attempt_id',a.id,
    'public_slug',slug,'active',g.id IS NOT NULL,'status',a.status);
END $$;

CREATE FUNCTION public.service_pro_portal_context(p_organization_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.organization_billing_accounts; cfg public.organization_billing_configuration;
BEGIN
  PERFORM organization_billing_private.service();
  IF NOT organization_billing_private.manager(p_organization_id,p_actor_id) THEN
    RAISE EXCEPTION 'organization_billing_forbidden';
  END IF;
  SELECT * INTO a FROM public.organization_billing_accounts WHERE organization_id = p_organization_id AND self_service;
  SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;
  IF a.id IS NULL THEN RAISE EXCEPTION 'organization_billing_forbidden'; END IF;
  RETURN jsonb_build_object('organization_id',p_organization_id,'account_id',a.id,'environment',cfg.environment,
    'customer_id',CASE WHEN cfg.environment = 'live' THEN a.live_customer_id ELSE a.test_customer_id END,
    'portal_config_id',cfg.portal_config_id);
END $$;

CREATE FUNCTION public.service_configure_pro_billing(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE item jsonb; sector text; old public.organization_plan_versions; env text := p_data->>'environment';
BEGIN
  PERFORM organization_billing_private.service();
  IF env IS NULL OR env NOT IN ('test','live') OR jsonb_typeof(p_data->'plans') IS DISTINCT FROM 'array'
    OR length(coalesce(p_data->>'reason','')) < 8 THEN RAISE EXCEPTION 'pro_invalid_input'; END IF;
  FOR item IN SELECT jsonb_array_elements(p_data->'plans') LOOP
    sector := item->>'sector';
    IF sector IS NULL OR sector NOT IN ('hairdresser','beauty','cafe','bar','restaurant','pub','nightclub',
      'sports','academy','culture','sports_facility','coworking','agency','landlord','community','university') THEN
      RAISE EXCEPTION 'pro_invalid_input';
    END IF;
    SELECT * INTO old FROM public.organization_plan_versions WHERE plan_key = 'pro_' || sector AND version = 1;
    IF old.plan_key IS NOT NULL AND (old.monthly_cents IS DISTINCT FROM (item->>'monthly_cents')::integer
      OR old.annual_cents IS DISTINCT FROM (item->>'annual_cents')::integer
      OR old.founder_cents IS DISTINCT FROM (item->>'founder_cents')::integer) THEN
      RAISE EXCEPTION 'organization_billing_immutable';
    END IF;
    INSERT INTO public.organization_plan_versions(plan_key,version,title,categories,monthly_cents,annual_cents,
      founder_cents,terms_version,terms,status)
    VALUES('pro_' || sector,1,'Franky Pro: ' || sector,ARRAY[sector],
      (item->>'monthly_cents')::integer,(item->>'annual_cents')::integer,(item->>'founder_cents')::integer,
      'pro-2026-09-28','Suscripción Franky Pro según el plan elegido. Condiciones en https://franky.es/condiciones.', 'active')
    ON CONFLICT(plan_key,version) DO NOTHING;
    IF item->>'month_price_id' IS NOT NULL THEN
      PERFORM public.service_organization_billing_admin('mapping',jsonb_build_object(
        'plan_key','pro_' || sector,'plan_version',1,'environment',env,'interval','month',
        'price_id',item->>'month_price_id','product_id',item->>'product_id','verified',true,'reason',p_data->>'reason'
      ));
    END IF;
    PERFORM public.service_organization_billing_admin('mapping',jsonb_build_object(
      'plan_key','pro_' || sector,'plan_version',1,'environment',env,'interval','year',
      'price_id',item->>'year_price_id','product_id',item->>'product_id','verified',true,'reason',p_data->>'reason'
    ));
  END LOOP;
  IF coalesce((p_data->>'sales_enabled')::boolean,false) AND (
    NOT coalesce((p_data->>'provider_ready')::boolean,false) OR p_data->>'portal_config_id' IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.organization_provider_prices WHERE environment = env AND verified AND plan_key LIKE 'pro_%')
  ) THEN RAISE EXCEPTION 'organization_billing_configuration_incomplete'; END IF;
  -- El entorno y el portal también sirven a los contratos anteriores. Cambiar
  -- de entorno con contratos vivos exige una revisión independiente.
  IF EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE environment <> env
    AND status NOT IN ('canceled','incomplete_expired')) THEN RAISE EXCEPTION 'pro_environment_in_use'; END IF;
  UPDATE public.organization_billing_configuration SET environment = env,
    pro_sales_enabled = coalesce((p_data->>'sales_enabled')::boolean,false),
    provider_ready = coalesce((p_data->>'provider_ready')::boolean,false),
    portal_config_id = p_data->>'portal_config_id', updated_at = clock_timestamp()
  WHERE singleton;
  INSERT INTO public.organization_billing_audit(action,details)
  VALUES('pro.configuration',p_data - 'plans');
  RETURN jsonb_build_object('configured',true,'environment',env);
END $$;

REVOKE ALL ON FUNCTION public.get_pro_checkout_configuration() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_pro_onboarding(jsonb,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_pro_onboarding_status(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pro_checkout_configuration(), public.prepare_pro_onboarding(jsonb,uuid,text,integer),
  public.get_pro_onboarding_status(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION organization_billing_private.service_get_organization_checkout(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.service_get_organization_checkout(uuid,uuid), public.service_reconcile_pro_trial(jsonb),
  public.service_pro_portal_context(uuid,uuid), public.service_configure_pro_billing(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.service_get_organization_checkout(uuid,uuid), public.service_reconcile_pro_trial(jsonb),
  public.service_pro_portal_context(uuid,uuid), public.service_configure_pro_billing(jsonb) TO service_role;
