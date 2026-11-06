-- Nota de corte del curso anterior (sep-2026).
--
-- Las columnas cut_off_* de public.careers guardan la nota del curso vigente
-- (26/27, cut_off_year = 2026). Estas columnas *_prev guardan la del curso
-- anterior (25/26) para que web y móvil la enseñen con un solo botón, sin
-- mezclarla nunca con la vigente.
--
-- RLS: public.careers ya tiene RLS activado con lectura pública
-- ("Careers are viewable by everyone") y escritura solo admin
-- ("Admins can manage careers"). No hay GRANT por columnas ni vistas públicas
-- sobre careers que haya que ampliar: las columnas nuevas heredan esas
-- políticas. search_careers() está revocada para todos los roles y el front no
-- la usa, así que no se toca.

ALTER TABLE public.careers
  ADD COLUMN IF NOT EXISTS cut_off_score_prev numeric(6,3),
  ADD COLUMN IF NOT EXISTS cut_off_year_prev integer,
  ADD COLUMN IF NOT EXISTS cut_off_round_prev text,
  ADD COLUMN IF NOT EXISTS cut_off_source_url_prev text;

-- Mismo rango que valida la edición académica para cut_off_score (0 a 14) y
-- mismo rango de año. Una nota anterior sin año no se puede rotular, así que se
-- exige el año cuando hay nota. La fuente, si existe, debe ser https.
ALTER TABLE public.careers
  DROP CONSTRAINT IF EXISTS careers_cut_off_score_prev_range,
  DROP CONSTRAINT IF EXISTS careers_cut_off_year_prev_range,
  DROP CONSTRAINT IF EXISTS careers_cut_off_prev_needs_year,
  DROP CONSTRAINT IF EXISTS careers_cut_off_source_url_prev_https;

ALTER TABLE public.careers
  ADD CONSTRAINT careers_cut_off_score_prev_range
    CHECK (cut_off_score_prev IS NULL OR cut_off_score_prev BETWEEN 0 AND 14),
  ADD CONSTRAINT careers_cut_off_year_prev_range
    CHECK (cut_off_year_prev IS NULL OR cut_off_year_prev BETWEEN 2000 AND 2100),
  ADD CONSTRAINT careers_cut_off_prev_needs_year
    CHECK (cut_off_score_prev IS NULL OR cut_off_year_prev IS NOT NULL),
  ADD CONSTRAINT careers_cut_off_source_url_prev_https
    CHECK (cut_off_source_url_prev IS NULL OR cut_off_source_url_prev ~* '^https://');

COMMENT ON COLUMN public.careers.cut_off_score_prev IS
  'General quota, ordinary call, of the previous course (cut_off_year_prev). Never shown as the current cutoff.';
COMMENT ON COLUMN public.careers.cut_off_year_prev IS
  'First calendar year of the course of cut_off_score_prev (2025 means 2025/2026).';
COMMENT ON COLUMN public.careers.cut_off_round_prev IS
  'Round or list of cut_off_score_prev, same format as cut_off_round.';
COMMENT ON COLUMN public.careers.cut_off_source_url_prev IS
  'Official source of cut_off_score_prev (https only).';
