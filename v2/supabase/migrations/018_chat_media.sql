-- =====================================================
-- 018: Chat media — fotos y audios en mensajes
-- =====================================================
-- Objetivos:
--   1. Permitir message_type = 'audio'
--   2. Permitir content nullable (media-only messages)
--   3. Columnas attachment_url (path en bucket) y attachment_meta (jsonb)
--   4. Bucket privado `chat-media` con RLS por conversación

-- ─────────────────────────────────────────────────────
-- 1. messages.message_type: ampliar CHECK con 'audio'
-- ─────────────────────────────────────────────────────
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'audio', 'system'));

-- ─────────────────────────────────────────────────────
-- 2. messages.content: permitir NULL (media sin texto)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

-- ─────────────────────────────────────────────────────
-- 3. Columnas de adjunto
-- ─────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_meta JSONB;

-- ─────────────────────────────────────────────────────
-- 4. Bucket privado chat-media
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────
-- 5. Storage RLS: acceso solo a participantes de la conversación
--    Convención de path:  {conversation_id}/{message_id_or_random}.{ext}
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_media_participant_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_participant_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_owner_delete" ON storage.objects;

-- SELECT: puede leer el objeto si es participante de la conversación
CREATE POLICY "chat_media_participant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = ((storage.foldername(name))[1])::uuid
        AND cp.user_id = auth.uid()
    )
  );

-- INSERT: puede subir si es participante
CREATE POLICY "chat_media_participant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = ((storage.foldername(name))[1])::uuid
        AND cp.user_id = auth.uid()
    )
  );

-- DELETE: solo el owner (quien lo subió)
CREATE POLICY "chat_media_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
  );
