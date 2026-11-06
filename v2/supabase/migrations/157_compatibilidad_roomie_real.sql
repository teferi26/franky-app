-- ═══════════════════════════════════════════════════════════════════════════
-- 157: compatibilidad de roomie real (un solo algoritmo, sin porcentajes falsos)
--
-- SÍNTOMA (reportado el 31-jul-2026): en la app salen muchísimos perfiles al
-- 100 % de compatibilidad, lo cual es evidentemente falso.
--
-- CAUSA RAÍZ: el 100 % es LEGÍTIMO con los datos que hay. Las 8 columnas de
-- estilo de vida tienen los mismos DEFAULT en todos los perfiles
-- (006_roommate_compatibility.sql:7-18: smoking='no', partying='ocasional',
-- study_habits='moderado', sleep_schedule='flexible', cleanliness=3,
-- noise_tolerance='moderado', friends_at_home='a_veces', pet_friendly=false) y
-- el onboarding los vuelve a escribir tal cual (onboarding/page.tsx:95-111 y
-- :722-742). Dos perfiles que nunca contestaron el cuestionario son idénticos,
-- así que puntúan 100/100. Ya estaba documentado en 120:1-9 ("239 perfiles con
-- valores por defecto idénticos").
--
-- SEGUNDO PROBLEMA: había DOS algoritmos distintos dando números distintos para
-- la misma pareja. La web calculaba en TypeScript (roomie-match/client.tsx
-- :362-383) y el móvil usaba calculate_compatibility (055:26-116), que además
-- comparaba contra un vocabulario ANTIGUO ('moderado', 'flexible', 'poco',
-- 'bibliofilo', 'fines_semana') que ya no escribe ningún formulario: casi todas
-- las comparaciones caían al ELSE.
--
-- ARREGLO (decidido con el fundador):
--   1. Marcar quién ha contestado DE VERDAD el cuestionario, y no enseñar
--      porcentaje si alguno de los dos no lo ha hecho.
--   2. Un único algoritmo, en el servidor, con el vocabulario actual.
--
-- CÓMO SE SABE QUIÉN HA CONTESTADO: el vocabulario del cuestionario de roomie
-- (web/src/app/roomie-match/client.tsx:24-81 y mobile/app/roomie-editar.tsx
-- :21-30, idénticos) es una huella dactilar exacta. El onboarding usa OTRO
-- vocabulario ('flexible', 'moderado', cleanliness numérico, pet_friendly
-- booleano) y NUNCA escribe study_habits. Así que "los 8 valores pertenecen al
-- vocabulario del cuestionario" solo puede ser cierto si alguien lo rellenó.
-- La marca la pone un TRIGGER del servidor, no los formularios: así no hay que
-- tocar ningún cliente, no se puede falsear, y cualquier formulario futuro que
-- escriba bien las 8 columnas queda marcado solo.
--
-- Aplicable desde el SQL Editor. Idempotente. No toca storage.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Marca de "ha contestado el cuestionario de verdad"
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifestyle_answered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.lifestyle_answered_at IS
  '157: NOT NULL solo si las 8 columnas de estilo de vida tienen valores del '
  'cuestionario ACTUAL. La pone un trigger del servidor; el cliente no la escribe. '
  'NULL = valores por defecto de la 006 o vocabulario del onboarding.';

-- Predicado de vocabulario: la huella dactilar del cuestionario de roomie.
CREATE OR REPLACE FUNCTION public.lifestyle_answers_complete(
  p_smoking         text,
  p_partying        text,
  p_study_habits    text,
  p_sleep_schedule  text,
  p_cleanliness     text,
  p_noise_tolerance text,
  p_friends_at_home text,
  p_pet_friendly    text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
        p_smoking         IN ('no', 'ocasional', 'si')
    AND p_partying        IN ('nunca', 'a_veces', 'fines_de_semana', 'mucho')
    AND p_study_habits    IN ('en_casa', 'biblioteca', 'mixto')
    AND p_sleep_schedule  IN ('madrugador', 'normal', 'nocturno')
    AND p_cleanliness     IN ('muy_limpio', 'normal', 'relajado')
    AND p_noise_tolerance IN ('silencio', 'normal', 'no_me_importa')
    AND p_friends_at_home IN ('nunca', 'a_veces', 'frecuentemente')
    AND p_pet_friendly    IN ('no', 'me_gustan', 'tengo')
  , false);
$$;

COMMENT ON FUNCTION public.lifestyle_answers_complete IS
  '157: true solo si los 8 valores son del vocabulario del cuestionario actual. '
  'El onboarding nunca escribe study_habits y usa otro vocabulario en el resto, '
  'así que sus valores por defecto NUNCA dan true.';

CREATE OR REPLACE FUNCTION public.sync_lifestyle_answered_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.lifestyle_answers_complete(
       NEW.smoking::text,         NEW.partying::text,
       NEW.study_habits::text,    NEW.sleep_schedule::text,
       NEW.cleanliness::text,     NEW.noise_tolerance::text,
       NEW.friends_at_home::text, NEW.pet_friendly::text)
  THEN
    -- Solo se refresca la fecha cuando alguna respuesta cambia de verdad; si no,
    -- cualquier update ajeno (una foto, la bio) parecería un cuestionario nuevo.
    IF TG_OP = 'INSERT'
       OR OLD.lifestyle_answered_at IS NULL
       OR ROW(NEW.smoking, NEW.partying, NEW.study_habits, NEW.sleep_schedule,
              NEW.cleanliness, NEW.noise_tolerance, NEW.friends_at_home, NEW.pet_friendly)
          IS DISTINCT FROM
          ROW(OLD.smoking, OLD.partying, OLD.study_habits, OLD.sleep_schedule,
              OLD.cleanliness, OLD.noise_tolerance, OLD.friends_at_home, OLD.pet_friendly)
    THEN
      NEW.lifestyle_answered_at := NOW();
    ELSE
      NEW.lifestyle_answered_at := OLD.lifestyle_answered_at;
    END IF;
  ELSE
    NEW.lifestyle_answered_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lifestyle_answered_at ON public.profiles;
CREATE TRIGGER trg_sync_lifestyle_answered_at
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_lifestyle_answered_at();

-- Backfill de quien YA lo había rellenado. Filtrado por el mismo predicado, así
-- que solo toca esas filas (no es un UPDATE masivo sobre toda la tabla).
UPDATE public.profiles p
   SET lifestyle_answered_at = NOW()
 WHERE p.lifestyle_answered_at IS NULL
   AND public.lifestyle_answers_complete(
         p.smoking::text,         p.partying::text,
         p.study_habits::text,    p.sleep_schedule::text,
         p.cleanliness::text,     p.noise_tolerance::text,
         p.friends_at_home::text, p.pet_friendly::text);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Escalas ordinales del cuestionario ACTUAL
-- ─────────────────────────────────────────────────────────────────────────
-- Un valor fuera del vocabulario devuelve NULL -> 0 puntos en esa dimensión.
-- El orden es SEMÁNTICO (no el del array del formulario) para que "vecino"
-- signifique de verdad "parecido": study_habits va en_casa < mixto < biblioteca
-- (mixto en medio) y cleanliness relajado < normal < muy_limpio.
CREATE OR REPLACE FUNCTION public.lifestyle_rank(p_field text, p_value text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_field
    WHEN 'smoking' THEN CASE p_value
        WHEN 'no' THEN 1 WHEN 'ocasional' THEN 2 WHEN 'si' THEN 3 END
    WHEN 'partying' THEN CASE p_value
        WHEN 'nunca' THEN 1 WHEN 'a_veces' THEN 2
        WHEN 'fines_de_semana' THEN 3 WHEN 'mucho' THEN 4 END
    WHEN 'study_habits' THEN CASE p_value
        WHEN 'en_casa' THEN 1 WHEN 'mixto' THEN 2 WHEN 'biblioteca' THEN 3 END
    WHEN 'sleep_schedule' THEN CASE p_value
        WHEN 'madrugador' THEN 1 WHEN 'normal' THEN 2 WHEN 'nocturno' THEN 3 END
    WHEN 'cleanliness' THEN CASE p_value
        WHEN 'relajado' THEN 1 WHEN 'normal' THEN 2 WHEN 'muy_limpio' THEN 3 END
    WHEN 'noise_tolerance' THEN CASE p_value
        WHEN 'silencio' THEN 1 WHEN 'normal' THEN 2 WHEN 'no_me_importa' THEN 3 END
    WHEN 'friends_at_home' THEN CASE p_value
        WHEN 'nunca' THEN 1 WHEN 'a_veces' THEN 2 WHEN 'frecuentemente' THEN 3 END
    WHEN 'pet_friendly' THEN CASE p_value
        WHEN 'no' THEN 1 WHEN 'me_gustan' THEN 2 WHEN 'tengo' THEN 3 END
  END;
$$;

-- Puntos de una dimensión: igual = peso entero, vecino = medio peso, resto 0.
-- Misma regla que usaba computeCompatibility en la web (client.tsx:365-373).
CREATE OR REPLACE FUNCTION public.lifestyle_points(a int, b int, w numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL THEN 0
    WHEN a = b                  THEN w
    WHEN abs(a - b) = 1         THEN w / 2
    ELSE 0
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. calculate_compatibility: EL algoritmo (uno solo, el del servidor)
-- ─────────────────────────────────────────────────────────────────────────
-- Pesos idénticos a los que ya usaban web y SQL: 20/20/15/15/10/10/5/5 = 100.
-- Como suman 100 exactos, el resultado YA es el porcentaje.
--
-- Sigue devolviendo un NUMERIC NO NULO (0-100) y sigue siendo SECURITY INVOKER,
-- igual que la 055: la llaman process_swipe_action (119:171, INSERT en
-- roommate_matches.compatibility_score) y varios ORDER BY ... DESC
-- (get_daily_match, get_roomies_filtered), donde un NULL se ordenaría PRIMERO.
-- La versión que puede ser NULL, para la interfaz, es roomie_compatibility().
CREATE OR REPLACE FUNCTION public.calculate_compatibility(user1_id UUID, user2_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    u1 RECORD;
    u2 RECORD;
    s  NUMERIC := 0;
BEGIN
    SELECT smoking::text AS smoking, partying::text AS partying,
           study_habits::text AS study_habits, sleep_schedule::text AS sleep_schedule,
           cleanliness::text AS cleanliness, noise_tolerance::text AS noise_tolerance,
           friends_at_home::text AS friends_at_home, pet_friendly::text AS pet_friendly
      INTO u1 FROM public.profiles WHERE id = user1_id;

    SELECT smoking::text AS smoking, partying::text AS partying,
           study_habits::text AS study_habits, sleep_schedule::text AS sleep_schedule,
           cleanliness::text AS cleanliness, noise_tolerance::text AS noise_tolerance,
           friends_at_home::text AS friends_at_home, pet_friendly::text AS pet_friendly
      INTO u2 FROM public.profiles WHERE id = user2_id;

    IF u1 IS NULL OR u2 IS NULL THEN RETURN 0; END IF;

    s := public.lifestyle_points(public.lifestyle_rank('smoking',         u1.smoking),
                                 public.lifestyle_rank('smoking',         u2.smoking), 20)
       + public.lifestyle_points(public.lifestyle_rank('study_habits',    u1.study_habits),
                                 public.lifestyle_rank('study_habits',    u2.study_habits), 20)
       + public.lifestyle_points(public.lifestyle_rank('sleep_schedule',  u1.sleep_schedule),
                                 public.lifestyle_rank('sleep_schedule',  u2.sleep_schedule), 15)
       + public.lifestyle_points(public.lifestyle_rank('cleanliness',     u1.cleanliness),
                                 public.lifestyle_rank('cleanliness',     u2.cleanliness), 15)
       + public.lifestyle_points(public.lifestyle_rank('partying',        u1.partying),
                                 public.lifestyle_rank('partying',        u2.partying), 10)
       + public.lifestyle_points(public.lifestyle_rank('friends_at_home', u1.friends_at_home),
                                 public.lifestyle_rank('friends_at_home', u2.friends_at_home), 10)
       + public.lifestyle_points(public.lifestyle_rank('noise_tolerance', u1.noise_tolerance),
                                 public.lifestyle_rank('noise_tolerance', u2.noise_tolerance), 5)
       + public.lifestyle_points(public.lifestyle_rank('pet_friendly',    u1.pet_friendly),
                                 public.lifestyle_rank('pet_friendly',    u2.pet_friendly), 5);

    RETURN ROUND(s, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_compatibility(UUID, UUID) IS
  '157: compatibilidad 0-100 con el vocabulario del cuestionario ACTUAL. Pesos '
  '20/20/15/15/10/10/5/5; igual = peso entero, vecino = medio peso. Siempre NO '
  'NULO (la usan process_swipe_action y varios ORDER BY). Para la interfaz, usa '
  'roomie_compatibility(), que devuelve NULL cuando no hay datos que enseñar.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. La versión de interfaz: NULL cuando no hay nada honesto que enseñar
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roomie_compatibility(p_a UUID, p_b UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles x
                  WHERE x.id = p_a AND x.lifestyle_answered_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.profiles y
                  WHERE y.id = p_b AND y.lifestyle_answered_at IS NOT NULL)
    THEN public.calculate_compatibility(p_a, p_b)
  END;
$$;

REVOKE ALL     ON FUNCTION public.roomie_compatibility(UUID, UUID) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.roomie_compatibility(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.roomie_compatibility(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.roomie_compatibility(UUID, UUID) IS
  '157: compatibilidad para enseñar en pantalla. NULL si alguno de los dos no ha '
  'contestado el cuestionario: mejor no dar número que dar uno falso.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC para la WEB: el mismo número que el móvil, en una sola llamada
-- ─────────────────────────────────────────────────────────────────────────
-- La web sigue trayendo el mazo de public_profiles (para la ficha), pero deja
-- de calcular el porcentaje en TypeScript y lo pide aquí.
-- `reason`: 'ok' | 'me' (falta MI cuestionario) | 'them' | 'both'.
CREATE OR REPLACE FUNCTION public.get_roomie_compatibility(p_ids UUID[])
RETURNS TABLE (other_id UUID, compatibility NUMERIC, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_me_ok BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT lifestyle_answered_at IS NOT NULL
      INTO v_me_ok FROM public.profiles WHERE id = v_uid;
    v_me_ok := COALESCE(v_me_ok, false);

    RETURN QUERY
    SELECT p.id,
           CASE WHEN v_me_ok AND p.lifestyle_answered_at IS NOT NULL
                THEN public.calculate_compatibility(v_uid, p.id) END,
           CASE WHEN NOT v_me_ok AND p.lifestyle_answered_at IS NULL THEN 'both'
                WHEN NOT v_me_ok                                     THEN 'me'
                WHEN p.lifestyle_answered_at IS NULL                 THEN 'them'
                ELSE 'ok' END
    FROM public.profiles p
    WHERE p.id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
      AND p.id <> v_uid
      AND COALESCE(p.is_discarded, false) = false
    LIMIT 500;
END;
$$;

REVOKE ALL     ON FUNCTION public.get_roomie_compatibility(UUID[]) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.get_roomie_compatibility(UUID[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_roomie_compatibility(UUID[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. compatibility_score deja de ser obligatorio
-- ─────────────────────────────────────────────────────────────────────────
-- Dar like a alguien cuyo porcentaje no se puede calcular ya no obliga a
-- inventarse un número (la web mandaba un 50 fijo en perfil/[id]/page.tsx).
-- NULL = "no se sabe", que es distinto de 0 %. process_swipe_action sigue
-- guardando el valor de calculate_compatibility, que nunca es NULL.
DO $do$
BEGIN
  IF to_regclass('public.roommate_matches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.roommate_matches ALTER COLUMN compatibility_score DROP NOT NULL';
    RAISE NOTICE '157: roommate_matches.compatibility_score admite NULL.';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar:
--
--   SELECT count(*) FILTER (WHERE lifestyle_answered_at IS NOT NULL) AS contestado,
--          count(*) AS total
--     FROM public.profiles;
--   -- "contestado" debe ser un número PEQUEÑO. Si sale casi el total, el
--   -- predicado no está discriminando y hay que revisarlo antes de seguir.
--
--   SELECT public.calculate_compatibility('<a>', '<b>'),
--          public.roomie_compatibility('<a>', '<b>');
--   -- Con dos perfiles que llevan los defaults de la 006: calculate da un
--   -- número bajo (los valores viejos ya no puntúan) y roomie da NULL.
-- ─────────────────────────────────────────────────────────────────────────
