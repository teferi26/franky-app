-- =====================================================
-- 086: Compañeros en piso — vínculo inquilino ↔ alojamiento
-- =====================================================
-- El propietario marca qué estudiantes viven en cada piso. El estudiante debe
-- ACEPTAR la invitación (consentimiento) y puede ocultarse del listado público
-- (is_public). Quien busca compañero ve los perfiles públicos de los inquilinos
-- y puede indicar "ya vivo en un piso" enlazando a su alojamiento.
--
-- El listado público NO se sirve por SELECT directo (RLS solo deja leer al
-- inquilino/propietario/admin); se sirve por RPC SECURITY DEFINER que aplica la
-- regla de consentimiento y solo expone campos de public_profiles.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tenancies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accommodation_id UUID NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    room_label TEXT,
    status TEXT NOT NULL DEFAULT 'pending_confirmation'
        CHECK (status IN ('pending_confirmation', 'active', 'ended', 'rejected')),
    is_public BOOLEAN NOT NULL DEFAULT true,
    start_date DATE,
    end_date DATE,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenancies_accommodation ON public.tenancies(accommodation_id, status);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant ON public.tenancies(tenant_id, status);
-- Un inquilino solo puede tener una tenencia activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancy_active_tenant
    ON public.tenancies(tenant_id) WHERE status = 'active';
-- Evita invitaciones duplicadas al mismo piso.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancy_pending
    ON public.tenancies(accommodation_id, tenant_id)
    WHERE status IN ('pending_confirmation', 'active');

ALTER TABLE public.tenancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenancies_select_tenant" ON public.tenancies;
CREATE POLICY "tenancies_select_tenant"
    ON public.tenancies FOR SELECT TO authenticated
    USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "tenancies_select_owner" ON public.tenancies;
CREATE POLICY "tenancies_select_owner"
    ON public.tenancies FOR SELECT TO authenticated
    USING (accommodation_id IN (SELECT id FROM public.accommodations WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "tenancies_select_admin" ON public.tenancies;
CREATE POLICY "tenancies_select_admin"
    ON public.tenancies FOR SELECT TO authenticated
    USING (public.is_admin());

-- Escrituras vía RPC SECURITY DEFINER (abajo); sin políticas INSERT/UPDATE
-- para authenticated.

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_tenancies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenancies_updated_at ON public.tenancies;
CREATE TRIGGER tenancies_updated_at
    BEFORE UPDATE ON public.tenancies
    FOR EACH ROW EXECUTE FUNCTION public.touch_tenancies_updated_at();

-- ─────────────────────────────────────────────────────
-- invite_tenant: el propietario invita a un estudiante a su piso.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_tenant(
    p_accommodation_id UUID,
    p_tenant_id UUID,
    p_room_label TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_title TEXT;
    v_id UUID;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_user = p_tenant_id THEN RAISE EXCEPTION 'no puedes invitarte a ti mismo'; END IF;

    -- El piso debe ser del usuario.
    SELECT title INTO v_title FROM public.accommodations
    WHERE id = p_accommodation_id AND owner_id = v_user;
    IF v_title IS NULL THEN RAISE EXCEPTION 'piso no encontrado o no es tuyo'; END IF;

    INSERT INTO public.tenancies (accommodation_id, tenant_id, invited_by, room_label, start_date)
    VALUES (p_accommodation_id, p_tenant_id, v_user, p_room_label, p_start_date)
    RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        p_tenant_id,
        'tenancy',
        'Te han añadido a un piso 🏠',
        'Un propietario quiere marcarte como inquilino de "' || v_title || '". Acéptalo para que aparezca en tu perfil.',
        jsonb_build_object('kind', 'tenancy_invite', 'tenancy_id', v_id, 'url', '/perfil')
    );

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_tenant(UUID, UUID, TEXT, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────
-- respond_tenancy: el inquilino acepta o rechaza la invitación.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_tenancy(p_tenancy_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_owner UUID;
    v_title TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT a.owner_id, a.title INTO v_owner, v_title
    FROM public.tenancies t
    JOIN public.accommodations a ON a.id = t.accommodation_id
    WHERE t.id = p_tenancy_id AND t.tenant_id = v_user
      AND t.status = 'pending_confirmation';
    IF v_owner IS NULL THEN RAISE EXCEPTION 'invitación no encontrada'; END IF;

    IF p_accept THEN
        UPDATE public.tenancies
        SET status = 'active', confirmed_at = NOW()
        WHERE id = p_tenancy_id;
        -- Ya vive en un piso: deja de buscar compañero.
        UPDATE public.profiles SET looking_for_roommate = false WHERE id = v_user;
    ELSE
        UPDATE public.tenancies SET status = 'rejected' WHERE id = p_tenancy_id;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        v_owner,
        'tenancy',
        CASE WHEN p_accept THEN 'Inquilino confirmado ✅' ELSE 'Invitación rechazada' END,
        CASE WHEN p_accept
            THEN 'Un estudiante ha confirmado que vive en "' || v_title || '".'
            ELSE 'Un estudiante ha rechazado la invitación a "' || v_title || '".' END,
        jsonb_build_object('kind', 'tenancy_response', 'tenancy_id', p_tenancy_id, 'accepted', p_accept)
    );

    RETURN jsonb_build_object('ok', true, 'accepted', p_accept);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_tenancy(UUID, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────
-- end_tenancy: propietario o inquilino finaliza la tenencia.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_tenancy(p_tenancy_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_ok BOOLEAN;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT TRUE INTO v_ok
    FROM public.tenancies t
    JOIN public.accommodations a ON a.id = t.accommodation_id
    WHERE t.id = p_tenancy_id
      AND (t.tenant_id = v_user OR a.owner_id = v_user);
    IF v_ok IS NULL THEN RAISE EXCEPTION 'no autorizado'; END IF;

    UPDATE public.tenancies
    SET status = 'ended', end_date = COALESCE(end_date, CURRENT_DATE)
    WHERE id = p_tenancy_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_tenancy(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- set_tenancy_visibility: el inquilino muestra/oculta su perfil en el piso.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_tenancy_visibility(p_tenancy_id UUID, p_is_public BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_ok BOOLEAN;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    UPDATE public.tenancies
    SET is_public = p_is_public
    WHERE id = p_tenancy_id AND tenant_id = v_user
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NULL THEN RAISE EXCEPTION 'tenencia no encontrada'; END IF;
    RETURN jsonb_build_object('ok', true, 'is_public', p_is_public);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenancy_visibility(UUID, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_my_current_tenancy: tenencia activa del usuario + resumen del piso.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_current_tenancy()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'tenancy_id', t.id,
        'is_public', t.is_public,
        'room_label', t.room_label,
        'accommodation', jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'city', a.city,
            'image', CASE WHEN a.images IS NOT NULL AND array_length(a.images, 1) > 0
                          THEN a.images[1] ELSE NULL END
        )
    )
    FROM public.tenancies t
    JOIN public.accommodations a ON a.id = t.accommodation_id
    WHERE t.tenant_id = auth.uid() AND t.status = 'active'
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_current_tenancy() TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_flat_public_residents: inquilinos públicos y activos de un piso.
-- Solo campos de public_profiles. Accesible por cualquiera (vista del piso).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_flat_public_residents(p_accommodation_id UUID)
RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'id', pp.id,
        'full_name', pp.full_name,
        'avatar_url', pp.avatar_url,
        'career', pp.career,
        'university_course', pp.university_course,
        'room_label', t.room_label
    )
    FROM public.tenancies t
    JOIN public.public_profiles pp ON pp.id = t.tenant_id
    WHERE t.accommodation_id = p_accommodation_id
      AND t.status = 'active'
      AND t.is_public = true
    ORDER BY pp.full_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_flat_public_residents(UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────
-- get_public_tenancy_for: piso público donde vive un usuario (perfil público).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_tenancy_for(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'accommodation_id', a.id,
        'title', a.title,
        'city', a.city
    )
    FROM public.tenancies t
    JOIN public.accommodations a ON a.id = t.accommodation_id
    WHERE t.tenant_id = p_user_id AND t.status = 'active' AND t.is_public = true
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_tenancy_for(UUID) TO anon, authenticated;
