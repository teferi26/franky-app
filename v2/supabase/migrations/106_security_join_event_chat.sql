-- =====================================================================
-- 106 — SECURITY FIX: join_event_chat
-- =====================================================================
-- Problema (auditoría 2026-06-10, hallazgo C6):
--   La función es SECURITY DEFINER, estaba GRANTeada a `anon` y aceptaba
--   p_user_id libre sin comprobar auth.uid(). Cualquier visitante anónimo
--   podía meter a CUALQUIER usuario en el chat de CUALQUIER evento.
--
-- Fix:
--   1. El caller debe ser el propio usuario (auth.uid() = p_user_id),
--      salvo service_role (jobs/admin server-side).
--   2. El usuario debe estar inscrito en el evento (event_participants
--      con status distinto de 'cancelled'). El flujo del frontend ya
--      inscribe ANTES de llamar a esta RPC (event-actions.tsx).
--   3. Se revoca el EXECUTE a anon y PUBLIC.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.join_event_chat(
  p_event_id UUID,
  p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_event_title     TEXT;
  v_is_service_role BOOLEAN := COALESCE(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  -- (1) Identidad: solo uno mismo (o service_role) puede unirse en su nombre.
  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- (2) Membresía: solo inscritos en el evento entran a su chat.
  IF NOT v_is_service_role AND NOT EXISTS (
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
    SELECT e.title INTO v_event_title
    FROM public.events e
    WHERE e.id = p_event_id;

    INSERT INTO public.conversations (is_group, group_name)
    VALUES (true, COALESCE(v_event_title, 'Evento'))
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.event_conversations (event_id, conversation_id)
    VALUES (p_event_id, v_conversation_id);
  ELSE
    UPDATE public.conversations
       SET is_group = true,
           group_name = COALESCE(group_name,
                         (SELECT title FROM public.events WHERE id = p_event_id))
     WHERE id = v_conversation_id
       AND COALESCE(is_group, false) = false;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, p_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

-- (3) Permisos: fuera anon y PUBLIC.
REVOKE EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) TO authenticated, service_role;
