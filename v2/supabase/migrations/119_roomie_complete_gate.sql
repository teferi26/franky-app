-- =====================================================================
-- 119: gating de Roomie Match — solo perfiles COMPLETOS pueden swipear
--
-- Problema (reportado por el fundador, jun-2026): usuarios que NO han
-- completado su perfil de búsqueda de compañero de piso estaban dando
-- like/dislike a quienes sí lo tienen. Dos agujeros:
--   - La web escribe el like/dislike DIRECTAMENTE en roommate_matches
--     (no pasa por RPC); solo la protegía la RLS de propiedad (user_id =
--     auth.uid()), que no mira la completitud del perfil.
--   - El toggle "aparecer como roomie" de la app pone looking_for_roommate
--     = true sin exigir los campos de estilo de vida, y process_swipe_action
--     solo validaba auth.uid().
--
-- "Perfil completo" = los 8 campos de estilo de vida que la web ya exige en
-- LIFESTYLE_QUESTIONS (roomie-match/client.tsx): smoking, partying,
-- study_habits, sleep_schedule, cleanliness, noise_tolerance,
-- friends_at_home, pet_friendly. Todos TEXT (016 convirtió cleanliness y
-- pet_friendly a TEXT). "Relleno" = NOT NULL y no vacío tras btrim.
--
-- Enforcement en servidor (no se puede saltar desde el cliente):
--   1. roomie_profile_complete(uid): helper booleano.
--   2. Trigger BEFORE INSERT en roommate_matches: cubre el camino directo de
--      la web (like y dislike, ambos hacen INSERT/upsert) Y el INSERT que
--      hace process_swipe_action para los likes. Solo INSERT: las UPDATE de
--      estado 'matched' del trigger 088 (fila recíproca de un usuario ya
--      completo) no se tocan.
--   3. process_swipe_action: guarda explícita para roomie (cubre el 'pass'
--      de la app, que NO inserta en roommate_matches) con error claro.
--   4. get_discovery_feed: si el que pide tiene el perfil incompleto, mazo
--      vacío (defensa; el cliente ya muestra el gate).
--
-- Idempotente: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- =====================================================================

-- ─────────────────────────────────────────────────────
-- 1. Helper de completitud
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roomie_profile_complete(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid
      AND NULLIF(btrim(p.smoking::text), '')         IS NOT NULL
      AND NULLIF(btrim(p.partying::text), '')        IS NOT NULL
      AND NULLIF(btrim(p.study_habits::text), '')    IS NOT NULL
      AND NULLIF(btrim(p.sleep_schedule::text), '')  IS NOT NULL
      AND NULLIF(btrim(p.cleanliness::text), '')     IS NOT NULL
      AND NULLIF(btrim(p.noise_tolerance::text), '') IS NOT NULL
      AND NULLIF(btrim(p.friends_at_home::text), '') IS NOT NULL
      AND NULLIF(btrim(p.pet_friendly::text), '')    IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.roomie_profile_complete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roomie_profile_complete(uuid) FROM anon;
-- authenticated puede consultar su propia completitud (los clientes la usan
-- para mostrar el gate). Solo devuelve un boolean, sin PII.
GRANT EXECUTE ON FUNCTION public.roomie_profile_complete(uuid) TO authenticated;

COMMENT ON FUNCTION public.roomie_profile_complete IS
  '119: true si el usuario tiene los 8 campos de estilo de vida (roomie) rellenos.';

-- ─────────────────────────────────────────────────────
-- 2. Trigger de enforcement en roommate_matches (INSERT)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_roomie_complete_before_swipe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- NEW.user_id es siempre el que actúa (da el like/dislike). Si su perfil
  -- de roomie no está completo, se rechaza la acción.
  IF NOT public.roomie_profile_complete(NEW.user_id) THEN
    RAISE EXCEPTION 'roomie_profile_incomplete'
      USING HINT = 'Completa tu perfil de compañero de piso antes de dar like o dislike.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roomie_complete_before_swipe ON public.roommate_matches;
CREATE TRIGGER trg_roomie_complete_before_swipe
  BEFORE INSERT ON public.roommate_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_roomie_complete_before_swipe();

-- ─────────────────────────────────────────────────────
-- 3. process_swipe_action: guarda explícita para roomie
--    (re-creada desde la 108 añadiendo solo el check; el resto es idéntico)
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
SET search_path = public, pg_temp
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
    -- 119: para roomie, exigir perfil completo (cubre también el 'pass', que
    -- no llega a tocar roommate_matches y por tanto no dispara el trigger).
    IF p_target_type = 'roomie' AND NOT public.roomie_profile_complete(v_uid) THEN
        RAISE EXCEPTION 'roomie_profile_incomplete'
          USING HINT = 'Completa tu perfil de compañero de piso para hacer match.';
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

-- ─────────────────────────────────────────────────────
-- 4. get_discovery_feed: mazo vacío si el que pide está incompleto
--    (re-creada desde la 108 añadiendo solo la guarda en el modo roomie)
-- ─────────────────────────────────────────────────────
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
        -- 119: si el que pide no tiene el perfil completo, no puede swipear,
        -- así que tampoco recibe mazo (el cliente muestra el gate).
        IF NOT public.roomie_profile_complete(v_uid) THEN
            RETURN;
        END IF;

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

-- ─────────────────────────────────────────────────────
-- 5. Cerrar el hueco del UPDATE directo (upsert de la web)
--    El trigger es BEFORE INSERT; un upsert sobre una fila ya existente entra
--    por la rama UPDATE y NO dispara el trigger. La política UPDATE de 006 solo
--    miraba la propiedad (auth.uid() = user_id). Añadimos la completitud para
--    que un usuario incompleto tampoco pueda re-likear/pasar editando una fila
--    previa. No afecta al trigger 088 (SECURITY DEFINER, salta RLS) ni a las
--    RPC (SECURITY DEFINER), solo a los upsert directos de cliente.
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own matches" ON public.roommate_matches;
CREATE POLICY "Users can update own matches" ON public.roommate_matches
    FOR UPDATE
    USING (auth.uid() = user_id AND public.roomie_profile_complete(auth.uid()))
    WITH CHECK (auth.uid() = user_id AND public.roomie_profile_complete(auth.uid()));
