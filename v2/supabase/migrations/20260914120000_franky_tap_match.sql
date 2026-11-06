-- ─── Franky Tap v2: acercar los móviles = match al instante ─────────────────
--
-- POR QUÉ CAMBIA
-- La primera versión (171 y 20260905182306) registraba un "interés secreto" y
-- solo avisaba si era mutuo, y la app terminó usando una comparación de
-- afinidad (20260911125643) que ni siquiera hacía match. En la práctica dos
-- personas juntaban los móviles y no pasaba nada visible: "no funciona".
--
-- Acercar dos teléfonos con la pantalla de Tap abierta ya es un acto mutuo:
-- las dos personas están delante, las dos han abierto Tap y las dos han
-- acercado el móvil. No hay interés que ocultar. Por eso ahora:
--   · basta con que UNO de los dos teléfonos detecte al otro (la radio es
--     asimétrica: banda ultraancha solo en iPhone reciente, Bluetooth en el
--     resto, código en cualquiera);
--   · el servidor crea el match en el acto: chat entre las dos personas,
--     mensaje de sistema en ese chat y aviso push a la otra persona;
--   · Instagram solo se comparte tras solicitudes reales de ambas personas;
--   · la otra pantalla se entera por sondeo (tap_poll) y por el push.
--
-- LO QUE SIGUE SIENDO PRIVADO
--   · Por la radio solo viaja un testigo aleatorio de cinco minutos; solo el
--     servidor lo traduce a una identidad.
--   · Bloqueos, cuentas retiradas y perfiles ocultos devuelven el mismo aviso
--     genérico (peer_unavailable).
--   · Límite de ritmo: 20 acercamientos por minuto y 200 al día.
--
-- Idempotente. Reutiliza las tablas crush_tap_tokens y crush_taps.

BEGIN;

-- ── 1. Compatibilidad ────────────────────────────────────────────────────
-- Las firmas antiguas conservan sus controles actuales. Una actualización
-- aditiva no retira las RPC que todavía pueden usar instalaciones anteriores.

-- ── 2. Índices para el sondeo de la otra pantalla ───────────────────────────
CREATE INDEX IF NOT EXISTS crush_taps_peer_token_idx ON public.crush_taps (peer_token, created_at DESC);
CREATE INDEX IF NOT EXISTS crush_taps_peer_time_idx  ON public.crush_taps (peer_id, created_at DESC);

-- These internal helpers bypass RLS only on behalf of an authenticated Tap
-- caller. They reuse the current social/account/event guards, and are never
-- callable by clients. Tap demo transport has no isolated implementation yet.
CREATE OR REPLACE FUNCTION private.tap_participant_allowed(p_user uuid, p_event uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user IS NULL THEN RETURN false; END IF;
  PERFORM public.require_account_session();
  IF public.workspace_is_demo_user(auth.uid()) OR public.workspace_is_demo_user(p_user)
    OR public.current_demo_cohort() IS NOT NULL
    OR NOT public.is_adult(p_user)
    OR private.live_connection_reason(p_user,p_event) IS NOT NULL
    OR EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=p_user)
    OR EXISTS(SELECT 1 FROM social_private.account_suspensions WHERE user_id=p_user AND restored_at IS NULL)
  THEN RETURN false; END IF;
  PERFORM social_private.require_community_terms(p_user);
  IF p_event IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.crush_live_profiles WHERE event_id=p_event AND user_id=p_user AND active
  ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.tap_participant_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tap_pair_allowed(p_other uuid, p_event uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid();
BEGIN
  IF me IS NULL OR p_other IS NULL OR me=p_other THEN RETURN false; END IF;
  -- Share the block/chat lock rather than inventing a separate Tap lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:'||least(me,p_other)::text||':'||greatest(me,p_other)::text,0));
  PERFORM p.id FROM public.profiles p WHERE p.id IN(me,p_other) ORDER BY p.id FOR SHARE;
  RETURN private.tap_participant_allowed(me,p_event)
    AND private.tap_participant_allowed(p_other,p_event)
    AND NOT private.crush_live_is_blocked(me,p_other)
    AND NOT social_private.pair_blocked(p_other)
    AND coalesce(public.can_message_user(p_other),false);
END $$;
REVOKE ALL ON FUNCTION private.tap_pair_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tap_instagram_mutual(p_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND
    (SELECT count(*) FROM public.profiles p WHERE p.id IN(auth.uid(),p_other)
      AND p.ligar_opted_in AND p.ig_quarantined IS NOT TRUE
      AND NULLIF(btrim(p.instagram_handle),'') IS NOT NULL)=2
    AND EXISTS(SELECT 1 FROM public.ig_requests WHERE requester_id=auth.uid() AND target_id=p_other)
    AND EXISTS(SELECT 1 FROM public.ig_requests WHERE requester_id=p_other AND target_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION private.tap_instagram_mutual(uuid) FROM PUBLIC,anon,authenticated;

-- ── 3. Tarjeta de la otra persona tal y como la ve quien mira ───────────────
-- Solo se construye cuando ya hay match: las dos personas están delante.
CREATE OR REPLACE FUNCTION public._tap_peer_card(p_other uuid, p_with_instagram boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', COALESCE(NULLIF(btrim(p.full_name), ''), 'Alguien'),
    'avatar_url', p.avatar_url,
    'university', u.name,
    'instagram_handle', CASE WHEN p_with_instagram THEN p.instagram_handle ELSE NULL END,
    'instagram_verified', CASE WHEN p_with_instagram THEN COALESCE(p.instagram_verified, false) ELSE false END
  )
  FROM public.profiles p
  LEFT JOIN public.universities u ON u.id = p.university_id
  WHERE p.id = p_other;
$$;
REVOKE ALL ON FUNCTION public._tap_peer_card(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Never return historical personal data from crush_taps.result. Every replay
-- and poll resolves the current participant, session, privacy and IG consent.
CREATE OR REPLACE FUNCTION private.tap_current_result(p_row public.crush_taps)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); peer uuid; conv uuid; ig boolean;
BEGIN
  IF me IS NULL OR me NOT IN(p_row.actor_id,p_row.peer_id) THEN RAISE EXCEPTION 'auth_required'; END IF;
  peer:=CASE WHEN me=p_row.actor_id THEN p_row.peer_id ELSE p_row.actor_id END;
  IF NOT private.tap_pair_allowed(peer,p_row.event_id) THEN RETURN jsonb_build_object('match',false); END IF;
  PERFORM t.token FROM public.crush_tap_tokens t WHERE t.user_id IN(me,peer) ORDER BY t.token FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.crush_tap_tokens WHERE token=p_row.peer_token
      AND user_id=p_row.peer_id AND expires_at>now() AND event_id IS NOT DISTINCT FROM p_row.event_id
      AND mode=CASE WHEN p_row.event_id IS NULL THEN 'crush' ELSE 'live' END)
    OR NOT EXISTS(SELECT 1 FROM public.crush_tap_tokens WHERE user_id=p_row.actor_id
      AND expires_at>now() AND event_id IS NOT DISTINCT FROM p_row.event_id
      AND mode=CASE WHEN p_row.event_id IS NULL THEN 'crush' ELSE 'live' END)
  THEN RETURN jsonb_build_object('match',false); END IF;
  conv:=(p_row.result->>'conversation_id')::uuid;
  IF conv IS NULL OR NOT public.workspace_chat_recipient_allowed(me,jsonb_build_object('conversation_id',conv))
    OR NOT public.workspace_chat_recipient_allowed(peer,jsonb_build_object('conversation_id',conv))
  THEN RETURN jsonb_build_object('match',false); END IF;
  ig:=private.tap_instagram_mutual(peer);
  RETURN jsonb_build_object('match',true,'conversation_id',conv,'ig_matched',ig,
    'event_id',p_row.event_id,'peer',public._tap_peer_card(peer,ig),'created_at',p_row.created_at);
END $$;
REVOKE ALL ON FUNCTION private.tap_current_result(public.crush_taps) FROM PUBLIC,anon,authenticated;

-- ── 4. tap_start: mi testigo para esta sesión de Tap ────────────────────────
-- Se llama al abrir la pantalla y cada vez que quede menos de un minuto de
-- vida. Reutiliza el testigo vivo si aún le queda margen, para que un
-- reinicio de la pantalla no invalide el código que la otra persona ya ve.
CREATE OR REPLACE FUNCTION public.tap_start(p_event_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_event  uuid := p_event_id;
  v_result jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT private.tap_participant_allowed(v_me,v_event) THEN RAISE EXCEPTION 'profile_unavailable'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tap-token:' || v_me::text, 0));

  SELECT jsonb_build_object('token', t.token, 'expires_at', t.expires_at)
    INTO v_result
    FROM public.crush_tap_tokens t
   WHERE t.user_id = v_me AND t.expires_at > now() + interval '60 seconds'
     AND t.event_id IS NOT DISTINCT FROM v_event
     AND t.mode=CASE WHEN v_event IS NULL THEN 'crush' ELSE 'live' END
   ORDER BY t.created_at DESC LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  DELETE FROM public.crush_tap_tokens WHERE user_id = v_me;
  INSERT INTO public.crush_tap_tokens (user_id, mode, event_id)
  VALUES (v_me, CASE WHEN v_event IS NULL THEN 'crush' ELSE 'live' END, v_event)
  RETURNING jsonb_build_object('token', token, 'expires_at', expires_at) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.tap_start(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tap_start(uuid) TO authenticated;

-- ── 5. tap_connect: he detectado su testigo → match ─────────────────────────
CREATE OR REPLACE FUNCTION public.tap_connect(
  p_peer_token      uuid,
  p_idempotency_key uuid,
  p_event_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me        uuid := auth.uid();
  v_peer      uuid;
  v_prior     public.crush_taps%ROWTYPE;
  v_recent    public.crush_taps%ROWTYPE;
  v_fresh     boolean;
  v_conv      uuid;
  v_ig        boolean := false;
  v_event     uuid := NULL;
  v_my_name   text;
  v_peer_name text;
  v_result    jsonb;
  v_replay    boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_peer_token IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;

  -- Repeating a key cannot choose a different peer/context or bypass a block.
  PERFORM pg_advisory_xact_lock(hashtextextended('tap:' || v_me::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_prior FROM public.crush_taps WHERE actor_id = v_me AND idempotency_key = p_idempotency_key;
  v_replay:=FOUND;
  IF v_replay THEN
    IF v_prior.peer_token IS DISTINCT FROM p_peer_token OR v_prior.event_id IS DISTINCT FROM p_event_id
    THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    v_result:=private.tap_current_result(v_prior);
    IF NOT coalesce((v_result->>'match')::boolean,false) THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
    RETURN v_result;
  END IF;

  -- Límite de ritmo ANTES de traducir nada: probar testigos al azar tampoco es gratis.
  PERFORM pg_advisory_xact_lock(hashtextextended('tap-rate:'||v_me::text,0));
  IF (SELECT count(*) FROM public.crush_taps t WHERE t.actor_id = v_me AND t.created_at > now() - interval '1 minute') >= 20
     OR (SELECT count(*) FROM public.crush_taps t WHERE t.actor_id = v_me AND t.created_at > now() - interval '1 day') >= 200
  THEN RAISE EXCEPTION 'rate_limit_exceeded'; END IF;

  -- Traducción del testigo ajeno a una identidad. Solo aquí ocurre.
  SELECT t.user_id INTO v_peer
    FROM public.crush_tap_tokens t
   WHERE t.token = p_peer_token AND t.expires_at > now()
     AND t.event_id IS NOT DISTINCT FROM p_event_id
     AND t.mode=CASE WHEN p_event_id IS NULL THEN 'crush' ELSE 'live' END;
  IF v_peer IS NULL THEN RAISE EXCEPTION 'tap_token_expired'; END IF;
  IF v_peer = v_me THEN RAISE EXCEPTION 'invalid_target'; END IF;

  IF NOT private.tap_pair_allowed(v_peer,p_event_id) THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  -- The actor must also have opened Tap. A photographed peer token alone is
  -- not a session or permission to create a chat. Hold both sessions through
  -- the write so stop/renew cannot invalidate a match midway through it.
  PERFORM t.token FROM public.crush_tap_tokens t WHERE t.user_id IN(v_me,v_peer) ORDER BY t.token FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.crush_tap_tokens WHERE user_id=v_me AND expires_at>now()
      AND event_id IS NOT DISTINCT FROM p_event_id
      AND mode=CASE WHEN p_event_id IS NULL THEN 'crush' ELSE 'live' END)
    OR NOT EXISTS(SELECT 1 FROM public.crush_tap_tokens WHERE token=p_peer_token AND user_id=v_peer AND expires_at>now()
      AND event_id IS NOT DISTINCT FROM p_event_id)
  THEN RAISE EXCEPTION 'tap_session_required'; END IF;

  -- Todo lo que falla del lado ajeno devuelve el mismo aviso.
  -- Un testigo solo puede "gastarlo" un puñado de personas distintas mientras
  -- vive: quien lo capture por radio o fotografíe el código no puede usarlo
  -- desde varias cuentas para identificar a alguien a distancia.
  IF (SELECT count(DISTINCT t.actor_id) FROM public.crush_taps t
       WHERE t.peer_token = p_peer_token AND t.actor_id <> v_me AND t.created_at > now() - interval '10 minutes') >= 3
  THEN RAISE EXCEPTION 'peer_unavailable'; END IF;

  -- Si la otra pantalla ya registró este mismo encuentro hace un momento, no
  -- se repiten ni el mensaje de sistema ni los avisos.
  SELECT * INTO v_recent
    FROM public.crush_taps t
   WHERE t.matched AND t.created_at > now() - interval '10 minutes'
     AND ((t.actor_id = v_me AND t.peer_id = v_peer) OR (t.actor_id = v_peer AND t.peer_id = v_me))
   ORDER BY t.created_at DESC LIMIT 1;
  v_fresh := NOT FOUND;

  -- Contexto de evento solo si los dos lo comparten.
  v_event := p_event_id;

  -- Chat directo entre los dos (el mismo que abre "Enviar mensaje").
  v_conv := public.get_or_create_direct_chat(v_peer);

  -- Only the caller may express an Instagram request. Opening the other
  -- person's Tap screen never inserts consent on their behalf.
  IF (SELECT count(*) FROM public.profiles p
       WHERE p.id IN (v_me, v_peer) AND COALESCE(p.ligar_opted_in, false)
         AND p.ig_quarantined IS NOT TRUE AND NULLIF(btrim(p.instagram_handle), '') IS NOT NULL) = 2 THEN
    PERFORM public._ig_request_apply(v_peer);
    v_ig := private.tap_instagram_mutual(v_peer);
  END IF;

  v_result := jsonb_build_object(
    'match', true,
    'conversation_id', v_conv,
    'ig_matched', v_ig,
    'event_id', v_event,
    'peer', public._tap_peer_card(v_peer, v_ig),
    'created_at', now()
  );

  INSERT INTO public.crush_taps (actor_id, idempotency_key, peer_id, mode, matched, result, peer_token, event_id)
  -- Retain identifiers, not a historical cache of names/photos/Instagram.
  VALUES (v_me, p_idempotency_key, v_peer, CASE WHEN v_event IS NULL THEN 'crush' ELSE 'live' END, true,
    jsonb_build_object('conversation_id',v_conv), p_peer_token, v_event);

  IF v_fresh THEN
    SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Alguien') INTO v_my_name   FROM public.profiles WHERE id = v_me;
    SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Alguien') INTO v_peer_name FROM public.profiles WHERE id = v_peer;

    BEGIN
      INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
      VALUES (v_conv, v_me, '💜 Habéis hecho match con Franky Tap', 'system');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'tap_connect system message: %', SQLERRM;
    END;

    -- La otra persona recibe push (is_read = false); quien acerca el móvil ya
    -- ve la celebración en pantalla, así que su aviso queda solo en la bandeja.
    -- Un fallo del aviso no debe deshacer un match que ya ha ocurrido.
    BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES
      (v_peer, 'match',
       '¡Match con ' || v_my_name || '! 💜',
       'Os habéis acercado con Franky Tap. Ya podéis hablar.' || CASE WHEN v_ig THEN ' Su Instagram ya está en Crush.' ELSE '' END,
       jsonb_build_object('kind', 'tap_match', 'conversation_id', v_conv, 'peer_id', v_me, 'event_id', v_event,
                          'url', '/chats?chat=' || v_conv::text),
       false),
      (v_me, 'match',
       '¡Match con ' || v_peer_name || '! 💜',
       'Os habéis acercado con Franky Tap. Ya podéis hablar.' || CASE WHEN v_ig THEN ' Su Instagram ya está en Crush.' ELSE '' END,
       jsonb_build_object('kind', 'tap_match', 'conversation_id', v_conv, 'peer_id', v_peer, 'event_id', v_event,
                          'url', '/chats?chat=' || v_conv::text),
       true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'tap_connect notifications: %', SQLERRM;
    END;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.tap_connect(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tap_connect(uuid, uuid, uuid) TO authenticated;

-- ── 6. tap_poll: ¿alguien ha hecho match conmigo desde que abrí Tap? ────────
-- Lo llama la pantalla cada segundo y medio. Solo devuelve matches de MI
-- testigo (o registrados por mí) desde que ese testigo se creó.
CREATE OR REPLACE FUNCTION public.tap_poll(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_since timestamptz;
  v_event uuid;
  v_row   public.crush_taps%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM public.require_account_session();
  SELECT t.created_at,t.event_id INTO v_since,v_event FROM public.crush_tap_tokens t WHERE t.token = p_token AND t.user_id = v_me AND t.expires_at>now();
  IF v_since IS NULL THEN RETURN jsonb_build_object('match', false, 'expired', true); END IF;

  SELECT * INTO v_row
    FROM public.crush_taps t
   WHERE t.matched AND t.created_at >= v_since
     AND t.event_id IS NOT DISTINCT FROM v_event
     AND ((t.peer_token = p_token AND t.peer_id = v_me) OR t.actor_id = v_me)
   ORDER BY t.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('match', false); END IF;

  RETURN private.tap_current_result(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.tap_poll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tap_poll(uuid) TO authenticated;

-- ── 7. tap_stop: al salir de la pantalla ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tap_stop(p_token uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.crush_tap_tokens WHERE token = p_token AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.tap_stop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tap_stop(uuid) TO authenticated;

-- ── 8. Limpieza programada (la 171 la dejó sin programar) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('purge-crush-tap-data', '17 4 * * *', $cron$SELECT public.purge_crush_tap_data();$cron$);
  END IF;
END $$;

COMMENT ON FUNCTION public.tap_connect(uuid, uuid, uuid) IS
  'Franky Tap v2: sesiones vigentes y permisos actuales para el chat; Instagram solo tras solicitudes mutuas reales; replay y poll revalidan acceso.';

COMMIT;
