-- ═══════════════════════════════════════════════════════════════════════════
-- 160: subir el tope de vídeo de 50 MB a 1 GB
--
-- PETICIÓN (31-jul-2026): "el vídeo solo deja 50 MB, tiene que poder subir
-- vídeo hasta de 2 horas si quieren".
--
-- IMPORTANTE, LEER ANTES DE APLICAR: hay TRES topes encadenados y manda el más
-- pequeño de los tres.
--
--   1. La app          -> MAX_VIDEO_BYTES en mobile/src/lib/media.ts (1 GB).
--   2. El bucket       -> lo que hace esta migración (1 GB).
--   3. EL PROYECTO     -> Supabase → Storage → Settings → "Upload file size
--                         limit". En el plan GRATUITO no se puede subir de
--                         50 MB. Con el plan Pro sí.
--
-- Es decir: **esta migración por sí sola NO arregla nada** mientras el proyecto
-- siga en el plan gratuito. Storage seguirá devolviendo 413 al pasar de 50 MB.
-- Hay que subir también el tope del proyecto en el dashboard, y ponerlo como
-- mínimo en 1 GB para que coincida con el de los buckets.
--
-- SOBRE LAS 2 HORAS: 1 GB son unos 10-15 minutos grabando con el móvil. Dos
-- horas son entre 2 y 8 GB. Con este montaje no es realista: la subida va en
-- una sola petición, así que un cambio de red a mitad la tira entera y hay que
-- empezar de cero. Para eso hace falta subida reanudable (TUS) o directamente
-- una plataforma de vídeo (Cloudflare Stream, Mux) que además transcodifique.
--
-- COSTE: cada GB almacenado y cada GB servido se pagan aparte del plan. Un
-- vídeo de 1 GB que vean 100 personas son ~100 GB de transferencia.
--
-- Aplicable desde el SQL Editor. Idempotente. Solo cambia file_size_limit; los
-- allowed_mime_types se dejan como estaban (133 / 147 / 092).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets
   SET file_size_limit = 1073741824 -- 1 GB
 WHERE id IN ('fomo-media', 'ligar-media', 'chat-media');

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN:
--   SELECT id, file_size_limit, pg_size_pretty(file_size_limit::bigint)
--     FROM storage.buckets
--    WHERE id IN ('fomo-media','ligar-media','chat-media');
--   -- los tres deben decir 1024 MB
--
-- Y en el dashboard: Storage → Settings → Upload file size limit ≥ 1 GB.
-- Si ahí sigue puesto 50 MB, manda ese y las subidas grandes fallarán con 413.
-- ─────────────────────────────────────────────────────────────────────────
