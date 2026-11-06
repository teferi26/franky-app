-- These owner-rights views are curated read APIs, not mutation endpoints.
-- Default grants had left career_comments_public automatically writable,
-- bypassing the base table's own-comment RLS (including its anonymity flag).
-- Preserve the existing read audiences; legitimate writes use the base tables.
-- The social demo filter also called current_demo_cohort() directly, although
-- anon cannot execute it. Check the same server registry through the existing
-- public boolean helper; do not expose cohort IDs or grant another function.
DO $$
DECLARE
  definition text := pg_get_viewdef('public.career_comments_public'::regclass, true);
  original_filter text := 'NOT workspace_is_demo_user(user_id) AND current_demo_cohort() IS NULL';
  safe_filter text := 'NOT workspace_is_demo_user(user_id) AND NOT workspace_is_demo_user(auth.uid())';
BEGIN
  IF strpos(definition, original_filter) > 0 THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.career_comments_public AS ' || replace(definition, original_filter, safe_filter);
  ELSIF strpos(definition, safe_filter) = 0 THEN
    RAISE EXCEPTION 'career_comments_public_filter_changed';
  END IF;
END $$;

REVOKE ALL PRIVILEGES ON TABLE public.career_comments_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.career_comments_public TO anon, authenticated;

-- public_profiles is not currently auto-updatable because its source joins
-- universities. Remove dormant write grants so a future simplification cannot
-- accidentally enable the same owner-rights write path. Anon stays unreadable.
REVOKE ALL PRIVILEGES ON TABLE public.public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
