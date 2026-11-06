-- =====================================================
-- 079: FOMO — RPCs de lectura (feed + detalle de hilo)
-- =====================================================
-- Estas funciones son la ÚNICA vía de lectura pública del feed. Corren como
-- SECURITY DEFINER y anulan los datos de autor cuando is_anonymous = true,
-- garantizando el anonimato aunque la autoría real esté almacenada.
-- =====================================================

-- Helper: construye el bloque JSON de autor (NULL si anónimo).
CREATE OR REPLACE FUNCTION public.fomo_author_json(p_author UUID, p_anon BOOLEAN)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE
        WHEN p_anon THEN NULL
        ELSE (
            SELECT jsonb_build_object(
                'id', pr.id,
                'full_name', pr.full_name,
                'avatar_url', pr.avatar_url,
                'age', CASE WHEN pr.birth_date IS NOT NULL
                            THEN EXTRACT(YEAR FROM AGE(pr.birth_date))::int
                            ELSE NULL END,
                'university_id', pr.university_id
            )
            FROM public.profiles pr WHERE pr.id = p_author
        )
    END;
$$;

-- Helper: construye el bloque JSON de la encuesta de un hilo (NULL si no hay).
-- Incluye el voto del usuario actual (my_option_id).
CREATE OR REPLACE FUNCTION public.fomo_poll_json(p_thread UUID, p_viewer UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'id', po.id,
        'question', po.question,
        'options', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'position', o.position,
                    'label', o.label,
                    'vote_count', o.vote_count
                ) ORDER BY o.position
            )
            FROM public.fomo_poll_options o WHERE o.poll_id = po.id
        ), '[]'::jsonb),
        'total_votes', COALESCE((
            SELECT SUM(o.vote_count) FROM public.fomo_poll_options o WHERE o.poll_id = po.id
        ), 0),
        'my_option_id', (
            SELECT v.option_id FROM public.fomo_poll_votes v
            WHERE v.poll_id = po.id AND v.voter_id = p_viewer
        )
    )
    FROM public.fomo_polls po WHERE po.thread_id = p_thread;
$$;

-- ─────────────────────────────────────────────────────
-- get_fomo_feed: hilos de una universidad, paginado por created_at.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fomo_feed(
    p_university_id UUID,
    p_limit INT DEFAULT 20,
    p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_viewer UUID := auth.uid();
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
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fomo_feed(UUID, INT, TIMESTAMPTZ) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_fomo_thread: un hilo + sus respuestas.
-- Devuelve NULL si el hilo no existe o está oculto/borrado (salvo autor/admin).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fomo_thread(p_thread_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_viewer UUID := auth.uid();
    v_thread public.fomo_threads%ROWTYPE;
    v_is_admin BOOLEAN;
    v_result JSONB;
BEGIN
    IF v_viewer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT * INTO v_thread FROM public.fomo_threads WHERE id = p_thread_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT public.is_admin() INTO v_is_admin;

    -- Visibilidad: oculto/borrado solo para autor o admin.
    IF (v_thread.is_deleted OR v_thread.is_hidden)
       AND v_thread.author_id <> v_viewer AND NOT v_is_admin THEN
        RETURN NULL;
    END IF;

    v_result := jsonb_build_object(
        'id', v_thread.id,
        'university_id', v_thread.university_id,
        'body', v_thread.body,
        'media_url', v_thread.media_url,
        'media_type', v_thread.media_type,
        'is_anonymous', v_thread.is_anonymous,
        'reply_count', v_thread.reply_count,
        'reaction_count', v_thread.reaction_count,
        'created_at', v_thread.created_at,
        'is_hidden', v_thread.is_hidden,
        'author', public.fomo_author_json(v_thread.author_id, v_thread.is_anonymous),
        'poll', public.fomo_poll_json(v_thread.id, v_viewer),
        'my_reaction', EXISTS (
            SELECT 1 FROM public.fomo_reactions r
            WHERE r.thread_id = v_thread.id AND r.user_id = v_viewer
        ),
        'is_mine', v_thread.author_id = v_viewer,
        'replies', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', rp.id,
                    'body', rp.body,
                    'media_url', rp.media_url,
                    'media_type', rp.media_type,
                    'is_anonymous', rp.is_anonymous,
                    'created_at', rp.created_at,
                    'author', public.fomo_author_json(rp.author_id, rp.is_anonymous),
                    'is_mine', rp.author_id = v_viewer
                ) ORDER BY rp.created_at ASC
            )
            FROM public.fomo_replies rp
            WHERE rp.thread_id = v_thread.id
              AND rp.is_deleted = false
              AND rp.is_hidden = false
        ), '[]'::jsonb)
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fomo_thread(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_fomo_university_by_slug: resuelve slug → {id, name} para la página feed.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fomo_university(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object('id', u.id, 'name', u.name, 'slug', u.slug, 'city', u.city)
    FROM public.universities u WHERE u.slug = p_slug;
$$;

GRANT EXECUTE ON FUNCTION public.get_fomo_university(TEXT) TO authenticated;
