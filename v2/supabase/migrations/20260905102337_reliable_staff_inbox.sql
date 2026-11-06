-- Restore the missing shared inbox; recover historical feedback without email.
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

REVOKE INSERT ON public.platform_messages FROM PUBLIC, anon;
GRANT INSERT ON public.platform_messages TO authenticated;
DROP POLICY IF EXISTS platform_messages_insert_todos ON public.platform_messages;
CREATE POLICY platform_messages_insert_todos ON public.platform_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_platform_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := auth.uid();
  v_client boolean := coalesce(auth.jwt()->>'role', '') = 'authenticated';
  v_count int;
BEGIN
  NEW.body := btrim(NEW.body);
  IF NEW.body IS NULL OR char_length(NEW.body) NOT BETWEEN 1 AND 4000
    OR char_length(coalesce(NEW.subject, '')) > 200
    OR char_length(coalesce(NEW.name, '')) > 120
    OR char_length(coalesce(NEW.email, '')) > 200 THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;
  IF v_client THEN
    IF v_me IS NULL OR NEW.user_id IS DISTINCT FROM v_me THEN
      RAISE EXCEPTION 'auth_required';
    END IF;
    SELECT p.full_name, p.email INTO NEW.name, NEW.email
      FROM public.profiles p
      WHERE p.id = v_me AND p.is_discarded IS NOT TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'profile_unavailable'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('platform-message:' || v_me::text, 0));
    SELECT count(*) INTO v_count FROM public.platform_messages
      WHERE user_id = v_me AND created_at >= now() - interval '10 minutes';
    IF v_count >= 5 THEN RAISE EXCEPTION 'message_rate_limit'; END IF;
    NEW.status := 'nuevo'; NEW.handled_by := NULL; NEW.handled_at := NULL;
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_platform_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_platform_message ON public.platform_messages;
CREATE TRIGGER trg_validate_platform_message BEFORE INSERT ON public.platform_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_platform_message();
CREATE INDEX IF NOT EXISTS platform_messages_user_time
  ON public.platform_messages(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.submit_platform_suggestion(
  p_body text, p_kind text DEFAULT 'sugerencia', p_source text DEFAULT 'web'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('sugerencia', 'fallo', 'otro')
    OR p_source IS NULL OR p_source NOT IN ('web', 'movil') THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;
  INSERT INTO public.platform_messages(user_id, kind, subject, body, source)
  VALUES (v_me, p_kind, CASE p_kind WHEN 'fallo' THEN 'Fallo comunicado'
    WHEN 'sugerencia' THEN 'Nueva sugerencia' ELSE 'Mensaje de usuario' END,
    p_body, p_source) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_platform_suggestion(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_platform_suggestion(text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.dispatch_staff_alert(text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_staff_alert(text,text,text,jsonb) TO service_role;

-- The inbox is the source of truth. Email is retried and tracked separately.
CREATE TABLE public.staff_alert_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL, titulo text NOT NULL, cuerpo text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}', recipients text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  request_id bigint, provider_id text, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz
);
ALTER TABLE public.staff_alert_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_alert_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_alert_outbox TO authenticated;
GRANT ALL ON public.staff_alert_outbox TO service_role;
CREATE POLICY staff_outbox_read ON public.staff_alert_outbox FOR SELECT TO authenticated
  USING (public.is_staff() AND auth.jwt()->>'aal' = 'aal2');
CREATE INDEX staff_outbox_pending ON public.staff_alert_outbox(next_attempt_at) WHERE status IN ('pending','sending');

CREATE OR REPLACE FUNCTION public.dispatch_staff_alert(p_tipo text,p_titulo text,p_cuerpo text,p_data jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.staff_alert_outbox(tipo,titulo,cuerpo,data,recipients)
  VALUES(p_tipo,left(coalesce(p_titulo,''),300),left(coalesce(p_cuerpo,''),5000),coalesce(p_data,'{}'),
    ARRAY(SELECT DISTINCT btrim(email) FROM public.profiles WHERE role IN ('admin','analyst') AND is_discarded IS NOT TRUE AND email LIKE '%@%' ORDER BY btrim(email) LIMIT 50));
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_staff_alert(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_staff_alert(text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.flush_staff_alerts()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_url text; v_secret text; v_job record; v_request bigint; v_count int := 0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_settings WHERE key='staff_outbox_enabled' AND value='true') THEN RETURN 0; END IF;
  SELECT value INTO v_url FROM public.app_settings WHERE key='notify_staff_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key='notify_email_secret';
  IF nullif(v_url,'') IS NULL OR nullif(v_secret,'') IS NULL THEN RETURN 0; END IF;
  -- Provider idempotency keys are valid for 24 hours; stop within that window.
  UPDATE public.staff_alert_outbox SET status='failed',last_error=coalesce(last_error,'Delivery was not acknowledged')
    WHERE status IN ('pending','sending') AND (attempts >= 8 OR created_at < now()-interval '20 hours') AND next_attempt_at <= now();
  FOR v_job IN SELECT id,attempts FROM public.staff_alert_outbox
    WHERE status IN ('pending','sending') AND next_attempt_at <= now() AND attempts < 8
    ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT net.http_post(url:=v_url,headers:=jsonb_build_object('content-type','application/json','authorization','Bearer '||v_secret),body:=jsonb_build_object('alert_id',v_job.id),timeout_milliseconds:=30000) INTO v_request;
      UPDATE public.staff_alert_outbox SET status='sending',attempts=attempts+1,request_id=v_request,
        next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,v_job.attempts)::int)) WHERE id=v_job.id;
      v_count:=v_count+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.staff_alert_outbox SET attempts=attempts+1,last_error='HTTP dispatch failed',next_attempt_at=now()+interval '10 minutes' WHERE id=v_job.id;
    END;
  END LOOP;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.flush_staff_alerts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flush_staff_alerts() TO service_role;
INSERT INTO public.app_settings(key,value) VALUES('staff_outbox_enabled','false') ON CONFLICT(key) DO NOTHING;
SELECT cron.schedule('franky-staff-outbox','* * * * *','SELECT public.flush_staff_alerts();');

-- Staff can read the inbox only after completing the second factor. Analysts remain read-only.
REVOKE ALL ON public.platform_messages FROM PUBLIC,anon,authenticated;
GRANT INSERT,SELECT,UPDATE ON public.platform_messages TO authenticated;
GRANT ALL ON public.platform_messages TO service_role;
DROP POLICY platform_messages_select_equipo ON public.platform_messages;
CREATE POLICY platform_messages_select_equipo ON public.platform_messages FOR SELECT TO authenticated
  USING(public.is_staff() AND auth.jwt()->>'aal'='aal2');
DROP POLICY platform_messages_update_equipo ON public.platform_messages;
CREATE POLICY platform_messages_update_equipo ON public.platform_messages FOR UPDATE TO authenticated
  USING(public.is_admin() AND auth.jwt()->>'aal'='aal2') WITH CHECK(public.is_admin() AND auth.jwt()->>'aal'='aal2');
GRANT SELECT ON public.staff_alert_log TO authenticated;
GRANT ALL ON public.staff_alert_log TO service_role;
DROP POLICY staff_alert_log_select_equipo ON public.staff_alert_log;
CREATE POLICY staff_alert_log_select_equipo ON public.staff_alert_log FOR SELECT TO authenticated
  USING(public.is_staff() AND auth.jwt()->>'aal'='aal2');
-- Historical free text now exists in the private inbox. Remove the redundant analytics copy.
UPDATE public.analytics_events SET props=props-'texto'
WHERE name='feedback_submitted' AND props ? 'texto'
  AND EXISTS(SELECT 1 FROM public.platform_messages m WHERE m.source='movil' AND m.created_at=analytics_events.created_at AND m.body=btrim(analytics_events.props->>'texto'));

DO $$
BEGIN
  IF has_table_privilege('anon','public.platform_messages','INSERT')
    OR has_table_privilege('anon','public.staff_alert_outbox','SELECT')
    OR has_function_privilege('authenticated','public.dispatch_staff_alert(text,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.flush_staff_alerts()','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected_inbox_privileges';
  END IF;
  IF EXISTS(SELECT 1 FROM public.staff_alert_outbox) THEN
    RAISE EXCEPTION 'historical_feedback_must_not_send_email';
  END IF;
END; $$;
