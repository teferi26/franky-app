-- Migration 071: get_roomies_filtered RPC con verified filter + helper bump_last_seen.
--
-- RM-009: filter solo verificados (student_email_verified=true) en RoomieMatchScreen.
-- RM-008: heartbeat last_seen → badge "online" si last_seen < 5min.
--
-- Creamos un RPC paralelo en lugar de modificar `get_discovery_feed` (que se
-- usa también para accommodation/event) para no romper backwards compat.

-- Add last_seen si no existe (001_schema.sql lo declara pero migraciones
-- iterativas en producción lo dejaron fuera).
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

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
    -- Sólo permitir consultar el propio feed (security).
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;
    IF v_caller <> p_user_id THEN
        RAISE EXCEPTION 'forbidden — only self';
    END IF;

    SELECT university_id INTO v_user_uni FROM public.profiles WHERE id = p_user_id;

    RETURN QUERY
    SELECT to_jsonb(p.*)
        || jsonb_build_object(
            'compatibility', public.calculate_compatibility(p_user_id, p.id),
            -- Exposición client-side de la online status (sin filtrar — el cliente
            -- decide si renderiza badge según `now() - last_seen < 5min`).
            'last_seen_at', p.last_seen,
            'is_verified', COALESCE(p.student_email_verified, false)
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

GRANT EXECUTE ON FUNCTION public.get_roomies_filtered(UUID, INT, BOOLEAN, BOOLEAN) TO authenticated;

/**
 * RM-008 helper: bump last_seen del caller. RLS permite UPDATE de propio profile
 * pero forzamos una RPC SECURITY DEFINER para que sea atómico + indexable.
 * El cliente lo llama cada ~60s mientras el app está en foreground.
 */
CREATE OR REPLACE FUNCTION public.bump_last_seen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;
    UPDATE public.profiles SET last_seen = NOW() WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_last_seen() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen DESC)
    WHERE last_seen IS NOT NULL;

COMMENT ON FUNCTION public.get_roomies_filtered IS
    'RM-009 + RM-008: discovery feed con filter verified/same-university + last_seen exposure.';
