-- Migration 073: Wave 6 polish — boosted flag + match streak + swipe history.
--
-- RM-004: surface is_boosted al cliente desde get_roomies_filtered.
-- RM-005: RPC get_match_streak — días consecutivos con al menos 1 match.
-- RM-014: RPC list_my_swipes para mostrar swipe history al user.

-- ─── RM-004 ──────────────────────────────────────────────
-- Update get_roomies_filtered para incluir is_boosted en el JSON.
CREATE OR REPLACE FUNCTION public.get_roomies_filtered(
    p_user_id UUID,
    p_limit INT DEFAULT 20,
    p_verified_only BOOLEAN DEFAULT false,
    p_same_university BOOLEAN DEFAULT false
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_uni UUID;
    v_caller UUID := auth.uid();
BEGIN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_caller <> p_user_id THEN RAISE EXCEPTION 'forbidden — only self'; END IF;

    SELECT university_id INTO v_user_uni FROM public.profiles WHERE id = p_user_id;

    RETURN QUERY
    SELECT to_jsonb(p.*)
        || jsonb_build_object(
            'compatibility', public.calculate_compatibility(p_user_id, p.id),
            'last_seen_at', p.last_seen,
            'is_verified', COALESCE(p.student_email_verified, false),
            'is_boosted', EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = p.id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            )
        )
    FROM public.profiles p
    WHERE p.id <> p_user_id
      AND p.looking_for_roommate = true
      AND p.onboarding_completed = true
      AND COALESCE(p.is_discarded, false) = false
      AND p.id NOT IN (
        SELECT sa.target_id FROM public.swipe_actions sa
        WHERE sa.user_id = p_user_id AND sa.target_type = 'roomie'
      )
      AND (NOT p_verified_only OR COALESCE(p.student_email_verified, false) = true)
      AND (NOT p_same_university OR (v_user_uni IS NOT NULL AND p.university_id = v_user_uni))
    ORDER BY
        CASE WHEN EXISTS (
            SELECT 1 FROM public.user_boosts ub
            WHERE ub.user_id = p.id
              AND ub.boost_type = 'profile_boost'
              AND ub.expires_at > NOW()
        ) THEN 0 ELSE 1 END,
        public.calculate_compatibility(p_user_id, p.id) DESC
    LIMIT p_limit;
END;
$$;

-- ─── RM-005 ──────────────────────────────────────────────
/**
 * Devuelve nº de días consecutivos hasta hoy en los que el user tuvo al menos
 * 1 match. Streak rota a 0 si en algún día intermedio no hay matches.
 *
 * Cálculo: cuenta DISTINCT date_trunc('day', conversation_participants.joined_at)
 * back desde HOY hasta encontrar un gap.
 *
 * NOTA: aproximamos "match" = ser participante de una conversación. Más fiel
 * sería filtrar por conversaciones con is_group=false (1:1), lo hacemos:
 */
CREATE OR REPLACE FUNCTION public.get_match_streak()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_streak INT := 0;
    v_check_date DATE := CURRENT_DATE;
    v_has_match BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN RETURN 0; END IF;

    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM public.conversation_participants cp
            JOIN public.conversations c ON c.id = cp.conversation_id
            WHERE cp.user_id = v_caller
              AND cp.joined_at::date = v_check_date
              AND COALESCE(c.is_group, false) = false
        ) INTO v_has_match;

        EXIT WHEN NOT v_has_match;
        v_streak := v_streak + 1;
        v_check_date := v_check_date - INTERVAL '1 day';
        -- Safety guard: máximo 365 días.
        EXIT WHEN v_streak >= 365;
    END LOOP;

    RETURN v_streak;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_streak() TO authenticated;

-- ─── RM-014 ──────────────────────────────────────────────
/**
 * Devuelve el swipe history del user (últimos 100, ordenados desc).
 * Hidrata target_id con el snapshot del profile (full_name, avatar) en JSON
 * para que el cliente no necesite N+1 queries.
 *
 * Limitaciones: si el target_id es de un user eliminado (is_discarded),
 * devuelve full_name=NULL. La UI muestra "[Usuario eliminado]" en ese caso.
 */
CREATE OR REPLACE FUNCTION public.list_my_swipes(p_limit INT DEFAULT 100)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', sa.id,
        'target_id', sa.target_id,
        'target_type', sa.target_type,
        'action', sa.action,
        'created_at', sa.created_at,
        'target_name', p.full_name,
        'target_avatar', p.avatar_url
    )
    FROM public.swipe_actions sa
    LEFT JOIN public.profiles p ON p.id = sa.target_id AND sa.target_type = 'roomie'
    WHERE sa.user_id = v_caller
    ORDER BY sa.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_swipes(INT) TO authenticated;

COMMENT ON FUNCTION public.get_match_streak IS 'RM-005: días consecutivos con ≥1 match.';
COMMENT ON FUNCTION public.list_my_swipes IS 'RM-014: history de swipes del user con preview del target.';
