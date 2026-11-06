-- =====================================================
-- 015: Admin Content Management
-- Ensures is_active column across content tables
-- Adds leisure_spot_suggestions management
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. is_active column in content tables
-- ─────────────────────────────────────────────────────
ALTER TABLE public.leisure_spots
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.accommodations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add is_featured to leisure_spots if missing
ALTER TABLE public.leisure_spots
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────
-- 2. Ensure discarded_records has correct shape
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discarded_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_table TEXT NOT NULL,
    original_id UUID NOT NULL,
    data JSONB NOT NULL,
    deleted_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    restored_at TIMESTAMPTZ,
    restored_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_discarded_table ON public.discarded_records(original_table, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_discarded_original ON public.discarded_records(original_id);

ALTER TABLE public.discarded_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage discarded records"
  ON public.discarded_records FOR ALL
  USING (is_admin());

-- ─────────────────────────────────────────────────────
-- 3. leisure_spot_suggestions (user-submitted spots)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leisure_spot_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Basic info
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('bar','restaurante','cafeteria','discoteca','parque','cultural','deportivo','coworking','otro')),
    city TEXT NOT NULL,
    address TEXT,
    description TEXT,
    website TEXT,
    phone TEXT,
    image_url TEXT,
    -- Admin review
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    -- If approved, creates a leisure_spot and stores its id
    created_leisure_spot_id UUID REFERENCES public.leisure_spots(id) ON DELETE SET NULL,
    -- If associated with an event (even when not yet approved)
    related_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lss_status ON public.leisure_spot_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lss_submitter ON public.leisure_spot_suggestions(submitted_by);

ALTER TABLE public.leisure_spot_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submitter can view own suggestions"
  ON public.leisure_spot_suggestions FOR SELECT
  USING (auth.uid() = submitted_by OR is_admin());

CREATE POLICY "Authenticated users can submit suggestions"
  ON public.leisure_spot_suggestions FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Admins manage suggestions"
  ON public.leisure_spot_suggestions FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins delete suggestions"
  ON public.leisure_spot_suggestions FOR DELETE
  USING (is_admin());

-- ─────────────────────────────────────────────────────
-- 4. FUNCTION: approve_leisure_suggestion
-- Converts a suggestion into an actual leisure_spot
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_leisure_suggestion(
  p_suggestion_id UUID,
  p_admin_note    TEXT DEFAULT NULL
)
RETURNS UUID  -- returns the created leisure_spot id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_suggestion    RECORD;
  v_spot_id       UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve suggestions';
  END IF;

  SELECT * INTO v_suggestion
  FROM public.leisure_spot_suggestions
  WHERE id = p_suggestion_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found or already processed';
  END IF;

  -- Create the leisure_spot
  INSERT INTO public.leisure_spots (
    name, category, city, address, description,
    website, phone, image_url, is_verified, is_active
  ) VALUES (
    v_suggestion.name,
    v_suggestion.category,
    v_suggestion.city,
    v_suggestion.address,
    v_suggestion.description,
    v_suggestion.website,
    v_suggestion.phone,
    v_suggestion.image_url,
    true,
    true
  ) RETURNING id INTO v_spot_id;

  -- Update suggestion status
  UPDATE public.leisure_spot_suggestions
  SET
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    review_note = p_admin_note,
    created_leisure_spot_id = v_spot_id
  WHERE id = p_suggestion_id;

  -- Log admin action
  PERFORM log_admin_action(
    auth.uid(),
    'approve_leisure_suggestion',
    'leisure_spot_suggestions',
    p_suggestion_id::TEXT,
    jsonb_build_object('note', p_admin_note, 'created_spot_id', v_spot_id)
  );

  RETURN v_spot_id;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 5. FUNCTION: log_admin_action (ensure it exists)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id   UUID,
  p_action     TEXT,
  p_target_table TEXT,
  p_target_id  TEXT,
  p_details    JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (p_admin_id, p_action, p_target_table, p_target_id, p_details);
EXCEPTION WHEN OTHERS THEN
  -- Don't fail main operation if logging fails
  NULL;
END;
$$;

-- Ensure admin_audit_log has target_id and details columns
ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS target_id TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

-- ─────────────────────────────────────────────────────
-- 6. Admin RLS overrides for content tables
-- ─────────────────────────────────────────────────────

-- Leisure spots: admin full access
DO $$ BEGIN
  CREATE POLICY "Admins full access leisure_spots"
    ON public.leisure_spots FOR ALL
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Events: admin full access
DO $$ BEGIN
  CREATE POLICY "Admins full access events"
    ON public.events FOR ALL
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Accommodations: admin full access
DO $$ BEGIN
  CREATE POLICY "Admins full access accommodations"
    ON public.accommodations FOR ALL
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
