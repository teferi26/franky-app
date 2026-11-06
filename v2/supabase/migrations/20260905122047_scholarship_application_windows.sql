-- Published application windows. Null means the source has not confirmed it.
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;
ALTER TABLE public.scholarships ADD CONSTRAINT scholarship_application_window_order
  CHECK (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at);
COMMENT ON COLUMN public.scholarships.opens_at IS 'Official application opening instant; never inferred from last year.';
COMMENT ON COLUMN public.scholarships.closes_at IS 'Official deadline with time and timezone; takes precedence over the date-only deadline.';
