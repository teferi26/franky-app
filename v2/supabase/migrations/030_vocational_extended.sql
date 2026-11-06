-- 030_vocational_extended.sql
-- Extiende vocational_results con: Big Five, MBTI-like, narrativa de personalidad,
-- carreras recomendadas con justificación, universidades, ciudades y holland_code.
-- Permite que cada usuario tenga UN resultado vigente (la fila más reciente cuenta como "el actual").

ALTER TABLE public.vocational_results
    ADD COLUMN IF NOT EXISTS big_five JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS mbti_type TEXT,
    ADD COLUMN IF NOT EXISTS holland_code TEXT,
    ADD COLUMN IF NOT EXISTS personality_narrative TEXT,
    ADD COLUMN IF NOT EXISTS strengths TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS work_style TEXT,
    ADD COLUMN IF NOT EXISTS top_careers JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS top_universities JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS top_cities JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS profile_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS completion_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS questions_answered INTEGER;

CREATE INDEX IF NOT EXISTS idx_vocational_results_user_created
    ON public.vocational_results(user_id, created_at DESC);

-- Helper RPC: devuelve el resultado más reciente del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_my_vocational_result()
RETURNS public.vocational_results
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT *
    FROM public.vocational_results
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_vocational_result() TO authenticated;
