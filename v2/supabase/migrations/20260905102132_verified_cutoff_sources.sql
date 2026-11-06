ALTER TABLE public.careers
  ADD COLUMN IF NOT EXISTS cut_off_source_url text,
  ADD COLUMN IF NOT EXISTS cut_off_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS cut_off_round text,
  ADD COLUMN IF NOT EXISTS cut_off_extraordinary numeric(5,3),
  ADD COLUMN IF NOT EXISTS cut_off_official_code text;
COMMENT ON COLUMN public.careers.cut_off_score IS 'General quota, ordinary call. Read year, round and source together. NULL does not mean unrestricted admission.';
COMMENT ON COLUMN public.careers.cut_off_extraordinary IS 'General-quota extraordinary call from the same dated source; never substitute for the ordinary call.';
