-- =====================================================
-- 141: Verificación de email DIFERIDA
-- =====================================================
-- Contexto:
--   /api/auth/signup crea las cuentas con `email_confirm: true` (service role)
--   y nadie verifica nunca el correo. Se hizo así porque el SMTP integrado de
--   Supabase estaba limitado a ~2 emails/hora y el round-trip mataba el embudo
--   de Instagram/TikTok. El motivo ya no aplica: Resend está integrado.
--
--   Consecuencias de no verificar nada, hoy:
--     * Los emails de actividad rebotan y queman la reputación del dominio.
--     * Si alguien teclea mal su correo, NO puede recuperar la contraseña
--       nunca: cuenta perdida y sin soporte posible.
--     * Cuentas basura con correos inventados (solo frenadas por 10/hora/IP).
--
-- Diseño elegido: verificación DIFERIDA, no bloqueante.
--   El usuario entra al instante igual que ahora (no se toca la conversión),
--   recibe el correo, y la verificación solo se exige para acciones sensibles
--   (publicar en FOMO, entrar en Crush, chatear, pagar). Se gana lo uno sin
--   perder lo otro.
--
-- Esta migración solo aporta el ALMACÉN y las funciones. Qué acciones exigen
-- verificación se decide en la app, para poder subir el listón poco a poco.

-- ─────────────────────────────────────────────────────
-- 1. Marca en el perfil
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.email_verified_at IS
'Momento en que el usuario confirmo su email mediante el enlace de verificacion propio (Resend). NULL = sin verificar. Independiente de auth.users.email_confirmed_at, que /api/auth/signup marca a true de oficio para no bloquear el alta.';

-- Las cuentas creadas por OAuth (Google) llegan con el correo ya validado por
-- el proveedor: no tiene sentido pedirles que lo verifiquen otra vez.
UPDATE public.profiles p
   SET email_verified_at = COALESCE(p.email_verified_at, u.created_at)
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email_verified_at IS NULL
   AND u.raw_app_meta_data->>'provider' IS DISTINCT FROM 'email';

-- ─────────────────────────────────────────────────────
-- 2. Tokens de verificación
-- ─────────────────────────────────────────────────────
-- Se guarda solo el SHA-256 del token, nunca el token en claro: si alguien
-- consigue leer la tabla, no puede verificar cuentas ajenas con lo que ve.
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
    token_hash  TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user
    ON public.email_verification_tokens (user_id, created_at DESC);

ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Sin políticas a propósito: RLS activada y cero policies significa que ni
-- `anon` ni `authenticated` pueden leer o escribir NADA. Solo el service role
-- (que salta RLS) toca esta tabla, desde /api/auth/**.
REVOKE ALL ON public.email_verification_tokens FROM anon, authenticated;

COMMENT ON TABLE public.email_verification_tokens IS
'Tokens de verificacion de email (hash SHA-256, nunca el token en claro). Sin policies RLS a proposito: acceso exclusivo del service role desde /api/auth/**.';

-- ─────────────────────────────────────────────────────
-- 3. Helper para la app: ¿este usuario tiene el email verificado?
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_email_verified(p_user UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = COALESCE(p_user, auth.uid())
           AND email_verified_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_email_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_verified(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 4. Limpieza de tokens caducados
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_expired_email_tokens()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM public.email_verification_tokens
     WHERE expires_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_email_tokens() FROM PUBLIC;
