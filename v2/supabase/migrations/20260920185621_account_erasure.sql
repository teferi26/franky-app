-- A deletion request is explicit, durable and irreversible. No existing account
-- is selected by this migration. Financial parents and shared content IDs survive.
CREATE SCHEMA IF NOT EXISTS account_private;
REVOKE ALL ON SCHEMA account_private FROM PUBLIC,anon,authenticated;
CREATE TABLE account_private.erasures (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 due_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','purged','complete')),
 completion_email text, billing jsonb NOT NULL DEFAULT '{}', apple_subject text,
 lease_id uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 retry_at timestamptz NOT NULL DEFAULT now(), last_error text,
 auth_erased_at timestamptz, billing_stopped_at timestamptz, apple_revoked_at timestamptz,
 notification_sent_at timestamptz, notification_attempts integer NOT NULL DEFAULT 0 CHECK(notification_attempts BETWEEN 0 AND 5),
 alerted_at timestamptz, purged_at timestamptz, completed_at timestamptz
);
CREATE TABLE account_private.files (
 user_id uuid NOT NULL REFERENCES account_private.erasures(user_id),
 bucket_id text NOT NULL, name text NOT NULL, removed_at timestamptz,
 PRIMARY KEY(user_id,bucket_id,name)
);
CREATE TABLE account_private.rules (
 relation text PRIMARY KEY, owner_columns text[] NOT NULL, tombstone jsonb
);
CREATE TABLE account_private.erased_object_keys (key_hash text PRIMARY KEY);
CREATE TABLE account_private.targets (
 user_id uuid NOT NULL REFERENCES account_private.erasures(user_id), relation text NOT NULL, record_id text NOT NULL,
 PRIMARY KEY(user_id,relation,record_id)
);
CREATE TABLE account_private.erased_row_keys (key_hash text PRIMARY KEY);
ALTER TABLE account_private.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.erased_row_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.erased_object_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.erasures ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA account_private FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO account_private.rules(relation,owner_columns,tombstone) VALUES
('public.study_data',ARRAY['user_id'],NULL),
('public.vocational_results',ARRAY['user_id'],NULL),
('public.vocational_feedback',ARRAY['user_id'],NULL),
('public.career_test_sessions',ARRAY['user_id'],NULL),
('public.favorites',ARRAY['user_id'],NULL),
('public.housing_search_intents',ARRAY['user_id'],NULL),
('public.scholarship_alerts',ARRAY['user_id'],NULL),
('public.notification_preferences',ARRAY['user_id'],NULL),
('public.device_tokens',ARRAY['user_id'],NULL),
('public.user_keys',ARRAY['user_id'],NULL),
('public.user_presence',ARRAY['user_id'],NULL),
('public.email_notification_log',ARRAY['user_id'],NULL),
('public.student_email_verifications',ARRAY['user_id'],NULL),
('public.email_verification_tokens',ARRAY['user_id'],NULL),
('public.user_boosts',ARRAY['user_id'],NULL),
('public.premium_actions',ARRAY['user_id'],NULL),
('public.event_waitlist',ARRAY['user_id'],NULL),
('public.notifications',ARRAY['user_id'],NULL),
('private.product_alert_deliveries',ARRAY['user_id'],NULL),
('public.analytics_events',ARRAY['user_id'],NULL),
('public.profile_views',ARRAY['viewer_id','profile_id'],NULL),
('public.accommodation_views',ARRAY['viewer_id'],NULL),
('public.story_views',ARRAY['viewer_id'],NULL),
('public.platform_messages',ARRAY['user_id'],NULL),
('public.leisure_spot_suggestions',ARRAY['user_id'],NULL),
('public.accommodation_requests',ARRAY['user_id'],NULL),
('public.visit_requests',ARRAY['requester_id','target_id'],NULL),
('public.visit_schedules',ARRAY['owner_id'],'{"active":false}'::jsonb),
('public.visit_slots',ARRAY['owner_id'],'{"notes":null,"status":"closed"}'::jsonb),
('public.follows',ARRAY['follower_id','followee_id'],NULL),
('public.friendships',ARRAY['user_a_id','user_b_id','requested_by'],NULL),
('public.roommate_matches',ARRAY['user_id','matched_user_id','target_id'],NULL),
('public.user_blocks',ARRAY['blocker_id','blocked_id'],NULL),
('public.blocked_users',ARRAY['blocker_id','blocked_id'],NULL),
('public.muted_users',ARRAY['muter_id','muted_id'],NULL),
('public.ig_requests',ARRAY['requester_id','target_id'],NULL),
('public.ligar_nominations',ARRAY['nominator_id','nominee_id'],NULL),
('public.crush_live_profiles',ARRAY['user_id'],NULL),
('public.crush_live_swipes',ARRAY['swiper_id','target_id'],NULL),
('public.crush_live_matches',ARRAY['user_a_id','user_b_id'],NULL),
('public.crush_live_swipe_requests',ARRAY['actor_id','target_id'],NULL),
('public.crush_taps',ARRAY['actor_id','peer_id'],NULL),
('public.crush_tap_tokens',ARRAY['user_id'],NULL),
('public.compatibility_cache',ARRAY['user_a','user_b'],NULL),
('private.live_connection_profiles',ARRAY['user_id'],NULL),
('private.live_connection_sessions',ARRAY['user_id'],NULL),
('public.fomo_reactions',ARRAY['user_id'],NULL),
('public.fomo_reply_reactions',ARRAY['user_id'],NULL),
('public.ligar_reactions',ARRAY['user_id'],NULL),
('public.message_reactions',ARRAY['user_id'],NULL),
('public.note_ratings',ARRAY['user_id'],NULL),
('public.career_ratings',ARRAY['user_id'],NULL),
('public.chat_poll_votes',ARRAY['user_id'],NULL),
('public.fomo_poll_votes',ARRAY['voter_id'],NULL),
('public.swipe_actions',ARRAY['user_id'],NULL),
('public.community_members',ARRAY['user_id'],NULL),
('public.conversation_participants',ARRAY['user_id'],NULL),
('public.crush_party_members',ARRAY['user_id'],NULL),
('public.crush_party_posts',ARRAY['author_id'],NULL),
('public.calls',ARRAY['caller_id','callee_id'],NULL),
('public.university_admins',ARRAY['profile_id'],NULL),
('social_private.community_terms_acceptances',ARRAY['user_id'],NULL),
('social_private.social_author_blocks',ARRAY['viewer_id','author_id'],NULL),
('social_private.publication_reviews',ARRAY['author_id'],NULL),
('social_private.staged_social_media',ARRAY['author_id'],NULL),
('public.fomo_threads',ARRAY['author_id'],'{"body":null,"media_url":null,"media_type":null,"is_hidden":true,"is_deleted":true,"is_anonymous":true}'::jsonb),
('public.fomo_replies',ARRAY['author_id'],'{"body":null,"media_url":null,"media_type":null,"is_hidden":true,"is_deleted":true,"is_anonymous":true}'::jsonb),
('public.ligar_posts',ARRAY['author_id'],'{"body":"Publicación eliminada","offer":null,"media_url":null,"media_type":null,"is_hidden":true,"is_deleted":true,"is_anonymous":true}'::jsonb),
('public.messages',ARRAY['sender_id'],'{"content":null,"attachment_url":null,"attachment_meta":null,"is_deleted":true,"is_encrypted":false,"encryption_version":null}'::jsonb),
('public.career_comments',ARRAY['user_id'],'{"content":"Comentario eliminado","is_anonymous":true}'::jsonb),
('public.community_posts',ARRAY['author_id'],NULL),
('public.stories',ARRAY['author_id'],NULL),
('public.story_highlights',ARRAY['author_id'],NULL),
('public.notes',ARRAY['uploader_id'],'{"title":"Contenido eliminado","subject":"Eliminado","description":null,"file_url":"","is_hidden":true}'::jsonb),
('public.student_listings',ARRAY['author_id'],'{"title":"Anuncio eliminado","body":null,"image_url":null,"city":null,"status":"cerrado","is_deleted":true}'::jsonb),
('public.reviews',ARRAY['reviewer_id'],'{"comment":null}'::jsonb),
('public.chat_polls',ARRAY['author_id'],'{"question":"Encuesta eliminada","options":["Eliminado","Eliminado"],"meetup_place":null,"meetup_at":null}'::jsonb),
('public.accommodations',ARRAY['owner_id'],'{"title":"Anuncio retirado","description":null,"address":null,"latitude":null,"longitude":null,"images":[],"residence_photos":[],"videos":[],"instagram":null,"whatsapp":null,"contact_email":null,"extra_info":null,"status":"inactive","is_promoted":false,"is_paid":false}'::jsonb);

-- Authenticated callers can only ask about their own current identity. This
-- helper is also used by restrictive SELECT policies, including Storage.
CREATE FUNCTION public.account_session_usable() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM account_private.erasures WHERE user_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.account_session_usable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_session_usable() TO anon,authenticated,service_role;

-- Covers old SECURITY DEFINER reads as well as normal Data API requests.
CREATE FUNCTION public.require_account_session() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT public.account_session_usable() THEN
  RAISE EXCEPTION 'account_deletion_requested' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_account_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_account_session() TO anon,authenticated,service_role;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
 unnest(s.setconfig)c WHERE r.rolname='authenticator' AND c LIKE 'pgrst.db_pre_request=%'
 AND c<>'pgrst.db_pre_request=public.require_account_session') THEN
  RAISE EXCEPTION 'existing_pre_request_requires_composition';
 END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.require_account_session';
NOTIFY pgrst,'reload config';

-- Serialize writers with requests, including writers running inside a
-- SECURITY DEFINER RPC. Service jobs do not inherit an end-user JWT.
CREATE FUNCTION account_private.guard_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(u::text,912003));
  IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=u) THEN
   RAISE EXCEPTION 'account_deletion_requested' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION account_private.guard_actor() FROM PUBLIC,anon,authenticated;

-- Late service callbacks and active peers cannot recreate erased personal
-- rows. Keep shared parent IDs as redacted tombstones rather than CASCADE.
CREATE FUNCTION account_private.guard_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r account_private.rules%ROWTYPE; k text; u uuid; doc jsonb:=to_jsonb(NEW);
BEGIN
 SELECT * INTO STRICT r FROM account_private.rules WHERE relation=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME;
 FOR u IN SELECT DISTINCT (doc->>x)::uuid FROM unnest(r.owner_columns) x
           WHERE doc->>x IS NOT NULL ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(u::text,912003));
  IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=u) THEN
   IF r.tombstone IS NULL OR TG_OP='INSERT' THEN RETURN NULL; END IF;
   NEW:=jsonb_populate_record(NEW,r.tombstone);
   RETURN NEW;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION account_private.guard_subject() FROM PUBLIC,anon,authenticated;

-- The content-review guard remains in force. Only an exact redacted tombstone
-- for an already persisted deletion may bypass the publication consent check.
CREATE OR REPLACE FUNCTION social_private.review_publication_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'fomo_threads' THEN 'fomo_thread' WHEN 'fomo_replies' THEN 'fomo_reply' WHEN 'ligar_posts' THEN 'crush_post' ELSE 'story' END;
 n jsonb:=to_jsonb(NEW); o jsonb; changed boolean; stage social_private.staged_social_media;
BEGIN
 IF TG_OP='UPDATE' THEN
  o:=to_jsonb(OLD);
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN RAISE EXCEPTION 'author_immutable'; END IF;
  IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=NEW.author_id)
    AND EXISTS(SELECT 1 FROM account_private.rules WHERE relation=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME
      AND tombstone IS NOT NULL AND n @> tombstone) THEN RETURN NEW; END IF;
  changed:=ROW(n->'body',n->'offer',n->'caption',n->'media_url',n->'media_type') IS DISTINCT FROM ROW(o->'body',o->'offer',o->'caption',o->'media_url',o->'media_type');
  IF NOT changed THEN
   IF OLD.is_hidden AND NOT NEW.is_hidden AND EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_kind=kind AND target_id=NEW.id AND status<>'approved')
   THEN RAISE EXCEPTION 'publication_review_required' USING ERRCODE='42501'; END IF;
   RETURN NEW;
  END IF;
 END IF;
 PERFORM social_private.require_community_terms(NEW.author_id);
 IF auth.uid() IS NOT NULL AND auth.uid()<>NEW.author_id THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;
 IF NEW.media_url IS NOT NULL THEN
  SELECT * INTO stage FROM social_private.staged_social_media WHERE public_url=NEW.media_url AND author_id=NEW.author_id AND media_kind=NEW.media_type;
  IF stage.id IS NULL THEN RAISE EXCEPTION 'private_upload_required' USING ERRCODE='42501'; END IF;
 END IF;
 NEW.is_hidden:=true;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_private.review_publication_write() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION account_private.profile_tombstone(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_object_agg(column_name,'null'::jsonb) ||
 jsonb_build_object('id',p_id,'full_name','Cuenta eliminada','role','user',
  'is_discarded',true,'self_deleted',true,'is_hidden',true,
  'is_premium',false,'can_view_student_profiles',false,
  'student_email_verified',false,'photos','[]'::jsonb,'onboarding_step',0,
  'ligar_opted_in',false,'instagram_verified',false,'ig_quarantined',false,
  'push_prefs','{}'::jsonb,'dm_privacy','seguidos','photo_reports',0,
  'photo_hidden',true,'photo_cleared',false,'streak_count',0,'streak_best',0,
  'strikes_count',0,'discarded_at',(SELECT requested_at FROM account_private.erasures WHERE user_id=p_id))
 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'
$$;
REVOKE ALL ON FUNCTION account_private.profile_tombstone(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION account_private.guard_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=NEW.id) THEN
  NEW:=jsonb_populate_record(NEW,account_private.profile_tombstone(NEW.id));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION account_private.guard_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzz_account_erasure_profile BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_profile();

DO $install$
DECLARE r record;
BEGIN
 FOR r IN SELECT n.nspname,c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private','social_private','storage') AND c.relkind='r'
    AND (n.nspname<>'storage' OR c.relname='objects') LOOP
  EXECUTE format('CREATE TRIGGER aaa_account_erasure_actor BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION account_private.guard_actor()',r.nspname,r.relname);
  IF r.relrowsecurity THEN
   EXECUTE format('CREATE POLICY account_erasure_session ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.account_session_usable())) WITH CHECK ((SELECT public.account_session_usable()))',r.nspname,r.relname);
  END IF;
 END LOOP;
 FOR r IN SELECT relation FROM account_private.rules LOOP
  EXECUTE format('CREATE TRIGGER aab_account_erasure_subject BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION account_private.guard_subject()',r.relation::regclass);
 END LOOP;
END $install$;

CREATE FUNCTION account_private.capture_files(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE media record;
BEGIN
 -- Account-owned object keys are collected from Storage metadata, not assumed
 -- from folder names (chat objects live under a conversation).
 INSERT INTO account_private.files(user_id,bucket_id,name)
 SELECT p_user,bucket_id,name FROM storage.objects
 WHERE (owner=p_user OR owner_id=p_user::text)
 AND bucket_id IN ('avatars','profile-pictures','chat-media','fomo-media','ligar-media','stories-media','notes',
 'ugc-pending-image','ugc-pending-audio','ugc-pending-video','ugc-approved')
 ON CONFLICT DO NOTHING;
 -- URLs pasted in user content are not proof of object ownership. Approved
 -- objects use the server-controlled staging record instead.
 FOR media IN SELECT id,path,media_kind FROM social_private.staged_social_media WHERE author_id=p_user LOOP
  INSERT INTO account_private.files(user_id,bucket_id,name) VALUES
  (p_user,CASE media.media_kind WHEN 'image' THEN 'ugc-pending-image' WHEN 'audio' THEN 'ugc-pending-audio' ELSE 'ugc-pending-video' END,media.path)
  ON CONFLICT DO NOTHING;
  IF split_part(media.path,'/',1)=p_user::text AND split_part(media.path,'/',2) LIKE media.id::text||'.%'
   AND split_part(media.path,'/',3)='' THEN
   INSERT INTO account_private.files(user_id,bucket_id,name)
   VALUES(p_user,'ugc-approved',split_part(media.path,'/',2)) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION account_private.capture_files(uuid) FROM PUBLIC,anon,authenticated;

-- Capture row keys before ownership links disappear. Submitted URLs and JSON
-- content are never interpreted as proof of ownership. Completed requests keep
-- only hashes, to stop late audit/archive copies from resurrecting personal data.
CREATE FUNCTION account_private.capture_targets(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target_rule record; predicate text;
BEGIN
 INSERT INTO account_private.targets(user_id,relation,record_id) VALUES(p_user,'public.profiles',p_user::text) ON CONFLICT DO NOTHING;
 FOR target_rule IN SELECT rules.* FROM account_private.rules rules JOIN pg_class c ON c.oid=to_regclass(rules.relation)
  WHERE EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped) LOOP
  SELECT string_agg(format('%I=$1',x),' OR ') INTO predicate FROM unnest(target_rule.owner_columns)x;
  EXECUTE format('INSERT INTO account_private.targets(user_id,relation,record_id) SELECT $1,$2,id::text FROM %s WHERE %s ON CONFLICT DO NOTHING',target_rule.relation::regclass,predicate)
   USING p_user,target_rule.relation;
 END LOOP;
 INSERT INTO account_private.targets(user_id,relation,record_id)
 SELECT p_user,'public.fomo_polls',p.id::text FROM public.fomo_polls p JOIN public.fomo_threads t ON t.id=p.thread_id WHERE t.author_id=p_user ON CONFLICT DO NOTHING;
 INSERT INTO account_private.targets(user_id,relation,record_id)
 SELECT p_user,'public.social_content_reports',r.id::text FROM public.social_content_reports r
 WHERE r.reporter_id=p_user OR EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.record_id=r.target_id::text
  AND t.relation=CASE r.target_kind WHEN 'fomo_thread' THEN 'public.fomo_threads' WHEN 'fomo_reply' THEN 'public.fomo_replies'
   WHEN 'crush_post' THEN 'public.ligar_posts' WHEN 'story' THEN 'public.stories' WHEN 'story_highlight' THEN 'public.story_highlights'
   WHEN 'community' THEN 'public.communities' WHEN 'community_post' THEN 'public.community_posts' END) ON CONFLICT DO NOTHING;
 IF to_regclass('social_private.report_authors') IS NOT NULL THEN
  INSERT INTO account_private.targets(user_id,relation,record_id)
  SELECT p_user,'public.social_content_reports',report_id::text FROM social_private.report_authors WHERE user_id=p_user ON CONFLICT DO NOTHING;
  INSERT INTO account_private.targets(user_id,relation,record_id)
  SELECT p_user,CASE r.target_kind WHEN 'fomo_thread' THEN 'public.fomo_threads' WHEN 'fomo_reply' THEN 'public.fomo_replies'
   WHEN 'crush_post' THEN 'public.ligar_posts' WHEN 'story' THEN 'public.stories' WHEN 'story_highlight' THEN 'public.story_highlights'
   WHEN 'community' THEN 'public.communities' WHEN 'community_post' THEN 'public.community_posts' END,r.target_id::text
  FROM social_private.report_authors a JOIN public.social_content_reports r ON r.id=a.report_id WHERE a.user_id=p_user ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO account_private.targets(user_id,relation,record_id)
 SELECT p_user,'public.fomo_reports',r.id::text FROM public.fomo_reports r WHERE r.reporter_id=p_user OR EXISTS(
  SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.record_id=r.target_id::text
  AND t.relation=CASE r.target_type WHEN 'thread' THEN 'public.fomo_threads' ELSE 'public.fomo_replies' END) ON CONFLICT DO NOTHING;
 INSERT INTO account_private.targets(user_id,relation,record_id)
 SELECT p_user,'public.ligar_reports',r.id::text FROM public.ligar_reports r WHERE r.reporter_id=p_user OR EXISTS(
  SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.record_id=r.post_id::text AND t.relation='public.ligar_posts') ON CONFLICT DO NOTHING;
 INSERT INTO account_private.targets(user_id,relation,record_id)
 SELECT p_user,'public.user_reports',id::text FROM public.user_reports WHERE reporter_id=p_user OR reported_user_id=p_user ON CONFLICT DO NOTHING;
 INSERT INTO account_private.targets(user_id,relation,record_id)
 SELECT p_user,'social_private.moderation_decisions',d.id::text FROM social_private.moderation_decisions d
 WHERE EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.relation='public.social_content_reports' AND t.record_id=d.report_id::text) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION account_private.capture_targets(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION account_private.row_erased(p_relation text,p_record text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM account_private.targets WHERE relation=CASE WHEN strpos(p_relation,'.')=0 THEN 'public.'||p_relation ELSE p_relation END AND record_id=p_record)
 OR EXISTS(SELECT 1 FROM account_private.erased_row_keys WHERE key_hash=md5((CASE WHEN strpos(p_relation,'.')=0 THEN 'public.'||p_relation ELSE p_relation END)||':'||p_record))
$$;
REVOKE ALL ON FUNCTION account_private.row_erased(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION account_private.guard_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='discarded_records' THEN
  IF account_private.row_erased(NEW.original_table,NEW.original_id::text) THEN NEW.data:='{}';NEW.reason:=NULL; END IF;
 ELSE
  IF account_private.row_erased(NEW.target_table,NEW.target_id)
   OR EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=NEW.actor_id) THEN NEW.actor_email:=NULL;NEW.changes:='{}'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION account_private.guard_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aab_account_erasure_snapshot BEFORE INSERT OR UPDATE ON public.discarded_records
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_snapshot();
CREATE TRIGGER aab_account_erasure_snapshot BEFORE INSERT OR UPDATE ON public.admin_actions
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_snapshot();

CREATE FUNCTION account_private.guard_storage_object() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM account_private.files WHERE bucket_id=NEW.bucket_id AND name=NEW.name)
 OR EXISTS(SELECT 1 FROM account_private.erased_object_keys WHERE key_hash=md5(NEW.bucket_id||':'||NEW.name))
 OR EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=NEW.owner OR user_id::text=NEW.owner_id) THEN
  RAISE EXCEPTION 'account_media_erased' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION account_private.guard_storage_object() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aab_account_erasure_storage BEFORE INSERT OR UPDATE ON storage.objects
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_storage_object();

-- Service only: caller identity must be verified by /api/account/erase.
CREATE FUNCTION public.request_account_erasure(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p public.profiles%ROWTYPE; j account_private.erasures%ROWTYPE; b jsonb;
BEGIN
 IF p_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,912003));
 SELECT * INTO j FROM account_private.erasures WHERE user_id=p_user;
 IF FOUND THEN RETURN jsonb_build_object('status',j.state,'requestedAt',j.requested_at,'dueAt',j.due_at); END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 -- Do not silently destroy the sole administrative identity.
 IF p.role='admin' THEN RAISE EXCEPTION 'admin_transfer_required'; END IF;
 SELECT jsonb_build_object(
 'customers',(SELECT coalesce(jsonb_agg(DISTINCT id),'[]') FROM (
  SELECT p.stripe_customer_id id UNION SELECT stripe_customer_id FROM public.subscriptions WHERE user_id=p_user
  UNION SELECT stripe_customer_id FROM public.owner_subscriptions WHERE owner_id=p_user
  UNION SELECT stripe_customer_id FROM public.business_subscriptions WHERE owner_id=p_user)q WHERE id IS NOT NULL),
 'subscriptions',(SELECT coalesce(jsonb_agg(DISTINCT id),'[]') FROM (
  SELECT stripe_subscription_id id FROM public.subscriptions WHERE user_id=p_user
  UNION SELECT stripe_subscription_id FROM public.owner_subscriptions WHERE owner_id=p_user
  UNION SELECT stripe_subscription_id FROM public.business_subscriptions WHERE owner_id=p_user)q WHERE id IS NOT NULL),
 'checkouts',(SELECT coalesce(jsonb_agg(DISTINCT id),'[]') FROM (
  SELECT stripe_checkout_session_id id FROM public.payments WHERE buyer_id=p_user AND status='pending'
  UNION SELECT stripe_session_id FROM public.business_checkout_attempts WHERE owner_id=p_user AND state='open')q WHERE id IS NOT NULL)
 ) INTO b;
 INSERT INTO account_private.erasures(user_id,completion_email,billing,apple_subject)
 VALUES(p_user,p.email,b,(SELECT provider_id FROM auth.identities WHERE user_id=p_user AND provider='apple' LIMIT 1))
 RETURNING * INTO j;
 PERFORM account_private.capture_files(p_user);
 PERFORM account_private.capture_targets(p_user);
 UPDATE public.profiles SET is_discarded=true,self_deleted=true WHERE id=p_user;
 DELETE FROM public.device_tokens WHERE user_id=p_user;
 -- Drop refresh sessions at once; old JWTs are denied by database guards.
 DELETE FROM auth.sessions WHERE user_id=p_user;
 RETURN jsonb_build_object('status',j.state,'requestedAt',j.requested_at,'dueAt',j.due_at);
END $$;
REVOKE ALL ON FUNCTION public.request_account_erasure(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_erasure(uuid) TO service_role;

CREATE FUNCTION public.claim_account_erasure() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j account_private.erasures%ROWTYPE;
BEGIN
 SELECT * INTO j FROM account_private.erasures
 WHERE state<>'complete' AND retry_at<=now() AND (lease_until IS NULL OR lease_until<now())
 ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE account_private.erasures SET lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1
 WHERE user_id=j.user_id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.claim_account_erasure() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_erasure() TO service_role;

CREATE FUNCTION public.purge_account_erasure(p_user uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE rule_row record; predicate text; assignments text; j account_private.erasures%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,912003));
 SELECT * INTO j FROM account_private.erasures WHERE user_id=p_user AND lease_id=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
 PERFORM account_private.capture_files(p_user);
 PERFORM account_private.capture_targets(p_user);
 -- Remove poll text, snapshots and notification copies before their ownership
 -- links disappear. Keep messages/replies by other users and commercial parents.
 DELETE FROM public.fomo_polls WHERE thread_id IN(SELECT id FROM public.fomo_threads WHERE author_id=p_user);
 UPDATE public.profiles SET roommate_partner_id=NULL WHERE roommate_partner_id=p_user;
 UPDATE public.notifications SET title='Cuenta eliminada',body='',data='{}'
 WHERE user_id<>p_user AND (data::text LIKE '%'||p_user::text||'%' OR EXISTS(
  SELECT 1 FROM account_private.targets owned WHERE owned.user_id=p_user
   AND owned.relation IN ('public.fomo_threads','public.fomo_replies','public.ligar_posts','public.stories','public.story_highlights','public.community_posts','public.communities','public.messages')
   AND data::text LIKE '%'||owned.record_id||'%'));
 DELETE FROM public.swipe_actions WHERE target_type='roomie' AND target_id=p_user;
 UPDATE public.conversations c SET last_message_text=NULL WHERE EXISTS(
  SELECT 1 FROM public.messages m WHERE m.conversation_id=c.id AND m.sender_id=p_user);
 DELETE FROM public.discarded_records WHERE original_table='profiles' AND original_id=p_user;
 UPDATE public.discarded_records d SET data='{}',reason=NULL WHERE data::text LIKE '%'||p_user::text||'%'
  OR EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.record_id=d.original_id::text
   AND t.relation IN(d.original_table,'public.'||d.original_table));
 UPDATE public.admin_actions SET actor_email=NULL,changes='{}'
 WHERE actor_id=p_user OR target_id=p_user::text OR changes::text LIKE '%'||p_user::text||'%'
  OR EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.record_id=admin_actions.target_id
   AND t.relation IN(admin_actions.target_table,'public.'||admin_actions.target_table));
 UPDATE public.staff_alert_outbox a SET titulo='Cuenta eliminada',cuerpo='',data='{}',recipients='{}',last_error=NULL,
 status=CASE WHEN a.status IN('pending','sending') THEN 'failed' ELSE a.status END
 WHERE data::text LIKE '%'||p_user::text||'%' OR EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND (
  (t.relation='public.platform_messages' AND a.data->>'mensaje_id'=t.record_id)
  OR (t.relation='public.social_content_reports' AND a.data->>'content_report_id'=t.record_id)
  OR (t.relation='public.user_reports' AND a.data->>'denuncia_id'=t.record_id)
  OR (t.relation='social_private.publication_reviews' AND a.data->>'publication_review_id'=t.record_id)));
 -- References retained for anti-abuse accountability hold no submitted text.
 UPDATE public.user_reports SET description=NULL,admin_notes=NULL WHERE reporter_id=p_user OR reported_user_id=p_user;
 UPDATE public.user_strikes SET reason='Cuenta eliminada' WHERE user_id=p_user;
 UPDATE public.profile_photo_reports SET reason=NULL WHERE reporter_id=p_user OR target_id=p_user;
 UPDATE public.social_content_reports r SET reason='Cuenta eliminada',resolution=NULL
 WHERE EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.relation='public.social_content_reports' AND t.record_id=r.id::text);
 UPDATE public.fomo_reports r SET reason=NULL WHERE reporter_id=p_user OR EXISTS(SELECT 1 FROM account_private.targets t
  WHERE t.user_id=p_user AND t.record_id=r.target_id::text AND t.relation=CASE r.target_type WHEN 'thread' THEN 'public.fomo_threads' ELSE 'public.fomo_replies' END);
 UPDATE public.ligar_reports r SET reason=NULL WHERE reporter_id=p_user OR EXISTS(SELECT 1 FROM account_private.targets t
  WHERE t.user_id=p_user AND t.record_id=r.post_id::text AND t.relation='public.ligar_posts');
 UPDATE public.ig_reports SET reason=NULL WHERE reporter_id=p_user OR reported_id=p_user;
 UPDATE social_private.moderation_decisions d SET reason='Cuenta eliminada'
 WHERE EXISTS(SELECT 1 FROM account_private.targets t WHERE t.user_id=p_user AND t.relation='public.social_content_reports' AND t.record_id=d.report_id::text);
 UPDATE private.live_connection_sessions peer SET peer_token=NULL,result=NULL,confirmed=false,
  expires_at=least(peer.expires_at,now()) FROM private.live_connection_sessions own
 WHERE own.user_id=p_user AND peer.peer_token=own.token AND peer.user_id<>p_user;
 UPDATE public.staff_alert_outbox a SET titulo='Cuenta eliminada',cuerpo='',data='{}',recipients='{}',last_error=NULL,
  status=CASE WHEN a.status IN('pending','sending') THEN 'failed' ELSE a.status END
 WHERE EXISTS(SELECT 1 FROM public.platform_messages m WHERE m.user_id=p_user AND a.data->>'mensaje_id'=m.id::text);
 UPDATE public.staff_alert_outbox SET recipients=array_remove(recipients,j.completion_email)
 WHERE j.completion_email IS NOT NULL AND j.completion_email=ANY(recipients);
 UPDATE public.notifications n SET title='Contenido eliminado',body='',data='{}'
 WHERE n.type='comment' AND EXISTS(SELECT 1 FROM public.fomo_replies r
  WHERE r.author_id=p_user AND n.data->>'url' LIKE '%/'||r.thread_id::text);
 FOR rule_row IN SELECT * FROM account_private.rules ORDER BY relation LOOP
  SELECT string_agg(format('%I=$1',x),' OR ') INTO predicate FROM unnest(rule_row.owner_columns)x;
  IF rule_row.tombstone IS NULL THEN
   EXECUTE format('DELETE FROM %s WHERE %s',rule_row.relation::regclass,predicate) USING p_user;
  ELSE
   SELECT string_agg(format('%I=(jsonb_populate_record(NULL::%s,$2)).%I',key,rule_row.relation::regclass,key),',') INTO assignments FROM jsonb_object_keys(rule_row.tombstone)key;
   EXECUTE format('UPDATE %s SET %s WHERE %s',rule_row.relation::regclass,assignments,predicate) USING p_user,rule_row.tombstone;
  END IF;
 END LOOP;
 UPDATE public.profiles SET is_discarded=true WHERE id=p_user;
 UPDATE account_private.erasures SET state='purged',purged_at=coalesce(purged_at,now())
 WHERE user_id=p_user;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.purge_account_erasure(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_erasure(uuid,uuid) TO service_role;

CREATE FUNCTION public.account_erasure_files(p_user uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=p_user AND lease_id=p_lease AND lease_until>now()) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 PERFORM account_private.capture_files(p_user);
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM
  (SELECT bucket_id,name FROM account_private.files WHERE user_id=p_user AND removed_at IS NULL ORDER BY bucket_id,name LIMIT 100)q);
END $$;
CREATE FUNCTION public.finish_account_erasure_step(p_user uuid,p_lease uuid,p_step text,p_files jsonb DEFAULT '[]') RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j account_private.erasures%ROWTYPE;
BEGIN
 -- Same order as Apple credential storage: identity lock, then request row.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT * INTO j FROM account_private.erasures WHERE user_id=p_user AND lease_id=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
 IF p_step='files' THEN
  UPDATE account_private.files f SET removed_at=now() FROM jsonb_to_recordset(p_files)x(bucket_id text,name text)
  WHERE f.user_id=p_user AND f.bucket_id=x.bucket_id AND f.name=x.name;
 ELSIF p_step='auth' THEN
  UPDATE account_private.erasures SET auth_erased_at=coalesce(auth_erased_at,now()) WHERE user_id=p_user;
 ELSIF p_step='billing' THEN
  UPDATE account_private.erasures SET billing_stopped_at=coalesce(billing_stopped_at,now()) WHERE user_id=p_user;
 ELSIF p_step='apple' THEN
  UPDATE account_private.erasures SET apple_revoked_at=coalesce(apple_revoked_at,now()) WHERE user_id=p_user;
 ELSIF p_step='notice_sent' THEN
  UPDATE account_private.erasures SET notification_sent_at=coalesce(notification_sent_at,now()) WHERE user_id=p_user;
 ELSIF p_step='notice_failed' THEN
  UPDATE account_private.erasures SET notification_attempts=least(notification_attempts+1,5) WHERE user_id=p_user;
 ELSIF p_step='wait' THEN
  -- Signed uploads expire after 2h. Sweep again after the full validity window,
  -- including a clock margin, before claiming all files have gone.
  UPDATE account_private.files SET removed_at=NULL WHERE user_id=p_user;
  UPDATE account_private.erasures SET retry_at=greatest(now()+interval '1 minute',requested_at+interval '130 minutes'),lease_until=NULL,lease_id=NULL WHERE user_id=p_user;
 ELSIF p_step='complete' THEN
  IF j.state<>'purged' OR j.auth_erased_at IS NULL OR j.billing_stopped_at IS NULL OR j.apple_revoked_at IS NULL OR j.requested_at>now()-interval '130 minutes'
    OR (j.completion_email IS NOT NULL AND j.notification_sent_at IS NULL AND j.notification_attempts<5)
    OR EXISTS(SELECT 1 FROM account_private.files WHERE user_id=p_user AND removed_at IS NULL)
    OR EXISTS(SELECT 1 FROM account_private.files f JOIN storage.objects s ON s.bucket_id=f.bucket_id AND s.name=f.name WHERE f.user_id=p_user)
  THEN RAISE EXCEPTION 'erasure_incomplete'; END IF;
  UPDATE account_private.erasures SET state='complete',completed_at=now(),completion_email=NULL,
   billing='{}',apple_subject=NULL,last_error=NULL,lease_until=NULL,lease_id=NULL WHERE user_id=p_user;
  INSERT INTO account_private.erased_object_keys(key_hash)
  SELECT md5(bucket_id||':'||name) FROM account_private.files WHERE user_id=p_user ON CONFLICT DO NOTHING;
  DELETE FROM account_private.files WHERE user_id=p_user;
  INSERT INTO account_private.erased_row_keys(key_hash) SELECT md5(relation||':'||record_id) FROM account_private.targets WHERE user_id=p_user ON CONFLICT DO NOTHING;
  DELETE FROM account_private.targets WHERE user_id=p_user;
 ELSIF p_step='retry' THEN
  UPDATE account_private.erasures SET retry_at=now()+interval '5 minutes',last_error='processing_failed',lease_until=NULL,lease_id=NULL WHERE user_id=p_user;
 ELSE RAISE EXCEPTION 'invalid_step';
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.account_erasure_files(uuid,uuid),public.finish_account_erasure_step(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_erasure_files(uuid,uuid),public.finish_account_erasure_step(uuid,uuid,text,jsonb) TO service_role;

-- Durable aggregate alert before 24h, also when repeated attempts fail sooner.
-- Outbox payload contains no email, user identifier, token or submitted content.
CREATE FUNCTION public.escalate_account_erasures() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND session_user<>'postgres' THEN RAISE EXCEPTION 'service_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-erasure-alerts',0));
 WITH flagged AS (UPDATE account_private.erasures SET alerted_at=now()
  WHERE state<>'complete' AND (attempts>=3 OR requested_at<=now()-interval '20 hours')
   AND (alerted_at IS NULL OR alerted_at<now()-interval '20 hours') RETURNING user_id)
 SELECT count(*)::integer INTO n FROM flagged;
 IF n>0 THEN PERFORM public.dispatch_staff_alert('denuncia','Eliminaciones pendientes de revisión',
  'Hay solicitudes de eliminación que necesitan revisión técnica. Revisar antes de 24 horas.',
  jsonb_build_object('url','/admin','kind','account_erasure','pending_count',n)); END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.escalate_account_erasures() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_account_erasures() TO service_role;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
  PERFORM cron.schedule('account-erasure-deadlines','*/15 * * * *','SELECT public.escalate_account_erasures()');
 END IF;
END $$;

COMMENT ON TABLE account_private.erasures IS 'Irreversible self-service requests; never populated from previous recoverable deactivations. No profile/Auth CASCADE delete.';
