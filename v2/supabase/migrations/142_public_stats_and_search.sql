-- =====================================================
-- 142: Prueba social pública + búsqueda de carreras usable
-- =====================================================
-- Dos cosas independientes que van juntas por no encadenar migraciones sueltas.
--
-- 1) get_public_community_stats()
--    La home enseña cuatro cifras (universidades, carreras, becas, ocio) que
--    son de CATÁLOGO, o sea: de contenido. Ninguna dice que haya nadie dentro.
--    Un visitante nuevo no tiene forma de saber si esto está vivo o es un
--    directorio abandonado, y esa es justo la duda que hay que resolver antes
--    de pedirle que se registre.
--
--    Devuelve solo agregados redondeados. Nada de filas, nada de identidades.
--
-- 2) Índice trigram sobre careers.name
--    El filtro de /carreras usa `ilike '%texto%'`, que NO puede aprovechar un
--    índice B-tree: con 4.382 carreras cada búsqueda es un escaneo completo de
--    la tabla. Con pg_trgm pasa a ser una búsqueda indexada.

-- ─────────────────────────────────────────────────────
-- 1. Cifras de comunidad para la home
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_community_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_students   INT;
    v_unis       INT;
    v_threads30  INT;
BEGIN
    -- Cuentas activas (ni descartadas ni autoborradas).
    SELECT COUNT(*)::int INTO v_students
      FROM public.profiles
     WHERE COALESCE(is_discarded, false) = false;

    -- Universidades con actividad real en FOMO el último mes: es la cifra
    -- honesta de "en cuántos campus está pasando algo".
    SELECT COUNT(DISTINCT t.university_id)::int INTO v_unis
      FROM public.fomo_threads t
     WHERE t.is_deleted = false
       AND t.is_hidden = false
       AND t.created_at > NOW() - INTERVAL '30 days';

    SELECT COUNT(*)::int INTO v_threads30
      FROM public.fomo_threads t
     WHERE t.is_deleted = false
       AND t.is_hidden = false
       AND t.created_at > NOW() - INTERVAL '30 days';

    RETURN jsonb_build_object(
        -- Se redondea a la baja en decenas: la cifra exacta de usuarios es
        -- información competitiva y además cambia cada minuto sin aportar nada.
        'students', (v_students / 10) * 10,
        'active_universities', v_unis,
        'threads_30d', v_threads30
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_community_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_community_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_community_stats() IS
'Agregados publicos de comunidad para la prueba social de la home (usuarios redondeados a la decena, universidades activas en FOMO y hilos del ultimo mes). No expone filas ni identidades.';

-- ─────────────────────────────────────────────────────
-- 2. Búsqueda de carreras indexada
-- ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gin_trgm_ops es lo que hace que `name ILIKE '%algo%'` use índice.
CREATE INDEX IF NOT EXISTS idx_careers_name_trgm
    ON public.careers USING gin (name gin_trgm_ops);

-- Mismo problema en el buscador de universidades y en el de becas.
CREATE INDEX IF NOT EXISTS idx_universities_name_trgm
    ON public.universities USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_scholarships_name_trgm
    ON public.scholarships USING gin (name gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
