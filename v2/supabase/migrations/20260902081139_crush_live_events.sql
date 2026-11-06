-- ============================================================================
-- Crush Live: descubrimiento romántico privado dentro de eventos Franky.
--
-- Seguridad y producto:
--   * Solo eventos oficiales con crush_live_enabled=true.
--   * Solo participantes reales (registro activo o entrada valid/used).
--   * Consentimiento por evento, 18+ y email estudiantil verificado.
--   * Likes privados; el receptor no puede consultar quién le dio like.
--   * Match bilateral, idempotente y serializado; crea/reutiliza chat directo.
--   * El porcentaje y sus razones se congelan en el momento del match.
--   * Bloquear a alguien oculta candidatos y matches sin borrar el histórico.
--
-- Las funciones SECURITY DEFINER viven en private (no expuesto por Data API).
-- Las RPC públicas son wrappers SECURITY INVOKER con permisos mínimos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Activación explícita por evento oficial
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS crush_live_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.crush_live_enabled IS
  'Activa Crush Live en este evento. Solo puede ser true cuando is_official=true.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'events_crush_live_requires_official'
       AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_crush_live_requires_official
      CHECK (NOT crush_live_enabled OR is_official);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_events_crush_live_active
  ON public.events (start_date)
  WHERE is_official = true AND crush_live_enabled = true;

-- ---------------------------------------------------------------------------
-- 2. Modelo privado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crush_live_profiles (
  event_id          UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  active            BOOLEAN     NOT NULL DEFAULT true,
  goal              TEXT        NOT NULL
    CHECK (goal IN ('conocer', 'dejarse_llevar', 'relacion')),
  preferred_genders TEXT[]      NOT NULL,
  age_min           SMALLINT    NOT NULL,
  age_max           SMALLINT    NOT NULL,
  answers           JSONB       NOT NULL,
  consented_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT crush_live_profiles_gender_values CHECK (
    cardinality(preferred_genders) BETWEEN 1 AND 3
    AND preferred_genders <@ ARRAY['hombre', 'mujer', 'no_binario']::TEXT[]
  ),
  CONSTRAINT crush_live_profiles_age_range CHECK (
    age_min BETWEEN 18 AND 99
    AND age_max BETWEEN 18 AND 99
    AND age_min <= age_max
  ),
  CONSTRAINT crush_live_profiles_answers_shape CHECK (
    jsonb_typeof(answers) = 'object'
    AND answers ?& ARRAY['social_energy', 'spontaneity', 'communication', 'affection', 'schedule']
    AND jsonb_typeof(answers->'social_energy') = 'number'
    AND jsonb_typeof(answers->'spontaneity') = 'number'
    AND jsonb_typeof(answers->'communication') = 'number'
    AND jsonb_typeof(answers->'affection') = 'number'
    AND jsonb_typeof(answers->'schedule') = 'number'
    AND COALESCE(answers->>'social_energy', '') ~ '^[1-5]$'
    AND COALESCE(answers->>'spontaneity', '') ~ '^[1-5]$'
    AND COALESCE(answers->>'communication', '') ~ '^[1-5]$'
    AND COALESCE(answers->>'affection', '') ~ '^[1-5]$'
    AND COALESCE(answers->>'schedule', '') ~ '^[1-5]$'
    AND octet_length(answers::TEXT) <= 2048
  )
);

COMMENT ON TABLE public.crush_live_profiles IS
  'Consentimiento y preferencias de Crush Live, independientes para cada evento.';

CREATE INDEX IF NOT EXISTS idx_crush_live_profiles_user
  ON public.crush_live_profiles (user_id, active, event_id);
CREATE INDEX IF NOT EXISTS idx_crush_live_profiles_active_event
  ON public.crush_live_profiles (event_id, user_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.crush_live_swipes (
  event_id   UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  swiper_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action     TEXT        NOT NULL CHECK (action IN ('like', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, swiper_id, target_id),
  CONSTRAINT crush_live_swipes_not_self CHECK (swiper_id <> target_id)
);

COMMENT ON TABLE public.crush_live_swipes IS
  'Decisiones privadas e inmutables. Solo el autor puede consultar su swipe.';

CREATE INDEX IF NOT EXISTS idx_crush_live_swipes_reciprocal
  ON public.crush_live_swipes (event_id, target_id, swiper_id, action);
CREATE INDEX IF NOT EXISTS idx_crush_live_swipes_rate_limit
  ON public.crush_live_swipes (swiper_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crush_live_matches (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT conserva el historial: un evento con matches debe archivarse,
  -- no borrarse físicamente. El borrado de cuenta sí elimina datos por GDPR.
  event_id              UUID        NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  user_a_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id       UUID        REFERENCES public.conversations(id) ON DELETE SET NULL,
  compatibility         SMALLINT    NOT NULL CHECK (compatibility BETWEEN 0 AND 100),
  compatibility_reasons TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
  compatibility_breakdown JSONB     NOT NULL DEFAULT '{}'::JSONB,
  matched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crush_live_matches_ordered_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT crush_live_matches_unique_pair UNIQUE (event_id, user_a_id, user_b_id)
);

COMMENT ON TABLE public.crush_live_matches IS
  'Match bilateral persistente. Compatibilidad y razones quedan congeladas al crearlo.';

CREATE INDEX IF NOT EXISTS idx_crush_live_matches_user_a
  ON public.crush_live_matches (user_a_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_crush_live_matches_user_b
  ON public.crush_live_matches (user_b_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_crush_live_matches_event
  ON public.crush_live_matches (event_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_crush_live_matches_conversation
  ON public.crush_live_matches (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Un registro separado conserva la respuesta exacta de cada operación y hace
-- que reintentar el mismo UUID sea seguro incluso tras crear match/chat/avisos.
CREATE TABLE IF NOT EXISTS public.crush_live_swipe_requests (
  actor_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key UUID        NOT NULL,
  event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  target_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL CHECK (action IN ('like', 'pass')),
  response        JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key),
  CONSTRAINT crush_live_swipe_requests_not_self CHECK (actor_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_crush_live_swipe_requests_retention
  ON public.crush_live_swipe_requests (actor_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. RLS y privilegios de tabla
-- ---------------------------------------------------------------------------
ALTER TABLE public.crush_live_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crush_live_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crush_live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crush_live_swipe_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crush_live_profiles_select_own ON public.crush_live_profiles;
CREATE POLICY crush_live_profiles_select_own
  ON public.crush_live_profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS crush_live_swipes_select_own ON public.crush_live_swipes;
CREATE POLICY crush_live_swipes_select_own
  ON public.crush_live_swipes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = swiper_id);

DROP POLICY IF EXISTS crush_live_matches_select_participant ON public.crush_live_matches;
CREATE POLICY crush_live_matches_select_participant
  ON public.crush_live_matches FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IN (user_a_id, user_b_id)
    AND NOT EXISTS (
      SELECT 1
        FROM public.user_blocks b
       WHERE (b.blocker_id = user_a_id AND b.blocked_id = user_b_id)
          OR (b.blocker_id = user_b_id AND b.blocked_id = user_a_id)
    )
    AND NOT EXISTS (
      SELECT 1
        FROM public.blocked_users b
       WHERE (b.blocker_id = user_a_id AND b.blocked_id = user_b_id)
          OR (b.blocker_id = user_b_id AND b.blocked_id = user_a_id)
    )
  );

-- Un bloqueo debe cortar también los mensajes de un chat directo ya creado.
-- La policy histórica sigue validando sender_id y pertenencia; esta se combina
-- como AND y no altera los chats de grupo.
DROP POLICY IF EXISTS blocked_pairs_cannot_message_directly ON public.messages;
CREATE POLICY blocked_pairs_cannot_message_directly
  ON public.messages AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1
        FROM public.conversations c
        JOIN public.conversation_participants peer_cp
          ON peer_cp.conversation_id = c.id
         AND peer_cp.user_id <> (SELECT auth.uid())
        JOIN public.user_blocks ub
          ON (ub.blocker_id = (SELECT auth.uid()) AND ub.blocked_id = peer_cp.user_id)
          OR (ub.blocker_id = peer_cp.user_id AND ub.blocked_id = (SELECT auth.uid()))
       WHERE c.id = messages.conversation_id
         AND COALESCE(c.is_group, false) = false
    )
  );

-- Editar un mensaje también puede utilizarse para volver a contactar. Se
-- exige pertenencia en ambas imágenes de la fila y se aplica el mismo corte
-- por bloqueo que al INSERT.
DROP POLICY IF EXISTS blocked_pairs_cannot_update_direct_messages ON public.messages;
CREATE POLICY blocked_pairs_cannot_update_direct_messages
  ON public.messages AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.conversation_participants own_cp
       WHERE own_cp.conversation_id = messages.conversation_id
         AND own_cp.user_id = (SELECT auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
        FROM public.conversations c
        JOIN public.conversation_participants peer_cp
          ON peer_cp.conversation_id = c.id
         AND peer_cp.user_id <> (SELECT auth.uid())
        JOIN public.user_blocks ub
          ON (ub.blocker_id = (SELECT auth.uid()) AND ub.blocked_id = peer_cp.user_id)
          OR (ub.blocker_id = peer_cp.user_id AND ub.blocked_id = (SELECT auth.uid()))
       WHERE c.id = messages.conversation_id
         AND COALESCE(c.is_group, false) = false
    )
  )
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.conversation_participants own_cp
       WHERE own_cp.conversation_id = messages.conversation_id
         AND own_cp.user_id = (SELECT auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
        FROM public.conversations c
        JOIN public.conversation_participants peer_cp
          ON peer_cp.conversation_id = c.id
         AND peer_cp.user_id <> (SELECT auth.uid())
        JOIN public.user_blocks ub
          ON (ub.blocker_id = (SELECT auth.uid()) AND ub.blocked_id = peer_cp.user_id)
          OR (ub.blocker_id = peer_cp.user_id AND ub.blocked_id = (SELECT auth.uid()))
       WHERE c.id = messages.conversation_id
         AND COALESCE(c.is_group, false) = false
    )
  );

-- Sin política para crush_live_swipe_requests: solo las funciones internas
-- pueden leerla. Tampoco hay políticas de escritura directa en ninguna tabla.
REVOKE ALL ON TABLE public.crush_live_profiles,
                    public.crush_live_swipes,
                    public.crush_live_matches,
                    public.crush_live_swipe_requests
  FROM PUBLIC, anon, authenticated;
-- Los clientes consumen exclusivamente las RPC. En particular, no se concede
-- SELECT directo sobre compatibility_breakdown ni sobre likes entrantes.

-- ---------------------------------------------------------------------------
-- 4. Helpers internos (private no se incluye en schemas expuestos)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Autor y conversación forman la identidad de un mensaje. El cliente puede
-- editar contenido/estado, pero nunca reciclar una fila como mensaje nuevo en
-- otro chat (incluido uno bloqueado).
CREATE OR REPLACE FUNCTION private.messages_enforce_immutable_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    RAISE EXCEPTION 'message_identity_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_immutable_identity ON public.messages;
CREATE TRIGGER trg_messages_immutable_identity
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_enforce_immutable_identity();

CREATE OR REPLACE FUNCTION private.crush_live_age(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE WHEN p.birth_date IS NULL THEN NULL
              ELSE EXTRACT(YEAR FROM age(CURRENT_DATE, p.birth_date))::INTEGER END
    FROM public.profiles p
   WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION private.crush_live_is_participant(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.event_participants ep
      JOIN public.events e ON e.id = ep.event_id
     WHERE ep.event_id = p_event_id
       AND ep.user_id = p_user_id
       AND ep.status IN ('registered', 'attended')
       -- En eventos cobrados por Franky una fila de inscripción se puede
       -- forjar por la policy histórica; la entrada valid/used es la prueba.
       AND COALESCE(e.payment_mode, 'free') IN ('free', 'info')
  ) OR EXISTS (
    SELECT 1
      FROM public.event_tickets et
     WHERE et.event_id = p_event_id
       AND et.holder_id = p_user_id
       AND et.status IN ('valid', 'used')
  );
$$;

CREATE OR REPLACE FUNCTION private.crush_live_is_blocked(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_blocks b
     WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
        OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
  ) OR EXISTS (
    SELECT 1
      FROM public.blocked_users b
     WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
        OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
  );
$$;

-- Serializa un bloqueo/desbloqueo con cualquier swipe de la misma pareja,
-- también si el bloqueo nació en blocked_users y llegó por el trigger espejo.
CREATE OR REPLACE FUNCTION private.crush_live_lock_block_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_blocker UUID;
  v_blocked UUID;
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.blocker_id, NEW.blocked_id)
        IS DISTINCT FROM (OLD.blocker_id, OLD.blocked_id) THEN
    RAISE EXCEPTION 'block_pair_immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_blocker := OLD.blocker_id;
    v_blocked := OLD.blocked_id;
  ELSE
    v_blocker := NEW.blocker_id;
    v_blocked := NEW.blocked_id;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'crush-live-pair:' || LEAST(v_blocker, v_blocked)::TEXT
      || ':' || GREATEST(v_blocker, v_blocked)::TEXT,
      0
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crush_live_lock_user_block_pair ON public.user_blocks;
CREATE TRIGGER trg_crush_live_lock_user_block_pair
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION private.crush_live_lock_block_pair();

-- No reutiliza public.is_adult(): la migración 098 lo dejó temporalmente en
-- 16 años. Crush Live tiene un gate independiente y explícito de 18 años.
CREATE OR REPLACE FUNCTION private.crush_live_is_eligible(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.birth_date IS NOT NULL
         AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
         AND COALESCE(p.student_email_verified, false)
         AND p.gender IN ('hombre', 'mujer', 'no_binario')
         AND COALESCE(p.is_discarded, false) = false
         AND COALESCE(p.is_hidden, false) = false
         AND COALESCE(p.photo_hidden, false) = false
         AND (
           NULLIF(btrim(p.avatar_url), '') IS NOT NULL
           OR EXISTS (
             SELECT 1
               FROM unnest(COALESCE(p.photos, '{}'::TEXT[])) AS photo(url)
              WHERE NULLIF(btrim(photo.url), '') IS NOT NULL
           )
         )
        FROM public.profiles p
       WHERE p.id = p_user_id
    ),
    false
  );
$$;

-- Score simétrico y explicable (100 puntos):
--   objetivo 20 + cinco respuestas x 12 = 60 + intereses compartidos 20.
CREATE OR REPLACE FUNCTION private.crush_live_compatibility(
  p_event_id UUID,
  p_user_a UUID,
  p_user_b UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a public.crush_live_profiles%ROWTYPE;
  v_b public.crush_live_profiles%ROWTYPE;
  v_profile_a public.profiles%ROWTYPE;
  v_profile_b public.profiles%ROWTYPE;
  v_goal_points INTEGER := 0;
  v_shared_count INTEGER := 0;
  v_interest_points INTEGER := 0;
  v_answer_points INTEGER := 0;
  v_points INTEGER;
  v_difference INTEGER;
  v_key TEXT;
  v_label TEXT;
  v_reasons TEXT[] := '{}'::TEXT[];
  v_answer_breakdown JSONB := '{}'::JSONB;
BEGIN
  SELECT * INTO v_a
    FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = p_user_a;
  SELECT * INTO v_b
    FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = p_user_b;
  SELECT * INTO v_profile_a FROM public.profiles WHERE id = p_user_a;
  SELECT * INTO v_profile_b FROM public.profiles WHERE id = p_user_b;

  IF v_a.user_id IS NULL OR v_b.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'compatibility', 0,
      'compatibility_reasons', '[]'::JSONB,
      'breakdown', jsonb_build_object('goal', 0, 'answers', '{}'::JSONB, 'interests', 0)
    );
  END IF;

  v_goal_points := CASE
    WHEN v_a.goal = v_b.goal THEN 20
    WHEN 'dejarse_llevar' IN (v_a.goal, v_b.goal) THEN 12
    ELSE 6
  END;

  IF v_a.goal = v_b.goal THEN
    v_reasons := array_append(v_reasons, 'Buscáis lo mismo');
  ELSIF v_goal_points >= 12 THEN
    v_reasons := array_append(v_reasons, 'Objetivos compatibles');
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_shared_count
    FROM (
      SELECT DISTINCT lower(btrim(tag)) AS tag
        FROM unnest(
          COALESCE(v_profile_a.interests, '{}'::TEXT[])
          || COALESCE(v_profile_a.hobbies, '{}'::TEXT[])
        ) AS a(tag)
       WHERE NULLIF(btrim(tag), '') IS NOT NULL
      INTERSECT
      SELECT DISTINCT lower(btrim(tag)) AS tag
        FROM unnest(
          COALESCE(v_profile_b.interests, '{}'::TEXT[])
          || COALESCE(v_profile_b.hobbies, '{}'::TEXT[])
        ) AS b(tag)
       WHERE NULLIF(btrim(tag), '') IS NOT NULL
    ) shared;

  v_interest_points := LEAST(v_shared_count * 5, 20);
  IF v_shared_count > 0 THEN
    v_reasons := array_prepend(
      v_shared_count::TEXT || CASE WHEN v_shared_count = 1
        THEN ' interés en común' ELSE ' intereses en común' END,
      v_reasons
    );
  END IF;

  FOR v_key, v_label IN
    SELECT * FROM (VALUES
      ('social_energy', 'Energía social parecida'),
      ('spontaneity',   'Espontaneidad compatible'),
      ('communication', 'Comunicación afín'),
      ('affection',     'Forma de dar cariño afín'),
      ('schedule',      'Horarios compatibles')
    ) AS dimensions(key, label)
  LOOP
    v_difference := abs((v_a.answers->>v_key)::INTEGER - (v_b.answers->>v_key)::INTEGER);
    v_points := GREATEST(12 - (v_difference * 3), 0);
    v_answer_points := v_answer_points + v_points;
    v_answer_breakdown := v_answer_breakdown || jsonb_build_object(v_key, v_points);
    IF v_difference <= 1 THEN
      v_reasons := array_append(v_reasons, v_label);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'compatibility', LEAST(v_goal_points + v_answer_points + v_interest_points, 100),
    'compatibility_reasons', COALESCE(to_jsonb(v_reasons[1:3]), '[]'::JSONB),
    'breakdown', jsonb_build_object(
      'goal', jsonb_build_object('points', v_goal_points, 'max', 20),
      'answers', jsonb_build_object('points', v_answer_points, 'max', 60, 'dimensions', v_answer_breakdown),
      'interests', jsonb_build_object('points', v_interest_points, 'max', 20, 'shared_count', v_shared_count)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.crush_live_get_or_create_conversation(
  p_user_a UUID,
  p_user_b UUID,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- El caller ya posee el advisory lock ordenado de la pareja.
  SELECT c.id
    INTO v_conversation_id
    FROM public.conversations c
    JOIN public.conversation_participants a
      ON a.conversation_id = c.id AND a.user_id = p_user_a
    JOIN public.conversation_participants b
      ON b.conversation_id = c.id AND b.user_id = p_user_b
   WHERE COALESCE(c.is_group, false) = false
     AND COALESCE(c.type, 'direct') = 'direct'
     AND (SELECT COUNT(*) FROM public.conversation_participants cp
           WHERE cp.conversation_id = c.id) = 2
   ORDER BY c.created_at, c.id
   LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (type, is_group, created_by)
    VALUES ('direct', false, p_created_by)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conversation_id, p_user_a), (v_conversation_id, p_user_b)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  RETURN v_conversation_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Núcleo de RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_crush_live_events_core()
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'image_url', e.image_url,
    'start_date', e.start_date,
    'end_date', e.end_date,
    'status', e.status,
    'enrolled', true
  )
    FROM public.events e
   WHERE e.is_official = true
     AND e.crush_live_enabled = true
     AND e.status IN ('upcoming', 'ongoing')
     AND private.crush_live_is_participant(e.id, v_user)
   ORDER BY e.start_date, e.id;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_crush_live_state_core(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event public.events%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_live public.crush_live_profiles%ROWTYPE;
  v_participant BOOLEAN := false;
  v_eligible BOOLEAN := false;
  v_available BOOLEAN := false;
  v_age INTEGER;
  v_reason TEXT;
  v_profile_json JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;
  SELECT * INTO v_live
    FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = v_user;

  v_age := private.crush_live_age(v_user);
  v_participant := v_event.id IS NOT NULL
    AND private.crush_live_is_participant(p_event_id, v_user);
  v_eligible := private.crush_live_is_eligible(v_user);

  v_reason := CASE
    WHEN v_event.id IS NULL THEN 'event_not_found'
    WHEN NOT COALESCE(v_event.is_official, false) THEN 'not_official'
    WHEN NOT COALESCE(v_event.crush_live_enabled, false) THEN 'disabled'
    WHEN COALESCE(v_event.status, '') NOT IN ('upcoming', 'ongoing') THEN 'event_closed'
    WHEN NOT v_participant THEN 'not_participant'
    WHEN NOT COALESCE(v_profile.student_email_verified, false) THEN 'student_verification_required'
    WHEN v_age IS NULL OR v_age < 18 THEN 'age_required'
    WHEN COALESCE(v_profile.gender, '') NOT IN ('hombre', 'mujer', 'no_binario') THEN 'missing_gender'
    WHEN COALESCE(v_profile.is_discarded, false)
      OR COALESCE(v_profile.is_hidden, false)
      OR COALESCE(v_profile.photo_hidden, false) THEN 'profile_unavailable'
    WHEN NULLIF(btrim(v_profile.avatar_url), '') IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(v_profile.photos, '{}'::TEXT[])) AS photo(url)
         WHERE NULLIF(btrim(photo.url), '') IS NOT NULL
      ) THEN 'photo_required'
    ELSE NULL
  END;

  v_available := v_reason IS NULL;

  IF v_live.user_id IS NOT NULL THEN
    v_profile_json := jsonb_build_object(
      'active', v_live.active,
      'goal', v_live.goal,
      'preferred_genders', v_live.preferred_genders,
      'age_min', v_live.age_min,
      'age_max', v_live.age_max,
      'answers', v_live.answers
    );
  END IF;

  RETURN jsonb_build_object(
    'event', CASE WHEN v_event.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'image_url', v_event.image_url,
      'start_date', v_event.start_date,
      'end_date', v_event.end_date,
      'status', v_event.status
    ) END,
    'available', v_available,
    'reason', v_reason,
    'participant', v_participant,
    'eligible', v_eligible,
    'age', v_age,
    'student_verified', COALESCE(v_profile.student_email_verified, false),
    'profile', v_profile_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.set_crush_live_profile_core(
  p_event_id UUID,
  p_active BOOLEAN,
  p_goal TEXT,
  p_preferred_genders TEXT[],
  p_age_min INTEGER,
  p_age_max INTEGER,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event public.events%ROWTYPE;
  v_existing public.crush_live_profiles%ROWTYPE;
  v_genders TEXT[];
  v_answers JSONB;
  v_saved public.crush_live_profiles%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  -- Retirar consentimiento siempre es posible, incluso tras cerrar el evento.
  IF NOT COALESCE(p_active, false) THEN
    UPDATE public.crush_live_profiles
       SET active = false,
           deactivated_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE event_id = p_event_id AND user_id = v_user
    RETURNING * INTO v_saved;

    -- No quedan likes latentes que puedan producir un match al reactivar.
    DELETE FROM public.crush_live_swipes
     WHERE event_id = p_event_id
       AND (swiper_id = v_user OR target_id = v_user);

    IF v_saved.user_id IS NULL THEN
      RETURN jsonb_build_object(
        'active', false,
        'goal', NULL,
        'preferred_genders', '[]'::JSONB,
        'age_min', 18,
        'age_max', 35,
        'answers', NULL
      );
    END IF;

    RETURN jsonb_build_object(
      'active', false,
      'goal', v_saved.goal,
      'preferred_genders', v_saved.preferred_genders,
      'age_min', v_saved.age_min,
      'age_max', v_saved.age_max,
      'answers', v_saved.answers
    );
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR SHARE;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT COALESCE(v_event.is_official, false)
    OR NOT COALESCE(v_event.crush_live_enabled, false) THEN
    RAISE EXCEPTION 'crush_live_unavailable';
  END IF;
  IF COALESCE(v_event.status, '') NOT IN ('upcoming', 'ongoing') THEN
    RAISE EXCEPTION 'event_closed';
  END IF;
  IF NOT private.crush_live_is_participant(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF NOT private.crush_live_is_eligible(v_user) THEN
    RAISE EXCEPTION 'profile_not_eligible';
  END IF;

  IF lower(btrim(COALESCE(p_goal, ''))) NOT IN ('conocer', 'dejarse_llevar', 'relacion') THEN
    RAISE EXCEPTION 'invalid_goal';
  END IF;

  SELECT COALESCE(array_agg(gender ORDER BY gender), '{}'::TEXT[])
    INTO v_genders
    FROM (
      SELECT DISTINCT lower(btrim(value)) AS gender
        FROM unnest(COALESCE(p_preferred_genders, '{}'::TEXT[])) AS item(value)
    ) normalized
   WHERE gender IN ('hombre', 'mujer', 'no_binario');

  IF cardinality(v_genders) = 0
    OR cardinality(v_genders) <> cardinality(COALESCE(p_preferred_genders, '{}'::TEXT[])) THEN
    RAISE EXCEPTION 'invalid_preferred_genders';
  END IF;
  IF p_age_min IS NULL OR p_age_max IS NULL
    OR p_age_min NOT BETWEEN 18 AND 99
    OR p_age_max NOT BETWEEN 18 AND 99
    OR p_age_min > p_age_max THEN
    RAISE EXCEPTION 'invalid_age_range';
  END IF;
  IF p_answers IS NULL
    OR jsonb_typeof(p_answers) <> 'object'
    OR NOT (p_answers ?& ARRAY['social_energy', 'spontaneity', 'communication', 'affection', 'schedule'])
    OR COALESCE(jsonb_typeof(p_answers->'social_energy'), '') <> 'number'
    OR COALESCE(jsonb_typeof(p_answers->'spontaneity'), '') <> 'number'
    OR COALESCE(jsonb_typeof(p_answers->'communication'), '') <> 'number'
    OR COALESCE(jsonb_typeof(p_answers->'affection'), '') <> 'number'
    OR COALESCE(jsonb_typeof(p_answers->'schedule'), '') <> 'number'
    OR COALESCE(p_answers->>'social_energy', '') !~ '^[1-5]$'
    OR COALESCE(p_answers->>'spontaneity', '') !~ '^[1-5]$'
    OR COALESCE(p_answers->>'communication', '') !~ '^[1-5]$'
    OR COALESCE(p_answers->>'affection', '') !~ '^[1-5]$'
    OR COALESCE(p_answers->>'schedule', '') !~ '^[1-5]$' THEN
    RAISE EXCEPTION 'invalid_answers';
  END IF;

  -- Solo se guardan las cinco claves contractuales; no se persiste JSON libre.
  v_answers := jsonb_build_object(
    'social_energy', (p_answers->>'social_energy')::INTEGER,
    'spontaneity', (p_answers->>'spontaneity')::INTEGER,
    'communication', (p_answers->>'communication')::INTEGER,
    'affection', (p_answers->>'affection')::INTEGER,
    'schedule', (p_answers->>'schedule')::INTEGER
  );

  SELECT * INTO v_existing
    FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = v_user;

  INSERT INTO public.crush_live_profiles (
    event_id, user_id, active, goal, preferred_genders,
    age_min, age_max, answers, consented_at, deactivated_at, updated_at
  ) VALUES (
    p_event_id, v_user, true, lower(btrim(p_goal)), v_genders,
    p_age_min, p_age_max, v_answers,
    CASE WHEN v_existing.user_id IS NULL OR NOT v_existing.active THEN clock_timestamp()
         ELSE v_existing.consented_at END,
    NULL, clock_timestamp()
  )
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET active = true,
        goal = EXCLUDED.goal,
        preferred_genders = EXCLUDED.preferred_genders,
        age_min = EXCLUDED.age_min,
        age_max = EXCLUDED.age_max,
        answers = EXCLUDED.answers,
        consented_at = EXCLUDED.consented_at,
        deactivated_at = NULL,
        updated_at = clock_timestamp()
  RETURNING * INTO v_saved;

  RETURN jsonb_build_object(
    'active', v_saved.active,
    'goal', v_saved.goal,
    'preferred_genders', v_saved.preferred_genders,
    'age_min', v_saved.age_min,
    'age_max', v_saved.age_max,
    'answers', v_saved.answers
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.get_crush_live_feed_core(
  p_event_id UUID,
  p_limit INTEGER
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_me public.profiles%ROWTYPE;
  v_live public.crush_live_profiles%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_my_age INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT COALESCE(v_event.is_official, false)
    OR NOT COALESCE(v_event.crush_live_enabled, false)
    OR COALESCE(v_event.status, '') NOT IN ('upcoming', 'ongoing') THEN
    RAISE EXCEPTION 'crush_live_unavailable';
  END IF;
  IF NOT private.crush_live_is_participant(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF NOT private.crush_live_is_eligible(v_user) THEN
    RAISE EXCEPTION 'profile_not_eligible';
  END IF;

  SELECT * INTO v_me FROM public.profiles WHERE id = v_user;
  SELECT * INTO v_live
    FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = v_user AND active = true;
  IF v_live.user_id IS NULL THEN RAISE EXCEPTION 'crush_live_opt_in_required'; END IF;
  v_my_age := private.crush_live_age(v_user);

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', candidate.id,
    'full_name', candidate.full_name,
    'avatar_url', candidate.avatar_url,
    'photos', CASE
      WHEN EXISTS (
        SELECT 1 FROM unnest(COALESCE(candidate.photos, '{}'::TEXT[])) AS p(url)
         WHERE NULLIF(btrim(p.url), '') IS NOT NULL
      ) THEN to_jsonb(ARRAY(
        SELECT p.url FROM unnest(candidate.photos) WITH ORDINALITY AS p(url, ord)
         WHERE NULLIF(btrim(p.url), '') IS NOT NULL ORDER BY p.ord
      ))
      ELSE to_jsonb(ARRAY[candidate.avatar_url]::TEXT[])
    END,
    'age', private.crush_live_age(candidate.id),
    'career', candidate.career,
    'bio', COALESCE(candidate.profile_bio, candidate.bio),
    'interests', COALESCE(candidate.interests, '{}'::TEXT[]),
    'compatibility', (score.result->>'compatibility')::INTEGER,
    'compatibility_reasons', score.result->'compatibility_reasons'
  )
    FROM public.crush_live_profiles candidate_live
    JOIN public.profiles candidate ON candidate.id = candidate_live.user_id
    CROSS JOIN LATERAL (
      SELECT private.crush_live_compatibility(p_event_id, v_user, candidate.id) AS result
    ) score
   WHERE candidate_live.event_id = p_event_id
     AND candidate_live.active = true
     AND candidate.id <> v_user
     AND private.crush_live_is_participant(p_event_id, candidate.id)
     AND private.crush_live_is_eligible(candidate.id)
     AND candidate.gender = ANY(v_live.preferred_genders)
     AND v_me.gender = ANY(candidate_live.preferred_genders)
     AND private.crush_live_age(candidate.id) BETWEEN v_live.age_min AND v_live.age_max
     AND v_my_age BETWEEN candidate_live.age_min AND candidate_live.age_max
     AND NOT private.crush_live_is_blocked(v_user, candidate.id)
     -- Denunciar dentro de Live también retira ese perfil del mazo del
     -- denunciante. context_id identifica el evento y evita duplicados.
     AND NOT EXISTS (
       SELECT 1 FROM public.user_reports report
        WHERE report.reporter_id = v_user
          AND report.reported_user_id = candidate.id
          AND report.context = 'profile'
          AND report.context_id = p_event_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.crush_live_swipes swipe
        WHERE swipe.event_id = p_event_id
          AND swipe.swiper_id = v_user
          AND swipe.target_id = candidate.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.crush_live_matches existing_match
        WHERE existing_match.event_id = p_event_id
          AND existing_match.user_a_id = LEAST(v_user, candidate.id)
          AND existing_match.user_b_id = GREATEST(v_user, candidate.id)
     )
   -- Bandas, no ranking milimétrico: el porcentaje explica afinidad, pero no
   -- pretende ser una verdad absoluta. Dentro de cada banda el orden rota al día.
   ORDER BY CASE
              WHEN (score.result->>'compatibility')::INTEGER >= 80 THEN 0
              WHEN (score.result->>'compatibility')::INTEGER >= 65 THEN 1
              WHEN (score.result->>'compatibility')::INTEGER >= 50 THEN 2
              ELSE 3
            END,
            md5(p_event_id::TEXT || ':' || v_user::TEXT || ':'
                || candidate.id::TEXT || ':' || CURRENT_DATE::TEXT),
            candidate.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;

CREATE OR REPLACE FUNCTION private.crush_live_swipe_core(
  p_event_id UUID,
  p_target_id UUID,
  p_action TEXT,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_action TEXT := lower(btrim(COALESCE(p_action, '')));
  v_request public.crush_live_swipe_requests%ROWTYPE;
  v_existing_swipe public.crush_live_swipes%ROWTYPE;
  v_me public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_me_live public.crush_live_profiles%ROWTYPE;
  v_target_live public.crush_live_profiles%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_match public.crush_live_matches%ROWTYPE;
  v_score JSONB;
  v_response JSONB;
  v_conversation_id UUID;
  v_inserted BOOLEAN := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF p_target_id IS NULL OR p_target_id = v_user THEN RAISE EXCEPTION 'invalid_target'; END IF;
  IF v_action NOT IN ('like', 'pass') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  -- Serializa reintentos del mismo actor/key antes de cualquier efecto lateral.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user::TEXT || ':' || p_idempotency_key::TEXT, 0)
  );

  SELECT * INTO v_request
    FROM public.crush_live_swipe_requests
   WHERE actor_id = v_user AND idempotency_key = p_idempotency_key;

  IF v_request.actor_id IS NOT NULL THEN
    IF v_request.event_id <> p_event_id
      OR v_request.target_id <> p_target_id
      OR v_request.action <> v_action THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
  END IF;

  -- El mismo lock global lo toma el trigger de user_blocks. Así un bloqueo y
  -- un swipe de la pareja quedan ordenados incluso si ocurren a la vez.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'crush-live-pair:' || LEAST(v_user, p_target_id)::TEXT
      || ':' || GREATEST(v_user, p_target_id)::TEXT,
      0
    )
  );

  -- El evento y todos los datos que determinan elegibilidad se mantienen
  -- estables hasta confirmar la decisión. El orden UUID evita deadlocks entre
  -- dos swipes recíprocos.
  SELECT * INTO v_event
    FROM public.events
   WHERE id = p_event_id
   FOR SHARE;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;

  PERFORM 1
    FROM public.profiles profile_lock
   WHERE profile_lock.id = ANY(ARRAY[v_user, p_target_id]::UUID[])
   ORDER BY profile_lock.id
   FOR SHARE;
  PERFORM 1
    FROM public.crush_live_profiles live_lock
   WHERE live_lock.event_id = p_event_id
     AND live_lock.user_id = ANY(ARRAY[v_user, p_target_id]::UUID[])
   ORDER BY live_lock.user_id
   FOR SHARE;
  PERFORM 1
    FROM public.event_participants participant_lock
   WHERE participant_lock.event_id = p_event_id
     AND participant_lock.user_id = ANY(ARRAY[v_user, p_target_id]::UUID[])
   ORDER BY participant_lock.user_id
   FOR SHARE;
  PERFORM 1
    FROM public.event_tickets ticket_lock
   WHERE ticket_lock.event_id = p_event_id
     AND ticket_lock.holder_id = ANY(ARRAY[v_user, p_target_id]::UUID[])
   ORDER BY ticket_lock.holder_id, ticket_lock.id
   FOR SHARE;

  IF NOT COALESCE(v_event.is_official, false)
    OR NOT COALESCE(v_event.crush_live_enabled, false)
    OR COALESCE(v_event.status, '') NOT IN ('upcoming', 'ongoing') THEN
    RAISE EXCEPTION 'crush_live_unavailable';
  END IF;
  IF NOT private.crush_live_is_participant(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF NOT private.crush_live_is_eligible(v_user) THEN
    RAISE EXCEPTION 'profile_not_eligible';
  END IF;

  SELECT * INTO v_me FROM public.profiles WHERE id = v_user;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id;
  SELECT * INTO v_me_live FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = v_user;
  SELECT * INTO v_target_live FROM public.crush_live_profiles
   WHERE event_id = p_event_id AND user_id = p_target_id;

  IF v_me_live.user_id IS NULL OR NOT COALESCE(v_me_live.active, false) THEN
    RAISE EXCEPTION 'crush_live_opt_in_required';
  END IF;

  -- Toda condición relativa al destinatario devuelve el mismo error. Así una
  -- llamada manual no puede usarse para averiguar si otra persona se apuntó,
  -- a quién busca, si ha ocultado el perfil o si existe un bloqueo.
  IF v_target.id IS NULL
    OR v_target_live.user_id IS NULL
    OR NOT COALESCE(v_target_live.active, false)
    OR NOT private.crush_live_is_participant(p_event_id, p_target_id)
    OR NOT private.crush_live_is_eligible(p_target_id)
    OR private.crush_live_is_blocked(v_user, p_target_id)
    OR EXISTS (
      SELECT 1 FROM public.user_reports report
       WHERE report.reporter_id = v_user
         AND report.reported_user_id = p_target_id
         AND report.context = 'profile'
         AND report.context_id = p_event_id
    )
    OR NOT COALESCE(v_target.gender = ANY(v_me_live.preferred_genders), false)
    OR NOT COALESCE(v_me.gender = ANY(v_target_live.preferred_genders), false)
    OR NOT COALESCE(
      private.crush_live_age(p_target_id) BETWEEN v_me_live.age_min AND v_me_live.age_max,
      false
    )
    OR NOT COALESCE(
      private.crush_live_age(v_user) BETWEEN v_target_live.age_min AND v_target_live.age_max,
      false
    ) THEN
    RAISE EXCEPTION 'target_not_available';
  END IF;

  -- Una key anterior a una nueva alta no puede revivir la respuesta de una
  -- sesión de consentimiento ya retirada.
  IF v_request.actor_id IS NOT NULL THEN
    IF v_request.created_at < v_me_live.consented_at
      OR v_request.created_at < v_target_live.consented_at THEN
      RAISE EXCEPTION 'idempotency_stale';
    END IF;
    RETURN v_request.response;
  END IF;

  -- Serializar por actor hace que solicitudes paralelas a distintos perfiles
  -- no puedan atravesar a la vez el límite conservador.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('crush-live-rate:' || v_user::TEXT, 0)
  );

  -- Reintentos idempotentes ya habrían retornado antes y no cuentan.
  IF (SELECT COUNT(*) FROM public.crush_live_swipes s
       WHERE s.swiper_id = v_user AND s.created_at >= now() - INTERVAL '1 minute') >= 60
    OR (SELECT COUNT(*) FROM public.crush_live_swipes s
         WHERE s.swiper_id = v_user AND s.created_at >= now() - INTERVAL '1 day') >= 500 THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;

  SELECT * INTO v_existing_swipe
    FROM public.crush_live_swipes
   WHERE event_id = p_event_id
     AND swiper_id = v_user
     AND target_id = p_target_id;

  IF v_existing_swipe.swiper_id IS NOT NULL AND v_existing_swipe.action <> v_action THEN
    RAISE EXCEPTION 'swipe_already_decided';
  END IF;

  INSERT INTO public.crush_live_swipes (event_id, swiper_id, target_id, action)
  VALUES (p_event_id, v_user, p_target_id, v_action)
  ON CONFLICT (event_id, swiper_id, target_id) DO NOTHING;

  IF v_action = 'like' AND EXISTS (
    SELECT 1 FROM public.crush_live_swipes reciprocal
     WHERE reciprocal.event_id = p_event_id
       AND reciprocal.swiper_id = p_target_id
       AND reciprocal.target_id = v_user
       AND reciprocal.action = 'like'
  ) THEN
    SELECT * INTO v_match
      FROM public.crush_live_matches existing_match
     WHERE existing_match.event_id = p_event_id
       AND existing_match.user_a_id = LEAST(v_user, p_target_id)
       AND existing_match.user_b_id = GREATEST(v_user, p_target_id);

    IF v_match.id IS NULL THEN
      v_score := private.crush_live_compatibility(p_event_id, v_user, p_target_id);
      v_conversation_id := private.crush_live_get_or_create_conversation(
        LEAST(v_user, p_target_id), GREATEST(v_user, p_target_id), v_user
      );

      INSERT INTO public.crush_live_matches (
        event_id, user_a_id, user_b_id, conversation_id,
        compatibility, compatibility_reasons, compatibility_breakdown
      ) VALUES (
        p_event_id, LEAST(v_user, p_target_id), GREATEST(v_user, p_target_id),
        v_conversation_id,
        (v_score->>'compatibility')::INTEGER,
        ARRAY(SELECT jsonb_array_elements_text(v_score->'compatibility_reasons')),
        v_score->'breakdown'
      )
      ON CONFLICT (event_id, user_a_id, user_b_id) DO NOTHING
      RETURNING * INTO v_match;

      v_inserted := v_match.id IS NOT NULL;
      IF NOT v_inserted THEN
        SELECT * INTO v_match
          FROM public.crush_live_matches existing_match
         WHERE existing_match.event_id = p_event_id
           AND existing_match.user_a_id = LEAST(v_user, p_target_id)
           AND existing_match.user_b_id = GREATEST(v_user, p_target_id);
      END IF;
    END IF;

    IF v_inserted THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES
        (
          v_user, 'match', '¡Es un match!',
          'Habéis hecho match en ' || v_event.title,
          jsonb_build_object(
            'kind', 'crush_live_match', 'event_id', p_event_id,
            'match_id', v_match.id, 'conversation_id', v_match.conversation_id,
            'url', '/crush-live?eventId=' || p_event_id::TEXT
          )
        ),
        (
          p_target_id, 'match', '¡Es un match!',
          'Habéis hecho match en ' || v_event.title,
          jsonb_build_object(
            'kind', 'crush_live_match', 'event_id', p_event_id,
            'match_id', v_match.id, 'conversation_id', v_match.conversation_id,
            'url', '/crush-live?eventId=' || p_event_id::TEXT
          )
        );
    END IF;

    v_response := jsonb_build_object(
      'match', true,
      'match_id', v_match.id,
      'conversation_id', v_match.conversation_id,
      'compatibility', v_match.compatibility,
      'compatibility_reasons', to_jsonb(v_match.compatibility_reasons)
    );
  ELSE
    v_response := jsonb_build_object(
      'match', false,
      'match_id', NULL,
      'conversation_id', NULL,
      'compatibility', NULL,
      'compatibility_reasons', '[]'::JSONB
    );
  END IF;

  INSERT INTO public.crush_live_swipe_requests (
    actor_id, idempotency_key, event_id, target_id, action, response, created_at
  ) VALUES (
    v_user, p_idempotency_key, p_event_id, p_target_id, v_action, v_response,
    clock_timestamp()
  );

  -- Retención oportunista y acotada: las claves antiguas ya no son necesarias.
  DELETE FROM public.crush_live_swipe_requests
   WHERE actor_id = v_user
     AND created_at < now() - INTERVAL '7 days';

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_crush_live_matches_core(p_event_id UUID DEFAULT NULL)
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', m.id,
    'user', jsonb_build_object(
      'id', peer.id,
      'full_name', peer.full_name,
      'avatar_url', peer.avatar_url,
      'photos', CASE
        WHEN EXISTS (
          SELECT 1 FROM unnest(COALESCE(peer.photos, '{}'::TEXT[])) AS p(url)
           WHERE NULLIF(btrim(p.url), '') IS NOT NULL
        ) THEN to_jsonb(ARRAY(
          SELECT p.url FROM unnest(peer.photos) WITH ORDINALITY AS p(url, ord)
           WHERE NULLIF(btrim(p.url), '') IS NOT NULL ORDER BY p.ord
        ))
        WHEN NULLIF(btrim(peer.avatar_url), '') IS NOT NULL
          THEN to_jsonb(ARRAY[peer.avatar_url]::TEXT[])
        ELSE '[]'::JSONB
      END,
      'age', private.crush_live_age(peer.id),
      'career', peer.career
    ),
    'event', jsonb_build_object('id', event.id, 'title', event.title),
    'compatibility', m.compatibility,
    'compatibility_reasons', to_jsonb(m.compatibility_reasons),
    'matched_at', m.matched_at,
    'conversation_id', m.conversation_id
  )
    FROM public.crush_live_matches m
    JOIN public.events event ON event.id = m.event_id
    JOIN public.profiles peer
      ON peer.id = CASE WHEN m.user_a_id = v_user THEN m.user_b_id ELSE m.user_a_id END
   WHERE v_user IN (m.user_a_id, m.user_b_id)
     AND (p_event_id IS NULL OR m.event_id = p_event_id)
     AND NOT private.crush_live_is_blocked(m.user_a_id, m.user_b_id)
     AND COALESCE(peer.is_discarded, false) = false
     AND COALESCE(peer.is_hidden, false) = false
     AND COALESCE(peer.photo_hidden, false) = false
   ORDER BY m.matched_at DESC, m.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPCs públicas estables (solo wrappers invoker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_crush_live_events()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.get_crush_live_events_core(); $$;

CREATE OR REPLACE FUNCTION public.get_crush_live_state(p_event_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.get_crush_live_state_core(p_event_id); $$;

CREATE OR REPLACE FUNCTION public.set_crush_live_profile(
  p_event_id UUID,
  p_active BOOLEAN,
  p_goal TEXT,
  p_preferred_genders TEXT[],
  p_age_min INTEGER,
  p_age_max INTEGER,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.set_crush_live_profile_core(
    p_event_id, p_active, p_goal, p_preferred_genders,
    p_age_min, p_age_max, p_answers
  );
$$;

CREATE OR REPLACE FUNCTION public.get_crush_live_feed(
  p_event_id UUID,
  p_limit INTEGER DEFAULT 30
)
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.get_crush_live_feed_core(p_event_id, p_limit); $$;

CREATE OR REPLACE FUNCTION public.crush_live_swipe(
  p_event_id UUID,
  p_target_id UUID,
  p_action TEXT,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.crush_live_swipe_core(
    p_event_id, p_target_id, p_action, p_idempotency_key
  );
$$;

CREATE OR REPLACE FUNCTION public.get_crush_live_matches(p_event_id UUID DEFAULT NULL)
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.get_crush_live_matches_core(p_event_id); $$;

-- Funciones internas: sin acceso por defecto. Solo authenticated puede ejecutar
-- los seis cores que invocan los wrappers; los helpers permanecen inaccesibles.
REVOKE EXECUTE ON FUNCTION private.crush_live_age(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.messages_enforce_immutable_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.crush_live_is_participant(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.crush_live_is_blocked(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.crush_live_lock_block_pair() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.crush_live_is_eligible(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.crush_live_compatibility(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.crush_live_get_or_create_conversation(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION private.get_crush_live_events_core() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.get_crush_live_state_core(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.set_crush_live_profile_core(UUID, BOOLEAN, TEXT, TEXT[], INTEGER, INTEGER, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.get_crush_live_feed_core(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.crush_live_swipe_core(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.get_crush_live_matches_core(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.get_crush_live_events_core() TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_crush_live_state_core(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_crush_live_profile_core(UUID, BOOLEAN, TEXT, TEXT[], INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_crush_live_feed_core(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION private.crush_live_swipe_core(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_crush_live_matches_core(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_crush_live_events() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_crush_live_state(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_crush_live_profile(UUID, BOOLEAN, TEXT, TEXT[], INTEGER, INTEGER, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_crush_live_feed(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crush_live_swipe(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_crush_live_matches(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_crush_live_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crush_live_state(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_crush_live_profile(UUID, BOOLEAN, TEXT, TEXT[], INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crush_live_feed(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crush_live_swipe(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crush_live_matches(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
