-- ═══════════════════════════════════════════════════════════════════════════
-- 124: Reparación de la migración 123 (grafo social + stories)
--
-- Qué pasó: al aplicar la 123 en prod solo llegó a crearse `follows` (§1);
-- la sección de storage falla en el Supabase actual (el rol postgres no puede
-- tocar storage.buckets/objects por SQL) y arrastró al resto. Esta migración
-- repone SOLO lo que falta y es aplicable desde el SQL Editor:
--   - tabla stories + RLS
--   - función get_social_counts
--   - recarga de la caché de esquema de PostgREST (NOTIFY)
--
-- La parte de storage YA está resuelta por otra vía (20-jul-2026): el bucket
-- stories-media se creó con la Storage API y las subidas van por el endpoint
-- /api/stories/upload con service role, así que aquí no se toca storage.
-- Idempotente: se puede ejecutar más de una vez sin peligro.
-- ═══════════════════════════════════════════════════════════════════════════

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

COMMENT ON TABLE public.stories IS '124: stories de 24h; media en stories-media via /api/stories/upload.';

-- PostgREST no ve tablas nuevas hasta recargar su caché de esquema.
NOTIFY pgrst, 'reload schema';
