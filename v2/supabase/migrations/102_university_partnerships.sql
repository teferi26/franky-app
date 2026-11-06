-- =====================================================
-- 102: University partnerships (SCU Fase 1)
-- Marca de "universidad colaboradora" + campos de ficha premium.
--
-- Diseño deliberadamente de bajo riesgo (incidente de seguridad abierto,
-- ver 101): NO crea ningún rol nuevo ni política RLS nueva. Los campos van
-- sobre la tabla `universities`, que ya tiene:
--   · SELECT público  -> "Universities are viewable by everyone" (001)
--   · ALL para admin   -> "Admins can manage universities" (is_admin(), 001)
-- Por tanto la lectura es pública (contenido de marketing) y la escritura
-- queda restringida a administradores, sin tocar la superficie del incidente.
-- =====================================================

ALTER TABLE public.universities
  -- Estado de colaboración
  ADD COLUMN IF NOT EXISTS is_partner BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_tier TEXT
    CHECK (partner_tier IN ('fundadora', 'colaboradora')),
  ADD COLUMN IF NOT EXISTS partner_since DATE,
  -- Contenido de la ficha premium (lo edita la universidad / admin)
  ADD COLUMN IF NOT EXISTS partner_blurb TEXT,
  ADD COLUMN IF NOT EXISTS intro_video_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS jpa_url TEXT,
  ADD COLUMN IF NOT EXISTS jpa_label TEXT,
  -- Grados destacados (override opcional; si está vacío la ficha usa el top por nota de corte)
  ADD COLUMN IF NOT EXISTS featured_career_ids UUID[] DEFAULT '{}';

-- Índice parcial para la página pública /colaboradores (solo filas colaboradoras).
CREATE INDEX IF NOT EXISTS idx_universities_is_partner
  ON public.universities (is_partner)
  WHERE is_partner = true;

COMMENT ON COLUMN public.universities.is_partner IS
  'TRUE si la universidad es colaboradora oficial de Franky (aparece en /colaboradores y muestra ficha premium).';
COMMENT ON COLUMN public.universities.partner_tier IS
  'Nivel de colaboración: fundadora (primera tanda) o colaboradora.';
COMMENT ON COLUMN public.universities.featured_career_ids IS
  'Override opcional de grados destacados en la ficha. Si vacío, se usa el top por nota de corte.';
