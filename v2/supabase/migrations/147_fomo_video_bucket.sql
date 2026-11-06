-- ═══════════════════════════════════════════════════════════════════════════
-- 147: El bucket fomo-media admite vídeo (el eslabón que faltaba)
--
-- La migración 132 amplió el CHECK de fomo_threads.media_type con 'video' y el
-- cliente ya sube y publica vídeo... pero el BUCKET fomo-media (078) seguía
-- admitiendo solo imagen y audio con tope de 10 MB. Resultado: el storage
-- rechazaba el vídeo por MIME antes de llegar a la tabla, y "no dejaba subir
-- vídeos como publicación" aunque todo lo demás estuviera listo.
--
-- Se alinea con ligar-media (092): vídeo mp4/quicktime/webm y tope de 50 MB.
-- El tope solo sube el máximo por archivo: las imágenes y audios siguen
-- limitados por el cliente (5/10 MB en publicar.tsx).
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/aac',
    'video/mp4','video/quicktime','video/webm'
  ]
WHERE id = 'fomo-media';

NOTIFY pgrst, 'reload schema';
