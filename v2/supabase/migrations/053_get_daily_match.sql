-- =====================================================
-- 053: Get Daily Match RPC — Hero del Home
-- =====================================================
-- Devuelve UN único candidato roomie para el "Match del día":
--   - Top 1 por `calculate_compatibility` con el usuario.
--   - Excluye: ya swipeados, bloqueados (user_blocks), soft-deleted
--     (is_discarded), sin avatar/photos, y al propio usuario.
--   - Solo perfiles `onboarding_completed = true` y
--     `looking_for_roommate = true`.
--   - DETERMINISTA por día: misma llamada el mismo día devuelve el
--     mismo match (semilla `user_id + current_date`). Cambia a las
--     00:00 hora del servidor.
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
    -- Defensive: caller debe ser el mismo user (la app pasa auth.uid()).
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id required';
    END IF;

    -- Construir una semilla determinista por (user, day) — no se usa
    -- realmente para randomness aquí, pero permite future tweaks
    -- como rotación por hora si quisiéramos.
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
          -- excluir swipeados
          AND NOT EXISTS (
              SELECT 1 FROM public.swipe_actions sa
              WHERE sa.user_id = p_user_id
                AND sa.target_type = 'roomie'
                AND sa.target_id = p.id
          )
          -- excluir bloqueados (en cualquier dirección)
          AND NOT EXISTS (
              SELECT 1 FROM public.user_blocks ub
              WHERE (ub.blocker_id = p_user_id AND ub.blocked_id = p.id)
                 OR (ub.blocker_id = p.id     AND ub.blocked_id = p_user_id)
          )
    )
    SELECT
        c.profile_data AS profile,
        c.compat AS compatibility,
        v_day AS day
    FROM candidates c
    ORDER BY c.compat DESC, c.id  -- tie-break determinista por id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_match(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_daily_match(UUID) IS
  'Devuelve el mejor candidato roomie del día (hero del Home). Determinista por (user, día).';
