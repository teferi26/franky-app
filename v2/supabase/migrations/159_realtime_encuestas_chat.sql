-- ═══════════════════════════════════════════════════════════════════════════
-- 159: las encuestas del chat llegan en directo a quien las recibe
--
-- SÍNTOMA (31-jul-2026): quien crea la encuesta ve la tarjeta con sus opciones;
-- a los demás participantes solo les aparece "📊 Encuesta: <la pregunta>" y no
-- pueden votar.
--
-- CAUSA RAÍZ: son DOS cosas distintas en pantalla.
--   · El texto "📊 Encuesta: …" es el mensaje ancla que inserta
--     create_chat_poll desde la migración 148. Va por la tabla `messages`, que
--     SÍ está en la publicación de realtime (001:795), así que llega al
--     instante.
--   · La tarjeta con las opciones se pinta desde `chat_polls`, y esa tabla
--     NUNCA se añadió a la publicación `supabase_realtime` (la 135 la creó pero
--     no la publicó). El cliente se suscribe a sus cambios
--     (subscribeToChatPolls) y no recibe nada, así que con el chat abierto
--     nunca vuelve a pedir las encuestas: se queda con el mensaje ancla y sin
--     tarjeta.
--
-- Lo mismo pasaba con `chat_poll_votes`: los votos de los demás no se veían
-- llegar, solo al reabrir la conversación.
--
-- La RLS ya estaba bien (135): cualquier participante puede leer la encuesta.
-- Aquí solo se publica, no se abre nada: el realtime de Supabase respeta la RLS
-- de cada tabla al repartir los cambios.
--
-- Aplicable desde el SQL Editor. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF to_regclass('public.chat_polls') IS NULL THEN
    RAISE NOTICE '159: public.chat_polls no existe; aplica antes la 135.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_polls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_polls;
    RAISE NOTICE '159: chat_polls añadida a supabase_realtime.';
  ELSE
    RAISE NOTICE '159: chat_polls ya estaba en supabase_realtime.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_votes;
    RAISE NOTICE '159: chat_poll_votes añadida a supabase_realtime.';
  ELSE
    RAISE NOTICE '159: chat_poll_votes ya estaba en supabase_realtime.';
  END IF;
END
$do$;

-- Mismo problema, misma familia: las reacciones a mensajes (migración 130)
-- tampoco se publicaron nunca, así que un corazón de otra persona no aparecía
-- hasta reabrir el chat.
DO $do$
BEGIN
  IF to_regclass('public.message_reactions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    RAISE NOTICE '159: message_reactions añadida a supabase_realtime.';
  END IF;
END
$do$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN:
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--      AND tablename IN ('chat_polls','chat_poll_votes','message_reactions','messages');
--   -- deben salir las cuatro
-- ─────────────────────────────────────────────────────────────────────────
