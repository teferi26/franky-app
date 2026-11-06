-- =====================================================
-- 008: Enrich universities table with scraped data
-- Adds rector, motto, modality, academic_staff, wiki_link, 
-- image_attribution, curiosities columns
-- =====================================================

-- New columns for enriched data
ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS rector TEXT,
  ADD COLUMN IF NOT EXISTS motto TEXT,
  ADD COLUMN IF NOT EXISTS modality TEXT DEFAULT 'presencial' CHECK (modality IN ('presencial', 'online', 'hibrida', 'semipresencial')),
  ADD COLUMN IF NOT EXISTS academic_staff INTEGER,
  ADD COLUMN IF NOT EXISTS wiki_link TEXT,
  ADD COLUMN IF NOT EXISTS image_attribution TEXT,
  ADD COLUMN IF NOT EXISTS curiosities JSONB DEFAULT '[]';

-- Index on modality for filtering
CREATE INDEX IF NOT EXISTS idx_universities_modality ON public.universities(modality);
