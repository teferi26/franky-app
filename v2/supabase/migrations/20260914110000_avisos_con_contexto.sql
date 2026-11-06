-- ─── Avisos de chat con contexto: quién te escribe y por qué ────────────────
--
-- Antes el aviso de un mensaje llevaba solo el nombre de quien escribía y, si
-- el mensaje era una foto o una nota de voz, un cuerpo vacío. Además ignoraba
-- el silencio por conversación (conversation_participants.is_muted, 130) y
-- avisaba también de los mensajes de sistema.
--
-- Ahora el aviso dice:
--   · chat directo:      "Marta"                  / "¿Vienes esta noche?"
--   · grupo:             "Marta · Piso Benalúa"   / "📷 Foto"
--   · chat de un evento: "Marta · ORIGIN #002"    / "🎤 Nota de voz"
-- y no se crea para conversaciones silenciadas ni para mensajes de sistema.
--
-- El texto real ya viaja en el push (antes el servidor lo sustituía por
-- "Tienes un aviso nuevo"): cada token de dispositivo tiene un único dueño y
-- se borra al cerrar sesión, así que el banner solo llega a quien debe.
--
-- Idempotente. Un fallo aquí jamás rompe el envío del mensaje.

CREATE OR REPLACE FUNCTION public.on_new_message_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_name  TEXT;
  v_context      TEXT;
  v_kind         TEXT := 'direct';
  v_title        TEXT;
  v_body         TEXT;
  v_recipient    UUID;
  v_group        BOOLEAN := false;
  v_group_name   TEXT;
  v_event_id     UUID;
  v_event_title  TEXT;
  v_payload      jsonb;
BEGIN
  -- Los mensajes de sistema ("X se ha unido", "Habéis hecho match") no avisan.
  IF COALESCE(NEW.message_type, 'text') = 'system' THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN NEW.publishing_organization_id IS NOT NULL
         THEN COALESCE(NULLIF(btrim(NEW.organization_label), ''), 'Organización')
         ELSE COALESCE(NULLIF(btrim(p.full_name), ''), 'Alguien') END
    INTO v_sender_name
    FROM public.profiles p WHERE p.id = NEW.sender_id;

  -- Contexto: chat de evento (013), grupo (019) o directo.
  SELECT e.id, e.title INTO v_event_id, v_event_title
    FROM public.event_conversations ec
    JOIN public.events e ON e.id = ec.event_id
   WHERE ec.conversation_id = NEW.conversation_id
   LIMIT 1;

  SELECT COALESCE(c.is_group, false) OR COALESCE(c.type, 'direct') = 'group',
         COALESCE(NULLIF(c.group_name, ''), NULLIF(c.name, ''))
    INTO v_group, v_group_name
    FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF v_event_title IS NOT NULL THEN
    v_kind := 'event';
    v_context := v_event_title;
  ELSIF v_group THEN
    v_kind := 'group';
    v_context := COALESCE(v_group_name, 'Grupo');
  END IF;

  v_title := CASE WHEN v_context IS NULL THEN v_sender_name
                  ELSE v_sender_name || ' · ' || LEFT(v_context, 40) END;

  v_body := CASE COALESCE(NEW.message_type, 'text')
    WHEN 'image' THEN '📷 Foto' || COALESCE(' · ' || LEFT(NULLIF(btrim(NEW.content), ''), 120), '')
    WHEN 'video' THEN '🎬 Vídeo' || COALESCE(' · ' || LEFT(NULLIF(btrim(NEW.content), ''), 120), '')
    WHEN 'audio' THEN '🎤 Nota de voz'
    ELSE LEFT(COALESCE(NULLIF(btrim(NEW.content), ''), 'Te ha enviado un mensaje'), 160)
  END;

  -- Preserve the current workspace publication identity. A recipient sees
  -- the institution, never the private account that published on its behalf.
  v_payload := jsonb_build_object(
    'conversation_id', NEW.conversation_id, 'message_id', NEW.id,
    'kind', 'chat_' || v_kind, 'context', v_context, 'event_id', v_event_id
  );
  IF NEW.publishing_organization_id IS NULL THEN
    v_payload := v_payload || jsonb_build_object('sender_id', NEW.sender_id);
  ELSE
    v_payload := v_payload || jsonb_build_object('organization_id', NEW.publishing_organization_id);
  END IF;

  FOR v_recipient IN
    SELECT cp.user_id
      FROM public.conversation_participants cp
     WHERE cp.conversation_id = NEW.conversation_id
       AND cp.user_id <> NEW.sender_id
       AND COALESCE(cp.is_muted, false) = false
     LIMIT 500
  LOOP
    -- Historical participation does not retain revoked workspace/event access.
    IF NOT public.workspace_chat_recipient_allowed(v_recipient, v_payload) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_recipient,
      'message',
      v_title,
      v_body,
      v_payload
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un aviso nunca debe impedir que el mensaje se guarde.
  RAISE WARNING 'on_new_message_notify: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.on_new_message_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_messages_notify ON public.messages;
CREATE TRIGGER trg_messages_notify
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.on_new_message_notify();

COMMENT ON FUNCTION public.on_new_message_notify() IS
  '2026-09-14: aviso por mensaje con nombre + contexto (grupo/evento), cuerpo para fotos/audio/vídeo, respeta is_muted y omite mensajes de sistema.';
