-- 101_security_incident_lockdown.sql
-- =====================================================================
-- WAVE S-INCIDENT — 2026-06-03
-- Cierra el incidente de seguridad: dump anónimo de perfiles (F07),
-- escalada de privilegios, auto-concesión de premium / verificación IG,
-- suscripción "gratis", aceptación unilateral de amistades, y lectura
-- de datos privados (cache de compatibilidad + RPCs de tenencia anónimas).
--
-- ⚠️  ESTO NO ARREGLA LA FUGA DE CREDENCIALES.
--     El password de la BD (`***ROTADO***`) y la service_role key estaban
--     hardcodeados en ~30 ficheros .cjs y en el historial de git. Quien
--     tenga esas claves salta TODA la RLS de aquí. PRIMERO rota las claves
--     en el panel de Supabase, LUEGO aplica esta migración con las nuevas.
--     Ver docs/security/incidents/2026-06-03-credential-leak-and-rls-dump.md
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. [P0] public_profiles: cortar la lectura ANÓNIMA (el "F07 / lectura privada")
-- ---------------------------------------------------------------------
-- La vista es security_invoker=false A PROPÓSITO: proyecta columnas no-PII
-- para que CUALQUIER usuario autenticado vea la lista social (matching,
-- roomies, chat). El fallo es que el rol `anon` TAMBIÉN podía leerla porque
-- los default privileges de Supabase conceden SELECT a anon sobre objetos
-- creados por `postgres`. Resultado: dump completo sin necesidad de login.
--
-- NO ponemos security_invoker=true: eso aplicaría la RLS de `profiles`
-- (que tras 040 es "solo tu propia fila + admin") y cada usuario solo se
-- vería a SÍ MISMO -> rompería matching/roomies/chat. La solución correcta
-- es revocar a anon/PUBLIC y dejar SOLO a authenticated.
REVOKE ALL    ON public.public_profiles FROM anon;
REVOKE ALL    ON public.public_profiles FROM PUBLIC;
GRANT  SELECT ON public.public_profiles TO   authenticated;

-- profiles_decrypted ya es security_invoker=true (aplica la RLS del caller),
-- pero por defensa en profundidad le quitamos cualquier acceso de anon.
REVOKE ALL    ON public.profiles_decrypted FROM anon;
REVOKE ALL    ON public.profiles_decrypted FROM PUBLIC;
GRANT  SELECT ON public.profiles_decrypted TO   authenticated;

-- ---------------------------------------------------------------------
-- 2. [P0] profiles UPDATE: prohibir que el usuario se auto-asigne columnas
--    privilegiadas (premium gratis, verificación IG falsa, quitarse strikes,
--    levantarse la cuarentena, fingir email de estudiante verificado).
--    Mantiene el patrón ya existente de 010 (comparar NEW vs valor actual).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role                   =                 (SELECT role                   FROM public.profiles WHERE id = auth.uid())
        AND strikes_count          =                 (SELECT strikes_count          FROM public.profiles WHERE id = auth.uid())
        AND is_discarded           =                 (SELECT is_discarded           FROM public.profiles WHERE id = auth.uid())
        AND is_premium             IS NOT DISTINCT FROM (SELECT is_premium             FROM public.profiles WHERE id = auth.uid())
        AND instagram_verified     IS NOT DISTINCT FROM (SELECT instagram_verified     FROM public.profiles WHERE id = auth.uid())
        AND ig_quarantined         IS NOT DISTINCT FROM (SELECT ig_quarantined         FROM public.profiles WHERE id = auth.uid())
        AND student_email_verified IS NOT DISTINCT FROM (SELECT student_email_verified FROM public.profiles WHERE id = auth.uid())
    );

-- ---------------------------------------------------------------------
-- 3. [P0] Backstop anti-escalada a nivel de TRIGGER (defensa en profundidad).
--    Aunque una RPC SECURITY DEFINER (que salta la RLS) tuviera un fallo e
--    intentara cambiar el rol / premium del usuario que la invoca, este
--    trigger lo neutraliza. Solo admin, service_role o una conexión backend
--    directa (sin JWT de usuario) pueden tocar role / is_premium / strikes.
--    NOTA: esto NO frena a quien tenga la service_role key robada -> por eso
--    rotar las claves es el paso #1, no opcional.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
    -- "usuario final" = autenticado normal (ni admin, ni service_role,
    -- ni conexión backend directa sin claims JWT).
    v_is_end_user boolean := (v_uid IS NOT NULL
                              AND v_jwt_role = 'authenticated'
                              AND NOT public.is_admin());
BEGIN
    IF v_is_end_user THEN
        IF TG_OP = 'INSERT' THEN
            NEW.role          := 'user';   -- nadie nace admin
            NEW.is_premium    := false;
            NEW.strikes_count := 0;
        ELSE  -- UPDATE
            NEW.role          := OLD.role;
            NEW.is_premium    := OLD.is_premium;
            NEW.strikes_count := OLD.strikes_count;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_privilege_guard ON public.profiles;
CREATE TRIGGER trg_profile_privilege_guard
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_guard();

-- ---------------------------------------------------------------------
-- 4. [P0] business_subscriptions: el usuario solo puede crear filas
--    'incomplete'. La ACTIVACIÓN (status='active' + current_period_end)
--    la hace EXCLUSIVAMENTE el webhook de Stripe vía service_role (salta RLS).
--    (No existe policy UPDATE para authenticated -> tampoco pueden auto-activar.)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners insert own business subs" ON public.business_subscriptions;
CREATE POLICY "Owners insert own business subs"
    ON public.business_subscriptions FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = owner_id
        AND status = 'incomplete'
        AND current_period_end IS NULL
        AND stripe_subscription_id IS NULL
    );

-- ---------------------------------------------------------------------
-- 5. [P1] friendships: no más amistades unilaterales.
--    INSERT solo en 'pending'; el que ENVÍA la solicitud no puede auto-aceptarla
--    (solo la otra parte pone 'accepted').
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "friendships_insert_requester" ON public.friendships;
CREATE POLICY "friendships_insert_requester" ON public.friendships
    FOR INSERT TO authenticated
    WITH CHECK (
        requested_by = auth.uid()
        AND (auth.uid() = user_a_id OR auth.uid() = user_b_id)
        AND status = 'pending'
    );

DROP POLICY IF EXISTS "friendships_update_participants" ON public.friendships;
CREATE POLICY "friendships_update_participants" ON public.friendships
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    WITH CHECK (
        (auth.uid() = user_a_id OR auth.uid() = user_b_id)
        -- el solicitante NO puede marcar 'accepted'; sí puede declinar/cancelar
        AND (status <> 'accepted' OR requested_by <> auth.uid())
    );

-- ---------------------------------------------------------------------
-- 6. [P1] compatibility_cache: no tenía RLS -> cualquiera leía/poison-eaba
--    los scores de compatibilidad de TODOS los pares. La función de acceso
--    cached_compatibility() es SECURITY DEFINER, así que sigue funcionando.
-- ---------------------------------------------------------------------
ALTER TABLE public.compatibility_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compat_cache_read_participant" ON public.compatibility_cache;
CREATE POLICY "compat_cache_read_participant" ON public.compatibility_cache
    FOR SELECT TO authenticated
    USING (auth.uid() = user_a OR auth.uid() = user_b);
-- (Sin policies de INSERT/UPDATE/DELETE para authenticated: las escrituras
--  solo ocurren dentro de cached_compatibility(), que corre como owner.)

-- ---------------------------------------------------------------------
-- 7. [P1] RPCs de tenencia: NO deben ser invocables por anónimos.
--    Mapeaban nombre real -> dirección/piso de un usuario sin login.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_flat_public_residents(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_tenancy_for(UUID)    FROM anon;
-- (authenticated conserva el EXECUTE concedido en 086.)

-- ---------------------------------------------------------------------
-- 8. [P1] recover_my_account(): un usuario BANEADO (3 strikes / admin) podía
--    auto-recuperarse. Ahora solo se recuperan cuentas que el propio usuario
--    borró (self_deleted = true). Añadimos search_path explícito.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recover_my_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    UPDATE public.profiles
    SET is_discarded = false
    WHERE id = v_uid
      AND is_discarded = true
      AND self_deleted = true;   -- los baneos de moderación NO se auto-recuperan
    RETURN FOUND;
END;
$$;

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (ejecutar manualmente tras aplicar; deben CUMPLIRSE todas)
-- =====================================================================
-- Como anónimo (clave anon, sin sesión):
--   GET /rest/v1/public_profiles            -> 401/permission denied (ya NO dumpea)
--   SELECT public.get_public_tenancy_for('<uuid>')  -> permission denied
--
-- Como usuario autenticado normal (NO admin):
--   UPDATE public.profiles SET role='admin'           WHERE id = auth.uid();  -> 0 filas / sin efecto en role
--   UPDATE public.profiles SET is_premium=true         WHERE id = auth.uid();  -> sin efecto
--   UPDATE public.profiles SET instagram_verified=true WHERE id = auth.uid();  -> sin efecto
--   INSERT INTO public.business_subscriptions(owner_id,type,status,current_period_end)
--          VALUES (auth.uid(),'leisure','active','2099-01-01');                -> violates RLS / rechazado
--   UPDATE public.friendships SET status='accepted'
--          WHERE requested_by = auth.uid();                                    -> violates RLS
--   SELECT * FROM public.compatibility_cache;                                  -> solo filas propias
--   SELECT * FROM public.public_profiles LIMIT 5;                              -> SIGUE funcionando (matching ok)
-- =====================================================================
