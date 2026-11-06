-- =====================================================
-- 167: lo que la gente escribe llega al equipo, siempre
-- =====================================================
--
-- LO QUE PASABA
--
-- Nada de lo que mandaba un usuario llegaba a ninguna parte:
--
--   · El formulario de /contacto era `<form action="mailto:contacto@franky.es">`.
--     Los navegadores modernos no hacen nada útil con eso: o lo ignoran, o
--     intentan abrir un cliente de correo que la mayoría no tiene configurado.
--     Todo lo que se escribía ahí se perdía sin dejar rastro.
--   · Las denuncias (user_reports) y las sugerencias de locales
--     (leisure_spot_suggestions) sí se guardaban, pero NO avisaban a nadie: solo
--     se veían entrando al panel de admin y mirando la pestaña correspondiente.
--
-- Resultado: la plataforma no tenía buzón. Esta migración se lo pone.
--
-- CÓMO FUNCIONA
--
--   1. platform_messages: el buzón. Ahí caen los mensajes de contacto,
--      sugerencias y avisos de fallos, desde la web o desde la app.
--   2. dispatch_staff_alert(): igual que dispatch_email de la 090 (pg_net +
--      app_settings), pero llamando a /api/internal/notify-staff, que manda el
--      correo a TODAS las cuentas con rol admin o analyst.
--   3. Triggers en platform_messages, user_reports y leisure_spot_suggestions.
--
-- POR QUÉ EL AVISO SE DISPARA EN LA BASE DE DATOS Y NO EN LA RUTA WEB
--
-- Porque las denuncias se insertan DIRECTAMENTE desde el cliente (la app móvil
-- lo hace así en el chat y en el perfil, sin pasar por ninguna ruta de Next).
-- Un aviso que viviera solo en /api/reports se saltaría todas esas. El único
-- sitio por el que pasan todas las escrituras es aquí.
--
-- Los triggers son AFTER INSERT y se tragan cualquier error: si el correo no se
-- puede enviar, la denuncia o el mensaje se guardan igual. Perder el aviso es
-- malo; perder el dato es peor.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. ¿Quién es "el equipo"?
-- ---------------------------------------------------------------
-- La 110 creó el rol 'analyst' junto a 'admin' pero no dejó una función que
-- diga "es del equipo". is_admin() se queda corta: el analista también tiene
-- que enterarse de lo que entra.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.role IN ('admin', 'analyst')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

COMMENT ON FUNCTION public.is_staff() IS
  '167: TRUE si quien llama es del equipo (admin o analyst). is_admin() deja '
  'fuera al analista, que también tiene que ver lo que entra por el buzón.';

-- ---------------------------------------------------------------
-- 2. El buzón
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable: /contacto es público, se puede escribir sin tener cuenta.
    user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL DEFAULT 'contacto'
               CHECK (kind IN ('contacto', 'sugerencia', 'fallo', 'otro')),
    name       TEXT,
    email      TEXT,
    subject    TEXT,
    body       TEXT NOT NULL CHECK (length(btrim(body)) > 0),
    source     TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'movil', 'otro')),
    status     TEXT NOT NULL DEFAULT 'nuevo'
               CHECK (status IN ('nuevo', 'leido', 'resuelto', 'descartado')),
    handled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_messages_nuevos
  ON public.platform_messages(created_at DESC) WHERE status = 'nuevo';

COMMENT ON TABLE public.platform_messages IS
  '167: buzón de la plataforma (contacto, sugerencias, fallos). Antes de esto el '
  'formulario de /contacto era un mailto: y lo que se escribía se perdía.';

ALTER TABLE public.platform_messages ENABLE ROW LEVEL SECURITY;

-- Escribir: cualquiera, con o sin cuenta (el formulario de contacto es público).
-- Quien tenga sesión no puede hacerse pasar por otro: si manda user_id, tiene
-- que ser el suyo. El anti-abuso (rate limit, honeypot) vive en /api/contacto.
DROP POLICY IF EXISTS "platform_messages_insert_todos" ON public.platform_messages;
CREATE POLICY "platform_messages_insert_todos"
    ON public.platform_messages FOR INSERT TO anon, authenticated
    WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Leer y gestionar: solo el equipo (admin o analyst).
DROP POLICY IF EXISTS "platform_messages_select_equipo" ON public.platform_messages;
CREATE POLICY "platform_messages_select_equipo"
    ON public.platform_messages FOR SELECT TO authenticated
    USING (public.is_staff());

DROP POLICY IF EXISTS "platform_messages_update_equipo" ON public.platform_messages;
CREATE POLICY "platform_messages_update_equipo"
    ON public.platform_messages FOR UPDATE TO authenticated
    USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---------------------------------------------------------------
-- 3. El disparador del aviso
-- ---------------------------------------------------------------
-- Mismo patrón que dispatch_email (090): lee la config de app_settings y hace
-- un POST con pg_net. Silencioso si no hay config: el aviso es un extra, nunca
-- puede tumbar la escritura que lo provoca.
INSERT INTO public.app_settings (key, value)
VALUES ('notify_staff_url', 'https://franky.es/api/internal/notify-staff')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dispatch_staff_alert(
  p_tipo   TEXT,
  p_titulo TEXT,
  p_cuerpo TEXT,
  p_data   JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url    FROM public.app_settings WHERE key = 'notify_staff_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'notify_email_secret';
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object(
      'tipo',   p_tipo,
      'titulo', p_titulo,
      'cuerpo', p_cuerpo,
      'data',   p_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_staff_alert falló: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.dispatch_staff_alert IS
  '167: avisa al equipo (admin y analyst) por email vía /api/internal/notify-staff.';

-- ---------------------------------------------------------------
-- 4. Qué avisa: buzón, denuncias y sugerencias
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avisar_mensaje_plataforma()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.dispatch_staff_alert(
    'mensaje',
    COALESCE(NULLIF(btrim(NEW.subject), ''), 'Mensaje de ' || COALESCE(NEW.name, 'alguien')),
    NEW.body,
    jsonb_build_object(
      'kind', NEW.kind,
      'nombre', NEW.name,
      'email', NEW.email,
      'source', NEW.source,
      'mensaje_id', NEW.id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'aviso de mensaje falló: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_messages_avisar ON public.platform_messages;
CREATE TRIGGER trg_platform_messages_avisar
  AFTER INSERT ON public.platform_messages
  FOR EACH ROW EXECUTE FUNCTION public.avisar_mensaje_plataforma();

-- Denuncias de usuarios (user_reports). Se insertan desde la web Y desde la
-- app móvil directamente contra la tabla, de ahí que el aviso viva aquí.
CREATE OR REPLACE FUNCTION public.avisar_denuncia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_denunciante TEXT;
  v_denunciado  TEXT;
BEGIN
  SELECT COALESCE(full_name, email) INTO v_denunciante FROM public.profiles WHERE id = NEW.reporter_id;
  SELECT COALESCE(full_name, email) INTO v_denunciado  FROM public.profiles WHERE id = NEW.reported_user_id;

  PERFORM public.dispatch_staff_alert(
    'denuncia',
    'Denuncia de usuario: ' || COALESCE(NEW.reason, 'sin motivo'),
    COALESCE(v_denunciante, 'Alguien') || ' ha denunciado a ' ||
      COALESCE(v_denunciado, 'otra persona') ||
      ' (contexto: ' || COALESCE(NEW.context, 'sin contexto') || ').',
    jsonb_build_object(
      'denuncia_id', NEW.id,
      'reporter_id', NEW.reporter_id,
      'reported_user_id', NEW.reported_user_id,
      'reason', NEW.reason,
      'context', NEW.context,
      'url', '/admin'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'aviso de denuncia falló: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_reports_avisar ON public.user_reports;
CREATE TRIGGER trg_user_reports_avisar
  AFTER INSERT ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.avisar_denuncia();

-- Sugerencias de locales de ocio.
CREATE OR REPLACE FUNCTION public.avisar_sugerencia_ocio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.dispatch_staff_alert(
    'sugerencia',
    'Sugerencia de local: ' || COALESCE(NEW.name, 'sin nombre'),
    COALESCE(NEW.description, '') ||
      CASE WHEN NEW.city IS NOT NULL THEN E'\nCiudad: ' || NEW.city ELSE '' END,
    jsonb_build_object('sugerencia_id', NEW.id, 'url', '/admin')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'aviso de sugerencia falló: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leisure_suggestions_avisar ON public.leisure_spot_suggestions;
CREATE TRIGGER trg_leisure_suggestions_avisar
  AFTER INSERT ON public.leisure_spot_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.avisar_sugerencia_ocio();

-- ---------------------------------------------------------------
-- 5. Rescate: las sugerencias que ya se habían mandado y nadie vio
-- ---------------------------------------------------------------
-- La pantalla "Sugerir una mejora" de la app guardaba lo que escribía la gente
-- como un EVENTO DE ANALÍTICA (analytics_events, name = 'feedback_submitted'),
-- mientras le decía al usuario "la leemos todas". Nadie las leía: quedaban
-- sepultadas entre miles de eventos de uso, sin pantalla que las mostrara y sin
-- avisar a nadie.
--
-- Se copian al buzón para que aparezcan donde tienen que estar. El trigger se
-- desactiva durante la copia: son sugerencias viejas y no tiene sentido inundar
-- el correo del equipo con un aviso por cada una. Se leen en el buzón.
DO $$
DECLARE
  v_copiadas INT := 0;
BEGIN
  IF to_regclass('public.analytics_events') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.platform_messages DISABLE TRIGGER trg_platform_messages_avisar;

  INSERT INTO public.platform_messages (user_id, kind, name, email, subject, body, source, created_at)
  SELECT
    a.user_id,
    CASE a.props->>'tipo' WHEN 'fallo' THEN 'fallo' WHEN 'idea' THEN 'sugerencia' ELSE 'otro' END,
    p.full_name,
    p.email,
    'Sugerencia desde la app (' || COALESCE(a.props->>'tipo', 'otro') || ')',
    COALESCE(NULLIF(btrim(a.props->>'texto'), ''), '(sin texto)'),
    'movil',
    a.created_at
  FROM public.analytics_events a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.name = 'feedback_submitted'
    AND COALESCE(btrim(a.props->>'texto'), '') <> ''
    -- Idempotente: si la migración se ejecuta dos veces, no se duplican.
    AND NOT EXISTS (
      SELECT 1 FROM public.platform_messages m
       WHERE m.source = 'movil'
         AND m.created_at = a.created_at
         AND m.body = COALESCE(NULLIF(btrim(a.props->>'texto'), ''), '(sin texto)')
    );
  GET DIAGNOSTICS v_copiadas = ROW_COUNT;

  ALTER TABLE public.platform_messages ENABLE TRIGGER trg_platform_messages_avisar;

  RAISE NOTICE 'Sugerencias rescatadas de analytics_events: %', v_copiadas;
END $$;

-- ---------------------------------------------------------------
-- 6. Registro de avisos enviados
-- ---------------------------------------------------------------
-- Para poder comprobar que el correo salió de verdad (y ver el motivo cuando
-- no). Sin esto, "no me llega nada" no se puede diagnosticar: no queda rastro.
CREATE TABLE IF NOT EXISTS public.staff_alert_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo         TEXT NOT NULL,
    titulo       TEXT,
    destinatarios INT NOT NULL DEFAULT 0,
    ok           BOOLEAN NOT NULL DEFAULT false,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_alert_log_fecha
  ON public.staff_alert_log(created_at DESC);

ALTER TABLE public.staff_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_alert_log_select_equipo" ON public.staff_alert_log;
CREATE POLICY "staff_alert_log_select_equipo"
    ON public.staff_alert_log FOR SELECT TO authenticated
    USING (public.is_staff());
-- Escribe solo el service_role (la ruta interna). Sin políticas de INSERT.

COMMENT ON TABLE public.staff_alert_log IS
  '167: rastro de los avisos al equipo. Si alguien vuelve a decir "no me llega '
  'nada", aquí se ve si salió el correo y a cuántos.';

-- ---------------------------------------------------------------
-- 7. Comprobación tras aplicar
-- ---------------------------------------------------------------
--   -- Mandarse un aviso de prueba:
--   INSERT INTO public.platform_messages (kind, name, email, subject, body, source)
--   VALUES ('contacto', 'Prueba', 'tu-correo@example.com', 'Prueba de buzón',
--           'Si esto llega al correo, el buzón funciona.', 'web');
--
--   -- Y ver si salió (unos segundos después):
--   SELECT tipo, titulo, destinatarios, ok, error, created_at
--     FROM public.staff_alert_log ORDER BY created_at DESC LIMIT 5;
