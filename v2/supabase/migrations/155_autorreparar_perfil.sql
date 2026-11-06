-- 155_autorreparar_perfil.sql
--
-- MOTIVO (27-jul-2026): un usuario entró a la app y se la encontró rota sin
-- ningún mensaje. Su cuenta existía, pero su fila de public.profiles no. Sin
-- esa fila:
--   * no hay nombre  -> la app pinta la etiqueta por defecto ("student")
--   * no hay foto
--   * al guardar, el UPDATE afecta a CERO filas: no da error, simplemente no
--     cambia nada, por muchas veces que se intente
--
-- Había 44 cuentas en ese estado. El fallo silencioso es lo peor de todo: el
-- usuario no puede entender qué pasa ni reportarlo bien, y desde fuera parece
-- que la app "no va".
--
-- ARREGLO: una función que el cliente llama al arrancar. Si el perfil existe,
-- no hace nada (es barata y se puede llamar siempre). Si falta, lo reconstruye
-- desde los metadatos de la cuenta, igual que haría handle_new_user en un alta
-- normal.
--
-- Seguridad: SECURITY DEFINER porque necesita leer auth.users, pero SOLO actúa
-- sobre auth.uid(). No acepta ningún parámetro, así que no hay forma de pedir
-- que toque la fila de otro.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS TABLE (creado BOOLEAN, full_name TEXT, avatar_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_u    RECORD;
    v_prov TEXT;
    v_ext  BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;

    -- Camino normal: ya existe. Se devuelve sin escribir nada.
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid) THEN
        RETURN QUERY
            SELECT false, p.full_name, p.avatar_url
              FROM public.profiles p WHERE p.id = v_uid;
        RETURN;
    END IF;

    SELECT u.id, u.email, u.created_at, u.raw_user_meta_data, u.raw_app_meta_data
      INTO v_u
      FROM auth.users u
     WHERE u.id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    v_prov := v_u.raw_app_meta_data->>'provider';
    v_ext  := v_prov IS NOT NULL AND v_prov <> 'email';

    INSERT INTO public.profiles (
        id, email, full_name, avatar_url, email_verified_at,
        onboarding_completed, created_at
    )
    VALUES (
        v_u.id,
        v_u.email,
        COALESCE(v_u.raw_user_meta_data->>'full_name',
                 v_u.raw_user_meta_data->>'name',
                 split_part(v_u.email, '@', 1)),
        -- Google entrega la foto en 'picture'; otros usan 'avatar_url'.
        COALESCE(v_u.raw_user_meta_data->>'avatar_url',
                 v_u.raw_user_meta_data->>'picture'),
        -- Proveedor externo = buzón ya verificado por él (mismo criterio que
        -- la migración 154).
        CASE WHEN v_ext THEN NOW() ELSE NULL END,
        false,
        -- La fecha REAL del alta, no la de la reparación: el trigger
        -- enforce_email_verified (145) solo exige email confirmado a las
        -- cuentas creadas desde el 25-jul-2026, y poner la de hoy dejaría a un
        -- usuario antiguo igual de bloqueado, cambiando un problema por otro.
        v_u.created_at
    )
    ON CONFLICT (id) DO NOTHING;   -- carrera entre dos arranques a la vez

    RETURN QUERY
        SELECT true, p.full_name, p.avatar_url
          FROM public.profiles p WHERE p.id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

COMMENT ON FUNCTION public.ensure_my_profile() IS
    'Crea la fila de profiles del usuario actual si falta, desde los metadatos '
    'de auth. No-op si ya existe. Solo actua sobre auth.uid(): no admite '
    'parametros y no puede tocar el perfil de otro.';
