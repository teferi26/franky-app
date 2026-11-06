-- =====================================================
-- 052: Profiles — add onboarding_step column
-- =====================================================
-- Permite retomar onboarding donde el usuario lo dejó.
-- `onboarding_completed` (BOOLEAN ya existe) sigue siendo el flag de
-- "ya terminó", pero `onboarding_step` (0-8) registra el último paso
-- visto/guardado por si abandona y vuelve.
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step SMALLINT NOT NULL DEFAULT 0
    CHECK (onboarding_step BETWEEN 0 AND 8);

COMMENT ON COLUMN public.profiles.onboarding_step IS
  'Last onboarding step persisted (0=not started, 8=done). Used to resume mid-flow.';
