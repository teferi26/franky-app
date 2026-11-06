-- Remote Checkout has a durable lifecycle independent from money received.
CREATE TABLE public.payment_checkout_state (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('legacy','prepared','creating','open','closing','closed','complete','review')),
  request_params jsonb,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '35 minutes',
  fulfilled_at timestamptz,
  issue text,
  discount_released boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_checkout_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_checkout_state FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payment_checkout_state TO service_role;
INSERT INTO public.payment_checkout_state(payment_id,state,expires_at)
SELECT id,'legacy',created_at+interval '35 minutes' FROM public.payments
WHERE status IN ('pending','processing');
-- Only backend/webhooks create subscriptions; a customer reference is authority.
DROP POLICY IF EXISTS "Owners insert own business subs" ON public.business_subscriptions;
REVOKE INSERT,UPDATE,DELETE ON public.business_subscriptions FROM anon,authenticated;

-- All writers use domain-parent -> resource -> payment -> checkout state.
CREATE OR REPLACE FUNCTION public.lock_marketplace_resource(p_type text,p_resource uuid,p_parent uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_parent uuid;
BEGIN
  IF p_type='ticket' THEN
    SELECT event_id INTO v_parent FROM public.event_tickets WHERE id=p_resource;
    PERFORM 1 FROM public.events WHERE id=coalesce(v_parent,p_parent) FOR UPDATE;
    PERFORM 1 FROM public.event_tickets WHERE id=p_resource FOR UPDATE;
  ELSIF p_type='visit' THEN
    SELECT slot_id INTO v_parent FROM public.visit_bookings WHERE id=p_resource;
    PERFORM 1 FROM public.visit_slots WHERE id=coalesce(v_parent,p_parent) FOR UPDATE;
    PERFORM 1 FROM public.visit_bookings WHERE id=p_resource FOR UPDATE;
  ELSIF p_type='rent' THEN
    PERFORM 1 FROM public.contracts WHERE id=p_resource FOR UPDATE;
  ELSE RAISE EXCEPTION 'invalid_payment_type'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.lock_marketplace_resource(text,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.prepare_marketplace_payment(
  p_type text,p_resource_id uuid,p_buyer_id uuid,p_kind text,p_code text,
  p_expected_amount integer,p_fee integer,p_connect_account text,p_fee_breakdown jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ticket public.event_tickets%ROWTYPE; v_visit public.visit_bookings%ROWTYPE;
 v_contract public.contracts%ROWTYPE; v_code public.event_discount_codes%ROWTYPE;
 v_existing public.payments%ROWTYPE; v_payment public.payments%ROWTYPE;
 v_state public.payment_checkout_state%ROWTYPE; v_seller uuid; v_parent uuid; v_amount integer;
 v_discount integer:=0; v_ref uuid; v_table text; v_meta jsonb:='{}'; v_count integer;
BEGIN
  IF p_buyer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_buyer_id AND is_discarded IS NOT TRUE) THEN
    RAISE EXCEPTION 'auth_required'; END IF;
  IF p_type='rent' AND (p_kind IS NULL OR p_kind NOT IN ('rent','deposit','both')) THEN RAISE EXCEPTION 'invalid_payment_kind'; END IF;
  PERFORM public.lock_marketplace_resource(p_type,p_resource_id);
  IF p_type='ticket' AND NOT EXISTS(SELECT 1 FROM public.event_tickets t JOIN public.events e ON e.id=t.event_id
    WHERE t.id=p_resource_id AND t.holder_id=p_buyer_id AND t.status='pending_payment'
      AND e.status IN('upcoming','ongoing') AND e.start_date>now() AND coalesce(e.payment_mode,'app')='app') THEN
    RAISE EXCEPTION 'ticket_not_payable'; END IF;
  IF p_type='rent' AND NOT EXISTS(SELECT 1 FROM public.contracts c JOIN public.contract_signers s ON s.contract_id=c.id
    WHERE c.id=p_resource_id AND c.status='fully_signed' AND s.user_id=p_buyer_id AND s.role='tenant' AND s.status='signed') THEN
    RAISE EXCEPTION 'rent_not_payable'; END IF;
  IF p_type='visit' AND NOT EXISTS(SELECT 1 FROM public.visit_bookings b JOIN public.visit_slots s ON s.id=b.slot_id
    WHERE b.id=p_resource_id AND b.visitor_id=p_buyer_id AND b.status='pending' AND b.payment_status='pending'
      AND s.status IN('open','closed') AND (s.slot_date+s.end_time) AT TIME ZONE 'Europe/Madrid'>now()) THEN
    RAISE EXCEPTION 'visit_not_payable'; END IF;
  -- Reuse before consuming a discount or changing any order. Overlapping rent
  -- obligations are exclusive across all tenants, including the legacy one-off rent.
  SELECT count(*) INTO v_count FROM public.payments p WHERE p.type=p_type
    AND (CASE WHEN p_type='rent' THEN p.metadata->>'contract_id'=p_resource_id::text
      AND (p_kind='both' OR p.metadata->>'kind' IN (p_kind,'both')) ELSE p.ref_id=p_resource_id END)
    AND p.status NOT IN ('canceled','failed');
  IF v_count>1 THEN RAISE EXCEPTION 'payment_requires_reconciliation'; END IF;
  SELECT * INTO v_existing FROM public.payments p WHERE p.type=p_type
    AND (CASE WHEN p_type='rent' THEN p.metadata->>'contract_id'=p_resource_id::text
      AND (p_kind='both' OR p.metadata->>'kind' IN (p_kind,'both')) ELSE p.ref_id=p_resource_id END)
    AND p.status NOT IN ('canceled','failed') ORDER BY p.created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_existing.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'payment_already_reserved'; END IF;
    IF v_existing.status NOT IN ('pending','processing') THEN RAISE EXCEPTION 'payment_already_received'; END IF;
    IF v_existing.amount_cents IS DISTINCT FROM p_expected_amount
      OR lower(coalesce(v_existing.metadata->>'discount_code',''))<>lower(coalesce(trim(p_code),''))
      OR (p_type='rent' AND v_existing.metadata->>'kind'<>p_kind) THEN RAISE EXCEPTION 'checkout_conflict'; END IF;
    INSERT INTO public.payment_checkout_state(payment_id,state,expires_at)
    VALUES(v_existing.id,'legacy',v_existing.created_at+interval '35 minutes') ON CONFLICT DO NOTHING;
    SELECT * INTO v_state FROM public.payment_checkout_state WHERE payment_id=v_existing.id;
    IF v_state.state IN ('closing','closed','review') THEN RAISE EXCEPTION 'payment_requires_reconciliation'; END IF;
    RETURN jsonb_build_object('payment',to_jsonb(v_existing),'checkout',to_jsonb(v_state),'reused',true);
  END IF;
  -- A closed financial marker alone cannot prove its remote session is closed.
  IF EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state s ON s.payment_id=p.id
    WHERE p.type=p_type AND (CASE WHEN p_type='rent' THEN p.metadata->>'contract_id'=p_resource_id::text
      AND (p_kind='both' OR p.metadata->>'kind' IN(p_kind,'both')) ELSE p.ref_id=p_resource_id END)
    AND p.status IN('canceled','failed') AND (p.stripe_checkout_session_id IS NOT NULL OR s.request_params IS NOT NULL)
    AND coalesce(s.state,'legacy')<>'closed') THEN RAISE EXCEPTION 'payment_requires_reconciliation'; END IF;
  IF p_type='ticket' THEN
    SELECT * INTO v_ticket FROM public.event_tickets WHERE id=p_resource_id;
    IF NOT FOUND OR v_ticket.holder_id<>p_buyer_id OR v_ticket.status<>'pending_payment'
      OR coalesce(v_ticket.reserved_until,v_ticket.created_at+public.ticket_hold_window())<=now() THEN
      RAISE EXCEPTION 'ticket_not_payable'; END IF;
    SELECT organizer_id INTO v_seller FROM public.events WHERE id=v_ticket.event_id AND status IN('upcoming','ongoing') AND start_date>now();
    IF v_seller IS NULL OR v_seller=p_buyer_id THEN RAISE EXCEPTION 'ticket_not_payable'; END IF;
    v_amount:=v_ticket.price_cents; v_parent:=v_ticket.event_id; v_ref:=v_ticket.id; v_table:='event_tickets';
    IF nullif(trim(p_code),'') IS NOT NULL THEN
      SELECT * INTO v_code FROM public.event_discount_codes WHERE event_id=v_ticket.event_id AND lower(code)=lower(trim(p_code)) FOR UPDATE;
      IF NOT FOUND OR (v_code.expires_at IS NOT NULL AND v_code.expires_at<=now())
        OR (v_code.max_uses IS NOT NULL AND v_code.used_count>=v_code.max_uses) THEN RAISE EXCEPTION 'discount_unavailable'; END IF;
      v_discount:=least(v_amount,greatest(0,CASE WHEN v_code.kind='percent' THEN (v_amount::bigint*v_code.value/100)::integer ELSE v_code.value END));
      v_amount:=v_amount-v_discount;
      v_meta:=jsonb_build_object('discount_code',trim(p_code),'discount_code_id',v_code.id,'discount_cents',v_discount,
        'price_cents_before_discount',v_ticket.price_cents);
    END IF;
    v_meta:=v_meta||jsonb_build_object('kind','ticket','event_id',v_parent,'free_by_code',v_amount=0);
  ELSIF p_type='visit' THEN
    SELECT * INTO v_visit FROM public.visit_bookings WHERE id=p_resource_id;
    IF NOT FOUND OR v_visit.visitor_id<>p_buyer_id OR v_visit.status<>'pending' OR v_visit.payment_status<>'pending' THEN
      RAISE EXCEPTION 'visit_not_payable'; END IF;
    SELECT owner_id INTO v_seller FROM public.visit_slots WHERE id=v_visit.slot_id;
    v_amount:=v_visit.price_cents;v_parent:=v_visit.slot_id;v_ref:=v_visit.id;v_table:='visit_bookings';
    v_meta:=jsonb_build_object('kind','visit','slot_id',v_parent);
  ELSE
    SELECT * INTO v_contract FROM public.contracts WHERE id=p_resource_id;
    IF NOT FOUND OR v_contract.status<>'fully_signed' OR NOT EXISTS(SELECT 1 FROM public.contract_signers
      WHERE contract_id=p_resource_id AND user_id=p_buyer_id AND role='tenant' AND status='signed') THEN RAISE EXCEPTION 'rent_not_payable'; END IF;
    v_seller:=v_contract.owner_id;v_ref:=v_contract.accommodation_id;v_table:='accommodations';
    v_amount:=CASE WHEN p_kind='rent' THEN coalesce(v_contract.rent_cents,0)
      WHEN p_kind='deposit' THEN coalesce(v_contract.deposit_cents,0)
      ELSE coalesce(v_contract.rent_cents,0)+coalesce(v_contract.deposit_cents,0) END;
    v_meta:=jsonb_build_object('kind',p_kind,'contract_id',p_resource_id);
  END IF;
  IF v_amount IS DISTINCT FROM p_expected_amount OR p_fee IS NULL OR p_fee<0 OR p_fee>v_amount
    OR (v_amount<50 AND NOT(p_type='ticket' AND v_amount=0 AND v_discount>0)) THEN RAISE EXCEPTION 'payment_quote_changed'; END IF;
  IF v_amount>0 AND NOT EXISTS(SELECT 1 FROM public.connect_accounts WHERE user_id=v_seller
    AND stripe_connect_account_id=p_connect_account AND charges_enabled IS TRUE) THEN RAISE EXCEPTION 'seller_not_ready'; END IF;
  IF p_fee_breakdown IS NOT NULL THEN
    IF coalesce((p_fee_breakdown->>'franky_fee_cents')::integer,-1)<0
      OR coalesce((p_fee_breakdown->>'stripe_fee_cents')::integer,-1)<0
      OR (p_fee_breakdown->>'franky_fee_cents')::integer+(p_fee_breakdown->>'stripe_fee_cents')::integer<>p_fee THEN
      RAISE EXCEPTION 'invalid_fee_breakdown'; END IF;
    v_meta:=v_meta||jsonb_build_object('franky_fee_cents',(p_fee_breakdown->>'franky_fee_cents')::integer,
      'stripe_fee_cents',(p_fee_breakdown->>'stripe_fee_cents')::integer);
  END IF;
  INSERT INTO public.payments(type,buyer_id,seller_id,ref_table,ref_id,amount_cents,application_fee_cents,
    currency,stripe_connect_account_id,status,metadata)
  VALUES(p_type,p_buyer_id,v_seller,v_table,v_ref,v_amount,p_fee,'eur',p_connect_account,'pending',v_meta) RETURNING * INTO v_payment;
  INSERT INTO public.payment_checkout_state(payment_id) VALUES(v_payment.id) RETURNING * INTO v_state;
  IF v_discount>0 THEN UPDATE public.event_discount_codes SET used_count=used_count+1 WHERE id=v_code.id; END IF;
  IF p_type='ticket' THEN UPDATE public.event_tickets SET order_id=v_payment.id,reserved_until=v_state.expires_at+interval '5 minutes' WHERE id=p_resource_id;
  ELSIF p_type='visit' THEN UPDATE public.visit_bookings SET order_id=v_payment.id WHERE id=p_resource_id; END IF;
  RETURN jsonb_build_object('payment',to_jsonb(v_payment),'checkout',to_jsonb(v_state),'reused',false);
END $$;
REVOKE ALL ON FUNCTION public.prepare_marketplace_payment(text,uuid,uuid,text,text,integer,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_marketplace_payment(text,uuid,uuid,text,text,integer,integer,text,jsonb) TO service_role;

-- Freeze the exact remote request once. Retries never construct a different
-- amount, expiry, customer, label or idempotency key for the same order.
CREATE OR REPLACE FUNCTION public.freeze_marketplace_checkout(p_order uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_state public.payment_checkout_state%ROWTYPE;
BEGIN
  SELECT * INTO v_state FROM public.payment_checkout_state WHERE payment_id=p_order FOR UPDATE;
  IF NOT FOUND OR v_state.state NOT IN('prepared','creating','open') THEN RAISE EXCEPTION 'checkout_not_creatable'; END IF;
  IF v_state.request_params IS NULL THEN
    UPDATE public.payment_checkout_state SET request_params=p_request,state='creating',updated_at=now() WHERE payment_id=p_order RETURNING * INTO v_state;
  END IF;
  RETURN to_jsonb(v_state);
END $$;
REVOKE ALL ON FUNCTION public.freeze_marketplace_checkout(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_marketplace_checkout(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_marketplace_checkout(p_order uuid,p_session text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id text;
BEGIN
  SELECT stripe_checkout_session_id INTO v_id FROM public.payments WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR (v_id IS NOT NULL AND v_id<>p_session) OR p_session IS NULL THEN RAISE EXCEPTION 'checkout_identity_mismatch'; END IF;
  UPDATE public.payments SET stripe_checkout_session_id=p_session WHERE id=p_order;
  UPDATE public.payment_checkout_state SET state=CASE WHEN state IN('prepared','creating','legacy') THEN 'open' ELSE state END,
    updated_at=now() WHERE payment_id=p_order;
END $$;
REVOKE ALL ON FUNCTION public.attach_marketplace_checkout(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_marketplace_checkout(uuid,text) TO service_role;

-- Financial confirmation, entitlement and notifications commit together. A
-- webhook retry also repairs historical succeeded orders without a receipt.
CREATE OR REPLACE FUNCTION public.settle_marketplace_payment(
 p_order uuid,p_intent text,p_charge text,p_session text,p_amount integer,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.payments%ROWTYPE; s public.payment_checkout_state%ROWTYPE;
 t public.event_tickets%ROWTYPE; b public.visit_bookings%ROWTYPE; v_issue text; v_target uuid;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_missing'; END IF;
 v_target:=CASE WHEN p.type='rent' THEN (p.metadata->>'contract_id')::uuid ELSE p.ref_id END;
 PERFORM public.lock_marketplace_resource(p.type,v_target,coalesce(p.metadata->>'event_id',p.metadata->>'slot_id')::uuid);
 SELECT * INTO p FROM public.payments WHERE id=p_order FOR UPDATE;
 IF p.amount_cents IS DISTINCT FROM p_amount OR p.currency IS DISTINCT FROM lower(p_currency)
  OR (p.amount_cents>0 AND p_intent IS NULL)
  OR (p.amount_cents=0 AND coalesce(p.metadata->>'free_by_code','false')<>'true')
  OR (p.stripe_payment_intent_id IS NOT NULL AND p_intent IS DISTINCT FROM p.stripe_payment_intent_id)
  OR (p.stripe_checkout_session_id IS NOT NULL AND p_session IS NOT NULL AND p.stripe_checkout_session_id<>p_session)
 THEN RAISE EXCEPTION 'payment_confirmation_mismatch'; END IF;
 INSERT INTO public.payment_checkout_state(payment_id,state) VALUES(p_order,'legacy') ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.payment_checkout_state WHERE payment_id=p_order FOR UPDATE;
 UPDATE public.payments SET stripe_payment_intent_id=coalesce(p_intent,stripe_payment_intent_id),
  stripe_charge_id=coalesce(p_charge,stripe_charge_id),stripe_checkout_session_id=coalesce(p_session,stripe_checkout_session_id)
 WHERE id=p_order;
 IF p.status='refunded' OR s.fulfilled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'reused',true); END IF;
 IF p.type='ticket' THEN
  SELECT * INTO t FROM public.event_tickets WHERE id=p.ref_id;
  IF NOT FOUND OR t.order_id IS DISTINCT FROM p.id OR t.status='refunded' OR p.buyer_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.events WHERE id=t.event_id AND status<>'cancelled') THEN v_issue:='paid_ticket_needs_review';
  ELSE
   -- Never revive a used/transferred/resale ticket or reset attendance.
   UPDATE public.event_tickets SET status='valid' WHERE id=t.id AND status='pending_payment';
   INSERT INTO public.event_participants(event_id,user_id,status) VALUES(t.event_id,p.buyer_id,'registered')
    ON CONFLICT(event_id,user_id) DO NOTHING;
  END IF;
 ELSIF p.type='visit' THEN
  SELECT * INTO b FROM public.visit_bookings WHERE id=p.ref_id;
  IF NOT FOUND OR b.order_id IS DISTINCT FROM p.id OR b.status NOT IN('pending','confirmed','completed')
    OR p.buyer_id IS NULL OR p.seller_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.visit_slots WHERE id=b.slot_id AND status IN('open','closed')) THEN
   v_issue:='paid_visit_needs_review';
   UPDATE public.visit_bookings SET payment_status='paid' WHERE id=p.ref_id AND order_id=p.id AND payment_status<>'refunded';
  ELSE
   UPDATE public.visit_bookings SET payment_status='paid',status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END WHERE id=b.id;
   INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(p.seller_id,'visit','Visita pagada y confirmada',
    'Tienes una visita confirmada. Consulta los detalles en tu agenda.',
    jsonb_build_object('kind','visit_paid','booking_id',b.id,'url','/propietario/dashboard/visitas'));
  END IF;
 END IF;
 UPDATE public.payments SET status=CASE WHEN refunded_cents>0 THEN 'partially_refunded' ELSE 'succeeded' END WHERE id=p_order;
 UPDATE public.payment_checkout_state SET state=CASE WHEN v_issue IS NULL THEN 'complete' ELSE 'review' END,
  fulfilled_at=now(),issue=v_issue,updated_at=now() WHERE payment_id=p_order;
 IF p.buyer_id IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(p.buyer_id,'payment',
  CASE WHEN v_issue IS NULL THEN 'Pago confirmado' ELSE 'Pago recibido: estamos revisando tu reserva' END,
  CASE WHEN v_issue IS NULL THEN 'Tu pago se ha completado correctamente.' ELSE 'Hemos recibido el pago, pero la reserva necesita revisión. Contacta con soporte desde Ayuda.' END,
  jsonb_build_object('kind','payment_succeeded','payment_id',p_order));
 END IF;
 RETURN jsonb_build_object('ok',true,'review',v_issue IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.settle_marketplace_payment(uuid,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_marketplace_payment(uuid,text,text,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_marketplace_payment(
 p_order uuid,p_intent text,p_charge text,p_amount integer,p_currency text,p_refunded integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.payments%ROWTYPE; v_refund integer;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_missing'; END IF;
 PERFORM public.lock_marketplace_resource(p.type,CASE WHEN p.type='rent' THEN (p.metadata->>'contract_id')::uuid ELSE p.ref_id END,
  coalesce(p.metadata->>'event_id',p.metadata->>'slot_id')::uuid);
 SELECT * INTO p FROM public.payments WHERE id=p_order FOR UPDATE;
 IF p.amount_cents IS DISTINCT FROM p_amount OR p.currency IS DISTINCT FROM lower(p_currency) OR p_intent IS NULL
  OR (p.stripe_payment_intent_id IS NOT NULL AND p.stripe_payment_intent_id<>p_intent)
  OR p_refunded IS NULL OR p_refunded<0 OR p_refunded>p.amount_cents THEN RAISE EXCEPTION 'refund_confirmation_mismatch'; END IF;
 v_refund:=greatest(p.refunded_cents,p_refunded);
 IF v_refund=0 THEN RETURN; END IF;
 UPDATE public.payments SET refunded_cents=v_refund,
  status=CASE WHEN v_refund>=amount_cents THEN 'refunded' ELSE 'partially_refunded' END,
  stripe_payment_intent_id=p_intent,stripe_charge_id=coalesce(p_charge,stripe_charge_id) WHERE id=p_order;
 IF v_refund>=p.amount_cents THEN
  IF p.type='ticket' THEN
   UPDATE public.event_tickets SET status='refunded' WHERE id=p.ref_id AND order_id=p.id AND status NOT IN('used','transferred');
  ELSIF p.type='visit' THEN
   UPDATE public.visit_bookings SET payment_status='refunded',
    status=CASE WHEN status IN('pending','confirmed') THEN 'cancelled_by_owner' ELSE status END WHERE id=p.ref_id AND order_id=p.id;
  END IF;
  INSERT INTO public.payment_checkout_state(payment_id,state,fulfilled_at) VALUES(p.id,'complete',now())
   ON CONFLICT(payment_id) DO UPDATE SET state='complete',fulfilled_at=coalesce(payment_checkout_state.fulfilled_at,now()),updated_at=now();
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.refund_marketplace_payment(uuid,text,text,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_marketplace_payment(uuid,text,text,integer,text,integer) TO service_role;

-- Closing is two-phase: prevent creation, then confirm remote expiry. Never
-- release a resource merely because its local clock or status says expired.
CREATE OR REPLACE FUNCTION public.begin_marketplace_close(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.payments%ROWTYPE; s public.payment_checkout_state%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_missing'; END IF;
 PERFORM public.lock_marketplace_resource(p.type,CASE WHEN p.type='rent' THEN (p.metadata->>'contract_id')::uuid ELSE p.ref_id END,
  coalesce(p.metadata->>'event_id',p.metadata->>'slot_id')::uuid);
 SELECT * INTO p FROM public.payments WHERE id=p_order FOR UPDATE;
 IF p.status NOT IN('pending','processing','failed','canceled') THEN RAISE EXCEPTION 'payment_already_received'; END IF;
 INSERT INTO public.payment_checkout_state(payment_id,state,expires_at) VALUES(p.id,'legacy',p.created_at+interval '35 minutes') ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.payment_checkout_state WHERE payment_id=p.id FOR UPDATE;
 IF s.state='legacy' AND p.stripe_checkout_session_id IS NULL THEN
  UPDATE public.payment_checkout_state SET state='review',issue='legacy_unknown_checkout',updated_at=now() WHERE payment_id=p.id RETURNING * INTO s;
 ELSIF s.state NOT IN('closed','review','complete') THEN
  UPDATE public.payment_checkout_state SET state='closing',updated_at=now() WHERE payment_id=p.id RETURNING * INTO s;
 END IF;
 RETURN jsonb_build_object('payment',to_jsonb(p),'checkout',to_jsonb(s));
END $$;
REVOKE ALL ON FUNCTION public.begin_marketplace_close(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_marketplace_close(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_marketplace_close(p_order uuid,p_expired_session text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.payments%ROWTYPE; s public.payment_checkout_state%ROWTYPE; v_other boolean;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_missing'; END IF;
 PERFORM public.lock_marketplace_resource(p.type,CASE WHEN p.type='rent' THEN (p.metadata->>'contract_id')::uuid ELSE p.ref_id END,
  coalesce(p.metadata->>'event_id',p.metadata->>'slot_id')::uuid);
 SELECT * INTO p FROM public.payments WHERE id=p_order FOR UPDATE;
 IF p.status NOT IN('pending','processing','failed','canceled') THEN RETURN jsonb_build_object('closed',false,'paid',true); END IF;
 INSERT INTO public.payment_checkout_state(payment_id,state) VALUES(p.id,'legacy') ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.payment_checkout_state WHERE payment_id=p.id FOR UPDATE;
 IF s.state='closed' THEN RETURN jsonb_build_object('closed',true); END IF;
 IF p_expired_session IS NULL THEN
  IF s.state<>'closing' OR s.request_params IS NOT NULL OR p.stripe_checkout_session_id IS NOT NULL OR s.issue IS NOT NULL THEN
   RAISE EXCEPTION 'remote_checkout_unconfirmed'; END IF;
 ELSE
  IF p.stripe_checkout_session_id IS NOT NULL AND p.stripe_checkout_session_id<>p_expired_session THEN RAISE EXCEPTION 'checkout_identity_mismatch'; END IF;
  UPDATE public.payments SET stripe_checkout_session_id=p_expired_session WHERE id=p.id;
 END IF;
 UPDATE public.payments SET status='canceled' WHERE id=p.id;
 IF NOT s.discount_released AND coalesce((p.metadata->>'discount_cents')::integer,0)>0
   AND nullif(p.metadata->>'discount_code_id','') IS NOT NULL THEN
  UPDATE public.event_discount_codes SET used_count=greatest(0,used_count-1) WHERE id=(p.metadata->>'discount_code_id')::uuid;
 ELSIF NOT s.discount_released AND coalesce((p.metadata->>'discount_cents')::integer,0)>0
   AND nullif(p.metadata->>'discount_code','') IS NOT NULL
   AND nullif(p.metadata->>'event_id','') IS NOT NULL THEN
  UPDATE public.event_discount_codes SET used_count=greatest(0,used_count-1)
   WHERE event_id=(p.metadata->>'event_id')::uuid AND lower(code)=lower(p.metadata->>'discount_code');
 END IF;
 UPDATE public.payment_checkout_state SET state='closed',discount_released=true,issue=NULL,updated_at=now() WHERE payment_id=p.id;
 IF p.type='ticket' THEN
  SELECT EXISTS(SELECT 1 FROM public.payments q LEFT JOIN public.payment_checkout_state x ON x.payment_id=q.id
   WHERE q.type='ticket' AND q.ref_id=p.ref_id AND q.id<>p.id AND coalesce(x.state,'legacy')<>'closed') INTO v_other;
  IF NOT v_other THEN DELETE FROM public.event_tickets WHERE id=p.ref_id AND status='pending_payment'; END IF;
 END IF;
 RETURN jsonb_build_object('closed',true);
END $$;
REVOKE ALL ON FUNCTION public.finish_marketplace_close(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_marketplace_close(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_ticket(p_ticket uuid,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.lock_marketplace_resource('ticket',p_ticket);
 IF NOT EXISTS(SELECT 1 FROM public.event_tickets WHERE id=p_ticket) THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.event_tickets WHERE id=p_ticket AND holder_id=p_actor AND status='pending_payment') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state s ON s.payment_id=p.id
   WHERE p.type='ticket' AND p.ref_id=p_ticket AND coalesce(s.state,'legacy')<>'closed') THEN RETURN false; END IF;
 DELETE FROM public.event_tickets WHERE id=p_ticket AND holder_id=p_actor AND status='pending_payment';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.cancel_unpaid_ticket(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_ticket(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ticket_has_unclosed_payment(p_ticket uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state s ON s.payment_id=p.id
  WHERE p.type='ticket' AND p.ref_id=p_ticket AND coalesce(s.state,'legacy')<>'closed');
$$;
REVOKE ALL ON FUNCTION public.ticket_has_unclosed_payment(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired_ticket_holds(p_event_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_event uuid; v_count integer:=0; v_deleted integer;
BEGIN
 FOR v_event IN SELECT id FROM public.events WHERE p_event_id IS NULL OR id=p_event_id ORDER BY id FOR UPDATE LOOP
  DELETE FROM public.event_tickets t WHERE t.event_id=v_event AND t.status='pending_payment'
   AND coalesce(t.reserved_until,t.created_at+public.ticket_hold_window())<=now()
   AND NOT public.ticket_has_unclosed_payment(t.id);
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  v_count:=v_count+v_deleted;
 END LOOP;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_ticket_holds(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.reserve_event_ticket(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); e public.events%ROWTYPE; t public.event_tickets%ROWTYPE; v_price integer; v_live integer;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'auth required'; END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND OR e.status NOT IN('upcoming','ongoing') OR e.start_date<=now() OR coalesce(e.price,0)<=0
  OR coalesce(e.payment_mode,'app')<>'app' OR e.organizer_id=v_user THEN RAISE EXCEPTION 'el evento no admite esta compra'; END IF;
 PERFORM public.purge_expired_ticket_holds(e.id);
 v_price:=round(e.price*100)::integer;
 SELECT * INTO t FROM public.event_tickets WHERE event_id=e.id AND holder_id=v_user AND status='pending_payment' ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  -- Once checkout is prepared its quoted price cannot change underneath it.
  IF NOT public.ticket_has_unclosed_payment(t.id) THEN
   UPDATE public.event_tickets SET price_cents=v_price WHERE id=t.id RETURNING * INTO t;
  END IF;
  RETURN jsonb_build_object('ticket_id',t.id,'price_cents',t.price_cents,'requires_payment',true,'reserved_until',t.reserved_until,'reused',true);
 END IF;
 SELECT count(*) INTO v_live FROM public.event_tickets x WHERE x.event_id=e.id AND
  (x.status IN('valid','used','listed_for_resale') OR (x.status='pending_payment' AND
   (coalesce(x.reserved_until,x.created_at+public.ticket_hold_window())>now() OR public.ticket_has_unclosed_payment(x.id))));
 IF e.max_capacity IS NOT NULL AND v_live>=e.max_capacity THEN RAISE EXCEPTION 'entradas agotadas'; END IF;
 INSERT INTO public.event_tickets(event_id,holder_id,original_buyer_id,qr_token,price_cents,status,reserved_until)
 VALUES(e.id,v_user,v_user,replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),v_price,'pending_payment',now()+public.ticket_hold_window()) RETURNING * INTO t;
 RETURN jsonb_build_object('ticket_id',t.id,'price_cents',t.price_cents,'requires_payment',true,'reserved_until',t.reserved_until,'reused',false);
END $$;
REVOKE ALL ON FUNCTION public.reserve_event_ticket(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_event_ticket(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_ticket_availability(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('event_id',e.id,'max_capacity',e.max_capacity,'sold',coalesce(t.paid,0)+coalesce(t.held,0),
  'paid',coalesce(t.paid,0),'held',coalesce(t.held,0),
  'sold_out',e.max_capacity IS NOT NULL AND coalesce(t.paid,0)+coalesce(t.held,0)>=e.max_capacity,
  'available',CASE WHEN e.max_capacity IS NULL THEN NULL ELSE greatest(0,e.max_capacity-coalesce(t.paid,0)-coalesce(t.held,0)) END)
 FROM public.events e LEFT JOIN LATERAL(
  SELECT count(*) FILTER(WHERE x.status IN('valid','used','listed_for_resale')) AS paid,
   count(*) FILTER(WHERE x.status='pending_payment' AND (coalesce(x.reserved_until,x.created_at+public.ticket_hold_window())>now()
    OR public.ticket_has_unclosed_payment(x.id))) AS held FROM public.event_tickets x WHERE x.event_id=e.id
 ) t ON true WHERE e.id=p_event_id;
$$;
REVOKE ALL ON FUNCTION public.get_event_ticket_availability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_availability(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.cancel_visit_booking(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); b public.visit_bookings%ROWTYPE; v_owner uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
 PERFORM public.lock_marketplace_resource('visit',p_booking_id);
 SELECT * INTO b FROM public.visit_bookings WHERE id=p_booking_id;
 SELECT owner_id INTO v_owner FROM public.visit_slots WHERE id=b.slot_id;
 IF b.id IS NULL OR (b.visitor_id<>v_user AND v_owner IS DISTINCT FROM v_user) THEN RAISE EXCEPTION 'reserva no encontrada'; END IF;
 IF b.status IN('cancelled_by_owner','cancelled_by_visitor') THEN RETURN jsonb_build_object('ok',true); END IF;
 IF b.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'la reserva ya no está activa'; END IF;
 IF EXISTS(SELECT 1 FROM public.payments p LEFT JOIN public.payment_checkout_state s ON s.payment_id=p.id
  WHERE p.type='visit' AND p.ref_id=b.id AND p.status IN('pending','processing','failed','canceled') AND coalesce(s.state,'legacy')<>'closed') THEN
  RAISE EXCEPTION 'Cierra el pago pendiente antes de cancelar la visita'; END IF;
 UPDATE public.visit_bookings SET status=CASE WHEN v_owner=v_user THEN 'cancelled_by_owner' ELSE 'cancelled_by_visitor' END WHERE id=b.id;
 INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(CASE WHEN v_owner=v_user THEN b.visitor_id ELSE v_owner END,
  'visit','Visita cancelada','Se ha cancelado una visita. Consulta los detalles en tu agenda.',
  jsonb_build_object('kind','visit_cancelled','booking_id',b.id));
 RETURN jsonb_build_object('ok',true,'cancelled_by',CASE WHEN v_owner=v_user THEN 'owner' ELSE 'visitor' END);
END $$;
REVOKE ALL ON FUNCTION public.cancel_visit_booking(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_visit_booking(uuid) TO authenticated;

CREATE INDEX payment_checkout_reconciliation ON public.payment_checkout_state(expires_at,updated_at)
 WHERE state IN('legacy','prepared','creating','open','closing');
-- Reconcile abandoned sessions even when a Stripe webhook is delayed. The
-- existing internal secret never leaves the database-to-backend request.
CREATE FUNCTION public.dispatch_payment_reconciliation() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text; endpoint text;
BEGIN
 SELECT value INTO secret FROM public.app_settings WHERE key='notify_email_secret';
 SELECT replace(value,'/api/internal/notify-email','/api/internal/reconcile-payments') INTO endpoint
 FROM public.app_settings WHERE key='notify_email_url';
 IF secret IS NULL OR endpoint IS NULL OR endpoint NOT LIKE 'https://franky.es/%' THEN RETURN; END IF;
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('content-type','application/json','authorization','Bearer '||secret),body:='{}',timeout_milliseconds:=30000);
END $$;
REVOKE ALL ON FUNCTION public.dispatch_payment_reconciliation() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('marketplace-reconciliation','*/5 * * * *',$cron$SELECT public.dispatch_payment_reconciliation();$cron$);

CREATE FUNCTION public.admin_payment_review() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() OR coalesce(auth.jwt()->>'aal','')<>'aal2' THEN
  RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('generated_at',now(),
  'counts',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT state,count(*) AS orders FROM public.payment_checkout_state GROUP BY state) x),
  'review',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT p.id,p.type,p.amount_cents,p.currency,p.status,p.created_at,p.stripe_payment_intent_id,s.issue,
      s.state AS checkout_state FROM public.payment_checkout_state s JOIN public.payments p ON p.id=s.payment_id
    WHERE s.state='review' OR (s.state='closing' AND s.updated_at<now()-interval '15 minutes')
    ORDER BY p.created_at LIMIT 50) x));
END $$;
REVOKE ALL ON FUNCTION public.admin_payment_review() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_payment_review() TO authenticated;
