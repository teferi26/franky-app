-- Add detailed career information columns
ALTER TABLE public.careers
  ADD COLUMN IF NOT EXISTS reasons_to_study TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reasons_not_to_study TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_roles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS plan_url TEXT;

CREATE INDEX IF NOT EXISTS idx_careers_slug ON public.careers(slug);
