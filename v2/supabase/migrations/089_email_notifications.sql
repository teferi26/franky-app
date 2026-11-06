-- =====================================================
-- 089: Emails de actividad (mensaje / like / match)
-- =====================================================
-- Conecta el embudo `notifications` a una ruta Next.js que envía email vía
-- Resend. El INSERT en `notifications` ya dispara push (054); aquí añadimos
-- email para los tipos relevantes.
--
-- El gating real (preferencias + DnD, inactividad del destinatario, throttle,
-- plantilla y envío) vive en la ruta /api/internal/notify-email. Aquí solo
-- reenviamos el evento vía pg_net.
--
-- REQUISITOS (configurar en Supabase, una vez):
--   ALTER DATABASE postgres SET app.notify_email_url    = 'https://<dominio-prod>/api/internal/notify-email';
--   ALTER DATABASE postgres SET app.notify_email_secret = '<mismo valor que NOTIFY_EMAIL_SECRET en Vercel>';
--   (pg_net ya está habilitado por la migración 054.)
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. Tabla de throttle + auditoría de emails enviados
-- ─────────────────────────────────────────────────────
-- `ref` agrupa el throttle: conversation_id para mensajes, 'likes' (global)
-- para likes agrupados, peer user_id para matches.
CREATE TABLE IF NOT EXISTS public.email_notification_log (
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category     TEXT        NOT NULL,
  ref          TEXT        NOT NULL DEFAULT '',
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category, ref)
);

ALTER TABLE public.email_notification_log ENABLE ROW LEVEL SECURITY;
-- Sin políticas para `authenticated`: solo el service-role (ruta interna) accede.

COMMENT ON TABLE public.email_notification_log IS
  '089: throttle + auditoría de emails de actividad. Solo accesible vía service-role.';

-- ─────────────────────────────────────────────────────
-- 2. dispatch_email() — reenvía el evento a la ruta Next.js
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_email(
  p_user_id UUID,
  p_type    TEXT,
  p_title   TEXT,
  p_body    TEXT,
  p_data    JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    TEXT := current_setting('app.notify_email_url', true);
  v_secret TEXT := current_setting('app.notify_email_secret', true);
BEGIN
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    -- Sin settings configurados → silencioso (email opcional).
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object(
      'user_id', p_user_id::text,
      'type',    p_type,
      'title',   p_title,
      'body',    p_body,
      'data',    p_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Un fallo de email nunca debe bloquear el INSERT de la notificación.
  RAISE WARNING 'dispatch_email failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.dispatch_email IS
  '089: invoca la ruta /api/internal/notify-email vía pg_net. Idempotente ante errores.';

-- ─────────────────────────────────────────────────────
-- 3. Extender on_notification_insert para lanzar también email
--    (conserva el dispatch_push existente).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF COALESCE(NEW.is_read, false) = false THEN
    PERFORM public.dispatch_push(NEW.user_id, NEW.title, NEW.body, COALESCE(NEW.data, '{}'::jsonb));

    IF NEW.type IN ('message', 'match', 'roomie_like') THEN
      PERFORM public.dispatch_email(
        NEW.user_id, NEW.type, NEW.title, NEW.body, COALESCE(NEW.data, '{}'::jsonb)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- El trigger trg_notifications_push (054) ya apunta a esta función; no hace
-- falta recrearlo.
