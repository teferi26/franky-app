-- ═══════════════════════════════════════════════════════════════════════════
-- 132: Vídeo en publicaciones del Fomo (Ola 1)
--
-- El feed ya renderiza media por media_url/media_type y el RPC de lectura
-- (get_fomo_feed) los devuelve tal cual; solo faltaba permitir 'video' en el
-- CHECK de media_type. Con esto un hilo con vídeo se crea y se pinta con el
-- VideoPlayer nativo, reutilizando lo existente. Idempotente.
--
-- (El carrusel multi-foto NO va aquí: requiere ampliar la proyección de
-- get_fomo_feed y el RPC de escritura; se hará en un pase dedicado para no
-- desestabilizar el feed.)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.fomo_threads DROP CONSTRAINT IF EXISTS fomo_threads_media_type_check;
ALTER TABLE public.fomo_threads ADD CONSTRAINT fomo_threads_media_type_check
    CHECK (media_type IN ('image', 'audio', 'video'));

ALTER TABLE public.fomo_replies DROP CONSTRAINT IF EXISTS fomo_replies_media_type_check;
ALTER TABLE public.fomo_replies ADD CONSTRAINT fomo_replies_media_type_check
    CHECK (media_type IN ('image', 'audio', 'video'));

NOTIFY pgrst, 'reload schema';
