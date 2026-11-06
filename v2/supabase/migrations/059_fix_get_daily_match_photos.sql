-- =====================================================
-- 059: HOTFIX — get_daily_match photos check
-- =====================================================
-- Mig 058 recreó get_daily_match con `jsonb_array_length(p.photos)` pero
-- `profiles.photos` es `text[]` (no jsonb), así que el RPC falla en runtime
-- con 42883 "function jsonb_array_length(text[]) does not exist".
--
-- Fix: usar `array_length(p.photos, 1)` (devuelve NULL para arrays vacíos
-- y NULL — defensivo con `COALESCE(..., 0) > 0`).
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_daily_match(p_user_id UUID)
RETURNS TABLE (
    profile JSONB,
    compatibility INT,
    day DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_day DATE := CURRENT_DATE;
    v_seed BIGINT;
BEGIN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RETURN;
    END IF;

    v_seed := abs(hashtext(p_user_id::text || v_day::text));

    RETURN QUERY
    WITH candidates AS (
        SELECT
            p.id,
            to_jsonb(p) - 'updated_at' AS prof,
            (public.calculate_compatibility(p_user_id, p.id))::INT AS compat
        FROM public.profiles p
        WHERE p.id <> p_user_id
          AND p.onboarding_completed = true
          AND p.looking_for_roommate = true
          AND p.is_discarded IS NOT TRUE
          AND (
            p.avatar_url IS NOT NULL
            OR COALESCE(array_length(p.photos, 1), 0) > 0
          )
          AND p.id NOT IN (
              SELECT target_id FROM public.swipe_actions
              WHERE user_id = p_user_id AND target_type = 'profile'
          )
          AND p.id NOT IN (
              SELECT CASE WHEN ub.blocker_id = p_user_id THEN ub.blocked_id ELSE ub.blocker_id END
              FROM public.user_blocks ub
              WHERE ub.blocker_id = p_user_id OR ub.blocked_id = p_user_id
          )
    )
    SELECT c.prof, c.compat, v_day
    FROM candidates c
    ORDER BY c.compat DESC, encode(digest((v_seed || c.id::text), 'sha256'), 'hex') ASC
    LIMIT 1;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_daily_match(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
