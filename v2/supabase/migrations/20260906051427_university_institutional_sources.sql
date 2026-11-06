-- Public provenance for the existing institutional catalogue, not user data.
-- The existing public-read/admin-write RLS and grants remain unchanged.
ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS institutional_sources jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.universities
  ADD CONSTRAINT universities_institutional_sources_shape
  CHECK (jsonb_typeof(institutional_sources) = 'object'
    AND octet_length(institutional_sources::text) <= 65536);

COMMENT ON COLUMN public.universities.institutional_sources IS
  'Public evidence keyed by field: reference_value, checked_at, optional period/note, and sources [{title,url}]. Clients must match reference_value to the current field before showing verification; editing a field does not certify the new value.';
