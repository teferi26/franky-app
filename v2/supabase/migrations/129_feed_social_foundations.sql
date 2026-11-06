-- ═══════════════════════════════════════════════════════════════════════════
-- 129: Cimientos sociales/feed (Ola 0 del plan de las 100 mejoras)
--
-- Prepara el backend para varias mejoras de retención sin ir goteando
-- migraciones: reacciones con emoji, guardar posts del feed, comentarios con
-- respuesta e "me gusta", menciones, y vistas + destacadas de stories.
-- Todo idempotente (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- Aplicable desde el SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. Reacciones del feed con emoji (una por usuario, como IG)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.fomo_reactions ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '❤️';

-- set_fomo_reaction: pone/cambia/quita la reacción con emoji. Si se manda el
-- mismo emoji que ya tenías, se quita (toggle); emoji vacío también quita.
-- Devuelve el emoji resultante (o NULL si quedó sin reacción).
CREATE OR REPLACE FUNCTION public.set_fomo_reaction(p_thread_id UUID, p_emoji TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_current TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT emoji INTO v_current FROM public.fomo_reactions
      WHERE thread_id = p_thread_id AND user_id = v_user;

    IF p_emoji IS NULL OR btrim(p_emoji) = '' OR p_emoji = v_current THEN
        DELETE FROM public.fomo_reactions WHERE thread_id = p_thread_id AND user_id = v_user;
        RETURN NULL;
    END IF;

    INSERT INTO public.fomo_reactions (thread_id, user_id, emoji)
    VALUES (p_thread_id, v_user, p_emoji)
    ON CONFLICT (thread_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji;
    RETURN p_emoji;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_fomo_reaction(UUID, TEXT) TO authenticated;

-- Desglose de reacciones por emoji de un hilo (para el "😂 3 · ❤️ 12").
CREATE OR REPLACE FUNCTION public.fomo_reaction_summary(p_thread_id UUID)
RETURNS TABLE (emoji TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
    SELECT emoji, COUNT(*) FROM public.fomo_reactions
    WHERE thread_id = p_thread_id GROUP BY emoji ORDER BY COUNT(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fomo_reaction_summary(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 2. Guardar publicaciones del feed (favoritos de fomo_thread)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_target_type_check;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_target_type_check
    CHECK (target_type IN ('accommodation', 'university', 'career', 'event', 'leisure_spot', 'fomo_thread', 'scholarship'));

-- ─────────────────────────────────────────────────────
-- 3. Comentarios: responder a un comentario + "me gusta" a comentarios
-- ─────────────────────────────────────────────────────
ALTER TABLE public.fomo_replies ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES public.fomo_replies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fomo_replies_parent ON public.fomo_replies (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fomo_reply_reactions (
    reply_id   UUID NOT NULL REFERENCES public.fomo_replies(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reply_id, user_id)
);
ALTER TABLE public.fomo_reply_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fomo_reply_reactions_select ON public.fomo_reply_reactions;
CREATE POLICY fomo_reply_reactions_select ON public.fomo_reply_reactions
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS fomo_reply_reactions_write ON public.fomo_reply_reactions;
CREATE POLICY fomo_reply_reactions_write ON public.fomo_reply_reactions
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- 4. Menciones @usuario: tipo de notificación nuevo
-- ─────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'message', 'match', 'review', 'accommodation', 'event', 'promotion',
        'system', 'scholarship', 'accommodation_request', 'roomie_like', 'payment',
        'comment', 'post', 'tenancy', 'visit', 'contract', 'mention'
    ));

-- ─────────────────────────────────────────────────────
-- 5. Stories: vistas (quién la vio) + destacadas (copia persistente)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.story_views (
    story_id   UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    viewer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
-- El autor de la story ve quién la vio; el visor solo inserta su propia vista.
DROP POLICY IF EXISTS story_views_select ON public.story_views;
CREATE POLICY story_views_select ON public.story_views
    FOR SELECT TO authenticated USING (
        viewer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.author_id = auth.uid())
    );
DROP POLICY IF EXISTS story_views_insert ON public.story_views;
CREATE POLICY story_views_insert ON public.story_views
    FOR INSERT TO authenticated WITH CHECK (viewer_id = auth.uid());

-- Destacadas: como las stories caducan y se borran, la destacada guarda su
-- propia copia de la media (no referencia a stories).
CREATE TABLE IF NOT EXISTS public.story_highlights (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_url  TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    caption    TEXT CHECK (char_length(COALESCE(caption, '')) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_story_highlights_author ON public.story_highlights (author_id, created_at DESC);
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS story_highlights_select ON public.story_highlights;
CREATE POLICY story_highlights_select ON public.story_highlights
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = author_id AND COALESCE(p.is_discarded, false) = false)
    );
DROP POLICY IF EXISTS story_highlights_write ON public.story_highlights;
CREATE POLICY story_highlights_write ON public.story_highlights
    FOR ALL TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

COMMENT ON COLUMN public.fomo_reactions.emoji IS '129: reacción con emoji (una por usuario); set_fomo_reaction gestiona el toggle.';
COMMENT ON TABLE public.story_views IS '129: quién ha visto cada story (el autor lo consulta).';
COMMENT ON TABLE public.story_highlights IS '129: stories destacadas con copia persistente de la media.';

NOTIFY pgrst, 'reload schema';
