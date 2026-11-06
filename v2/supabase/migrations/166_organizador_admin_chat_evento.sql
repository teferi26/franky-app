-- =====================================================
-- 166: quien crea el evento es dueño de su grupo desde el minuto uno
-- =====================================================
--
-- EL PROBLEMA
--
-- El chat de grupo de un evento se creaba en la PRIMERA llamada a
-- join_event_chat, y esa función exige estar inscrito en event_participants:
--
--     IF NOT EXISTS (SELECT 1 FROM event_participants WHERE ...)
--        THEN RAISE EXCEPTION 'not_event_participant';
--
-- Resultado: el organizador se quedaba fuera del grupo de su propio evento.
--   · En un evento GRATUITO se colaba solo porque el formulario le auto-inscribe,
--     y entraba como 'member' cualquiera, sin ser admin del grupo.
--   · En un evento DE PAGO era imposible: ahí "estar apuntado" significa tener
--     entrada, y el organizador no puede comprar una entrada de su propio evento
--     (reserve_event_ticket lo prohíbe explícitamente). Se quedaba fuera del chat
--     de su evento para siempre.
--
-- LA REGLA NUEVA
--
--   1. Cada evento nace con su grupo, y el organizador dentro con role='admin'
--      (la columna existe desde la 019 y join_event_chat no la usaba nunca).
--      Lo hace un trigger, así que no depende de que el cliente llame a nada.
--   2. join_event_chat deja pasar al organizador SIN pedirle inscripción, y le
--      pone (o le devuelve) el rol de admin.
--   3. El organizador puede leer el vínculo evento↔conversación aunque no esté
--      inscrito (la policy de la 013 solo miraba event_participants).
--
-- EL TRIGGER NUNCA PUEDE TUMBAR LA CREACIÓN DE UN EVENTO
--
-- Va en un AFTER INSERT con su propio EXCEPTION WHEN OTHERS: si por lo que sea
-- el grupo no se puede crear, el evento se publica igual y el chat se creará en
-- la primera llamada a join_event_chat, como hasta ahora. Publicar un evento es
-- lo importante; el grupo es una consecuencia.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. El grupo del evento, con su organizador como admin
-- ---------------------------------------------------------------
-- Crea (o recupera) la conversación de grupo del evento y garantiza que el
-- organizador está dentro como admin. Devuelve el id de la conversación.
--
-- SECURITY DEFINER porque escribe en conversations / event_conversations /
-- conversation_participants saltando RLS, igual que join_event_chat. Solo puede
-- llamarla el propio organizador, un admin o service_role: así nadie usa esto
-- para ir creando conversaciones de eventos ajenos.
CREATE OR REPLACE FUNCTION public.ensure_event_chat(p_event_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation_id UUID;
  v_event           RECORD;
  v_is_service_role BOOLEAN := COALESCE(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  SELECT e.id, e.title, e.organizer_id
    INTO v_event
    FROM public.events e
   WHERE e.id = p_event_id;

  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.organizer_id IS NULL THEN RAISE EXCEPTION 'event_without_organizer'; END IF;

  IF NOT v_is_service_role
     AND auth.uid() IS DISTINCT FROM v_event.organizer_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT ec.conversation_id INTO v_conversation_id
    FROM public.event_conversations ec
   WHERE ec.event_id = p_event_id;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (is_group, group_name, created_by)
    VALUES (true, COALESCE(v_event.title, 'Evento'), v_event.organizer_id)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.event_conversations (event_id, conversation_id)
    VALUES (p_event_id, v_conversation_id)
    ON CONFLICT (event_id) DO NOTHING;

    -- Carrera improbable pero posible (dos clientes a la vez): si otro ganó, se
    -- usa su conversación y la nuestra se queda sin vincular.
    SELECT ec.conversation_id INTO v_conversation_id
      FROM public.event_conversations ec
     WHERE ec.event_id = p_event_id;
  END IF;

  -- El organizador, dentro y como admin del grupo. Si ya estaba como 'member'
  -- (porque el formulario le auto-inscribe en los eventos gratuitos), se
  -- promociona: es su evento.
  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_conversation_id, v_event.organizer_id, 'admin')
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET role = 'admin' WHERE conversation_participants.role <> 'admin';

  RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_event_chat(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_event_chat(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_event_chat(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_event_chat(UUID) IS
  '166: crea (o recupera) el grupo de chat de un evento con el organizador '
  'dentro como admin. Solo el organizador, un admin o service_role.';

-- ---------------------------------------------------------------
-- 2. El grupo nace con el evento
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_chat_al_publicar_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.ensure_event_chat(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Publicar el evento es lo importante: si el grupo no se puede crear ahora,
    -- se creará en la primera llamada a join_event_chat.
    RAISE WARNING 'no se pudo crear el chat del evento %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_crear_chat ON public.events;
CREATE TRIGGER trg_events_crear_chat
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.crear_chat_al_publicar_evento();

-- ---------------------------------------------------------------
-- 3. join_event_chat: el organizador entra sin inscripción y como admin
-- ---------------------------------------------------------------
-- Parte de la versión vigente (106, el fix de seguridad) y conserva sus dos
-- guardas: solo puedes unirte a ti mismo, y solo si estás inscrito. Lo único que
-- cambia es que el ORGANIZADOR del evento también pasa (su "inscripción" es
-- haberlo creado) y que entra con rol de admin.
CREATE OR REPLACE FUNCTION public.join_event_chat(
  p_event_id UUID,
  p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation_id UUID;
  v_event_title     TEXT;
  v_organizer       UUID;
  v_is_organizer    BOOLEAN;
  v_is_service_role BOOLEAN := COALESCE(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  -- (1) Identidad: solo uno mismo (o service_role) puede unirse en su nombre.
  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT e.organizer_id, e.title INTO v_organizer, v_event_title
    FROM public.events e
   WHERE e.id = p_event_id;
  v_is_organizer := v_organizer IS NOT NULL AND v_organizer = p_user_id;

  -- (2) Membresía: inscritos en el evento, y el organizador SIEMPRE. En un
  --     evento de pago el organizador no puede tener entrada (no se puede
  --     comprar la de tu propio evento), así que exigirle inscripción era
  --     dejarle fuera del chat de su evento para siempre.
  IF NOT v_is_service_role AND NOT v_is_organizer AND NOT EXISTS (
    SELECT 1
    FROM public.event_participants ep
    WHERE ep.event_id = p_event_id
      AND ep.user_id  = p_user_id
      AND COALESCE(ep.status, 'registered') <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'not_event_participant';
  END IF;

  SELECT ec.conversation_id INTO v_conversation_id
  FROM public.event_conversations ec
  WHERE ec.event_id = p_event_id;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (is_group, group_name, created_by)
    VALUES (true, COALESCE(v_event_title, 'Evento'), v_organizer)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.event_conversations (event_id, conversation_id)
    VALUES (p_event_id, v_conversation_id)
    ON CONFLICT (event_id) DO NOTHING;

    SELECT ec.conversation_id INTO v_conversation_id
      FROM public.event_conversations ec
     WHERE ec.event_id = p_event_id;

    -- El grupo acaba de nacer: su dueño entra aunque el que llama sea otro.
    IF v_organizer IS NOT NULL THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, role)
      VALUES (v_conversation_id, v_organizer, 'admin')
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET role = 'admin' WHERE conversation_participants.role <> 'admin';
    END IF;
  ELSE
    UPDATE public.conversations
       SET is_group = true,
           group_name = COALESCE(group_name,
                         (SELECT title FROM public.events WHERE id = p_event_id))
     WHERE id = v_conversation_id
       AND COALESCE(is_group, false) = false;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_conversation_id, p_user_id, CASE WHEN v_is_organizer THEN 'admin' ELSE 'member' END)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- Si el organizador ya estaba dentro como 'member' de antes, se promociona.
  IF v_is_organizer THEN
    UPDATE public.conversation_participants
       SET role = 'admin'
     WHERE conversation_id = v_conversation_id
       AND user_id = p_user_id
       AND role <> 'admin';
  END IF;

  RETURN v_conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.join_event_chat(UUID, UUID) IS
  '166: como la 106 (solo uno mismo, solo inscritos) pero el ORGANIZADOR entra '
  'sin inscripción y con role=admin: en un evento de pago no puede tener entrada, '
  'así que antes se quedaba fuera del chat de su propio evento.';

-- ---------------------------------------------------------------
-- 4. El organizador puede ver el vínculo evento ↔ conversación
-- ---------------------------------------------------------------
-- La policy de la 013 solo miraba event_participants, así que un organizador sin
-- inscripción no podía leer ni el id de la conversación de su evento.
DROP POLICY IF EXISTS "Event participants can view event conversation" ON public.event_conversations;
CREATE POLICY "Event participants can view event conversation"
  ON public.event_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = event_conversations.event_id
        AND ep.user_id = auth.uid()
        AND ep.status != 'cancelled'
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_conversations.event_id
        AND e.organizer_id = auth.uid()
    )
    OR public.is_admin()
  );

-- ---------------------------------------------------------------
-- 5. Poner al día los eventos que ya existen
-- ---------------------------------------------------------------
-- (a) Eventos que YA tienen grupo: el organizador entra (o se promociona).
INSERT INTO public.conversation_participants (conversation_id, user_id, role)
SELECT ec.conversation_id, e.organizer_id, 'admin'
  FROM public.event_conversations ec
  JOIN public.events e ON e.id = ec.event_id
 WHERE e.organizer_id IS NOT NULL
ON CONFLICT (conversation_id, user_id)
DO UPDATE SET role = 'admin' WHERE conversation_participants.role <> 'admin';

-- (b) Eventos vivos SIN grupo: se les crea con su organizador dentro. Se limita
--     a los que están por venir o en curso: crear conversaciones para eventos
--     pasados solo llenaría de grupos muertos la lista de chats de la gente.
DO $$
DECLARE
  v_evento RECORD;
  v_conv   UUID;
BEGIN
  FOR v_evento IN
    SELECT e.id, e.title, e.organizer_id
      FROM public.events e
      LEFT JOIN public.event_conversations ec ON ec.event_id = e.id
     WHERE ec.event_id IS NULL
       AND e.organizer_id IS NOT NULL
       AND COALESCE(e.status, 'upcoming') IN ('upcoming', 'ongoing')
       AND e.start_date >= NOW() - INTERVAL '1 day'
  LOOP
    INSERT INTO public.conversations (is_group, group_name, created_by)
    VALUES (true, COALESCE(v_evento.title, 'Evento'), v_evento.organizer_id)
    RETURNING id INTO v_conv;

    INSERT INTO public.event_conversations (event_id, conversation_id)
    VALUES (v_evento.id, v_conv)
    ON CONFLICT (event_id) DO NOTHING;

    INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    VALUES (v_conv, v_evento.organizer_id, 'admin')
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET role = 'admin' WHERE conversation_participants.role <> 'admin';
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 6. Comprobación tras aplicar
-- ---------------------------------------------------------------
--   -- ¿Algún evento vivo cuyo organizador NO esté en su grupo como admin?
--   SELECT e.id, e.title
--     FROM public.events e
--     JOIN public.event_conversations ec ON ec.event_id = e.id
--    WHERE e.organizer_id IS NOT NULL
--      AND NOT EXISTS (
--        SELECT 1 FROM public.conversation_participants cp
--         WHERE cp.conversation_id = ec.conversation_id
--           AND cp.user_id = e.organizer_id
--           AND cp.role = 'admin');
--   -- (debe devolver 0 filas)
