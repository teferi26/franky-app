BEGIN;

-- Transport tokens must not become a directory of unreciprocated identities.
REVOKE ALL ON TABLE public.crush_taps FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS crush_taps_select_own ON public.crush_taps;
REVOKE ALL ON FUNCTION public.dispatch_push(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_push(uuid,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.dispatch_email(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_email(uuid,text,text,text,jsonb) TO service_role;

ALTER TABLE public.crush_tap_tokens ADD COLUMN mode text;
ALTER TABLE public.crush_tap_tokens ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.crush_tap_tokens ADD CONSTRAINT tap_token_context CHECK (
  ((mode IS NULL AND event_id IS NULL) OR (mode='crush' AND event_id IS NULL) OR (mode='live' AND event_id IS NOT NULL)) IS TRUE);
ALTER TABLE public.crush_taps ADD COLUMN peer_token uuid;
ALTER TABLE public.crush_taps ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

-- Old installations cannot establish explicit event context / confirmation.
-- Keep their signatures but reject implicit mutations instead of choosing an event.
CREATE OR REPLACE FUNCTION public.create_crush_tap_token()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'tap_context_required'; END; $$;
CREATE OR REPLACE FUNCTION public.crush_tap(p_peer_token uuid,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'tap_context_required'; END; $$;

CREATE FUNCTION public.create_crush_tap_token(p_mode text,p_event_id uuid,p_expected_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); result jsonb;
BEGIN
  IF me IS NULL OR p_expected_user_id IS NULL OR me<>p_expected_user_id THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_mode IS NULL OR NOT ((p_mode='crush' AND p_event_id IS NULL) OR (p_mode='live' AND p_event_id IS NOT NULL)) THEN RAISE EXCEPTION 'tap_context_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=me AND p.is_discarded IS NOT TRUE AND p.is_hidden IS NOT TRUE) THEN RAISE EXCEPTION 'profile_unavailable'; END IF;
  IF p_mode='live' THEN
    IF NOT private.crush_live_is_eligible(me) OR NOT private.crush_live_is_participant(p_event_id,me)
      OR NOT EXISTS(SELECT 1 FROM public.crush_live_profiles p JOIN public.events e ON e.id=p.event_id
        WHERE p.event_id=p_event_id AND p.user_id=me AND p.active AND e.is_official AND e.crush_live_enabled AND e.status IN ('upcoming','ongoing'))
    THEN RAISE EXCEPTION 'crush_live_opt_in_required'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=me AND ligar_opted_in AND ig_quarantined IS NOT TRUE) THEN RAISE EXCEPTION 'crush_opt_in_required'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tap-token:'||me::text,0));
  -- Reopening the same context reuses its valid token; renewal is bounded.
  SELECT jsonb_build_object('token',token,'expires_at',expires_at) INTO result FROM public.crush_tap_tokens
    WHERE user_id=me AND mode=p_mode AND event_id IS NOT DISTINCT FROM p_event_id AND expires_at>now()+interval '45 seconds' ORDER BY created_at DESC LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
  DELETE FROM public.crush_tap_tokens WHERE user_id=me;
  INSERT INTO public.crush_tap_tokens(user_id,mode,event_id) VALUES(me,p_mode,p_event_id)
    RETURNING jsonb_build_object('token',token,'expires_at',expires_at) INTO result;
  RETURN result;
END; $$;

CREATE FUNCTION public.crush_tap(p_peer_token uuid,p_idempotency_key uuid,p_mode text,p_event_id uuid,p_expected_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); peer uuid; prior public.crush_taps%ROWTYPE; outcome jsonb; matched boolean; result jsonb; replay boolean;
BEGIN
  IF me IS NULL OR p_expected_user_id IS NULL OR me<>p_expected_user_id THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_peer_token IS NULL OR p_idempotency_key IS NULL OR p_mode IS NULL OR NOT ((p_mode='crush' AND p_event_id IS NULL) OR (p_mode='live' AND p_event_id IS NOT NULL)) THEN RAISE EXCEPTION 'tap_context_required'; END IF;
  -- Same lock order as the Live engine: actor/key, then pair, then profiles.
  PERFORM pg_advisory_xact_lock(hashtextextended(me::text||':'||p_idempotency_key::text,0));
  SELECT * INTO prior FROM public.crush_taps WHERE actor_id=me AND idempotency_key=p_idempotency_key;
  replay:=FOUND;
  IF replay THEN
    IF prior.peer_token IS DISTINCT FROM p_peer_token OR prior.mode<>p_mode OR prior.event_id IS DISTINCT FROM p_event_id THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    peer:=prior.peer_id;
  ELSE
    SELECT user_id INTO peer FROM public.crush_tap_tokens WHERE token=p_peer_token AND expires_at>now() AND mode=p_mode AND event_id IS NOT DISTINCT FROM p_event_id;
    IF peer IS NULL THEN RAISE EXCEPTION 'tap_token_expired'; END IF;
  END IF;
  IF me=peer THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(me,peer)::text||':'||greatest(me,peer)::text,0));
  IF private.crush_live_is_blocked(me,peer) OR EXISTS(SELECT 1 FROM public.profiles WHERE id IN(me,peer) AND (is_discarded IS TRUE OR is_hidden IS TRUE)) THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  -- A replay must revalidate participation, opt-in and blocks in the same engine.
  IF p_mode='live' THEN
    outcome:=private.crush_live_swipe_core(p_event_id,peer,'like',p_idempotency_key);
    matched:=coalesce((outcome->>'match')::boolean,false);
  ELSE
    PERFORM p.id FROM public.profiles p WHERE p.id IN(me,peer) ORDER BY p.id FOR SHARE;
    IF EXISTS(SELECT 1 FROM public.profiles WHERE id IN(me,peer) AND (is_discarded IS TRUE OR is_hidden IS TRUE)) THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
    IF replay AND NOT EXISTS(SELECT 1 FROM public.ig_requests WHERE requester_id=me AND target_id=peer) THEN RAISE EXCEPTION 'idempotency_stale'; END IF;
    outcome:=public._ig_request_apply(peer);
    matched:=coalesce((outcome->>'matched')::boolean,false);
  END IF;
  IF NOT replay THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tap-rate:'||me::text,0));
    IF (SELECT count(*) FROM public.crush_taps WHERE actor_id=me AND created_at>now()-interval '1 minute')>=20
      OR (SELECT count(*) FROM public.crush_taps WHERE actor_id=me AND created_at>now()-interval '1 day')>=200
    THEN RAISE EXCEPTION 'rate_limit_exceeded'; END IF;
  END IF;
  -- Return a whitelist: no identity or conversation leaks through an engine payload.
  result:=jsonb_build_object('mode',p_mode,'event_id',p_event_id,'match',matched,
    'compatibility',CASE WHEN matched THEN outcome->'compatibility' ELSE NULL END,
    'conversation_id',CASE WHEN matched THEN outcome->'conversation_id' ELSE NULL END,
    'peer',CASE WHEN matched THEN (SELECT jsonb_build_object('id',id,'full_name',full_name,'avatar_url',avatar_url) FROM public.profiles WHERE id=peer) ELSE NULL END);
  INSERT INTO public.crush_taps(actor_id,idempotency_key,peer_id,mode,matched,result,peer_token,event_id)
    VALUES(me,p_idempotency_key,peer,p_mode,matched,result,p_peer_token,p_event_id)
    ON CONFLICT(actor_id,idempotency_key) DO UPDATE SET matched=excluded.matched,result=excluded.result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_crush_tap_token(text,uuid,uuid),public.crush_tap(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_crush_tap_token(text,uuid,uuid),public.crush_tap(uuid,uuid,text,uuid,uuid) TO authenticated;
COMMIT;
