-- =====================================================
-- 103: University admin role + scoped dashboard (SCU Fase 2)
--
-- ⚠️ NO APLICAR A PRODUCCIÓN hasta cerrar el incidente de seguridad
--    (rotar claves + aplicar fix 101) y revisar esta RLS (skill franky-rls-review).
--    Esta migración crea un ROL NUEVO + RLS NUEVA + superficie de datos por
--    universidad: es exactamente lo que no se despliega con un incidente abierto.
--
-- Diseño de seguridad:
--   · Una cuenta "gestor de universidad" SOLO puede ver/editar SU universidad.
--   · El alcance NO viaja como parámetro: cada RPC deriva la universidad del
--     vínculo `university_admins` del propio auth.uid(). No se puede consultar
--     otra universidad cambiando un argumento.
--   · Las RPCs de métricas devuelven SOLO agregados anónimos (recuentos,
--     etiquetas). Nunca filas de usuarios ni datos personales. Los buckets de
--     origen con <3 personas se agrupan en "Otras" (anti-reidentificación).
--   · Las ediciones pasan por una RPC con lista blanca de columnas: el gestor
--     NO puede tocar identidad (name/slug/type) ni estado de colaboración
--     (is_partner/partner_tier). Eso queda para el admin de plataforma.
-- =====================================================

-- ── 1. Rol nuevo ─────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'propietario', 'university_admin'));

-- ── 2. Tabla de vínculo gestor ↔ universidad ─────────
CREATE TABLE IF NOT EXISTS public.university_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (university_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_university_admins_profile ON public.university_admins(profile_id);
CREATE INDEX IF NOT EXISTS idx_university_admins_university ON public.university_admins(university_id);

ALTER TABLE public.university_admins ENABLE ROW LEVEL SECURITY;

-- El gestor solo ve su propio vínculo. El admin de plataforma gestiona todo.
DROP POLICY IF EXISTS "University admins see own link" ON public.university_admins;
CREATE POLICY "University admins see own link"
    ON public.university_admins FOR SELECT
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage university_admins" ON public.university_admins;
CREATE POLICY "Admins manage university_admins"
    ON public.university_admins FOR ALL
    USING (public.is_admin());

-- ── 3. Helpers ───────────────────────────────────────

-- Universidad que gestiona el usuario actual (NULL si no es gestor).
CREATE OR REPLACE FUNCTION public.my_university_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT university_id
    FROM public.university_admins
    WHERE profile_id = auth.uid()
    ORDER BY created_at
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_university_admin(p_university_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.university_admins
        WHERE profile_id = auth.uid() AND university_id = p_university_id
    );
$$;

-- Exige gestor y devuelve su universidad, o lanza 'forbidden'.
CREATE OR REPLACE FUNCTION public._require_university_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uni uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    SELECT university_id INTO v_uni
    FROM public.university_admins
    WHERE profile_id = auth.uid()
    ORDER BY created_at
    LIMIT 1;
    IF v_uni IS NULL THEN
        RAISE EXCEPTION 'forbidden' USING HINT = 'university_admin role required';
    END IF;
    RETURN v_uni;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_university_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_university_admin(uuid) TO authenticated;

-- ── 4. RPCs de métricas (solo agregados, auto-scoped) ─

-- Resumen de la audiencia de la universidad. "Audiencia" = perfiles vinculados
-- a la universidad (estudian allí) O que desean uno de sus grados (prospectos).
CREATE OR REPLACE FUNCTION public.uni_admin_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uni uuid := public._require_university_admin();
    v_career_ids uuid[] := ARRAY(SELECT id FROM public.careers WHERE university_id = v_uni);
    v_total int; v_new30 int; v_study int; v_prospect int;
    v_housing int; v_roommate int; v_voc int;
    v_by_type jsonb;
BEGIN
    SELECT
        count(*),
        count(*) FILTER (WHERE created_at >= now() - interval '30 days'),
        count(*) FILTER (WHERE university_id = v_uni),
        count(*) FILTER (WHERE desired_career_id = ANY(v_career_ids)),
        count(*) FILTER (WHERE looking_for_housing IS TRUE),
        count(*) FILTER (WHERE looking_for_roommate IS TRUE)
    INTO v_total, v_new30, v_study, v_prospect, v_housing, v_roommate
    FROM public.profiles p
    WHERE p.is_discarded IS NOT TRUE
      AND (p.university_id = v_uni OR p.desired_career_id = ANY(v_career_ids));

    SELECT count(DISTINCT vr.user_id) INTO v_voc
    FROM public.vocational_results vr
    JOIN public.profiles p ON p.id = vr.user_id
    WHERE p.is_discarded IS NOT TRUE
      AND (p.university_id = v_uni OR p.desired_career_id = ANY(v_career_ids));

    SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY c DESC)
    INTO v_by_type
    FROM (
        SELECT COALESCE(p.student_type, 'sin_dato') AS label, count(*) AS c
        FROM public.profiles p
        WHERE p.is_discarded IS NOT TRUE
          AND (p.university_id = v_uni OR p.desired_career_id = ANY(v_career_ids))
        GROUP BY 1
    ) t;

    RETURN jsonb_build_object(
        'university_id', v_uni,
        'university_name', (SELECT name FROM public.universities WHERE id = v_uni),
        'audience_total', v_total,
        'audience_new_30d', v_new30,
        'studying_here', v_study,
        'prospects', v_prospect,
        'looking_housing', v_housing,
        'looking_roommate', v_roommate,
        'vocational_completed', v_voc,
        'by_student_type', COALESCE(v_by_type, '[]'::jsonb),
        'generated_at', now()
    );
END;
$$;

-- Grados de la universidad más demandados (vía desired_career_id).
CREATE OR REPLACE FUNCTION public.uni_admin_top_careers(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uni uuid := public._require_university_admin();
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('career_id', cid, 'name', cname, 'count', n) ORDER BY n DESC)
    INTO v_result
    FROM (
        SELECT c.id AS cid, c.name AS cname, count(*) AS n
        FROM public.profiles p
        JOIN public.careers c ON c.id = p.desired_career_id
        WHERE c.university_id = v_uni
          AND p.is_discarded IS NOT TRUE
        GROUP BY c.id, c.name
        ORDER BY n DESC
        LIMIT GREATEST(p_limit, 1)
    ) t;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- De qué comunidad autónoma vienen los interesados (buckets <3 → "Otras").
CREATE OR REPLACE FUNCTION public.uni_admin_origin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uni uuid := public._require_university_admin();
    v_career_ids uuid[] := ARRAY(SELECT id FROM public.careers WHERE university_id = v_uni);
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY c DESC)
    INTO v_result
    FROM (
        SELECT CASE WHEN c < 3 THEN 'Otras' ELSE label END AS label, sum(c) AS c
        FROM (
            SELECT COALESCE(p.comunidad_autonoma, 'Sin dato') AS label, count(*) AS c
            FROM public.profiles p
            WHERE p.is_discarded IS NOT TRUE
              AND (p.university_id = v_uni OR p.desired_career_id = ANY(v_career_ids))
            GROUP BY 1
        ) g
        GROUP BY 1
    ) s;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Altas de audiencia por mes (últimos N meses).
CREATE OR REPLACE FUNCTION public.uni_admin_signups_monthly(p_months int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uni uuid := public._require_university_admin();
    v_career_ids uuid[] := ARRAY(SELECT id FROM public.careers WHERE university_id = v_uni);
    v_result jsonb;
BEGIN
    WITH months AS (
        SELECT date_trunc('month', generate_series(
            date_trunc('month', now()) - ((GREATEST(p_months, 1) - 1) || ' months')::interval,
            date_trunc('month', now()),
            '1 month'::interval
        )) AS m
    ),
    signups AS (
        SELECT date_trunc('month', p.created_at) AS m, count(*) AS c
        FROM public.profiles p
        WHERE p.is_discarded IS NOT TRUE
          AND (p.university_id = v_uni OR p.desired_career_id = ANY(v_career_ids))
        GROUP BY 1
    )
    SELECT jsonb_agg(
        jsonb_build_object('month', to_char(mo.m, 'YYYY-MM'), 'count', COALESCE(s.c, 0))
        ORDER BY mo.m
    )
    INTO v_result
    FROM months mo
    LEFT JOIN signups s ON s.m = mo.m;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.uni_admin_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.uni_admin_top_careers(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uni_admin_origin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.uni_admin_signups_monthly(int) TO authenticated;

-- ── 5. Edición de la ficha por el gestor (lista blanca) ─
-- Solo columnas de contenido. NO toca name/slug/type/is_partner/partner_tier.
CREATE OR REPLACE FUNCTION public.update_my_university(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uni uuid := public._require_university_admin();
    v_row public.universities%ROWTYPE;
BEGIN
    -- Defensa: las URLs se renderizan como href/src en la ficha pública.
    -- Solo http(s) (bloquea javascript:, data:, etc.).
    IF NULLIF(p_payload ->> 'logo_url', '') IS NOT NULL AND p_payload ->> 'logo_url' !~* '^https?://' THEN
        RAISE EXCEPTION 'invalid_url' USING HINT = 'logo_url';
    END IF;
    IF NULLIF(p_payload ->> 'website', '') IS NOT NULL AND p_payload ->> 'website' !~* '^https?://' THEN
        RAISE EXCEPTION 'invalid_url' USING HINT = 'website';
    END IF;
    IF NULLIF(p_payload ->> 'intro_video_url', '') IS NOT NULL AND p_payload ->> 'intro_video_url' !~* '^https?://' THEN
        RAISE EXCEPTION 'invalid_url' USING HINT = 'intro_video_url';
    END IF;
    IF NULLIF(p_payload ->> 'jpa_url', '') IS NOT NULL AND p_payload ->> 'jpa_url' !~* '^https?://' THEN
        RAISE EXCEPTION 'invalid_url' USING HINT = 'jpa_url';
    END IF;
    IF p_payload ? 'gallery_urls' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_payload -> 'gallery_urls') AS u
        WHERE NULLIF(u, '') IS NOT NULL AND u !~* '^https?://'
    ) THEN
        RAISE EXCEPTION 'invalid_url' USING HINT = 'gallery_urls';
    END IF;

    UPDATE public.universities SET
        description     = COALESCE(p_payload ->> 'description', description),
        logo_url        = COALESCE(p_payload ->> 'logo_url', logo_url),
        website         = COALESCE(p_payload ->> 'website', website),
        phone           = COALESCE(p_payload ->> 'phone', phone),
        email           = COALESCE(p_payload ->> 'email', email),
        address         = COALESCE(p_payload ->> 'address', address),
        motto           = COALESCE(p_payload ->> 'motto', motto),
        rector          = COALESCE(p_payload ->> 'rector', rector),
        partner_blurb   = COALESCE(p_payload ->> 'partner_blurb', partner_blurb),
        intro_video_url = COALESCE(p_payload ->> 'intro_video_url', intro_video_url),
        jpa_url         = COALESCE(p_payload ->> 'jpa_url', jpa_url),
        jpa_label       = COALESCE(p_payload ->> 'jpa_label', jpa_label),
        gallery_urls    = CASE
            WHEN p_payload ? 'gallery_urls'
            THEN COALESCE(
                (SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload -> 'gallery_urls') AS value),
                '{}'::text[]
            )
            ELSE gallery_urls
        END,
        updated_at      = now()
    WHERE id = v_uni
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_university(jsonb) TO authenticated;

-- ── 6. Alta/baja de gestores (solo admin de plataforma) ─
CREATE OR REPLACE FUNCTION public.admin_grant_university_admin(
    p_email text,
    p_university_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile_id uuid;
    v_uni uuid;
BEGIN
    PERFORM public._admin_required();

    SELECT id INTO v_profile_id FROM public.profiles WHERE lower(email) = lower(p_email);
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'profile_not_found' USING HINT = p_email;
    END IF;

    SELECT id INTO v_uni FROM public.universities WHERE slug = p_university_slug;
    IF v_uni IS NULL THEN
        RAISE EXCEPTION 'university_not_found' USING HINT = p_university_slug;
    END IF;

    INSERT INTO public.university_admins (university_id, profile_id, created_by)
    VALUES (v_uni, v_profile_id, auth.uid())
    ON CONFLICT (university_id, profile_id) DO NOTHING;

    -- Solo promociona si era usuario normal (no degrada admin/propietario).
    UPDATE public.profiles SET role = 'university_admin'
    WHERE id = v_profile_id AND role = 'user';

    RETURN jsonb_build_object('ok', true, 'profile_id', v_profile_id, 'university_id', v_uni);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_university_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile_id uuid;
BEGIN
    PERFORM public._admin_required();

    SELECT id INTO v_profile_id FROM public.profiles WHERE lower(email) = lower(p_email);
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'profile_not_found' USING HINT = p_email;
    END IF;

    DELETE FROM public.university_admins WHERE profile_id = v_profile_id;
    UPDATE public.profiles SET role = 'user'
    WHERE id = v_profile_id AND role = 'university_admin';

    RETURN jsonb_build_object('ok', true, 'profile_id', v_profile_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_university_admin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_university_admin(text) TO authenticated;
