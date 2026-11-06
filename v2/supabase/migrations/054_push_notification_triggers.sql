-- =====================================================
-- 054: Push Notification Triggers
-- =====================================================
-- Conecta la edge function `send-push-notification` (creada en F0)
-- a INSERTs reales en la BD. Usa `pg_net` para HTTP async.
--
-- REQUISITOS:
--   - Extensión `pg_net` habilitada en el proyecto Supabase.
--   - Vault secret `service_role_key` con la service-role key (o setear
--     via `app.service_role_key` en Supabase Dashboard).
--   - Edge function `send-push-notification` deployada y secrets configurados
--     (ver mobile2/docs/push-notifications-setup.md).
--
-- COMPORTAMIENTO:
--   - INSERT en `notifications` → invoca edge function con título/body/data.
--     Cualquier feature que cree una notification dispara push automáticamente.
--   - INSERT en `messages` → crea notification con type=message para el
--     otro participant.
--   - INSERT en `swipe_actions` con match recíproco → crea notification
--     type=match en ambos lados.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────
-- 1. dispatch_push() — handler que invoca edge function
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_push(
  p_user_id UUID,
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
  v_url   TEXT := current_setting('app.supabase_url', true) || '/functions/v1/send-push-notification';
  v_key   TEXT := current_setting('app.service_role_key', true);
BEGIN
  IF v_url IS NULL OR v_key IS NULL THEN
    -- Sin secrets configurados → silencioso (push opcional).
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'user_id', p_user_id::text,
      'title',   p_title,
      'body',    p_body,
      'data',    p_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- No queremos que un fallo de push bloquee el INSERT.
  RAISE WARNING 'dispatch_push failed: %', SQLERRM;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 2. Trigger sobre `notifications`: cuando se inserta una
--    notification con `is_read=false`, lanza push.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF COALESCE(NEW.is_read, false) = false THEN
    PERFORM public.dispatch_push(NEW.user_id, NEW.title, NEW.body, COALESCE(NEW.data, '{}'::jsonb));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_push ON public.notifications;
CREATE TRIGGER trg_notifications_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.on_notification_insert();

-- ─────────────────────────────────────────────────────
-- 3. Trigger sobre `messages`: crear notification para el
--    otro participant (lo que dispara push via trigger #2).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_new_message_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient   UUID;
  v_sender_name TEXT;
BEGIN
  -- Para 1:1 chats, busca el otro participant. Para grupales esto se podría
  -- expandir a iterar todos los participantes — TODO si hace falta.
  SELECT cp.user_id INTO v_recipient
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  LIMIT 1;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Alguien') INTO v_sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_recipient,
    'message',
    v_sender_name,
    LEFT(COALESCE(NEW.content, ''), 110),
    jsonb_build_object(
      'conversation_id', NEW.conversation_id::text,
      'sender_id',       NEW.sender_id::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_notify ON public.messages;
CREATE TRIGGER trg_messages_notify
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.on_new_message_notify();

-- ─────────────────────────────────────────────────────
-- 4. Trigger sobre `swipe_actions` con match recíproco
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_swipe_notify_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reciprocal      BOOLEAN := false;
  v_user_name       TEXT;
  v_target_name     TEXT;
BEGIN
  IF NEW.action NOT IN ('like', 'superlike') OR NEW.target_type <> 'roomie' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.swipe_actions sa
    WHERE sa.user_id = NEW.target_id
      AND sa.target_id = NEW.user_id
      AND sa.target_type = 'roomie'
      AND sa.action IN ('like', 'superlike')
  ) INTO v_reciprocal;

  IF NOT v_reciprocal THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Tu match')
  INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;

  SELECT COALESCE(full_name, 'Tu match')
  INTO v_target_name FROM public.profiles WHERE id = NEW.target_id;

  -- Notify both
  INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
    (
      NEW.user_id,
      'match',
      'Has hecho match con ' || v_target_name,
      'Empieza la conversación antes de que se enfríe.',
      jsonb_build_object('target_user_id', NEW.target_id::text)
    ),
    (
      NEW.target_id,
      'match',
      'Has hecho match con ' || v_user_name,
      'Empieza la conversación antes de que se enfríe.',
      jsonb_build_object('target_user_id', NEW.user_id::text)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_swipe_match_notify ON public.swipe_actions;
CREATE TRIGGER trg_swipe_match_notify
AFTER INSERT ON public.swipe_actions
FOR EACH ROW EXECUTE FUNCTION public.on_swipe_notify_match();

COMMENT ON FUNCTION public.dispatch_push IS
  'Invoca edge function send-push-notification via pg_net. Idempotente con respecto a errores.';
