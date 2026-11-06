-- ─── 171: Franky Tap (acercar los móviles para saber si hay match) ──────────
--
-- QUÉ ES
-- Dos personas acercan los teléfonos con Franky abierto. Cada aplicación
-- detecta a la otra (banda ultraancha en iPhone, Bluetooth como respaldo) y
-- registra un interés SECRETO hacia ella. Si el interés es mutuo, salta el
-- match para las dos a la vez. Si no lo es, la otra persona no se entera de
-- nada: la pantalla nunca dice "no hay match".
--
-- POR QUÉ ASÍ Y NO DE OTRA FORMA
-- 1. El teléfono NO manda por el aire el identificador de usuario. Manda un
--    testigo corto y caduco (crush_tap_tokens) que solo este servidor sabe
--    traducir. Si alguien capturase la emisión, no obtendría la identidad de
--    nadie, y no puede fabricar el testigo de otra persona para suplantarla.
-- 2. El servidor decide QUÉ significa el acercamiento según el contexto:
--      · si las dos personas están activas en el mismo evento con Crush Live,
--        cuenta como un "me gusta" de ese evento (con su afinidad y su chat);
--      · si no, cuenta como una petición de Crush del campus, que es el mismo
--        modelo de "secreto hasta que es mutuo" que ya existe.
--    Así el gesto funciona siempre, dentro y fuera de un evento.
-- 3. La detección física puede dispararse varias veces en un segundo. Cada
--    acercamiento lleva una clave de idempotencia: repetirla devuelve el mismo
--    resultado y nunca crea dos matches ni dos avisos.
-- 4. Los errores del lado de la otra persona (bloqueo, no participa, no
--    cumple requisitos) devuelven todos el mismo aviso genérico. Si dieran
--    motivos distintos, acercar el móvil serviría para averiguar cosas de
--    alguien sin su permiso.

-- ── 1. Testigos de acercamiento ─────────────────────────────────────────────
-- Vida corta a propósito: el testigo solo tiene que sobrevivir a los segundos
-- que dura el gesto. Cinco minutos cubre de sobra abrir la pantalla, buscarse
-- y acercarse, y limita el daño si alguien lo captura.
CREATE TABLE IF NOT EXISTS public.crush_tap_tokens (
  token      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

CREATE INDEX IF NOT EXISTS crush_tap_tokens_user_idx ON public.crush_tap_tokens (user_id);
CREATE INDEX IF NOT EXISTS crush_tap_tokens_expires_idx ON public.crush_tap_tokens (expires_at);

ALTER TABLE public.crush_tap_tokens ENABLE ROW LEVEL SECURITY;

-- Cada cual solo ve y borra los suyos. La traducción de un testigo AJENO a
-- una identidad no pasa por aquí: la hace crush_tap, que es SECURITY DEFINER.
DROP POLICY IF EXISTS crush_tap_tokens_own ON public.crush_tap_tokens;
CREATE POLICY crush_tap_tokens_own ON public.crush_tap_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS crush_tap_tokens_delete_own ON public.crush_tap_tokens;
CREATE POLICY crush_tap_tokens_delete_own ON public.crush_tap_tokens
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, DELETE ON public.crush_tap_tokens TO authenticated;

-- ── 2. Registro de acercamientos ────────────────────────────────────────────
-- Guarda el resultado por clave de idempotencia (para poder repetir la misma
-- llamada sin efectos) y sirve de base para el límite de ritmo.
CREATE TABLE IF NOT EXISTS public.crush_taps (
  actor_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  peer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('live', 'crush')),
  matched         BOOLEAN NOT NULL DEFAULT false,
  result          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS crush_taps_actor_time_idx ON public.crush_taps (actor_id, created_at DESC);

ALTER TABLE public.crush_taps ENABLE ROW LEVEL SECURITY;

-- Solo se ven los propios. Nadie puede consultar a quién ha acercado el móvil
-- otra persona: eso delataría interés no correspondido.
DROP POLICY IF EXISTS crush_taps_select_own ON public.crush_taps;
CREATE POLICY crush_taps_select_own ON public.crush_taps
  FOR SELECT USING (auth.uid() = actor_id);

GRANT SELECT ON public.crush_taps TO authenticated;

-- ── 3. Emitir mi testigo ────────────────────────────────────────────────────
-- Se llama al abrir la pantalla del acercamiento. Borra los anteriores de esa
-- persona para que solo uno esté vivo a la vez.
CREATE OR REPLACE FUNCTION public.create_crush_tap_token()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_token  UUID;
  v_expira TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  -- Una cuenta retirada o escondida no puede emitir testigo: no debe aparecer
  -- ni siquiera por acercamiento.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_user
       AND COALESCE(p.is_discarded, false) = false
       AND COALESCE(p.is_hidden, false) = false
  ) THEN
    RAISE EXCEPTION 'profile_unavailable';
  END IF;

  DELETE FROM public.crush_tap_tokens WHERE user_id = v_user;

  INSERT INTO public.crush_tap_tokens (user_id)
  VALUES (v_user)
  RETURNING token, expires_at INTO v_token, v_expira;

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expira);
END;
$$;

REVOKE ALL ON FUNCTION public.create_crush_tap_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_crush_tap_token() TO authenticated;

-- ── 4. Registrar el acercamiento ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crush_tap(
  p_peer_token      UUID,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user     UUID := auth.uid();
  v_peer     UUID;
  v_previo   public.crush_taps%ROWTYPE;
  v_evento   UUID;
  v_salida   JSONB;
  v_modo     TEXT;
  v_matched  BOOLEAN := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_peer_token IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  -- Repetición de la misma detección: se devuelve el resultado guardado sin
  -- volver a registrar nada. La banda ultraancha puede disparar varias veces.
  SELECT * INTO v_previo
    FROM public.crush_taps
   WHERE actor_id = v_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_previo.result;
  END IF;

  -- Límite de ritmo: acercar el móvil es un gesto humano, no un bucle. Con
  -- esto un cliente manipulado no puede barrer identidades.
  IF (SELECT COUNT(*) FROM public.crush_taps t
       WHERE t.actor_id = v_user AND t.created_at >= NOW() - INTERVAL '1 minute') >= 20
     OR (SELECT COUNT(*) FROM public.crush_taps t
          WHERE t.actor_id = v_user AND t.created_at >= NOW() - INTERVAL '1 day') >= 200 THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;

  -- Traducción del testigo ajeno a una identidad. Solo aquí ocurre.
  SELECT tk.user_id INTO v_peer
    FROM public.crush_tap_tokens tk
   WHERE tk.token = p_peer_token
     AND tk.expires_at > NOW();

  IF v_peer IS NULL THEN
    RAISE EXCEPTION 'tap_token_expired';
  END IF;
  IF v_peer = v_user THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  -- A partir de aquí, cualquier problema del lado de la otra persona devuelve
  -- el MISMO aviso. Distinguirlos convertiría el gesto en una herramienta para
  -- averiguar si alguien te ha bloqueado o si usa Crush.
  IF private.crush_live_is_blocked(v_user, v_peer) THEN
    RAISE EXCEPTION 'peer_unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_peer
       AND COALESCE(p.is_discarded, false) = false
       AND COALESCE(p.is_hidden, false) = false
  ) THEN
    RAISE EXCEPTION 'peer_unavailable';
  END IF;

  -- ¿Comparten un evento con Crush Live donde las dos estén dadas de alta?
  -- Entonces el acercamiento vale como "me gusta" de ese evento, con su
  -- afinidad, su chat y su celebración.
  SELECT e.id INTO v_evento
    FROM public.crush_live_profiles mio
    JOIN public.crush_live_profiles suyo
      ON suyo.event_id = mio.event_id AND suyo.user_id = v_peer
    JOIN public.events e ON e.id = mio.event_id
   WHERE mio.user_id = v_user
     AND mio.active = true
     AND suyo.active = true
     AND COALESCE(e.is_official, false) = true
     AND COALESCE(e.crush_live_enabled, false) = true
     AND e.status IN ('upcoming', 'ongoing')
   ORDER BY e.start_date DESC
   LIMIT 1;

  IF v_evento IS NOT NULL THEN
    v_modo := 'live';
    -- Se reutiliza tal cual el motor de Crush Live: mismas comprobaciones,
    -- mismo bloqueo transaccional y misma creación de match sin duplicados.
    v_salida := private.crush_live_swipe_core(v_evento, v_peer, 'like', p_idempotency_key);
    v_matched := COALESCE((v_salida->>'match')::BOOLEAN, false);
    v_salida := v_salida || jsonb_build_object('mode', 'live', 'event_id', v_evento);
  ELSE
    v_modo := 'crush';
    -- Fuera de un evento, el acercamiento es una petición de Crush del campus.
    -- Exige que las dos personas participen; si alguna no, aviso genérico.
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = v_user AND COALESCE(p.ligar_opted_in, false)
    ) THEN
      RAISE EXCEPTION 'crush_opt_in_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = v_peer AND COALESCE(p.ligar_opted_in, false)
    ) THEN
      RAISE EXCEPTION 'peer_unavailable';
    END IF;

    v_salida := public._ig_request_apply(v_peer);
    v_matched := COALESCE((v_salida->>'matched')::BOOLEAN, false);
    v_salida := v_salida || jsonb_build_object('mode', 'crush', 'match', v_matched);
  END IF;

  -- El nombre y la foto de la otra persona solo se devuelven si hay match.
  -- Sin reciprocidad, quien acerca el móvil no se lleva ningún dato nuevo.
  IF v_matched THEN
    v_salida := v_salida || (
      SELECT jsonb_build_object(
        'peer', jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'avatar_url', p.avatar_url
        )
      )
      FROM public.profiles p WHERE p.id = v_peer
    );
  END IF;

  INSERT INTO public.crush_taps (actor_id, idempotency_key, peer_id, mode, matched, result)
  VALUES (v_user, p_idempotency_key, v_peer, v_modo, v_matched, v_salida);

  RETURN v_salida;
END;
$$;

REVOKE ALL ON FUNCTION public.crush_tap(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crush_tap(UUID, UUID) TO authenticated;

-- ── 5. Limpieza ─────────────────────────────────────────────────────────────
-- Los testigos caducados no sirven para nada y el historial de acercamientos
-- solo hace falta para la idempotencia y el límite de ritmo. Se puede llamar
-- desde el cron que ya limpia otras tablas.
CREATE OR REPLACE FUNCTION public.purge_crush_tap_data()
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.crush_tap_tokens WHERE expires_at < NOW() - INTERVAL '1 hour';
  DELETE FROM public.crush_taps WHERE created_at < NOW() - INTERVAL '30 days';
$$;

REVOKE ALL ON FUNCTION public.purge_crush_tap_data() FROM PUBLIC;
