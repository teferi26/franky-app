-- =====================================================
-- 078: FOMO — "El Twitter de tu universidad"
-- =====================================================
-- Feed por universidad con hilos (texto / imagen / audio / encuesta),
-- respuestas, reacciones, encuestas simples y reportes.
--
-- Decisiones de diseño (ver project_fomo_pivot.md):
--  * Autoría SIEMPRE almacenada server-side, incluso en posts anónimos
--    (requisito legal: difamación anónima trazable). La identidad NUNCA
--    se expone al cliente en posts anónimos — por eso las lecturas
--    públicas van por RPC SECURITY DEFINER (get_fomo_feed / get_fomo_thread)
--    que anula los datos de autor cuando is_anonymous = true. El SELECT
--    directo sobre la tabla queda restringido a autor + admin.
--  * Sin moderación activa al principio: red de seguridad = auto-ocultar
--    tras 3 reportes + rate-limit por usuario.
--  * Encuestas simples: 2-4 opciones, un voto por usuario.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. Hilos del feed
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fomo_threads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    author_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_anonymous  BOOLEAN NOT NULL DEFAULT false,
    body          TEXT,
    media_url     TEXT,
    media_type    TEXT CHECK (media_type IN ('image', 'audio')),
    reply_count   INT NOT NULL DEFAULT 0,
    reaction_count INT NOT NULL DEFAULT 0,
    report_count  INT NOT NULL DEFAULT 0,
    is_hidden     BOOLEAN NOT NULL DEFAULT false,  -- auto-ocultado tras 3 reportes / admin
    is_deleted    BOOLEAN NOT NULL DEFAULT false,  -- borrado lógico (autor / admin)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Un hilo debe tener algo: texto, media o encuesta (se valida en RPC de creación).
    CHECK (media_url IS NULL OR media_type IS NOT NULL),
    CHECK (char_length(COALESCE(body, '')) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_fomo_threads_feed
    ON public.fomo_threads (university_id, created_at DESC)
    WHERE is_deleted = false AND is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_fomo_threads_author
    ON public.fomo_threads (author_id);

-- ─────────────────────────────────────────────────────
-- 2. Respuestas a un hilo
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fomo_replies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id    UUID NOT NULL REFERENCES public.fomo_threads(id) ON DELETE CASCADE,
    author_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_anonymous BOOLEAN NOT NULL DEFAULT false,
    body         TEXT,
    media_url    TEXT,
    media_type   TEXT CHECK (media_type IN ('image', 'audio')),
    report_count INT NOT NULL DEFAULT 0,
    is_hidden    BOOLEAN NOT NULL DEFAULT false,
    is_deleted   BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (media_url IS NULL OR media_type IS NOT NULL),
    CHECK (char_length(COALESCE(body, '')) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_fomo_replies_thread
    ON public.fomo_replies (thread_id, created_at ASC)
    WHERE is_deleted = false AND is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_fomo_replies_author
    ON public.fomo_replies (author_id);

-- ─────────────────────────────────────────────────────
-- 3. Encuestas simples (2-4 opciones, un voto por usuario)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fomo_polls (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id  UUID NOT NULL UNIQUE REFERENCES public.fomo_threads(id) ON DELETE CASCADE,
    question   TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fomo_poll_options (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id    UUID NOT NULL REFERENCES public.fomo_polls(id) ON DELETE CASCADE,
    position   SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 3),
    label      TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
    vote_count INT NOT NULL DEFAULT 0,
    UNIQUE (poll_id, position)
);

CREATE INDEX IF NOT EXISTS idx_fomo_poll_options_poll
    ON public.fomo_poll_options (poll_id);

CREATE TABLE IF NOT EXISTS public.fomo_poll_votes (
    poll_id    UUID NOT NULL REFERENCES public.fomo_polls(id) ON DELETE CASCADE,
    option_id  UUID NOT NULL REFERENCES public.fomo_poll_options(id) ON DELETE CASCADE,
    voter_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (poll_id, voter_id)  -- un voto por usuario por encuesta
);

-- ─────────────────────────────────────────────────────
-- 4. Reacciones (me gusta simple, una por usuario por hilo)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fomo_reactions (
    thread_id  UUID NOT NULL REFERENCES public.fomo_threads(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, user_id)
);

-- ─────────────────────────────────────────────────────
-- 5. Reportes (hilo o respuesta) — un reporte por usuario por objeto
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fomo_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
    target_id   UUID NOT NULL,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason      TEXT CHECK (char_length(COALESCE(reason, '')) <= 500),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (target_type, target_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_fomo_reports_target
    ON public.fomo_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_fomo_reports_pending
    ON public.fomo_reports (created_at DESC)
    WHERE status = 'pending';

-- ─────────────────────────────────────────────────────
-- 6. Bucket de media FOMO (imágenes + audios)
--    Path: {user_id}/{thread|reply}/{random}.{ext}
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fomo-media',
    'fomo-media',
    true,
    10485760, -- 10MB (audio pesa más que imagen)
    ARRAY[
        'image/jpeg','image/png','image/webp','image/gif',
        'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/aac'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "fomo_media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "fomo_media_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "fomo_media_owner_delete" ON storage.objects;

CREATE POLICY "fomo_media_public_select"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'fomo-media');

CREATE POLICY "fomo_media_owner_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'fomo-media'
        AND owner = auth.uid()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "fomo_media_owner_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'fomo-media' AND owner = auth.uid());

-- ─────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────
ALTER TABLE public.fomo_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_replies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_poll_votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_reports      ENABLE ROW LEVEL SECURITY;

-- THREADS: lectura directa SOLO autor + admin (la lectura pública del feed va
-- por get_fomo_feed/get_fomo_thread, que protegen el anonimato). Insert propio.
-- Update/delete: autor (para borrar/editar lo suyo) + admin.
DROP POLICY IF EXISTS "fomo_threads_select_own_or_admin" ON public.fomo_threads;
CREATE POLICY "fomo_threads_select_own_or_admin"
    ON public.fomo_threads FOR SELECT TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fomo_threads_insert_own" ON public.fomo_threads;
CREATE POLICY "fomo_threads_insert_own"
    ON public.fomo_threads FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "fomo_threads_update_own_or_admin" ON public.fomo_threads;
CREATE POLICY "fomo_threads_update_own_or_admin"
    ON public.fomo_threads FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fomo_threads_delete_own_or_admin" ON public.fomo_threads;
CREATE POLICY "fomo_threads_delete_own_or_admin"
    ON public.fomo_threads FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

-- REPLIES: igual que threads.
DROP POLICY IF EXISTS "fomo_replies_select_own_or_admin" ON public.fomo_replies;
CREATE POLICY "fomo_replies_select_own_or_admin"
    ON public.fomo_replies FOR SELECT TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fomo_replies_insert_own" ON public.fomo_replies;
CREATE POLICY "fomo_replies_insert_own"
    ON public.fomo_replies FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "fomo_replies_update_own_or_admin" ON public.fomo_replies;
CREATE POLICY "fomo_replies_update_own_or_admin"
    ON public.fomo_replies FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fomo_replies_delete_own_or_admin" ON public.fomo_replies;
CREATE POLICY "fomo_replies_delete_own_or_admin"
    ON public.fomo_replies FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

-- POLLS + OPTIONS: lectura para autenticados (no exponen autoría). Escritura
-- solo admin directa; la creación real va por RPC SECURITY DEFINER.
DROP POLICY IF EXISTS "fomo_polls_select_all" ON public.fomo_polls;
CREATE POLICY "fomo_polls_select_all"
    ON public.fomo_polls FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fomo_poll_options_select_all" ON public.fomo_poll_options;
CREATE POLICY "fomo_poll_options_select_all"
    ON public.fomo_poll_options FOR SELECT TO authenticated USING (true);

-- VOTES: el usuario gestiona sus propios votos.
DROP POLICY IF EXISTS "fomo_poll_votes_select_own" ON public.fomo_poll_votes;
CREATE POLICY "fomo_poll_votes_select_own"
    ON public.fomo_poll_votes FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

DROP POLICY IF EXISTS "fomo_poll_votes_insert_own" ON public.fomo_poll_votes;
CREATE POLICY "fomo_poll_votes_insert_own"
    ON public.fomo_poll_votes FOR INSERT TO authenticated
    WITH CHECK (voter_id = auth.uid());

-- REACTIONS: el usuario gestiona sus propias reacciones.
DROP POLICY IF EXISTS "fomo_reactions_select_own" ON public.fomo_reactions;
CREATE POLICY "fomo_reactions_select_own"
    ON public.fomo_reactions FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "fomo_reactions_insert_own" ON public.fomo_reactions;
CREATE POLICY "fomo_reactions_insert_own"
    ON public.fomo_reactions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fomo_reactions_delete_own" ON public.fomo_reactions;
CREATE POLICY "fomo_reactions_delete_own"
    ON public.fomo_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- REPORTS: crear propios + ver propios; admin gestiona todos.
DROP POLICY IF EXISTS "fomo_reports_insert_own" ON public.fomo_reports;
CREATE POLICY "fomo_reports_insert_own"
    ON public.fomo_reports FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "fomo_reports_select_own_or_admin" ON public.fomo_reports;
CREATE POLICY "fomo_reports_select_own_or_admin"
    ON public.fomo_reports FOR SELECT TO authenticated
    USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fomo_reports_admin_manage" ON public.fomo_reports;
CREATE POLICY "fomo_reports_admin_manage"
    ON public.fomo_reports FOR UPDATE TO authenticated
    USING (public.is_admin());

-- ─────────────────────────────────────────────────────
-- 8. Triggers: contadores, auto-ocultar y rate-limit
-- ─────────────────────────────────────────────────────

-- 8a. reply_count en el hilo
CREATE OR REPLACE FUNCTION public.fomo_reply_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.fomo_threads SET reply_count = reply_count + 1 WHERE id = NEW.thread_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.fomo_threads SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.thread_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_fomo_reply_count ON public.fomo_replies;
CREATE TRIGGER trg_fomo_reply_count
    AFTER INSERT OR DELETE ON public.fomo_replies
    FOR EACH ROW EXECUTE FUNCTION public.fomo_reply_count_sync();

-- 8b. reaction_count en el hilo
CREATE OR REPLACE FUNCTION public.fomo_reaction_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.fomo_threads SET reaction_count = reaction_count + 1 WHERE id = NEW.thread_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.fomo_threads SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.thread_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_fomo_reaction_count ON public.fomo_reactions;
CREATE TRIGGER trg_fomo_reaction_count
    AFTER INSERT OR DELETE ON public.fomo_reactions
    FOR EACH ROW EXECUTE FUNCTION public.fomo_reaction_count_sync();

-- 8c. vote_count en la opción
CREATE OR REPLACE FUNCTION public.fomo_vote_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.fomo_poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.fomo_poll_options SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.option_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_fomo_vote_count ON public.fomo_poll_votes;
CREATE TRIGGER trg_fomo_vote_count
    AFTER INSERT OR DELETE ON public.fomo_poll_votes
    FOR EACH ROW EXECUTE FUNCTION public.fomo_vote_count_sync();

-- 8d. Reporte → incrementa report_count y auto-oculta tras 3.
CREATE OR REPLACE FUNCTION public.fomo_report_apply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count INT;
BEGIN
    IF NEW.target_type = 'thread' THEN
        UPDATE public.fomo_threads
            SET report_count = report_count + 1
            WHERE id = NEW.target_id
            RETURNING report_count INTO v_count;
        IF v_count >= 3 THEN
            UPDATE public.fomo_threads SET is_hidden = true WHERE id = NEW.target_id;
        END IF;
    ELSIF NEW.target_type = 'reply' THEN
        UPDATE public.fomo_replies
            SET report_count = report_count + 1
            WHERE id = NEW.target_id
            RETURNING report_count INTO v_count;
        IF v_count >= 3 THEN
            UPDATE public.fomo_replies SET is_hidden = true WHERE id = NEW.target_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fomo_report_apply ON public.fomo_reports;
CREATE TRIGGER trg_fomo_report_apply
    AFTER INSERT ON public.fomo_reports
    FOR EACH ROW EXECUTE FUNCTION public.fomo_report_apply();

-- 8e. Rate-limit de hilos: máx 10 por hora por autor.
CREATE OR REPLACE FUNCTION public.fomo_thread_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_recent INT;
BEGIN
    SELECT COUNT(*) INTO v_recent
        FROM public.fomo_threads
        WHERE author_id = NEW.author_id
          AND created_at > NOW() - INTERVAL '1 hour';
    IF v_recent >= 10 THEN
        RAISE EXCEPTION 'Rate limit: máximo 10 publicaciones por hora';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fomo_thread_rate ON public.fomo_threads;
CREATE TRIGGER trg_fomo_thread_rate
    BEFORE INSERT ON public.fomo_threads
    FOR EACH ROW EXECUTE FUNCTION public.fomo_thread_rate_limit();

-- 8f. Rate-limit de respuestas: máx 30 por hora por autor.
CREATE OR REPLACE FUNCTION public.fomo_reply_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_recent INT;
BEGIN
    SELECT COUNT(*) INTO v_recent
        FROM public.fomo_replies
        WHERE author_id = NEW.author_id
          AND created_at > NOW() - INTERVAL '1 hour';
    IF v_recent >= 30 THEN
        RAISE EXCEPTION 'Rate limit: máximo 30 respuestas por hora';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fomo_reply_rate ON public.fomo_replies;
CREATE TRIGGER trg_fomo_reply_rate
    BEFORE INSERT ON public.fomo_replies
    FOR EACH ROW EXECUTE FUNCTION public.fomo_reply_rate_limit();

COMMENT ON TABLE public.fomo_threads IS 'FOMO: hilos del feed por universidad. Autoría siempre almacenada, oculta en RPC si is_anonymous.';
COMMENT ON TABLE public.fomo_reports IS 'FOMO: reportes; auto-oculta el objeto tras 3 reportes (red de seguridad sin moderación activa).';
