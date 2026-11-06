-- ─── 170: Estudio (copia en la nube) + racha diaria ─────────────────────────
-- La app móvil guarda el horario, los exámenes, las tareas y la nota media en
-- el dispositivo. Esta migración añade:
--   1. study_data: UNA fila por usuario con todo ese material en JSON, para que
--      no se pierda al cambiar de móvil y para que la web pueda enseñar la
--      misma agenda (/agenda). Última escritura gana; el cliente decide.
--   2. Racha diaria en profiles (streak_count, streak_best, streak_last_day) y
--      la RPC touch_streak(), que la actualiza de forma idempotente por día.
-- Todo con RLS de "solo lo mío". Sin triggers ni cron.

-- 1) Copia en la nube del material de estudio ---------------------------------
CREATE TABLE IF NOT EXISTS public.study_data (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.study_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_data_select_own ON public.study_data;
CREATE POLICY study_data_select_own ON public.study_data
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS study_data_insert_own ON public.study_data;
CREATE POLICY study_data_insert_own ON public.study_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS study_data_update_own ON public.study_data;
CREATE POLICY study_data_update_own ON public.study_data
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS study_data_delete_own ON public.study_data;
CREATE POLICY study_data_delete_own ON public.study_data
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_data TO authenticated;

-- Tope de tamaño: el blob de estudio de una persona no debería pasar de unos
-- cientos de KB. 512 KB evita que un cliente roto llene la tabla.
ALTER TABLE public.study_data DROP CONSTRAINT IF EXISTS study_data_size_chk;
ALTER TABLE public.study_data
  ADD CONSTRAINT study_data_size_chk CHECK (pg_column_size(data) <= 524288);

-- 2) Racha diaria ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_best  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_last_day DATE;

-- touch_streak(p_day): marca el día como "abierto" y devuelve la racha.
--   · El cliente manda SU fecha local (YYYY-MM-DD) para que la medianoche sea
--     la del usuario, no la del servidor.
--   · Mismo día: no cambia nada. Día siguiente: +1. Hueco de 2+ días: vuelve a 1.
--   · Un día anterior al último registrado (reloj mal puesto): se ignora.
CREATE OR REPLACE FUNCTION public.touch_streak(p_day DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (streak_count INTEGER, streak_best INTEGER, streak_last_day DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_last DATE;
  v_cnt  INTEGER;
  v_best INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  -- Solo aceptamos fechas razonables (±2 días del reloj del servidor).
  IF p_day IS NULL OR p_day > CURRENT_DATE + 2 OR p_day < CURRENT_DATE - 2 THEN
    p_day := CURRENT_DATE;
  END IF;

  SELECT p.streak_last_day, p.streak_count, p.streak_best
    INTO v_last, v_cnt, v_best
    FROM public.profiles p WHERE p.id = v_uid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_last IS NULL OR p_day - v_last >= 2 THEN
    v_cnt := 1;
  ELSIF p_day - v_last = 1 THEN
    v_cnt := COALESCE(v_cnt, 0) + 1;
  ELSIF p_day < v_last THEN
    -- Fecha anterior: no tocamos nada, devolvemos lo que hay.
    RETURN QUERY SELECT v_cnt, v_best, v_last;
    RETURN;
  END IF; -- p_day = v_last: mismo día, v_cnt se queda

  v_best := GREATEST(COALESCE(v_best, 0), v_cnt);

  UPDATE public.profiles
     SET streak_count = v_cnt, streak_best = v_best, streak_last_day = p_day
   WHERE id = v_uid;

  RETURN QUERY SELECT v_cnt, v_best, p_day;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_streak(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_streak(DATE) TO authenticated;

-- Las columnas nuevas de profiles son visibles para el propio usuario por las
-- políticas ya existentes (select own). No se exponen en public_profiles.
