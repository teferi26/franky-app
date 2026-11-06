-- Migration 077: Wave 13 — block list + privacy mode is_hidden.
--
-- SEC-004: block list — usuario puede bloquear a otros. Bloquear oculta
-- profile en discovery + bloquea mensajes nuevos.
-- SEC-005: privacy mode is_hidden — usuario puede ocultar su perfil
-- temporalmente sin borrar la cuenta. No aparece en discovery feeds, pero
-- conversaciones existentes siguen funcionando.

CREATE TABLE IF NOT EXISTS public.blocked_users (
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON public.blocked_users(blocked_id);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_select_own" ON public.blocked_users;
CREATE POLICY "blocked_select_own"
    ON public.blocked_users FOR SELECT TO authenticated
    USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocked_insert_own" ON public.blocked_users;
CREATE POLICY "blocked_insert_own"
    ON public.blocked_users FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocked_delete_own" ON public.blocked_users;
CREATE POLICY "blocked_delete_own"
    ON public.blocked_users FOR DELETE TO authenticated
    USING (auth.uid() = blocker_id);

-- SEC-005: privacy mode flag en profiles.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_hidden ON public.profiles(is_hidden)
    WHERE is_hidden = false;

-- Update get_roomies_filtered para excluir blocked + hidden.
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
      AND COALESCE(p.is_hidden, false) = false  -- SEC-005
      -- SEC-004: excluye usuarios bloqueados por mí + que me han bloqueado.
      AND p.id NOT IN (
        SELECT blocked_id FROM public.blocked_users WHERE blocker_id = p_user_id
        UNION
        SELECT blocker_id FROM public.blocked_users WHERE blocked_id = p_user_id
      )
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

-- RPC list_my_blocked: para SettingsScreen sección Bloqueados.
CREATE OR REPLACE FUNCTION public.list_my_blocked()
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT jsonb_build_object(
        'blocked_id', b.blocked_id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'created_at', b.created_at,
        'reason', b.reason
    )
    FROM public.blocked_users b
    JOIN public.profiles p ON p.id = b.blocked_id
    WHERE b.blocker_id = auth.uid()
    ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_blocked() TO authenticated;

COMMENT ON TABLE public.blocked_users IS 'SEC-004: user-level block list.';
COMMENT ON COLUMN public.profiles.is_hidden IS 'SEC-005: hide profile from discovery sin borrar cuenta.';
