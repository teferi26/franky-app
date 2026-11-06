-- =====================================================
-- 095: Tickets de eventos (pago al organizador vía Stripe Connect)
-- =====================================================
-- Los eventos de pago (events.price > 0) venden entradas individuales. Cada
-- fila de event_tickets es una entrada con su propio QR. El flujo:
--   1. El estudiante pulsa "Comprar entrada" → reserve_event_ticket bloquea el
--      evento (FOR UPDATE), controla el aforo y crea una entrada en
--      'pending_payment'.
--   2. /api/stripe/pay/ticket crea el cobro Connect (destino = cuenta del
--      organizador, comisión para Franky) sobre esa entrada.
--   3. El webhook pasa la entrada a 'valid' al confirmarse el pago.
--
-- Los eventos gratuitos (price = 0) siguen usando event_participants (no
-- generan ticket). El control de aforo es transaccional para evitar
-- sobreventa en compras simultáneas, igual que book_visit_slot (087).
-- =====================================================

-- =====================================================
-- 1. event_tickets — una entrada por fila
-- =====================================================
CREATE TABLE IF NOT EXISTS public.event_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    holder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    original_buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    qr_token TEXT NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment', 'valid', 'used', 'refunded', 'transferred', 'listed_for_resale')),
    order_id UUID,  -- soft-FK a payments.id (la fila se crea en /api/stripe/pay/ticket)
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_tickets_event ON public.event_tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_tickets_holder ON public.event_tickets(holder_id, status);
CREATE INDEX IF NOT EXISTS idx_event_tickets_qr ON public.event_tickets(qr_token);

ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;

-- El titular ve sus entradas.
DROP POLICY IF EXISTS "event_tickets_select_holder" ON public.event_tickets;
CREATE POLICY "event_tickets_select_holder"
    ON public.event_tickets FOR SELECT TO authenticated
    USING (holder_id = auth.uid());

-- El organizador ve las entradas de sus eventos (validar en la puerta).
DROP POLICY IF EXISTS "event_tickets_select_organizer" ON public.event_tickets;
CREATE POLICY "event_tickets_select_organizer"
    ON public.event_tickets FOR SELECT TO authenticated
    USING (event_id IN (SELECT id FROM public.events WHERE organizer_id = auth.uid()));

DROP POLICY IF EXISTS "event_tickets_select_admin" ON public.event_tickets;
CREATE POLICY "event_tickets_select_admin"
    ON public.event_tickets FOR SELECT TO authenticated
    USING (public.is_admin());

-- Escrituras solo vía RPC (aforo) y service-role (webhook). Sin INSERT/UPDATE
-- para authenticated.

-- =====================================================
-- 2. Trigger updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_event_tickets_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_tickets_updated_at ON public.event_tickets;
CREATE TRIGGER event_tickets_updated_at
    BEFORE UPDATE ON public.event_tickets
    FOR EACH ROW EXECUTE FUNCTION public.touch_event_tickets_updated_at();

-- =====================================================
-- 3. reserve_event_ticket — compra con control de aforo transaccional
-- =====================================================
-- Bloquea la fila del evento, cuenta las entradas vivas (pending_payment +
-- valid + used) frente a max_capacity y crea una entrada 'pending_payment'.
-- El cobro lo inicia /api/stripe/pay/ticket sobre la entrada devuelta.
CREATE OR REPLACE FUNCTION public.reserve_event_ticket(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_event RECORD;
    v_live INTEGER;
    v_price_cents INTEGER;
    v_ticket_id UUID;
    v_token TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    -- Bloquea el evento para serializar compras concurrentes.
    SELECT e.id, e.title, e.price, e.max_capacity, e.status, e.organizer_id, e.start_date
      INTO v_event
      FROM public.events e
     WHERE e.id = p_event_id
     FOR UPDATE OF e;

    IF v_event.id IS NULL THEN RAISE EXCEPTION 'evento no encontrado'; END IF;
    IF v_event.status NOT IN ('upcoming', 'ongoing') THEN
        RAISE EXCEPTION 'el evento no admite compras';
    END IF;
    IF v_event.start_date < NOW() THEN RAISE EXCEPTION 'el evento ya ha pasado'; END IF;
    IF COALESCE(v_event.price, 0) <= 0 THEN
        RAISE EXCEPTION 'evento gratuito: usa la inscripción';
    END IF;
    IF v_event.organizer_id = v_user THEN
        RAISE EXCEPTION 'no puedes comprar una entrada de tu propio evento';
    END IF;

    v_price_cents := ROUND(v_event.price * 100)::INTEGER;

    -- Control de aforo (NULL = sin límite).
    IF v_event.max_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO v_live FROM public.event_tickets
         WHERE event_id = p_event_id
           AND status IN ('pending_payment', 'valid', 'used');
        IF v_live >= v_event.max_capacity THEN RAISE EXCEPTION 'entradas agotadas'; END IF;
    END IF;

    -- Token único para el QR (64 hex, sin guiones).
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    INSERT INTO public.event_tickets (
        event_id, holder_id, original_buyer_id, qr_token, price_cents, status
    )
    VALUES (
        p_event_id, v_user, v_user, v_token, v_price_cents, 'pending_payment'
    )
    RETURNING id INTO v_ticket_id;

    RETURN jsonb_build_object(
        'ticket_id', v_ticket_id,
        'price_cents', v_price_cents,
        'requires_payment', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_event_ticket(UUID) TO authenticated;

-- =====================================================
-- 4. validate_event_ticket — el organizador marca la entrada como usada
-- =====================================================
-- Escanea el QR en la puerta: comprueba que la entrada es válida, que el evento
-- pertenece al organizador que llama y la marca 'used'. Idempotente respecto a
-- 'used' (devuelve already_used en lugar de fallar).
CREATE OR REPLACE FUNCTION public.validate_event_ticket(p_qr_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_t RECORD;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT t.id, t.status, t.holder_id, t.used_at, e.organizer_id, e.title,
           p.full_name AS holder_name
      INTO v_t
      FROM public.event_tickets t
      JOIN public.events e ON e.id = t.event_id
      LEFT JOIN public.profiles p ON p.id = t.holder_id
     WHERE t.qr_token = p_qr_token
     FOR UPDATE OF t;

    IF v_t.id IS NULL THEN RAISE EXCEPTION 'entrada no encontrada'; END IF;
    IF v_t.organizer_id <> v_user AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'no autorizado';
    END IF;

    IF v_t.status = 'used' THEN
        RETURN jsonb_build_object(
            'ok', false, 'already_used', true,
            'holder_name', v_t.holder_name, 'used_at', v_t.used_at
        );
    END IF;
    IF v_t.status <> 'valid' THEN
        RAISE EXCEPTION 'la entrada no es válida (%).', v_t.status;
    END IF;

    UPDATE public.event_tickets
       SET status = 'used', used_at = NOW()
     WHERE id = v_t.id;

    RETURN jsonb_build_object(
        'ok', true, 'already_used', false,
        'holder_name', v_t.holder_name, 'event_title', v_t.title
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_event_ticket(TEXT) TO authenticated;

-- =====================================================
-- 5. get_event_ticket_availability — aforo libre de un evento (ficha pública)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_event_ticket_availability(p_event_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'max_capacity', e.max_capacity,
        'sold', COALESCE(t.live, 0),
        'available', CASE WHEN e.max_capacity IS NULL THEN NULL
                          ELSE GREATEST(e.max_capacity - COALESCE(t.live, 0), 0) END,
        'sold_out', e.max_capacity IS NOT NULL AND COALESCE(t.live, 0) >= e.max_capacity
    )
    FROM public.events e
    LEFT JOIN (
        SELECT event_id, COUNT(*) AS live
        FROM public.event_tickets
        WHERE status IN ('pending_payment', 'valid', 'used')
        GROUP BY event_id
    ) t ON t.event_id = e.id
    WHERE e.id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_ticket_availability(UUID) TO anon, authenticated;
