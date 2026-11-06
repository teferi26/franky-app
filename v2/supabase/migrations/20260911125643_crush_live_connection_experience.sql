BEGIN;

-- Private answers and short-lived, mutually confirmed comparisons. No client
-- has direct table access; the RPCs below validate caller, context and expiry.
CREATE TABLE private.live_connection_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  consent_version integer NOT NULL CHECK(consent_version=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.live_connection_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  peer_token uuid,
  confirmed boolean NOT NULL DEFAULT false,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '90 seconds'
);
CREATE INDEX live_connection_sessions_owner ON private.live_connection_sessions(user_id,created_at DESC);
CREATE INDEX live_connection_sessions_expiry ON private.live_connection_sessions(expires_at);
ALTER TABLE private.live_connection_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.live_connection_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.live_connection_profiles,private.live_connection_sessions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.live_connection_reason(p_user uuid,p_event uuid)
RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id=p_user;
  IF p.id IS NULL OR p.is_discarded IS TRUE OR p.is_hidden IS TRUE THEN RETURN 'profile_unavailable'; END IF;
  IF p.birth_date IS NULL OR p.birth_date>CURRENT_DATE-interval '18 years' THEN RETURN 'age_required'; END IF;
  IF p.gender IS NULL OR p.gender NOT IN('hombre','mujer','no_binario') THEN RETURN 'gender_required'; END IF;
  IF p_event IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.events WHERE id=p_event AND is_official AND crush_live_enabled AND status IN('upcoming','ongoing')) THEN RETURN 'event_unavailable'; END IF;
    IF NOT private.crush_live_is_participant(p_event,p_user) THEN RETURN 'not_participant'; END IF;
    IF NOT private.crush_live_is_eligible(p_user) THEN RETURN 'event_profile_required'; END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION private.live_connection_reason(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Symmetric, explainable entertainment score, not a psychological prediction.
CREATE FUNCTION private.live_connection_score(a jsonb,b jsonb,ga text,gb text,aa integer,ab integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; fit numeric:=0; goals integer; shared integer; total integer; hobbies integer; score integer; compatible boolean;
BEGIN
  compatible:=(a->'preferred_genders' ? gb) AND (b->'preferred_genders' ? ga)
    AND ab BETWEEN (a->>'age_min')::integer AND (a->>'age_max')::integer
    AND aa BETWEEN (b->>'age_min')::integer AND (b->>'age_max')::integer;
  FOREACH k IN ARRAY ARRAY['social_energy','spontaneity','communication','affection','schedule'] LOOP
    fit:=fit+(4-abs((a->'answers'->>k)::integer-(b->'desired'->>k)::integer))*1.5
      +(4-abs((b->'answers'->>k)::integer-(a->'desired'->>k)::integer))*1.5;
  END LOOP;
  goals:=CASE WHEN a->>'goal'=b->>'goal' THEN 25 WHEN a->>'goal'='dejarse_llevar' OR b->>'goal'='dejarse_llevar' THEN 15 ELSE 0 END;
  SELECT count(*) INTO shared FROM (SELECT jsonb_array_elements_text(a->'interests') INTERSECT SELECT jsonb_array_elements_text(b->'interests')) x;
  SELECT count(*) INTO total FROM (SELECT jsonb_array_elements_text(a->'interests') UNION SELECT jsonb_array_elements_text(b->'interests')) x;
  hobbies:=round(15.0*shared/greatest(total,1));
  score:=CASE WHEN compatible THEN round(fit)+goals+hobbies ELSE 0 END;
  RETURN jsonb_build_object('score',score,'threshold',70,'matched',compatible AND score>=70,
    'preferences_compatible',compatible,'breakdown',CASE WHEN compatible THEN jsonb_build_object('personality',round(fit),'intention',goals,'interests',hobbies) ELSE NULL END,
    'shared_interests',CASE WHEN compatible THEN shared ELSE NULL END,'model_version',1);
END; $$;
REVOKE ALL ON FUNCTION private.live_connection_score(jsonb,jsonb,text,text,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.live_connection_profile_core(p_data jsonb DEFAULT NULL,p_consent boolean DEFAULT false,p_event uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); reason text; d jsonb; k text; section text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  reason:=private.live_connection_reason(me,p_event);
  IF p_data IS NOT NULL THEN
    IF p_data->>'owner' IS DISTINCT FROM me::text THEN RAISE EXCEPTION 'auth_changed'; END IF;
    IF reason IS NOT NULL THEN RAISE EXCEPTION '%',reason; END IF;
    IF p_consent IS NOT TRUE THEN RAISE EXCEPTION 'consent_required'; END IF;
    IF jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>4096
      OR coalesce(p_data->>'goal','') NOT IN('conocer','dejarse_llevar','relacion')
      OR coalesce(jsonb_typeof(p_data->'preferred_genders'),'')<>'array'
      OR coalesce(jsonb_typeof(p_data->'interests'),'')<>'array'
      OR coalesce(p_data->>'age_min','') !~ '^[0-9]{2}$' OR coalesce(p_data->>'age_max','') !~ '^[0-9]{2}$'
    THEN RAISE EXCEPTION 'profile_incomplete'; END IF;
    IF jsonb_array_length(p_data->'preferred_genders') NOT BETWEEN 1 AND 3
      OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_data->'preferred_genders') x)<>jsonb_array_length(p_data->'preferred_genders')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_data->'preferred_genders') x WHERE x NOT IN('hombre','mujer','no_binario'))
      OR (p_data->>'age_min')::integer NOT BETWEEN 18 AND 80
      OR (p_data->>'age_max')::integer NOT BETWEEN (p_data->>'age_min')::integer AND 80
      OR jsonb_array_length(p_data->'interests') NOT BETWEEN 3 AND 8
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_data->'interests') x WHERE x NOT IN('musica','viajes','deporte','cine','gaming','naturaleza','comida','arte','lectura','baile','tecnologia','animales'))
      OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_data->'interests') x)<>jsonb_array_length(p_data->'interests')
    THEN RAISE EXCEPTION 'profile_incomplete'; END IF;
    FOREACH section IN ARRAY ARRAY['answers','desired'] LOOP
      IF coalesce(jsonb_typeof(p_data->section),'')<>'object' THEN RAISE EXCEPTION 'profile_incomplete'; END IF;
      FOREACH k IN ARRAY ARRAY['social_energy','spontaneity','communication','affection','schedule'] LOOP
        IF coalesce(jsonb_typeof(p_data->section->k),'')<>'number' OR coalesce(p_data->section->>k,'') !~ '^[1-5]$' THEN RAISE EXCEPTION 'profile_incomplete'; END IF;
      END LOOP;
    END LOOP;
    d:=jsonb_build_object('goal',p_data->'goal','preferred_genders',p_data->'preferred_genders',
      'age_min',p_data->'age_min','age_max',p_data->'age_max','interests',p_data->'interests',
      'answers',p_data->'answers','desired',p_data->'desired');
    PERFORM pg_advisory_xact_lock(hashtextextended('live-connection-owner:'||me::text,0));
    INSERT INTO private.live_connection_profiles(user_id,data,consent_version) VALUES(me,d,1)
      ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=now();
    UPDATE private.live_connection_sessions SET expires_at=now() WHERE user_id=me AND expires_at>now();
  END IF;
  SELECT data INTO d FROM private.live_connection_profiles WHERE user_id=me;
  RETURN jsonb_build_object('profile',d,'reason',reason,'threshold',70,'event_title',(SELECT title FROM public.events WHERE id=p_event));
END; $$;

CREATE FUNCTION private.live_connection_session_core(p_action text,p_token uuid DEFAULT NULL,p_event uuid DEFAULT NULL,p_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); s private.live_connection_sessions%ROWTYPE; reason text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('live-connection-owner:'||me::text,0));
  IF p_action='stop' THEN
    UPDATE private.live_connection_sessions SET expires_at=now() WHERE user_id=me AND token=p_token;
    RETURN jsonb_build_object('stopped',true);
  END IF;
  reason:=private.live_connection_reason(me,p_event);
  IF reason IS NOT NULL THEN RAISE EXCEPTION '%',reason; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.live_connection_profiles WHERE user_id=me) THEN RAISE EXCEPTION 'profile_incomplete'; END IF;
  IF p_action='start' THEN
    IF p_owner IS DISTINCT FROM me THEN RAISE EXCEPTION 'auth_changed'; END IF;
    IF (SELECT count(*) FROM private.live_connection_sessions WHERE user_id=me AND created_at>now()-interval '1 minute')>=12 THEN RAISE EXCEPTION 'rate_limit_exceeded'; END IF;
    UPDATE private.live_connection_sessions SET expires_at=now() WHERE user_id=me AND expires_at>now();
    INSERT INTO private.live_connection_sessions(user_id,event_id) VALUES(me,p_event) RETURNING * INTO s;
  ELSIF p_action='heartbeat' THEN
    UPDATE private.live_connection_sessions SET expires_at=least(now()+interval '90 seconds',created_at+interval '15 minutes')
      WHERE token=p_token AND user_id=me AND expires_at>now() AND event_id IS NOT DISTINCT FROM p_event RETURNING * INTO s;
    IF s.token IS NULL THEN RAISE EXCEPTION 'session_expired'; END IF;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  RETURN jsonb_build_object('token',s.token,'expires_at',s.expires_at);
END; $$;

CREATE FUNCTION private.live_connection_compare_core(p_token uuid,p_peer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); s private.live_connection_sessions%ROWTYPE; peer private.live_connection_sessions%ROWTYPE; a jsonb; b jsonb; r jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_token IS NULL OR p_peer IS NULL OR p_token=p_peer THEN RAISE EXCEPTION 'invalid_peer'; END IF;
  -- Serialize the two user profiles as well as their sessions. Profile edits
  -- and session cancellation cannot race a completed result.
  SELECT * INTO s FROM private.live_connection_sessions WHERE token=p_token AND user_id=me;
  SELECT * INTO peer FROM private.live_connection_sessions WHERE token=p_peer;
  IF s.token IS NULL OR peer.token IS NULL OR peer.user_id=me THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(me,peer.user_id)::text||':'||greatest(me,peer.user_id)::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('live-connection-owner:'||least(me,peer.user_id)::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('live-connection-owner:'||greatest(me,peer.user_id)::text,0));
  PERFORM 1 FROM private.live_connection_sessions WHERE token IN(p_token,p_peer) ORDER BY token FOR UPDATE;
  SELECT * INTO s FROM private.live_connection_sessions WHERE token=p_token;
  SELECT * INTO peer FROM private.live_connection_sessions WHERE token=p_peer;
  IF s.expires_at<=now() OR peer.expires_at<=now() OR s.event_id IS DISTINCT FROM peer.event_id
    OR private.live_connection_reason(me,s.event_id) IS NOT NULL OR private.live_connection_reason(peer.user_id,peer.event_id) IS NOT NULL
    OR private.crush_live_is_blocked(me,peer.user_id) THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  IF (s.peer_token IS NOT NULL AND s.peer_token<>p_peer) OR (peer.peer_token IS NOT NULL AND peer.peer_token<>p_token) THEN RAISE EXCEPTION 'peer_busy'; END IF;
  IF s.result IS NOT NULL THEN RETURN jsonb_build_object('state','result','result',s.result); END IF;
  UPDATE private.live_connection_sessions SET peer_token=p_peer,confirmed=true WHERE token=p_token;
  UPDATE private.live_connection_sessions SET peer_token=p_token WHERE token=p_peer;
  IF peer.confirmed THEN
    SELECT data INTO a FROM private.live_connection_profiles WHERE user_id=me;
    SELECT data INTO b FROM private.live_connection_profiles WHERE user_id=peer.user_id;
    IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'profile_incomplete'; END IF;
    r:=private.live_connection_score(a,b,(SELECT gender FROM public.profiles WHERE id=me),(SELECT gender FROM public.profiles WHERE id=peer.user_id),private.crush_live_age(me),private.crush_live_age(peer.user_id));
    UPDATE private.live_connection_sessions SET result=r WHERE token IN(p_token,p_peer);
    RETURN jsonb_build_object('state','result','result',r);
  END IF;
  RETURN jsonb_build_object('state','waiting');
END; $$;

CREATE FUNCTION private.live_connection_result_core(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); s private.live_connection_sessions%ROWTYPE; peer private.live_connection_sessions%ROWTYPE;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO s FROM private.live_connection_sessions WHERE token=p_token AND user_id=me;
  IF s.token IS NULL OR s.expires_at<=now() THEN RAISE EXCEPTION 'session_expired'; END IF;
  IF private.live_connection_reason(me,s.event_id) IS NOT NULL THEN RAISE EXCEPTION 'profile_unavailable'; END IF;
  IF s.peer_token IS NULL THEN RETURN jsonb_build_object('state','searching'); END IF;
  SELECT * INTO peer FROM private.live_connection_sessions WHERE token=s.peer_token;
  IF peer.token IS NULL OR (peer.expires_at<=now() AND s.result IS NULL) OR private.live_connection_reason(peer.user_id,peer.event_id) IS NOT NULL
    OR private.crush_live_is_blocked(me,peer.user_id) THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  IF s.result IS NOT NULL THEN RETURN jsonb_build_object('state','result','result',s.result); END IF;
  -- Only a peer who has already selected MY displayed code may send a prompt.
  -- A received prompt never counts as consent: the recipient confirms locally.
  RETURN jsonb_build_object('state',CASE WHEN s.confirmed THEN 'waiting' ELSE 'confirm' END,
    'peer_token',peer.token,'reference',upper(right(peer.token::text,6)));
END; $$;

CREATE FUNCTION public.live_connection_profile(p_data jsonb DEFAULT NULL,p_consent boolean DEFAULT false,p_event uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.live_connection_profile_core(p_data,p_consent,p_event); $$;
CREATE FUNCTION public.live_connection_session(p_action text,p_token uuid DEFAULT NULL,p_event uuid DEFAULT NULL,p_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.live_connection_session_core(p_action,p_token,p_event,p_owner); $$;
CREATE FUNCTION public.live_connection_compare(p_token uuid,p_peer uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.live_connection_compare_core(p_token,p_peer); $$;
CREATE FUNCTION public.live_connection_result(p_token uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.live_connection_result_core(p_token); $$;

REVOKE ALL ON FUNCTION private.live_connection_profile_core(jsonb,boolean,uuid),private.live_connection_session_core(text,uuid,uuid,uuid),private.live_connection_compare_core(uuid,uuid),private.live_connection_result_core(uuid),public.live_connection_profile(jsonb,boolean,uuid),public.live_connection_session(text,uuid,uuid,uuid),public.live_connection_compare(uuid,uuid),public.live_connection_result(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.live_connection_profile_core(jsonb,boolean,uuid),private.live_connection_session_core(text,uuid,uuid,uuid),private.live_connection_compare_core(uuid,uuid),private.live_connection_result_core(uuid),public.live_connection_profile(jsonb,boolean,uuid),public.live_connection_session(text,uuid,uuid,uuid),public.live_connection_compare(uuid,uuid),public.live_connection_result(uuid) TO authenticated;
-- Optional Instagram exchange is a second, explicit action. A compatibility
-- result never inserts a like/request or reveals a social handle by itself.
CREATE FUNCTION private.live_connection_instagram_core(p_token uuid,p_send boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); s private.live_connection_sessions%ROWTYPE; peer private.live_connection_sessions%ROWTYPE;
  status jsonb; sent boolean; mutual boolean; ready boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO s FROM private.live_connection_sessions WHERE token=p_token AND user_id=me;
  IF s.token IS NULL THEN RAISE EXCEPTION 'session_expired'; END IF;
  SELECT * INTO peer FROM private.live_connection_sessions WHERE token=s.peer_token;
  IF peer.token IS NULL THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(me,peer.user_id)::text||':'||greatest(me,peer.user_id)::text,0));
  status:=private.live_connection_result_core(p_token);
  IF status->>'state'<>'result' THEN RAISE EXCEPTION 'comparison_required'; END IF;
  SELECT count(*)=2 INTO ready FROM public.profiles WHERE id IN(me,peer.user_id)
    AND ligar_opted_in AND instagram_handle IS NOT NULL AND instagram_handle<>'' AND ig_quarantined IS NOT TRUE;
  IF p_send IS TRUE THEN
    IF NOT ready THEN RAISE EXCEPTION 'instagram_profile_required'; END IF;
    PERFORM public._ig_request_apply(peer.user_id);
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.ig_requests WHERE requester_id=me AND target_id=peer.user_id) INTO sent;
  mutual:=ready AND sent AND EXISTS(SELECT 1 FROM public.ig_requests WHERE requester_id=peer.user_id AND target_id=me);
  RETURN jsonb_build_object('ready',ready,'sent',sent,'matched',mutual,
    'instagram_handle',CASE WHEN mutual THEN (SELECT instagram_handle FROM public.profiles WHERE id=peer.user_id) ELSE NULL END);
END; $$;
CREATE FUNCTION public.live_connection_instagram(p_token uuid,p_send boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.live_connection_instagram_core(p_token,p_send); $$;
REVOKE ALL ON FUNCTION private.live_connection_instagram_core(uuid,boolean),public.live_connection_instagram(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.live_connection_instagram_core(uuid,boolean),public.live_connection_instagram(uuid,boolean) TO authenticated;
COMMIT;
