-- =====================================================================
-- 115: Higiene de datos, caducidad de reservas, retencion y constraints
--
-- Origen: docs/mejoras/09-datos-supabase.md (retencion, COMMENT ON, constraints)
-- y docs/mejoras/11-monetizacion-producto.md (entradas de eventos).
--
-- Que cierra
-- ----------
--   · M-BIZ-042: las reservas de entradas en 'pending_payment' bloquean el
--     aforo para siempre (no hay TTL ni barrido). Se anade:
--       - un barrido expire_stale_ticket_reservations() que el fundador puede
--         cronar (o llamar a mano) para liberar reservas abandonadas;
--       - reserve_event_ticket deja de contar como ocupadas las pendientes
--         caducadas (created_at mas viejo que el TTL y sin order_id).
--   · M-BIZ-043: no habia limite de reservas pending por usuario y evento
--     (DoS de ventas). reserve_event_ticket pasa a permitir como mucho 2
--     pendientes vivas por usuario y evento.
--   · M-BD events.price sin techo: CHECK de precio maximo (guard si la columna
--     existe y si ninguna fila lo viola).
--   · M-BD-053: email_notification_log solo crece. retencion en la funcion de
--     limpieza (borra throttles con last_sent_at antiguo).
--   · M-BD-050 / M-BD-051: notifications y mensajes soft-deleted sin purga. La
--     funcion de limpieza tambien los borra (el fundador la crona).
--   · M-BD-085 / M-BD-084: COMMENT ON de los flags solapados de accommodations
--     (is_verified / is_promoted / is_paid).
--
-- Importante: NO se cambia la firma de reserve_event_ticket(UUID) ni su
-- contrato de salida (ticket_id, price_cents, requires_payment). Se parte de la
-- version VIGENTE (097, que anade el guard de payment_mode) y solo se le suman
-- el limite por usuario y el filtro de pendientes caducadas en el conteo.
--
-- TTL de reserva: 30 minutos (alineado con la recomendacion de M-BIZ-042/033).
--
-- Idempotente y resiliente: CREATE OR REPLACE FUNCTION, guards to_regclass /
-- information_schema, CHECK anadido solo si no existe y no hay datos que lo
-- violen. La BD de produccion diverge del repo, pero event_tickets, events,
-- accommodations, notifications, messages y email_notification_log existen
-- igual en prod y en el repo.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. CHECK de precio maximo en events.price (M-BD constraints)
-- ---------------------------------------------------------------------
-- La columna es NUMERIC(10,2): el maximo fisico ya es 99.999.999,99, pero un
-- precio de entrada de estudiante por encima de unos cientos de euros es casi
-- seguro un error de tecleo (o un intento de abuso del flujo Connect). Se fija
-- un techo de 9.999,99 EUR. Solo se anade si la columna existe y ninguna fila
-- lo viola (en prod no deberia haber eventos por encima de ese precio).
DO $$
BEGIN
    IF to_regclass('public.events') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'events'
             AND column_name = 'price'
       )
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'events_price_max_check'
             AND conrelid = 'public.events'::regclass
       ) THEN
        IF EXISTS (SELECT 1 FROM public.events WHERE price > 9999.99) THEN
            RAISE NOTICE 'events_price_max_check NO anadido: hay filas con price > 9999.99. Revisa esos eventos primero.';
        ELSE
            ALTER TABLE public.events
                ADD CONSTRAINT events_price_max_check
                CHECK (price IS NULL OR (price >= 0 AND price <= 9999.99));
            RAISE NOTICE 'events_price_max_check anadido (0 <= price <= 9999.99).';
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Caducidad de reservas de entradas (M-BIZ-042) + barrido cronable
-- ---------------------------------------------------------------------
-- Borra las reservas 'pending_payment' que nunca llegaron a generar un cobro
-- (order_id IS NULL) y son mas viejas que el TTL. Si tienen order_id, hubo un
-- intento de pago real: NO se tocan aqui (las gestiona el webhook / cancel).
-- SECURITY DEFINER para poder borrar saltando RLS; pensada para pg_cron o
-- llamada manual del fundador. No la puede llamar un usuario normal.
CREATE OR REPLACE FUNCTION public.expire_stale_ticket_reservations(p_ttl_minutes INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ttl INT := GREATEST(COALESCE(p_ttl_minutes, 30), 5);
    v_deleted INT := 0;
BEGIN
    IF to_regclass('public.event_tickets') IS NULL THEN
        RETURN 0;
    END IF;

    DELETE FROM public.event_tickets
    WHERE status = 'pending_payment'
      AND order_id IS NULL
      AND created_at < NOW() - (v_ttl || ' minutes')::interval;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_ticket_reservations(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_ticket_reservations(INT) FROM anon;
REVOKE ALL ON FUNCTION public.expire_stale_ticket_reservations(INT) FROM authenticated;

COMMENT ON FUNCTION public.expire_stale_ticket_reservations(INT) IS
    '115 (M-BIZ-042): libera reservas pending_payment sin cobro mas viejas que '
    'el TTL (def. 30 min). Pensada para pg_cron o llamada manual; no GRANT a '
    'authenticated/anon.';

-- ---------------------------------------------------------------------
-- 3. reserve_event_ticket: limite por usuario (M-BIZ-043) + no contar
--    pendientes caducadas en el aforo (M-BIZ-042)
-- ---------------------------------------------------------------------
-- Parte de la version VIGENTE (097): mismo guard de payment_mode, misma firma
-- y mismo contrato de salida. Cambios:
--   a) Maximo 2 reservas pending_payment vivas por (usuario, evento). Una
--      pendiente "viva" es la que aun no ha caducado (created_at dentro del TTL)
--      o ya tiene order_id (intento de pago real en curso).
--   b) El conteo de aforo deja de sumar las pendientes caducadas sin cobro, asi
--      que un checkout abandonado deja de robar plaza pasado el TTL aunque el
--      barrido (seccion 2) todavia no haya corrido.
-- TTL fijado en 30 minutos (coherente con expire_stale_ticket_reservations).
CREATE OR REPLACE FUNCTION public.reserve_event_ticket(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_event RECORD;
    v_live INTEGER;
    v_pending INTEGER;
    v_price_cents INTEGER;
    v_ticket_id UUID;
    v_token TEXT;
    v_ttl CONSTANT interval := interval '30 minutes';
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

    -- M-BIZ-043: limite de reservas pending vivas por usuario y evento.
    SELECT COUNT(*) INTO v_pending
      FROM public.event_tickets
     WHERE event_id = p_event_id
       AND holder_id = v_user
       AND status = 'pending_payment'
       AND (order_id IS NOT NULL OR created_at > NOW() - v_ttl);
    IF v_pending >= 2 THEN
        RAISE EXCEPTION 'ya tienes reservas pendientes de pago para este evento';
    END IF;

    v_price_cents := ROUND(v_event.price * 100)::INTEGER;

    -- Control de aforo (NULL = sin limite). M-BIZ-042: las pendientes caducadas
    -- sin cobro (created_at fuera del TTL y order_id NULL) NO cuentan como plaza.
    IF v_event.max_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO v_live FROM public.event_tickets
         WHERE event_id = p_event_id
           AND (
                status IN ('valid', 'used')
             OR (status = 'pending_payment'
                 AND (order_id IS NOT NULL OR created_at > NOW() - v_ttl))
           );
        IF v_live >= v_event.max_capacity THEN RAISE EXCEPTION 'entradas agotadas'; END IF;
    END IF;

    -- Token unico para el QR (64 hex, sin guiones).
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

REVOKE ALL ON FUNCTION public.reserve_event_ticket(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_event_ticket(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_event_ticket(UUID) TO authenticated;

COMMENT ON FUNCTION public.reserve_event_ticket(UUID) IS
    '115 (M-BIZ-042/043): reserva con TTL de 30 min (las pendientes caducadas '
    'sin cobro no ocupan aforo) y maximo 2 pendientes vivas por usuario y evento. '
    'Resto identico a 097.';

-- ---------------------------------------------------------------------
-- 4. Funcion de retencion / limpieza (M-BD-050/051/053), cronable
-- ---------------------------------------------------------------------
-- Una sola funcion que el fundador puede cronar (pg_cron) o llamar a mano:
--   · email_notification_log: borra throttles con last_sent_at > 90 dias
--     (M-BD-053; la tabla solo crece, ref puede ser conversation_id).
--   · notifications: borra las > 90 dias (M-BD-050; complementa/da respaldo al
--     cron de 058, que solo existe si pg_cron esta habilitado y purga a 30 dias).
--   · messages: borra fisicamente los soft-deleted (is_deleted = true) > 30 dias
--     (M-BD-051; hoy nunca se eliminan del todo).
-- SECURITY DEFINER para saltar RLS; sin GRANT a authenticated/anon.
CREATE OR REPLACE FUNCTION public.run_data_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email INT := 0;
    v_notif INT := 0;
    v_msg INT := 0;
BEGIN
    IF to_regclass('public.email_notification_log') IS NOT NULL THEN
        DELETE FROM public.email_notification_log
        WHERE last_sent_at < NOW() - INTERVAL '90 days';
        GET DIAGNOSTICS v_email = ROW_COUNT;
    END IF;

    IF to_regclass('public.notifications') IS NOT NULL THEN
        DELETE FROM public.notifications
        WHERE created_at < NOW() - INTERVAL '90 days';
        GET DIAGNOSTICS v_notif = ROW_COUNT;
    END IF;

    IF to_regclass('public.messages') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'messages'
             AND column_name = 'is_deleted'
       ) THEN
        DELETE FROM public.messages
        WHERE is_deleted = true
          AND created_at < NOW() - INTERVAL '30 days';
        GET DIAGNOSTICS v_msg = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'email_notification_log_deleted', v_email,
        'notifications_deleted', v_notif,
        'soft_deleted_messages_deleted', v_msg,
        'run_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_data_retention() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_data_retention() FROM anon;
REVOKE ALL ON FUNCTION public.run_data_retention() FROM authenticated;

COMMENT ON FUNCTION public.run_data_retention() IS
    '115 (M-BD-050/051/053): purga email_notification_log (>90d), notifications '
    '(>90d) y mensajes soft-deleted (>30d). Pensada para pg_cron o llamada '
    'manual; sin GRANT a authenticated/anon.';

-- ---------------------------------------------------------------------
-- 5. COMMENT ON de los flags solapados de accommodations (M-BD-084/085)
-- ---------------------------------------------------------------------
-- is_verified / is_promoted / is_paid controlan visibilidad y destacado de
-- forma solapada; documentar la semantica reduce errores como el de entity/
-- provider. Solo se comenta lo que existe en este entorno.
DO $$
BEGIN
    IF to_regclass('public.accommodations') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='accommodations'
                     AND column_name='is_verified') THEN
            COMMENT ON COLUMN public.accommodations.is_verified IS
                'Sello de confianza (revisado por Franky o el propietario). NO controla '
                'la aparicion publica: eso lo decide status=active + is_paid.';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='accommodations'
                     AND column_name='is_promoted') THEN
            COMMENT ON COLUMN public.accommodations.is_promoted IS
                'Destacado (orden preferente en el listado). NO implica pago activo; '
                'es independiente de is_paid.';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='accommodations'
                     AND column_name='is_paid') THEN
            COMMENT ON COLUMN public.accommodations.is_paid IS
                'Suscripcion del anuncio al dia (028/105). Junto con status=active es lo '
                'que gobierna la VISIBILIDAD publica del piso. Lo escribe el webhook de '
                'Stripe, no el cliente.';
        END IF;
    END IF;
END $$;

COMMIT;

-- =====================================================================
-- COMO CRONAR LA LIMPIEZA (opcional, si pg_cron esta habilitado)
-- =====================================================================
--   SELECT cron.schedule('expire_ticket_reservations', '*/15 * * * *',
--     $job$SELECT public.expire_stale_ticket_reservations(30);$job$);
--   SELECT cron.schedule('data_retention', '30 3 * * *',
--     $job$SELECT public.run_data_retention();$job$);
-- Si pg_cron NO esta habilitado: llamar a mano de vez en cuando, o desde un
-- endpoint interno protegido (service-role).
--
-- VERIFICACION
-- =====================================================================
--   SELECT conname FROM pg_constraint WHERE conname = 'events_price_max_check';
--   SELECT public.expire_stale_ticket_reservations(30);   -- devuelve nº liberadas
--   SELECT public.run_data_retention();                   -- devuelve jsonb con contadores
--   -- reserve_event_ticket: 3a reserva pending del mismo usuario/evento -> EXCEPTION
-- =====================================================================
