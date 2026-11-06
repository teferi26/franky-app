-- ═══════════════════════════════════════════════════════════════════════════
-- 123: Grafo social (seguir / seguidores) + Stories 24h
--
-- Pedido por Teferi (20-jul-2026): el perfil del móvil pasa a ser tipo
-- Instagram (publicaciones + seguidores + siguiendo) y se pueden subir
-- stories que caducan a las 24 horas. Las "publicaciones" del perfil son los
-- fomo_threads no anónimos del autor (no hay tabla nueva de posts).
--
-- Modelo de follow: unidireccional (como IG). "Amigos" = follow mutuo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. follows
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    followee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON public.follows (followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (contadores y listas públicas, como IG).
DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows
    FOR SELECT TO authenticated USING (true);

-- Seguir: solo en tu propio nombre y nunca a cuentas descartadas.
DROP POLICY IF EXISTS follows_insert ON public.follows;
CREATE POLICY follows_insert ON public.follows
    FOR INSERT TO authenticated
    WITH CHECK (
        follower_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = followee_id AND COALESCE(p.is_discarded, false) = false
        )
    );

-- Dejar de seguir: solo tus propios follows.
DROP POLICY IF EXISTS follows_delete ON public.follows;
CREATE POLICY follows_delete ON public.follows
    FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- 2. stories (caducan a las 24 h)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_url  TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    caption    TEXT CHECK (char_length(COALESCE(caption, '')) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_stories_author_active
    ON public.stories (author_id, expires_at DESC);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Ver stories: autenticado y no caducadas (el autor ve también las suyas caducadas
-- para poder gestionarlas). Cuentas descartadas no emiten.
DROP POLICY IF EXISTS stories_select ON public.stories;
CREATE POLICY stories_select ON public.stories
    FOR SELECT TO authenticated
    USING (
        author_id = auth.uid()
        OR (
            expires_at > NOW()
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = author_id AND COALESCE(p.is_discarded, false) = false
            )
        )
    );

DROP POLICY IF EXISTS stories_insert ON public.stories;
CREATE POLICY stories_insert ON public.stories
    FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS stories_delete ON public.stories;
CREATE POLICY stories_delete ON public.stories
    FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- 3. Bucket de media para stories (público, imagen/vídeo)
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'stories-media', 'stories-media', true,
    52428800, -- 50 MB (vídeos cortos)
    ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Subida: solo a tu propia carpeta (primera carpeta del path = uid), como en
-- fomo-media. Lectura pública (bucket public). Borrado: solo lo tuyo.
DROP POLICY IF EXISTS "stories-media owner insert" ON storage.objects;
CREATE POLICY "stories-media owner insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'stories-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "stories-media owner delete" ON storage.objects;
CREATE POLICY "stories-media owner delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'stories-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ─────────────────────────────────────────────────────
-- 4. Contadores del perfil en una llamada
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_social_counts(p_user UUID)
RETURNS TABLE (posts BIGINT, followers BIGINT, following BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.fomo_threads t
          WHERE t.author_id = p_user AND t.is_anonymous = false
            AND t.is_deleted = false AND t.is_hidden = false),
        (SELECT COUNT(*) FROM public.follows f WHERE f.followee_id = p_user),
        (SELECT COUNT(*) FROM public.follows f WHERE f.follower_id = p_user);
$$;

GRANT EXECUTE ON FUNCTION public.get_social_counts(UUID) TO authenticated;

COMMENT ON TABLE public.follows IS '123: follow unidireccional estilo IG; amigos = follow mutuo.';
COMMENT ON TABLE public.stories IS '123: stories de 24h con media en el bucket stories-media.';
