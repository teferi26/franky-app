-- Organization SaaS is a separate contract. No legacy subscription or payment is migrated.
-- All money mutations require service_role; user consent uses the live user session/AAL2.
CREATE SCHEMA organization_billing_private;
REVOKE ALL ON SCHEMA organization_billing_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.organization_billing_configuration(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),environment text NOT NULL DEFAULT 'test' CHECK(environment IN('test','live')),
 sales_enabled boolean NOT NULL DEFAULT false,provider_ready boolean NOT NULL DEFAULT false,native_access_reviewed boolean NOT NULL DEFAULT false,portal_config_id text,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),reconcile_cursor uuid,CHECK(NOT sales_enabled OR provider_ready)
);
INSERT INTO public.organization_billing_configuration(singleton) VALUES(true);
CREATE TABLE public.organization_plan_versions(
 plan_key text NOT NULL CHECK(plan_key~'^[a-z][a-z0-9_]{2,60}$'),version integer NOT NULL CHECK(version>0),title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
 categories text[] NOT NULL CHECK(cardinality(categories) BETWEEN 1 AND 12),monthly_cents integer NOT NULL CHECK(monthly_cents BETWEEN 100 AND 1000000),
 annual_cents integer NOT NULL CHECK(annual_cents BETWEEN 100 AND 12000000),founder_cents integer NOT NULL CHECK(founder_cents BETWEEN 100 AND annual_cents),
 currency text NOT NULL DEFAULT 'eur' CHECK(currency='eur'),tax_behavior text NOT NULL DEFAULT 'exclusive' CHECK(tax_behavior='exclusive'),
 terms_version text NOT NULL CHECK(length(terms_version) BETWEEN 3 AND 100),terms text NOT NULL CHECK(length(terms) BETWEEN 30 AND 12000),
 modules text[] NOT NULL DEFAULT ARRAY['professional'],limits jsonb NOT NULL DEFAULT '{"staff_limit":3,"resource_limit":20,"service_limit":50}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','retired')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(plan_key,version)
);
CREATE TABLE public.organization_provider_prices(
 plan_key text NOT NULL,plan_version integer NOT NULL,environment text NOT NULL CHECK(environment IN('test','live')),interval text NOT NULL CHECK(interval IN('month','year')),
 price_id text NOT NULL CHECK(price_id~'^price_[A-Za-z0-9_]+$'),product_id text NOT NULL CHECK(product_id~'^prod_[A-Za-z0-9_]+$'),coupon_id text,
 verified boolean NOT NULL DEFAULT false,PRIMARY KEY(plan_key,plan_version,environment,interval),UNIQUE(environment,price_id),
 FOREIGN KEY(plan_key,plan_version) REFERENCES public.organization_plan_versions(plan_key,version)
);
CREATE TABLE public.organization_billing_accounts(
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 legal_name text NOT NULL CHECK(length(legal_name) BETWEEN 2 AND 200),entity_key text NOT NULL UNIQUE CHECK(length(entity_key) BETWEEN 8 AND 160),country text NOT NULL CHECK(country~'^[A-Z]{2}$'),
 verified boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,administratively_suspended boolean NOT NULL DEFAULT false,
 test_customer_id text UNIQUE,live_customer_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.organization_founder_approvals(
 organization_id uuid PRIMARY KEY REFERENCES public.organization_billing_accounts(organization_id),entity_key text NOT NULL UNIQUE,
 approved_until timestamptz NOT NULL,approval_reference text NOT NULL CHECK(length(approval_reference) BETWEEN 8 AND 500),
 reserved_attempt_id uuid,consumed_attempt_id uuid,approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.organization_billing_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),actor_id uuid NOT NULL,
 account_id uuid NOT NULL REFERENCES public.organization_billing_accounts(id),account_revision integer NOT NULL,legal_name text NOT NULL,country text NOT NULL,environment text NOT NULL CHECK(environment IN('test','live')),
 plan_key text NOT NULL,plan_version integer NOT NULL,interval text NOT NULL CHECK(interval IN('month','year')),founder boolean NOT NULL,
 first_base_cents integer NOT NULL,renewal_base_cents integer NOT NULL,terms_version text NOT NULL,terms text NOT NULL,modules text[] NOT NULL,limits jsonb NOT NULL,
 price_id text NOT NULL,product_id text NOT NULL,coupon_id text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 FOREIGN KEY(plan_key,plan_version) REFERENCES public.organization_plan_versions(plan_key,version)
);
CREATE TABLE public.organization_checkout_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,actor_id uuid NOT NULL,
 quote_id uuid NOT NULL REFERENCES public.organization_billing_quotes(id),account_id uuid NOT NULL REFERENCES public.organization_billing_accounts(id),
 request_key uuid NOT NULL,fingerprint text NOT NULL,environment text NOT NULL CHECK(environment IN('test','live')),
 status text NOT NULL DEFAULT 'creating' CHECK(status IN('creating','open','pending','paid','cancelled','failed')),
 session_id text UNIQUE,checkout_url text,customer_id text,invoice_cursor text CHECK(invoice_cursor~'^in_[A-Za-z0-9_]+$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,actor_id,request_key)
);
CREATE UNIQUE INDEX organization_checkout_one_open ON public.organization_checkout_attempts(organization_id,environment) WHERE status IN('creating','open','pending');
CREATE TABLE public.organization_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id uuid NOT NULL UNIQUE REFERENCES public.organization_checkout_attempts(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 account_id uuid NOT NULL REFERENCES public.organization_billing_accounts(id),environment text NOT NULL CHECK(environment IN('test','live')),subscription_id text NOT NULL,customer_id text NOT NULL,
 status text NOT NULL CHECK(status IN('incomplete','incomplete_expired','trialing','active','past_due','unpaid','paused','canceled')),cancel_at_period_end boolean NOT NULL DEFAULT false,
 current_period_end timestamptz,snapshot_ms bigint NOT NULL DEFAULT 0,UNIQUE(environment,subscription_id)
);
CREATE TABLE public.organization_subscription_periods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES public.organization_subscriptions(id),environment text NOT NULL,invoice_id text NOT NULL,
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,subtotal_cents integer NOT NULL,discount_cents integer NOT NULL,tax_cents integer NOT NULL,total_cents integer NOT NULL,
 paid boolean NOT NULL,paid_cents integer NOT NULL,refunded_cents integer NOT NULL DEFAULT 0,dispute_status text NOT NULL CHECK(dispute_status IN('none','open','won','lost')),
 snapshot_ms bigint NOT NULL,UNIQUE(environment,invoice_id),CHECK(period_end>period_start),CHECK(total_cents>=0 AND paid_cents BETWEEN 0 AND total_cents AND refunded_cents BETWEEN 0 AND paid_cents)
);
CREATE TABLE public.organization_entitlement_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),source text NOT NULL CHECK(source IN('stripe','pilot')),
 period_id uuid UNIQUE REFERENCES public.organization_subscription_periods(id),environment text CHECK(environment IN('test','live')),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 modules text[] NOT NULL,limits jsonb NOT NULL,revoked boolean NOT NULL DEFAULT false,reason text NOT NULL,CHECK(ends_at>starts_at)
);
CREATE TABLE public.organization_billing_events(
 environment text NOT NULL,event_id text NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),fingerprint text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(environment,event_id)
);
CREATE TABLE public.organization_billing_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid REFERENCES public.organizations(id),actor_id uuid,action text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['organization_billing_configuration','organization_plan_versions','organization_provider_prices','organization_billing_accounts','organization_founder_approvals','organization_billing_quotes','organization_checkout_attempts','organization_subscriptions','organization_subscription_periods','organization_entitlement_grants','organization_billing_events','organization_billing_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
CREATE FUNCTION public.get_organization_billing_access(p_organization_id uuid,p_manage boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.organization_billing_configuration;a public.organization_billing_accounts;manage boolean;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));manage:=organization_billing_private.manager(p_organization_id,auth.uid());
 IF p_manage THEN PERFORM organization_billing_private.require_manager(p_organization_id);ELSIF NOT manage AND NOT public.has_organization_permission(p_organization_id,'finance.read') THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;
 SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;SELECT * INTO a FROM public.organization_billing_accounts WHERE organization_id=p_organization_id;
 IF a.id IS NULL THEN RAISE EXCEPTION 'organization_billing_account_required';END IF;
 RETURN jsonb_build_object('organization_id',p_organization_id,'account_id',a.id,'environment',cfg.environment,'customer_id',CASE WHEN cfg.environment='live' THEN a.live_customer_id ELSE a.test_customer_id END,'portal_config_id',cfg.portal_config_id,'can_manage_billing',manage);
END $$;
CREATE FUNCTION public.service_get_organization_checkout(p_attempt_id uuid,p_actor_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.organization_checkout_attempts;q public.organization_billing_quotes;b public.organization_billing_accounts;cfg public.organization_billing_configuration;BEGIN
 PERFORM organization_billing_private.service();SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'organization_billing_not_found';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=p_attempt_id;
 IF p_actor_id IS NOT NULL AND NOT organization_billing_private.manager(a.organization_id,p_actor_id) THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;
 SELECT * INTO q FROM public.organization_billing_quotes WHERE id=a.quote_id;SELECT * INTO b FROM public.organization_billing_accounts WHERE id=a.account_id;SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;
 IF p_actor_id IS NOT NULL AND (b.administratively_suspended OR NOT b.verified OR b.revision<>q.account_revision) THEN RAISE EXCEPTION 'organization_billing_unavailable';END IF;
 RETURN organization_billing_private.attempt_json(a.id)||jsonb_build_object('actor_id',a.actor_id,'account_id',a.account_id,'contract_id',a.id,'created_at',a.created_at,'session_id',a.session_id,'invoice_cursor',a.invoice_cursor,'customer_id',coalesce(a.customer_id,CASE WHEN a.environment='live' THEN b.live_customer_id ELSE b.test_customer_id END),
 'subscription_id',(SELECT subscription_id FROM public.organization_subscriptions WHERE attempt_id=a.id),'plan_key',q.plan_key,'plan_version',q.plan_version,'interval',q.interval,'terms_version',q.terms_version,'terms',q.terms,'founder',q.founder,'price_id',q.price_id,'product_id',q.product_id,'coupon_id',q.coupon_id,'portal_config_id',cfg.portal_config_id,'tax_behavior','exclusive','sales_enabled',cfg.sales_enabled AND cfg.environment=a.environment AND b.verified AND NOT b.administratively_suspended AND b.revision=q.account_revision,'provider_ready',cfg.provider_ready AND cfg.environment=a.environment AND b.verified AND NOT b.administratively_suspended AND b.revision=q.account_revision,'account',jsonb_build_object('legal_name',q.legal_name,'country',q.country),'limits',q.limits,'modules',q.modules);
END $$;
CREATE FUNCTION public.service_bind_organization_customer(p_account_id uuid,p_environment text,p_customer_id text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.organization_billing_accounts;existing text;BEGIN
 PERFORM organization_billing_private.service();SELECT * INTO a FROM public.organization_billing_accounts WHERE id=p_account_id;
 IF a.id IS NULL OR p_environment NOT IN('test','live') OR p_customer_id IS NULL OR p_customer_id!~'^cus_[A-Za-z0-9_]+$' THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));SELECT * INTO a FROM public.organization_billing_accounts WHERE id=p_account_id FOR UPDATE;
 existing:=CASE WHEN p_environment='live' THEN a.live_customer_id ELSE a.test_customer_id END;
 IF existing IS NOT NULL AND existing<>p_customer_id THEN RAISE EXCEPTION 'organization_billing_customer_conflict';END IF;
 UPDATE public.organization_billing_accounts SET live_customer_id=CASE WHEN p_environment='live' THEN p_customer_id ELSE live_customer_id END,test_customer_id=CASE WHEN p_environment='test' THEN p_customer_id ELSE test_customer_id END WHERE id=a.id;
 RETURN jsonb_build_object('account_id',a.id,'customer_id',p_customer_id,'environment',p_environment);
END $$;
CREATE FUNCTION public.service_attach_organization_checkout(p_attempt_id uuid,p_session_id text,p_checkout_url text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.organization_checkout_attempts;b public.organization_billing_accounts;customer text;BEGIN
 PERFORM organization_billing_private.service();SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=p_attempt_id;
 IF NOT FOUND OR p_session_id IS NULL OR p_session_id!~'^cs_[A-Za-z0-9_]+$' OR (p_checkout_url IS NOT NULL AND (p_checkout_url!~'^https://checkout[.]stripe[.]com/' OR length(p_checkout_url)>4000)) THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;SELECT * INTO b FROM public.organization_billing_accounts WHERE id=a.account_id;
 customer:=CASE WHEN a.environment='live' THEN b.live_customer_id ELSE b.test_customer_id END;
 IF customer IS NULL OR (a.session_id IS NOT NULL AND a.session_id<>p_session_id) THEN RAISE EXCEPTION 'organization_billing_provider_mismatch';END IF;
 UPDATE public.organization_checkout_attempts SET session_id=p_session_id,customer_id=customer,checkout_url=CASE WHEN status IN('creating','open','pending') THEN p_checkout_url ELSE checkout_url END,status=CASE WHEN status IN('creating','open','pending') THEN CASE WHEN p_checkout_url IS NULL THEN 'pending' ELSE 'open' END ELSE status END WHERE id=a.id;
 RETURN organization_billing_private.attempt_json(a.id);
END $$;
CREATE FUNCTION organization_billing_private.service() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organization_billing_forbidden' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION organization_billing_private.manager(p_org uuid,p_actor uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id JOIN public.profiles p ON p.id=m.user_id JOIN auth.users u ON u.id=p.id
 WHERE o.id=p_org AND o.status='active' AND o.demo_cohort_id IS NULL AND m.user_id=p_actor AND m.status='active' AND m.role IN('owner','admin') AND p.is_discarded IS NOT TRUE AND p.self_deleted IS NOT TRUE AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=p_actor) AND NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=p_actor) AND NOT EXISTS(SELECT 1 FROM social_private.account_suspensions WHERE user_id=p_actor AND restored_at IS NULL))
$$;
CREATE FUNCTION organization_billing_private.require_manager(p_org uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR NOT organization_billing_private.manager(p_org,auth.uid()) THEN RAISE EXCEPTION 'organization_billing_forbidden' USING ERRCODE='42501';END IF;
 IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'organization_billing_mfa_required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION organization_billing_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$BEGIN RAISE EXCEPTION 'organization_billing_immutable';END $$;
CREATE TRIGGER organization_billing_quotes_immutable BEFORE UPDATE OR DELETE ON public.organization_billing_quotes FOR EACH ROW EXECUTE FUNCTION organization_billing_private.immutable();
CREATE TRIGGER organization_billing_events_immutable BEFORE UPDATE OR DELETE ON public.organization_billing_events FOR EACH ROW EXECUTE FUNCTION organization_billing_private.immutable();
CREATE TRIGGER organization_billing_audit_immutable BEFORE UPDATE OR DELETE ON public.organization_billing_audit FOR EACH ROW EXECUTE FUNCTION organization_billing_private.immutable();
CREATE FUNCTION organization_billing_private.grant_for(p_org uuid) RETURNS public.organization_entitlement_grants LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT g FROM public.organization_entitlement_grants g JOIN public.organizations o ON o.id=g.organization_id LEFT JOIN public.organization_billing_accounts a ON a.organization_id=o.id
 WHERE o.id=p_org AND o.status='active' AND o.demo_cohort_id IS NULL AND NOT coalesce(a.administratively_suspended,false) AND NOT g.revoked AND g.starts_at<=clock_timestamp() AND g.ends_at>clock_timestamp()
 AND (g.source='pilot' OR (g.environment=(SELECT environment FROM public.organization_billing_configuration WHERE singleton) AND EXISTS(SELECT 1 FROM public.organization_subscription_periods r JOIN public.organization_subscriptions s ON s.id=r.subscription_id JOIN public.organization_checkout_attempts a ON a.id=s.attempt_id JOIN public.organization_billing_quotes q ON q.id=a.quote_id JOIN public.organization_plan_versions pv ON pv.plan_key=q.plan_key AND pv.version=q.plan_version JOIN public.professional_settings ps ON ps.organization_id=g.organization_id WHERE r.id=g.period_id AND ps.category=ANY(pv.categories)))) ORDER BY g.ends_at DESC,g.id LIMIT 1
$$;
CREATE FUNCTION organization_billing_private.attempt_json(p_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('attempt_id',a.id,'organization_id',a.organization_id,'status',a.status,'checkout_url',a.checkout_url,'first_base_cents',q.first_base_cents,'renewal_base_cents',q.renewal_base_cents,'currency','eur','environment',a.environment) FROM public.organization_checkout_attempts a JOIN public.organization_billing_quotes q ON q.id=a.quote_id WHERE a.id=p_id
$$;
CREATE FUNCTION public.get_organization_billing(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.organization_billing_configuration;acct public.organization_billing_accounts;grantrow public.organization_entitlement_grants;sub jsonb;catalog jsonb;manage boolean;financial boolean;approved boolean;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR NOT public.has_organization_permission(p_organization_id,'resource.read') THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;
 SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;SELECT * INTO acct FROM public.organization_billing_accounts WHERE organization_id=p_organization_id;
 manage:=organization_billing_private.manager(p_organization_id,auth.uid());financial:=public.current_demo_cohort() IS NULL AND (manage OR public.has_organization_permission(p_organization_id,'finance.read'));grantrow:=organization_billing_private.grant_for(p_organization_id);
 approved:=EXISTS(SELECT 1 FROM public.organization_founder_approvals f WHERE f.organization_id=p_organization_id AND f.entity_key=acct.entity_key AND f.approved_until>clock_timestamp() AND f.consumed_attempt_id IS NULL AND f.reserved_attempt_id IS NULL);
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.plan_key,p.version),'[]') INTO catalog FROM public.organization_plan_versions p WHERE p.status IN('draft','active') AND EXISTS(SELECT 1 FROM public.professional_settings s WHERE s.organization_id=p_organization_id AND s.category=ANY(p.categories));
 IF financial THEN SELECT jsonb_build_object('id',s.id,'status',s.status,'interval',q.interval,'plan_key',q.plan_key,'plan_version',q.plan_version,'current_period_end',(SELECT max(period_end) FROM public.organization_subscription_periods WHERE subscription_id=s.id AND paid AND paid_cents>refunded_cents AND dispute_status IN('none','won') AND period_start<=clock_timestamp()),'cancel_at_period_end',s.cancel_at_period_end) INTO sub FROM public.organization_subscriptions s JOIN public.organization_checkout_attempts a ON a.id=s.attempt_id JOIN public.organization_billing_quotes q ON q.id=a.quote_id WHERE s.organization_id=p_organization_id AND s.environment=cfg.environment ORDER BY a.created_at DESC LIMIT 1;END IF;
 RETURN jsonb_build_object('organization_id',p_organization_id,'environment',cfg.environment,'sales_enabled',cfg.sales_enabled AND public.current_demo_cohort() IS NULL,'provider_ready',cfg.provider_ready AND public.current_demo_cohort() IS NULL,'can_manage_billing',manage,'can_read_finance',financial,
 'account',CASE WHEN financial AND acct.id IS NOT NULL THEN jsonb_build_object('id',acct.id,'legal_name',acct.legal_name,'country',acct.country,'verified',acct.verified) END,
 'founder',jsonb_build_object('approved',manage AND approved,'reason',CASE WHEN approved THEN 'Aprobación expresa disponible' ELSE 'No hay una aprobación fundador disponible' END),'catalog',catalog,'subscription',sub,
 'access',jsonb_build_object('source',CASE WHEN grantrow.id IS NOT NULL THEN grantrow.source WHEN EXISTS(SELECT 1 FROM public.professional_settings WHERE organization_id=p_organization_id AND enabled) THEN 'pilot' ELSE 'free' END,'active',organization_billing_private.professional_enabled(p_organization_id),'paused',coalesce(acct.administratively_suspended,false) OR EXISTS(SELECT 1 FROM public.professional_settings WHERE organization_id=p_organization_id AND operational_paused),'until',grantrow.ends_at,'existing_obligations_access',true),
 'pending_attempt_id',CASE WHEN financial THEN (SELECT id FROM public.organization_checkout_attempts WHERE organization_id=p_organization_id AND environment=cfg.environment AND status IN('creating','open','pending') ORDER BY created_at DESC LIMIT 1) END,
 'reason',CASE WHEN public.current_demo_cohort() IS NOT NULL THEN 'Las demostraciones no pueden contratar' WHEN NOT cfg.sales_enabled OR NOT cfg.provider_ready THEN 'Contratación pendiente de verificación' WHEN acct.id IS NULL OR NOT acct.verified THEN 'La entidad de facturación necesita verificación' ELSE NULL END);
END $$;
CREATE FUNCTION public.quote_organization_plan(p_organization_id uuid,p_plan_key text,p_plan_version integer,p_interval text,p_founder boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.organization_billing_configuration;acct public.organization_billing_accounts;p public.organization_plan_versions;m public.organization_provider_prices;q public.organization_billing_quotes;renewal integer;BEGIN
 PERFORM organization_billing_private.require_manager(p_organization_id);PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));PERFORM organization_billing_private.require_manager(p_organization_id);
 SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;SELECT * INTO acct FROM public.organization_billing_accounts WHERE organization_id=p_organization_id;
 SELECT * INTO p FROM public.organization_plan_versions WHERE plan_key=p_plan_key AND version=p_plan_version AND status='active';
 SELECT * INTO m FROM public.organization_provider_prices WHERE plan_key=p_plan_key AND plan_version=p_plan_version AND environment=cfg.environment AND interval=p_interval AND verified;
 IF NOT cfg.sales_enabled OR NOT cfg.provider_ready OR acct.id IS NULL OR NOT acct.verified OR acct.administratively_suspended OR p.plan_key IS NULL OR m.price_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.professional_settings WHERE organization_id=p_organization_id AND category=ANY(p.categories)) THEN RAISE EXCEPTION 'organization_billing_unavailable';END IF;
 IF p_founder IS NULL OR p_interval NOT IN('month','year') THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 IF p_founder AND (p_interval<>'year' OR m.coupon_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_founder_approvals WHERE organization_id=p_organization_id AND entity_key=acct.entity_key AND approved_until>clock_timestamp() AND reserved_attempt_id IS NULL AND consumed_attempt_id IS NULL)) THEN RAISE EXCEPTION 'organization_billing_founder_unavailable';END IF;
 renewal:=CASE WHEN p_interval='year' THEN p.annual_cents ELSE p.monthly_cents END;
 INSERT INTO public.organization_billing_quotes(organization_id,actor_id,account_id,account_revision,legal_name,country,environment,plan_key,plan_version,interval,founder,first_base_cents,renewal_base_cents,terms_version,terms,modules,limits,price_id,product_id,coupon_id,expires_at)
 VALUES(p_organization_id,auth.uid(),acct.id,acct.revision,acct.legal_name,acct.country,cfg.environment,p.plan_key,p.version,p_interval,p_founder,CASE WHEN p_founder THEN p.founder_cents ELSE renewal END,renewal,p.terms_version,p.terms,p.modules,p.limits,m.price_id,m.product_id,CASE WHEN p_founder THEN m.coupon_id END,clock_timestamp()+interval '10 minutes') RETURNING * INTO q;
 RETURN (to_jsonb(q)-ARRAY['actor_id','account_id','account_revision','price_id','product_id','coupon_id'])||jsonb_build_object('currency','eur','tax_behavior','exclusive','available',true,'reason',NULL);
END $$;
CREATE FUNCTION public.prepare_organization_checkout(p_organization_id uuid,p_quote_id uuid,p_request_key uuid,p_terms_version text,p_first_base_cents integer,p_renewal_base_cents integer) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.organization_billing_quotes;a public.organization_checkout_attempts;cfg public.organization_billing_configuration;acct public.organization_billing_accounts;fp text;BEGIN
 PERFORM organization_billing_private.require_manager(p_organization_id);PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));PERFORM organization_billing_private.require_manager(p_organization_id);
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 fp:=md5(jsonb_build_array(p_quote_id,p_terms_version,p_first_base_cents,p_renewal_base_cents)::text);
 SELECT * INTO a FROM public.organization_checkout_attempts WHERE organization_id=p_organization_id AND actor_id=auth.uid() AND request_key=p_request_key;
 IF FOUND THEN IF a.fingerprint<>fp THEN RAISE EXCEPTION 'organization_billing_request_conflict';END IF;RETURN organization_billing_private.attempt_json(a.id);END IF;
 SELECT * INTO q FROM public.organization_billing_quotes WHERE id=p_quote_id AND organization_id=p_organization_id AND actor_id=auth.uid();
 SELECT * INTO cfg FROM public.organization_billing_configuration WHERE singleton;SELECT * INTO acct FROM public.organization_billing_accounts WHERE organization_id=p_organization_id;
 IF q.id IS NULL OR q.expires_at<=clock_timestamp() OR q.terms_version IS DISTINCT FROM p_terms_version OR q.first_base_cents IS DISTINCT FROM p_first_base_cents OR q.renewal_base_cents IS DISTINCT FROM p_renewal_base_cents OR acct.revision IS DISTINCT FROM q.account_revision THEN RAISE EXCEPTION 'organization_billing_quote_changed';END IF;
 IF NOT cfg.sales_enabled OR NOT cfg.provider_ready OR q.environment<>cfg.environment OR NOT acct.verified OR acct.administratively_suspended OR NOT EXISTS(SELECT 1 FROM public.organization_plan_versions p JOIN public.professional_settings ps ON ps.organization_id=p_organization_id AND ps.category=ANY(p.categories) WHERE p.plan_key=q.plan_key AND p.version=q.plan_version AND p.status='active') OR NOT EXISTS(SELECT 1 FROM public.organization_provider_prices WHERE plan_key=q.plan_key AND plan_version=q.plan_version AND environment=q.environment AND interval=q.interval AND price_id=q.price_id AND verified) THEN RAISE EXCEPTION 'organization_billing_unavailable';END IF;
 IF EXISTS(SELECT 1 FROM public.organization_checkout_attempts WHERE organization_id=p_organization_id AND environment=q.environment AND status IN('creating','open','pending')) OR EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE organization_id=p_organization_id AND environment=q.environment AND status NOT IN('canceled','incomplete_expired')) OR (organization_billing_private.grant_for(p_organization_id)).source='stripe' THEN RAISE EXCEPTION 'organization_billing_pending_contract';END IF;
 IF q.founder AND NOT EXISTS(SELECT 1 FROM public.organization_founder_approvals WHERE organization_id=p_organization_id AND entity_key=acct.entity_key AND approved_until>clock_timestamp() AND reserved_attempt_id IS NULL AND consumed_attempt_id IS NULL) THEN RAISE EXCEPTION 'organization_billing_founder_unavailable';END IF;
 INSERT INTO public.organization_checkout_attempts(organization_id,actor_id,quote_id,account_id,request_key,fingerprint,environment) VALUES(p_organization_id,auth.uid(),q.id,q.account_id,p_request_key,fp,q.environment) RETURNING * INTO a;
 IF q.founder THEN UPDATE public.organization_founder_approvals SET reserved_attempt_id=a.id WHERE organization_id=p_organization_id;END IF;
 INSERT INTO public.organization_billing_audit(organization_id,actor_id,action,details) VALUES(p_organization_id,auth.uid(),'checkout.accepted',jsonb_build_object('attempt_id',a.id,'quote_id',q.id,'terms_version',q.terms_version,'first_base_cents',q.first_base_cents,'renewal_base_cents',q.renewal_base_cents,'aal','aal2'));
 RETURN organization_billing_private.attempt_json(a.id);
END $$;
CREATE FUNCTION public.service_organization_billing_admin(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;org uuid;oldplan public.organization_plan_versions;acct public.organization_billing_accounts;lim jsonb;a public.organization_checkout_attempts;resolution uuid;fingerprint text;prior_resolution jsonb;observed_at timestamptz;BEGIN
 PERFORM organization_billing_private.service();
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>20000 OR length(coalesce(p_data->>'reason','')) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 org:=(p_data->>'organization_id')::uuid;
 IF org IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(org::text,195));IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=org AND demo_cohort_id IS NULL AND status='active') THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;END IF;
 IF p_action='configuration' THEN
  UPDATE public.organization_billing_configuration SET environment=coalesce(p_data->>'environment',environment),sales_enabled=coalesce((p_data->>'sales_enabled')::boolean,sales_enabled),provider_ready=coalesce((p_data->>'provider_ready')::boolean,provider_ready),native_access_reviewed=coalesce((p_data->>'native_access_reviewed')::boolean,native_access_reviewed),portal_config_id=coalesce(p_data->>'portal_config_id',portal_config_id),updated_at=clock_timestamp() WHERE singleton RETURNING to_jsonb(organization_billing_configuration) INTO result;
  IF (result->>'sales_enabled')::boolean AND (NOT(result->>'native_access_reviewed')::boolean OR result->>'portal_config_id' IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_provider_prices m JOIN public.organization_plan_versions p ON p.plan_key=m.plan_key AND p.version=m.plan_version WHERE p.status='active' AND m.environment=result->>'environment' AND m.verified)) THEN RAISE EXCEPTION 'organization_billing_configuration_incomplete';END IF;
 ELSIF p_action='plan' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('organization_plan:'||coalesce(p_data->>'plan_key','')||':'||coalesce(p_data->>'version',''),198));
  SELECT * INTO oldplan FROM public.organization_plan_versions WHERE plan_key=p_data->>'plan_key' AND version=(p_data->>'version')::integer;
  IF FOUND AND oldplan.status<>'draft' THEN
   IF p_data->>'status'='retired' AND p_data-'reason'-'plan_key'-'version'-'status'='{}'::jsonb THEN UPDATE public.organization_plan_versions SET status='retired' WHERE plan_key=oldplan.plan_key AND version=oldplan.version RETURNING to_jsonb(organization_plan_versions) INTO result;
   ELSE RAISE EXCEPTION 'organization_billing_immutable';END IF;
  ELSE
   lim:=coalesce(p_data->'limits','{"staff_limit":3,"resource_limit":20,"service_limit":50}');
   IF jsonb_typeof(lim) IS DISTINCT FROM 'object' OR NOT(lim ?& ARRAY['staff_limit','resource_limit','service_limit']) OR lim-ARRAY['staff_limit','resource_limit','service_limit']<>'{}'::jsonb THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(lim) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR e.value::text!~'^[0-9]+$') THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
   IF (lim->>'staff_limit')::numeric NOT BETWEEN 1 AND 100 OR (lim->>'resource_limit')::numeric NOT BETWEEN 1 AND 500 OR (lim->>'service_limit')::numeric NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_data->'categories') c WHERE c.value NOT IN('hairdresser','beauty','cafe','bar','restaurant','pub','nightclub','sports','sports_facility','academy','culture','coworking')) THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
   INSERT INTO public.organization_plan_versions(plan_key,version,title,categories,monthly_cents,annual_cents,founder_cents,terms_version,terms,limits,status)
   VALUES(p_data->>'plan_key',(p_data->>'version')::integer,p_data->>'title',ARRAY(SELECT jsonb_array_elements_text(p_data->'categories')),(p_data->>'monthly_cents')::integer,(p_data->>'annual_cents')::integer,(p_data->>'founder_cents')::integer,p_data->>'terms_version',p_data->>'terms',lim,coalesce(p_data->>'status','draft'))
   ON CONFLICT(plan_key,version) DO UPDATE SET title=excluded.title,categories=excluded.categories,monthly_cents=excluded.monthly_cents,annual_cents=excluded.annual_cents,founder_cents=excluded.founder_cents,terms_version=excluded.terms_version,terms=excluded.terms,limits=excluded.limits,status=excluded.status RETURNING to_jsonb(organization_plan_versions) INTO result;
  END IF;
 ELSIF p_action='mapping' THEN
  IF EXISTS(SELECT 1 FROM public.organization_provider_prices WHERE plan_key=p_data->>'plan_key' AND plan_version=(p_data->>'plan_version')::integer AND environment=p_data->>'environment' AND interval=p_data->>'interval' AND (price_id IS DISTINCT FROM p_data->>'price_id' OR product_id IS DISTINCT FROM p_data->>'product_id' OR coupon_id IS DISTINCT FROM p_data->>'coupon_id')) THEN RAISE EXCEPTION 'organization_billing_immutable';END IF;
  INSERT INTO public.organization_provider_prices(plan_key,plan_version,environment,interval,price_id,product_id,coupon_id,verified) VALUES(p_data->>'plan_key',(p_data->>'plan_version')::integer,p_data->>'environment',p_data->>'interval',p_data->>'price_id',p_data->>'product_id',p_data->>'coupon_id',coalesce((p_data->>'verified')::boolean,false)) ON CONFLICT(plan_key,plan_version,environment,interval) DO UPDATE SET verified=excluded.verified RETURNING to_jsonb(organization_provider_prices) INTO result;
 ELSIF p_action='account' THEN
  IF org IS NULL THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
  SELECT * INTO acct FROM public.organization_billing_accounts WHERE organization_id=org;
  IF acct.id IS NOT NULL AND (acct.entity_key IS DISTINCT FROM p_data->>'entity_key') THEN RAISE EXCEPTION 'organization_billing_entity_change_requires_contract';END IF;
  INSERT INTO public.organization_billing_accounts(organization_id,legal_name,entity_key,country,verified) VALUES(org,p_data->>'legal_name',p_data->>'entity_key',p_data->>'country',coalesce((p_data->>'verified')::boolean,false)) ON CONFLICT(organization_id) DO UPDATE SET legal_name=excluded.legal_name,country=excluded.country,verified=excluded.verified,revision=organization_billing_accounts.revision+1 RETURNING to_jsonb(organization_billing_accounts) INTO result;
 ELSIF p_action='founder' THEN
  SELECT * INTO acct FROM public.organization_billing_accounts WHERE organization_id=org AND verified;
  IF acct.id IS NULL OR (p_data->>'approved_until')::timestamptz<=clock_timestamp() OR p_data->>'approval_reference' IS NULL THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
  IF EXISTS(SELECT 1 FROM public.organization_founder_approvals WHERE organization_id=org AND (reserved_attempt_id IS NOT NULL OR consumed_attempt_id IS NOT NULL)) THEN RAISE EXCEPTION 'organization_billing_founder_already_used';END IF;
  INSERT INTO public.organization_founder_approvals(organization_id,entity_key,approved_until,approval_reference) VALUES(org,acct.entity_key,(p_data->>'approved_until')::timestamptz,p_data->>'approval_reference') ON CONFLICT(organization_id) DO UPDATE SET approved_until=excluded.approved_until,approval_reference=excluded.approval_reference RETURNING to_jsonb(organization_founder_approvals) INTO result;
 ELSIF p_action='suspend' THEN
  UPDATE public.organization_billing_accounts SET administratively_suspended=(p_data->>'suspended')::boolean WHERE organization_id=org RETURNING to_jsonb(organization_billing_accounts) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'organization_billing_account_required';END IF;
 ELSIF p_action='resolve_unbound_attempt' THEN
  IF org IS NULL OR p_data->>'attempt_id' IS NULL OR p_data->>'resolution_id' IS NULL OR p_data->>'actor_id' IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(p_data->>'actor_id')::uuid AND role='admin' AND is_discarded IS NOT TRUE AND self_deleted IS NOT TRUE) THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
  resolution:=(p_data->>'resolution_id')::uuid;fingerprint:=encode(extensions.digest(p_data::text,'sha256'),'hex');
  SELECT details INTO prior_resolution FROM public.organization_billing_audit WHERE organization_id=org AND action='admin.resolve_unbound_attempt' AND details->>'resolution_id'=resolution::text;
  IF FOUND THEN IF prior_resolution->>'fingerprint'<>fingerprint THEN RAISE EXCEPTION 'organization_billing_request_conflict';END IF;RETURN prior_resolution->'result';END IF;
  SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=(p_data->>'attempt_id')::uuid;
  IF a.id IS NULL OR a.organization_id<>org THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=a.id FOR UPDATE;
  IF a.status NOT IN('creating','pending') OR a.session_id IS NOT NULL OR a.created_at>clock_timestamp()-interval '48 hours' OR EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE attempt_id=a.id) OR EXISTS(SELECT 1 FROM public.organization_billing_events e WHERE e.organization_id=org AND e.result->>'attempt_id'=a.id::text) OR EXISTS(SELECT 1 FROM public.organization_founder_approvals WHERE consumed_attempt_id=a.id) THEN RAISE EXCEPTION 'organization_billing_resolution_unsafe';END IF;
  SELECT * INTO acct FROM public.organization_billing_accounts WHERE id=a.account_id;observed_at:=(p_data->>'reviewed_at')::timestamptz;
  IF p_data->'confirmed_provider_absence' IS DISTINCT FROM 'true'::jsonb OR p_data->'provider_retry_in_flight' IS DISTINCT FROM 'false'::jsonb OR p_data->'complete_customer_sessions_reviewed' IS DISTINCT FROM 'true'::jsonb OR p_data->'complete_customer_subscriptions_reviewed' IS DISTINCT FROM 'true'::jsonb OR p_data->'complete_customer_charges_reviewed' IS DISTINCT FROM 'true'::jsonb OR p_data->'idempotency_logs_reviewed' IS DISTINCT FROM 'true'::jsonb OR p_data->>'reviewed_environment' IS DISTINCT FROM a.environment OR p_data->>'reviewed_contract_id' IS DISTINCT FROM a.id::text OR NOT(p_data ? 'reviewed_customer_id') OR p_data->>'reviewed_customer_id' IS DISTINCT FROM coalesce(a.customer_id,CASE WHEN a.environment='live' THEN acct.live_customer_id ELSE acct.test_customer_id END) OR p_data->>'reviewed_idempotency_key' IS DISTINCT FROM 'org-saas:checkout:'||a.id::text OR length(coalesce(p_data->>'evidence_reference','')) NOT BETWEEN 16 AND 1000 OR observed_at IS NULL OR observed_at>clock_timestamp() OR observed_at<clock_timestamp()-interval '1 hour' THEN RAISE EXCEPTION 'organization_billing_evidence_required';END IF;
  UPDATE public.organization_checkout_attempts SET status='cancelled',checkout_url=NULL WHERE id=a.id;
  UPDATE public.organization_founder_approvals SET reserved_attempt_id=NULL WHERE reserved_attempt_id=a.id AND consumed_attempt_id IS NULL;
  result:=organization_billing_private.attempt_json(a.id);
  INSERT INTO public.organization_billing_audit(organization_id,actor_id,action,details) VALUES(org,(p_data->>'actor_id')::uuid,'admin.resolve_unbound_attempt',jsonb_build_object('resolution_id',resolution,'attempt_id',a.id,'fingerprint',fingerprint,'evidence',p_data,'result',result));
  RETURN result;
 ELSIF p_action='pilot_grant' THEN
  IF org IS NULL OR (p_data->>'ends_at')::timestamptz<=clock_timestamp() OR (p_data->>'ends_at')::timestamptz>clock_timestamp()+interval '90 days' THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
  INSERT INTO public.organization_entitlement_grants(organization_id,source,starts_at,ends_at,modules,limits,reason) VALUES(org,'pilot',clock_timestamp(),(p_data->>'ends_at')::timestamptz,ARRAY['professional'],'{"staff_limit":3,"resource_limit":20,"service_limit":50}',p_data->>'reason') RETURNING to_jsonb(organization_entitlement_grants) INTO result;
 ELSE RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 INSERT INTO public.organization_billing_audit(organization_id,actor_id,action,details) VALUES(org,(p_data->>'actor_id')::uuid,'admin.'||p_action,jsonb_build_object('reason',p_data->>'reason','result_id',coalesce(result->>'id',result->>'plan_key')));
 RETURN result;
END $$;
CREATE FUNCTION public.service_reconcile_organization_billing(p_event_id text,p_environment text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.organization_checkout_attempts;q public.organization_billing_quotes;acct public.organization_billing_accounts;s public.organization_subscriptions;period public.organization_subscription_periods;prior public.organization_billing_events;fp text;result jsonb;stamp bigint;first_invoice boolean;expected integer;expected_discount integer;dispute text;valid boolean;BEGIN
 PERFORM organization_billing_private.service();
 IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 8 AND 200 OR p_environment NOT IN('test','live') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>20000 THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=(p_payload->>'attempt_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'organization_billing_not_found';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=a.id FOR UPDATE;
 fp:=encode(extensions.digest((p_payload-'provider_snapshot_ms')::text,'sha256'),'hex');SELECT * INTO prior FROM public.organization_billing_events WHERE environment=p_environment AND event_id=p_event_id;
 IF FOUND THEN IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'organization_billing_event_conflict';END IF;RETURN prior.result;END IF;
 SELECT * INTO q FROM public.organization_billing_quotes WHERE id=a.quote_id;SELECT * INTO acct FROM public.organization_billing_accounts WHERE id=a.account_id;
 IF a.environment<>p_environment OR a.organization_id IS DISTINCT FROM (p_payload->>'organization_id')::uuid OR a.account_id IS DISTINCT FROM (p_payload->>'account_id')::uuid OR coalesce(a.customer_id,CASE WHEN a.environment='live' THEN acct.live_customer_id ELSE acct.test_customer_id END) IS DISTINCT FROM p_payload->>'customer_id' OR p_payload->>'customer_id' IS NULL THEN RAISE EXCEPTION 'organization_billing_provider_mismatch';END IF;
 stamp:=(p_payload->>'provider_snapshot_ms')::bigint;
 IF stamp IS NULL OR stamp>extract(epoch FROM clock_timestamp())*1000+60000 OR stamp<extract(epoch FROM clock_timestamp())*1000-300000 THEN RAISE EXCEPTION 'organization_billing_snapshot_invalid';END IF;
 IF p_payload->>'kind'='checkout_expired' THEN
  IF p_payload->>'payment_status'<>'unpaid' OR a.session_id IS DISTINCT FROM p_payload->>'session_id' OR a.session_id IS NULL THEN RAISE EXCEPTION 'organization_billing_provider_mismatch';END IF;
  IF a.status IN('creating','open','pending') AND NOT EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE attempt_id=a.id AND status NOT IN('canceled','incomplete_expired')) THEN
   UPDATE public.organization_checkout_attempts SET status='cancelled' WHERE id=a.id;
   UPDATE public.organization_founder_approvals SET reserved_attempt_id=NULL WHERE reserved_attempt_id=a.id AND consumed_attempt_id IS NULL;
  END IF;
 ELSIF p_payload->>'kind' IN('subscription_state','invoice_snapshot') THEN
  IF p_payload->>'subscription_id' IS NULL OR p_payload->>'subscription_id'!~'^sub_[A-Za-z0-9_]+$' OR p_payload->>'price_id' IS DISTINCT FROM q.price_id OR p_payload->>'product_id' IS DISTINCT FROM q.product_id OR p_payload->>'currency' IS DISTINCT FROM 'eur' OR (p_payload->>'quantity')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'organization_billing_provider_mismatch';END IF;
  SELECT * INTO s FROM public.organization_subscriptions WHERE environment=p_environment AND subscription_id=p_payload->>'subscription_id';
  IF s.id IS NOT NULL AND (s.attempt_id<>a.id OR s.account_id<>a.account_id) THEN RAISE EXCEPTION 'organization_billing_provider_mismatch';END IF;
  IF s.id IS NULL THEN INSERT INTO public.organization_subscriptions(attempt_id,organization_id,account_id,environment,subscription_id,customer_id,status) VALUES(a.id,a.organization_id,a.account_id,p_environment,p_payload->>'subscription_id',p_payload->>'customer_id','incomplete') RETURNING * INTO s;END IF;
  IF p_payload->>'kind'='subscription_state' THEN
   IF p_payload->>'status' NOT IN('incomplete','incomplete_expired','trialing','active','past_due','unpaid','paused','canceled') OR p_payload->>'cancel_at_period_end' IS NULL THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
   IF stamp>s.snapshot_ms THEN UPDATE public.organization_subscriptions SET status=p_payload->>'status',cancel_at_period_end=(p_payload->>'cancel_at_period_end')::boolean,current_period_end=(p_payload->>'current_period_end')::timestamptz,snapshot_ms=stamp WHERE id=s.id;END IF;
   IF stamp>s.snapshot_ms AND p_payload->>'status'='incomplete_expired' AND NOT EXISTS(SELECT 1 FROM public.organization_subscription_periods WHERE subscription_id=s.id AND paid) THEN
    UPDATE public.organization_checkout_attempts SET status='failed' WHERE id=a.id AND status IN('creating','open','pending');
    UPDATE public.organization_founder_approvals SET reserved_attempt_id=NULL WHERE reserved_attempt_id=a.id AND consumed_attempt_id IS NULL;
   END IF;
  ELSE
   IF p_payload->>'invoice_id' IS NULL OR p_payload->>'invoice_id'!~'^in_[A-Za-z0-9_]+$' OR p_payload->>'billing_reason' NOT IN('subscription_create','subscription_cycle') OR p_payload->>'paid' IS NULL OR p_payload->>'dispute_status' NOT IN('none','open','won','lost') THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
   first_invoice:=p_payload->>'billing_reason'='subscription_create';expected:=CASE WHEN first_invoice THEN q.first_base_cents ELSE q.renewal_base_cents END;expected_discount:=CASE WHEN first_invoice THEN q.renewal_base_cents-q.first_base_cents ELSE 0 END;
   IF (p_payload->>'subtotal_cents')::integer IS DISTINCT FROM q.renewal_base_cents OR (p_payload->>'discount_cents')::integer IS DISTINCT FROM expected_discount OR (p_payload->>'tax_cents')::integer IS NULL OR (p_payload->>'tax_cents')::integer<0 OR (p_payload->>'total_cents')::integer IS DISTINCT FROM expected+(p_payload->>'tax_cents')::integer OR (first_invoice AND q.founder AND p_payload->>'coupon_id' IS DISTINCT FROM q.coupon_id) OR (NOT(first_invoice AND q.founder) AND p_payload->>'coupon_id' IS NOT NULL) THEN RAISE EXCEPTION 'organization_billing_amount_mismatch';END IF;
   IF (p_payload->>'paid')::boolean AND (p_payload->>'paid_cents')::integer IS DISTINCT FROM (p_payload->>'total_cents')::integer THEN RAISE EXCEPTION 'organization_billing_amount_mismatch';END IF;
   IF (p_payload->>'period_start')::timestamptz IS NULL OR (p_payload->>'period_end')::timestamptz IS NULL OR (p_payload->>'period_end')::timestamptz<=(p_payload->>'period_start')::timestamptz OR (p_payload->>'period_end')::timestamptz>(p_payload->>'period_start')::timestamptz+(CASE WHEN q.interval='year' THEN interval '367 days' ELSE interval '32 days' END) THEN RAISE EXCEPTION 'organization_billing_period_invalid';END IF;
   IF EXISTS(SELECT 1 FROM public.organization_subscription_periods z WHERE z.subscription_id=s.id AND z.invoice_id<>p_payload->>'invoice_id' AND tstzrange(z.period_start,z.period_end,'[)')&&tstzrange((p_payload->>'period_start')::timestamptz,(p_payload->>'period_end')::timestamptz,'[)')) THEN RAISE EXCEPTION 'organization_billing_period_overlap';END IF;
   SELECT * INTO period FROM public.organization_subscription_periods WHERE environment=p_environment AND invoice_id=p_payload->>'invoice_id';
   IF period.id IS NOT NULL AND (period.subscription_id<>s.id OR period.period_start IS DISTINCT FROM (p_payload->>'period_start')::timestamptz OR period.period_end IS DISTINCT FROM (p_payload->>'period_end')::timestamptz OR period.total_cents IS DISTINCT FROM (p_payload->>'total_cents')::integer) THEN RAISE EXCEPTION 'organization_billing_invoice_conflict';END IF;
   INSERT INTO public.organization_subscription_periods(subscription_id,environment,invoice_id,period_start,period_end,subtotal_cents,discount_cents,tax_cents,total_cents,paid,paid_cents,refunded_cents,dispute_status,snapshot_ms)
   VALUES(s.id,p_environment,p_payload->>'invoice_id',(p_payload->>'period_start')::timestamptz,(p_payload->>'period_end')::timestamptz,(p_payload->>'subtotal_cents')::integer,(p_payload->>'discount_cents')::integer,(p_payload->>'tax_cents')::integer,(p_payload->>'total_cents')::integer,(p_payload->>'paid')::boolean,(p_payload->>'paid_cents')::integer,(p_payload->>'refunded_cents')::integer,p_payload->>'dispute_status',stamp)
   ON CONFLICT(environment,invoice_id) DO UPDATE SET paid=organization_subscription_periods.paid OR excluded.paid,paid_cents=greatest(organization_subscription_periods.paid_cents,excluded.paid_cents),refunded_cents=greatest(organization_subscription_periods.refunded_cents,excluded.refunded_cents),dispute_status=CASE WHEN excluded.snapshot_ms>organization_subscription_periods.snapshot_ms OR (excluded.snapshot_ms=organization_subscription_periods.snapshot_ms AND excluded.dispute_status IN('open','lost')) THEN excluded.dispute_status ELSE organization_subscription_periods.dispute_status END,snapshot_ms=greatest(organization_subscription_periods.snapshot_ms,excluded.snapshot_ms) RETURNING * INTO period;
   valid:=period.paid AND period.paid_cents>0 AND period.refunded_cents<period.paid_cents AND period.dispute_status IN('none','won');
   INSERT INTO public.organization_entitlement_grants(organization_id,source,period_id,environment,starts_at,ends_at,modules,limits,revoked,reason)
   VALUES(a.organization_id,'stripe',period.id,p_environment,period.period_start,period.period_end,q.modules,q.limits,NOT valid,'verified_invoice') ON CONFLICT(period_id) DO UPDATE SET revoked=excluded.revoked;
   IF period.paid THEN
    UPDATE public.organization_checkout_attempts SET status='paid',customer_id=p_payload->>'customer_id' WHERE id=a.id;
    UPDATE public.organization_subscriptions SET current_period_end=greatest(current_period_end,period.period_end) WHERE id=s.id;
    IF q.founder THEN UPDATE public.organization_founder_approvals SET consumed_attempt_id=a.id,reserved_attempt_id=NULL WHERE organization_id=a.organization_id AND (consumed_attempt_id IS NULL OR consumed_attempt_id=a.id);END IF;
    IF EXISTS(SELECT 1 FROM public.organization_billing_audit WHERE organization_id=a.organization_id AND action='admin.resolve_unbound_attempt' AND details->>'attempt_id'=a.id::text) AND NOT EXISTS(SELECT 1 FROM public.organization_billing_audit WHERE organization_id=a.organization_id AND action='checkout.resolution_contradicted' AND details->>'invoice_id'=period.invoice_id) THEN
     INSERT INTO public.organization_billing_audit(organization_id,action,details) VALUES(a.organization_id,'checkout.resolution_contradicted',jsonb_build_object('attempt_id',a.id,'invoice_id',period.invoice_id,'review_required',true,'reason','Verified payment contradicts a manual provider-absence resolution; inspect concurrent contracts without discarding payment'));
    END IF;
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 result:=organization_billing_private.attempt_json(a.id);
 INSERT INTO public.organization_billing_events(environment,event_id,organization_id,fingerprint,result) VALUES(p_environment,p_event_id,a.organization_id,fp,result);
 RETURN result;
END $$;
ALTER TABLE public.organization_checkout_attempts ADD COLUMN last_reconciled_at timestamptz;
CREATE FUNCTION public.lookup_organization_checkout(p_organization_id uuid,p_request_key uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE attempt uuid;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR NOT(organization_billing_private.manager(p_organization_id,auth.uid()) OR public.has_organization_permission(p_organization_id,'finance.read')) THEN RAISE EXCEPTION 'organization_billing_forbidden';END IF;
 SELECT id INTO attempt FROM public.organization_checkout_attempts WHERE organization_id=p_organization_id AND actor_id=auth.uid() AND request_key=p_request_key;
 RETURN jsonb_build_object('attempt_known',attempt IS NOT NULL,'attempt_id',attempt);
END $$;
CREATE FUNCTION public.service_is_organization_billing_customer(p_customer_id text,p_environment text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM organization_billing_private.service();IF p_environment NOT IN('test','live') OR p_customer_id IS NULL THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM public.organization_billing_accounts WHERE CASE WHEN p_environment='live' THEN live_customer_id ELSE test_customer_id END=p_customer_id);
END $$;
CREATE FUNCTION public.service_organization_billing_reconcile_batch(p_limit integer DEFAULT 10) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate record;locked uuid;items jsonb:='[]';cursor_id uuid;BEGIN
 PERFORM organization_billing_private.service();IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('organization_billing_batch',197)) THEN RETURN jsonb_build_object('attempts',items,'busy',true);END IF;
 SELECT reconcile_cursor INTO cursor_id FROM public.organization_billing_configuration WHERE singleton;
 FOR candidate IN SELECT id,organization_id FROM public.organization_checkout_attempts WHERE status IN('creating','open','pending','paid') ORDER BY (cursor_id IS NULL OR id>cursor_id) DESC,id LIMIT p_limit*4 LOOP
  cursor_id:=candidate.id;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.organization_id::text,195)) THEN CONTINUE;END IF;
  SELECT id INTO locked FROM public.organization_checkout_attempts WHERE id=candidate.id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  UPDATE public.organization_checkout_attempts SET last_reconciled_at=clock_timestamp() WHERE id=locked;
  items:=items||jsonb_build_array(public.service_get_organization_checkout(locked,NULL));EXIT WHEN jsonb_array_length(items)>=p_limit;
 END LOOP;
 UPDATE public.organization_billing_configuration SET reconcile_cursor=cursor_id WHERE singleton;
 RETURN jsonb_build_object('attempts',items);
END $$;

CREATE FUNCTION public.service_advance_organization_invoice_cursor(p_attempt_id uuid,p_expected_cursor text,p_next_cursor text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.organization_checkout_attempts;BEGIN
 PERFORM organization_billing_private.service();
 IF (p_expected_cursor IS NOT NULL AND (length(p_expected_cursor)>200 OR p_expected_cursor!~'^in_[A-Za-z0-9_]+$')) OR (p_next_cursor IS NOT NULL AND (length(p_next_cursor)>200 OR p_next_cursor!~'^in_[A-Za-z0-9_]+$')) THEN RAISE EXCEPTION 'organization_billing_invalid_input';END IF;
 SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'organization_billing_not_found';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,195));SELECT * INTO a FROM public.organization_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF a.invoice_cursor IS DISTINCT FROM p_expected_cursor THEN RETURN jsonb_build_object('invoice_cursor',a.invoice_cursor,'advanced',false);END IF;
 UPDATE public.organization_checkout_attempts SET invoice_cursor=p_next_cursor WHERE id=a.id;
 RETURN jsonb_build_object('invoice_cursor',p_next_cursor,'advanced',true);
END $$;

-- Explicit operational pause is independent of the commercial grant. Existing
-- bookings/actions continue using the earlier obligation-aware RPCs.
ALTER TABLE public.professional_settings ADD COLUMN operational_paused boolean NOT NULL DEFAULT false;
UPDATE public.professional_settings s SET operational_paused=true WHERE NOT enabled AND EXISTS(SELECT 1 FROM public.organization_audit a WHERE a.organization_id=s.organization_id AND a.action='professional.pilot.updated' AND a.details->>'enabled'='false');
CREATE FUNCTION organization_billing_private.pause_professional() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$BEGIN
 NEW.operational_paused:=NOT NEW.enabled;RETURN NEW;
END $$;
CREATE TRIGGER professional_billing_pause BEFORE UPDATE OF enabled ON public.professional_settings FOR EACH ROW EXECUTE FUNCTION organization_billing_private.pause_professional();
CREATE FUNCTION organization_billing_private.professional_enabled(p_org uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT NOT s.operational_paused AND NOT coalesce(a.administratively_suspended,false) AND (s.enabled OR o.demo_cohort_id IS NOT NULL OR (organization_billing_private.grant_for(p_org)).id IS NOT NULL)
 FROM public.professional_settings s JOIN public.organizations o ON o.id=s.organization_id LEFT JOIN public.organization_billing_accounts a ON a.organization_id=o.id WHERE s.organization_id=p_org AND o.status='active'),false)
$$;
CREATE FUNCTION organization_billing_private.category_allowed(p_org uuid,p_category text) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.organization_checkout_attempts a JOIN public.organization_billing_quotes q ON q.id=a.quote_id JOIN public.organization_plan_versions p ON p.plan_key=q.plan_key AND p.version=q.plan_version WHERE a.organization_id=p_org AND a.status IN('creating','open','pending') AND a.environment=(SELECT environment FROM public.organization_billing_configuration WHERE singleton) AND NOT(p_category=ANY(p.categories))) AND NOT EXISTS(SELECT 1 FROM public.organization_entitlement_grants g JOIN public.organization_subscription_periods r ON r.id=g.period_id JOIN public.organization_subscriptions s ON s.id=r.subscription_id JOIN public.organization_checkout_attempts a ON a.id=s.attempt_id JOIN public.organization_billing_quotes q ON q.id=a.quote_id JOIN public.organization_plan_versions p ON p.plan_key=q.plan_key AND p.version=q.plan_version
 WHERE g.organization_id=p_org AND g.source='stripe' AND NOT g.revoked AND g.starts_at<=clock_timestamp() AND g.ends_at>clock_timestamp() AND g.environment=(SELECT environment FROM public.organization_billing_configuration WHERE singleton) AND NOT(p_category=ANY(p.categories)))
$$;
CREATE OR REPLACE FUNCTION workspace_private.professional_access(p_org uuid,p_permission text DEFAULT NULL) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_session_usable() AND EXISTS(SELECT 1 FROM public.organizations o JOIN public.professional_settings s ON s.organization_id=o.id WHERE o.id=p_org AND o.status='active' AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND organization_billing_private.professional_enabled(p_org)
 AND(CASE WHEN p_permission IS NULL THEN s.public_booking OR public.has_organization_permission(o.id,'resource.read') ELSE public.has_organization_permission(o.id,p_permission) END))
$$;
DO $integration$
DECLARE def text;old text;BEGIN
 SELECT pg_get_functiondef('public.professional_get_workspace(uuid,timestamptz,timestamptz,date)'::regprocedure) INTO old;
 def:=replace(old,'''enabled'',cfg.enabled OR v_demo','''enabled'',organization_billing_private.professional_enabled(p_organization_id)');IF def=old THEN RAISE EXCEPTION 'organization_billing_definition_changed';END IF;EXECUTE def;
 SELECT pg_get_functiondef('public.professional_list_businesses(text,uuid,integer)'::regprocedure) INTO old;
 def:=replace(old,'(s.enabled OR o.demo_cohort_id IS NOT NULL)','organization_billing_private.professional_enabled(o.id)');IF def=old THEN RAISE EXCEPTION 'organization_billing_definition_changed';END IF;EXECUTE def;
 SELECT pg_get_functiondef('public.professional_save_record(uuid,text,uuid,jsonb)'::regprocedure) INTO old;
 def:=replace(old,'SELECT * INTO cfg FROM public.professional_settings WHERE organization_id=p_organization_id;',
 'SELECT * INTO cfg FROM public.professional_settings WHERE organization_id=p_organization_id;
 IF NOT coalesce(cfg.enabled,false) AND (organization_billing_private.grant_for(p_organization_id)).id IS NOT NULL THEN
  cfg.staff_limit:=((organization_billing_private.grant_for(p_organization_id)).limits->>''staff_limit'')::integer;
  cfg.resource_limit:=((organization_billing_private.grant_for(p_organization_id)).limits->>''resource_limit'')::integer;
  cfg.service_limit:=((organization_billing_private.grant_for(p_organization_id)).limits->>''service_limit'')::integer;
 END IF;
 IF p_entity=''settings'' AND p_data ? ''category'' AND NOT organization_billing_private.category_allowed(p_organization_id,p_data->>''category'') THEN RAISE EXCEPTION ''organization_billing_category_not_in_plan'';END IF;');IF def=old THEN RAISE EXCEPTION 'organization_billing_definition_changed';END IF;EXECUTE def;
END $integration$;

-- Drafts are informative only. No provider IDs, legal entities, founder approval
-- or paid entitlement is seeded by this migration.
INSERT INTO public.organization_plan_versions(plan_key,version,title,categories,monthly_cents,annual_cents,founder_cents,terms_version,terms) VALUES
 ('local_basic',1,'Cafetería y bar',ARRAY['cafe','bar'],1900,19000,14900,'proposal-2026-v1','Propuesta pendiente de condiciones comerciales verificadas. Una organización y una sede. No constituye una contratación.'),
 ('local_standard',1,'Agenda y actividades',ARRAY['hairdresser','beauty','pub','culture'],2900,29000,19900,'proposal-2026-v1','Propuesta pendiente de condiciones comerciales verificadas. Una organización y una sede. No constituye una contratación.'),
 ('local_advanced',1,'Reservas y grupos',ARRAY['restaurant','sports','sports_facility','academy','coworking'],3900,39000,29900,'proposal-2026-v1','Propuesta pendiente de condiciones comerciales verificadas. Una organización y una sede. No constituye una contratación.'),
 ('local_night',1,'Discoteca y promotor',ARRAY['nightclub'],5900,59000,44900,'proposal-2026-v1','Propuesta pendiente de condiciones comerciales verificadas. Una organización y una sede. No constituye una contratación.');
DO $grants$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='organization_billing_private' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('get_organization_billing','quote_organization_plan','prepare_organization_checkout','get_organization_billing_access','lookup_organization_checkout') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('service_get_organization_checkout','service_bind_organization_customer','service_attach_organization_checkout','service_reconcile_organization_billing','service_organization_billing_admin','service_organization_billing_reconcile_batch','service_is_organization_billing_customer','service_advance_organization_invoice_cursor') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);END LOOP;
END $grants$;
-- Demo accounts may inspect their own neutral state, never reach purchase RPCs.
DO $$DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF strpos(definition,'''/rpc/get_organization_billing''')=0 THEN
  IF strpos(definition,'''/rpc/current_demo_cohort''')=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing';END IF;
  EXECUTE replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/get_organization_billing''');
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
