-- =====================================================
-- 050: Messages — add edited_at column
-- =====================================================
-- Permite distinguir mensajes editados de los originales.
-- El cliente actualiza esta columna al editar (en `updateMessage`),
-- y la UI muestra "(editado)" cuando edited_at IS NOT NULL.
-- Compatible con cualquier consulta SELECT existente.
-- =====================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.messages.edited_at IS
  'Timestamp of last edit; NULL means never edited.';
