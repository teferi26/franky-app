-- ═══════════════════════════════════════════════════════════════════════════
-- 158: la ficha de roomie del móvil deja de enseñar datos inventados
--
-- SÍNTOMA (reportado el 31-jul-2026): "en información me parece que sale muy
-- poca [información] comparada con la que meten realmente los usuarios".
--
-- CAUSA RAÍZ: la ficha del móvil (mobile/app/roomie.tsx:423-481) pintaba
-- `lifestyle_preferences` y `housing_preferences`, dos columnas JSONB que NADIE
-- escribe nunca (búsqueda exhaustiva en web/src y mobile/: solo lecturas).
-- Siguen con el DEFAULT literal de 001_schema.sql:150-165, así que TODOS los
-- perfiles enseñaban exactamente los mismos seis datos ("Limpieza 3/5",
-- "Tolerancia al ruido 3/5", "Horario normal", "Le gusta cocinar", "Invitados a
-- veces", "No fumador/a") y el mismo "Presupuesto: 200 a 500 €/mes".
--
-- Mientras tanto, lo que la gente SÍ rellena (las 8 columnas planas de estilo
-- de vida, `photos`, `hobbies`, `budget_min/max`, la universidad y el email
-- universitario verificado) no salía de la base de datos, porque
-- get_discovery_feed (140:249-263) no lo devolvía.
--
-- ARREGLO: ampliar el jsonb_build_object de la rama 'roomie'. La FIRMA NO
-- CAMBIA (la función sigue devolviendo SETOF JSONB) y las ramas 'accommodation'
-- y 'event' se reproducen tal cual de la 140, sin tocar una coma. El único
-- consumidor de esta RPC en toda la aplicación es mobile/app/roomie.tsx:202.
--
-- PRIVACIDAD: todos los campos añadidos ya se exponen hoy a cualquier usuario
-- autenticado a través de la vista public_profiles (040:32-104) y/o de
-- get_roomies_filtered (113:74-99). No se añade ningún dato personal nuevo:
-- nada de email, teléfono, email universitario ni fecha de nacimiento en crudo
-- (sigue yendo solo la edad ya calculada).
--
-- DEPENDE DE LA 157 (usa roomie_compatibility y lifestyle_answered_at):
-- aplicar la 157 ANTES que esta.
--
-- Aplicable desde el SQL Editor. Idempotente. No toca storage.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_discovery_feed(
    p_user_id UUID,
    p_target_type TEXT,
    p_limit INT DEFAULT 20
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid         UUID := auth.uid();
    v_user_city   TEXT;
    v_budget_min  INT;
    v_budget_max  INT;
    v_me_answered BOOLEAN;
    v_limit       INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    SELECT city, budget_min, budget_max, lifestyle_answered_at IS NOT NULL
    INTO v_user_city, v_budget_min, v_budget_max, v_me_answered
    FROM public.profiles WHERE id = v_uid;
    v_me_answered := COALESCE(v_me_answered, false);

    IF p_target_type = 'accommodation' THEN
        RETURN QUERY
        SELECT to_jsonb(a.*)
        FROM public.accommodations a
        WHERE a.status = 'active'
          -- 140: un piso sin fotos no se puede juzgar deslizando.
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) >= 1
          AND a.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'accommodation'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = a.owner_id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            CASE WHEN v_user_city IS NOT NULL AND a.city ILIKE v_user_city THEN 0 ELSE 1 END,
            CASE WHEN a.price BETWEEN COALESCE(v_budget_min, 0) AND COALESCE(v_budget_max, 9999) THEN 0 ELSE 1 END,
            a.created_at DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'roomie' THEN
        IF NOT public.roomie_profile_complete(v_uid) THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT jsonb_build_object(
            -- ── lo que ya devolvía la 140 ──
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'career', p.career,
            'academic_year', p.academic_year,
            'bio', p.bio,
            'city', p.city,
            'interests', COALESCE(p.interests, '{}'::text[]),
            'age', CASE WHEN p.birth_date IS NOT NULL
                        THEN date_part('year', age(p.birth_date))::int
                   END,
            -- ── 158: los datos REALES de la persona ──
            'photos', COALESCE(p.photos, '{}'::text[]),
            'hobbies', COALESCE(p.hobbies, '{}'::text[]),
            'budget_min', p.budget_min,
            'budget_max', p.budget_max,
            'university', u.short_name,
            'university_name', u.name,
            'is_verified', COALESCE(p.student_email_verified, false),
            'smoking', p.smoking::text,
            'partying', p.partying::text,
            'study_habits', p.study_habits::text,
            'sleep_schedule', p.sleep_schedule::text,
            'cleanliness', p.cleanliness::text,
            'noise_tolerance', p.noise_tolerance::text,
            'friends_at_home', p.friends_at_home::text,
            'pet_friendly', p.pet_friendly::text,
            'lifestyle_answered', p.lifestyle_answered_at IS NOT NULL,
            -- 157: NULL cuando alguno de los dos no ha contestado de verdad.
            'compatibility', public.roomie_compatibility(v_uid, p.id),
            'compatibility_reason',
                CASE WHEN NOT v_me_answered AND p.lifestyle_answered_at IS NULL THEN 'both'
                     WHEN NOT v_me_answered                                     THEN 'me'
                     WHEN p.lifestyle_answered_at IS NULL                       THEN 'them'
                     ELSE 'ok' END
            -- 158: lifestyle_preferences y housing_preferences YA NO se envían.
            -- Nadie las escribe nunca; solo servían para pintar el DEFAULT de la
            -- migración 001 como si fuera el perfil de esa persona.
        )
        FROM public.profiles p
        LEFT JOIN public.universities u ON u.id = p.university_id
        WHERE p.id != v_uid
          AND p.looking_for_roommate = true
          AND p.onboarding_completed = true
          AND COALESCE(p.is_discarded, false) = false
          -- 140: FOTO OBLIGATORIA para aparecer en el mazo.
          AND (
            COALESCE(btrim(p.avatar_url), '') <> ''
            OR COALESCE(array_length(p.photos, 1), 0) >= 1
          )
          -- 140: fuera quien tenga la foto retenida por denuncias.
          AND COALESCE(p.photo_hidden, false) = false
          AND p.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'roomie'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = p.id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            -- Se ordena con calculate_compatibility (nunca NULL) y no con
            -- roomie_compatibility: con DESC, los NULL se irían los PRIMEROS.
            public.calculate_compatibility(v_uid, p.id) DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'event' THEN
        RETURN QUERY
        SELECT to_jsonb(e.*)
        FROM public.events e
        WHERE e.start_date >= NOW()
          AND e.status = 'upcoming'
          AND e.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'event'
          )
        ORDER BY
            CASE WHEN v_user_city IS NOT NULL AND e.city ILIKE v_user_city THEN 0 ELSE 1 END,
            e.start_date ASC
        LIMIT v_limit;
    END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_discovery_feed IS
  '158: la rama roomie devuelve datos REALES (8 columnas de estilo de vida, '
  'photos, hobbies, presupuesto, universidad, verificado) y una compatibilidad '
  'que puede ser NULL. Deja de enviar lifestyle_preferences/housing_preferences, '
  'los dos JSONB fósiles de la 001 que nadie escribe.';

NOTIFY pgrst, 'reload schema';
