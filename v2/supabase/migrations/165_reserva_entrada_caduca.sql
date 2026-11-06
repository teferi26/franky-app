-- =====================================================
-- 165: una reserva sin pagar deja de guardar el sitio para siempre
-- =====================================================
--
-- EL AGUJERO QUE SE CIERRA
--
-- Entrar en la pasarela de pago ya ocupaba plaza, y esa plaza no se soltaba
-- nunca aunque no se pagara. La 115 creyó ponerle un TTL de 30 minutos, pero
-- la condición de "reserva viva" que escribió es:
--
--     (order_id IS NOT NULL OR created_at > NOW() - interval '30 minutes')
--
-- y /api/stripe/pay/ticket escribe order_id en la entrada SIEMPRE, justo al
-- abrir el checkout. Así que en cuanto alguien llegaba a la pasarela su reserva
-- pasaba a "viva para siempre" y el TTL no volvía a aplicarse jamás. El barrido
-- expire_stale_ticket_reservations tenía el mismo defecto: solo borraba las que
-- tuvieran order_id NULL, o sea justo las que el TTL ya cubría.
--
-- El único camino que liberaba de verdad era el webhook
-- `checkout.session.expired`. Es decir: la plaza dependía de que Stripe avisara
-- y de que ese evento estuviera activado en el panel. Con el webhook caído, mal
-- configurado (ya pasó el 05-ago-2026) o con el evento sin activar, un evento
-- con aforo se podía llenar entero de reservas que nadie pagó.
--
-- Y había un tercer caso que ni el webhook cubría: si la reserva se creaba pero
-- /api/stripe/pay/ticket fallaba después (p. ej. el organizador aún no podía
-- recibir cobros), no había ninguna sesión de Stripe que caducar, así que no
-- llegaba ningún evento y la plaza quedaba retenida indefinidamente.
--
-- REGLA NUEVA
--
--   1. Cada reserva lleva su fecha de caducidad explícita (reserved_until).
--   2. Solo ocupa plaza lo pagado (valid/used) y las reservas NO caducadas. Ya
--      no importa si tienen intento de cobro o no.
--   3. reserve_event_ticket barre las reservas caducadas del evento antes de
--      contar (con el evento ya bloqueado, así que no hay carrera). Se
--      autorrepara sin depender de ningún webhook ni de ningún cron.
--   4. Una sola reserva viva por persona y evento: si vuelve a intentarlo se le
--      devuelve la MISMA, no una segunda plaza. Antes se permitían dos por
--      persona, y siendo eternas, dos plazas por cuenta para siempre.
--
-- LA VENTANA SON 35 MINUTOS Y NO MENOS, A PROPÓSITO
--
-- Stripe no admite sesiones de checkout de menos de 30 minutos, y mientras la
-- sesión esté viva el pago puede completarse. Si la plaza se liberara antes de
-- que caduque la sesión, otro podría comprar la última entrada y luego llegar
-- el pago del primero: dos personas pagando por una plaza. 35 = los 30 de
-- Stripe + 5 de margen para el desfase de reloj y el retraso del webhook.
-- /api/stripe/pay/ticket estira reserved_until cada vez que abre una sesión,
-- para que la reserva siempre cubra a la sesión que puede cobrar.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. La ventana de reserva, en un solo sitio
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_hold_window()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
AS $$ SELECT INTERVAL '35 minutes' $$;

COMMENT ON FUNCTION public.ticket_hold_window() IS
  'Cuánto retiene plaza una reserva de entrada sin pagar. 35 min = los 30 '
  'mínimos de una sesión de Stripe Checkout + 5 de margen: nunca se libera una '
  'plaza que una sesión viva todavía podría pagar.';

-- ---------------------------------------------------------------
-- 2. Caducidad explícita en cada reserva
-- ---------------------------------------------------------------
ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;

COMMENT ON COLUMN public.event_tickets.reserved_until IS
  'Hasta cuándo una reserva sin pagar (status pending_payment) retiene plaza. '
  'La pone reserve_event_ticket y la estira /api/stripe/pay/ticket al abrir '
  'cada sesión de Stripe. Irrelevante en entradas ya pagadas.';

-- Las reservas que ya existen pasan a tener caducidad contada desde su
-- creación: las abandonadas hace rato quedan caducadas de inmediato (dejan de
-- ocupar) y las de los últimos minutos conservan su plaza.
UPDATE public.event_tickets
   SET reserved_until = created_at + public.ticket_hold_window()
 WHERE status = 'pending_payment'
   AND reserved_until IS NULL;

-- El barrido y el conteo filtran por evento + estado.
CREATE INDEX IF NOT EXISTS idx_event_tickets_reservas_vivas
  ON public.event_tickets(event_id, reserved_until)
  WHERE status = 'pending_payment';

-- ---------------------------------------------------------------
-- 3. Barrido de reservas caducadas
-- ---------------------------------------------------------------
-- Borra la reserva Y cancela su cobro pendiente en el ledger, para no dejar
-- filas de `payments` en 'pending' apuntando a una entrada que ya no existe.
-- Ya no mira order_id: ese era justo el bug.
--
-- SECURITY DEFINER (salta RLS) y sin GRANT a authenticated/anon: la llaman
-- reserve_event_ticket y, si hace falta, el fundador a mano.
CREATE OR REPLACE FUNCTION public.purge_expired_ticket_holds(p_event_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ids UUID[];
    v_borradas INT := 0;
BEGIN
    IF to_regclass('public.event_tickets') IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(array_agg(t.id), '{}')
      INTO v_ids
      FROM public.event_tickets t
     WHERE t.status = 'pending_payment'
       AND (p_event_id IS NULL OR t.event_id = p_event_id)
       AND COALESCE(t.reserved_until, t.created_at + public.ticket_hold_window()) <= NOW()
       -- Cinturón por si reserved_until se quedara corto (p. ej. si falló el
       -- UPDATE que lo estira al abrir la sesión): un cobro pendiente reciente
       -- significa que puede haber una sesión de Stripe todavía viva, y esa
       -- plaza NO se toca. Pasados los 35 minutos la sesión (30) está muerta
       -- con seguridad, así que el abandono sí se limpia.
       AND NOT EXISTS (
           SELECT 1
             FROM public.payments p
            WHERE p.ref_table = 'event_tickets'
              AND p.ref_id    = t.id
              AND p.status    = 'pending'
              AND p.created_at > NOW() - public.ticket_hold_window()
       );

    IF array_length(v_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    -- MISMO ORDEN que el manejador de checkout.session.expired del webhook
    -- (entrada y luego cobro): si uno bloqueara las filas en orden inverso al
    -- otro, los dos caminos podrían quedar en interbloqueo justo cuando una
    -- sesión caduca y alguien reserva a la vez. Todo va en la misma transacción,
    -- así que no hay ventana con el ledger a medias.
    DELETE FROM public.event_tickets
     WHERE id = ANY (v_ids)
       AND status = 'pending_payment';
    GET DIAGNOSTICS v_borradas = ROW_COUNT;

    UPDATE public.payments
       SET status = 'canceled'
     WHERE ref_table = 'event_tickets'
       AND ref_id = ANY (v_ids)
       AND status = 'pending';

    RETURN v_borradas;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_ticket_holds(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_ticket_holds(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_ticket_holds(UUID) FROM authenticated;

COMMENT ON FUNCTION public.purge_expired_ticket_holds(UUID) IS
  '165: borra las reservas de entrada caducadas (y cancela su cobro pendiente). '
  'Sin p_event_id barre todos los eventos. La llama reserve_event_ticket con el '
  'evento ya bloqueado; el conteo de aforo no depende de que se haya ejecutado.';

-- El barrido antiguo de la 115 solo borraba las reservas SIN intento de cobro:
-- se reescribe para que delegue en el nuevo y deje de mentir. Se conserva la
-- firma (INT) para no romper a quien ya lo tuviera cronado o guardado.
CREATE OR REPLACE FUNCTION public.expire_stale_ticket_reservations(p_ttl_minutes INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- p_ttl_minutes se ignora: la caducidad de cada reserva vive ahora en
    -- event_tickets.reserved_until (165), que además cubre la sesión de Stripe.
    RETURN public.purge_expired_ticket_holds(NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_ticket_reservations(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_ticket_reservations(INT) FROM anon;
REVOKE ALL ON FUNCTION public.expire_stale_ticket_reservations(INT) FROM authenticated;

COMMENT ON FUNCTION public.expire_stale_ticket_reservations(INT) IS
  '165: alias de purge_expired_ticket_holds(NULL). El parámetro de TTL se '
  'ignora (la caducidad va por fila en reserved_until). Antes solo borraba las '
  'reservas con order_id NULL, así que jamás liberaba un checkout abandonado.';

-- ---------------------------------------------------------------
-- 4. reserve_event_ticket: barre, reutiliza y solo cuenta lo que ocupa
-- ---------------------------------------------------------------
-- Parte de la versión vigente (115, que a su vez venía de 097): mismas
-- validaciones y misma firma. Cambios:
--   a) barre las reservas caducadas del evento antes de contar;
--   b) "ocupa plaza" = pagada (valid/used) o reserva NO caducada. Se acabó el
--      order_id como pase eterno;
--   c) una sola reserva viva por persona y evento: se devuelve la misma en vez
--      de crear otra (y se refresca su precio si el organizador lo cambió);
--   d) la respuesta añade reserved_until y reused (informativos; el contrato
--      anterior —ticket_id, price_cents, requires_payment— se mantiene).
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
    v_hold TIMESTAMPTZ;
    v_mia RECORD;
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
        RAISE EXCEPTION 'evento gratuito: usa la inscripcion';
    END IF;
    -- Solo los eventos que cobran por la app generan entradas (097).
    IF COALESCE(v_event.payment_mode, 'app') <> 'app' THEN
        RAISE EXCEPTION 'este evento no vende entradas por la app (precio informativo)';
    END IF;
    IF v_event.organizer_id = v_user THEN
        RAISE EXCEPTION 'no puedes comprar una entrada de tu propio evento';
    END IF;

    v_price_cents := ROUND(v_event.price * 100)::INTEGER;
    v_hold := NOW() + public.ticket_hold_window();

    -- (a) Con el evento bloqueado, se sueltan las plazas caducadas. Aquí es
    --     donde el sistema se autorrepara: quien intenta comprar libera de paso
    --     lo que otros abandonaron, sin depender de ningún webhook.
    PERFORM public.purge_expired_ticket_holds(p_event_id);

    -- (c) ¿Ya tiene una reserva viva? Se le devuelve esa misma plaza.
    SELECT t.id, t.price_cents, t.reserved_until
      INTO v_mia
      FROM public.event_tickets t
     WHERE t.event_id = p_event_id
       AND t.holder_id = v_user
       AND t.status = 'pending_payment'
     ORDER BY t.created_at DESC
     LIMIT 1;

    IF v_mia.id IS NOT NULL THEN
        -- Si el organizador cambió el precio entre la reserva y el pago, manda
        -- el precio de ahora: el importe lo lee /api/stripe/pay/ticket de esta
        -- columna, y cobrar el viejo sería cobrar de menos (o de más).
        IF v_mia.price_cents IS DISTINCT FROM v_price_cents THEN
            UPDATE public.event_tickets
               SET price_cents = v_price_cents
             WHERE id = v_mia.id;
        END IF;
        RETURN jsonb_build_object(
            'ticket_id', v_mia.id,
            'price_cents', v_price_cents,
            'requires_payment', true,
            'reserved_until', v_mia.reserved_until,
            'reused', true
        );
    END IF;

    -- (b) Aforo (NULL = sin límite): pagadas + reservas no caducadas.
    IF v_event.max_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO v_live
          FROM public.event_tickets t
         WHERE t.event_id = p_event_id
           AND (
                t.status IN ('valid', 'used')
             OR (t.status = 'pending_payment'
                 AND COALESCE(t.reserved_until, t.created_at + public.ticket_hold_window()) > NOW())
           );
        IF v_live >= v_event.max_capacity THEN RAISE EXCEPTION 'entradas agotadas'; END IF;
    END IF;

    -- Token unico para el QR (64 hex, sin guiones).
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    INSERT INTO public.event_tickets (
        event_id, holder_id, original_buyer_id, qr_token, price_cents, status,
        reserved_until
    )
    VALUES (
        p_event_id, v_user, v_user, v_token, v_price_cents, 'pending_payment',
        v_hold
    )
    RETURNING id INTO v_ticket_id;

    RETURN jsonb_build_object(
        'ticket_id', v_ticket_id,
        'price_cents', v_price_cents,
        'requires_payment', true,
        'reserved_until', v_hold,
        'reused', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_event_ticket(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_event_ticket(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_event_ticket(UUID) TO authenticated;

COMMENT ON FUNCTION public.reserve_event_ticket(UUID) IS
  '165: reserva con caducidad real (reserved_until). Barre las reservas '
  'caducadas del evento antes de contar, cuenta como ocupadas solo las pagadas '
  'y las reservas vivas, y devuelve la reserva que ya tuviera esa persona en vez '
  'de darle una segunda plaza. Resto igual que 115/097.';

-- ---------------------------------------------------------------
-- 5. Disponibilidad pública: la misma cuenta que el aforo
-- ---------------------------------------------------------------
-- La 095 contaba TODAS las pending sin mirar caducidad, así que la ficha del
-- evento podía decir "entradas agotadas" (y deshabilitar el botón de compra)
-- por reservas que ya no ocupaban nada para reserve_event_ticket. Ahora las dos
-- usan el mismo criterio. Se añaden 'paid' y 'held' para poder distinguir lo
-- cobrado de lo reservado; 'sold' sigue siendo el total ocupado, como antes.
CREATE OR REPLACE FUNCTION public.get_event_ticket_availability(p_event_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'max_capacity', e.max_capacity,
        'sold',      COALESCE(t.paid, 0) + COALESCE(t.held, 0),
        'paid',      COALESCE(t.paid, 0),
        'held',      COALESCE(t.held, 0),
        'available', CASE WHEN e.max_capacity IS NULL THEN NULL
                          ELSE GREATEST(e.max_capacity - COALESCE(t.paid, 0) - COALESCE(t.held, 0), 0) END,
        'sold_out',  e.max_capacity IS NOT NULL
                     AND COALESCE(t.paid, 0) + COALESCE(t.held, 0) >= e.max_capacity
    )
    FROM public.events e
    LEFT JOIN (
        SELECT event_id,
               COUNT(*) FILTER (WHERE status IN ('valid', 'used')) AS paid,
               COUNT(*) FILTER (
                   WHERE status = 'pending_payment'
                     AND COALESCE(reserved_until, created_at + public.ticket_hold_window()) > NOW()
               ) AS held
        FROM public.event_tickets
        GROUP BY event_id
    ) t ON t.event_id = e.id
    WHERE e.id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_ticket_availability(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.get_event_ticket_availability(UUID) IS
  '165: mismo criterio de ocupación que reserve_event_ticket (pagadas + '
  'reservas no caducadas). Devuelve además paid y held por separado.';

-- ---------------------------------------------------------------
-- 6. Limpieza inmediata al aplicar
-- ---------------------------------------------------------------
-- Suelta de una vez todas las plazas que estaban retenidas por reservas
-- abandonadas (el motivo por el que se escribe esta migración).
SELECT public.purge_expired_ticket_holds(NULL) AS reservas_liberadas;

-- ---------------------------------------------------------------
-- 7. Comprobación tras aplicar
-- ---------------------------------------------------------------
--   -- ¿Queda alguna reserva ocupando plaza? (debería ser solo de los últimos
--   -- 35 minutos)
--   SELECT event_id, count(*), min(reserved_until), max(reserved_until)
--     FROM public.event_tickets
--    WHERE status = 'pending_payment'
--    GROUP BY event_id;
--
--   -- Aforo real de un evento
--   SELECT public.get_event_ticket_availability('<uuid-del-evento>');
