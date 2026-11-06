-- ═══════════════════════════════════════════════════════════════════════════
-- 135: Encuestas y quedadas dentro del chat (mejora 58 del ciclo 2)
--
-- Los chats de grupo ya existen (conversations.is_group + create_group_chat,
-- migración 019): esto NO los reinventa. Lo que faltaba era poder lanzar una
-- encuesta ("¿a qué hora quedamos?") o una quedada dentro de una conversación.
--
-- Diseño: la encuesta cuelga de la conversación y opcionalmente del mensaje
-- que la anuncia, para poder pintarla en su sitio del hilo. Un voto por
-- persona y opción (multi = varias opciones permitidas).
--
-- RLS: solo participantes de la conversación ven y votan. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  author_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  options         TEXT[] NOT NULL,
  multi           BOOLEAN NOT NULL DEFAULT false,
  -- Si va con fecha/lugar, la encuesta es una QUEDADA (no solo una pregunta).
  meetup_at       TIMESTAMPTZ,
  meetup_place    TEXT,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_polls_question_len CHECK (char_length(question) BETWEEN 1 AND 200),
  CONSTRAINT chat_polls_options_len  CHECK (array_length(options, 1) BETWEEN 2 AND 8)
);

CREATE INDEX IF NOT EXISTS idx_chat_polls_conv
  ON public.chat_polls (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_poll_votes (
  poll_id      UUID NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index INT  NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id, option_index),
  CONSTRAINT chat_poll_votes_idx_ok CHECK (option_index >= 0)
);

ALTER TABLE public.chat_polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

-- ── RLS: todo gira en torno a "soy participante de esa conversación" ────────
DROP POLICY IF EXISTS "chat_polls_participant_select" ON public.chat_polls;
CREATE POLICY "chat_polls_participant_select"
  ON public.chat_polls FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = chat_polls.conversation_id AND cp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "chat_polls_participant_insert" ON public.chat_polls;
CREATE POLICY "chat_polls_participant_insert"
  ON public.chat_polls FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = chat_polls.conversation_id AND cp.user_id = auth.uid()
    )
  );

-- Cerrar la encuesta: solo quien la creó.
DROP POLICY IF EXISTS "chat_polls_author_update" ON public.chat_polls;
CREATE POLICY "chat_polls_author_update"
  ON public.chat_polls FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "chat_poll_votes_participant_select" ON public.chat_poll_votes;
CREATE POLICY "chat_poll_votes_participant_select"
  ON public.chat_poll_votes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_polls p
    JOIN public.conversation_participants cp ON cp.conversation_id = p.conversation_id
    WHERE p.id = chat_poll_votes.poll_id AND cp.user_id = auth.uid()
  ));

-- Votar y desvotar: solo tus propios votos, y solo si eres participante.
DROP POLICY IF EXISTS "chat_poll_votes_own_write" ON public.chat_poll_votes;
CREATE POLICY "chat_poll_votes_own_write"
  ON public.chat_poll_votes FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_polls p
      JOIN public.conversation_participants cp ON cp.conversation_id = p.conversation_id
      WHERE p.id = chat_poll_votes.poll_id AND cp.user_id = auth.uid()
        AND p.closed_at IS NULL
    )
  );

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Crear encuesta o quedada. Devuelve el id de la encuesta.
CREATE OR REPLACE FUNCTION public.create_chat_poll(
  p_conversation UUID,
  p_question     TEXT,
  p_options      TEXT[],
  p_multi        BOOLEAN DEFAULT false,
  p_meetup_at    TIMESTAMPTZ DEFAULT NULL,
  p_meetup_place TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation AND user_id = v_me
  ) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  INSERT INTO public.chat_polls
    (conversation_id, author_id, question, options, multi, meetup_at, meetup_place)
  VALUES
    (p_conversation, v_me, trim(p_question), p_options, COALESCE(p_multi, false), p_meetup_at, p_meetup_place)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_chat_poll(UUID, TEXT, TEXT[], BOOLEAN, TIMESTAMPTZ, TEXT) TO authenticated;

-- Votar. En encuestas de opción única sustituye el voto anterior; en multi
-- funciona como interruptor sobre esa opción.
CREATE OR REPLACE FUNCTION public.vote_chat_poll(p_poll UUID, p_option INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_multi BOOLEAN;
  v_open  BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT p.multi, (p.closed_at IS NULL) INTO v_multi, v_open
  FROM public.chat_polls p
  JOIN public.conversation_participants cp ON cp.conversation_id = p.conversation_id
  WHERE p.id = p_poll AND cp.user_id = v_me;

  IF v_multi IS NULL THEN RAISE EXCEPTION 'poll_not_found'; END IF;
  IF NOT v_open THEN RAISE EXCEPTION 'poll_closed'; END IF;

  IF v_multi THEN
    IF EXISTS (SELECT 1 FROM public.chat_poll_votes
               WHERE poll_id = p_poll AND user_id = v_me AND option_index = p_option) THEN
      DELETE FROM public.chat_poll_votes
        WHERE poll_id = p_poll AND user_id = v_me AND option_index = p_option;
    ELSE
      INSERT INTO public.chat_poll_votes (poll_id, user_id, option_index)
      VALUES (p_poll, v_me, p_option);
    END IF;
  ELSE
    DELETE FROM public.chat_poll_votes WHERE poll_id = p_poll AND user_id = v_me;
    INSERT INTO public.chat_poll_votes (poll_id, user_id, option_index)
    VALUES (p_poll, v_me, p_option);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_chat_poll(UUID, INT) TO authenticated;

-- Resultados: recuento por opción y qué he votado yo.
CREATE OR REPLACE FUNCTION public.get_chat_poll(p_poll UUID)
RETURNS TABLE (
  option_index INT,
  votes        BIGINT,
  mine         BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_polls p
    JOIN public.conversation_participants cp ON cp.conversation_id = p.conversation_id
    WHERE p.id = p_poll AND cp.user_id = v_me
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v.option_index,
         COUNT(*)::BIGINT,
         bool_or(v.user_id = v_me)
  FROM public.chat_poll_votes v
  WHERE v.poll_id = p_poll
  GROUP BY v.option_index
  ORDER BY v.option_index;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_poll(UUID) TO authenticated;

COMMENT ON TABLE public.chat_polls IS
  '135: encuestas y quedadas dentro de una conversación (mejora 58).';

NOTIFY pgrst, 'reload schema';
