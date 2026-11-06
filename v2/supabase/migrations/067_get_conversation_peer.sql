-- Migration 067: RPC get_conversation_peer
--
-- Devuelve el peer_user_id en un chat 1:1 (is_group=false). Security definer
-- porque conversation_participants RLS sólo permite ver tu propia entry.
-- Verifica que el caller sea participante para evitar leak de identidades.
--
-- Usado por el cliente Android para derivar la E2E conversation key ECDH.

CREATE OR REPLACE FUNCTION public.get_conversation_peer(p_conversation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_peer UUID;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    -- Verifica que el caller es participante de la conversación.
    IF NOT EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = p_conversation_id
          AND user_id = v_caller
    ) THEN
        RETURN NULL;
    END IF;

    -- Devuelve el otro participante (solo aplica a 1:1, ignora grupos).
    SELECT user_id INTO v_peer
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id <> v_caller
    LIMIT 1;

    RETURN v_peer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_peer(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_conversation_peer IS
    'Devuelve el peer user_id en un chat 1:1. Usado por E2E para derivar conversation key.';
