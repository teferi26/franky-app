-- =====================================================
-- 062: Add messages.is_deleted column for soft-delete
-- =====================================================
-- El cliente mobile filtra mensajes con `is_deleted=neq.true`, pero la columna
-- no existe en la tabla → BadRequestRestException → chat thread no carga.
-- =====================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_not_deleted
  ON public.messages(conversation_id, created_at DESC)
  WHERE is_deleted = false;

NOTIFY pgrst, 'reload schema';
