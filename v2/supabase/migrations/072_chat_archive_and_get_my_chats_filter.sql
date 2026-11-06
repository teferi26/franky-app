-- Migration 072: UX-035 chats swipe-to-archive.
--
-- Añade `is_archived` por-participant (no por-conversation) — así A puede archivar
-- la conv pero B sigue viéndola normal. Update RPC get_my_chats para filtrar.

ALTER TABLE public.conversation_participants
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conv_participants_archived
    ON public.conversation_participants(user_id, is_archived)
    WHERE is_archived = true;

/**
 * RPC `archive_conversation(p_conv_id, p_archive)` SECURITY DEFINER.
 * Marca archived/unarchived sólo para el caller. RLS de conv_participants
 * sólo permite UPDATE de propia fila — usamos SECURITY DEFINER para
 * normalizar y devolver bool de éxito.
 */
CREATE OR REPLACE FUNCTION public.archive_conversation(
    p_conversation_id UUID,
    p_archive BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    IF v_caller IS NULL THEN RETURN false; END IF;

    UPDATE public.conversation_participants
    SET is_archived = p_archive,
        archived_at = CASE WHEN p_archive THEN NOW() ELSE NULL END
    WHERE conversation_id = p_conversation_id
      AND user_id = v_caller;

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_conversation(UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.archive_conversation IS
    'UX-035: archivar conversación por-participante (no afecta al otro user).';

/**
 * Adaptación opcional al get_my_chats existente: añadimos un wrapper que
 * filtra por archived. Si get_my_chats ya devuelve la lista entera, el cliente
 * filtra is_archived client-side. Para no romper la RPC actual, dejamos al
 * cliente filtrar — más simple. Sólo añadimos esta función helper para tabs
 * "Activos" / "Archivados".
 */
CREATE OR REPLACE FUNCTION public.list_archived_chat_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT conversation_id
    FROM public.conversation_participants
    WHERE user_id = auth.uid() AND is_archived = true;
$$;

GRANT EXECUTE ON FUNCTION public.list_archived_chat_ids() TO authenticated;
