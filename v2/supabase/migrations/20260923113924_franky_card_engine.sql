-- Franky Card: deliberately dark until operational checks and an AAL2 administrator enable it.
-- All browser writes use narrow SECURITY DEFINER RPCs; no direct table privilege is granted.
CREATE SCHEMA IF NOT EXISTS card_private;
REVOKE ALL ON SCHEMA card_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.franky_card_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 purchases_enabled boolean NOT NULL DEFAULT false, provider_ready boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'test' CHECK(environment IN('test','live')),
 annual_cents int NOT NULL DEFAULT 1990 CHECK(annual_cents>0), introductory_cents int NOT NULL DEFAULT 1490 CHECK(introductory_cents>0),
 price_version text NOT NULL DEFAULT '2026-annual-v1', agreement_version text NOT NULL DEFAULT '2026-adhesion-v1',
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.franky_card_settings(singleton) VALUES(true);
CREATE TABLE public.franky_card_profiles(
 user_id uuid PRIMARY KEY, full_name text NOT NULL CHECK(length(full_name) BETWEEN 2 AND 100), photo_path text,
 university text, studies text, cohort_year int CHECK(cohort_year BETWEEN 1950 AND 2100), academic_visibility boolean NOT NULL DEFAULT false,
 student_verified_until timestamptz, age_verified_until timestamptz, verified_age int,
 credential_version int NOT NULL DEFAULT 1, demo_cohort_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.franky_card_memberships(
 user_id uuid PRIMARY KEY, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 suspended boolean NOT NULL DEFAULT false, demo_cohort_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.franky_card_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL, request_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'created' CHECK(status IN('created','checkout','pending','paid','refunded','disputed','failed','expired','cancelled','review')),
 amount_cents int NOT NULL CHECK(amount_cents>0),currency text NOT NULL DEFAULT 'eur' CHECK(currency='eur'),
 refunded_cents int NOT NULL DEFAULT 0 CHECK(refunded_cents BETWEEN 0 AND amount_cents),
 price_version text NOT NULL,terms_version text NOT NULL DEFAULT '2026-adhesion-v1',environment text NOT NULL CHECK(environment IN('test','live')),
 checkout_id text UNIQUE,checkout_url text,payment_id text UNIQUE,provider text,
 period_start timestamptz,period_end timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX franky_card_one_open_order ON public.franky_card_orders(user_id) WHERE status IN('created','checkout','pending');
CREATE TABLE public.franky_card_payment_events(
 id text PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.franky_card_orders(id),action text NOT NULL,
 payment_id text NOT NULL,amount_cents int NOT NULL,environment text NOT NULL,provider text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.franky_card_venues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 name text NOT NULL,city text NOT NULL,category text NOT NULL,address text NOT NULL,timezone text NOT NULL DEFAULT 'Europe/Madrid',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','suspended')),
 agreement_version text NOT NULL,agreement_accepted_by uuid NOT NULL,agreement_accepted_at timestamptz NOT NULL DEFAULT now(),
 demo_cohort_id uuid,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX franky_card_venues_org ON public.franky_card_venues(organization_id);
CREATE TABLE public.franky_card_offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venue_id uuid NOT NULL REFERENCES public.franky_card_venues(id),version int NOT NULL,
 title text NOT NULL,kind text NOT NULL CHECK(kind IN('base','campaign')),percent int NOT NULL CHECK(percent BETWEEN 5 AND 100),
 service_keys text[] NOT NULL CHECK(cardinality(service_keys)>0),minimum_cents int NOT NULL DEFAULT 0 CHECK(minimum_cents>=0),
 starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz,student_only boolean NOT NULL DEFAULT false,
 minimum_age int CHECK(minimum_age BETWEEN 16 AND 99),terms text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('draft','pending','active','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at IS NULL OR ends_at>starts_at),UNIQUE(venue_id,version)
);
CREATE UNIQUE INDEX franky_card_base_active ON public.franky_card_offers(venue_id) WHERE kind='base' AND status='active';
CREATE TABLE public.franky_card_programs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venue_id uuid NOT NULL REFERENCES public.franky_card_venues(id),version int NOT NULL,
 title text NOT NULL,service_keys text[] NOT NULL CHECK(cardinality(service_keys)>0),required_stamps int NOT NULL CHECK(required_stamps BETWEEN 1 AND 100),
 reward_service_key text NOT NULL,reward_label text NOT NULL,reward_max_cents int NOT NULL CHECK(reward_max_cents BETWEEN 1 AND 100000),
 terms text NOT NULL,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','retired')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(venue_id,version)
);
CREATE UNIQUE INDEX franky_card_program_active ON public.franky_card_programs(venue_id) WHERE status='active';
CREATE TABLE public.franky_card_credentials(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,token_hash text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN('temporary','wallet')),credential_version int NOT NULL,expires_at timestamptz,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX franky_card_credentials_owner ON public.franky_card_credentials(user_id);
CREATE TABLE public.franky_card_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venue_id uuid NOT NULL REFERENCES public.franky_card_venues(id),user_id uuid NOT NULL,merchant_user_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('discount','loyalty','reward','protected')),request_key uuid NOT NULL,payload_hash text NOT NULL,
 offer_id uuid REFERENCES public.franky_card_offers(id),program_id uuid REFERENCES public.franky_card_programs(id),
 credential_version int NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','customer_confirmed','completed','rejected','expired')),
 lines jsonb NOT NULL,money jsonb NOT NULL,offer_snapshot jsonb,program_snapshot jsonb,
 customer_confirmed_at timestamptz,merchant_confirmed_at timestamptz,external_reference text,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes',created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 demo_cohort_id uuid,UNIQUE(merchant_user_id,request_key)
);
CREATE INDEX franky_card_requests_owner ON public.franky_card_requests(user_id,created_at DESC);
CREATE INDEX franky_card_requests_venue ON public.franky_card_requests(venue_id,created_at DESC);
CREATE TABLE public.franky_card_consumptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE REFERENCES public.franky_card_requests(id),
 venue_id uuid NOT NULL REFERENCES public.franky_card_venues(id),user_id uuid NOT NULL,merchant_user_id uuid NOT NULL,
 kind text NOT NULL,lines jsonb NOT NULL,money jsonb NOT NULL,external_reference text NOT NULL,
 program_id uuid REFERENCES public.franky_card_programs(id),demo_cohort_id uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(venue_id,external_reference)
);
CREATE INDEX franky_card_consumptions_owner ON public.franky_card_consumptions(user_id,created_at DESC);
CREATE UNIQUE INDEX franky_card_booking_once ON public.franky_card_consumptions(external_reference) WHERE external_reference LIKE 'professional-booking:%';
CREATE TABLE public.franky_card_adjustments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),consumption_id uuid NOT NULL REFERENCES public.franky_card_consumptions(id),request_key uuid NOT NULL UNIQUE,
 line_ids text[] NOT NULL,refund_cents int NOT NULL CHECK(refund_cents>=0),reversed_savings_cents int NOT NULL CHECK(reversed_savings_cents>=0),
 stamps_adjusted int NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.franky_card_loyalty_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,program_id uuid NOT NULL REFERENCES public.franky_card_programs(id),
 consumption_id uuid NOT NULL REFERENCES public.franky_card_consumptions(id),adjustment_id uuid REFERENCES public.franky_card_adjustments(id),
 delta int NOT NULL CHECK(delta<>0),kind text NOT NULL CHECK(kind IN('earned','reward','reversal')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX franky_card_loyalty_once ON public.franky_card_loyalty_ledger(consumption_id,kind) WHERE kind IN('earned','reward');
CREATE UNIQUE INDEX franky_card_loyalty_reverse_once ON public.franky_card_loyalty_ledger(consumption_id) WHERE kind='reversal';
CREATE INDEX franky_card_loyalty_balance ON public.franky_card_loyalty_ledger(user_id,program_id);
CREATE TABLE public.franky_card_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,action text NOT NULL,target_id uuid,data jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.franky_card_launch_cities(city text PRIMARY KEY,approved_by uuid NOT NULL,approved_at timestamptz NOT NULL DEFAULT now(),active boolean NOT NULL DEFAULT true);
CREATE TABLE public.franky_card_storage_gc(bucket text NOT NULL CHECK(bucket IN('card-media','card-wallet')),path text NOT NULL,claim_id uuid NOT NULL DEFAULT gen_random_uuid(),claimed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(bucket,path));

CREATE FUNCTION card_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$BEGIN RAISE EXCEPTION 'card_immutable_history' USING ERRCODE='42501';END$$;
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['franky_card_settings','franky_card_profiles','franky_card_memberships','franky_card_orders','franky_card_payment_events','franky_card_venues','franky_card_offers','franky_card_programs','franky_card_credentials','franky_card_requests','franky_card_consumptions','franky_card_adjustments','franky_card_loyalty_ledger','franky_card_audit','franky_card_launch_cities','franky_card_storage_gc'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['franky_card_consumptions','franky_card_adjustments','franky_card_loyalty_ledger','franky_card_payment_events','franky_card_audit'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION card_private.immutable()',t);END LOOP;
END$$;

CREATE FUNCTION card_private.require_user() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM public.require_account_session();IF auth.uid() IS NULL THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 IF NOT (SELECT enabled FROM public.franky_card_settings) AND public.current_demo_cohort() IS NULL AND NOT public.is_admin() THEN RAISE EXCEPTION 'card_unavailable' USING ERRCODE='42501';END IF;RETURN auth.uid();END$$;
CREATE FUNCTION card_private.require_service() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;END$$;
CREATE FUNCTION card_private.require_admin() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM public.require_account_session();IF auth.uid() IS NULL OR NOT public.is_admin() OR public.current_demo_cohort() IS NOT NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;END$$;
CREATE FUNCTION card_private.require_merchant(p_venue uuid,p_permission text DEFAULT 'attendees.manage') RETURNS public.franky_card_venues LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v public.franky_card_venues;BEGIN
 PERFORM card_private.require_user();SELECT * INTO v FROM public.franky_card_venues WHERE id=p_venue;
 IF v.id IS NULL OR v.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() OR NOT public.has_organization_permission(v.organization_id,p_permission) THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;RETURN v;END$$;
-- Administrative suspension and payment disputes have separate authorities; bank events never clear the former.
CREATE FUNCTION card_private.has_open_dispute(p_user uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT EXISTS(SELECT 1 FROM public.franky_card_orders WHERE user_id=p_user AND status='disputed')$$;
CREATE FUNCTION card_private.active(p_user uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT NOT card_private.has_open_dispute(p_user) AND EXISTS(SELECT 1 FROM public.franky_card_memberships WHERE user_id=p_user AND starts_at<=now() AND ends_at>now() AND NOT suspended)$$;
CREATE FUNCTION card_private.require_eligible(p_user uuid,p_offer public.franky_card_offers) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE p public.franky_card_profiles;BEGIN
 IF NOT card_private.active(p_user) THEN RAISE EXCEPTION 'card_not_active';END IF;
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=p_user;
 IF (p_offer.student_only AND coalesce(p.student_verified_until<=now(),true)) OR (p_offer.minimum_age IS NOT NULL AND (coalesce(p.age_verified_until<=now(),true) OR coalesce(p.verified_age,0)<p_offer.minimum_age)) THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;END$$;

CREATE FUNCTION public.get_franky_card_readiness() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT jsonb_build_object('enabled',enabled,'purchases_enabled',purchases_enabled,'provider_ready',provider_ready,'environment',environment,'annual_cents',annual_cents,'introductory_cents',introductory_cents,'currency','eur') FROM public.franky_card_settings$$;
CREATE FUNCTION public.save_franky_card_profile(p_profile jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user(); n text:=trim(p_profile->>'full_name');ph text:=nullif(p_profile->>'photo_path','');BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,732));
 IF length(n) NOT BETWEEN 2 AND 100 OR p_profile ?| ARRAY['student_verified_until','verified_age','demo_cohort_id','user_id'] OR (ph IS NOT NULL AND (ph NOT LIKE u::text||'/%' OR ph~'\.\.' OR length(ph)>250)) OR length(coalesce(p_profile->>'university',''))>180 OR length(coalesce(p_profile->>'studies',''))>180 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF ph IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='card-media' AND name=ph) OR EXISTS(SELECT 1 FROM public.franky_card_storage_gc WHERE bucket='card-media' AND path=ph)) THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 INSERT INTO public.franky_card_profiles(user_id,full_name,photo_path,university,studies,cohort_year,academic_visibility,demo_cohort_id)
 VALUES(u,n,ph,nullif(p_profile->>'university',''),nullif(p_profile->>'studies',''),(p_profile->>'cohort_year')::int,coalesce((p_profile->>'academic_visibility')::boolean,false),public.current_demo_cohort())
 ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,photo_path=excluded.photo_path,university=excluded.university,studies=excluded.studies,cohort_year=excluded.cohort_year,academic_visibility=excluded.academic_visibility,updated_at=now(),credential_version=franky_card_profiles.credential_version+1;
 INSERT INTO public.franky_card_audit(actor_id,action,target_id) VALUES(u,'profile_changed',u);
 RETURN (SELECT to_jsonb(p)-ARRAY['user_id','credential_version','verified_age','age_verified_until','demo_cohort_id','updated_at'] FROM public.franky_card_profiles p WHERE user_id=u);END$$;
CREATE FUNCTION public.issue_franky_card_credential(p_kind text DEFAULT 'temporary') RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();p public.franky_card_profiles;token text;expiry timestamptz;BEGIN
 IF p_kind NOT IN('temporary','wallet') THEN RAISE EXCEPTION 'card_invalid_input';END IF;SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=u FOR UPDATE;
 IF p.user_id IS NULL THEN RAISE EXCEPTION 'card_profile_required';END IF;
 UPDATE public.franky_card_credentials SET revoked_at=now() WHERE user_id=u AND credential_version<>p.credential_version AND revoked_at IS NULL;
 IF p_kind='temporary' THEN
 UPDATE public.franky_card_credentials SET revoked_at=now() WHERE user_id=u AND kind='temporary' AND revoked_at IS NULL;
 ELSIF(SELECT count(*) FROM public.franky_card_credentials WHERE user_id=u AND kind='wallet' AND credential_version=p.credential_version AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>now()))>=10 THEN RAISE EXCEPTION 'card_wallet_limit';END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');expiry:=CASE WHEN p_kind='temporary' THEN now()+interval '30 seconds' ELSE NULL END;
 INSERT INTO public.franky_card_credentials(user_id,token_hash,kind,credential_version,expires_at) VALUES(u,encode(extensions.digest(token,'sha256'),'hex'),p_kind,p.credential_version,expiry);
 RETURN jsonb_build_object('token',token,'expires_at',expiry,'kind',p_kind,'card_active',card_private.active(u),'loyalty_available',true);END$$;
CREATE FUNCTION public.revoke_franky_card_credentials() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();BEGIN
 UPDATE public.franky_card_profiles SET credential_version=credential_version+1 WHERE user_id=u;UPDATE public.franky_card_credentials SET revoked_at=now() WHERE user_id=u AND revoked_at IS NULL;
 RETURN jsonb_build_object('ok',true);END$$;

CREATE FUNCTION public.save_franky_card_venue(p_organization_id uuid,p_venue_id uuid,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();v public.franky_card_venues;org public.organizations;BEGIN
 SELECT * INTO org FROM public.organizations WHERE id=p_organization_id;
 IF NOT public.has_organization_permission(p_organization_id,'settings.manage') OR org.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 IF coalesce((p_data->>'agreement_accepted')::boolean,false) IS NOT TRUE OR p_data->>'agreement_version' IS DISTINCT FROM (SELECT agreement_version FROM public.franky_card_settings)
 OR length(trim(coalesce(p_data->>'name',''))) NOT BETWEEN 2 AND 120 OR length(trim(coalesce(p_data->>'city',''))) NOT BETWEEN 2 AND 100 OR length(trim(coalesce(p_data->>'address',''))) NOT BETWEEN 3 AND 250
 OR length(trim(coalesce(p_data->>'category',''))) NOT BETWEEN 2 AND 60 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_data->>'timezone') THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF p_venue_id IS NULL THEN
 INSERT INTO public.franky_card_venues(organization_id,name,city,category,address,timezone,agreement_version,agreement_accepted_by,demo_cohort_id)
 VALUES(p_organization_id,trim(p_data->>'name'),trim(p_data->>'city'),trim(p_data->>'category'),trim(p_data->>'address'),p_data->>'timezone',p_data->>'agreement_version',u,org.demo_cohort_id) RETURNING * INTO v;
 ELSE
 PERFORM card_private.require_merchant(p_venue_id,'settings.manage');
 UPDATE public.franky_card_venues SET name=trim(p_data->>'name'),city=trim(p_data->>'city'),category=trim(p_data->>'category'),address=trim(p_data->>'address'),timezone=p_data->>'timezone',agreement_version=p_data->>'agreement_version',agreement_accepted_by=u,agreement_accepted_at=now(),status='pending'
 WHERE id=p_venue_id AND organization_id=p_organization_id RETURNING * INTO v;
 IF v.id IS NULL THEN RAISE EXCEPTION 'card_forbidden';END IF;END IF;
 INSERT INTO public.franky_card_audit(actor_id,action,target_id) VALUES(u,'venue_submitted',v.id);
 RETURN to_jsonb(v)-ARRAY['agreement_accepted_by','agreement_accepted_at','demo_cohort_id','created_at'];END$$;

CREATE FUNCTION public.save_franky_card_offer(p_venue_id uuid,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v public.franky_card_venues:=card_private.require_merchant(p_venue_id,'settings.manage');o public.franky_card_offers;keys text[];BEGIN
 PERFORM 1 FROM public.franky_card_venues WHERE id=p_venue_id FOR UPDATE;
 SELECT array_agg(DISTINCT x) INTO keys FROM jsonb_array_elements_text(p_data->'service_keys') x;
 IF length(trim(coalesce(p_data->>'title',''))) NOT BETWEEN 2 AND 140 OR length(coalesce(p_data->>'terms','')) NOT BETWEEN 5 AND 2000 OR coalesce(cardinality(keys),0) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(keys) k WHERE length(k) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 INSERT INTO public.franky_card_offers(venue_id,version,title,kind,percent,service_keys,minimum_cents,starts_at,ends_at,student_only,minimum_age,terms)
 VALUES(p_venue_id,coalesce((SELECT max(version)+1 FROM public.franky_card_offers WHERE venue_id=p_venue_id),1),trim(p_data->>'title'),p_data->>'kind',(p_data->>'percent')::int,keys,coalesce((p_data->>'minimum_cents')::int,0),coalesce((p_data->>'starts_at')::timestamptz,now()),(p_data->>'ends_at')::timestamptz,coalesce((p_data->>'student_only')::boolean,false),(p_data->>'minimum_age')::int,p_data->>'terms') RETURNING * INTO o;
 INSERT INTO public.franky_card_audit(actor_id,action,target_id) VALUES(auth.uid(),'offer_submitted',o.id);RETURN to_jsonb(o)-'created_at';END$$;

CREATE FUNCTION public.save_franky_card_program(p_venue_id uuid,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v public.franky_card_venues:=card_private.require_merchant(p_venue_id,'settings.manage');p public.franky_card_programs;keys text[];BEGIN
 PERFORM 1 FROM public.franky_card_venues WHERE id=p_venue_id FOR UPDATE;
 SELECT array_agg(DISTINCT x) INTO keys FROM jsonb_array_elements_text(p_data->'service_keys') x;
 IF length(trim(coalesce(p_data->>'title',''))) NOT BETWEEN 2 AND 140 OR length(coalesce(p_data->>'terms','')) NOT BETWEEN 5 AND 2000 OR coalesce(cardinality(keys),0) NOT BETWEEN 1 AND 100
 OR length(coalesce(p_data->>'reward_service_key','')) NOT BETWEEN 1 AND 80 OR length(coalesce(p_data->>'reward_label','')) NOT BETWEEN 2 AND 140 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 UPDATE public.franky_card_programs SET status='retired' WHERE venue_id=p_venue_id AND status='active';
 INSERT INTO public.franky_card_programs(venue_id,version,title,service_keys,required_stamps,reward_service_key,reward_label,reward_max_cents,terms)
 VALUES(p_venue_id,coalesce((SELECT max(version)+1 FROM public.franky_card_programs WHERE venue_id=p_venue_id),1),trim(p_data->>'title'),keys,(p_data->>'required_stamps')::int,p_data->>'reward_service_key',p_data->>'reward_label',(p_data->>'reward_max_cents')::int,p_data->>'terms') RETURNING * INTO p;
 INSERT INTO public.franky_card_audit(actor_id,action,target_id) VALUES(auth.uid(),'program_version_created',p.id);RETURN to_jsonb(p)-'created_at';END$$;

-- Quote one unit per line. Use the cheapest valid public/Card price, recording ONLY the incremental Card advantage.
CREATE FUNCTION card_private.quote(p_lines jsonb,p_kind text,p_offer public.franky_card_offers,p_program public.franky_card_programs) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$DECLARE line jsonb;result jsonb:='[]';g int;pub int;d int;fin int;eligible boolean;total int:=0;dis int:=0;saving int:=0;public_total int:=0;eligible_total int:=0;extra_cents int:=0;BEGIN
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF p_kind='discount' THEN SELECT coalesce(floor(sum((x->>'gross_cents')::bigint)*p_offer.percent/100)-sum((x->>'gross_cents')::bigint*p_offer.percent/100),0)::int INTO extra_cents FROM jsonb_array_elements(p_lines) x WHERE x->>'service_key'=ANY(p_offer.service_keys) OR '*'=ANY(p_offer.service_keys);END IF;
 FOR line IN SELECT x FROM jsonb_array_elements(p_lines) x ORDER BY CASE WHEN p_kind='discount' AND(x->>'service_key'=ANY(p_offer.service_keys) OR '*'=ANY(p_offer.service_keys)) THEN mod((x->>'gross_cents')::bigint*p_offer.percent,100) ELSE 0 END DESC,x->>'id' LOOP
 g:=(line->>'gross_cents')::int;pub:=(line->>'public_price_cents')::int;
 IF length(coalesce(line->>'id','')) NOT BETWEEN 1 AND 80 OR length(coalesce(line->>'label','')) NOT BETWEEN 1 AND 180 OR length(coalesce(line->>'service_key','')) NOT BETWEEN 1 AND 80 OR g IS NULL OR pub IS NULL OR g NOT BETWEEN 1 AND 1000000 OR pub NOT BETWEEN 0 AND g THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 eligible:=p_kind='discount' AND (line->>'service_key'=ANY(p_offer.service_keys) OR '*'=ANY(p_offer.service_keys));
 IF eligible THEN eligible_total:=eligible_total+g;END IF;
 d:=CASE WHEN eligible THEN (g::bigint*p_offer.percent/100)::int ELSE 0 END;
 IF eligible AND extra_cents>0 THEN d:=d+1;extra_cents:=extra_cents-1;END IF;
 fin:=least(pub,g-d);
 IF p_kind='reward' THEN
 IF jsonb_array_length(p_lines)<>1 OR line->>'service_key' IS DISTINCT FROM p_program.reward_service_key OR g>p_program.reward_max_cents THEN RAISE EXCEPTION 'card_reward_unavailable';END IF;fin:=0;
 END IF;
 result:=result||jsonb_build_array(jsonb_build_object('id',line->>'id','label',line->>'label','service_key',line->>'service_key','gross_cents',g,'public_price_cents',pub,'discount_cents',g-fin,'final_cents',fin,'incremental_savings_cents',CASE WHEN p_kind='discount' THEN pub-fin ELSE 0 END,'reversed',false));
 total:=total+g;dis:=dis+g-fin;public_total:=public_total+pub;saving:=saving+CASE WHEN p_kind='discount' THEN pub-fin ELSE 0 END;
 END LOOP;
 IF total>1000000 OR (p_kind='discount' AND (eligible_total=0 OR eligible_total<p_offer.minimum_cents)) THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;
 RETURN jsonb_build_object('lines',result,'money',jsonb_build_object('gross_cents',total,'public_price_cents',public_total,'discount_cents',dis,'final_cents',total-dis,'incremental_savings_cents',saving,'currency','eur'));END$$;

CREATE FUNCTION card_private.request_json(p_id uuid,p_viewer uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r public.franky_card_requests;v public.franky_card_venues;p public.franky_card_profiles;identity jsonb;actor text;BEGIN
 SELECT * INTO r FROM public.franky_card_requests WHERE id=p_id;SELECT * INTO v FROM public.franky_card_venues WHERE id=r.venue_id;
 IF r.id IS NULL OR r.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 IF r.user_id=p_viewer THEN actor:='customer';ELSIF public.has_organization_permission(v.organization_id,'attendees.manage') THEN actor:='merchant';ELSE RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=r.user_id;
 -- Consent covers this credential/profile version only. A later photo or revocation cannot inherit it.
 IF p.user_id IS NOT NULL AND (actor='customer' OR (
 r.customer_confirmed_at IS NOT NULL AND (r.status='customer_confirmed' AND r.expires_at>now() OR r.status='completed' AND r.expires_at+interval '3 minutes'>now())
 AND p.credential_version=r.credential_version AND p.demo_cohort_id IS NOT DISTINCT FROM r.demo_cohort_id
 AND v.status='active' AND v.demo_cohort_id IS NOT DISTINCT FROM r.demo_cohort_id
 AND EXISTS(SELECT 1 FROM public.organizations g WHERE g.id=v.organization_id AND g.status='active' AND g.demo_cohort_id IS NOT DISTINCT FROM r.demo_cohort_id)
 AND EXISTS(SELECT 1 FROM public.profiles holder JOIN auth.users account ON account.id=holder.id WHERE holder.id=r.user_id AND holder.is_discarded IS NOT TRUE AND holder.self_deleted IS NOT TRUE AND account.deleted_at IS NULL AND(account.banned_until IS NULL OR account.banned_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=r.user_id)
 AND EXISTS(SELECT 1 FROM public.organization_memberships membership JOIN public.profiles employee ON employee.id=membership.user_id WHERE membership.organization_id=v.organization_id AND membership.user_id=r.merchant_user_id AND membership.status='active' AND 'attendees.manage'=ANY(public.workspace_role_permissions(membership.role)) AND employee.is_discarded IS NOT TRUE AND employee.self_deleted IS NOT TRUE)
 )) THEN identity:=jsonb_build_object('full_name',p.full_name,'photo_path',p.photo_path);END IF;
 RETURN jsonb_build_object('id',r.id,'kind',r.kind,'status',CASE WHEN r.status IN('pending','customer_confirmed') AND r.expires_at<=now() THEN 'expired' ELSE r.status END,'venue_id',v.id,'venue_name',v.name,'organization_id',v.organization_id,'expires_at',r.expires_at,'created_at',r.created_at,'completed_at',r.completed_at,'lines',r.lines,'money',r.money,'offer',r.offer_snapshot,'program',r.program_snapshot,'customer_confirmed',r.customer_confirmed_at IS NOT NULL,'merchant_confirmed',r.merchant_confirmed_at IS NOT NULL,'actor',actor,'identity',identity,'consumption_id',(SELECT id FROM public.franky_card_consumptions WHERE request_id=r.id),'external_reference',r.external_reference,'booking_id',(SELECT booking_id FROM public.franky_card_booking_quotes WHERE id=r.protected_quote_id),'expected_external_reference',CASE WHEN r.kind='protected' THEN 'professional-booking:'||(SELECT booking_id::text FROM public.franky_card_booking_quotes WHERE id=r.protected_quote_id) ELSE NULL END,'demo',r.demo_cohort_id IS NOT NULL);END$$;

CREATE FUNCTION public.create_franky_card_request(p_venue_id uuid,p_token text,p_kind text,p_offer_id uuid,p_program_id uuid,p_lines jsonb,p_request_key uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v public.franky_card_venues:=card_private.require_merchant(p_venue_id);c public.franky_card_credentials;p public.franky_card_profiles;r public.franky_card_requests;o public.franky_card_offers;program public.franky_card_programs;quote jsonb;hash text;balance int;BEGIN
 IF p_request_key IS NULL OR p_kind NOT IN('discount','loyalty','reward') OR p_token IS NULL OR p_token!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 hash:=encode(extensions.digest(jsonb_build_object('venue',p_venue_id,'token',p_token,'kind',p_kind,'offer',p_offer_id,'program',p_program_id,'lines',p_lines)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_key::text,0));
 SELECT * INTO r FROM public.franky_card_requests WHERE merchant_user_id=auth.uid() AND request_key=p_request_key;
 IF r.id IS NOT NULL THEN IF r.payload_hash<>hash THEN RAISE EXCEPTION 'card_request_conflict';END IF;RETURN card_private.request_json(r.id,auth.uid());END IF;
 IF v.status<>'active' OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v.organization_id AND status='active') THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;
 SELECT * INTO c FROM public.franky_card_credentials WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now());
 IF c.id IS NULL THEN RAISE EXCEPTION 'card_credential_invalid';END IF;
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=c.user_id FOR UPDATE;
 IF p.user_id IS NULL OR p.credential_version<>c.credential_version OR p.demo_cohort_id IS DISTINCT FROM v.demo_cohort_id OR (c.user_id=auth.uid() AND v.demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'card_credential_invalid';END IF;
 IF (SELECT count(*) FROM public.franky_card_requests WHERE user_id=c.user_id AND status IN('pending','customer_confirmed') AND expires_at>now())>=3 THEN RAISE EXCEPTION 'card_request_conflict';END IF;
 IF p_kind='discount' THEN
 SELECT * INTO o FROM public.franky_card_offers WHERE id=p_offer_id AND venue_id=v.id AND status='active' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now());
 IF o.id IS NULL THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;PERFORM card_private.require_eligible(c.user_id,o);
 ELSIF p_offer_id IS NOT NULL THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF p_program_id IS NOT NULL THEN
 SELECT * INTO program FROM public.franky_card_programs WHERE id=p_program_id AND venue_id=v.id;
 SELECT coalesce(sum(delta),0) INTO balance FROM public.franky_card_loyalty_ledger WHERE user_id=c.user_id AND program_id=p_program_id;
 IF program.id IS NULL OR (program.status='retired' AND balance<=0) THEN RAISE EXCEPTION 'card_program_unavailable';END IF;
 IF p_kind='reward' AND balance<program.required_stamps THEN RAISE EXCEPTION 'card_reward_unavailable';END IF;
 ELSIF p_kind IN('loyalty','reward') THEN RAISE EXCEPTION 'card_program_unavailable';END IF;
 quote:=card_private.quote(p_lines,p_kind,o,program);
 INSERT INTO public.franky_card_requests(venue_id,user_id,merchant_user_id,kind,request_key,payload_hash,offer_id,program_id,credential_version,lines,money,offer_snapshot,program_snapshot,demo_cohort_id)
 VALUES(v.id,c.user_id,auth.uid(),p_kind,p_request_key,hash,o.id,program.id,p.credential_version,quote->'lines',quote->'money',CASE WHEN o.id IS NOT NULL THEN to_jsonb(o)-'created_at' END,CASE WHEN program.id IS NOT NULL THEN to_jsonb(program)-'created_at' END,v.demo_cohort_id) RETURNING * INTO r;
 RETURN card_private.request_json(r.id,auth.uid());END$$;

CREATE FUNCTION public.get_franky_card_request(p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN RETURN card_private.request_json(p_request_id,card_private.require_user());END$$;

CREATE FUNCTION public.respond_franky_card_request(p_request_id uuid,p_action text,p_external_reference text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();r public.franky_card_requests;v public.franky_card_venues;p public.franky_card_profiles;o public.franky_card_offers;program public.franky_card_programs;balance int;consumption uuid;is_customer boolean;BEGIN
 SELECT * INTO r FROM public.franky_card_requests WHERE id=p_request_id FOR UPDATE;SELECT * INTO v FROM public.franky_card_venues WHERE id=r.venue_id;
 IF r.id IS NULL OR r.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() OR p_action NOT IN('confirm','reject') THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 is_customer:=r.user_id=u AND NOT(r.demo_cohort_id IS NOT NULL AND r.user_id=r.merchant_user_id AND r.customer_confirmed_at IS NOT NULL AND p_external_reference IS NOT NULL);
 IF NOT is_customer AND (r.merchant_user_id<>u OR NOT public.has_organization_permission(v.organization_id,'attendees.manage')) THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 IF r.status IN('completed','rejected') THEN RETURN card_private.request_json(r.id,u);END IF;
 IF r.expires_at<=now() THEN RAISE EXCEPTION 'card_request_expired';END IF;
 IF p_action='reject' THEN UPDATE public.franky_card_requests SET status='rejected' WHERE id=r.id;RETURN card_private.request_json(r.id,u);END IF;
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=r.user_id FOR UPDATE;
 IF p.user_id IS NULL OR p.credential_version<>r.credential_version OR v.status<>'active' OR NOT public.has_organization_permission(v.organization_id,'attendees.manage') AND NOT is_customer THEN RAISE EXCEPTION 'card_credential_invalid';END IF;
 -- Check original employee membership even when the customer confirms after employee revocation.
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.organizations x ON x.id=m.organization_id JOIN public.profiles employee ON employee.id=m.user_id WHERE m.organization_id=v.organization_id AND m.user_id=r.merchant_user_id AND m.status='active' AND 'attendees.manage'=ANY(public.workspace_role_permissions(m.role)) AND x.status='active' AND employee.is_discarded IS NOT TRUE AND employee.self_deleted IS NOT TRUE) OR NOT EXISTS(SELECT 1 FROM public.profiles holder WHERE holder.id=r.user_id AND holder.is_discarded IS NOT TRUE AND holder.self_deleted IS NOT TRUE) THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 IF r.kind='discount' THEN SELECT * INTO o FROM public.franky_card_offers WHERE id=r.offer_id AND status='active' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now());IF o.id IS NULL THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;PERFORM card_private.require_eligible(r.user_id,o);END IF;
 IF is_customer THEN UPDATE public.franky_card_requests SET customer_confirmed_at=coalesce(customer_confirmed_at,now()),status='customer_confirmed' WHERE id=r.id;RETURN card_private.request_json(r.id,u);END IF;
 IF r.customer_confirmed_at IS NULL THEN RAISE EXCEPTION 'card_customer_confirmation_required';END IF;
 IF length(trim(coalesce(p_external_reference,''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF EXISTS(SELECT 1 FROM public.franky_card_consumptions WHERE venue_id=v.id AND external_reference=trim(p_external_reference)) THEN RAISE EXCEPTION 'card_receipt_duplicate';END IF;
 IF r.program_id IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(r.user_id::text||r.program_id::text,0));SELECT * INTO program FROM public.franky_card_programs WHERE id=r.program_id;
 SELECT coalesce(sum(delta),0) INTO balance FROM public.franky_card_loyalty_ledger WHERE user_id=r.user_id AND program_id=r.program_id;
 IF r.kind='reward' AND balance<program.required_stamps THEN RAISE EXCEPTION 'card_reward_unavailable';END IF;
 END IF;
 INSERT INTO public.franky_card_consumptions(request_id,venue_id,user_id,merchant_user_id,kind,lines,money,external_reference,program_id,demo_cohort_id)
 VALUES(r.id,v.id,r.user_id,u,r.kind,r.lines,r.money,trim(p_external_reference),r.program_id,r.demo_cohort_id) RETURNING id INTO consumption;
 IF r.kind='reward' THEN INSERT INTO public.franky_card_loyalty_ledger(user_id,program_id,consumption_id,delta,kind) VALUES(r.user_id,r.program_id,consumption,-program.required_stamps,'reward');
 ELSIF r.program_id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.lines) l WHERE (l->>'final_cents')::int>0 AND (l->>'service_key'=ANY(program.service_keys) OR '*'=ANY(program.service_keys))) THEN
 INSERT INTO public.franky_card_loyalty_ledger(user_id,program_id,consumption_id,delta,kind) VALUES(r.user_id,r.program_id,consumption,1,'earned');END IF;
 UPDATE public.franky_card_requests SET status='completed',merchant_confirmed_at=now(),completed_at=now(),external_reference=trim(p_external_reference) WHERE id=r.id;
 RETURN card_private.request_json(r.id,u);END$$;

CREATE FUNCTION public.reverse_franky_card_consumption(p_consumption_id uuid,p_line_ids text[],p_reason text,p_request_key uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c public.franky_card_consumptions;v public.franky_card_venues;a public.franky_card_adjustments;refund int;savings int;delta int:=0;program public.franky_card_programs;BEGIN
 PERFORM card_private.require_user();SELECT * INTO c FROM public.franky_card_consumptions WHERE id=p_consumption_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'card_forbidden';END IF;v:=card_private.require_merchant(c.venue_id,'finance.manage');
 IF p_request_key IS NULL OR cardinality(p_line_ids) NOT BETWEEN 1 AND 50 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 OR cardinality(p_line_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_line_ids) x) THEN RAISE EXCEPTION 'card_reversal_invalid';END IF;
 SELECT * INTO a FROM public.franky_card_adjustments WHERE request_key=p_request_key;
 IF a.id IS NOT NULL THEN
 IF a.consumption_id<>c.id OR a.line_ids<>p_line_ids OR a.reason<>trim(p_reason) THEN RAISE EXCEPTION 'card_request_conflict';END IF;
 RETURN jsonb_build_object('adjustment_id',a.id,'refund_cents',a.refund_cents,'reversed_savings_cents',a.reversed_savings_cents,'stamps_adjusted',a.stamps_adjusted,'idempotent',true);END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(c.lines) l WHERE l->>'id'=ANY(p_line_ids))<>cardinality(p_line_ids) OR EXISTS(SELECT 1 FROM public.franky_card_adjustments WHERE consumption_id=c.id AND line_ids&&p_line_ids) THEN RAISE EXCEPTION 'card_reversal_invalid';END IF;
 SELECT coalesce(sum((l->>'final_cents')::int),0),coalesce(sum((l->>'incremental_savings_cents')::int),0) INTO refund,savings FROM jsonb_array_elements(c.lines) l WHERE l->>'id'=ANY(p_line_ids);
 SELECT * INTO program FROM public.franky_card_programs WHERE id=c.program_id;
 IF program.id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(c.user_id::text||c.program_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.franky_card_loyalty_ledger WHERE consumption_id=c.id AND kind='reversal') THEN
 IF c.kind='reward' THEN delta:=program.required_stamps;
 ELSIF EXISTS(SELECT 1 FROM public.franky_card_loyalty_ledger WHERE consumption_id=c.id AND kind='earned') AND NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(c.lines) l WHERE (l->>'final_cents')::int>0 AND (l->>'service_key'=ANY(program.service_keys) OR '*'=ANY(program.service_keys))
 AND NOT(l->>'id'=ANY(p_line_ids)) AND NOT EXISTS(SELECT 1 FROM public.franky_card_adjustments x WHERE x.consumption_id=c.id AND l->>'id'=ANY(x.line_ids))) THEN delta:=-1;END IF;END IF;END IF;
 INSERT INTO public.franky_card_adjustments(consumption_id,request_key,line_ids,refund_cents,reversed_savings_cents,stamps_adjusted,reason,actor_id) VALUES(c.id,p_request_key,p_line_ids,refund,savings,delta,trim(p_reason),auth.uid()) RETURNING * INTO a;
 IF delta<>0 THEN INSERT INTO public.franky_card_loyalty_ledger(user_id,program_id,consumption_id,adjustment_id,delta,kind) VALUES(c.user_id,c.program_id,c.id,a.id,delta,'reversal');END IF;
 RETURN jsonb_build_object('adjustment_id',a.id,'refund_cents',refund,'reversed_savings_cents',savings,'stamps_adjusted',delta,'idempotent',false);END$$;

CREATE FUNCTION public.list_franky_card_offers(p_city text DEFAULT NULL,p_cursor uuid DEFAULT NULL,p_limit int DEFAULT 30,p_organization_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE items jsonb;last_id uuid;BEGIN
 IF NOT(SELECT enabled FROM public.franky_card_settings) AND public.current_demo_cohort() IS NULL AND NOT public.is_admin() THEN RETURN jsonb_build_object('items','[]'::jsonb,'next_cursor',NULL);END IF;
 IF auth.uid() IS NOT NULL THEN PERFORM public.require_account_session();END IF;
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 WITH eligible AS(SELECT o.*,v.name venue_name,v.city,g.name organization_name,g.id organization_id FROM public.franky_card_offers o JOIN public.franky_card_venues v ON v.id=o.venue_id JOIN public.organizations g ON g.id=v.organization_id LEFT JOIN public.franky_card_profiles p ON p.user_id=auth.uid()
 WHERE v.status='active' AND g.status='active' AND v.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND o.status='active' AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())
 AND (p_city IS NULL OR lower(v.city)=lower(trim(p_city))) AND (p_cursor IS NULL OR o.id>p_cursor) AND(p_organization_id IS NULL OR g.id=p_organization_id)
 AND (NOT o.student_only OR p.student_verified_until>now()) AND (o.minimum_age IS NULL OR p.age_verified_until>now() AND p.verified_age>=o.minimum_age)
 ORDER BY o.id LIMIT p_limit+1),page AS(SELECT * FROM eligible ORDER BY id LIMIT p_limit)
 SELECT coalesce(jsonb_agg(to_jsonb(page)-'created_at' ORDER BY id),'[]'::jsonb),CASE WHEN (SELECT count(*) FROM eligible)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) END INTO items,last_id FROM page;
 RETURN jsonb_build_object('items',items,'next_cursor',last_id);END$$;

CREATE FUNCTION public.get_franky_card_history(p_organization_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL,p_limit int DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();items jsonb;last_id uuid;BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF p_organization_id IS NOT NULL AND NOT public.has_organization_permission(p_organization_id,'finance.read') THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT c.* ,v.name venue_name FROM public.franky_card_consumptions c JOIN public.franky_card_venues v ON v.id=c.venue_id WHERE c.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND ((p_organization_id IS NULL AND c.user_id=u) OR (p_organization_id IS NOT NULL AND v.organization_id=p_organization_id)) AND (p_cursor IS NULL OR c.id<p_cursor) ORDER BY c.id DESC LIMIT p_limit+1),page AS(SELECT * FROM eligible ORDER BY id DESC LIMIT p_limit)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'request_id',c.request_id,'venue_id',c.venue_id,'venue_name',c.venue_name,'kind',c.kind,'created_at',c.created_at,'lines',(SELECT jsonb_agg(l||jsonb_build_object('reversed',EXISTS(SELECT 1 FROM public.franky_card_adjustments a WHERE a.consumption_id=c.id AND l->>'id'=ANY(a.line_ids)))) FROM jsonb_array_elements(c.lines) l),'money',c.money,'reversed_savings_cents',(SELECT coalesce(sum(reversed_savings_cents),0) FROM public.franky_card_adjustments WHERE consumption_id=c.id),'source','merchant_declared','external_reference',c.external_reference) ORDER BY c.id DESC),'[]'::jsonb),CASE WHEN (SELECT count(*) FROM eligible)>p_limit THEN (SELECT id FROM page ORDER BY id LIMIT 1) END INTO items,last_id FROM page c;
 RETURN jsonb_build_object('items',items,'next_cursor',last_id);END$$;

CREATE FUNCTION public.get_franky_card() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();p public.franky_card_profiles;m public.franky_card_memberships;s public.franky_card_settings;pending jsonb;loyalty jsonb;recorded bigint;fees bigint;checkout_quote jsonb;BEGIN
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=u;SELECT * INTO m FROM public.franky_card_memberships WHERE user_id=u;SELECT * INTO s FROM public.franky_card_settings;
 SELECT coalesce(jsonb_agg(card_private.request_json(id,u) ORDER BY created_at DESC),'[]'::jsonb) INTO pending FROM public.franky_card_requests WHERE user_id=u AND status IN('pending','customer_confirmed') AND expires_at>now();
 SELECT coalesce(jsonb_agg(jsonb_build_object('program',to_jsonb(prog)-'created_at','stamps',b.stamps,'available_rewards',greatest(0,b.stamps/prog.required_stamps),'progress',greatest(0,b.stamps)%prog.required_stamps)),'[]'::jsonb) INTO loyalty
 FROM(SELECT program_id,sum(delta)::int stamps FROM public.franky_card_loyalty_ledger WHERE user_id=u GROUP BY program_id) b JOIN public.franky_card_programs prog ON prog.id=b.program_id;
 SELECT coalesce(sum((money->>'incremental_savings_cents')::int),0)-(SELECT coalesce(sum(a.reversed_savings_cents),0) FROM public.franky_card_adjustments a JOIN public.franky_card_consumptions c ON c.id=a.consumption_id WHERE c.user_id=u) INTO recorded FROM public.franky_card_consumptions WHERE user_id=u;
 SELECT coalesce(sum(amount_cents-refunded_cents),0) INTO fees FROM public.franky_card_orders WHERE user_id=u AND status IN('paid','refunded','review','disputed');
 IF public.current_demo_cohort() IS NULL AND NOT coalesce(m.suspended,false) AND NOT card_private.has_open_dispute(u) AND coalesce(m.ends_at,now())<=now()+interval '30 days' THEN
 SELECT jsonb_build_object('amount_cents',amount_cents,'price_version',price_version) INTO checkout_quote FROM public.franky_card_orders WHERE user_id=u AND status IN('created','checkout','pending');
 IF checkout_quote IS NULL THEN checkout_quote:=jsonb_build_object('amount_cents',CASE WHEN EXISTS(SELECT 1 FROM public.franky_card_orders WHERE user_id=u AND status IN('paid','refunded','disputed','review')) THEN s.annual_cents ELSE s.introductory_cents END,'price_version',s.price_version);END IF;END IF;
 RETURN jsonb_build_object('enabled',s.enabled OR public.current_demo_cohort() IS NOT NULL OR public.is_admin(),'demo',public.current_demo_cohort() IS NOT NULL,'profile',CASE WHEN p.user_id IS NOT NULL THEN to_jsonb(p)-ARRAY['user_id','credential_version','verified_age','age_verified_until','demo_cohort_id','updated_at'] END,
 'membership',jsonb_build_object('status',CASE WHEN m.suspended OR card_private.has_open_dispute(u) THEN 'suspended' WHEN card_private.active(u) THEN 'active' WHEN m.ends_at IS NOT NULL THEN 'expired' ELSE 'inactive' END,'starts_at',m.starts_at,'ends_at',m.ends_at,'renewal','manual','fee_paid_cents',fees),
 'pricing',jsonb_build_object('annual_cents',s.annual_cents,'introductory_cents',s.introductory_cents,'currency','eur','purchases_available',s.enabled AND s.purchases_enabled AND s.provider_ready,'checkout_quote',checkout_quote),
 'savings',jsonb_build_object('recorded_cents',recorded,'membership_cost_cents',fees,'balance_cents',recorded-fees,'source','merchant_declared'),'pending_requests',pending,'loyalty',loyalty);END$$;

CREATE FUNCTION public.get_franky_card_merchant(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();venues jsonb;pending jsonb;totals jsonb;can_finance boolean;BEGIN
 IF NOT public.has_organization_permission(p_organization_id,'attendees.manage') AND NOT public.has_organization_permission(p_organization_id,'settings.manage') AND NOT public.has_organization_permission(p_organization_id,'finance.read') THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 can_finance:=public.has_organization_permission(p_organization_id,'finance.read');
 SELECT coalesce(jsonb_agg((to_jsonb(v)-ARRAY['agreement_accepted_by','agreement_accepted_at','demo_cohort_id','created_at'])||jsonb_build_object('offers',(SELECT coalesce(jsonb_agg(to_jsonb(o)-'created_at' ORDER BY version DESC),'[]'::jsonb) FROM public.franky_card_offers o WHERE o.venue_id=v.id),'programs',(SELECT coalesce(jsonb_agg(to_jsonb(p)-'created_at' ORDER BY version DESC),'[]'::jsonb) FROM public.franky_card_programs p WHERE p.venue_id=v.id)) ORDER BY v.created_at),'[]'::jsonb) INTO venues FROM public.franky_card_venues v WHERE organization_id=p_organization_id AND demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort();
 IF public.has_organization_permission(p_organization_id,'attendees.manage') THEN
 SELECT coalesce(jsonb_agg(card_private.request_json(r.id,u) ORDER BY r.created_at DESC),'[]'::jsonb) INTO pending FROM public.franky_card_requests r JOIN public.franky_card_venues v ON v.id=r.venue_id WHERE v.organization_id=p_organization_id AND r.status IN('pending','customer_confirmed') AND r.expires_at>now();END IF;
 IF can_finance THEN SELECT jsonb_build_object('confirmed_consumptions',count(*),'gross_cents',coalesce(sum((money->>'gross_cents')::bigint),0),'discount_cents',coalesce(sum((money->>'discount_cents')::bigint),0),'reversed_savings_cents',(SELECT coalesce(sum(a.reversed_savings_cents),0) FROM public.franky_card_adjustments a JOIN public.franky_card_consumptions c2 ON c2.id=a.consumption_id JOIN public.franky_card_venues v2 ON v2.id=c2.venue_id WHERE v2.organization_id=p_organization_id)) INTO totals FROM public.franky_card_consumptions c JOIN public.franky_card_venues v ON v.id=c.venue_id WHERE v.organization_id=p_organization_id;END IF;
 RETURN jsonb_build_object('enabled',true,'demo',public.current_demo_cohort() IS NOT NULL,'organization_id',p_organization_id,'permissions',jsonb_build_object('manage',public.has_organization_permission(p_organization_id,'settings.manage'),'redeem',public.has_organization_permission(p_organization_id,'attendees.manage'),'finance',can_finance,'reverse',public.has_organization_permission(p_organization_id,'finance.manage')),'venues',venues,'pending_requests',coalesce(pending,'[]'::jsonb),'totals',totals);END$$;

CREATE FUNCTION card_private.network_ready(p_city text,p_user uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH usable AS(SELECT v.id,v.category,max(o.percent) best FROM public.franky_card_venues v JOIN public.organizations g ON g.id=v.organization_id JOIN public.franky_card_offers o ON o.venue_id=v.id LEFT JOIN public.franky_card_profiles p ON p.user_id=p_user
 WHERE v.demo_cohort_id IS NULL AND v.status='active' AND g.status='active' AND lower(v.city)=lower(trim(p_city)) AND o.status='active' AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())
 AND (NOT o.student_only OR p.student_verified_until>now()) AND (o.minimum_age IS NULL OR p.age_verified_until>now() AND p.verified_age>=o.minimum_age)
 AND EXISTS(SELECT 1 FROM public.franky_card_offers base WHERE base.venue_id=v.id AND base.kind='base' AND base.status='active' AND base.starts_at<=now() AND(base.ends_at IS NULL OR base.ends_at>now())) GROUP BY v.id,v.category)
 SELECT count(*)>=15 AND count(DISTINCT category)>=4 AND count(*) FILTER(WHERE best>5)>=5 FROM usable$$;

CREATE FUNCTION public.admin_franky_card(p_action text,p_target_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v public.franky_card_venues;o public.franky_card_offers;result jsonb;limit_n int:=least(100,greatest(1,coalesce((p_data->>'limit')::int,30)));cursor_id uuid:=(p_data->>'cursor')::uuid;BEGIN
 PERFORM card_private.require_admin();
 IF p_action='overview' THEN
 RETURN jsonb_build_object('settings',public.get_franky_card_readiness(),
 'venues',(WITH rows AS(SELECT * FROM public.franky_card_venues WHERE demo_cohort_id IS NULL AND (cursor_id IS NULL OR id>cursor_id) ORDER BY id LIMIT limit_n+1),page AS(SELECT * FROM rows ORDER BY id LIMIT limit_n) SELECT jsonb_build_object('items',coalesce(jsonb_agg((to_jsonb(page)-ARRAY['agreement_accepted_by','agreement_accepted_at','demo_cohort_id'])||jsonb_build_object('offers','[]'::jsonb,'programs','[]'::jsonb) ORDER BY id),'[]'::jsonb),'next_cursor',CASE WHEN(SELECT count(*) FROM rows)>limit_n THEN(SELECT id FROM page ORDER BY id DESC LIMIT 1) END) FROM page),
 'offers',(WITH rows AS(SELECT offer_row.* FROM public.franky_card_offers offer_row JOIN public.franky_card_venues venue_row ON venue_row.id=offer_row.venue_id WHERE venue_row.demo_cohort_id IS NULL AND offer_row.status='pending' AND (cursor_id IS NULL OR offer_row.id>cursor_id) ORDER BY offer_row.id LIMIT limit_n+1),page AS(SELECT * FROM rows ORDER BY id LIMIT limit_n) SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page)-'created_at' ORDER BY id),'[]'::jsonb),'next_cursor',CASE WHEN(SELECT count(*) FROM rows)>limit_n THEN(SELECT id FROM page ORDER BY id DESC LIMIT 1) END) FROM page),
 'inconsistencies',(SELECT coalesce(jsonb_agg(jsonb_build_object('order_id',id,'status',status,'amount_cents',amount_cents,'created_at',created_at)),'[]'::jsonb) FROM(SELECT * FROM public.franky_card_orders WHERE status='review' ORDER BY created_at DESC LIMIT limit_n) x));
 ELSIF p_action='prepare_refund' THEN
 IF p_data->>'reason_code' IS NULL OR p_data->>'reason_code' NOT IN('customer_request','duplicate','service_issue') THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 SELECT jsonb_build_object('order_id',id,'payment_id',payment_id,'amount_cents',amount_cents,'refunded_cents',refunded_cents,'remaining_cents',amount_cents-refunded_cents,'environment',environment,'status',status) INTO result FROM public.franky_card_orders WHERE id=p_target_id AND status IN('paid','review','refunded') AND payment_id IS NOT NULL;
 IF result IS NULL THEN RAISE EXCEPTION 'card_refund_unavailable';END IF;
 ELSIF p_action='settings' THEN
 IF coalesce((p_data->>'purchases_enabled')::boolean,false) AND NOT(SELECT provider_ready AND environment='live' FROM public.franky_card_settings) THEN RAISE EXCEPTION 'card_checkout_unavailable';END IF;
 UPDATE public.franky_card_settings SET enabled=coalesce((p_data->>'enabled')::boolean,enabled),purchases_enabled=coalesce((p_data->>'purchases_enabled')::boolean,purchases_enabled),updated_at=now();
 ELSIF p_action='suspend_city' THEN
 IF length(trim(coalesce(p_data->>'city',''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 UPDATE public.franky_card_launch_cities SET active=false WHERE city=lower(trim(p_data->>'city'));
 ELSIF p_action='approve_city' THEN
 IF NOT card_private.network_ready(p_data->>'city') THEN RAISE EXCEPTION 'card_network_not_ready';END IF;
 INSERT INTO public.franky_card_launch_cities(city,approved_by) VALUES(lower(trim(p_data->>'city')),auth.uid()) ON CONFLICT(city) DO UPDATE SET active=true,approved_by=excluded.approved_by,approved_at=now();
 ELSIF p_action IN('approve_venue','suspend_venue') THEN
 SELECT * INTO v FROM public.franky_card_venues WHERE id=p_target_id FOR UPDATE;
 IF v.id IS NULL OR v.demo_cohort_id IS NOT NULL THEN RAISE EXCEPTION 'card_forbidden';END IF;
 IF p_action='approve_venue' AND (v.agreement_version<>(SELECT agreement_version FROM public.franky_card_settings) OR NOT EXISTS(SELECT 1 FROM public.franky_card_offers WHERE venue_id=v.id AND kind='base' AND status='active' AND starts_at<=now() AND(ends_at IS NULL OR ends_at>now()))) THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;
 UPDATE public.franky_card_venues SET status=CASE WHEN p_action='approve_venue' THEN 'active' ELSE 'suspended' END WHERE id=v.id;
 ELSIF p_action IN('approve_offer','retire_offer') THEN
 SELECT * INTO o FROM public.franky_card_offers WHERE id=p_target_id FOR UPDATE;SELECT * INTO v FROM public.franky_card_venues WHERE id=o.venue_id;
 IF o.id IS NULL OR v.demo_cohort_id IS NOT NULL THEN RAISE EXCEPTION 'card_forbidden';END IF;
 IF p_action='approve_offer' AND o.percent=100 AND coalesce((p_data->>'extraordinary_confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF o.kind='base' AND p_action='approve_offer' THEN UPDATE public.franky_card_offers SET status='retired' WHERE venue_id=o.venue_id AND kind='base' AND status='active';END IF;
 UPDATE public.franky_card_offers SET status=CASE WHEN p_action='approve_offer' THEN 'active' ELSE 'retired' END WHERE id=o.id;
 IF p_action='retire_offer' AND o.kind='base' THEN UPDATE public.franky_card_venues SET status='suspended' WHERE id=o.venue_id;END IF;
 ELSIF p_action IN('verify_student','verify_age') THEN
 IF coalesce(p_data->>'source','') NOT IN('institutional_email','document_review','trusted_integration') OR coalesce(p_data->>'reason_code','') NOT IN('evidence_checked','expired','corrected') OR p_data->>'until' IS NULL OR (p_data->>'until')::timestamptz NOT BETWEEN now() AND now()+interval '18 months' THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.franky_card_profiles WHERE user_id=p_target_id AND demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'card_forbidden';END IF;
 IF p_action='verify_student' THEN UPDATE public.franky_card_profiles SET student_verified_until=(p_data->>'until')::timestamptz WHERE user_id=p_target_id;
 ELSE IF p_data->>'age' IS NULL OR (p_data->>'age')::int NOT BETWEEN 16 AND 120 THEN RAISE EXCEPTION 'card_invalid_input';END IF;UPDATE public.franky_card_profiles SET verified_age=(p_data->>'age')::int,age_verified_until=(p_data->>'until')::timestamptz WHERE user_id=p_target_id;END IF;
 ELSIF p_action='suspend_membership' THEN
 UPDATE public.franky_card_memberships SET suspended=coalesce((p_data->>'suspended')::boolean,true),updated_at=now() WHERE user_id=p_target_id AND demo_cohort_id IS NULL;
 UPDATE public.franky_card_profiles SET credential_version=credential_version+1 WHERE user_id=p_target_id;
 ELSE RAISE EXCEPTION 'card_invalid_input';END IF;
 INSERT INTO public.franky_card_audit(actor_id,action,target_id,data) VALUES(auth.uid(),p_action,p_target_id,CASE WHEN p_action IN('verify_student','verify_age') THEN jsonb_build_object('source',p_data->>'source','reason_code',p_data->>'reason_code','until',p_data->>'until') ELSE p_data-ARRAY['reason','name','email'] END);
 RETURN coalesce(result,jsonb_build_object('ok',true,'settings',public.get_franky_card_readiness()));END$$;

CREATE FUNCTION card_private.checkout_json(p_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT jsonb_build_object('order_id',id,'status',status,'amount_cents',amount_cents,'currency',currency,'price_version',price_version,'environment',environment,'checkout_url',checkout_url,'payment_id',payment_id,'refunded_cents',refunded_cents) FROM public.franky_card_orders WHERE id=p_id$$;
CREATE FUNCTION public.get_franky_card_checkout(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid;BEGIN
 PERFORM public.require_account_session();u:=auth.uid();IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.franky_card_orders WHERE id=p_order_id AND user_id=u) THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;RETURN card_private.checkout_json(p_order_id);END$$;
CREATE FUNCTION public.service_configure_franky_card(p_config jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM card_private.require_service();IF p_config ?| ARRAY['enabled','purchases_enabled','annual_cents','introductory_cents'] THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 UPDATE public.franky_card_settings SET provider_ready=coalesce((p_config->>'provider_ready')::boolean,provider_ready),environment=coalesce(p_config->>'environment',environment),purchases_enabled=CASE WHEN (p_config->>'provider_ready')::boolean IS FALSE OR p_config->>'environment'='test' THEN false ELSE purchases_enabled END,updated_at=now();
 RETURN public.get_franky_card_readiness();END$$;

CREATE FUNCTION public.service_begin_franky_card_checkout(p_user_id uuid,p_request_key uuid,p_environment text,p_accepted_amount_cents int,p_accepted_price_version text,p_terms_version text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE s public.franky_card_settings;o public.franky_card_orders;p public.franky_card_profiles;city_name text;amount int;BEGIN
 PERFORM card_private.require_service();SELECT * INTO s FROM public.franky_card_settings;
 IF p_user_id IS NULL OR p_request_key IS NULL OR NOT(s.enabled AND s.purchases_enabled AND s.provider_ready) OR p_environment IS DISTINCT FROM s.environment THEN RAISE EXCEPTION 'card_checkout_unavailable';END IF;
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=p_user_id FOR UPDATE;
 IF p.user_id IS NULL OR p.photo_path IS NULL THEN RAISE EXCEPTION 'card_profile_required';END IF;
 IF p.demo_cohort_id IS NOT NULL THEN RAISE EXCEPTION 'card_demo_payment_forbidden';END IF;
 IF card_private.has_open_dispute(p_user_id) OR EXISTS(SELECT 1 FROM public.franky_card_memberships WHERE user_id=p_user_id AND suspended) THEN RAISE EXCEPTION 'card_already_active';END IF;
 SELECT city INTO city_name FROM public.profiles WHERE id=p_user_id AND is_discarded IS NOT TRUE AND self_deleted IS NOT TRUE;
 IF city_name IS NULL OR NOT EXISTS(SELECT 1 FROM public.franky_card_launch_cities WHERE city=lower(trim(city_name)) AND active) OR NOT card_private.network_ready(city_name,p_user_id) THEN RAISE EXCEPTION 'card_network_not_ready';END IF;
 SELECT * INTO o FROM public.franky_card_orders WHERE user_id=p_user_id AND request_key=p_request_key;
 IF o.id IS NOT NULL THEN
 IF p_accepted_amount_cents IS DISTINCT FROM o.amount_cents OR p_accepted_price_version IS DISTINCT FROM o.price_version OR p_terms_version IS DISTINCT FROM o.terms_version THEN RAISE EXCEPTION 'card_price_changed';END IF;RETURN card_private.checkout_json(o.id);END IF;
 SELECT * INTO o FROM public.franky_card_orders WHERE user_id=p_user_id AND status IN('created','checkout','pending');IF o.id IS NOT NULL THEN
 IF p_accepted_amount_cents IS DISTINCT FROM o.amount_cents OR p_accepted_price_version IS DISTINCT FROM o.price_version OR p_terms_version IS DISTINCT FROM o.terms_version THEN RAISE EXCEPTION 'card_price_changed';END IF;RETURN card_private.checkout_json(o.id);END IF;
 IF EXISTS(SELECT 1 FROM public.franky_card_memberships WHERE user_id=p_user_id AND (suspended OR ends_at>now()+interval '30 days')) THEN RAISE EXCEPTION 'card_already_active';END IF;
 amount:=CASE WHEN EXISTS(SELECT 1 FROM public.franky_card_orders WHERE user_id=p_user_id AND status IN('paid','refunded','disputed','review')) THEN s.annual_cents ELSE s.introductory_cents END;
 IF p_accepted_amount_cents IS DISTINCT FROM amount OR p_accepted_price_version IS DISTINCT FROM s.price_version OR p_terms_version IS DISTINCT FROM s.agreement_version THEN RAISE EXCEPTION 'card_price_changed';END IF;
 INSERT INTO public.franky_card_orders(user_id,request_key,amount_cents,price_version,terms_version,environment) VALUES(p_user_id,p_request_key,amount,s.price_version,p_terms_version,p_environment) RETURNING * INTO o;RETURN card_private.checkout_json(o.id);END$$;

CREATE FUNCTION public.service_attach_franky_card_checkout(p_order_id uuid,p_checkout_id text,p_checkout_url text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE o public.franky_card_orders;BEGIN
 PERFORM card_private.require_service();SELECT * INTO o FROM public.franky_card_orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR length(coalesce(p_checkout_id,'')) NOT BETWEEN 5 AND 200 OR p_checkout_url!~'^https://checkout\.stripe\.com/' THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF o.checkout_id IS NOT NULL THEN IF o.checkout_id<>p_checkout_id OR o.checkout_url<>p_checkout_url THEN RAISE EXCEPTION 'card_request_conflict';END IF;RETURN card_private.checkout_json(o.id);END IF;
 IF o.status<>'created' THEN RAISE EXCEPTION 'card_request_conflict';END IF;
 UPDATE public.franky_card_orders SET checkout_id=p_checkout_id,checkout_url=p_checkout_url,status='checkout' WHERE id=o.id;RETURN card_private.checkout_json(o.id);END$$;

CREATE FUNCTION public.service_expire_franky_card_checkout(p_order_id uuid,p_checkout_id text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE o public.franky_card_orders;BEGIN
 PERFORM card_private.require_service();SELECT * INTO o FROM public.franky_card_orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR o.checkout_id IS DISTINCT FROM p_checkout_id THEN RAISE EXCEPTION 'card_request_conflict';END IF;
 IF o.status IN('created','checkout','pending') THEN UPDATE public.franky_card_orders SET status='expired' WHERE id=o.id;END IF;RETURN card_private.checkout_json(o.id);END$$;

CREATE FUNCTION public.service_apply_franky_card_payment(p_event_id text,p_order_id uuid,p_provider text,p_environment text,p_payment_id text,p_action text,p_amount_cents int,p_currency text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE o public.franky_card_orders;m public.franky_card_memberships;e public.franky_card_payment_events;new_start timestamptz;new_end timestamptz;BEGIN
 PERFORM card_private.require_service();SELECT * INTO o FROM public.franky_card_orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR p_provider<>'stripe' OR p_environment IS DISTINCT FROM o.environment OR (p_action='partial_refund' AND(p_amount_cents IS NULL OR p_amount_cents NOT BETWEEN 1 AND o.amount_cents-1)) OR (p_action<>'partial_refund' AND p_amount_cents IS DISTINCT FROM o.amount_cents) OR p_currency IS DISTINCT FROM o.currency OR length(coalesce(p_event_id,'')) NOT BETWEEN 3 AND 240 OR length(coalesce(p_payment_id,'')) NOT BETWEEN 3 AND 240 OR p_action NOT IN('paid','refunded','partial_refund','disputed','dispute_won','failed') THEN RAISE EXCEPTION 'card_payment_mismatch';END IF;
 IF o.payment_id IS NOT NULL AND o.payment_id<>p_payment_id THEN RAISE EXCEPTION 'card_payment_mismatch';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o.user_id::text,731));SELECT * INTO e FROM public.franky_card_payment_events WHERE id=p_event_id;
 IF e.id IS NOT NULL THEN IF e.order_id<>o.id OR e.action<>p_action OR e.payment_id<>p_payment_id OR e.amount_cents<>p_amount_cents THEN RAISE EXCEPTION 'card_payment_mismatch';END IF;RETURN card_private.checkout_json(o.id)||jsonb_build_object('membership_ends_at',(SELECT ends_at FROM public.franky_card_memberships WHERE user_id=o.user_id));END IF;
 IF EXISTS(SELECT 1 FROM public.franky_card_profiles WHERE user_id=o.user_id AND demo_cohort_id IS NOT NULL) THEN RAISE EXCEPTION 'card_demo_payment_forbidden';END IF;
 SELECT * INTO m FROM public.franky_card_memberships WHERE user_id=o.user_id FOR UPDATE;
 -- A full refund is terminal for entitlement, even when dispute/payment events arrive later.
 -- Keep accepting and auditing verified events below without restoring a refunded period.
 IF o.status='refunded' OR o.refunded_cents=o.amount_cents THEN
 UPDATE public.franky_card_orders SET status='refunded',refunded_cents=amount_cents WHERE id=o.id;
 ELSIF p_action='paid' AND o.status NOT IN('paid','refunded','disputed','review') THEN
 IF m.suspended OR card_private.has_open_dispute(o.user_id) OR m.ends_at>now()+interval '30 days' THEN UPDATE public.franky_card_orders SET status='review',payment_id=p_payment_id,provider=p_provider WHERE id=o.id;
 ELSE
 new_start:=greatest(now(),coalesce(m.ends_at,now()));new_end:=new_start+interval '12 months';
 UPDATE public.franky_card_orders SET status='paid',payment_id=p_payment_id,provider=p_provider,period_start=new_start,period_end=new_end WHERE id=o.id;
 INSERT INTO public.franky_card_memberships(user_id,starts_at,ends_at) VALUES(o.user_id,new_start,new_end) ON CONFLICT(user_id) DO UPDATE SET starts_at=least(franky_card_memberships.starts_at,excluded.starts_at),ends_at=excluded.ends_at,updated_at=now();END IF;
 ELSIF p_action='partial_refund' THEN UPDATE public.franky_card_orders SET refunded_cents=greatest(refunded_cents,p_amount_cents),payment_id=p_payment_id,provider=p_provider WHERE id=o.id;
 ELSIF p_action IN('refunded','disputed') THEN
 UPDATE public.franky_card_orders SET status=p_action,payment_id=p_payment_id,provider=p_provider,refunded_cents=CASE WHEN p_action='refunded' THEN amount_cents ELSE refunded_cents END WHERE id=o.id;
 IF o.period_end IS NOT NULL AND m.ends_at=o.period_end THEN
 UPDATE public.franky_card_memberships SET ends_at=greatest(starts_at+interval '1 microsecond',coalesce((SELECT max(period_end) FROM public.franky_card_orders WHERE user_id=o.user_id AND status='paid' AND id<>o.id),least(now(),o.period_start))),updated_at=now() WHERE user_id=o.user_id;END IF;
 UPDATE public.franky_card_profiles SET credential_version=credential_version+1 WHERE user_id=o.user_id;
 ELSIF p_action='dispute_won' AND o.status='disputed' THEN
 IF o.period_end IS NOT NULL THEN
 UPDATE public.franky_card_orders SET status='paid' WHERE id=o.id;
 UPDATE public.franky_card_memberships SET ends_at=greatest(ends_at,o.period_end),updated_at=now() WHERE user_id=o.user_id;
 ELSE
 -- A dispute can arrive before checkout completion. Do not claim a paid period that was never granted.
 UPDATE public.franky_card_orders SET status='pending' WHERE id=o.id;
 IF EXISTS(SELECT 1 FROM public.franky_card_payment_events WHERE order_id=o.id AND action='paid') THEN
 IF m.suspended OR card_private.has_open_dispute(o.user_id) OR m.ends_at>now()+interval '30 days' THEN
 UPDATE public.franky_card_orders SET status='review' WHERE id=o.id;
 ELSE
 new_start:=greatest(now(),coalesce(m.ends_at,now()));new_end:=new_start+interval '12 months';
 UPDATE public.franky_card_orders SET status='paid',period_start=new_start,period_end=new_end WHERE id=o.id;
 INSERT INTO public.franky_card_memberships(user_id,starts_at,ends_at) VALUES(o.user_id,new_start,new_end) ON CONFLICT(user_id) DO UPDATE SET starts_at=least(franky_card_memberships.starts_at,excluded.starts_at),ends_at=excluded.ends_at,updated_at=now();
 END IF;END IF;END IF;
 ELSIF p_action='failed' AND o.status IN('created','checkout','pending','expired','failed') THEN UPDATE public.franky_card_orders SET status='failed',payment_id=p_payment_id,provider=p_provider WHERE id=o.id;END IF;
 INSERT INTO public.franky_card_payment_events(id,order_id,action,payment_id,amount_cents,environment,provider) VALUES(p_event_id,o.id,p_action,p_payment_id,p_amount_cents,p_environment,p_provider);
 RETURN card_private.checkout_json(o.id)||jsonb_build_object('membership_ends_at',(SELECT ends_at FROM public.franky_card_memberships WHERE user_id=o.user_id));END$$;

-- Demo grants require an already-server-provisioned demo identity. No route/client may create that classification.
CREATE FUNCTION public.service_seed_franky_card_demo(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE cohort uuid;org uuid;venue uuid;BEGIN
 PERFORM card_private.require_service();SELECT cohort_id INTO cohort FROM public.workspace_demo_accounts WHERE user_id=p_user_id;
 IF cohort IS NULL THEN RAISE EXCEPTION 'card_forbidden';END IF;
 INSERT INTO public.franky_card_profiles(user_id,full_name,demo_cohort_id) VALUES(p_user_id,'Titular de demostración',cohort) ON CONFLICT(user_id) DO NOTHING;
 INSERT INTO public.franky_card_memberships(user_id,starts_at,ends_at,demo_cohort_id) VALUES(p_user_id,now(),now()+interval '12 months',cohort) ON CONFLICT(user_id) DO NOTHING;
 SELECT o.id INTO org FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id WHERE o.demo_cohort_id=cohort AND m.user_id=p_user_id AND m.role='owner' AND m.status='active' AND o.status='active' ORDER BY o.created_at LIMIT 1;
 IF org IS NOT NULL THEN
 SELECT id INTO venue FROM public.franky_card_venues WHERE organization_id=org AND demo_cohort_id=cohort ORDER BY created_at LIMIT 1;
 IF venue IS NULL THEN
 INSERT INTO public.franky_card_venues(organization_id,name,city,category,address,status,agreement_version,agreement_accepted_by,demo_cohort_id) VALUES(org,'Comercio de demostración','Ciudad de demostración','peluqueria','Dirección ficticia','active',(SELECT agreement_version FROM public.franky_card_settings),p_user_id,cohort) RETURNING id INTO venue;
 INSERT INTO public.franky_card_offers(venue_id,version,title,kind,percent,service_keys,terms,status) VALUES(venue,1,'Corte · 10 % demo','base',10,ARRAY['cut'],'Simulación aislada. No existe una venta ni un comercio real.','active');
 INSERT INTO public.franky_card_programs(venue_id,version,title,service_keys,required_stamps,reward_service_key,reward_label,reward_max_cents,terms) VALUES(venue,1,'Cinco cortes y el sexto gratis · demo',ARRAY['cut'],5,'cut','Corte de demostración',2000,'Simulación de un sello por consumo pagado confirmado. Ningún derecho frente a un negocio real.');
 END IF;END IF;
 INSERT INTO public.franky_card_audit(action,target_id,data) VALUES('demo_membership_seeded',p_user_id,jsonb_build_object('demo',true));RETURN jsonb_build_object('ok',true,'demo',true,'venue_id',venue);END$$;

-- Erasure removes the private presentation and unfulfilled locators, but preserves minimal immutable economic evidence.
CREATE FUNCTION card_private.scrub_erasure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 DELETE FROM public.franky_card_credentials WHERE user_id=NEW.user_id;
 DELETE FROM public.franky_card_profiles WHERE user_id=NEW.user_id;
 UPDATE public.franky_card_memberships SET suspended=true,updated_at=now() WHERE user_id=NEW.user_id;
 UPDATE public.franky_card_requests SET status='rejected' WHERE user_id=NEW.user_id AND status IN('pending','customer_confirmed');
 RETURN NEW;END$$;
CREATE TRIGGER franky_card_private_erasure AFTER INSERT ON account_private.erasures FOR EACH ROW EXECUTE FUNCTION card_private.scrub_erasure();

-- Booking proof is optional only for external receipts; a claimed Franky booking must be real and completed by this holder at this organization.
CREATE FUNCTION card_private.check_booking_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE authorized boolean;booking uuid;org uuid;BEGIN
 IF NEW.external_reference LIKE 'professional-booking:%' THEN
 BEGIN booking:=substring(NEW.external_reference from 22)::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'card_invalid_input';END;
 IF to_regclass('public.professional_bookings') IS NULL THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 SELECT organization_id INTO org FROM public.franky_card_venues WHERE id=NEW.venue_id;
 IF org IS NULL THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 -- Serialize with professional_booking_action before reading attendance, including a waiting consumer.
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text,195));
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.professional_bookings b JOIN public.franky_card_venues v ON v.organization_id=b.organization_id WHERE b.id=$1 AND b.customer_user_id=$2 AND b.status=''attended'' AND b.attended_at IS NOT NULL AND v.id=$3)' INTO authorized USING booking,NEW.user_id,NEW.venue_id;
 IF NOT authorized THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 END IF;RETURN NEW;END$$;
CREATE TRIGGER franky_card_booking_proof BEFORE INSERT ON public.franky_card_consumptions FOR EACH ROW EXECUTE FUNCTION card_private.check_booking_reference();

-- Private images are never part of profiles/FOMO. Server-signed cashier access is granted only by request detail after consent.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('card-media','card-media',false,3145728,ARRAY['image/jpeg']),('card-wallet','card-wallet',false,1048576,ARRAY['application/vnd.apple.pkpass']) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.franky_card_storage_path_available(p_bucket text,p_path text) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT auth.uid() IS NOT NULL AND p_bucket='card-media' AND(storage.foldername(p_path))[1]=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.franky_card_storage_gc WHERE bucket=p_bucket AND path=p_path)$$;
CREATE POLICY card_media_own_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='card-media' AND (storage.foldername(name))[1]=auth.uid()::text AND public.account_session_usable());
CREATE POLICY card_media_own_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='card-media' AND (storage.foldername(name))[1]=auth.uid()::text AND public.account_session_usable() AND public.franky_card_storage_path_available(bucket_id,name));
CREATE POLICY card_media_own_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='card-media' AND (storage.foldername(name))[1]=auth.uid()::text AND public.account_session_usable());
-- Retain the existing demo storage fence while adding only each user's private Card photo bucket.
DO $$DECLARE p record;using_sql text;check_sql text;BEGIN
 FOR p IN SELECT pol.polname,pol.polcmd,pg_get_expr(pol.polqual,pol.polrelid) qual,pg_get_expr(pol.polwithcheck,pol.polrelid) chk FROM pg_policy pol WHERE pol.polrelid='storage.objects'::regclass AND pol.polname LIKE 'workspace_demo_storage_%' LOOP
 using_sql:=CASE WHEN p.qual IS NOT NULL THEN '('||p.qual||') OR (bucket_id=''card-media'' AND (storage.foldername(name))[1]=auth.uid()::text)' END;
 check_sql:=CASE WHEN p.chk IS NOT NULL THEN '('||p.chk||') OR (bucket_id=''card-media'' AND (storage.foldername(name))[1]=auth.uid()::text)' END;
 EXECUTE format('ALTER POLICY %I ON storage.objects %s %s',p.polname,CASE WHEN using_sql IS NOT NULL THEN 'USING ('||using_sql||')' ELSE '' END,CASE WHEN check_sql IS NOT NULL THEN 'WITH CHECK ('||check_sql||')' ELSE '' END);
 END LOOP;END$$;

-- Deny ambient grants: every callable RPC below is explicitly listed, including service-only payment authority.
CREATE TABLE public.franky_card_booking_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),
 service_id uuid NOT NULL,service_version int NOT NULL,party_size int NOT NULL CHECK(party_size=1),starts_at timestamptz NOT NULL,
 offer_id uuid NOT NULL REFERENCES public.franky_card_offers(id),offer_snapshot jsonb NOT NULL,lines jsonb NOT NULL,money jsonb NOT NULL,
 booking_id uuid UNIQUE,consumed_at timestamptz,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 protected_until timestamptz NOT NULL DEFAULT now()+interval '90 days',demo_cohort_id uuid,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.franky_card_booking_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.franky_card_booking_quotes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.franky_card_booking_quotes TO service_role;
ALTER TABLE public.franky_card_requests ADD COLUMN protected_quote_id uuid REFERENCES public.franky_card_booking_quotes(id);

CREATE FUNCTION public.card_quote_professional_booking(p_organization_id uuid,p_service_id uuid,p_party_size int,p_starts_at timestamptz,p_offer_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();s jsonb;o public.franky_card_offers;v public.franky_card_venues;quote jsonb;quote_id uuid;expiry timestamptz;BEGIN
 IF p_party_size IS DISTINCT FROM 1 OR p_starts_at IS NULL OR p_starts_at NOT BETWEEN now() AND now()+interval '90 days' OR to_regclass('public.professional_services') IS NULL THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 SELECT * INTO o FROM public.franky_card_offers WHERE id=p_offer_id AND status='active' AND starts_at<=now() AND(ends_at IS NULL OR ends_at>now());SELECT * INTO v FROM public.franky_card_venues WHERE id=o.venue_id AND organization_id=p_organization_id AND status='active';
 IF v.id IS NULL OR v.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;PERFORM card_private.require_eligible(u,o);
 EXECUTE 'SELECT to_jsonb(s) FROM public.professional_services s JOIN public.professional_settings cfg ON cfg.organization_id=s.organization_id JOIN public.organizations g ON g.id=s.organization_id WHERE s.id=$1 AND s.organization_id=$2 AND s.active AND cfg.public_booking AND(cfg.enabled OR g.demo_cohort_id IS NOT NULL) AND g.status=''active''' INTO s USING p_service_id,p_organization_id;
 IF s IS NULL OR (s->>'price_cents')::int<=0 OR coalesce((s->>'deposit_cents')::int,0)>0 THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 quote:=card_private.quote(jsonb_build_array(jsonb_build_object('id','booking-service','label',s->>'name','service_key',p_service_id::text,'gross_cents',(s->>'price_cents')::int,'public_price_cents',(s->>'price_cents')::int)),'discount',o,NULL);
 INSERT INTO public.franky_card_booking_quotes(user_id,organization_id,service_id,service_version,party_size,starts_at,offer_id,offer_snapshot,lines,money,demo_cohort_id)
 VALUES(u,p_organization_id,p_service_id,(s->>'version')::int,p_party_size,p_starts_at,o.id,to_jsonb(o)-'created_at',quote->'lines',quote->'money',v.demo_cohort_id) RETURNING franky_card_booking_quotes.id,expires_at INTO quote_id,expiry;
 RETURN jsonb_build_object('id',quote_id,'ordinary_cents',quote->'money'->'gross_cents','final_cents',quote->'money'->'final_cents','discount_cents',quote->'money'->'discount_cents','incremental_savings_cents',quote->'money'->'incremental_savings_cents','expires_at',expiry,'offer',to_jsonb(o)-'created_at','lines',quote->'lines');END$$;

CREATE FUNCTION card_private.consume_professional_quote(p_quote_id uuid,p_booking_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();q public.franky_card_booking_quotes;b jsonb;s jsonb;o public.franky_card_offers;v public.franky_card_venues;g public.organizations;BEGIN
 SELECT * INTO q FROM public.franky_card_booking_quotes WHERE id=p_quote_id FOR UPDATE;
 IF q.id IS NULL OR q.user_id<>u OR q.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() OR q.expires_at<=now() OR q.booking_id IS NOT NULL THEN RAISE EXCEPTION 'card_quote_invalid';END IF;
 EXECUTE 'SELECT to_jsonb(b) FROM public.professional_bookings b WHERE id=$1' INTO b USING p_booking_id;
 EXECUTE 'SELECT to_jsonb(s) FROM public.professional_services s WHERE id=$1' INTO s USING q.service_id;
 IF b IS NULL OR s IS NULL OR b->>'customer_user_id' IS DISTINCT FROM u::text OR b->>'organization_id' IS DISTINCT FROM q.organization_id::text OR b->>'service_id' IS DISTINCT FROM q.service_id::text OR (b->>'party_size')::int IS DISTINCT FROM q.party_size OR (b->>'starts_at')::timestamptz IS DISTINCT FROM q.starts_at OR b->>'status' NOT IN('requested','confirmed') OR (b->>'total_cents')::int IS DISTINCT FROM(q.money->>'gross_cents')::int OR(s->>'version')::int IS DISTINCT FROM q.service_version OR (s->>'price_cents')::int IS DISTINCT FROM(q.money->>'gross_cents')::int THEN RAISE EXCEPTION 'card_quote_invalid';END IF;
 -- Match administrator offer -> venue lock order. A suspension must serialize with new commitments.
 SELECT * INTO o FROM public.franky_card_offers WHERE id=q.offer_id AND status='active' AND starts_at<=now() AND(ends_at IS NULL OR ends_at>now()) FOR SHARE;
 SELECT * INTO v FROM public.franky_card_venues WHERE id=o.venue_id FOR SHARE;
 SELECT * INTO g FROM public.organizations WHERE id=q.organization_id FOR SHARE;
 IF o.id IS NULL OR v.id IS NULL OR v.status<>'active' OR v.organization_id IS DISTINCT FROM q.organization_id OR v.demo_cohort_id IS DISTINCT FROM q.demo_cohort_id OR g.id IS NULL OR g.status<>'active' OR g.demo_cohort_id IS DISTINCT FROM q.demo_cohort_id THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;
 PERFORM card_private.require_eligible(u,o);
 UPDATE public.franky_card_booking_quotes SET booking_id=p_booking_id,consumed_at=now() WHERE id=q.id;
 RETURN jsonb_build_object('quote_id',q.id,'final_cents',q.money->'final_cents','discount_cents',q.money->'discount_cents','incremental_savings_cents',q.money->'incremental_savings_cents','protected_until',q.protected_until);END$$;

CREATE FUNCTION public.create_franky_card_booking_request(p_booking_id uuid,p_token text,p_request_key uuid,p_program_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE u uuid:=card_private.require_user();q public.franky_card_booking_quotes;v public.franky_card_venues;c public.franky_card_credentials;p public.franky_card_profiles;program public.franky_card_programs;r public.franky_card_requests;b jsonb;fingerprint text;BEGIN
 SELECT * INTO q FROM public.franky_card_booking_quotes WHERE booking_id=p_booking_id;
 IF q.id IS NULL OR q.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 SELECT * INTO v FROM public.franky_card_venues WHERE id=(q.offer_snapshot->>'venue_id')::uuid;PERFORM card_private.require_merchant(v.id);
 IF p_request_key IS NULL OR p_token IS NULL OR p_token!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('booking',p_booking_id,'token',p_token,'program',p_program_id)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_request_key::text,0));SELECT * INTO r FROM public.franky_card_requests WHERE merchant_user_id=u AND request_key=p_request_key;
 IF r.id IS NOT NULL THEN IF r.payload_hash<>fingerprint THEN RAISE EXCEPTION 'card_request_conflict';END IF;RETURN card_private.request_json(r.id,u);END IF;
 EXECUTE 'SELECT to_jsonb(b) FROM public.professional_bookings b WHERE id=$1' INTO b USING p_booking_id;
 IF b IS NULL OR b->>'status'<>'attended' OR b->>'customer_user_id' IS DISTINCT FROM q.user_id::text OR b->>'service_id' IS DISTINCT FROM q.service_id::text OR (b->>'starts_at')::timestamptz>q.protected_until OR (b->>'total_cents')::int IS DISTINCT FROM(q.money->>'final_cents')::int THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 SELECT * INTO c FROM public.franky_card_credentials WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND user_id=q.user_id AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>now());
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=q.user_id FOR UPDATE;
 IF c.id IS NULL OR p.credential_version IS DISTINCT FROM c.credential_version OR p.demo_cohort_id IS DISTINCT FROM q.demo_cohort_id OR(u=q.user_id AND q.demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'card_credential_invalid';END IF;
 IF (SELECT count(*) FROM public.franky_card_requests WHERE user_id=q.user_id AND status IN('pending','customer_confirmed') AND expires_at>now())>=3 THEN RAISE EXCEPTION 'card_request_conflict';END IF;
 IF p_program_id IS NOT NULL THEN SELECT * INTO program FROM public.franky_card_programs WHERE id=p_program_id AND venue_id=v.id AND(status='active' OR EXISTS(SELECT 1 FROM public.franky_card_loyalty_ledger WHERE user_id=q.user_id AND program_id=p_program_id GROUP BY program_id HAVING sum(delta)>0));IF program.id IS NULL THEN RAISE EXCEPTION 'card_program_unavailable';END IF;END IF;
 INSERT INTO public.franky_card_requests(venue_id,user_id,merchant_user_id,kind,request_key,payload_hash,offer_id,program_id,credential_version,lines,money,offer_snapshot,program_snapshot,demo_cohort_id,protected_quote_id)
 VALUES(v.id,q.user_id,u,'protected',p_request_key,fingerprint,q.offer_id,program.id,p.credential_version,q.lines,q.money,q.offer_snapshot,CASE WHEN program.id IS NOT NULL THEN to_jsonb(program)-'created_at' END,q.demo_cohort_id,q.id) RETURNING * INTO r;
 RETURN card_private.request_json(r.id,u);END$$;

CREATE FUNCTION card_private.guard_protected_consumption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE q public.franky_card_booking_quotes;r public.franky_card_requests;b jsonb;p public.franky_card_profiles;BEGIN
 IF NEW.kind<>'protected' THEN RETURN NEW;END IF;
 SELECT * INTO r FROM public.franky_card_requests WHERE id=NEW.request_id;SELECT * INTO q FROM public.franky_card_booking_quotes WHERE id=r.protected_quote_id;
 IF q.booking_id IS NULL OR NEW.external_reference IS DISTINCT FROM 'professional-booking:'||q.booking_id::text THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(q.organization_id::text,195));
 EXECUTE 'SELECT to_jsonb(b) FROM public.professional_bookings b WHERE id=$1' INTO b USING q.booking_id;
 IF b->>'status' IS DISTINCT FROM 'attended' OR b->>'customer_user_id' IS DISTINCT FROM q.user_id::text OR b->>'organization_id' IS DISTINCT FROM q.organization_id::text OR b->>'service_id' IS DISTINCT FROM q.service_id::text OR (b->>'party_size')::int IS DISTINCT FROM q.party_size OR (b->>'total_cents')::int IS DISTINCT FROM(q.money->>'final_cents')::int OR(b->>'starts_at')::timestamptz>q.protected_until THEN RAISE EXCEPTION 'card_booking_unavailable';END IF;
 SELECT * INTO p FROM public.franky_card_profiles WHERE user_id=q.user_id;
 IF coalesce((q.offer_snapshot->>'student_only')::boolean,false) AND coalesce(p.student_verified_until<=now(),true) OR q.offer_snapshot->>'minimum_age' IS NOT NULL AND(coalesce(p.age_verified_until<=now(),true) OR coalesce(p.verified_age,0)<(q.offer_snapshot->>'minimum_age')::int) THEN RAISE EXCEPTION 'card_offer_unavailable';END IF;
 RETURN NEW;END$$;
CREATE TRIGGER franky_card_protected_booking BEFORE INSERT ON public.franky_card_consumptions FOR EACH ROW EXECUTE FUNCTION card_private.guard_protected_consumption();

CREATE FUNCTION public.service_cleanup_franky_card(p_limit int DEFAULT 200) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE requests_n int;credentials_n int;quotes_n int;files jsonb;BEGIN
 PERFORM card_private.require_service();IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 WITH stale AS(SELECT id FROM public.franky_card_requests r WHERE expires_at<now()-interval '7 days' AND status<>'completed' AND NOT EXISTS(SELECT 1 FROM public.franky_card_consumptions c WHERE c.request_id=r.id) ORDER BY expires_at LIMIT p_limit)
 DELETE FROM public.franky_card_requests WHERE id IN(SELECT id FROM stale);GET DIAGNOSTICS requests_n=ROW_COUNT;
 WITH stale AS(SELECT id FROM public.franky_card_credentials WHERE coalesce(revoked_at,expires_at)<now()-interval '7 days' ORDER BY created_at LIMIT p_limit)
 DELETE FROM public.franky_card_credentials WHERE id IN(SELECT id FROM stale);GET DIAGNOSTICS credentials_n=ROW_COUNT;
 WITH stale AS(SELECT id FROM public.franky_card_booking_quotes WHERE booking_id IS NULL AND expires_at<now()-interval '7 days' ORDER BY expires_at LIMIT p_limit)
 DELETE FROM public.franky_card_booking_quotes WHERE id IN(SELECT id FROM stale);GET DIAGNOSTICS quotes_n=ROW_COUNT;
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)),'[]'::jsonb) INTO files FROM(
 SELECT o.bucket_id,o.name FROM storage.objects o WHERE(o.bucket_id='card-wallet' AND o.created_at<now()-interval '15 minutes')
 OR(o.bucket_id='card-media' AND NOT EXISTS(SELECT 1 FROM public.franky_card_profiles p WHERE p.photo_path=o.name) AND(o.created_at<now()-interval '24 hours' OR EXISTS(SELECT 1 FROM account_private.erasures e WHERE e.user_id::text=(storage.foldername(o.name))[1])))
 ORDER BY o.created_at LIMIT p_limit) x;
 RETURN jsonb_build_object('expired_requests_deleted',requests_n,'expired_credentials_deleted',credentials_n,'expired_quotes_deleted',quotes_n,'storage_candidates',files);END$$;

CREATE FUNCTION public.service_claim_franky_card_storage(p_bucket text,p_path text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v_holder uuid;claim uuid;eligible boolean;BEGIN
 PERFORM card_private.require_service();IF p_bucket NOT IN('card-media','card-wallet') OR p_path IS NULL OR length(p_path)>300 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 BEGIN v_holder:=((storage.foldername(p_path))[1])::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'card_invalid_input';END;
 IF v_holder IS NULL THEN RAISE EXCEPTION 'card_invalid_input';END IF;PERFORM pg_advisory_xact_lock(hashtextextended(v_holder::text,732));
 SELECT claim_id INTO claim FROM public.franky_card_storage_gc WHERE bucket=p_bucket AND path=p_path;
 IF claim IS NOT NULL THEN RETURN jsonb_build_object('claimed',true,'claim_id',claim);END IF;
 SELECT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path AND((p_bucket='card-wallet' AND o.created_at<now()-interval '15 minutes') OR(p_bucket='card-media' AND NOT EXISTS(SELECT 1 FROM public.franky_card_profiles WHERE photo_path=p_path) AND(o.created_at<now()-interval '24 hours' OR EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=v_holder))))) INTO eligible;
 IF NOT eligible THEN RETURN jsonb_build_object('claimed',false,'claim_id',NULL);END IF;
 INSERT INTO public.franky_card_storage_gc(bucket,path) VALUES(p_bucket,p_path) RETURNING claim_id INTO claim;
 RETURN jsonb_build_object('claimed',true,'claim_id',claim);END$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA card_private FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE '%franky_card%' OR p.proname='reverse_franky_card_consumption') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 IF f.proname LIKE 'service_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.signature);END IF;
 IF f.proname IN('get_franky_card_readiness','list_franky_card_offers') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon',f.signature);END IF;
END LOOP;END$$;
REVOKE ALL ON FUNCTION public.card_quote_professional_booking(uuid,uuid,int,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.card_quote_professional_booking(uuid,uuid,int,timestamptz,uuid) TO authenticated,service_role;
DO $$DECLARE d text;a text:='''/rpc/current_demo_cohort''';names text;BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'card_demo_gate_changed';END IF;
 SELECT string_agg(quote_literal('/rpc/'||p.proname),',') INTO names FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN('get_franky_card','save_franky_card_profile','list_franky_card_offers','issue_franky_card_credential','revoke_franky_card_credentials','get_franky_card_merchant','save_franky_card_venue','save_franky_card_offer','save_franky_card_program','create_franky_card_request','get_franky_card_request','respond_franky_card_request','get_franky_card_history','reverse_franky_card_consumption','get_franky_card_readiness','card_quote_professional_booking','create_franky_card_booking_request');
 EXECUTE replace(d,a,names||','||a);END$$;
