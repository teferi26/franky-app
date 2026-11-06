-- ═══════════════════════════════════════════════════════════════════════════
-- 133: Vídeo en mensajes de chat
--
-- La app ya sabe enviar y pintar vídeo en el chat (sendVideoMessage +
-- VideoPlayer), pero faltaban dos cosas en el backend, igual que pasó con el
-- Fomo (132):
--   1. El CHECK de messages.message_type no aceptaba 'video'.
--   2. El bucket privado chat-media (018) no admitía mimetypes de vídeo ni un
--      tamaño suficiente (estaba a 5 MB).
--
-- Con esto un mensaje con vídeo se guarda y se sirve (URL firmada) reutilizando
-- todo lo existente. Las políticas RLS del bucket (018) siguen valiendo: no se
-- tocan. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. messages.message_type: ampliar CHECK con 'video'
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'audio', 'video', 'system'));

-- 2. Bucket chat-media: admitir vídeo y subir el tope a 50 MB (como ligar-media)
UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav',
    'video/mp4','video/quicktime','video/webm'
  ]
WHERE id = 'chat-media';

NOTIFY pgrst, 'reload schema';
