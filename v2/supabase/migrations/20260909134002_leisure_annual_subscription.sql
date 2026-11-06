-- Additive billing mirror. Existing client roles retain read-only access and
-- owner-scoped RLS; only the Stripe webhook/service role can set these fields.
ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'month'
    CHECK (billing_interval IN ('month', 'year')),
  ADD COLUMN IF NOT EXISTS amount_cents integer CHECK (amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.business_subscriptions
  ADD CONSTRAINT business_annual_leisure_only CHECK (billing_interval <> 'year' OR type = 'leisure');

-- A genuinely cancelled Stripe subscription cannot be reactivated; a later
-- purchase has a new subscription ID. Ignore in-flight stale active updates.
CREATE FUNCTION public.keep_business_cancellation_terminal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
BEGIN RETURN OLD; END;
$function$;
REVOKE ALL ON FUNCTION public.keep_business_cancellation_terminal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER business_cancellation_terminal BEFORE UPDATE ON public.business_subscriptions
  FOR EACH ROW WHEN (OLD.status='canceled' AND NEW.status<>'canceled')
  EXECUTE FUNCTION public.keep_business_cancellation_terminal();

-- A single durable pending attempt per listing, across tabs and billing terms.
-- Stripe request parameters are frozen before contacting Stripe, so a lost
-- response is retried with exactly the same idempotency key and payload.
CREATE TABLE public.business_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  type text NOT NULL CHECK (type IN ('leisure', 'housing')),
  listing_id uuid NOT NULL,
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating', 'open', 'closed', 'complete')),
  stripe_session_id text UNIQUE,
  request_params jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (billing_interval <> 'year' OR type = 'leisure')
);
CREATE UNIQUE INDEX business_checkout_one_pending ON public.business_checkout_attempts(type, listing_id)
  WHERE state IN ('creating', 'open', 'complete');
ALTER TABLE public.business_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.business_checkout_attempts TO service_role;

CREATE FUNCTION public.prepare_business_checkout(p_owner uuid, p_type text, p_listing uuid, p_interval text, p_request jsonb)
RETURNS public.business_checkout_attempts LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE attempt public.business_checkout_attempts; attempt_id uuid := gen_random_uuid();
BEGIN
  IF p_type NOT IN ('leisure','housing') OR p_interval NOT IN ('month','year') OR (p_type='housing' AND p_interval='year')
    THEN RAISE EXCEPTION 'invalid_business_billing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('business_checkout:' || p_type || ':' || p_listing, 0));
  IF (p_type='leisure' AND NOT EXISTS(SELECT 1 FROM public.leisure_spots WHERE id=p_listing AND owner_id=p_owner))
     OR (p_type='housing' AND NOT EXISTS(SELECT 1 FROM public.accommodations WHERE id=p_listing AND owner_id=p_owner))
    THEN RAISE EXCEPTION 'listing_not_owned'; END IF;
  SELECT * INTO attempt FROM public.business_checkout_attempts
    WHERE type=p_type AND listing_id=p_listing AND state IN ('creating','open','complete') FOR UPDATE;
  IF FOUND THEN
    IF attempt.owner_id <> p_owner THEN RAISE EXCEPTION 'checkout_owner_mismatch'; END IF;
    RETURN attempt;
  END IF;
  IF EXISTS(SELECT 1 FROM public.business_subscriptions WHERE type=p_type AND listing_id=p_listing
    AND status IN ('active','trialing','past_due','unpaid','incomplete')) THEN RAISE EXCEPTION 'business_subscription_exists'; END IF;
  -- No inventory is held. A 23h expiry preserves Stripe's minimum 30-minute
  -- creation window throughout our 20h safe idempotency-recovery window.
  p_request := p_request || jsonb_build_object('expires_at', floor(extract(epoch FROM now()+interval '23 hours'))::bigint);
  p_request := jsonb_set(p_request, '{metadata}', coalesce(p_request->'metadata','{}'::jsonb) || jsonb_build_object('checkout_attempt_id',attempt_id));
  p_request := jsonb_set(p_request, '{subscription_data}', coalesce(p_request->'subscription_data','{}'::jsonb) || jsonb_build_object('metadata',coalesce(p_request#>'{subscription_data,metadata}','{}'::jsonb) || jsonb_build_object('checkout_attempt_id',attempt_id)));
  INSERT INTO public.business_checkout_attempts(id,owner_id,type,listing_id,billing_interval,request_params)
    VALUES(attempt_id,p_owner,p_type,p_listing,p_interval,p_request) RETURNING * INTO attempt;
  RETURN attempt;
END;
$function$;
REVOKE ALL ON FUNCTION public.prepare_business_checkout(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_business_checkout(uuid,text,uuid,text,jsonb) TO service_role;

-- Reconcile the whole listing rather than letting an old monthly cancellation
-- hide a listing that is now covered by another paid subscription.
CREATE FUNCTION public.reconcile_business_listing(p_type text, p_listing uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE covered_id uuid;
BEGIN
  IF p_type NOT IN ('leisure','housing') THEN RAISE EXCEPTION 'invalid_business_type'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('business_coverage:' || p_type || ':' || p_listing, 0));
  SELECT id INTO covered_id FROM public.business_subscriptions
    WHERE type=p_type AND listing_id=p_listing AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
    ORDER BY current_period_end DESC NULLS LAST, created_at DESC LIMIT 1;
  IF p_type='leisure' THEN
    UPDATE public.leisure_spots SET is_paid=(covered_id IS NOT NULL),subscription_id=covered_id WHERE id=p_listing;
  ELSE
    UPDATE public.accommodations SET is_paid=(covered_id IS NOT NULL),subscription_id=covered_id WHERE id=p_listing;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.reconcile_business_listing(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_business_listing(text,uuid) TO service_role;

-- Preserve the deployed admin/MFA guards, grants, and all other metrics.
DO $migration$
DECLARE definition text; original text;
BEGIN
  SELECT pg_get_functiondef('public.admin_monetization_summary(jsonb)'::regprocedure) INTO original;
  definition := regexp_replace(original,
    '\(v_business_leisure \* v_pricing_biz_l\)\s*\+\s*\(v_business_housing \* v_pricing_biz_h\)',
    $replacement$(SELECT coalesce(sum(
      coalesce(amount_cents::numeric / 100,
        CASE WHEN billing_interval = 'year' THEN 100
          WHEN type = 'leisure' THEN v_pricing_biz_l ELSE v_pricing_biz_h END)
      / CASE WHEN billing_interval = 'year' THEN 12 ELSE 1 END
    ), 0) FROM public.business_subscriptions WHERE status = 'active')$replacement$);
  IF definition = original THEN RAISE EXCEPTION 'Unexpected monetization definition'; END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef('public.admin_kpis_summary(integer)'::regprocedure) INTO original;
  definition := replace(original,
    'v_mrr := (v_total_student * 4.99) + (v_total_premium * 9.99) + (v_total_business * 9.99);',
    'v_mrr := (public.admin_monetization_summary(''{}''::jsonb)->>''mrr_normalized'')::numeric;');
  IF definition = original THEN RAISE EXCEPTION 'Unexpected KPI definition'; END IF;
  EXECUTE definition;
END;
$migration$;
