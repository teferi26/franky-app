-- =====================================================
-- 080: FOMO — RPCs de escritura (crear hilo/respuesta, votar, reaccionar)
-- =====================================================
-- Todas SECURITY DEFINER: fijan author/voter = auth.uid() internamente y
-- validan el contenido. La media se sube antes al bucket fomo-media desde el
-- cliente (RLS owner-insert) y aquí solo se guarda la URL resultante.
-- Los rate-limit y auto-hide siguen aplicándose vía los triggers de la 078.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- create_fomo_thread: crea un hilo, con encuesta opcional.
-- Devuelve el id del hilo creado.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_fomo_thread(
    p_university_id UUID,
    p_body          TEXT DEFAULT NULL,
    p_media_url     TEXT DEFAULT NULL,
    p_media_type    TEXT DEFAULT NULL,
    p_is_anonymous  BOOLEAN DEFAULT false,
    p_poll_question TEXT DEFAULT NULL,
    p_poll_options  TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_author UUID := auth.uid();
    v_thread UUID;
    v_clean_body TEXT;
    v_opts TEXT[];
    v_has_poll BOOLEAN := p_poll_question IS NOT NULL AND length(btrim(p_poll_question)) > 0;
    i INT;
BEGIN
    IF v_author IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    v_clean_body := NULLIF(btrim(COALESCE(p_body, '')), '');

    -- Un hilo debe llevar algo.
    IF v_clean_body IS NULL AND p_media_url IS NULL AND NOT v_has_poll THEN
        RAISE EXCEPTION 'El hilo necesita texto, una imagen/audio o una encuesta';
    END IF;

    IF p_media_url IS NOT NULL AND p_media_type IS NULL THEN
        RAISE EXCEPTION 'media_type requerido cuando hay media';
    END IF;

    -- Valida la encuesta: 2-4 opciones no vacías.
    IF v_has_poll THEN
        SELECT array_agg(o) INTO v_opts
        FROM (
            SELECT btrim(unnest) AS o
            FROM unnest(COALESCE(p_poll_options, ARRAY[]::TEXT[]))
        ) s
        WHERE length(o) > 0;
        IF v_opts IS NULL OR array_length(v_opts, 1) < 2 OR array_length(v_opts, 1) > 4 THEN
            RAISE EXCEPTION 'La encuesta necesita entre 2 y 4 opciones';
        END IF;
    END IF;

    INSERT INTO public.fomo_threads (university_id, author_id, is_anonymous, body, media_url, media_type)
    VALUES (p_university_id, v_author, COALESCE(p_is_anonymous, false), v_clean_body, p_media_url, p_media_type)
    RETURNING id INTO v_thread;

    IF v_has_poll THEN
        DECLARE v_poll UUID;
        BEGIN
            INSERT INTO public.fomo_polls (thread_id, question)
            VALUES (v_thread, btrim(p_poll_question))
            RETURNING id INTO v_poll;
            FOR i IN 1 .. array_length(v_opts, 1) LOOP
                INSERT INTO public.fomo_poll_options (poll_id, position, label)
                VALUES (v_poll, i - 1, left(v_opts[i], 100));
            END LOOP;
        END;
    END IF;

    RETURN v_thread;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fomo_thread(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT[]) TO authenticated;

-- ─────────────────────────────────────────────────────
-- create_fomo_reply: responde a un hilo.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_fomo_reply(
    p_thread_id    UUID,
    p_body         TEXT DEFAULT NULL,
    p_media_url    TEXT DEFAULT NULL,
    p_media_type   TEXT DEFAULT NULL,
    p_is_anonymous BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_author UUID := auth.uid();
    v_reply UUID;
    v_clean_body TEXT;
    v_thread public.fomo_threads%ROWTYPE;
BEGIN
    IF v_author IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT * INTO v_thread FROM public.fomo_threads WHERE id = p_thread_id;
    IF NOT FOUND OR v_thread.is_deleted THEN
        RAISE EXCEPTION 'El hilo no existe';
    END IF;

    v_clean_body := NULLIF(btrim(COALESCE(p_body, '')), '');
    IF v_clean_body IS NULL AND p_media_url IS NULL THEN
        RAISE EXCEPTION 'La respuesta necesita texto o media';
    END IF;
    IF p_media_url IS NOT NULL AND p_media_type IS NULL THEN
        RAISE EXCEPTION 'media_type requerido cuando hay media';
    END IF;

    INSERT INTO public.fomo_replies (thread_id, author_id, is_anonymous, body, media_url, media_type)
    VALUES (p_thread_id, v_author, COALESCE(p_is_anonymous, false), v_clean_body, p_media_url, p_media_type)
    RETURNING id INTO v_reply;

    RETURN v_reply;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fomo_reply(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────
-- vote_fomo_poll: registra un voto (un voto por usuario, no editable).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vote_fomo_poll(p_option_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_voter UUID := auth.uid();
    v_poll UUID;
BEGIN
    IF v_voter IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT poll_id INTO v_poll FROM public.fomo_poll_options WHERE id = p_option_id;
    IF v_poll IS NULL THEN RAISE EXCEPTION 'Opción no válida'; END IF;

    INSERT INTO public.fomo_poll_votes (poll_id, option_id, voter_id)
    VALUES (v_poll, p_option_id, v_voter)
    ON CONFLICT (poll_id, voter_id) DO NOTHING;  -- voto único, no se puede cambiar
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_fomo_poll(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- toggle_fomo_reaction: alterna el "me gusta" del usuario. Devuelve el
-- nuevo estado (true = reaccionado).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_fomo_reaction(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_exists BOOLEAN;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.fomo_reactions
        WHERE thread_id = p_thread_id AND user_id = v_user
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.fomo_reactions WHERE thread_id = p_thread_id AND user_id = v_user;
        RETURN false;
    ELSE
        INSERT INTO public.fomo_reactions (thread_id, user_id) VALUES (p_thread_id, v_user)
        ON CONFLICT DO NOTHING;
        RETURN true;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_fomo_reaction(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- delete_fomo_thread / delete_fomo_reply: borrado lógico por autor o admin.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_fomo_thread(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    UPDATE public.fomo_threads SET is_deleted = true, updated_at = NOW()
    WHERE id = p_thread_id AND (author_id = v_user OR public.is_admin());
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_fomo_thread(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_fomo_reply(p_reply_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    UPDATE public.fomo_replies SET is_deleted = true
    WHERE id = p_reply_id AND (author_id = v_user OR public.is_admin());
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_fomo_reply(UUID) TO authenticated;
