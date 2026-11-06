-- =====================================================
-- 064: RPC list_my_friends — lista de amigos del caller
-- =====================================================
-- Para Fase 3a Friends polish: tab "Mis amigos" en la app necesita la lista
-- de friendships status='accepted' del caller con los datos públicos de cada
-- amigo (full_name, avatar_url, university, city).
--
-- friendships (mig 019) almacena (user_a_id, user_b_id, status). El caller
-- puede aparecer en cualquier lado. La RPC normaliza y devuelve el OTRO user.
-- =====================================================

CREATE OR REPLACE FUNCTION public.list_my_friends()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    avatar_url TEXT,
    city TEXT,
    university_id UUID,
    university_name TEXT,
    since TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.full_name,
        p.avatar_url,
        p.city,
        p.university_id,
        u.name AS university_name,
        f.updated_at AS since
    FROM public.friendships f
    JOIN public.profiles p
        ON p.id = CASE
            WHEN f.user_a_id = v_uid THEN f.user_b_id
            ELSE f.user_a_id
        END
    LEFT JOIN public.universities u ON u.id = p.university_id
    WHERE (f.user_a_id = v_uid OR f.user_b_id = v_uid)
      AND f.status = 'accepted'
      AND p.is_discarded IS NOT TRUE
    ORDER BY f.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_friends() TO authenticated;

NOTIFY pgrst, 'reload schema';
