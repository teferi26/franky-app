-- =====================================================================
-- 118: Perfiles profundos de carrera, valoraciones con estrellas,
--      comentarios anónimos y enriquecimiento de becas.
--
-- 1. career_profiles: contenido canónico por familia de carrera (etapa
--    preuniversitaria, universitaria y postuniversitaria, dificultad,
--    salidas con salarios reales y fuentes citadas). Una familia agrupa
--    las filas de careers que son la misma titulación en distintas
--    universidades; el contenido profundo vive aquí y no se duplica.
-- 2. careers.profile_id: enlace de cada fila al perfil de su familia.
-- 3. career_ratings: valoración 1-5 estrellas, una por usuario y carrera.
--    Las filas individuales NO son públicas (privacidad); el agregado se
--    expone vía función SECURITY DEFINER.
-- 4. career_comments.is_anonymous + vista career_comments_public que
--    oculta user_id en los anónimos. La lectura pública pasa a la vista;
--    la tabla deja de ser legible por cualquiera.
-- 5. scholarships: proceso de solicitud paso a paso, nota de convocatoria
--    y trazabilidad de verificación de la URL oficial.
--
-- Idempotente: IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.
-- =====================================================================

-- =====================================================
-- 1. career_profiles
-- =====================================================
CREATE TABLE IF NOT EXISTS public.career_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    canonical_name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'single' CHECK (kind IN ('single', 'doble', 'master')),
    component_slugs TEXT[],            -- si kind='doble': slugs de los perfiles componentes
    branch TEXT,
    overview TEXT,                     -- qué es y qué se estudia
    difficulty_score NUMERIC(3,1) CHECK (difficulty_score IS NULL OR (difficulty_score >= 1 AND difficulty_score <= 10)),
    difficulty_rationale TEXT,
    -- Estadísticas de nota de corte calculadas sobre las filas de careers (2025)
    cut_off_min NUMERIC(6,3),
    cut_off_max NUMERIC(6,3),
    cut_off_median NUMERIC(6,3),
    -- Etapas (estructura documentada en docs/career-profile-schema.md)
    pre_university JSONB,              -- bachillerato, asignaturas clave, EBAU/ponderaciones, acceso FP, consejos
    university_stage JSONB,            -- curso a curso, asignaturas difíciles, abandono, prácticas/TFG
    post_university JSONB,             -- inserción laboral, máster necesario, másteres habituales, colegiación
    salidas JSONB,                     -- array de salidas: rol, cómo llegar paso a paso, salarios España/extranjero, demanda
    salario_medio JSONB,               -- recién egresado / 5 años, con fuente
    empleabilidad JSONB,               -- tasa con fuente
    why_study TEXT[],
    why_not_study TEXT[],
    sources JSONB,                     -- [{titulo, url, fecha_consulta}]
    research_confidence TEXT CHECK (research_confidence IS NULL OR research_confidence IN ('alta', 'media', 'baja')),
    researched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_profiles_branch ON public.career_profiles(branch);
CREATE INDEX IF NOT EXISTS idx_career_profiles_kind ON public.career_profiles(kind);

DROP TRIGGER IF EXISTS set_updated_at ON public.career_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.career_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.career_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Career profiles are viewable by everyone" ON public.career_profiles;
CREATE POLICY "Career profiles are viewable by everyone"
    ON public.career_profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins can manage career profiles" ON public.career_profiles;
CREATE POLICY "Admins can manage career profiles"
    ON public.career_profiles FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Enlace fila → perfil de familia
ALTER TABLE public.careers ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.career_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_careers_profile ON public.careers(profile_id);

-- =====================================================
-- 2. career_ratings (1-5 estrellas, una por usuario/carrera)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.career_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    career_id UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (career_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_career_ratings_career ON public.career_ratings(career_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.career_ratings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.career_ratings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.career_ratings ENABLE ROW LEVEL SECURITY;

-- Las filas individuales solo las ve su autor (el agregado sale por función).
DROP POLICY IF EXISTS "Users can read own ratings" ON public.career_ratings;
CREATE POLICY "Users can read own ratings"
    ON public.career_ratings FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can rate careers" ON public.career_ratings;
CREATE POLICY "Users can rate careers"
    ON public.career_ratings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ratings" ON public.career_ratings;
CREATE POLICY "Users can update own ratings"
    ON public.career_ratings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own ratings" ON public.career_ratings;
CREATE POLICY "Users can delete own ratings"
    ON public.career_ratings FOR DELETE
    USING (auth.uid() = user_id);

-- Agregado público sin exponer filas individuales.
-- SECURITY DEFINER a propósito: las filas de career_ratings son privadas
-- (own-row), pero la media y el recuento son datos de catálogo públicos que
-- se muestran en la ficha (también a anónimos, por eso el GRANT a anon). La
-- función no expone ninguna fila ni acepta más entrada que el id de carrera,
-- así que no hay escalada posible. search_path fijo según la migración 117.
CREATE OR REPLACE FUNCTION public.career_rating_summary(p_career_id UUID)
RETURNS TABLE (avg_rating NUMERIC, ratings_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
    SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*) AS ratings_count
    FROM public.career_ratings
    WHERE career_id = p_career_id;
$$;

REVOKE ALL ON FUNCTION public.career_rating_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.career_rating_summary(UUID) TO anon, authenticated;

-- Agregado a nivel de familia (todas las universidades de la misma titulación)
CREATE OR REPLACE FUNCTION public.career_profile_rating_summary(p_profile_id UUID)
RETURNS TABLE (avg_rating NUMERIC, ratings_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
    SELECT ROUND(AVG(r.rating)::numeric, 2) AS avg_rating, COUNT(*) AS ratings_count
    FROM public.career_ratings r
    JOIN public.careers c ON c.id = r.career_id
    WHERE c.profile_id = p_profile_id;
$$;

REVOKE ALL ON FUNCTION public.career_profile_rating_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.career_profile_rating_summary(UUID) TO anon, authenticated;

-- =====================================================
-- 3. Comentarios anónimos
-- =====================================================
ALTER TABLE public.career_comments ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;

-- La tabla deja de ser legible públicamente: user_id no debe filtrarse en
-- comentarios anónimos. La lectura pública pasa por la vista de abajo.
DROP POLICY IF EXISTS "Anyone can read comments" ON public.career_comments;

DROP POLICY IF EXISTS "Users can read own comments" ON public.career_comments;
CREATE POLICY "Users can read own comments"
    ON public.career_comments FOR SELECT
    USING (auth.uid() = user_id);

-- Vista pública: ejecuta como dueño (postgres) y por tanto no aplica la RLS
-- de la tabla base; expone user_id solo cuando el comentario no es anónimo.
-- is_mine permite al cliente saber cuáles son suyos sin ver user_id ajenos.
-- security_invoker=false (definer) es DELIBERADO, mismo patrón que
-- public_profiles (040): la tabla base queda own-row y la lectura pública
-- pasa por esta lista curada de columnas (sin PII; el user_id de los no
-- anónimos ya es público en public_profiles). El linter de Supabase avisará
-- de "security definer view": aceptado y documentado aquí.
CREATE OR REPLACE VIEW public.career_comments_public AS
SELECT
    cc.id,
    cc.career_id,
    CASE WHEN cc.is_anonymous THEN NULL ELSE cc.user_id END AS user_id,
    cc.content,
    cc.parent_id,
    cc.is_anonymous,
    cc.created_at,
    cc.updated_at,
    (cc.user_id = auth.uid()) AS is_mine
FROM public.career_comments cc;

GRANT SELECT ON public.career_comments_public TO anon, authenticated;

-- =====================================================
-- 4. Becas: proceso de solicitud y verificación
-- =====================================================
ALTER TABLE public.scholarships
    ADD COLUMN IF NOT EXISTS application_process JSONB,   -- ["paso 1...", "paso 2..."]
    ADD COLUMN IF NOT EXISTS deadline_note TEXT,           -- "convocatoria anual, suele abrir en marzo"
    ADD COLUMN IF NOT EXISTS convocatoria TEXT,            -- "2026-2027"
    ADD COLUMN IF NOT EXISTS url_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sources JSONB;                -- [{titulo, url, fecha_consulta}]
