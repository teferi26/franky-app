-- Migration 068: messages — reply_to_id para quote-reply + index acelera fetch.
--
-- CHAT-007: reply quote. Cada message puede referenciar otro message via
-- `reply_to_id`. UI muestra el quote del padre encima del bubble.
--
-- Bonus BE-019: index sobre (conversation_id, created_at DESC) para acelerar
-- `get_my_chats` que ordena por last_message_at.

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS reply_to_id UUID
        REFERENCES public.messages(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_id)
    WHERE reply_to_id IS NOT NULL;

-- Para CHAT-003 (typing indicator) NO necesitamos tabla. Lo hacemos via
-- Supabase Realtime broadcast (efímero, no persiste). El cliente envía
-- `channel.broadcast('typing', { user_id, is_typing })` y el otro escucha.

-- BE-019: index para get_my_chats — ya hay uno en messages(conversation_id),
-- añadimos compuesto con created_at DESC para acelerar el `last_message_at`.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc
    ON public.messages(conversation_id, created_at DESC)
    WHERE is_deleted IS NOT TRUE;

COMMENT ON COLUMN public.messages.reply_to_id IS
    'Quote-reply: referencia al message respondido. NULL si no es reply.';
