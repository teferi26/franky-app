-- =====================================================
-- Migration 108: blindaje del discovery feed y pulido de apuntes
-- =====================================================
-- Problemas que corrige (auditoría 11-jun-2026):
--   1. get_discovery_feed (011) devolvía to_jsonb(profiles.*) en el modo
--      'roomie': email, phone, birth_date y campos de moderación de hasta
--      30 perfiles ajenos viajaban a cada cliente, saltándose el lockdown
--      de 040/101. Además confiaba en p_user_id (suplantable) y, al no tener
--      REVOKE, era ejecutable por anon (EXECUTE a PUBLIC por defecto).
--   2. process_swipe_action (011) confiaba en p_user_id sin validar
--      auth.uid(): cualquiera podía dar likes y enviar el saludo automático
--      haciéndose pasar por otro usuario. Además duplicaba la notificación
--      de like (la insertaba manualmente Y el trigger de 088 sobre
--      roommate_matches la volvía a crear).
--   3. note_ratings (107) no tenía política UPDATE (cambiar tu valoración
--      fallaría) y register_note_download era ejecutable por anon.
--
-- Compatibilidad: las firmas NO cambian. p_user_id se mantiene en la firma
-- pero se IGNORA (manda siempre auth.uid()). El modo 'roomie' devuelve ahora
-- 'age' (entero calculado en SQL) en lugar de birth_date, y process_swipe_action
-- añade la clave 'match' (boolean) a su resultado.

-- ─────────────────────────────────────────────────────
-- 1. get_discovery_feed endurecida
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
    p_user_id UUID,
    p_target_type TEXT,
    p_limit INT DEFAULT 20
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_user_city  TEXT;
    v_budget_min INT;
    v_budget_max INT;
    v_limit      INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    SELECT city, budget_min, budget_max
    INTO v_user_city, v_budget_min, v_budget_max
    FROM public.profiles WHERE id = v_uid;

    IF p_target_type = 'accommodation' THEN
        RETURN QUERY
        SELECT to_jsonb(a.*)
        FROM public.accommodations a
        WHERE a.status = 'active'
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
        -- Whitelist explícita: ni email, ni phone, ni birth_date, ni campos de
        -- moderación. La edad viaja ya calculada.
        RETURN QUERY
        SELECT jsonb_build_object(
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
            'lifestyle_preferences', p.lifestyle_preferences,
            'housing_preferences', p.housing_preferences,
            'compatibility', public.calculate_compatibility(v_uid, p.id)
        )
        FROM public.profiles p
        WHERE p.id != v_uid
          AND p.looking_for_roommate = true
          AND p.onboarding_completed = true
          AND COALESCE(p.is_discarded, false) = false
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

REVOKE ALL ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_discovery_feed IS
  '108: feed de discovery con whitelist de campos en roomie (sin PII), edad '
  'calculada en SQL, auth.uid() obligatorio (p_user_id se ignora) y solo authenticated.';

-- ─────────────────────────────────────────────────────
-- 2. process_swipe_action endurecida
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_swipe_action(
    p_user_id UUID,
    p_target_id UUID,
    p_target_type TEXT,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid             UUID := auth.uid();
    v_result          JSONB := '{}';
    v_conversation_id UUID;
    v_match           BOOLEAN := false;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;
    IF p_action NOT IN ('like', 'superlike', 'pass') THEN
        RAISE EXCEPTION 'invalid action';
    END IF;
    IF p_target_type NOT IN ('accommodation', 'roomie', 'event') THEN
        RAISE EXCEPTION 'invalid target type';
    END IF;
    IF p_target_type = 'roomie' AND p_target_id = v_uid THEN
        RAISE EXCEPTION 'cannot swipe yourself';
    END IF;

    INSERT INTO public.swipe_actions (user_id, target_id, target_type, action)
    VALUES (v_uid, p_target_id, p_target_type, p_action)
    ON CONFLICT (user_id, target_id, target_type) DO NOTHING;

    IF p_action IN ('like', 'superlike') THEN
        IF p_target_type = 'accommodation' THEN
            INSERT INTO public.accommodation_requests (user_id, accommodation_id)
            VALUES (v_uid, p_target_id)
            ON CONFLICT (user_id, accommodation_id) DO NOTHING;

            INSERT INTO public.notifications (user_id, type, title, body, data)
            SELECT a.owner_id, 'accommodation_request',
                   'Nueva solicitud de alojamiento',
                   'Un usuario está interesado en: ' || a.title,
                   jsonb_build_object('request_user_id', v_uid, 'accommodation_id', p_target_id)
            FROM public.accommodations a WHERE a.id = p_target_id;

            v_result := jsonb_build_object('action', 'request_sent');

        ELSIF p_target_type = 'roomie' THEN
            -- Conversación 1:1 (si no existe, se crea con saludo automático)
            SELECT c.id INTO v_conversation_id
            FROM public.conversations c
            JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = v_uid
            JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = p_target_id
            LIMIT 1;

            IF v_conversation_id IS NULL THEN
                INSERT INTO public.conversations DEFAULT VALUES
                RETURNING id INTO v_conversation_id;

                INSERT INTO public.conversation_participants (conversation_id, user_id)
                VALUES (v_conversation_id, v_uid), (v_conversation_id, p_target_id);

                INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
                VALUES (v_conversation_id, v_uid, '👋 ¡Hola! Me gustaría ser tu compañero/a de piso', 'text');
            END IF;

            -- Upsert del like. El trigger de 088 sobre roommate_matches se
            -- encarga de notificar (roomie_like o match) y de marcar ambas
            -- filas como 'matched' si es recíproco: aquí NO se inserta
            -- notificación manual (en 011 se duplicaba). Un 'matched' previo
            -- no se degrada a 'liked'.
            INSERT INTO public.roommate_matches (user_id, matched_user_id, compatibility_score, status)
            VALUES (v_uid, p_target_id, public.calculate_compatibility(v_uid, p_target_id), 'liked')
            ON CONFLICT (user_id, matched_user_id) DO UPDATE
                SET status = 'liked', updated_at = NOW()
                WHERE roommate_matches.status <> 'matched';

            SELECT EXISTS (
                SELECT 1 FROM public.roommate_matches rm
                WHERE rm.user_id = v_uid
                  AND rm.matched_user_id = p_target_id
                  AND rm.status = 'matched'
            ) INTO v_match;

            v_result := jsonb_build_object(
                'action', 'chat_created',
                'conversation_id', v_conversation_id,
                'match', v_match
            );

        ELSIF p_target_type = 'event' THEN
            INSERT INTO public.favorites (user_id, target_type, target_id)
            VALUES (v_uid, 'event', p_target_id)
            ON CONFLICT (user_id, target_type, target_id) DO NOTHING;

            v_result := jsonb_build_object('action', 'favorited');
        END IF;

        IF p_action = 'superlike' THEN
            INSERT INTO public.premium_actions (user_id, action_type, target_id, target_type)
            VALUES (v_uid, 'superlike', p_target_id, p_target_type);
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.process_swipe_action(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_swipe_action(UUID, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_swipe_action(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.process_swipe_action IS
  '108: swipe con auth.uid() obligatorio (p_user_id se ignora), sin notificación '
  'duplicada (delega en el trigger de 088) y con clave match en el resultado.';

-- ─────────────────────────────────────────────────────
-- 3. Pulido de apuntes (solo si la 107 ya está aplicada)
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.note_ratings') IS NOT NULL THEN
        -- Cambiar tu valoración (la PK note_id+user_id impide duplicar filas)
        DROP POLICY IF EXISTS "note_ratings_update_own" ON public.note_ratings;
        CREATE POLICY "note_ratings_update_own" ON public.note_ratings
            FOR UPDATE TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());
    END IF;

    IF to_regprocedure('public.register_note_download(uuid)') IS NOT NULL THEN
        -- El contador de descargas no debe ser inflable por anónimos
        REVOKE ALL ON FUNCTION public.register_note_download(UUID) FROM PUBLIC;
        REVOKE ALL ON FUNCTION public.register_note_download(UUID) FROM anon;
        GRANT EXECUTE ON FUNCTION public.register_note_download(UUID) TO authenticated;
    END IF;
END;
$$;
