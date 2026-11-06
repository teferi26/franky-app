-- Social demonstrations use the normal FOMO / Crush / chat data model.
-- No real account can be converted. Registration is reserved before Auth signup.
-- Workspace demos retain their original default-deny boundary.
CREATE SCHEMA social_demo_private;
REVOKE ALL ON SCHEMA social_demo_private FROM PUBLIC,anon,authenticated;
CREATE TABLE social_demo_private.cohorts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL CHECK(length(label) BETWEEN 3 AND 100),
 active boolean NOT NULL DEFAULT true,
 seeded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE social_demo_private.reservations (
 email text PRIMARY KEY CHECK(email ~ '^[a-z0-9._+-]+@social-demo\.franky\.invalid$'),
 cohort_id uuid NOT NULL REFERENCES social_demo_private.cohorts(id),
 actor_kind text NOT NULL CHECK(actor_kind IN('reviewer','fixture')),
 reserved_user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 user_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE social_demo_private.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_demo_private.reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA social_demo_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION social_demo_private.user_cohort(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.cohort_id FROM social_demo_private.reservations r WHERE r.user_id=p_user
$$;
CREATE FUNCTION public.social_demo_same_scope(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT social_demo_private.user_cohort(p_user) IS NOT DISTINCT FROM social_demo_private.user_cohort(auth.uid())
 AND (public.current_demo_cohort() IS NULL OR social_demo_private.user_cohort(auth.uid()) IS NOT NULL)
 AND (social_demo_private.user_cohort(auth.uid()) IS NULL OR EXISTS(
  SELECT 1 FROM social_demo_private.cohorts c WHERE c.id=social_demo_private.user_cohort(auth.uid()) AND c.active))
$$;
REVOKE ALL ON FUNCTION social_demo_private.user_cohort(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.social_demo_same_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_demo_same_scope(uuid) TO anon,authenticated,service_role;

-- Social profiles refer to the existing public academic catalogue. Lift only
-- the workspace demo SELECT boundary for an active registered social cohort;
-- retain every other RLS policy, grant and the existing write-denial trigger.
DO $$DECLARE t text; q text;BEGIN
 FOREACH t IN ARRAY ARRAY['universities','careers','scholarships'] LOOP
  SELECT pg_get_expr(polqual,polrelid) INTO q FROM pg_policy
  WHERE polrelid=format('public.%I',t)::regclass AND polname='workspace_demo_read_boundary' AND polcmd='r' AND NOT polpermissive;
  IF q IS NULL THEN RAISE EXCEPTION 'academic_catalogue_demo_boundary_changed';END IF;
  EXECUTE format('ALTER POLICY workspace_demo_read_boundary ON public.%I USING ((%s) OR (public.current_demo_cohort() IS NOT NULL AND public.social_demo_same_scope(auth.uid())))',t,q);
 END LOOP;
END $$;

CREATE FUNCTION public.get_social_demo_access() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c social_demo_private.cohorts%ROWTYPE;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required';END IF;
 PERFORM public.require_account_session();
 SELECT * INTO c FROM social_demo_private.cohorts WHERE id=social_demo_private.user_cohort(auth.uid());
 RETURN CASE WHEN NOT FOUND THEN jsonb_build_object('demo',false)
 ELSE jsonb_build_object('demo',true,'active',c.active,'label',c.label,'cohort_id',c.id) END;
END $$;
-- Chat attachments stay in the existing private bucket and require current
-- participation. Public avatar/social buckets remain unavailable to demos.
CREATE FUNCTION public.social_demo_chat_media_allowed(p_bucket text,p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conversation uuid; cohort uuid:=social_demo_private.user_cohort(auth.uid());BEGIN
 IF cohort IS NULL OR p_bucket<>'chat-media' OR NOT public.account_session_usable()
 OR split_part(p_name,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false;END IF;
 conversation:=split_part(p_name,'/',1)::uuid;
 RETURN EXISTS(SELECT 1 FROM public.conversations c JOIN social_demo_private.cohorts d ON d.id=c.social_demo_cohort_id
 WHERE c.id=conversation AND d.id=cohort AND d.active AND EXISTS(SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=c.id AND cp.user_id=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.social_demo_chat_media_allowed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_demo_chat_media_allowed(text,text) TO authenticated;
DO $$DECLARE d text;anchor text:='DECLARE data jsonb; BEGIN';BEGIN
 SELECT pg_get_functiondef('workspace_private.guard_demo_storage()'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'demo_storage_boundary_changed';END IF;
 EXECUTE replace(d,anchor,anchor||$body$
 IF public.social_demo_chat_media_allowed((CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'bucket_id',(CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'name') THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 -- Storage 1.77 finalizes an already-authorized upload as its database role.
 -- Preserve owner/name on update, then revalidate the actual uploader and cohort.
 IF TG_OP IN('INSERT','UPDATE') AND session_user='supabase_storage_admin'
 AND auth.uid() IS NULL AND coalesce(auth.jwt()->>'role','')='service_role'
 AND NEW.bucket_id='chat-media' AND NEW.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND split_part(NEW.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND (NEW.owner IS NULL OR NEW.owner::text=NEW.owner_id)
 AND (TG_OP='INSERT' OR OLD.bucket_id=NEW.bucket_id AND OLD.name=NEW.name AND OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id AND OLD.owner IS NOT DISTINCT FROM NEW.owner)
 AND EXISTS(SELECT 1 FROM public.conversations c JOIN social_demo_private.cohorts d ON d.id=c.social_demo_cohort_id
  JOIN public.conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id::text=NEW.owner_id
  JOIN auth.users u ON u.id=cp.user_id
  WHERE c.id::text=split_part(NEW.name,'/',1) AND d.active AND d.id=social_demo_private.user_cohort(cp.user_id)
  AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM account_private.erasures e WHERE e.user_id=cp.user_id))
 THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' AND auth.uid() IS NULL AND coalesce(auth.jwt()->>'role','')='service_role' AND OLD.bucket_id='chat-media'
 AND EXISTS(SELECT 1 FROM account_private.files f JOIN account_private.erasures e ON e.user_id=f.user_id
 WHERE f.bucket_id=OLD.bucket_id AND f.name=OLD.name AND e.state IN('purged','complete') AND social_demo_private.user_cohort(f.user_id) IS NOT NULL)
 THEN RETURN OLD;END IF;
$body$);
END $$;
-- Preserve the complete prior policy, including Card's own-photo exception.
DO $$DECLARE p record; statement text;BEGIN
 FOR p IN SELECT polname,polcmd,pg_get_expr(polqual,polrelid) q,pg_get_expr(polwithcheck,polrelid) c
 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname=ANY(ARRAY['workspace_demo_storage_read','workspace_demo_storage_insert','workspace_demo_storage_update','workspace_demo_storage_delete']) LOOP
  statement:=format('CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR %s TO authenticated',p.polname,CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END);
  IF p.q IS NOT NULL THEN statement:=statement||' USING(('||p.q||') OR public.social_demo_chat_media_allowed(bucket_id,name))';END IF;
  IF p.c IS NOT NULL THEN statement:=statement||' WITH CHECK(('||p.c||') OR public.social_demo_chat_media_allowed(bucket_id,name))';END IF;
  EXECUTE format('DROP POLICY %I ON storage.objects',p.polname);EXECUTE statement;
 END LOOP;
END $$;

CREATE FUNCTION public.seed_social_demo(p_cohort uuid,p_university uuid,p_avatars jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c social_demo_private.cohorts%ROWTYPE; reviewer uuid; peers uuid[]; v_user uuid; n integer:=0;
 claims text:=current_setting('request.jwt.claims',true); r social_private.publication_reviews%ROWTYPE;
 fomo uuid; crush uuid; chat uuid;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_role_required';END IF;
 SELECT * INTO c FROM social_demo_private.cohorts WHERE id=p_cohort FOR UPDATE;
 IF NOT FOUND OR NOT c.active THEN RAISE EXCEPTION 'social_demo_missing';END IF;
 IF c.seeded_at IS NOT NULL THEN RETURN jsonb_build_object('cohort_id',p_cohort,'ready',true,'already_seeded',true);END IF;
 SELECT user_id INTO reviewer FROM social_demo_private.reservations WHERE cohort_id=c.id AND actor_kind='reviewer';
 SELECT array_agg(user_id ORDER BY email) INTO peers FROM social_demo_private.reservations WHERE cohort_id=c.id AND actor_kind='fixture';
 IF reviewer IS NULL OR cardinality(peers)<3 OR array_position(peers,NULL) IS NOT NULL
 OR EXISTS(SELECT 1 FROM social_demo_private.reservations res LEFT JOIN public.workspace_demo_accounts d ON d.user_id=res.user_id
 WHERE res.cohort_id=c.id AND d.cohort_id IS DISTINCT FROM c.id) THEN RAISE EXCEPTION 'social_demo_accounts_incomplete';END IF;
 IF NOT EXISTS(SELECT 1 FROM universities WHERE id=p_university) THEN RAISE EXCEPTION 'university_required';END IF;
 IF jsonb_typeof(p_avatars) IS DISTINCT FROM 'array' OR jsonb_array_length(p_avatars)<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_avatars) a WHERE a IS NULL OR length(a)>150000 OR a !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$') THEN RAISE EXCEPTION 'four_synthetic_png_avatars_required';END IF;
 FOREACH v_user IN ARRAY ARRAY[reviewer]||peers LOOP

  UPDATE public.profiles SET full_name=CASE WHEN n=0 THEN 'Revisión · cuenta de demostración' WHEN n=1 THEN 'Alba · persona ficticia' WHEN n=2 THEN 'Leo · persona ficticia' ELSE 'Noa · persona ficticia' END,
   bio='Demostración aislada de Franky. Esta persona y todas sus conversaciones son ficticias.',
   avatar_url=p_avatars->>(n%4),
   birth_date=make_date(2002,2,least(n+1,28)),university_id=p_university,career='Ingeniería Informática',academic_year=3,university_course=3,
   student_type='universidad',is_student=true,city='Campus de demostración',onboarding_completed=true,email_verified_at=clock_timestamp(),
   gender=CASE WHEN n%2=0 THEN 'hombre' ELSE 'mujer' END,instagram_handle='franky_demo_'||left(replace(v_user::text,'-',''),12),
   ligar_opted_in=n<>3,instagram_verified=false,dm_privacy='todos'
  WHERE profiles.id=v_user;
  INSERT INTO social_private.community_terms_acceptances(user_id,version) VALUES(v_user,'2026-09-10') ON CONFLICT DO NOTHING;
  n:=n+1;
 END LOOP;
 -- Normal posting RPCs retain validation and enqueue normal moderation rows.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',peers[1],'role','authenticated','aal','aal1')::text,true);
 fomo:=public.create_fomo_thread(p_university,'[DEMO] ¿Probamos el foro? Puedes responder, reaccionar, ocultar o denunciar esta publicación. Todas las personas de este espacio son ficticias.',NULL,NULL,false,'¿Qué plan probarías?',ARRAY['Biblioteca','Deporte','Café']);
 crush:=(public.create_ligar_post('[DEMO] Nos hemos cruzado estudiando en la biblioteca. Este mensaje es ficticio.','Puedes pedir mi Instagram para probar una solicitud; no es un contacto real.',NULL,NULL,'todos',true)->>'id')::uuid;
 PERFORM public.request_ig(reviewer);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',peers[2],'role','authenticated','aal','aal1')::text,true);
 PERFORM public.create_fomo_thread(p_university,'[DEMO] Bienvenida al campus de prueba. Este hilo sirve para probar bloquear a una persona ficticia sin afectar a nadie real.',NULL,NULL,false);
 PERFORM public.create_ligar_post('[DEMO] Perfil y publicación de ejemplo para revisar Crush.','Las coincidencias de esta cuenta son ficticias y se mantienen en esta demostración.',NULL,NULL,'todos',false);
 PERFORM public.request_ig(reviewer);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal1')::text,true);
 PERFORM public.request_ig(peers[2]);
 PERFORM public.create_fomo_thread(p_university,'[DEMO] Esta es mi publicación de ejemplo. Puedo borrarla desde su menú.',NULL,NULL,false);
 chat:=public.get_or_create_direct_chat(peers[2]);
 INSERT INTO public.messages(conversation_id,sender_id,content,message_type) VALUES(chat,reviewer,'[DEMO] ¡Hola! Estoy probando el chat tras un match consentido.','text');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',peers[2],'role','authenticated','aal','aal1')::text,true);
 INSERT INTO public.messages(conversation_id,sender_id,content,message_type) VALUES(chat,peers[2],'[DEMO] Este mensaje está precargado. No hay personas reales al otro lado. Puedes probar respuestas, editar tu mensaje y bloquear.','text');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal1')::text,true);
 chat:=public.get_or_create_direct_chat(peers[3]);
 INSERT INTO public.messages(conversation_id,sender_id,content,message_type) VALUES(chat,reviewer,'[DEMO] Contacto ficticio que todavía no participa en Crush: puedes probar Invitar.','text');
 PERFORM set_config('request.jwt.claims',claims,true);
 -- Approve only fixed fixture texts in this new cohort, never another queue.
 FOR r IN SELECT * FROM social_private.publication_reviews WHERE social_demo_cohort_id=c.id AND status='pending' FOR UPDATE LOOP
  UPDATE social_private.publication_reviews SET status='processing',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '3 minutes',attempts=attempts+1 WHERE publication_reviews.id=r.id RETURNING * INTO r;
  IF NOT public.finish_publication_review(r.id,r.revision,r.lease_id,'approved','synthetic_fixture_reviewed') THEN RAISE EXCEPTION 'social_demo_fixture_review_failed';END IF;
 END LOOP;
 UPDATE social_demo_private.cohorts SET seeded_at=clock_timestamp() WHERE cohorts.id=c.id;
 RETURN jsonb_build_object('cohort_id',c.id,'ready',true,'accounts',cardinality(peers)+1,'reviewer_id',reviewer,'demo',true);
END $$;
REVOKE ALL ON FUNCTION public.seed_social_demo(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seed_social_demo(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.get_social_demo_provisioning(p_emails text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_role_required';END IF;
 IF cardinality(p_emails) NOT BETWEEN 4 AND 12 THEN RAISE EXCEPTION 'invalid_social_demo_reservation';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('email',r.email,'cohort_id',r.cohort_id,'user_id',r.user_id,'reserved_user_id',r.reserved_user_id,'actor_kind',r.actor_kind) ORDER BY r.created_at,r.email)
  FROM social_demo_private.reservations r WHERE r.email=ANY(p_emails)),'[]');
END $$;
REVOKE ALL ON FUNCTION public.get_social_demo_provisioning(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_demo_provisioning(text[]) TO service_role;
REVOKE ALL ON FUNCTION public.get_social_demo_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_social_demo_access() TO authenticated;

CREATE FUNCTION public.reserve_social_demo(p_label text,p_emails text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; e text;BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'service_role_required';END IF;
 IF p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 3 AND 100 OR cardinality(p_emails) NOT BETWEEN 4 AND 12
 OR EXISTS(SELECT 1 FROM unnest(p_emails) x WHERE x IS NULL OR x !~ '^[a-z0-9._+-]+@social-demo\.franky\.invalid$')
 OR (SELECT count(DISTINCT x) FROM unnest(p_emails) x)<>cardinality(p_emails) THEN RAISE EXCEPTION 'invalid_social_demo_reservation';END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=ANY(p_emails)) THEN RAISE EXCEPTION 'existing_account_cannot_become_demo';END IF;
 INSERT INTO social_demo_private.cohorts(label) VALUES(btrim(p_label)) RETURNING id INTO c;
 FOREACH e IN ARRAY p_emails LOOP
  INSERT INTO social_demo_private.reservations(email,cohort_id,actor_kind)
  VALUES(e,c,CASE WHEN e=p_emails[1] THEN 'reviewer' ELSE 'fixture' END);
 END LOOP;
 RETURN jsonb_build_object('cohort_id',c,'reserved',cardinality(p_emails));
END $$;
REVOKE ALL ON FUNCTION public.reserve_social_demo(text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_social_demo(text,text[]) TO service_role;

CREATE FUNCTION social_demo_private.register_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r social_demo_private.reservations%ROWTYPE;BEGIN
 SELECT * INTO r FROM social_demo_private.reservations WHERE email=lower(NEW.email) FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF r.user_id IS NOT NULL AND r.user_id<>NEW.id THEN RAISE EXCEPTION 'social_demo_reservation_used';END IF;
 -- Auth Admin inserts the row before applying app_metadata. A server-reserved
 -- UUID (never returned to clients) protects this first insert instead.
 IF NEW.id<>r.reserved_user_id THEN RAISE EXCEPTION 'social_demo_signup_requires_service';END IF;
 UPDATE social_demo_private.reservations SET user_id=NEW.id WHERE email=r.email;
 INSERT INTO public.workspace_demo_accounts(user_id,cohort_id) VALUES(NEW.id,r.cohort_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_demo_private.register_auth() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aaa_social_demo_registration AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION social_demo_private.register_auth();

-- GoTrue soft deletion obfuscates identity fields before clearing metadata.
-- Only a purged erasure may cross the demo email lock, with exact one-way
-- hashes used by GoTrue (or NULL sanitization). Normal identity changes stay denied.
DO $$DECLARE d text;anchor text:='IF public.workspace_is_demo_user(NEW.id) THEN';BEGIN
 SELECT pg_get_functiondef('workspace_private.guard_auth_demo_email()'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'demo_auth_identity_guard_changed';END IF;
 EXECUTE replace(d,anchor,anchor||$body$
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
   AND (session_user='supabase_auth_admin' OR auth.uid() IS NULL AND coalesce(auth.jwt()->>'role','')='service_role')
   AND EXISTS(SELECT 1 FROM account_private.erasures e WHERE e.user_id=NEW.id AND e.state IN('purged','complete')) THEN
   FOREACH key IN ARRAY ARRAY['email','phone','email_change','phone_change'] LOOP
    IF after_row->>key IS NOT NULL AND after_row->>key IS DISTINCT FROM (CASE WHEN key IN('phone','phone_change')
     THEN left(translate(rtrim(encode(extensions.digest(NEW.id::text||coalesce(before_row->>key,''),'sha256'),'base64'),'='),'+/','-_'),15)
     ELSE translate(rtrim(encode(extensions.digest(NEW.id::text||coalesce(before_row->>key,''),'sha256'),'base64'),'='),'+/','-_') END)
    THEN RAISE EXCEPTION 'demo_identity_locked' USING ERRCODE='42501';END IF;
   END LOOP;
   RETURN NEW;
  END IF;
$body$);
END $$;

-- Explicit relation/owner/parent registry; unlisted tables remain denied.
CREATE TABLE social_demo_private.relations (
 relation regclass PRIMARY KEY, owners text[] NOT NULL DEFAULT '{}', parents jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE social_demo_private.relations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_demo_private.relations FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO social_demo_private.relations(relation,owners,parents) VALUES
 ('public.fomo_threads','{author_id}','{}'),
 ('public.fomo_replies','{author_id}','{"thread_id":"public.fomo_threads","parent_id":"public.fomo_replies"}'),
 ('public.fomo_polls','{}','{"thread_id":"public.fomo_threads"}'),
 ('public.fomo_poll_options','{}','{"poll_id":"public.fomo_polls"}'),
 ('public.fomo_poll_votes','{voter_id}','{"poll_id":"public.fomo_polls","option_id":"public.fomo_poll_options"}'),
 ('public.fomo_reactions','{user_id}','{"thread_id":"public.fomo_threads"}'),
 ('public.fomo_reply_reactions','{user_id}','{"reply_id":"public.fomo_replies"}'),
 ('public.fomo_reports','{reporter_id}','{}'),
 ('public.ligar_posts','{author_id}','{}'),
 ('public.ligar_reactions','{user_id}','{"post_id":"public.ligar_posts"}'),
 ('public.ligar_reports','{reporter_id}','{"post_id":"public.ligar_posts"}'),
 ('public.ig_requests','{requester_id,target_id}','{}'),
 ('public.ig_reports','{reporter_id,reported_id}','{}'),
 ('public.profile_photo_reports','{reporter_id,target_id}','{}'),
 ('public.ligar_nominations','{nominator_id,nominee_id}','{}'),
 ('public.blocked_users','{blocker_id,blocked_id}','{}'),
 ('public.user_blocks','{blocker_id,blocked_id}','{}'),
 ('public.follows','{follower_id,followee_id}','{}'),
 ('public.favorites','{user_id}','{}'),
 ('public.conversations','{created_by}','{}'),
 ('public.conversation_participants','{user_id}','{"conversation_id":"public.conversations"}'),
 ('public.messages','{sender_id}','{"conversation_id":"public.conversations","reply_to_id":"public.messages"}'),
 ('public.message_reactions','{user_id}','{"message_id":"public.messages"}'),
 ('public.chat_polls','{author_id}','{"conversation_id":"public.conversations","message_id":"public.messages"}'),
 ('public.chat_poll_votes','{user_id}','{"poll_id":"public.chat_polls"}'),
 ('public.social_content_reports','{reporter_id}','{}'),
 ('social_private.social_author_blocks','{viewer_id,author_id}','{}'),
 ('social_private.hidden_content','{viewer_id}','{}'),
 ('social_private.community_terms_acceptances','{user_id}','{}'),
 ('social_private.publication_reviews','{author_id}','{}'),
 ('social_private.report_authors','{user_id}','{"report_id":"public.social_content_reports"}');

CREATE FUNCTION social_demo_private.content_cohort(p_kind text,p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; rel text;BEGIN
 IF p_kind='profile_photo' THEN RETURN social_demo_private.user_cohort(p_id);END IF;
 rel:=CASE p_kind WHEN 'fomo_thread' THEN 'public.fomo_threads' WHEN 'thread' THEN 'public.fomo_threads'
 WHEN 'fomo_reply' THEN 'public.fomo_replies' WHEN 'reply' THEN 'public.fomo_replies'
 WHEN 'crush_post' THEN 'public.ligar_posts' WHEN 'message' THEN 'public.messages' END;
 IF rel IS NULL THEN RETURN NULL;END IF;
 EXECUTE format('SELECT social_demo_cohort_id FROM %s WHERE id=$1',rel) INTO c USING p_id;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION social_demo_private.content_cohort(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION social_demo_private.scope_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r social_demo_private.relations%ROWTYPE; d jsonb; old_d jsonb; key text; pair record;
 expected uuid; scope uuid; seen boolean:=false; actor uuid:=social_demo_private.user_cohort(auth.uid()); parent_exists boolean;
BEGIN
 d:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 SELECT * INTO r FROM social_demo_private.relations WHERE relation=TG_RELID;
 IF NOT FOUND THEN RAISE EXCEPTION 'social_demo_relation_unregistered';END IF;
 FOREACH key IN ARRAY r.owners LOOP
  IF nullif(d->>key,'') IS NOT NULL THEN
   scope:=social_demo_private.user_cohort((d->>key)::uuid);
   IF seen AND expected IS DISTINCT FROM scope THEN RAISE EXCEPTION 'social_demo_cross_scope' USING ERRCODE='42501';END IF;
   expected:=scope;seen:=true;
  END IF;
 END LOOP;
 FOR pair IN SELECT * FROM jsonb_each_text(r.parents) LOOP
  IF nullif(d->>pair.key,'') IS NOT NULL THEN
   EXECUTE format('SELECT true,social_demo_cohort_id FROM %s WHERE id=$1',pair.value) INTO parent_exists,scope USING (d->>pair.key)::uuid;
   IF NOT coalesce(parent_exists,false) THEN RAISE EXCEPTION 'social_demo_parent_missing';END IF;
   IF seen AND expected IS DISTINCT FROM scope THEN RAISE EXCEPTION 'social_demo_cross_scope' USING ERRCODE='42501';END IF;
   expected:=scope;seen:=true;
  END IF;
 END LOOP;
 -- Polymorphic references are checked against a closed content-kind mapping.
 IF TG_TABLE_NAME IN('social_content_reports','hidden_content','fomo_reports','favorites','publication_reviews') THEN
  key:=CASE TG_TABLE_NAME WHEN 'fomo_reports' THEN d->>'target_type' WHEN 'favorites' THEN d->>'target_type' ELSE d->>'target_kind' END;
  IF key='fomo' THEN key:='fomo_thread';END IF;
  scope:=social_demo_private.content_cohort(key,(d->>'target_id')::uuid);
  IF seen AND expected IS DISTINCT FROM scope THEN RAISE EXCEPTION 'social_demo_cross_scope' USING ERRCODE='42501';END IF;
 END IF;
 IF NOT seen AND TG_TABLE_NAME='conversations' THEN
  expected:=CASE WHEN TG_OP='INSERT' THEN actor ELSE (to_jsonb(OLD)->>'social_demo_cohort_id')::uuid END;seen:=true;
 END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>'social_demo_cohort_id')::uuid IS DISTINCT FROM expected THEN RAISE EXCEPTION 'social_demo_scope_immutable';END IF;
 IF actor IS NOT NULL AND actor IS DISTINCT FROM expected OR expected IS NOT NULL AND actor IS DISTINCT FROM expected
   AND coalesce(auth.jwt()->>'role','')<>'service_role' AND auth.uid() IS NOT NULL THEN
  RAISE EXCEPTION 'social_demo_cross_scope' USING ERRCODE='42501';
 END IF;
 IF expected IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_demo_private.cohorts WHERE id=expected AND active)
   AND TG_OP<>'DELETE' AND NOT (auth.uid() IS NULL AND coalesce(auth.jwt()->>'role','')='service_role'
    AND EXISTS(SELECT 1 FROM account_private.erasures e JOIN social_demo_private.reservations res ON res.user_id=e.user_id WHERE res.cohort_id=expected))
 THEN RAISE EXCEPTION 'social_demo_revoked';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 NEW:=jsonb_populate_record(NEW,jsonb_build_object('social_demo_cohort_id',expected));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_demo_private.scope_row() FROM PUBLIC,anon,authenticated,service_role;

DO $$DECLARE r record;BEGIN FOR r IN SELECT relation FROM social_demo_private.relations LOOP
 EXECUTE format('ALTER TABLE %s ADD COLUMN social_demo_cohort_id uuid REFERENCES social_demo_private.cohorts(id)',r.relation);
 EXECUTE format('CREATE INDEX ON %s(social_demo_cohort_id) WHERE social_demo_cohort_id IS NOT NULL',r.relation);
 EXECUTE format('CREATE TRIGGER "000_social_demo_scope" BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION social_demo_private.scope_row()',r.relation);
 EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',r.relation);
 EXECUTE format('DROP POLICY IF EXISTS workspace_demo_read_boundary ON %s',r.relation);
 EXECUTE format('CREATE POLICY social_demo_scope_boundary ON %s AS RESTRICTIVE FOR ALL TO anon,authenticated USING(social_demo_cohort_id IS NOT DISTINCT FROM social_demo_private.user_cohort(auth.uid())) WITH CHECK(social_demo_cohort_id IS NOT DISTINCT FROM social_demo_private.user_cohort(auth.uid()))',r.relation);
END LOOP;END $$;

-- RLS expression uses a public boolean helper; private registry never receives grants.
CREATE FUNCTION public.social_demo_row_visible(p_cohort uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_cohort IS NOT DISTINCT FROM social_demo_private.user_cohort(auth.uid())
 AND (public.current_demo_cohort() IS NULL OR social_demo_private.user_cohort(auth.uid()) IS NOT NULL)
 AND (p_cohort IS NULL OR EXISTS(SELECT 1 FROM social_demo_private.cohorts WHERE id=p_cohort AND active))
$$;
REVOKE ALL ON FUNCTION public.social_demo_row_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_demo_row_visible(uuid) TO anon,authenticated,service_role;
DO $$DECLARE r record;BEGIN FOR r IN SELECT relation FROM social_demo_private.relations LOOP
 EXECUTE format('DROP POLICY social_demo_scope_boundary ON %s',r.relation);
 EXECUTE format('CREATE POLICY social_demo_scope_boundary ON %s AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.social_demo_row_visible(social_demo_cohort_id)) WITH CHECK(public.social_demo_row_visible(social_demo_cohort_id))',r.relation);
END LOOP;END $$;

-- Compose, never replace, the existing denial logic. Only registered social
-- rows already validated by the BEFORE trigger may pass the workspace boundary.
DO $$DECLARE d text;anchor text:='DECLARE row_data jsonb;BEGIN';BEGIN
 SELECT pg_get_functiondef('public.guard_workspace_demo_legacy()'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'workspace_demo_guard_changed';END IF;
 EXECUTE replace(d,anchor,anchor||E'\n IF EXISTS(SELECT 1 FROM social_demo_private.relations WHERE relation=TG_RELID) AND (CASE WHEN TG_OP=\'DELETE\' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>\'social_demo_cohort_id\' IS NOT NULL THEN RETURN CASE WHEN TG_OP=\'DELETE\' THEN OLD ELSE NEW END;END IF;');
 SELECT pg_get_functiondef('public.guard_workspace_demo_legacy()'::regprocedure) INTO d;
 EXECUTE replace(d,$anchor$'notifications','device_tokens','analytics_events','email_events','push_tokens'$anchor$,$anchor$'notifications','device_tokens','analytics_events','email_events','push_tokens','staff_alert_outbox'$anchor$);
 SELECT pg_get_functiondef('public.workspace_demo_profile_guard()'::regprocedure) INTO d;
 IF strpos(d,$anchor$IF data?'ligar_opted_in' THEN$anchor$)=0 THEN RAISE EXCEPTION 'workspace_demo_profile_guard_changed';END IF;
 EXECUTE replace(d,$anchor$IF data?'ligar_opted_in' THEN$anchor$,$anchor$IF data?'ligar_opted_in' AND social_demo_private.user_cohort(NEW.id) IS NULL THEN$anchor$);
END $$;

-- Every content read and interaction observes the same cohort in addition to
-- the existing anonymous-author, consent, block, erasure and moderation checks.
DO $$DECLARE d text;BEGIN
 SELECT pg_get_functiondef('social_private.content_visible(text,uuid,uuid)'::regprocedure) INTO d;
 IF strpos(d,'SELECT public.account_session_usable()')=0 THEN RAISE EXCEPTION 'content_visibility_changed';END IF;
 EXECUTE replace(d,'SELECT public.account_session_usable()','SELECT public.social_demo_same_scope(p_author) AND public.account_session_usable()');
 SELECT pg_get_functiondef('social_private.pair_blocked(uuid)'::regprocedure) INTO d;
 IF strpos(d,'SELECT auth.uid() IS NULL')=0 THEN RAISE EXCEPTION 'pair_block_changed';END IF;
 EXECUTE replace(d,'SELECT auth.uid() IS NULL','SELECT NOT public.social_demo_same_scope(p_other) OR auth.uid() IS NULL');
 SELECT pg_get_functiondef('public.can_message_user(uuid)'::regprocedure) INTO d;
 IF strpos(d,'IF v_me IS NULL THEN RETURN false; END IF;')=0 THEN RAISE EXCEPTION 'message_access_changed';END IF;
 EXECUTE replace(d,'IF v_me IS NULL THEN RETURN false; END IF;','IF v_me IS NULL OR NOT public.social_demo_same_scope(p_target) OR social_private.pair_blocked(p_target) THEN RETURN false; END IF;');
END $$;

-- Commercial/operational counters and staff report queues never include tests.
CREATE VIEW social_demo_private.real_messages AS SELECT * FROM public.messages WHERE social_demo_cohort_id IS NULL;
REVOKE ALL ON social_demo_private.real_messages FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE d text;BEGIN
 SELECT pg_get_functiondef('public.admin_engagement_metrics(integer)'::regprocedure) INTO d;
 IF strpos(d,'public.messages')=0 THEN RAISE EXCEPTION 'admin_engagement_changed';END IF;
 EXECUTE replace(d,'public.messages','social_demo_private.real_messages');
 SELECT pg_get_functiondef('public.get_public_community_stats()'::regprocedure) INTO d;
 IF strpos(d,'WHERE t.is_deleted = false')=0 THEN RAISE EXCEPTION 'public_community_stats_changed';END IF;
 EXECUTE replace(d,'WHERE t.is_deleted = false','WHERE t.social_demo_cohort_id IS NULL AND t.is_deleted = false');
 SELECT pg_get_functiondef('public.admin_list_social_reports()'::regprocedure) INTO d;
 IF strpos(d,'WHERE r.status IN')=0 THEN RAISE EXCEPTION 'social_report_queue_changed';END IF;
 EXECUTE replace(d,'WHERE r.status IN','WHERE r.social_demo_cohort_id IS NULL AND r.status IN');
 SELECT pg_get_functiondef('public.admin_list_fomo_reports()'::regprocedure) INTO d;
 IF strpos(d,'WHERE t.is_deleted = false')=0 OR strpos(d,'WHERE rp.is_deleted = false')=0 THEN RAISE EXCEPTION 'fomo_report_queue_changed';END IF;
 EXECUTE replace(replace(d,'WHERE t.is_deleted = false','WHERE t.social_demo_cohort_id IS NULL AND t.is_deleted = false'),'WHERE rp.is_deleted = false','WHERE rp.social_demo_cohort_id IS NULL AND rp.is_deleted = false');
 SELECT pg_get_functiondef('public.admin_list_ig_reports()'::regprocedure) INTO d;
 IF strpos(d,'WHERE r.reported_id = p.id')=0 THEN RAISE EXCEPTION 'ig_report_queue_changed';END IF;
 EXECUTE replace(d,'WHERE r.reported_id = p.id','WHERE r.social_demo_cohort_id IS NULL AND r.reported_id = p.id');
END $$;

-- Closed RPC allowlist for social demos. Unknown APIs remain inaccessible.
DO $$DECLARE d text;anchor text:='PERFORM public.require_account_session();';BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'request_boundary_changed';END IF;
 EXECUTE replace(d,anchor,anchor||$injection$
 IF social_demo_private.user_cohort(auth.uid()) IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM social_demo_private.cohorts WHERE id=social_demo_private.user_cohort(auth.uid()) AND active) THEN RAISE EXCEPTION 'social_demo_revoked';END IF;
  IF route=ANY(ARRAY[
   '/rpc/get_social_demo_access','/rpc/account_session_usable','/rpc/ensure_my_profile','/rpc/get_workspace_access','/rpc/list_my_workspaces',
   '/rpc/community_terms_accepted','/rpc/accept_community_terms','/rpc/get_ligar_profile','/rpc/set_ligar_profile',
   '/rpc/get_ig_candidates','/rpc/get_ig_matches','/rpc/get_ig_incoming_requests','/rpc/get_ig_pending_count',
   '/rpc/get_ligar_nominatable','/rpc/get_ligar_nomination_count','/rpc/nominate_friend','/rpc/request_ig','/rpc/request_ig_for_post','/rpc/report_ig',
   '/rpc/get_ligar_feed','/rpc/create_ligar_post','/rpc/delete_ligar_post','/rpc/react_ligar_post','/rpc/report_ligar_post',
   '/rpc/get_fomo_feed','/rpc/get_fomo_thread','/rpc/get_fomo_university','/rpc/create_fomo_thread','/rpc/delete_fomo_thread','/rpc/create_fomo_reply','/rpc/delete_fomo_reply',
   '/rpc/toggle_fomo_reaction','/rpc/set_fomo_reaction','/rpc/fomo_reaction_summary','/rpc/react_fomo_reply','/rpc/vote_fomo_poll',
   '/rpc/hide_social_content','/rpc/report_social_content','/rpc/block_social_content_author','/rpc/report_profile_photo',
   '/rpc/get_or_create_direct_chat','/rpc/get_my_chats','/rpc/get_unread_chat_count','/rpc/mark_chat_read','/rpc/archive_conversation','/rpc/set_conversation_muted',
   '/rpc/can_message_user','/rpc/list_my_blocked','/rpc/request_account_erasure'
  ]) THEN RETURN;END IF;
  IF route=ANY(ARRAY['/profiles','/public_profiles','/messages','/conversation_participants','/message_reactions','/fomo_threads','/fomo_replies','/fomo_reactions','/favorites','/blocked_users','/user_blocks']) THEN RETURN;END IF;
  IF method IN('GET','HEAD') AND route=ANY(ARRAY['/universities','/careers','/scholarships']) THEN RETURN;END IF;
  RAISE EXCEPTION 'social_demo_operation_disabled' USING ERRCODE='42501';
 END IF;
$injection$);
END $$;
NOTIFY pgrst,'reload schema';

-- Readers that predate the shared social visibility helpers need explicit
-- predicates. Exact anchors abort migration if their production body changes.
DO $$DECLARE d text; spec record;BEGIN
 FOR spec IN SELECT * FROM (VALUES
 ('public.get_ig_candidates(integer)','WHERE p.id <> v_user','WHERE public.social_demo_same_scope(p.id) AND p.id <> v_user'),
 ('public.get_ig_incoming_requests(integer)','WHERE r.target_id = v_user','WHERE public.social_demo_same_scope(p.id) AND r.target_id = v_user'),
 ('public.get_ligar_nominatable()','WHERE public.is_adult(p.id)','WHERE public.social_demo_same_scope(p.id) AND public.is_adult(p.id)'),
 ('public.fomo_author_json(uuid,boolean)','WHERE pr.id = p_author','WHERE pr.id = p_author AND public.social_demo_same_scope(pr.id)'),
 ('public.get_fomo_public_stats(text)','WHERE t.university_id = v_uni','WHERE t.social_demo_cohort_id IS NULL AND t.university_id = v_uni'),
 ('public.search_students(text,uuid,text,integer,integer)','WHERE p.id <> v_me','WHERE public.social_demo_same_scope(p.id) AND p.id <> v_me'),
 ('public.get_roomies_filtered(uuid,integer,boolean,boolean)','WHERE p.id <> p_user_id','WHERE public.social_demo_same_scope(p.id) AND p.id <> p_user_id')
 ) x(signature,anchor,replacement) LOOP
  SELECT pg_get_functiondef(spec.signature::regprocedure) INTO d;
  IF strpos(d,spec.anchor)=0 THEN RAISE EXCEPTION 'social_demo_reader_changed: %',spec.signature;END IF;
  EXECUTE replace(d,spec.anchor,spec.replacement);
 END LOOP;
END $$;
DO $$DECLARE d text;anchor text:='NOT workspace_is_demo_user(id) AND current_demo_cohort() IS NULL';BEGIN
 SELECT pg_get_viewdef('public.public_profiles'::regclass,true) INTO d;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'public_profile_view_changed';END IF;
 d:=replace(d,anchor,'((NOT workspace_is_demo_user(id) AND current_demo_cohort() IS NULL) OR (workspace_is_demo_user(id) AND social_demo_same_scope(id) AND public.get_social_demo_access()->>''demo''=''true''))');
 -- Avoid a callable authenticated-only accessor in an anonymous view predicate.
 d:=replace(d,'public.get_social_demo_access()->>''demo''=''true''','auth.uid() IS NOT NULL AND public.social_demo_row_visible((SELECT cohort_id FROM public.workspace_demo_accounts WHERE user_id=id))');
 EXECUTE 'CREATE OR REPLACE VIEW public.public_profiles AS '||d;
 -- Career comments are not allowed for these demos. Preserve all columns,
 -- explicitly excluding any legacy synthetic author, including anonymous rows.
 SELECT pg_get_viewdef('public.career_comments_public'::regclass,true) INTO d;
 IF strpos(d,'FROM career_comments cc')=0 THEN RAISE EXCEPTION 'career_comments_view_changed';END IF;
 EXECUTE 'CREATE OR REPLACE VIEW public.career_comments_public AS '||regexp_replace(d,';\s*$','')||' WHERE NOT public.workspace_is_demo_user(cc.user_id) AND public.current_demo_cohort() IS NULL';
END $$;
