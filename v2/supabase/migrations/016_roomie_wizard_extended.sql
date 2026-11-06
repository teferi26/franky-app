-- supabase/migrations/016_roomie_wizard_extended.sql
-- Description: Phase B - Extend roomie wizard to 5 steps, fix Phase A column types,
--              add new profile fields for richer matching
-- Date: 2026-04-23

-- ─────────────────────────────────────────────────────
-- 1. Drop incompatible CHECK constraints on profiles
--    (Phase A UI uses different value sets)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_partying_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_study_habits_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sleep_schedule_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_noise_tolerance_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_friends_at_home_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_smoking_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_diet_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cleanliness_check;

-- ─────────────────────────────────────────────────────
-- 2. Fix profiles.cleanliness: INTEGER → TEXT
--    (Phase A stores text values: muy_limpio / normal / relajado)
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'cleanliness') = 'integer' THEN
    ALTER TABLE public.profiles
      ALTER COLUMN cleanliness TYPE TEXT
      USING CASE cleanliness::int
        WHEN 1 THEN 'relajado'
        WHEN 2 THEN 'relajado'
        WHEN 3 THEN 'normal'
        WHEN 4 THEN 'normal'
        WHEN 5 THEN 'muy_limpio'
        ELSE 'normal'
      END;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 3. Fix profiles.pet_friendly: BOOLEAN → TEXT
--    (Phase A stores text: no / me_gustan / tengo)
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'pet_friendly') = 'boolean' THEN
    ALTER TABLE public.profiles
      ALTER COLUMN pet_friendly TYPE TEXT
      USING CASE WHEN pet_friendly::boolean THEN 'me_gustan' ELSE 'no' END;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 4. Fix roommate_matches: add target_id column
--    (Phase A upserts with target_id + onConflict: "user_id,target_id")
-- ─────────────────────────────────────────────────────
ALTER TABLE public.roommate_matches
  ADD COLUMN IF NOT EXISTS target_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Backfill target_id from matched_user_id for existing rows
UPDATE public.roommate_matches
  SET target_id = matched_user_id
  WHERE target_id IS NULL AND matched_user_id IS NOT NULL;

-- Unique index required for upsert onConflict: "user_id,target_id"
CREATE UNIQUE INDEX IF NOT EXISTS idx_roommate_matches_user_target
  ON public.roommate_matches(user_id, target_id);

-- ─────────────────────────────────────────────────────
-- 5. New Phase B profile columns
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  -- Identity
  ADD COLUMN IF NOT EXISTS gender TEXT,

  -- Preferences for roommate search
  ADD COLUMN IF NOT EXISTS gender_preference_roommate TEXT DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS age_min INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS age_max INTEGER DEFAULT 35,
  ADD COLUMN IF NOT EXISTS move_in_date DATE,

  -- Habits
  ADD COLUMN IF NOT EXISTS work_from_home TEXT DEFAULT 'a_veces',
  ADD COLUMN IF NOT EXISTS guest_frequency TEXT DEFAULT 'a_veces',
  ADD COLUMN IF NOT EXISTS cooking_frequency TEXT DEFAULT 'a_veces',
  ADD COLUMN IF NOT EXISTS music_loudness TEXT DEFAULT 'medio',

  -- Personality & identity
  ADD COLUMN IF NOT EXISTS personality_type TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deal_breakers TEXT[] DEFAULT '{}',

  -- Presentation
  ADD COLUMN IF NOT EXISTS profile_bio TEXT,
  ADD COLUMN IF NOT EXISTS profile_photos TEXT[] DEFAULT '{}';

-- ─────────────────────────────────────────────────────
-- 6. Index for common discovery queries
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_roommate_city
  ON public.profiles(city, looking_for_roommate)
  WHERE looking_for_roommate = true;

CREATE INDEX IF NOT EXISTS idx_profiles_budget
  ON public.profiles(budget_min, budget_max)
  WHERE looking_for_roommate = true;
