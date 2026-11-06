-- =====================================================
-- 143: Slugs legibles para las carreras
-- =====================================================
-- La columna careers.slug existe desde la 005 pero nunca se rellenó: las
-- fichas usan el UUID (/carreras/8f3a-…). Un UUID no lleva la palabra clave en
-- la URL, así que no posiciona; /carreras/medicina-universidad-de-alicante sí,
-- y son 4.382 URLs de catálogo con intención de búsqueda alta.
--
-- El nombre de una carrera se repite en decenas de universidades ("Medicina"
-- está en casi todas), así que el slug NECESITA el contexto de la universidad
-- para ser único: <carrera>-<universidad>. Y aun así puede colisionar (dobles
-- grados con el mismo nombre en la misma uni), de ahí el desempate final.

-- Slugify: minúsculas, sin acentos, no alfanumérico → guion, sin guiones
-- sobrantes. IMMUTABLE para poder usarse en índices si hiciera falta.
CREATE OR REPLACE FUNCTION public.slugify(txt TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT trim(both '-' from
    regexp_replace(
      lower(
        translate(
          txt,
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- Se regeneran TODOS los slugs, no solo los vacíos. La columna existe desde
-- la migración 005 y algunas cargas antiguas la rellenaron con el nombre a
-- secas (sin universidad), dejando duplicados preexistentes entre filas
-- ("grado-en-educacion-infantil" en varias unis) que hacían fallar el índice
-- único. Nada referenciaba esos slugs viejos (las URLs usaban el UUID), así
-- que vaciarlos y regenerarlos es seguro e idempotente: la migración se puede
-- relanzar tras un fallo a mitad.
UPDATE public.careers SET slug = NULL;

-- Poblar slugs. Se hace en un bloque para poder desempatar colisiones
-- con un sufijo incremental sin depender de un índice único que aún no existe.
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT c.id, c.name, u.slug AS uni_slug, u.short_name
      FROM public.careers c
      LEFT JOIN public.universities u ON u.id = c.university_id
     WHERE c.slug IS NULL OR c.slug = ''
     ORDER BY c.name
  LOOP
    base := public.slugify(r.name);
    IF base IS NULL OR base = '' THEN
      base := 'carrera';
    END IF;
    -- Añade el contexto de universidad para desambiguar el nombre repetido.
    IF r.uni_slug IS NOT NULL AND r.uni_slug <> '' THEN
      base := base || '-' || r.uni_slug;
    ELSIF r.short_name IS NOT NULL THEN
      base := base || '-' || public.slugify(r.short_name);
    END IF;
    -- Recorta para no generar slugs kilométricos con los dobles grados largos.
    base := left(base, 90);

    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.careers WHERE slug = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;

    UPDATE public.careers SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- A partir de ahora el slug es único y obligatorio de facto. Índice único
-- parcial (ignora los NULL que pudieran quedar de filas sin universidad).
CREATE UNIQUE INDEX IF NOT EXISTS idx_careers_slug_unique
  ON public.careers (slug)
  WHERE slug IS NOT NULL;

NOTIFY pgrst, 'reload schema';
