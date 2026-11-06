-- ═══════════════════════════════════════════════════════════════════════════
-- 137: Compra-venta entre estudiantes y tablón "busco / ofrezco"
--      (mejoras 84 y 86 del ciclo 2)
--
-- Una sola tabla para las dos cosas: un anuncio es de VENTA (libros, muebles,
-- bici) o del tablón (busco/ofrezco clases, piso temporal, viajes). Cambia el
-- `kind`, no el modelo. Así el listado, la búsqueda y la moderación son una.
--
-- Visibilidad por campus: como el FOMO, un anuncio se ve dentro de su
-- universidad. El contacto se hace por el chat que ya existe (no guardamos
-- teléfonos ni correos en el anuncio).
--
-- Idempotente y con RLS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.student_listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id  UUID REFERENCES public.universities(id) ON DELETE SET NULL,
  -- 'venta' (vendo algo), 'busco' (necesito algo), 'ofrezco' (doy un servicio)
  kind           TEXT NOT NULL,
  -- libros, muebles, transporte, clases, vivienda, otros
  category       TEXT NOT NULL DEFAULT 'otros',
  title          TEXT NOT NULL,
  body           TEXT,
  price_cents    INT,
  image_url      TEXT,
  city           TEXT,
  status         TEXT NOT NULL DEFAULT 'activo',
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_listings_kind_check
    CHECK (kind IN ('venta', 'busco', 'ofrezco')),
  CONSTRAINT student_listings_status_check
    CHECK (status IN ('activo', 'reservado', 'cerrado')),
  CONSTRAINT student_listings_title_len
    CHECK (char_length(title) BETWEEN 3 AND 120),
  CONSTRAINT student_listings_price_ok
    CHECK (price_cents IS NULL OR price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_student_listings_feed
  ON public.student_listings (university_id, kind, created_at DESC)
  WHERE is_deleted = false AND status <> 'cerrado';

CREATE INDEX IF NOT EXISTS idx_student_listings_author
  ON public.student_listings (author_id, created_at DESC);

ALTER TABLE public.student_listings ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario con cuenta ve los anuncios vivos de SU
-- universidad (o los que no tengan universidad asignada).
DROP POLICY IF EXISTS "student_listings_campus_select" ON public.student_listings;
CREATE POLICY "student_listings_campus_select"
  ON public.student_listings FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      university_id IS NULL
      OR university_id = (SELECT university_id FROM public.profiles WHERE id = auth.uid())
      OR author_id = auth.uid()
    )
  );

-- Escritura: solo tus propios anuncios.
DROP POLICY IF EXISTS "student_listings_own_write" ON public.student_listings;
CREATE POLICY "student_listings_own_write"
  ON public.student_listings FOR ALL TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Al publicar, si no se manda universidad, se hereda la del autor: así el
-- anuncio cae en su campus sin que el cliente tenga que saberlo.
CREATE OR REPLACE FUNCTION public.student_listings_set_university()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.university_id IS NULL THEN
    SELECT university_id INTO NEW.university_id
    FROM public.profiles WHERE id = NEW.author_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_listings_university ON public.student_listings;
CREATE TRIGGER trg_student_listings_university
  BEFORE INSERT OR UPDATE ON public.student_listings
  FOR EACH ROW EXECUTE FUNCTION public.student_listings_set_university();

-- Listado del campus con los datos del autor ya resueltos (evita que el
-- cliente tenga que hacer una segunda consulta por cada anuncio).
CREATE OR REPLACE FUNCTION public.get_student_listings(
  p_kind     TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit    INT  DEFAULT 40,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  id          UUID,
  kind        TEXT,
  category    TEXT,
  title       TEXT,
  body        TEXT,
  price_cents INT,
  image_url   TEXT,
  city        TEXT,
  status      TEXT,
  created_at  TIMESTAMPTZ,
  author_id   UUID,
  author_name TEXT,
  author_avatar TEXT,
  is_mine     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_uni  UUID;
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  SELECT university_id INTO v_uni FROM public.profiles WHERE id = v_me;

  RETURN QUERY
  SELECT l.id, l.kind, l.category, l.title, l.body, l.price_cents, l.image_url,
         l.city, l.status, l.created_at,
         l.author_id, p.full_name, p.avatar_url,
         (l.author_id = v_me)
  FROM public.student_listings l
  JOIN public.profiles p ON p.id = l.author_id
  WHERE l.is_deleted = false
    AND l.status <> 'cerrado'
    AND (l.university_id IS NULL OR l.university_id = v_uni OR l.author_id = v_me)
    AND (p_kind IS NULL OR l.kind = p_kind)
    AND (p_category IS NULL OR l.category = p_category)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_listings(TEXT, TEXT, INT, INT) TO authenticated;

-- Borrado lógico (mismo criterio que el FOMO: no se borra, se oculta).
CREATE OR REPLACE FUNCTION public.delete_student_listing(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.student_listings
    SET is_deleted = true, updated_at = now()
    WHERE id = p_id AND author_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_student_listing(UUID) TO authenticated;

COMMENT ON TABLE public.student_listings IS
  '137: compra-venta entre estudiantes y tablón busco/ofrezco (mejoras 84 y 86).';

NOTIFY pgrst, 'reload schema';
