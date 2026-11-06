-- =====================================================
-- 097: Modo de cobro de los eventos (app vs informativo)
-- =====================================================
-- Hasta ahora un evento era "de pago" si price > 0, y eso implicaba SIEMPRE
-- cobrar por la app (Stripe Connect + event_tickets). Añadimos un modo para que
-- el organizador elija, al crear el evento, entre:
--
--   - 'app'  → Franky cobra las entradas vía Stripe Connect y le transfiere el
--              dinero (flujo actual, event_tickets).
--   - 'info' → el precio es solo ORIENTATIVO; la gente se apunta gratis
--              (event_participants) y paga aparte/en persona (p. ej. una quedada
--              para el cine donde cada uno paga su entrada allí, o se lo pasan
--              al organizador por otra vía). No necesita activar cobros.
--   - 'free' → evento gratuito.
--
-- Los eventos de pago YA existentes se cobraban por la app, así que se
-- backfillean como 'app' para preservar el comportamiento.
-- =====================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_mode IN ('free', 'app', 'info'));

-- Backfill: con la columna recién creada todas las filas quedan en 'free'; los
-- eventos con precio pasaban por Stripe, así que se marcan como 'app'.
UPDATE public.events
   SET payment_mode = CASE WHEN COALESCE(price, 0) > 0 THEN 'app' ELSE 'free' END
 WHERE payment_mode = 'free';

-- =====================================================
-- reserve_event_ticket: blindaje — solo los eventos 'app' venden entradas.
-- Un evento 'info' tiene price > 0 pero NO debe poder reservar ticket aunque
-- alguien llame al RPC directamente; se apunta vía event_participants.
-- (Se recrea la función entera con el guard añadido; el resto es idéntico a 095.)
-- =====================================================
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
    SELECT e.id, e.title, e.price, e.max_capacity, e.status, e.organizer_id,
           e.start_date, e.payment_mode
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
    -- Solo los eventos que cobran por la app generan entradas. Un evento con
    -- precio informativo se gestiona con inscripción gratuita.
    IF COALESCE(v_event.payment_mode, 'app') <> 'app' THEN
        RAISE EXCEPTION 'este evento no vende entradas por la app (precio informativo)';
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
