-- =====================================================
-- 092: Ligar — Muro de la universidad (posts con audiencia por género)
-- =====================================================
-- Amplía "ligar" de un simple grid de candidatos a un MURO por universidad:
-- el usuario publica describiendo a la persona que le gusta y lo que él/ella
-- aporta, con un archivo opcional (foto / audio / vídeo), de forma anónima o
-- pública. Cada post indica a qué público va dirigido (todos / chicas / chicos)
-- y SOLO aparece a quien encaje con esa audiencia (por el campo gender del que
-- mira). El intercambio de Instagram reutiliza request_ig (082/083).
--
-- Diseño alineado con FOMO (078): autoría siempre almacenada server-side
-- (trazabilidad legal), lectura pública vía RPC SECURITY DEFINER que anula la
-- identidad en posts anónimos; SELECT directo restringido a autor + admin.
-- Red de seguridad: auto-ocultar tras 3 reportes + rate-limit por usuario.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. Posts del muro
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ligar_posts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id  UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    author_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_anonymous   BOOLEAN NOT NULL DEFAULT false,
    body           TEXT,           -- descripción de la persona que te gusta
    offer          TEXT,           -- lo que tú aportas / por qué darte una oportunidad
    media_url      TEXT,
    media_type     TEXT CHECK (media_type IN ('image', 'audio', 'video')),
    audience       TEXT NOT NULL DEFAULT 'todos'
                     CHECK (audience IN ('todos', 'hombre', 'mujer')),
    reaction_count INT NOT NULL DEFAULT 0,
    report_count   INT NOT NULL DEFAULT 0,
    is_hidden      BOOLEAN NOT NULL DEFAULT false,
    is_deleted     BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (media_url IS NULL OR media_type IS NOT NULL),
    -- Un post debe tener algo: texto, oferta o media.
    CHECK (
        char_length(COALESCE(body, '')) > 0
        OR char_length(COALESCE(offer, '')) > 0
        OR media_url IS NOT NULL
    ),
    CHECK (char_length(COALESCE(body, '')) <= 1000),
    CHECK (char_length(COALESCE(offer, '')) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_ligar_posts_feed
    ON public.ligar_posts (university_id, created_at DESC)
    WHERE is_deleted = false AND is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_ligar_posts_author
    ON public.ligar_posts (author_id);

-- ─────────────────────────────────────────────────────
-- 2. Reacciones (un "me gusta" por usuario por post)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ligar_reactions (
    post_id    UUID NOT NULL REFERENCES public.ligar_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- ─────────────────────────────────────────────────────
-- 3. Reportes (auto-oculta tras 3)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ligar_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES public.ligar_posts(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason      TEXT CHECK (char_length(COALESCE(reason, '')) <= 500),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_ligar_reports_pending
    ON public.ligar_reports (created_at DESC) WHERE status = 'pending';

-- ─────────────────────────────────────────────────────
-- 4. Bucket de media (imagen + audio + vídeo). Path: {uid}/{random}.{ext}
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ligar-media',
    'ligar-media',
    true,
    52428800, -- 50MB (el vídeo pesa)
    ARRAY[
        'image/jpeg','image/png','image/webp','image/gif',
        'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/aac',
        'video/mp4','video/webm','video/ogg','video/quicktime'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ligar_media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "ligar_media_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "ligar_media_owner_delete" ON storage.objects;

CREATE POLICY "ligar_media_public_select"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'ligar-media');

CREATE POLICY "ligar_media_owner_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'ligar-media'
        AND owner = auth.uid()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "ligar_media_owner_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'ligar-media' AND owner = auth.uid());

-- ─────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────
ALTER TABLE public.ligar_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ligar_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ligar_reports   ENABLE ROW LEVEL SECURITY;

-- POSTS: lectura directa solo autor + admin (la lectura pública va por RPC).
DROP POLICY IF EXISTS "ligar_posts_select_own_or_admin" ON public.ligar_posts;
CREATE POLICY "ligar_posts_select_own_or_admin"
    ON public.ligar_posts FOR SELECT TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "ligar_posts_insert_own" ON public.ligar_posts;
CREATE POLICY "ligar_posts_insert_own"
    ON public.ligar_posts FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "ligar_posts_update_own_or_admin" ON public.ligar_posts;
CREATE POLICY "ligar_posts_update_own_or_admin"
    ON public.ligar_posts FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "ligar_posts_delete_own_or_admin" ON public.ligar_posts;
CREATE POLICY "ligar_posts_delete_own_or_admin"
    ON public.ligar_posts FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

-- REACTIONS: el usuario gestiona las suyas.
DROP POLICY IF EXISTS "ligar_reactions_select_own" ON public.ligar_reactions;
CREATE POLICY "ligar_reactions_select_own"
    ON public.ligar_reactions FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ligar_reactions_insert_own" ON public.ligar_reactions;
CREATE POLICY "ligar_reactions_insert_own"
    ON public.ligar_reactions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ligar_reactions_delete_own" ON public.ligar_reactions;
CREATE POLICY "ligar_reactions_delete_own"
    ON public.ligar_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- REPORTS: crear/ver propios; admin gestiona.
DROP POLICY IF EXISTS "ligar_reports_insert_own" ON public.ligar_reports;
CREATE POLICY "ligar_reports_insert_own"
    ON public.ligar_reports FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "ligar_reports_select_own_or_admin" ON public.ligar_reports;
CREATE POLICY "ligar_reports_select_own_or_admin"
    ON public.ligar_reports FOR SELECT TO authenticated
    USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "ligar_reports_admin_manage" ON public.ligar_reports;
CREATE POLICY "ligar_reports_admin_manage"
    ON public.ligar_reports FOR UPDATE TO authenticated
    USING (public.is_admin());

-- ─────────────────────────────────────────────────────
-- 6. Triggers: contadores, auto-ocultar y rate-limit
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ligar_reaction_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.ligar_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.ligar_posts SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_ligar_reaction_count ON public.ligar_reactions;
CREATE TRIGGER trg_ligar_reaction_count
    AFTER INSERT OR DELETE ON public.ligar_reactions
    FOR EACH ROW EXECUTE FUNCTION public.ligar_reaction_count_sync();

CREATE OR REPLACE FUNCTION public.ligar_report_apply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.ligar_posts
        SET report_count = report_count + 1
        WHERE id = NEW.post_id
        RETURNING report_count INTO v_count;
    IF v_count >= 3 THEN
        UPDATE public.ligar_posts SET is_hidden = true WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ligar_report_apply ON public.ligar_reports;
CREATE TRIGGER trg_ligar_report_apply
    AFTER INSERT ON public.ligar_reports
    FOR EACH ROW EXECUTE FUNCTION public.ligar_report_apply();

CREATE OR REPLACE FUNCTION public.ligar_post_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_recent INT;
BEGIN
    SELECT COUNT(*) INTO v_recent
        FROM public.ligar_posts
        WHERE author_id = NEW.author_id
          AND created_at > NOW() - INTERVAL '1 hour';
    IF v_recent >= 10 THEN
        RAISE EXCEPTION 'Rate limit: máximo 10 publicaciones por hora';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ligar_post_rate ON public.ligar_posts;
CREATE TRIGGER trg_ligar_post_rate
    BEFORE INSERT ON public.ligar_posts
    FOR EACH ROW EXECUTE FUNCTION public.ligar_post_rate_limit();

-- ─────────────────────────────────────────────────────
-- 7. RPC: get_ligar_feed — muro de la universidad del que mira, filtrado por
--    audiencia (género del viewer). Anula identidad en posts anónimos.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ligar_feed(
    p_limit  INT DEFAULT 20,
    p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_viewer UUID := auth.uid();
    v_uni    UUID;
    v_gender TEXT;
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
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ligar_feed(INT, TIMESTAMPTZ) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 8. RPC: create_ligar_post — publicar en el muro. Exige participar en ligar.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_ligar_post(
    p_body         TEXT,
    p_offer        TEXT,
    p_media_url    TEXT,
    p_media_type   TEXT,
    p_audience     TEXT,
    p_is_anonymous BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_uni  UUID;
    v_body  TEXT;
    v_offer TEXT;
    v_aud   TEXT;
    v_id    UUID;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    -- Debe participar en ligar (y por tanto ser mayor de 18).
    SELECT university_id INTO v_uni FROM public.profiles
        WHERE id = v_user AND ligar_opted_in = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activa ligar primero'; END IF;
    IF v_uni IS NULL THEN RAISE EXCEPTION 'Necesitas una universidad en tu perfil'; END IF;

    v_body  := NULLIF(btrim(COALESCE(p_body, '')), '');
    v_offer := NULLIF(btrim(COALESCE(p_offer, '')), '');
    v_aud   := COALESCE(p_audience, 'todos');
    IF v_aud NOT IN ('todos', 'hombre', 'mujer') THEN v_aud := 'todos'; END IF;

    IF v_body IS NULL AND v_offer IS NULL AND p_media_url IS NULL THEN
        RAISE EXCEPTION 'Escribe algo o añade un archivo';
    END IF;
    IF p_media_url IS NOT NULL
       AND COALESCE(p_media_type, '') NOT IN ('image', 'audio', 'video') THEN
        RAISE EXCEPTION 'Tipo de archivo no válido';
    END IF;

    INSERT INTO public.ligar_posts (
        university_id, author_id, is_anonymous, body, offer,
        media_url, media_type, audience
    ) VALUES (
        v_uni, v_user, COALESCE(p_is_anonymous, false), v_body, v_offer,
        p_media_url,
        CASE WHEN p_media_url IS NULL THEN NULL ELSE p_media_type END,
        v_aud
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ligar_post(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 9. RPC: delete_ligar_post — borrado lógico por el autor.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_ligar_post(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    UPDATE public.ligar_posts
        SET is_deleted = true, updated_at = NOW()
        WHERE id = p_post_id
          AND (author_id = v_user OR public.is_admin());
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_ligar_post(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 10. RPC: react_ligar_post — alterna "me gusta".
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.react_ligar_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_exists BOOLEAN;
    v_count INT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.ligar_reactions
        WHERE post_id = p_post_id AND user_id = v_user
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.ligar_reactions WHERE post_id = p_post_id AND user_id = v_user;
    ELSE
        INSERT INTO public.ligar_reactions (post_id, user_id) VALUES (p_post_id, v_user)
        ON CONFLICT DO NOTHING;
    END IF;

    SELECT reaction_count INTO v_count FROM public.ligar_posts WHERE id = p_post_id;
    RETURN jsonb_build_object('reacted', NOT v_exists, 'reaction_count', COALESCE(v_count, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.react_ligar_post(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 11. RPC: report_ligar_post — reportar (auto-oculta tras 3 vía trigger).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_ligar_post(p_post_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    INSERT INTO public.ligar_reports (post_id, reporter_id, reason)
    VALUES (p_post_id, v_user, NULLIF(btrim(COALESCE(p_reason, '')), ''))
    ON CONFLICT (post_id, reporter_id) DO NOTHING;
    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_ligar_post(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.ligar_posts IS 'Ligar: muro por universidad. Audiencia por género (todos/hombre/mujer); identidad oculta en RPC si is_anonymous.';
