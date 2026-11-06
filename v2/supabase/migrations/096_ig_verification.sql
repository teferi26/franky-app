-- =====================================================
-- 096: Crush — verificación de Instagram (real, propio, no inventado)
-- =====================================================
-- Objetivo: que la gente dé SU Instagram real y no uno inventado / de otra
-- persona. Defensa en capas:
--
--   Capa 1 (este fichero, autónoma):
--     · unicidad del handle (un @ ↔ una cuenta de Franky),
--     · reporte post-match ("este IG no existe / no es esta persona"),
--     · cuarentena automática a los 3 reportes,
--     · rate-limit a los cambios de handle.
--
--   Capa 2 (estado aquí + lógica IA en /api/crush/verify-ig):
--     · "código en la bio": al fijar el handle se genera un token franky-xxxx,
--       el usuario lo pone en su bio y sube una captura; Gemini Vision verifica
--       que se ven a la vez su @handle y el código → instagram_verified = true.
--       El bit de verificación SOLO lo escribe el servidor (service role); el
--       usuario nunca puede auto-verificarse llamando a una RPC.
-- =====================================================

-- ── Columnas nuevas en profiles ──────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS instagram_verified          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS instagram_verified_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS instagram_verify_token      TEXT,
    ADD COLUMN IF NOT EXISTS instagram_handle_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ig_quarantined              BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.instagram_verified IS 'Crush: el handle se verificó como propio (código en bio + captura revisada por IA). Solo lo escribe el servidor.';
COMMENT ON COLUMN public.profiles.instagram_verify_token IS 'Crush: código temporal franky-xxxx que el usuario debe poner en su bio para verificar la propiedad de la cuenta.';
COMMENT ON COLUMN public.profiles.ig_quarantined IS 'Crush: handle en cuarentena por reportes de "falso / no es esta persona". Se oculta de Descubrir.';

-- ── Dedupe defensivo antes del índice único ──────────────────────────────────
-- "Primer reclamante gana": si dos cuentas comparten el mismo handle, conserva
-- la que lo activó antes y libera el resto (las saca de Crush para que vuelvan a
-- entrar con SU propio Instagram).
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY lower(instagram_handle)
               ORDER BY ligar_activated_at NULLS LAST, id
           ) AS rn
    FROM public.profiles
    WHERE instagram_handle IS NOT NULL
)
UPDATE public.profiles p
SET instagram_handle    = NULL,
    ligar_opted_in      = false,
    instagram_verified  = false,
    instagram_verify_token = NULL
FROM ranked
WHERE p.id = ranked.id AND ranked.rn > 1;

-- ── Índice único: un handle ↔ una sola cuenta ────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_instagram_handle
    ON public.profiles (lower(instagram_handle))
    WHERE instagram_handle IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_ligar_profile: estado del usuario actual (ahora con verificación + token).
-- El token solo se devuelve al propio dueño (esta función es para el caller).
-- ─────────────────────────────────────────────────────────────────────────────
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
        'instagram_verified', COALESCE(v_row.instagram_verified, false),
        'instagram_verify_token', v_row.instagram_verify_token,
        'ig_quarantined', COALESCE(v_row.ig_quarantined, false),
        'opted_in', COALESCE(v_row.ligar_opted_in, false),
        'university_id', v_row.university_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ligar_profile() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- set_ligar_profile: guarda el handle + activa/desactiva Crush.
--   · valida formato Instagram,
--   · unicidad (mensaje claro si el @ ya está pillado),
--   · rate-limit: no se puede cambiar el handle más de una vez cada 30 min,
--   · al cambiar de handle se invalida la verificación y se genera nuevo token.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_ligar_profile(
    p_instagram_handle TEXT,
    p_opted_in         BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user        UUID := auth.uid();
    v_handle      TEXT;
    v_current     TEXT;
    v_changed     BOOLEAN;
    v_last_change TIMESTAMPTZ;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    -- Normaliza el handle: quita @, espacios; valida formato Instagram.
    v_handle := lower(btrim(COALESCE(p_instagram_handle, '')));
    v_handle := regexp_replace(v_handle, '^@', '');
    IF v_handle = '' THEN v_handle := NULL; END IF;

    IF v_handle IS NOT NULL AND v_handle !~ '^[a-z0-9._]{1,30}$' THEN
        RAISE EXCEPTION 'Instagram no válido';
    END IF;

    SELECT instagram_handle, instagram_handle_updated_at
      INTO v_current, v_last_change
      FROM public.profiles WHERE id = v_user;

    v_changed := COALESCE(v_handle, '') <> COALESCE(v_current, '');

    -- Rate-limit: cambiar el handle como mucho una vez cada 30 min (evita ciclar
    -- handles para spamear matches y luego cambiarlo por otro).
    IF v_changed AND v_current IS NOT NULL AND v_last_change IS NOT NULL
       AND v_last_change > NOW() - INTERVAL '30 minutes' THEN
        RAISE EXCEPTION 'Has cambiado tu Instagram hace muy poco. Espera un rato antes de volver a cambiarlo.';
    END IF;

    IF p_opted_in THEN
        IF NOT public.is_adult(v_user) THEN
            RAISE EXCEPTION 'Debes ser mayor de 18 años para usar Crush';
        END IF;
        IF v_handle IS NULL THEN
            RAISE EXCEPTION 'Necesitas indicar tu Instagram para activar Crush';
        END IF;
    END IF;

    BEGIN
        UPDATE public.profiles
        SET instagram_handle   = v_handle,
            ligar_opted_in     = COALESCE(p_opted_in, false),
            ligar_activated_at = CASE
                WHEN p_opted_in AND ligar_activated_at IS NULL THEN NOW()
                WHEN NOT p_opted_in THEN NULL
                ELSE ligar_activated_at END,
            instagram_handle_updated_at = CASE WHEN v_changed THEN NOW()
                                               ELSE instagram_handle_updated_at END,
            -- Cambiar de handle invalida la verificación previa.
            instagram_verified    = CASE WHEN v_changed THEN false ELSE instagram_verified END,
            instagram_verified_at = CASE WHEN v_changed THEN NULL  ELSE instagram_verified_at END,
            -- Genera token al fijar handle nuevo (o si por lo que sea falta).
            instagram_verify_token = CASE
                WHEN v_handle IS NULL THEN NULL
                WHEN v_changed OR instagram_verify_token IS NULL
                    THEN 'franky-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
                ELSE instagram_verify_token END,
            -- Un handle nuevo sale de cuarentena (es otra cuenta distinta).
            ig_quarantined = CASE WHEN v_changed THEN false ELSE ig_quarantined END
        WHERE id = v_user;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Ese Instagram ya está vinculado a otra cuenta de Franky';
    END;

    RETURN public.get_ligar_profile();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ligar_profile(TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ig_reports: reportes de "este Instagram es falso / no es esta persona".
-- Un reporte por (reporter, reported). Acceso solo vía RPC.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_reports (
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason      TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reporter_id, reported_id),
    CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_reports_reported ON public.ig_reports(reported_id) WHERE status = 'pending';

ALTER TABLE public.ig_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ig_reports_select_own" ON public.ig_reports;
CREATE POLICY "ig_reports_select_own"
    ON public.ig_reports FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- report_ig: reporta el Instagram de alguien con quien has hecho match. A los 3
-- reportes distintos, el handle entra en cuarentena y pierde la verificación.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_ig(p_target UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user  UUID := auth.uid();
    v_count INT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_user = p_target THEN RAISE EXCEPTION 'no puedes reportarte a ti mismo'; END IF;

    -- Solo quien ha hecho match mutuo (y por tanto vio el IG) puede reportarlo.
    IF NOT EXISTS (
        SELECT 1
        FROM public.ig_requests a
        JOIN public.ig_requests b
          ON b.requester_id = a.target_id AND b.target_id = a.requester_id
        WHERE a.requester_id = v_user AND a.target_id = p_target
    ) THEN
        RAISE EXCEPTION 'Solo puedes reportar un Instagram con el que has hecho match';
    END IF;

    INSERT INTO public.ig_reports (reporter_id, reported_id, reason)
    VALUES (v_user, p_target, NULLIF(btrim(COALESCE(p_reason, '')), ''))
    ON CONFLICT (reporter_id, reported_id) DO NOTHING;

    SELECT COUNT(DISTINCT reporter_id) INTO v_count
    FROM public.ig_reports
    WHERE reported_id = p_target AND status = 'pending';

    IF v_count >= 3 THEN
        UPDATE public.profiles
        SET ig_quarantined       = true,
            instagram_verified   = false,
            instagram_verified_at = NULL
        WHERE id = p_target;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_ig(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_ig_candidates: añade 'verified' al payload y excluye a los cuarentenados.
-- (Reemplaza la versión de 083 manteniendo el resto de la lógica.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ig_candidates(p_limit INT DEFAULT 20)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_uni UUID;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT university_id INTO v_uni FROM public.profiles WHERE id = v_user;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'age', CASE WHEN p.birth_date IS NOT NULL
                    THEN EXTRACT(YEAR FROM AGE(p.birth_date))::int ELSE NULL END,
        'city', p.city,
        'verified', COALESCE(p.instagram_verified, false)
    )
    FROM public.profiles p
    WHERE p.id <> v_user
      AND p.ligar_opted_in = true
      AND COALESCE(p.is_discarded, false) = false
      AND COALESCE(p.is_hidden, false) = false
      AND COALESCE(p.ig_quarantined, false) = false
      AND (v_uni IS NULL OR p.university_id = v_uni)
      AND NOT EXISTS (
        SELECT 1 FROM public.ig_requests r
        WHERE r.requester_id = v_user AND r.target_id = p.id
      )
      AND p.id NOT IN (
        SELECT blocked_id FROM public.blocked_users WHERE blocker_id = v_user
        UNION
        SELECT blocker_id FROM public.blocked_users WHERE blocked_id = v_user
      )
    ORDER BY
      EXISTS (
        SELECT 1 FROM public.ig_requests r2
        WHERE r2.requester_id = p.id AND r2.target_id = v_user
      ) DESC,
      random()
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ig_candidates(INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_ig_matches: añade 'verified' al payload del match.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ig_matches()
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'age', CASE WHEN p.birth_date IS NOT NULL
                    THEN EXTRACT(YEAR FROM AGE(p.birth_date))::int ELSE NULL END,
        'instagram_handle', p.instagram_handle,
        'verified', COALESCE(p.instagram_verified, false),
        'matched_at', GREATEST(mine.created_at, theirs.created_at)
    )
    FROM public.ig_requests mine
    JOIN public.ig_requests theirs
      ON theirs.requester_id = mine.target_id
     AND theirs.target_id = mine.requester_id
    JOIN public.profiles p ON p.id = mine.target_id
    WHERE mine.requester_id = v_user
    ORDER BY GREATEST(mine.created_at, theirs.created_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ig_matches() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Moderación admin de reportes de Instagram.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_ig_reports()
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'reported_id', p.id,
        'full_name', p.full_name,
        'instagram_handle', p.instagram_handle,
        'instagram_verified', COALESCE(p.instagram_verified, false),
        'ig_quarantined', COALESCE(p.ig_quarantined, false),
        'report_count', (SELECT COUNT(DISTINCT r.reporter_id) FROM public.ig_reports r
                         WHERE r.reported_id = p.id AND r.status = 'pending'),
        'reasons', COALESCE((
            SELECT jsonb_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL)
            FROM public.ig_reports r
            WHERE r.reported_id = p.id AND r.status = 'pending'
        ), '[]'::jsonb)
    )
    FROM public.profiles p
    WHERE EXISTS (
        SELECT 1 FROM public.ig_reports r
        WHERE r.reported_id = p.id AND r.status = 'pending'
    )
    ORDER BY (SELECT COUNT(*) FROM public.ig_reports r WHERE r.reported_id = p.id AND r.status = 'pending') DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_ig_reports() TO authenticated;

-- admin_ig_moderate: acciones de moderación.
--   'quarantine' → oculta de Descubrir + quita verificación,
--   'clear'      → levanta la cuarentena y descarta los reportes,
--   'wipe_handle'→ borra el handle y lo saca de Crush (caso de suplantación).
CREATE OR REPLACE FUNCTION public.admin_ig_moderate(p_target UUID, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_action NOT IN ('quarantine', 'clear', 'wipe_handle') THEN
        RAISE EXCEPTION 'acción inválida';
    END IF;

    IF p_action = 'quarantine' THEN
        UPDATE public.profiles
        SET ig_quarantined = true, instagram_verified = false, instagram_verified_at = NULL
        WHERE id = p_target;
    ELSIF p_action = 'clear' THEN
        UPDATE public.profiles SET ig_quarantined = false WHERE id = p_target;
        UPDATE public.ig_reports SET status = 'reviewed'
        WHERE reported_id = p_target AND status = 'pending';
    ELSIF p_action = 'wipe_handle' THEN
        UPDATE public.profiles
        SET instagram_handle = NULL, instagram_verified = false, instagram_verified_at = NULL,
            instagram_verify_token = NULL, ligar_opted_in = false, ig_quarantined = false
        WHERE id = p_target;
        UPDATE public.ig_reports SET status = 'reviewed'
        WHERE reported_id = p_target AND status = 'pending';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ig_moderate(UUID, TEXT) TO authenticated;
