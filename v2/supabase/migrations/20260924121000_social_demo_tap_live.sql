-- Extends the closed social demo cohort to the existing Tap and Crush Live
-- engines. No simulated Bluetooth, no bypass of bilateral confirmation.
INSERT INTO social_demo_private.relations(relation,owners,parents) VALUES
 ('public.events','{organizer_id}','{}'),
 ('public.event_participants','{user_id}','{"event_id":"public.events"}'),
 ('public.crush_live_profiles','{user_id}','{"event_id":"public.events"}'),
 ('public.crush_live_swipes','{swiper_id,target_id}','{"event_id":"public.events"}'),
 ('public.crush_live_matches','{user_a_id,user_b_id}','{"event_id":"public.events","conversation_id":"public.conversations"}'),
 ('public.crush_live_swipe_requests','{actor_id,target_id}','{"event_id":"public.events"}'),
 ('public.crush_tap_tokens','{user_id}','{"event_id":"public.events"}'),
 ('public.crush_taps','{actor_id,peer_id}','{"event_id":"public.events"}'),
 ('private.live_connection_profiles','{user_id}','{}'),
 ('private.live_connection_sessions','{user_id}','{"event_id":"public.events"}');
DO $$DECLARE relation regclass;BEGIN
 FOREACH relation IN ARRAY ARRAY['public.events'::regclass,'public.event_participants'::regclass,'public.crush_live_profiles'::regclass,'public.crush_live_swipes'::regclass,'public.crush_live_matches'::regclass,'public.crush_live_swipe_requests'::regclass,'public.crush_tap_tokens'::regclass,'public.crush_taps'::regclass,'private.live_connection_profiles'::regclass,'private.live_connection_sessions'::regclass] LOOP
  EXECUTE format('ALTER TABLE %s ADD COLUMN social_demo_cohort_id uuid REFERENCES social_demo_private.cohorts(id)',relation);
  EXECUTE format('CREATE INDEX ON %s(social_demo_cohort_id) WHERE social_demo_cohort_id IS NOT NULL',relation);
  EXECUTE format('CREATE TRIGGER "000_social_demo_scope" BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION social_demo_private.scope_row()',relation);
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('DROP POLICY IF EXISTS workspace_demo_read_boundary ON %s',relation);
  EXECUTE format('CREATE POLICY social_demo_scope_boundary ON %s AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.social_demo_row_visible(social_demo_cohort_id)) WITH CHECK(public.social_demo_row_visible(social_demo_cohort_id))',relation);
 END LOOP;
END $$;

-- The shipped tap_* transport uses the audited production engine. Replace
-- only its old blanket demo denial, after installing cohort triggers/RLS on
-- both tokens and results. Keep age/session/consent, locks, context, replay,
-- erasure, suspension and independently expressed Instagram consent intact.
DO $$DECLARE d text;anchor text:=$anchor$IF public.workspace_is_demo_user(auth.uid()) OR public.workspace_is_demo_user(p_user)
    OR public.current_demo_cohort() IS NOT NULL$anchor$;BEGIN
 SELECT pg_get_functiondef('private.tap_participant_allowed(uuid,uuid)'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'audited_tap_demo_boundary_changed';END IF;
 EXECUTE replace(d,anchor,'IF NOT public.social_demo_same_scope(p_user) OR (public.workspace_is_demo_user(p_user) AND social_demo_private.user_cohort(p_user) IS NULL)');
END $$;

-- Comparison is also checked in DEFINER code, not only in RLS. No one can use
-- a learned token to contact a real user or a different/revoked demonstration.
CREATE FUNCTION social_demo_private.live_pair_allowed(p_a uuid,p_b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT social_demo_private.user_cohort(p_a) IS NOT DISTINCT FROM social_demo_private.user_cohort(p_b)
 AND (social_demo_private.user_cohort(p_a) IS NULL OR EXISTS(SELECT 1 FROM social_demo_private.cohorts WHERE id=social_demo_private.user_cohort(p_a) AND active))
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id IN(p_a,p_b) AND (is_discarded IS TRUE OR self_deleted IS TRUE))
$$;
REVOKE ALL ON FUNCTION social_demo_private.live_pair_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE d text;BEGIN
 SELECT pg_get_functiondef('private.crush_live_is_blocked(uuid,uuid)'::regprocedure) INTO d;
 IF strpos(d,'SELECT EXISTS')=0 THEN RAISE EXCEPTION 'live_block_boundary_changed';END IF;
 EXECUTE replace(d,'SELECT EXISTS','SELECT NOT social_demo_private.live_pair_allowed(p_user_a,p_user_b) OR EXISTS');
 SELECT pg_get_functiondef('private.live_connection_reason(uuid,uuid)'::regprocedure) INTO d;
 IF strpos(d,'IF p.id IS NULL OR p.is_discarded IS TRUE OR p.is_hidden IS TRUE')=0 THEN RAISE EXCEPTION 'tap_reason_boundary_changed';END IF;
 EXECUTE replace(d,'IF p.id IS NULL OR p.is_discarded IS TRUE OR p.is_hidden IS TRUE','IF NOT public.social_demo_same_scope(p_user) OR p.id IS NULL OR p.is_discarded IS TRUE OR p.self_deleted IS TRUE OR p.is_hidden IS TRUE');
END $$;

CREATE FUNCTION social_demo_private.require_live_actor() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 PERFORM public.require_account_session();
 IF NOT public.social_demo_same_scope(auth.uid()) THEN RAISE EXCEPTION 'social_demo_revoked' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION social_demo_private.require_live_actor() FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE signature text;d text;BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'private.live_connection_profile_core(jsonb,boolean,uuid)','private.live_connection_session_core(text,uuid,uuid,uuid)',
  'private.live_connection_compare_core(uuid,uuid)','private.live_connection_result_core(uuid)','private.live_connection_instagram_core(uuid,boolean)',
  'private.get_crush_live_events_core()','private.get_crush_live_state_core(uuid)',
  'private.set_crush_live_profile_core(uuid,boolean,text,text[],integer,integer,jsonb)',
  'private.get_crush_live_feed_core(uuid,integer)','private.crush_live_swipe_core(uuid,uuid,text,uuid)','private.get_crush_live_matches_core(uuid)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO d;
  IF strpos(d,'BEGIN')=0 THEN RAISE EXCEPTION 'live_actor_boundary_changed: %',signature;END IF;
  EXECUTE regexp_replace(d,'\mBEGIN\M','BEGIN PERFORM social_demo_private.require_live_actor();');
 END LOOP;
END $$;

-- Only the service seed may enroll fictional attendees. Keep the complete
-- production admission/capacity logic for every non-demo participant.
DO $$DECLARE d text;BEGIN
 SELECT pg_get_functiondef('workspace_private.guard_event_admission_child()'::regprocedure) INTO d;
 IF strpos(d,'doc jsonb:=to_jsonb(NEW)')=0 THEN RAISE EXCEPTION 'live_admission_boundary_changed';END IF;
 EXECUTE regexp_replace(d,'\mBEGIN\M',$body$BEGIN
 IF TG_TABLE_NAME='event_participants' AND doc->>'social_demo_cohort_id' IS NOT NULL THEN
  IF auth.uid() IS NOT NULL OR coalesce(auth.jwt()->>'role','')<>'service_role'
   OR NOT EXISTS(SELECT 1 FROM public.events fixture WHERE fixture.id=(doc->>'event_id')::uuid
    AND fixture.social_demo_cohort_id=(doc->>'social_demo_cohort_id')::uuid
    AND fixture.payment_mode='free' AND fixture.price=0 AND fixture.status IN('upcoming','ongoing'))
  THEN RAISE EXCEPTION 'social_demo_enrollment_service_only' USING ERRCODE='42501';END IF;
  RETURN NEW;
 END IF;
$body$);
END $$;

DO $$DECLARE d text;BEGIN
 SELECT pg_get_functiondef('growth_private.record_activation()'::regprocedure) INTO d;
 IF strpos(d,'u:=NEW.user_id;')=0 THEN RAISE EXCEPTION 'live_growth_boundary_changed';END IF;
 EXECUTE replace(d,'u:=NEW.user_id;','u:=NEW.user_id; IF public.workspace_is_demo_user(u) THEN RETURN NEW;END IF;');
 SELECT pg_get_functiondef('growth_private.profile_qualification()'::regprocedure) INTO d;
 IF strpos(d,'IF NEW.onboarding_completed')=0 THEN RAISE EXCEPTION 'social_demo_growth_profile_boundary_changed';END IF;
 EXECUTE regexp_replace(d,'\mBEGIN\M','BEGIN IF public.workspace_is_demo_user(NEW.id) THEN RETURN NEW;END IF;');
END $$;

-- Every existing SQL read of events uses a scoped view, including DEFINER
-- readers, cron/reminder queries, counters and marketplace lookups. Their
-- INSERT/UPDATE/DELETE targets and existing authorization stay unchanged.
-- INVOKER is important: readers that run with caller permissions must retain
-- the original events RLS and column/table ACLs. This adds no write access.
CREATE VIEW public.social_demo_visible_events WITH(security_invoker=true) AS
 SELECT * FROM public.events WHERE public.social_demo_row_visible(social_demo_cohort_id);
REVOKE ALL ON public.social_demo_visible_events FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE reader text;BEGIN
 FOREACH reader IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(reader,'public.events','SELECT') THEN
   EXECUTE format('GRANT SELECT ON public.social_demo_visible_events TO %I',reader);
  END IF;
 END LOOP;
END $$;
DO $$DECLARE f record;d text;changed text;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('public','private','workspace_private','social_private') AND p.prokind='f'
 AND pg_get_functiondef(p.oid) ~* '\m(FROM|JOIN)\s+(public\.)?events\M' LOOP
  SELECT pg_get_functiondef(f.signature) INTO d;
  changed:=regexp_replace(d,'\m(FROM|JOIN)\s+(public\.)?events\M','\1 public.social_demo_visible_events','gi');
  -- The service-only synthetic enrollment branch uses the already validated
  -- NEW cohort; background admission checks below it still use the scoped view.
  IF f.signature='workspace_private.guard_event_admission_child()'::regprocedure THEN
   changed:=replace(changed,'FROM public.social_demo_visible_events fixture','FROM public.events fixture');
  END IF;
  EXECUTE changed;
 END LOOP;
END $$;

-- Automatic publication fan-out and event group creation are unnecessary for
-- this fixture. Match-created direct chats still run through the real engine.
DO $$DECLARE signature text;d text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.on_event_created_notify()','public.crear_chat_al_publicar_evento()'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO d;
  IF strpos(d,'BEGIN')=0 THEN RAISE EXCEPTION 'live_event_trigger_changed';END IF;
  EXECUTE regexp_replace(d,'\mBEGIN\M','BEGIN IF NEW.social_demo_cohort_id IS NOT NULL THEN RETURN NEW;END IF;');
 END LOOP;
END $$;
CREATE FUNCTION social_demo_private.guard_live_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.social_demo_cohort_id IS NULL THEN RETURN NEW;END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'social_demo_event_service_only' USING ERRCODE='42501';END IF;
 IF NEW.payment_mode<>'free' OR coalesce(NEW.price,0)<>0 OR NEW.shirts_enabled OR NEW.is_featured
 OR NEW.price_without_shirt IS NOT NULL OR NEW.price_with_shirt IS NOT NULL OR NEW.leisure_spot_id IS NOT NULL
 OR NEW.organization_id IS NOT NULL OR NEW.title NOT LIKE '[DEMO]%' THEN RAISE EXCEPTION 'social_demo_event_must_be_free';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_demo_private.guard_live_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER "001_social_demo_live_event" BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION social_demo_private.guard_live_event();

-- Requests remain explicitly allowlisted. Payment/ticket/host-edit operations
-- are not opened by adding a free Crush Live event to the demo cohort.
DO $$DECLARE d text;anchor text:='''/rpc/get_social_demo_access''';BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'social_demo_rpc_boundary_changed';END IF;
 EXECUTE replace(d,anchor,anchor||',''/rpc/tap_start'',''/rpc/tap_connect'',''/rpc/tap_poll'',''/rpc/tap_stop'',''/rpc/live_connection_profile'',''/rpc/live_connection_session'',''/rpc/live_connection_compare'',''/rpc/live_connection_result'',''/rpc/live_connection_instagram'',''/rpc/get_crush_live_events'',''/rpc/get_crush_live_state'',''/rpc/set_crush_live_profile'',''/rpc/get_crush_live_feed'',''/rpc/crush_live_swipe'',''/rpc/get_crush_live_matches''');
END $$;

CREATE TABLE social_demo_private.live_seeds (
 cohort_id uuid PRIMARY KEY REFERENCES social_demo_private.cohorts(id),
 event_id uuid NOT NULL UNIQUE REFERENCES public.events(id),
 seeded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE social_demo_private.live_seeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_demo_private.live_seeds FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.seed_social_demo_tap_live(p_cohort uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reviewer uuid;peers uuid[];u uuid;ev uuid;claims text:=current_setting('request.jwt.claims',true);
 answers jsonb:='{"social_energy":3,"spontaneity":3,"communication":3,"affection":3,"schedule":3}'::jsonb;
 payload jsonb;existing social_demo_private.live_seeds;BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'service_role_required';END IF;
 PERFORM 1 FROM social_demo_private.cohorts WHERE id=p_cohort AND active AND seeded_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'social_demo_missing';END IF;
 SELECT user_id INTO reviewer FROM social_demo_private.reservations WHERE cohort_id=p_cohort AND actor_kind='reviewer';
 SELECT array_agg(user_id ORDER BY email) INTO peers FROM social_demo_private.reservations WHERE cohort_id=p_cohort AND actor_kind='fixture';
 IF reviewer IS NULL OR cardinality(peers)<3 OR array_position(peers,NULL) IS NOT NULL
 OR EXISTS(SELECT 1 FROM social_demo_private.reservations r LEFT JOIN public.workspace_demo_accounts d ON d.user_id=r.user_id LEFT JOIN public.profiles p ON p.id=r.user_id
 WHERE r.cohort_id=p_cohort AND(d.cohort_id IS DISTINCT FROM p_cohort OR p.id IS NULL OR p.role IS DISTINCT FROM 'user' OR p.is_discarded IS TRUE OR p.self_deleted IS TRUE)) THEN RAISE EXCEPTION 'social_demo_accounts_incomplete';END IF;
 SELECT * INTO existing FROM social_demo_private.live_seeds WHERE cohort_id=p_cohort;
 IF FOUND THEN RETURN jsonb_build_object('ready',true,'already_seeded',true,'event_id',existing.event_id,'reviewer_id',reviewer,'peer_ids',peers,'demo',true);END IF;
 INSERT INTO public.events(title,description,organizer_id,city,venue,address,start_date,end_date,category,price,max_capacity,payment_mode,status,is_official,crush_live_enabled)
 VALUES('[DEMO] Encuentro privado para probar Crush Live','Evento ficticio gratuito. Sólo participan cuentas de esta demostración; no es un encuentro real.',reviewer,'Campus de demostración','Sala ficticia','Sin dirección real',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '30 days','networking',0,20,'free','ongoing',true,true) RETURNING id INTO ev;
 FOREACH u IN ARRAY ARRAY[reviewer]||peers LOOP
  -- Verification is synthetic and inaccessible to other cohorts. It does not
  -- validate a real university affiliation or grant institutional permissions.
  UPDATE public.profiles SET student_email_verified=true WHERE id=u;
  INSERT INTO public.event_participants(event_id,user_id,status) VALUES(ev,u,'registered');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
  payload:=jsonb_build_object('owner',u,'goal','conocer','preferred_genders',ARRAY['hombre','mujer','no_binario'],'age_min',18,'age_max',80,'interests',ARRAY['musica','cine','arte'],'answers',answers,'desired',answers);
  PERFORM public.live_connection_profile(payload,true,NULL);
  PERFORM public.set_crush_live_profile(ev,true,'conocer',ARRAY['hombre','mujer','no_binario'],18,80,answers);
  PERFORM set_config('request.jwt.claims',claims,true);
 END LOOP;
 -- One preloaded bilateral match; other peers remain in the event's real feed.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal1')::text,true);
 PERFORM public.crush_live_swipe(ev,peers[2],'like',gen_random_uuid());
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',peers[2],'role','authenticated','aal','aal1')::text,true);
 PERFORM public.crush_live_swipe(ev,reviewer,'like',gen_random_uuid());
 PERFORM set_config('request.jwt.claims',claims,true);
 INSERT INTO social_demo_private.live_seeds(cohort_id,event_id) VALUES(p_cohort,ev);
 RETURN jsonb_build_object('ready',true,'already_seeded',false,'event_id',ev,'reviewer_id',reviewer,'peer_ids',peers,'demo',true);
END $$;
REVOKE ALL ON FUNCTION public.seed_social_demo_tap_live(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seed_social_demo_tap_live(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
