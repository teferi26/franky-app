-- =====================================================
-- 094: Búsqueda + orden en los feeds de FOMO y Ligar
-- =====================================================
-- Se añade a get_fomo_feed y get_ligar_feed:
--   * p_offset  → paginación por offset (uniforme para cualquier orden)
--   * p_search  → filtro de texto (ILIKE) sobre body (+ offer en ligar)
--   * p_sort    → 'recent' (def.), 'oldest', 'top' (más reacciones)
-- Se mantiene p_before por retrocompatibilidad (clientes antiguos): si llega,
-- se aplica como cursor created_at < p_before. El cliente web nuevo usa offset.
--
-- Las firmas cambian, así que primero se eliminan las versiones anteriores
-- para evitar ambigüedad de overloads en PostgREST.

DROP FUNCTION IF EXISTS public.get_fomo_feed(UUID, INT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_ligar_feed(INT, TIMESTAMPTZ);

-- ─────────────────────────────────────────────────────
-- get_fomo_feed: hilos de una universidad, con búsqueda y orden.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fomo_feed(
    p_university_id UUID,
    p_limit  INT DEFAULT 20,
    p_before TIMESTAMPTZ DEFAULT NULL,
    p_offset INT DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_sort   TEXT DEFAULT 'recent'
)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_viewer UUID := auth.uid();
    v_q TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
    IF v_viewer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', t.id,
        'university_id', t.university_id,
        'body', t.body,
        'media_url', t.media_url,
        'media_type', t.media_type,
        'is_anonymous', t.is_anonymous,
        'reply_count', t.reply_count,
        'reaction_count', t.reaction_count,
        'created_at', t.created_at,
        'author', public.fomo_author_json(t.author_id, t.is_anonymous),
        'poll', public.fomo_poll_json(t.id, v_viewer),
        'my_reaction', EXISTS (
            SELECT 1 FROM public.fomo_reactions r
            WHERE r.thread_id = t.id AND r.user_id = v_viewer
        ),
        'is_mine', t.author_id = v_viewer
    )
    FROM public.fomo_threads t
    WHERE t.university_id = p_university_id
      AND t.is_deleted = false
      AND t.is_hidden = false
      AND (p_before IS NULL OR t.created_at < p_before)
      AND (v_q IS NULL OR t.body ILIKE '%' || v_q || '%')
    ORDER BY
      CASE WHEN p_sort = 'top'    THEN t.reaction_count END DESC NULLS LAST,
      CASE WHEN p_sort = 'oldest' THEN t.created_at     END ASC,
      CASE WHEN p_sort NOT IN ('top','oldest') THEN t.created_at END DESC,
      t.id DESC
    LIMIT  LEAST(GREATEST(p_limit, 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fomo_feed(UUID, INT, TIMESTAMPTZ, INT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_ligar_feed: muro de la universidad del viewer, con búsqueda y orden.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ligar_feed(
    p_limit  INT DEFAULT 20,
    p_before TIMESTAMPTZ DEFAULT NULL,
    p_offset INT DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_sort   TEXT DEFAULT 'recent'
)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_viewer UUID := auth.uid();
    v_uni    UUID;
    v_gender TEXT;
    v_q TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
    IF v_viewer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT university_id, gender INTO v_uni, v_gender
        FROM public.profiles WHERE id = v_viewer;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', t.id,
        'university_id', t.university_id,
        'body', t.body,
        'offer', t.offer,
        'media_url', t.media_url,
        'media_type', t.media_type,
        'audience', t.audience,
        'is_anonymous', t.is_anonymous,
        'reaction_count', t.reaction_count,
        'created_at', t.created_at,
        'is_mine', t.author_id = v_viewer,
        'my_reaction', EXISTS (
            SELECT 1 FROM public.ligar_reactions r
            WHERE r.post_id = t.id AND r.user_id = v_viewer
        ),
        'author', CASE WHEN t.is_anonymous THEN NULL ELSE (
            SELECT jsonb_build_object(
                'id', pr.id,
                'full_name', pr.full_name,
                'avatar_url', pr.avatar_url,
                'age', CASE WHEN pr.birth_date IS NOT NULL
                            THEN EXTRACT(YEAR FROM AGE(pr.birth_date))::int ELSE NULL END,
                'opted_in', COALESCE(pr.ligar_opted_in, false)
            )
            FROM public.profiles pr WHERE pr.id = t.author_id
        ) END
    )
    FROM public.ligar_posts t
    WHERE t.is_deleted = false
      AND t.is_hidden = false
      AND (v_uni IS NULL OR t.university_id = v_uni)
      AND (p_before IS NULL OR t.created_at < p_before)
      AND (
            t.author_id = v_viewer                       -- siempre veo los míos
            OR t.audience = 'todos'
            OR (v_gender IS NOT NULL AND t.audience = v_gender)
          )
      AND (
            v_q IS NULL
            OR t.body  ILIKE '%' || v_q || '%'
            OR t.offer ILIKE '%' || v_q || '%'
          )
    ORDER BY
      CASE WHEN p_sort = 'top'    THEN t.reaction_count END DESC NULLS LAST,
      CASE WHEN p_sort = 'oldest' THEN t.created_at     END ASC,
      CASE WHEN p_sort NOT IN ('top','oldest') THEN t.created_at END DESC,
      t.id DESC
    LIMIT  LEAST(GREATEST(p_limit, 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ligar_feed(INT, TIMESTAMPTZ, INT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
