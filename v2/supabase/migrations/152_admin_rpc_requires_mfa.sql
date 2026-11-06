-- 152_admin_rpc_requires_mfa.sql
--
-- HALLAZGO (auditoría 27-jul-2026): el MFA del panel solo lo exigía la web.
--
-- `web/src/middleware.ts` obliga a AAL2 (segundo factor) para /admin y para
-- /api/admin/**, pero los guards de la base de datos solo miran el ROL:
--
--     _admin_required()        -> is_staff()   -> profiles.role IN (admin, analyst)
--     _admin_write_required()  -> is_admin()   -> profiles.role = 'admin'
--
-- y todas las RPC de administración tienen GRANT EXECUTE TO authenticated.
--
-- Consecuencia: quien consiguiera una sesión de admin con SOLO la contraseña
-- (phishing, sesión robada de un portátil abierto, token sacado del móvil)
-- podía llamar directamente a admin_kpis_summary, admin_users_demographics,
-- admin_set_user_role, admin_fomo_moderate... saltándose por completo el
-- segundo factor. El MFA era una puerta en la web, no en los datos.
--
-- ARREGLO: el segundo factor se exige donde vive el dato. Además, esto es lo
-- que permite abrir el panel en la app móvil sin rebajar la seguridad: la app
-- tendrá que elevar la sesión a aal2 igual que la web.
--
-- Contextos exentos (a propósito): service_role (webhooks, rutas de servidor
-- con la clave de servicio) y conexiones directas sin JWT (migraciones, cron,
-- editor SQL). Solo se exige a los JWT de usuario final.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.

-- ─────────────────────────────────────────────────────
-- 1. Guard de segundo factor
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._aal2_required()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role   text  := COALESCE(v_claims ->> 'role', '');
    v_aal    text  := COALESCE(v_claims ->> 'aal', '');
BEGIN
    -- Solo aplica a sesiones de usuario final. service_role y las conexiones
    -- sin JWT (cron, migraciones, editor SQL) pasan.
    IF v_role <> 'authenticated' THEN
        RETURN;
    END IF;

    IF v_aal <> 'aal2' THEN
        RAISE EXCEPTION 'mfa_required'
            USING HINT = 'Verifica el segundo factor para operar en el panel.';
    END IF;
END;
$$;

COMMENT ON FUNCTION public._aal2_required() IS
    'Exige AAL2 (segundo factor verificado) a las sesiones de usuario final. '
    'service_role y conexiones sin JWT quedan exentas. Lo usan los guards del panel.';

-- ─────────────────────────────────────────────────────
-- 2. Los guards del panel pasan a exigirlo
--    Cuerpos idénticos a la 110 salvo la llamada nueva.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._admin_required()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'forbidden' USING HINT = 'admin or analyst role required';
    END IF;
    PERFORM public._aal2_required();
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_write_required()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING HINT = 'admin role required';
    END IF;
    PERFORM public._aal2_required();
END;
$$;

-- ─────────────────────────────────────────────────────
-- 3. Aviso operativo
-- ─────────────────────────────────────────────────────
-- A partir de aquí, un admin SIN segundo factor inscrito no puede usar las RPC
-- del panel. No supone quedarse fuera: /perfil/seguridad permite inscribirlo,
-- y esa pantalla no pasa por estos guards. El middleware ya obligaba de facto
-- a tener MFA para entrar en /admin, así que en la práctica ya lo tienen todos.
