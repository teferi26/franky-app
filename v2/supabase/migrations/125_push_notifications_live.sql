-- ═══════════════════════════════════════════════════════════════════════════
-- 125: Notificaciones push operativas + preferencias + nuevos eventos sociales
--
-- Hasta ahora dispatch_push apuntaba a una Edge Function nunca desplegada
-- (054) y moría en silencio. Se redirige al endpoint web
-- /api/internal/notify-push (mismo patrón que los emails de la 090: config en
-- app_settings, secreto compartido), que envía por la Expo Push API a los
-- device_tokens del usuario respetando profiles.push_prefs.
--
-- Además: preferencias de silenciado por categoría (push_prefs), y dos
-- eventos sociales nuevos que insertan en `notifications` (y por tanto
-- disparan push automáticamente vía trg_notifications_push):
--   - 'comment': alguien comentó tu publicación del FOMO
--   - 'post': alguien a quien sigues publicó (no anónimo)
--
-- Aplicable desde el SQL Editor. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. Preferencias de notificación del usuario
--    {} = todo activado. { "all": false } silencia todo;
--    { "messages": false, "crush": false, "comments": false,
--      "follows": false, "events": false } silencian por categoría.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─────────────────────────────────────────────────────
-- 2. Tipos nuevos en notifications
-- ─────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'message', 'match', 'review', 'accommodation', 'event', 'promotion',
    'system', 'scholarship', 'accommodation_request', 'roomie_like', 'payment',
    'comment', 'post'
  ));

-- ─────────────────────────────────────────────────────
-- 3. dispatch_push → endpoint web (config en app_settings)
-- ─────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value)
VALUES ('notify_push_url', 'https://franky.es/api/internal/notify-push')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

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
  v_url    TEXT := (SELECT value FROM public.app_settings WHERE key = 'notify_push_url');
  v_secret TEXT := (SELECT value FROM public.app_settings WHERE key = 'notify_email_secret');
BEGIN
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN; -- sin config: silencioso
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object(
      'user_id', p_user_id::text,
      'title',   p_title,
      'body',    p_body,
      'data',    p_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_push failed: %', SQLERRM;
END;
$$;

-- El trigger de notifications pasa también el TYPE (para que el endpoint
-- aplique las preferencias por categoría).
CREATE OR REPLACE FUNCTION public.on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF COALESCE(NEW.is_read, false) = false THEN
    PERFORM public.dispatch_push(
      NEW.user_id, NEW.title, NEW.body,
      COALESCE(NEW.data, '{}'::jsonb) || jsonb_build_object('type', NEW.type)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 4. Comentario en tu publicación del FOMO → notification 'comment'
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_fomo_reply_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.fomo_threads%ROWTYPE;
  v_who TEXT;
BEGIN
  SELECT * INTO v_thread FROM public.fomo_threads WHERE id = NEW.thread_id;
  IF v_thread.id IS NULL OR v_thread.is_deleted OR v_thread.author_id = NEW.author_id THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_anonymous, false) THEN
    v_who := 'Alguien';
  ELSE
    SELECT COALESCE(full_name, 'Alguien') INTO v_who FROM public.profiles WHERE id = NEW.author_id;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_thread.author_id, 'comment',
    '💬 ' || v_who || ' ha comentado tu publicación',
    LEFT(COALESCE(NEW.body, 'Toca para verlo'), 140),
    jsonb_build_object('url', '/fomo/' || v_thread.id::text)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- una notificación jamás debe romper el comentario
END;
$$;

DROP TRIGGER IF EXISTS trg_fomo_reply_notify ON public.fomo_replies;
CREATE TRIGGER trg_fomo_reply_notify
AFTER INSERT ON public.fomo_replies
FOR EACH ROW EXECUTE FUNCTION public.on_fomo_reply_notify();

-- ─────────────────────────────────────────────────────
-- 5. Nueva publicación (no anónima) de alguien a quien sigues → 'post'
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_fomo_thread_notify_followers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_who TEXT;
BEGIN
  IF COALESCE(NEW.is_anonymous, false) THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, 'Alguien') INTO v_who FROM public.profiles WHERE id = NEW.author_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    f.follower_id, 'post',
    '✨ ' || v_who || ' ha publicado',
    LEFT(COALESCE(NEW.body, 'Nueva publicación'), 140),
    jsonb_build_object('url', '/fomo/' || NEW.id::text)
  FROM public.follows f
  WHERE f.followee_id = NEW.author_id
  LIMIT 500;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fomo_thread_notify_followers ON public.fomo_threads;
CREATE TRIGGER trg_fomo_thread_notify_followers
AFTER INSERT ON public.fomo_threads
FOR EACH ROW EXECUTE FUNCTION public.on_fomo_thread_notify_followers();

COMMENT ON COLUMN public.profiles.push_prefs IS
  '125: silenciado de push. {} = todo activo; all=false silencia todo; messages/crush/comments/follows/events=false por categoría.';

NOTIFY pgrst, 'reload schema';
