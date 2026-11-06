-- =====================================================
-- 020: Avatars bucket — foto de perfil de cada usuario
-- =====================================================
-- Convención de path:  {user_id}/{random}.{ext}

-- ─────────────────────────────────────────────────────
-- 1. Bucket público avatars (lectura libre, escritura propia)
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  3145728, -- 3MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────
-- 2. Storage RLS: cualquiera puede leer (es público),
--    sólo el dueño puede subir/actualizar/borrar su carpeta.
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;

CREATE POLICY "avatars_public_select"
  ON storage.objects FOR SELECT
  TO public
  USING ( bucket_id = 'avatars' );

CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND owner = auth.uid()
  );

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND owner = auth.uid()
  );
