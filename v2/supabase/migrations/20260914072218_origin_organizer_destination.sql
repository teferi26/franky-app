-- Preserve historical platform charges. Only newly inserted orders use Connect.
ALTER TABLE public.origin_event_orders
 ADD COLUMN routing_version smallint NOT NULL DEFAULT 1,
 ADD COLUMN organizer_id uuid,
 ADD COLUMN destination_account text,
 ADD COLUMN application_fee_cents integer,
 ADD COLUMN payment_issue text;
ALTER TABLE public.origin_event_orders ALTER COLUMN routing_version SET DEFAULT 2;
ALTER TABLE public.origin_event_orders ADD CONSTRAINT origin_order_destination_integrity CHECK (
 routing_version IN (1,2) AND (routing_version=1 OR (
  organizer_id IS NOT NULL AND destination_account ~ '^acct_[a-zA-Z0-9]+$'
  AND destination_account IS NOT NULL AND destination_account<>stripe_account
  AND (application_fee_cents IS NULL OR (application_fee_cents>=0 AND application_fee_cents<amount_cents))
  AND (checkout_params IS NULL OR application_fee_cents IS NOT NULL)
 ))
);

CREATE FUNCTION public.guard_origin_order_destination() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owner_id uuid; destination text;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT organizer_id INTO owner_id FROM public.events WHERE id=NEW.event_id FOR SHARE;
  SELECT stripe_connect_account_id INTO destination FROM public.connect_accounts
   WHERE user_id=owner_id AND charges_enabled IS TRUE AND payouts_enabled IS TRUE
    AND transfers_status='active' AND onboarding_status='active' FOR SHARE;
  IF destination IS NULL OR destination=NEW.stripe_account THEN
   RAISE EXCEPTION 'El organizador debe activar su cuenta de cobro antes de vender entradas';
  END IF;
  -- The database, never the browser or partner payload, resolves the recipient.
  NEW.routing_version:=2; NEW.organizer_id:=owner_id;
  NEW.destination_account:=destination; NEW.application_fee_cents:=NULL;
  IF NEW.checkout_params IS NOT NULL THEN RAISE EXCEPTION 'Checkout must be frozen separately'; END IF;
 ELSE
  IF ROW(NEW.routing_version,NEW.organizer_id,NEW.destination_account,NEW.stripe_account,NEW.livemode,NEW.event_id)
    IS DISTINCT FROM ROW(OLD.routing_version,OLD.organizer_id,OLD.destination_account,OLD.stripe_account,OLD.livemode,OLD.event_id) THEN
   RAISE EXCEPTION 'Payment routing is immutable';
  END IF;
  IF OLD.checkout_params IS NOT NULL AND ROW(NEW.checkout_params,NEW.application_fee_cents,NEW.amount_cents,NEW.currency)
    IS DISTINCT FROM ROW(OLD.checkout_params,OLD.application_fee_cents,OLD.amount_cents,OLD.currency) THEN
   RAISE EXCEPTION 'Frozen payment is immutable';
  END IF;
  IF OLD.routing_version=1 AND NEW.checkout_params IS DISTINCT FROM OLD.checkout_params THEN
   RAISE EXCEPTION 'Historical checkout cannot be created again';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_origin_order_destination() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_origin_order_destination BEFORE INSERT OR UPDATE ON public.origin_event_orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_origin_order_destination();

CREATE OR REPLACE FUNCTION public.freeze_origin_checkout(p_id uuid,p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.origin_event_orders%ROWTYPE; fee integer;
BEGIN
 SELECT * INTO o FROM public.origin_event_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR o.status<>'pending' THEN RETURN NULL; END IF;
 IF o.routing_version<>2 THEN RAISE EXCEPTION 'Esta solicitud ha terminado. Inicia una nueva compra'; END IF;
 IF o.checkout_params IS NOT NULL THEN RETURN o.checkout_params; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.events e JOIN public.connect_accounts c ON c.user_id=e.organizer_id
   WHERE e.id=o.event_id AND e.organizer_id=o.organizer_id AND c.stripe_connect_account_id=o.destination_account
   AND c.charges_enabled IS TRUE AND c.payouts_enabled IS TRUE AND c.transfers_status='active' AND c.onboarding_status='active') THEN
  RAISE EXCEPTION 'El organizador debe activar su cuenta de cobro antes de vender entradas';
 END IF;
 IF p_params IS NULL OR p_params->>'mode' IS DISTINCT FROM 'payment'
   OR p_params#>>'{metadata,mode}' IS DISTINCT FROM 'origin_event'
   OR p_params#>>'{metadata,order_id}' IS DISTINCT FROM o.id::text
   OR p_params#>>'{metadata,event_id}' IS DISTINCT FROM o.event_id::text
   OR p_params#>>'{payment_intent_data,metadata,order_id}' IS DISTINCT FROM o.id::text
   OR p_params#>'{payment_intent_data,transfer_data}' IS DISTINCT FROM jsonb_build_object('destination',o.destination_account)
   OR p_params#>'{payment_intent_data,on_behalf_of}' IS NOT NULL
   OR jsonb_typeof(p_params#>'{payment_intent_data,application_fee_amount}') IS DISTINCT FROM 'number'
   OR jsonb_array_length(p_params->'line_items') IS DISTINCT FROM 1
   OR p_params#>>'{line_items,0,quantity}' IS DISTINCT FROM '1'
   OR p_params#>>'{line_items,0,price_data,unit_amount}' IS DISTINCT FROM o.amount_cents::text
   OR p_params#>>'{line_items,0,price_data,currency}' IS DISTINCT FROM o.currency
   OR p_params->'payment_method_types' IS DISTINCT FROM '["card"]'::jsonb
   OR p_params ? 'discounts' OR p_params ? 'allow_promotion_codes' OR p_params ? 'automatic_tax'
 THEN RAISE EXCEPTION 'Checkout destination or amount mismatch'; END IF;
 fee:=(p_params#>>'{payment_intent_data,application_fee_amount}')::integer;
 IF fee<0 OR fee>=o.amount_cents THEN RAISE EXCEPTION 'Invalid organizer fee'; END IF;
 UPDATE public.origin_event_orders SET checkout_params=p_params,application_fee_cents=fee WHERE id=p_id;
 RETURN p_params;
END $$;
REVOKE ALL ON FUNCTION public.freeze_origin_checkout(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_origin_checkout(uuid,jsonb) TO service_role;

CREATE FUNCTION public.flag_origin_payment_issue(p_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.origin_event_orders%ROWTYPE;
BEGIN
 IF p_reason NOT IN ('Payment destination mismatch','Organizer transfer missing','Organizer transfer mismatch') OR p_reason IS NULL THEN
  RAISE EXCEPTION 'Invalid payment issue';
 END IF;
 -- First failure per new order only: webhook retries must not flood the staff inbox.
 UPDATE public.origin_event_orders SET payment_issue=p_reason
  WHERE id=p_id AND routing_version=2 AND payment_issue IS NULL RETURNING * INTO o;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM public.dispatch_staff_alert('otro','ORIGIN: revisar destinatario de un cobro',
  'Se ha detectado un cobro cuya transferencia al organizador no se pudo verificar. Revisar el pedido en Stripe antes de realizar cualquier ajuste.',
  jsonb_build_object('order_id',o.id,'event_id',o.event_id,'reason',p_reason));
END $$;
REVOKE ALL ON FUNCTION public.flag_origin_payment_issue(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flag_origin_payment_issue(uuid,text) TO service_role;
-- Old application instances fail closed at freeze: platform-only parameters are rejected.
GRANT EXECUTE ON FUNCTION public.prepare_origin_event_order(uuid,uuid,text,text,text,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_origin_discount_order(uuid,uuid,text,text,text,text,text,text,boolean,text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
