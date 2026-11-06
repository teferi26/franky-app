-- ═══════════════════════════════════════════════════════════════════════════
-- 149: El token de verificación de estudiante ya no baja al cliente
--
-- AGUJERO REAL (auditoría 24-jul): request_student_email_verification (025)
-- DEVUELVE el token al llamante y está concedida a `authenticated`. Cualquier
-- usuario podía llamarla desde la consola del navegador con un correo @uni
-- ajeno, recibir el token y confirmarse el distintivo SIN acceso al buzón.
-- El distintivo de "estudiante verificado" no valdría nada.
--
-- Arreglo:
--   1. La función de cara al usuario pasa a devolver SOLO (email, expires_at):
--      registra la solicitud pero el token no sale de la base de datos.
--   2. Una función nueva para el SERVIDOR (service_role únicamente) genera y
--      devuelve el token para que el endpoint web lo mande por correo:
--      request_student_email_verification_admin(p_user_id, p_email).
--   3. confirm_student_email queda igual (el token ES la credencial y solo lo
--      tiene quien recibió el correo).
--
-- El endpoint web /api/auth/student-verification pasa a usar la variante
-- admin con el cliente service_role (cambio en la web, mismo despliegue).
--
-- Idempotente. OJO: cambia el tipo de retorno de la función pública, así que
-- hay que DROPearla antes de recrearla (CREATE OR REPLACE no permite cambiar
-- el RETURNS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. Variante pública SIN token en el retorno
-- ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.request_student_email_verification(TEXT);

CREATE FUNCTION public.request_student_email_verification(p_email TEXT)
RETURNS TABLE (email TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_email   TEXT := lower(trim(p_email));
  v_domain  TEXT;
  v_token   TEXT;
  v_expires TIMESTAMPTZ := now() + INTERVAL '24 hours';
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  v_domain := public._email_domain(v_email);

  IF NOT EXISTS (SELECT 1 FROM public.student_email_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'unsupported_domain' USING HINT = v_domain;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE student_email_verified = true
      AND lower(student_email) = v_email
      AND id <> v_me
  ) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  UPDATE public.student_email_verifications
     SET used_at = now()
   WHERE user_id = v_me AND used_at IS NULL;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.student_email_verifications (user_id, email, token, expires_at)
  VALUES (v_me, v_email, v_token, v_expires);

  UPDATE public.profiles
     SET student_email = v_email,
         student_email_verified = CASE
           WHEN lower(student_email) = v_email THEN student_email_verified
           ELSE false
         END,
         student_email_verified_at = CASE
           WHEN lower(student_email) = v_email THEN student_email_verified_at
           ELSE NULL
         END
   WHERE id = v_me;

  -- 149: el token se queda en la tabla. Al cliente solo le llega a dónde se
  -- envió y hasta cuándo vale. El correo lo manda el servidor.
  RETURN QUERY SELECT v_email, v_expires;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_student_email_verification(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 2. Variante de SERVIDOR: genera y devuelve el token
-- ─────────────────────────────────────────────────────
-- Solo service_role (el endpoint web autentica al usuario por su sesión y
-- llama aquí con su user_id para poder enviar el correo con el enlace).
CREATE OR REPLACE FUNCTION public.request_student_email_verification_admin(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS TABLE (token TEXT, email TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_domain  TEXT;
  v_token   TEXT;
  v_expires TIMESTAMPTZ := now() + INTERVAL '24 hours';
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_user'; END IF;
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  v_domain := public._email_domain(v_email);

  IF NOT EXISTS (SELECT 1 FROM public.student_email_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'unsupported_domain' USING HINT = v_domain;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE student_email_verified = true
      AND lower(student_email) = v_email
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  UPDATE public.student_email_verifications
     SET used_at = now()
   WHERE user_id = p_user_id AND used_at IS NULL;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.student_email_verifications (user_id, email, token, expires_at)
  VALUES (p_user_id, v_email, v_token, v_expires);

  UPDATE public.profiles
     SET student_email = v_email,
         student_email_verified = CASE
           WHEN lower(student_email) = v_email THEN student_email_verified
           ELSE false
         END,
         student_email_verified_at = CASE
           WHEN lower(student_email) = v_email THEN student_email_verified_at
           ELSE NULL
         END
   WHERE id = p_user_id;

  RETURN QUERY SELECT v_token, v_email, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.request_student_email_verification_admin(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_student_email_verification_admin(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.request_student_email_verification_admin(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_student_email_verification_admin(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
