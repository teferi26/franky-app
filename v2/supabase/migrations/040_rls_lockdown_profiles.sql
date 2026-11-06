-- 040 — RLS lockdown wave S1
--
-- This migration closes three critical findings from the security audit:
--
-- 1. CRITICAL: `profiles` had `FOR SELECT USING (true)`, which let any
--    authenticated user read email/phone/birth_date of EVERY other user.
--    We split access into two paths:
--      - public.profiles → strict (own row + admin only)
--      - public.public_profiles → curated view (no PII) usable by friends/chats/RoomieMatch
--
-- 2. HIGH: career_test_sessions allowed SELECT/UPDATE on any row that had a
--    non-null session_token — anyone with a guessed/leaked token could read
--    another user's RIASEC answers. Now token-less anonymous mode requires
--    user_id IS NULL (intentional anonymous session).
--
-- 3. HIGH: is_admin() was declared STABLE, meaning Postgres cached its
--    result for the session. If an admin loses their role mid-session, they
--    keep admin privileges until logout. Switching to VOLATILE forces re-check
--    on every call.
--
-- Rollback plan: keep the previous policies handy and re-add them if any
-- regression is observed. See bottom of file.

-- =====================================================================
-- 1. Public profile view (curated, no PII)
-- =====================================================================

-- security_invoker = false (the default) means the view runs with the
-- privileges of its owner (postgres). This bypasses RLS on the underlying
-- profiles table BY DESIGN — we want all authenticated users to read this
-- list, but only the columns we expose.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
    -- Identity (non-PII)
    p.id,
    p.full_name,
    p.avatar_url,
    p.photos,
    p.bio,
    p.role,
    p.created_at,
    p.student_email_verified,
    -- "is_propietario" is derived from role; the underlying column does not
    -- exist in this schema. We expose it as a boolean so callers keep their
    -- existing shape (UI components can still read `.is_propietario`).
    (p.role = 'propietario') AS is_propietario,
    -- Location (city is intentionally exposed for matching; full address is not in this table)
    p.city,
    p.comunidad_autonoma,
    -- Academic
    p.university_id,
    p.career,
    p.academic_year,
    p.is_student,
    p.student_type,
    p.bachillerato_course,
    p.bachillerato_modality,
    p.fp_study,
    p.university_course,
    p.master_study,
    p.knows_desired_career,
    p.desired_career_id,
    p.desired_city,
    p.study_anywhere,
    -- Housing intent
    p.looking_for_housing,
    p.looking_for_roommate,
    p.budget_min,
    p.budget_max,
    -- Lifestyle & roommate preferences (already publicly used in RoomieMatch matching)
    p.gender,
    p.smoking,
    p.partying,
    p.sleep_schedule,
    p.cleanliness,
    p.noise_tolerance,
    p.disorder_tolerance,
    p.friends_at_home,
    p.home_gatherings,
    p.pet_friendly,
    p.diet,
    p.hobbies,
    p.study_habits,
    p.is_homebody,
    p.is_early_riser,
    p.accepts_different_gender_roommate,
    -- JSON aggregates (no individual PII inside)
    p.lifestyle_preferences,
    p.housing_preferences,
    -- Embedded university (avoids relying on PostgREST FK inference for views;
    -- callers that previously did `select("..., universities(name)")` keep
    -- the same shape via this jsonb_build_object).
    CASE
      WHEN u.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'short_name', u.short_name,
        'city', u.city
      )
    END AS universities
FROM public.profiles p
LEFT JOIN public.universities u ON u.id = p.university_id
WHERE p.is_discarded IS NOT TRUE;

COMMENT ON VIEW public.public_profiles IS
  'Curated, PII-free projection of public.profiles. Bypasses RLS to expose '
  'social-graph metadata (name, avatar, university, prefs) to every authenticated '
  'user. Email, phone, birth_date, raw student_email and admin-only fields are '
  'intentionally NOT exposed here — use public.profiles directly (with strict RLS) '
  'for those.';

GRANT SELECT ON public.public_profiles TO authenticated;

-- =====================================================================
-- 2. Tighten RLS on public.profiles
-- =====================================================================

-- Drop the overly permissive read policy.
DROP POLICY IF EXISTS "Public profiles viewable by authenticated" ON public.profiles;

-- Replace with: each user reads only their own full row.
CREATE POLICY "Own profile readable"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Admin gets full read of every profile. (The existing "Admins can manage
-- profiles" FOR ALL policy at line 788 of 001_schema.sql already grants this,
-- but we add an explicit SELECT-only one for clarity and so we can drop
-- the broad FOR ALL one in a later migration without losing read access.)
CREATE POLICY "Admins read all profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- =====================================================================
-- 3. Fix career_test_sessions session_token RLS hole
-- =====================================================================

DROP POLICY IF EXISTS "Users see own sessions" ON public.career_test_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.career_test_sessions;

-- Authenticated users see only their own sessions, identified by user_id.
-- Anonymous sessions (user_id IS NULL) are not readable through this policy;
-- the test-vocacional flow uses a SECURITY DEFINER RPC to fetch by token
-- which validates the token server-side without leaking other users' rows.
CREATE POLICY "Authenticated users see own sessions"
    ON public.career_test_sessions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users update own sessions"
    ON public.career_test_sessions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- INSERT policy ("Anyone can create test sessions") stays as-is: the public
-- vocational test allows starting a session without an account, which is
-- intentional. The new user_id-gated SELECT keeps that session private to
-- the creator afterwards (via cookies/token on the client + RPC server-side).

-- =====================================================================
-- 4. is_admin() — STABLE -> VOLATILE
-- =====================================================================

-- STABLE allowed Postgres to cache the result for the duration of a single
-- statement (and sometimes the session). If an admin's role is revoked, the
-- old result could still be returned — meaning the just-demoted user keeps
-- admin power until their session ends. VOLATILE forces a fresh query on
-- every call, which is what we want for an authorisation check.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND is_discarded IS NOT TRUE
    );
END;
$$;

-- =====================================================================
-- Verification queries (run manually after applying)
-- =====================================================================
-- As a regular authenticated user (auth.uid() = some-random-uuid):
--   SELECT email FROM public.profiles WHERE id <> auth.uid() LIMIT 1;
--     → should return 0 rows
--   SELECT * FROM public.public_profiles LIMIT 5;
--     → should return rows WITHOUT email/phone/birth_date columns
--
-- As an admin (role = 'admin'):
--   SELECT email FROM public.profiles WHERE id <> auth.uid() LIMIT 1;
--     → should return rows
--
-- is_admin() VOLATILE check:
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<test_user>';
--   SELECT public.is_admin() FROM (SELECT 1) t;  -- in user's session: true
--   UPDATE public.profiles SET role = 'user' WHERE id = '<test_user>';
--   SELECT public.is_admin() FROM (SELECT 1) t;  -- in same session: false
