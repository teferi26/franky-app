-- =====================================================
-- 161: Inmobiliarias — horario de visitas, métricas por piso y RLS de pago
-- =====================================================
-- 1. visit_schedules: horario semanal de la inmobiliaria. En vez de crear
--    hueco a hueco (visit_slots, 087), el propietario define "L-V 10:00-13:00
--    cada 30 min" y los huecos concretos se materializan al reservar.
-- 2. get_bookable_visit_times: expande el horario de los próximos días en
--    huecos reservables (mezclando los visit_slots manuales ya existentes).
-- 3. book_visit_at: reserva sobre el horario; materializa el visit_slot con
--    lock consultivo (sin overbooking) y delega en book_visit_slot (087).
-- 4. accommodation_views + register_accommodation_view: vistas por piso con
--    dedupe usuario/día; alimenta accommodations.views_count (muerta desde 001).
-- 5. get_owner_listing_stats: métricas por piso para el panel del propietario
--    (web y móvil): vistas, likes, favoritos, solicitudes, visitas.
-- 6. Endurecimiento RLS: la política pública de accommodations ahora exige
--    is_paid = true (antes cualquiera podía leer fichas activas sin pagar via
--    REST); el propietario conserva la lectura de todo lo suyo.
-- =====================================================

-- =====================================================
-- 1. visit_schedules — horario semanal de visitas
-- =====================================================
CREATE TABLE IF NOT EXISTS public.visit_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- NULL = el horario aplica a todos los pisos del propietario; con valor,
    -- solo a ese piso (y tiene prioridad sobre el horario general).
    accommodation_id UUID REFERENCES public.accommodations(id) ON DELETE CASCADE,
    -- 0 = domingo … 6 = sábado (mismo convenio que EXTRACT(DOW)).
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 10 AND 240),
    capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
    -- 0 = visita gratis. Si el propietario quiere cobrar la visita, aquí va
    -- el precio; el cobro reutiliza el flujo Connect de /api/stripe/pay/visit.
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_visit_schedules_owner ON public.visit_schedules(owner_id);
CREATE INDEX IF NOT EXISTS idx_visit_schedules_accommodation
    ON public.visit_schedules(accommodation_id) WHERE accommodation_id IS NOT NULL;

ALTER TABLE public.visit_schedules ENABLE ROW LEVEL SECURITY;

-- El propietario gestiona su horario; nadie más lo lee en crudo (los
-- estudiantes ven huecos concretos vía get_bookable_visit_times).
DROP POLICY IF EXISTS "visit_schedules_owner_all" ON public.visit_schedules;
CREATE POLICY "visit_schedules_owner_all"
    ON public.visit_schedules FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (
        owner_id = auth.uid()
        AND (
            accommodation_id IS NULL
            OR accommodation_id IN (SELECT id FROM public.accommodations WHERE owner_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "visit_schedules_select_admin" ON public.visit_schedules;
CREATE POLICY "visit_schedules_select_admin"
    ON public.visit_schedules FOR SELECT TO authenticated
    USING (public.is_admin());

DROP TRIGGER IF EXISTS visit_schedules_updated_at ON public.visit_schedules;
CREATE TRIGGER visit_schedules_updated_at
    BEFORE UPDATE ON public.visit_schedules
    FOR EACH ROW EXECUTE FUNCTION public.touch_visit_slots_updated_at();

-- =====================================================
-- 2. get_bookable_visit_times — huecos de los próximos días
-- =====================================================
-- Mezcla dos fuentes:
--   a) visit_slots manuales abiertos (087), con su aforo real.
--   b) el horario semanal expandido día a día, descontando el aforo de los
--      slots ya materializados por reservas anteriores.
-- Los huecos de horario que ya tienen slot materializado se devuelven UNA vez
-- (con el slot_id) para que el cliente no pinte duplicados.
CREATE OR REPLACE FUNCTION public.get_bookable_visit_times(
    p_accommodation_id UUID,
    p_days INTEGER DEFAULT 14
)
RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH acc AS (
        -- is_paid: las funciones SECURITY DEFINER se saltan la RLS, así que el
        -- gate de pago de la sección 6 hay que repetirlo aquí a mano.
        SELECT id, owner_id FROM public.accommodations
        WHERE id = p_accommodation_id AND status = 'active' AND is_paid = true
    ),
    -- Horarios aplicables: los del piso concreto si existen; si no, los
    -- generales del propietario.
    sched AS (
        SELECT s.*
        FROM public.visit_schedules s
        JOIN acc ON acc.owner_id = s.owner_id
        WHERE s.active
          AND (
            s.accommodation_id = p_accommodation_id
            OR (
                s.accommodation_id IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM public.visit_schedules s2
                    WHERE s2.owner_id = s.owner_id
                      AND s2.accommodation_id = p_accommodation_id
                      AND s2.active
                )
            )
          )
    ),
    days AS (
        SELECT (CURRENT_DATE + d)::date AS slot_date
        FROM generate_series(0, GREATEST(1, LEAST(p_days, 60)) - 1) AS d
    ),
    -- Expansión del horario en huecos concretos de slot_minutes.
    expanded AS (
        SELECT
            acc.id AS accommodation_id,
            days.slot_date,
            (t.start_ts)::time AS start_time,
            (t.start_ts + make_interval(mins => sched.slot_minutes))::time AS end_time,
            sched.capacity,
            sched.price_cents
        FROM sched
        JOIN acc ON true
        JOIN days ON EXTRACT(DOW FROM days.slot_date) = sched.weekday
        CROSS JOIN LATERAL generate_series(
            days.slot_date + sched.start_time,
            days.slot_date + sched.end_time - make_interval(mins => sched.slot_minutes),
            make_interval(mins => sched.slot_minutes)
        ) AS t(start_ts)
        -- Horas naive interpretadas como hora de España, no UTC: sin esto el
        -- corte de "ya ha pasado" baila 1-2h en las fronteras del día.
        WHERE (days.slot_date + (t.start_ts)::time) AT TIME ZONE 'Europe/Madrid' > NOW()
    ),
    manual AS (
        SELECT vs.id AS slot_id, vs.slot_date, vs.start_time, vs.end_time,
               vs.capacity, vs.price_cents,
               COALESCE(b.live, 0) AS booked
        FROM public.visit_slots vs
        LEFT JOIN (
            SELECT slot_id, COUNT(*) AS live
            FROM public.visit_bookings
            WHERE status IN ('pending', 'confirmed')
            GROUP BY slot_id
        ) b ON b.slot_id = vs.id
        WHERE vs.accommodation_id = p_accommodation_id
          AND vs.status = 'open'
          AND vs.slot_date >= CURRENT_DATE
          AND vs.slot_date < CURRENT_DATE + GREATEST(1, LEAST(p_days, 60))
    )
    SELECT u.slot
    FROM (
        SELECT m.slot_date, m.start_time,
               jsonb_build_object(
                   'slot_id', m.slot_id,
                   'slot_date', m.slot_date,
                   'start_time', m.start_time,
                   'end_time', m.end_time,
                   'price_cents', m.price_cents,
                   'available', m.capacity - m.booked
               ) AS slot
        FROM manual m
        WHERE m.capacity - m.booked > 0
          AND (m.slot_date + m.start_time) AT TIME ZONE 'Europe/Madrid' > NOW()
        UNION ALL
        SELECT e.slot_date, e.start_time,
               jsonb_build_object(
                   'slot_id', NULL,
                   'slot_date', e.slot_date,
                   'start_time', e.start_time,
                   'end_time', e.end_time,
                   'price_cents', e.price_cents,
                   'available', e.capacity
               ) AS slot
        FROM expanded e
        -- Un hueco del horario ya materializado como slot manual (misma fecha
        -- y hora) sale por la rama "manual" con su aforo real, no por aquí.
        WHERE NOT EXISTS (
            SELECT 1 FROM public.visit_slots vs
            WHERE vs.accommodation_id = e.accommodation_id
              AND vs.slot_date = e.slot_date
              AND vs.start_time = e.start_time
              AND vs.status <> 'cancelled'
        )
    ) u
    ORDER BY u.slot_date, u.start_time;
$$;

GRANT EXECUTE ON FUNCTION public.get_bookable_visit_times(UUID, INTEGER) TO anon, authenticated;

-- =====================================================
-- 3. book_visit_at — reservar un hueco del horario semanal
-- =====================================================
-- Materializa (o reutiliza) el visit_slot de esa fecha/hora y delega la
-- reserva en book_visit_slot (087), que ya controla aforo, duplicados y
-- notificaciones. El lock consultivo serializa la materialización: dos
-- reservas simultáneas del mismo hueco no crean dos slots.
CREATE OR REPLACE FUNCTION public.book_visit_at(
    p_accommodation_id UUID,
    p_slot_date DATE,
    p_start_time TIME
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_acc RECORD;
    v_sched RECORD;
    v_slot_id UUID;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF (p_slot_date + p_start_time) AT TIME ZONE 'Europe/Madrid' <= NOW() THEN
        RAISE EXCEPTION 'ese hueco ya ha pasado';
    END IF;
    -- Misma ventana que get_bookable_visit_times: sin este tope, un bucle
    -- podría materializar slots y reservas (y spamear notificaciones al
    -- propietario) para cualquier fecha futura del horario semanal.
    IF p_slot_date > CURRENT_DATE + 60 THEN
        RAISE EXCEPTION 'ese hueco está fuera del rango reservable';
    END IF;

    -- is_paid: gate de pago repetido a mano (SECURITY DEFINER ignora la RLS).
    SELECT id, owner_id INTO v_acc
      FROM public.accommodations
     WHERE id = p_accommodation_id AND status = 'active' AND is_paid = true;
    IF v_acc.id IS NULL THEN RAISE EXCEPTION 'piso no encontrado'; END IF;

    -- El hueco pedido tiene que salir del horario vigente (piso concreto con
    -- prioridad sobre el general del propietario).
    SELECT s.* INTO v_sched
      FROM public.visit_schedules s
     WHERE s.owner_id = v_acc.owner_id
       AND s.active
       AND s.weekday = EXTRACT(DOW FROM p_slot_date)
       AND s.start_time <= p_start_time
       AND s.end_time >= p_start_time + make_interval(mins => s.slot_minutes)
       -- La hora pedida debe caer exactamente en la retícula del horario.
       AND MOD(
             (EXTRACT(EPOCH FROM (p_start_time - s.start_time)))::integer,
             s.slot_minutes * 60
           ) = 0
       AND (
            s.accommodation_id = p_accommodation_id
            OR (
                s.accommodation_id IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM public.visit_schedules s2
                    WHERE s2.owner_id = s.owner_id
                      AND s2.accommodation_id = p_accommodation_id
                      AND s2.active
                )
            )
       )
     ORDER BY s.accommodation_id NULLS LAST
     LIMIT 1;

    IF v_sched.id IS NULL THEN
        RAISE EXCEPTION 'ese hueco no está dentro del horario de visitas';
    END IF;

    -- Serializa la materialización del slot para esta fecha/hora concreta.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_accommodation_id::text || p_slot_date::text || p_start_time::text, 0)
    );

    SELECT id INTO v_slot_id
      FROM public.visit_slots
     WHERE accommodation_id = p_accommodation_id
       AND slot_date = p_slot_date
       AND start_time = p_start_time
       AND status = 'open'
     LIMIT 1;

    IF v_slot_id IS NULL THEN
        INSERT INTO public.visit_slots
            (accommodation_id, owner_id, slot_date, start_time, end_time,
             capacity, price_cents, status, notes)
        VALUES
            (p_accommodation_id, v_acc.owner_id, p_slot_date, p_start_time,
             p_start_time + make_interval(mins => v_sched.slot_minutes),
             v_sched.capacity, v_sched.price_cents, 'open', 'auto: horario semanal')
        RETURNING id INTO v_slot_id;
    END IF;

    RETURN public.book_visit_slot(v_slot_id) || jsonb_build_object('slot_id', v_slot_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_visit_at(UUID, DATE, TIME) TO authenticated;

-- =====================================================
-- 4. accommodation_views — vistas por piso (dedupe usuario/día)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.accommodation_views (
    accommodation_id UUID NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    view_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (accommodation_id, viewer_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_views_acc_date
    ON public.accommodation_views(accommodation_id, view_date);

ALTER TABLE public.accommodation_views ENABLE ROW LEVEL SECURITY;
-- Sin políticas: se escribe solo vía RPC SECURITY DEFINER y se lee agregada
-- vía get_owner_listing_stats. Nadie ve QUIÉN miró un piso, solo cuántos.

CREATE OR REPLACE FUNCTION public.register_accommodation_view(p_accommodation_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_owner UUID;
BEGIN
    IF v_user IS NULL THEN RETURN; END IF;

    -- is_paid: gate de pago repetido a mano (SECURITY DEFINER ignora la RLS).
    SELECT owner_id INTO v_owner FROM public.accommodations
     WHERE id = p_accommodation_id AND status = 'active' AND is_paid = true;
    IF v_owner IS NULL OR v_owner = v_user THEN RETURN; END IF;

    INSERT INTO public.accommodation_views (accommodation_id, viewer_id)
    VALUES (p_accommodation_id, v_user)
    ON CONFLICT (accommodation_id, viewer_id, view_date) DO NOTHING;

    -- Solo la primera vista del día suma al contador global.
    IF FOUND THEN
        UPDATE public.accommodations
           SET views_count = COALESCE(views_count, 0) + 1
         WHERE id = p_accommodation_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_accommodation_view(UUID) TO authenticated;

-- =====================================================
-- 5. get_owner_listing_stats — métricas por piso del propietario
-- =====================================================
-- Todo agregado y limitado a los pisos de auth.uid(). Las identidades de las
-- solicitudes ya son visibles para el owner por RLS (011); aquí solo van
-- contadores.
CREATE OR REPLACE FUNCTION public.get_owner_listing_stats()
RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'accommodation_id', a.id,
        'title', a.title,
        'status', a.status,
        'is_paid', a.is_paid,
        'price', a.price,
        'cover_image', (a.images)[1],
        'views_total', COALESCE(a.views_count, 0),
        'views_7d', COALESCE(v7.views, 0),
        'likes', COALESCE(sw.likes, 0),
        'favorites', COALESCE(fav.favs, 0),
        'requests_pending', COALESCE(req.pending, 0),
        'requests_total', COALESCE(req.total, 0),
        'visits_upcoming', COALESCE(vis.upcoming, 0),
        'visits_total', COALESCE(vis.total, 0),
        'created_at', a.created_at
    )
    FROM public.accommodations a
    LEFT JOIN (
        SELECT accommodation_id, COUNT(*) AS views
        FROM public.accommodation_views
        WHERE view_date >= CURRENT_DATE - 7
        GROUP BY accommodation_id
    ) v7 ON v7.accommodation_id = a.id
    LEFT JOIN (
        SELECT target_id, COUNT(*) AS likes
        FROM public.swipe_actions
        WHERE target_type = 'accommodation' AND action IN ('like', 'superlike')
        GROUP BY target_id
    ) sw ON sw.target_id = a.id
    LEFT JOIN (
        SELECT target_id, COUNT(*) AS favs
        FROM public.favorites
        WHERE target_type = 'accommodation'
        GROUP BY target_id
    ) fav ON fav.target_id = a.id
    LEFT JOIN (
        SELECT accommodation_id,
               COUNT(*) FILTER (WHERE status = 'pending') AS pending,
               COUNT(*) AS total
        FROM public.accommodation_requests
        GROUP BY accommodation_id
    ) req ON req.accommodation_id = a.id
    LEFT JOIN (
        SELECT vs.accommodation_id,
               COUNT(*) FILTER (
                   WHERE vb.status IN ('pending', 'confirmed')
                     AND (vs.slot_date + vs.start_time) > NOW()
               ) AS upcoming,
               COUNT(*) AS total
        FROM public.visit_bookings vb
        JOIN public.visit_slots vs ON vs.id = vb.slot_id
        GROUP BY vs.accommodation_id
    ) vis ON vis.accommodation_id = a.id
    WHERE a.owner_id = auth.uid()
    ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_listing_stats() TO authenticated;

-- =====================================================
-- 6. RLS: la ficha pública exige is_paid (antes solo status='active')
-- =====================================================
-- El catálogo web ya filtraba is_paid en la query, pero la política dejaba
-- leer por REST cualquier ficha activa sin pagar. Ahora el gate es de BD.
-- El propietario sigue viendo todo lo suyo (política nueva) y el admin ya
-- tenía FOR ALL (001/015).
DROP POLICY IF EXISTS "Active accommodations viewable by everyone" ON public.accommodations;
CREATE POLICY "accommodations_select_public"
    ON public.accommodations FOR SELECT
    USING (status = 'active' AND is_paid = true);

DROP POLICY IF EXISTS "accommodations_select_owner" ON public.accommodations;
CREATE POLICY "accommodations_select_owner"
    ON public.accommodations FOR SELECT TO authenticated
    USING (owner_id = auth.uid());
