-- =====================================================
-- Migration 107: Apuntes (notes) — compartir apuntes por asignatura y curso
-- (renombrada desde 100_notes.sql: el número 100 colisionaba con
--  100_crush_requests_notifs_unread.sql)
-- =====================================================
-- Modelo: cada apunte es un archivo (PDF normalmente) en el bucket 'notes'
-- + una fila aquí con metadatos buscables (uni, carrera, asignatura, curso).
-- Valoraciones en note_ratings (una por usuario) con agregados cacheados.

CREATE TABLE IF NOT EXISTS public.notes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    career_id     UUID REFERENCES public.careers(id) ON DELETE SET NULL,
    career_name   TEXT,                          -- texto libre si no hay career_id
    subject       TEXT NOT NULL CHECK (length(subject) BETWEEN 2 AND 120),
    year          INT CHECK (year BETWEEN 1 AND 6),
    kind          TEXT NOT NULL DEFAULT 'apuntes'
                    CHECK (kind IN ('apuntes', 'resumen', 'ejercicios', 'examen', 'formulario')),
    title         TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
    description   TEXT CHECK (length(COALESCE(description, '')) <= 1000),
    file_url      TEXT NOT NULL,
    file_size_kb  INT,
    downloads     INT NOT NULL DEFAULT 0,
    rating_sum    INT NOT NULL DEFAULT 0,
    rating_count  INT NOT NULL DEFAULT 0,
    is_hidden     BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_university ON public.notes(university_id);
CREATE INDEX IF NOT EXISTS idx_notes_career     ON public.notes(career_id);
CREATE INDEX IF NOT EXISTS idx_notes_subject    ON public.notes(lower(subject));
CREATE INDEX IF NOT EXISTS idx_notes_created    ON public.notes(created_at DESC);

CREATE TABLE IF NOT EXISTS public.note_ratings (
    note_id    UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (note_id, user_id)
);

-- RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_public" ON public.notes;
CREATE POLICY "notes_select_public" ON public.notes
    FOR SELECT USING (is_hidden = false);

DROP POLICY IF EXISTS "notes_insert_own" ON public.notes;
CREATE POLICY "notes_insert_own" ON public.notes
    FOR INSERT TO authenticated WITH CHECK (uploader_id = auth.uid());

DROP POLICY IF EXISTS "notes_update_own" ON public.notes;
CREATE POLICY "notes_update_own" ON public.notes
    FOR UPDATE TO authenticated USING (uploader_id = auth.uid());

DROP POLICY IF EXISTS "notes_delete_own" ON public.notes;
CREATE POLICY "notes_delete_own" ON public.notes
    FOR DELETE TO authenticated USING (uploader_id = auth.uid());

DROP POLICY IF EXISTS "note_ratings_select" ON public.note_ratings;
CREATE POLICY "note_ratings_select" ON public.note_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "note_ratings_upsert_own" ON public.note_ratings;
CREATE POLICY "note_ratings_upsert_own" ON public.note_ratings
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Agregados de rating cacheados en notes
CREATE OR REPLACE FUNCTION public.note_ratings_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE public.notes n SET
        rating_sum   = (SELECT COALESCE(SUM(rating), 0) FROM public.note_ratings r WHERE r.note_id = n.id),
        rating_count = (SELECT COUNT(*) FROM public.note_ratings r WHERE r.note_id = n.id)
    WHERE n.id = COALESCE(NEW.note_id, OLD.note_id);
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_note_ratings_sync ON public.note_ratings;
CREATE TRIGGER trg_note_ratings_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.note_ratings
    FOR EACH ROW EXECUTE FUNCTION public.note_ratings_sync();

-- Contador de descargas (cualquier usuario autenticado)
CREATE OR REPLACE FUNCTION public.register_note_download(p_note_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.notes SET downloads = downloads + 1 WHERE id = p_note_id;
$$;
GRANT EXECUTE ON FUNCTION public.register_note_download(UUID) TO authenticated, anon;

-- Bucket de almacenamiento (lectura pública, escritura del dueño en su carpeta)
INSERT INTO storage.buckets (id, name, public)
VALUES ('notes', 'notes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "notes_storage_read" ON storage.objects;
CREATE POLICY "notes_storage_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'notes');

DROP POLICY IF EXISTS "notes_storage_insert_own" ON storage.objects;
CREATE POLICY "notes_storage_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'notes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "notes_storage_delete_own" ON storage.objects;
CREATE POLICY "notes_storage_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'notes' AND (storage.foldername(name))[1] = auth.uid()::text);
