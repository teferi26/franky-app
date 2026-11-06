-- =====================================================
-- 056: Fix get_daily_match — cast compatibility to INT
-- =====================================================
-- Tras aplicar 055 (que arregla calculate_compatibility cleanliness
-- TEXT vs INT), get_daily_match falla con:
--   ERROR 42804: structure of query does not match function result type
--   DETAIL: Returned type numeric does not match expected type integer in column 2.
--
-- Causa: mig 053 declara `compatibility INT` en el RETURNS TABLE pero
-- `calculate_compatibility` siempre ha retornado NUMERIC (con
-- `ROUND(..., 1)` que devuelve NUMERIC). Antes del fix BE-005 el RPC
-- nunca llegaba a ese check porque calculate_compatibility fallaba
-- primero con el cleanliness mismatch.
--
-- Fix: cast explícito a INT::INT en el SELECT, manteniendo el contrato
-- declarado de mig 053. Pierde el decimal (3.7 → 3), aceptable para
-- el hero card que muestra "85%" (no "84.7%").
--
-- Descubierto durante BE-005 smoke testing 2026-05-16.
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
AS $$
DECLARE
    v_day DATE := CURRENT_DATE;
    v_seed BIGINT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id required';
    END IF;

    v_seed := abs(hashtextextended(p_user_id::text || v_day::text, 0));

    RETURN QUERY
    WITH candidates AS (
        SELECT
            p.id,
            to_jsonb(p.*) AS profile_data,
            public.calculate_compatibility(p_user_id, p.id) AS compat
        FROM public.profiles p
        WHERE p.id <> p_user_id
          AND p.onboarding_completed = TRUE
          AND COALESCE(p.looking_for_roommate, TRUE) = TRUE
          AND COALESCE(p.is_discarded, FALSE) = FALSE
          AND (p.avatar_url IS NOT NULL OR COALESCE(array_length(p.photos, 1), 0) > 0)
          AND NOT EXISTS (
              SELECT 1 FROM public.swipe_actions sa
              WHERE sa.user_id = p_user_id
                AND sa.target_type = 'roomie'
                AND sa.target_id = p.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.user_blocks ub
              WHERE (ub.blocker_id = p_user_id AND ub.blocked_id = p.id)
                 OR (ub.blocker_id = p.id     AND ub.blocked_id = p_user_id)
          )
    )
    SELECT
        c.profile_data        AS profile,
        c.compat::INT         AS compatibility,
        v_day                 AS day
    FROM candidates c
    ORDER BY c.compat DESC, c.id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_match(UUID) TO authenticated;
