-- =====================================================
-- 082: Ligar en la biblioteca — perfil + gate 18+ + Instagram privado
-- =====================================================
-- Base de la función "ligar": el usuario activa la función él mismo
-- (consentimiento GDPR), debe haber cumplido ya 18 años, y guarda su
-- Instagram. El handle es PRIVADO: no se muestra en FOMO ni en el perfil
-- público; solo se revelará en el intercambio mutuo (fase 2.2).
-- =====================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS instagram_handle    TEXT,
    ADD COLUMN IF NOT EXISTS ligar_opted_in      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ligar_activated_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.instagram_handle IS 'Ligar: handle de Instagram PRIVADO. Nunca se expone salvo en intercambio mutuo.';
COMMENT ON COLUMN public.profiles.ligar_opted_in IS 'Ligar: el usuario activó la función él mismo (consentimiento).';

-- Índice parcial para listar participantes activos.
CREATE INDEX IF NOT EXISTS idx_profiles_ligar_active
    ON public.profiles (university_id)
    WHERE ligar_opted_in = true;

-- ─────────────────────────────────────────────────────
-- Helper: ¿el usuario ya cumplió 18? (estrictamente cumplidos, no "los cumple
-- este año"). NULL birth_date => false.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_adult(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE(
        (SELECT birth_date IS NOT NULL
                AND birth_date <= (CURRENT_DATE - INTERVAL '18 years')
         FROM public.profiles WHERE id = p_user),
        false
    );
$$;

-- ─────────────────────────────────────────────────────
-- get_ligar_profile: estado del usuario actual para la pantalla de ligar.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ligar_profile()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_row public.profiles%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT * INTO v_row FROM public.profiles WHERE id = v_user;

    RETURN jsonb_build_object(
        'eligible', public.is_adult(v_user),
        'age', CASE WHEN v_row.birth_date IS NOT NULL
                    THEN EXTRACT(YEAR FROM AGE(v_row.birth_date))::int ELSE NULL END,
        'instagram_handle', v_row.instagram_handle,
        'opted_in', COALESCE(v_row.ligar_opted_in, false),
        'university_id', v_row.university_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ligar_profile() TO authenticated;

-- ─────────────────────────────────────────────────────
-- set_ligar_profile: activa/desactiva ligar y guarda el Instagram.
-- Activar exige 18+ cumplidos y un handle válido.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_ligar_profile(
    p_instagram_handle TEXT,
    p_opted_in         BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_handle TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    -- Normaliza el handle: quita @, espacios; valida formato Instagram.
    v_handle := lower(btrim(COALESCE(p_instagram_handle, '')));
    v_handle := regexp_replace(v_handle, '^@', '');
    IF v_handle = '' THEN v_handle := NULL; END IF;

    IF v_handle IS NOT NULL AND v_handle !~ '^[a-z0-9._]{1,30}$' THEN
        RAISE EXCEPTION 'Instagram no válido';
    END IF;

    IF p_opted_in THEN
        IF NOT public.is_adult(v_user) THEN
            RAISE EXCEPTION 'Debes ser mayor de 18 años para usar ligar';
        END IF;
        IF v_handle IS NULL THEN
            RAISE EXCEPTION 'Necesitas indicar tu Instagram para activar ligar';
        END IF;
    END IF;

    UPDATE public.profiles
    SET instagram_handle   = v_handle,
        ligar_opted_in     = COALESCE(p_opted_in, false),
        ligar_activated_at = CASE
            WHEN p_opted_in AND ligar_activated_at IS NULL THEN NOW()
            WHEN NOT p_opted_in THEN NULL
            ELSE ligar_activated_at END
    WHERE id = v_user;

    RETURN public.get_ligar_profile();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ligar_profile(TEXT, BOOLEAN) TO authenticated;
