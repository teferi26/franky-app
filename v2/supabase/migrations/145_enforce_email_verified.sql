-- =====================================================
-- 145: El email verificado pasa a EXIGIRSE para publicar
-- =====================================================
-- La 141 dejó la infraestructura (email_verified_at, tokens, emails por
-- Resend) y la revisión de seguridad pre-push marcó como pendiente (M1) que
-- nada la exigía todavía: una cuenta con correo inventado podía publicar en
-- el muro de una universidad igual que una real.
--
-- Diseño elegido: TRIGGER en las tablas, no parche de cada RPC.
--   * El chat inserta directo en `messages` desde el cliente (sin RPC): un
--     trigger es la única forma de cubrirlo centralizadamente.
--   * Un trigger sobrevive a futuras redefiniciones de create_fomo_thread y
--     compañía (que ya van por la tercera versión), y cubre también cualquier
--     insert directo que la RLS permita.
--
-- CLÁUSULA DE ANTIGÜEDAD (importante): solo se exige a las cuentas creadas a
-- partir del 25-jul-2026. Las anteriores NUNCA recibieron el correo de
-- verificación (no existía), así que bloquearlas sería expulsar de golpe a
-- toda la base de usuarios activa. Las cuentas de Google ya quedaron marcadas
-- como verificadas por la 141.
--
-- El mensaje de error va en castellano y auto-explicativo a propósito: la app
-- móvil muestra el error crudo de la RPC y tiene que entenderse igual.

CREATE OR REPLACE FUNCTION public.enforce_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_verified TIMESTAMPTZ;
    v_created  TIMESTAMPTZ;
BEGIN
    -- Sin JWT (service role, seeds, jobs internos): no aplica.
    IF v_uid IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT email_verified_at, created_at
      INTO v_verified, v_created
      FROM public.profiles
     WHERE id = v_uid;

    -- Perfil inexistente (no debería pasar con RLS): que decida la RLS, no esto.
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF v_verified IS NULL AND v_created >= TIMESTAMPTZ '2026-07-25 00:00:00+02' THEN
        RAISE EXCEPTION
          'Confirma tu email para poder publicar. Te enviamos el enlace al crear la cuenta; puedes reenviarlo desde tu perfil.'
          USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_email_verified() IS
'Trigger BEFORE INSERT: bloquea publicar (FOMO, Crush, chat, mercado, comunidades) a cuentas creadas desde el 25-jul-2026 que no hayan confirmado su email (141). Cuentas anteriores y contextos sin JWT quedan exentos.';

-- Los triggers se crean SOLO sobre las tablas que existan en este entorno
-- (guard con to_regclass, el mismo patrón que ya usan otros guards de prod).
-- Motivo real: al aplicar esta migración en producción falló con
-- "community_posts does not exist" — la 138 no estaba aplicada allí aunque el
-- registro decía lo contrario. Con el guard, la migración entra limpia hoy y,
-- si la tabla aparece después, basta con RELANZARLA (es idempotente) para que
-- el trigger se enganche.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'fomo_threads',      -- FOMO: hilos
    'fomo_replies',      -- FOMO: respuestas
    'ligar_posts',       -- Crush (muro de ligar)
    'messages',          -- Chat (insert directo desde el cliente)
    'student_listings',  -- Mercado (migración 137)
    'community_posts'    -- Comunidades (migración 138)
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_verified_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_verified_%I BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified()',
        t, t
      );
      RAISE NOTICE 'gate de email verificado activo en %', t;
    ELSE
      RAISE NOTICE 'tabla % no existe en este entorno: trigger omitido (aplica su migración y relanza la 145)', t;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
