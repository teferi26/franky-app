-- Migration 075: Wave 9 polish — match status query + avatar upload bucket.
--
-- PROF-002: helper RPC para saber si dos users están matched (1:1 conv existe).
-- PROF-005: bucket `avatars` para upload de profile photo del usuario.

CREATE OR REPLACE FUNCTION public.is_matched_with(p_target_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_conv UUID;
    v_pending BOOLEAN;
BEGIN
    IF v_caller IS NULL OR v_caller = p_target_id THEN RETURN NULL; END IF;

    -- ¿Hay conv 1:1 entre ambos?
    SELECT cp1.conversation_id INTO v_conv
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2 USING (conversation_id)
    WHERE cp1.user_id = v_caller AND cp2.user_id = p_target_id
    LIMIT 1;

    IF v_conv IS NOT NULL THEN RETURN 'matched'; END IF;

    -- ¿Yo le di like pero él aún no? → pending_out
    SELECT EXISTS (
        SELECT 1 FROM public.swipe_actions
        WHERE user_id = v_caller AND target_id = p_target_id
          AND action IN ('like', 'superlike')
    ) INTO v_pending;
    IF v_pending THEN RETURN 'pending_out'; END IF;

    -- ¿Él me dio like? → pending_in
    SELECT EXISTS (
        SELECT 1 FROM public.swipe_actions
        WHERE user_id = p_target_id AND target_id = v_caller
          AND action IN ('like', 'superlike')
    ) INTO v_pending;
    IF v_pending THEN RETURN 'pending_in'; END IF;

    RETURN 'none';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_matched_with(UUID) TO authenticated;

-- PROF-005: bucket `avatars` para photos del perfil. Path:
--   `{user_id}/{timestamp}.jpg`
-- Limit 5MB, allowed MIME image solamente. RLS por user_id.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    true,  -- public: avatars son visibles para todos (necesario para card render)
    5 * 1024 * 1024,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: any authenticated user can INSERT/UPDATE/DELETE their own folder.
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- SELECT: público (bucket public).

COMMENT ON FUNCTION public.is_matched_with IS
    'PROF-002: estado de relación entre caller y target — matched|pending_out|pending_in|none.';
