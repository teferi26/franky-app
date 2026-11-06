-- =====================================================================
-- 20260924201000_age_gate.sql
-- Puerta de edad: 18 años en Crush y 14 años como mínimo en el perfil.
--
-- NO APLICADA. Revisar y aplicar a mano en producción.
--
-- A. public.is_adult() vuelve a 18 años.
--    La migración 098_crush_age_16_temp.sql bajó "TEMPORALMENTE" el listón a
--    16 años y nunca se revirtió (es la última definición del repo). La web,
--    la app y los términos dicen "solo mayores de 18". is_adult() es el gate
--    central de Crush y ya lo llaman, con su definición vigente:
--      - get_ligar_profile / set_ligar_profile (082): campo 'eligible' y alta.
--      - nominaciones (084) y verificación de Instagram (096).
--      - Crush de la fiesta (20260906114835, 20260906190000).
--      - Muro y solicitudes de Crush (20260910112130).
--      - Moderación de comunidad (20260920194123).
--    Crush Live no usa is_adult(): tiene su propio gate de 18 años en
--    private.crush_live_is_eligible (20260902081139), que no se toca.
--    Por eso basta con restaurar el helper: todas esas RPC pasan a exigir 18
--    sin reescribirlas. Además, una fecha futura o de hace más de 100 años
--    ya no cuenta como mayor de edad.
--
-- B. Edad mínima de cuenta (14 años, art. 7 LOPDGDD) en servidor.
--    Trigger BEFORE INSERT/UPDATE en profiles que rechaza una birth_date de
--    alguien menor de 14 años o una fecha futura. Solo actúa cuando la fecha
--    se escribe o cambia: los perfiles antiguos con fechas raras no quedan
--    bloqueados para otras actualizaciones. No hay CHECK constraint a
--    propósito: validaría todas las filas existentes y podría fallar.
--
-- Efecto esperado tras aplicar: quien tenga entre 16 y 17 años y hubiera
-- activado Crush deja de verlo y de aparecer (is_adult = false). Sus filas no
-- se borran.
-- =====================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── A. is_adult: 18 años cumplidos ────────────────────────────────────
-- Misma firma, lenguaje y seguridad que 082/098 (CREATE OR REPLACE conserva
-- los GRANT existentes).
CREATE OR REPLACE FUNCTION public.is_adult(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE(
        (SELECT birth_date IS NOT NULL
                AND birth_date <= (CURRENT_DATE - INTERVAL '18 years')
                AND birth_date >  (CURRENT_DATE - INTERVAL '100 years')
         FROM public.profiles WHERE id = p_user),
        false
    );
$$;

COMMENT ON FUNCTION public.is_adult(UUID) IS
    'Gate de edad de Crush: true solo si el perfil tiene birth_date y ha cumplido 18 años. '
    'Restaurado a 18 en 20260924201000_age_gate (098 lo había bajado a 16 temporalmente).';

-- ── B. Edad mínima de cuenta: 14 años ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_profile_min_age()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.birth_date IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.birth_date IS NOT DISTINCT FROM OLD.birth_date THEN
        RETURN NEW;
    END IF;
    IF NEW.birth_date > CURRENT_DATE
       OR NEW.birth_date <= (CURRENT_DATE - INTERVAL '120 years') THEN
        RAISE EXCEPTION 'birth_date_invalid' USING ERRCODE = '22023';
    END IF;
    IF NEW.birth_date > (CURRENT_DATE - INTERVAL '14 years') THEN
        RAISE EXCEPTION 'birth_date_under_min_age' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_min_age() FROM PUBLIC;

DROP TRIGGER IF EXISTS b_enforce_profile_min_age ON public.profiles;
CREATE TRIGGER b_enforce_profile_min_age
    BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_min_age();

COMMIT;

-- ── Verificación manual tras aplicar ─────────────────────────────────
-- SELECT pg_get_functiondef('public.is_adult(uuid)'::regprocedure);
--   -> debe contener INTERVAL '18 years'.
-- SELECT count(*) FROM public.profiles
--  WHERE ligar_opted_in AND birth_date > CURRENT_DATE - INTERVAL '18 years';
--   -> participantes de Crush que dejan de ser elegibles (informativo).
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
--  AND tgname = 'b_enforce_profile_min_age';
