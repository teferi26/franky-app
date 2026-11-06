-- ═══════════════════════════════════════════════════════════════════════════
-- 148: Arreglos de notificaciones y privacidad (auditoría del 24-jul)
--
--   1. El CHECK de notifications no admitía 'admin_photo_report': denunciar
--      una foto de perfil (RPC report_profile_photo, 140) REVENTABA entera al
--      intentar avisar al admin. Se amplía el CHECK (y de paso se añaden los
--      tipos de las features nuevas: llamadas, comunidades, lista de espera).
--   2. El match de roomie notificaba DOS veces: el trigger antiguo de
--      swipe_actions (054) y el de roommate_matches (088) disparaban ambos.
--      Se elimina el antiguo.
--   3. "Quién puede escribirte" (dm_privacy, 134) solo se comprobaba en el
--      cliente móvil: cualquiera podía abrir un DM desde la web o llamando a
--      la RPC directamente. Ahora get_or_create_direct_chat lo exige en
--      servidor (bloqueos incluidos, vía can_message_user).
--   4. Las llamadas 1:1 (139) no avisaban al llamado con la app cerrada:
--      trigger de push en calls.
--   5. La lista de espera (136) tenía notified_at pero nadie avisaba al
--      liberarse una plaza: trigger en event_participants.
--   6. Las encuestas del chat (135) no dejaban rastro en messages: los demás
--      no se enteraban. create_chat_poll ahora publica un mensaje ancla (que
--      además hereda el push de mensajes gratis).
--   7. Publicar en una comunidad (138) avisa a sus miembros.
--
-- Pendiente CONSCIENTE (no entra aquí por riesgo): filtrar muted_users dentro
-- de get_fomo_feed (hoy el silenciado se filtra en cliente móvil). Es una
-- función grande y caliente: merece migración propia con calma.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. CHECK de notifications ampliado
-- ─────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'message', 'match', 'review', 'accommodation', 'event', 'promotion',
        'system', 'scholarship', 'accommodation_request', 'roomie_like', 'payment',
        'comment', 'post', 'tenancy', 'visit', 'contract', 'mention',
        'admin_photo_report', 'call', 'community', 'waitlist'
    ));

-- ─────────────────────────────────────────────────────
-- 2. Fuera el trigger duplicado del match de roomie
-- ─────────────────────────────────────────────────────
-- process_swipe_action escribe en swipe_actions Y en roommate_matches; con los
-- dos triggers vivos, cada match generaba dos notificaciones y dos push. Se
-- queda el de roommate_matches (088), que es el que conoce el estado real.
DROP TRIGGER IF EXISTS trg_swipe_match_notify ON public.swipe_actions;

-- ─────────────────────────────────────────────────────
-- 3. dm_privacy y bloqueos, exigidos EN SERVIDOR
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_conv_id UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  -- 148: privacidad de mensajes en servidor. can_message_user (134) comprueba
  -- bloqueos en ambas direcciones y la preferencia dm_privacy del receptor.
  -- Antes esto solo lo miraba el cliente móvil: desde la web (o llamando a la
  -- RPC a pelo) se saltaba la preferencia entera.
  IF NOT public.can_message_user(p_other_user_id) THEN
    RAISE EXCEPTION 'not_allowed'
      USING HINT = 'Esta persona ha restringido quién puede escribirle.';
  END IF;

  -- Conversación 1:1 existente entre ambos
  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants p1
    ON p1.conversation_id = c.id AND p1.user_id = v_me
  JOIN public.conversation_participants p2
    ON p2.conversation_id = c.id AND p2.user_id = p_other_user_id
  WHERE COALESCE(c.is_group, false) = false
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.conversations (is_group)
  VALUES (false)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_me),
         (v_conv_id, p_other_user_id);

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 4. Llamada entrante → notificación (y push) al llamado
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_call_ringing_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_name TEXT;
BEGIN
  IF NEW.status <> 'ringing' THEN RETURN NEW; END IF;

  SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = NEW.caller_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.callee_id,
    'call',
    CASE WHEN NEW.kind = 'video' THEN 'Videollamada entrante' ELSE 'Llamada entrante' END,
    COALESCE(v_caller_name, 'Alguien') || ' te está llamando',
    jsonb_build_object(
      'url', '/llamada/' || NEW.caller_id::text || '?callId=' || NEW.id::text || '&kind=' || NEW.kind,
      'call_id', NEW.id::text,
      'caller_id', NEW.caller_id::text
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_ringing_notify ON public.calls;
CREATE TRIGGER trg_call_ringing_notify
  AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.on_call_ringing_notify();

-- ─────────────────────────────────────────────────────
-- 5. Plaza liberada → aviso al primero de la lista de espera
-- ─────────────────────────────────────────────────────
-- Se dispara cuando un inscrito cancela (UPDATE a cancelled o DELETE). Avisa
-- SOLO al más antiguo aún sin avisar, y lo marca, para no despertar a toda la
-- lista por una única plaza.
CREATE OR REPLACE FUNCTION public.on_participant_freed_notify_waitlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_next     RECORD;
  v_title    TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN RETURN NEW; END IF;
    v_event_id := NEW.event_id;
  ELSE
    v_event_id := OLD.event_id;
  END IF;

  SELECT w.user_id INTO v_next
  FROM public.event_waitlist w
  WHERE w.event_id = v_event_id AND w.notified_at IS NULL
  ORDER BY w.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT title INTO v_title FROM public.events WHERE id = v_event_id;

  UPDATE public.event_waitlist
     SET notified_at = now()
   WHERE event_id = v_event_id AND user_id = v_next.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_next.user_id,
    'waitlist',
    '¡Se ha liberado una plaza!',
    'Hay sitio en: ' || COALESCE(v_title, 'un evento de tu lista de espera') || '. Corre, que vuelan.',
    jsonb_build_object('url', '/eventos/' || v_event_id::text, 'event_id', v_event_id::text)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_participant_freed_waitlist ON public.event_participants;
CREATE TRIGGER trg_participant_freed_waitlist
  AFTER UPDATE OR DELETE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.on_participant_freed_notify_waitlist();

-- ─────────────────────────────────────────────────────
-- 6. La encuesta del chat deja mensaje ancla (y con él, push)
-- ─────────────────────────────────────────────────────
-- Misma firma y cuerpo que en la 135, más el INSERT en messages: los demás
-- participantes ven "📊 Encuesta: ..." en la lista de chats, les sube el no
-- leído y les llega el push de mensaje de siempre. La tarjeta interactiva
-- sigue pintándose desde chat_polls, como hasta ahora.
CREATE OR REPLACE FUNCTION public.create_chat_poll(
  p_conversation UUID,
  p_question     TEXT,
  p_options      TEXT[],
  p_multi        BOOLEAN DEFAULT false,
  p_meetup_at    TIMESTAMPTZ DEFAULT NULL,
  p_meetup_place TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation AND user_id = v_me
  ) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  INSERT INTO public.chat_polls
    (conversation_id, author_id, question, options, multi, meetup_at, meetup_place)
  VALUES
    (p_conversation, v_me, trim(p_question), p_options, COALESCE(p_multi, false), p_meetup_at, p_meetup_place)
  RETURNING id INTO v_id;

  -- 148: mensaje ancla. Sin él, nadie se enteraba de la encuesta hasta abrir
  -- el chat por casualidad.
  INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
  VALUES (
    p_conversation,
    v_me,
    CASE WHEN p_meetup_at IS NOT NULL THEN '📅 Quedada: ' ELSE '📊 Encuesta: ' END || trim(p_question),
    'text'
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_chat_poll(UUID, TEXT, TEXT[], BOOLEAN, TIMESTAMPTZ, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 7. Publicación en comunidad → aviso a los miembros
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_community_post_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT name INTO v_name FROM public.communities WHERE id = NEW.community_id;

  -- Tope de 500 como el fan-out de seguidores (125): una comunidad enorme no
  -- puede tumbar el insert.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT m.user_id,
         'community',
         'Nuevo en ' || COALESCE(v_name, 'tu comunidad'),
         COALESCE(LEFT(NEW.body, 120), 'Hay una publicación nueva'),
         jsonb_build_object('url', '/comunidad/' || NEW.community_id::text, 'community_id', NEW.community_id::text)
  FROM public.community_members m
  WHERE m.community_id = NEW.community_id
    AND m.user_id <> NEW.author_id
  LIMIT 500;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_post_notify ON public.community_posts;
CREATE TRIGGER trg_community_post_notify
  AFTER INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.on_community_post_notify();

NOTIFY pgrst, 'reload schema';
