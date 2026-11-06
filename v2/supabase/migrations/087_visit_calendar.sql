-- =====================================================
-- 087: Visitas con calendario + cobro
-- =====================================================
-- El propietario publica huecos de visita (visit_slots) con aforo y precio
-- (0 = gratis). El estudiante reserva un hueco (visit_bookings):
--   · gratis  → reserva confirmada al instante, propietario notificado.
--   · de pago → reserva 'pending' + payment_status 'pending'; la ruta
--               /api/stripe/pay/visit crea el cobro Connect y el webhook la
--               pasa a 'confirmed' / 'paid'.
--
-- El control de aforo es transaccional: book_visit_slot bloquea la fila del
-- slot (FOR UPDATE) y cuenta las reservas vivas antes de insertar, evitando
-- overbooking en reservas simultáneas.
-- =====================================================

-- =====================================================
-- 1. visit_slots — huecos de visita definidos por el propietario
-- =====================================================
CREATE TABLE IF NOT EXISTS public.visit_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accommodation_id UUID NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_visit_slots_accommodation ON public.visit_slots(accommodation_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_visit_slots_owner ON public.visit_slots(owner_id);
CREATE INDEX IF NOT EXISTS idx_visit_slots_open ON public.visit_slots(status, slot_date) WHERE status = 'open';

ALTER TABLE public.visit_slots ENABLE ROW LEVEL SECURITY;

-- Cualquiera ve los huecos abiertos (ficha pública del piso).
DROP POLICY IF EXISTS "visit_slots_select_open" ON public.visit_slots;
CREATE POLICY "visit_slots_select_open"
    ON public.visit_slots FOR SELECT
    USING (status = 'open');

-- El propietario ve todos los suyos (incluidos closed/cancelled).
DROP POLICY IF EXISTS "visit_slots_select_owner" ON public.visit_slots;
CREATE POLICY "visit_slots_select_owner"
    ON public.visit_slots FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "visit_slots_select_admin" ON public.visit_slots;
CREATE POLICY "visit_slots_select_admin"
    ON public.visit_slots FOR SELECT TO authenticated
    USING (public.is_admin());

-- El propietario gestiona sus huecos directamente (no hay dinero en juego al
-- crearlos; el cobro se valida en servidor al reservar).
DROP POLICY IF EXISTS "visit_slots_insert_owner" ON public.visit_slots;
CREATE POLICY "visit_slots_insert_owner"
    ON public.visit_slots FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = auth.uid()
        AND accommodation_id IN (SELECT id FROM public.accommodations WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "visit_slots_update_owner" ON public.visit_slots;
CREATE POLICY "visit_slots_update_owner"
    ON public.visit_slots FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "visit_slots_delete_owner" ON public.visit_slots;
CREATE POLICY "visit_slots_delete_owner"
    ON public.visit_slots FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

-- =====================================================
-- 2. visit_bookings — reservas de los estudiantes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.visit_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID NOT NULL REFERENCES public.visit_slots(id) ON DELETE CASCADE,
    visitor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled_by_owner', 'cancelled_by_visitor', 'completed')),
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    payment_status TEXT NOT NULL DEFAULT 'not_required'
        CHECK (payment_status IN ('not_required', 'pending', 'paid', 'refunded')),
    order_id UUID,  -- soft-FK a payments.id (la fila se crea en /api/stripe/pay/visit)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_bookings_slot ON public.visit_bookings(slot_id, status);
CREATE INDEX IF NOT EXISTS idx_visit_bookings_visitor ON public.visit_bookings(visitor_id);
-- Un visitante no puede tener dos reservas vivas del mismo hueco.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_booking_live
    ON public.visit_bookings(slot_id, visitor_id)
    WHERE status IN ('pending', 'confirmed');

ALTER TABLE public.visit_bookings ENABLE ROW LEVEL SECURITY;

-- El visitante ve sus reservas.
DROP POLICY IF EXISTS "visit_bookings_select_visitor" ON public.visit_bookings;
CREATE POLICY "visit_bookings_select_visitor"
    ON public.visit_bookings FOR SELECT TO authenticated
    USING (visitor_id = auth.uid());

-- El propietario ve las reservas de sus huecos.
DROP POLICY IF EXISTS "visit_bookings_select_owner" ON public.visit_bookings;
CREATE POLICY "visit_bookings_select_owner"
    ON public.visit_bookings FOR SELECT TO authenticated
    USING (slot_id IN (SELECT id FROM public.visit_slots WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "visit_bookings_select_admin" ON public.visit_bookings;
CREATE POLICY "visit_bookings_select_admin"
    ON public.visit_bookings FOR SELECT TO authenticated
    USING (public.is_admin());

-- Escrituras solo vía RPC (aforo) y service-role (webhook). Sin INSERT/UPDATE
-- para authenticated.

-- =====================================================
-- 3. Triggers updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_visit_slots_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS visit_slots_updated_at ON public.visit_slots;
CREATE TRIGGER visit_slots_updated_at
    BEFORE UPDATE ON public.visit_slots
    FOR EACH ROW EXECUTE FUNCTION public.touch_visit_slots_updated_at();

CREATE OR REPLACE FUNCTION public.touch_visit_bookings_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS visit_bookings_updated_at ON public.visit_bookings;
CREATE TRIGGER visit_bookings_updated_at
    BEFORE UPDATE ON public.visit_bookings
    FOR EACH ROW EXECUTE FUNCTION public.touch_visit_bookings_updated_at();

-- =====================================================
-- 4. book_visit_slot — reserva con control de aforo transaccional
-- =====================================================
CREATE OR REPLACE FUNCTION public.book_visit_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_slot RECORD;
    v_live INTEGER;
    v_booking_id UUID;
    v_owner UUID;
    v_title TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    -- Bloquea el hueco para serializar reservas concurrentes.
    SELECT vs.id, vs.capacity, vs.price_cents, vs.status, vs.owner_id, vs.slot_date,
           a.title
      INTO v_slot
      FROM public.visit_slots vs
      JOIN public.accommodations a ON a.id = vs.accommodation_id
     WHERE vs.id = p_slot_id
     FOR UPDATE OF vs;

    IF v_slot.id IS NULL THEN RAISE EXCEPTION 'hueco no encontrado'; END IF;
    IF v_slot.status <> 'open' THEN RAISE EXCEPTION 'hueco no disponible'; END IF;
    IF v_slot.owner_id = v_user THEN RAISE EXCEPTION 'no puedes reservar tu propio piso'; END IF;

    -- ¿Ya tiene una reserva viva?
    PERFORM 1 FROM public.visit_bookings
     WHERE slot_id = p_slot_id AND visitor_id = v_user
       AND status IN ('pending', 'confirmed');
    IF FOUND THEN RAISE EXCEPTION 'ya tienes una reserva en este hueco'; END IF;

    SELECT COUNT(*) INTO v_live FROM public.visit_bookings
     WHERE slot_id = p_slot_id AND status IN ('pending', 'confirmed');
    IF v_live >= v_slot.capacity THEN RAISE EXCEPTION 'aforo completo'; END IF;

    INSERT INTO public.visit_bookings (slot_id, visitor_id, price_cents, status, payment_status)
    VALUES (
        p_slot_id, v_user, v_slot.price_cents,
        CASE WHEN v_slot.price_cents > 0 THEN 'pending' ELSE 'confirmed' END,
        CASE WHEN v_slot.price_cents > 0 THEN 'pending' ELSE 'not_required' END
    )
    RETURNING id INTO v_booking_id;

    -- Visita gratuita: confirmada al instante → avisa al propietario.
    IF v_slot.price_cents = 0 THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_slot.owner_id, 'visit', 'Nueva visita reservada 📅',
            'Un estudiante ha reservado una visita a "' || v_slot.title || '" el ' ||
                to_char(v_slot.slot_date, 'DD/MM/YYYY') || '.',
            jsonb_build_object('kind', 'visit_booked', 'booking_id', v_booking_id,
                               'slot_id', p_slot_id, 'url', '/propietario/dashboard/visitas')
        );
    END IF;

    RETURN jsonb_build_object(
        'booking_id', v_booking_id,
        'price_cents', v_slot.price_cents,
        'requires_payment', v_slot.price_cents > 0
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_visit_slot(UUID) TO authenticated;

-- =====================================================
-- 5. cancel_visit_booking — el visitante o el propietario cancela
-- =====================================================
CREATE OR REPLACE FUNCTION public.cancel_visit_booking(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_b RECORD;
    v_is_owner BOOLEAN;
    v_other UUID;
    v_title TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT vb.id, vb.visitor_id, vb.status, vs.owner_id, a.title
      INTO v_b
      FROM public.visit_bookings vb
      JOIN public.visit_slots vs ON vs.id = vb.slot_id
      JOIN public.accommodations a ON a.id = vs.accommodation_id
     WHERE vb.id = p_booking_id
     FOR UPDATE OF vb;

    IF v_b.id IS NULL THEN RAISE EXCEPTION 'reserva no encontrada'; END IF;
    IF v_b.status NOT IN ('pending', 'confirmed') THEN
        RAISE EXCEPTION 'la reserva ya no está activa';
    END IF;

    v_is_owner := v_b.owner_id = v_user;
    IF NOT v_is_owner AND v_b.visitor_id <> v_user THEN
        RAISE EXCEPTION 'no autorizado';
    END IF;

    UPDATE public.visit_bookings
       SET status = CASE WHEN v_is_owner THEN 'cancelled_by_owner' ELSE 'cancelled_by_visitor' END
     WHERE id = p_booking_id;

    -- Notifica a la otra parte.
    v_other := CASE WHEN v_is_owner THEN v_b.visitor_id ELSE v_b.owner_id END;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        v_other, 'visit', 'Visita cancelada',
        'Se ha cancelado una visita a "' || v_b.title || '".',
        jsonb_build_object('kind', 'visit_cancelled', 'booking_id', p_booking_id)
    );

    RETURN jsonb_build_object('ok', true, 'cancelled_by', CASE WHEN v_is_owner THEN 'owner' ELSE 'visitor' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_visit_booking(UUID) TO authenticated;

-- =====================================================
-- 6. get_slot_availability — aforo libre de un hueco (ficha del piso)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_slot_availability(p_accommodation_id UUID)
RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'id', vs.id,
        'slot_date', vs.slot_date,
        'start_time', vs.start_time,
        'end_time', vs.end_time,
        'price_cents', vs.price_cents,
        'capacity', vs.capacity,
        'booked', COALESCE(b.live, 0),
        'available', vs.capacity - COALESCE(b.live, 0)
    )
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
    ORDER BY vs.slot_date, vs.start_time;
$$;

GRANT EXECUTE ON FUNCTION public.get_slot_availability(UUID) TO anon, authenticated;
