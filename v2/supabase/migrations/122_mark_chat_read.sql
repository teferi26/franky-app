-- =====================================================================
-- 122: mark_chat_read — marcar una conversación como leída vía RPC
--
-- Por qué: ni conversation_participants ni messages permiten los UPDATE
-- directos que intentaban web (useChat.ts) y móvil (chat.ts) para marcar
-- leído: conversation_participants no tiene NINGUNA política FOR UPDATE y
-- la de messages (113) exige sender_id = auth.uid(), pero aquí se marcan
-- mensajes AJENOS. Resultado: 0 filas afectadas en silencio y el contador
-- de no leídos de get_my_chats no bajaba nunca.
--
-- Mismo patrón que archive_conversation (072): SECURITY DEFINER con el
-- guard dentro (solo participantes de la conversación) y search_path fijo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.mark_chat_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    -- Solo un participante puede marcar como leída SU conversación.
    IF NOT EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'not a participant';
    END IF;

    UPDATE public.conversation_participants
       SET last_read_at = now()
     WHERE conversation_id = p_conversation_id
       AND user_id = v_uid;

    UPDATE public.messages
       SET read_at = now()
     WHERE conversation_id = p_conversation_id
       AND sender_id <> v_uid
       AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid) TO authenticated;
