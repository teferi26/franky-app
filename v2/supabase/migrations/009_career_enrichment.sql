-- Migration 009: Career enrichment + comments
-- Add new columns from scraped data and create comments table

-- New fields from scraping
ALTER TABLE public.careers
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS price_first_year NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS faculty_url TEXT,
  ADD COLUMN IF NOT EXISTS career_url TEXT;

-- Update cut_off_year default to 2025
ALTER TABLE public.careers ALTER COLUMN cut_off_year SET DEFAULT 2025;

-- =====================================================
-- Career comments table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.career_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    career_id UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
    parent_id UUID REFERENCES public.career_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_comments_career ON public.career_comments(career_id);
CREATE INDEX IF NOT EXISTS idx_career_comments_user ON public.career_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_career_comments_parent ON public.career_comments(parent_id);

-- RLS
ALTER TABLE public.career_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments"
    ON public.career_comments FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create comments"
    ON public.career_comments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
    ON public.career_comments FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
    ON public.career_comments FOR DELETE
    USING (auth.uid() = user_id);
