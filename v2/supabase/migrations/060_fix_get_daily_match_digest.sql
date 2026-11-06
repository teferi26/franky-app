-- =====================================================
-- 060: HOTFIX — get_daily_match digest fallback
-- =====================================================
-- Mig 059 usaba digest()/sha256 que requiere pgcrypto. Si la extensión no
-- está, falla. Sustituimos por md5()::text (built-in en Postgres core) +
-- hashtext() para shuffle determinista por día.
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
    -- Shuffle determinista por día: hash del seed concatenado al id.
    ORDER BY c.compat DESC, md5(v_seed::text || c.id::text) ASC
    LIMIT 1;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_daily_match(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
