-- =====================================================
-- 014: Activity Roulette
-- Tables: roulette_sessions
-- Functions: get_roulette_suggestion()
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. ROULETTE SESSIONS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roulette_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Filters used when spinning
    filters JSONB NOT NULL DEFAULT '{}',
    -- Result
    result_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    result_participant_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Status: pending (shown to user), joined (signed up), skipped (spun again)
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'joined', 'skipped')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roulette_user ON public.roulette_sessions(user_id, created_at DESC);

ALTER TABLE public.roulette_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own roulette sessions"
  ON public.roulette_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all roulette sessions"
  ON public.roulette_sessions FOR SELECT
  USING (is_admin());

-- ─────────────────────────────────────────────────────
-- 2. FUNCTION: get_roulette_suggestion
-- Returns a random upcoming event + random participant
-- (excluding events the user has already joined, and
--  excluding themselves as the suggested companion)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_roulette_suggestion(
  p_user_id      UUID,
  p_city         TEXT    DEFAULT NULL,
  p_date_from    DATE    DEFAULT NULL,
  p_date_to      DATE    DEFAULT NULL,
  p_hour_from    TIME    DEFAULT NULL,
  p_hour_to      TIME    DEFAULT NULL,
  p_friend_id    UUID    DEFAULT NULL   -- pre-selected friend, or NULL for random
)
RETURNS TABLE (
  event_id          UUID,
  event_title       TEXT,
  event_description TEXT,
  event_city        TEXT,
  event_venue       TEXT,
  event_address     TEXT,
  event_start_date  TIMESTAMPTZ,
  event_category    TEXT,
  event_price       NUMERIC,
  event_image_url   TEXT,
  companion_id      UUID,
  companion_name    TEXT,
  companion_avatar  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_events AS (
    SELECT e.*
    FROM public.events e
    WHERE e.status IN ('upcoming', 'ongoing')
      AND e.start_date > NOW()
      -- Apply city filter
      AND (p_city IS NULL OR e.city ILIKE p_city)
      -- Apply date range filter
      AND (p_date_from IS NULL OR e.start_date::date >= p_date_from)
      AND (p_date_to IS NULL OR e.start_date::date <= p_date_to)
      -- Apply time range filter
      AND (p_hour_from IS NULL OR e.start_date::time >= p_hour_from)
      AND (p_hour_to IS NULL OR e.start_date::time <= p_hour_to)
      -- Exclude events the user has already joined
      AND NOT EXISTS (
        SELECT 1 FROM public.event_participants ep
        WHERE ep.event_id = e.id
          AND ep.user_id = p_user_id
          AND ep.status != 'cancelled'
      )
    ORDER BY RANDOM()
    LIMIT 1
  ),
  random_event AS (
    SELECT * FROM eligible_events
  ),
  eligible_companions AS (
    SELECT p.id, p.full_name, p.avatar_url
    FROM public.profiles p
    WHERE p.id != p_user_id
      AND p.is_discarded IS NOT TRUE
      -- If a specific friend is requested, use them; otherwise random
      AND (p_friend_id IS NULL OR p.id = p_friend_id)
      -- Companion should not already be in the event (if event exists)
      AND NOT EXISTS (
        SELECT 1 FROM public.event_participants ep2
        JOIN random_event re ON ep2.event_id = re.id
        WHERE ep2.user_id = p.id AND ep2.status != 'cancelled'
      )
    ORDER BY RANDOM()
    LIMIT 1
  )
  SELECT
    re.id,
    re.title,
    re.description,
    re.city,
    re.venue,
    re.address,
    re.start_date,
    re.category,
    re.price,
    re.image_url,
    ec.id,
    ec.full_name,
    ec.avatar_url
  FROM random_event re
  CROSS JOIN eligible_companions ec;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 3. FUNCTION: save_roulette_result
-- Persists a roulette suggestion so the user can act on it
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_roulette_result(
  p_event_id       UUID,
  p_companion_id   UUID,
  p_filters        JSONB DEFAULT '{}'
)
RETURNS UUID   -- returns roulette_session id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Mark any previous pending sessions as skipped
  UPDATE public.roulette_sessions
  SET status = 'skipped'
  WHERE user_id = auth.uid() AND status = 'pending';

  INSERT INTO public.roulette_sessions (user_id, filters, result_event_id, result_participant_id, status)
  VALUES (auth.uid(), p_filters, p_event_id, p_companion_id, 'pending')
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
