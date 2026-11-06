-- An absent score is not proof of unrestricted admission. This explicit flag
-- is only set after checking the institution's published admission policy.
ALTER TABLE public.careers
  ADD COLUMN IF NOT EXISTS admission_without_cutoff boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.careers.admission_without_cutoff IS
  'Officially verified absence of admission ranking by cutoff score. Access qualifications and enrolment deadlines still apply. Read cut_off_source_url and cut_off_verified_at.';

-- UNED FAQ 1.4, checked 2026-09-05: degree places are not limited by numerus
-- clausus, so no cutoff score applies. The old 5.000/2025 was a placeholder.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.careers c JOIN public.universities u ON u.id = c.university_id
      WHERE u.slug = 'universidad-nacional-de-educacion-a-distancia'
      AND c.cut_off_score = 5 AND c.cut_off_year = 2025 AND c.cut_off_round IS NULL) <> 40 THEN
    RAISE EXCEPTION 'UNED catalogue changed: review the 40 expected placeholder scores before applying';
  END IF;
END $$;
UPDATE public.careers c
SET admission_without_cutoff = true,
    cut_off_score = NULL,
    cut_off_year = NULL,
    cut_off_extraordinary = NULL,
    cut_off_round = 'Acceso sin nota de corte. Debes cumplir los requisitos de acceso a grado y matricularte dentro del plazo de la UNED',
    cut_off_source_url = 'https://www.uned.es/universidad/inicio/atencion-estudiante/preguntas-frecuentes/estudiar-en-UNED.html',
    cut_off_verified_at = now()
FROM public.universities u
WHERE c.university_id = u.id
  AND u.slug = 'universidad-nacional-de-educacion-a-distancia'
  AND c.cut_off_score = 5 AND c.cut_off_year = 2025
  AND c.cut_off_round IS NULL;

ALTER TABLE public.careers ADD CONSTRAINT careers_without_cutoff_has_no_score
  CHECK (NOT admission_without_cutoff OR (cut_off_score IS NULL AND cut_off_extraordinary IS NULL));
