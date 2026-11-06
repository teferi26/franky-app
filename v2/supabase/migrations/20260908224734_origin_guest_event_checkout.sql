-- ORIGIN website guest sales. Platform charges: no Connect destination.
CREATE TABLE public.origin_event_orders (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
 token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 buyer_name text NOT NULL CHECK(length(buyer_name) BETWEEN 2 AND 120),
 buyer_email text NOT NULL CHECK(length(buyer_email) BETWEEN 3 AND 254),
 ip_hash text NOT NULL CHECK(ip_hash ~ '^[a-f0-9]{64}$'),
 size text NOT NULL CHECK(size IN('ninguna','XS','S','M','L','XL','XXL')),
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 50 AND 1000000), currency text NOT NULL DEFAULT 'eur' CHECK(currency='eur'),
 event_snapshot jsonb NOT NULL, stripe_account text NOT NULL, livemode boolean NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','paid','expired','refunded','review')),
 checkout_params jsonb, stripe_session_id text UNIQUE, stripe_payment_intent text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz,
 terms_version text NOT NULL DEFAULT 'origin-2026-09-09', checked_in_at timestamptz,
 refunded_cents integer NOT NULL DEFAULT 0 CHECK(refunded_cents>=0),
 receipt_sent_at timestamptz
);
CREATE INDEX origin_orders_event_status ON public.origin_event_orders(event_id,status);
CREATE INDEX origin_orders_reconcile ON public.origin_event_orders(created_at) WHERE status IN('pending','review');
CREATE INDEX origin_orders_ip_created ON public.origin_event_orders(ip_hash,created_at);
CREATE UNIQUE INDEX origin_orders_browser_active ON public.origin_event_orders(event_id,token_hash) WHERE status IN('pending','paid','review');
ALTER TABLE public.origin_event_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.origin_event_orders FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.origin_event_orders TO service_role;

-- Shared capacity across Franky registrations, ticket holds, and guest sales.
-- Call under the event row lock; unresolved Stripe sessions keep their seat.
CREATE FUNCTION public.origin_event_occupancy(p_event uuid,p_exclude_participant uuid DEFAULT NULL,p_exclude_ticket uuid DEFAULT NULL) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH tickets AS (
   SELECT id,holder_id FROM public.event_tickets WHERE event_id=p_event AND
    (status IN('valid','used','listed_for_resale') OR (status='pending_payment' AND (coalesce(reserved_until,created_at+public.ticket_hold_window())>now() OR public.ticket_has_unclosed_payment(id))))
 )
 SELECT (SELECT count(*)::integer FROM tickets WHERE p_exclude_ticket IS NULL OR id<>p_exclude_ticket)
  + (SELECT count(*)::integer FROM public.event_participants p WHERE p.event_id=p_event AND p.status IN('registered','attended') AND (p_exclude_participant IS NULL OR p.user_id<>p_exclude_participant) AND NOT EXISTS(SELECT 1 FROM tickets t WHERE t.holder_id=p.user_id))
  + (SELECT count(*)::integer FROM public.origin_event_orders WHERE event_id=p_event AND status IN('pending','paid','review'))
$$;
REVOKE ALL ON FUNCTION public.origin_event_occupancy(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.origin_event_occupancy(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.guard_origin_event_sales() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.origin_event_orders WHERE event_id=OLD.id AND status IN('pending','paid','review')) THEN
  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.venue IS DISTINCT FROM OLD.venue OR NEW.city IS DISTINCT FROM OLD.city OR (NEW.status IS DISTINCT FROM OLD.status AND coalesce(NEW.status,'') NOT IN('upcoming','ongoing','completed')) THEN RAISE EXCEPTION 'Hay entradas compradas o pagos en curso. Gestiona primero las ventas con Franky antes de cambiar o cancelar el encuentro'; END IF;
  IF NEW.max_capacity IS NOT NULL AND NEW.max_capacity<public.origin_event_occupancy(OLD.id) THEN RAISE EXCEPTION 'El aforo no puede ser inferior a las plazas reservadas'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_origin_event_sales() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_origin_event_sales BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.guard_origin_event_sales();

CREATE FUNCTION public.guard_origin_shared_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE; u uuid; ticket uuid; active boolean; was_active boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND NEW.event_id<>OLD.event_id AND EXISTS(SELECT 1 FROM public.events WHERE id IN(NEW.event_id,OLD.event_id) AND organizer_id='efc99d1b-c713-4061-9146-e905fc599f56') THEN RAISE EXCEPTION 'registration cannot be reassigned'; END IF;
 SELECT * INTO e FROM public.events WHERE id=NEW.event_id FOR UPDATE;
 IF e.organizer_id IS DISTINCT FROM 'efc99d1b-c713-4061-9146-e905fc599f56'::uuid THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='event_participants' THEN
  u:=NEW.user_id; active:=NEW.status IN('registered','attended');
  IF TG_OP='UPDATE' THEN was_active:=OLD.status IN('registered','attended') AND OLD.user_id=NEW.user_id; END IF;
  -- Marketplace settlement marks the ticket valid before inserting its holder
  -- into participants. That registration is the same seat, even at capacity.
  IF EXISTS(SELECT 1 FROM public.event_tickets t WHERE t.event_id=e.id AND t.holder_id=u AND (t.status IN('valid','used','listed_for_resale') OR (t.status='pending_payment' AND (coalesce(t.reserved_until,t.created_at+public.ticket_hold_window())>now() OR public.ticket_has_unclosed_payment(t.id))))) THEN was_active:=true; END IF;
 ELSE
  u:=NEW.holder_id; ticket:=NEW.id; active:=NEW.status IN('pending_payment','valid','used','listed_for_resale');
  IF TG_OP='UPDATE' THEN was_active:=OLD.status IN('valid','used','listed_for_resale') OR (OLD.status='pending_payment' AND (coalesce(OLD.reserved_until,OLD.created_at+public.ticket_hold_window())>now() OR public.ticket_has_unclosed_payment(OLD.id))); END IF;
 END IF;
 IF coalesce(active,false) AND NOT coalesce(was_active,false) AND e.max_capacity IS NOT NULL AND public.origin_event_occupancy(e.id,u,ticket)>=e.max_capacity THEN RAISE EXCEPTION 'Aforo completo'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_origin_shared_capacity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_origin_shared_capacity BEFORE INSERT OR UPDATE ON public.event_participants FOR EACH ROW EXECUTE FUNCTION public.guard_origin_shared_capacity();
CREATE TRIGGER trg_origin_shared_capacity BEFORE INSERT OR UPDATE ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION public.guard_origin_shared_capacity();

CREATE FUNCTION public.prepare_origin_event_order(p_id uuid,p_event uuid,p_token_hash text,p_name text,p_email text,p_size text,p_ip_hash text,p_account text,p_live boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE; o public.origin_event_orders%ROWTYPE; amount integer;
BEGIN
 SELECT * INTO e FROM public.events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.organizer_id IS DISTINCT FROM 'efc99d1b-c713-4061-9146-e905fc599f56'::uuid THEN RAISE EXCEPTION 'Evento no disponible'; END IF;
 SELECT * INTO o FROM public.origin_event_orders WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF o.token_hash IS DISTINCT FROM p_token_hash OR o.event_id<>p_event THEN RAISE EXCEPTION 'Solicitud no válida'; END IF;
  -- A retry always recovers the frozen order, never replaces its quote or payer.
  RETURN to_jsonb(o);
 END IF;
 -- Only the browser credential identifies a recovery. An unverified email is
 -- never an authorization key or a way to discover another person's purchase.
 SELECT * INTO o FROM public.origin_event_orders WHERE event_id=p_event AND token_hash=p_token_hash AND status IN('pending','paid','review');
 IF FOUND THEN RETURN to_jsonb(o); END IF;
 IF coalesce(e.status,'') NOT IN('upcoming','ongoing') OR e.start_date IS NULL OR e.start_date<=now()+interval '35 minutes' OR coalesce(e.price,0)<=0 OR coalesce(e.payment_mode,'app') NOT IN('app','info') THEN RAISE EXCEPTION 'Las inscripciones están cerradas'; END IF;
 IF p_size IS NULL OR p_size NOT IN('ninguna','XS','S','M','L','XL','XXL') OR (e.shirts_enabled IS NOT TRUE AND p_size<>'ninguna') THEN RAISE EXCEPTION 'Elige una opción de camiseta válida'; END IF;
 IF e.price_without_shirt IS NOT NULL THEN
  amount:=round(100*CASE WHEN p_size='ninguna' THEN e.price_without_shirt ELSE e.price_with_shirt END)::integer;
 ELSE amount:=round(100*e.price)::integer; END IF;
 -- Serialise IP budgets across different events too (durable anti-hold abuse).
 PERFORM pg_advisory_xact_lock(hashtextextended(p_ip_hash,0));
 IF (SELECT count(*) FROM public.origin_event_orders WHERE ip_hash=p_ip_hash AND created_at>now()-interval '30 minutes')>=10 OR (SELECT count(*) FROM public.origin_event_orders WHERE ip_hash=p_ip_hash AND status IN('pending','review'))>=3 THEN RAISE EXCEPTION 'Hay varias compras en curso. Termina una antes de continuar'; END IF;
 IF e.max_capacity IS NOT NULL AND public.origin_event_occupancy(p_event)>=e.max_capacity THEN RAISE EXCEPTION 'Aforo completo'; END IF;
 INSERT INTO public.origin_event_orders(id,event_id,token_hash,buyer_name,buyer_email,size,amount_cents,ip_hash,stripe_account,livemode,event_snapshot)
 VALUES(p_id,p_event,p_token_hash,trim(p_name),lower(trim(p_email)),p_size,amount,p_ip_hash,p_account,p_live,
 jsonb_build_object('title',e.title,'start_at',e.start_date,'venue',e.venue,'city',e.city,'address',e.address)) RETURNING * INTO o;
 RETURN to_jsonb(o);
END $$;
REVOKE ALL ON FUNCTION public.prepare_origin_event_order(uuid,uuid,text,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_origin_event_order(uuid,uuid,text,text,text,text,text,text,boolean) TO service_role;

CREATE FUNCTION public.freeze_origin_checkout(p_id uuid,p_params jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.origin_event_orders SET checkout_params=coalesce(checkout_params,p_params) WHERE id=p_id AND status='pending' RETURNING checkout_params
$$;
REVOKE ALL ON FUNCTION public.freeze_origin_checkout(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_origin_checkout(uuid,jsonb) TO service_role;

CREATE FUNCTION public.close_unstarted_origin_order(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.origin_event_orders SET status='expired' WHERE id=p_id AND status='pending' AND checkout_params IS NULL
$$;
REVOKE ALL ON FUNCTION public.close_unstarted_origin_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_unstarted_origin_order(uuid) TO service_role;

CREATE FUNCTION public.settle_origin_event_order(p_id uuid,p_session text,p_intent text,p_amount integer,p_currency text,p_live boolean,p_account text,p_refunded integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.origin_event_orders%ROWTYPE;
BEGIN
 -- Serialise against new registrations before converting the held seat.
 PERFORM 1 FROM public.events WHERE id=(SELECT event_id FROM public.origin_event_orders WHERE id=p_id) FOR UPDATE;
 SELECT * INTO o FROM public.origin_event_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR o.checkout_params IS NULL OR p_amount IS DISTINCT FROM o.amount_cents OR p_currency IS DISTINCT FROM o.currency OR p_live IS DISTINCT FROM o.livemode OR p_account IS DISTINCT FROM o.stripe_account OR p_intent IS NULL OR p_session IS NULL OR (o.stripe_session_id IS NOT NULL AND o.stripe_session_id<>p_session) OR (o.stripe_payment_intent IS NOT NULL AND o.stripe_payment_intent<>p_intent) THEN RAISE EXCEPTION 'Payment integrity mismatch'; END IF;
 IF p_refunded IS NULL OR p_refunded<0 OR p_refunded>o.amount_cents THEN RAISE EXCEPTION 'Refund integrity mismatch'; END IF;
 IF o.status IN('paid','refunded') THEN
  UPDATE public.origin_event_orders SET refunded_cents=greatest(refunded_cents,p_refunded),status=CASE WHEN greatest(refunded_cents,p_refunded)>=amount_cents THEN 'refunded' ELSE status END WHERE id=p_id;
  RETURN;
 END IF;
 IF o.status='expired' THEN RAISE EXCEPTION 'Expired order unexpectedly paid'; END IF;
 UPDATE public.origin_event_orders SET status=CASE WHEN p_refunded>=amount_cents THEN 'refunded' ELSE 'paid' END,refunded_cents=p_refunded,paid_at=now(),stripe_session_id=p_session,stripe_payment_intent=p_intent WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.settle_origin_event_order(uuid,text,text,integer,text,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_origin_event_order(uuid,text,text,integer,text,boolean,text,integer) TO service_role;

-- Only public counts; guest names/emails/tokens never leave the private ledger.
CREATE OR REPLACE FUNCTION public.get_event_participant_count(p_event_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (SELECT count(*)::integer FROM public.event_participants WHERE event_id=p_event_id AND status<>'cancelled') + (SELECT count(*)::integer FROM public.origin_event_orders WHERE event_id=p_event_id AND status='paid')
$$;
REVOKE ALL ON FUNCTION public.get_event_participant_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_participant_count(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.get_origin_event_attendees(p_event uuid) RETURNS TABLE(id uuid,buyer_name text,buyer_email text,size text,amount_cents integer,paid_at timestamptz,checked_in_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=auth.uid() AND is_discarded IS NOT TRUE) OR NOT EXISTS(SELECT 1 FROM public.events WHERE events.id=p_event AND (organizer_id=auth.uid() OR (public.is_admin() AND auth.jwt()->>'aal'='aal2'))) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 RETURN QUERY SELECT o.id,o.buyer_name,o.buyer_email,o.size,o.amount_cents,o.paid_at,o.checked_in_at FROM public.origin_event_orders o WHERE o.event_id=p_event AND o.status='paid' ORDER BY o.paid_at;
END $$;
REVOKE ALL ON FUNCTION public.get_origin_event_attendees(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_origin_event_attendees(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
