-- Optional campaign limits. Continuous base advantages remain uncapped.
-- Uses are committed by live requests or confirmed booking quotes, never client telemetry.
CREATE FUNCTION card_private.valid_campaign_windows(p_windows jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE w jsonb;BEGIN
 IF p_windows IS NULL OR jsonb_typeof(p_windows)<>'array' OR jsonb_array_length(p_windows)>21 THEN RETURN false;END IF;
 FOR w IN SELECT value FROM jsonb_array_elements(p_windows) LOOP
  IF jsonb_typeof(w)<>'object' OR NOT(w ?& ARRAY['weekday','start_minute','end_minute']) OR (w-ARRAY['weekday','start_minute','end_minute'])<>'{}'::jsonb
   OR coalesce(w->>'weekday','')!~'^[0-6]$' OR coalesce(w->>'start_minute','')!~'^[0-9]{1,4}$' OR coalesce(w->>'end_minute','')!~'^[0-9]{1,4}$'
   OR (w->>'start_minute')::int NOT BETWEEN 0 AND 1439 OR (w->>'end_minute')::int NOT BETWEEN 1 AND 1440
   OR (w->>'start_minute')::int=(w->>'end_minute')::int THEN RETURN false;END IF;
 END LOOP;RETURN true;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN false;
END$$;
ALTER TABLE public.franky_card_offers ADD COLUMN max_redemptions int CHECK(max_redemptions BETWEEN 1 AND 1000000),
 ADD COLUMN max_per_user int CHECK(max_per_user BETWEEN 1 AND 10000),
 ADD COLUMN budget_cents int CHECK(budget_cents BETWEEN 1 AND 100000000),
 ADD COLUMN validity_windows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(card_private.valid_campaign_windows(validity_windows)),
 ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/Madrid';
UPDATE public.franky_card_offers o SET timezone=v.timezone FROM public.franky_card_venues v WHERE v.id=o.venue_id;
ALTER TABLE public.franky_card_offers ADD CONSTRAINT franky_card_base_continuous CHECK(kind='campaign' OR(max_redemptions IS NULL AND max_per_user IS NULL AND budget_cents IS NULL AND validity_windows='[]'::jsonb));
CREATE INDEX franky_card_requests_campaign ON public.franky_card_requests(offer_id,status,expires_at) WHERE kind='discount';
CREATE INDEX franky_card_quotes_campaign ON public.franky_card_booking_quotes(offer_id) WHERE booking_id IS NOT NULL;

CREATE FUNCTION card_private.campaign_window_open(p_offer public.franky_card_offers,p_at timestamptz) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE local_at timestamp;day_n int;minute_n int;w jsonb;a int;b int;d int;BEGIN
 IF p_offer.kind<>'campaign' THEN RETURN true;END IF;
 IF p_at IS NULL OR p_at<p_offer.starts_at OR(p_offer.ends_at IS NOT NULL AND p_at>=p_offer.ends_at) THEN RETURN false;END IF;
 IF p_offer.validity_windows='[]'::jsonb THEN RETURN true;END IF;
 local_at:=p_at AT TIME ZONE p_offer.timezone;day_n:=extract(dow FROM local_at)::int;minute_n:=extract(hour FROM local_at)::int*60+extract(minute FROM local_at)::int;
 FOR w IN SELECT value FROM jsonb_array_elements(p_offer.validity_windows) LOOP
  a:=(w->>'start_minute')::int;b:=(w->>'end_minute')::int;d:=(w->>'weekday')::int;
  IF (b>a AND day_n=d AND minute_n>=a AND minute_n<b) OR(b<a AND((day_n=d AND minute_n>=a)OR(day_n=(d+1)%7 AND minute_n<b))) THEN RETURN true;END IF;
 END LOOP;RETURN false;END$$;

-- No personal rows leave this private aggregate. Refunded redemptions remain spent;
-- expired/rejected drafts and CANCELLED bookings release only their unfulfilled allocation.
CREATE FUNCTION card_private.campaign_usage(p_offer uuid,p_user uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH allocations AS(
  SELECT r.user_id,(r.money->>'incremental_savings_cents')::bigint cents,
   r.status='completed' completed FROM public.franky_card_requests r WHERE r.offer_id=p_offer AND r.kind='discount'
   AND(r.status='completed' OR(r.status IN('pending','customer_confirmed')AND r.expires_at>clock_timestamp()))
  UNION ALL
  SELECT q.user_id,(q.money->>'incremental_savings_cents')::bigint,
   EXISTS(SELECT 1 FROM public.franky_card_requests r WHERE r.protected_quote_id=q.id AND r.status='completed')
   FROM public.franky_card_booking_quotes q JOIN public.professional_bookings b ON b.id=q.booking_id
   WHERE q.offer_id=p_offer AND q.booking_id IS NOT NULL AND(b.status<>'cancelled'
    OR EXISTS(SELECT 1 FROM public.franky_card_requests r WHERE r.protected_quote_id=q.id AND r.status='completed'))
 )SELECT jsonb_build_object('committed_uses',count(*),'committed_cents',coalesce(sum(cents),0),
 'user_uses',count(*) FILTER(WHERE user_id=p_user),'completed_uses',count(*) FILTER(WHERE completed),
 'completed_cents',coalesce(sum(cents) FILTER(WHERE completed),0)) FROM allocations$$;

CREATE FUNCTION card_private.require_campaign_capacity(p_offer uuid,p_user uuid,p_cents int,p_at timestamptz) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.franky_card_offers;usage jsonb;BEGIN
 -- Serialize allocations across users and the walk-in/booking channels.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_offer::text,741));
 SELECT * INTO o FROM public.franky_card_offers WHERE id=p_offer;
 IF o.id IS NULL OR p_cents IS NULL OR p_cents<0 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 -- NULL means an immediate walk-in: decide its time after obtaining the allocation lock.
 IF NOT card_private.campaign_window_open(o,coalesce(p_at,clock_timestamp())) THEN RAISE EXCEPTION 'card_campaign_schedule';END IF;
 IF o.kind<>'campaign' OR(o.max_redemptions IS NULL AND o.max_per_user IS NULL AND o.budget_cents IS NULL) THEN RETURN;END IF;
 usage:=card_private.campaign_usage(o.id,p_user);
 IF(o.max_redemptions IS NOT NULL AND(usage->>'committed_uses')::bigint>=o.max_redemptions)
 OR(o.max_per_user IS NOT NULL AND(usage->>'user_uses')::bigint>=o.max_per_user)
 OR(o.budget_cents IS NOT NULL AND(usage->>'committed_cents')::bigint+p_cents>o.budget_cents)
 THEN RAISE EXCEPTION 'card_campaign_exhausted';END IF;END$$;

CREATE FUNCTION card_private.guard_campaign_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.kind='discount' THEN PERFORM card_private.require_campaign_capacity(NEW.offer_id,NEW.user_id,(NEW.money->>'incremental_savings_cents')::int,NULL);END IF;
 IF NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'card_request_expired';END IF;RETURN NEW;END$$;
CREATE TRIGGER franky_card_campaign_request BEFORE INSERT ON public.franky_card_requests FOR EACH ROW EXECUTE FUNCTION card_private.guard_campaign_request();
-- now() is fixed at transaction start. A confirmation that waited on another lock
-- must not revive an allocation already released by real wall-clock expiry.
-- Lock 741 never locks a request/profile/org row: callers hold their existing locks first.
CREATE FUNCTION card_private.guard_request_deadline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.status IN('customer_confirmed','completed') AND OLD.status NOT IN('completed','rejected') THEN
  IF NEW.kind='discount' THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.offer_id::text,741));END IF;
  IF NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'card_request_expired';END IF;
 END IF;RETURN NEW;END$$;
CREATE TRIGGER franky_card_request_deadline BEFORE UPDATE OF status ON public.franky_card_requests FOR EACH ROW EXECUTE FUNCTION card_private.guard_request_deadline();
CREATE FUNCTION card_private.guard_campaign_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF TG_OP='INSERT' OR(NEW.booking_id IS NOT NULL AND OLD.booking_id IS NULL) THEN
  PERFORM card_private.require_campaign_capacity(NEW.offer_id,NEW.user_id,(NEW.money->>'incremental_savings_cents')::int,NEW.starts_at);
  IF NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'card_quote_invalid';END IF;
 END IF;RETURN NEW;END$$;
CREATE TRIGGER franky_card_campaign_quote BEFORE INSERT OR UPDATE OF booking_id ON public.franky_card_booking_quotes FOR EACH ROW EXECUTE FUNCTION card_private.guard_campaign_quote();
-- A reschedule changes when the campaign is used, so its local schedule must still apply.
CREATE FUNCTION card_private.guard_campaign_reschedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE o public.franky_card_offers;BEGIN
 IF NEW.card_quote_id IS NOT NULL AND NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
  SELECT offer.* INTO o FROM public.franky_card_offers offer JOIN public.franky_card_booking_quotes q ON q.offer_id=offer.id WHERE q.id=NEW.card_quote_id;
  IF o.id IS NULL OR NOT card_private.campaign_window_open(o,NEW.starts_at) THEN RAISE EXCEPTION 'card_campaign_schedule';END IF;
 END IF;RETURN NEW;END$$;
CREATE TRIGGER professional_card_campaign_reschedule BEFORE UPDATE OF starts_at ON public.professional_bookings FOR EACH ROW EXECUTE FUNCTION card_private.guard_campaign_reschedule();

CREATE OR REPLACE FUNCTION public.save_franky_card_offer(p_venue_id uuid,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v public.franky_card_venues:=card_private.require_merchant(p_venue_id,'settings.manage');o public.franky_card_offers;keys text[];BEGIN
 PERFORM 1 FROM public.franky_card_venues WHERE id=p_venue_id FOR UPDATE;
 SELECT array_agg(DISTINCT x) INTO keys FROM jsonb_array_elements_text(p_data->'service_keys') x;
 IF length(trim(coalesce(p_data->>'title',''))) NOT BETWEEN 2 AND 140 OR length(coalesce(p_data->>'terms','')) NOT BETWEEN 5 AND 2000 OR coalesce(cardinality(keys),0) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(keys) k WHERE length(k) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 IF p_data->>'kind'='campaign' AND (p_data->>'ends_at' IS NULL OR (p_data->>'ends_at')::timestamptz<=now()) THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 INSERT INTO public.franky_card_offers(venue_id,version,title,kind,percent,service_keys,minimum_cents,starts_at,ends_at,student_only,minimum_age,terms,max_redemptions,max_per_user,budget_cents,validity_windows,timezone)
 VALUES(p_venue_id,coalesce((SELECT max(version)+1 FROM public.franky_card_offers WHERE venue_id=p_venue_id),1),trim(p_data->>'title'),p_data->>'kind',(p_data->>'percent')::int,keys,coalesce((p_data->>'minimum_cents')::int,0),coalesce((p_data->>'starts_at')::timestamptz,now()),(p_data->>'ends_at')::timestamptz,coalesce((p_data->>'student_only')::boolean,false),(p_data->>'minimum_age')::int,p_data->>'terms',(p_data->>'max_redemptions')::int,(p_data->>'max_per_user')::int,(p_data->>'budget_cents')::int,coalesce(p_data->'validity_windows','[]'::jsonb),v.timezone) RETURNING * INTO o;
 INSERT INTO public.franky_card_audit(actor_id,action,target_id) VALUES(auth.uid(),'offer_submitted',o.id);RETURN to_jsonb(o)-'created_at';END$$;

-- Operational budget totals are restricted to management/finance, with no holder identifiers.
CREATE FUNCTION public.get_franky_card_offer_usage(p_offer_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE o public.franky_card_offers;v public.franky_card_venues;usage jsonb;BEGIN
 PERFORM card_private.require_user();SELECT * INTO o FROM public.franky_card_offers WHERE id=p_offer_id;SELECT * INTO v FROM public.franky_card_venues WHERE id=o.venue_id;
 IF o.id IS NULL OR v.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() OR NOT(public.has_organization_permission(v.organization_id,'settings.manage') OR public.has_organization_permission(v.organization_id,'finance.read')) THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 usage:=card_private.campaign_usage(o.id);
 RETURN usage-'user_uses'||jsonb_build_object('offer_id',o.id,'budget_cents',o.budget_cents,'max_redemptions',o.max_redemptions,
 'remaining_uses',CASE WHEN o.max_redemptions IS NOT NULL THEN greatest(0,o.max_redemptions-(usage->>'committed_uses')::bigint) END,
 'remaining_cents',CASE WHEN o.budget_cents IS NOT NULL THEN greatest(0,o.budget_cents-(usage->>'committed_cents')::bigint) END);END$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA card_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_franky_card_offer_usage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_franky_card_offer_usage(uuid) TO authenticated,service_role;
DO $$DECLARE d text;a text:='''/rpc/current_demo_cohort''';BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'card_demo_gate_changed';END IF;
 EXECUTE replace(d,a,'''/rpc/get_franky_card_offer_usage'','||a);END$$;
