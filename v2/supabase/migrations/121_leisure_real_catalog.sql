-- =====================================================================
-- 121: catálogo real de zonas de ocio
--
-- Soporte para el nuevo catálogo de ocio: POIs reales de Wikidata con foto
-- exacta (en Storage, bucket público leisure-photos), enriquecidos con info
-- real. Añade columnas para la ficha enriquecida y traza el origen, y fija el
-- CHECK de categorías con las 9 reales (incluye 'pub', que ya se usaba).
--
-- El bucket leisure-photos se crea por la API de Storage (script), no aquí.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.leisure_spots
  ADD COLUMN IF NOT EXISTS tagline TEXT,                 -- frase gancho para la card
  ADD COLUMN IF NOT EXISTS details JSONB,                -- why_go, highlights, practical, sources...
  ADD COLUMN IF NOT EXISTS source TEXT,                  -- 'wikidata' para el catálogo curado
  ADD COLUMN IF NOT EXISTS wikidata_qid TEXT;            -- trazabilidad / dedup

CREATE UNIQUE INDEX IF NOT EXISTS idx_leisure_wikidata_qid
  ON public.leisure_spots(wikidata_qid) WHERE wikidata_qid IS NOT NULL;

-- Las 9 categorías reales. Se eliminan posibles CHECK antiguos (la 001 tenía 8
-- sin 'pub') y se fija el definitivo. Todas las filas vivas ya están dentro.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leisure_spots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.leisure_spots DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.leisure_spots
  ADD CONSTRAINT leisure_spots_category_check
  CHECK (category IN ('bar', 'pub', 'restaurante', 'cafeteria', 'discoteca',
                      'parque', 'cultural', 'deportivo', 'coworking'));

COMMENT ON COLUMN public.leisure_spots.details IS
  '121: ficha enriquecida (why_go, highlights, practical, best_time, student_tip, sources).';
