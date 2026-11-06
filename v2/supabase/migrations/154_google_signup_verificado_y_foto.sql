-- 154_google_signup_verificado_y_foto.sql
--
-- INCIDENCIA (27-jul-2026): un usuario prueba la app, entra con Google y no
-- puede hacer nada. No le sale el nombre, no puede subir foto y la app le
-- muestra la etiqueta por defecto "student".
--
-- Al mirarlo, no era un caso aislado: en los últimos 4 días, de 40 altas por
-- Google, las 40 estaban SIN verificar. Y desde el 25-jul la migración 145
-- exige email verificado para publicar en FOMO, Crush, chat, mercado y
-- comunidades. O sea: TODOS los usuarios nuevos de Google llevan días sin
-- poder usar el producto, y el error que ven es una excepción de la RPC.
--
-- CAUSA RAÍZ
-- La migración 141 marcó como verificadas las cuentas de proveedores externos
-- (141:37-41), pero fue un relleno DE UNA SOLA VEZ: nunca se tocó
-- handle_new_user, que sigue siendo el de la 033. Así que cada cuenta de
-- Google creada DESPUÉS de la 141 nace con email_verified_at a NULL, para
-- siempre, sin forma de arreglarlo desde la app (el correo de verificación
-- solo se manda en el alta por email/contraseña).
--
-- Segundo fallo, misma función: la foto. handle_new_user lee
-- raw_user_meta_data->>'avatar_url', pero Google entrega la foto en 'picture'.
-- Por eso las altas de Google recientes no tienen avatar.
--
-- CRITERIO: el email de una cuenta de Google ya lo ha verificado Google. Darlo
-- por verificado no rebaja la seguridad; lo que la rebajaba era dejar entrar a
-- gente que luego no puede usar nada.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.

-- ─────────────────────────────────────────────────────
-- 1. handle_new_user: verificado + foto para altas externas
--    Cuerpo idéntico al de la 033 salvo esas dos columnas.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    -- 'email' = alta con contraseña (esa SÍ debe verificar por correo).
    -- Cualquier otro proveedor (google, apple...) ya ha comprobado el buzón.
    v_proveedor TEXT := NEW.raw_app_meta_data->>'provider';
    v_externo   BOOLEAN := v_proveedor IS NOT NULL AND v_proveedor <> 'email';
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        avatar_url,
        email_verified_at,
        onboarding_completed,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        signup_referrer,
        signup_landing_path
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name',
                 NEW.raw_user_meta_data->>'name',
                 split_part(NEW.email, '@', 1)),
        -- Google manda la foto en 'picture'; 'avatar_url' solo lo rellenan
        -- algunos proveedores. Se prueban los dos antes de rendirse.
        COALESCE(NEW.raw_user_meta_data->>'avatar_url',
                 NEW.raw_user_meta_data->>'picture'),
        CASE WHEN v_externo THEN NOW() ELSE NULL END,
        false,
        NULLIF(NEW.raw_user_meta_data->>'utm_source', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_medium', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_campaign', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_content', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_term', ''),
        NULLIF(NEW.raw_user_meta_data->>'signup_referrer', ''),
        NULLIF(NEW.raw_user_meta_data->>'signup_landing_path', '')
    );

    INSERT INTO public.user_presence (user_id, status, last_seen)
    VALUES (NEW.id, 'online', NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────
-- 2. Desbloquear a los que ya entraron
--    Mismo criterio que el relleno de la 141, pero ahora también arregla la
--    foto que se perdió por leer la clave equivocada.
-- ─────────────────────────────────────────────────────
UPDATE public.profiles p
   SET email_verified_at = COALESCE(p.email_verified_at, u.created_at)
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email_verified_at IS NULL
   AND u.raw_app_meta_data->>'provider' IS DISTINCT FROM 'email';

UPDATE public.profiles p
   SET avatar_url = COALESCE(u.raw_user_meta_data->>'avatar_url',
                             u.raw_user_meta_data->>'picture')
  FROM auth.users u
 WHERE u.id = p.id
   AND p.avatar_url IS NULL
   AND COALESCE(u.raw_user_meta_data->>'avatar_url',
                u.raw_user_meta_data->>'picture') IS NOT NULL;

-- Y el nombre, para los que se quedaron con el trozo del email o sin nada.
UPDATE public.profiles p
   SET full_name = COALESCE(u.raw_user_meta_data->>'full_name',
                            u.raw_user_meta_data->>'name')
  FROM auth.users u
 WHERE u.id = p.id
   AND (p.full_name IS NULL OR btrim(p.full_name) = '')
   AND COALESCE(u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name') IS NOT NULL;

COMMENT ON FUNCTION public.handle_new_user() IS
    'Crea el perfil al registrarse. Las altas por proveedor externo (Google) '
    'nacen con email_verified_at puesto: Google ya verifica el buzon. Las de '
    'email/contrasena quedan a NULL hasta que el usuario pulse el enlace.';
