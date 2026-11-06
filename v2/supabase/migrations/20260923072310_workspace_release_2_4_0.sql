-- Franky 2.4.0: reviewed additive release, public rollout and new money flows OFF.
-- Original sources and hashes: supabase/releases/workspaces-2.4.0/manifest.json
-- All DDL/data changes are one PostgreSQL statement, including on an autocommit connection.
DO $franky_release_2_4$
BEGIN
PERFORM set_config('lock_timeout','10s',true);
PERFORM set_config('statement_timeout','120s',true);
-- SOURCE 20260922170854_workspace_growth_rewards.sql
EXECUTE $franky_component_1$
-- Growth is opt-in at launch. All monetary/points decisions run in transactions.
-- Private functions are not Data API endpoints; public RPCs recheck the actor.
CREATE SCHEMA IF NOT EXISTS growth_private;
REVOKE ALL ON SCHEMA growth_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.growth_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 cash_enabled boolean NOT NULL DEFAULT false, referral_points integer NOT NULL DEFAULT 100 CHECK(referral_points BETWEEN 0 AND 10000),
 activation_points integer NOT NULL DEFAULT 150 CHECK(activation_points BETWEEN 0 AND 10000),
 monthly_limit integer NOT NULL DEFAULT 20 CHECK(monthly_limit BETWEEN 0 AND 1000),
 review_days integer NOT NULL DEFAULT 7 CHECK(review_days >= 7), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.growth_settings(id) VALUES(true);
CREATE TABLE public.growth_promoters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
 code text NOT NULL UNIQUE DEFAULT ('f' || replace(gen_random_uuid()::text,'-','')),
 demo_cohort_id uuid, active boolean NOT NULL DEFAULT true, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE growth_private.touches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promoter_id uuid NOT NULL REFERENCES public.growth_promoters(id),
 campaign text, content text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE growth_private.touches ENABLE ROW LEVEL SECURITY;
CREATE TABLE growth_private.activity_days (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,day date NOT NULL DEFAULT current_date,
 PRIMARY KEY(user_id,day)
);
ALTER TABLE growth_private.activity_days ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.growth_referrals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
 promoter_id uuid NOT NULL REFERENCES public.growth_promoters(id), first_touch_id uuid REFERENCES growth_private.touches(id),
 last_touch_id uuid REFERENCES growth_private.touches(id), attribution_source text NOT NULL CHECK(attribution_source IN ('explicit','link','legacy')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','review')),
 created_at timestamptz NOT NULL DEFAULT now(), qualified_at timestamptz, activated_at timestamptz, locked_at timestamptz,
 reviewed_at timestamptz, review_reason text, rule_snapshot jsonb NOT NULL,
 demo_cohort_id uuid
);
CREATE INDEX growth_referrals_promoter ON public.growth_referrals(promoter_id, created_at);
CREATE TABLE public.growth_points_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 points integer NOT NULL CHECK(points <> 0), reason text NOT NULL, event_key text NOT NULL UNIQUE,
 referral_id uuid REFERENCES public.growth_referrals(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX growth_points_user ON public.growth_points_ledger(user_id,created_at DESC);
CREATE TABLE public.growth_rewards (
 key text PRIMARY KEY CHECK(key IN ('profile_palette','planning_pack','university_report')),
 title text NOT NULL, description text NOT NULL, points integer NOT NULL CHECK(points>0),
 available boolean NOT NULL DEFAULT true, stock integer CHECK(stock>=0)
);
INSERT INTO public.growth_rewards(key,title,description,points) VALUES
 ('profile_palette','Tu tarjeta Franky','Personaliza una tarjeta con tu nombre y colores, lista para compartir.',100),
 ('planning_pack','Planificador universitario','Descarga e imprime tu semana, presupuesto y plan de exámenes.',150),
 ('university_report','Comparador para decidir','Exporta un informe con las universidades que has guardado y sus fuentes.',250);
CREATE TABLE public.growth_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 reward_key text NOT NULL REFERENCES public.growth_rewards(key), points integer NOT NULL,
 request_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,request_key), UNIQUE(user_id,reward_key)
);
CREATE TABLE public.growth_creator_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
 mode text NOT NULL CHECK(mode IN ('ugc','affiliate','both')), channels text NOT NULL CHECK(length(channels) BETWEEN 3 AND 1000),
 proposal text NOT NULL CHECK(length(proposal) BETWEEN 20 AND 3000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paused')),
 review_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.growth_creator_content (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 140), url text NOT NULL CHECK(url ~ '^https://'),
 rights text NOT NULL CHECK(length(rights) BETWEEN 20 AND 3000),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected')),
 review_note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.growth_commission_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 3 AND 140),
 total_cents bigint NOT NULL CHECK(total_cents>=0), reserved_cents bigint NOT NULL DEFAULT 0 CHECK(reserved_cents>=0 AND reserved_cents<=total_cents),
 currency text NOT NULL DEFAULT 'eur' CHECK(currency='eur'), active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.growth_commissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 budget_id uuid NOT NULL REFERENCES public.growth_commission_budgets(id), content_id uuid UNIQUE REFERENCES public.growth_creator_content(id),
 referral_id uuid REFERENCES public.growth_referrals(id), event_key text NOT NULL UNIQUE,
 CHECK ((content_id IS NOT NULL)::integer+(referral_id IS NOT NULL)::integer=1),
 amount_cents bigint NOT NULL CHECK(amount_cents>0), currency text NOT NULL DEFAULT 'eur',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','available','paid','reverted')),
 terms_snapshot jsonb NOT NULL, receipt_reference text, recovery_required boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.growth_affiliate_tariffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),budget_id uuid NOT NULL REFERENCES public.growth_commission_budgets(id),
 stage text NOT NULL CHECK(stage IN ('qualified','activated')),version integer NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 terms text NOT NULL CHECK(length(terms) BETWEEN 20 AND 3000),starts_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES public.profiles(id),
 UNIQUE(user_id,stage,version)
);
CREATE TABLE public.growth_acquisition_costs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_key uuid NOT NULL UNIQUE,title text NOT NULL CHECK(length(title) BETWEEN 3 AND 140),
 category text NOT NULL CHECK(category IN('production','ads','tooling','other')),amount_cents bigint NOT NULL CHECK(amount_cents>0),
 occurred_on date NOT NULL,created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE growth_private.payout_review (
 event_key text PRIMARY KEY,referral_id uuid NOT NULL REFERENCES public.growth_referrals(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE growth_private.payout_review ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.growth_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 action text NOT NULL, target_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['growth_settings','growth_promoters','growth_referrals','growth_points_ledger','growth_rewards','growth_redemptions','growth_creator_applications','growth_creator_content','growth_commission_budgets','growth_commissions','growth_affiliate_tariffs','growth_acquisition_costs','growth_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY growth_admin_read ON public.%I FOR SELECT TO authenticated USING (public.is_admin() AND coalesce(auth.jwt()->>''aal'','''')=''aal2'')',t);
 END LOOP;
END $$;
CREATE POLICY growth_settings_read ON public.growth_settings FOR SELECT TO authenticated USING(true);
CREATE POLICY growth_promoter_self ON public.growth_promoters FOR SELECT TO authenticated USING(user_id=auth.uid());
-- Referrers receive only aggregate counts through the snapshot RPC, never referred identities.
CREATE POLICY growth_referral_self ON public.growth_referrals FOR SELECT TO authenticated USING(referred_user_id=auth.uid());
CREATE POLICY growth_ledger_self ON public.growth_points_ledger FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY growth_rewards_read ON public.growth_rewards FOR SELECT TO authenticated USING(available);
CREATE POLICY growth_redemption_self ON public.growth_redemptions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY growth_creator_self ON public.growth_creator_applications FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY growth_content_self ON public.growth_creator_content FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY growth_commission_self ON public.growth_commissions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY growth_tariff_self ON public.growth_affiliate_tariffs FOR SELECT TO authenticated USING(user_id=auth.uid());

-- Internal helper tolerates installation before the workspace migration, but never
-- trusts user_metadata. The private workspace registry is the sole demo authority.
CREATE FUNCTION growth_private.demo_cohort(p_user uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v uuid; BEGIN
 IF to_regclass('public.workspace_demo_accounts') IS NOT NULL THEN
  EXECUTE 'SELECT cohort_id FROM public.workspace_demo_accounts WHERE user_id=$1' INTO v USING p_user;
 END IF; RETURN v;
END $$;
CREATE FUNCTION growth_private.require_user() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'auth_required'; END IF;
 RETURN u;
END $$;
CREATE FUNCTION growth_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'immutable_ledger'; END $$;
CREATE TRIGGER growth_ledger_immutable BEFORE UPDATE OR DELETE ON public.growth_points_ledger FOR EACH ROW EXECUTE FUNCTION growth_private.immutable();
CREATE TRIGGER growth_audit_immutable BEFORE UPDATE OR DELETE ON public.growth_audit FOR EACH ROW EXECUTE FUNCTION growth_private.immutable();
CREATE TRIGGER growth_tariff_immutable BEFORE UPDATE OR DELETE ON public.growth_affiliate_tariffs FOR EACH ROW EXECUTE FUNCTION growth_private.immutable();
CREATE TRIGGER growth_cost_immutable BEFORE UPDATE OR DELETE ON public.growth_acquisition_costs FOR EACH ROW EXECUTE FUNCTION growth_private.immutable();

-- Called only by the server's service-role client to issue an opaque touch token.
CREATE FUNCTION public.growth_record_touch(p_code text,p_campaign text DEFAULT NULL,p_content text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.growth_promoters; token uuid; legacy uuid; BEGIN
 IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT (SELECT enabled FROM public.growth_settings WHERE id) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.growth_promoters WHERE code=lower(trim(p_code)) AND active;
 IF p.id IS NULL AND p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  legacy:=p_code::uuid;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=legacy AND is_discarded IS NOT TRUE) THEN
   INSERT INTO public.growth_promoters(user_id,demo_cohort_id) VALUES(legacy,growth_private.demo_cohort(legacy)) ON CONFLICT(user_id) DO NOTHING;
   SELECT * INTO p FROM public.growth_promoters WHERE user_id=legacy AND active;
  END IF;
 END IF;
 IF p.id IS NULL OR p.demo_cohort_id IS NOT NULL THEN RETURN NULL; END IF;
 INSERT INTO growth_private.touches(promoter_id,campaign,content) VALUES(p.id,left(p_campaign,120),left(p_content,120)) RETURNING id INTO token;
 RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.growth_record_touch(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.growth_record_touch(text,text,text) TO service_role;

-- Shared internal acquisition rule: auth metadata is an untrusted claim of an
-- invitation, never a privilege, balance or qualification source.
CREATE FUNCTION growth_private.claim(p_user uuid,p_code text,p_first uuid,p_last uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.growth_promoters; r public.growth_referrals; created timestamptz; complete boolean; source text; cohort uuid; rules jsonb;
BEGIN
 IF NOT (SELECT enabled FROM public.growth_settings WHERE id) AND growth_private.demo_cohort(p_user) IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,6201));
 SELECT a.created_at,profile.onboarding_completed INTO created,complete FROM public.profiles profile JOIN auth.users a ON a.id=profile.id WHERE profile.id=p_user AND profile.is_discarded IS NOT TRUE;
 IF created IS NULL OR created<now()-interval '30 days' THEN RETURN false; END IF;
 SELECT * INTO r FROM public.growth_referrals WHERE referred_user_id=p_user FOR UPDATE;
 IF complete OR r.locked_at IS NOT NULL THEN RETURN false; END IF;
 cohort:=growth_private.demo_cohort(p_user);
 IF nullif(trim(p_code),'') IS NOT NULL THEN
  SELECT * INTO p FROM public.growth_promoters WHERE code=lower(trim(p_code)) AND active; source:='explicit';
 ELSE
  SELECT pr.* INTO p FROM growth_private.touches t JOIN public.growth_promoters pr ON pr.id=t.promoter_id
   WHERE t.id=p_first AND t.created_at BETWEEN now()-interval '30 days' AND created+interval '5 minutes' AND pr.active;
  source:='link';
 END IF;
 IF p.id IS NULL THEN RETURN false; END IF;
 IF p.user_id=p_user THEN RAISE EXCEPTION 'self_referral'; END IF;
 IF p.demo_cohort_id IS DISTINCT FROM cohort THEN RETURN false; END IF;
 IF r.id IS NOT NULL AND (r.attribution_source='explicit' OR source<>'explicit') THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM growth_private.touches WHERE id=p_first AND created_at>=now()-interval '30 days') THEN p_first:=NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM growth_private.touches WHERE id=p_last AND created_at>=now()-interval '30 days') THEN p_last:=NULL; END IF;
 SELECT jsonb_build_object('version',1,'referral_points',referral_points,'activation_points',activation_points,'monthly_limit',monthly_limit,'review_days',review_days) INTO rules FROM public.growth_settings WHERE id;
 INSERT INTO public.growth_referrals(referred_user_id,promoter_id,first_touch_id,last_touch_id,attribution_source,rule_snapshot,demo_cohort_id)
 VALUES(p_user,p.id,p_first,p_last,source,rules,cohort)
 ON CONFLICT(referred_user_id) DO UPDATE SET promoter_id=excluded.promoter_id,last_touch_id=excluded.last_touch_id,attribution_source=excluded.attribution_source;
 RETURN true;
END $$;
CREATE FUNCTION public.growth_claim_referral(p_code text DEFAULT NULL,p_first uuid DEFAULT NULL,p_last uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 RETURN growth_private.claim(growth_private.require_user(),p_code,p_first,p_last);
END $$;
REVOKE ALL ON FUNCTION public.growth_claim_referral(text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_claim_referral(text,uuid,uuid) TO authenticated;

CREATE FUNCTION growth_private.auth_attribution() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE first_id uuid; last_id uuid; BEGIN
 IF coalesce(NEW.raw_user_meta_data->>'growth_first_touch','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN first_id:=(NEW.raw_user_meta_data->>'growth_first_touch')::uuid; END IF;
 IF coalesce(NEW.raw_user_meta_data->>'growth_last_touch','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN last_id:=(NEW.raw_user_meta_data->>'growth_last_touch')::uuid; END IF;
 PERFORM growth_private.claim(NEW.id,NEW.raw_user_meta_data->>'growth_explicit_code',first_id,last_id);
 RETURN NEW;
END $$;
CREATE TRIGGER zz_growth_auth_attribution AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION growth_private.auth_attribution();

CREATE FUNCTION growth_private.profile_qualification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.onboarding_completed AND NEW.is_discarded IS NOT TRUE THEN
  UPDATE public.growth_referrals SET locked_at=coalesce(locked_at,now()),qualified_at=CASE WHEN NEW.email_verified_at IS NOT NULL THEN coalesce(qualified_at,now()) ELSE qualified_at END WHERE referred_user_id=NEW.id;
  IF NEW.email_verified_at IS NOT NULL AND (SELECT enabled FROM public.growth_settings WHERE id) THEN
   INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key) VALUES(NEW.id,30,'profile_completed','profile:v1:'||NEW.id) ON CONFLICT(event_key) DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER growth_profile_qualification AFTER UPDATE OF onboarding_completed,email_verified_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION growth_private.profile_qualification();
CREATE FUNCTION growth_private.record_activation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid; eligible boolean:=false; BEGIN
 u:=NEW.user_id;
 IF TG_TABLE_NAME='favorites' THEN
  eligible:=(NEW.target_type='career' AND EXISTS(SELECT 1 FROM public.careers WHERE id=NEW.target_id)) OR (NEW.target_type='university' AND EXISTS(SELECT 1 FROM public.universities WHERE id=NEW.target_id));
 ELSIF TG_TABLE_NAME='event_participants' THEN
  eligible:=NEW.status IN ('registered','attended') AND EXISTS(SELECT 1 FROM public.events e WHERE e.id=NEW.event_id AND e.status<>'cancelled' AND (coalesce(e.price,0)=0 OR EXISTS(SELECT 1 FROM public.event_tickets t WHERE t.event_id=e.id AND t.holder_id=u AND t.status IN('valid','used'))));
 ELSIF TG_TABLE_NAME='community_members' THEN eligible:=true;
 END IF;
 IF eligible AND (SELECT enabled FROM public.growth_settings WHERE id) THEN
  UPDATE public.growth_referrals SET activated_at=coalesce(activated_at,now()) WHERE referred_user_id=u AND status<>'rejected';
  INSERT INTO growth_private.activity_days(user_id,day) VALUES(u,current_date) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER growth_favorite_activation AFTER INSERT ON public.favorites FOR EACH ROW EXECUTE FUNCTION growth_private.record_activation();
CREATE TRIGGER growth_event_activation AFTER INSERT OR UPDATE OF status ON public.event_participants FOR EACH ROW EXECUTE FUNCTION growth_private.record_activation();
CREATE TRIGGER growth_community_activation AFTER INSERT ON public.community_members FOR EACH ROW EXECUTE FUNCTION growth_private.record_activation();

-- Tickets reach 'used' only through the trusted check-in paths. Verify their
-- actual actor and event scope again; scanning one's own ticket earns nothing.
CREATE FUNCTION growth_private.ticket_attendance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE allowed boolean:=false; BEGIN
 IF NEW.status<>'used' OR OLD.status<>'valid' OR NEW.checked_in_by IS NULL OR NEW.checked_in_by IS DISTINCT FROM auth.uid()
  OR NEW.checked_in_by=NEW.holder_id OR growth_private.demo_cohort(NEW.holder_id) IS NOT NULL
  OR NOT (SELECT enabled FROM public.growth_settings WHERE id) THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM public.events WHERE id=NEW.event_id AND organizer_id=NEW.checked_in_by) OR public.is_admin() INTO allowed;
 IF NOT allowed AND to_regclass('public.workspace_resources') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.workspace_resources r WHERE r.type=''event'' AND r.source_id=$1 AND public.has_organization_permission(r.organization_id,''attendees.manage''))' INTO allowed USING NEW.event_id;
 END IF;
 IF allowed AND EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.holder_id AND email_verified_at IS NOT NULL AND onboarding_completed AND is_discarded IS NOT TRUE) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.holder_id::text,6202));
  INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key) VALUES(NEW.holder_id,20,'attendance_validated','attendance:v1:'||NEW.holder_id||':'||NEW.event_id) ON CONFLICT(event_key) DO NOTHING;
  UPDATE public.growth_referrals SET activated_at=coalesce(activated_at,now()) WHERE referred_user_id=NEW.holder_id AND status<>'rejected';
  INSERT INTO growth_private.activity_days(user_id,day) VALUES(NEW.holder_id,current_date) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER growth_ticket_attendance AFTER UPDATE OF status ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION growth_private.ticket_attendance();
CREATE FUNCTION growth_private.ticket_activation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.status IN('valid','used') AND (SELECT enabled FROM public.growth_settings WHERE id) THEN
  UPDATE public.growth_referrals SET activated_at=coalesce(activated_at,now()) WHERE referred_user_id=NEW.holder_id AND status<>'rejected';
  INSERT INTO growth_private.activity_days(user_id,day) VALUES(NEW.holder_id,current_date) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER growth_paid_ticket_activation AFTER INSERT OR UPDATE OF status ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION growth_private.ticket_activation();

-- CPA rates are immutable and apply to acquisitions created after agreement.
-- Each stage is unique. Insufficient funding enters a real review queue and
-- cannot abort the student's original action or overspend the budget.
CREATE FUNCTION growth_private.reserve_affiliate(p_referral uuid,p_stage text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE referral public.growth_referrals; tariff public.growth_affiliate_tariffs; budget public.growth_commission_budgets; promoter uuid; result uuid; key text; BEGIN
 IF NOT (SELECT cash_enabled FROM public.growth_settings WHERE id) THEN RETURN; END IF;
 SELECT * INTO referral FROM public.growth_referrals WHERE id=p_referral AND status='approved' AND demo_cohort_id IS NULL;
 IF NOT FOUND OR (p_stage='activated' AND referral.activated_at IS NULL) THEN RETURN; END IF;
 SELECT user_id INTO promoter FROM public.growth_promoters WHERE id=referral.promoter_id AND active AND demo_cohort_id IS NULL;
 IF promoter IS NULL OR growth_private.demo_cohort(promoter) IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.growth_creator_applications WHERE user_id=promoter AND status='approved' AND mode IN ('affiliate','both')) THEN RETURN; END IF;
 SELECT * INTO tariff FROM public.growth_affiliate_tariffs WHERE user_id=promoter AND stage=p_stage AND starts_at<=referral.created_at ORDER BY version DESC LIMIT 1;
 IF NOT FOUND OR tariff.amount_cents=0 THEN RETURN; END IF;
 key:='affiliate:v1:'||referral.id||':'||p_stage;
 IF EXISTS(SELECT 1 FROM public.growth_commissions WHERE event_key=key) THEN RETURN; END IF;
 SELECT * INTO budget FROM public.growth_commission_budgets WHERE id=tariff.budget_id FOR UPDATE;
 IF NOT budget.active OR budget.reserved_cents+tariff.amount_cents>budget.total_cents THEN
  INSERT INTO growth_private.payout_review(event_key,referral_id,reason) VALUES(key,referral.id,'budget_exhausted') ON CONFLICT DO NOTHING;RETURN;
 END IF;
 INSERT INTO public.growth_commissions(user_id,budget_id,referral_id,event_key,amount_cents,terms_snapshot)
 VALUES(promoter,budget.id,referral.id,key,tariff.amount_cents,jsonb_build_object('version',tariff.version,'tariff_id',tariff.id,'stage',p_stage,'terms',tariff.terms,'attribution_rule',referral.rule_snapshot))
 ON CONFLICT(event_key) DO NOTHING RETURNING id INTO result;
 IF result IS NOT NULL THEN UPDATE public.growth_commission_budgets SET reserved_cents=reserved_cents+tariff.amount_cents WHERE id=budget.id; END IF;
 DELETE FROM growth_private.payout_review WHERE event_key=key;
END $$;

-- Serialize per promoter across refreshes and canjes. Never awards from client analytics.
CREATE FUNCTION growth_private.refresh(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.growth_referrals; n integer; BEGIN
 IF NOT (SELECT enabled FROM public.growth_settings WHERE id) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,6202));
 FOR r IN SELECT acquisition.* FROM public.growth_referrals acquisition JOIN public.growth_promoters p ON p.id=acquisition.promoter_id
  JOIN public.profiles referred ON referred.id=acquisition.referred_user_id
  WHERE p.user_id=p_user AND p.active AND acquisition.status IN ('pending','approved') AND acquisition.qualified_at IS NOT NULL
    AND acquisition.qualified_at+(acquisition.rule_snapshot->>'review_days')::integer*interval '1 day'<=now()
    AND referred.email_verified_at IS NOT NULL AND referred.onboarding_completed AND referred.is_discarded IS NOT TRUE
    AND acquisition.demo_cohort_id IS NOT DISTINCT FROM growth_private.demo_cohort(p_user)
  ORDER BY acquisition.created_at FOR UPDATE OF acquisition LOOP
  IF NOT EXISTS(SELECT 1 FROM public.growth_points_ledger WHERE event_key='referral:'||r.id) THEN
   SELECT count(*) INTO n FROM public.growth_points_ledger WHERE user_id=p_user AND reason='referral_valid' AND created_at>=date_trunc('month',now());
   IF n >= (r.rule_snapshot->>'monthly_limit')::integer THEN
    UPDATE public.growth_referrals SET status='review',review_reason='monthly_limit' WHERE id=r.id; CONTINUE;
   END IF;
   INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key,referral_id)
    SELECT p_user,(r.rule_snapshot->>'referral_points')::integer,'referral_valid','referral:'||r.id,r.id WHERE (r.rule_snapshot->>'referral_points')::integer>0 ON CONFLICT(event_key) DO NOTHING;
   UPDATE public.growth_referrals SET status='approved',reviewed_at=now() WHERE id=r.id;
  END IF;
  IF r.activated_at IS NOT NULL THEN
   INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key,referral_id)
    SELECT p_user,(r.rule_snapshot->>'activation_points')::integer,'referral_activated','activation:'||r.id,r.id WHERE (r.rule_snapshot->>'activation_points')::integer>0 ON CONFLICT(event_key) DO NOTHING;
  END IF;
  PERFORM growth_private.reserve_affiliate(r.id,'qualified');
  PERFORM growth_private.reserve_affiliate(r.id,'activated');
 END LOOP;
 UPDATE public.growth_promoters SET processed_at=now() WHERE user_id=p_user;
END $$;

CREATE FUNCTION public.growth_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=growth_private.require_user(); p public.growth_promoters; cfg public.growth_settings; BEGIN
 SELECT * INTO cfg FROM public.growth_settings WHERE id;
 cfg.enabled:=cfg.enabled OR growth_private.demo_cohort(u) IS NOT NULL;
 cfg.cash_enabled:=cfg.cash_enabled AND growth_private.demo_cohort(u) IS NULL;
 IF cfg.enabled THEN
  INSERT INTO public.growth_promoters(user_id,demo_cohort_id) VALUES(u,growth_private.demo_cohort(u)) ON CONFLICT(user_id) DO NOTHING;
  PERFORM growth_private.refresh(u);
  INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key)
   SELECT u,30,'profile_completed','profile:v1:'||u FROM public.profiles WHERE id=u AND email_verified_at IS NOT NULL AND onboarding_completed ON CONFLICT(event_key) DO NOTHING;
 END IF;
 SELECT * INTO p FROM public.growth_promoters WHERE user_id=u;
 RETURN jsonb_build_object('enabled',cfg.enabled,'cash_enabled',cfg.cash_enabled,'demo',growth_private.demo_cohort(u) IS NOT NULL,'code',p.code,
  'balance',coalesce((SELECT sum(points) FROM public.growth_points_ledger WHERE user_id=u),0),
  'referrals',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status IN ('pending','review')),'approved',count(*) FILTER(WHERE status='approved'),'activated',count(*) FILTER(WHERE status='approved' AND activated_at IS NOT NULL),'rejected',count(*) FILTER(WHERE status='rejected')) FROM public.growth_referrals WHERE promoter_id=p.id),
  'ledger',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,points,reason,created_at FROM public.growth_points_ledger WHERE user_id=u ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'rewards',coalesce((SELECT jsonb_agg(x) FROM (SELECT key,title,description,points,available FROM public.growth_rewards WHERE available ORDER BY points)x),'[]'),
  'redemptions',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,reward_key,points,created_at FROM public.growth_redemptions WHERE user_id=u ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'creator',(SELECT to_jsonb(x) FROM (SELECT id,mode,channels,proposal,status,created_at FROM public.growth_creator_applications WHERE user_id=u)x),
  'content',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,title,url,rights,status,created_at FROM public.growth_creator_content WHERE user_id=u ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'tariffs',coalesce((SELECT jsonb_agg(x) FROM (SELECT stage,version,amount_cents,terms,starts_at FROM public.growth_affiliate_tariffs WHERE user_id=u ORDER BY starts_at DESC LIMIT 50)x),'[]'),
  'commissions',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,amount_cents,currency,status,recovery_required,created_at FROM public.growth_commissions WHERE user_id=u ORDER BY created_at DESC LIMIT 50)x),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.growth_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_snapshot() TO authenticated;

CREATE FUNCTION public.growth_redeem(p_reward text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=growth_private.require_user(); reward public.growth_rewards; result public.growth_redemptions; balance bigint; rid uuid; BEGIN
 IF NOT (SELECT enabled FROM public.growth_settings WHERE id) AND growth_private.demo_cohort(u) IS NULL THEN RAISE EXCEPTION 'growth_disabled'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,6202));
 SELECT * INTO result FROM public.growth_redemptions WHERE user_id=u AND request_key=p_request;
 IF FOUND THEN IF result.reward_key<>p_reward THEN RAISE EXCEPTION 'request_conflict'; END IF; RETURN result.id; END IF;
 SELECT * INTO result FROM public.growth_redemptions WHERE user_id=u AND reward_key=p_reward;
 IF FOUND THEN RETURN result.id; END IF;
 SELECT * INTO reward FROM public.growth_rewards WHERE key=p_reward FOR UPDATE;
 IF NOT FOUND OR NOT reward.available OR (reward.stock=0 AND growth_private.demo_cohort(u) IS NULL) THEN RAISE EXCEPTION 'reward_unavailable'; END IF;
 SELECT coalesce(sum(points),0) INTO balance FROM public.growth_points_ledger WHERE user_id=u;
 IF balance<reward.points THEN RAISE EXCEPTION 'insufficient_points'; END IF;
 INSERT INTO public.growth_redemptions(user_id,reward_key,points,request_key) VALUES(u,p_reward,reward.points,p_request) RETURNING id INTO rid;
 INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key) VALUES(u,-reward.points,'reward_redeemed','redemption:'||rid);
 UPDATE public.growth_rewards SET stock=stock-1 WHERE key=p_reward AND stock IS NOT NULL AND growth_private.demo_cohort(u) IS NULL;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.growth_redeem(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_redeem(text,uuid) TO authenticated;

CREATE FUNCTION public.growth_creator_apply(p_mode text,p_channels text,p_proposal text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=growth_private.require_user(); result uuid; BEGIN
 IF NOT (SELECT enabled FROM public.growth_settings WHERE id) AND growth_private.demo_cohort(u) IS NULL THEN RAISE EXCEPTION 'growth_disabled'; END IF;
 INSERT INTO public.growth_creator_applications(user_id,mode,channels,proposal) VALUES(u,p_mode,trim(p_channels),trim(p_proposal))
 ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,channels=excluded.channels,proposal=excluded.proposal,status='pending',updated_at=now()
 WHERE growth_creator_applications.status IN ('pending','rejected') RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'application_locked'; END IF; RETURN result;
END $$;
CREATE FUNCTION public.growth_content_submit(p_title text,p_url text,p_rights text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=growth_private.require_user(); result uuid; BEGIN
 IF NOT (SELECT enabled FROM public.growth_settings WHERE id) AND growth_private.demo_cohort(u) IS NULL THEN RAISE EXCEPTION 'growth_disabled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.growth_creator_applications WHERE user_id=u AND status='approved') THEN RAISE EXCEPTION 'creator_not_approved'; END IF;
 INSERT INTO public.growth_creator_content(user_id,title,url,rights) VALUES(u,trim(p_title),trim(p_url),trim(p_rights)) RETURNING id INTO result; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.growth_creator_apply(text,text,text),public.growth_content_submit(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_creator_apply(text,text,text),public.growth_content_submit(text,text,text) TO authenticated;

-- Administration is a live database role check, not a client/JWT profile claim.
CREATE FUNCTION public.growth_admin_action(p_action text,p_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=growth_private.require_user(); c public.growth_creator_content; b public.growth_commission_budgets; commission public.growth_commissions; r public.growth_referrals; result uuid; amount bigint; next_version integer; BEGIN
 IF NOT public.is_admin() OR growth_private.demo_cohort(u) IS NOT NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'mfa_required'; END IF;
 CASE p_action
 WHEN 'settings' THEN
  UPDATE public.growth_settings SET enabled=coalesce((p_data->>'enabled')::boolean,enabled),cash_enabled=coalesce((p_data->>'cash_enabled')::boolean,cash_enabled),updated_at=now() WHERE id;
 WHEN 'creator_review' THEN
  IF p_data->>'status' NOT IN ('approved','rejected','paused') OR length(coalesce(p_data->>'reason',''))<5 THEN RAISE EXCEPTION 'invalid_review'; END IF;
  UPDATE public.growth_creator_applications SET status=p_data->>'status',review_note=left(p_data->>'reason',1000),updated_at=now() WHERE id=p_id;
 WHEN 'content_review' THEN
  IF p_data->>'status' NOT IN ('approved','rejected') OR length(coalesce(p_data->>'reason',''))<5 THEN RAISE EXCEPTION 'invalid_review'; END IF;
  UPDATE public.growth_creator_content SET status=p_data->>'status',review_note=left(p_data->>'reason',1000) WHERE id=p_id;
 WHEN 'referral_reject' THEN
  IF length(coalesce(p_data->>'reason',''))<5 THEN RAISE EXCEPTION 'invalid_review'; END IF;
  SELECT * INTO r FROM public.growth_referrals WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((SELECT user_id::text FROM public.growth_promoters WHERE id=r.promoter_id),6202));
  SELECT * INTO r FROM public.growth_referrals WHERE id=p_id FOR UPDATE;
  UPDATE public.growth_referrals SET status='rejected',review_reason=left(p_data->>'reason',1000),reviewed_at=now() WHERE id=p_id;
  INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key,referral_id)
   SELECT user_id,-points,'fraud_reversal','reversal:'||id,id_ref FROM (SELECT l.*,p_id AS id_ref FROM public.growth_points_ledger l WHERE referral_id=p_id AND points>0)x ON CONFLICT(event_key) DO NOTHING;
  FOR commission IN SELECT * FROM public.growth_commissions WHERE referral_id=p_id ORDER BY id FOR UPDATE LOOP
   IF commission.status IN ('pending','available') THEN
    UPDATE public.growth_commission_budgets SET reserved_cents=reserved_cents-commission.amount_cents WHERE id=commission.budget_id;
    UPDATE public.growth_commissions SET status='reverted' WHERE id=commission.id;
   ELSIF commission.status='paid' THEN
    UPDATE public.growth_commissions SET recovery_required=true WHERE id=commission.id;
   END IF;
  END LOOP;
 WHEN 'referral_approve' THEN
  IF length(coalesce(p_data->>'reason',''))<5 THEN RAISE EXCEPTION 'invalid_review'; END IF;
  SELECT * INTO r FROM public.growth_referrals WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((SELECT user_id::text FROM public.growth_promoters WHERE id=r.promoter_id),6202));
  SELECT * INTO r FROM public.growth_referrals WHERE id=p_id FOR UPDATE;
  IF r.status<>'review' OR r.qualified_at IS NULL OR r.qualified_at+(r.rule_snapshot->>'review_days')::integer*interval '1 day'>now()
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.referred_user_id AND email_verified_at IS NOT NULL AND onboarding_completed AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'not_qualified'; END IF;
  INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key,referral_id)
   SELECT user_id,(r.rule_snapshot->>'referral_points')::integer,'referral_valid','referral:'||r.id,r.id FROM public.growth_promoters WHERE id=r.promoter_id AND (r.rule_snapshot->>'referral_points')::integer>0 ON CONFLICT(event_key) DO NOTHING;
  UPDATE public.growth_referrals SET status='approved',reviewed_at=now(),review_reason=left(p_data->>'reason',1000) WHERE id=p_id;
  PERFORM growth_private.refresh((SELECT user_id FROM public.growth_promoters WHERE id=r.promoter_id));
 WHEN 'budget_create' THEN
  INSERT INTO public.growth_commission_budgets(title,total_cents,active) VALUES(left(p_data->>'title',140),(p_data->>'total_cents')::bigint,true) RETURNING id INTO result;
 WHEN 'budget_increase' THEN
  amount:=(p_data->>'amount_cents')::bigint;
  IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE public.growth_commission_budgets SET total_cents=total_cents+amount WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 WHEN 'cost_record' THEN
  INSERT INTO public.growth_acquisition_costs(request_key,title,category,amount_cents,occurred_on,created_by)
   VALUES((p_data->>'request_key')::uuid,p_data->>'title',p_data->>'category',(p_data->>'amount_cents')::bigint,(p_data->>'occurred_on')::date,u)
   ON CONFLICT(request_key) DO NOTHING RETURNING id INTO result;
 WHEN 'tariff_create' THEN
  IF NOT EXISTS(SELECT 1 FROM public.growth_creator_applications WHERE user_id=p_id AND status='approved' AND mode IN('affiliate','both')) OR growth_private.demo_cohort(p_id) IS NOT NULL THEN RAISE EXCEPTION 'creator_not_approved'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,6202));
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.growth_affiliate_tariffs WHERE user_id=p_id AND stage=p_data->>'stage';
  INSERT INTO public.growth_affiliate_tariffs(user_id,budget_id,stage,version,amount_cents,terms,created_by)
   VALUES(p_id,(p_data->>'budget_id')::uuid,p_data->>'stage',next_version,(p_data->>'amount_cents')::bigint,p_data->>'terms',u) RETURNING id INTO result;
 WHEN 'commission_create' THEN
  IF NOT (SELECT cash_enabled FROM public.growth_settings WHERE id) THEN RAISE EXCEPTION 'cash_disabled'; END IF;
  IF length(coalesce(p_data->>'terms','')) NOT BETWEEN 20 AND 3000 THEN RAISE EXCEPTION 'terms_required'; END IF;
  SELECT * INTO c FROM public.growth_creator_content WHERE id=p_id AND status='approved';
  IF c.id IS NULL OR growth_private.demo_cohort(c.user_id) IS NOT NULL THEN RAISE EXCEPTION 'invalid_content'; END IF;
  SELECT * INTO b FROM public.growth_commission_budgets WHERE id=(p_data->>'budget_id')::uuid FOR UPDATE;
  amount:=(p_data->>'amount_cents')::bigint;
  IF b.id IS NULL OR NOT b.active OR amount IS NULL OR amount<=0 OR b.reserved_cents+amount>b.total_cents THEN RAISE EXCEPTION 'budget_exceeded'; END IF;
  INSERT INTO public.growth_commissions(user_id,budget_id,content_id,event_key,amount_cents,terms_snapshot) VALUES(c.user_id,b.id,c.id,'ugc:v1:'||c.id,amount,jsonb_build_object('version',1,'rights',c.rights,'terms',p_data->>'terms','approved_by',u)) RETURNING id INTO result;
  UPDATE public.growth_commission_budgets SET reserved_cents=reserved_cents+amount WHERE id=b.id;
 WHEN 'commission_status' THEN
  SELECT * INTO commission FROM public.growth_commissions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (SELECT cash_enabled FROM public.growth_settings WHERE id) OR growth_private.demo_cohort(commission.user_id) IS NOT NULL THEN RAISE EXCEPTION 'cash_disabled'; END IF;
  IF NOT ((commission.status='pending' AND p_data->>'status' IN ('available','reverted')) OR (commission.status='available' AND p_data->>'status' IN ('paid','reverted'))) THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  IF p_data->>'status'='paid' AND length(coalesce(p_data->>'receipt_reference',''))<5 THEN RAISE EXCEPTION 'receipt_required'; END IF;
  UPDATE public.growth_commissions SET status=p_data->>'status',receipt_reference=left(p_data->>'receipt_reference',250) WHERE id=p_id;
  IF p_data->>'status'='reverted' THEN UPDATE public.growth_commission_budgets SET reserved_cents=reserved_cents-commission.amount_cents WHERE id=commission.budget_id; END IF;
 ELSE RAISE EXCEPTION 'invalid_action';
 END CASE;
 INSERT INTO public.growth_audit(actor_id,action,target_id,details) VALUES(u,p_action,coalesce(p_id,result)::text,p_data);
 RETURN jsonb_build_object('ok',true,'id',result);
END $$;
CREATE FUNCTION public.growth_admin_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM growth_private.require_user(); IF NOT public.is_admin() OR growth_private.demo_cohort(auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'mfa_required'; END IF;
 RETURN jsonb_build_object('settings',(SELECT to_jsonb(s) FROM public.growth_settings s WHERE id),
  'retention',(SELECT jsonb_agg(jsonb_build_object('day',metric.day,'mature_accounts',metric.total,'returned_accounts',metric.returned,'suppressed',metric.total<10)) FROM (
    SELECT horizon.day,count(r.id) total,CASE WHEN count(r.id)>=10 THEN count(r.id) FILTER(WHERE EXISTS(SELECT 1 FROM growth_private.activity_days a WHERE a.user_id=r.referred_user_id AND a.day=(r.created_at AT TIME ZONE 'UTC')::date+horizon.day)) ELSE NULL END returned
    FROM (VALUES(1),(7),(30)) horizon(day) LEFT JOIN public.growth_referrals r ON r.demo_cohort_id IS NULL AND r.status<>'rejected' AND r.created_at<now()-horizon.day*interval '1 day' GROUP BY horizon.day ORDER BY horizon.day
  )metric),
  'costs',(SELECT jsonb_build_object('committed_cents',coalesce(sum(amount_cents) FILTER(WHERE status<>'reverted'),0),'paid_cents',coalesce(sum(amount_cents) FILTER(WHERE status='paid'),0),'external_cents',(SELECT coalesce(sum(amount_cents),0) FROM public.growth_acquisition_costs),'currency','eur','basis','recorded_costs_only') FROM public.growth_commissions WHERE growth_private.demo_cohort(user_id) IS NULL),
  'totals',(SELECT jsonb_build_object('acquisitions',count(*),'qualified',count(*) FILTER(WHERE qualified_at IS NOT NULL),'activated',count(*) FILTER(WHERE activated_at IS NOT NULL),'review',count(*) FILTER(WHERE status='review')) FROM public.growth_referrals WHERE demo_cohort_id IS NULL),
  'applications',coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM public.growth_creator_applications WHERE growth_private.demo_cohort(user_id) IS NULL ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'content',coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM public.growth_creator_content WHERE growth_private.demo_cohort(user_id) IS NULL ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'referrals',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,status,created_at,qualified_at,activated_at,review_reason FROM public.growth_referrals WHERE demo_cohort_id IS NULL AND status IN ('pending','review') ORDER BY created_at LIMIT 50)x),'[]'),
  'budgets',coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM public.growth_commission_budgets ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'tariffs',coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM public.growth_affiliate_tariffs ORDER BY starts_at DESC LIMIT 50)x),'[]'),
  'payout_review',coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM growth_private.payout_review ORDER BY created_at LIMIT 50)x),'[]'),
  'commissions',coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM public.growth_commissions ORDER BY created_at DESC LIMIT 50)x),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.growth_admin_action(text,uuid,jsonb),public.growth_admin_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_admin_action(text,uuid,jsonb),public.growth_admin_snapshot() TO authenticated;
-- Bounded background sweep. process_at rotates every promoter; repeated cron
-- deliveries are safe because every reward/commission has a unique event key.
CREATE FUNCTION public.growth_process_due() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; processed integer:=0; BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOR p IN SELECT user_id FROM public.growth_promoters WHERE active AND demo_cohort_id IS NULL ORDER BY processed_at NULLS FIRST,id LIMIT 100 LOOP
  PERFORM growth_private.refresh(p.user_id);processed:=processed+1;
 END LOOP;
 DELETE FROM growth_private.touches t WHERE t.created_at<now()-interval '31 days' AND NOT EXISTS(SELECT 1 FROM public.growth_referrals WHERE first_touch_id=t.id OR last_touch_id=t.id);
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public.growth_process_due() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.growth_process_due() TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA growth_private FROM PUBLIC,anon,authenticated;
$franky_component_1$;

-- SOURCE 20260922171016_workspace_foundation.sql
EXECUTE $franky_component_2$
-- Additive workspace foundation. No rollout or new billing is activated here.
CREATE TABLE public.workspace_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  digital_sales_enabled boolean NOT NULL DEFAULT false,
  creator_cash_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.workspace_release(singleton) VALUES(true);
CREATE TABLE public.workspace_demo_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_demo_cohort_idx ON public.workspace_demo_accounts(cohort_id);
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK(kind IN('housing','community','leisure','university')),
  subtype text CHECK(length(subtype)<=60),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 3 AND 100),
  slug text NOT NULL UNIQUE,
  city text CHECK(length(city)<=100),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN('unverified','pending','verified')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended','archived')),
  demo_cohort_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organizations_kind_status_idx ON public.organizations(kind,status);
CREATE INDEX organizations_demo_idx ON public.organizations(demo_cohort_id) WHERE demo_cohort_id IS NOT NULL;
CREATE TABLE public.organization_memberships (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN('owner','admin','editor','moderator','analyst','finance','checkin','member')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX organization_member_user_idx ON public.organization_memberships(user_id,status);
CREATE TABLE public.organization_campuses (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  PRIMARY KEY(organization_id,university_id)
);
CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254),
  role text NOT NULL CHECK(role IN('admin','editor','moderator','analyst','finance','checkin','member')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organization_open_invite_idx ON public.organization_invitations(organization_id,email)
 WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE public.organization_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_audit_recent_idx ON public.organization_audit(organization_id,created_at DESC);
CREATE TABLE public.workspace_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK(type IN('housing','visit','community','event','venue','post','academic','conversation','moderation')),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'draft',
  data jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=50000),
  source_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,type,source_id)
);
CREATE INDEX workspace_resources_page_idx ON public.workspace_resources(organization_id,type,id);
CREATE TABLE public.workspace_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 kind text NOT NULL,resource_id uuid,payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sent','failed','simulated')),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,resource_id)
);

-- Internal helpers resolve trusted identity. Never use mutable user_metadata.
CREATE FUNCTION public.current_demo_cohort() RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=public,pg_temp AS $$ SELECT cohort_id FROM public.workspace_demo_accounts WHERE user_id=auth.uid() $$;
REVOKE ALL ON FUNCTION public.current_demo_cohort() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_demo_cohort() TO authenticated,service_role;
CREATE FUNCTION public.workspace_role_permissions(p_role text) RETURNS text[] LANGUAGE sql IMMUTABLE
 SET search_path=public,pg_temp AS $$
 SELECT CASE p_role
 WHEN 'owner' THEN ARRAY['resource.read','content.manage','members.read','members.manage','finance.read','finance.manage','moderation.manage','analytics.read','attendees.manage','settings.manage']
 WHEN 'admin' THEN ARRAY['resource.read','content.manage','members.read','members.manage','moderation.manage','analytics.read','attendees.manage','settings.manage']
 WHEN 'editor' THEN ARRAY['resource.read','content.manage']
 WHEN 'moderator' THEN ARRAY['resource.read','moderation.manage']
 WHEN 'analyst' THEN ARRAY['resource.read','analytics.read']
 WHEN 'finance' THEN ARRAY['resource.read','finance.read','finance.manage']
 WHEN 'checkin' THEN ARRAY['resource.read','attendees.manage']
 WHEN 'member' THEN ARRAY['resource.read'] ELSE ARRAY[]::text[] END $$;
REVOKE ALL ON FUNCTION public.workspace_role_permissions(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_role_permissions(text) TO authenticated,service_role;
CREATE FUNCTION public.has_organization_permission(p_organization_id uuid,p_permission text) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.organization_memberships m
 JOIN public.organizations o ON o.id=m.organization_id
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.organization_id=p_organization_id AND m.user_id=auth.uid() AND m.status='active'
 AND o.status='active' AND p.is_discarded IS NOT TRUE AND public.account_session_usable()
 AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort()
 AND p_permission=ANY(public.workspace_role_permissions(m.role))) $$;
REVOKE ALL ON FUNCTION public.has_organization_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_organization_permission(uuid,text) TO authenticated,service_role;
CREATE FUNCTION public.workspace_require(p_organization_id uuid,p_permission text) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.has_organization_permission(p_organization_id,p_permission) THEN
 RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.workspace_require(uuid,text) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_release','workspace_demo_accounts','organizations','organization_memberships','organization_campuses','organization_invitations','organization_audit','workspace_resources','workspace_outbox'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON public.organizations,public.organization_memberships,public.organization_campuses,public.workspace_resources TO authenticated;
CREATE POLICY organization_own_read ON public.organizations FOR SELECT TO authenticated USING(public.has_organization_permission(id,'resource.read'));
CREATE POLICY memberships_own_read ON public.organization_memberships FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.has_organization_permission(organization_id,'members.read'));
CREATE POLICY campus_own_read ON public.organization_campuses FOR SELECT TO authenticated USING(public.has_organization_permission(organization_id,'resource.read'));
CREATE POLICY resource_own_read ON public.workspace_resources FOR SELECT TO authenticated
 USING(public.has_organization_permission(organization_id,CASE WHEN type='moderation' THEN 'moderation.manage' ELSE 'resource.read' END));

CREATE FUNCTION public.get_workspace_access() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_enabled boolean; BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE) THEN
 RETURN jsonb_build_object('enabled',false,'can_create',false); END IF;
 SELECT enabled OR public.current_demo_cohort() IS NOT NULL OR public.is_admin() INTO v_enabled FROM public.workspace_release WHERE singleton;
 RETURN jsonb_build_object('enabled',coalesce(v_enabled,false),'can_create',coalesce(v_enabled,false) AND public.current_demo_cohort() IS NULL);
END $$;
CREATE FUNCTION public.list_my_workspaces() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name),'[]') FROM (
 SELECT o.id,o.kind,o.subtype,o.name,o.slug,o.city,o.verification_status,o.status,o.demo_cohort_id,m.role,
 public.workspace_role_permissions(m.role) permissions
 FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id
 WHERE m.user_id=auth.uid() AND public.has_organization_permission(o.id,'resource.read')
 AND (public.get_workspace_access()->>'enabled')::boolean) x $$;
CREATE FUNCTION public.create_workspace(p_kind text,p_name text,p_subtype text DEFAULT NULL,p_city text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid:=gen_random_uuid();v_actor uuid:=auth.uid();BEGIN
 IF v_actor IS NULL OR (public.get_workspace_access()->>'can_create')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'workspace_creation_unavailable' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN('housing','community','leisure') OR p_kind IS NULL THEN RAISE EXCEPTION 'invalid_workspace_kind'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text,42));
 IF (SELECT count(*) FROM public.organization_memberships WHERE user_id=v_actor AND role='owner' AND status='active')>=10 THEN RAISE EXCEPTION 'workspace_limit'; END IF;
 INSERT INTO public.organizations(id,kind,name,slug,subtype,city,created_by,billing_owner_id)
 VALUES(v_id,p_kind,btrim(p_name),p_kind||'-'||replace(v_id::text,'-',''),p_subtype,nullif(btrim(p_city),''),v_actor,v_actor);
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_id,v_actor,'owner');
 INSERT INTO public.organization_audit(organization_id,actor_id,action) VALUES(v_id,v_actor,'organization.created');
 RETURN (SELECT x FROM jsonb_array_elements(public.list_my_workspaces()) x WHERE x->>'id'=v_id::text);
END $$;
CREATE FUNCTION public.get_workspace_members(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_require(p_organization_id,'members.read');
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',coalesce(p.full_name,'Miembro'),'role',m.role,'status',m.status,'joined_at',m.joined_at) ORDER BY m.joined_at),'[]')
 FROM public.organization_memberships m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=p_organization_id);
END $$;
CREATE FUNCTION public.invite_workspace_member(p_organization_id uuid,p_email text,p_role text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_id uuid;v_actor_role text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'members.manage');
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_external_invitation_disabled'; END IF;
 IF p_email IS NULL OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(p_email)>254 THEN RAISE EXCEPTION 'invalid_email'; END IF;
 SELECT role INTO v_actor_role FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=auth.uid();
 IF p_role NOT IN('admin','editor','moderator','analyst','finance','checkin','member') OR p_role IS NULL THEN RAISE EXCEPTION 'invalid_role'; END IF;
 IF p_role IN('admin','finance') AND (v_actor_role<>'owner' OR coalesce(auth.jwt()->>'aal','')<>'aal2') THEN RAISE EXCEPTION 'owner_mfa_required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.organization_invitations(organization_id,email,role,invited_by)
 VALUES(p_organization_id,lower(btrim(p_email)),p_role,auth.uid())
 ON CONFLICT(organization_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL
 DO UPDATE SET role=excluded.role,expires_at=now()+interval '7 days',invited_by=auth.uid() RETURNING id INTO v_id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'member.invited',v_id);
 RETURN jsonb_build_object('id',v_id,'status','pending','expires_at',now()+interval '7 days');
END $$;
CREATE FUNCTION public.list_workspace_invitations() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_email text; BEGIN
 IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL THEN RETURN '[]'; END IF;
 SELECT lower(u.email) INTO v_email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=auth.uid() AND p.email_verified_at IS NOT NULL AND p.is_discarded IS NOT TRUE;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'organization_name',o.name,'role',i.role,'expires_at',i.expires_at)),'[]') FROM public.organization_invitations i JOIN public.organizations o ON o.id=i.organization_id
 WHERE i.email=v_email AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND o.status='active' AND o.demo_cohort_id IS NULL);
END $$;
CREATE FUNCTION public.accept_workspace_invitation(p_invitation_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_inv public.organization_invitations%ROWTYPE;v_email text; BEGIN
 IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT lower(u.email) INTO v_email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=auth.uid() AND p.email_verified_at IS NOT NULL AND p.is_discarded IS NOT TRUE;
 SELECT * INTO v_inv FROM public.organization_invitations WHERE id=p_invitation_id FOR UPDATE;
 IF NOT FOUND OR v_inv.email IS DISTINCT FROM v_email OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at<=now()
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_inv.organization_id AND status='active' AND demo_cohort_id IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.user_id
 WHERE m.organization_id=v_inv.organization_id AND m.user_id=v_inv.invited_by AND m.status='active' AND p.is_discarded IS NOT TRUE
 AND 'members.manage'=ANY(public.workspace_role_permissions(m.role)) AND (v_inv.role NOT IN('admin','finance') OR m.role='owner')) THEN RAISE EXCEPTION 'invitation_revoked' USING ERRCODE='42501'; END IF;
 IF v_inv.accepted_at IS NOT NULL THEN RETURN jsonb_build_object('organization_id',v_inv.organization_id); END IF;
 IF v_inv.role IN('admin','finance') AND coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_inv.organization_id,auth.uid(),v_inv.role)
 ON CONFLICT(organization_id,user_id) DO UPDATE SET role=CASE WHEN organization_memberships.role='owner' THEN 'owner' ELSE excluded.role END,status='active';
 UPDATE public.organization_invitations SET accepted_at=now() WHERE id=p_invitation_id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(v_inv.organization_id,auth.uid(),'member.accepted',p_invitation_id);
 RETURN jsonb_build_object('organization_id',v_inv.organization_id);
END $$;
CREATE FUNCTION public.revoke_workspace_member(p_organization_id uuid,p_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text; v_self_role text; BEGIN
 PERFORM public.workspace_require(p_organization_id,'members.manage');
 PERFORM 1 FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 SELECT role INTO v_role FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=p_user_id AND status='active';
 SELECT role INTO v_self_role FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=auth.uid();
 IF v_role='owner' OR (v_role IN('admin','finance') AND v_self_role<>'owner') THEN RAISE EXCEPTION 'ownership_transfer_required'; END IF;
 IF v_role IN('admin','finance') AND coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE='42501'; END IF;
 UPDATE public.organization_memberships SET status='revoked' WHERE organization_id=p_organization_id AND user_id=p_user_id;
 UPDATE public.organization_invitations SET revoked_at=now() WHERE organization_id=p_organization_id AND invited_by=p_user_id AND accepted_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'member.revoked',p_user_id);
 RETURN FOUND;
END $$;
CREATE FUNCTION public.transfer_workspace_ownership(p_organization_id uuid,p_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_require(p_organization_id,'settings.manage');
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'owner_mfa_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=auth.uid() AND role='owner' AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=p_user_id AND status='active') THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
 UPDATE public.organization_memberships SET role='owner' WHERE organization_id=p_organization_id AND user_id=p_user_id;
 UPDATE public.organization_memberships SET role='admin' WHERE organization_id=p_organization_id AND user_id=auth.uid();
 -- Financial counterparty does not silently change when the operational owner changes.
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'organization.ownership_transferred',p_user_id);
 RETURN true;
END $$;

-- SQL Data API functions are an explicit allowlist; new definer helpers are never public.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('get_workspace_access','list_my_workspaces','create_workspace','get_workspace_members','invite_workspace_member','list_workspace_invitations','accept_workspace_invitation','revoke_workspace_member','transfer_workspace_ownership') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('workspace-media','workspace-media',false,10485760,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY workspace_media_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='workspace-media' AND public.has_organization_permission(CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN split_part(name,'/',1)::uuid ELSE NULL END,'resource.read'));
CREATE POLICY workspace_media_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='workspace-media' AND split_part(name,'/',2)=auth.uid()::text AND public.has_organization_permission(CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN split_part(name,'/',1)::uuid ELSE NULL END,'content.manage'));
CREATE POLICY workspace_media_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='workspace-media' AND public.has_organization_permission(CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN split_part(name,'/',1)::uuid ELSE NULL END,'content.manage'));
$franky_component_2$;

-- SOURCE 20260922171424_workspace_operations.sql
EXECUTE $franky_component_3$
-- Existing resources keep their identifiers and payments. Workspaces add ownership context.
ALTER TABLE public.accommodations ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.leisure_spots ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.communities ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.fomo_threads ADD COLUMN publishing_organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.fomo_replies ADD COLUMN publishing_organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
CREATE INDEX accommodations_organization_idx ON public.accommodations(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX events_organization_idx ON public.events(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX leisure_organization_idx ON public.leisure_spots(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX communities_organization_idx ON public.communities(organization_id) WHERE organization_id IS NOT NULL;

-- Protect direct Data API writes, including INSERT; verified status cannot be self-awarded.
CREATE FUNCTION public.guard_workspace_resource_authority() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_new jsonb:=to_jsonb(NEW);v_old jsonb;v_key text; BEGIN
 IF current_user NOT IN('anon','authenticated') THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN v_old:=to_jsonb(OLD); END IF;
 FOREACH v_key IN ARRAY ARRAY['is_verified','is_promoted','is_featured','publishing_organization_id','organization_id'] LOOP
 IF NOT v_new ? v_key THEN CONTINUE; END IF;
 IF (TG_OP='INSERT' AND coalesce(v_new->v_key,'null') NOT IN('null'::jsonb,'false'::jsonb))
 OR (TG_OP='UPDATE' AND v_new->v_key IS DISTINCT FROM v_old->v_key) THEN
 RAISE EXCEPTION 'workspace_server_fields' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_resource_authority() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accommodations','events','leisure_spots','communities','fomo_threads','fomo_replies'] LOOP
 EXECUTE format('CREATE TRIGGER a_workspace_authority BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_resource_authority()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.workspace_resource_json(p_resource public.workspace_resources) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p_resource.id,'type',p_resource.type,'title',p_resource.title,
 'subtitle',p_resource.data->>'city','status',p_resource.status,'starts_at',p_resource.data->>'starts_at',
 'image_url',p_resource.data->'images'->>0,'data',p_resource.data,'updated_at',p_resource.updated_at) $$;
REVOKE ALL ON FUNCTION public.workspace_resource_json(public.workspace_resources) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_workspace_resources(p_organization_id uuid,p_resource_type text,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next text;BEGIN
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_resource_type='moderation' THEN 'moderation.manage' ELSE 'resource.read' END);
 IF p_resource_type='moderation' AND public.current_demo_cohort() IS NULL THEN RETURN public.get_workspace_moderation(p_organization_id,p_cursor,p_limit); END IF;
 IF p_resource_type NOT IN('housing','visit','community','event','venue','post','academic','conversation','moderation') OR p_resource_type IS NULL THEN RAISE EXCEPTION 'invalid_resource_type'; END IF;
 SELECT coalesce(jsonb_agg(public.workspace_resource_json(r) ORDER BY r.id),'[]') INTO v_items
 FROM (SELECT * FROM public.workspace_resources WHERE organization_id=p_organization_id AND type=p_resource_type
 AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT v_limit+1) r;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;

-- Validate in SQL as well as in the UI: authenticated users can call RPCs directly.
CREATE FUNCTION public.workspace_validate_data(p_kind text,p_type text,p_data jsonb,p_publish boolean,p_org uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v jsonb;v_images jsonb;v_path text;v_price numeric;BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>50000 THEN RAISE EXCEPTION 'invalid_resource_data'; END IF;
 IF NOT (p_type='event' OR p_type IN('post','academic') AND p_kind='university'
 OR p_type='housing' AND p_kind='housing' OR p_type='venue' AND p_kind='leisure'
 OR p_type='community' AND p_kind='community' OR p_type='post' AND p_kind IN('community','leisure')) THEN RAISE EXCEPTION 'resource_kind_mismatch'; END IF;
 IF length(btrim(coalesce(p_data->>'title',''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'invalid_title'; END IF;
 IF length(coalesce(p_data->>'description',''))>10000 OR length(coalesce(p_data->>'body',''))>10000 THEN RAISE EXCEPTION 'content_too_long'; END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO v FROM jsonb_each(p_data)
 WHERE key=ANY(ARRAY['title','description','body','city','address','price_monthly','bedrooms','bathrooms','area_m2','images','available_from','category','starts_at','ends_at','capacity','price_cents','visibility','join_policy','campus_id','source_url','academic_year','resource_url','audience','minimum_age']);
 v_images:=coalesce(v->'images','[]');
 IF jsonb_typeof(v_images)<>'array' OR jsonb_array_length(v_images)>20 THEN RAISE EXCEPTION 'invalid_images'; END IF;
 FOR v_path IN SELECT jsonb_array_elements_text(v_images) LOOP
 IF split_part(v_path,'/',1)<>p_org::text OR v_path LIKE '%..%' OR length(v_path)>500 THEN RAISE EXCEPTION 'invalid_media_path'; END IF;
 END LOOP;
 IF p_publish AND p_type IN('housing','venue','event') AND length(btrim(coalesce(v->>'city',''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'city_required'; END IF;
 IF p_type='housing' THEN
 v_price:=coalesce((v->>'price_monthly')::numeric,0);
 IF v_price<0 OR v_price>100000 OR (p_publish AND v_price<=0) THEN RAISE EXCEPTION 'invalid_price'; END IF;
 IF coalesce((v->>'bedrooms')::integer,1) NOT BETWEEN 0 AND 100 OR coalesce((v->>'bathrooms')::integer,1) NOT BETWEEN 0 AND 100
 OR coalesce((v->>'area_m2')::integer,1) NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'invalid_housing_details'; END IF;
 END IF;
 IF p_type='event' THEN
 IF coalesce((v->>'price_cents')::integer,0) NOT BETWEEN 0 AND 999999 THEN RAISE EXCEPTION 'invalid_price'; END IF;
 IF v->>'capacity' IS NOT NULL AND (v->>'capacity')::integer NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'invalid_capacity'; END IF;
 IF p_publish AND (nullif(v->>'starts_at','') IS NULL OR (v->>'starts_at')::timestamptz<=now()) THEN RAISE EXCEPTION 'future_start_required'; END IF;
 IF nullif(v->>'ends_at','') IS NOT NULL AND (v->>'ends_at')::timestamptz<=(v->>'starts_at')::timestamptz THEN RAISE EXCEPTION 'invalid_end_time'; END IF;
 END IF;
 IF p_type='community' AND (coalesce(v->>'visibility','public') NOT IN('public','private') OR coalesce(v->>'join_policy','open') NOT IN('open','request','invite')) THEN RAISE EXCEPTION 'invalid_community_policy'; END IF;
 IF p_type='academic' AND p_publish AND (coalesce(v->>'source_url','') !~ '^https://[^[:space:]]+$' OR coalesce(v->>'academic_year','') !~ '^[0-9]{4}(-[0-9]{4})?$') THEN RAISE EXCEPTION 'academic_source_required'; END IF;
 RETURN v;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'invalid_resource_value';
END $$;
REVOKE ALL ON FUNCTION public.workspace_validate_data(text,text,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_workspace_resource(p_organization_id uuid,p_resource_type text,p_data jsonb,p_resource_id uuid DEFAULT NULL,p_publish boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org public.organizations%ROWTYPE;v_r public.workspace_resources%ROWTYPE;v_data jsonb;v_id uuid;v_source uuid;v_uni uuid;v_images text[];v_price numeric;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 SELECT * INTO v_org FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 IF p_resource_id IS NULL AND nullif(p_data->>'client_request_id','') IS NOT NULL THEN
   IF length(p_data->>'client_request_id')>100 THEN RAISE EXCEPTION 'invalid_request_id'; END IF;
   SELECT id INTO p_resource_id FROM public.workspace_resources WHERE organization_id=p_organization_id AND type=p_resource_type AND data->>'client_request_id'=p_data->>'client_request_id';
 END IF;
 v_data:=public.workspace_validate_data(v_org.kind,p_resource_type,p_data,p_publish,p_organization_id);
 IF nullif(p_data->>'client_request_id','') IS NOT NULL THEN v_data:=v_data||jsonb_build_object('client_request_id',p_data->>'client_request_id'); END IF;
 IF p_resource_id IS NOT NULL THEN
 SELECT * INTO v_r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type=p_resource_type FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 IF v_r.status='archived' THEN RAISE EXCEPTION 'resource_archived'; END IF;
 END IF;
 SELECT university_id INTO v_uni FROM public.organization_campuses WHERE organization_id=p_organization_id ORDER BY university_id LIMIT 1;
 IF nullif(v_data->>'campus_id','') IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=p_organization_id AND university_id=(v_data->>'campus_id')::uuid) THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501'; END IF;
 v_uni:=(v_data->>'campus_id')::uuid;
 END IF;
 v_id:=coalesce(p_resource_id,gen_random_uuid());v_source:=v_r.source_id;
 -- Demo resources NEVER enter legacy public tables, payment triggers, notifications or jobs.
 IF p_publish AND v_org.demo_cohort_id IS NULL THEN
 IF v_org.billing_owner_id IS NULL AND p_resource_type IN('housing','venue','event') THEN RAISE EXCEPTION 'billing_owner_required'; END IF;
 SELECT coalesce(array_agg('https://franky.es/api/workspaces/media/'||value),'{}') INTO v_images FROM jsonb_array_elements_text(coalesce(v_data->'images','[]'));
 IF p_resource_type='housing' THEN
 v_price:=(v_data->>'price_monthly')::numeric;
 IF v_source IS NULL THEN
 INSERT INTO public.accommodations(owner_id,organization_id,title,description,type,price,city,address,rooms,bathrooms,sqm,images,status,available_from,is_paid)
 VALUES(v_org.billing_owner_id,p_organization_id,v_data->>'title',v_data->>'description','piso_completo',v_price,v_data->>'city',v_data->>'address',coalesce((v_data->>'bedrooms')::int,1),coalesce((v_data->>'bathrooms')::int,1),(v_data->>'area_m2')::int,v_images,'active',nullif(v_data->>'available_from','')::date,false) RETURNING id INTO v_source;
 ELSE UPDATE public.accommodations SET title=v_data->>'title',description=v_data->>'description',price=v_price,city=v_data->>'city',address=v_data->>'address',rooms=coalesce((v_data->>'bedrooms')::int,1),bathrooms=coalesce((v_data->>'bathrooms')::int,1),sqm=(v_data->>'area_m2')::int,images=v_images,available_from=nullif(v_data->>'available_from','')::date WHERE id=v_source AND organization_id=p_organization_id; END IF;
 ELSIF p_resource_type='venue' THEN
 IF v_source IS NULL THEN INSERT INTO public.leisure_spots(owner_id,organization_id,name,description,city,address,category,images,is_paid)
 VALUES(v_org.billing_owner_id,p_organization_id,v_data->>'title',v_data->>'description',v_data->>'city',v_data->>'address',coalesce(v_data->>'category','bar'),v_images,false) RETURNING id INTO v_source;
 ELSE UPDATE public.leisure_spots SET name=v_data->>'title',description=v_data->>'description',city=v_data->>'city',address=v_data->>'address',category=coalesce(v_data->>'category','bar'),images=v_images WHERE id=v_source AND organization_id=p_organization_id; END IF;
 ELSIF p_resource_type='event' THEN
 v_price:=coalesce((v_data->>'price_cents')::numeric,0)/100;
 IF v_price>0 AND NOT EXISTS(SELECT 1 FROM public.connect_accounts WHERE user_id=v_org.billing_owner_id AND charges_enabled AND payouts_enabled) THEN RAISE EXCEPTION 'connect_setup_required'; END IF;
 IF v_source IS NULL THEN INSERT INTO public.events(organization_id,organizer_id,university_id,title,description,city,address,start_date,end_date,category,price,max_capacity,photos,payment_mode)
 VALUES(p_organization_id,v_org.billing_owner_id,v_uni,v_data->>'title',v_data->>'description',v_data->>'city',v_data->>'address',(v_data->>'starts_at')::timestamptz,nullif(v_data->>'ends_at','')::timestamptz,coalesce(v_data->>'category','otro'),v_price,(v_data->>'capacity')::int,v_images,CASE WHEN v_price>0 THEN 'app' ELSE 'free' END) RETURNING id INTO v_source;
 ELSE
 IF EXISTS(SELECT 1 FROM public.event_tickets WHERE event_id=v_source AND status IN('valid','used','pending_payment')) AND EXISTS(SELECT 1 FROM public.events WHERE id=v_source AND (price IS DISTINCT FROM v_price OR start_date IS DISTINCT FROM (v_data->>'starts_at')::timestamptz)) THEN RAISE EXCEPTION 'event_has_registrations'; END IF;
 UPDATE public.events SET title=v_data->>'title',description=v_data->>'description',city=v_data->>'city',address=v_data->>'address',start_date=(v_data->>'starts_at')::timestamptz,end_date=nullif(v_data->>'ends_at','')::timestamptz,price=v_price,max_capacity=(v_data->>'capacity')::int,photos=v_images WHERE id=v_source AND organization_id=p_organization_id; END IF;
 ELSIF p_resource_type='community' THEN
 IF v_source IS NULL THEN INSERT INTO public.communities(organization_id,name,description,created_by,university_id,is_private)
 VALUES(p_organization_id,left(v_data->>'title',80),v_data->>'description',auth.uid(),v_uni,coalesce(v_data->>'visibility','public')='private') RETURNING id INTO v_source;
 ELSE UPDATE public.communities SET name=left(v_data->>'title',80),description=v_data->>'description',is_private=coalesce(v_data->>'visibility','public')='private' WHERE id=v_source AND organization_id=p_organization_id; END IF;
 ELSIF p_resource_type='post' AND v_org.kind='university' THEN
 IF v_uni IS NULL OR v_org.verification_status<>'verified' THEN RAISE EXCEPTION 'verified_campus_required'; END IF;
 IF v_source IS NULL THEN INSERT INTO public.fomo_threads(university_id,author_id,publishing_organization_id,is_anonymous,body)
 VALUES(v_uni,auth.uid(),p_organization_id,false,coalesce(v_data->>'body',v_data->>'description',v_data->>'title')) RETURNING id INTO v_source;
 ELSE UPDATE public.fomo_threads SET body=coalesce(v_data->>'body',v_data->>'description',v_data->>'title') WHERE id=v_source AND publishing_organization_id=p_organization_id; END IF;
 END IF;
 END IF;
 INSERT INTO public.workspace_resources(id,organization_id,type,title,status,data,source_id,created_by,updated_by)
 VALUES(v_id,p_organization_id,p_resource_type,v_data->>'title',CASE WHEN p_publish AND p_resource_type='academic' THEN 'pending_review' WHEN p_publish THEN 'published' ELSE 'draft' END,v_data,v_source,auth.uid(),auth.uid())
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=CASE WHEN workspace_resources.status='published' AND NOT p_publish THEN 'published' ELSE excluded.status END,data=excluded.data,source_id=excluded.source_id,updated_by=auth.uid(),updated_at=now() RETURNING * INTO v_r;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),CASE WHEN p_publish THEN 'resource.published' ELSE 'resource.saved' END,v_id);
 RETURN public.workspace_resource_json(v_r);
END $$;

CREATE FUNCTION public.get_workspace_resource(p_organization_id uuid,p_resource_type text,p_resource_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_r public.workspace_resources%ROWTYPE; BEGIN
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_resource_type='moderation' THEN 'moderation.manage' ELSE 'resource.read' END);
 IF p_resource_type='moderation' AND public.current_demo_cohort() IS NULL THEN
   RETURN public.get_workspace_moderation(p_organization_id,NULL,1,p_resource_id)->'items'->0;
 END IF;
 SELECT * INTO v_r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type=p_resource_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 RETURN public.workspace_resource_json(v_r);
END $$;

CREATE FUNCTION public.workspace_resource_action(p_organization_id uuid,p_resource_type text,p_resource_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_r public.workspace_resources%ROWTYPE;v_id uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_resource_type='moderation' THEN 'moderation.manage' ELSE 'content.manage' END);
 IF p_resource_type='moderation' AND public.current_demo_cohort() IS NULL THEN RETURN public.workspace_moderate(p_organization_id,p_resource_id,p_action,p_data->>'reason',CASE WHEN p_data ? 'duration_days' THEN (p_data->>'duration_days')::integer ELSE 7 END); END IF;
 SELECT * INTO v_r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type=p_resource_type FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 IF p_resource_type='moderation' AND public.current_demo_cohort() IS NOT NULL AND p_action IN('hide','restore','resolve','sanction') THEN
 IF length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'moderation_reason_required'; END IF;
 UPDATE public.workspace_resources SET status=CASE WHEN p_action='restore' THEN 'open' ELSE 'resolved' END,updated_at=now(),data=data||jsonb_build_object('last_action',p_action,'reason',p_data->>'reason') WHERE id=v_r.id RETURNING * INTO v_r;
 ELSIF p_action='duplicate' AND v_r.type IN('housing','event','venue','community') THEN
 INSERT INTO public.workspace_resources(organization_id,type,title,data,created_by,updated_by)
 VALUES(p_organization_id,v_r.type,left(v_r.title||' (copia)',160),(v_r.data-'client_request_id')||jsonb_build_object('title',left(v_r.title||' (copia)',160)),auth.uid(),auth.uid()) RETURNING * INTO v_r;
 ELSIF p_action='archive' AND v_r.type IN('housing','event','venue','community','post') THEN
 IF v_r.type='event' AND v_r.source_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.event_tickets WHERE event_id=v_r.source_id AND status IN('valid','pending_payment')) THEN RAISE EXCEPTION 'event_refund_review_required'; END IF;
 IF v_r.source_id IS NOT NULL THEN
 IF v_r.type='housing' THEN UPDATE public.accommodations SET status='inactive' WHERE id=v_r.source_id AND organization_id=p_organization_id;
 ELSIF v_r.type='community' THEN UPDATE public.communities SET is_deleted=true WHERE id=v_r.source_id AND organization_id=p_organization_id;
 ELSIF v_r.type='event' THEN UPDATE public.events SET status='cancelled' WHERE id=v_r.source_id AND organization_id=p_organization_id;
 ELSIF v_r.type='venue' THEN UPDATE public.leisure_spots SET is_paid=false WHERE id=v_r.source_id AND organization_id=p_organization_id;
 ELSIF v_r.type='post' THEN UPDATE public.fomo_threads SET is_deleted=true WHERE id=v_r.source_id AND publishing_organization_id=p_organization_id;
 END IF; END IF;
 UPDATE public.workspace_resources SET status='archived',updated_at=now(),updated_by=auth.uid() WHERE id=v_r.id RETURNING * INTO v_r;
 ELSE RAISE EXCEPTION 'unsupported_resource_action'; END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'resource.'||p_action,v_r.id);
 RETURN public.workspace_resource_json(v_r);
END $$;

CREATE FUNCTION public.get_workspace_dashboard(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org jsonb;v_metrics jsonb:='[]';v_activity jsonb;v_resources jsonb;v_count bigint;v_net bigint;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');
 SELECT x INTO v_org FROM jsonb_array_elements(public.list_my_workspaces()) x WHERE x->>'id'=p_organization_id::text;
 IF v_org IS NULL THEN RAISE EXCEPTION 'workspace_unavailable'; END IF;
 IF public.has_organization_permission(p_organization_id,'analytics.read') THEN
 SELECT count(*) INTO v_count FROM public.workspace_resources WHERE organization_id=p_organization_id AND status='published';
 v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','published','label','Publicaciones activas','value',v_count));
 SELECT count(*) INTO v_count FROM public.organization_memberships WHERE organization_id=p_organization_id AND status='active';
 v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','team','label','Personas del equipo','value',v_count));
 SELECT count(*) INTO v_count FROM public.workspace_resources WHERE organization_id=p_organization_id AND status='draft';
 v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','drafts','label','Borradores','value',v_count));
 END IF;
 IF public.has_organization_permission(p_organization_id,'finance.read') THEN
 SELECT coalesce(sum(p.amount_cents-p.refunded_cents-p.application_fee_cents),0) INTO v_net FROM public.payments p
 WHERE p.status IN('succeeded','partially_refunded') AND (
 (p.ref_table='event_tickets' AND EXISTS(SELECT 1 FROM public.event_tickets t JOIN public.events e ON e.id=t.event_id WHERE t.id=p.ref_id AND e.organization_id=p_organization_id))
 OR (p.ref_table='visit_bookings' AND EXISTS(SELECT 1 FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE b.id=p.ref_id AND a.organization_id=p_organization_id)));
 v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','net','label','Cobrado neto registrado','value',v_net,'unit','cents'));
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'action',x.action,'created_at',x.created_at)),'[]') INTO v_activity FROM
 (SELECT id,action,created_at FROM public.organization_audit WHERE organization_id=p_organization_id ORDER BY created_at DESC LIMIT 10) x;
 SELECT coalesce(jsonb_agg(public.workspace_resource_json(x)),'[]') INTO v_resources FROM
 (SELECT * FROM public.workspace_resources WHERE organization_id=p_organization_id AND type<>'moderation' ORDER BY updated_at DESC LIMIT 5) x;
 RETURN jsonb_build_object('organization',v_org,'metrics',v_metrics,'activity',v_activity,'resources',v_resources);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('get_workspace_resources','get_workspace_resource','save_workspace_resource','workspace_resource_action','get_workspace_dashboard') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END LOOP;
END $$;
$franky_component_3$;

-- SOURCE 20260922172009_workspace_institutional_safety.sql
EXECUTE $franky_component_4$
-- Institution authority is granted only by the platform administrator with MFA.
CREATE TABLE public.workspace_moderation_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 campus_id uuid NOT NULL REFERENCES public.universities(id),target_type text NOT NULL CHECK(target_type IN('thread','reply')),
 target_id uuid NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN('hide','restore','resolve','sanction')),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_campus_sanctions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 campus_id uuid NOT NULL REFERENCES public.universities(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 imposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX workspace_campus_sanction_idx ON public.workspace_campus_sanctions(campus_id,user_id) WHERE revoked_at IS NULL;
CREATE TABLE public.workspace_moderation_appeals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),action_id uuid NOT NULL REFERENCES public.workspace_moderation_actions(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),body text NOT NULL CHECK(length(btrim(body)) BETWEEN 10 AND 3000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','upheld','overturned')),
 resolution text,resolved_by uuid REFERENCES auth.users(id),resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(action_id,user_id)
);
CREATE TABLE public.workspace_demo_attendees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 event_resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),name text NOT NULL,
 qr_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,status text NOT NULL DEFAULT 'valid' CHECK(status IN('valid','used','cancelled')),
 checked_in_at timestamptz,checked_in_by uuid REFERENCES auth.users(id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_moderation_actions','workspace_campus_sanctions','workspace_moderation_appeals','workspace_demo_attendees'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;

CREATE FUNCTION public.workspace_admin_required() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() OR NOT public.account_session_usable() OR coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 RETURN auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.workspace_admin_required() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_create_university_workspace(p_name text,p_university_ids uuid[],p_manager_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid:=gen_random_uuid();v_uni uuid;BEGIN
 PERFORM public.workspace_admin_required();
 IF coalesce(cardinality(p_university_ids),0) NOT BETWEEN 1 AND 30 OR p_manager_id IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_manager_id AND is_discarded IS NOT TRUE AND email_verified_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_manager_id) THEN RAISE EXCEPTION 'invalid_institution_assignment'; END IF;
 INSERT INTO public.organizations(id,kind,name,slug,verification_status,created_by,billing_owner_id)
 VALUES(v_id,'university',p_name,'universidad-'||replace(v_id::text,'-',''),'verified',auth.uid(),p_manager_id);
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_id,p_manager_id,'owner');
 FOREACH v_uni IN ARRAY p_university_ids LOOP
 INSERT INTO public.organization_campuses(organization_id,university_id) VALUES(v_id,v_uni) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(v_id,auth.uid(),'university.granted',p_manager_id);
 RETURN v_id;
END $$;
CREATE FUNCTION public.admin_list_workspaces(p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,kind,name,city,status,verification_status,demo_cohort_id,created_at FROM public.organizations WHERE p_cursor IS NULL OR id>p_cursor ORDER BY id LIMIT 50) x);
END $$;
CREATE FUNCTION public.admin_workspace_action(p_organization_id uuid,p_action text,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required'; END IF;
 IF p_action='verify' THEN UPDATE public.organizations SET verification_status='verified',updated_at=now() WHERE id=p_organization_id;
 ELSIF p_action='unverify' THEN UPDATE public.organizations SET verification_status='unverified',updated_at=now() WHERE id=p_organization_id;
 ELSIF p_action='suspend' THEN UPDATE public.organizations SET status='suspended',updated_at=now() WHERE id=p_organization_id;
 ELSIF p_action='restore' THEN UPDATE public.organizations SET status='active',updated_at=now() WHERE id=p_organization_id;
 ELSE RAISE EXCEPTION 'invalid_action'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found'; END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,details) VALUES(p_organization_id,auth.uid(),'admin.'||p_action,jsonb_build_object('reason',p_reason));
 RETURN true;
END $$;
CREATE FUNCTION public.admin_workspace_release(p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 UPDATE public.workspace_release SET enabled=p_enabled,updated_at=now() WHERE singleton;
 RETURN jsonb_build_object('enabled',p_enabled);
END $$;

CREATE FUNCTION public.get_workspace_moderation(p_organization_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30,p_report_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'moderation.manage');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'type','moderation','title','Publicación reportada','subtitle',r.reason,'status',r.status,
 'data',jsonb_build_object('body',r.body,'campus_id',r.university_id,'target_type',r.target_type,'target_id',r.target_id,'reason',r.reason)) ORDER BY r.id),'[]') INTO v_items
 FROM (SELECT f.id,f.target_type,f.target_id,f.reason,f.status,coalesce(t.body,reply.body) body,coalesce(t.university_id,rt.university_id) university_id
 FROM public.fomo_reports f LEFT JOIN public.fomo_threads t ON f.target_type='thread' AND t.id=f.target_id
 LEFT JOIN public.fomo_replies reply ON f.target_type='reply' AND reply.id=f.target_id
 LEFT JOIN public.fomo_threads rt ON rt.id=reply.thread_id
 JOIN public.organization_campuses c ON c.university_id=coalesce(t.university_id,rt.university_id) AND c.organization_id=p_organization_id
 WHERE (p_cursor IS NULL OR f.id>p_cursor) AND (p_report_id IS NULL OR f.id=p_report_id)
 ORDER BY f.id LIMIT v_limit+1) r;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;

CREATE FUNCTION public.workspace_moderate(p_organization_id uuid,p_report_id uuid,p_action text,p_reason text,p_duration_days integer DEFAULT 7) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_report public.fomo_reports%ROWTYPE;v_uni uuid;v_author uuid;v_thread uuid;v_hidden boolean;v_id uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'moderation.manage');
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 OR p_action NOT IN('hide','restore','resolve','sanction') OR p_action IS NULL THEN RAISE EXCEPTION 'moderation_reason_required'; END IF;
 IF p_duration_days IS NOT NULL AND p_duration_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'invalid_sanction_duration'; END IF;
 SELECT * INTO v_report FROM public.fomo_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
 IF v_report.target_type='thread' THEN SELECT university_id,author_id,id,is_hidden INTO v_uni,v_author,v_thread,v_hidden FROM public.fomo_threads WHERE id=v_report.target_id FOR UPDATE;
 ELSE SELECT t.university_id,r.author_id,t.id,r.is_hidden INTO v_uni,v_author,v_thread,v_hidden FROM public.fomo_replies r JOIN public.fomo_threads t ON t.id=r.thread_id WHERE r.id=v_report.target_id FOR UPDATE OF r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=p_organization_id AND university_id=v_uni)
 OR EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND (demo_cohort_id IS NOT NULL OR kind<>'university')) THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501'; END IF;
 IF v_author=auth.uid() THEN RAISE EXCEPTION 'self_moderation_forbidden'; END IF;
 IF p_action='restore' THEN
 -- Restore only an institutional hide still owned by this organization. Global moderation invalidates this marker (trigger below).
 IF NOT EXISTS(SELECT 1 FROM public.workspace_moderation_actions WHERE organization_id=p_organization_id AND target_id=v_report.target_id AND action='hide')
 OR NOT EXISTS(SELECT 1 FROM public.workspace_institutional_hides WHERE target_id=v_report.target_id AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'global_review_required'; END IF;
 END IF;
 IF p_action IN('hide','restore') THEN
 IF v_report.target_type='thread' THEN UPDATE public.fomo_threads SET is_hidden=p_action='hide' WHERE id=v_report.target_id;
 ELSE UPDATE public.fomo_replies SET is_hidden=p_action='hide' WHERE id=v_report.target_id; END IF;
 IF p_action='hide' AND NOT v_hidden THEN INSERT INTO public.workspace_institutional_hides(target_id,organization_id) VALUES(v_report.target_id,p_organization_id) ON CONFLICT(target_id) DO NOTHING;
 ELSIF p_action='restore' THEN DELETE FROM public.workspace_institutional_hides WHERE target_id=v_report.target_id; END IF;
 END IF;
 IF p_action='sanction' THEN
 INSERT INTO public.workspace_campus_sanctions(organization_id,campus_id,user_id,reason,expires_at,imposed_by)
 VALUES(p_organization_id,v_uni,v_author,p_reason,CASE WHEN p_duration_days IS NULL THEN NULL ELSE now()+make_interval(days=>p_duration_days) END,auth.uid()); END IF;
 UPDATE public.fomo_reports SET status='resolved' WHERE id=p_report_id;
 INSERT INTO public.workspace_moderation_actions(organization_id,campus_id,target_type,target_id,actor_id,action,reason)
 VALUES(p_organization_id,v_uni,v_report.target_type,v_report.target_id,auth.uid(),p_action,p_reason) RETURNING id INTO v_id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'moderation.'||p_action,v_id,jsonb_build_object('reason',p_reason));
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(v_author,'system','Revisión de una publicación',p_reason,jsonb_build_object('kind','campus_moderation','action_id',v_id,'url','/apelaciones'));
 RETURN jsonb_build_object('id',p_report_id,'type','moderation','title','Reporte revisado','status','resolved','data',jsonb_build_object('action',p_action));
END $$;
CREATE TABLE public.workspace_institutional_hides(target_id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id));
ALTER TABLE public.workspace_institutional_hides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_institutional_hides FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_institutional_hides TO service_role;
CREATE FUNCTION public.workspace_guard_social() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_uni uuid;BEGIN
 IF TG_TABLE_NAME='fomo_threads' THEN v_uni:=NEW.university_id; ELSE SELECT university_id INTO v_uni FROM public.fomo_threads WHERE id=NEW.thread_id; END IF;
 IF auth.uid() IS NOT NULL AND (TG_OP='INSERT' OR (to_jsonb(NEW)-ARRAY['is_hidden','is_deleted','reply_count','reaction_count','report_count','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['is_hidden','is_deleted','reply_count','reaction_count','report_count','updated_at'])) AND EXISTS(SELECT 1 FROM public.workspace_campus_sanctions WHERE campus_id=v_uni AND user_id=auth.uid() AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'campus_sanction_active' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.is_hidden IS DISTINCT FROM OLD.is_hidden OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted OR public.is_admin()) THEN DELETE FROM public.workspace_institutional_hides WHERE target_id=NEW.id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_guard_social() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_social_guard BEFORE INSERT OR UPDATE ON public.fomo_threads FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_social();
CREATE TRIGGER workspace_social_guard BEFORE INSERT OR UPDATE ON public.fomo_replies FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_social();

CREATE FUNCTION public.get_workspace_attendees(p_organization_id uuid,p_event_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_r public.workspace_resources%ROWTYPE;v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'attendees.manage');
 SELECT * INTO v_r FROM public.workspace_resources WHERE organization_id=p_organization_id AND id=p_event_id AND type='event';
 IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
 IF v_r.status='archived' OR (v_r.source_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.events WHERE id=v_r.source_id AND status='cancelled')) THEN RAISE EXCEPTION 'event_cancelled'; END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO v_items FROM (SELECT id,name,status,checked_in_at FROM public.workspace_demo_attendees WHERE organization_id=p_organization_id AND event_resource_id=p_event_id AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT v_limit+1) x;
 ELSE
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO v_items FROM (SELECT t.id,coalesce(p.full_name,'Asistente') name,t.status,t.used_at checked_in_at FROM public.event_tickets t LEFT JOIN public.profiles p ON p.id=t.holder_id WHERE t.event_id=v_r.source_id AND t.status IN('valid','used') AND (p_cursor IS NULL OR t.id>p_cursor) ORDER BY t.id LIMIT v_limit+1) x;
 END IF;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;
CREATE FUNCTION public.check_in_workspace_attendee(p_organization_id uuid,p_event_id uuid,p_attendee_id uuid DEFAULT NULL,p_qr_token text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_r public.workspace_resources%ROWTYPE;v_ticket uuid;v_status text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'attendees.manage');
 IF (p_attendee_id IS NULL)=(p_qr_token IS NULL) THEN RAISE EXCEPTION 'one_ticket_identifier_required'; END IF;
 SELECT * INTO v_r FROM public.workspace_resources WHERE id=p_event_id AND organization_id=p_organization_id AND type='event';
 IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
 IF v_r.source_id IS NOT NULL THEN PERFORM 1 FROM public.events WHERE id=v_r.source_id FOR UPDATE;END IF;
 IF v_r.status='archived' OR (v_r.source_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.events WHERE id=v_r.source_id AND status='cancelled')) THEN RAISE EXCEPTION 'event_cancelled'; END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
 SELECT id,status INTO v_ticket,v_status FROM public.workspace_demo_attendees WHERE event_resource_id=p_event_id AND organization_id=p_organization_id AND ((p_attendee_id IS NOT NULL AND id=p_attendee_id) OR (p_qr_token IS NOT NULL AND qr_token=p_qr_token)) FOR UPDATE;
 ELSE
 SELECT id,status INTO v_ticket,v_status FROM public.event_tickets WHERE event_id=v_r.source_id AND ((p_attendee_id IS NOT NULL AND id=p_attendee_id) OR (p_qr_token IS NOT NULL AND qr_token=p_qr_token)) FOR UPDATE;
 END IF;
 IF v_ticket IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
 IF v_status='used' THEN RETURN jsonb_build_object('id',v_ticket,'status','already_checked_in'); END IF;
 IF v_status<>'valid' THEN RAISE EXCEPTION 'ticket_not_valid'; END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN UPDATE public.workspace_demo_attendees SET status='used',checked_in_at=now(),checked_in_by=auth.uid() WHERE id=v_ticket;
 ELSE UPDATE public.event_tickets SET status='used',used_at=now(),checked_in_by=auth.uid() WHERE id=v_ticket; END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'attendee.checked_in',v_ticket);
 RETURN jsonb_build_object('id',v_ticket,'status','used');
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('admin_create_university_workspace','admin_list_workspaces','admin_workspace_action','admin_workspace_release','get_workspace_moderation','workspace_moderate','get_workspace_attendees','check_in_workspace_attendee') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END LOOP;
END $$;
$franky_component_4$;

-- SOURCE 20260922173000_native_billing_foundation.sql
EXECUTE $franky_component_5$
-- Native digital sales remain disabled until both store validation and the
-- separately controlled commercial release are complete. Existing Stripe
-- subscriptions are deliberately untouched.
CREATE TABLE public.native_billing_configuration (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 verified_for_sales boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment IN ('SANDBOX','PRODUCTION')),
 product_mapping jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(product_mapping)='array'),
 verified_at timestamptz,
 CHECK (NOT verified_for_sales OR (verified_at IS NOT NULL AND jsonb_array_length(product_mapping)>0))
);
INSERT INTO public.native_billing_configuration(singleton) VALUES (true);
CREATE TABLE public.native_entitlement_snapshots (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
 observed_at_ms bigint NOT NULL CHECK (observed_at_ms>0),
 PRIMARY KEY(user_id,environment)
);
CREATE TABLE public.native_entitlements (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
 entitlement text NOT NULL CHECK (entitlement IN ('franky.pro','franky.premium')),
 product_id text NOT NULL,
 platform text NOT NULL CHECK (platform IN ('ios','android')),
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,environment,entitlement)
);
CREATE TABLE public.native_billing_events (
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 220),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
 observed_at_ms bigint NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id)
);
ALTER TABLE public.native_billing_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_billing_configuration,public.native_entitlement_snapshots,public.native_entitlements,public.native_billing_events FROM anon,authenticated;
GRANT ALL ON public.native_billing_configuration,public.native_entitlement_snapshots,public.native_entitlements,public.native_billing_events TO service_role;
GRANT SELECT ON public.native_entitlements TO authenticated;
CREATE POLICY native_entitlements_own ON public.native_entitlements FOR SELECT TO authenticated
 USING (user_id=auth.uid() AND public.account_session_usable() AND environment='PRODUCTION' AND expires_at>now());

CREATE FUNCTION public.apply_native_entitlement_snapshot(p_user uuid,p_event text,p_observed_ms bigint,p_environment text,p_grants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous_ms bigint; g jsonb; configuration public.native_billing_configuration;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('SANDBOX','PRODUCTION') OR p_observed_ms IS NULL OR p_observed_ms<=0 OR p_observed_ms>extract(epoch from clock_timestamp())*1000+60000
   OR p_event IS NULL OR length(p_event) NOT BETWEEN 1 AND 220 OR p_grants IS NULL OR jsonb_typeof(p_grants)<>'array'
   OR jsonb_array_length(p_grants)>2 THEN RAISE EXCEPTION 'invalid_entitlement_snapshot'; END IF;
 IF EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user) THEN RAISE EXCEPTION 'demo_payments_disabled'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_environment,0));
 IF EXISTS(SELECT 1 FROM public.native_billing_events WHERE event_id=p_event AND user_id=p_user) THEN RETURN jsonb_build_object('applied',false,'duplicate',true); END IF;
 SELECT observed_at_ms INTO previous_ms FROM public.native_entitlement_snapshots WHERE user_id=p_user AND environment=p_environment;
 INSERT INTO public.native_billing_events(event_id,user_id,environment,observed_at_ms) VALUES(p_event,p_user,p_environment,p_observed_ms);
 IF previous_ms IS NOT NULL AND p_observed_ms<=previous_ms THEN RETURN jsonb_build_object('applied',false,'stale',true); END IF;
 SELECT * INTO configuration FROM public.native_billing_configuration WHERE singleton;
 IF configuration.environment<>p_environment THEN RAISE EXCEPTION 'native_environment_mismatch'; END IF;
 DELETE FROM public.native_entitlements WHERE user_id=p_user AND environment=p_environment;
 FOR g IN SELECT value FROM jsonb_array_elements(p_grants) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(configuration.product_mapping) m
   WHERE m->>'productId'=g->>'productId' AND m->>'entitlement'=g->>'entitlement' AND m->>'platform'=g->>'platform')
   OR (g->>'expiresAt')::timestamptz<=to_timestamp(p_observed_ms/1000.0)
   THEN RAISE EXCEPTION 'native_product_unconfigured'; END IF;
  INSERT INTO public.native_entitlements(user_id,environment,entitlement,product_id,platform,expires_at)
   VALUES(p_user,p_environment,g->>'entitlement',g->>'productId',g->>'platform',(g->>'expiresAt')::timestamptz);
 END LOOP;
 INSERT INTO public.native_entitlement_snapshots(user_id,environment,observed_at_ms) VALUES(p_user,p_environment,p_observed_ms)
 ON CONFLICT(user_id,environment) DO UPDATE SET observed_at_ms=excluded.observed_at_ms;
 RETURN jsonb_build_object('applied',true);
END $$;
REVOKE ALL ON FUNCTION public.apply_native_entitlement_snapshot(uuid,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_native_entitlement_snapshot(uuid,text,bigint,text,jsonb) TO service_role;

CREATE FUNCTION public.guard_native_sales_release() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.digital_sales_enabled AND NOT OLD.digital_sales_enabled AND NOT EXISTS(
  SELECT 1 FROM public.native_billing_configuration WHERE singleton AND verified_for_sales AND verified_at IS NOT NULL AND jsonb_array_length(product_mapping)>0
 ) THEN RAISE EXCEPTION 'native_store_validation_required'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_native_sales_release() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_native_sales_ready BEFORE UPDATE OF digital_sales_enabled ON public.workspace_release
 FOR EACH ROW EXECUTE FUNCTION public.guard_native_sales_release();
$franky_component_5$;

-- SOURCE 20260922173347_workspace_continuity.sql
EXECUTE $franky_component_6$
-- Public claims and legacy owner identifiers are not organization authority.
CREATE FUNCTION public.guard_workspace_legacy_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n jsonb;o jsonb;v_org uuid;BEGIN
 IF TG_OP='DELETE' THEN n:=to_jsonb(OLD);ELSE n:=to_jsonb(NEW);END IF;
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD);END IF;
 v_org:=(n->>'organization_id')::uuid;
 IF auth.uid() IS NULL OR v_org IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF current_user IN('anon','authenticated') OR TG_OP IN('INSERT','DELETE') OR
 (n-ARRAY['views_count','updated_at','is_paid','subscription_id','owner_subscription_id','is_verified','is_promoted','is_featured']) IS DISTINCT FROM
 (o-ARRAY['views_count','updated_at','is_paid','subscription_id','owner_subscription_id','is_verified','is_promoted','is_featured']) THEN
 IF NOT public.has_organization_permission(v_org,'content.manage') THEN RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_legacy_mutation() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['accommodations','events','leisure_spots','communities'] LOOP
 EXECUTE format('CREATE TRIGGER workspace_legacy_authority BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_legacy_mutation()',t);
 END LOOP;END $$;

CREATE FUNCTION public.guard_workspace_demo_legacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n jsonb;v_col text;v_target uuid;BEGIN
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501'; END IF;
 n:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 FOREACH v_col IN ARRAY ARRAY['user_id','buyer_id','seller_id','owner_id','organizer_id','holder_id','original_buyer_id','sender_id','author_id','requester_id','target_id','visitor_id'] LOOP
 BEGIN v_target:=(n->>v_col)::uuid;EXCEPTION WHEN invalid_text_representation THEN CONTINUE;END;
 IF v_target IS NOT NULL AND EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=v_target) THEN
 IF TG_TABLE_NAME IN('notifications','device_tokens','analytics_events') THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_demo_legacy() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY[
 'accommodations','events','leisure_spots','communities','community_members','community_posts','fomo_threads','fomo_replies','fomo_reports',
 'messages','conversations','conversation_participants','event_tickets','event_participants','event_waitlist',
 'visit_requests','visit_slots','visit_bookings','visit_schedules','accommodation_requests','payments','connect_accounts','notifications','analytics_events',
 'subscriptions','business_subscriptions','owner_subscriptions','housing_billing_enrollments','device_tokens','contracts','contract_signers','contract_signatures'] LOOP
 IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('CREATE TRIGGER aaa_workspace_demo_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_demo_legacy()',t);END IF;
 END LOOP;END $$;

-- Last-owner removal is serialized, including auth account deletion cascades.
CREATE FUNCTION public.guard_workspace_last_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF OLD.role='owner' AND OLD.status='active' AND (TG_OP='DELETE' OR NEW.role<>'owner' OR NEW.status<>'active') THEN
 PERFORM 1 FROM public.organizations WHERE id=OLD.organization_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.organization_id AND status<>'archived') AND NOT EXISTS(
 SELECT 1 FROM public.organization_memberships WHERE organization_id=OLD.organization_id AND user_id<>OLD.user_id AND role='owner' AND status='active') THEN RAISE EXCEPTION 'last_owner_transfer_required';END IF;END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_last_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_last_owner BEFORE UPDATE OR DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_last_owner();

-- A deleted staff member cannot erase a still-owned organization's content as a side effect.
-- Account erasure must first transfer ownership; the product presents this error before scheduling erasure.
CREATE FUNCTION public.workspace_account_erasure_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.user_id=NEW.user_id AND m.role='owner' AND m.status='active' AND o.status<>'archived') THEN RAISE EXCEPTION 'workspace_transfer_before_erasure';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_account_erasure_guard() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF to_regclass('account_private.erasures') IS NOT NULL THEN
 CREATE TRIGGER workspace_erasure_owner BEFORE INSERT ON account_private.erasures FOR EACH ROW EXECUTE FUNCTION public.workspace_account_erasure_guard();END IF;END $$;

CREATE FUNCTION public.workspace_social_editor(p_relation text,p_row jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_org uuid;BEGIN
 IF auth.uid() IS NULL THEN RETURN false;END IF;
 IF p_relation='communities' THEN v_org:=(p_row->>'organization_id')::uuid;
 ELSIF p_relation='community_posts' THEN SELECT organization_id INTO v_org FROM public.communities WHERE id=(p_row->>'community_id')::uuid;
 ELSIF p_relation IN('fomo_threads','fomo_replies') THEN v_org:=(p_row->>'publishing_organization_id')::uuid;
 ELSE RETURN false;END IF;
 RETURN public.has_organization_permission(v_org,'content.manage');
END $$;
REVOKE ALL ON FUNCTION public.workspace_social_editor(text,jsonb) FROM PUBLIC,anon,authenticated;
-- Preserve the current publication review, safe-upload, consent and erasure guards.
-- Fail rather than silently changing an unknown future function body.
DO $$ DECLARE def text;old_line text;BEGIN
 IF to_regprocedure('social_private.review_community_write()') IS NOT NULL THEN
 SELECT pg_get_functiondef('social_private.review_community_write()'::regprocedure) INTO def;
 old_line:='IF auth.uid() IS NOT NULL AND auth.uid()<>author THEN';
 IF position(old_line IN def)=0 THEN RAISE EXCEPTION 'community_guard_changed_review_required';END IF;
 def:=replace(def,old_line,'IF auth.uid() IS NOT NULL AND auth.uid()<>author AND NOT public.workspace_social_editor(TG_TABLE_NAME,n) THEN');
 def:=replace(def,'PERFORM social_private.require_community_terms(author);','PERFORM social_private.require_community_terms(CASE WHEN public.workspace_social_editor(TG_TABLE_NAME,n) THEN auth.uid() ELSE author END);');
 EXECUTE def;
 END IF;
 IF to_regprocedure('social_private.review_publication_write()') IS NOT NULL THEN
 SELECT pg_get_functiondef('social_private.review_publication_write()'::regprocedure) INTO def;
 old_line:='IF auth.uid() IS NOT NULL AND auth.uid()<>NEW.author_id THEN';
 IF position(old_line IN def)=0 THEN RAISE EXCEPTION 'publication_guard_changed_review_required';END IF;
 def:=replace(def,old_line,'IF auth.uid() IS NOT NULL AND auth.uid()<>NEW.author_id AND NOT public.workspace_social_editor(TG_TABLE_NAME,n) THEN');
 def:=replace(def,'PERFORM social_private.require_community_terms(NEW.author_id);','PERFORM social_private.require_community_terms(CASE WHEN public.workspace_social_editor(TG_TABLE_NAME,n) THEN auth.uid() ELSE NEW.author_id END);');
 EXECUTE def;
 END IF;
END $$;

CREATE FUNCTION public.my_workspace_moderation_actions() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
 SELECT a.id,a.action,a.reason,a.created_at,o.name organization_name,ap.status appeal_status,ap.resolution
 FROM public.workspace_moderation_actions a JOIN public.organizations o ON o.id=a.organization_id
 LEFT JOIN public.workspace_moderation_appeals ap ON ap.action_id=a.id AND ap.user_id=auth.uid()
 WHERE (a.target_type='thread' AND EXISTS(SELECT 1 FROM public.fomo_threads WHERE id=a.target_id AND author_id=auth.uid()))
 OR (a.target_type='reply' AND EXISTS(SELECT 1 FROM public.fomo_replies WHERE id=a.target_id AND author_id=auth.uid())) ORDER BY a.created_at DESC LIMIT 50) x);
END $$;
CREATE FUNCTION public.appeal_workspace_moderation(p_action_id uuid,p_body text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_id uuid;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.my_workspace_moderation_actions()) a WHERE a->>'id'=p_action_id::text) THEN RAISE EXCEPTION 'action_not_found' USING ERRCODE='42501';END IF;
 INSERT INTO public.workspace_moderation_appeals(action_id,user_id,body) VALUES(p_action_id,auth.uid(),p_body) ON CONFLICT(action_id,user_id) DO UPDATE SET body=workspace_moderation_appeals.body RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION public.admin_workspace_appeals() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT p.id,p.body,p.status,p.created_at,a.action,a.reason,o.name organization_name FROM public.workspace_moderation_appeals p JOIN public.workspace_moderation_actions a ON a.id=p.action_id JOIN public.organizations o ON o.id=a.organization_id WHERE p.status='pending' ORDER BY p.created_at LIMIT 50) x);
END $$;
CREATE FUNCTION public.admin_resolve_workspace_appeal(p_appeal_id uuid,p_overturn boolean,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_a public.workspace_moderation_actions%ROWTYPE;v_p public.workspace_moderation_appeals%ROWTYPE;BEGIN
 PERFORM public.workspace_admin_required();IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'reason_required';END IF;
 SELECT * INTO v_p FROM public.workspace_moderation_appeals WHERE id=p_appeal_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'appeal_not_found';END IF;
 SELECT * INTO v_a FROM public.workspace_moderation_actions WHERE id=v_p.action_id;
 IF v_a.actor_id=auth.uid() THEN RAISE EXCEPTION 'independent_reviewer_required';END IF;
 IF v_p.status<>'pending' THEN RETURN false;END IF;
 IF p_overturn AND v_a.action='sanction' THEN UPDATE public.workspace_campus_sanctions SET revoked_at=now() WHERE organization_id=v_a.organization_id AND campus_id=v_a.campus_id AND user_id=v_p.user_id AND created_at=v_a.created_at AND revoked_at IS NULL;END IF;
 IF p_overturn AND v_a.action='hide' THEN
 IF v_a.target_type='thread' THEN UPDATE public.fomo_threads SET is_hidden=false WHERE id=v_a.target_id AND NOT is_deleted;
 ELSE UPDATE public.fomo_replies SET is_hidden=false WHERE id=v_a.target_id AND NOT is_deleted;END IF;END IF;
 UPDATE public.workspace_moderation_appeals SET status=CASE WHEN p_overturn THEN 'overturned' ELSE 'upheld' END,resolution=p_reason,resolved_by=auth.uid(),resolved_at=now() WHERE id=p_appeal_id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(v_a.organization_id,auth.uid(),'moderation.appeal_resolved',p_appeal_id,jsonb_build_object('overturned',p_overturn,'reason',p_reason));
 RETURN true;
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('my_workspace_moderation_actions','appeal_workspace_moderation','admin_workspace_appeals','admin_resolve_workspace_appeal') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END LOOP;END $$;
$franky_component_6$;

-- SOURCE 20260922174439_workspace_governance_completion.sql
EXECUTE $franky_component_7$
-- Organizational records survive erasure of a former teammate. Personal posts do not.
CREATE FUNCTION public.workspace_record_organization(p_relation text,p_row jsonb) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid;v_target jsonb;BEGIN
 IF p_relation IN('public.accommodations','public.events','public.leisure_spots','public.communities') THEN v_org:=(p_row->>'organization_id')::uuid;
 ELSIF p_relation IN('public.fomo_threads','public.fomo_replies','public.messages') THEN v_org:=(p_row->>'publishing_organization_id')::uuid;
 ELSIF p_relation IN('public.visit_slots','public.visit_schedules') THEN SELECT organization_id INTO v_org FROM public.accommodations WHERE id=(p_row->>'accommodation_id')::uuid;
 ELSIF p_relation='public.fomo_polls' THEN SELECT publishing_organization_id INTO v_org FROM public.fomo_threads WHERE id=(p_row->>'thread_id')::uuid;
 ELSIF p_relation='social_private.staged_social_media' THEN
  SELECT organization_id INTO v_org FROM (
   SELECT t.publishing_organization_id organization_id FROM public.fomo_threads t WHERE t.media_url=p_row->>'public_url'
   UNION ALL SELECT r.publishing_organization_id FROM public.fomo_replies r WHERE r.media_url=p_row->>'public_url'
   UNION ALL SELECT c.organization_id FROM public.communities c WHERE c.image_url=p_row->>'public_url'
  ) references_to_media WHERE organization_id IS NOT NULL LIMIT 1;
 ELSIF p_relation='social_private.publication_reviews' THEN
  IF p_row->>'target_kind'='fomo_thread' THEN SELECT publishing_organization_id INTO v_org FROM public.fomo_threads WHERE id=(p_row->>'target_id')::uuid;
  ELSIF p_row->>'target_kind'='fomo_reply' THEN SELECT publishing_organization_id INTO v_org FROM public.fomo_replies WHERE id=(p_row->>'target_id')::uuid;
  ELSIF p_row->>'target_kind'='community' THEN SELECT organization_id INTO v_org FROM public.communities WHERE id=(p_row->>'target_id')::uuid; END IF;
 END IF;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION public.workspace_record_organization(text,jsonb) FROM PUBLIC,anon,authenticated;

-- Restrict the exception to already persisted organization ownership, never a caller's claimed role.
CREATE FUNCTION public.workspace_preserve_on_erasure(p_relation text,p_row jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id=public.workspace_record_organization(p_relation,p_row))
$$;
REVOKE ALL ON FUNCTION public.workspace_preserve_on_erasure(text,jsonb) FROM PUBLIC,anon,authenticated;

-- Public identity belongs to the institution, while the acting personal account
-- remains a private audit reference. Existing hiding/report/block filters remain.
CREATE FUNCTION public.workspace_publication_active(p_kind text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid;BEGIN
 IF p_kind='fomo_thread' THEN SELECT publishing_organization_id INTO org FROM public.fomo_threads WHERE id=p_id;
 ELSIF p_kind='fomo_reply' THEN SELECT publishing_organization_id INTO org FROM public.fomo_replies WHERE id=p_id;
 ELSIF p_kind='community' THEN SELECT organization_id INTO org FROM public.communities WHERE id=p_id;END IF;
 RETURN EXISTS(SELECT 1 FROM public.organizations WHERE id=org AND status='active' AND demo_cohort_id IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.workspace_publication_active(text,uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE def text;anchor text;BEGIN
 IF to_regprocedure('social_private.content_visible(text,uuid,uuid)') IS NOT NULL THEN
  SELECT pg_get_functiondef('social_private.content_visible(text,uuid,uuid)'::regprocedure) INTO def;
  anchor:='EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_author'||E'\n   AND p.is_discarded IS NOT TRUE AND (p.is_hidden IS NOT TRUE OR p.id=auth.uid()))';
  IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'social_visibility_changed_review_required';END IF;
  EXECUTE replace(def,anchor,'('||anchor||' OR public.workspace_publication_active(p_kind,p_id))');
 END IF;
END $$;

CREATE FUNCTION public.workspace_retained_file(p_bucket text,p_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_found boolean;BEGIN
 IF p_bucket='workspace-media' THEN RETURN EXISTS(SELECT 1 FROM public.organizations WHERE id::text=split_part(p_name,'/',1));END IF;
 IF to_regclass('social_private.staged_social_media') IS NULL THEN RETURN false;END IF;
 EXECUTE $q$SELECT EXISTS(SELECT 1 FROM social_private.staged_social_media s WHERE
  ((($1='ugc-approved' AND split_part(s.path,'/',2)=$2) OR ($1 IN('ugc-pending-image','ugc-pending-audio','ugc-pending-video') AND s.path=$2)))
  AND (EXISTS(SELECT 1 FROM public.fomo_threads t WHERE t.media_url=s.public_url AND t.publishing_organization_id IS NOT NULL)
   OR EXISTS(SELECT 1 FROM public.fomo_replies r WHERE r.media_url=s.public_url AND r.publishing_organization_id IS NOT NULL)
   OR EXISTS(SELECT 1 FROM public.communities c WHERE c.image_url=s.public_url AND c.organization_id IS NOT NULL)))$q$ INTO v_found USING p_bucket,p_name;
 RETURN coalesce(v_found,false);
END $$;
REVOKE ALL ON FUNCTION public.workspace_retained_file(text,text) FROM PUBLIC,anon,authenticated;

-- Extend, do not replace, the existing erasure engine. Assert exact anchors so a
-- future engine change requires a fresh integration review instead of silently weakening it.
DO $$ DECLARE def text;anchor text;replacement text;signature text;BEGIN
 IF to_regprocedure('account_private.guard_subject()') IS NOT NULL THEN
  SELECT pg_get_functiondef('account_private.guard_subject()'::regprocedure) INTO def;
  anchor:='IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=u) THEN';
  IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'erasure_subject_changed_review_required';END IF;
  def:=replace(def,anchor,anchor||E'\n   IF public.workspace_preserve_on_erasure(TG_TABLE_SCHEMA||''.''||TG_TABLE_NAME,doc) THEN CONTINUE;END IF;');EXECUTE def;
 END IF;
 FOREACH signature IN ARRAY ARRAY['public.purge_account_erasure(uuid,uuid)','account_private.capture_targets(uuid)'] LOOP
  IF to_regprocedure(signature) IS NOT NULL THEN
   SELECT pg_get_functiondef(signature::regprocedure) INTO def;
   IF signature LIKE 'public.purge%' THEN
    anchor:='SELECT string_agg(format(''%I=$1'',x),'' OR '') INTO predicate FROM unnest(rule_row.owner_columns)x;';
    replacement:=anchor||E'\n  predicate:=''(''||predicate||'') AND NOT public.workspace_preserve_on_erasure(''||quote_literal(rule_row.relation)||'',to_jsonb(''||quote_ident(split_part(rule_row.relation,''.'',2))||''))'';';
    def:=replace(def,'WHERE author_id=p_user);','WHERE author_id=p_user AND publishing_organization_id IS NULL);');
   ELSE
    def:=replace(def,'WHERE t.author_id=p_user ON CONFLICT','WHERE t.author_id=p_user AND t.publishing_organization_id IS NULL ON CONFLICT');
    anchor:='SELECT string_agg(format(''%I=$1'',x),'' OR '') INTO predicate FROM unnest(target_rule.owner_columns)x;';
    replacement:=anchor||E'\n  predicate:=''(''||predicate||'') AND NOT public.workspace_preserve_on_erasure(''||quote_literal(target_rule.relation)||'',to_jsonb(''||quote_ident(split_part(target_rule.relation,''.'',2))||''))'';';
   END IF;
   IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'erasure_predicate_changed_review_required';END IF;
   EXECUTE replace(def,anchor,replacement);
  END IF;
 END LOOP;
 IF to_regprocedure('account_private.capture_files(uuid)') IS NOT NULL THEN
  ALTER FUNCTION account_private.capture_files(uuid) RENAME TO capture_files_before_workspaces;
  EXECUTE $f$CREATE FUNCTION account_private.capture_files(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$ BEGIN
   PERFORM account_private.capture_files_before_workspaces(p_user);
   DELETE FROM account_private.files f WHERE f.user_id=p_user AND public.workspace_retained_file(f.bucket_id,f.name);
  END $body$ $f$;
  REVOKE ALL ON FUNCTION account_private.capture_files(uuid),account_private.capture_files_before_workspaces(uuid) FROM PUBLIC,anon,authenticated,service_role;
 END IF;
 -- Report-author references are private accountability, not ownership of the
 -- organization's publication. Remove those targets from personal erasure.
 IF to_regprocedure('account_private.capture_targets(uuid)') IS NOT NULL THEN
  ALTER FUNCTION account_private.capture_targets(uuid) RENAME TO capture_targets_before_workspaces;
  EXECUTE $f$CREATE FUNCTION account_private.capture_targets(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
   DECLARE rel text;BEGIN
   PERFORM account_private.capture_targets_before_workspaces(p_user);
   FOREACH rel IN ARRAY ARRAY['fomo_threads','fomo_replies','accommodations','communities','messages','visit_slots','visit_schedules'] LOOP
    EXECUTE format('DELETE FROM account_private.targets t USING public.%I r WHERE t.user_id=$1 AND t.relation=$2 AND t.record_id=r.id::text AND public.workspace_preserve_on_erasure($2,to_jsonb(r))',rel) USING p_user,'public.'||rel;
   END LOOP;
  END $body$ $f$;
  REVOKE ALL ON FUNCTION account_private.capture_targets(uuid),account_private.capture_targets_before_workspaces(uuid) FROM PUBLIC,anon,authenticated,service_role;
 END IF;
END $$;

-- Reversible self-deactivation also cannot leave an active space without its owner.
CREATE FUNCTION public.workspace_profile_continuity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.is_discarded IS TRUE AND OLD.is_discarded IS NOT TRUE AND NEW.self_deleted IS TRUE AND EXISTS(
  SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
  WHERE m.user_id=NEW.id AND m.role='owner' AND m.status='active' AND o.status<>'archived') THEN RAISE EXCEPTION 'workspace_transfer_before_erasure';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_profile_continuity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_profile_continuity BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.workspace_profile_continuity();

-- Approved university grants and teams can use an explicit campus without inheriting
-- the editing teammate's personal university. Affiliation remains a separate proof.
DO $$ DECLARE def text;anchor text;BEGIN
 IF to_regprocedure('social_private.review_community_write()') IS NOT NULL THEN
  SELECT pg_get_functiondef('social_private.review_community_write()'::regprocedure) INTO def;
  anchor:='IF TG_TABLE_NAME=''communities'' AND TG_OP=''INSERT'' THEN';
  IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'community_campus_guard_changed';END IF;
  EXECUTE replace(def,anchor,'IF TG_TABLE_NAME=''communities'' AND TG_OP=''INSERT'' AND n->>''organization_id'' IS NULL THEN');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_workspace_release(p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 UPDATE public.workspace_release SET enabled=p_enabled,updated_at=now() WHERE singleton;
 IF to_regclass('public.growth_settings') IS NOT NULL THEN EXECUTE 'UPDATE public.growth_settings SET enabled=$1' USING p_enabled;END IF;
 RETURN jsonb_build_object('enabled',p_enabled);
END $$;
REVOKE ALL ON FUNCTION public.admin_workspace_release(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_workspace_release(boolean) TO authenticated;

CREATE TABLE public.workspace_reviewed_media (
 path text NOT NULL,review_id uuid NOT NULL,revision uuid NOT NULL,sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'),
 mime text NOT NULL CHECK(mime IN('image/jpeg','image/png','image/webp')),reviewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(path,review_id,revision)
);
ALTER TABLE public.workspace_reviewed_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_reviewed_media FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.workspace_reviewed_media TO service_role;
CREATE FUNCTION public.workspace_media_path(p_org uuid,p_url text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p text;BEGIN
 IF p_org IS NULL THEN RETURN NULL;END IF;
 IF p_url NOT LIKE 'https://franky.es/api/workspaces/media/%' THEN RETURN NULL;END IF;
 p:=substring(p_url from length('https://franky.es/api/workspaces/media/')+1);
 IF split_part(p,'/',1)<>p_org::text OR array_length(string_to_array(p,'/'),1)<>3 OR p LIKE '%..%' OR p LIKE '%\%' THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='workspace-media' AND name=p) THEN RETURN NULL;END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.workspace_media_path(uuid,text) FROM PUBLIC,anon,authenticated;
DO $$DECLARE def text;anchor text;BEGIN
 IF to_regprocedure('social_private.review_community_write()') IS NOT NULL THEN
  SELECT pg_get_functiondef('social_private.review_community_write()'::regprocedure) INTO def;
  anchor:='IF NEW.image_url IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_private.staged_social_media';
  IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'community_media_guard_changed';END IF;
  def:=replace(def,anchor,'IF NEW.image_url IS NOT NULL AND public.workspace_media_path((n->>''organization_id'')::uuid,NEW.image_url) IS NULL AND NOT EXISTS(SELECT 1 FROM social_private.staged_social_media');EXECUTE def;
 END IF;
 IF to_regprocedure('public.finish_publication_review(uuid,uuid,uuid,text,text)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.finish_publication_review(uuid,uuid,uuid,text,text)'::regprocedure) INTO def;
  anchor:='IF p_decision=''approved'' AND r.document->>''media_url'' IS NOT NULL AND NOT EXISTS(';
  IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'review_media_guard_changed';END IF;
  def:=replace(def,anchor,'IF p_decision=''approved'' AND r.document->>''media_url'' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workspace_reviewed_media m JOIN public.communities c ON c.id=r.target_id WHERE r.target_kind=''community'' AND m.path=public.workspace_media_path(c.organization_id,r.document->>''media_url'') AND m.review_id=r.id AND m.revision=r.revision) AND NOT EXISTS(');EXECUTE def;
 END IF;
END $$;

CREATE FUNCTION public.get_workspace_campuses(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) ORDER BY u.name),'[]') FROM public.organization_campuses c JOIN public.universities u ON u.id=c.university_id WHERE c.organization_id=p_organization_id);
END $$;
CREATE FUNCTION public.set_workspace_member_role(p_organization_id uuid,p_user_id uuid,p_role text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_role text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'members.manage');
 PERFORM 1 FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 IF p_role IS NULL OR p_role NOT IN('admin','editor','moderator','analyst','finance','checkin','member') THEN RAISE EXCEPTION 'invalid_role';END IF;
 SELECT role INTO old_role FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=p_user_id AND status='active' FOR UPDATE;
 IF old_role IS NULL OR old_role='owner' OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'ownership_transfer_required';END IF;
 IF old_role IN('admin','finance') OR p_role IN('admin','finance') THEN
 IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' OR NOT EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=auth.uid() AND role='owner' AND status='active') THEN RAISE EXCEPTION 'owner_mfa_required' USING ERRCODE='42501';END IF;END IF;
 UPDATE public.organization_memberships SET role=p_role WHERE organization_id=p_organization_id AND user_id=p_user_id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'member.role_changed',p_user_id,jsonb_build_object('before',old_role,'after',p_role));RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_campuses(uuid),public.set_workspace_member_role(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_campuses(uuid),public.set_workspace_member_role(uuid,uuid,text) TO authenticated;

CREATE TABLE public.workspace_academic_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),university_id uuid NOT NULL REFERENCES public.universities(id),
 field text NOT NULL,before_value jsonb,after_value jsonb,source_url text NOT NULL,academic_year text NOT NULL,
 reviewed_by uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_academic_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_academic_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workspace_academic_versions TO authenticated;
GRANT ALL ON public.workspace_academic_versions TO service_role;
CREATE POLICY workspace_academic_history ON public.workspace_academic_versions FOR SELECT TO authenticated USING(public.has_organization_permission(organization_id,'resource.read'));
CREATE FUNCTION public.admin_workspace_proposals() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT r.id,r.title,r.data,r.updated_at,o.name organization_name,r.organization_id FROM public.workspace_resources r JOIN public.organizations o ON o.id=r.organization_id WHERE r.type='academic' AND r.status='pending_review' AND o.demo_cohort_id IS NULL ORDER BY r.updated_at LIMIT 50) x);
END $$;
CREATE FUNCTION public.admin_review_workspace_academic(p_resource_id uuid,p_updated_at timestamptz,p_approve boolean,p_reason text,p_field text DEFAULT NULL,p_value text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;u public.universities%ROWTYPE;campus uuid;v_previous jsonb;BEGIN
 PERFORM public.workspace_admin_required();
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND type='academic' FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending_review' OR r.updated_at IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'proposal_changed';END IF;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=r.organization_id AND demo_cohort_id IS NOT NULL) THEN RAISE EXCEPTION 'demo_live_operation_disabled';END IF;
 SELECT university_id INTO campus FROM public.organization_campuses WHERE organization_id=r.organization_id AND (r.data->>'campus_id' IS NULL OR university_id=(r.data->>'campus_id')::uuid) ORDER BY university_id LIMIT 1;
 IF campus IS NULL THEN RAISE EXCEPTION 'campus_required';END IF;
 IF p_approve THEN
 IF p_field IS NULL OR p_field NOT IN('description','website','phone','email','jpa_url','jpa_label') OR length(coalesce(p_value,''))>10000 THEN RAISE EXCEPTION 'academic_field_invalid';END IF;
 IF p_field IN('website','jpa_url') AND p_value !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'invalid_source_url';END IF;
 SELECT * INTO u FROM public.universities WHERE id=campus FOR UPDATE;v_previous:=to_jsonb(u)->p_field;
 EXECUTE format('UPDATE public.universities SET %I=$1,institutional_sources=coalesce(institutional_sources,''{}''::jsonb)||jsonb_build_object($2,jsonb_build_object(''url'',$3,''academic_year'',$4,''reviewed_at'',now())),updated_at=now() WHERE id=$5',p_field)
 USING p_value,p_field,r.data->>'source_url',r.data->>'academic_year',campus;
 INSERT INTO public.workspace_academic_versions(organization_id,resource_id,university_id,field,before_value,after_value,source_url,academic_year,reviewed_by,reason)
 VALUES(r.organization_id,r.id,campus,p_field,v_previous,to_jsonb(p_value),r.data->>'source_url',r.data->>'academic_year',auth.uid(),p_reason);
 END IF;
 UPDATE public.workspace_resources SET status=CASE WHEN p_approve THEN 'published' ELSE 'draft' END,data=data||jsonb_build_object('review_resolution',p_reason,'reviewed_at',now()),updated_at=now() WHERE id=r.id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(r.organization_id,auth.uid(),'academic.reviewed',r.id,jsonb_build_object('approved',p_approve,'reason',p_reason));RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_workspace_proposals(),public.admin_review_workspace_academic(uuid,timestamptz,boolean,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_workspace_proposals(),public.admin_review_workspace_academic(uuid,timestamptz,boolean,text,text,text) TO authenticated;

-- Publication identity is separate from the teammate who performed the action.
CREATE FUNCTION public.workspace_fomo_author(p_target uuid,p_kind text,p_author uuid,p_anonymous boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid;o public.organizations%ROWTYPE;BEGIN
 IF p_anonymous THEN RETURN NULL;END IF;
 IF p_kind='thread' THEN SELECT publishing_organization_id INTO v_org FROM public.fomo_threads WHERE id=p_target;
 ELSE SELECT publishing_organization_id INTO v_org FROM public.fomo_replies WHERE id=p_target;END IF;
 IF v_org IS NULL THEN RETURN public.fomo_author_json(p_author,p_anonymous);END IF;
 SELECT * INTO o FROM public.organizations WHERE id=v_org;
 RETURN jsonb_build_object('id',NULL,'full_name',o.name,'avatar_url',NULL,'age',NULL,'university_id',NULL,'is_organization',true,'organization_id',o.id,'verified',o.verification_status='verified' AND o.status='active','kind',o.kind);
END $$;
REVOKE ALL ON FUNCTION public.workspace_fomo_author(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
DO $$DECLARE f record;def text;BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_fomo_feed','get_fomo_thread') LOOP
  SELECT pg_get_functiondef(f.oid) INTO def;
  IF strpos(def,'public.fomo_author_json')=0 THEN RAISE EXCEPTION 'fomo_reader_changed_review_required';END IF;
  def:=replace(def,'public.fomo_author_json(t.author_id, t.is_anonymous)','public.workspace_fomo_author(t.id,''thread'',t.author_id,t.is_anonymous)');
  def:=replace(def,'public.fomo_author_json(v_thread.author_id, v_thread.is_anonymous)','public.workspace_fomo_author(v_thread.id,''thread'',v_thread.author_id,v_thread.is_anonymous)');
  def:=replace(def,'public.fomo_author_json(r.author_id, r.is_anonymous)','public.workspace_fomo_author(r.id,''reply'',r.author_id,r.is_anonymous)');
  def:=replace(def,'public.fomo_author_json(rp.author_id, rp.is_anonymous)','public.workspace_fomo_author(rp.id,''reply'',rp.author_id,rp.is_anonymous)');
  IF strpos(def,'public.fomo_author_json')>0 THEN RAISE EXCEPTION 'fomo_reader_author_anchor_changed';END IF;
  EXECUTE def;
 END LOOP;
END $$;
CREATE FUNCTION public.get_event_organizer_identity(p_event_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('name',o.name,'kind',o.kind,'verified',o.verification_status='verified','slug',o.slug)
 FROM public.events e JOIN public.organizations o ON o.id=e.organization_id
 WHERE e.id=p_event_id AND o.status='active' AND o.demo_cohort_id IS NULL AND e.status<>'cancelled'
 AND (SELECT enabled FROM public.workspace_release WHERE singleton)
$$;
REVOKE ALL ON FUNCTION public.get_event_organizer_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_organizer_identity(uuid) TO anon,authenticated;
$franky_component_7$;

-- SOURCE 20260922174858_workspace_event_legacy_safety.sql
EXECUTE $franky_component_8$
-- Old clients do not retain organizer authority after organization revocation.
CREATE FUNCTION public.workspace_event_access(p_event uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.account_session_usable() AND EXISTS(SELECT 1 FROM public.events e WHERE e.id=p_event AND
 (e.organization_id IS NULL OR public.has_organization_permission(e.organization_id,p_permission)
 OR (public.is_admin() AND auth.jwt()->>'aal'='aal2')))
$$;
REVOKE ALL ON FUNCTION public.workspace_event_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_event_access(uuid,text) TO authenticated,service_role;

-- These are restrictive additions: existing buyer/participant policies still apply.
CREATE POLICY workspace_ticket_scope ON public.event_tickets AS RESTRICTIVE FOR SELECT TO authenticated
 USING(holder_id=auth.uid() OR original_buyer_id=auth.uid() OR public.workspace_event_access(event_id,'attendees.manage'));
CREATE POLICY workspace_participant_scope ON public.event_participants AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.workspace_event_access(event_id,'attendees.manage'));
CREATE POLICY workspace_waitlist_scope ON public.event_waitlist AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.workspace_event_access(event_id,'attendees.manage'));
DO $$BEGIN IF to_regclass('public.event_discount_codes') IS NOT NULL THEN
 CREATE POLICY workspace_discount_scope ON public.event_discount_codes AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.workspace_event_access(event_id,'finance.manage')) WITH CHECK(public.workspace_event_access(event_id,'finance.manage'));
END IF;END $$;

-- Event then ticket lock order is shared with the native check-in. Cancellation
-- cannot overtake validation, and a consumed QR cannot be consumed a second time.
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr_token text)
RETURNS TABLE(ok boolean,status text,event_title text,holder_name text,used_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE;t public.event_tickets%ROWTYPE;v_event uuid;v_name text;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN
 RETURN QUERY SELECT false,'no_auth',NULL::text,NULL::text,NULL::timestamptz;RETURN;END IF;
 SELECT event_id INTO v_event FROM public.event_tickets WHERE qr_token=p_qr_token;
 SELECT * INTO e FROM public.events WHERE id=v_event FOR UPDATE;
 IF NOT FOUND OR NOT (CASE WHEN e.organization_id IS NULL THEN e.organizer_id=auth.uid() ELSE public.has_organization_permission(e.organization_id,'attendees.manage') END
  OR public.is_admin() AND auth.jwt()->>'aal'='aal2') THEN
 RETURN QUERY SELECT false,'not_authorized',NULL::text,NULL::text,NULL::timestamptz;RETURN;END IF;
 IF e.status='cancelled' THEN RETURN QUERY SELECT false,'event_cancelled',e.title,NULL::text,NULL::timestamptz;RETURN;END IF;
 SELECT * INTO t FROM public.event_tickets WHERE qr_token=p_qr_token AND event_id=e.id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'not_found',NULL::text,NULL::text,NULL::timestamptz;RETURN;END IF;
 SELECT full_name INTO v_name FROM public.profiles WHERE id=t.holder_id;
 IF t.status='used' OR t.used_at IS NOT NULL THEN RETURN QUERY SELECT false,'already_used',e.title,v_name,t.used_at;RETURN;END IF;
 IF t.status<>'valid' THEN RETURN QUERY SELECT false,CASE t.status WHEN 'pending_payment' THEN 'not_paid' WHEN 'refunded' THEN 'refunded' ELSE 'not_valid' END,e.title,v_name,NULL::timestamptz;RETURN;END IF;
 UPDATE public.event_tickets SET status='used',used_at=now(),checked_in_by=auth.uid() WHERE id=t.id;
 IF e.organization_id IS NOT NULL THEN INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(e.organization_id,auth.uid(),'attendee.checked_in',t.id);END IF;
 RETURN QUERY SELECT true,'ok',e.title,v_name,now();
END $$;
CREATE OR REPLACE FUNCTION public.validate_event_ticket(p_qr_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record;BEGIN
 SELECT * INTO r FROM public.check_in_ticket(p_qr_token);
 IF NOT r.ok AND r.status<>'already_used' THEN RAISE EXCEPTION 'ticket_validation_failed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('ok',r.ok,'already_used',r.status='already_used','holder_name',r.holder_name,'event_title',r.event_title,'used_at',r.used_at);
END $$;
REVOKE ALL ON FUNCTION public.check_in_ticket(text),public.validate_event_ticket(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text),public.validate_event_ticket(text) TO authenticated;

-- Retain the proven internal implementations and add the current-membership gate.
DO $$ DECLARE def text;signature text;param text;permission text;anchor text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.get_origin_event_attendees(uuid)','public.kick_event_participant(uuid,uuid)','public.ensure_event_chat(uuid)','public.join_event_chat(uuid,uuid)'] LOOP
 IF to_regprocedure(signature) IS NULL THEN CONTINUE;END IF;
 SELECT pg_get_functiondef(signature::regprocedure) INTO def;
 param:=CASE WHEN signature LIKE '%get_origin%' THEN 'p_event' ELSE 'p_event_id' END;
 permission:=CASE WHEN signature LIKE '%attendees%' OR signature LIKE '%kick%' THEN 'attendees.manage' ELSE 'content.manage' END;
 anchor:=substring(def from '[Bb][Ee][Gg][Ii][Nn]');IF anchor IS NULL THEN RAISE EXCEPTION 'legacy_event_guard_changed';END IF;
 -- join_event_chat keeps ordinary participants' existing rights. Only the
 -- organizer shortcut needs current membership; server jobs remain authorized.
 IF signature LIKE '%join_event_chat%' THEN
 def:=regexp_replace(def,'[Bb][Ee][Gg][Ii][Nn]',E'BEGIN\n IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.events WHERE id=p_event_id AND organizer_id=auth.uid() AND organization_id IS NOT NULL) AND NOT public.workspace_event_access(p_event_id,''content.manage'') THEN RAISE EXCEPTION ''workspace_forbidden'' USING ERRCODE=''42501'';END IF;');
 ELSE
 def:=regexp_replace(def,'[Bb][Ee][Gg][Ii][Nn]',format(E'BEGIN\n IF auth.uid() IS NOT NULL AND NOT public.workspace_event_access(%s,%L) THEN RAISE EXCEPTION ''workspace_forbidden'' USING ERRCODE=''42501'';END IF;',param,permission));
 END IF;
 EXECUTE def;
 END LOOP;
END $$;

CREATE FUNCTION public.workspace_guard_event_child() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE doc jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;v_org uuid;BEGIN
 IF auth.uid() IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 SELECT organization_id INTO v_org FROM public.events WHERE id=(doc->>'event_id')::uuid;
 -- Direct organizer writes are still limited to the current team. Definer RPCs
 -- separately authenticate each operation, including the student registration path.
 IF v_org IS NOT NULL AND current_user IN('anon','authenticated') AND
  coalesce(doc->>'user_id',doc->>'holder_id','')<>auth.uid()::text AND NOT public.has_organization_permission(v_org,'attendees.manage') THEN
  RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.workspace_guard_event_child() FROM PUBLIC,anon,authenticated;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['event_tickets','event_participants','event_waitlist'] LOOP
 EXECUTE format('CREATE TRIGGER workspace_event_child BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_event_child()',t);END LOOP;END $$;

-- A staff author identifier is an audit reference, never a permanent personal
-- edit/delete privilege over an institutional publication.
CREATE FUNCTION public.workspace_guard_institutional_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE doc jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;previous jsonb;org uuid;content_changed boolean;BEGIN
 org:=(doc->>'publishing_organization_id')::uuid;
 IF auth.uid() IS NULL OR org IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 IF TG_OP='UPDATE' THEN
 previous:=to_jsonb(OLD);
 IF (doc-ARRAY['reply_count','reaction_count','report_count','updated_at']) IS NOT DISTINCT FROM (previous-ARRAY['reply_count','reaction_count','report_count','updated_at']) THEN RETURN NEW;END IF;
 content_changed:=(doc-ARRAY['is_hidden','is_deleted','reply_count','reaction_count','report_count','updated_at']) IS DISTINCT FROM (previous-ARRAY['is_hidden','is_deleted','reply_count','reaction_count','report_count','updated_at']);
 END IF;
 IF public.has_organization_permission(org,'content.manage') OR public.is_admin() AND auth.jwt()->>'aal'='aal2' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 IF TG_OP='UPDATE' AND NOT content_changed AND public.has_organization_permission(org,'moderation.manage') THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.workspace_guard_institutional_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_institutional_write BEFORE INSERT OR UPDATE OR DELETE ON public.fomo_threads FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_institutional_write();
CREATE TRIGGER workspace_institutional_write BEFORE INSERT OR UPDATE OR DELETE ON public.fomo_replies FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_institutional_write();
$franky_component_8$;

-- SOURCE 20260922175127_workspace_demo_isolation.sql
EXECUTE $franky_component_9$
-- Default-deny boundary: demonstrations operate only in isolated workspace and
-- growth tables. This also protects service-role entrypoints with demo subjects.
CREATE SCHEMA IF NOT EXISTS workspace_private;
REVOKE ALL ON SCHEMA workspace_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_is_demo_user(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user)
$$;
REVOKE ALL ON FUNCTION public.workspace_is_demo_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_is_demo_user(uuid) TO authenticated,anon,service_role;

CREATE FUNCTION workspace_private.contains_demo(p_row jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM jsonb_path_query(p_row,'$.**') AS x(value)
 JOIN public.workspace_demo_accounts d ON d.user_id::text=x.value#>>'{}' WHERE jsonb_typeof(x.value)='string')
$$;
REVOKE ALL ON FUNCTION workspace_private.contains_demo(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_workspace_demo_legacy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb;BEGIN
 IF public.current_demo_cohort() IS NOT NULL THEN
  IF TG_TABLE_NAME IN('notifications','device_tokens','analytics_events','email_events','push_tokens') THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501';
 END IF;
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 -- A privileged cleanup may remove historical contamination. Creating or
 -- modifying a canonical row that mentions a demo identity is always refused.
 IF TG_OP<>'DELETE' AND workspace_private.contains_demo(row_data) THEN
  IF TG_TABLE_NAME IN('notifications','device_tokens','analytics_events','email_events','push_tokens','staff_alert_outbox') THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_demo_legacy() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','private','social_private') AND c.relkind='r'
 AND c.relname<>'profiles' AND c.relname !~ '^(workspace_|growth_|organization)' LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=format('%I.%I',t.nspname,t.relname)::regclass AND tr.tgname='aaa_workspace_demo_boundary') THEN
   EXECUTE format('CREATE TRIGGER aaa_workspace_demo_boundary BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_demo_legacy()',t.nspname,t.relname);
  END IF;
 END LOOP;
END $$;

-- Realtime/table embeddings also evaluate these restrictive read policies.
-- Existing non-demo access policies and RLS enablement are left intact.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','private','social_private') AND c.relkind='r' AND c.relrowsecurity
 AND c.relname<>'profiles' AND c.relname !~ '^(workspace_|growth_|organization)' LOOP
  EXECUTE format('CREATE POLICY workspace_demo_read_boundary ON %I.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(public.current_demo_cohort() IS NULL)',t.nspname,t.relname);
 END LOOP;
END $$;

-- SECURITY DEFINER readers bypass table RLS. PostgREST supplies request.path
-- itself; headers, client-selected workspace IDs and profile fields are not used.
-- This wrapper retains the existing account-erasure gate and rejects unknown
-- demo routes by default. New demo capabilities require deliberate review here.
CREATE FUNCTION public.workspace_require_request() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE route text:=current_setting('request.path',true);method text:=current_setting('request.method',true); BEGIN
 PERFORM public.require_account_session();
 IF public.current_demo_cohort() IS NULL THEN RETURN; END IF;
 IF route='/profiles' AND method IN('GET','HEAD','PATCH') THEN RETURN; END IF;
 IF method IN('GET','HEAD') AND route IN('/growth_redemptions','/favorites','/universities','/careers') THEN RETURN; END IF;
 IF method IN('GET','HEAD','POST') AND route=ANY(ARRAY[
  '/rpc/current_demo_cohort','/rpc/get_workspace_access','/rpc/list_my_workspaces',
  '/rpc/has_organization_permission','/rpc/get_workspace_members','/rpc/get_workspace_campuses',
  '/rpc/list_workspace_invitations','/rpc/invite_workspace_member','/rpc/accept_workspace_invitation',
  '/rpc/revoke_workspace_member','/rpc/set_workspace_member_role','/rpc/transfer_workspace_ownership',
  '/rpc/get_workspace_resources','/rpc/get_workspace_resource','/rpc/save_workspace_resource',
  '/rpc/workspace_resource_action','/rpc/get_workspace_dashboard','/rpc/workspace_institutional_metrics',
  '/rpc/get_workspace_conversation_messages','/rpc/get_workspace_housing_interests',
  '/rpc/get_workspace_housing_schedule','/rpc/save_workspace_housing_schedule',
  '/rpc/get_workspace_moderation','/rpc/workspace_moderate','/rpc/get_workspace_attendees',
  '/rpc/check_in_workspace_attendee','/rpc/my_workspace_moderation_actions','/rpc/appeal_workspace_moderation',
  '/rpc/growth_snapshot','/rpc/growth_redeem','/rpc/growth_creator_apply','/rpc/growth_content_submit',
  '/rpc/growth_claim_referral','/rpc/ensure_my_profile','/rpc/community_terms_accepted'
 ]) THEN RETURN; END IF;
 RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.workspace_require_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_require_request() TO anon,authenticated,service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
 unnest(s.setconfig)c WHERE r.rolname='authenticator' AND c LIKE 'pgrst.db_pre_request=%'
 AND c NOT IN('pgrst.db_pre_request=public.require_account_session','pgrst.db_pre_request=public.workspace_require_request')) THEN
  RAISE EXCEPTION 'existing_pre_request_requires_composition';
 END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.workspace_require_request';
NOTIFY pgrst,'reload config';

-- Real social surfaces must never recommend synthetic users. The own profile is
-- still available for logging into the demonstration and choosing its workspace.
CREATE FUNCTION public.workspace_demo_profile_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE data jsonb; BEGIN
 IF public.workspace_is_demo_user(NEW.id) THEN
  data:=to_jsonb(NEW);
  IF data?'looking_for_roommate' THEN data:=jsonb_set(data,'{looking_for_roommate}','false'); END IF;
  IF data?'looking_for_housing' THEN data:=jsonb_set(data,'{looking_for_housing}','false'); END IF;
  IF data?'ligar_opted_in' THEN data:=jsonb_set(data,'{ligar_opted_in}','false'); END IF;
  NEW:=jsonb_populate_record(NEW,data);
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_demo_profile_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER z_workspace_demo_profile_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.workspace_demo_profile_guard();
CREATE FUNCTION workspace_private.hide_new_demo_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 -- Updating a harmless existing field runs the generic profile guard above,
 -- including when an existing test account is reserved as demo later.
 UPDATE public.profiles SET full_name=full_name WHERE id=NEW.user_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.hide_new_demo_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_demo_profile_reserved AFTER INSERT ON public.workspace_demo_accounts FOR EACH ROW EXECUTE FUNCTION workspace_private.hide_new_demo_profile();
CREATE POLICY workspace_demo_profile_visibility ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING((NOT public.workspace_is_demo_user(id) OR id=auth.uid() OR public.is_admin()) AND (public.current_demo_cohort() IS NULL OR id=auth.uid()));

CREATE OR REPLACE FUNCTION public.profile_is_visible(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.current_demo_cohort() IS NULL AND NOT public.workspace_is_demo_user(p_id) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_id AND is_discarded IS NOT TRUE)
$$;
REVOKE ALL ON FUNCTION public.profile_is_visible(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_is_visible(uuid) TO authenticated;
DO $$ DECLARE original text;options text[]; BEGIN
 IF to_regclass('public.public_profiles') IS NOT NULL THEN
  SELECT pg_get_viewdef('public.public_profiles'::regclass,true),reloptions INTO original,options FROM pg_class WHERE oid='public.public_profiles'::regclass;
  original:=regexp_replace(original,';\s*$','');
  EXECUTE 'CREATE OR REPLACE VIEW public.public_profiles AS SELECT visible.* FROM ('||original||') visible WHERE NOT public.workspace_is_demo_user(visible.id) AND public.current_demo_cohort() IS NULL';
  IF options IS NOT NULL THEN EXECUTE 'ALTER VIEW public.public_profiles SET ('||array_to_string(options,',')||')'; END IF;
 END IF;
END $$;

-- Pin demo identity to its reserved synthetic address: an authenticated demo
-- cannot turn a verification or email-change request into a real email sender.
CREATE FUNCTION workspace_private.guard_auth_demo_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE key text;before_row jsonb:=to_jsonb(OLD);after_row jsonb:=to_jsonb(NEW); BEGIN
 IF public.workspace_is_demo_user(NEW.id) THEN
  FOREACH key IN ARRAY ARRAY['email','phone','email_change','phone_change'] LOOP
   IF before_row->key IS DISTINCT FROM after_row->key THEN RAISE EXCEPTION 'demo_identity_locked' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER workspace_demo_auth_email BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_auth_demo_email();
REVOKE ALL ON FUNCTION workspace_private.guard_auth_demo_email() FROM PUBLIC,anon,authenticated;

-- Existing permissive bucket policies cannot open a path around this restrictive
-- policy. Service writes are also checked for a demo owner outside workspace-media.
CREATE POLICY workspace_demo_storage_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(public.current_demo_cohort() IS NULL OR bucket_id='workspace-media');
CREATE POLICY workspace_demo_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.current_demo_cohort() IS NULL OR bucket_id='workspace-media');
CREATE POLICY workspace_demo_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.current_demo_cohort() IS NULL OR bucket_id='workspace-media') WITH CHECK(public.current_demo_cohort() IS NULL OR bucket_id='workspace-media');
CREATE POLICY workspace_demo_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(public.current_demo_cohort() IS NULL OR bucket_id='workspace-media');
CREATE FUNCTION workspace_private.guard_demo_storage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE data jsonb; BEGIN
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF data->>'bucket_id'<>'workspace-media' AND (public.current_demo_cohort() IS NOT NULL OR workspace_private.contains_demo(data)) THEN RAISE EXCEPTION 'demo_storage_scope' USING ERRCODE='42501'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER aaa_workspace_demo_storage BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_demo_storage();
REVOKE ALL ON FUNCTION workspace_private.guard_demo_storage() FROM PUBLIC,anon,authenticated;

-- Every server email send calls this service-only check. It also rejects stale
-- queued emails to an account that was subsequently reserved as a demonstration.
CREATE FUNCTION public.workspace_email_allowed(p_to text[],p_actor uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN NOT public.workspace_is_demo_user(p_actor)
  AND NOT workspace_private.contains_demo(p_payload)
  AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d JOIN auth.users u ON u.id=d.user_id WHERE lower(u.email)=ANY(SELECT lower(x) FROM unnest(p_to) x))
  AND NOT EXISTS(SELECT 1 FROM unnest(p_to) email WHERE email ~* '@[^@]*\.(invalid|test)$');
END $$;
REVOKE ALL ON FUNCTION public.workspace_email_allowed(text[],uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_email_allowed(text[],uuid,jsonb) TO service_role;

-- Erasure revokes promotion immediately and removes mutable portfolio/contact
-- details. Financial rates, ledgers and evidence keep their separate retention.
CREATE FUNCTION growth_private.erase_personal_data() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE public.growth_promoters SET active=false WHERE user_id=NEW.user_id;
 UPDATE public.growth_creator_applications SET channels='Cuenta eliminada',proposal='Cuenta eliminada: propuesta retirada.',status='paused',review_note=NULL,updated_at=now() WHERE user_id=NEW.user_id;
 UPDATE public.growth_creator_content SET title='Contenido retirado',url='https://franky.es/privacidad',rights='Contenido retirado por eliminación de cuenta.',status='rejected',review_note=NULL WHERE user_id=NEW.user_id;
 UPDATE public.growth_referrals SET review_reason=CASE WHEN status='rejected' THEN 'account_erased' ELSE NULL END WHERE referred_user_id=NEW.user_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION growth_private.erase_personal_data() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF to_regclass('account_private.erasures') IS NOT NULL THEN
 CREATE TRIGGER growth_personal_erasure AFTER INSERT ON account_private.erasures FOR EACH ROW EXECUTE FUNCTION growth_private.erase_personal_data();
END IF;END $$;
$franky_component_9$;

-- SOURCE 20260922190000_workspace_domain_flows.sql
EXECUTE $franky_component_10$
-- Canonical housing operations remain on the existing tables. Workspaces add
-- authorization and presentation, never a second booking or payment ledger.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS housing_listing_id uuid REFERENCES public.accommodations(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN publishing_organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.messages ADD COLUMN organization_label text;
ALTER TABLE public.messages ADD COLUMN workspace_request_id text;
CREATE INDEX messages_workspace_context_idx ON public.messages(publishing_organization_id,conversation_id,created_at);
CREATE INDEX messages_housing_context_idx ON public.messages(housing_listing_id,conversation_id) WHERE housing_listing_id IS NOT NULL;
CREATE UNIQUE INDEX messages_workspace_idempotency ON public.messages(publishing_organization_id,workspace_request_id) WHERE publishing_organization_id IS NOT NULL AND workspace_request_id IS NOT NULL;

CREATE FUNCTION public.guard_workspace_message_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user NOT IN('anon','authenticated') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.housing_listing_id IS DISTINCT FROM OLD.housing_listing_id THEN RAISE EXCEPTION 'housing_attribution_immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND NEW.housing_listing_id IS NOT NULL AND (NEW.sender_id IS DISTINCT FROM auth.uid() OR NOT EXISTS(
 SELECT 1 FROM public.accommodations a WHERE a.id=NEW.housing_listing_id AND a.owner_id<>auth.uid() AND a.status='active' AND a.is_paid AND a.deleted_at IS NULL
 AND EXISTS(SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=NEW.conversation_id AND cp.user_id=auth.uid())
 AND EXISTS(SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=NEW.conversation_id AND cp.user_id=a.owner_id)
 AND (SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id=NEW.conversation_id)=2)) THEN RAISE EXCEPTION 'invalid_housing_message' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND (NEW.publishing_organization_id IS NOT NULL OR NEW.organization_label IS NOT NULL OR NEW.workspace_request_id IS NOT NULL)
 OR TG_OP='UPDATE' AND (NEW.publishing_organization_id,NEW.organization_label,NEW.workspace_request_id) IS DISTINCT FROM (OLD.publishing_organization_id,OLD.organization_label,OLD.workspace_request_id)
 THEN RAISE EXCEPTION 'workspace_server_fields' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.publishing_organization_id IS NOT NULL
 AND NOT public.has_organization_permission(OLD.publishing_organization_id,'content.manage') THEN RAISE EXCEPTION 'workspace_access_revoked' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_message_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_message_identity BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_message_identity();

CREATE FUNCTION public.workspace_housing_access(p_accommodation_id uuid,p_permission text) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.accommodations a WHERE a.id=p_accommodation_id AND (a.organization_id IS NULL OR public.has_organization_permission(a.organization_id,p_permission)))
$$;
REVOKE ALL ON FUNCTION public.workspace_housing_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_housing_access(uuid,text) TO authenticated;
-- Restrictive policies compose with existing participant/owner policies. They
-- remove revoked owners' access without adding a new way to read other users.
CREATE POLICY workspace_private_visit_bookings ON public.visit_bookings AS RESTRICTIVE FOR SELECT TO authenticated USING (
 visitor_id=auth.uid() OR EXISTS(SELECT 1 FROM public.visit_slots s WHERE s.id=slot_id AND public.workspace_housing_access(s.accommodation_id,'content.manage')) OR public.is_admin());
CREATE POLICY workspace_private_housing_requests ON public.accommodation_requests AS RESTRICTIVE FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.workspace_housing_access(accommodation_id,'content.manage') OR public.is_admin());
CREATE POLICY workspace_private_visit_requests ON public.visit_requests AS RESTRICTIVE FOR SELECT TO authenticated USING (requester_id=auth.uid() OR accommodation_id IS NULL OR public.workspace_housing_access(accommodation_id,'content.manage') OR public.is_admin());
CREATE POLICY workspace_private_visit_slots ON public.visit_slots AS RESTRICTIVE FOR SELECT TO authenticated USING (status='open' OR public.workspace_housing_access(accommodation_id,'content.manage') OR public.is_admin());
CREATE POLICY workspace_private_visit_schedules ON public.visit_schedules AS RESTRICTIVE FOR SELECT TO authenticated USING (
 public.is_admin() OR accommodation_id IS NOT NULL AND public.workspace_housing_access(accommodation_id,'content.manage') OR accommodation_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.accommodations a WHERE a.owner_id=visit_schedules.owner_id AND NOT public.workspace_housing_access(a.id,'content.manage')));

CREATE FUNCTION public.guard_workspace_visit_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row jsonb;v_old jsonb;v_source uuid;v_org uuid;v_actor uuid:=auth.uid();v_source_owner uuid;BEGIN
 IF v_actor IS NULL OR auth.role()='service_role' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN v_row:=to_jsonb(OLD); ELSE v_row:=to_jsonb(NEW); END IF;
 IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD); END IF;
 IF TG_TABLE_NAME='visit_bookings' THEN
 IF v_old IS NOT NULL AND (v_row->>'visitor_id',v_row->>'slot_id') IS DISTINCT FROM (v_old->>'visitor_id',v_old->>'slot_id') THEN RAISE EXCEPTION 'visit_ownership_immutable' USING ERRCODE='42501'; END IF;
 IF v_row->>'visitor_id'=v_actor::text THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 SELECT s.accommodation_id INTO v_source FROM public.visit_slots s WHERE s.id=(v_row->>'slot_id')::uuid;
 ELSIF TG_TABLE_NAME='visit_requests' THEN
 IF v_old IS NOT NULL AND (v_row->>'requester_id',v_row->>'target_id',v_row->>'accommodation_id',v_row->>'conversation_id') IS DISTINCT FROM (v_old->>'requester_id',v_old->>'target_id',v_old->>'accommodation_id',v_old->>'conversation_id') THEN RAISE EXCEPTION 'visit_ownership_immutable' USING ERRCODE='42501'; END IF;
 IF v_row->>'requester_id'=v_actor::text THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 v_source:=(v_row->>'accommodation_id')::uuid;
 ELSE
 v_source:=(v_row->>'accommodation_id')::uuid;v_source_owner:=(v_row->>'owner_id')::uuid;
 IF v_old IS NOT NULL AND (v_row->>'owner_id',v_row->>'accommodation_id') IS DISTINCT FROM (v_old->>'owner_id',v_old->>'accommodation_id') THEN RAISE EXCEPTION 'visit_ownership_immutable' USING ERRCODE='42501'; END IF;
 END IF;
 IF v_source IS NOT NULL THEN
 SELECT organization_id INTO v_org FROM public.accommodations WHERE id=v_source;
 IF v_org IS NOT NULL AND NOT public.has_organization_permission(v_org,'content.manage') AND NOT public.is_admin() THEN RAISE EXCEPTION 'workspace_access_revoked' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='visit_schedules' AND EXISTS(SELECT 1 FROM public.accommodations a WHERE a.owner_id=v_source_owner AND a.organization_id IS NOT NULL AND NOT public.has_organization_permission(a.organization_id,'content.manage')) AND NOT public.is_admin() THEN RAISE EXCEPTION 'workspace_access_revoked' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_visit_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_visit_booking_guard BEFORE INSERT OR UPDATE OR DELETE ON public.visit_bookings FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_visit_mutation();
CREATE TRIGGER workspace_visit_request_guard BEFORE INSERT OR UPDATE OR DELETE ON public.visit_requests FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_visit_mutation();
CREATE TRIGGER workspace_visit_slot_guard BEFORE INSERT OR UPDATE OR DELETE ON public.visit_slots FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_visit_mutation();
CREATE TRIGGER workspace_visit_schedule_guard BEFORE INSERT OR UPDATE OR DELETE ON public.visit_schedules FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_visit_mutation();

-- One housing/leisure portfolio per existing owner; communities retain their
-- separate teams. No ownership or Stripe counterparty is transferred.
CREATE TABLE workspace_private.legacy_imports (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 imported_owner_id uuid NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, claimed_reason text, automatically_closed_at timestamptz,
 previous_status text CHECK(previous_status IN('active','suspended','archived'))
);
ALTER TABLE workspace_private.legacy_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_private.legacy_imports FROM PUBLIC,anon,authenticated;
GRANT ALL ON workspace_private.legacy_imports TO service_role;
CREATE FUNCTION public.workspace_backfill_legacy() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; v_org uuid; BEGIN
 FOR r IN SELECT DISTINCT a.owner_id,p.full_name,p.city FROM public.accommodations a JOIN public.profiles p ON p.id=a.owner_id JOIN auth.users u ON u.id=p.id
 WHERE a.organization_id IS NULL AND p.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p.id) LOOP
 INSERT INTO public.organizations(kind,subtype,name,slug,city,created_by,billing_owner_id) VALUES('housing','individual',left('Vivienda · '||coalesce(nullif(r.full_name,''),'Mi cartera'),100),'legacy-housing-'||r.owner_id,left(r.city,100),r.owner_id,r.owner_id)
 ON CONFLICT(slug) DO NOTHING;
 SELECT id INTO v_org FROM public.organizations WHERE slug='legacy-housing-'||r.owner_id;
 INSERT INTO workspace_private.legacy_imports(organization_id,imported_owner_id) VALUES(v_org,r.owner_id) ON CONFLICT DO NOTHING;
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_org,r.owner_id,'owner') ON CONFLICT DO NOTHING;
 UPDATE public.accommodations SET organization_id=v_org WHERE owner_id=r.owner_id AND organization_id IS NULL;
 END LOOP;
 FOR r IN SELECT DISTINCT s.owner_id,p.full_name,p.city FROM public.leisure_spots s JOIN public.profiles p ON p.id=s.owner_id JOIN auth.users u ON u.id=p.id
 WHERE s.organization_id IS NULL AND p.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p.id) LOOP
 INSERT INTO public.organizations(kind,subtype,name,slug,city,created_by,billing_owner_id) VALUES('leisure','business',left('Ocio · '||coalesce(nullif(r.full_name,''),'Mi negocio'),100),'legacy-leisure-'||r.owner_id,left(r.city,100),r.owner_id,r.owner_id) ON CONFLICT(slug) DO NOTHING;
 SELECT id INTO v_org FROM public.organizations WHERE slug='legacy-leisure-'||r.owner_id;
 INSERT INTO workspace_private.legacy_imports(organization_id,imported_owner_id) VALUES(v_org,r.owner_id) ON CONFLICT DO NOTHING;
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_org,r.owner_id,'owner') ON CONFLICT DO NOTHING;
 UPDATE public.leisure_spots SET organization_id=v_org WHERE owner_id=r.owner_id AND organization_id IS NULL;
 END LOOP;
 FOR r IN SELECT c.id,c.name,c.created_by,p.city FROM public.communities c JOIN public.profiles p ON p.id=c.created_by JOIN auth.users u ON u.id=p.id
 WHERE c.organization_id IS NULL AND p.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p.id) LOOP
 INSERT INTO public.organizations(kind,subtype,name,slug,city,created_by,billing_owner_id) VALUES('community','community',left(CASE WHEN length(btrim(r.name))>=3 THEN r.name ELSE 'Comunidad · '||r.name END,100),'legacy-community-'||r.id,left(r.city,100),r.created_by,r.created_by) ON CONFLICT(slug) DO NOTHING;
 SELECT id INTO v_org FROM public.organizations WHERE slug='legacy-community-'||r.id;
 INSERT INTO workspace_private.legacy_imports(organization_id,imported_owner_id) VALUES(v_org,r.created_by) ON CONFLICT DO NOTHING;
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_org,r.created_by,'owner') ON CONFLICT DO NOTHING;
 UPDATE public.communities SET organization_id=v_org WHERE id=r.id AND organization_id IS NULL;
 END LOOP;
 UPDATE public.events e SET organization_id=s.organization_id FROM public.leisure_spots s WHERE e.leisure_spot_id=s.id AND e.organizer_id=s.owner_id AND e.organization_id IS NULL AND s.organization_id IS NOT NULL;
 FOR r IN SELECT DISTINCT e.organizer_id,p.full_name,p.city FROM public.events e JOIN public.profiles p ON p.id=e.organizer_id JOIN auth.users u ON u.id=p.id
 WHERE e.organization_id IS NULL AND p.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p.id) LOOP
 INSERT INTO public.organizations(kind,subtype,name,slug,city,created_by,billing_owner_id) VALUES('community','organizer',left('Actividades · '||coalesce(nullif(r.full_name,''),'Mi organización'),100),'legacy-organizer-'||r.organizer_id,left(r.city,100),r.organizer_id,r.organizer_id) ON CONFLICT(slug) DO NOTHING;
 SELECT id INTO v_org FROM public.organizations WHERE slug='legacy-organizer-'||r.organizer_id;
 INSERT INTO workspace_private.legacy_imports(organization_id,imported_owner_id) VALUES(v_org,r.organizer_id) ON CONFLICT DO NOTHING;
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_org,r.organizer_id,'owner') ON CONFLICT DO NOTHING;
 UPDATE public.events SET organization_id=v_org WHERE organizer_id=r.organizer_id AND organization_id IS NULL;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.workspace_backfill_legacy() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_backfill_legacy() TO service_role;
SELECT public.workspace_backfill_legacy();

CREATE FUNCTION public.workspace_import_resources(p_organization_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND demo_cohort_id IS NULL) THEN RETURN; END IF;
 INSERT INTO public.workspace_resources(organization_id,type,title,status,source_id,data,created_at,updated_at)
 SELECT a.organization_id,'housing',left(a.title,160),CASE WHEN a.status='active' AND a.deleted_at IS NULL THEN 'published' ELSE 'archived' END,a.id,
 jsonb_build_object('title',a.title,'description',a.description,'city',a.city,'address',a.address,'price_monthly',a.price,'bedrooms',a.rooms,'bathrooms',a.bathrooms,'area_m2',a.sqm,'available_from',a.available_from,'images','[]'::jsonb,'legacy_images',to_jsonb(a.images)),coalesce(a.created_at,now()),coalesce(a.updated_at,now()) FROM public.accommodations a WHERE a.organization_id=p_organization_id
 ON CONFLICT(organization_id,type,source_id) DO NOTHING;
 INSERT INTO public.workspace_resources(organization_id,type,title,status,source_id,data,created_at,updated_at)
 SELECT s.organization_id,'venue',left(s.name,160),'published',s.id,jsonb_build_object('title',s.name,'description',s.description,'city',s.city,'address',s.address,'category',s.category,'images','[]'::jsonb,'legacy_images',to_jsonb(CASE WHEN cardinality(s.images)>0 THEN s.images WHEN s.image_url IS NOT NULL THEN ARRAY[s.image_url] ELSE '{}'::text[] END)),coalesce(s.created_at,now()),coalesce(s.updated_at,now()) FROM public.leisure_spots s WHERE s.organization_id=p_organization_id
 ON CONFLICT(organization_id,type,source_id) DO NOTHING;
 INSERT INTO public.workspace_resources(organization_id,type,title,status,source_id,data,created_at,updated_at)
 SELECT c.organization_id,'community',left(c.name,160),CASE WHEN c.is_deleted THEN 'archived' WHEN c.is_hidden THEN 'pending_review' ELSE 'published' END,c.id,jsonb_build_object('title',c.name,'description',c.description,'visibility',CASE WHEN c.is_private THEN 'private' ELSE 'public' END,'join_policy',CASE WHEN c.is_private THEN 'invite' ELSE 'open' END,'images','[]'::jsonb,'legacy_images',CASE WHEN c.image_url IS NOT NULL THEN jsonb_build_array(c.image_url) ELSE '[]'::jsonb END),c.created_at,c.created_at FROM public.communities c WHERE c.organization_id=p_organization_id
 ON CONFLICT(organization_id,type,source_id) DO NOTHING;
 INSERT INTO public.workspace_resources(organization_id,type,title,status,source_id,data,created_at,updated_at)
 SELECT e.organization_id,'event',left(e.title,160),CASE WHEN e.status='cancelled' THEN 'archived' ELSE 'published' END,e.id,jsonb_build_object('title',e.title,'description',e.description,'city',e.city,'address',e.address,'starts_at',e.start_date,'ends_at',e.end_date,'price_cents',round(coalesce(e.price,0)*100)::int,'capacity',e.max_capacity,'category',e.category,'images','[]'::jsonb,'legacy_images',to_jsonb(CASE WHEN cardinality(e.photos)>0 THEN e.photos WHEN e.image_url IS NOT NULL THEN ARRAY[e.image_url] ELSE '{}'::text[] END)),coalesce(e.created_at,now()),coalesce(e.updated_at,now()) FROM public.events e WHERE e.organization_id=p_organization_id
 ON CONFLICT(organization_id,type,source_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.workspace_import_resources(uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE r record; BEGIN FOR r IN SELECT id FROM public.organizations WHERE demo_cohort_id IS NULL LOOP PERFORM public.workspace_import_resources(r.id); END LOOP; END $$;

CREATE FUNCTION public.workspace_visit_json(p_booking_id uuid,p_organization_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',b.id,'type','visit','title',a.title,'subtitle',coalesce(p.full_name,'Persona interesada'),'status',CASE WHEN b.status LIKE 'cancelled_%' THEN 'cancelled' ELSE b.status END,
 'starts_at',(s.slot_date+s.start_time) AT TIME ZONE 'Europe/Madrid','data',jsonb_build_object('housing_id',a.id,'visitor_name',coalesce(p.full_name,'Persona interesada'),'payment_status',b.payment_status,'price_cents',b.price_cents,'ends_at',(s.slot_date+s.end_time) AT TIME ZONE 'Europe/Madrid'))
 FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id LEFT JOIN public.profiles p ON p.id=b.visitor_id
 WHERE b.id=p_booking_id AND a.organization_id=p_organization_id
$$;
REVOKE ALL ON FUNCTION public.workspace_visit_json(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Only explicit housing enquiry messages are shared with a professional team.
-- The rest of an owner's personal direct-message history stays private.
CREATE FUNCTION public.workspace_message_in_scope(p_message public.messages,p_organization_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_message.publishing_organization_id=p_organization_id OR EXISTS(SELECT 1 FROM public.accommodations a WHERE a.id=p_message.housing_listing_id AND a.organization_id=p_organization_id)
$$;
REVOKE ALL ON FUNCTION public.workspace_message_in_scope(public.messages,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_workspace_conversation_messages(p_organization_id uuid,p_conversation_id uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next jsonb; BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_uses_simulated_messages'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.conversation_id=p_conversation_id AND public.workspace_message_in_scope(m,p_organization_id)) THEN RAISE EXCEPTION 'conversation_not_found' USING ERRCODE='42501'; END IF;
 IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'invalid_cursor'; END IF;
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.created_at DESC,x.id DESC),'[]') INTO v_items FROM (
 SELECT m.id,m.created_at,jsonb_build_object('id',m.id,'body',CASE WHEN m.is_deleted THEN 'Mensaje eliminado' WHEN m.message_type='text' THEN m.content ELSE 'Archivo adjunto' END,'created_at',m.created_at,
 'author_name',coalesce(m.organization_label,p.full_name,'Persona interesada'),'is_mine',m.sender_id=auth.uid(),'from_organization',m.publishing_organization_id IS NOT NULL) payload
 FROM public.messages m LEFT JOIN public.profiles p ON p.id=m.sender_id WHERE m.conversation_id=p_conversation_id AND public.workspace_message_in_scope(m,p_organization_id)
 AND (p_before IS NULL OR (m.created_at,m.id)<(p_before,p_before_id)) ORDER BY m.created_at DESC,m.id DESC LIMIT v_limit+1) x;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=jsonb_build_object('created_at',v_items->(v_limit-1)->>'created_at','id',v_items->(v_limit-1)->>'id'); END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinality DESC),'[]') INTO v_items FROM jsonb_array_elements(v_items) WITH ORDINALITY;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;

ALTER FUNCTION public.get_workspace_resources(uuid,text,uuid,integer) RENAME TO workspace_resources_before_domain;
ALTER FUNCTION public.get_workspace_resource(uuid,text,uuid) RENAME TO workspace_resource_before_domain;
ALTER FUNCTION public.workspace_resource_action(uuid,text,uuid,text,jsonb) RENAME TO workspace_action_before_domain;
ALTER FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) RENAME TO workspace_save_before_domain;

CREATE FUNCTION public.get_workspace_resources(p_organization_id uuid,p_resource_type text,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next text; BEGIN
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_resource_type IN('visit','conversation') THEN 'content.manage' ELSE 'resource.read' END);
 PERFORM public.workspace_import_resources(p_organization_id);
 IF public.current_demo_cohort() IS NOT NULL OR p_resource_type NOT IN('visit','conversation') THEN RETURN public.workspace_resources_before_domain(p_organization_id,p_resource_type,p_cursor,p_limit); END IF;
 IF p_resource_type='visit' THEN
 SELECT coalesce(jsonb_agg(public.workspace_visit_json(x.id,p_organization_id) ORDER BY x.id),'[]') INTO v_items FROM (
 SELECT b.id FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE a.organization_id=p_organization_id AND (p_cursor IS NULL OR b.id>p_cursor) ORDER BY b.id LIMIT v_limit+1) x;
 ELSE
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'type','conversation','title',x.title,'subtitle','Consulta de vivienda','status','active','data','{}'::jsonb) ORDER BY x.id),'[]') INTO v_items FROM (
 SELECT c.id,coalesce(max(a.title),'Conversación de tu espacio') title FROM public.conversations c JOIN public.messages m ON m.conversation_id=c.id LEFT JOIN public.accommodations a ON a.id=m.housing_listing_id AND a.organization_id=p_organization_id
 WHERE public.workspace_message_in_scope(m,p_organization_id) AND (p_cursor IS NULL OR c.id>p_cursor) GROUP BY c.id ORDER BY c.id LIMIT v_limit+1) x;
 END IF;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;

CREATE FUNCTION public.get_workspace_resource(p_organization_id uuid,p_resource_type text,p_resource_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_result jsonb;v_page jsonb; BEGIN
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_resource_type IN('visit','conversation') THEN 'content.manage' ELSE 'resource.read' END);
 IF public.current_demo_cohort() IS NOT NULL OR p_resource_type NOT IN('visit','conversation') THEN RETURN public.workspace_resource_before_domain(p_organization_id,p_resource_type,p_resource_id); END IF;
 IF p_resource_type='visit' THEN v_result:=public.workspace_visit_json(p_resource_id,p_organization_id); IF v_result IS NULL THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF; RETURN v_result; END IF;
 v_page:=public.get_workspace_conversation_messages(p_organization_id,p_resource_id);
 RETURN jsonb_build_object('id',p_resource_id,'type','conversation','title','Conversación de vivienda','status','active','data',jsonb_build_object('messages',v_page->'items','messages_cursor',v_page->'next_cursor'));
END $$;

CREATE FUNCTION public.workspace_resource_action(p_organization_id uuid,p_resource_type text,p_resource_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.visit_bookings%ROWTYPE;s public.visit_slots%ROWTYPE;v_owner uuid;v_body text;v_name text;v_message uuid;v_request text;v_r public.workspace_resources%ROWTYPE; BEGIN
 IF p_resource_type NOT IN('visit','conversation') THEN RETURN public.workspace_action_before_domain(p_organization_id,p_resource_type,p_resource_id,p_action,p_data); END IF;
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NOT NULL THEN
 SELECT * INTO v_r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type=p_resource_type FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 IF p_resource_type='visit' AND p_action IN('confirm','cancel','complete') THEN
 IF v_r.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'visit_not_active'; END IF;
 UPDATE public.workspace_resources SET status=CASE p_action WHEN 'confirm' THEN 'confirmed' WHEN 'cancel' THEN 'cancelled' ELSE 'completed' END WHERE id=v_r.id RETURNING * INTO v_r;
 ELSIF p_resource_type='conversation' AND p_action='send' THEN
 v_body:=btrim(p_data->>'body'); IF v_body IS NULL OR length(v_body) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid_message'; END IF;
 IF jsonb_array_length(coalesce(v_r.data->'messages','[]'))>=80 THEN RAISE EXCEPTION 'demo_reset_required'; END IF;
 UPDATE public.workspace_resources SET data=jsonb_set(data,'{messages}',coalesce(data->'messages','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'body',v_body,'is_mine',true,'author_name','Tu equipo','created_at',now()))) WHERE id=v_r.id RETURNING * INTO v_r;
 ELSE RAISE EXCEPTION 'unsupported_resource_action'; END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'demo.'||p_action,p_resource_id);
 RETURN public.workspace_resource_json(v_r);
 END IF;
 IF p_resource_type='visit' THEN
 IF p_action IS NULL OR p_action NOT IN('confirm','cancel','complete') THEN RAISE EXCEPTION 'unsupported_resource_action'; END IF;
 -- Same lock as checkout reconciliation/webhooks, before locking the booking.
 PERFORM public.lock_marketplace_resource('visit',p_resource_id);
 SELECT vb.* INTO b FROM public.visit_bookings vb JOIN public.visit_slots vs ON vs.id=vb.slot_id JOIN public.accommodations a ON a.id=vs.accommodation_id WHERE vb.id=p_resource_id AND a.organization_id=p_organization_id FOR UPDATE OF vb;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.visit_slots WHERE id=b.slot_id FOR UPDATE;
 IF b.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'visit_not_active'; END IF;
 IF p_action='confirm' THEN
 IF b.price_cents>0 AND b.payment_status<>'paid' THEN RAISE EXCEPTION 'visit_payment_required'; END IF;
 IF s.status<>'open' OR s.slot_date<current_date THEN RAISE EXCEPTION 'visit_unavailable'; END IF;
 UPDATE public.visit_bookings SET status='confirmed',updated_at=now() WHERE id=b.id;
 ELSIF p_action='complete' THEN
 IF b.status<>'confirmed' OR (s.slot_date+s.start_time) AT TIME ZONE 'Europe/Madrid'>now() THEN RAISE EXCEPTION 'visit_not_started'; END IF;
 UPDATE public.visit_bookings SET status='completed',updated_at=now() WHERE id=b.id;
 ELSE
 IF b.payment_status IN('pending','paid') OR EXISTS(SELECT 1 FROM public.payments p WHERE p.type='visit' AND p.ref_id=b.id AND (p.status IN('pending','processing') OR p.amount_cents>p.refunded_cents AND p.status NOT IN('failed','canceled','refunded'))) THEN RAISE EXCEPTION 'visit_payment_review_required'; END IF;
 IF EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state cs ON cs.payment_id=p.id WHERE p.type='visit' AND p.ref_id=b.id AND p.status IN('pending','processing','failed','canceled') AND coalesce(cs.state,'legacy')<>'closed') THEN RAISE EXCEPTION 'visit_payment_review_required'; END IF;
 UPDATE public.visit_bookings SET status='cancelled_by_owner',updated_at=now() WHERE id=b.id;
 END IF;
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(b.visitor_id,'system',CASE p_action WHEN 'cancel' THEN 'Visita cancelada' WHEN 'complete' THEN 'Visita realizada' ELSE 'Visita confirmada' END,'Tu visita se ha actualizado. Consulta los detalles en Franky.',jsonb_build_object('kind','visit_'||p_action,'booking_id',b.id,'accommodation_id',s.accommodation_id));
 ELSE
 IF p_action IS NULL OR p_action<>'send' THEN RAISE EXCEPTION 'unsupported_resource_action'; END IF;
 v_body:=btrim(p_data->>'body');v_request:=p_data->>'client_request_id';
 IF v_body IS NULL OR length(v_body) NOT BETWEEN 1 AND 4000 OR v_request IS NULL OR length(v_request) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'invalid_message'; END IF;
 IF EXISTS(SELECT 1 FROM public.messages WHERE publishing_organization_id=p_organization_id AND workspace_request_id=v_request AND (conversation_id<>p_resource_id OR content IS DISTINCT FROM v_body)) THEN RAISE EXCEPTION 'request_reused';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.conversation_id=p_resource_id AND public.workspace_message_in_scope(m,p_organization_id)) THEN RAISE EXCEPTION 'conversation_not_found' USING ERRCODE='42501'; END IF;
 SELECT name,billing_owner_id INTO v_name,v_owner FROM public.organizations WHERE id=p_organization_id;
 IF EXISTS(SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=p_resource_id AND cp.user_id<>v_owner AND private.crush_live_is_blocked(v_owner,cp.user_id)) THEN RAISE EXCEPTION 'conversation_unavailable' USING ERRCODE='42501'; END IF;
 -- Existing pair-block triggers run with the real actor and prevent a team
 -- member from bypassing a recipient's block. No participant is auto-enrolled.
 INSERT INTO public.messages(conversation_id,sender_id,content,message_type,publishing_organization_id,organization_label,workspace_request_id)
 VALUES(p_resource_id,auth.uid(),v_body,'text',p_organization_id,v_name,v_request) ON CONFLICT(publishing_organization_id,workspace_request_id) WHERE publishing_organization_id IS NOT NULL AND workspace_request_id IS NOT NULL DO NOTHING RETURNING id INTO v_message;
 END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),p_resource_type||'.'||p_action,p_resource_id);
 RETURN public.get_workspace_resource(p_organization_id,p_resource_type,p_resource_id);
END $$;

-- Existing public images are retained only after checking them against the
-- current source row. New uploads still require the private org storage path.
CREATE FUNCTION public.save_workspace_resource(p_organization_id uuid,p_resource_type text,p_data jsonb,p_resource_id uuid DEFAULT NULL,p_publish boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.workspace_resources%ROWTYPE;v_new public.workspace_resources%ROWTYPE;v_result jsonb;v_legacy text[]:='{}';v_keep text[]:='{}';v_url text;v_new_urls text[]:='{}';BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF p_resource_id IS NOT NULL THEN
 SELECT * INTO v_old FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type=p_resource_type FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(value),'{}') INTO v_legacy FROM jsonb_array_elements_text(coalesce(v_old.data->'legacy_images','[]'));
 END IF;
 IF p_data ? 'retain_legacy_images' THEN
 IF jsonb_typeof(p_data->'retain_legacy_images')<>'array' OR jsonb_array_length(p_data->'retain_legacy_images')>30 THEN RAISE EXCEPTION 'invalid_images'; END IF;
 FOR v_url IN SELECT jsonb_array_elements_text(p_data->'retain_legacy_images') LOOP IF NOT v_url=ANY(v_legacy) THEN RAISE EXCEPTION 'invalid_legacy_image'; END IF;v_keep:=array_append(v_keep,v_url);END LOOP;
 ELSE v_keep:=v_legacy; END IF;
 v_result:=public.workspace_save_before_domain(p_organization_id,p_resource_type,p_data,p_resource_id,p_publish);
 SELECT * INTO v_new FROM public.workspace_resources WHERE id=(v_result->>'id')::uuid;
 UPDATE public.workspace_resources SET data=data||jsonb_build_object('legacy_images',to_jsonb(v_keep)) WHERE id=v_new.id RETURNING * INTO v_new;
 IF p_publish AND public.current_demo_cohort() IS NULL AND v_new.source_id IS NOT NULL THEN
 SELECT coalesce(array_agg('https://franky.es/api/workspaces/media/'||value),'{}') INTO v_new_urls FROM jsonb_array_elements_text(coalesce(v_new.data->'images','[]'));
 IF p_resource_type='housing' THEN UPDATE public.accommodations SET images=v_keep||v_new_urls WHERE id=v_new.source_id AND organization_id=p_organization_id;
 ELSIF p_resource_type='venue' THEN UPDATE public.leisure_spots SET images=v_keep||v_new_urls,image_url=(v_keep||v_new_urls)[1] WHERE id=v_new.source_id AND organization_id=p_organization_id;
 ELSIF p_resource_type='event' THEN UPDATE public.events SET photos=v_keep||v_new_urls,image_url=(v_keep||v_new_urls)[1] WHERE id=v_new.source_id AND organization_id=p_organization_id;
 ELSIF p_resource_type='community' THEN UPDATE public.communities SET image_url=(v_keep||v_new_urls)[1] WHERE id=v_new.source_id AND organization_id=p_organization_id; END IF;
 END IF;
 IF p_publish AND public.current_demo_cohort() IS NULL AND (
 p_resource_type='community' AND EXISTS(SELECT 1 FROM public.communities WHERE id=v_new.source_id AND is_hidden)
 OR p_resource_type='post' AND EXISTS(SELECT 1 FROM public.fomo_threads WHERE id=v_new.source_id AND is_hidden)) THEN
 UPDATE public.workspace_resources SET status='pending_review' WHERE id=v_new.id RETURNING * INTO v_new; END IF;
 RETURN public.workspace_resource_json(v_new);
END $$;

-- Older clients retain their cancellation endpoint but cannot remove a paid
-- service while money remains outstanding. Authorization precedes inspection.
ALTER FUNCTION public.cancel_visit_booking(uuid) RENAME TO cancel_visit_booking_before_workspace;
REVOKE ALL ON FUNCTION public.cancel_visit_booking_before_workspace(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cancel_visit_booking(p_booking_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.visit_bookings%ROWTYPE;v_org uuid;v_owner uuid;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM public.lock_marketplace_resource('visit',p_booking_id);
 SELECT vb.* INTO b FROM public.visit_bookings vb JOIN public.visit_slots s ON s.id=vb.slot_id WHERE vb.id=p_booking_id AND (vb.visitor_id=auth.uid() OR s.owner_id=auth.uid()) FOR UPDATE OF vb;
 IF b.id IS NULL THEN RAISE EXCEPTION 'visit_not_found' USING ERRCODE='42501'; END IF;
 SELECT a.organization_id,s.owner_id INTO v_org,v_owner FROM public.visit_slots s JOIN public.accommodations a ON a.id=s.accommodation_id WHERE s.id=b.slot_id;
 IF v_owner=auth.uid() AND v_org IS NOT NULL THEN PERFORM public.workspace_require(v_org,'content.manage'); END IF;
 IF b.status IN('pending','confirmed') AND (b.payment_status='paid' OR EXISTS(SELECT 1 FROM public.payments p WHERE p.type='visit' AND p.ref_id=b.id AND p.amount_cents>p.refunded_cents AND p.status NOT IN('pending','processing','failed','canceled','refunded'))) THEN RAISE EXCEPTION 'visit_payment_review_required'; END IF;
 RETURN public.cancel_visit_booking_before_workspace(p_booking_id);
END $$;
REVOKE ALL ON FUNCTION public.cancel_visit_booking(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_visit_booking(uuid) TO authenticated;

CREATE FUNCTION public.get_workspace_housing_interests(p_organization_id uuid,p_resource_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_source uuid;v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 SELECT source_id INTO v_source FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO v_items FROM (SELECT r.id,coalesce(p.full_name,'Persona interesada') name,r.status,r.message,r.created_at FROM public.accommodation_requests r LEFT JOIN public.profiles p ON p.id=r.user_id WHERE r.accommodation_id=v_source AND (p_cursor IS NULL OR r.id>p_cursor) ORDER BY r.id LIMIT v_limit+1) x;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;

CREATE FUNCTION public.get_workspace_housing_schedule(p_organization_id uuid,p_resource_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_source uuid;v_owner uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 SELECT r.source_id,a.owner_id INTO v_source,v_owner FROM public.workspace_resources r LEFT JOIN public.accommodations a ON a.id=r.source_id AND a.organization_id=r.organization_id WHERE r.id=p_resource_id AND r.organization_id=p_organization_id AND r.type='housing';
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 RETURN jsonb_build_object('timezone','Europe/Madrid','rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'weekday',s.weekday,'start_time',s.start_time,'end_time',s.end_time,'slot_minutes',s.slot_minutes,'capacity',s.capacity,'price_cents',s.price_cents,'inherited',s.accommodation_id IS NULL) ORDER BY weekday,start_time),'[]') FROM public.visit_schedules s WHERE s.active AND s.owner_id=v_owner AND (s.accommodation_id=v_source OR s.accommodation_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.visit_schedules own WHERE own.accommodation_id=v_source AND own.active))));
END $$;

CREATE FUNCTION public.save_workspace_housing_schedule(p_organization_id uuid,p_resource_id uuid,p_rows jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_source uuid;v_owner uuid;v_row jsonb;v_day integer;v_start time;v_end time;v_minutes integer;v_capacity integer;v_price integer;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_schedule_not_published'; END IF;
 SELECT r.source_id,a.owner_id INTO v_source,v_owner FROM public.workspace_resources r JOIN public.accommodations a ON a.id=r.source_id AND a.organization_id=r.organization_id WHERE r.id=p_resource_id AND r.organization_id=p_organization_id AND r.type='housing' FOR UPDATE OF a;
 IF v_source IS NULL THEN RAISE EXCEPTION 'publish_housing_first'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 21 THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
 -- Validate all rows and overlaps before replacing any availability. Existing
 -- bookings/slots retain their date, capacity and originally agreed price.
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
 v_day:=(v_row->>'weekday')::int;v_start:=(v_row->>'start_time')::time;v_end:=(v_row->>'end_time')::time;v_minutes:=coalesce((v_row->>'slot_minutes')::int,30);v_capacity:=coalesce((v_row->>'capacity')::int,1);v_price:=coalesce((v_row->>'price_cents')::int,0);
 IF v_day IS NULL OR v_start IS NULL OR v_end IS NULL OR v_day NOT BETWEEN 0 AND 6 OR v_end<=v_start OR v_minutes NOT BETWEEN 10 AND 240 OR v_capacity NOT BETWEEN 1 AND 100 OR v_price NOT BETWEEN 0 AND 100000 OR extract(epoch FROM(v_end-v_start))<v_minutes*60 THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
 IF v_price>0 AND (NOT public.has_organization_permission(p_organization_id,'finance.manage') OR coalesce(auth.jwt()->>'aal','')<>'aal2') THEN RAISE EXCEPTION 'finance_mfa_required' USING ERRCODE='42501'; END IF;
 IF v_price>0 AND NOT EXISTS(SELECT 1 FROM public.connect_accounts WHERE user_id=v_owner AND charges_enabled AND payouts_enabled) THEN RAISE EXCEPTION 'connect_setup_required'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) WITH ORDINALITY a(value,ord) JOIN jsonb_array_elements(p_rows) WITH ORDINALITY b(value,ord) ON a.ord<b.ord AND a.value->>'weekday'=b.value->>'weekday' AND (a.value->>'start_time')::time<(b.value->>'end_time')::time AND (b.value->>'start_time')::time<(a.value->>'end_time')::time) THEN RAISE EXCEPTION 'overlapping_schedule'; END IF;
 UPDATE public.visit_schedules SET active=false,updated_at=now() WHERE accommodation_id=v_source;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
 INSERT INTO public.visit_schedules(owner_id,accommodation_id,weekday,start_time,end_time,slot_minutes,capacity,price_cents) VALUES(v_owner,v_source,(v_row->>'weekday')::int,(v_row->>'start_time')::time,(v_row->>'end_time')::time,coalesce((v_row->>'slot_minutes')::int,30),coalesce((v_row->>'capacity')::int,1),coalesce((v_row->>'price_cents')::int,0)); END LOOP;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'housing.schedule_updated',p_resource_id);
 RETURN public.get_workspace_housing_schedule(p_organization_id,p_resource_id);
END $$;

-- Function renaming keeps old OIDs/grants, so explicitly remove every public
-- grant on delegate helpers. The wrappers are the only client entry points.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('workspace_resources_before_domain','workspace_resource_before_domain','workspace_action_before_domain','workspace_save_before_domain') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP;
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_workspace_resources','get_workspace_resource','workspace_resource_action','save_workspace_resource','get_workspace_conversation_messages','get_workspace_housing_interests','get_workspace_housing_schedule','save_workspace_housing_schedule') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END LOOP;
END $$;
$franky_component_10$;

-- SOURCE 20260922210000_workspace_insights.sql
EXECUTE $franky_component_11$
-- Operational totals use canonical ledgers. Optional catalogue telemetry never
-- authorizes payments, commissions, rewards or user privileges.
CREATE TABLE public.workspace_institutional_snapshots (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 period_start date NOT NULL, period_end date NOT NULL,
 metrics jsonb NOT NULL, campus_ids uuid[] NOT NULL,
 computed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,period_start)
);
ALTER TABLE public.workspace_institutional_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_institutional_snapshots FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_institutional_snapshots TO service_role;
COMMENT ON TABLE public.workspace_institutional_snapshots IS 'Closed-month, fixed-scope privacy snapshots; no client row access, ad hoc filters or exports. Retain 24 months; no individual identities.';

CREATE FUNCTION public.guard_institutional_telemetry() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user IN('anon','authenticated') AND (NEW.name='institutional_consultation_v1' OR TG_OP='UPDATE' AND OLD.name='institutional_consultation_v1')
 THEN RAISE EXCEPTION 'institutional_telemetry_rpc_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_institutional_telemetry() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER institutional_telemetry_guard BEFORE INSERT OR UPDATE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.guard_institutional_telemetry();
CREATE INDEX analytics_institutional_time ON public.analytics_events(created_at,user_id) WHERE name='institutional_consultation_v1';

CREATE FUNCTION public.track_institutional_consultation(p_kind text,p_entity_id uuid,p_consent boolean,p_platform text DEFAULT 'web') RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_university uuid;v_actor uuid:=auth.uid();BEGIN
 IF p_consent IS DISTINCT FROM true OR v_actor IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RETURN false; END IF;
 IF p_kind NOT IN('university','career','cutoff') OR p_kind IS NULL OR p_platform NOT IN('web','ios','android') OR p_platform IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_actor AND is_discarded IS NOT TRUE) THEN RETURN false; END IF;
 IF p_kind='university' THEN SELECT id INTO v_university FROM public.universities WHERE id=p_entity_id;
 ELSE SELECT university_id INTO v_university FROM public.careers WHERE id=p_entity_id; END IF;
 IF v_university IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('institutional-view:'||v_actor::text||p_entity_id::text||p_kind,0));
 -- Retries, theme changes and rerenders count once per account/entity/day.
 IF EXISTS(SELECT 1 FROM public.analytics_events WHERE user_id=v_actor AND name='institutional_consultation_v1'
 AND props->>'kind'=p_kind AND props->>'entity_id'=p_entity_id::text AND created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid') THEN RETURN false; END IF;
 INSERT INTO public.analytics_events(user_id,name,props,platform) VALUES(v_actor,'institutional_consultation_v1',
 jsonb_build_object('kind',p_kind,'entity_id',p_entity_id,'university_id',v_university,'consent_version','optional-analytics-v1'),p_platform);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.track_institutional_consultation(text,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.track_institutional_consultation(text,uuid,boolean,text) TO authenticated;

CREATE FUNCTION public.workspace_institutional_metrics(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_start date:=(date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')-interval '1 month')::date;
 v_end date:=date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')::date; v_metrics jsonb;v_campuses uuid[];v_saved_campuses uuid[];BEGIN
 PERFORM public.workspace_require(p_organization_id,'analytics.read');
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND kind='university' AND demo_cohort_id IS NULL) THEN RETURN '[]'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('institutional-snapshot:'||p_organization_id::text||v_start::text,0));
 SELECT coalesce(array_agg(university_id ORDER BY university_id),'{}') INTO v_campuses FROM public.organization_campuses WHERE organization_id=p_organization_id;
 SELECT metrics,ARRAY(SELECT unnest(campus_ids) ORDER BY 1) INTO v_metrics,v_saved_campuses FROM public.workspace_institutional_snapshots WHERE organization_id=p_organization_id AND period_start=v_start;
 IF FOUND THEN
  IF v_saved_campuses IS DISTINCT FROM v_campuses THEN
   -- Never reveal removed campuses or recompute overlapping groups that can be
   -- subtracted to reconstruct suppressed people. Resume with a new period.
   RETURN (SELECT coalesce(jsonb_agg(m||jsonb_build_object('value',NULL,'suppressed',true,'scope_changed',true)),'[]') FROM jsonb_array_elements(v_metrics) m);
  END IF;
  RETURN v_metrics;
 END IF;
 WITH counts AS (
 SELECT k.kind,k.label,count(DISTINCT e.user_id) total FROM (VALUES ('university','Personas que consultaron la universidad'),('career','Personas que consultaron carreras'),('cutoff','Personas que consultaron notas de corte')) k(kind,label)
 LEFT JOIN public.analytics_events e ON e.name='institutional_consultation_v1' AND e.props->>'kind'=k.kind AND e.props->>'consent_version'='optional-analytics-v1'
 AND e.props->>'university_id'=ANY(SELECT unnest(v_campuses)::text)
 AND e.created_at>=v_start::timestamp AT TIME ZONE 'Europe/Madrid' AND e.created_at<v_end::timestamp AT TIME ZONE 'Europe/Madrid'
 AND e.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=e.user_id)
 AND NOT EXISTS(SELECT 1 FROM public.organization_memberships m WHERE m.organization_id=p_organization_id AND m.user_id=e.user_id)
 GROUP BY k.kind,k.label)
 SELECT jsonb_agg(jsonb_build_object('key','institutional_'||kind,'label',label,'value',CASE WHEN total>=10 THEN total ELSE NULL END,
 'suppressed',total<10,'period_label',to_char(v_start,'YYYY-MM'),'source','optional_analytics')) INTO v_metrics FROM counts;
 INSERT INTO public.workspace_institutional_snapshots(organization_id,period_start,period_end,metrics,campus_ids) VALUES(p_organization_id,v_start,v_end,v_metrics,v_campuses);
 RETURN v_metrics;
END $$;
REVOKE ALL ON FUNCTION public.workspace_institutional_metrics(uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.get_workspace_dashboard(uuid) RENAME TO workspace_dashboard_before_insights;
REVOKE ALL ON FUNCTION public.workspace_dashboard_before_insights(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_workspace_dashboard(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;v_metrics jsonb;v_notes jsonb:='[]';v_org public.organizations%ROWTYPE;
 v_start date:=(date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')-interval '1 month')::date;
 v_end date:=date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')::date;v_label text;
 v_gross bigint;v_discount bigint;v_refund bigint;v_fee bigint;v_collected bigint;v_pending bigint;v_count bigint;v_contacts bigint;v_visits bigint;v_confirmed bigint;v_occupied bigint;v_coverage bigint;v_total bigint;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');
 v_result:=public.workspace_dashboard_before_insights(p_organization_id);
 SELECT * INTO v_org FROM public.organizations WHERE id=p_organization_id;
 SELECT coalesce(jsonb_agg(m),'[]') INTO v_metrics FROM jsonb_array_elements(v_result->'metrics') m WHERE m->>'key'<>'net';
 v_label:=to_char(v_start,'YYYY-MM');
 IF v_org.demo_cohort_id IS NOT NULL THEN
  RETURN jsonb_set(v_result,'{metrics}',v_metrics)||jsonb_build_object('notes',jsonb_build_array('Datos de demostración. No se mezclan con métricas ni cobros reales.'));
 END IF;
 IF public.has_organization_permission(p_organization_id,'finance.read') THEN
 WITH scoped AS (SELECT p.*,
 CASE WHEN coalesce(p.metadata->>'discount_cents','')~'^[0-9]{1,9}$' THEN (p.metadata->>'discount_cents')::bigint ELSE 0 END discount
 FROM public.payments p WHERE p.created_at>=v_start::timestamp AT TIME ZONE 'Europe/Madrid' AND p.created_at<v_end::timestamp AT TIME ZONE 'Europe/Madrid' AND lower(p.currency)='eur'
 AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id IN(p.buyer_id,p.seller_id))
 AND ((p.ref_table='accommodations' AND p.type='rent' AND EXISTS(SELECT 1 FROM public.accommodations a WHERE a.id=p.ref_id AND a.organization_id=p_organization_id))
 OR (p.ref_table='event_tickets' AND EXISTS(SELECT 1 FROM public.event_tickets t JOIN public.events e ON e.id=t.event_id WHERE t.id=p.ref_id AND e.organization_id=p_organization_id))
 OR (p.ref_table='visit_bookings' AND EXISTS(SELECT 1 FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE b.id=p.ref_id AND a.organization_id=p_organization_id))))
 SELECT coalesce(sum(amount_cents+discount) FILTER(WHERE status IN('succeeded','partially_refunded','refunded')),0),
 coalesce(sum(discount) FILTER(WHERE status IN('succeeded','partially_refunded','refunded')),0),
 coalesce(sum(amount_cents) FILTER(WHERE status IN('succeeded','partially_refunded','refunded')),0),
 coalesce(sum(refunded_cents) FILTER(WHERE status IN('succeeded','partially_refunded','refunded')),0),
 coalesce(sum(application_fee_cents) FILTER(WHERE status IN('succeeded','partially_refunded','refunded')),0),
 coalesce(sum(amount_cents) FILTER(WHERE status IN('pending','processing')),0)
 INTO v_gross,v_discount,v_collected,v_refund,v_fee,v_pending FROM scoped;
 SELECT v_metrics||jsonb_agg(jsonb_build_object('key',x.key,'label',x.label,'value',x.amount,'unit','cents','period_label',v_label,'source','payment_ledger')) INTO v_metrics FROM
 (VALUES('gross','Ventas antes de descuentos',v_gross),('discount','Descuentos aplicados',v_discount),('collected','Cobrado registrado',v_collected),('refunds','Devoluciones registradas',v_refund),('fees','Comisiones registradas',v_fee),('net','Neto provisional',v_collected-v_refund-v_fee),('pending','Pedidos pendientes',v_pending)) x(key,label,amount);
 v_notes:=v_notes||jsonb_build_array('Economía: pedidos iniciados en '||v_label||', con su estado actual. Neto provisional = cobrado − devoluciones − comisiones registradas. No representa liquidaciones bancarias; los reintegros de comisiones deben conciliarse con Stripe.');
 END IF;
 IF public.has_organization_permission(p_organization_id,'analytics.read') THEN
 IF v_org.kind='housing' THEN
  SELECT count(*) INTO v_count FROM public.accommodation_views v JOIN public.accommodations a ON a.id=v.accommodation_id
  WHERE a.organization_id=p_organization_id AND v.view_date>=v_start AND v.view_date<v_end AND v.viewer_id<>a.owner_id AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=v.viewer_id);
  SELECT count(DISTINCT r.user_id) INTO v_contacts FROM public.accommodation_requests r JOIN public.accommodations a ON a.id=r.accommodation_id
  WHERE a.organization_id=p_organization_id AND r.created_at>=v_start::timestamp AT TIME ZONE 'Europe/Madrid' AND r.created_at<v_end::timestamp AT TIME ZONE 'Europe/Madrid' AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=r.user_id);
  SELECT count(*),count(*) FILTER(WHERE b.status IN('confirmed','completed')) INTO v_visits,v_confirmed FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id
  WHERE a.organization_id=p_organization_id AND b.created_at>=v_start::timestamp AT TIME ZONE 'Europe/Madrid' AND b.created_at<v_end::timestamp AT TIME ZONE 'Europe/Madrid' AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=b.visitor_id);
  SELECT v_metrics||jsonb_agg(jsonb_build_object('key',x.key,'label',x.label,'value',x.amount,'period_label',v_label,'source','housing_records')) INTO v_metrics FROM
  (VALUES('housing_views','Consultas de fichas (persona/día)',v_count),('housing_contacts','Personas interesadas',v_contacts),('housing_visits','Visitas solicitadas',v_visits),('housing_confirmed','Visitas confirmadas o realizadas',v_confirmed)) x(key,label,amount);
  SELECT count(*),count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.tenancies t WHERE t.accommodation_id=a.id AND t.confirmed_at IS NOT NULL AND t.status IN('active','ended') AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=t.tenant_id)))
  INTO v_total,v_coverage FROM public.accommodations a WHERE a.organization_id=p_organization_id AND a.deleted_at IS NULL;
  SELECT count(DISTINCT t.accommodation_id) INTO v_occupied FROM public.tenancies t JOIN public.accommodations a ON a.id=t.accommodation_id WHERE a.organization_id=p_organization_id AND a.deleted_at IS NULL
  AND t.confirmed_at IS NOT NULL AND t.status='active' AND (t.start_date IS NULL OR t.start_date<=current_date) AND (t.end_date IS NULL OR t.end_date>=current_date) AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=t.tenant_id);
  v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','housing_occupied','label','Pisos con inquilinos confirmados','value',v_occupied,'period_label','Situación actual'),jsonb_build_object('key','housing_occupancy','label','Ocupación documentada de cartera','value',CASE WHEN v_total>0 AND v_coverage=v_total THEN round(100.0*v_occupied/v_total,1) ELSE NULL END,'unit','%','period_label','Situación actual'));
  v_notes:=v_notes||jsonb_build_array('Vivienda: consultas contadas una vez por persona y día. La ocupación sólo muestra un porcentaje si toda la cartera tiene historial de inquilinos confirmado; un piso sin registros no se supone vacío.');
 ELSIF v_org.kind='university' THEN
  v_metrics:=v_metrics||public.workspace_institutional_metrics(p_organization_id);
  v_notes:=v_notes||jsonb_build_array('Consultas universitarias: personas con sesión y analítica opcional aceptada en '||v_label||'. Snapshot de mes cerrado y campus fijos. Se excluye equipo y demostraciones; grupos inferiores a 10 permanecen protegidos. No equivale al total de visitantes.');
 END IF;
 END IF;
 RETURN jsonb_set(v_result,'{metrics}',v_metrics)||jsonb_build_object('notes',v_notes);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_dashboard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_dashboard(uuid) TO authenticated;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
 PERFORM cron.schedule('workspace-insights-retention','40 3 1 * *',$job$DELETE FROM public.workspace_institutional_snapshots WHERE period_end < current_date-interval '24 months';$job$);
END IF; END $$;
NOTIFY pgrst,'reload schema';
$franky_component_11$;

-- SOURCE 20260922220000_workspace_community_admission.sql
EXECUTE $franky_component_12$
-- Membership is independent from discoverability and university affiliation.
-- DEFINER entrypoints authorize the current account/resource on every request.

CREATE SCHEMA IF NOT EXISTS workspace_private;
REVOKE ALL ON SCHEMA workspace_private FROM PUBLIC,anon,authenticated;
ALTER TABLE public.communities ADD COLUMN join_policy text NOT NULL DEFAULT 'open'
 CHECK(join_policy IN('open','request','invite'));
UPDATE public.communities SET join_policy='invite' WHERE is_private;
-- Old clients create private communities without a join_policy field. Keep
-- their invitation-only contract; workspace publication applies an explicitly
-- chosen independent admission policy afterward within the same transaction.
CREATE FUNCTION workspace_private.default_private_community_admission() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.is_private AND NEW.join_policy='open' THEN NEW.join_policy:='invite'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.default_private_community_admission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER private_community_admission_default BEFORE INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION workspace_private.default_private_community_admission();

CREATE TABLE public.workspace_community_admissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resource_id uuid NOT NULL REFERENCES public.workspace_resources(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 demo_name text,
 kind text NOT NULL CHECK(kind IN('request','invitation')),
 status text NOT NULL CHECK(status IN('requested','invited','accepted','rejected','declined','revoked','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 UNIQUE(resource_id,user_id),
 CHECK((user_id IS NOT NULL AND demo_name IS NULL) OR (user_id IS NULL AND length(demo_name) BETWEEN 1 AND 80))
);
CREATE INDEX workspace_community_admissions_page ON public.workspace_community_admissions(resource_id,id);
ALTER TABLE public.workspace_community_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_community_admissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workspace_community_admissions TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_community_admissions TO service_role;
CREATE POLICY community_admission_read ON public.workspace_community_admissions FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.workspace_resources r WHERE r.id=resource_id AND public.has_organization_permission(r.organization_id,'members.read'))
 OR (user_id=auth.uid() AND public.current_demo_cohort() IS NULL AND public.account_session_usable())
);
-- Direct writes are never an admission path, even through old permissive policies.
REVOKE INSERT,UPDATE,DELETE ON public.community_members FROM anon,authenticated;

CREATE FUNCTION workspace_private.guard_community_admission() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cohort uuid;kind text;BEGIN
 SELECT o.demo_cohort_id,r.type INTO cohort,kind FROM public.workspace_resources r JOIN public.organizations o ON o.id=r.organization_id WHERE r.id=NEW.resource_id;
 IF kind IS DISTINCT FROM 'community' OR (cohort IS NULL AND NEW.user_id IS NULL)
 OR (cohort IS NOT NULL AND NEW.user_id IS NOT NULL) THEN RAISE EXCEPTION 'community_admission_scope' USING ERRCODE='42501'; END IF;
 IF NEW.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.guard_community_admission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER admission_demo_boundary BEFORE INSERT OR UPDATE ON public.workspace_community_admissions FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_community_admission();

CREATE FUNCTION workspace_private.sync_community_roster(p_resource uuid) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO public.workspace_community_admissions(resource_id,user_id,kind,status)
 SELECT r.id,m.user_id,'request','accepted' FROM public.workspace_resources r JOIN public.community_members m ON m.community_id=r.source_id
 JOIN public.organizations o ON o.id=r.organization_id WHERE r.id=p_resource AND r.type='community' AND o.demo_cohort_id IS NULL
 ON CONFLICT(resource_id,user_id) DO UPDATE SET status='accepted',updated_at=now() WHERE workspace_community_admissions.status<>'accepted';
$$;
REVOKE ALL ON FUNCTION workspace_private.sync_community_roster(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION workspace_private.community_roster_changed() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF TG_OP='INSERT' THEN PERFORM workspace_private.sync_community_roster(r.id) FROM public.workspace_resources r WHERE r.source_id=NEW.community_id AND r.type='community';RETURN NEW;
 ELSE UPDATE public.workspace_community_admissions a SET status='removed',updated_at=now() FROM public.workspace_resources r WHERE r.id=a.resource_id AND r.source_id=OLD.community_id AND a.user_id=OLD.user_id AND a.status='accepted';RETURN OLD; END IF;
END $$;
REVOKE ALL ON FUNCTION workspace_private.community_roster_changed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_community_roster_changed AFTER INSERT OR DELETE ON public.community_members FOR EACH ROW EXECUTE FUNCTION workspace_private.community_roster_changed();

-- Publish the canonical policy atomically with the canonical community.
ALTER FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) RENAME TO workspace_save_before_admission;
REVOKE ALL ON FUNCTION public.workspace_save_before_admission(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.save_workspace_resource(p_organization_id uuid,p_resource_type text,p_data jsonb,p_resource_id uuid DEFAULT NULL,p_publish boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 result:=public.workspace_save_before_admission(p_organization_id,p_resource_type,p_data,p_resource_id,p_publish);
 IF p_resource_type='community' AND p_publish AND public.current_demo_cohort() IS NULL THEN
 UPDATE public.communities c SET join_policy=coalesce(p_data->>'join_policy','open')
 FROM public.workspace_resources r WHERE r.id=(result->>'id')::uuid AND c.id=r.source_id AND c.organization_id=p_organization_id;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) TO authenticated;

-- Minimal invitation preview may reveal a private header to its named recipient;
-- it never grants access to the wall, roster or university affiliation.
CREATE FUNCTION public.get_community_admission(p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.communities; a public.workspace_community_admissions;member boolean;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session();
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.communities WHERE id=p_id AND NOT is_deleted AND NOT is_hidden;
 IF c.id IS NULL THEN RAISE EXCEPTION 'community_not_found'; END IF;
 IF c.organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=c.organization_id AND status='active' AND demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'community_not_found'; END IF;
 SELECT x.* INTO a FROM public.workspace_community_admissions x JOIN public.workspace_resources r ON r.id=x.resource_id
 WHERE r.source_id=c.id AND r.organization_id=c.organization_id AND x.user_id=auth.uid();
 member:=EXISTS(SELECT 1 FROM public.community_members WHERE community_id=p_id AND user_id=auth.uid());
 IF NOT social_private.content_visible('community',c.id,c.created_by) OR
 (c.is_private AND c.join_policy='invite' AND NOT member AND c.created_by<>auth.uid() AND NOT coalesce(a.status='invited' AND a.expires_at>now(),false)) THEN RAISE EXCEPTION 'community_not_found'; END IF;
 RETURN jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'kind',c.kind,'image_url',c.image_url,
 'is_private',c.is_private,'created_at',c.created_at,'created_by',c.created_by,'is_mine',c.created_by=auth.uid(),
 'is_member',member,'member_count',(SELECT count(*) FROM public.community_members WHERE community_id=p_id),
 'join_policy',c.join_policy,'admission_id',a.id,'admission_status',CASE WHEN a.status='invited' AND a.expires_at<=now() THEN 'expired' ELSE a.status END);
END $$;

CREATE OR REPLACE FUNCTION public.join_community(p_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.communities;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session(); PERFORM public.get_community_admission(p_id);
 SELECT * INTO c FROM public.communities WHERE id=p_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.community_members WHERE community_id=p_id AND user_id=auth.uid()) THEN RETURN; END IF;
 IF c.join_policy='request' THEN RAISE EXCEPTION 'community_request_required'; END IF;
 IF c.join_policy='invite' THEN RAISE EXCEPTION 'community_invitation_required'; END IF;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(p_id,auth.uid(),'miembro') ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION public.request_community_admission(p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.communities;r public.workspace_resources;a public.workspace_community_admissions;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session(); PERFORM public.get_community_admission(p_id);
 SELECT * INTO c FROM public.communities WHERE id=p_id FOR UPDATE;
 IF c.join_policy<>'request' THEN RAISE EXCEPTION 'community_request_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.community_members WHERE community_id=p_id AND user_id=auth.uid()) THEN RETURN public.get_community_admission(p_id); END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE source_id=p_id AND organization_id=c.organization_id AND type='community' AND status<>'archived';
 IF r.id IS NULL THEN RAISE EXCEPTION 'community_request_unavailable'; END IF;
 SELECT * INTO a FROM public.workspace_community_admissions WHERE resource_id=r.id AND user_id=auth.uid() FOR UPDATE;
 IF a.status='requested' OR (a.status='invited' AND a.expires_at>now()) THEN RETURN public.get_community_admission(p_id); END IF;
 IF a.status='rejected' AND a.updated_at>now()-interval '7 days' THEN RAISE EXCEPTION 'community_request_cooldown'; END IF;
 INSERT INTO public.workspace_community_admissions(resource_id,user_id,kind,status) VALUES(r.id,auth.uid(),'request','requested')
 ON CONFLICT(resource_id,user_id) DO UPDATE SET kind='request',status='requested',updated_at=now(),decided_by=NULL,expires_at=NULL;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(r.organization_id,auth.uid(),'community.requested',r.id);
 RETURN public.get_community_admission(p_id);
END $$;

CREATE FUNCTION public.respond_community_invitation(p_id uuid,p_accept boolean) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.workspace_community_admissions;r public.workspace_resources;c public.communities;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session();
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO a FROM public.workspace_community_admissions x WHERE x.id=p_id AND x.user_id=auth.uid();
 SELECT * INTO r FROM public.workspace_resources WHERE id=a.resource_id AND status<>'archived';
 SELECT * INTO c FROM public.communities WHERE id=r.source_id AND organization_id=r.organization_id AND NOT is_deleted AND NOT is_hidden FOR UPDATE;
 SELECT * INTO a FROM public.workspace_community_admissions WHERE id=a.id FOR UPDATE;
 IF a.id IS NULL OR c.id IS NULL OR a.kind<>'invitation' OR a.expires_at<=now() OR a.status NOT IN('invited','accepted')
 OR NOT social_private.content_visible('community',c.id,c.created_by) THEN RAISE EXCEPTION 'community_invitation_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=r.organization_id AND status='active' AND demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'community_invitation_unavailable'; END IF;
 IF a.status='accepted' THEN RETURN public.get_community_admission(c.id); END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'invalid_decision'; END IF;
 UPDATE public.workspace_community_admissions SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,updated_at=now(),decided_by=auth.uid() WHERE id=a.id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(r.organization_id,auth.uid(),CASE WHEN p_accept THEN 'community.invitation_accepted' ELSE 'community.invitation_declined' END,r.id,jsonb_build_object('admission_id',a.id));
 IF p_accept THEN INSERT INTO public.community_members(community_id,user_id,role) VALUES(c.id,auth.uid(),'miembro') ON CONFLICT DO NOTHING; RETURN public.get_community_admission(c.id); END IF;
 RETURN jsonb_build_object('admission_status','declined','is_member',false);
END $$;

CREATE FUNCTION public.list_my_community_invitations() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session();
 IF public.current_demo_cohort() IS NOT NULL THEN RETURN '[]'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x) FROM(SELECT a.id,c.id community_id,c.name,a.expires_at FROM public.workspace_community_admissions a
 JOIN public.workspace_resources r ON r.id=a.resource_id JOIN public.communities c ON c.id=r.source_id AND c.organization_id=r.organization_id
 WHERE a.user_id=auth.uid() AND a.status='invited' AND a.expires_at>now() AND NOT c.is_deleted AND NOT c.is_hidden AND r.status<>'archived'
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=r.organization_id AND status='active' AND demo_cohort_id IS NULL)
 AND social_private.content_visible('community',c.id,c.created_by) ORDER BY a.created_at DESC LIMIT 50)x),'[]');
END $$;

CREATE FUNCTION public.get_workspace_community_admissions(p_organization_id uuid,p_resource_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources;items jsonb;lim int:=greatest(1,least(coalesce(p_limit,30),50));BEGIN
 PERFORM public.workspace_require(p_organization_id,'members.read');
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='community';
 IF r.id IS NULL THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 PERFORM workspace_private.sync_community_roster(r.id);
 SELECT coalesce(jsonb_agg(x),'[]') INTO items FROM(SELECT a.id,a.user_id,coalesce(a.demo_name,p.full_name,'Miembro') name,a.kind,
 CASE WHEN a.status='invited' AND a.expires_at<=now() THEN 'expired' ELSE a.status END status,a.created_at,a.expires_at
 FROM public.workspace_community_admissions a LEFT JOIN public.profiles p ON p.id=a.user_id
 WHERE a.resource_id=r.id AND (p_cursor IS NULL OR a.id>p_cursor) ORDER BY a.id LIMIT lim)x;
 RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=lim THEN items->(lim-1)->>'id' ELSE NULL END,
 'member_count',CASE WHEN public.current_demo_cohort() IS NOT NULL THEN (SELECT count(*) FROM public.workspace_community_admissions WHERE resource_id=r.id AND status='accepted') ELSE (SELECT count(*) FROM public.community_members WHERE community_id=r.source_id) END);
END $$;

CREATE FUNCTION public.workspace_community_admission_action(p_organization_id uuid,p_resource_id uuid,p_action text,p_admission_id uuid DEFAULT NULL,p_email text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources;a public.workspace_community_admissions;target uuid;cohort uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'members.manage');
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='community' AND status<>'archived';
 IF r.id IS NULL THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 SELECT demo_cohort_id INTO cohort FROM public.organizations WHERE id=p_organization_id;
 IF cohort IS NULL THEN
 PERFORM 1 FROM public.communities WHERE id=r.source_id AND organization_id=p_organization_id AND NOT is_deleted AND NOT is_hidden FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'community_not_published'; END IF;
 END IF;
 IF p_action='invite' THEN
 IF cohort IS NOT NULL THEN RAISE EXCEPTION 'demo_external_invitation_disabled'; END IF;
 IF p_email IS NULL OR length(p_email)>254 THEN RAISE EXCEPTION 'invalid_email'; END IF;
 SELECT u.id INTO target FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)=lower(btrim(p_email)) AND u.email_confirmed_at IS NOT NULL AND p.is_discarded IS NOT TRUE
 AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=u.id);
 IF target IS NULL THEN RAISE EXCEPTION 'community_invitee_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.community_members WHERE community_id=r.source_id AND user_id=target) THEN RETURN jsonb_build_object('status','already_member'); END IF;
 INSERT INTO public.workspace_community_admissions(resource_id,user_id,kind,status,expires_at,decided_by) VALUES(r.id,target,'invitation','invited',now()+interval '7 days',auth.uid())
 ON CONFLICT(resource_id,user_id) DO UPDATE SET kind='invitation',status='invited',expires_at=excluded.expires_at,updated_at=now(),decided_by=auth.uid() RETURNING * INTO a;
 ELSE
 SELECT * INTO a FROM public.workspace_community_admissions WHERE id=p_admission_id AND resource_id=r.id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'admission_not_found'; END IF;
 IF p_action IN('approve','reject') AND a.status='requested' THEN
 IF cohort IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=a.user_id AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'community_invitee_unavailable'; END IF;
 UPDATE public.workspace_community_admissions SET status=CASE WHEN p_action='approve' THEN 'accepted' ELSE 'rejected' END,updated_at=now(),decided_by=auth.uid() WHERE id=a.id RETURNING * INTO a;
 IF p_action='approve' AND cohort IS NULL THEN INSERT INTO public.community_members(community_id,user_id,role) VALUES(r.source_id,a.user_id,'miembro') ON CONFLICT DO NOTHING; END IF;
 ELSIF p_action='revoke' AND a.status='invited' THEN
 UPDATE public.workspace_community_admissions SET status='revoked',updated_at=now(),decided_by=auth.uid() WHERE id=a.id RETURNING * INTO a;
 ELSIF p_action='remove' AND a.status='accepted' THEN
 IF cohort IS NULL AND EXISTS(SELECT 1 FROM public.community_members WHERE community_id=r.source_id AND user_id=a.user_id AND role='admin') THEN RAISE EXCEPTION 'community_admin_protected'; END IF;
 IF cohort IS NULL THEN DELETE FROM public.community_members WHERE community_id=r.source_id AND user_id=a.user_id; END IF;
 UPDATE public.workspace_community_admissions SET status='removed',updated_at=now(),decided_by=auth.uid() WHERE id=a.id RETURNING * INTO a;
 ELSE RAISE EXCEPTION 'admission_transition_invalid'; END IF;
 END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'community.'||p_action,r.id,jsonb_build_object('admission_id',a.id));
 RETURN jsonb_build_object('id',a.id,'status',a.status);
END $$;

REVOKE ALL ON FUNCTION public.get_community_admission(uuid),public.join_community(uuid),public.request_community_admission(uuid),public.respond_community_invitation(uuid,boolean),public.list_my_community_invitations(),public.get_workspace_community_admissions(uuid,uuid,uuid,integer),public.workspace_community_admission_action(uuid,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_community_admission(uuid),public.join_community(uuid),public.request_community_admission(uuid),public.respond_community_invitation(uuid,boolean),public.list_my_community_invitations(),public.get_workspace_community_admissions(uuid,uuid,uuid,integer),public.workspace_community_admission_action(uuid,uuid,text,uuid,text) TO authenticated;

-- The isolated demo manager can review synthetic applicants; it cannot invite
-- real accounts or call public student admission functions.
DO $$ DECLARE definition text;BEGIN
 IF to_regprocedure('public.workspace_require_request()') IS NOT NULL THEN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 definition:=replace(definition,'''/rpc/get_workspace_members''','''/rpc/get_workspace_members'',''/rpc/get_workspace_community_admissions'',''/rpc/workspace_community_admission_action''');
 EXECUTE definition;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_12$;

-- SOURCE 20260922221000_workspace_demo_provisioning.sql
EXECUTE $franky_component_13$
-- No accounts are created by this migration. A service-only provisioner supplies
-- fresh .invalid identities; each scenario receives its own isolated cohort.
CREATE TABLE public.workspace_demo_scenarios (
 user_id uuid PRIMARY KEY REFERENCES public.workspace_demo_accounts(user_id),
 scenario text NOT NULL CHECK(scenario IN('owner','agency','community','leisure','university','creator')),
 organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
 generation integer NOT NULL DEFAULT 0,revoked_at timestamptz,reset_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_demo_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_demo_scenarios FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_demo_scenarios TO service_role;

CREATE FUNCTION workspace_private.reset_demo(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.workspace_demo_scenarios%ROWTYPE;v_cohort uuid;v_kind text;v_house uuid;v_event uuid;v_resource uuid;v_points integer;v_generation integer;v_title text;v_name text;v_count integer;BEGIN
 SELECT * INTO s FROM public.workspace_demo_scenarios WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'demo_not_found'; END IF;
 SELECT d.cohort_id,o.kind INTO v_cohort,v_kind FROM public.workspace_demo_accounts d JOIN public.organizations o ON o.id=s.organization_id AND o.demo_cohort_id=d.cohort_id WHERE d.user_id=p_user;
 IF v_cohort IS NULL OR EXISTS(SELECT 1 FROM public.workspace_resources WHERE organization_id=s.organization_id AND source_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.growth_commissions WHERE user_id=p_user) THEN RAISE EXCEPTION 'demo_contamination_review_required'; END IF;
 DELETE FROM public.workspace_demo_attendees WHERE organization_id=s.organization_id;
 DELETE FROM public.workspace_outbox WHERE organization_id=s.organization_id;
 DELETE FROM public.workspace_resources WHERE organization_id=s.organization_id;
 -- Economic audit is retained. A fresh balancing entry resets the synthetic
 -- spending allowance without mutating any historical point movement.
 INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key) VALUES(p_user,30,'profile_completed','profile:v1:'||p_user) ON CONFLICT(event_key) DO NOTHING;
 SELECT coalesce(sum(points),0)::int INTO v_points FROM public.growth_points_ledger WHERE user_id=p_user;
 IF v_points<>1000 THEN INSERT INTO public.growth_points_ledger(user_id,points,reason,event_key)
 VALUES(p_user,1000-v_points,'Restablecimiento de puntos de demostración','demo.seed.'||p_user||'.'||gen_random_uuid()); END IF;
 DELETE FROM public.growth_redemptions WHERE user_id=p_user;
 UPDATE public.growth_promoters SET active=s.revoked_at IS NULL WHERE user_id=p_user;
 v_generation:=s.generation+1;
 IF s.scenario IN('owner','agency') THEN
  v_count:=CASE WHEN s.scenario='agency' THEN 3 ELSE 1 END;
  FOR i IN 1..v_count LOOP
   v_house:=gen_random_uuid();v_title:=CASE WHEN i=1 THEN 'Piso luminoso junto al campus' WHEN i=2 THEN 'Estudio en el centro' ELSE 'Piso compartido con terraza' END;
   INSERT INTO public.workspace_resources(id,organization_id,type,title,status,created_by,updated_by,data)
   VALUES(v_house,s.organization_id,'housing',v_title,CASE WHEN i=3 THEN 'draft' ELSE 'published' END,p_user,p_user,
    jsonb_build_object('title',v_title,'description','Vivienda ficticia preparada para practicar publicación, interesados y visitas. No se ofrece en el mercado real.','city','Alicante','address','Calle de Demostración, 12','price_monthly',650+i*50,'bedrooms',2,'bathrooms',1,'area_m2',72,'images','[]'::jsonb,
     'demo_interests',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Alex · persona ficticia','status','pending','message','Me gustaría visitar el piso el próximo martes.','created_at',now()),jsonb_build_object('id',gen_random_uuid(),'name','Mar · persona ficticia','status','accepted','message','Busco alquiler durante el próximo curso.','created_at',now()-interval '1 day')),
     'demo_schedule',jsonb_build_array(jsonb_build_object('weekday',2,'start_time','16:00','end_time','18:00','slot_minutes',30,'capacity',1,'price_cents',0))));
  END LOOP;
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'visit','Visita de Alex al piso del campus','pending',p_user,
   jsonb_build_object('starts_at',now()+interval '2 days','ends_at',now()+interval '2 days 30 minutes','visitor_name','Alex · persona ficticia','accommodation_title','Piso luminoso junto al campus','payment_status','not_required','price_cents',0,'description','Solicitud ficticia: confirma, cancela o registra el resultado de esta visita.'));
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'visit','Visita de Mar confirmada','confirmed',p_user,
   jsonb_build_object('starts_at',now()+interval '3 days','ends_at',now()+interval '3 days 30 minutes','visitor_name','Mar · persona ficticia','accommodation_title','Piso luminoso junto al campus','payment_status','not_required','price_cents',0));
 ELSIF s.scenario IN('community','creator') THEN
  v_title:=CASE WHEN s.scenario='creator' THEN 'Estudio de contenido universitario · demo' ELSE 'Comunidad Campus Abierto · demo' END;
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'community',v_title,'published',p_user,
   jsonb_build_object('title',v_title,'description','Comunidad ficticia para practicar la organización de actividades.','city','Alicante','visibility','public','join_policy','request','images','[]'::jsonb)) RETURNING id INTO v_resource;
  INSERT INTO public.workspace_community_admissions(resource_id,demo_name,kind,status)
  VALUES(v_resource,'Alex · persona ficticia','request','requested'),(v_resource,'Mar · persona ficticia','request','accepted');
 ELSIF s.scenario='leisure' THEN
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'venue','Café Campus · local demo','published',p_user,
   jsonb_build_object('title','Café Campus · local demo','description','Local ficticio con actividades culturales y encuentros.','city','Alicante','address','Plaza de Demostración, 4','category','cafeteria','images','[]'::jsonb));
 ELSIF s.scenario='university' THEN
  -- The fictitious institution is a private resource, never a public catalogue row.
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'academic','Universidad del Futuro · información ficticia','draft',p_user,
   jsonb_build_object('title','Universidad del Futuro · información ficticia','description','Ficha institucional de demostración. Campus, titulaciones y consultas son simulados.','city','Alicante','source_url','https://franky.es','academic_year','2026-2027','demo_campus_name','Campus de Demostración'));
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'moderation','Publicación anónima reportada · demo','open',p_user,
   jsonb_build_object('body','Ejemplo ficticio de publicación reportada para practicar la revisión.','reason','Lenguaje ofensivo simulado','target_type','thread','target_id',gen_random_uuid(),'campus_name','Campus de Demostración'));
 END IF;
 IF s.scenario NOT IN('owner','agency') THEN
  v_event:=gen_random_uuid();
  INSERT INTO public.workspace_resources(id,organization_id,type,title,status,created_by,data) VALUES(v_event,s.organization_id,'event','Encuentro de bienvenida · demo','published',p_user,
   jsonb_build_object('title','Encuentro de bienvenida · demo','description','Actividad ficticia: prueba el listado de asistentes y el check-in, sin entradas reales.','city','Alicante','address','Espacio de Demostración','starts_at',now()+interval '7 days','ends_at',now()+interval '7 days 2 hours','capacity',40,'price_cents',500,'images','[]'::jsonb,'audience','public'));
  FOR i IN 1..5 LOOP
   INSERT INTO public.workspace_demo_attendees(organization_id,event_resource_id,name,status,checked_in_at,checked_in_by)
   VALUES(s.organization_id,v_event,(ARRAY['Alex','Mar','Dani','Cris','Noa'])[i]||' · persona ficticia',CASE WHEN i=1 THEN 'used' ELSE 'valid' END,CASE WHEN i=1 THEN now() ELSE NULL END,CASE WHEN i=1 THEN p_user ELSE NULL END);
  END LOOP;
  INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'post','Bienvenida a nuestro espacio · demo','draft',p_user,
   jsonb_build_object('title','Bienvenida a nuestro espacio · demo','body','Estamos preparando nuevas actividades. Esta publicación pertenece a una demostración privada.','city','Alicante'));
 END IF;
 INSERT INTO public.workspace_resources(organization_id,type,title,status,created_by,data) VALUES(s.organization_id,'conversation','Consulta de Alex · conversación ficticia','active',p_user,
  jsonb_build_object('messages',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'body','Hola, me gustaría recibir más información.','author_name','Alex · persona ficticia','created_at',now()-interval '1 hour','is_mine',false,'from_organization',false),jsonb_build_object('id',gen_random_uuid(),'body','Gracias. Desde este espacio podemos ayudarte.','author_name','Tu equipo','created_at',now()-interval '30 minutes','is_mine',true,'from_organization',true))));
 IF s.scenario='creator' THEN
  INSERT INTO public.growth_creator_applications(user_id,mode,channels,proposal,status) VALUES(p_user,'both','Portfolio de demostración, sin cuentas sociales reales','Propuesta ficticia para mostrar el ciclo de contenido y afiliación sin compromisos económicos.','approved')
   ON CONFLICT(user_id) DO UPDATE SET status='approved',channels=excluded.channels,proposal=excluded.proposal,updated_at=now();
  DELETE FROM public.growth_creator_content WHERE user_id=p_user;
  INSERT INTO public.growth_creator_content(user_id,title,url,rights,status) VALUES(p_user,'Guion de bienvenida al campus · demo','https://franky.es','Contenido ficticio, sin cesión real ni materiales de terceros.','approved'),(p_user,'Ideas para la semana universitaria · demo','https://franky.es','Contenido ficticio pendiente de revisión, sin remuneración real.','submitted');
 END IF;
 UPDATE public.workspace_demo_scenarios SET generation=v_generation,reset_at=now() WHERE user_id=p_user;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,details) VALUES(s.organization_id,auth.uid(),'demo.reset',jsonb_build_object('generation',v_generation));
END $$;
REVOKE ALL ON FUNCTION workspace_private.reset_demo(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.provision_workspace_demo(p_user_id uuid,p_scenario text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_cohort uuid:=gen_random_uuid();v_org uuid:=gen_random_uuid();v_kind text;v_name text;v_email text;v_created timestamptz;v_existing public.workspace_demo_scenarios%ROWTYPE;BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_required' USING ERRCODE='42501'; END IF;
 IF p_scenario IS NULL OR p_scenario NOT IN('owner','agency','community','leisure','university','creator') THEN RAISE EXCEPTION 'invalid_demo_scenario'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,733901));
 SELECT * INTO v_existing FROM public.workspace_demo_scenarios WHERE user_id=p_user_id;
 IF FOUND THEN
  IF v_existing.scenario<>p_scenario THEN RAISE EXCEPTION 'demo_scenario_locked'; END IF;
  RETURN jsonb_build_object('organization_id',v_existing.organization_id,'user_id',p_user_id,'already_provisioned',true);
 END IF;
 SELECT email,created_at INTO v_email,v_created FROM auth.users WHERE id=p_user_id;
 IF v_email IS NULL OR lower(v_email) !~ '^[a-z0-9._+-]+@demo\.franky\.invalid$' OR v_created<now()-interval '1 hour'
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND role='user' AND is_discarded IS NOT TRUE)
 OR EXISTS(SELECT 1 FROM public.organization_memberships WHERE user_id=p_user_id)
 OR EXISTS(SELECT 1 FROM public.growth_promoters WHERE user_id=p_user_id)
 OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'fresh_synthetic_identity_required'; END IF;
 v_kind:=CASE WHEN p_scenario IN('owner','agency') THEN 'housing' WHEN p_scenario='leisure' THEN 'leisure' WHEN p_scenario='university' THEN 'university' ELSE 'community' END;
 v_name:=CASE p_scenario WHEN 'owner' THEN 'Propietario Particular · demo' WHEN 'agency' THEN 'Inmobiliaria Campus · demo' WHEN 'community' THEN 'Comunidad Campus Abierto · demo' WHEN 'leisure' THEN 'Café Campus · demo' WHEN 'university' THEN 'Universidad del Futuro · demo' ELSE 'Estudio Creators · demo' END;
 INSERT INTO social_private.community_terms_acceptances(user_id,version) VALUES(p_user_id,'2026-09-10') ON CONFLICT DO NOTHING;
 INSERT INTO public.workspace_demo_accounts(user_id,cohort_id) VALUES(p_user_id,v_cohort);
 UPDATE public.profiles SET full_name=v_name,onboarding_completed=true,email_verified_at=now(),looking_for_roommate=false,looking_for_housing=false,ligar_opted_in=false WHERE id=p_user_id;
 INSERT INTO public.organizations(id,kind,subtype,name,slug,city,verification_status,demo_cohort_id,created_by,billing_owner_id)
 VALUES(v_org,v_kind,p_scenario,v_name,'demo-'||replace(v_org::text,'-',''),'Alicante',CASE WHEN p_scenario='university' THEN 'verified' ELSE 'unverified' END,v_cohort,p_user_id,p_user_id);
 INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(v_org,p_user_id,'owner');
 INSERT INTO public.workspace_demo_scenarios(user_id,scenario,organization_id) VALUES(p_user_id,p_scenario,v_org);
 INSERT INTO public.growth_promoters(user_id,demo_cohort_id) VALUES(p_user_id,v_cohort);
 PERFORM workspace_private.reset_demo(p_user_id);
 RETURN jsonb_build_object('organization_id',v_org,'user_id',p_user_id,'cohort_id',v_cohort,'scenario',p_scenario);
END $$;
REVOKE ALL ON FUNCTION public.provision_workspace_demo(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_demo(uuid,text) TO service_role;

CREATE FUNCTION public.admin_workspace_demos() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'email',u.email,'scenario',s.scenario,'organization_id',s.organization_id,'name',o.name,'generation',s.generation,'revoked_at',s.revoked_at,'reset_at',s.reset_at) ORDER BY s.created_at),'[]') FROM public.workspace_demo_scenarios s JOIN auth.users u ON u.id=s.user_id JOIN public.organizations o ON o.id=s.organization_id);
END $$;
CREATE FUNCTION public.admin_workspace_demo_action(p_user_id uuid,p_action text,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.workspace_demo_scenarios%ROWTYPE;BEGIN
 PERFORM public.workspace_admin_required();
 IF p_action IS NULL OR p_action NOT IN('reset','revoke','restore','rotate_password') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'invalid_demo_action'; END IF;
 SELECT * INTO s FROM public.workspace_demo_scenarios WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'demo_not_found'; END IF;
 IF p_action='reset' THEN PERFORM workspace_private.reset_demo(p_user_id);
 ELSIF p_action IN('revoke','restore') THEN
  UPDATE public.workspace_demo_scenarios SET revoked_at=CASE WHEN p_action='revoke' THEN now() ELSE NULL END WHERE user_id=p_user_id;
  UPDATE public.organizations SET status=CASE WHEN p_action='revoke' THEN 'suspended' ELSE 'active' END WHERE id=s.organization_id;
  UPDATE public.profiles SET is_discarded=p_action='revoke',self_deleted=false WHERE id=p_user_id;
  UPDATE public.growth_promoters SET active=p_action='restore' WHERE user_id=p_user_id;
 END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,details) VALUES(s.organization_id,auth.uid(),'demo.'||p_action,jsonb_build_object('reason',p_reason));
 RETURN jsonb_build_object('user_id',p_user_id,'action',p_action,'organization_id',s.organization_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_workspace_demos() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_workspace_demo_action(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_workspace_demos(),public.admin_workspace_demo_action(uuid,text,text) TO authenticated;

-- Explicit simulation-only data. Real flows continue through the previous
-- routines, with their concurrency, payment and authorization checks intact.
ALTER FUNCTION public.get_workspace_housing_interests(uuid,uuid,uuid,integer) RENAME TO workspace_housing_interests_before_demo;
ALTER FUNCTION public.get_workspace_housing_schedule(uuid,uuid) RENAME TO workspace_housing_schedule_before_demo;
ALTER FUNCTION public.save_workspace_housing_schedule(uuid,uuid,jsonb) RENAME TO workspace_housing_save_before_demo;
ALTER FUNCTION public.get_workspace_dashboard(uuid) RENAME TO workspace_dashboard_before_demo;
REVOKE ALL ON FUNCTION public.workspace_housing_interests_before_demo(uuid,uuid,uuid,integer),public.workspace_housing_schedule_before_demo(uuid,uuid),public.workspace_housing_save_before_demo(uuid,uuid,jsonb),public.workspace_dashboard_before_demo(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_workspace_housing_interests(p_organization_id uuid,p_resource_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_data jsonb;v_items jsonb;v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);v_next text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NULL THEN RETURN public.workspace_housing_interests_before_demo(p_organization_id,p_resource_id,p_cursor,p_limit); END IF;
 SELECT data INTO v_data FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.value->>'id'),'[]') INTO v_items FROM (SELECT value FROM jsonb_array_elements(coalesce(v_data->'demo_interests','[]')) WHERE p_cursor IS NULL OR (value->>'id')::uuid>p_cursor ORDER BY value->>'id' LIMIT v_limit+1) x;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;
CREATE FUNCTION public.get_workspace_housing_schedule(p_organization_id uuid,p_resource_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_data jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NULL THEN RETURN public.workspace_housing_schedule_before_demo(p_organization_id,p_resource_id); END IF;
 SELECT data INTO v_data FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 RETURN jsonb_build_object('timezone','Europe/Madrid','rows',coalesce(v_data->'demo_schedule','[]'));
END $$;
CREATE FUNCTION public.save_workspace_housing_schedule(p_organization_id uuid,p_resource_id uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb;v_rows jsonb:='[]';v_day integer;v_start time;v_end time;v_minutes integer;v_capacity integer;v_price integer;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NULL THEN RETURN public.workspace_housing_save_before_demo(p_organization_id,p_resource_id,p_rows); END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 21 THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  v_day:=(row_data->>'weekday')::int;v_start:=(row_data->>'start_time')::time;v_end:=(row_data->>'end_time')::time;v_minutes:=(row_data->>'slot_minutes')::int;v_capacity:=(row_data->>'capacity')::int;v_price:=(row_data->>'price_cents')::int;
  IF v_day IS NULL OR v_day NOT BETWEEN 0 AND 6 OR v_start IS NULL OR v_end IS NULL OR v_end<=v_start OR v_minutes IS NULL OR v_minutes NOT BETWEEN 10 AND 240 OR v_capacity IS NULL OR v_capacity NOT BETWEEN 1 AND 100 OR v_price IS NULL OR v_price NOT BETWEEN 0 AND 100000 OR extract(epoch FROM(v_end-v_start))<v_minutes*60 THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('weekday',v_day,'start_time',v_start,'end_time',v_end,'slot_minutes',v_minutes,'capacity',v_capacity,'price_cents',v_price));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_rows) WITH ORDINALITY a(value,ord) JOIN jsonb_array_elements(v_rows) WITH ORDINALITY b(value,ord) ON a.ord<b.ord AND a.value->>'weekday'=b.value->>'weekday' AND (a.value->>'start_time')::time<(b.value->>'end_time')::time AND (b.value->>'start_time')::time<(a.value->>'end_time')::time) THEN RAISE EXCEPTION 'overlapping_schedule'; END IF;
 UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_schedule}',v_rows),updated_at=now() WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found'; END IF;
 RETURN public.get_workspace_housing_schedule(p_organization_id,p_resource_id);
END $$;
CREATE FUNCTION public.get_workspace_dashboard(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v jsonb;v_kind text;v_metrics jsonb;BEGIN
 v:=public.workspace_dashboard_before_demo(p_organization_id);
 IF public.current_demo_cohort() IS NULL THEN RETURN v; END IF;
 SELECT kind INTO v_kind FROM public.organizations WHERE id=p_organization_id;
 v_metrics:=coalesce(v->'metrics','[]');
 IF public.has_organization_permission(p_organization_id,'analytics.read') THEN
  v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','demo_consultations','label',CASE v_kind WHEN 'housing' THEN 'Consultas simuladas a pisos' WHEN 'university' THEN 'Consultas institucionales simuladas' ELSE 'Consultas simuladas al espacio' END,'value',128,'source','simulation','period_label','Ejemplo ficticio: últimos 30 días'));
 END IF;
 IF public.has_organization_permission(p_organization_id,'finance.read') THEN
  v_metrics:=v_metrics||jsonb_build_array(jsonb_build_object('key','demo_gross','label','Ventas simuladas','value',2500,'unit','cents','source','simulation'),jsonb_build_object('key','demo_refunds','label','Devoluciones simuladas','value',500,'unit','cents','source','simulation'),jsonb_build_object('key','demo_fees','label','Comisiones simuladas','value',200,'unit','cents','source','simulation'),jsonb_build_object('key','demo_net','label','Neto simulado','value',1800,'unit','cents','source','simulation'));
 END IF;
 RETURN jsonb_set(v,'{metrics}',v_metrics);
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_workspace_housing_interests','get_workspace_housing_schedule','save_workspace_housing_schedule','get_workspace_dashboard') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
END LOOP;END $$;
NOTIFY pgrst,'reload schema';
$franky_component_13$;

-- SOURCE 20260922230000_workspace_canonical_sync.sql
EXECUTE $franky_component_14$
-- Keep a published snapshot separate from an editor's recoverable draft.
ALTER TABLE public.workspace_resources ADD COLUMN published_data jsonb;
ALTER TABLE public.workspace_resources ADD COLUMN source_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.workspace_resources ADD COLUMN draft_source_revision bigint;
ALTER TABLE public.workspace_resources ADD COLUMN has_unpublished_changes boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.workspace_canonical_payload(p_type text,p_source_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n jsonb;v jsonb;v_status text;v_images jsonb;v_private jsonb;v_legacy jsonb;v_prefix text:='https://franky.es/api/workspaces/media/';BEGIN
 IF p_type='housing' THEN SELECT to_jsonb(a) INTO n FROM public.accommodations a WHERE id=p_source_id;
  v:=jsonb_build_object('title',n->'title','description',n->'description','city',n->'city','address',n->'address','price_monthly',n->'price','bedrooms',n->'rooms','bathrooms',n->'bathrooms','area_m2',n->'sqm','available_from',n->'available_from');
  v_images:=coalesce(n->'images','[]');v_status:=CASE WHEN n->>'status'='active' AND n->>'deleted_at' IS NULL THEN 'published' ELSE 'archived' END;
 ELSIF p_type='venue' THEN SELECT to_jsonb(s) INTO n FROM public.leisure_spots s WHERE id=p_source_id;
  v:=jsonb_build_object('title',n->'name','description',n->'description','city',n->'city','address',n->'address','category',n->'category');
  v_images:=CASE WHEN jsonb_array_length(coalesce(n->'images','[]'))>0 THEN n->'images' WHEN n->>'image_url' IS NOT NULL THEN jsonb_build_array(n->>'image_url') ELSE '[]'::jsonb END;v_status:='published';
 ELSIF p_type='event' THEN SELECT to_jsonb(e) INTO n FROM public.events e WHERE id=p_source_id;
  v:=jsonb_build_object('title',n->'title','description',n->'description','city',n->'city','address',n->'address','starts_at',n->'start_date','ends_at',n->'end_date','price_cents',round(coalesce((n->>'price')::numeric,0)*100)::int,'capacity',n->'max_capacity','category',n->'category');
  v_images:=CASE WHEN jsonb_array_length(coalesce(n->'photos','[]'))>0 THEN n->'photos' WHEN n->>'image_url' IS NOT NULL THEN jsonb_build_array(n->>'image_url') ELSE '[]'::jsonb END;
  v_status:=CASE WHEN n->>'status'='cancelled' THEN 'archived' ELSE 'published' END;
 ELSIF p_type='community' THEN SELECT to_jsonb(c) INTO n FROM public.communities c WHERE id=p_source_id;
  v:=jsonb_build_object('title',n->'name','description',n->'description','visibility',CASE WHEN (n->>'is_private')::boolean THEN 'private' ELSE 'public' END,'join_policy',coalesce(n->>'join_policy',CASE WHEN (n->>'is_private')::boolean THEN 'invite' ELSE 'open' END));
  v_images:=CASE WHEN n->>'image_url' IS NOT NULL THEN jsonb_build_array(n->>'image_url') ELSE '[]'::jsonb END;
  v_status:=CASE WHEN (n->>'is_deleted')::boolean THEN 'archived' WHEN (n->>'is_hidden')::boolean THEN 'pending_review' ELSE 'published' END;
 ELSIF p_type='post' THEN SELECT to_jsonb(f) INTO n FROM public.fomo_threads f WHERE id=p_source_id;
  v:=jsonb_build_object('body',n->'body','campus_id',n->'university_id');v_images:='[]';
  v_status:=CASE WHEN (n->>'is_deleted')::boolean THEN 'archived' WHEN (n->>'is_hidden')::boolean THEN 'pending_review' ELSE 'published' END;
 ELSE RETURN NULL;END IF;
 IF n IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(substring(value FROM length(v_prefix)+1)) FILTER(WHERE left(value,length(v_prefix))=v_prefix),'[]'),
 coalesce(jsonb_agg(value) FILTER(WHERE left(value,length(v_prefix))<>v_prefix),'[]') INTO v_private,v_legacy FROM jsonb_array_elements_text(v_images);
 RETURN jsonb_build_object('data',v||jsonb_build_object('images',v_private,'legacy_images',v_legacy),'status',v_status);
END $$;
REVOKE ALL ON FUNCTION public.workspace_canonical_payload(text,uuid) FROM PUBLIC,anon,authenticated;

-- Baseline existing imports without changing their recoverable edits.
DO $$ DECLARE r record;p jsonb;BEGIN
 FOR r IN SELECT * FROM public.workspace_resources WHERE source_id IS NOT NULL LOOP
 p:=public.workspace_canonical_payload(r.type,r.source_id);
 IF p IS NOT NULL THEN UPDATE public.workspace_resources SET published_data=p->'data',source_revision=1,draft_source_revision=1,
 has_unpublished_changes=EXISTS(SELECT 1 FROM jsonb_each(p->'data') e WHERE r.data ? e.key AND r.data->e.key IS DISTINCT FROM e.value)
 WHERE id=r.id; END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.sync_workspace_canonical_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_type text;v_org uuid;v_r public.workspace_resources%ROWTYPE;v_payload jsonb;n jsonb:=to_jsonb(NEW);BEGIN
 v_type:=CASE TG_TABLE_NAME WHEN 'accommodations' THEN 'housing' WHEN 'leisure_spots' THEN 'venue' WHEN 'events' THEN 'event' WHEN 'communities' THEN 'community' WHEN 'fomo_threads' THEN 'post' END;
 v_org:=coalesce((n->>'organization_id')::uuid,(n->>'publishing_organization_id')::uuid);
 IF v_org IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_r FROM public.workspace_resources WHERE organization_id=v_org AND type=v_type AND source_id=NEW.id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 v_payload:=public.workspace_canonical_payload(v_type,NEW.id);
 IF v_payload IS NULL OR (v_r.published_data IS NOT DISTINCT FROM v_payload->'data' AND v_r.status IS NOT DISTINCT FROM v_payload->>'status') THEN RETURN NEW; END IF;
 UPDATE public.workspace_resources SET published_data=v_payload->'data',source_revision=source_revision+1,status=v_payload->>'status',
 data=CASE WHEN has_unpublished_changes THEN data ELSE data||(v_payload->'data') END,
 title=CASE WHEN has_unpublished_changes OR v_type='post' THEN title ELSE coalesce(v_payload#>>'{data,title}',title) END,
 draft_source_revision=CASE WHEN has_unpublished_changes THEN draft_source_revision ELSE source_revision+1 END,updated_at=now()
 WHERE id=v_r.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_workspace_canonical_change() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['accommodations','leisure_spots','events','communities','fomo_threads'] LOOP
 EXECUTE format('CREATE TRIGGER zz_workspace_canonical_sync AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_workspace_canonical_change()',t);END LOOP;END $$;

CREATE OR REPLACE FUNCTION public.workspace_resource_json(p_resource public.workspace_resources) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p_resource.id,'type',p_resource.type,'title',p_resource.title,'subtitle',p_resource.data->>'city','status',p_resource.status,
 'starts_at',p_resource.data->>'starts_at','image_url',p_resource.data->'images'->>0,'data',p_resource.data,'updated_at',p_resource.updated_at,
 'published_data',p_resource.published_data,'source_revision',p_resource.source_revision,'draft_source_revision',p_resource.draft_source_revision,
 'has_unpublished_changes',p_resource.has_unpublished_changes,'source_changed_since_draft',p_resource.has_unpublished_changes AND p_resource.draft_source_revision IS DISTINCT FROM p_resource.source_revision) $$;

ALTER FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) RENAME TO workspace_save_before_sync;
REVOKE ALL ON FUNCTION public.workspace_save_before_sync(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.save_workspace_resource(p_organization_id uuid,p_resource_type text,p_data jsonb,p_resource_id uuid DEFAULT NULL,p_publish boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.workspace_resources%ROWTYPE;v_new public.workspace_resources%ROWTYPE;v_result jsonb;v_payload jsonb;v_expected bigint;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 -- Same idempotency key must resolve before we choose the source revision.
 IF p_resource_id IS NULL AND nullif(p_data->>'client_request_id','') IS NOT NULL THEN SELECT id INTO p_resource_id FROM public.workspace_resources WHERE organization_id=p_organization_id AND type=p_resource_type AND data->>'client_request_id'=p_data->>'client_request_id';END IF;
 IF p_resource_id IS NOT NULL THEN
 SELECT * INTO v_old FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type=p_resource_type FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found' USING ERRCODE='42501'; END IF;
 IF p_data ? 'expected_source_revision' THEN
  IF coalesce(p_data->>'expected_source_revision','') !~ '^[0-9]{1,18}$' THEN RAISE EXCEPTION 'invalid_source_revision'; END IF;
  v_expected:=(p_data->>'expected_source_revision')::bigint;
  IF v_expected<>v_old.source_revision THEN RAISE EXCEPTION 'workspace_source_changed'; END IF;
 ELSIF v_old.has_unpublished_changes AND v_old.draft_source_revision IS DISTINCT FROM v_old.source_revision THEN RAISE EXCEPTION 'workspace_source_changed';
 END IF;
 -- Protect the submitted draft from intermediate canonical triggers while all
 -- publication/moderation/legacy-photo/admission wrappers run atomically.
 UPDATE public.workspace_resources SET has_unpublished_changes=true WHERE id=v_old.id;
 END IF;
 v_result:=public.workspace_save_before_sync(p_organization_id,p_resource_type,p_data,p_resource_id,p_publish);
 SELECT * INTO v_new FROM public.workspace_resources WHERE id=(v_result->>'id')::uuid FOR UPDATE;
 IF public.current_demo_cohort() IS NOT NULL AND v_old.id IS NOT NULL THEN
  UPDATE public.workspace_resources SET data=data||(SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(v_old.data) WHERE key IN('demo_interests','demo_schedule','demo_tenancies','demo_contracts')) WHERE id=v_new.id RETURNING * INTO v_new;
 END IF;
 IF p_publish AND v_new.source_id IS NOT NULL THEN v_payload:=public.workspace_canonical_payload(p_resource_type,v_new.source_id); END IF;
 UPDATE public.workspace_resources SET has_unpublished_changes=NOT p_publish,
 published_data=CASE WHEN p_publish THEN coalesce(v_payload->'data',data) ELSE published_data END,
 source_revision=CASE WHEN p_publish AND source_revision=0 THEN 1 ELSE source_revision END,
 draft_source_revision=CASE WHEN p_publish AND source_revision=0 THEN 1 ELSE source_revision END,
 status=CASE WHEN p_publish AND v_payload IS NOT NULL THEN v_payload->>'status' ELSE status END
 WHERE id=v_new.id RETURNING * INTO v_new;
 RETURN public.workspace_resource_json(v_new);
END $$;
REVOKE ALL ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
$franky_component_14$;

-- SOURCE 20260922232000_workspace_chat_boundaries.sql
EXECUTE $franky_component_15$
-- A saved chat membership is not an enduring organization permission.
CREATE FUNCTION public.workspace_chat_access(p_conversation uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.account_session_usable() AND auth.uid() IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.event_conversations ec JOIN public.events e ON e.id=ec.event_id
  WHERE ec.conversation_id=p_conversation AND e.organization_id IS NOT NULL
  AND NOT public.has_organization_permission(e.organization_id,'content.manage')
  AND NOT EXISTS(SELECT 1 FROM public.event_participants ep WHERE ep.event_id=e.id AND ep.user_id=auth.uid() AND ep.status IN('registered','attended') AND ep.kicked_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM public.event_tickets t WHERE t.event_id=e.id AND t.holder_id=auth.uid() AND t.status IN('valid','used')))
$$;
CREATE FUNCTION public.workspace_chat_message_access(p_message public.messages) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid;legacy_owner uuid;BEGIN
 IF NOT public.workspace_chat_access(p_message.conversation_id) THEN RETURN false;END IF;
 org:=p_message.publishing_organization_id;
 IF p_message.housing_listing_id IS NOT NULL THEN SELECT organization_id,owner_id INTO org,legacy_owner FROM public.accommodations WHERE id=p_message.housing_listing_id;END IF;
 IF org IS NULL THEN RETURN true;END IF;
 IF legacy_owner IS NULL THEN SELECT billing_owner_id INTO legacy_owner FROM public.organizations WHERE id=org AND kind='housing';END IF;
 RETURN legacy_owner IS DISTINCT FROM auth.uid() OR public.has_organization_permission(org,'content.manage');
END $$;
REVOKE ALL ON FUNCTION public.workspace_chat_access(uuid),public.workspace_chat_message_access(public.messages) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_chat_access(uuid),public.workspace_chat_message_access(public.messages) TO authenticated;
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conv uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.workspace_chat_access(p_conv) AND EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=p_conv AND user_id=auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.get_my_conversation_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(conversation_id),ARRAY[]::uuid[]) FROM public.conversation_participants WHERE user_id=auth.uid() AND public.workspace_chat_access(conversation_id)
$$;
CREATE POLICY workspace_chat_conversation ON public.conversations AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_chat_access(id));
CREATE POLICY workspace_chat_participants ON public.conversation_participants AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_chat_access(conversation_id));
CREATE POLICY workspace_chat_messages ON public.messages AS RESTRICTIVE FOR ALL TO authenticated USING(public.workspace_chat_message_access(messages)) WITH CHECK(public.workspace_chat_message_access(messages));
CREATE POLICY workspace_chat_event_link ON public.event_conversations AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_chat_access(conversation_id));

-- Joining and team roles come only from authorized RPCs. A direct self-insert
-- into an arbitrary conversation used to satisfy the legacy permissive policy.
REVOKE INSERT ON public.conversation_participants FROM anon,authenticated;
CREATE FUNCTION public.workspace_chat_participant_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user IN('anon','authenticated') AND (NEW.conversation_id,NEW.user_id,NEW.role) IS DISTINCT FROM (OLD.conversation_id,OLD.user_id,OLD.role) THEN RAISE EXCEPTION 'chat_membership_server_managed' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_chat_participant_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_chat_participant_identity BEFORE UPDATE ON public.conversation_participants FOR EACH ROW EXECUTE FUNCTION public.workspace_chat_participant_identity();

CREATE FUNCTION public.workspace_event_chat_core(p_event_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events;conv uuid;responsible uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('event-chat:'||p_event_id::text,0));
 SELECT * INTO e FROM public.events WHERE id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found';END IF;
 SELECT conversation_id INTO conv FROM public.event_conversations WHERE event_id=p_event_id;
 IF conv IS NULL THEN
  SELECT CASE WHEN e.organization_id IS NULL THEN e.organizer_id ELSE m.user_id END INTO responsible FROM (VALUES(1)) x(n) LEFT JOIN public.organization_memberships m ON m.organization_id=e.organization_id AND m.role='owner' AND m.status='active' LIMIT 1;
  IF responsible IS NULL THEN RAISE EXCEPTION 'event_without_organizer';END IF;
  INSERT INTO public.conversations(is_group,group_name,created_by) VALUES(true,coalesce(e.title,'Actividad'),responsible) RETURNING id INTO conv;
  INSERT INTO public.event_conversations(event_id,conversation_id) VALUES(p_event_id,conv);
 END IF;
 RETURN conv;
END $$;
REVOKE ALL ON FUNCTION public.workspace_event_chat_core(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.ensure_event_chat(p_event_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events;conv uuid;BEGIN
 SELECT * INTO e FROM public.events WHERE id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found';END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' AND (NOT public.account_session_usable() OR auth.uid() IS NULL OR NOT coalesce(CASE WHEN e.organization_id IS NULL THEN e.organizer_id=auth.uid() ELSE public.has_organization_permission(e.organization_id,'content.manage') END OR public.is_admin() AND auth.jwt()->>'aal'='aal2',false)) THEN RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501';END IF;
 conv:=public.workspace_event_chat_core(p_event_id);
 IF auth.uid() IS NOT NULL THEN INSERT INTO public.conversation_participants(conversation_id,user_id,role) VALUES(conv,auth.uid(),'admin') ON CONFLICT(conversation_id,user_id) DO UPDATE SET role='admin';END IF;
 RETURN conv;
END $$;
CREATE OR REPLACE FUNCTION public.join_event_chat(p_event_id uuid,p_user_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events;conv uuid;manager boolean;BEGIN
 IF p_user_id IS NULL OR auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS DISTINCT FROM p_user_id OR NOT public.account_session_usable()) THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found';END IF;
 manager:=CASE WHEN e.organization_id IS NULL THEN e.organizer_id=p_user_id ELSE EXISTS(SELECT 1 FROM public.organization_memberships m WHERE m.organization_id=e.organization_id AND m.user_id=p_user_id AND m.status='active' AND m.role IN('owner','admin','editor') AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=m.organization_id AND o.status='active')) END;
 IF NOT coalesce(manager,false) AND NOT EXISTS(SELECT 1 FROM public.event_participants WHERE event_id=p_event_id AND user_id=p_user_id AND status IN('registered','attended') AND kicked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM public.event_tickets WHERE event_id=p_event_id AND holder_id=p_user_id AND status IN('valid','used')) THEN RAISE EXCEPTION 'not_event_participant' USING ERRCODE='42501';END IF;
 conv:=public.workspace_event_chat_core(p_event_id);
 INSERT INTO public.conversation_participants(conversation_id,user_id,role) VALUES(conv,p_user_id,CASE WHEN manager THEN 'admin' ELSE 'member' END) ON CONFLICT(conversation_id,user_id) DO UPDATE SET role=excluded.role;
 RETURN conv;
END $$;
REVOKE ALL ON FUNCTION public.ensure_event_chat(uuid),public.join_event_chat(uuid,uuid),public.is_conversation_member(uuid),public.get_my_conversation_ids() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_event_chat(uuid),public.join_event_chat(uuid,uuid),public.is_conversation_member(uuid),public.get_my_conversation_ids() TO authenticated,service_role;

-- DEFINER readers also enforce current rights, even when called directly.
DO $$DECLARE def text;signature text;anchor text;guard text;BEGIN
 IF to_regprocedure('public.get_my_chats()') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.get_my_chats()'::regprocedure) INTO def;
  anchor:='WHERE cp.user_id = v_user_id';IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'chat_reader_changed';END IF;
  def:=replace(def,anchor,anchor||' AND public.workspace_chat_access(cp.conversation_id)');
  def:=replace(def,'JOIN my_convs mc ON mc.conversation_id = m.conversation_id','JOIN my_convs mc ON mc.conversation_id = m.conversation_id AND public.workspace_chat_message_access(m)');EXECUTE def;
 END IF;
 IF to_regprocedure('public.get_unread_chat_count()') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.get_unread_chat_count()'::regprocedure) INTO def;
  anchor:='WHERE m.sender_id <> auth.uid()';IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'chat_unread_changed';END IF;
  EXECUTE replace(def,anchor,'WHERE public.workspace_chat_message_access(m) AND m.sender_id <> auth.uid()');
 END IF;
 FOREACH signature IN ARRAY ARRAY['public.get_conversation_peer(uuid)','public.create_chat_poll(uuid,text,text[],boolean,timestamp with time zone,text)','public.get_chat_poll(uuid)','public.vote_chat_poll(uuid,integer)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN CONTINUE;END IF;
  SELECT pg_get_functiondef(signature::regprocedure) INTO def;
  guard:=CASE WHEN signature LIKE '%get_conversation_peer%' THEN 'p_conversation_id' WHEN signature LIKE '%create_chat_poll%' THEN 'p_conversation' ELSE '(SELECT conversation_id FROM public.chat_polls WHERE id=p_poll)' END;
  def:=regexp_replace(def,'[Bb][Ee][Gg][Ii][Nn]',E'BEGIN\n IF NOT public.workspace_chat_access('||guard||') THEN RAISE EXCEPTION ''workspace_forbidden'' USING ERRCODE=''42501'';END IF;');EXECUTE def;
 END LOOP;
END $$;
$franky_component_15$;

-- SOURCE 20260923000000_workspace_city_content.sql
EXECUTE $franky_component_16$
-- Community/leisure posts have a reviewed public projection. Drafts remain
-- private; publication and campaign money never come from editable UI flags.
ALTER TABLE public.workspace_release ADD COLUMN city_promotions_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.workspace_post_reviews(
 resource_id uuid PRIMARY KEY REFERENCES public.workspace_resources(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 revision uuid NOT NULL DEFAULT gen_random_uuid(),document jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 submitted_by uuid REFERENCES public.profiles(id),submitted_at timestamptz NOT NULL DEFAULT now(),reviewed_by uuid REFERENCES public.profiles(id),reviewed_at timestamptz,review_note text
);
CREATE TABLE public.workspace_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 140),city text NOT NULL CHECK(length(btrim(city)) BETWEEN 2 AND 100),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '90 days'),
 budget_cents bigint NOT NULL CHECK(budget_cents BETWEEN 100 AND 10000000),spent_cents bigint NOT NULL DEFAULT 0 CHECK(spent_cents>=0 AND spent_cents<=budget_cents),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','active','paused','rejected','ended')),
 minimum_age integer NOT NULL DEFAULT 0 CHECK(minimum_age IN(0,18)),revision uuid NOT NULL DEFAULT gen_random_uuid(),
 request_key uuid NOT NULL UNIQUE,created_by uuid REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES public.profiles(id),approved_revision uuid,approved_at timestamptz,review_note text
);
CREATE INDEX workspace_campaign_window ON public.workspace_campaigns(city,starts_at,ends_at) WHERE status='active';
CREATE INDEX workspace_campaign_publication ON public.workspace_campaigns(resource_id,starts_at,ends_at) WHERE status='active';
CREATE INDEX workspace_city_publication ON public.workspace_post_reviews(lower(btrim(document->>'city')),resource_id) WHERE status='approved';
CREATE TABLE public.workspace_campaign_spend(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.workspace_campaigns(id),amount_cents bigint NOT NULL CHECK(amount_cents>0),
 request_key uuid NOT NULL UNIQUE,reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 5 AND 300),recorded_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspace_private.city_content_activity(
 user_id uuid NOT NULL REFERENCES public.profiles(id),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),day date NOT NULL DEFAULT current_date,
 kind text NOT NULL CHECK(kind IN('view','open')),PRIMARY KEY(user_id,resource_id,day,kind)
);
ALTER TABLE workspace_private.city_content_activity ENABLE ROW LEVEL SECURITY;
CREATE INDEX workspace_city_activity_period ON workspace_private.city_content_activity(resource_id,day);
REVOKE ALL ON workspace_private.city_content_activity FROM PUBLIC,anon,authenticated;
CREATE TABLE workspace_private.city_content_reports(user_id uuid NOT NULL REFERENCES public.profiles(id),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,resource_id));
CREATE TABLE workspace_private.city_muted_organizations(user_id uuid NOT NULL REFERENCES public.profiles(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,organization_id));
ALTER TABLE workspace_private.city_content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_private.city_muted_organizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_private.city_content_reports,workspace_private.city_muted_organizations FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['workspace_post_reviews','workspace_campaigns','workspace_campaign_spend'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP;END $$;
GRANT SELECT ON public.workspace_post_reviews,public.workspace_campaigns TO authenticated;
CREATE POLICY workspace_post_review_team ON public.workspace_post_reviews FOR SELECT TO authenticated USING(public.has_organization_permission(organization_id,'content.manage'));
CREATE POLICY workspace_campaign_team ON public.workspace_campaigns FOR SELECT TO authenticated USING(public.has_organization_permission(organization_id,'finance.read'));
CREATE TRIGGER workspace_campaign_spend_immutable BEFORE UPDATE OR DELETE ON public.workspace_campaign_spend FOR EACH ROW EXECUTE FUNCTION growth_private.immutable();

ALTER FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) RENAME TO workspace_save_before_city;
REVOKE ALL ON FUNCTION public.workspace_save_before_city(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.save_workspace_resource(p_organization_id uuid,p_resource_type text,p_data jsonb,p_resource_id uuid DEFAULT NULL,p_publish boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;r public.workspace_resources;org public.organizations;doc jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 SELECT * INTO org FROM public.organizations WHERE id=p_organization_id;
 IF p_resource_type='post' AND org.kind IN('community','leisure') THEN
  IF p_publish THEN PERFORM social_private.require_community_terms(auth.uid());END IF;
  IF length(btrim(coalesce(p_data->>'city',org.city,''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'city_required';END IF;
  IF length(btrim(coalesce(p_data->>'body',''))) NOT BETWEEN 3 AND 4000 THEN RAISE EXCEPTION 'post_body_required';END IF;
  IF coalesce((p_data->>'minimum_age')::int,0) NOT IN(0,18) THEN RAISE EXCEPTION 'invalid_minimum_age';END IF;
  -- The city feed publishes reviewed text. Media continues through the existing
  -- venue/community upload-review flow, never an unreviewed remote image URL.
  IF jsonb_array_length(coalesce(p_data->'images','[]'))>0 THEN RAISE EXCEPTION 'city_post_text_only'; END IF;
 END IF;
 result:=public.workspace_save_before_city(p_organization_id,p_resource_type,p_data,p_resource_id,p_publish);
 IF p_resource_type<>'post' OR org.kind NOT IN('community','leisure') OR org.demo_cohort_id IS NOT NULL OR NOT p_publish THEN RETURN result; END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=(result->>'id')::uuid FOR UPDATE;
 doc:=jsonb_build_object('title',r.title,'body',r.data->>'body','city',coalesce(nullif(btrim(r.data->>'city'),''),org.city),'minimum_age',coalesce((r.data->>'minimum_age')::int,0));
 INSERT INTO public.workspace_post_reviews(resource_id,organization_id,document,submitted_by) VALUES(r.id,org.id,doc,auth.uid())
 ON CONFLICT(resource_id) DO UPDATE SET document=excluded.document,revision=gen_random_uuid(),status='pending',submitted_by=auth.uid(),submitted_at=now(),reviewed_by=NULL,reviewed_at=NULL,review_note=NULL;
 UPDATE public.workspace_resources SET status='pending_review' WHERE id=r.id RETURNING * INTO r;
 UPDATE public.workspace_campaigns SET status='paused',approved_revision=NULL WHERE resource_id=r.id AND status='active';
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(org.id,auth.uid(),'city_post.submitted',r.id);
 RETURN public.workspace_resource_json(r);
END $$;
REVOKE ALL ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) TO authenticated;

CREATE FUNCTION workspace_private.city_post_visible(p_resource uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_session_usable() AND public.current_demo_cohort() IS NULL AND EXISTS(
 SELECT 1 FROM public.workspace_post_reviews q JOIN public.workspace_resources r ON r.id=q.resource_id JOIN public.organizations o ON o.id=q.organization_id
 WHERE q.resource_id=p_resource AND q.status='approved' AND r.status<>'archived' AND o.status='active' AND o.demo_cohort_id IS NULL AND o.kind IN('community','leisure') AND (SELECT enabled FROM public.workspace_release WHERE singleton)
 AND NOT EXISTS(SELECT 1 FROM workspace_private.city_content_reports cr WHERE cr.user_id=auth.uid() AND cr.resource_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM workspace_private.city_muted_organizations m WHERE m.user_id=auth.uid() AND m.organization_id=o.id)
 AND (coalesce((q.document->>'minimum_age')::int,0)=0 OR coalesce(private.crush_live_age(auth.uid()),0)>=18))
$$;
REVOKE ALL ON FUNCTION workspace_private.city_post_visible(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION workspace_private.city_post_sponsored(p_resource uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspace_campaigns c JOIN public.workspace_post_reviews q ON q.resource_id=c.resource_id WHERE c.resource_id=p_resource AND c.status='active' AND c.approved_revision=q.revision AND q.status='approved' AND c.starts_at<=now() AND c.ends_at>now() AND c.spent_cents<c.budget_cents AND (SELECT city_promotions_enabled FROM public.workspace_release WHERE singleton) AND (c.minimum_age=0 OR coalesce(private.crush_live_age(auth.uid()),0)>=c.minimum_age))
$$;
REVOKE ALL ON FUNCTION workspace_private.city_post_sponsored(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_city_workspace_posts(p_city text,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 20,p_organization_id uuid DEFAULT NULL,p_cursor_sponsored boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE items jsonb;lim integer:=least(greatest(coalesce(p_limit,20),1),30);next_cursor jsonb;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_city,''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'city_required'; END IF;
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.sponsored DESC,x.id),'[]') INTO items FROM (
 SELECT q.resource_id id,workspace_private.city_post_sponsored(q.resource_id) sponsored,jsonb_build_object('id',q.resource_id,'title',q.document->>'title','body',q.document->>'body','city',q.document->>'city','minimum_age',q.document->>'minimum_age','organization_id',o.id,'organization_name',o.name,'kind',o.kind,'verified',o.verification_status='verified','published_at',q.reviewed_at,
 'sponsored',workspace_private.city_post_sponsored(q.resource_id)) payload
 FROM public.workspace_post_reviews q JOIN public.organizations o ON o.id=q.organization_id
 WHERE workspace_private.city_post_visible(q.resource_id) AND lower(btrim(q.document->>'city'))=lower(btrim(p_city)) AND (p_cursor IS NULL OR workspace_private.city_post_sponsored(q.resource_id)<p_cursor_sponsored OR workspace_private.city_post_sponsored(q.resource_id)=p_cursor_sponsored AND q.resource_id>p_cursor) AND (p_organization_id IS NULL OR q.organization_id=p_organization_id)
 -- A reviewed age-restricted campaign does not leak its sponsored message to
 -- unknown/minor accounts via the organic branch while it is active.
 AND NOT EXISTS(SELECT 1 FROM public.workspace_campaigns c WHERE c.resource_id=q.resource_id AND c.status='active' AND c.starts_at<=now() AND c.ends_at>now() AND c.minimum_age=18 AND coalesce(private.crush_live_age(auth.uid()),0)<18)
 ORDER BY sponsored DESC,q.resource_id LIMIT lim+1)x;
 IF jsonb_array_length(items)>lim THEN items:=items-lim;next_cursor:=jsonb_build_object('id',items->(lim-1)->>'id','sponsored',items->(lim-1)->'sponsored'); END IF;
 RETURN jsonb_build_object('items',items,'next_cursor',next_cursor);
END $$;
CREATE FUNCTION public.report_city_workspace_post(p_resource_id uuid,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(auth.uid()::text,''),881921));
 IF EXISTS(SELECT 1 FROM workspace_private.city_content_reports WHERE user_id=auth.uid() AND resource_id=p_resource_id) THEN RETURN true;END IF;
 IF NOT workspace_private.city_post_visible(p_resource_id) OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'report_unavailable';END IF;
 IF (SELECT count(*) FROM workspace_private.city_content_reports WHERE user_id=auth.uid() AND created_at>=now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'report_limit';END IF;
 INSERT INTO workspace_private.city_content_reports(user_id,resource_id,reason) VALUES(auth.uid(),p_resource_id,btrim(p_reason));RETURN true;
END $$;
CREATE FUNCTION public.mute_city_workspace_org(p_resource_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT workspace_private.city_post_visible(p_resource_id) THEN RAISE EXCEPTION 'post_unavailable';END IF;
 INSERT INTO workspace_private.city_muted_organizations(user_id,organization_id) SELECT auth.uid(),organization_id FROM public.workspace_post_reviews WHERE resource_id=p_resource_id ON CONFLICT DO NOTHING;RETURN true;
END $$;
CREATE FUNCTION public.record_city_workspace_activity(p_resource_id uuid,p_kind text,p_consent boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF p_consent IS NOT TRUE OR p_kind IS NULL OR p_kind NOT IN('view','open') OR NOT workspace_private.city_post_visible(p_resource_id) THEN RETURN false; END IF;
 INSERT INTO workspace_private.city_content_activity(user_id,resource_id,kind) VALUES(auth.uid(),p_resource_id,p_kind) ON CONFLICT DO NOTHING;
 RETURN true;
END $$;

CREATE FUNCTION public.get_workspace_campaigns(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.read');
 RETURN jsonb_build_object('enabled',(SELECT city_promotions_enabled FROM public.workspace_release WHERE singleton),'demo',public.current_demo_cohort() IS NOT NULL,
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),'[]') FROM public.workspace_campaigns c WHERE organization_id=p_organization_id),
 'posts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'status',coalesce(q.status,r.status),'city',coalesce(q.document->>'city',r.data->>'city'),'minimum_age',coalesce((q.document->>'minimum_age')::int,(r.data->>'minimum_age')::int,0)) ORDER BY r.created_at DESC),'[]') FROM public.workspace_resources r LEFT JOIN public.workspace_post_reviews q ON q.resource_id=r.id WHERE r.organization_id=p_organization_id AND r.type='post' AND r.status<>'archived'),
 'metrics',(SELECT jsonb_build_object('period','Últimos 30 días, acciones consentidas','views',CASE WHEN count(DISTINCT a.user_id) FILTER(WHERE kind='view')>=10 THEN count(*) FILTER(WHERE kind='view') END,'opens',CASE WHEN count(DISTINCT a.user_id) FILTER(WHERE kind='open')>=10 THEN count(*) FILTER(WHERE kind='open') END,'suppressed',count(DISTINCT a.user_id) FILTER(WHERE kind='view')<10 OR count(DISTINCT a.user_id) FILTER(WHERE kind='open')<10) FROM workspace_private.city_content_activity a JOIN public.workspace_resources r ON r.id=a.resource_id WHERE r.organization_id=p_organization_id AND a.day>=current_date-29));
END $$;
CREATE FUNCTION public.request_workspace_campaign(p_organization_id uuid,p_resource_id uuid,p_title text,p_city text,p_starts_at timestamptz,p_ends_at timestamptz,p_budget_cents bigint,p_minimum_age integer,p_request_key uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.workspace_campaigns;result uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.manage');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,883204));
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND kind IN('community','leisure')) THEN RAISE EXCEPTION 'campaign_kind'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'request_key_required'; END IF;
 SELECT * INTO existing FROM public.workspace_campaigns WHERE request_key=p_request_key;
 IF FOUND THEN IF existing.organization_id<>p_organization_id THEN RAISE EXCEPTION 'workspace_forbidden';END IF;
 IF ROW(existing.resource_id,existing.title,existing.city,existing.starts_at,existing.ends_at,existing.budget_cents,existing.minimum_age) IS DISTINCT FROM ROW(p_resource_id,btrim(p_title),btrim(p_city),p_starts_at,p_ends_at,p_budget_cents,p_minimum_age) THEN RAISE EXCEPTION 'request_conflict';END IF;RETURN existing.id;END IF;
 IF (SELECT count(*) FROM public.workspace_campaigns WHERE organization_id=p_organization_id AND status IN('requested','active'))>=20 THEN RAISE EXCEPTION 'campaign_limit';END IF;
 IF p_starts_at IS NULL OR p_starts_at<now()-interval '5 minutes' OR p_ends_at IS NULL OR p_ends_at<=p_starts_at OR p_ends_at>p_starts_at+interval '90 days' OR p_budget_cents IS NULL OR p_budget_cents NOT BETWEEN 100 AND 10000000 OR p_minimum_age IS NULL OR p_minimum_age NOT IN(0,18) THEN RAISE EXCEPTION 'invalid_campaign'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_resources r WHERE r.id=p_resource_id AND r.organization_id=p_organization_id AND r.type='post' AND r.status<>'archived') THEN RAISE EXCEPTION 'post_not_found'; END IF;
 IF public.current_demo_cohort() IS NULL AND NOT EXISTS(SELECT 1 FROM public.workspace_post_reviews WHERE resource_id=p_resource_id AND status='approved' AND coalesce((document->>'minimum_age')::int,0)=p_minimum_age AND lower(btrim(document->>'city'))=lower(btrim(p_city))) THEN RAISE EXCEPTION 'reviewed_city_post_required'; END IF;
 INSERT INTO public.workspace_campaigns(organization_id,resource_id,title,city,starts_at,ends_at,budget_cents,minimum_age,request_key,created_by) VALUES(p_organization_id,p_resource_id,btrim(p_title),btrim(p_city),p_starts_at,p_ends_at,p_budget_cents,p_minimum_age,p_request_key,auth.uid()) RETURNING id INTO result;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'campaign.requested',result);
 RETURN result;
END $$;
CREATE FUNCTION public.pause_workspace_campaign(p_organization_id uuid,p_campaign_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.manage');
 UPDATE public.workspace_campaigns SET status='paused' WHERE id=p_campaign_id AND organization_id=p_organization_id AND status IN('requested','active');
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_unavailable'; END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'campaign.paused',p_campaign_id);RETURN true;
END $$;

CREATE FUNCTION public.admin_city_content() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 RETURN jsonb_build_object('enabled',(SELECT city_promotions_enabled FROM public.workspace_release WHERE singleton),
 'reports',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT r.resource_id,r.reason,r.created_at,q.revision,q.document,o.name organization_name FROM workspace_private.city_content_reports r JOIN public.workspace_post_reviews q ON q.resource_id=r.resource_id JOIN public.organizations o ON o.id=q.organization_id WHERE q.status='approved' ORDER BY r.created_at LIMIT 50)x),
 'posts',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT q.*,o.name organization_name FROM public.workspace_post_reviews q JOIN public.organizations o ON o.id=q.organization_id WHERE q.status='pending' AND o.demo_cohort_id IS NULL ORDER BY submitted_at LIMIT 50)x),
 'campaigns',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT c.*,o.name organization_name FROM public.workspace_campaigns c JOIN public.organizations o ON o.id=c.organization_id WHERE o.demo_cohort_id IS NULL ORDER BY c.created_at DESC LIMIT 100)x));
END $$;
CREATE FUNCTION public.admin_city_content_action(p_action text,p_id uuid DEFAULT NULL,p_revision uuid DEFAULT NULL,p_reason text DEFAULT NULL,p_amount_cents bigint DEFAULT NULL,p_request_key uuid DEFAULT NULL,p_enabled boolean DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.workspace_post_reviews;c public.workspace_campaigns;v_org uuid;BEGIN
 PERFORM public.workspace_admin_required();
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required'; END IF;
 IF p_action='release' THEN IF p_enabled IS NULL THEN RAISE EXCEPTION 'enabled_required';END IF;UPDATE public.workspace_release SET city_promotions_enabled=p_enabled WHERE singleton;INSERT INTO public.growth_audit(actor_id,action,details) VALUES(auth.uid(),'city_campaigns.release',jsonb_build_object('enabled',p_enabled,'reason',p_reason));RETURN true; END IF;
 IF p_action IN('approve_post','reject_post','withdraw_post') THEN
  PERFORM 1 FROM public.workspace_resources WHERE id=p_id FOR UPDATE;
  SELECT * INTO q FROM public.workspace_post_reviews WHERE resource_id=p_id FOR UPDATE;
  IF NOT FOUND OR q.revision IS DISTINCT FROM p_revision OR (p_action<>'withdraw_post' AND q.status<>'pending') THEN RAISE EXCEPTION 'review_changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=q.organization_id AND status='active' AND demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'organization_unavailable'; END IF;
  UPDATE public.workspace_post_reviews SET status=CASE WHEN p_action='approve_post' THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_reason WHERE resource_id=p_id;
  UPDATE public.workspace_resources SET status=CASE WHEN p_action='approve_post' THEN 'published' ELSE 'rejected' END,published_data=CASE WHEN p_action='approve_post' THEN q.document ELSE published_data END WHERE id=p_id;v_org:=q.organization_id;
  IF p_action<>'approve_post' THEN UPDATE public.workspace_campaigns SET status='paused',approved_revision=NULL WHERE resource_id=p_id AND status='active';END IF;
 ELSIF p_action IN('activate','reject_campaign','pause','spend') THEN
  SELECT * INTO c FROM public.workspace_campaigns WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=c.organization_id AND demo_cohort_id IS NULL AND status='active') THEN RAISE EXCEPTION 'campaign_unavailable'; END IF;v_org:=c.organization_id;
  IF p_action='activate' THEN
   SELECT * INTO q FROM public.workspace_post_reviews WHERE resource_id=c.resource_id AND status='approved';
   IF q.resource_id IS NULL OR c.ends_at<=now() OR c.spent_cents>=c.budget_cents OR lower(btrim(c.city)) IS DISTINCT FROM lower(btrim(q.document->>'city')) OR c.minimum_age IS DISTINCT FROM coalesce((q.document->>'minimum_age')::int,0) OR NOT(SELECT city_promotions_enabled FROM public.workspace_release WHERE singleton) THEN RAISE EXCEPTION 'campaign_activation_unavailable'; END IF;
   UPDATE public.workspace_campaigns SET status='active',approved_by=auth.uid(),approved_revision=q.revision,approved_at=now(),review_note=p_reason WHERE id=c.id;
  ELSIF p_action='spend' THEN
   IF p_request_key IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0 OR length(p_reason)>300 OR c.approved_by IS NULL THEN RAISE EXCEPTION 'invalid_spend'; END IF;
   IF EXISTS(SELECT 1 FROM public.workspace_campaign_spend WHERE request_key=p_request_key) THEN
    IF EXISTS(SELECT 1 FROM public.workspace_campaign_spend WHERE request_key=p_request_key AND campaign_id=c.id AND amount_cents=p_amount_cents AND reference=p_reason) THEN RETURN true;END IF;
    RAISE EXCEPTION 'request_conflict';
   END IF;
   IF c.spent_cents+p_amount_cents>c.budget_cents THEN RAISE EXCEPTION 'campaign_budget_exceeded';END IF;
   INSERT INTO public.workspace_campaign_spend(campaign_id,amount_cents,request_key,reference,recorded_by) VALUES(c.id,p_amount_cents,p_request_key,p_reason,auth.uid());
   UPDATE public.workspace_campaigns SET spent_cents=spent_cents+p_amount_cents,status=CASE WHEN spent_cents+p_amount_cents=budget_cents THEN 'ended' ELSE status END WHERE id=c.id;
  ELSE UPDATE public.workspace_campaigns SET status=CASE WHEN p_action='pause' THEN 'paused' ELSE 'rejected' END,review_note=p_reason WHERE id=c.id;END IF;
 ELSE RAISE EXCEPTION 'invalid_action';END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(v_org,auth.uid(),'city_content.'||p_action,p_id,jsonb_build_object('reason',p_reason));RETURN true;
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_city_workspace_posts','record_city_workspace_activity','report_city_workspace_post','mute_city_workspace_org','get_workspace_campaigns','request_workspace_campaign','pause_workspace_campaign','admin_city_content','admin_city_content_action') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
END LOOP;END $$;
DO $$ DECLARE definition text;anchor text:='''/rpc/current_demo_cohort''';BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'demo_request_gate_changed';END IF;
 EXECUTE replace(definition,anchor,'''/rpc/get_workspace_campaigns'',''/rpc/request_workspace_campaign'',''/rpc/pause_workspace_campaign'','||anchor);
END $$;
CREATE FUNCTION workspace_private.erase_city_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN DELETE FROM workspace_private.city_content_activity WHERE user_id=NEW.user_id;DELETE FROM workspace_private.city_content_reports WHERE user_id=NEW.user_id;DELETE FROM workspace_private.city_muted_organizations WHERE user_id=NEW.user_id;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION workspace_private.erase_city_activity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_city_activity_erasure AFTER INSERT ON account_private.erasures FOR EACH ROW EXECUTE FUNCTION workspace_private.erase_city_activity();
DO $$ DECLARE definition text;anchor text:='DELETE FROM public.workspace_resources WHERE organization_id=s.organization_id;';BEGIN
 SELECT pg_get_functiondef('workspace_private.reset_demo(uuid)'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'demo_reset_contract_changed';END IF;
 EXECUTE replace(definition,anchor,'DELETE FROM public.workspace_campaigns WHERE organization_id=s.organization_id; '||anchor);
END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN PERFORM cron.schedule('workspace-city-content-retention','50 3 * * *',$job$DELETE FROM workspace_private.city_content_activity WHERE day<current_date-90;$job$);END IF;END $$;
NOTIFY pgrst,'reload schema';
$franky_component_16$;

-- SOURCE 20260923010000_workspace_institutional_completion.sql
EXECUTE $franky_component_17$
-- Structured academic changes remain proposals until an MFA-authenticated
-- platform reviewer approves their exact values against the original baseline.
ALTER TABLE public.workspace_academic_versions ADD COLUMN career_id uuid REFERENCES public.careers(id) ON DELETE RESTRICT;
ALTER TABLE public.workspace_academic_versions ADD COLUMN target_type text NOT NULL DEFAULT 'university' CHECK(target_type IN('university','career'));

CREATE FUNCTION public.workspace_academic_fields(p_type text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE p_type WHEN 'university' THEN ARRAY['description','website','phone','email','jpa_url','jpa_label']
 WHEN 'career' THEN ARRAY['name','description','campus','duration_years','credits','places_offered','career_url','plan_url','cut_off_score','cut_off_year','cut_off_round'] ELSE ARRAY[]::text[] END
$$;
REVOKE ALL ON FUNCTION public.workspace_academic_fields(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_validate_academic_patch(p_type text,p_changes jsonb,p_year text,p_submit boolean) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE k text;v jsonb;n numeric;BEGIN
 IF p_type NOT IN('university','career') OR p_type IS NULL OR p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR octet_length(p_changes::text)>30000 THEN RAISE EXCEPTION 'academic_patch_invalid'; END IF;
 IF (SELECT count(*) FROM jsonb_each(p_changes)) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'academic_patch_empty'; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_changes) LOOP
 IF NOT k=ANY(public.workspace_academic_fields(p_type)) THEN RAISE EXCEPTION 'academic_field_invalid'; END IF;
 IF v='null'::jsonb THEN IF k IN('name','cut_off_year') THEN RAISE EXCEPTION 'academic_value_required'; ELSE CONTINUE; END IF; END IF;
 IF k IN('duration_years','credits','places_offered','cut_off_score','cut_off_year') THEN
 IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'academic_number_required'; END IF;n:=v::text::numeric;
 IF k='duration_years' AND (n NOT BETWEEN 1 AND 12 OR n<>round(n,1)) OR k='credits' AND (n NOT BETWEEN 1 AND 720 OR n<>trunc(n))
 OR k='places_offered' AND (n NOT BETWEEN 0 AND 100000 OR n<>trunc(n)) OR k='cut_off_score' AND (n NOT BETWEEN 0 AND 14 OR n<>round(n,3))
 OR k='cut_off_year' AND (n NOT BETWEEN 2000 AND 2100 OR n<>trunc(n)) THEN RAISE EXCEPTION 'academic_number_invalid'; END IF;
 ELSE
 IF jsonb_typeof(v)<>'string' OR length(v#>>'{}')>10000 THEN RAISE EXCEPTION 'academic_text_invalid'; END IF;
 IF k='name' AND length(btrim(v#>>'{}')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'academic_name_required'; END IF;
 IF k IN('website','jpa_url','career_url','plan_url') AND (v#>>'{}')!~'^https://[A-Za-z0-9][^[:space:]@]*$' THEN RAISE EXCEPTION 'invalid_source_url'; END IF;
 IF k='email' AND (v#>>'{}')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'academic_email_invalid'; END IF;
 END IF;
 END LOOP;
 IF p_submit AND (coalesce(p_year,'')!~'^20[0-9]{2}-20[0-9]{2}$' OR substring(p_year,6,4)::int<>substring(p_year,1,4)::int+1) THEN RAISE EXCEPTION 'academic_year_invalid'; END IF;
 IF p_changes ? 'cut_off_score' OR p_changes ? 'cut_off_year' OR p_changes ? 'cut_off_round' THEN
 IF NOT(p_changes ? 'cut_off_score' AND p_changes ? 'cut_off_year') OR p_changes->>'cut_off_year' IS NULL
 OR p_submit AND (p_changes->>'cut_off_year')::int<>substring(p_year,1,4)::int THEN RAISE EXCEPTION 'academic_cutoff_year_required'; END IF;
 END IF;
 RETURN p_changes;
END $$;
REVOKE ALL ON FUNCTION public.workspace_validate_academic_patch(text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_workspace_academic_targets(p_organization_id uuid,p_target_type text,p_query text DEFAULT '',p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_items jsonb;v_next text;v_limit int:=least(greatest(coalesce(p_limit,30),1),50);v_demo uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF p_target_type NOT IN('university','career') OR p_target_type IS NULL OR length(coalesce(p_query,''))>160 THEN RAISE EXCEPTION 'academic_target_invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND kind='university') THEN RAISE EXCEPTION 'university_required'; END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
 v_demo:=md5(p_organization_id::text||p_target_type)::uuid;
 RETURN jsonb_build_object('items',CASE WHEN p_cursor IS NULL THEN jsonb_build_array(jsonb_build_object('id',v_demo,'title',CASE WHEN p_target_type='career' THEN 'Grado de demostración' ELSE 'Universidad de demostración' END,'university_id',md5(p_organization_id::text||'university')::uuid,'current_updated_at',NULL,'data',CASE WHEN p_target_type='career' THEN '{"name":"Grado de demostración","cut_off_score":10.5,"cut_off_year":2026,"credits":240,"duration_years":4}'::jsonb ELSE '{"description":"Información ficticia para practicar","website":"https://franky.es"}'::jsonb END)) ELSE '[]'::jsonb END,'next_cursor',NULL);
 END IF;
 IF p_target_type='university' THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'title',u.name,'university_id',u.id,'current_updated_at',u.updated_at,'data',(SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(u)) WHERE key=ANY(public.workspace_academic_fields('university')))) ORDER BY u.id),'[]') INTO v_items
 FROM (SELECT u.* FROM public.universities u JOIN public.organization_campuses c ON c.university_id=u.id AND c.organization_id=p_organization_id WHERE (p_cursor IS NULL OR u.id>p_cursor) AND u.name ILIKE '%'||coalesce(p_query,'')||'%' ORDER BY u.id LIMIT v_limit+1) u;
 ELSE
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.name,'university_id',a.university_id,'current_updated_at',a.updated_at,'data',(SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(a)) WHERE key=ANY(public.workspace_academic_fields('career')))) ORDER BY a.id),'[]') INTO v_items
 FROM (SELECT a.* FROM public.careers a JOIN public.organization_campuses c ON c.university_id=a.university_id AND c.organization_id=p_organization_id WHERE (p_cursor IS NULL OR a.id>p_cursor) AND a.name ILIKE '%'||coalesce(p_query,'')||'%' ORDER BY a.id LIMIT v_limit+1) a;
 END IF;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->(v_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;

CREATE FUNCTION public.save_workspace_academic_proposal(p_organization_id uuid,p_target_type text,p_target_id uuid,p_changes jsonb,p_source_url text,p_academic_year text,p_reason text,p_resource_id uuid DEFAULT NULL,p_submit boolean DEFAULT false,p_client_request_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.organizations%ROWTYPE;r public.workspace_resources%ROWTYPE;u jsonb;campus uuid;v_patch jsonb;v_before jsonb;v_name text;v_data jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 SELECT * INTO o FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 IF o.kind<>'university' OR o.verification_status<>'verified' THEN RAISE EXCEPTION 'verified_campus_required'; END IF;
 v_patch:=public.workspace_validate_academic_patch(p_target_type,p_changes,p_academic_year,p_submit);
 IF length(coalesce(p_reason,''))>10000 OR p_submit AND length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'reason_required'; END IF;
 IF p_submit AND coalesce(p_source_url,'')!~'^https://[A-Za-z0-9][^[:space:]@]*$' OR length(coalesce(p_source_url,''))>2000 THEN RAISE EXCEPTION 'invalid_source_url'; END IF;
 IF length(coalesce(p_client_request_id,'')) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'invalid_request_id'; END IF;
 IF p_resource_id IS NULL THEN SELECT id INTO p_resource_id FROM public.workspace_resources WHERE organization_id=o.id AND type='academic' AND data->>'client_request_id'=p_client_request_id; END IF;
 IF p_resource_id IS NOT NULL THEN SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=o.id AND type='academic' FOR UPDATE;
 IF NOT FOUND OR r.status='archived' THEN RAISE EXCEPTION 'resource_not_found'; END IF;END IF;
 IF o.demo_cohort_id IS NOT NULL THEN
 IF p_target_id<>md5(o.id::text||p_target_type)::uuid THEN RAISE EXCEPTION 'campus_forbidden'; END IF;
 u:=public.get_workspace_academic_targets(o.id,p_target_type)->'items'->0;campus:=(u->>'university_id')::uuid;v_name:=u->>'title';u:=u->'data';
 ELSE
 IF p_target_type='university' THEN SELECT to_jsonb(t),t.id,t.name INTO u,campus,v_name FROM public.universities t WHERE id=p_target_id;
 ELSE SELECT to_jsonb(t),t.university_id,t.name INTO u,campus,v_name FROM public.careers t WHERE id=p_target_id;END IF;
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=o.id AND university_id=campus) THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT coalesce(jsonb_object_agg(key,u->key),'{}') INTO v_before FROM jsonb_each(v_patch);
 v_data:=jsonb_build_object('title',left(v_name,160),'description',p_reason,'academic_target_type',p_target_type,'academic_target_id',p_target_id,'academic_target_title',v_name,'academic_target_data',(SELECT jsonb_object_agg(key,value) FROM jsonb_each(u) WHERE key=ANY(public.workspace_academic_fields(p_target_type))),'campus_id',campus,'proposed_changes',v_patch,'baseline',v_before,'source_url',p_source_url,'academic_year',p_academic_year,'client_request_id',p_client_request_id);
 IF r.id IS NOT NULL AND r.data-'review_resolution'-'reviewed_at' IS NOT DISTINCT FROM v_data AND r.status=(CASE WHEN p_submit THEN 'pending_review' ELSE 'draft' END) THEN RETURN public.workspace_resource_json(r);END IF;
 IF r.id IS NOT NULL AND r.status<>'draft' THEN RAISE EXCEPTION 'proposal_locked'; END IF;
 INSERT INTO public.workspace_resources(id,organization_id,type,title,status,data,created_by,updated_by,has_unpublished_changes)
 VALUES(coalesce(r.id,gen_random_uuid()),o.id,'academic',left(v_name,160),CASE WHEN p_submit THEN 'pending_review' ELSE 'draft' END,v_data,auth.uid(),auth.uid(),true)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,data=excluded.data,updated_by=auth.uid(),updated_at=clock_timestamp(),has_unpublished_changes=true RETURNING * INTO r;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(o.id,auth.uid(),CASE WHEN p_submit THEN 'academic.submitted' ELSE 'academic.saved' END,r.id);
 RETURN public.workspace_resource_json(r);
END $$;

CREATE FUNCTION public.admin_review_workspace_academic_patch(p_resource_id uuid,p_updated_at timestamptz,p_approve boolean,p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;u jsonb;campus uuid;target uuid;kind text;patch jsonb;k text;v jsonb;v_table text;v_cast text;BEGIN
 PERFORM public.workspace_admin_required();
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 OR p_approve IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND type='academic' FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending_review' OR r.updated_at IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'proposal_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=r.organization_id AND o.kind='university' AND o.status='active' AND o.verification_status='verified' AND o.demo_cohort_id IS NULL) THEN RAISE EXCEPTION 'institution_unavailable'; END IF;
 kind:=r.data->>'academic_target_type';target:=(r.data->>'academic_target_id')::uuid;
 patch:=public.workspace_validate_academic_patch(kind,r.data->'proposed_changes',r.data->>'academic_year',true);
 IF kind='university' THEN SELECT to_jsonb(t),t.id INTO u,campus FROM public.universities t WHERE id=target FOR UPDATE;v_table:='universities';
 ELSE SELECT to_jsonb(t),t.university_id INTO u,campus FROM public.careers t WHERE id=target FOR UPDATE;v_table:='careers';END IF;
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=r.organization_id AND university_id=campus) THEN RAISE EXCEPTION 'campus_forbidden'; END IF;
 IF p_approve THEN
  FOR k,v IN SELECT key,value FROM jsonb_each(patch) LOOP
   IF u->k IS DISTINCT FROM r.data->'baseline'->k THEN RAISE EXCEPTION 'academic_catalogue_changed'; END IF;
  END LOOP;
  FOR k,v IN SELECT key,value FROM jsonb_each(patch) LOOP
   v_cast:=CASE WHEN k IN('duration_years','cut_off_score') THEN 'numeric' WHEN k IN('credits','places_offered','cut_off_year') THEN 'integer' ELSE 'text' END;
   EXECUTE format('UPDATE public.%I SET %I=$1::%s,updated_at=now() WHERE id=$2',v_table,k,v_cast) USING v#>>'{}',target;
   INSERT INTO public.workspace_academic_versions(organization_id,resource_id,university_id,career_id,target_type,field,before_value,after_value,source_url,academic_year,reviewed_by,reason)
   VALUES(r.organization_id,r.id,campus,CASE WHEN kind='career' THEN target END,kind,k,u->k,v,r.data->>'source_url',r.data->>'academic_year',auth.uid(),p_reason);
  END LOOP;
  IF kind='university' THEN UPDATE public.universities SET institutional_sources=coalesce(institutional_sources,'{}')||jsonb_build_object('workspace_review',jsonb_build_object('url',r.data->>'source_url','academic_year',r.data->>'academic_year','reviewed_at',now(),'fields',patch)) WHERE id=target;
  ELSE UPDATE public.careers SET academic_sources=coalesce(academic_sources,'{}')||jsonb_build_object('workspace_review',jsonb_build_object('url',r.data->>'source_url','academic_year',r.data->>'academic_year','reviewed_at',now(),'fields',patch)),
   cut_off_source_url=CASE WHEN patch ? 'cut_off_score' THEN r.data->>'source_url' ELSE cut_off_source_url END,cut_off_verified_at=CASE WHEN patch ? 'cut_off_score' THEN now() ELSE cut_off_verified_at END WHERE id=target;
  END IF;
 END IF;
 UPDATE public.workspace_resources SET status=CASE WHEN p_approve THEN 'published' ELSE 'draft' END,data=data||jsonb_build_object('review_resolution',p_reason,'reviewed_at',now()),published_data=CASE WHEN p_approve THEN data ELSE published_data END,has_unpublished_changes=NOT p_approve,updated_at=clock_timestamp() WHERE id=r.id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(r.organization_id,auth.uid(),'academic.reviewed',r.id,jsonb_build_object('approved',p_approve,'reason',p_reason,'target_type',kind));
 RETURN true;
END $$;
ALTER FUNCTION public.admin_review_workspace_academic(uuid,timestamptz,boolean,text,text,text) RENAME TO admin_review_workspace_academic_before_patch;
REVOKE ALL ON FUNCTION public.admin_review_workspace_academic_before_patch(uuid,timestamptz,boolean,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_review_workspace_academic(p_resource_id uuid,p_updated_at timestamptz,p_approve boolean,p_reason text,p_field text DEFAULT NULL,p_value text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 IF EXISTS(SELECT 1 FROM public.workspace_resources WHERE id=p_resource_id AND data ? 'academic_target_type') THEN RAISE EXCEPTION 'structured_academic_review_required'; END IF;
 RETURN public.admin_review_workspace_academic_before_patch(p_resource_id,p_updated_at,p_approve,p_reason,p_field,p_value);
END $$;

CREATE TABLE public.workspace_institutional_reply_requests(organization_id uuid NOT NULL REFERENCES public.organizations(id),client_request_id text NOT NULL,report_id uuid NOT NULL,reply_id uuid NOT NULL,body_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,client_request_id));
ALTER TABLE public.workspace_institutional_reply_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_institutional_reply_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_institutional_reply_requests TO service_role;
ALTER FUNCTION public.workspace_resource_action(uuid,text,uuid,text,jsonb) RENAME TO workspace_action_before_institutional_completion;
REVOKE ALL ON FUNCTION public.workspace_action_before_institutional_completion(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_resource_action(p_organization_id uuid,p_resource_type text,p_resource_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.organizations%ROWTYPE;r public.fomo_reports%ROWTYPE;t public.fomo_threads%ROWTYPE;v_parent uuid;v_reply uuid;v_hidden boolean;v_request public.workspace_institutional_reply_requests%ROWTYPE;v_body text;v_key text;v_result jsonb;v_demo public.workspace_resources%ROWTYPE;BEGIN
 IF p_resource_type<>'moderation' OR p_action<>'reply' THEN RETURN public.workspace_action_before_institutional_completion(p_organization_id,p_resource_type,p_resource_id,p_action,p_data); END IF;
 PERFORM public.workspace_require(p_organization_id,'moderation.manage');PERFORM public.workspace_require(p_organization_id,'content.manage');
 SELECT * INTO o FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 IF o.kind<>'university' OR o.verification_status<>'verified' THEN RAISE EXCEPTION 'verified_campus_required'; END IF;
 v_body:=btrim(coalesce(p_data->>'body',''));v_key:=p_data->>'client_request_id';
 IF length(v_body) NOT BETWEEN 1 AND 4000 OR length(coalesce(v_key,'')) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'invalid_reply'; END IF;
 IF o.demo_cohort_id IS NOT NULL THEN
 SELECT * INTO v_demo FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=o.id AND type='moderation' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
 ELSE
 SELECT * INTO r FROM public.fomo_reports WHERE id=p_resource_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
 IF r.target_type='thread' THEN SELECT * INTO t FROM public.fomo_threads WHERE id=r.target_id FOR SHARE;
 ELSE SELECT thread_id,CASE WHEN NOT is_hidden AND NOT is_deleted THEN id END INTO v_reply,v_parent FROM public.fomo_replies WHERE id=r.target_id;
 SELECT * INTO t FROM public.fomo_threads WHERE id=v_reply FOR SHARE; END IF;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=o.id AND university_id=t.university_id) THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501'; END IF;
 IF t.is_hidden OR t.is_deleted OR NOT social_private.content_visible('fomo_thread',t.id,t.author_id) THEN RAISE EXCEPTION 'thread_unavailable'; END IF;
 END IF;
 SELECT * INTO v_request FROM public.workspace_institutional_reply_requests WHERE organization_id=o.id AND client_request_id=v_key;
 IF FOUND THEN
 IF v_request.report_id<>p_resource_id OR v_request.body_digest<>md5(v_body) THEN RAISE EXCEPTION 'request_reused'; END IF;v_reply:=v_request.reply_id;
 ELSE
 IF o.demo_cohort_id IS NOT NULL THEN
 v_reply:=gen_random_uuid();UPDATE public.workspace_resources SET data=data||jsonb_build_object('last_institutional_reply',jsonb_build_object('id',v_reply,'body',v_body,'organization_name',o.name,'status','simulated')),updated_at=now() WHERE id=v_demo.id;
 ELSE
 INSERT INTO public.fomo_replies(thread_id,author_id,publishing_organization_id,is_anonymous,body,parent_id) VALUES(t.id,auth.uid(),o.id,false,v_body,v_parent) RETURNING id INTO v_reply;
 END IF;
 INSERT INTO public.workspace_institutional_reply_requests(organization_id,client_request_id,report_id,reply_id,body_digest) VALUES(o.id,v_key,p_resource_id,v_reply,md5(v_body));
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(o.id,auth.uid(),'institutional.replied',v_reply);
 END IF;
 IF o.demo_cohort_id IS NOT NULL THEN v_result:=public.workspace_resource_json(v_demo);ELSE v_result:=public.get_workspace_moderation(o.id,NULL,1,p_resource_id)->'items'->0;SELECT is_hidden INTO v_hidden FROM public.fomo_replies WHERE id=v_reply;END IF;
 RETURN jsonb_set(v_result,'{data}',coalesce(v_result->'data','{}')||jsonb_build_object('reply_id',v_reply,'reply_status',CASE WHEN o.demo_cohort_id IS NOT NULL THEN 'simulated' WHEN v_hidden THEN 'pending_review' ELSE 'published' END));
END $$;

DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_workspace_academic_targets','save_workspace_academic_proposal','admin_review_workspace_academic_patch','admin_review_workspace_academic','workspace_resource_action') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END LOOP;END $$;
NOTIFY pgrst,'reload schema';

-- Demo requests may only call the explicitly isolated proposal functions.
DO $$ DECLARE definition text;BEGIN
 IF to_regprocedure('public.workspace_require_request()') IS NOT NULL THEN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF position('''/rpc/current_demo_cohort''' IN definition)=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing'; END IF;
 definition:=replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/get_workspace_academic_targets'',''/rpc/save_workspace_academic_proposal''');
 EXECUTE definition;
 END IF;
END $$;

-- Institutional publication belongs to its current team, while author_id is
-- immutable audit evidence. Keep the existing review and media guards intact.
DO $$ DECLARE definition text;v_old text;v_new text;BEGIN
 IF to_regprocedure('social_private.review_publication_write()') IS NOT NULL THEN
 SELECT pg_get_functiondef('social_private.review_publication_write()'::regprocedure) INTO definition;
 v_old:=$anchor$ PERFORM social_private.require_community_terms(NEW.author_id);
 IF auth.uid() IS NOT NULL AND auth.uid()<>NEW.author_id THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;$anchor$;
 v_new:=$replacement$ IF TG_TABLE_NAME IN('fomo_threads','fomo_replies') AND n->>'publishing_organization_id' IS NOT NULL AND auth.uid() IS NOT NULL THEN
  PERFORM public.workspace_require((n->>'publishing_organization_id')::uuid,'content.manage');
  PERFORM social_private.require_community_terms(auth.uid());
 ELSE
  PERFORM social_private.require_community_terms(NEW.author_id);
  IF auth.uid() IS NOT NULL AND auth.uid()<>NEW.author_id THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;
 END IF;$replacement$;
 IF position(v_old IN definition)>0 THEN EXECUTE replace(definition,v_old,v_new);
 ELSIF position('PERFORM social_private.require_community_terms(CASE WHEN public.workspace_social_editor(TG_TABLE_NAME,n) THEN auth.uid() ELSE NEW.author_id END);' IN definition)=0
 OR position('auth.uid()<>NEW.author_id AND NOT public.workspace_social_editor(TG_TABLE_NAME,n)' IN definition)=0 THEN RAISE EXCEPTION 'publication_guard_anchor_missing';
 END IF;
 END IF;
END $$;
$franky_component_17$;

-- SOURCE 20260923020000_workspace_housing_operations.sql
EXECUTE $franky_component_18$
-- Private housing operations attach to an organization, never to a stale owner
-- filter. Financial/legal documents retain the original legal counterparty.
-- Some installations never applied the older tenancy feature. Provision it
-- additively instead of assuming a catalogue migration also deployed its RPCs.
CREATE TABLE IF NOT EXISTS public.tenancies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,room_label text,status text NOT NULL DEFAULT 'pending_confirmation' CHECK(status IN('pending_confirmation','active','ended','rejected')),is_public boolean NOT NULL DEFAULT false,start_date date,end_date date,confirmed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.tenancies ALTER COLUMN is_public SET DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancy_active_tenant ON public.tenancies(tenant_id) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancy_pending ON public.tenancies(accommodation_id,tenant_id) WHERE status IN('pending_confirmation','active');
ALTER TABLE public.tenancies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tenancies TO authenticated;GRANT ALL ON public.tenancies TO service_role;
DROP POLICY IF EXISTS tenancies_select_tenant ON public.tenancies;
CREATE POLICY tenancies_select_tenant ON public.tenancies FOR SELECT TO authenticated USING(tenant_id=auth.uid());
DROP POLICY IF EXISTS tenancies_select_owner ON public.tenancies;
CREATE POLICY tenancies_select_owner ON public.tenancies FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.accommodations WHERE id=accommodation_id AND owner_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.respond_tenancy(p_tenancy_id uuid,p_accept boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.tenancies%ROWTYPE;BEGIN
 PERFORM public.require_account_session();IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL OR p_accept IS NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
 SELECT * INTO t FROM public.tenancies WHERE id=p_tenancy_id AND tenant_id=auth.uid() FOR UPDATE;IF NOT FOUND OR t.status<>'pending_confirmation' THEN RAISE EXCEPTION 'tenancy_unavailable';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accommodations a WHERE a.id=t.accommodation_id AND (a.organization_id IS NULL OR EXISTS(SELECT 1 FROM public.organizations WHERE id=a.organization_id AND status='active' AND demo_cohort_id IS NULL))) THEN RAISE EXCEPTION 'housing_unavailable';END IF;
 UPDATE public.tenancies SET status=CASE WHEN p_accept THEN 'active' ELSE 'rejected' END,confirmed_at=CASE WHEN p_accept THEN now() END,updated_at=now() WHERE id=t.id;
 IF p_accept THEN UPDATE public.profiles SET looking_for_roommate=false WHERE id=auth.uid();END IF;
 RETURN jsonb_build_object('ok',true,'accepted',p_accept);
END $$;
CREATE OR REPLACE FUNCTION public.set_tenancy_visibility(p_tenancy_id uuid,p_is_public boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.require_account_session();IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL OR p_is_public IS NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 UPDATE public.tenancies SET is_public=p_is_public,updated_at=now() WHERE id=p_tenancy_id AND tenant_id=auth.uid() AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'tenancy_unavailable';END IF;RETURN jsonb_build_object('ok',true,'is_public',p_is_public);
END $$;
CREATE OR REPLACE FUNCTION public.end_tenancy(p_tenancy_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.tenancies%ROWTYPE;BEGIN
 PERFORM public.require_account_session();IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 SELECT * INTO t FROM public.tenancies WHERE id=p_tenancy_id FOR UPDATE;IF NOT FOUND OR NOT(t.tenant_id=auth.uid() OR public.workspace_actor_housing_access(t.accommodation_id,auth.uid(),'content.manage')) THEN RAISE EXCEPTION 'tenancy_unavailable';END IF;
 UPDATE public.tenancies SET status='ended',end_date=coalesce(end_date,current_date),updated_at=now() WHERE id=t.id AND status IN('active','pending_confirmation');RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.get_my_current_tenancy() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('tenancy_id',t.id,'is_public',t.is_public,'room_label',t.room_label,'accommodation',jsonb_build_object('id',a.id,'title',a.title,'city',a.city)) FROM public.tenancies t JOIN public.accommodations a ON a.id=t.accommodation_id WHERE t.tenant_id=auth.uid() AND t.status='active' AND public.account_session_usable() AND public.current_demo_cohort() IS NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.respond_tenancy(uuid,boolean),public.set_tenancy_visibility(uuid,boolean),public.end_tenancy(uuid),public.get_my_current_tenancy() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.respond_tenancy(uuid,boolean),public.set_tenancy_visibility(uuid,boolean),public.end_tenancy(uuid),public.get_my_current_tenancy() TO authenticated;
CREATE FUNCTION public.get_my_rentals() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.require_account_session();IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 RETURN jsonb_build_object('tenancies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'accommodation_id',t.accommodation_id,'title',a.title,'city',a.city,'room_label',t.room_label,'status',t.status,'is_public',t.is_public,'start_date',t.start_date,'end_date',t.end_date) ORDER BY t.created_at DESC),'[]') FROM public.tenancies t JOIN public.accommodations a ON a.id=t.accommodation_id WHERE t.tenant_id=auth.uid() AND t.status IN('pending_confirmation','active')),
 'contracts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'accommodation_title',a.title,'status',c.status,'rent_cents',c.rent_cents,'deposit_cents',c.deposit_cents,'my_role',s.role,'my_status',s.status,'updated_at',c.updated_at) ORDER BY c.updated_at DESC,c.id DESC),'[]') FROM public.contracts c JOIN public.contract_signers s ON s.contract_id=c.id AND s.user_id=auth.uid() JOIN public.accommodations a ON a.id=c.accommodation_id));
 END $$;
REVOKE ALL ON FUNCTION public.get_my_rentals() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.get_my_rentals() TO authenticated;
CREATE TABLE public.workspace_housing_assignments(resource_id uuid PRIMARY KEY REFERENCES public.workspace_resources(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),agent_id uuid REFERENCES auth.users(id),updated_by uuid REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.workspace_housing_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),created_by uuid REFERENCES auth.users(id),client_request_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_request_id));
CREATE TABLE public.workspace_rent_obligations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),contract_id uuid,tenant_id uuid,period text NOT NULL CHECK(period~'^20[0-9]{2}-(0[1-9]|1[0-2])$'),due_date date NOT NULL,amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 10000000),status text NOT NULL DEFAULT 'open' CHECK(status IN('open','cancelled')),created_by uuid REFERENCES auth.users(id),client_request_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_request_id),UNIQUE(contract_id,tenant_id,period));
CREATE TABLE public.workspace_rent_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),obligation_id uuid NOT NULL REFERENCES public.workspace_rent_obligations(id),amount_cents integer NOT NULL CHECK(amount_cents<>0),method text NOT NULL CHECK(method IN('transfer','cash','other','reversal')),reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 5 AND 500),reverses_id uuid UNIQUE REFERENCES public.workspace_rent_receipts(id),created_by uuid REFERENCES auth.users(id),client_request_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_request_id));
CREATE TABLE public.workspace_contract_requests(organization_id uuid NOT NULL REFERENCES public.organizations(id),client_request_id text NOT NULL,contract_id uuid NOT NULL,resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),payload_digest text NOT NULL,PRIMARY KEY(organization_id,client_request_id));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['workspace_housing_assignments','workspace_housing_notes','workspace_rent_obligations','workspace_rent_receipts','workspace_contract_requests'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);END LOOP;END $$;
CREATE INDEX workspace_housing_notes_resource ON public.workspace_housing_notes(resource_id,created_at DESC);
CREATE INDEX workspace_rent_obligations_resource ON public.workspace_rent_obligations(resource_id,period DESC);

CREATE FUNCTION public.workspace_actor_housing_access(p_accommodation uuid,p_actor uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.accommodations a JOIN public.profiles p ON p.id=p_actor AND p.is_discarded IS NOT TRUE
 WHERE a.id=p_accommodation AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_actor)
 AND (a.organization_id IS NULL AND a.owner_id=p_actor OR EXISTS(SELECT 1 FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id WHERE o.id=a.organization_id AND o.status='active' AND o.demo_cohort_id IS NULL AND m.user_id=p_actor AND m.status='active' AND p_permission=ANY(public.workspace_role_permissions(m.role)))))
$$;
REVOKE ALL ON FUNCTION public.workspace_actor_housing_access(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.workspace_housing_contract_read(p_contract uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.account_session_usable() AND public.current_demo_cohort() IS NULL AND EXISTS(SELECT 1 FROM public.contracts c WHERE c.id=p_contract AND (
 public.workspace_actor_housing_access(c.accommodation_id,auth.uid(),'finance.read') OR EXISTS(SELECT 1 FROM public.contract_signers s WHERE s.contract_id=c.id AND s.user_id=auth.uid()) OR public.is_admin()))
$$;
REVOKE ALL ON FUNCTION public.workspace_housing_contract_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_housing_contract_read(uuid) TO authenticated;

-- Mandatory restriction supplements legacy permissive owner policies.
CREATE POLICY workspace_tenancy_scope ON public.tenancies AS RESTRICTIVE FOR SELECT TO authenticated USING(public.current_demo_cohort() IS NULL AND public.account_session_usable() AND (tenant_id=auth.uid() OR public.workspace_actor_housing_access(accommodation_id,auth.uid(),'content.manage') OR public.is_admin()));
CREATE POLICY workspace_contract_scope ON public.contracts AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_housing_contract_read(id));
DROP POLICY IF EXISTS contracts_select_signer ON public.contracts;
CREATE POLICY contracts_select_signer ON public.contracts FOR SELECT TO authenticated USING(public.workspace_housing_contract_read(id));
CREATE POLICY workspace_contract_team_read ON public.contracts FOR SELECT TO authenticated USING(public.workspace_actor_housing_access(accommodation_id,auth.uid(),'finance.read'));
CREATE POLICY workspace_contract_signer_scope ON public.contract_signers AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_housing_contract_read(contract_id));
CREATE POLICY workspace_contract_signature_scope ON public.contract_signatures AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_housing_contract_read(contract_id));
CREATE POLICY workspace_contract_signer_team ON public.contract_signers FOR SELECT TO authenticated USING(public.workspace_housing_contract_read(contract_id));
CREATE POLICY workspace_contract_signature_team ON public.contract_signatures FOR SELECT TO authenticated USING(public.workspace_housing_contract_read(contract_id));
-- Invoker policies require the bounded helper but never accept an actor chosen
-- by a caller: only their JWT identity may be queried publicly.
REVOKE ALL ON FUNCTION public.workspace_actor_housing_access(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_my_housing_access(p_accommodation uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT public.account_session_usable() AND public.workspace_actor_housing_access(p_accommodation,auth.uid(),p_permission) $$;
REVOKE ALL ON FUNCTION public.workspace_my_housing_access(uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.workspace_my_housing_access(uuid,text) TO authenticated;
DROP POLICY workspace_tenancy_scope ON public.tenancies;
CREATE POLICY workspace_tenancy_scope ON public.tenancies AS RESTRICTIVE FOR SELECT TO authenticated USING(public.current_demo_cohort() IS NULL AND public.account_session_usable() AND (tenant_id=auth.uid() OR public.workspace_my_housing_access(accommodation_id,'content.manage') OR public.is_admin()));
DROP POLICY workspace_contract_team_read ON public.contracts;
CREATE POLICY workspace_contract_team_read ON public.contracts FOR SELECT TO authenticated USING(public.workspace_my_housing_access(accommodation_id,'finance.read'));

CREATE FUNCTION public.guard_workspace_housing_private_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb;v_accommodation uuid;v_org uuid;BEGIN
 IF auth.uid() IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_accommodation:=(row_data->>'accommodation_id')::uuid;SELECT organization_id INTO v_org FROM public.accommodations WHERE id=v_accommodation;
 IF v_org IS NOT NULL THEN
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_live_operation_disabled';END IF;
 IF TG_TABLE_NAME='tenancies' AND row_data->>'tenant_id'=auth.uid()::text AND TG_OP='UPDATE' THEN
 IF (to_jsonb(NEW)-ARRAY['status','is_public','end_date','confirmed_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','is_public','end_date','confirmed_at','updated_at']) THEN RAISE EXCEPTION 'tenancy_identity_immutable';END IF;
 ELSE
 PERFORM public.workspace_require(v_org,CASE WHEN TG_TABLE_NAME='contracts' THEN 'finance.manage' ELSE 'content.manage' END);
 END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_workspace_housing_private_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_housing_private_write BEFORE INSERT OR UPDATE OR DELETE ON public.tenancies FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_housing_private_write();
CREATE TRIGGER workspace_housing_private_write BEFORE INSERT OR UPDATE OR DELETE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_housing_private_write();

CREATE FUNCTION public.get_workspace_housing_operations(p_organization_id uuid,p_resource_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;v_content boolean;v_finance boolean;result jsonb;v_demo boolean;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');v_content:=public.has_organization_permission(p_organization_id,'content.manage');v_finance:=public.has_organization_permission(p_organization_id,'finance.read');
 IF NOT v_content AND NOT v_finance THEN RAISE EXCEPTION 'housing_operations_forbidden';END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found';END IF;
 v_demo:=public.current_demo_cohort() IS NOT NULL;
 result:=jsonb_build_object('resource_id',r.id,'title',r.title,'demo',v_demo,'assignment',NULL,'team','[]'::jsonb,'notes','[]'::jsonb,'tenancies','[]'::jsonb,'contracts','[]'::jsonb,'rents','[]'::jsonb,'provider_collected_cents',NULL);
 IF v_content THEN
 result:=result||jsonb_build_object('assignment',(SELECT jsonb_build_object('agent_id',a.agent_id,'name',CASE WHEN m.status='active' THEN p.full_name ELSE 'Asignación pendiente de revisar' END) FROM public.workspace_housing_assignments a LEFT JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.agent_id LEFT JOIN public.profiles p ON p.id=a.agent_id WHERE a.resource_id=r.id),
 'team',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name)),'[]') FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=p_organization_id AND m.status='active' AND p.is_discarded IS NOT TRUE AND 'content.manage'=ANY(public.workspace_role_permissions(m.role))),
 'notes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'created_at',n.created_at,'author_name',p.full_name) ORDER BY n.created_at DESC,n.id DESC),'[]') FROM (SELECT * FROM public.workspace_housing_notes WHERE resource_id=r.id ORDER BY created_at DESC,id DESC LIMIT 50) n LEFT JOIN public.profiles p ON p.id=n.created_by));
 IF v_demo THEN result:=result||jsonb_build_object('tenancies',coalesce(r.data->'demo_tenancies','[]'));
 ELSE result:=result||jsonb_build_object('tenancies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tenant_id',t.tenant_id,'name',p.full_name,'status',t.status,'room_label',t.room_label,'start_date',t.start_date,'end_date',t.end_date) ORDER BY t.created_at DESC),'[]') FROM public.tenancies t LEFT JOIN public.profiles p ON p.id=t.tenant_id WHERE t.accommodation_id=r.source_id AND t.status IN('active','pending_confirmation')));END IF;
 END IF;
 IF v_finance THEN
 IF v_demo THEN result:=result||jsonb_build_object('contracts',coalesce(r.data->'demo_contracts','[]'));
 ELSE result:=result||jsonb_build_object('contracts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'status',c.status,'rent_cents',c.rent_cents,'deposit_cents',c.deposit_cents,'updated_at',c.updated_at) ORDER BY c.updated_at DESC,c.id DESC),'[]') FROM (SELECT * FROM public.contracts WHERE accommodation_id=r.source_id ORDER BY updated_at DESC,id DESC LIMIT 100) c),
 'provider_collected_cents',(SELECT coalesce(sum(p.amount_cents-p.refunded_cents),0) FROM public.payments p WHERE p.ref_id=r.source_id AND p.type='rent' AND p.ref_table='accommodations' AND p.status IN('succeeded','partially_refunded','refunded')));END IF;
 result:=result||jsonb_build_object('rents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'contract_id',o.contract_id,'tenant_id',o.tenant_id,'period',o.period,'due_date',o.due_date,'amount_cents',o.amount_cents,'status',o.status,'external_recorded_cents',(SELECT coalesce(sum(amount_cents),0) FROM public.workspace_rent_receipts WHERE obligation_id=o.id),'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'amount_cents',s.amount_cents,'method',s.method,'reference',s.reference,'created_at',s.created_at,'reversed',EXISTS(SELECT 1 FROM public.workspace_rent_receipts x WHERE x.reverses_id=s.id)) ORDER BY s.created_at DESC),'[]') FROM public.workspace_rent_receipts s WHERE s.obligation_id=o.id)) ORDER BY o.period DESC,o.id DESC),'[]') FROM (SELECT * FROM public.workspace_rent_obligations WHERE resource_id=r.id ORDER BY period DESC,id DESC LIMIT 100) o));
 IF NOT v_content AND NOT v_demo THEN result:=result||jsonb_build_object('tenancies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tenant_id',t.tenant_id,'name',p.full_name,'status',t.status)),'[]') FROM public.tenancies t JOIN public.profiles p ON p.id=t.tenant_id WHERE t.accommodation_id=r.source_id AND t.status='active'));END IF;
 END IF;
 -- A visible cursor makes a bounded recent list explicit. Financial totals
 -- above remain aggregate queries over the complete payment ledger.
 result:=result||jsonb_build_object('next_notes',CASE WHEN v_content AND (SELECT count(*) FROM public.workspace_housing_notes WHERE resource_id=r.id)>50 THEN result->'notes'->-1->>'id' END,
 'next_contracts',CASE WHEN v_finance AND NOT v_demo AND (SELECT count(*) FROM public.contracts WHERE accommodation_id=r.source_id)>100 THEN result->'contracts'->-1->>'id' END,
 'next_rents',CASE WHEN v_finance AND (SELECT count(*) FROM public.workspace_rent_obligations WHERE resource_id=r.id)>100 THEN result->'rents'->-1->>'id' END);
 RETURN result;
END $$;

CREATE FUNCTION public.get_workspace_housing_history(p_organization_id uuid,p_resource_id uuid,p_kind text,p_cursor uuid DEFAULT NULL,p_limit int DEFAULT 50) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;v_items jsonb;v_limit int:=least(greatest(coalesce(p_limit,50),1),100);v_time timestamptz;v_period text;v_next text;BEGIN
 IF p_kind NOT IN('notes','contracts','rents') OR p_kind IS NULL THEN RAISE EXCEPTION 'history_kind_invalid';END IF;
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_kind='notes' THEN 'content.manage' ELSE 'finance.read' END);
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found';END IF;
 IF p_kind='notes' THEN
 IF p_cursor IS NOT NULL THEN SELECT created_at INTO v_time FROM public.workspace_housing_notes WHERE id=p_cursor AND resource_id=r.id;IF NOT FOUND THEN RAISE EXCEPTION 'cursor_invalid';END IF;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'created_at',n.created_at,'author_name',p.full_name) ORDER BY n.created_at DESC,n.id DESC),'[]') INTO v_items FROM (SELECT * FROM public.workspace_housing_notes WHERE resource_id=r.id AND (p_cursor IS NULL OR (created_at,id)<(v_time,p_cursor)) ORDER BY created_at DESC,id DESC LIMIT v_limit+1) n LEFT JOIN public.profiles p ON p.id=n.created_by;
 ELSIF p_kind='contracts' THEN
 IF public.current_demo_cohort() IS NOT NULL THEN RETURN jsonb_build_object('items','[]'::jsonb,'next_cursor',NULL);END IF;
 IF p_cursor IS NOT NULL THEN SELECT updated_at INTO v_time FROM public.contracts WHERE id=p_cursor AND accommodation_id=r.source_id;IF NOT FOUND THEN RAISE EXCEPTION 'cursor_invalid';END IF;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'status',c.status,'rent_cents',c.rent_cents,'deposit_cents',c.deposit_cents,'updated_at',c.updated_at) ORDER BY c.updated_at DESC,c.id DESC),'[]') INTO v_items FROM (SELECT * FROM public.contracts WHERE accommodation_id=r.source_id AND (p_cursor IS NULL OR (updated_at,id)<(v_time,p_cursor)) ORDER BY updated_at DESC,id DESC LIMIT v_limit+1) c;
 ELSE
 IF p_cursor IS NOT NULL THEN SELECT period INTO v_period FROM public.workspace_rent_obligations WHERE id=p_cursor AND resource_id=r.id;IF NOT FOUND THEN RAISE EXCEPTION 'cursor_invalid';END IF;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'contract_id',o.contract_id,'tenant_id',o.tenant_id,'period',o.period,'due_date',o.due_date,'amount_cents',o.amount_cents,'status',o.status,'external_recorded_cents',(SELECT coalesce(sum(amount_cents),0) FROM public.workspace_rent_receipts WHERE obligation_id=o.id),'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'amount_cents',s.amount_cents,'method',s.method,'reference',s.reference,'created_at',s.created_at,'reversed',EXISTS(SELECT 1 FROM public.workspace_rent_receipts x WHERE x.reverses_id=s.id)) ORDER BY s.created_at DESC),'[]') FROM public.workspace_rent_receipts s WHERE s.obligation_id=o.id)) ORDER BY o.period DESC,o.id DESC),'[]') INTO v_items FROM (SELECT * FROM public.workspace_rent_obligations WHERE resource_id=r.id AND (p_cursor IS NULL OR (period,id)<(v_period,p_cursor)) ORDER BY period DESC,id DESC LIMIT v_limit+1) o;
 END IF;
 IF jsonb_array_length(v_items)>v_limit THEN v_items:=v_items-v_limit;v_next:=v_items->-1->>'id';END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',v_next);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_housing_history(uuid,uuid,text,uuid,int) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.get_workspace_housing_history(uuid,uuid,text,uuid,int) TO authenticated;

CREATE FUNCTION public.workspace_housing_action(p_organization_id uuid,p_resource_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;v_id uuid;v_target uuid;v_key text:=p_data->>'client_request_id';v_body text;v_demo boolean;v_tenant uuid;v_org uuid;v_amount integer;v_total bigint;o public.workspace_rent_obligations%ROWTYPE;s public.workspace_rent_receipts%ROWTYPE;BEGIN
 PERFORM public.workspace_require(p_organization_id,CASE WHEN p_action IN('rent_create','rent_cancel','rent_receipt','rent_reverse') THEN 'finance.manage' ELSE 'content.manage' END);
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found';END IF;
 v_demo:=public.current_demo_cohort() IS NOT NULL;
 IF p_action='assign' THEN
 v_target:=(p_data->>'agent_id')::uuid;
 IF v_target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=p_organization_id AND m.user_id=v_target AND m.status='active' AND p.is_discarded IS NOT TRUE AND 'content.manage'=ANY(public.workspace_role_permissions(m.role))) THEN RAISE EXCEPTION 'agent_unavailable';END IF;
 INSERT INTO public.workspace_housing_assignments(resource_id,organization_id,agent_id,updated_by) VALUES(r.id,p_organization_id,v_target,auth.uid()) ON CONFLICT(resource_id) DO UPDATE SET agent_id=excluded.agent_id,updated_by=excluded.updated_by,updated_at=now();
 ELSIF p_action='note' THEN
 v_body:=btrim(p_data->>'body');IF length(coalesce(v_body,'')) NOT BETWEEN 1 AND 4000 OR length(coalesce(v_key,'')) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'invalid_note';END IF;
 SELECT id INTO v_id FROM public.workspace_housing_notes WHERE organization_id=p_organization_id AND client_request_id=v_key AND (resource_id<>r.id OR body<>v_body);IF FOUND THEN RAISE EXCEPTION 'request_reused';END IF;
 INSERT INTO public.workspace_housing_notes(organization_id,resource_id,body,created_by,client_request_id) VALUES(p_organization_id,r.id,v_body,auth.uid(),v_key) ON CONFLICT(organization_id,client_request_id) DO NOTHING;
 ELSIF p_action='tenant_invite' THEN
 IF v_demo THEN RAISE EXCEPTION 'demo_real_invitation_disabled';END IF;
 IF r.source_id IS NULL THEN RAISE EXCEPTION 'publish_housing_first';END IF;
 SELECT p.id INTO v_tenant FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)=lower(btrim(p_data->>'email')) AND u.email_confirmed_at IS NOT NULL AND p.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p.id);
 IF v_tenant IS NULL OR v_tenant=auth.uid() THEN RAISE EXCEPTION 'tenant_unavailable';END IF;
 IF length(coalesce(p_data->>'room_label',''))>100 THEN RAISE EXCEPTION 'invalid_room';END IF;
 IF EXISTS(SELECT 1 FROM public.tenancies WHERE accommodation_id=r.source_id AND tenant_id=v_tenant AND status IN('active','pending_confirmation')) THEN RETURN public.get_workspace_housing_operations(p_organization_id,r.id);END IF;
 IF (SELECT count(*) FROM public.organization_audit WHERE organization_id=p_organization_id AND action='housing.tenant_invite' AND created_at>now()-interval '1 day')>=30 THEN RAISE EXCEPTION 'invitation_limit';END IF;
 INSERT INTO public.tenancies(accommodation_id,tenant_id,invited_by,room_label,start_date,is_public) VALUES(r.source_id,v_tenant,auth.uid(),nullif(p_data->>'room_label',''),(nullif(p_data->>'start_date',''))::date,false) RETURNING id INTO v_id;
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(v_tenant,'tenancy','Invitación para vincular tu alquiler','Revisa y acepta la invitación desde tu perfil. Tu presencia no se hará pública sin tu consentimiento.',jsonb_build_object('kind','tenancy_invite','tenancy_id',v_id,'url','/perfil'));
 ELSIF p_action='tenant_end' THEN
 v_target:=(p_data->>'tenancy_id')::uuid;
 IF v_demo THEN
 UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_tenancies}',coalesce((SELECT jsonb_agg(CASE WHEN x->>'id'=v_target::text THEN x||jsonb_build_object('status','ended','end_date',current_date) ELSE x END) FROM jsonb_array_elements(coalesce(data->'demo_tenancies','[]')) x),'[]')) WHERE id=r.id;
 ELSE UPDATE public.tenancies SET status='ended',end_date=current_date WHERE id=v_target AND accommodation_id=r.source_id AND status IN('active','pending_confirmation');IF NOT FOUND THEN RAISE EXCEPTION 'tenancy_unavailable';END IF;END IF;
 ELSIF p_action='rent_create' THEN
 v_amount:=(p_data->>'amount_cents')::int;v_target:=(p_data->>'contract_id')::uuid;v_tenant:=(p_data->>'tenant_id')::uuid;
 IF length(coalesce(v_key,'')) NOT BETWEEN 8 AND 100 OR v_amount IS NULL OR v_amount NOT BETWEEN 1 AND 10000000 THEN RAISE EXCEPTION 'invalid_rent';END IF;
 IF v_demo THEN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.data->'demo_contracts','[]')) c WHERE c->>'id'=v_target::text AND c->>'status'='fully_signed') THEN RAISE EXCEPTION 'contract_not_signed';END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.contracts c JOIN public.contract_signers signer ON signer.contract_id=c.id WHERE c.id=v_target AND c.accommodation_id=r.source_id AND c.status='fully_signed' AND signer.user_id=v_tenant AND signer.role='tenant' AND signer.status='signed' AND v_amount<=c.rent_cents) THEN RAISE EXCEPTION 'contract_not_signed';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.workspace_rent_obligations existing WHERE existing.organization_id=p_organization_id AND existing.client_request_id=v_key AND (existing.resource_id<>r.id OR existing.contract_id IS DISTINCT FROM v_target OR existing.tenant_id IS DISTINCT FROM v_tenant OR existing.period IS DISTINCT FROM p_data->>'period' OR existing.due_date IS DISTINCT FROM (p_data->>'due_date')::date OR existing.amount_cents<>v_amount)) THEN RAISE EXCEPTION 'request_reused';END IF;
 INSERT INTO public.workspace_rent_obligations(organization_id,resource_id,contract_id,tenant_id,period,due_date,amount_cents,created_by,client_request_id) VALUES(p_organization_id,r.id,v_target,v_tenant,p_data->>'period',(p_data->>'due_date')::date,v_amount,auth.uid(),v_key) ON CONFLICT(organization_id,client_request_id) DO NOTHING;
 ELSIF p_action IN('rent_cancel','rent_receipt','rent_reverse') THEN
 SELECT * INTO o FROM public.workspace_rent_obligations WHERE id=(p_data->>'obligation_id')::uuid AND resource_id=r.id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'rent_not_found';END IF;
 SELECT coalesce(sum(amount_cents),0) INTO v_total FROM public.workspace_rent_receipts WHERE obligation_id=o.id;
 IF p_action='rent_cancel' THEN
 IF v_total<>0 THEN RAISE EXCEPTION 'rent_has_receipts';END IF;UPDATE public.workspace_rent_obligations SET status='cancelled' WHERE id=o.id;
 ELSE
 IF o.status<>'open' THEN RAISE EXCEPTION 'rent_closed';END IF;
 IF length(coalesce(v_key,'')) NOT BETWEEN 8 AND 100 OR length(btrim(coalesce(p_data->>'reference',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'receipt_evidence_required';END IF;
 IF EXISTS(SELECT 1 FROM public.workspace_rent_receipts WHERE organization_id=p_organization_id AND client_request_id=v_key) THEN
 IF EXISTS(SELECT 1 FROM public.workspace_rent_receipts receipt WHERE receipt.organization_id=p_organization_id AND receipt.client_request_id=v_key AND (receipt.obligation_id<>o.id OR receipt.reference<>p_data->>'reference' OR p_action='rent_receipt' AND (receipt.amount_cents IS DISTINCT FROM (p_data->>'amount_cents')::int OR receipt.method IS DISTINCT FROM p_data->>'method') OR p_action='rent_reverse' AND receipt.reverses_id IS DISTINCT FROM (p_data->>'receipt_id')::uuid)) THEN RAISE EXCEPTION 'request_reused';END IF;
 RETURN public.get_workspace_housing_operations(p_organization_id,r.id);END IF;
 IF p_action='rent_reverse' THEN SELECT * INTO s FROM public.workspace_rent_receipts WHERE id=(p_data->>'receipt_id')::uuid AND obligation_id=o.id AND amount_cents>0 FOR UPDATE;IF NOT FOUND OR EXISTS(SELECT 1 FROM public.workspace_rent_receipts WHERE reverses_id=s.id) THEN RAISE EXCEPTION 'receipt_not_reversible';END IF;v_amount:=-s.amount_cents;
 ELSE v_amount:=(p_data->>'amount_cents')::int;IF v_amount IS NULL OR v_amount<=0 OR v_total+v_amount>o.amount_cents OR p_data->>'method' NOT IN('transfer','cash','other') THEN RAISE EXCEPTION 'invalid_receipt';END IF;END IF;
 INSERT INTO public.workspace_rent_receipts(organization_id,obligation_id,amount_cents,method,reference,reverses_id,created_by,client_request_id) VALUES(p_organization_id,o.id,v_amount,CASE WHEN p_action='rent_reverse' THEN 'reversal' ELSE p_data->>'method' END,p_data->>'reference',s.id,auth.uid(),v_key);
 END IF;
 ELSE RAISE EXCEPTION 'unsupported_housing_action';END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'housing.'||p_action,r.id);
 RETURN public.get_workspace_housing_operations(p_organization_id,r.id);
END $$;

CREATE FUNCTION public.get_workspace_contract(p_organization_id uuid,p_contract_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.contracts%ROWTYPE;v_title text;v_resource uuid;v_demo jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.read');
 IF public.current_demo_cohort() IS NOT NULL THEN
 SELECT x||jsonb_build_object('resource_id',r.id,'demo',true,'signers',coalesce(x->'signers','[]')) INTO v_demo FROM public.workspace_resources r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.data->'demo_contracts','[]')) x WHERE r.organization_id=p_organization_id AND r.type='housing' AND x->>'id'=p_contract_id::text;IF v_demo IS NULL THEN RAISE EXCEPTION 'contract_not_found';END IF;RETURN v_demo;
 END IF;
 SELECT c0.* INTO c FROM public.contracts c0 JOIN public.accommodations a ON a.id=c0.accommodation_id WHERE c0.id=p_contract_id AND a.organization_id=p_organization_id;
 SELECT a.title,r.id INTO v_title,v_resource FROM public.accommodations a JOIN public.workspace_resources r ON r.source_id=a.id AND r.organization_id=a.organization_id AND r.type='housing' WHERE a.id=c.accommodation_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'contract_not_found';END IF;
 RETURN to_jsonb(c)-'owner_id'||jsonb_build_object('resource_id',v_resource,'accommodation_title',v_title,'demo',false,'legal_owner_id',c.owner_id,'signers',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'name',p.full_name,'role',s.role,'status',s.status,'signed_at',s.signed_at) ORDER BY s.sign_order),'[]') FROM public.contract_signers s LEFT JOIN public.profiles p ON p.id=s.user_id WHERE s.contract_id=c.id),'eligible_tenants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.tenant_id,'name',p.full_name)),'[]') FROM public.tenancies t JOIN public.profiles p ON p.id=t.tenant_id WHERE t.accommodation_id=c.accommodation_id AND t.status='active'));
END $$;

CREATE FUNCTION public.save_workspace_contract(p_organization_id uuid,p_resource_id uuid,p_title text,p_answers jsonb,p_contract_id uuid DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL,p_client_request_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;c public.contracts%ROWTYPE;v_owner uuid;v_id uuid;v_demo jsonb;v_request public.workspace_contract_requests%ROWTYPE;v_digest text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.manage');
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 200 OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'object' OR octet_length(p_answers::text)>50000 OR EXISTS(SELECT 1 FROM jsonb_each(p_answers) WHERE jsonb_typeof(value) NOT IN('string','number','boolean','null') OR length(key)>100 OR length(value::text)>4002) OR length(coalesce(p_client_request_id,'')) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'invalid_contract';END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found';END IF;
 v_digest:=encode(sha256(convert_to(jsonb_build_object('resource',r.id,'title',p_title,'answers',p_answers,'contract',p_contract_id,'expected_updated_at',p_expected_updated_at)::text,'utf8')),'hex');
 SELECT * INTO v_request FROM public.workspace_contract_requests WHERE organization_id=p_organization_id AND client_request_id=p_client_request_id;
 IF FOUND THEN
 IF v_request.resource_id<>r.id OR v_request.payload_digest<>v_digest THEN RAISE EXCEPTION 'request_reused';END IF;
 RETURN public.get_workspace_contract(p_organization_id,v_request.contract_id);
 END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
 SELECT x INTO v_demo FROM jsonb_array_elements(coalesce(r.data->'demo_contracts','[]')) x WHERE x->>'id'=p_contract_id::text;
 IF p_contract_id IS NOT NULL AND (v_demo IS NULL OR v_demo->>'status'<>'draft' OR (v_demo->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at) THEN RAISE EXCEPTION 'contract_changed';END IF;
 v_id:=coalesce(p_contract_id,gen_random_uuid());v_demo:=jsonb_build_object('id',v_id,'title',p_title,'status','draft','answers',p_answers,'updated_at',clock_timestamp(),'demo',true,'legal_owner_id',auth.uid(),'eligible_tenants',jsonb_build_array(jsonb_build_object('id',md5(r.id::text||'tenant')::uuid,'name','Alex · inquilino de prueba')));
 UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_contracts}',coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(coalesce(data->'demo_contracts','[]')) x WHERE x->>'id'<>v_id::text),'[]')||jsonb_build_array(v_demo)) WHERE id=r.id;
 ELSE
 SELECT owner_id INTO v_owner FROM public.accommodations WHERE id=r.source_id AND organization_id=p_organization_id;IF v_owner IS NULL THEN RAISE EXCEPTION 'publish_housing_first';END IF;
 IF p_contract_id IS NOT NULL THEN SELECT * INTO c FROM public.contracts WHERE id=p_contract_id AND accommodation_id=r.source_id FOR UPDATE;IF NOT FOUND OR c.status<>'draft' OR c.locked_at IS NOT NULL OR c.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'contract_changed';END IF;END IF;
 INSERT INTO public.contracts(id,owner_id,accommodation_id,title,answers) VALUES(coalesce(c.id,gen_random_uuid()),v_owner,r.source_id,p_title,p_answers) ON CONFLICT(id) DO UPDATE SET title=excluded.title,answers=excluded.answers,updated_at=clock_timestamp() RETURNING id INTO v_id;
 END IF;
 INSERT INTO public.workspace_contract_requests VALUES(p_organization_id,p_client_request_id,v_id,r.id,v_digest) ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM public.workspace_contract_requests WHERE organization_id=p_organization_id AND client_request_id=p_client_request_id AND (resource_id<>r.id OR payload_digest<>v_digest OR contract_id<>v_id)) THEN RAISE EXCEPTION 'request_reused';END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'contract.saved',v_id);
 RETURN public.get_workspace_contract(p_organization_id,v_id);
END $$;

CREATE FUNCTION public.workspace_contract_action(p_organization_id uuid,p_contract_id uuid,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;c jsonb;v_status text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.manage');
 IF public.current_demo_cohort() IS NULL THEN
 IF p_action<>'cancel' THEN RAISE EXCEPTION 'contract_server_send_required';END IF;
 PERFORM public.get_workspace_contract(p_organization_id,p_contract_id);PERFORM public.cancel_contract(p_contract_id);
 ELSE
 SELECT r0.* INTO r FROM public.workspace_resources r0 WHERE r0.organization_id=p_organization_id AND r0.type='housing' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r0.data->'demo_contracts','[]')) x WHERE x->>'id'=p_contract_id::text) FOR UPDATE;
 SELECT x INTO c FROM jsonb_array_elements(coalesce(r.data->'demo_contracts','[]')) x WHERE x->>'id'=p_contract_id::text;IF c IS NULL THEN RAISE EXCEPTION 'contract_not_found';END IF;
 IF p_action='simulate_send' AND c->>'status'='draft' THEN v_status:='sent';
 ELSIF p_action='simulate_sign' AND c->>'status'='sent' THEN v_status:='fully_signed';
 ELSIF p_action='cancel' AND c->>'status'<>'fully_signed' THEN v_status:='cancelled';ELSE RAISE EXCEPTION 'contract_transition_invalid';END IF;
 c:=c||jsonb_build_object('status',v_status,'rent_cents',round(coalesce((c->'answers'->>'rent_monthly_eur')::numeric,0)*100),'deposit_cents',round(coalesce((c->'answers'->>'rent_monthly_eur')::numeric,0)*coalesce((c->'answers'->>'deposit_months')::numeric,0)*100),'updated_at',clock_timestamp(),'signers',jsonb_build_array(jsonb_build_object('user_id',auth.uid(),'name','Arrendador de prueba','role','owner','status',CASE WHEN v_status='fully_signed' THEN 'signed' ELSE 'pending' END),jsonb_build_object('user_id',md5(r.id::text||'tenant')::uuid,'name','Alex · inquilino de prueba','role','tenant','status',CASE WHEN v_status='fully_signed' THEN 'signed' ELSE 'pending' END)));
 UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_contracts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=p_contract_id::text THEN c ELSE x END) FROM jsonb_array_elements(data->'demo_contracts') x)) WHERE id=r.id;
 END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'contract.'||p_action,p_contract_id);
 RETURN public.get_workspace_contract(p_organization_id,p_contract_id);
END $$;
REVOKE ALL ON FUNCTION public.workspace_contract_action(uuid,uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.workspace_contract_action(uuid,uuid,text) TO authenticated;

-- Update the service-only send function, keeping its row lock, expected
-- snapshot, cryptographic digest and immutable financial amounts unchanged.
DO $$ DECLARE definition text;anchor text;BEGIN
 IF to_regprocedure('public.send_contract_verified(uuid,uuid,uuid[],jsonb,timestamptz,text,integer,integer)') IS NOT NULL THEN
 SELECT pg_get_functiondef('public.send_contract_verified(uuid,uuid,uuid[],jsonb,timestamptz,text,integer,integer)'::regprocedure) INTO definition;
 anchor:='IF NOT FOUND OR v_contract.owner_id<>p_actor THEN RAISE EXCEPTION ''contract_not_found''; END IF;';IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'contract_send_guard_changed';END IF;
 definition:=replace(definition,anchor,'IF NOT FOUND OR NOT public.workspace_actor_housing_access(v_contract.accommodation_id,p_actor,''finance.manage'') THEN RAISE EXCEPTION ''contract_not_found''; END IF;');
 definition:=replace(definition,'WHERE id=v_contract.accommodation_id AND owner_id=p_actor','WHERE id=v_contract.accommodation_id AND owner_id=v_contract.owner_id');
 definition:=replace(definition,'x<>p_actor','x<>p_actor AND x<>v_contract.owner_id');
 definition:=replace(definition,'VALUES(p_contract_id,p_actor,''owner'',0)','VALUES(p_contract_id,v_contract.owner_id,''owner'',0)');
 definition:=replace(definition,'UPDATE public.contracts SET status=''sent''','IF EXISTS(SELECT 1 FROM public.accommodations WHERE id=v_contract.accommodation_id AND organization_id IS NOT NULL) AND EXISTS(SELECT 1 FROM unnest(v_ids) tenant WHERE NOT EXISTS(SELECT 1 FROM public.tenancies t WHERE t.accommodation_id=v_contract.accommodation_id AND t.tenant_id=tenant AND t.status=''active'')) THEN RAISE EXCEPTION ''tenancy_confirmation_required''; END IF; UPDATE public.contracts SET status=''sent''');
 EXECUTE definition;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_contract(p_contract_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.contracts%ROWTYPE;BEGIN
 PERFORM public.require_account_session();SELECT * INTO c FROM public.contracts WHERE id=p_contract_id FOR UPDATE;
 IF NOT FOUND OR NOT public.workspace_actor_housing_access(c.accommodation_id,auth.uid(),'finance.manage') THEN RAISE EXCEPTION 'contract_not_found';END IF;
 IF c.status='fully_signed' THEN RAISE EXCEPTION 'contract_already_signed';END IF;
 IF c.status='cancelled' THEN RETURN jsonb_build_object('ok',true);END IF;
 UPDATE public.contracts SET status='cancelled' WHERE id=c.id;
 INSERT INTO public.notifications(user_id,type,title,body,data) SELECT user_id,'contract','Contrato cancelado','La parte arrendadora ha cancelado el envío pendiente de este contrato.',jsonb_build_object('kind','contract_cancelled','contract_id',c.id) FROM public.contract_signers WHERE contract_id=c.id AND role='tenant';
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_contract(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.cancel_contract(uuid) TO authenticated;

DO $$ DECLARE f record;definition text;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_workspace_housing_operations','workspace_housing_action','get_workspace_contract','save_workspace_contract') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END LOOP;
 IF to_regprocedure('public.workspace_require_request()') IS NOT NULL THEN SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;IF strpos(definition,'''/rpc/current_demo_cohort''')=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing';END IF;EXECUTE replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/get_workspace_housing_operations'',''/rpc/workspace_housing_action'',''/rpc/get_workspace_contract'',''/rpc/save_workspace_contract'',''/rpc/workspace_contract_action'',''/rpc/get_workspace_housing_history''');END IF;
END $$;
DO $$ DECLARE definition text;anchor text:='DELETE FROM public.workspace_resources WHERE organization_id=s.organization_id;';BEGIN
 IF to_regprocedure('workspace_private.reset_demo(uuid)') IS NOT NULL THEN
 SELECT pg_get_functiondef('workspace_private.reset_demo(uuid)'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'demo_reset_anchor_missing';END IF;
 EXECUTE replace(definition,anchor,'DELETE FROM public.workspace_rent_receipts WHERE organization_id=s.organization_id; DELETE FROM public.workspace_rent_obligations WHERE organization_id=s.organization_id; DELETE FROM public.workspace_housing_notes WHERE organization_id=s.organization_id; DELETE FROM public.workspace_housing_assignments WHERE organization_id=s.organization_id; DELETE FROM public.workspace_contract_requests WHERE organization_id=s.organization_id; '||anchor);
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_18$;

-- SOURCE 20260923030000_workspace_event_audience.sql
EXECUTE $franky_component_19$
-- Admission is rechecked at registration, payment preparation and check-in.
-- Restriction changes cannot invalidate already sold/registered places silently.

ALTER TABLE public.events ADD COLUMN audience text NOT NULL DEFAULT 'public' CHECK(audience IN('public','member','invited','verified_university'));
ALTER TABLE public.events ADD COLUMN audience_community_id uuid REFERENCES public.communities(id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD COLUMN audience_university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
CREATE TABLE public.workspace_event_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,demo_name text,
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 UNIQUE(resource_id,user_id),CHECK((user_id IS NOT NULL AND demo_name IS NULL) OR (user_id IS NULL AND length(demo_name) BETWEEN 1 AND 80))
);
CREATE TABLE public.workspace_university_affiliations(
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
 verified boolean NOT NULL,evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 5 AND 500),expires_at timestamptz,
 reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,university_id),
 CHECK(NOT verified OR expires_at IS NOT NULL)
);
CREATE TABLE public.workspace_affiliation_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
 action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_affiliation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_affiliation_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.workspace_affiliation_audit TO service_role;
ALTER TABLE public.workspace_event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_university_affiliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_event_invitations,public.workspace_university_affiliations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_event_invitations,public.workspace_university_affiliations TO service_role;

CREATE FUNCTION workspace_private.guard_event_invitation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cohort uuid;kind text;BEGIN
 SELECT r.type,o.demo_cohort_id INTO kind,cohort FROM public.workspace_resources r JOIN public.organizations o ON o.id=r.organization_id WHERE r.id=NEW.resource_id;
 IF kind IS DISTINCT FROM 'event' OR (cohort IS NULL AND NEW.user_id IS NULL) OR (cohort IS NOT NULL AND NEW.user_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'event_invitation_scope' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.guard_event_invitation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER event_invitation_scope BEFORE INSERT OR UPDATE ON public.workspace_event_invitations FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_event_invitation();

-- Private arbitrary-subject proof resolver: only authorized DEFINER callers may
-- query another person's eligibility, and never return the email/evidence.
CREATE FUNCTION workspace_private.verified_affiliation(p_user uuid,p_university uuid) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE decision public.workspace_university_affiliations;BEGIN
 IF p_user IS NULL OR p_university IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND is_discarded IS NOT TRUE)
 OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user) THEN RETURN false; END IF;
 SELECT * INTO decision FROM public.workspace_university_affiliations WHERE user_id=p_user AND university_id=p_university FOR SHARE;
 IF FOUND THEN RETURN decision.verified AND decision.expires_at>now(); END IF;
 -- The confirmation RPC writes these timestamps atomically. Mere token issue,
 -- token supersession and a self-declared profile university are not evidence.
 PERFORM 1 FROM public.profiles p JOIN public.student_email_domains d ON d.domain=lower(split_part(p.student_email,'@',2))
 JOIN public.student_email_verifications v ON v.user_id=p.id AND lower(v.email)=lower(p.student_email) AND v.used_at=p.student_email_verified_at
 WHERE p.id=p_user AND p.student_email_verified AND p.student_email_verified_at>now()-interval '365 days' AND d.university_id=p_university FOR SHARE OF p,d,v;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION workspace_private.verified_affiliation(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_set_university_affiliation(p_user_id uuid,p_university_id uuid,p_verified boolean,p_evidence_reference text,p_expires_at timestamptz DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 IF p_verified IS NULL OR length(btrim(coalesce(p_evidence_reference,''))) NOT BETWEEN 5 AND 500 OR
 p_verified AND (p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '366 days') THEN RAISE EXCEPTION 'affiliation_evidence_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_discarded IS NOT TRUE) OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user_id)
 OR NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id) THEN RAISE EXCEPTION 'affiliation_subject_invalid'; END IF;
 INSERT INTO public.workspace_university_affiliations(user_id,university_id,verified,evidence_reference,expires_at,reviewed_by)
 VALUES(p_user_id,p_university_id,p_verified,btrim(p_evidence_reference),CASE WHEN p_verified THEN p_expires_at ELSE NULL END,auth.uid())
 ON CONFLICT(user_id,university_id) DO UPDATE SET verified=excluded.verified,evidence_reference=excluded.evidence_reference,expires_at=excluded.expires_at,reviewed_by=auth.uid(),reviewed_at=now();
 INSERT INTO public.workspace_affiliation_audit(actor_id,user_id,university_id,action,details) VALUES(auth.uid(),p_user_id,p_university_id,CASE WHEN p_verified THEN 'affiliation.verified' ELSE 'affiliation.revoked' END,jsonb_build_object('evidence_reference',btrim(p_evidence_reference),'expires_at',p_expires_at));
 RETURN true;
END $$;
CREATE FUNCTION public.admin_set_university_email_domain(p_university_id uuid,p_domain text,p_enabled boolean) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.workspace_admin_required();
 IF p_enabled IS NULL OR lower(btrim(coalesce(p_domain,'')))!~'^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}$' OR
 NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id) THEN RAISE EXCEPTION 'affiliation_domain_invalid'; END IF;
 IF p_enabled THEN INSERT INTO public.student_email_domains(domain,university_id,notes) VALUES(lower(btrim(p_domain)),p_university_id,'Vinculación institucional revisada por Franky')
 ON CONFLICT(domain) DO UPDATE SET university_id=excluded.university_id;
 ELSE UPDATE public.student_email_domains SET university_id=NULL WHERE domain=lower(btrim(p_domain)) AND university_id=p_university_id; END IF;
 INSERT INTO public.workspace_affiliation_audit(actor_id,university_id,action,details) VALUES(auth.uid(),p_university_id,CASE WHEN p_enabled THEN 'domain.linked' ELSE 'domain.unlinked' END,jsonb_build_object('domain',lower(btrim(p_domain))));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_university_affiliation(uuid,uuid,boolean,text,timestamptz),public.admin_set_university_email_domain(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_university_affiliation(uuid,uuid,boolean,text,timestamptz),public.admin_set_university_email_domain(uuid,text,boolean) TO authenticated;

CREATE FUNCTION public.admin_list_university_admission_config(p_university_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE domains jsonb;affiliations jsonb;lim int:=greatest(1,least(coalesce(p_limit,30),50));BEGIN
 PERFORM public.workspace_admin_required();
 IF NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id) THEN RAISE EXCEPTION 'university_not_found';END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO domains FROM(SELECT d.domain,coalesce(d.university_id=p_university_id,false) enabled FROM public.student_email_domains d
 WHERE d.university_id=p_university_id OR EXISTS(SELECT 1 FROM public.workspace_affiliation_audit a WHERE a.university_id=p_university_id AND a.action IN('domain.linked','domain.unlinked') AND a.details->>'domain'=d.domain) ORDER BY d.domain)x;
 SELECT coalesce(jsonb_agg(x),'[]') INTO affiliations FROM(SELECT a.user_id,coalesce(p.full_name,'Cuenta de Franky') name,a.verified,a.expires_at,a.reviewed_at,a.evidence_reference,
 CASE WHEN NOT a.verified THEN 'revoked' WHEN a.expires_at<=now() THEN 'expired' ELSE 'verified' END status
 FROM public.workspace_university_affiliations a JOIN public.profiles p ON p.id=a.user_id WHERE a.university_id=p_university_id AND (p_cursor IS NULL OR a.user_id>p_cursor) ORDER BY a.user_id LIMIT lim)x;
 RETURN jsonb_build_object('domains',domains,'affiliations',affiliations,'next_cursor',CASE WHEN jsonb_array_length(affiliations)=lim THEN affiliations->(lim-1)->>'user_id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.admin_list_university_admission_config(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_university_admission_config(uuid,uuid,integer) TO authenticated;

CREATE FUNCTION workspace_private.event_audience_eligible(p_event uuid,p_user uuid) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events;organization_kind text;BEGIN
 IF p_user IS NULL OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user) THEN RETURN false; END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_user AND is_discarded IS NOT TRUE FOR SHARE;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event;
 IF e.id IS NULL OR e.status='cancelled' OR e.organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=e.organization_id AND status='active' AND demo_cohort_id IS NULL) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.event_participants WHERE event_id=e.id AND user_id=p_user AND kicked_at IS NOT NULL) THEN RETURN false;END IF;
 IF e.audience='public' THEN RETURN true;
 ELSIF e.audience='member' THEN
 PERFORM 1 FROM public.community_members m JOIN public.communities c ON c.id=m.community_id
 WHERE m.community_id=e.audience_community_id AND m.user_id=p_user AND c.organization_id=e.organization_id AND NOT c.is_deleted AND NOT c.is_hidden FOR SHARE OF m,c;
 RETURN FOUND;
 ELSIF e.audience='invited' THEN
 PERFORM 1 FROM public.workspace_event_invitations i JOIN public.workspace_resources r ON r.id=i.resource_id
 WHERE r.source_id=e.id AND r.organization_id=e.organization_id AND r.type='event' AND r.status<>'archived' AND i.user_id=p_user AND i.revoked_at IS NULL AND i.expires_at>now() FOR SHARE OF i;
 RETURN FOUND;
 ELSIF e.audience='verified_university' THEN
 SELECT kind INTO organization_kind FROM public.organizations WHERE id=e.organization_id FOR SHARE;
 IF organization_kind='university' THEN
 PERFORM 1 FROM public.organization_campuses WHERE organization_id=e.organization_id AND university_id=e.audience_university_id FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 END IF;
 RETURN workspace_private.verified_affiliation(p_user,e.audience_university_id);
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION workspace_private.event_audience_eligible(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_event_admission(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events;allowed boolean;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';END IF;
 PERFORM public.require_account_session();
 IF public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event_id;
 IF e.id IS NULL THEN RAISE EXCEPTION 'event_not_found';END IF;
 allowed:=workspace_private.event_audience_eligible(e.id,auth.uid());
 RETURN jsonb_build_object('audience',e.audience,'eligible',allowed,'target_name',CASE WHEN e.audience='verified_university' THEN (SELECT name FROM public.universities WHERE id=e.audience_university_id) WHEN e.audience='member' AND allowed THEN (SELECT name FROM public.communities WHERE id=e.audience_community_id) ELSE NULL END,
 'reason',CASE WHEN allowed THEN NULL WHEN e.status='cancelled' THEN 'event_cancelled' ELSE 'event_audience_'||e.audience END);
END $$;
REVOKE ALL ON FUNCTION public.get_event_admission(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_event_admission(uuid) TO authenticated;

-- Historical participation cannot retain private event-chat access after the
-- invitation, membership or institutional scope that authorized it is gone.
ALTER FUNCTION public.workspace_chat_access(uuid) RENAME TO workspace_chat_before_audience;
REVOKE ALL ON FUNCTION public.workspace_chat_before_audience(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_chat_access(p_conversation uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events;BEGIN
 IF NOT public.workspace_chat_before_audience(p_conversation) THEN RETURN false;END IF;
 SELECT ev.* INTO e FROM public.events ev JOIN public.event_conversations ec ON ec.event_id=ev.id WHERE ec.conversation_id=p_conversation;
 IF e.id IS NULL THEN RETURN true;END IF;
 IF (CASE WHEN e.organization_id IS NULL THEN e.organizer_id=auth.uid() ELSE public.has_organization_permission(e.organization_id,'content.manage') END) THEN RETURN true;END IF;
 RETURN workspace_private.event_audience_eligible(e.id,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.workspace_chat_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_chat_access(uuid) TO authenticated;
-- Policy expressions store a function OID. Renaming the old implementation
-- does not rebind them to its replacement, so rebuild the affected expressions.
DO $$ DECLARE p record;BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND (strpos(coalesce(qual,''),'workspace_chat_before_audience(')>0 OR strpos(coalesce(with_check,''),'workspace_chat_before_audience(')>0) LOOP
  EXECUTE format('ALTER POLICY %I ON %I.%I %s %s',p.policyname,p.schemaname,p.tablename,
   CASE WHEN p.qual IS NULL THEN '' ELSE 'USING ('||replace(p.qual,'workspace_chat_before_audience(','workspace_chat_access(')||')' END,
   CASE WHEN p.with_check IS NULL THEN '' ELSE 'WITH CHECK ('||replace(p.with_check,'workspace_chat_before_audience(','workspace_chat_access(')||')' END);
 END LOOP;
END $$;
DO $$DECLARE def text;anchor text:='conv:=public.workspace_event_chat_core(p_event_id);';BEGIN
 SELECT pg_get_functiondef('public.join_event_chat(uuid,uuid)'::regprocedure) INTO def;
 IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'event_chat_function_changed';END IF;
 EXECUTE replace(def,anchor,'IF NOT coalesce(manager,false) AND NOT workspace_private.event_audience_eligible(p_event_id,p_user_id) THEN RAISE EXCEPTION ''event_audience_forbidden'' USING ERRCODE=''42501'';END IF; '||anchor);
END $$;

CREATE FUNCTION workspace_private.guard_event_audience() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.audience<>'public' AND NEW.organization_id IS NULL THEN RAISE EXCEPTION 'event_organization_required'; END IF;
 IF NEW.audience='member' AND NOT EXISTS(SELECT 1 FROM public.communities WHERE id=NEW.audience_community_id AND organization_id=NEW.organization_id AND NOT is_deleted AND NOT is_hidden) THEN RAISE EXCEPTION 'event_community_required'; END IF;
 IF NEW.audience='verified_university' AND (NEW.audience_university_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.universities WHERE id=NEW.audience_university_id) OR
 EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=NEW.organization_id AND o.kind='university' AND NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=o.id AND university_id=NEW.audience_university_id))) THEN RAISE EXCEPTION 'event_campus_required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.audience,NEW.audience_community_id,NEW.audience_university_id) IS DISTINCT FROM (OLD.audience,OLD.audience_community_id,OLD.audience_university_id)
 AND (EXISTS(SELECT 1 FROM public.event_tickets WHERE event_id=OLD.id AND status IN('pending_payment','valid','used','listed_for_resale'))
 OR EXISTS(SELECT 1 FROM public.event_participants WHERE event_id=OLD.id AND status IN('registered','attended') AND kicked_at IS NULL)) THEN RAISE EXCEPTION 'event_audience_has_registrations'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.guard_event_audience() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER b_workspace_event_audience BEFORE INSERT OR UPDATE OF audience,audience_community_id,audience_university_id,organization_id ON public.events FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_event_audience();

ALTER FUNCTION public.workspace_validate_data(text,text,jsonb,boolean,uuid) RENAME TO workspace_validate_before_audience;
REVOKE ALL ON FUNCTION public.workspace_validate_before_audience(text,text,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_validate_data(p_kind text,p_type text,p_data jsonb,p_publish boolean,p_org uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;choice text:=coalesce(p_data->>'audience','public');community uuid;campus uuid;demo uuid;BEGIN
 result:=public.workspace_validate_before_audience(p_kind,p_type,p_data,p_publish,p_org);
 IF p_type<>'event' THEN RETURN result;END IF;
 IF choice NOT IN('public','member','invited','verified_university') THEN RAISE EXCEPTION 'invalid_event_audience';END IF;
 IF choice='member' AND nullif(p_data->>'community_resource_id','') IS NOT NULL THEN
 SELECT r.id INTO community FROM public.workspace_resources r WHERE r.id=(p_data->>'community_resource_id')::uuid AND r.organization_id=p_org AND r.type='community' AND r.status<>'archived';
 IF community IS NULL THEN RAISE EXCEPTION 'event_community_required';END IF;
 END IF;
 IF p_publish AND choice='member' AND community IS NULL THEN RAISE EXCEPTION 'event_community_required';END IF;
 IF choice='verified_university' AND nullif(p_data->>'audience_university_id','') IS NOT NULL THEN
 campus:=(p_data->>'audience_university_id')::uuid;
 SELECT demo_cohort_id INTO demo FROM public.organizations WHERE id=p_org;
 IF demo IS NOT NULL THEN
 IF campus<>md5(p_org::text||':audience-campus')::uuid THEN RAISE EXCEPTION 'event_campus_required';END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM public.universities WHERE id=campus) OR p_kind='university' AND NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=p_org AND university_id=campus) THEN RAISE EXCEPTION 'event_campus_required';END IF;
 END IF;
 IF p_publish AND choice='verified_university' AND campus IS NULL THEN RAISE EXCEPTION 'event_campus_required';END IF;
 RETURN result||jsonb_build_object('audience',choice,'community_resource_id',community,'audience_university_id',campus);
END $$;
REVOKE ALL ON FUNCTION public.workspace_validate_data(text,text,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.workspace_canonical_payload(text,uuid) RENAME TO workspace_payload_before_audience;
REVOKE ALL ON FUNCTION public.workspace_payload_before_audience(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_canonical_payload(p_type text,p_source_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;e public.events;community uuid;BEGIN
 result:=public.workspace_payload_before_audience(p_type,p_source_id);
 IF p_type='event' AND result IS NOT NULL THEN
 SELECT * INTO e FROM public.events WHERE id=p_source_id;
 SELECT id INTO community FROM public.workspace_resources WHERE type='community' AND source_id=e.audience_community_id AND organization_id=e.organization_id;
 result:=jsonb_set(result,'{data}',result->'data'||jsonb_build_object('audience',e.audience,'community_resource_id',community,'audience_university_id',e.audience_university_id));
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.workspace_canonical_payload(text,uuid) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) RENAME TO workspace_save_before_event_audience;
REVOKE ALL ON FUNCTION public.workspace_save_before_event_audience(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.save_workspace_resource(p_organization_id uuid,p_resource_type text,p_data jsonb,p_resource_id uuid DEFAULT NULL,p_publish boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;r public.workspace_resources;community uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 result:=public.workspace_save_before_event_audience(p_organization_id,p_resource_type,p_data,p_resource_id,p_publish);
 IF p_resource_type='event' AND p_publish AND public.current_demo_cohort() IS NULL THEN
 SELECT * INTO r FROM public.workspace_resources WHERE id=(result->>'id')::uuid;
 IF coalesce(p_data->>'audience','public')='member' THEN SELECT source_id INTO community FROM public.workspace_resources WHERE id=(p_data->>'community_resource_id')::uuid AND organization_id=p_organization_id AND type='community';END IF;
 UPDATE public.events SET audience=coalesce(p_data->>'audience','public'),audience_community_id=community,audience_university_id=CASE WHEN p_data->>'audience'='verified_university' THEN (p_data->>'audience_university_id')::uuid ELSE NULL END WHERE id=r.source_id AND organization_id=p_organization_id;
 SELECT * INTO r FROM public.workspace_resources WHERE id=r.id;RETURN public.workspace_resource_json(r);
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_resource(uuid,text,jsonb,uuid,boolean) TO authenticated;

-- Selecting a campus as an audience grants no institutional identity or power.
CREATE FUNCTION public.get_workspace_event_audience_universities(p_organization_id uuid,p_query text DEFAULT '',p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.organizations;items jsonb;lim int:=greatest(1,least(coalesce(p_limit,30),50));BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');SELECT * INTO o FROM public.organizations WHERE id=p_organization_id;
 IF length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'invalid_query';END IF;
 IF o.demo_cohort_id IS NOT NULL THEN RETURN jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',md5(o.id::text||':audience-campus')::uuid,'name','Universidad de demostración')),'next_cursor',null);END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO items FROM(SELECT u.id,u.name FROM public.universities u WHERE
 (p_cursor IS NULL OR u.id>p_cursor) AND strpos(lower(u.name),lower(btrim(coalesce(p_query,''))))>0 AND
 (o.kind<>'university' OR EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=o.id AND university_id=u.id)) ORDER BY u.id LIMIT lim)x;
 RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=lim THEN items->(lim-1)->>'id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_event_audience_universities(uuid,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_event_audience_universities(uuid,text,uuid,integer) TO authenticated;

-- Independent of every old/new registration API. Existing payment settlement
-- may record a paid ticket after access revocation; it does not grant check-in.
CREATE FUNCTION workspace_private.guard_event_admission_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid;v_event_id uuid;doc jsonb:=to_jsonb(NEW);previous jsonb;e public.events;check_access boolean:=false;settlement boolean:=false;BEGIN
 v_event_id:=(doc->>'event_id')::uuid;actor:=coalesce(doc->>'holder_id',doc->>'user_id')::uuid;
 IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD);END IF;
 SELECT * INTO e FROM public.events WHERE id=v_event_id FOR UPDATE;
 IF TG_TABLE_NAME='event_tickets' THEN
 check_access:=TG_OP='INSERT' OR (doc->>'holder_id',doc->>'event_id') IS DISTINCT FROM (previous->>'holder_id',previous->>'event_id') OR
 (doc->>'status'='used' AND previous->>'status' IS DISTINCT FROM 'used') OR (doc->>'status'='pending_payment' AND previous->>'status' IS DISTINCT FROM 'pending_payment');
 ELSIF TG_TABLE_NAME='event_participants' THEN
 IF TG_OP='UPDATE' AND (doc->>'event_id',doc->>'user_id') IS DISTINCT FROM (previous->>'event_id',previous->>'user_id') THEN RAISE EXCEPTION 'registration_cannot_be_reassigned';END IF;
 IF auth.uid() IS NOT NULL AND (coalesce(doc->>'kicked_at',''),coalesce(doc->>'kicked_by','')) IS DISTINCT FROM (coalesce(previous->>'kicked_at',''),coalesce(previous->>'kicked_by','')) AND NOT
 (CASE WHEN e.organization_id IS NULL THEN e.organizer_id=auth.uid() ELSE public.has_organization_permission(e.organization_id,'content.manage') END OR public.is_admin() AND auth.jwt()->>'aal'='aal2') THEN RAISE EXCEPTION 'attendance_forbidden' USING ERRCODE='42501';END IF;
 check_access:=coalesce(doc->>'status','') IN('registered','attended') AND (TG_OP='INSERT' OR doc->>'status' IS DISTINCT FROM previous->>'status');
 IF doc->>'status'='attended' AND previous->>'status' IS DISTINCT FROM 'attended' AND auth.uid() IS NOT NULL AND NOT
 (CASE WHEN e.organization_id IS NULL THEN e.organizer_id=auth.uid() ELSE public.has_organization_permission(e.organization_id,'attendees.manage') END OR public.is_admin() AND auth.jwt()->>'aal'='aal2') THEN RAISE EXCEPTION 'attendance_forbidden' USING ERRCODE='42501';END IF;
 IF check_access AND doc->>'status'='registered' THEN
 IF coalesce(e.price,0)>0 AND coalesce(e.payment_mode,'app')='app' THEN
 IF NOT EXISTS(SELECT 1 FROM public.event_tickets t WHERE t.event_id=e.id AND t.holder_id=actor AND t.status IN('valid','used')) THEN RAISE EXCEPTION 'paid_ticket_required'; END IF;
 -- A trusted webhook records the economic fact after an invitation/membership
 -- expires. This never bypasses admission for a purchase or an attended row.
 settlement:=coalesce(auth.role(),'')='service_role';
 END IF;
 IF coalesce(e.price,0)=0 AND e.max_capacity IS NOT NULL AND (SELECT count(*) FROM public.event_participants p WHERE p.event_id=e.id AND p.status IN('registered','attended') AND p.id<>(doc->>'id')::uuid AND p.kicked_at IS NULL)>=e.max_capacity THEN RAISE EXCEPTION 'event_full';END IF;
 END IF;
 ELSE check_access:=TG_OP='INSERT' OR (doc->>'event_id',doc->>'user_id') IS DISTINCT FROM (previous->>'event_id',previous->>'user_id'); END IF;
 IF check_access AND NOT settlement AND NOT workspace_private.event_audience_eligible(e.id,actor) THEN RAISE EXCEPTION 'event_audience_forbidden' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.guard_event_admission_child() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aac_workspace_event_admission BEFORE INSERT OR UPDATE ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_event_admission_child();
CREATE TRIGGER aac_workspace_event_admission BEFORE INSERT OR UPDATE ON public.event_participants FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_event_admission_child();
CREATE TRIGGER aac_workspace_event_admission BEFORE INSERT OR UPDATE ON public.event_waitlist FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_event_admission_child();

-- Add a gate to the exact deployed function bodies, preserving all quote,
-- expiry, payment mode, discount and capacity logic and existing grants.
DO $$DECLARE signature text;definition text;gate text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.reserve_event_ticket(uuid)','public.register_event_shirt_option(uuid,text)','public.prepare_marketplace_payment(text,uuid,uuid,text,text,integer,integer,text,jsonb)'] LOOP
 IF to_regprocedure(signature) IS NULL THEN CONTINUE;END IF;
 SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
 IF signature LIKE '%prepare_marketplace%' THEN gate:=E'BEGIN\n IF p_type=''ticket'' THEN IF NOT EXISTS(SELECT 1 FROM public.event_tickets WHERE id=p_resource_id AND holder_id=p_buyer_id) THEN RAISE EXCEPTION ''ticket_not_found'';END IF; PERFORM 1 FROM public.events e JOIN public.event_tickets t ON t.event_id=e.id WHERE t.id=p_resource_id FOR UPDATE OF e; IF NOT workspace_private.event_audience_eligible((SELECT event_id FROM public.event_tickets WHERE id=p_resource_id),p_buyer_id) THEN RAISE EXCEPTION ''event_audience_forbidden'' USING ERRCODE=''42501''; END IF; END IF;';
 ELSE gate:=E'BEGIN\n IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION ''auth_required'' USING ERRCODE=''42501'';END IF; PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE; IF NOT workspace_private.event_audience_eligible(p_event_id,auth.uid()) THEN RAISE EXCEPTION ''event_audience_forbidden'' USING ERRCODE=''42501'';END IF;'; END IF;
 IF substring(definition from '[Bb][Ee][Gg][Ii][Nn]') IS NULL THEN RAISE EXCEPTION 'event_admission_function_changed';END IF;
 EXECUTE regexp_replace(definition,'[Bb][Ee][Gg][Ii][Nn]',gate);
 END LOOP;
END $$;

CREATE FUNCTION public.get_workspace_event_invitations(p_organization_id uuid,p_event_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE items jsonb;lim int:=greatest(1,least(coalesce(p_limit,30),50));BEGIN
 PERFORM public.workspace_require(p_organization_id,'attendees.manage');
 IF NOT EXISTS(SELECT 1 FROM public.workspace_resources WHERE id=p_event_id AND organization_id=p_organization_id AND type='event') THEN RAISE EXCEPTION 'event_not_found';END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO items FROM(SELECT i.id,i.user_id,coalesce(i.demo_name,p.full_name,'Persona invitada') name,
 CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at<=now() THEN 'expired' ELSE 'invited' END status,i.expires_at
 FROM public.workspace_event_invitations i LEFT JOIN public.profiles p ON p.id=i.user_id WHERE i.resource_id=p_event_id AND (p_cursor IS NULL OR i.id>p_cursor) ORDER BY i.id LIMIT lim)x;
 RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=lim THEN items->(lim-1)->>'id' ELSE NULL END);
END $$;
CREATE FUNCTION public.workspace_event_invitation_action(p_organization_id uuid,p_event_id uuid,p_action text,p_invitation_id uuid DEFAULT NULL,p_email text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources;e public.events;target uuid;i public.workspace_event_invitations;demo uuid;BEGIN
 PERFORM public.workspace_require(p_organization_id,'attendees.manage');
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_event_id AND organization_id=p_organization_id AND type='event' AND status<>'archived';IF r.id IS NULL THEN RAISE EXCEPTION 'event_not_found';END IF;
 SELECT demo_cohort_id INTO demo FROM public.organizations WHERE id=p_organization_id;
 IF demo IS NULL THEN SELECT * INTO e FROM public.events WHERE id=r.source_id AND organization_id=p_organization_id AND status<>'cancelled' FOR UPDATE;IF e.id IS NULL THEN RAISE EXCEPTION 'publish_event_first';END IF;END IF;
 IF p_action='invite' THEN
 IF demo IS NOT NULL THEN RAISE EXCEPTION 'demo_external_invitation_disabled';END IF;
 IF e.audience<>'invited' THEN RAISE EXCEPTION 'event_invitation_mode_required';END IF;
 SELECT u.id INTO target FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)=lower(btrim(p_email)) AND u.email_confirmed_at IS NOT NULL AND p.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=u.id);
 IF target IS NULL THEN RAISE EXCEPTION 'event_invitee_unavailable';END IF;
 IF coalesce(e.end_date,e.start_date+interval '1 day')<=now() THEN RAISE EXCEPTION 'event_ended';END IF;
 INSERT INTO public.workspace_event_invitations(resource_id,user_id,expires_at,created_by) VALUES(r.id,target,coalesce(e.end_date,e.start_date+interval '1 day'),auth.uid())
 ON CONFLICT(resource_id,user_id) DO UPDATE SET expires_at=excluded.expires_at,revoked_at=NULL,created_by=auth.uid() RETURNING * INTO i;
 ELSIF p_action='revoke' THEN
 UPDATE public.workspace_event_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=p_invitation_id AND resource_id=r.id RETURNING * INTO i;IF i.id IS NULL THEN RAISE EXCEPTION 'invitation_not_found';END IF;
 ELSE RAISE EXCEPTION 'invalid_action';END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'event.invitation_'||p_action,r.id,jsonb_build_object('invitation_id',i.id));
 RETURN jsonb_build_object('id',i.id,'status',CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked' ELSE 'invited' END);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_event_invitations(uuid,uuid,uuid,integer),public.workspace_event_invitation_action(uuid,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_event_invitations(uuid,uuid,uuid,integer),public.workspace_event_invitation_action(uuid,uuid,text,uuid,text) TO authenticated;

DO $$DECLARE definition text;BEGIN IF to_regprocedure('public.workspace_require_request()') IS NOT NULL THEN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 definition:=replace(definition,'''/rpc/get_workspace_attendees''','''/rpc/get_workspace_attendees'',''/rpc/get_workspace_event_invitations'',''/rpc/workspace_event_invitation_action'',''/rpc/get_workspace_event_audience_universities''');EXECUTE definition;
 END IF;END $$;
NOTIFY pgrst,'reload schema';
$franky_component_19$;

-- SOURCE 20260923040000_workspace_visit_reschedule.sql
EXECUTE $franky_component_20$
-- A private, transaction-bound capability lets the atomic RPC move a booking.
-- Clients cannot forge a GUC or directly update slot_id to skip capacity checks.
CREATE TABLE workspace_private.visit_reschedule_permits(booking_id uuid PRIMARY KEY,actor_id uuid NOT NULL,target_slot_id uuid NOT NULL,transaction_id bigint NOT NULL);
REVOKE ALL ON workspace_private.visit_reschedule_permits FROM PUBLIC,anon,authenticated;
DO $$ DECLARE definition text;anchor text:='IF v_old IS NOT NULL AND (v_row->>''visitor_id'',v_row->>''slot_id'') IS DISTINCT FROM (v_old->>''visitor_id'',v_old->>''slot_id'') THEN RAISE EXCEPTION ''visit_ownership_immutable'' USING ERRCODE=''42501''; END IF;';BEGIN
 SELECT pg_get_functiondef('public.guard_workspace_visit_mutation()'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'visit_guard_anchor_missing';END IF;
 EXECUTE replace(definition,anchor,'IF v_old IS NOT NULL AND v_row->>''visitor_id'' IS DISTINCT FROM v_old->>''visitor_id'' THEN RAISE EXCEPTION ''visit_ownership_immutable'' USING ERRCODE=''42501''; END IF;
 IF v_old IS NOT NULL AND v_row->>''slot_id'' IS DISTINCT FROM v_old->>''slot_id'' THEN
 DELETE FROM workspace_private.visit_reschedule_permits WHERE booking_id=(v_row->>''id'')::uuid AND actor_id=v_actor AND target_slot_id=(v_row->>''slot_id'')::uuid AND transaction_id=txid_current();
 IF NOT FOUND THEN RAISE EXCEPTION ''visit_ownership_immutable'' USING ERRCODE=''42501'';END IF;END IF;');
END $$;
CREATE FUNCTION public.get_workspace_visit_options(p_organization_id uuid,p_booking_id uuid,p_days integer DEFAULT 14) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE home uuid;result jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF public.current_demo_cohort() IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.workspace_resources WHERE id=p_booking_id AND organization_id=p_organization_id AND type='visit') THEN RAISE EXCEPTION 'visit_not_found';END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object('slot_date',current_date+d,'start_time','17:00:00','end_time','17:30:00','available',1,'price_cents',0,'simulated',true)) FROM generate_series(1,3)d);
 END IF;
 SELECT s.accommodation_id INTO home FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE b.id=p_booking_id AND a.organization_id=p_organization_id;
 IF home IS NULL THEN RAISE EXCEPTION 'visit_not_found';END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM public.get_bookable_visit_times(home,least(greatest(coalesce(p_days,14),1),60)) x WHERE (x->>'price_cents')::int=0;
 RETURN result;
END $$;
CREATE FUNCTION public.reschedule_workspace_visit(p_organization_id uuid,p_booking_id uuid,p_slot_date date,p_start_time time) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.visit_bookings%ROWTYPE;old_slot public.visit_slots%ROWTYPE;target public.visit_slots%ROWTYPE;v_owner uuid;v_option jsonb;v_count int;demo public.workspace_resources%ROWTYPE;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF p_slot_date IS NULL OR p_start_time IS NULL OR (p_slot_date+p_start_time) AT TIME ZONE 'Europe/Madrid'<=now() OR p_slot_date>current_date+59 THEN RAISE EXCEPTION 'visit_time_invalid';END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
 SELECT * INTO demo FROM public.workspace_resources WHERE id=p_booking_id AND organization_id=p_organization_id AND type='visit' FOR UPDATE;
 IF NOT FOUND OR demo.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'visit_not_active';END IF;
 UPDATE public.workspace_resources SET status='confirmed',data=data||jsonb_build_object('starts_at',(p_slot_date+p_start_time) AT TIME ZONE 'Europe/Madrid','ends_at',(p_slot_date+p_start_time+interval '30 minutes') AT TIME ZONE 'Europe/Madrid'),updated_at=now() WHERE id=demo.id RETURNING * INTO demo;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'demo.visit_rescheduled',demo.id);
 RETURN public.workspace_resource_json(demo);
 END IF;
 -- This is the same payment resource lock used by checkout and webhooks.
 PERFORM public.lock_marketplace_resource('visit',p_booking_id);
 SELECT vb.* INTO b FROM public.visit_bookings vb JOIN public.visit_slots s ON s.id=vb.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE vb.id=p_booking_id AND a.organization_id=p_organization_id FOR UPDATE OF vb;
 IF NOT FOUND OR b.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'visit_not_active';END IF;
 SELECT * INTO old_slot FROM public.visit_slots WHERE id=b.slot_id;
 IF old_slot.slot_date=p_slot_date AND old_slot.start_time=p_start_time THEN RETURN public.workspace_visit_json(b.id,p_organization_id);END IF;
 IF b.price_cents>0 OR b.payment_status IN('pending','paid') OR EXISTS(SELECT 1 FROM public.payments p WHERE p.type='visit' AND p.ref_id=b.id AND (p.status IN('pending','processing') OR p.amount_cents>p.refunded_cents AND p.status NOT IN('failed','canceled','refunded'))) THEN RAISE EXCEPTION 'visit_payment_review_required';END IF;
 IF EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state cs ON cs.payment_id=p.id WHERE p.type='visit' AND p.ref_id=b.id AND coalesce(cs.state,'legacy')<>'closed') THEN RAISE EXCEPTION 'visit_payment_review_required';END IF;
 SELECT owner_id INTO v_owner FROM public.accommodations WHERE id=old_slot.accommodation_id AND organization_id=p_organization_id AND status='active' AND is_paid FOR UPDATE;
 IF v_owner IS NULL THEN RAISE EXCEPTION 'housing_unavailable';END IF;
 -- Share the legacy slot-materialization key, so old and new app versions
 -- cannot create two competing slots for the same house/date/time.
 PERFORM pg_advisory_xact_lock(hashtextextended(old_slot.accommodation_id::text||p_slot_date::text||p_start_time::text,0));
 SELECT * INTO target FROM public.visit_slots WHERE accommodation_id=old_slot.accommodation_id AND slot_date=p_slot_date AND start_time=p_start_time AND status='open' ORDER BY id LIMIT 1 FOR UPDATE;
 IF target.id IS NULL THEN
 SELECT x INTO v_option FROM public.get_bookable_visit_times(old_slot.accommodation_id,60) x WHERE x->>'slot_date'=p_slot_date::text AND (x->>'start_time')::time=p_start_time AND (x->>'price_cents')::int=0 LIMIT 1;
 IF v_option IS NULL THEN RAISE EXCEPTION 'visit_unavailable';END IF;
 INSERT INTO public.visit_slots(accommodation_id,owner_id,slot_date,start_time,end_time,capacity,price_cents,status,notes) VALUES(old_slot.accommodation_id,v_owner,p_slot_date,p_start_time,(v_option->>'end_time')::time,(v_option->>'available')::int,0,'open','auto: reprogramación de visita') RETURNING * INTO target;
 END IF;
 IF target.price_cents<>0 THEN RAISE EXCEPTION 'visit_payment_review_required';END IF;
 SELECT count(*) INTO v_count FROM public.visit_bookings WHERE slot_id=target.id AND status IN('pending','confirmed');
 IF v_count>=target.capacity THEN RAISE EXCEPTION 'visit_capacity_full';END IF;
 IF EXISTS(SELECT 1 FROM public.visit_bookings WHERE slot_id=target.id AND visitor_id=b.visitor_id AND status IN('pending','confirmed')) THEN RAISE EXCEPTION 'visit_duplicate';END IF;
 INSERT INTO workspace_private.visit_reschedule_permits VALUES(b.id,auth.uid(),target.id,txid_current());
 UPDATE public.visit_bookings SET slot_id=target.id,status='confirmed',updated_at=now() WHERE id=b.id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'visit.rescheduled',b.id,jsonb_build_object('previous_slot_id',old_slot.id,'new_slot_id',target.id));
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(b.visitor_id,'visit','Tu visita se ha reprogramado','Consulta la nueva fecha y hora acordadas para tu visita.',jsonb_build_object('kind','visit_rescheduled','booking_id',b.id,'accommodation_id',old_slot.accommodation_id,'starts_at',(p_slot_date+p_start_time) AT TIME ZONE 'Europe/Madrid'));
 RETURN public.workspace_visit_json(b.id,p_organization_id);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_visit_options(uuid,uuid,integer),public.reschedule_workspace_visit(uuid,uuid,date,time) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_visit_options(uuid,uuid,integer),public.reschedule_workspace_visit(uuid,uuid,date,time) TO authenticated;
DO $$ DECLARE definition text;BEGIN
 IF to_regprocedure('public.workspace_require_request()') IS NOT NULL THEN SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;IF strpos(definition,'''/rpc/current_demo_cohort''')=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing';END IF;EXECUTE replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/get_workspace_visit_options'',''/rpc/reschedule_workspace_visit''');END IF;
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_20$;

-- SOURCE 20260923050000_workspace_retention_notifications.sql
EXECUTE $franky_component_21$
-- Delayed notifications revalidate the recipient's current rights. Keeping a
-- historical participant row never grants an enduring organization permission.
CREATE FUNCTION public.workspace_chat_recipient_allowed(p_user uuid,p_payload jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conv uuid;m public.messages%ROWTYPE;org uuid;legal_owner uuid;BEGIN
 IF NOT (coalesce(p_payload,'{}') ?| ARRAY['conversation_id','message_id']) THEN RETURN true;END IF;
 IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND is_discarded IS NOT TRUE)
 OR EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM social_private.account_suspensions WHERE user_id=p_user AND restored_at IS NULL) THEN RETURN false;END IF;
 BEGIN
  conv:=nullif(p_payload->>'conversation_id','')::uuid;
  IF p_payload->>'message_id' IS NOT NULL THEN
   SELECT * INTO m FROM public.messages WHERE id=(p_payload->>'message_id')::uuid;
   IF NOT FOUND OR m.is_deleted OR conv IS NOT NULL AND conv<>m.conversation_id THEN RETURN false;END IF;
   conv:=m.conversation_id;
  END IF;
 EXCEPTION WHEN invalid_text_representation THEN RETURN false;END;
 IF conv IS NULL OR NOT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=conv AND user_id=p_user) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.event_conversations ec JOIN public.events e ON e.id=ec.event_id
  WHERE ec.conversation_id=conv AND e.organization_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.organizations o ON o.id=om.organization_id
   WHERE om.organization_id=e.organization_id AND om.user_id=p_user AND om.status='active' AND o.status='active'
   AND 'content.manage'=ANY(public.workspace_role_permissions(om.role)))
  AND NOT EXISTS(SELECT 1 FROM public.event_participants ep WHERE ep.event_id=e.id AND ep.user_id=p_user AND ep.status IN('registered','attended') AND ep.kicked_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM public.event_tickets t WHERE t.event_id=e.id AND t.holder_id=p_user AND t.status IN('valid','used'))) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.event_conversations ec JOIN public.events e ON e.id=ec.event_id WHERE ec.conversation_id=conv
  AND NOT coalesce(CASE WHEN e.organization_id IS NULL THEN e.organizer_id=p_user ELSE EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.organizations o ON o.id=om.organization_id WHERE om.organization_id=e.organization_id AND om.user_id=p_user AND om.status='active' AND o.status='active' AND 'content.manage'=ANY(public.workspace_role_permissions(om.role))) END,false)
  AND NOT workspace_private.event_audience_eligible(e.id,p_user)) THEN RETURN false;END IF;
 org:=m.publishing_organization_id;
 IF m.housing_listing_id IS NOT NULL THEN SELECT organization_id,owner_id INTO org,legal_owner FROM public.accommodations WHERE id=m.housing_listing_id;END IF;
 IF org IS NOT NULL THEN
  IF legal_owner IS NULL THEN SELECT billing_owner_id INTO legal_owner FROM public.organizations WHERE id=org AND kind='housing';END IF;
  IF legal_owner=p_user AND NOT EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.organizations o ON o.id=om.organization_id
   WHERE om.organization_id=org AND om.user_id=p_user AND om.status='active' AND o.status='active'
   AND 'content.manage'=ANY(public.workspace_role_permissions(om.role))) THEN RETURN false;END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.workspace_chat_recipient_allowed(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.workspace_my_notification_visible(p_payload jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.workspace_chat_recipient_allowed(auth.uid(),p_payload)
$$;
REVOKE ALL ON FUNCTION public.workspace_my_notification_visible(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_my_notification_visible(jsonb) TO authenticated;
CREATE POLICY workspace_notification_current_access ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated USING(public.workspace_my_notification_visible(data));

CREATE OR REPLACE FUNCTION public.on_new_message_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient uuid;sender_name text;payload jsonb;BEGIN
 SELECT coalesce(NEW.organization_label,full_name,'Alguien') INTO sender_name FROM public.profiles WHERE id=NEW.sender_id;
 payload:=jsonb_build_object('conversation_id',NEW.conversation_id,'message_id',NEW.id);
 -- A professional publication exposes the institution, not its private actor.
 IF NEW.publishing_organization_id IS NULL THEN payload:=payload||jsonb_build_object('sender_id',NEW.sender_id);
 ELSE payload:=payload||jsonb_build_object('organization_id',NEW.publishing_organization_id);END IF;
 FOR recipient IN SELECT user_id FROM public.conversation_participants WHERE conversation_id=NEW.conversation_id AND user_id<>NEW.sender_id LOOP
  IF public.workspace_chat_recipient_allowed(recipient,payload) THEN
   INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(recipient,'message',coalesce(sender_name,'Nuevo mensaje'),left(coalesce(NEW.content,''),110),payload);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.on_new_message_notify() FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.workspace_email_allowed(text[],uuid,jsonb) RENAME TO workspace_email_before_chat;
REVOKE ALL ON FUNCTION public.workspace_email_before_chat(text[],uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.workspace_email_allowed(p_to text[],p_actor uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient uuid;email text;BEGIN
 IF NOT public.workspace_email_before_chat(p_to,p_actor,p_payload) THEN RETURN false;END IF;
 IF NOT (coalesce(p_payload,'{}') ?| ARRAY['conversation_id','message_id']) THEN RETURN true;END IF;
 IF p_actor IS NOT NULL AND NOT public.workspace_chat_recipient_allowed(p_actor,p_payload) THEN RETURN false;END IF;
 FOREACH email IN ARRAY coalesce(p_to,ARRAY[]::text[]) LOOP
  SELECT id INTO recipient FROM auth.users WHERE lower(auth.users.email)=lower(email);
  IF NOT public.workspace_chat_recipient_allowed(recipient,p_payload) THEN RETURN false;END IF;
 END LOOP;
 RETURN p_actor IS NOT NULL OR cardinality(p_to)>0;
END $$;
REVOKE ALL ON FUNCTION public.workspace_email_allowed(text[],uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_email_allowed(text[],uuid,jsonb) TO service_role;

-- Operational rows are removed/redacted when the existing erasure engine purges
-- the account. Recoverability is preserved throughout its grace period.
CREATE FUNCTION public.workspace_housing_erasure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.state='purged' AND OLD.state IS DISTINCT FROM 'purged' THEN
  UPDATE public.tenancies SET status=CASE WHEN status='pending_confirmation' THEN 'rejected' ELSE 'ended' END,is_public=false,room_label=NULL,end_date=coalesce(end_date,current_date),updated_at=now() WHERE tenant_id=NEW.user_id;
  DELETE FROM public.workspace_housing_notes WHERE created_by=NEW.user_id;
  UPDATE public.workspace_housing_assignments SET agent_id=NULL,updated_at=now() WHERE agent_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_housing_erasure() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_housing_personal_erasure AFTER UPDATE OF state ON account_private.erasures FOR EACH ROW EXECUTE FUNCTION public.workspace_housing_erasure();

COMMENT ON TABLE public.workspace_rent_obligations IS 'Restricted financial record: account erasure does not cancel debts or delete reconciliation history. Retention and legal holds follow the financial retention procedure.';
COMMENT ON TABLE public.workspace_rent_receipts IS 'Immutable financial evidence. Correct by compensating entry; only authorized finance roles may access it. Separate retention from operational profiles and notes.';
COMMENT ON TABLE public.workspace_housing_notes IS 'Private operational notes, not a financial archive. Removed when their author is purged; do not store identity documents or bank details in free text.';
NOTIFY pgrst,'reload schema';
$franky_component_21$;

-- SOURCE 20260923060000_workspace_event_lifecycle.sql
EXECUTE $franky_component_22$
-- Private operational records; payments remains the sole monetary ledger.

CREATE TABLE public.workspace_event_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 140),document jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_event_series(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 request_key uuid NOT NULL,request jsonb NOT NULL,resource_ids uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,request_key)
);
CREATE TABLE public.workspace_event_cancellations(
 resource_id uuid PRIMARY KEY REFERENCES public.workspace_resources(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_event_refunds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES public.organizations(id),
 resource_id uuid REFERENCES public.workspace_resources(id) ON DELETE RESTRICT,
 payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
 ticket_id uuid REFERENCES public.event_tickets(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','processing','pending','refunded','closed_unpaid','rejected','review')),
 approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,approved_at timestamptz,
 review_reason text,attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),request_params jsonb,request_frozen_at timestamptz,
 stripe_refund_id text,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_event_refunds_due ON public.workspace_event_refunds(next_attempt_at) WHERE status IN('approved','processing','pending');
CREATE INDEX workspace_event_refunds_resource ON public.workspace_event_refunds(resource_id,id);
CREATE INDEX workspace_event_templates_org ON public.workspace_event_templates(organization_id,status,updated_at DESC);
CREATE TABLE public.workspace_event_refund_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),refund_id uuid NOT NULL REFERENCES public.workspace_event_refunds(id),actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,action text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.workspace_event_refund_audit ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.workspace_event_refund_audit FROM PUBLIC,anon,authenticated;GRANT SELECT,INSERT ON public.workspace_event_refund_audit TO service_role;
CREATE FUNCTION workspace_private.audit_event_refund() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
 INSERT INTO public.workspace_event_refund_audit(refund_id,actor_id,action,details) VALUES(NEW.id,auth.uid(),NEW.status,jsonb_build_object('reason',NEW.review_reason,'approved_by',NEW.approved_by,'provider_refund',NEW.stripe_refund_id));END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION workspace_private.audit_event_refund() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_event_refund_audit AFTER INSERT OR UPDATE ON public.workspace_event_refunds FOR EACH ROW EXECUTE FUNCTION workspace_private.audit_event_refund();
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['workspace_event_templates','workspace_event_series','workspace_event_cancellations','workspace_event_refunds'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);END LOOP;END $$;

CREATE FUNCTION workspace_private.event_template_document(p_data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(p_data) WHERE key=ANY(ARRAY['title','description','city','address','category','capacity','price_cents','images','audience','community_resource_id','audience_university_id','minimum_age'])
$$;
REVOKE ALL ON FUNCTION workspace_private.event_template_document(jsonb) FROM PUBLIC,anon,authenticated;

-- Every free registration is closed at the scheduled start, including legacy direct INSERT.
CREATE FUNCTION workspace_private.event_registration_time_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eid uuid;starts timestamptz;BEGIN
 eid:=NEW.event_id;
 IF TG_TABLE_NAME='event_participants' THEN
  IF TG_OP='INSERT' OR (NEW.status IN('registered','attended') AND OLD.status='cancelled') THEN
   SELECT start_date INTO starts FROM public.events WHERE id=eid FOR UPDATE;
   IF starts<=now() AND NOT(auth.role()='service_role' AND EXISTS(SELECT 1 FROM public.event_tickets WHERE event_id=eid AND holder_id=NEW.user_id AND status IN('valid','used'))) THEN RAISE EXCEPTION 'event_registration_closed';END IF;
  END IF;
 ELSIF TG_TABLE_NAME='event_waitlist' AND TG_OP='INSERT' THEN
  SELECT start_date INTO starts FROM public.events WHERE id=eid FOR UPDATE;
  IF starts<=now() THEN RAISE EXCEPTION 'event_registration_closed';END IF;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.event_registration_time_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aad_workspace_event_time BEFORE INSERT OR UPDATE ON public.event_participants FOR EACH ROW EXECUTE FUNCTION workspace_private.event_registration_time_guard();
CREATE TRIGGER aad_workspace_event_time BEFORE INSERT ON public.event_waitlist FOR EACH ROW EXECUTE FUNCTION workspace_private.event_registration_time_guard();
CREATE FUNCTION workspace_private.guard_cancelled_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF OLD.status='cancelled' AND NEW.status<>'cancelled' AND EXISTS(SELECT 1 FROM public.workspace_event_cancellations c JOIN public.workspace_resources r ON r.id=c.resource_id WHERE r.source_id=OLD.id) THEN RAISE EXCEPTION 'cancelled_event_cannot_reopen';END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION workspace_private.guard_cancelled_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aab_workspace_cancelled_event BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_cancelled_event();
CREATE FUNCTION workspace_private.close_refunded_attendance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.status IN('refunded','cancelled') AND OLD.status IS DISTINCT FROM NEW.status AND NOT EXISTS(SELECT 1 FROM public.event_tickets t WHERE t.event_id=NEW.event_id AND t.holder_id=NEW.holder_id AND t.id<>NEW.id AND t.status IN('valid','used')) THEN
  UPDATE public.event_participants SET status='cancelled' WHERE event_id=NEW.event_id AND user_id=NEW.holder_id AND status='registered';
 END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION workspace_private.close_refunded_attendance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_close_refunded_attendance AFTER UPDATE OF status ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION workspace_private.close_refunded_attendance();

CREATE FUNCTION workspace_private.notify_event_waitlist(p_event uuid,p_limit integer DEFAULT 10) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE;available integer;notified integer:=0;w record;BEGIN
 SELECT * INTO e FROM public.events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.status='cancelled' OR e.start_date<=now() THEN RETURN 0;END IF;
 IF coalesce(e.price,0)>0 THEN
  SELECT greatest(0,coalesce(e.max_capacity,1000000)-count(*))::int INTO available FROM public.event_tickets WHERE event_id=e.id AND (status IN('valid','used') OR(status='pending_payment' AND (reserved_until>now() OR public.ticket_has_unclosed_payment(id))));
 ELSE SELECT greatest(0,coalesce(e.max_capacity,1000000)-count(*))::int INTO available FROM public.event_participants WHERE event_id=e.id AND status IN('registered','attended') AND kicked_at IS NULL;END IF;
 -- Notifications are invitations to try, never capacity reservations. Give the first
 -- notified people a 15-minute quiet interval before offering the same free places.
 SELECT greatest(0,available-count(*))::int INTO available FROM public.event_waitlist WHERE event_id=e.id AND notified_at>now()-interval '15 minutes';
 FOR w IN SELECT * FROM public.event_waitlist WHERE event_id=e.id AND notified_at IS NULL ORDER BY created_at,user_id FOR UPDATE LOOP
  EXIT WHEN notified>=least(available,greatest(1,least(p_limit,50)));
  IF workspace_private.event_audience_eligible(e.id,w.user_id) THEN
   UPDATE public.event_waitlist SET notified_at=now() WHERE event_id=e.id AND user_id=w.user_id;
   INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(w.user_id,'waitlist','Hay una plaza disponible',left(e.title,150)||'. Consulta la actividad: la plaza se confirma al completar la inscripción.',jsonb_build_object('url','/eventos/'||e.id,'event_id',e.id));
   notified:=notified+1;
  END IF;
 END LOOP;RETURN notified;
END $$;
REVOKE ALL ON FUNCTION workspace_private.notify_event_waitlist(uuid,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.on_participant_freed_notify_waitlist() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF TG_OP='DELETE' OR (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled') THEN PERFORM workspace_private.notify_event_waitlist(OLD.event_id,1);END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.on_participant_freed_notify_waitlist() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_workspace_event_lifecycle(p_organization_id uuid,p_resource_id uuid DEFAULT NULL,p_wait_cursor timestamptz DEFAULT NULL,p_wait_user uuid DEFAULT NULL,p_refund_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;v_demo boolean;v_content boolean;v_attendees boolean;v_finance boolean;result jsonb;items jsonb;cancel jsonb;v_pending int;v_paid int;v_remaining bigint;v_count int;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');
 SELECT demo_cohort_id IS NOT NULL INTO v_demo FROM public.organizations WHERE id=p_organization_id;
 v_content:=public.has_organization_permission(p_organization_id,'content.manage');v_attendees:=public.has_organization_permission(p_organization_id,'attendees.manage');v_finance:=public.has_organization_permission(p_organization_id,'finance.read');p_limit:=greatest(1,least(coalesce(p_limit,30),100));
 result:=jsonb_build_object('event',null,'templates','[]'::jsonb,'permissions',jsonb_build_object('content',v_content,'attendees',v_attendees,'finance',public.has_organization_permission(p_organization_id,'finance.manage')),'waitlist',jsonb_build_object('items','[]'::jsonb,'next_cursor',null),'refunds',jsonb_build_object('items','[]'::jsonb,'next_cursor',null),'cancellation',null);
 IF v_content THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version,'updated_at',updated_at) ORDER BY updated_at DESC),'[]') INTO items FROM public.workspace_event_templates WHERE organization_id=p_organization_id AND status='active';result:=jsonb_set(result,'{templates}',items);END IF;
 IF p_resource_id IS NULL THEN RETURN result;END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='event';IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found';END IF;
 result:=jsonb_set(result,'{event}',jsonb_build_object('id',r.id,'title',r.title,'status',r.status,'starts_at',r.data->>'starts_at','price_cents',coalesce((r.data->>'price_cents')::int,0),'demo',v_demo));
 IF v_demo THEN
  IF v_attendees THEN result:=jsonb_set(result,'{waitlist,items}',coalesce(r.data->'demo_waitlist','[]'));END IF;
  IF v_finance THEN result:=jsonb_set(result,'{refunds,items}',coalesce(r.data->'demo_refunds','[]'));END IF;
  SELECT count(*)::int INTO v_count FROM public.workspace_demo_attendees WHERE event_resource_id=r.id;
  cancel:=jsonb_build_object('cancelled',r.status='cancelled','can_cancel',v_content OR public.has_organization_permission(p_organization_id,'finance.manage'),'requires_finance',false,'attendees',v_count,'pending_orders',0,'paid_orders',jsonb_array_length(coalesce(r.data->'demo_refunds','[]')),'remaining_cents',(SELECT coalesce(sum((x->>'amount_cents')::int-(x->>'refunded_cents')::int),0) FROM jsonb_array_elements(coalesce(r.data->'demo_refunds','[]'))x),'reason',(SELECT reason FROM public.workspace_event_cancellations WHERE resource_id=r.id));
 ELSE
  IF v_attendees THEN
   SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.created_at,x.id),'[]') INTO items FROM(SELECT w.user_id id,coalesce(p.full_name,'Participante') name,w.created_at,w.notified_at,workspace_private.event_audience_eligible(r.source_id,w.user_id) eligible FROM public.event_waitlist w JOIN public.profiles p ON p.id=w.user_id WHERE w.event_id=r.source_id AND (p_wait_cursor IS NULL OR(w.created_at,w.user_id)>(p_wait_cursor,p_wait_user)) ORDER BY w.created_at,w.user_id LIMIT p_limit)x;
   result:=jsonb_set(result,'{waitlist}',jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=p_limit THEN jsonb_build_object('created_at',items->-1->>'created_at','id',items->-1->>'id') ELSE null END));
  END IF;
  IF v_finance THEN
   SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.id),'[]') INTO items FROM(SELECT f.id,f.payment_id,f.ticket_id,coalesce(p.full_name,'Cuenta eliminada') name,m.amount_cents,m.refunded_cents,f.status,f.reason,f.review_reason,f.created_at,false demo FROM public.workspace_event_refunds f JOIN public.payments m ON m.id=f.payment_id LEFT JOIN public.profiles p ON p.id=m.buyer_id WHERE f.resource_id=r.id AND (p_refund_cursor IS NULL OR f.id>p_refund_cursor) ORDER BY f.id LIMIT p_limit)x;
   result:=jsonb_set(result,'{refunds}',jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=p_limit THEN items->-1->>'id' ELSE null END));
  END IF;
  SELECT count(*) FILTER(WHERE p.status IN('pending','processing'))::int,count(*) FILTER(WHERE p.status IN('succeeded','partially_refunded'))::int,coalesce(sum(greatest(0,p.amount_cents-p.refunded_cents)) FILTER(WHERE p.status IN('succeeded','partially_refunded')),0) INTO v_pending,v_paid,v_remaining FROM public.payments p JOIN public.event_tickets t ON t.id=p.ref_id AND p.ref_table='event_tickets' WHERE t.event_id=r.source_id;
  SELECT count(*)::int INTO v_count FROM public.event_participants WHERE event_id=r.source_id AND status IN('registered','attended');
  cancel:=jsonb_build_object('cancelled',r.status='cancelled','can_cancel',(v_content OR public.has_organization_permission(p_organization_id,'finance.manage')) AND (v_paid+v_pending=0 OR public.has_organization_permission(p_organization_id,'finance.manage')),'requires_finance',v_paid+v_pending>0,'attendees',CASE WHEN v_attendees OR v_content THEN v_count ELSE null END,'pending_orders',CASE WHEN v_finance THEN v_pending ELSE null END,'paid_orders',CASE WHEN v_finance THEN v_paid ELSE null END,'remaining_cents',CASE WHEN v_finance THEN v_remaining ELSE null END,'reason',(SELECT reason FROM public.workspace_event_cancellations WHERE resource_id=r.id));
 END IF;
 RETURN jsonb_set(result,'{cancellation}',cancel);
END $$;

CREATE FUNCTION public.workspace_event_lifecycle_action(p_organization_id uuid,p_resource_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;v_demo boolean;doc jsonb;v_template uuid;v_series public.workspace_event_series%ROWTYPE;v_key uuid;v_start timestamptz;v_end timestamptz;v_local timestamp;v_zone text;v_count int;v_weeks int;v_result jsonb;v_ids uuid[]:='{}';v_id uuid;v_reason text;f public.workspace_event_refunds%ROWTYPE;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');
 SELECT demo_cohort_id IS NOT NULL INTO v_demo FROM public.organizations WHERE id=p_organization_id;
 IF p_resource_id IS NOT NULL THEN SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='event' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found';END IF;END IF;
 IF p_action IN('save_template','archive_template','use_template','repeat') THEN
  PERFORM public.workspace_require(p_organization_id,'content.manage');
  IF p_action='archive_template' THEN UPDATE public.workspace_event_templates SET status='archived',updated_at=now() WHERE id=(p_data->>'template_id')::uuid AND organization_id=p_organization_id;RETURN '{}';END IF;
  IF p_action='save_template' THEN
   IF r.id IS NULL OR length(btrim(p_data->>'name')) NOT BETWEEN 3 AND 140 THEN RAISE EXCEPTION 'invalid_template';END IF;
   IF(SELECT count(*) FROM public.workspace_event_templates WHERE organization_id=p_organization_id AND status='active')>=50 THEN RAISE EXCEPTION 'template_limit';END IF;
   INSERT INTO public.workspace_event_templates(organization_id,name,document,created_by) VALUES(p_organization_id,btrim(p_data->>'name'),workspace_private.event_template_document(r.data)||jsonb_build_object('title',r.title),auth.uid()) RETURNING id INTO v_template;RETURN jsonb_build_object('template_id',v_template);
  END IF;
  v_key:=(p_data->>'request_key')::uuid;IF v_key IS NULL THEN RAISE EXCEPTION 'request_key_required';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||v_key::text,0));
  SELECT * INTO v_series FROM public.workspace_event_series WHERE organization_id=p_organization_id AND request_key=v_key;
  doc:=p_data||jsonb_build_object('action',p_action,'source_id',p_resource_id);
  IF FOUND THEN IF v_series.request IS DISTINCT FROM doc THEN RAISE EXCEPTION 'request_conflict';END IF;RETURN jsonb_build_object('resources',to_jsonb(v_series.resource_ids));END IF;
  INSERT INTO public.workspace_event_series(organization_id,request_key,request) VALUES(p_organization_id,v_key,doc) RETURNING * INTO v_series;
  IF p_action='use_template' THEN SELECT document INTO doc FROM public.workspace_event_templates WHERE id=(p_data->>'template_id')::uuid AND organization_id=p_organization_id AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found';END IF;ELSE IF r.id IS NULL THEN RAISE EXCEPTION 'event_not_found';END IF;doc:=workspace_private.event_template_document(r.data)||jsonb_build_object('title',r.title);END IF;
  v_start:=(p_data->>'starts_at')::timestamptz;v_end:=(p_data->>'ends_at')::timestamptz;v_count:=coalesce((p_data->>'count')::int,1);v_weeks:=coalesce((p_data->>'interval_weeks')::int,1);v_zone:=coalesce(p_data->>'timezone','Europe/Madrid');
  IF v_start IS NULL OR v_start<=now() OR v_end IS NULL OR v_end<=v_start OR v_end>v_start+interval '7 days' OR v_count NOT BETWEEN 1 AND 12 OR v_weeks NOT BETWEEN 1 AND 12 OR v_zone NOT IN('Europe/Madrid','Atlantic/Canary') THEN RAISE EXCEPTION 'invalid_event_series';END IF;
  v_local:=v_start AT TIME ZONE v_zone;
  FOR i IN 0..v_count-1 LOOP
   v_result:=public.save_workspace_resource(p_organization_id,'event',doc||jsonb_build_object('starts_at',(v_local+make_interval(weeks=>i*v_weeks)) AT TIME ZONE v_zone,'ends_at',((v_end AT TIME ZONE v_zone)+make_interval(weeks=>i*v_weeks)) AT TIME ZONE v_zone,'client_request_id',v_key::text||':'||i),NULL,false);
   v_ids:=array_append(v_ids,(v_result->>'id')::uuid);
  END LOOP;
  UPDATE public.workspace_event_series SET resource_ids=v_ids WHERE id=v_series.id;RETURN jsonb_build_object('resources',to_jsonb(v_ids));
 ELSIF p_action='notify_waitlist' THEN
  PERFORM public.workspace_require(p_organization_id,'attendees.manage');IF r.id IS NULL THEN RAISE EXCEPTION 'event_not_found';END IF;
  IF v_demo THEN
   SELECT count(*)::int INTO v_count FROM jsonb_array_elements(coalesce(r.data->'demo_waitlist','[]')) x WHERE x->>'notified_at' IS NULL;
   UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_waitlist}',(SELECT coalesce(jsonb_agg(x||jsonb_build_object('notified_at',coalesce(x->>'notified_at',now()::text))),'[]') FROM jsonb_array_elements(coalesce(r.data->'demo_waitlist','[]'))x)) WHERE id=r.id;
   RETURN jsonb_build_object('notified',v_count,'demo',true);
  END IF;
  RETURN jsonb_build_object('notified',workspace_private.notify_event_waitlist(r.source_id,10));
 ELSIF p_action='cancel' THEN
  IF r.id IS NULL THEN RAISE EXCEPTION 'event_not_found';END IF;v_reason:=btrim(p_data->>'reason');IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
  IF NOT public.has_organization_permission(p_organization_id,'content.manage') AND NOT public.has_organization_permission(p_organization_id,'finance.manage') THEN RAISE EXCEPTION 'workspace_forbidden';END IF;
  IF NOT v_demo AND r.source_id IS NOT NULL THEN
   PERFORM 1 FROM public.events WHERE id=r.source_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.payments p JOIN public.event_tickets t ON t.id=p.ref_id AND p.ref_table='event_tickets' WHERE t.event_id=r.source_id AND p.status IN('pending','processing','succeeded','partially_refunded')) THEN
    PERFORM public.workspace_require(p_organization_id,'finance.manage');IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'mfa_required';END IF;
   END IF;
   UPDATE public.events SET status='cancelled' WHERE id=r.source_id;
   INSERT INTO public.workspace_event_refunds(organization_id,resource_id,payment_id,ticket_id,reason,status,approved_by,approved_at)
   SELECT p_organization_id,r.id,p.id,t.id,v_reason,'approved',auth.uid(),now() FROM public.payments p JOIN public.event_tickets t ON t.id=p.ref_id AND p.ref_table='event_tickets' WHERE t.event_id=r.source_id AND p.status IN('pending','processing','succeeded','partially_refunded')
   ON CONFLICT(payment_id) DO UPDATE SET status=CASE WHEN workspace_event_refunds.status IN('requested','rejected','review') AND workspace_event_refunds.request_params IS NULL THEN 'approved' ELSE workspace_event_refunds.status END,approved_by=excluded.approved_by,approved_at=excluded.approved_at,next_attempt_at=now();
   UPDATE public.event_participants SET status='cancelled' WHERE event_id=r.source_id AND status='registered';
  END IF;
  INSERT INTO public.workspace_event_cancellations(resource_id,organization_id,reason,actor_id) VALUES(r.id,p_organization_id,v_reason,auth.uid()) ON CONFLICT(resource_id) DO NOTHING;
  UPDATE public.workspace_resources SET status='cancelled',updated_at=now() WHERE id=r.id;
  INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'event.cancelled',r.id,jsonb_build_object('reason',v_reason,'demo',v_demo));
  RETURN jsonb_build_object('cancelled',true,'demo',v_demo);
 ELSIF p_action IN('approve_refund','reject_refund') THEN
  PERFORM public.workspace_require(p_organization_id,'finance.manage');
  IF v_demo THEN
   v_reason:=btrim(p_data->>'reason');IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.data->'demo_refunds','[]'))x WHERE x->>'id'=p_data->>'refund_id' AND x->>'status' IN('requested','rejected','review')) THEN RAISE EXCEPTION 'refund_not_found';END IF;
   UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_refunds}',(SELECT jsonb_agg(CASE WHEN x->>'id'=p_data->>'refund_id' THEN x||jsonb_build_object('status',CASE WHEN p_action='approve_refund' THEN 'refunded' ELSE 'rejected' END,'refunded_cents',CASE WHEN p_action='approve_refund' THEN (x->>'amount_cents')::int ELSE 0 END,'review_reason','Simulación: '||v_reason) ELSE x END) FROM jsonb_array_elements(r.data->'demo_refunds')x)) WHERE id=r.id;
   RETURN jsonb_build_object('refund_id',p_data->>'refund_id','demo',true);
  END IF;
  IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'mfa_required';END IF;
  SELECT * INTO f FROM public.workspace_event_refunds WHERE id=(p_data->>'refund_id')::uuid AND organization_id=p_organization_id AND resource_id=r.id FOR UPDATE;IF NOT FOUND OR v_demo THEN RAISE EXCEPTION 'refund_not_found';END IF;
  IF f.status NOT IN('requested','rejected','review') OR f.request_params IS NOT NULL THEN RAISE EXCEPTION 'refund_already_processing';END IF;
  v_reason:=btrim(p_data->>'reason');IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
  UPDATE public.workspace_event_refunds SET status=CASE WHEN p_action='approve_refund' THEN 'approved' ELSE 'rejected' END,review_reason=v_reason,approved_by=auth.uid(),approved_at=now(),next_attempt_at=now(),updated_at=now() WHERE id=f.id;
  RETURN jsonb_build_object('refund_id',f.id);
 ELSE RAISE EXCEPTION 'invalid_action';END IF;
END $$;

CREATE FUNCTION public.request_my_event_refund(p_ticket_id uuid,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.event_tickets%ROWTYPE;p public.payments%ROWTYPE;r public.workspace_resources%ROWTYPE;v_id uuid;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'refund_forbidden' USING ERRCODE='42501';END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
 SELECT * INTO t FROM public.event_tickets WHERE id=p_ticket_id AND original_buyer_id=auth.uid();IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_owned';END IF;
 SELECT * INTO p FROM public.payments WHERE ref_table='event_tickets' AND ref_id=t.id AND buyer_id=auth.uid() AND status IN('pending','processing','succeeded','partially_refunded','refunded') ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ticket_payment_not_found';END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE type='event' AND source_id=t.event_id LIMIT 1;
 INSERT INTO public.workspace_event_refunds(organization_id,resource_id,payment_id,ticket_id,reason) VALUES(r.organization_id,r.id,p.id,t.id,btrim(p_reason)) ON CONFLICT(payment_id) DO NOTHING RETURNING id INTO v_id;
 RETURN coalesce(v_id,(SELECT id FROM public.workspace_event_refunds WHERE payment_id=p.id));
END $$;
CREATE FUNCTION public.get_my_event_refund_requests() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'ticket_id',f.ticket_id,'status',f.status,'reason',f.reason,'review_reason',f.review_reason,'amount_cents',p.amount_cents,'refunded_cents',p.refunded_cents,'created_at',f.created_at) ORDER BY f.created_at DESC),'[]') FROM public.workspace_event_refunds f JOIN public.payments p ON p.id=f.payment_id WHERE p.buyer_id=auth.uid() AND public.account_session_usable() AND public.current_demo_cohort() IS NULL
$$;

-- Only the trusted worker can freeze provider parameters, lease work or reconcile.
CREATE FUNCTION workspace_private.refund_authorized(p_actor uuid,p_org uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles u WHERE u.id=p_actor AND u.is_discarded IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u.id AND(a.deleted_at IS NOT NULL OR a.banned_until>now())) AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=u.id)
 AND(u.role='admin' OR EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id WHERE m.organization_id=p_org AND m.user_id=u.id AND m.status='active' AND o.status='active' AND o.demo_cohort_id IS NULL AND 'finance.manage'=ANY(public.workspace_role_permissions(m.role)))))
$$;
REVOKE ALL ON FUNCTION workspace_private.refund_authorized(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.claim_workspace_event_refund(p_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.workspace_event_refunds%ROWTYPE;p public.payments%ROWTYPE;BEGIN
 SELECT * INTO f FROM public.workspace_event_refunds WHERE (p_id IS NULL OR id=p_id) AND status IN('approved','processing','pending') AND next_attempt_at<=now() AND coalesce(lease_until,'-infinity')<now() ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN null;END IF;
 IF NOT workspace_private.refund_authorized(f.approved_by,f.organization_id) THEN
  UPDATE public.workspace_event_refunds SET status='review',review_reason='La autorización financiera ya no está vigente.',updated_at=now() WHERE id=f.id;RETURN null;
 END IF;
 SELECT * INTO p FROM public.payments WHERE id=f.payment_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id IN(p.buyer_id,p.seller_id)) THEN RAISE EXCEPTION 'demo_payment_forbidden';END IF;
 UPDATE public.workspace_event_refunds SET lease_until=now()+interval '5 minutes',status='processing',updated_at=now() WHERE id=f.id RETURNING * INTO f;
 RETURN jsonb_build_object('refund',to_jsonb(f),'payment',to_jsonb(p));
END $$;
CREATE FUNCTION public.freeze_workspace_event_refund(p_id uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.workspace_event_refunds%ROWTYPE;p public.payments%ROWTYPE;BEGIN
 SELECT * INTO f FROM public.workspace_event_refunds WHERE id=p_id FOR UPDATE;IF NOT FOUND OR f.status<>'processing' OR f.lease_until<=now() THEN RAISE EXCEPTION 'refund_not_claimed';END IF;
 IF NOT workspace_private.refund_authorized(f.approved_by,f.organization_id) THEN RAISE EXCEPTION 'refund_authority_revoked';END IF;
 IF f.request_params IS NOT NULL THEN RETURN to_jsonb(f);END IF;
 SELECT * INTO p FROM public.payments WHERE id=f.payment_id FOR UPDATE;
 IF p.status NOT IN('succeeded','partially_refunded') OR p_request->>'charge' IS NULL OR (p_request->>'amount')::int<>p.amount_cents-p.refunded_cents OR (p_request->>'amount')::int<=0 THEN RAISE EXCEPTION 'refund_amount_changed';END IF;
 UPDATE public.workspace_event_refunds SET request_params=p_request,request_frozen_at=now() WHERE id=f.id RETURNING * INTO f;RETURN to_jsonb(f);
END $$;
CREATE FUNCTION public.admin_event_refunds(p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE items jsonb;BEGIN
 PERFORM public.workspace_admin_required();
 SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.id),'[]') INTO items FROM(SELECT f.id,f.payment_id,f.resource_id,f.organization_id,o.name organization_name,f.status,f.reason,f.review_reason,f.created_at,p.amount_cents,p.refunded_cents,coalesce(u.full_name,'Cuenta eliminada') name FROM public.workspace_event_refunds f JOIN public.payments p ON p.id=f.payment_id LEFT JOIN public.organizations o ON o.id=f.organization_id LEFT JOIN public.profiles u ON u.id=p.buyer_id WHERE p_cursor IS NULL OR f.id>p_cursor ORDER BY f.id LIMIT 100)x;
 RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=100 THEN items->-1->>'id' ELSE null END);
END $$;
CREATE FUNCTION public.admin_event_refund_action(p_id uuid,p_action text,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE f public.workspace_event_refunds%ROWTYPE;BEGIN
 PERFORM public.workspace_admin_required();IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
 SELECT * INTO f FROM public.workspace_event_refunds WHERE id=p_id FOR UPDATE;IF NOT FOUND OR f.status NOT IN('requested','rejected','review') OR p_action NOT IN('approve','reject') THEN RAISE EXCEPTION 'refund_review_unavailable';END IF;
 IF f.request_params IS NOT NULL AND p_action='reject' THEN RAISE EXCEPTION 'refund_in_flight';END IF;
 UPDATE public.workspace_event_refunds SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,approved_by=auth.uid(),approved_at=now(),review_reason=btrim(p_reason),next_attempt_at=now(),updated_at=now() WHERE id=f.id;
END $$;
CREATE FUNCTION public.finish_workspace_event_refund(p_id uuid,p_status text,p_provider_refund text DEFAULT NULL,p_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.workspace_event_refunds%ROWTYPE;p public.payments%ROWTYPE;BEGIN
 SELECT * INTO f FROM public.workspace_event_refunds WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found';END IF;
 SELECT * INTO p FROM public.payments WHERE id=f.payment_id;
 IF p_status='refunded' AND p.status<>'refunded' THEN RAISE EXCEPTION 'refund_not_reconciled';END IF;
 IF p_status='closed_unpaid' AND p.status NOT IN('canceled','failed') THEN RAISE EXCEPTION 'checkout_not_closed';END IF;
 IF p_status NOT IN('pending','review','refunded','closed_unpaid') THEN RAISE EXCEPTION 'invalid_refund_status';END IF;
 UPDATE public.workspace_event_refunds SET status=p_status,stripe_refund_id=coalesce(p_provider_refund,stripe_refund_id),review_reason=left(p_note,1000),lease_until=null,next_attempt_at=now()+interval '15 minutes',updated_at=now() WHERE id=f.id;
END $$;
CREATE FUNCTION public.close_zero_workspace_refund(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE f public.workspace_event_refunds%ROWTYPE;p public.payments%ROWTYPE;BEGIN
 SELECT * INTO f FROM public.workspace_event_refunds WHERE id=p_id FOR UPDATE;IF NOT FOUND OR f.status<>'processing' OR f.lease_until<=now() OR NOT workspace_private.refund_authorized(f.approved_by,f.organization_id) THEN RAISE EXCEPTION 'refund_not_claimed';END IF;
 SELECT * INTO p FROM public.payments WHERE id=f.payment_id FOR UPDATE;
 IF p.amount_cents<>0 OR p.application_fee_cents<>0 OR p.stripe_payment_intent_id IS NOT NULL OR p.stripe_charge_id IS NOT NULL THEN RAISE EXCEPTION 'zero_payment_required';END IF;
 UPDATE public.payments SET status='canceled' WHERE id=p.id;
 INSERT INTO public.payment_checkout_state(payment_id,state) VALUES(p.id,'closed') ON CONFLICT(payment_id) DO UPDATE SET state='closed',updated_at=now();
 IF p.type='ticket' THEN UPDATE public.event_tickets SET status='refunded' WHERE id=p.ref_id AND status IN('pending_payment','valid');END IF;
END $$;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure sig,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_workspace_event_lifecycle','workspace_event_lifecycle_action','request_my_event_refund','get_my_event_refund_requests','claim_workspace_event_refund','freeze_workspace_event_refund','finish_workspace_event_refund','close_zero_workspace_refund','admin_event_refunds','admin_event_refund_action') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.sig,CASE WHEN f.proname IN('claim_workspace_event_refund','freeze_workspace_event_refund','finish_workspace_event_refund','close_zero_workspace_refund') THEN 'service_role' ELSE 'authenticated' END);END LOOP;
END $$;
DO $$DECLARE d text;a text:='''/rpc/current_demo_cohort''';BEGIN SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;IF strpos(d,a)=0 THEN RAISE EXCEPTION 'demo_request_gate_changed';END IF;EXECUTE replace(d,a,'''/rpc/get_workspace_event_lifecycle'',''/rpc/workspace_event_lifecycle_action'','||a);END $$;
CREATE FUNCTION workspace_private.seed_demo_operations(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.workspace_demo_scenarios%ROWTYPE;r record;tenant uuid;contract uuid;obligation uuid;v_amount int;doc jsonb;BEGIN
 SELECT * INTO s FROM public.workspace_demo_scenarios WHERE user_id=p_user;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.organizations o JOIN public.workspace_demo_accounts d ON d.cohort_id=o.demo_cohort_id WHERE o.id=s.organization_id AND d.user_id=p_user) THEN RAISE EXCEPTION 'demo_scope_required';END IF;
 FOR r IN SELECT * FROM public.workspace_resources WHERE organization_id=s.organization_id AND type='housing' LOOP
  tenant:=md5(r.id::text||'tenant')::uuid;contract:=gen_random_uuid();v_amount:=coalesce((r.data->>'price_monthly')::int,700)*100;
  doc:=jsonb_build_object('id',contract,'title','Contrato de alquiler · simulación','status','signed','updated_at',now(),'demo',true,'legal_owner_id',p_user,'rent_cents',v_amount,'deposit_cents',v_amount,'answers',jsonb_build_object('landlord_name','Propietario ficticio','landlord_nif','FICTICIO','tenant_name','Alex · persona ficticia','tenant_nif','FICTICIO','property_address','Calle de Demostración, 12','start_date',current_date,'duration_years',1,'rent_monthly_eur',v_amount/100,'deposit_months',1),'eligible_tenants',jsonb_build_array(jsonb_build_object('id',tenant,'name','Alex · persona ficticia')),'signers',jsonb_build_array(jsonb_build_object('user_id',p_user,'name','Propietario ficticio','role','owner','status','signed','signed_at',now()),jsonb_build_object('user_id',tenant,'name','Alex · persona ficticia','role','tenant','status','signed','signed_at',now())));
  UPDATE public.workspace_resources SET data=data||jsonb_build_object('demo_contracts',jsonb_build_array(doc),'demo_tenancies',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'tenant_id',tenant,'name','Alex · persona ficticia','status','active','is_public',false,'room_label','Habitación A','start_date',current_date,'end_date',null))) WHERE id=r.id;
  INSERT INTO public.workspace_rent_obligations(organization_id,resource_id,contract_id,tenant_id,period,due_date,amount_cents,created_by,client_request_id) VALUES(s.organization_id,r.id,contract,tenant,to_char(current_date,'YYYY-MM'),current_date+5,v_amount,p_user,'demo-seed:'||r.id) RETURNING id INTO obligation;
  INSERT INTO public.workspace_rent_receipts(organization_id,obligation_id,amount_cents,method,reference,created_by,client_request_id) VALUES(s.organization_id,obligation,v_amount/2,'transfer','Transferencia ficticia: no se ha movido dinero',p_user,'demo-seed:'||obligation);
 END LOOP;
 UPDATE public.workspace_resources SET data=data||jsonb_build_object('price_cents',1200,'payment_status','paid') WHERE id=(SELECT id FROM public.workspace_resources WHERE organization_id=s.organization_id AND type='visit' AND status='confirmed' LIMIT 1);
 FOR r IN SELECT * FROM public.workspace_resources WHERE organization_id=s.organization_id AND type='event' LOOP
  UPDATE public.workspace_resources SET data=data||jsonb_build_object('demo_waitlist',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Luz · persona ficticia','created_at',now(),'notified_at',null,'eligible',true)),'demo_refunds',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'payment_id',null,'ticket_id',null,'name','Mar · persona ficticia','amount_cents',1200,'refunded_cents',0,'status','requested','reason','Solicitud ficticia para practicar la revisión','review_reason',null,'created_at',now(),'demo',true))) WHERE id=r.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION workspace_private.seed_demo_operations(uuid) FROM PUBLIC,anon,authenticated;
DO $$DECLARE d text;a text:='DELETE FROM public.workspace_resources WHERE organization_id=s.organization_id;';b text:='UPDATE public.workspace_demo_scenarios SET generation=v_generation';BEGIN
 SELECT pg_get_functiondef('workspace_private.reset_demo(uuid)'::regprocedure) INTO d;IF strpos(d,a)=0 OR strpos(d,b)=0 THEN RAISE EXCEPTION 'demo_reset_contract_changed';END IF;
 d:=replace(d,a,'DELETE FROM public.workspace_event_templates WHERE organization_id=s.organization_id; DELETE FROM public.workspace_event_series WHERE organization_id=s.organization_id; '||a);
 EXECUTE replace(d,b,'PERFORM workspace_private.seed_demo_operations(p_user); '||b);
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_22$;

-- SOURCE 20260923070000_workspace_moderation_completion.sql
EXECUTE $franky_component_23$
-- Institutional decisions are scoped, reversible, independently appealable and
-- never expose the identity behind an anonymous post to the institution.

ALTER TABLE public.workspace_moderation_actions DROP CONSTRAINT workspace_moderation_actions_action_check;
ALTER TABLE public.workspace_moderation_actions ADD CONSTRAINT workspace_moderation_actions_action_check CHECK(action IN('hide','remove','restore','resolve','sanction','lift_sanction'));
ALTER TABLE public.workspace_moderation_actions ADD COLUMN sanction_id uuid REFERENCES public.workspace_campus_sanctions(id);
ALTER TABLE public.workspace_moderation_actions ADD COLUMN client_request_id text;
ALTER TABLE public.workspace_moderation_actions ADD COLUMN request_payload jsonb;
CREATE UNIQUE INDEX workspace_moderation_request_idx ON public.workspace_moderation_actions(organization_id,client_request_id) WHERE client_request_id IS NOT NULL;
UPDATE public.workspace_moderation_actions a SET sanction_id=(SELECT s.id FROM public.workspace_campus_sanctions s WHERE s.organization_id=a.organization_id AND s.campus_id=a.campus_id AND s.created_at=a.created_at AND s.user_id=CASE WHEN a.target_type='thread' THEN (SELECT author_id FROM public.fomo_threads WHERE id=a.target_id) ELSE (SELECT author_id FROM public.fomo_replies WHERE id=a.target_id) END ORDER BY s.id LIMIT 1) WHERE a.action='sanction';
ALTER TABLE public.workspace_institutional_hides ADD COLUMN target_type text;
ALTER TABLE public.workspace_institutional_hides ADD COLUMN mode text NOT NULL DEFAULT 'hide' CHECK(mode IN('hide','remove'));
ALTER TABLE public.workspace_institutional_hides ADD COLUMN decision_id uuid REFERENCES public.workspace_moderation_actions(id);
UPDATE public.workspace_institutional_hides h SET (target_type,decision_id)=(SELECT a.target_type,a.id FROM public.workspace_moderation_actions a WHERE a.organization_id=h.organization_id AND a.target_id=h.target_id AND a.action='hide' ORDER BY a.created_at DESC,a.id DESC LIMIT 1);

CREATE TABLE public.workspace_demo_moderation_actions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),resource_id uuid NOT NULL REFERENCES public.workspace_resources(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN('hide','remove','restore','resolve','sanction','lift_sanction')),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),
 expires_at timestamptz,revoked_at timestamptz,client_request_id text,request_payload jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_request_id)
);
ALTER TABLE public.workspace_demo_moderation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_demo_moderation_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_demo_moderation_actions TO service_role;

-- Every explicit global visibility write invalidates institutional ownership,
-- even when it writes the same value. Institutional functions add a fresh
-- marker only after their own guarded update has completed.
CREATE FUNCTION workspace_private.invalidate_moderation_marker() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 DELETE FROM public.workspace_institutional_hides WHERE target_id=NEW.id AND (target_type=CASE TG_TABLE_NAME WHEN 'fomo_threads' THEN 'thread' ELSE 'reply' END OR target_type IS NULL);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.invalidate_moderation_marker() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_moderation_visibility BEFORE UPDATE OF is_hidden,is_deleted ON public.fomo_threads FOR EACH ROW EXECUTE FUNCTION workspace_private.invalidate_moderation_marker();
CREATE TRIGGER workspace_moderation_visibility BEFORE UPDATE OF is_hidden,is_deleted ON public.fomo_replies FOR EACH ROW EXECUTE FUNCTION workspace_private.invalidate_moderation_marker();

CREATE FUNCTION workspace_private.moderation_target(p_org uuid,p_report uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE report public.fomo_reports;o public.organizations;campus uuid;author uuid;hidden boolean;deleted boolean;BEGIN
 PERFORM public.workspace_require(p_org,'moderation.manage');SELECT * INTO o FROM public.organizations WHERE id=p_org;
 IF o.kind<>'university' OR o.verification_status<>'verified' OR o.demo_cohort_id IS NOT NULL THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO report FROM public.fomo_reports WHERE id=p_report;
 IF report.id IS NULL THEN RAISE EXCEPTION 'report_not_found';END IF;
 IF report.target_type='thread' THEN SELECT t.university_id,t.author_id,t.is_hidden,t.is_deleted INTO campus,author,hidden,deleted FROM public.fomo_threads t WHERE t.id=report.target_id;
 ELSE SELECT t.university_id,r.author_id,r.is_hidden,r.is_deleted INTO campus,author,hidden,deleted FROM public.fomo_replies r JOIN public.fomo_threads t ON t.id=r.thread_id WHERE r.id=report.target_id;END IF;
 IF campus IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_campuses WHERE organization_id=p_org AND university_id=campus) THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('target_type',report.target_type,'target_id',report.target_id,'campus_id',campus,'author_id',author,'hidden',hidden,'deleted',deleted);
END $$;
REVOKE ALL ON FUNCTION workspace_private.moderation_target(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION workspace_private.moderation_decide(p_org uuid,p_report uuid,p_action text,p_reason text,p_days integer,p_decision uuid,p_request text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
<<decision>>
DECLARE o public.organizations;r public.workspace_resources;target jsonb;payload jsonb;previous public.workspace_moderation_actions;demo_previous public.workspace_demo_moderation_actions;marker public.workspace_institutional_hides;
 action_id uuid:=gen_random_uuid();sanction uuid;author uuid;campus uuid;target_id uuid;kind text;request_key text:=nullif(btrim(p_request),'');expiry timestamptz;
BEGIN
 PERFORM public.workspace_require(p_org,'moderation.manage');SELECT * INTO o FROM public.organizations WHERE id=p_org;
 IF o.kind<>'university' OR o.verification_status<>'verified' THEN RAISE EXCEPTION 'campus_forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('hide','remove','restore','resolve','sanction','lift_sanction') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'moderation_reason_required';END IF;
 IF p_action='sanction' AND p_days IS NOT NULL AND p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'invalid_sanction_duration';END IF;
 IF length(request_key)>100 THEN RAISE EXCEPTION 'invalid_request_id';END IF;
 payload:=jsonb_build_object('report_id',p_report,'action',p_action,'reason',btrim(p_reason),'duration_days',CASE WHEN p_action='sanction' THEN p_days ELSE NULL END,'decision_id',p_decision);
 -- Common lock order with Franky's publication-review workers.
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 IF o.demo_cohort_id IS NOT NULL THEN
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_report AND organization_id=p_org AND type='moderation' FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'report_not_found';END IF;
 SELECT * INTO demo_previous FROM public.workspace_demo_moderation_actions WHERE organization_id=p_org AND client_request_id=request_key;
 IF FOUND THEN IF demo_previous.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'request_key_conflict';END IF;RETURN public.workspace_resource_json(r);END IF;
 IF p_action='restore' AND coalesce(r.data->>'moderation_state','visible') NOT IN('hidden','removed') THEN RAISE EXCEPTION 'global_review_required';END IF;
 IF p_action='sanction' AND EXISTS(SELECT 1 FROM public.workspace_demo_moderation_actions WHERE resource_id=r.id AND action='sanction' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'campus_sanction_already_active';END IF;
 IF p_action='lift_sanction' THEN UPDATE public.workspace_demo_moderation_actions SET revoked_at=now() WHERE id=p_decision AND resource_id=r.id AND organization_id=p_org AND action='sanction' AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'sanction_not_found';END IF;END IF;
 INSERT INTO public.workspace_demo_moderation_actions(id,organization_id,resource_id,action,reason,expires_at,client_request_id,request_payload)
 VALUES(action_id,p_org,r.id,p_action,btrim(p_reason),CASE WHEN p_action='sanction' AND p_days IS NOT NULL THEN now()+make_interval(days=>p_days) ELSE NULL END,request_key,payload);
 UPDATE public.workspace_resources SET status='resolved',updated_at=now(),data=data||jsonb_build_object('last_action',p_action,'reason',btrim(p_reason),'moderation_state',CASE p_action WHEN 'hide' THEN 'hidden' WHEN 'remove' THEN 'removed' WHEN 'restore' THEN 'visible' ELSE coalesce(data->>'moderation_state','visible') END) WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_org,auth.uid(),'moderation.demo_'||p_action,r.id,jsonb_build_object('decision_id',action_id));
 RETURN public.workspace_resource_json(r);
 END IF;
 PERFORM 1 FROM public.fomo_reports WHERE id=p_report FOR UPDATE;
 target:=workspace_private.moderation_target(p_org,p_report);kind:=target->>'target_type';target_id:=(target->>'target_id')::uuid;author:=(target->>'author_id')::uuid;campus:=(target->>'campus_id')::uuid;
 IF kind='thread' THEN PERFORM 1 FROM public.fomo_threads WHERE id=target_id FOR UPDATE;ELSE PERFORM 1 FROM public.fomo_replies WHERE id=target_id FOR UPDATE;END IF;
 PERFORM 1 FROM public.organization_campuses WHERE organization_id=p_org AND university_id=campus FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'campus_forbidden';END IF;
 IF author=auth.uid() THEN RAISE EXCEPTION 'self_moderation_forbidden';END IF;
 SELECT * INTO previous FROM public.workspace_moderation_actions WHERE organization_id=p_org AND client_request_id=request_key;
 IF FOUND THEN IF previous.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'request_key_conflict';END IF;RETURN public.get_workspace_moderation(p_org,NULL,1,p_report)->'items'->0;END IF;
 SELECT * INTO marker FROM public.workspace_institutional_hides h WHERE h.target_id=decision.target_id AND h.target_type=kind AND h.organization_id=p_org;
 IF p_action='restore' AND (marker.target_id IS NULL OR EXISTS(SELECT 1 FROM social_private.publication_reviews pr WHERE pr.target_kind='fomo_'||kind AND pr.target_id=decision.target_id AND pr.status<>'approved')) THEN RAISE EXCEPTION 'global_review_required';END IF;
 IF p_action='remove' AND marker.target_id IS NULL AND ((target->>'hidden')::boolean OR (target->>'deleted')::boolean) THEN RAISE EXCEPTION 'global_review_required';END IF;
 IF p_action='sanction' THEN
 IF author IS NULL THEN RAISE EXCEPTION 'sanction_subject_unavailable';END IF;
 IF EXISTS(SELECT 1 FROM public.workspace_campus_sanctions WHERE organization_id=p_org AND campus_id=campus AND user_id=author AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'campus_sanction_already_active';END IF;
 INSERT INTO public.workspace_campus_sanctions(organization_id,campus_id,user_id,reason,expires_at,imposed_by) VALUES(p_org,campus,author,btrim(p_reason),CASE WHEN p_days IS NULL THEN NULL ELSE now()+make_interval(days=>p_days) END,auth.uid()) RETURNING id INTO sanction;
 ELSIF p_action='lift_sanction' THEN
 SELECT a.sanction_id INTO sanction FROM public.workspace_moderation_actions a JOIN public.workspace_campus_sanctions s ON s.id=a.sanction_id WHERE a.id=p_decision AND a.organization_id=p_org AND a.target_id=decision.target_id AND a.target_type=kind AND a.action='sanction' AND s.revoked_at IS NULL;
 IF sanction IS NULL THEN RAISE EXCEPTION 'sanction_not_found';END IF;
 UPDATE public.workspace_campus_sanctions SET revoked_at=now() WHERE id=sanction;
 END IF;
 INSERT INTO public.workspace_moderation_actions(id,organization_id,campus_id,target_type,target_id,actor_id,action,reason,sanction_id,client_request_id,request_payload)
 VALUES(action_id,p_org,campus,kind,target_id,auth.uid(),p_action,btrim(p_reason),sanction,request_key,payload);
 IF p_action IN('hide','remove','restore') THEN
 IF kind='thread' THEN UPDATE public.fomo_threads SET is_hidden=p_action<>'restore',is_deleted=CASE WHEN p_action='remove' THEN true WHEN p_action='restore' THEN false ELSE is_deleted END WHERE id=target_id;
 ELSE UPDATE public.fomo_replies SET is_hidden=p_action<>'restore',is_deleted=CASE WHEN p_action='remove' THEN true WHEN p_action='restore' THEN false ELSE is_deleted END WHERE id=target_id;END IF;
 IF p_action IN('hide','remove') AND (marker.target_id IS NOT NULL OR NOT (target->>'hidden')::boolean AND NOT (target->>'deleted')::boolean) THEN
 INSERT INTO public.workspace_institutional_hides(target_id,organization_id,target_type,mode,decision_id) VALUES(target_id,p_org,kind,CASE WHEN p_action='remove' OR marker.mode='remove' THEN 'remove' ELSE 'hide' END,action_id)
 ON CONFLICT ON CONSTRAINT workspace_institutional_hides_pkey DO UPDATE SET organization_id=excluded.organization_id,target_type=excluded.target_type,mode=excluded.mode,decision_id=excluded.decision_id;
 END IF;END IF;
 UPDATE public.fomo_reports SET status='reviewed' WHERE id=p_report;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_org,auth.uid(),'moderation.'||p_action,action_id,jsonb_build_object('reason',btrim(p_reason)));
 IF author IS NOT NULL THEN INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(author,'system','Revisión de una publicación',btrim(p_reason),jsonb_build_object('kind','campus_moderation','action_id',action_id,'url','/apelaciones'));END IF;
 RETURN public.get_workspace_moderation(p_org,NULL,1,p_report)->'items'->0;
END $$;
REVOKE ALL ON FUNCTION workspace_private.moderation_decide(uuid,uuid,text,text,integer,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.workspace_moderate(p_organization_id uuid,p_report_id uuid,p_action text,p_reason text,p_duration_days integer DEFAULT 7) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT workspace_private.moderation_decide(p_organization_id,p_report_id,p_action,p_reason,p_duration_days,NULL,NULL) $$;
ALTER FUNCTION public.workspace_resource_action(uuid,text,uuid,text,jsonb) RENAME TO workspace_action_before_full_moderation;
REVOKE ALL ON FUNCTION public.workspace_action_before_full_moderation(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_resource_action(p_organization_id uuid,p_resource_type text,p_resource_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF p_resource_type='moderation' AND p_action<>'reply' THEN RETURN workspace_private.moderation_decide(p_organization_id,p_resource_id,p_action,p_data->>'reason',CASE WHEN p_data ? 'duration_days' THEN (p_data->>'duration_days')::integer ELSE 7 END,nullif(p_data->>'decision_id','')::uuid,p_data->>'client_request_id');END IF;
 RETURN public.workspace_action_before_full_moderation(p_organization_id,p_resource_type,p_resource_id,p_action,p_data);
END $$;
REVOKE ALL ON FUNCTION public.workspace_resource_action(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_resource_action(uuid,text,uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.get_workspace_moderation_history(p_organization_id uuid,p_report_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.organizations;r public.workspace_resources;target jsonb;items jsonb;lim int:=greatest(1,least(coalesce(p_limit,30),50));can_restore boolean:=false;state text;BEGIN
 PERFORM public.workspace_require(p_organization_id,'moderation.manage');SELECT * INTO o FROM public.organizations WHERE id=p_organization_id;
 IF o.demo_cohort_id IS NOT NULL THEN
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_report_id AND organization_id=o.id AND type='moderation';IF r.id IS NULL THEN RAISE EXCEPTION 'report_not_found';END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO items FROM(SELECT id,action,reason,created_at,expires_at sanction_expires_at,CASE WHEN action<>'sanction' THEN NULL WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN expires_at<=now() THEN 'expired' ELSE 'active' END sanction_status,NULL::text appeal_status FROM public.workspace_demo_moderation_actions d WHERE d.resource_id=r.id AND d.organization_id=o.id AND (p_cursor IS NULL OR (d.created_at,d.id)<(SELECT c.created_at,c.id FROM public.workspace_demo_moderation_actions c WHERE c.id=p_cursor AND c.resource_id=r.id AND c.organization_id=o.id)) ORDER BY d.created_at DESC,d.id DESC LIMIT lim)x;
 state:=coalesce(r.data->>'moderation_state','visible');can_restore:=state IN('hidden','removed');
 ELSE
 target:=workspace_private.moderation_target(o.id,p_report_id);
 SELECT coalesce(jsonb_agg(x),'[]') INTO items FROM(SELECT a.id,a.action,a.reason,a.created_at,s.expires_at sanction_expires_at,CASE WHEN a.action<>'sanction' THEN NULL WHEN s.revoked_at IS NOT NULL THEN 'revoked' WHEN s.expires_at<=now() THEN 'expired' ELSE 'active' END sanction_status,ap.status appeal_status
 FROM public.workspace_moderation_actions a LEFT JOIN public.workspace_campus_sanctions s ON s.id=a.sanction_id LEFT JOIN public.workspace_moderation_appeals ap ON ap.action_id=a.id
 WHERE a.organization_id=o.id AND a.target_id=(target->>'target_id')::uuid AND a.target_type=target->>'target_type' AND (p_cursor IS NULL OR (a.created_at,a.id)<(SELECT c.created_at,c.id FROM public.workspace_moderation_actions c WHERE c.id=p_cursor AND c.organization_id=o.id AND c.target_id=a.target_id AND c.target_type=a.target_type)) ORDER BY a.created_at DESC,a.id DESC LIMIT lim)x;
 state:=CASE WHEN (target->>'deleted')::boolean THEN 'removed' WHEN (target->>'hidden')::boolean THEN 'hidden' ELSE 'visible' END;
 can_restore:=EXISTS(SELECT 1 FROM public.workspace_institutional_hides WHERE organization_id=o.id AND target_id=(target->>'target_id')::uuid AND target_type=target->>'target_type') AND NOT EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_kind='fomo_'||(target->>'target_type') AND target_id=(target->>'target_id')::uuid AND status<>'approved');
 END IF;
 RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=lim THEN items->(lim-1)->>'id' ELSE NULL END,'can_restore',can_restore,'target_state',state);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_moderation_history(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_moderation_history(uuid,uuid,uuid,integer) TO authenticated;

-- Appeals use exact decision ownership, not the first fifty items in the UI.
CREATE OR REPLACE FUNCTION public.appeal_workspace_moderation(p_action_id uuid,p_body text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a public.workspace_moderation_actions;result uuid;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.workspace_moderation_actions WHERE id=p_action_id;
 IF a.id IS NULL OR a.action NOT IN('hide','remove','sanction') OR NOT ((a.target_type='thread' AND EXISTS(SELECT 1 FROM public.fomo_threads WHERE id=a.target_id AND author_id=auth.uid())) OR (a.target_type='reply' AND EXISTS(SELECT 1 FROM public.fomo_replies WHERE id=a.target_id AND author_id=auth.uid()))) THEN RAISE EXCEPTION 'action_not_found' USING ERRCODE='42501';END IF;
 INSERT INTO public.workspace_moderation_appeals(action_id,user_id,body) VALUES(a.id,auth.uid(),btrim(p_body)) ON CONFLICT(action_id,user_id) DO UPDATE SET body=workspace_moderation_appeals.body RETURNING id INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.admin_resolve_workspace_appeal(p_appeal_id uuid,p_overturn boolean,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.workspace_moderation_actions;p public.workspace_moderation_appeals;restored boolean:=false;resolution_text text;BEGIN
 PERFORM public.workspace_admin_required();IF p_overturn IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 SELECT * INTO p FROM public.workspace_moderation_appeals WHERE id=p_appeal_id FOR UPDATE;IF p.id IS NULL THEN RAISE EXCEPTION 'appeal_not_found';END IF;
 SELECT * INTO a FROM public.workspace_moderation_actions WHERE id=p.action_id;
 IF a.actor_id=auth.uid() THEN RAISE EXCEPTION 'independent_reviewer_required';END IF;
 IF p.status<>'pending' THEN RETURN false;END IF;
 IF p_overturn AND a.action='sanction' THEN IF a.sanction_id IS NULL THEN RAISE EXCEPTION 'global_review_required';END IF;UPDATE public.workspace_campus_sanctions SET revoked_at=now() WHERE id=a.sanction_id AND revoked_at IS NULL;END IF;
 IF p_overturn AND a.action IN('hide','remove') THEN
 -- An appeal cannot erase a later independent Franky/global decision.
 IF EXISTS(SELECT 1 FROM public.workspace_institutional_hides WHERE target_id=a.target_id AND target_type=a.target_type AND decision_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_id=a.target_id AND target_kind='fomo_'||a.target_type AND status<>'approved') THEN
 IF a.target_type='thread' THEN UPDATE public.fomo_threads SET is_hidden=false,is_deleted=false WHERE id=a.target_id;ELSE UPDATE public.fomo_replies SET is_hidden=false,is_deleted=false WHERE id=a.target_id;END IF;
 restored:=true;END IF;
 END IF;
 resolution_text:=btrim(p_reason)||CASE WHEN p_overturn AND a.action IN('hide','remove') AND NOT restored THEN E'\nLa decisión institucional queda revocada. El estado actual de la publicación se conserva porque una revisión posterior o independiente requiere su propia resolución.' ELSE '' END;
 UPDATE public.workspace_moderation_appeals SET status=CASE WHEN p_overturn THEN 'overturned' ELSE 'upheld' END,resolution=resolution_text,resolved_by=auth.uid(),resolved_at=now() WHERE id=p.id;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(a.organization_id,auth.uid(),'moderation.appeal_resolved',p.id,jsonb_build_object('overturned',p_overturn,'restoration_applied',restored,'reason',btrim(p_reason)));
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(p.user_id,'system','Tu apelación ha sido revisada',resolution_text,jsonb_build_object('kind','campus_moderation','action_id',a.id,'url','/apelaciones'));
 RETURN true;
END $$;
DO $$DECLARE def text;BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO def;
 EXECUTE replace(def,'''/rpc/get_workspace_moderation''','''/rpc/get_workspace_moderation'',''/rpc/get_workspace_moderation_history''');
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_23$;

-- SOURCE 20260923080000_workspace_venue_hours.sql
EXECUTE $franky_component_24$
ALTER TABLE public.leisure_spots ADD COLUMN weekly_hours jsonb;
CREATE FUNCTION public.validate_workspace_venue_hours(p_hours jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE r jsonb;previous jsonb;spans jsonb:='[]';v_start int;v_end int;shift int;BEGIN
 IF p_hours IS NULL OR jsonb_typeof(p_hours)<>'array' OR jsonb_array_length(p_hours)>14 THEN RAISE EXCEPTION 'invalid_venue_hours';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_hours) LOOP
 IF jsonb_typeof(r)<>'object' OR NOT r ?& ARRAY['weekday','opens','closes','closes_next_day'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN('weekday','opens','closes','closes_next_day'))
 OR jsonb_typeof(r->'weekday')<>'number' OR r->>'weekday'!~'^[0-6]$' OR jsonb_typeof(r->'closes_next_day')<>'boolean'
 OR coalesce(r->>'opens','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(r->>'closes','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'invalid_venue_hours';END IF;
 v_start:=(r->>'weekday')::int*1440+extract(hour FROM (r->>'opens')::time)::int*60+extract(minute FROM (r->>'opens')::time)::int;
 v_end:=(r->>'weekday')::int*1440+extract(hour FROM (r->>'closes')::time)::int*60+extract(minute FROM (r->>'closes')::time)::int+CASE WHEN (r->>'closes_next_day')::boolean THEN 1440 ELSE 0 END;
 IF v_end<=v_start OR v_end-v_start>1440 THEN RAISE EXCEPTION 'invalid_venue_hours';END IF;
 FOR previous IN SELECT value FROM jsonb_array_elements(spans) LOOP
 FOREACH shift IN ARRAY ARRAY[-10080,0,10080] LOOP IF v_start<(previous->>'end')::int+shift AND v_end>(previous->>'start')::int+shift THEN RAISE EXCEPTION 'venue_hours_overlap';END IF;END LOOP;END LOOP;
 spans:=spans||jsonb_build_array(jsonb_build_object('start',v_start,'end',v_end));
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'weekday')::int,x->>'opens'),'[]') FROM jsonb_array_elements(p_hours)x);
END $$;
REVOKE ALL ON FUNCTION public.validate_workspace_venue_hours(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.workspace_venue_hours_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_hours jsonb;BEGIN
 IF NEW.weekly_hours IS NOT NULL AND (TG_OP='INSERT' OR NEW.weekly_hours IS DISTINCT FROM OLD.weekly_hours) THEN
 NEW.weekly_hours:=public.validate_workspace_venue_hours(NEW.weekly_hours);
 SELECT coalesce(jsonb_object_agg(day_name,intervals),'{}') INTO v_hours FROM (SELECT (ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[weekday+1] day_name,
 coalesce((SELECT string_agg((x->>'opens')||'–'||(x->>'closes')||CASE WHEN (x->>'closes_next_day')::boolean THEN ' (día siguiente)' ELSE '' END,', ' ORDER BY x->>'opens') FROM jsonb_array_elements(NEW.weekly_hours)x WHERE (x->>'weekday')::int=weekday),'Cerrado') intervals FROM generate_series(0,6)weekday)days;
 NEW.opening_hours:=CASE WHEN jsonb_array_length(NEW.weekly_hours)=0 THEN '{}'::jsonb ELSE v_hours END;
 NEW.details:=coalesce(NEW.details,'{}')-'opening_hours_text';
 ELSIF TG_OP='UPDATE' AND (NEW.opening_hours IS DISTINCT FROM OLD.opening_hours OR NEW.details->'opening_hours_text' IS DISTINCT FROM OLD.details->'opening_hours_text') THEN
 -- Preserve legacy clients' truthful text without inventing structured hours.
 NEW.weekly_hours:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_venue_hours_sync() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_venue_hours_sync BEFORE INSERT OR UPDATE ON public.leisure_spots FOR EACH ROW EXECUTE FUNCTION public.workspace_venue_hours_sync();

ALTER FUNCTION public.workspace_validate_data(text,text,jsonb,boolean,uuid) RENAME TO workspace_validate_before_venue_hours;
REVOKE ALL ON FUNCTION public.workspace_validate_before_venue_hours(text,text,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_validate_data(p_kind text,p_type text,p_data jsonb,p_publish boolean,p_org uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 result:=public.workspace_validate_before_venue_hours(p_kind,p_type,p_data,p_publish,p_org);
 IF p_type='venue' AND coalesce(result->>'category','bar') NOT IN('bar','pub','restaurante','cafeteria','discoteca','parque','cultural','deportivo','coworking') THEN RAISE EXCEPTION 'invalid_venue_category';END IF;
 IF p_type='venue' AND p_data ? 'weekly_hours' AND p_data->'weekly_hours'<>'null'::jsonb THEN result:=result||jsonb_build_object('weekly_hours',public.validate_workspace_venue_hours(p_data->'weekly_hours'));END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.workspace_validate_data(text,text,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated;

-- Preserve the existing publication/revision wrappers. Only the canonical
-- venue write learns the new field; drafts never modify public opening times.
DO $$ DECLARE f record;definition text;patched int:=0;BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%workspace%' LOOP
 SELECT pg_get_functiondef(f.oid) INTO definition;
 IF strpos(definition,'INSERT INTO public.leisure_spots(owner_id,organization_id,name,description,city,address,category,images,is_paid)')>0 THEN
 definition:=replace(definition,'INSERT INTO public.leisure_spots(owner_id,organization_id,name,description,city,address,category,images,is_paid)','INSERT INTO public.leisure_spots(owner_id,organization_id,name,description,city,address,category,images,is_paid,weekly_hours)');
 definition:=replace(definition,'coalesce(v_data->>''category'',''bar''),v_images,false)','coalesce(v_data->>''category'',''bar''),v_images,false,v_data->''weekly_hours'')');
 definition:=replace(definition,'category=coalesce(v_data->>''category'',''bar''),images=v_images WHERE id=v_source','category=coalesce(v_data->>''category'',''bar''),images=v_images,weekly_hours=CASE WHEN v_data ? ''weekly_hours'' THEN v_data->''weekly_hours'' ELSE weekly_hours END WHERE id=v_source');
 EXECUTE definition;patched:=patched+1;
 END IF;END LOOP;
 IF patched<>1 THEN RAISE EXCEPTION 'venue_publish_anchor_missing';END IF;
END $$;
ALTER FUNCTION public.workspace_canonical_payload(text,uuid) RENAME TO workspace_canonical_before_venue_hours;
REVOKE ALL ON FUNCTION public.workspace_canonical_before_venue_hours(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_canonical_payload(p_type text,p_source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;hours jsonb;BEGIN result:=public.workspace_canonical_before_venue_hours(p_type,p_source_id);
 IF p_type='venue' AND result IS NOT NULL THEN SELECT weekly_hours INTO hours FROM public.leisure_spots WHERE id=p_source_id;result:=jsonb_set(result,'{data}',result->'data'||jsonb_build_object('weekly_hours',hours));END IF;
 RETURN result;END $$;
REVOKE ALL ON FUNCTION public.workspace_canonical_payload(text,uuid) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
$franky_component_24$;

-- SOURCE 20260923090000_workspace_housing_funnel.sql
EXECUTE $franky_component_25$
CREATE TABLE public.workspace_housing_leads (
 request_id uuid PRIMARY KEY REFERENCES public.accommodation_requests(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 resource_id uuid NOT NULL REFERENCES public.workspace_resources(id),
 stage text NOT NULL CHECK(stage IN('new','contacted','shortlisted','negotiating','won','lost')),
 reason text CHECK(length(reason)<=500),updated_by uuid REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_housing_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_housing_leads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_housing_leads TO service_role;
CREATE INDEX workspace_housing_leads_scope ON public.workspace_housing_leads(organization_id,resource_id,stage);

ALTER FUNCTION public.get_workspace_housing_interests(uuid,uuid,uuid,integer) RENAME TO workspace_interests_before_funnel;
REVOKE ALL ON FUNCTION public.workspace_interests_before_funnel(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_workspace_housing_interests(p_organization_id uuid,p_resource_id uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE result jsonb;BEGIN
 result:=public.workspace_interests_before_funnel(p_organization_id,p_resource_id,p_cursor,p_limit);
 RETURN jsonb_set(result,'{items}',(SELECT coalesce(jsonb_agg(item||jsonb_build_object('stage',coalesce(l.stage,item->>'stage','new'),'stage_reason',coalesce(l.reason,item->>'stage_reason'),'stage_updated_at',coalesce(to_jsonb(l.updated_at),item->'stage_updated_at')) ORDER BY item->>'id'),'[]') FROM jsonb_array_elements(result->'items') item LEFT JOIN public.workspace_housing_leads l ON l.request_id=(item->>'id')::uuid AND l.organization_id=p_organization_id AND l.resource_id=p_resource_id));
END $$;

CREATE FUNCTION public.set_workspace_housing_interest(p_organization_id uuid,p_resource_id uuid,p_request_id uuid,p_stage text,p_reason text DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;lead public.workspace_housing_leads%ROWTYPE;item jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF p_stage IS NULL OR p_stage NOT IN('new','contacted','shortlisted','negotiating','won','lost') OR length(coalesce(p_reason,''))>500 OR p_stage IN('won','lost') AND length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'lead_result_reason_required';END IF;
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found';END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
  SELECT x INTO item FROM jsonb_array_elements(coalesce(r.data->'demo_interests','[]')) x WHERE x->>'id'=p_request_id::text;
  IF item IS NULL THEN RAISE EXCEPTION 'interest_not_found';END IF;
  IF coalesce(item->>'stage','new')=p_stage AND item->>'stage_reason' IS NOT DISTINCT FROM p_reason THEN RETURN jsonb_build_object('ok',true);END IF;
  IF (item->>'stage_updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'interest_changed';END IF;
  UPDATE public.workspace_resources SET data=jsonb_set(data,'{demo_interests}',(SELECT jsonb_agg(CASE WHEN x->>'id'=p_request_id::text THEN x||jsonb_build_object('stage',p_stage,'stage_reason',p_reason,'stage_updated_at',clock_timestamp()) ELSE x END) FROM jsonb_array_elements(data->'demo_interests') x)) WHERE id=r.id;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.accommodation_requests ar JOIN public.profiles p ON p.id=ar.user_id WHERE ar.id=p_request_id AND ar.accommodation_id=r.source_id AND p.is_discarded IS NOT TRUE AND NOT public.workspace_is_demo_user(ar.user_id)) THEN RAISE EXCEPTION 'interest_not_found';END IF;
  SELECT * INTO lead FROM public.workspace_housing_leads WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND AND lead.stage=p_stage AND lead.reason IS NOT DISTINCT FROM p_reason THEN RETURN jsonb_build_object('ok',true);END IF;
  IF lead.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'interest_changed';END IF;
  INSERT INTO public.workspace_housing_leads(request_id,organization_id,resource_id,stage,reason,updated_by) VALUES(p_request_id,p_organization_id,r.id,p_stage,p_reason,auth.uid())
  ON CONFLICT(request_id) DO UPDATE SET stage=excluded.stage,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id,details) VALUES(p_organization_id,auth.uid(),'housing.interest_result',r.id,jsonb_build_object('request_id',p_request_id,'stage',p_stage));
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.get_workspace_housing_funnel(p_organization_id uuid,p_resource_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.workspace_resources%ROWTYPE;start_day date:=(date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')-interval '1 month')::date;
 end_day date:=date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')::date;views bigint;contacts bigint;requested bigint;confirmed bigint;completed bigint;won bigint;lost bigint;answered bigint;waiting bigint;minutes numeric;demo boolean;BEGIN
 PERFORM public.workspace_require(p_organization_id,'analytics.read');
 SELECT * INTO r FROM public.workspace_resources WHERE id=p_resource_id AND organization_id=p_organization_id AND type='housing';IF NOT FOUND THEN RAISE EXCEPTION 'resource_not_found';END IF;
 demo:=public.current_demo_cohort() IS NOT NULL;
 IF demo THEN
  views:=86;contacts:=jsonb_array_length(coalesce(r.data->'demo_interests','[]'));requested:=2;confirmed:=1;completed:=1;answered:=1;waiting:=1;minutes:=34;
  SELECT count(*) FILTER(WHERE x->>'stage'='won'),count(*) FILTER(WHERE x->>'stage'='lost') INTO won,lost FROM jsonb_array_elements(coalesce(r.data->'demo_interests','[]')) x;
 ELSE
  SELECT count(*) INTO views FROM public.accommodation_views v WHERE v.accommodation_id=r.source_id AND v.view_date>=start_day AND v.view_date<end_day
   AND NOT EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=v.viewer_id) AND NOT public.workspace_is_demo_user(v.viewer_id);
  SELECT count(*),count(*) FILTER(WHERE l.stage='won'),count(*) FILTER(WHERE l.stage='lost') INTO contacts,won,lost FROM public.accommodation_requests ar LEFT JOIN public.workspace_housing_leads l ON l.request_id=ar.id
   WHERE ar.accommodation_id=r.source_id AND ar.created_at>=start_day::timestamp AT TIME ZONE 'Europe/Madrid' AND ar.created_at<end_day::timestamp AT TIME ZONE 'Europe/Madrid' AND NOT public.workspace_is_demo_user(ar.user_id);
  SELECT count(*),count(*) FILTER(WHERE b.status='confirmed'),count(*) FILTER(WHERE b.status='completed') INTO requested,confirmed,completed FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id
   WHERE s.accommodation_id=r.source_id AND b.created_at>=start_day::timestamp AT TIME ZONE 'Europe/Madrid' AND b.created_at<end_day::timestamp AT TIME ZONE 'Europe/Madrid' AND NOT public.workspace_is_demo_user(b.visitor_id);
  WITH enquiries AS(SELECT m.conversation_id,min(m.created_at) first_at FROM public.messages m WHERE m.housing_listing_id=r.source_id AND m.publishing_organization_id IS NULL
   AND m.created_at>=start_day::timestamp AT TIME ZONE 'Europe/Madrid' AND m.created_at<end_day::timestamp AT TIME ZONE 'Europe/Madrid' AND NOT public.workspace_is_demo_user(m.sender_id) GROUP BY m.conversation_id),
  responses AS(SELECT e.first_at,(SELECT min(m.created_at) FROM public.messages m WHERE m.conversation_id=e.conversation_id AND m.publishing_organization_id=p_organization_id AND m.created_at>=e.first_at AND NOT m.is_deleted) replied_at FROM enquiries e)
  SELECT count(*) FILTER(WHERE replied_at IS NOT NULL),count(*) FILTER(WHERE replied_at IS NULL),round(avg(extract(epoch FROM replied_at-first_at)/60),1) INTO answered,waiting,minutes FROM responses;
 END IF;
 RETURN jsonb_build_object('period',to_char(start_day,'YYYY-MM'),'demo',demo,'views',views,'contacts',contacts,'visits_requested',requested,'visits_confirmed',confirmed,'visits_completed',completed,'won',won,'lost',lost,'conversion_percent',CASE WHEN contacts>0 THEN round(100.0*won/contacts,1) END,'response_minutes',minutes,'responded_conversations',answered,'awaiting_response',waiting,
 'definition','Consultas por persona/día y solicitudes iniciadas en el mes indicado, con su estado actual. Resultado registrado por el equipo; no demuestra por sí solo un contrato ni un cobro. Respuesta: primera contestación del espacio a consultas de vivienda identificadas.');
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_housing_interests(uuid,uuid,uuid,integer),public.set_workspace_housing_interest(uuid,uuid,uuid,text,text,timestamptz),public.get_workspace_housing_funnel(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_housing_interests(uuid,uuid,uuid,integer),public.set_workspace_housing_interest(uuid,uuid,uuid,text,text,timestamptz),public.get_workspace_housing_funnel(uuid,uuid) TO authenticated;

CREATE FUNCTION public.workspace_erase_housing_leads() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.state='purged' AND OLD.state IS DISTINCT FROM 'purged' THEN
  DELETE FROM public.workspace_housing_leads WHERE request_id IN(SELECT id FROM public.accommodation_requests WHERE user_id=NEW.user_id);
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_erase_housing_leads() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_housing_lead_erasure AFTER UPDATE OF state ON account_private.erasures FOR EACH ROW EXECUTE FUNCTION public.workspace_erase_housing_leads();
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF strpos(definition,'''/rpc/current_demo_cohort''')=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing';END IF;
 EXECUTE replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/get_workspace_housing_funnel'',''/rpc/set_workspace_housing_interest''');
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_25$;

-- SOURCE 20260923100000_workspace_housing_chat.sql
EXECUTE $franky_component_26$
-- A professional enquiry is its own conversation, never the legal owner's
-- personal DM history. Legal/billing ownership remains unchanged.
CREATE TABLE public.workspace_housing_conversations (
 conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
 accommodation_id uuid NOT NULL REFERENCES public.accommodations(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 customer_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(accommodation_id,customer_id)
);
ALTER TABLE public.workspace_housing_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_housing_conversations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_housing_conversations TO service_role;
CREATE INDEX workspace_housing_conversation_org ON public.workspace_housing_conversations(organization_id,customer_id);

CREATE FUNCTION public.workspace_refresh_housing_chat(p_conversation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h public.workspace_housing_conversations%ROWTYPE;responsible uuid;BEGIN
 SELECT * INTO h FROM public.workspace_housing_conversations WHERE conversation_id=p_conversation FOR UPDATE;IF NOT FOUND THEN RETURN;END IF;
 SELECT m.user_id INTO responsible FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id JOIN public.profiles p ON p.id=m.user_id
 WHERE m.organization_id=h.organization_id AND m.status='active' AND o.status='active' AND p.is_discarded IS NOT TRUE AND m.role='owner';
 DELETE FROM public.conversation_participants WHERE conversation_id=h.conversation_id AND user_id<>h.customer_id AND user_id IS DISTINCT FROM responsible;
 IF responsible IS NOT NULL AND responsible<>h.customer_id THEN INSERT INTO public.conversation_participants(conversation_id,user_id) VALUES(h.conversation_id,responsible) ON CONFLICT(conversation_id,user_id) DO NOTHING;END IF;
END $$;
REVOKE ALL ON FUNCTION public.workspace_refresh_housing_chat(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_housing_chat(p_accommodation_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.accommodations%ROWTYPE;responsible uuid;conv uuid;BEGIN
 PERFORM public.require_account_session();
 IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 SELECT * INTO a FROM public.accommodations WHERE id=p_accommodation_id AND status='active' AND is_paid AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_target';END IF;
 IF a.organization_id IS NULL THEN RETURN public.get_or_create_direct_chat(a.owner_id);END IF;
 IF public.has_organization_permission(a.organization_id,'content.manage') THEN RAISE EXCEPTION 'use_workspace_messages';END IF;
 SELECT m.user_id INTO responsible FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id JOIN public.profiles p ON p.id=m.user_id
 WHERE m.organization_id=a.organization_id AND m.role='owner' AND m.status='active' AND o.status='active' AND o.demo_cohort_id IS NULL AND p.is_discarded IS NOT TRUE;
 IF responsible IS NULL OR responsible=auth.uid() OR NOT public.can_message_user(responsible) OR social_private.pair_blocked(responsible) THEN RAISE EXCEPTION 'not_allowed';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-housing-chat:'||a.id::text||auth.uid()::text,0));
 SELECT conversation_id INTO conv FROM public.workspace_housing_conversations WHERE accommodation_id=a.id AND customer_id=auth.uid();
 IF conv IS NULL THEN
  INSERT INTO public.conversations(is_group,created_by) VALUES(false,auth.uid()) RETURNING id INTO conv;
  INSERT INTO public.workspace_housing_conversations(conversation_id,accommodation_id,organization_id,customer_id) VALUES(conv,a.id,a.organization_id,auth.uid());
 END IF;
 INSERT INTO public.conversation_participants(conversation_id,user_id) VALUES(conv,auth.uid()) ON CONFLICT(conversation_id,user_id) DO NOTHING;
 PERFORM public.workspace_refresh_housing_chat(conv);
 RETURN conv;
END $$;
REVOKE ALL ON FUNCTION public.get_or_create_housing_chat(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_housing_chat(uuid) TO authenticated;

CREATE FUNCTION public.workspace_housing_chat_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid;row record;BEGIN
 org:=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
 FOR row IN SELECT conversation_id FROM public.workspace_housing_conversations WHERE organization_id=org LOOP PERFORM public.workspace_refresh_housing_chat(row.conversation_id);END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.workspace_housing_chat_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_housing_chat_membership AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.workspace_housing_chat_membership();

CREATE FUNCTION public.workspace_housing_enquiry_allowed(p_conversation uuid,p_accommodation uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.account_session_usable() AND EXISTS(SELECT 1 FROM public.workspace_housing_conversations h JOIN public.accommodations a ON a.id=h.accommodation_id
 WHERE h.conversation_id=p_conversation AND h.accommodation_id=p_accommodation AND h.customer_id=auth.uid() AND public.current_demo_cohort() IS NULL
 AND EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=h.conversation_id AND user_id=auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.workspace_housing_enquiry_allowed(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_housing_enquiry_allowed(uuid,uuid) TO authenticated;

CREATE FUNCTION public.workspace_attach_housing_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h public.workspace_housing_conversations%ROWTYPE;BEGIN
 SELECT * INTO h FROM public.workspace_housing_conversations WHERE conversation_id=NEW.conversation_id;
 IF NOT FOUND OR auth.uid() IS NULL THEN RETURN NEW;END IF;
 IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'invalid_message_actor';END IF;
 IF h.customer_id=auth.uid() THEN
  IF NEW.housing_listing_id IS NOT NULL AND NEW.housing_listing_id<>h.accommodation_id THEN RAISE EXCEPTION 'invalid_housing_context';END IF;
  NEW.housing_listing_id:=h.accommodation_id;
 ELSE
  IF NOT public.has_organization_permission(h.organization_id,'content.manage')
    OR (NEW.publishing_organization_id IS NOT NULL AND NEW.publishing_organization_id<>h.organization_id)
    THEN RAISE EXCEPTION 'use_workspace_messages';END IF;
  -- Older clients send an ordinary reply. Derive its professional identity
  -- here, after the invoker guard has rejected client-supplied identity fields.
  NEW.publishing_organization_id:=h.organization_id;
  SELECT name INTO NEW.organization_label FROM public.organizations WHERE id=h.organization_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workspace_attach_housing_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_z_attach_housing_message BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.workspace_attach_housing_message();

DO $$ DECLARE def text;anchor text;BEGIN
 SELECT pg_get_functiondef('public.guard_workspace_message_identity()'::regprocedure) INTO def;
 anchor:='OR NOT EXISTS(';
 IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'housing_message_identity_changed';END IF;
 def:=replace(def,anchor,'OR (NOT public.workspace_housing_enquiry_allowed(NEW.conversation_id,NEW.housing_listing_id) AND NOT EXISTS(');
 anchor:='=2)) THEN RAISE EXCEPTION ''invalid_housing_message''';
 IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'housing_message_pair_changed';END IF;
 EXECUTE replace(def,anchor,'=2))) THEN RAISE EXCEPTION ''invalid_housing_message''');

 SELECT pg_get_functiondef('public.workspace_chat_access(uuid)'::regprocedure) INTO def;
 anchor:='IF NOT public.workspace_chat_before_audience(p_conversation)';IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'chat_scope_changed';END IF;
 EXECUTE replace(def,anchor,'IF EXISTS(SELECT 1 FROM public.workspace_housing_conversations h WHERE h.conversation_id=p_conversation AND h.customer_id<>auth.uid() AND NOT public.has_organization_permission(h.organization_id,''content.manage'')) THEN RETURN false;END IF; '||anchor);

 SELECT pg_get_functiondef('public.workspace_chat_recipient_allowed(uuid,jsonb)'::regprocedure) INTO def;
 anchor:='org:=m.publishing_organization_id;';IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'notification_scope_changed';END IF;
 EXECUTE replace(def,anchor,'IF EXISTS(SELECT 1 FROM public.workspace_housing_conversations h WHERE h.conversation_id=conv AND h.customer_id<>p_user AND NOT EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.organizations o ON o.id=om.organization_id WHERE om.organization_id=h.organization_id AND om.user_id=p_user AND om.status=''active'' AND o.status=''active'' AND ''content.manage''=ANY(public.workspace_role_permissions(om.role)))) THEN RETURN false;END IF; '||anchor);

 -- A personal DM must never reuse the professional conversation for that pair.
 SELECT pg_get_functiondef('public.get_or_create_direct_chat(uuid)'::regprocedure) INTO def;
 anchor:='WHERE coalesce(c.is_group,false)=false';IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'direct_chat_search_changed';END IF;
 EXECUTE replace(def,anchor,anchor||' AND NOT EXISTS(SELECT 1 FROM public.workspace_housing_conversations h WHERE h.conversation_id=c.id)');
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_26$;

-- SOURCE 20260923110000_workspace_tenancy_compatibility.sql
EXECUTE $franky_component_27$
-- Keep older rental/profile clients compatible with the consent-based tenancy
-- model. Public readers expose neither pending invitations nor private rooms.
CREATE OR REPLACE FUNCTION public.workspace_public_tenancy_visible(p_tenancy uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_session_usable()
 AND public.current_demo_cohort() IS NULL AND EXISTS(
 SELECT 1 FROM public.tenancies t
 JOIN public.profiles p ON p.id=t.tenant_id
 JOIN public.accommodations a ON a.id=t.accommodation_id
 WHERE t.id=p_tenancy AND t.status='active' AND t.is_public AND t.confirmed_at IS NOT NULL
 AND (t.start_date IS NULL OR t.start_date<=current_date)
 AND (t.end_date IS NULL OR t.end_date>=current_date)
 AND p.is_discarded IS NOT TRUE AND p.is_hidden IS NOT TRUE
 AND NOT public.workspace_is_demo_user(p.id)
 AND NOT social_private.pair_blocked(p.id)
 AND a.status='active' AND a.is_paid AND a.deleted_at IS NULL
 AND (a.organization_id IS NULL OR EXISTS(SELECT 1 FROM public.organizations o
   WHERE o.id=a.organization_id AND o.status='active' AND o.demo_cohort_id IS NULL))
 )
$$;
REVOKE ALL ON FUNCTION public.workspace_public_tenancy_visible(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_flat_public_residents(p_accommodation_id uuid)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,
 'career',p.career,'university_course',p.university_course,'room_label',null)
 FROM public.tenancies t JOIN public.public_profiles p ON p.id=t.tenant_id
 WHERE t.accommodation_id=p_accommodation_id AND public.workspace_public_tenancy_visible(t.id)
 ORDER BY p.full_name NULLS LAST,p.id
$$;

CREATE OR REPLACE FUNCTION public.get_public_tenancy_for(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('accommodation_id',a.id,'title',a.title,'city',a.city)
 FROM public.tenancies t JOIN public.accommodations a ON a.id=t.accommodation_id
 WHERE t.tenant_id=p_user_id AND public.workspace_public_tenancy_visible(t.id)
 ORDER BY t.confirmed_at DESC,t.id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.invite_tenant(p_accommodation_id uuid,p_tenant_id uuid,p_room_label text DEFAULT NULL,p_start_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.accommodations%ROWTYPE;v_email text;v_resource uuid;v_id uuid;
BEGIN
 PERFORM public.require_account_session();
 IF auth.uid() IS NULL OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 SELECT * INTO a FROM public.accommodations WHERE id=p_accommodation_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.workspace_actor_housing_access(a.id,auth.uid(),'content.manage') THEN RAISE EXCEPTION 'housing_unavailable';END IF;
 IF p_tenant_id=auth.uid() OR p_tenant_id IS NULL OR length(coalesce(p_room_label,''))>80 THEN RAISE EXCEPTION 'tenant_unavailable';END IF;
 SELECT u.email INTO v_email FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=p_tenant_id AND u.email_confirmed_at IS NOT NULL AND p.is_discarded IS NOT TRUE
 AND NOT public.workspace_is_demo_user(p.id) AND NOT social_private.pair_blocked(p.id);
 IF v_email IS NULL THEN RAISE EXCEPTION 'tenant_unavailable';END IF;
 SELECT id INTO v_id FROM public.tenancies WHERE accommodation_id=a.id AND tenant_id=p_tenant_id AND status IN('active','pending_confirmation');
 IF v_id IS NOT NULL THEN RETURN v_id;END IF;
 IF a.organization_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('workspace-tenant-invite:'||a.organization_id,0));
   SELECT id INTO v_resource FROM public.workspace_resources WHERE organization_id=a.organization_id AND type='housing' AND source_id=a.id;
   IF v_resource IS NULL THEN RAISE EXCEPTION 'housing_unavailable';END IF;
   PERFORM public.workspace_housing_action(a.organization_id,v_resource,'tenant_invite',jsonb_build_object('email',v_email,'room_label',p_room_label,'start_date',p_start_date));
   SELECT id INTO v_id FROM public.tenancies WHERE accommodation_id=a.id AND tenant_id=p_tenant_id AND status IN('active','pending_confirmation');
 ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('legacy-tenant-invite:'||auth.uid(),0));
   IF (SELECT count(*) FROM public.tenancies WHERE invited_by=auth.uid() AND created_at>now()-interval '1 day')>=30 THEN RAISE EXCEPTION 'invitation_limit';END IF;
   INSERT INTO public.tenancies(accommodation_id,tenant_id,invited_by,room_label,start_date,is_public)
   VALUES(a.id,p_tenant_id,auth.uid(),nullif(btrim(p_room_label),''),p_start_date,false) RETURNING id INTO v_id;
   INSERT INTO public.notifications(user_id,type,title,body,data)
   VALUES(p_tenant_id,'tenancy','Invitación para vincular tu alquiler','Revisa y acepta la invitación. Tu presencia seguirá siendo privada salvo que decidas mostrarla.',jsonb_build_object('kind','tenancy_invite','tenancy_id',v_id,'url','/mi-alquiler'));
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.get_flat_public_residents(uuid),public.get_public_tenancy_for(uuid),public.invite_tenant(uuid,uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_flat_public_residents(uuid),public.get_public_tenancy_for(uuid),public.invite_tenant(uuid,uuid,text,date) TO authenticated;
NOTIFY pgrst,'reload schema';
$franky_component_27$;

-- SOURCE 20260923120000_workspace_visit_refunds.sql
EXECUTE $franky_component_28$
-- Extend the same provider worker and immutable payments ledger to paid visits.

ALTER TABLE public.workspace_event_refunds ADD COLUMN booking_id uuid REFERENCES public.visit_bookings(id) ON DELETE SET NULL;
CREATE INDEX workspace_refunds_booking ON public.workspace_event_refunds(booking_id,id);
CREATE FUNCTION public.get_workspace_refundable_visits(p_organization_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE items jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.read');
 IF public.current_demo_cohort() IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.booking_id),'[]') INTO items FROM(SELECT r.id booking_id,r.title,r.data->>'starts_at' starts_at,(r.data->>'price_cents')::int amount_cents,r.status,r.data->>'payment_status' payment_status,r.data->'demo_refunds'->0->>'status' refund_status,true demo FROM public.workspace_resources r WHERE r.organization_id=p_organization_id AND r.type='visit' AND coalesce((r.data->>'price_cents')::int,0)>0 AND(p_cursor IS NULL OR r.id>p_cursor) ORDER BY r.id LIMIT 50)x;
 ELSE
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.booking_id),'[]') INTO items FROM(SELECT b.id booking_id,a.title,(s.slot_date::text||'T'||s.start_time::text) starts_at,b.price_cents amount_cents,b.status,b.payment_status,(SELECT f.status FROM public.workspace_event_refunds f WHERE f.booking_id=b.id ORDER BY f.created_at DESC LIMIT 1) refund_status,false demo FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE a.organization_id=p_organization_id AND(b.price_cents>0 OR EXISTS(SELECT 1 FROM public.workspace_event_refunds WHERE booking_id=b.id)) AND(p_cursor IS NULL OR b.id>p_cursor) ORDER BY b.id LIMIT 50)x;
 END IF;RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=50 THEN items->-1->>'booking_id' ELSE null END);
END $$;

CREATE FUNCTION public.request_my_visit_refund(p_booking_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.visit_bookings%ROWTYPE;v_org uuid;v_resource uuid;v_ids uuid[];BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'refund_forbidden' USING ERRCODE='42501';END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'reason_required';END IF;
 SELECT * INTO b FROM public.visit_bookings WHERE id=p_booking_id AND visitor_id=auth.uid() FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_owned';END IF;
 SELECT a.organization_id,wr.id INTO v_org,v_resource FROM public.visit_slots s JOIN public.accommodations a ON a.id=s.accommodation_id LEFT JOIN public.workspace_resources wr ON wr.type='housing' AND wr.source_id=a.id WHERE s.id=b.slot_id;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE type='visit' AND ref_id=b.id AND buyer_id=auth.uid() AND status IN('pending','processing','succeeded','partially_refunded','refunded')) THEN RAISE EXCEPTION 'visit_payment_not_found';END IF;
 INSERT INTO public.workspace_event_refunds(organization_id,resource_id,payment_id,booking_id,reason)
 SELECT v_org,v_resource,p.id,b.id,btrim(p_reason) FROM public.payments p WHERE p.type='visit' AND p.ref_id=b.id AND p.buyer_id=auth.uid() AND p.status IN('pending','processing','succeeded','partially_refunded','refunded') ON CONFLICT(payment_id) DO NOTHING;
 SELECT array_agg(id) INTO v_ids FROM public.workspace_event_refunds WHERE booking_id=b.id;RETURN jsonb_build_object('refund_ids',v_ids);
END $$;

CREATE FUNCTION public.get_workspace_visit_refunds(p_organization_id uuid,p_booking_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.visit_bookings%ROWTYPE;r public.workspace_resources%ROWTYPE;v_org uuid;v_title text;v_name text;v_refunds jsonb;v_finance boolean;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');v_finance:=public.has_organization_permission(p_organization_id,'finance.read');
 IF NOT v_finance AND NOT public.has_organization_permission(p_organization_id,'content.manage') THEN RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501';END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN
  SELECT * INTO r FROM public.workspace_resources WHERE id=p_booking_id AND organization_id=p_organization_id AND type='visit';IF NOT FOUND THEN RAISE EXCEPTION 'visit_not_found';END IF;
  RETURN jsonb_build_object('booking',jsonb_build_object('id',r.id,'title',r.title,'name',r.data->>'visitor_name','status',r.status,'payment_status',r.data->>'payment_status','amount_cents',CASE WHEN v_finance THEN r.data->'price_cents' END,'demo',true),'can_request',public.has_organization_permission(p_organization_id,'content.manage') OR public.has_organization_permission(p_organization_id,'finance.manage'),'can_approve',public.has_organization_permission(p_organization_id,'finance.manage'),'refunds',CASE WHEN v_finance THEN coalesce(r.data->'demo_refunds','[]') ELSE '[]'::jsonb END);
 END IF;
 SELECT * INTO b FROM public.visit_bookings WHERE id=p_booking_id;
 SELECT a.organization_id,a.title,u.full_name INTO v_org,v_title,v_name FROM public.visit_slots s JOIN public.accommodations a ON a.id=s.accommodation_id LEFT JOIN public.profiles u ON u.id=b.visitor_id WHERE s.id=b.slot_id;
 IF b.id IS NULL OR v_org IS DISTINCT FROM p_organization_id THEN RAISE EXCEPTION 'visit_not_found';END IF;
 IF v_finance THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'booking_id',f.booking_id,'payment_id',f.payment_id,'amount_cents',p.amount_cents,'refunded_cents',p.refunded_cents,'status',f.status,'reason',f.reason,'review_reason',f.review_reason,'created_at',f.created_at) ORDER BY f.created_at),'[]') INTO v_refunds FROM public.workspace_event_refunds f JOIN public.payments p ON p.id=f.payment_id WHERE f.booking_id=b.id AND f.organization_id=p_organization_id;END IF;
 RETURN jsonb_build_object('booking',jsonb_build_object('id',b.id,'title',v_title,'name',CASE WHEN v_finance OR public.has_organization_permission(p_organization_id,'content.manage') THEN v_name END,'status',b.status,'payment_status',b.payment_status,'amount_cents',CASE WHEN v_finance THEN b.price_cents END,'demo',false),'can_request',public.has_organization_permission(p_organization_id,'content.manage') OR public.has_organization_permission(p_organization_id,'finance.manage'),'can_approve',public.has_organization_permission(p_organization_id,'finance.manage'),'refunds',coalesce(v_refunds,'[]'));
END $$;

CREATE FUNCTION public.workspace_visit_refund_action(p_organization_id uuid,p_booking_id uuid,p_action text,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.visit_bookings%ROWTYPE;r public.workspace_resources%ROWTYPE;v_org uuid;v_resource uuid;v_demo boolean;v_count int;v_item jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 OR p_action NOT IN('request','approve','reject') THEN RAISE EXCEPTION 'invalid_refund_request';END IF;
 IF p_action='request' THEN IF NOT public.has_organization_permission(p_organization_id,'content.manage') AND NOT public.has_organization_permission(p_organization_id,'finance.manage') THEN RAISE EXCEPTION 'workspace_forbidden';END IF;ELSE PERFORM public.workspace_require(p_organization_id,'finance.manage');END IF;
 v_demo:=public.current_demo_cohort() IS NOT NULL;
 IF v_demo THEN
  SELECT * INTO r FROM public.workspace_resources WHERE id=p_booking_id AND organization_id=p_organization_id AND type='visit' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'visit_not_found';END IF;
  IF r.data->>'payment_status'='refunded' THEN RETURN public.get_workspace_visit_refunds(p_organization_id,p_booking_id);END IF;
  v_item:=jsonb_build_object('id',coalesce(r.data->'demo_refunds'->0->>'id',gen_random_uuid()::text),'booking_id',r.id,'payment_id',null,'amount_cents',coalesce((r.data->>'price_cents')::int,0),'refunded_cents',CASE WHEN p_action='approve' THEN coalesce((r.data->>'price_cents')::int,0) ELSE 0 END,'status',CASE WHEN p_action='approve' THEN 'refunded' WHEN p_action='reject' THEN 'rejected' ELSE 'requested' END,'reason',btrim(p_reason),'review_reason','Simulación: no se ha movido dinero','created_at',now(),'demo',true);
  UPDATE public.workspace_resources SET status=CASE WHEN p_action='approve' THEN 'cancelled' ELSE status END,data=jsonb_set(data,'{demo_refunds}',jsonb_build_array(v_item))||CASE WHEN p_action='approve' THEN '{"payment_status":"refunded"}'::jsonb ELSE '{}'::jsonb END WHERE id=r.id;
  RETURN public.get_workspace_visit_refunds(p_organization_id,p_booking_id);
 END IF;
 IF p_action<>'request' AND auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'mfa_required';END IF;
 SELECT * INTO b FROM public.visit_bookings WHERE id=p_booking_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'visit_not_found';END IF;
 SELECT a.organization_id,wr.id INTO v_org,v_resource FROM public.visit_slots s JOIN public.accommodations a ON a.id=s.accommodation_id LEFT JOIN public.workspace_resources wr ON wr.type='housing' AND wr.source_id=a.id WHERE s.id=b.slot_id;
 IF v_org IS DISTINCT FROM p_organization_id THEN RAISE EXCEPTION 'visit_not_found';END IF;
 INSERT INTO public.workspace_event_refunds(organization_id,resource_id,payment_id,booking_id,reason)
 SELECT v_org,v_resource,p.id,b.id,btrim(p_reason) FROM public.payments p WHERE p.type='visit' AND p.ref_id=b.id AND p.status IN('pending','processing','succeeded','partially_refunded') ON CONFLICT(payment_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_event_refunds WHERE booking_id=b.id AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'visit_payment_not_found';END IF;
 IF p_action<>'request' THEN
  UPDATE public.workspace_event_refunds SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,approved_by=auth.uid(),approved_at=now(),review_reason=btrim(p_reason),next_attempt_at=now(),updated_at=now()
  WHERE booking_id=b.id AND organization_id=p_organization_id AND status IN('requested','rejected','review') AND request_params IS NULL;
 END IF;
 RETURN public.get_workspace_visit_refunds(p_organization_id,p_booking_id);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_event_refund_requests() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'ticket_id',f.ticket_id,'booking_id',f.booking_id,'type',p.type,'status',f.status,'reason',f.reason,'review_reason',f.review_reason,'amount_cents',p.amount_cents,'refunded_cents',p.refunded_cents,'created_at',f.created_at) ORDER BY f.created_at DESC),'[]') FROM public.workspace_event_refunds f JOIN public.payments p ON p.id=f.payment_id WHERE p.buyer_id=auth.uid() AND public.account_session_usable() AND public.current_demo_cohort() IS NULL
$$;
CREATE FUNCTION public.get_my_workspace_visits(p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_at timestamptz;items jsonb;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 IF p_cursor IS NOT NULL THEN SELECT created_at INTO v_at FROM public.visit_bookings WHERE id=p_cursor AND visitor_id=auth.uid();IF NOT FOUND THEN RAISE EXCEPTION 'invalid_cursor';END IF;END IF;
 SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO items FROM(SELECT b.id,b.status,b.payment_status,b.price_cents,b.created_at,a.id accommodation_id,a.title,s.slot_date,s.start_time,s.end_time FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id JOIN public.accommodations a ON a.id=s.accommodation_id WHERE b.visitor_id=auth.uid() AND (p_cursor IS NULL OR(b.created_at,b.id)<(v_at,p_cursor)) ORDER BY b.created_at DESC,b.id DESC LIMIT 50)x;
 RETURN jsonb_build_object('items',items,'next_cursor',CASE WHEN jsonb_array_length(items)=50 THEN items->-1->>'id' ELSE null END);
END $$;

-- Cancelling an unpaid checkout must also resolve its visit, but only after every
-- checkout is demonstrably closed and no other captured payment is outstanding.
CREATE FUNCTION workspace_private.finish_visit_refund() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.booking_id IS NOT NULL AND NEW.status IN('refunded','closed_unpaid') AND NOT EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state s ON s.payment_id=p.id WHERE p.type='visit' AND p.ref_id=NEW.booking_id AND ((p.status IN('succeeded','partially_refunded') AND p.amount_cents>p.refunded_cents) OR(p.status IN('pending','processing','failed','canceled') AND coalesce(s.state,'legacy')<>'closed'))) THEN
  UPDATE public.visit_bookings SET status=CASE WHEN status IN('pending','confirmed') THEN 'cancelled_by_owner' ELSE status END,payment_status=CASE WHEN NEW.status='refunded' THEN 'refunded' ELSE 'not_required' END WHERE id=NEW.booking_id;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.finish_visit_refund() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_finish_visit_refund AFTER UPDATE OF status ON public.workspace_event_refunds FOR EACH ROW EXECUTE FUNCTION workspace_private.finish_visit_refund();
CREATE FUNCTION workspace_private.guard_visit_refund_reschedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.slot_id IS DISTINCT FROM OLD.slot_id AND EXISTS(SELECT 1 FROM public.workspace_event_refunds WHERE booking_id=OLD.id AND status IN('approved','processing','pending')) THEN RAISE EXCEPTION 'visit_refund_in_progress';END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION workspace_private.guard_visit_refund_reschedule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaa_visit_refund BEFORE UPDATE ON public.visit_bookings FOR EACH ROW EXECUTE FUNCTION workspace_private.guard_visit_refund_reschedule();

DO $$DECLARE d text;a text;replacement text;BEGIN
 SELECT pg_get_functiondef('public.refund_marketplace_payment(uuid,text,text,integer,text,integer)'::regprocedure) INTO d;
 a:=$a$UPDATE public.visit_bookings SET payment_status='refunded',
    status=CASE WHEN status IN('pending','confirmed') THEN 'cancelled_by_owner' ELSE status END WHERE id=p.ref_id AND order_id=p.id;$a$;
 replacement:=$a$IF NOT EXISTS(SELECT 1 FROM public.payments q LEFT JOIN public.payment_checkout_state cs ON cs.payment_id=q.id WHERE q.type='visit' AND q.ref_id=p.ref_id AND q.id<>p.id AND ((q.status IN('succeeded','partially_refunded') AND q.amount_cents>q.refunded_cents) OR(q.status IN('pending','processing','failed','canceled') AND coalesce(cs.state,'legacy')<>'closed'))) THEN
 UPDATE public.visit_bookings SET payment_status='refunded',status=CASE WHEN status IN('pending','confirmed') THEN 'cancelled_by_owner' ELSE status END WHERE id=p.ref_id AND order_id=p.id;END IF;$a$;
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'visit_refund_provider_contract_changed';END IF;EXECUTE replace(d,a,replacement);
END $$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('request_my_visit_refund','get_workspace_visit_refunds','workspace_visit_refund_action','get_my_workspace_visits','get_workspace_refundable_visits') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END LOOP;END $$;
DO $$DECLARE d text;a text:='''/rpc/current_demo_cohort''';BEGIN SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;IF strpos(d,a)=0 THEN RAISE EXCEPTION 'demo_request_gate_changed';END IF;EXECUTE replace(d,a,'''/rpc/get_workspace_refundable_visits'',''/rpc/get_workspace_visit_refunds'',''/rpc/workspace_visit_refund_action'','||a);END $$;
NOTIFY pgrst,'reload schema';
$franky_component_28$;

-- SOURCE 20260923130000_workspace_legacy_erasure.sql
EXECUTE $franky_component_29$
-- Imported containers are not an obligation imposed on an old app's user.
-- Provenance was recorded only by the trusted backfill, never inferred from a
-- slug, profile flag or user-supplied metadata. Real teams keep continuity rules.
CREATE FUNCTION workspace_private.claim_imported_space() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_closed timestamptz;BEGIN
 IF NEW.action LIKE 'legacy.%' THEN RETURN NEW;END IF;
 SELECT automatically_closed_at INTO v_closed FROM workspace_private.legacy_imports WHERE organization_id=NEW.organization_id FOR UPDATE;
 IF v_closed IS NOT NULL THEN RAISE EXCEPTION 'workspace_archived';END IF;
 UPDATE workspace_private.legacy_imports SET claimed_at=coalesce(claimed_at,now()),claimed_reason=coalesce(claimed_reason,NEW.action)
 WHERE organization_id=NEW.organization_id AND NEW.action NOT LIKE 'legacy.%';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.claim_imported_space() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_claim_import AFTER INSERT ON public.organization_audit FOR EACH ROW EXECUTE FUNCTION workspace_private.claim_imported_space();

CREATE FUNCTION workspace_private.close_unclaimed_imports(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.organizations%ROWTYPE;i workspace_private.legacy_imports%ROWTYPE;BEGIN
 FOR o IN SELECT x.* FROM public.organizations x JOIN public.organization_memberships m ON m.organization_id=x.id
 WHERE m.user_id=p_user AND m.role='owner' AND m.status='active' AND x.status<>'archived' ORDER BY x.id FOR UPDATE OF x LOOP
  SELECT * INTO i FROM workspace_private.legacy_imports WHERE organization_id=o.id FOR UPDATE;
  IF NOT FOUND OR i.imported_owner_id<>p_user OR i.claimed_at IS NOT NULL
   OR o.demo_cohort_id IS NOT NULL OR o.created_by IS DISTINCT FROM p_user OR o.billing_owner_id IS DISTINCT FROM p_user
   OR EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=o.id AND user_id<>p_user)
   OR EXISTS(SELECT 1 FROM public.organization_invitations WHERE organization_id=o.id)
   OR EXISTS(SELECT 1 FROM public.organization_audit WHERE organization_id=o.id AND action NOT LIKE 'legacy.%')
   OR EXISTS(SELECT 1 FROM public.workspace_resources WHERE organization_id=o.id AND (created_by IS NOT NULL OR source_id IS NULL))
   OR EXISTS(SELECT 1 FROM public.workspace_contract_requests WHERE organization_id=o.id)
   OR EXISTS(SELECT 1 FROM public.workspace_rent_obligations WHERE organization_id=o.id)
   OR EXISTS(SELECT 1 FROM public.contracts c JOIN public.accommodations a ON a.id=c.accommodation_id WHERE a.organization_id=o.id AND c.created_at>=i.imported_at)
  THEN RAISE EXCEPTION 'workspace_transfer_before_erasure';END IF;
  UPDATE workspace_private.legacy_imports SET automatically_closed_at=now(),previous_status=o.status WHERE organization_id=o.id;
  UPDATE public.organizations SET status='archived',updated_at=now() WHERE id=o.id;
  INSERT INTO public.organization_audit(organization_id,actor_id,action,details)
  VALUES(o.id,p_user,'legacy.closed_for_erasure',jsonb_build_object('reason','Unclaimed imported container; preserve the existing account-closure flow'));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION workspace_private.close_unclaimed_imports(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.workspace_account_erasure_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM workspace_private.close_unclaimed_imports(NEW.user_id);
 IF EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.user_id=NEW.user_id AND m.role='owner' AND m.status='active' AND o.status<>'archived') THEN RAISE EXCEPTION 'workspace_transfer_before_erasure';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.workspace_profile_continuity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.is_discarded IS TRUE AND OLD.is_discarded IS NOT TRUE AND NEW.self_deleted IS TRUE THEN
  PERFORM workspace_private.close_unclaimed_imports(NEW.id);
 ELSIF NEW.is_discarded IS NOT TRUE AND OLD.is_discarded IS TRUE AND OLD.self_deleted IS TRUE
 AND NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=NEW.id) THEN
  -- Existing reversible deactivation restores only the still-unclaimed import.
  UPDATE public.organizations o SET status=i.previous_status,updated_at=now()
  FROM workspace_private.legacy_imports i WHERE i.organization_id=o.id AND i.imported_owner_id=NEW.id
  AND i.automatically_closed_at IS NOT NULL AND i.claimed_at IS NULL AND o.status='archived'
  AND NOT EXISTS(SELECT 1 FROM public.organization_memberships m WHERE m.organization_id=o.id AND m.user_id<>NEW.id);
  UPDATE workspace_private.legacy_imports i SET automatically_closed_at=NULL,previous_status=NULL
  FROM public.organizations o WHERE o.id=i.organization_id AND i.imported_owner_id=NEW.id AND o.status<>'archived' AND i.claimed_at IS NULL;
 END IF;RETURN NEW;
END $$;

-- The container survives for audit. Its unclaimed personal catalogue resources
-- follow the pre-existing erasure/redaction rules instead of being preserved as
-- if they belonged to a separately managed team. Financial tables keep their own
-- existing retention; this helper never deletes payments, contracts or receipts.
CREATE OR REPLACE FUNCTION public.workspace_preserve_on_erasure(p_relation text,p_row jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=public.workspace_record_organization(p_relation,p_row)
 AND NOT EXISTS(SELECT 1 FROM workspace_private.legacy_imports i WHERE i.organization_id=o.id AND i.automatically_closed_at IS NOT NULL AND i.claimed_at IS NULL))
$$;
DO $$DECLARE d text;a text;BEGIN
 SELECT pg_get_functiondef('public.workspace_retained_file(text,text)'::regprocedure) INTO d;
 a:='SELECT 1 FROM public.organizations WHERE id::text=split_part(p_name,''/'',1)';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'retained_media_contract_changed';END IF;
 d:=replace(d,a,a||' AND NOT EXISTS(SELECT 1 FROM workspace_private.legacy_imports i WHERE i.organization_id=id AND i.automatically_closed_at IS NOT NULL AND i.claimed_at IS NULL)');
 d:=replace(d,'c.organization_id IS NOT NULL','c.organization_id IS NOT NULL AND public.workspace_preserve_on_erasure(''public.communities'',to_jsonb(c))');
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION public.workspace_account_erasure_guard(),public.workspace_profile_continuity(),public.workspace_preserve_on_erasure(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE workspace_private.legacy_imports IS 'Trusted import provenance. Claimed organizations require continuity; untouched single-owner imported containers may be archived by the legacy account closure flow.';
NOTIFY pgrst,'reload schema';
$franky_component_29$;

-- SOURCE 20260923140000_workspace_demo_creation_metrics.sql
EXECUTE $franky_component_30$
-- Reserve the demo boundary in the same Auth transaction, before the existing
-- profile/presence triggers. raw_app_meta_data is writable only by Auth admins.
CREATE FUNCTION workspace_private.reserve_new_demo_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scenario text:=NEW.raw_app_meta_data->>'workspace_demo_scenario';BEGIN
 IF scenario IS NULL THEN RETURN NEW;END IF;
 IF scenario NOT IN('owner','agency','community','leisure','university','creator')
 OR lower(coalesce(NEW.email,'')) !~ '^[a-z0-9._+-]+@demo\.franky\.invalid$'
 THEN RAISE EXCEPTION 'invalid_demo_identity';END IF;
 INSERT INTO public.workspace_demo_accounts(user_id,cohort_id) VALUES(NEW.id,gen_random_uuid());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workspace_private.reserve_new_demo_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaa_workspace_reserve_demo AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION workspace_private.reserve_new_demo_identity();

-- Presence is operational telemetry, never a real public row for a demo. This
-- also lets the unchanged Auth/profile creation chain finish successfully.
DO $$ DECLARE def text;BEGIN
 SELECT pg_get_functiondef('public.guard_workspace_demo_legacy()'::regprocedure) INTO def;
 IF strpos(def,'''push_tokens''')=0 THEN RAISE EXCEPTION 'demo_guard_changed';END IF;
 EXECUTE replace(def,'''push_tokens''','''push_tokens'',''user_presence''');

 SELECT pg_get_functiondef('public.provision_workspace_demo(uuid,text)'::regprocedure) INTO def;
 IF strpos(def,'OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user_id)')=0
 THEN RAISE EXCEPTION 'demo_provision_guard_changed';END IF;
 def:=replace(def,'OR EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user_id)',
 'OR (EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user_id) AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND raw_app_meta_data->>''workspace_demo_scenario''=p_scenario))');
 def:=replace(def,'INSERT INTO social_private.community_terms_acceptances(user_id,version) VALUES(p_user_id,''2026-09-10'') ON CONFLICT DO NOTHING;',
 'IF NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=p_user_id) THEN INSERT INTO social_private.community_terms_acceptances(user_id,version) VALUES(p_user_id,''2026-09-10'') ON CONFLICT DO NOTHING; END IF;');
 IF strpos(def,'INSERT INTO public.workspace_demo_accounts(user_id,cohort_id) VALUES(p_user_id,v_cohort);')=0 THEN RAISE EXCEPTION 'demo_provision_insert_changed';END IF;
 EXECUTE replace(def,'INSERT INTO public.workspace_demo_accounts(user_id,cohort_id) VALUES(p_user_id,v_cohort);',
 'SELECT cohort_id INTO v_cohort FROM public.workspace_demo_accounts WHERE user_id=p_user_id; IF v_cohort IS NULL THEN v_cohort:=gen_random_uuid(); INSERT INTO public.workspace_demo_accounts(user_id,cohort_id) VALUES(p_user_id,v_cohort); END IF;');
END $$;

CREATE FUNCTION public.workspace_demo_provisioning_ready() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_required';END IF;
 RETURN EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='aaa_workspace_reserve_demo' AND tgenabled IN('O','A'))
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created' AND tgenabled IN('O','A'));
END $$;
REVOKE ALL ON FUNCTION public.workspace_demo_provisioning_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_demo_provisioning_ready() TO service_role;

-- Existing administrative analytics run as DEFINER, so RLS alone cannot keep
-- simulations out of them. This private view filters even privileged readers.
CREATE VIEW workspace_private.real_profiles WITH(security_invoker=true) AS
 SELECT p.* FROM public.profiles p WHERE NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id=p.id);
REVOKE ALL ON workspace_private.real_profiles FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f record;def text;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN(
 'admin_kpis_summary','admin_signups_daily','admin_users_demographics','admin_top_universities','admin_top_careers','admin_top_cities',
 'admin_engagement_metrics','admin_growth_attribution','admin_ambassador_leads','admin_event_creator_revenue','admin_product_insights','admin_decision_metrics',
 'uni_admin_summary','uni_admin_top_careers','uni_admin_origin','uni_admin_signups_monthly','get_public_community_stats') LOOP
  SELECT pg_get_functiondef(f.signature) INTO def;
  IF strpos(def,'public.profiles')=0 THEN RAISE EXCEPTION 'analytics_profile_source_changed: %',f.signature;END IF;
  EXECUTE replace(def,'public.profiles','workspace_private.real_profiles');
 END LOOP;
 SELECT pg_get_functiondef('public._profile_filter_sql(jsonb)'::regprocedure) INTO def;
 IF strpos(def,'v_clauses text[] := ARRAY[]::text[];')=0 THEN RAISE EXCEPTION 'profile_filter_changed';END IF;
 def:=replace(def,'v_clauses text[] := ARRAY[]::text[];',
 'v_clauses text[] := ARRAY[''NOT EXISTS (SELECT 1 FROM public.workspace_demo_accounts demo WHERE demo.user_id=p.id)'']::text[];');
 def:=regexp_replace(def,'IF p_filters IS NULL THEN\s+RETURN '''';\s+END IF;','p_filters := coalesce(p_filters,''{}''::jsonb);');
 EXECUTE def;
END $$;
NOTIFY pgrst,'reload schema';
$franky_component_30$;

-- SOURCE 20260923150000_workspace_beta_operation_gate.sql
EXECUTE $franky_component_31$
-- Rollout is an API/data boundary, not only a navigation preference. Existing
-- canonical services keep their resource authorization and payment contracts.
ALTER FUNCTION public.get_workspace_access() RENAME TO workspace_access_before_beta;
REVOKE ALL ON FUNCTION public.workspace_access_before_beta() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_workspace_access() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;epoch integer;BEGIN
 result:=public.workspace_access_before_beta();
 IF (result->>'enabled')::boolean AND public.current_demo_cohort() IS NOT NULL THEN
  SELECT s.generation INTO epoch FROM public.workspace_demo_scenarios s
  JOIN public.organizations o ON o.id=s.organization_id
  WHERE s.user_id=auth.uid() AND s.revoked_at IS NULL AND o.status='active'
  AND o.demo_cohort_id=public.current_demo_cohort();
 END IF;
 RETURN result||jsonb_build_object('demo_epoch',epoch);
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_access() TO authenticated,service_role;

CREATE FUNCTION public.workspace_api_enabled() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((public.get_workspace_access()->>'enabled')::boolean,false)
$$;
REVOKE ALL ON FUNCTION public.workspace_api_enabled() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_api_enabled() TO authenticated,service_role;

-- This private helper is only for the two existing canonical entrypoints below.
-- It never grants permissions and cannot be invoked by a Data API client.
CREATE FUNCTION workspace_private.require_legacy_permission(p_org uuid,p_permission text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.has_organization_permission(p_org,p_permission) THEN
  RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION workspace_private.require_legacy_permission(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.workspace_require(p_organization_id uuid,p_permission text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT public.workspace_api_enabled() THEN RAISE EXCEPTION 'workspace_unavailable' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NULL OR NOT public.has_organization_permission(p_organization_id,p_permission) THEN
  RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.workspace_require(uuid,text) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE signature regprocedure;definition text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.cancel_visit_booking(uuid)'::regprocedure,'public.guard_workspace_housing_private_write()'::regprocedure] LOOP
  SELECT pg_get_functiondef(signature) INTO definition;
  IF strpos(definition,'public.workspace_require(')=0 THEN RAISE EXCEPTION 'legacy_permission_anchor_changed: %',signature;END IF;
  EXECUTE replace(definition,'public.workspace_require(','workspace_private.require_legacy_permission(');
 END LOOP;
 -- Accepting an institutional/team invitation is a new professional action,
 -- independent of whether the recipient already belongs to an organization.
 SELECT pg_get_functiondef('public.accept_workspace_invitation(uuid)'::regprocedure) INTO definition;
 IF strpos(definition,'IF auth.uid() IS NULL')=0 THEN RAISE EXCEPTION 'invitation_gate_anchor_changed';END IF;
 EXECUTE replace(definition,'IF auth.uid() IS NULL','IF NOT public.workspace_api_enabled() THEN RAISE EXCEPTION ''workspace_unavailable'' USING ERRCODE=''42501'';END IF; IF auth.uid() IS NULL');
 SELECT pg_get_functiondef('public.list_workspace_invitations()'::regprocedure) INTO definition;
 IF strpos(definition,'IF auth.uid() IS NULL')=0 THEN RAISE EXCEPTION 'invitation_list_gate_anchor_changed';END IF;
 EXECUTE replace(definition,'IF auth.uid() IS NULL','IF NOT public.workspace_api_enabled() THEN RETURN ''[]''::jsonb;END IF; IF auth.uid() IS NULL');
END $$;

-- Invoker SELECT/Realtime/Storage are closed as well as the RPCs. DEFINER
-- canonical helpers still revalidate live membership and account state; no
-- rollout check is added to their legacy housing/chat/event authorization.
DO $$ DECLARE t record;BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
 AND (c.relname LIKE 'workspace\_%' ESCAPE '\' OR c.relname LIKE 'organization%') LOOP
  EXECUTE format('CREATE POLICY workspace_beta_release_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.workspace_api_enabled()) WITH CHECK(public.workspace_api_enabled())',t.relname);
 END LOOP;
END $$;
CREATE POLICY workspace_media_release_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING(bucket_id<>'workspace-media' OR public.workspace_api_enabled())
 WITH CHECK(bucket_id<>'workspace-media' OR public.workspace_api_enabled());

-- INSERT ... RETURNING in the existing /api/contracts endpoint cannot find its
-- own new row through a STABLE lookup by contract ID. Use the already-known
-- accommodation for authorized financial owners; retain the signer boundary.
DROP POLICY workspace_contract_scope ON public.contracts;
CREATE POLICY workspace_contract_scope ON public.contracts AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.account_session_usable() AND public.current_demo_cohort() IS NULL AND
 (public.workspace_my_housing_access(accommodation_id,'finance.read') OR public.workspace_housing_contract_read(id)));

NOTIFY pgrst,'reload schema';
$franky_component_31$;

-- SOURCE 20260923160000_workspace_organization_referrals.sql
EXECUTE $franky_component_32$
-- Organizational attribution belongs to the organization, never to its current employee.

ALTER TABLE public.growth_promoters ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.growth_promoters ADD COLUMN organization_id uuid UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.growth_promoters ADD COLUMN affiliate_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.growth_promoters ADD CONSTRAINT growth_promoter_identity CHECK((user_id IS NOT NULL)::int+(organization_id IS NOT NULL)::int=1);
ALTER TABLE public.growth_commissions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.growth_commissions ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.growth_commissions ADD CONSTRAINT growth_commission_identity CHECK((user_id IS NOT NULL)::int+(organization_id IS NOT NULL)::int=1);
ALTER TABLE public.growth_affiliate_tariffs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.growth_affiliate_tariffs ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.growth_affiliate_tariffs ADD CONSTRAINT growth_tariff_identity CHECK((user_id IS NOT NULL)::int+(organization_id IS NOT NULL)::int=1);
CREATE UNIQUE INDEX growth_organization_tariff_version ON public.growth_affiliate_tariffs(organization_id,stage,version);
CREATE INDEX growth_organization_commissions ON public.growth_commissions(organization_id,created_at);
CREATE TABLE public.growth_organization_months(
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,period date NOT NULL,
 counts jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,period)
);
ALTER TABLE public.growth_organization_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_organization_months FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.growth_organization_months TO service_role;
CREATE TRIGGER growth_organization_months_immutable BEFORE UPDATE OR DELETE ON public.growth_organization_months FOR EACH ROW EXECUTE FUNCTION growth_private.immutable();
-- No new direct-table read policies: the RPC returns only fixed-window aggregates.

CREATE FUNCTION growth_private.organization_active(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_id AND status='active')
$$;
DO $$DECLARE d text;a text;BEGIN
 SELECT pg_get_functiondef('growth_private.claim(uuid,text,uuid,uuid)'::regprocedure) INTO d;
 a:='IF p.id IS NULL THEN RETURN false; END IF;';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'growth_claim_contract_changed';END IF;
 d:=replace(d,a,a||$s$ IF p.organization_id IS NOT NULL AND (NOT growth_private.organization_active(p.organization_id) OR EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p.organization_id AND user_id=p_user)) THEN RETURN false;END IF;$s$);
 a:='INSERT INTO public.growth_referrals(referred_user_id,promoter_id';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'growth_rule_contract_changed';END IF;
 d:=replace(d,a,$s$IF p.organization_id IS NOT NULL THEN rules:=rules||jsonb_build_object('beneficiary','organization','organization_affiliate_enabled',p.affiliate_enabled,'referral_points',0,'activation_points',0);END IF;
 $s$||a);
 a:='attribution_source=excluded.attribution_source;';IF strpos(d,a)=0 THEN RAISE EXCEPTION 'growth_attribution_upsert_changed';END IF;
 d:=replace(d,a,'attribution_source=excluded.attribution_source,rule_snapshot=excluded.rule_snapshot;');EXECUTE d;
 SELECT pg_get_functiondef('public.growth_record_touch(text,text,text)'::regprocedure) INTO d;
 a:='IF p.id IS NULL OR p.demo_cohort_id IS NOT NULL THEN RETURN NULL; END IF;';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'growth_touch_contract_changed';END IF;
 EXECUTE replace(d,a,a||' IF p.organization_id IS NOT NULL AND NOT growth_private.organization_active(p.organization_id) THEN RETURN NULL;END IF;');
END $$;

ALTER FUNCTION growth_private.reserve_affiliate(uuid,text) RENAME TO reserve_personal_affiliate;
CREATE FUNCTION growth_private.reserve_affiliate(p_referral uuid,p_stage text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.growth_referrals;p public.growth_promoters;t public.growth_affiliate_tariffs;b public.growth_commission_budgets;v_key text;v_result uuid;BEGIN
 SELECT * INTO r FROM public.growth_referrals WHERE id=p_referral;
 SELECT * INTO p FROM public.growth_promoters WHERE id=r.promoter_id;
 IF p.organization_id IS NULL THEN PERFORM growth_private.reserve_personal_affiliate(p_referral,p_stage);RETURN;END IF;
 IF NOT(SELECT cash_enabled FROM public.growth_settings WHERE id) OR coalesce((r.rule_snapshot->>'organization_affiliate_enabled')::boolean,false) IS NOT TRUE OR p.demo_cohort_id IS NOT NULL OR r.demo_cohort_id IS NOT NULL OR NOT growth_private.organization_active(p.organization_id) OR r.status<>'approved' OR p_stage NOT IN('qualified','activated') OR(p_stage='activated' AND r.activated_at IS NULL) THEN RETURN;END IF;
 SELECT * INTO t FROM public.growth_affiliate_tariffs WHERE organization_id=p.organization_id AND stage=p_stage AND starts_at<=r.created_at ORDER BY version DESC LIMIT 1;
 IF NOT FOUND OR t.amount_cents=0 THEN RETURN;END IF;
 v_key:='affiliate:v1:'||r.id||':'||p_stage;IF EXISTS(SELECT 1 FROM public.growth_commissions WHERE event_key=v_key) THEN RETURN;END IF;
 SELECT * INTO b FROM public.growth_commission_budgets WHERE id=t.budget_id FOR UPDATE;
 IF NOT b.active OR b.reserved_cents+t.amount_cents>b.total_cents THEN INSERT INTO growth_private.payout_review(event_key,referral_id,reason) VALUES(v_key,r.id,'budget_exhausted') ON CONFLICT DO NOTHING;RETURN;END IF;
 INSERT INTO public.growth_commissions(organization_id,budget_id,referral_id,event_key,amount_cents,terms_snapshot)
 VALUES(p.organization_id,b.id,r.id,v_key,t.amount_cents,jsonb_build_object('version',t.version,'tariff_id',t.id,'stage',p_stage,'terms',t.terms,'organization_id',p.organization_id,'organization_name',(SELECT name FROM public.organizations WHERE id=p.organization_id),'attribution_rule',r.rule_snapshot)) ON CONFLICT(event_key) DO NOTHING RETURNING id INTO v_result;
 IF v_result IS NOT NULL THEN UPDATE public.growth_commission_budgets SET reserved_cents=reserved_cents+t.amount_cents WHERE id=b.id;END IF;
 DELETE FROM growth_private.payout_review WHERE event_key=v_key;
END $$;
CREATE FUNCTION growth_private.refresh_organization(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.growth_promoters;r public.growth_referrals;v_count int;BEGIN
 UPDATE public.growth_promoters SET processed_at=now() WHERE organization_id=p_id;
 IF NOT(SELECT enabled FROM public.growth_settings WHERE id) OR NOT growth_private.organization_active(p_id) THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,6202));SELECT * INTO p FROM public.growth_promoters WHERE organization_id=p_id;
 IF p.id IS NULL OR p.demo_cohort_id IS NOT NULL THEN RETURN;END IF;
 FOR r IN SELECT g.* FROM public.growth_referrals g JOIN public.profiles u ON u.id=g.referred_user_id WHERE g.promoter_id=p.id AND g.status IN('pending','approved') AND g.qualified_at+(g.rule_snapshot->>'review_days')::int*interval '1 day'<=now() AND u.email_verified_at IS NOT NULL AND u.onboarding_completed AND u.is_discarded IS NOT TRUE AND g.demo_cohort_id IS NULL ORDER BY g.created_at FOR UPDATE OF g LOOP
  IF r.status='pending' THEN
   SELECT count(*) INTO v_count FROM public.growth_referrals WHERE promoter_id=p.id AND status='approved' AND reviewed_at>=date_trunc('month',now());
   IF v_count>=(r.rule_snapshot->>'monthly_limit')::int THEN UPDATE public.growth_referrals SET status='review',review_reason='monthly_limit' WHERE id=r.id;CONTINUE;END IF;
   UPDATE public.growth_referrals SET status='approved',reviewed_at=now() WHERE id=r.id;
  END IF;
  PERFORM growth_private.reserve_affiliate(r.id,'qualified');PERFORM growth_private.reserve_affiliate(r.id,'activated');
 END LOOP;
 UPDATE public.growth_promoters SET processed_at=now() WHERE id=p.id;
END $$;
CREATE OR REPLACE FUNCTION public.growth_process_due() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record;processed int:=0;BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 FOR p IN SELECT user_id,organization_id FROM public.growth_promoters WHERE (active OR organization_id IS NOT NULL) AND demo_cohort_id IS NULL ORDER BY processed_at NULLS FIRST,id LIMIT 100 LOOP
  IF p.organization_id IS NULL THEN PERFORM growth_private.refresh(p.user_id);ELSE PERFORM growth_private.refresh_organization(p.organization_id);END IF;processed:=processed+1;
 END LOOP;
 DELETE FROM growth_private.touches t WHERE t.created_at<now()-interval '31 days' AND NOT EXISTS(SELECT 1 FROM public.growth_referrals WHERE first_touch_id=t.id OR last_touch_id=t.id);RETURN processed;
END $$;

CREATE FUNCTION public.get_workspace_referral_history(p_organization_id uuid,p_kind text,p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v_items jsonb;BEGIN
 PERFORM public.workspace_require(p_organization_id,'finance.read');IF p_kind NOT IN('commissions','tariffs') THEN RAISE EXCEPTION 'invalid_history';END IF;
 IF public.current_demo_cohort() IS NOT NULL THEN RETURN jsonb_build_object('items','[]'::jsonb,'next_cursor',null);END IF;
 IF p_kind='commissions' THEN SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.id),'[]') INTO v_items FROM(SELECT id,amount_cents,currency,status,receipt_reference,recovery_required,terms_snapshot,created_at FROM public.growth_commissions WHERE organization_id=p_organization_id AND(p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 100)x;
 ELSE SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.id),'[]') INTO v_items FROM(SELECT id,stage,version,amount_cents,terms,starts_at FROM public.growth_affiliate_tariffs WHERE organization_id=p_organization_id AND(p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 100)x;END IF;
 RETURN jsonb_build_object('items',v_items,'next_cursor',CASE WHEN jsonb_array_length(v_items)=100 THEN v_items->-1->>'id' ELSE null END);
END $$;
CREATE FUNCTION public.get_workspace_referrals(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.growth_promoters;v_can_manage boolean;v_finance boolean;v_stats jsonb;v_commissions jsonb;v_tariffs jsonb;v_totals jsonb;v_enabled boolean;v_month date;v_counts jsonb;v_pending int;v_activated int;v_approved int;v_rejected int;v_suppress boolean;BEGIN
 PERFORM public.workspace_require(p_organization_id,'resource.read');v_can_manage:=public.has_organization_permission(p_organization_id,'content.manage');v_finance:=public.has_organization_permission(p_organization_id,'finance.read');
 IF NOT v_can_manage AND NOT v_finance AND NOT public.has_organization_permission(p_organization_id,'analytics.read') THEN RAISE EXCEPTION 'workspace_forbidden';END IF;
 SELECT enabled OR public.current_demo_cohort() IS NOT NULL INTO v_enabled FROM public.growth_settings WHERE id;
 SELECT * INTO p FROM public.growth_promoters WHERE organization_id=p_organization_id;
 -- Only closed UTC calendar months. Freeze once; no mutable-window differencing.
 -- Suppress the entire row if a positive elementary partition is below ten:
 -- displaying both all approved and activated must not reveal one unactivated person.
 FOR v_month IN SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '6 months',date_trunc('month',now() AT TIME ZONE 'UTC')-interval '1 month',interval '1 month')::date LOOP
  IF NOT EXISTS(SELECT 1 FROM public.growth_organization_months WHERE organization_id=p_organization_id AND period=v_month) THEN
   SELECT count(*) FILTER(WHERE status IN('pending','review')),count(*) FILTER(WHERE status='approved' AND activated_at IS NULL),count(*) FILTER(WHERE status='approved' AND activated_at IS NOT NULL),count(*) FILTER(WHERE status='rejected') INTO v_pending,v_approved,v_activated,v_rejected FROM public.growth_referrals WHERE promoter_id=p.id AND created_at>=v_month::timestamp AT TIME ZONE 'UTC' AND created_at<(v_month+interval '1 month') AT TIME ZONE 'UTC';
   v_suppress:=v_pending BETWEEN 1 AND 9 OR v_approved BETWEEN 1 AND 9 OR v_activated BETWEEN 1 AND 9 OR v_rejected BETWEEN 1 AND 9;
   v_counts:=jsonb_build_object('period',v_month,'pending',CASE WHEN NOT v_suppress THEN v_pending END,'approved',CASE WHEN NOT v_suppress THEN v_approved+v_activated END,'activated',CASE WHEN NOT v_suppress THEN v_activated END,'suppressed',v_suppress);
   INSERT INTO public.growth_organization_months(organization_id,period,counts) VALUES(p_organization_id,v_month,v_counts) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(counts ORDER BY period DESC),'[]') INTO v_stats FROM public.growth_organization_months WHERE organization_id=p_organization_id AND period>=(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '6 months')::date;
 IF v_finance AND p.demo_cohort_id IS NULL THEN
  SELECT jsonb_build_object('pending',coalesce(sum(amount_cents) FILTER(WHERE status='pending'),0),'available',coalesce(sum(amount_cents) FILTER(WHERE status='available'),0),'paid',coalesce(sum(amount_cents) FILTER(WHERE status='paid'),0),'reverted',coalesce(sum(amount_cents) FILTER(WHERE status='reverted'),0)) INTO v_totals FROM public.growth_commissions WHERE organization_id=p_organization_id;
  v_commissions:=public.get_workspace_referral_history(p_organization_id,'commissions');v_tariffs:=public.get_workspace_referral_history(p_organization_id,'tariffs');
 END IF;
 RETURN jsonb_build_object('enabled',v_enabled,'organization_id',p_organization_id,'name',(SELECT name FROM public.organizations WHERE id=p_organization_id),'demo',public.current_demo_cohort() IS NOT NULL,'can_manage',v_can_manage,'can_finance',v_finance,'code',p.code,'active',coalesce(p.active,false),'affiliate_enabled',coalesce(p.affiliate_enabled,false),'cash_enabled',(SELECT cash_enabled FROM public.growth_settings WHERE id) AND public.current_demo_cohort() IS NULL,'periods',v_stats,'totals',v_totals,'commissions',coalesce(v_commissions->'items','[]'),'tariffs',coalesce(v_tariffs->'items','[]'),'commission_cursor',v_commissions->'next_cursor','tariff_cursor',v_tariffs->'next_cursor');
END $$;
CREATE FUNCTION public.workspace_referrals_action(p_organization_id uuid,p_active boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM public.workspace_require(p_organization_id,'content.manage');
 IF NOT(SELECT enabled FROM public.growth_settings WHERE id) AND public.current_demo_cohort() IS NULL THEN RAISE EXCEPTION 'growth_disabled';END IF;
 INSERT INTO public.growth_promoters(organization_id,demo_cohort_id,active) SELECT id,demo_cohort_id,p_active FROM public.organizations WHERE id=p_organization_id ON CONFLICT(organization_id) DO UPDATE SET active=excluded.active;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,details) VALUES(p_organization_id,auth.uid(),'referrals.link',jsonb_build_object('active',p_active));
 RETURN public.get_workspace_referrals(p_organization_id);
END $$;
-- Keep all existing administrative workflows and contracts. Additional actions require MFA.
DO $$DECLARE d text;a text;BEGIN
 SELECT pg_get_functiondef('public.growth_admin_action(text,uuid,jsonb)'::regprocedure) INTO d;
 a:='(SELECT user_id::text FROM public.growth_promoters WHERE id=r.promoter_id)';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'growth_admin_lock_changed';END IF;
 d:=replace(d,a,'(SELECT coalesce(user_id,organization_id)::text FROM public.growth_promoters WHERE id=r.promoter_id)');EXECUTE d;
END $$;
ALTER FUNCTION public.growth_admin_action(text,uuid,jsonb) SET SCHEMA growth_private;
ALTER FUNCTION growth_private.growth_admin_action(text,uuid,jsonb) RENAME TO personal_admin_action;
CREATE FUNCTION public.growth_admin_action(p_action text,p_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.growth_promoters;v_org uuid;v_result jsonb;v_id uuid;v_version int;BEGIN
 IF NOT public.is_admin() OR NOT public.account_session_usable() OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'forbidden';END IF;
 IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'mfa_required';END IF;
 IF p_action IN('organization_affiliate','organization_tariff') THEN
  SELECT * INTO p FROM public.growth_promoters WHERE organization_id=p_id FOR UPDATE;
  IF p.id IS NULL OR p.demo_cohort_id IS NOT NULL OR NOT growth_private.organization_active(p_id) THEN RAISE EXCEPTION 'organization_unavailable';END IF;
  IF length(coalesce(p_data->>'terms','')) NOT BETWEEN 20 AND 3000 THEN RAISE EXCEPTION 'terms_required';END IF;
  IF p_action='organization_affiliate' THEN UPDATE public.growth_promoters SET affiliate_enabled=coalesce((p_data->>'enabled')::boolean,false) WHERE id=p.id;
  ELSE
   IF p_data->>'stage' NOT IN('qualified','activated') OR (p_data->>'amount_cents')::bigint NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'invalid_tariff';END IF;
   IF NOT EXISTS(SELECT 1 FROM public.growth_commission_budgets WHERE id=(p_data->>'budget_id')::uuid AND active) THEN RAISE EXCEPTION 'budget_unavailable';END IF;
   SELECT coalesce(max(version),0)+1 INTO v_version FROM public.growth_affiliate_tariffs WHERE organization_id=p_id AND stage=p_data->>'stage';
   INSERT INTO public.growth_affiliate_tariffs(organization_id,budget_id,stage,version,amount_cents,terms,created_by) VALUES(p_id,(p_data->>'budget_id')::uuid,p_data->>'stage',v_version,(p_data->>'amount_cents')::bigint,p_data->>'terms',auth.uid()) RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.growth_audit(actor_id,action,target_id,details) VALUES(auth.uid(),p_action,p_id::text,p_data);RETURN jsonb_build_object('ok',true,'id',v_id);
 END IF;
 v_result:=growth_private.personal_admin_action(p_action,p_id,p_data);
 IF p_action='referral_approve' THEN SELECT pr.organization_id INTO v_org FROM public.growth_referrals r JOIN public.growth_promoters pr ON pr.id=r.promoter_id WHERE r.id=p_id;IF v_org IS NOT NULL THEN PERFORM growth_private.refresh_organization(v_org);END IF;END IF;
 RETURN v_result;
END $$;
-- Admin sees the organizational title next to the existing financial records.
ALTER FUNCTION public.growth_admin_snapshot() SET SCHEMA growth_private;
ALTER FUNCTION growth_private.growth_admin_snapshot() RENAME TO personal_admin_snapshot;
CREATE FUNCTION public.growth_admin_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v jsonb;BEGIN
 v:=growth_private.personal_admin_snapshot();RETURN v||jsonb_build_object('organizations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'kind',o.kind,'active',p.active,'affiliate_enabled',p.affiliate_enabled) ORDER BY o.name) FROM public.growth_promoters p JOIN public.organizations o ON o.id=p.organization_id WHERE p.demo_cohort_id IS NULL AND o.status='active'),'[]'));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA growth_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_workspace_referrals(uuid),public.workspace_referrals_action(uuid,boolean),public.growth_admin_action(text,uuid,jsonb),public.growth_admin_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_referrals(uuid),public.workspace_referrals_action(uuid,boolean),public.growth_admin_action(text,uuid,jsonb),public.growth_admin_snapshot() TO authenticated;
REVOKE ALL ON FUNCTION public.get_workspace_referral_history(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_referral_history(uuid,text,uuid) TO authenticated;
DO $$DECLARE d text;a text:='''/rpc/current_demo_cohort''';BEGIN SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;IF strpos(d,a)=0 THEN RAISE EXCEPTION 'demo_gate_changed';END IF;EXECUTE replace(d,a,'''/rpc/get_workspace_referral_history'',''/rpc/get_workspace_referrals'',''/rpc/workspace_referrals_action'','||a);END $$;
NOTIFY pgrst,'reload schema';
$franky_component_32$;

PERFORM pg_notify('pgrst','reload schema');
END
$franky_release_2_4$;
