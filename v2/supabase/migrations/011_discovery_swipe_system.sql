-- =====================================================
-- 011: Discovery Swipe System
-- Tables: swipe_actions, accommodation_requests, user_boosts, premium_actions
-- Functions: get_discovery_feed(), process_swipe_action(), undo_last_swipe()
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. SWIPE ACTIONS (core tracking)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swipe_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('accommodation', 'roomie', 'event')),
    action TEXT NOT NULL CHECK (action IN ('like', 'dislike', 'superlike')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_swipe_actions_user_type ON public.swipe_actions(user_id, target_type);
CREATE INDEX idx_swipe_actions_target ON public.swipe_actions(target_id, target_type);
CREATE UNIQUE INDEX idx_swipe_actions_unique ON public.swipe_actions(user_id, target_id, target_type);

ALTER TABLE public.swipe_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own swipes"
  ON public.swipe_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own swipes"
  ON public.swipe_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own swipes"
  ON public.swipe_actions FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- 2. ACCOMMODATION REQUESTS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accommodation_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    accommodation_id UUID NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, accommodation_id)
);

CREATE INDEX idx_accomm_req_accommodation ON public.accommodation_requests(accommodation_id, status);
CREATE INDEX idx_accomm_req_user ON public.accommodation_requests(user_id, status);

ALTER TABLE public.accommodation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own requests"
  ON public.accommodation_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners see requests for their listings"
  ON public.accommodation_requests FOR SELECT
  USING (
    accommodation_id IN (
      SELECT id FROM public.accommodations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users create own requests"
  ON public.accommodation_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners update request status"
  ON public.accommodation_requests FOR UPDATE
  USING (
    accommodation_id IN (
      SELECT id FROM public.accommodations WHERE owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────
-- 3. USER BOOSTS (premium time-limited elevation)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_boosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    boost_type TEXT NOT NULL CHECK (boost_type IN ('profile_boost', 'superlike_pack', 'rewind_pack')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_boosts_active ON public.user_boosts(user_id, boost_type, expires_at);

ALTER TABLE public.user_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own boosts" ON public.user_boosts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own boosts" ON public.user_boosts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- 4. PREMIUM ACTIONS (superlike/rewind/boost tracking)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.premium_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('superlike', 'rewind', 'boost')),
    target_id UUID,
    target_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_premium_actions_daily ON public.premium_actions(user_id, action_type, created_at);

ALTER TABLE public.premium_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own premium actions" ON public.premium_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own premium actions" ON public.premium_actions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- 5. Extend notifications type CHECK for new types
-- ─────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('message', 'match', 'review', 'accommodation', 'event', 'promotion', 'system', 'scholarship', 'accommodation_request', 'roomie_like'));

-- ─────────────────────────────────────────────────────
-- 6. Extend roommate_matches with updated_at
-- ─────────────────────────────────────────────────────
ALTER TABLE public.roommate_matches
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─────────────────────────────────────────────────────
-- 7. FUNCTIONS
-- ─────────────────────────────────────────────────────

-- 7a. Discovery feed
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
    p_user_id UUID,
    p_target_type TEXT,
    p_limit INT DEFAULT 20
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_city TEXT;
    v_budget_min INT;
    v_budget_max INT;
BEGIN
    -- Get user context
    SELECT city, budget_min, budget_max
    INTO v_user_city, v_budget_min, v_budget_max
    FROM public.profiles WHERE id = p_user_id;

    IF p_target_type = 'accommodation' THEN
        RETURN QUERY
        SELECT to_jsonb(a.*)
        FROM public.accommodations a
        WHERE a.status = 'active'
          AND a.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = p_user_id AND sa.target_type = 'accommodation'
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
        LIMIT p_limit;

    ELSIF p_target_type = 'roomie' THEN
        RETURN QUERY
        SELECT to_jsonb(p.*) || jsonb_build_object(
            'compatibility', public.calculate_compatibility(p_user_id, p.id)
        )
        FROM public.profiles p
        WHERE p.id != p_user_id
          AND p.looking_for_roommate = true
          AND p.onboarding_completed = true
          AND COALESCE(p.is_discarded, false) = false
          AND p.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = p_user_id AND sa.target_type = 'roomie'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = p.id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            public.calculate_compatibility(p_user_id, p.id) DESC
        LIMIT p_limit;

    ELSIF p_target_type = 'event' THEN
        RETURN QUERY
        SELECT to_jsonb(e.*)
        FROM public.events e
        WHERE e.start_date >= NOW()
          AND e.status = 'upcoming'
          AND e.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = p_user_id AND sa.target_type = 'event'
          )
        ORDER BY
            CASE WHEN v_user_city IS NOT NULL AND e.city ILIKE v_user_city THEN 0 ELSE 1 END,
            e.start_date ASC
        LIMIT p_limit;
    END IF;
END;
$$;

-- 7b. Process swipe action (orchestrator)
CREATE OR REPLACE FUNCTION public.process_swipe_action(
    p_user_id UUID,
    p_target_id UUID,
    p_target_type TEXT,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB := '{}';
    v_conversation_id UUID;
    v_user_name TEXT;
BEGIN
    -- Record swipe
    INSERT INTO public.swipe_actions (user_id, target_id, target_type, action)
    VALUES (p_user_id, p_target_id, p_target_type, p_action)
    ON CONFLICT (user_id, target_id, target_type) DO NOTHING;

    -- Handle like/superlike side effects
    IF p_action IN ('like', 'superlike') THEN
        IF p_target_type = 'accommodation' THEN
            -- Create request to property owner
            INSERT INTO public.accommodation_requests (user_id, accommodation_id)
            VALUES (p_user_id, p_target_id)
            ON CONFLICT (user_id, accommodation_id) DO NOTHING;

            -- Notify owner
            INSERT INTO public.notifications (user_id, type, title, body, data)
            SELECT a.owner_id, 'accommodation_request',
                   'Nueva solicitud de alojamiento',
                   'Un usuario está interesado en: ' || a.title,
                   jsonb_build_object('request_user_id', p_user_id, 'accommodation_id', p_target_id)
            FROM public.accommodations a WHERE a.id = p_target_id;

            v_result := jsonb_build_object('action', 'request_sent');

        ELSIF p_target_type = 'roomie' THEN
            -- Get user name
            SELECT full_name INTO v_user_name FROM public.profiles WHERE id = p_user_id;

            -- Check for existing conversation
            SELECT c.id INTO v_conversation_id
            FROM public.conversations c
            JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = p_user_id
            JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = p_target_id
            LIMIT 1;

            IF v_conversation_id IS NULL THEN
                -- Create conversation
                INSERT INTO public.conversations DEFAULT VALUES
                RETURNING id INTO v_conversation_id;

                -- Add both participants
                INSERT INTO public.conversation_participants (conversation_id, user_id)
                VALUES (v_conversation_id, p_user_id), (v_conversation_id, p_target_id);

                -- Auto-send first message
                INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
                VALUES (v_conversation_id, p_user_id, '👋 ¡Hola! Me gustaría ser tu compañero/a de piso', 'text');
            END IF;

            -- Upsert roommate match
            INSERT INTO public.roommate_matches (user_id, matched_user_id, compatibility_score, status)
            VALUES (p_user_id, p_target_id, public.calculate_compatibility(p_user_id, p_target_id), 'liked')
            ON CONFLICT (user_id, matched_user_id) DO UPDATE SET status = 'liked', updated_at = NOW();

            -- Notify target
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                p_target_id, 'roomie_like',
                'Nuevo interés de compañero de piso',
                COALESCE(v_user_name, 'Alguien') || ' quiere ser tu roomie',
                jsonb_build_object('conversation_id', v_conversation_id, 'from_user_id', p_user_id)
            );

            v_result := jsonb_build_object('action', 'chat_created', 'conversation_id', v_conversation_id);

        ELSIF p_target_type = 'event' THEN
            -- Add to favorites
            INSERT INTO public.favorites (user_id, target_type, target_id)
            VALUES (p_user_id, 'event', p_target_id)
            ON CONFLICT (user_id, target_type, target_id) DO NOTHING;

            v_result := jsonb_build_object('action', 'favorited');
        END IF;

        -- Track superlike as premium action
        IF p_action = 'superlike' THEN
            INSERT INTO public.premium_actions (user_id, action_type, target_id, target_type)
            VALUES (p_user_id, 'superlike', p_target_id, p_target_type);
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

-- 7c. Undo last swipe (rewind)
CREATE OR REPLACE FUNCTION public.undo_last_swipe(
    p_user_id UUID,
    p_target_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted RECORD;
BEGIN
    -- Delete last swipe of this type
    DELETE FROM public.swipe_actions
    WHERE id = (
        SELECT id FROM public.swipe_actions
        WHERE user_id = p_user_id AND target_type = p_target_type
        ORDER BY created_at DESC
        LIMIT 1
    )
    RETURNING * INTO v_deleted;

    IF v_deleted IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No swipe to undo');
    END IF;

    -- If it was a like, clean up side effects
    IF v_deleted.action IN ('like', 'superlike') THEN
        IF p_target_type = 'accommodation' THEN
            DELETE FROM public.accommodation_requests
            WHERE user_id = p_user_id AND accommodation_id = v_deleted.target_id;
        ELSIF p_target_type = 'event' THEN
            DELETE FROM public.favorites
            WHERE user_id = p_user_id AND target_type = 'event' AND target_id = v_deleted.target_id;
        END IF;
        -- Roomie conversations are NOT deleted on rewind (too destructive)
    END IF;

    -- Track rewind as premium action
    INSERT INTO public.premium_actions (user_id, action_type, target_id, target_type)
    VALUES (p_user_id, 'rewind', v_deleted.target_id, p_target_type);

    RETURN jsonb_build_object(
        'success', true,
        'target_id', v_deleted.target_id,
        'action', v_deleted.action
    );
END;
$$;

-- 7d. Check premium limit
CREATE OR REPLACE FUNCTION public.check_premium_limit(
    p_user_id UUID,
    p_action_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_premium BOOLEAN;
    v_daily_count INT;
    v_limit INT;
BEGIN
    SELECT COALESCE(is_premium, false) INTO v_is_premium FROM public.profiles WHERE id = p_user_id;

    IF v_is_premium THEN
        v_limit := CASE p_action_type
            WHEN 'superlike' THEN 5
            WHEN 'rewind' THEN 999
            WHEN 'boost' THEN 1
            ELSE 0
        END;
    ELSE
        v_limit := 0;
    END IF;

    SELECT COUNT(*) INTO v_daily_count
    FROM public.premium_actions
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND created_at >= date_trunc('day', NOW());

    RETURN v_daily_count < v_limit;
END;
$$;
