-- Extend the existing store moderation pipeline to community headers/walls.
-- Existing RPC return shapes remain unchanged. No existing content is removed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.communities ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.social_content_reports DROP CONSTRAINT social_content_reports_target_kind_check;
ALTER TABLE public.social_content_reports ADD CONSTRAINT social_content_reports_target_kind_check
 CHECK(target_kind IN ('fomo_thread','fomo_reply','crush_post','story','story_highlight','community','community_post'));
ALTER TABLE social_private.hidden_content DROP CONSTRAINT hidden_content_target_kind_check;
ALTER TABLE social_private.hidden_content ADD CONSTRAINT hidden_content_target_kind_check
 CHECK(target_kind IN ('fomo_thread','fomo_reply','crush_post','story','story_highlight','community','community_post'));
ALTER TABLE social_private.publication_reviews DROP CONSTRAINT publication_reviews_target_kind_check;
ALTER TABLE social_private.publication_reviews ADD CONSTRAINT publication_reviews_target_kind_check
 CHECK(target_kind IN ('fomo_thread','fomo_reply','crush_post','story','community','community_post'));

-- Private helper shared by RLS, list/detail and target validation. The
-- caller's own pending header is visible only when explicitly requested.
CREATE FUNCTION social_private.community_access(p_id uuid,p_pending_own boolean DEFAULT false) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_session_usable() AND EXISTS(
 SELECT 1 FROM public.communities c WHERE c.id=p_id AND NOT c.is_deleted
 AND (NOT c.is_hidden OR (p_pending_own AND c.created_by=auth.uid()))
 AND (c.created_by=auth.uid() OR public.is_community_member(c.id)
  OR (NOT c.is_private AND (c.university_id IS NULL OR c.university_id=(SELECT university_id FROM public.profiles WHERE id=auth.uid()))))
 AND social_private.content_visible('community',c.id,c.created_by));
$$;
REVOKE ALL ON FUNCTION social_private.community_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION social_private.community_access(uuid,boolean) TO authenticated,service_role;
CREATE POLICY community_review_visibility ON public.communities AS RESTRICTIVE FOR SELECT TO authenticated
 USING(social_private.community_access(id,true));
CREATE POLICY community_post_review_visibility ON public.community_posts AS RESTRICTIVE FOR SELECT TO authenticated
 USING(NOT is_deleted AND NOT is_hidden AND social_private.community_access(community_id,false)
  AND social_private.content_visible('community_post',id,author_id));

-- Own direct membership INSERT would let a caller join a private community
-- and forge the admin role. Existing join/leave RPCs remain the write path.
REVOKE INSERT,UPDATE ON public.community_members FROM anon,authenticated;
REVOKE INSERT,UPDATE ON public.community_posts FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_communities(p_kind text DEFAULT NULL,p_limit integer DEFAULT 40,p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid,name text,description text,kind text,image_url text,is_private boolean,created_at timestamptz,member_count bigint,is_member boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 PERFORM public.require_account_session();
 RETURN QUERY SELECT c.id,c.name,c.description,c.kind,c.image_url,c.is_private,c.created_at,
 (SELECT count(*) FROM public.community_members m WHERE m.community_id=c.id),public.is_community_member(c.id)
 FROM public.communities c WHERE (p_kind IS NULL OR c.kind=p_kind) AND social_private.community_access(c.id,true)
 ORDER BY c.created_at DESC,c.id LIMIT greatest(least(p_limit,50),1) OFFSET greatest(p_offset,0);
END $$;
CREATE OR REPLACE FUNCTION public.get_community_posts(p_community uuid,p_limit integer DEFAULT 30,p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid,body text,image_url text,created_at timestamptz,author_id uuid,author_name text,author_avatar text,is_mine boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 PERFORM public.require_account_session();
 IF NOT social_private.community_access(p_community,false) THEN RETURN; END IF;
 RETURN QUERY SELECT p.id,p.body,p.image_url,p.created_at,p.author_id,pr.full_name,pr.avatar_url,p.author_id=auth.uid()
 FROM public.community_posts p JOIN public.profiles pr ON pr.id=p.author_id
 WHERE p.community_id=p_community AND NOT p.is_deleted AND NOT p.is_hidden
 AND social_private.content_visible('community_post',p.id,p.author_id)
 ORDER BY p.created_at DESC,p.id LIMIT greatest(least(p_limit,50),1) OFFSET greatest(p_offset,0);
END $$;
CREATE OR REPLACE FUNCTION public.create_community_post(p_community uuid,p_body text DEFAULT NULL,p_image_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session();
 IF NOT public.is_community_member(p_community) OR NOT social_private.community_access(p_community,true)
 THEN RAISE EXCEPTION 'not_a_member' USING ERRCODE='42501'; END IF;
 IF coalesce(btrim(p_body),'')='' AND p_image_url IS NULL THEN RAISE EXCEPTION 'empty_post'; END IF;
 INSERT INTO public.community_posts(community_id,author_id,body,image_url)
 VALUES(p_community,auth.uid(),nullif(btrim(p_body),''),p_image_url) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.join_community(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.communities;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session();
 SELECT * INTO c FROM public.communities WHERE id=p_id AND NOT is_deleted AND NOT is_hidden;
 IF c.id IS NULL OR NOT social_private.community_access(c.id,false) THEN RAISE EXCEPTION 'community_not_found'; END IF;
 IF c.is_private THEN RAISE EXCEPTION 'community_is_private'; END IF;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(p_id,auth.uid(),'miembro') ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.get_communities(text,integer,integer),public.get_community_posts(uuid,integer,integer),
 public.create_community_post(uuid,text,text),public.join_community(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_communities(text,integer,integer),public.get_community_posts(uuid,integer,integer),
 public.create_community_post(uuid,text,text),public.join_community(uuid) TO authenticated;

CREATE FUNCTION social_private.review_community_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb; author uuid; kind text; changed boolean; rule account_private.rules;
BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'communities' THEN 'community' ELSE 'community_post' END;
 author:=(n->>CASE TG_TABLE_NAME WHEN 'communities' THEN 'created_by' ELSE 'author_id' END)::uuid;
 IF TG_OP='UPDATE' THEN
  o:=to_jsonb(OLD);
  IF ROW(n->'created_by',n->'author_id',n->'community_id',n->'university_id',n->'id')
   IS DISTINCT FROM ROW(o->'created_by',o->'author_id',o->'community_id',o->'university_id',o->'id') THEN RAISE EXCEPTION 'author_scope_immutable'; END IF;
  -- Exact erasure tombstones bypass consent but can never publish again.
  SELECT * INTO rule FROM account_private.rules WHERE relation=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME;
  IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=author)
   AND rule.tombstone IS NOT NULL AND n @> rule.tombstone THEN RETURN NEW; END IF;
  changed:=ROW(n->'name',n->'description',n->'kind',n->'body',n->'image_url',n->'is_private',n->'is_deleted')
   IS DISTINCT FROM ROW(o->'name',o->'description',o->'kind',o->'body',o->'image_url',o->'is_private',o->'is_deleted');
  IF NOT changed THEN
   IF OLD.is_hidden AND NOT NEW.is_hidden THEN
    IF auth.uid() IS NOT NULL AND NOT (public.is_staff() AND auth.jwt()->>'aal'='aal2') THEN RAISE EXCEPTION 'staff_mfa_required' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_kind=kind AND target_id=NEW.id AND status<>'approved')
     THEN RAISE EXCEPTION 'publication_review_required' USING ERRCODE='42501'; END IF;
   END IF;
   RETURN NEW;
  END IF;
  IF NEW.is_deleted THEN RETURN NEW; END IF;
 END IF;
 PERFORM social_private.require_community_terms(author);
 IF auth.uid() IS NOT NULL AND auth.uid()<>author THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='communities' AND TG_OP='INSERT' THEN
  NEW:=jsonb_populate_record(NEW,jsonb_build_object('university_id',(SELECT university_id FROM public.profiles WHERE id=author)));
 END IF;
 IF NEW.image_url IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_private.staged_social_media
  WHERE author_id=author AND public_url=NEW.image_url AND media_kind='image') THEN RAISE EXCEPTION 'private_upload_required' USING ERRCODE='42501'; END IF;
 NEW.is_hidden:=true;
 RETURN NEW;
END $$;
CREATE FUNCTION social_private.queue_community_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'communities' THEN 'community' ELSE 'community_post' END;
 doc jsonb; author uuid;
BEGIN
 author:=(to_jsonb(NEW)->>CASE TG_TABLE_NAME WHEN 'communities' THEN 'created_by' ELSE 'author_id' END)::uuid;
 IF TG_OP='UPDATE' AND ROW(to_jsonb(NEW)->'name',to_jsonb(NEW)->'description',to_jsonb(NEW)->'kind',to_jsonb(NEW)->'body',to_jsonb(NEW)->'image_url',to_jsonb(NEW)->'is_private',to_jsonb(NEW)->'is_deleted')
  IS NOT DISTINCT FROM ROW(to_jsonb(OLD)->'name',to_jsonb(OLD)->'description',to_jsonb(OLD)->'kind',to_jsonb(OLD)->'body',to_jsonb(OLD)->'image_url',to_jsonb(OLD)->'is_private',to_jsonb(OLD)->'is_deleted') THEN RETURN NEW; END IF;
 IF NEW.is_deleted THEN
  UPDATE social_private.publication_reviews SET status='deleted',lease_id=NULL,lease_until=NULL WHERE target_kind=kind AND target_id=NEW.id;
  RETURN NEW;
 END IF;
 doc:=social_private.publication_document(kind,NEW.id);
 IF doc IS NULL THEN RETURN NEW; END IF;
 INSERT INTO social_private.publication_reviews(target_kind,target_id,author_id,document) VALUES(kind,NEW.id,author,doc)
 ON CONFLICT(target_kind,target_id) DO UPDATE SET document=excluded.document,revision=gen_random_uuid(),status='pending',
 lease_id=NULL,lease_until=NULL,attempts=0,reviewed_at=NULL,reviewed_by=NULL,reason_code=NULL,review_note=NULL,updated_at=now()
 WHERE publication_reviews.document IS DISTINCT FROM excluded.document OR publication_reviews.status='deleted';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_private.review_community_write(),social_private.queue_community_review() FROM PUBLIC,anon,authenticated;
DO $$DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['communities','community_posts'] LOOP
 EXECUTE format('CREATE TRIGGER publication_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION social_private.lock_publication_write()',t);
 EXECUTE format('CREATE TRIGGER publication_review_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION social_private.review_community_write()',t);
 EXECUTE format('CREATE TRIGGER publication_review_queue AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION social_private.queue_community_review()',t);
END LOOP; END $$;

INSERT INTO account_private.rules(relation,owner_columns,tombstone) VALUES
 ('public.communities',ARRAY['created_by'],'{"name":"Comunidad eliminada","description":null,"image_url":null,"is_hidden":true,"is_deleted":true}'::jsonb)
 ON CONFLICT(relation) DO UPDATE SET owner_columns=excluded.owner_columns,tombstone=excluded.tombstone;
CREATE TRIGGER aab_account_erasure_subject BEFORE INSERT OR UPDATE ON public.communities
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_subject();

-- No unreviewed text/media goes into notifications. Existing receipts prevent
-- repeat alerts after another review; personal blocks/reports stay effective.
DROP TRIGGER IF EXISTS trg_community_post_notify ON public.community_posts;
CREATE OR REPLACE FUNCTION public.on_community_post_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT OLD.is_hidden OR NEW.is_hidden OR NEW.is_deleted THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_kind='community_post' AND target_id=NEW.id AND status='approved')
 OR NOT EXISTS(SELECT 1 FROM public.communities WHERE id=NEW.community_id AND NOT is_deleted AND NOT is_hidden) THEN RETURN NEW; END IF;
 INSERT INTO social_private.publication_notification_receipts(target_kind,target_id) VALUES('community_post',NEW.id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,type,title,body,data)
 SELECT m.user_id,'community','Nueva publicación en tu comunidad','Hay una publicación nueva.',
 jsonb_build_object('url','/comunidad/'||NEW.community_id::text,'community_id',NEW.community_id,'target_id',NEW.id)
 FROM public.community_members m JOIN public.profiles p ON p.id=m.user_id
 WHERE m.community_id=NEW.community_id AND m.user_id<>NEW.author_id AND p.is_discarded IS NOT TRUE
 AND NOT EXISTS(SELECT 1 FROM social_private.social_author_blocks b WHERE (b.viewer_id=m.user_id AND b.author_id=NEW.author_id) OR (b.author_id=m.user_id AND b.viewer_id=NEW.author_id))
 AND NOT EXISTS(SELECT 1 FROM public.blocked_users b WHERE (b.blocker_id=m.user_id AND b.blocked_id=NEW.author_id) OR (b.blocked_id=m.user_id AND b.blocker_id=NEW.author_id))
 AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=m.user_id AND b.blocked_id=NEW.author_id) OR (b.blocked_id=m.user_id AND b.blocker_id=NEW.author_id))
 AND NOT EXISTS(SELECT 1 FROM public.social_content_reports r WHERE r.reporter_id=m.user_id AND ((r.target_kind='community_post' AND r.target_id=NEW.id) OR (r.target_kind='community' AND r.target_id=NEW.community_id)))
 AND NOT EXISTS(SELECT 1 FROM social_private.hidden_content h WHERE h.viewer_id=m.user_id AND ((h.target_kind='community_post' AND h.target_id=NEW.id) OR (h.target_kind='community' AND h.target_id=NEW.community_id)))
 LIMIT 500;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.on_community_post_notify() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_community_post_notify AFTER UPDATE OF is_hidden ON public.community_posts
 FOR EACH ROW EXECUTE FUNCTION public.on_community_post_notify();

-- The existing queue/report functions below gain only the new kind branches.

CREATE OR REPLACE FUNCTION social_private.publication_document(p_kind text,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE p_kind
 WHEN 'fomo_thread' THEN (SELECT jsonb_build_object('body',t.body,'media_url',t.media_url,'media_type',t.media_type,'poll',
   (SELECT jsonb_build_object('question',p.question,'options',(SELECT jsonb_agg(o.label ORDER BY o.position) FROM public.fomo_poll_options o WHERE o.poll_id=p.id))
   FROM public.fomo_polls p WHERE p.thread_id=t.id)) FROM public.fomo_threads t WHERE t.id=p_id AND NOT t.is_deleted)
 WHEN 'fomo_reply' THEN (SELECT jsonb_build_object('body',body,'media_url',media_url,'media_type',media_type) FROM public.fomo_replies WHERE id=p_id AND NOT is_deleted)
 WHEN 'crush_post' THEN (SELECT jsonb_build_object('body',body,'offer',offer,'media_url',media_url,'media_type',media_type) FROM public.ligar_posts WHERE id=p_id AND NOT is_deleted)
 WHEN 'community' THEN (SELECT jsonb_build_object('body',concat_ws(chr(10),name,description),'media_url',image_url,'media_type',CASE WHEN image_url IS NOT NULL THEN 'image' END,'kind',kind,'is_private',is_private) FROM public.communities WHERE id=p_id AND NOT is_deleted)
 WHEN 'community_post' THEN (SELECT jsonb_build_object('body',body,'media_url',image_url,'media_type',CASE WHEN image_url IS NOT NULL THEN 'image' END) FROM public.community_posts WHERE id=p_id AND NOT is_deleted)
 WHEN 'story' THEN (SELECT jsonb_build_object('body',caption,'media_url',media_url,'media_type',media_type) FROM public.stories WHERE id=p_id)
 END;
$$;

CREATE OR REPLACE FUNCTION social_private.social_target_author(p_kind text,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_me uuid:=auth.uid(); v_author uuid; v_uni uuid; v_gender text;
BEGIN
 IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_me AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501'; END IF;
 CASE p_kind
 WHEN 'fomo_thread' THEN
  SELECT author_id INTO v_author FROM public.fomo_threads WHERE id=p_id AND NOT is_deleted AND NOT is_hidden;
 WHEN 'fomo_reply' THEN
  SELECT r.author_id INTO v_author FROM public.fomo_replies r JOIN public.fomo_threads t ON t.id=r.thread_id
   WHERE r.id=p_id AND NOT r.is_deleted AND NOT r.is_hidden AND NOT t.is_deleted AND NOT t.is_hidden
    AND social_private.content_visible('fomo_thread',t.id,t.author_id);
 WHEN 'crush_post' THEN
  IF NOT public.is_adult(v_me) THEN RAISE EXCEPTION 'adult_required' USING ERRCODE='42501'; END IF;
  SELECT university_id,gender INTO v_uni,v_gender FROM public.profiles WHERE id=v_me;
  SELECT author_id INTO v_author FROM public.ligar_posts
   WHERE id=p_id AND NOT is_deleted AND NOT is_hidden AND (v_uni IS NULL OR university_id=v_uni)
    AND (author_id=v_me OR audience='todos' OR audience=v_gender);
 WHEN 'community' THEN
  SELECT created_by INTO v_author FROM public.communities WHERE id=p_id AND NOT is_hidden AND social_private.community_access(id,false);
 WHEN 'community_post' THEN
  SELECT author_id INTO v_author FROM public.community_posts WHERE id=p_id AND NOT is_deleted AND NOT is_hidden AND social_private.community_access(community_id,false);
 WHEN 'story' THEN
  SELECT author_id INTO v_author FROM public.stories WHERE id=p_id AND expires_at>now() AND NOT is_hidden
    AND public.profile_is_visible(author_id);
 WHEN 'story_highlight' THEN
  SELECT author_id INTO v_author FROM public.story_highlights WHERE id=p_id AND NOT is_hidden
    AND public.profile_is_visible(author_id)
    AND (source_story_id IS NULL OR social_private.content_visible('story',source_story_id,author_id));
 ELSE RAISE EXCEPTION 'invalid_content_kind' USING ERRCODE='22023';
 END CASE;
 IF v_author IS NULL OR v_author=v_me OR NOT social_private.content_visible(p_kind,p_id,v_author)
 THEN RAISE EXCEPTION 'content_unavailable' USING ERRCODE='42501'; END IF;
 RETURN v_author;
END;
$$;

CREATE OR REPLACE FUNCTION social_private.capture_report_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE subject uuid;
BEGIN
 -- Trigger-only capability. The report insert remains governed by the
 -- existing validating RPC; no caller-provided author is ever accepted.
 CASE NEW.target_kind
  WHEN 'fomo_thread' THEN SELECT author_id INTO subject FROM public.fomo_threads WHERE id=NEW.target_id;
  WHEN 'fomo_reply' THEN SELECT author_id INTO subject FROM public.fomo_replies WHERE id=NEW.target_id;
  WHEN 'crush_post' THEN SELECT author_id INTO subject FROM public.ligar_posts WHERE id=NEW.target_id;
  WHEN 'community' THEN SELECT created_by INTO subject FROM public.communities WHERE id=NEW.target_id;
  WHEN 'community_post' THEN SELECT author_id INTO subject FROM public.community_posts WHERE id=NEW.target_id;
  WHEN 'story' THEN SELECT author_id INTO subject FROM public.stories WHERE id=NEW.target_id;
  WHEN 'story_highlight' THEN SELECT author_id INTO subject FROM public.story_highlights WHERE id=NEW.target_id;
 END CASE;
 IF subject IS NOT NULL THEN INSERT INTO social_private.report_authors(report_id,user_id) VALUES(NEW.id,subject) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.escalate_social_content_reports()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; n integer:=0;
BEGIN
 IF session_user<>'postgres' AND (auth.jwt()->>'role') IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'service_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 FOR r IN SELECT * FROM public.social_content_reports
  WHERE status='pending' AND due_at<=now()+interval '4 hours'
  ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  CASE r.target_kind
   WHEN 'fomo_thread' THEN UPDATE public.fomo_threads SET is_hidden=true WHERE id=r.target_id;
   WHEN 'fomo_reply' THEN UPDATE public.fomo_replies SET is_hidden=true WHERE id=r.target_id;
   WHEN 'crush_post' THEN UPDATE public.ligar_posts SET is_hidden=true WHERE id=r.target_id;
   WHEN 'community' THEN UPDATE public.communities SET is_hidden=true WHERE id=r.target_id;
   WHEN 'community_post' THEN UPDATE public.community_posts SET is_hidden=true WHERE id=r.target_id;
   WHEN 'story' THEN
    UPDATE public.stories SET is_hidden=true WHERE id=r.target_id;
    UPDATE public.story_highlights SET is_hidden=true WHERE source_story_id=r.target_id;
   WHEN 'story_highlight' THEN UPDATE public.story_highlights SET is_hidden=true WHERE id=r.target_id;
  END CASE;
  UPDATE public.social_content_reports SET status='quarantined',escalated_at=now() WHERE id=r.id;
  PERFORM public.dispatch_staff_alert('denuncia','Denuncia pendiente: contenido retirado preventivamente',
   'Revisar y resolver la denuncia antes del plazo. La retirada preventiva no sustituye su revisión.',
   jsonb_build_object('content_report_id',r.id,'target_kind',r.target_kind,'target_id',r.target_id,'url','/admin'));
  n:=n+1;
 END LOOP;
 RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_social_reports()
RETURNS SETOF jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM social_private.assert_moderator();
 RETURN QUERY SELECT to_jsonb(r)||jsonb_build_object('content',CASE r.target_kind
  WHEN 'fomo_thread' THEN (SELECT jsonb_build_object('body',body,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.fomo_threads WHERE id=r.target_id)
  WHEN 'fomo_reply' THEN (SELECT jsonb_build_object('body',body,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.fomo_replies WHERE id=r.target_id)
  WHEN 'crush_post' THEN (SELECT jsonb_build_object('body',concat_ws(E'\n',body,offer),'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.ligar_posts WHERE id=r.target_id)
  WHEN 'community' THEN (SELECT jsonb_build_object('body',concat_ws(chr(10),name,description),'media_url',image_url,'media_type','image','is_hidden',is_hidden) FROM public.communities WHERE id=r.target_id)
  WHEN 'community_post' THEN (SELECT jsonb_build_object('body',body,'media_url',image_url,'media_type','image','is_hidden',is_hidden) FROM public.community_posts WHERE id=r.target_id)
  WHEN 'story' THEN (SELECT jsonb_build_object('body',caption,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.stories WHERE id=r.target_id)
  WHEN 'story_highlight' THEN (SELECT jsonb_build_object('body',caption,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.story_highlights WHERE id=r.target_id)
 END) FROM public.social_content_reports r WHERE r.status IN ('pending','quarantined') ORDER BY r.due_at LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_social_report(p_report_id uuid,p_action text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.social_content_reports; hide_content boolean; subject uuid; lock_user uuid; subject_role text;
BEGIN
 PERFORM social_private.assert_moderator();
 PERFORM public.require_account_session();
 IF p_action NOT IN ('remove','restore','dismiss') OR p_action IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000
 THEN RAISE EXCEPTION 'invalid_resolution' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 SELECT * INTO r FROM public.social_content_reports WHERE id=p_report_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'report_unavailable'; END IF;
 IF r.status IN ('resolved','dismissed') THEN RETURN; END IF;
 SELECT user_id INTO subject FROM social_private.report_authors WHERE report_id=r.id;
 IF subject IS NULL THEN CASE r.target_kind
  WHEN 'fomo_thread' THEN SELECT author_id INTO subject FROM public.fomo_threads WHERE id=r.target_id;
  WHEN 'fomo_reply' THEN SELECT author_id INTO subject FROM public.fomo_replies WHERE id=r.target_id;
  WHEN 'crush_post' THEN SELECT author_id INTO subject FROM public.ligar_posts WHERE id=r.target_id;
  WHEN 'community' THEN SELECT created_by INTO subject FROM public.communities WHERE id=r.target_id;
  WHEN 'community_post' THEN SELECT author_id INTO subject FROM public.community_posts WHERE id=r.target_id;
  WHEN 'story' THEN SELECT author_id INTO subject FROM public.stories WHERE id=r.target_id;
  WHEN 'story_highlight' THEN SELECT author_id INTO subject FROM public.story_highlights WHERE id=r.target_id;
 END CASE; END IF;
 FOR lock_user IN SELECT DISTINCT x FROM unnest(ARRAY[auth.uid(),subject]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(lock_user::text,912003));
 END LOOP;
 PERFORM social_private.assert_moderator();
 PERFORM public.require_account_session();
 IF p_action='remove' THEN
  IF subject IS NULL THEN RAISE EXCEPTION 'content_author_unavailable'; END IF;
  SELECT role INTO subject_role FROM public.profiles WHERE id=subject FOR UPDATE;
  IF subject=auth.uid() OR subject_role='admin' OR (subject_role='analyst' AND NOT public.is_admin())
  THEN RAISE EXCEPTION 'protected_account' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action<>'dismiss' THEN
  hide_content:=p_action='remove';
  CASE r.target_kind
   WHEN 'fomo_thread' THEN UPDATE public.fomo_threads SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'fomo_reply' THEN UPDATE public.fomo_replies SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'crush_post' THEN UPDATE public.ligar_posts SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'community' THEN UPDATE public.communities SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'community_post' THEN UPDATE public.community_posts SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'story' THEN
    UPDATE public.stories SET is_hidden=hide_content WHERE id=r.target_id;
    UPDATE public.story_highlights h SET is_hidden=hide_content WHERE h.source_story_id=r.target_id
     AND (hide_content OR NOT EXISTS(SELECT 1 FROM public.social_content_reports own_report
      WHERE own_report.target_kind='story_highlight' AND own_report.target_id=h.id AND own_report.status IN ('quarantined','resolved')));
   WHEN 'story_highlight' THEN UPDATE public.story_highlights SET is_hidden=hide_content WHERE id=r.target_id;
  END CASE;
 END IF;
 INSERT INTO social_private.moderation_decisions(report_id,actor_id,action,reason)
 SELECT id,auth.uid(),p_action,btrim(p_reason) FROM public.social_content_reports
 WHERE target_kind=r.target_kind AND target_id=r.target_id AND status IN ('pending','quarantined');
 UPDATE public.social_content_reports SET status=CASE WHEN p_action='remove' THEN 'resolved' ELSE 'dismissed' END,
  assigned_to=auth.uid(),resolved_at=now(),resolution=btrim(p_reason)
 WHERE target_kind=r.target_kind AND target_id=r.target_id AND status IN ('pending','quarantined');
 IF p_action='remove' THEN
  INSERT INTO social_private.account_suspensions(user_id,report_id,issued_by) VALUES(subject,r.id,auth.uid())
  ON CONFLICT(user_id) DO UPDATE SET report_id=EXCLUDED.report_id,issued_by=EXCLUDED.issued_by,
   issued_at=now(),restored_by=NULL,restored_at=NULL;
  INSERT INTO social_private.account_suspension_actions(user_id,report_id,actor_id,action,reason)
   VALUES(subject,r.id,auth.uid(),'suspend',btrim(p_reason));
  UPDATE public.profiles SET is_discarded=true,self_deleted=false WHERE id=subject;
  DELETE FROM auth.sessions WHERE user_id=subject;
  -- Preserve an in-flight lease so opposite Auth calls cannot overlap. Its
  -- stale completion releases the lease and the latest revision retries.
  INSERT INTO social_private.moderation_auth_jobs(user_id,desired_ban) VALUES(subject,true)
  ON CONFLICT(user_id) DO UPDATE SET desired_ban=true,revision=gen_random_uuid(),
   completed_at=NULL,retry_at=now(),updated_at=now();
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finish_publication_review(p_id uuid,p_revision uuid,p_lease uuid,p_decision text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r social_private.publication_reviews; content_hidden boolean; doc jsonb;
BEGIN
 IF p_decision NOT IN ('approved','rejected','needs_review','pending') OR p_decision IS NULL THEN RAISE EXCEPTION 'invalid_decision'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 SELECT * INTO r FROM social_private.publication_reviews WHERE id=p_id AND revision=p_revision AND lease_id=p_lease AND status='processing' AND lease_until>now() FOR UPDATE;
 IF r.id IS NULL THEN RETURN false; END IF;
 doc:=social_private.publication_document(r.target_kind,r.target_id);
 IF doc IS NULL THEN UPDATE social_private.publication_reviews SET status='deleted',lease_id=NULL,lease_until=NULL WHERE id=r.id; RETURN false; END IF;
 IF doc IS DISTINCT FROM r.document THEN RETURN false; END IF;
 IF p_decision='approved' AND r.document->>'media_url' IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM social_private.staged_social_media WHERE public_url=r.document->>'media_url' AND author_id=r.author_id AND copied_at IS NOT NULL)
 THEN RAISE EXCEPTION 'approved_media_missing'; END IF;
 IF p_decision='pending' AND r.attempts>=3 THEN p_decision:='needs_review'; END IF;
 UPDATE social_private.publication_reviews SET status=p_decision,reason_code=left(p_reason,100),reviewed_at=CASE WHEN p_decision IN ('approved','rejected') THEN now() END,
  lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=r.id;
 content_hidden:=p_decision<>'approved' OR EXISTS(SELECT 1 FROM public.social_content_reports WHERE target_kind=r.target_kind AND target_id=r.target_id AND status IN ('pending','quarantined','resolved'));
 CASE r.target_kind
  WHEN 'fomo_thread' THEN UPDATE public.fomo_threads SET is_hidden=content_hidden WHERE id=r.target_id;
  WHEN 'fomo_reply' THEN UPDATE public.fomo_replies SET is_hidden=content_hidden WHERE id=r.target_id;
  WHEN 'crush_post' THEN UPDATE public.ligar_posts SET is_hidden=content_hidden WHERE id=r.target_id;
  WHEN 'community' THEN UPDATE public.communities SET is_hidden=content_hidden WHERE id=r.target_id;
  WHEN 'community_post' THEN UPDATE public.community_posts SET is_hidden=content_hidden WHERE id=r.target_id;
  WHEN 'story' THEN UPDATE public.stories SET is_hidden=content_hidden,expires_at=CASE WHEN NOT content_hidden THEN now()+interval '24 hours' ELSE expires_at END WHERE id=r.target_id;
 END CASE;
 IF p_decision='needs_review' THEN PERFORM public.dispatch_staff_alert('denuncia','Publicación pendiente de revisión',
  'Revisa el contenido retenido antes de publicarlo.',jsonb_build_object('publication_review_id',r.id,'url','/admin/fomo')); END IF;
 RETURN true;
END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
