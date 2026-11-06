SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE social_private.community_terms_acceptances(
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 version text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,version)
);
ALTER TABLE social_private.community_terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.community_terms_acceptances FROM PUBLIC,anon,authenticated;
GRANT ALL ON social_private.community_terms_acceptances TO service_role;

CREATE OR REPLACE FUNCTION public.community_terms_accepted()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM social_private.community_terms_acceptances
 WHERE user_id=auth.uid() AND version='2026-09-10')
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE);
$$;
REVOKE ALL ON FUNCTION public.community_terms_accepted() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_terms_accepted() TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_community_terms(p_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF p_version IS DISTINCT FROM '2026-09-10' THEN RAISE EXCEPTION 'community_terms_version_changed' USING ERRCODE='22023'; END IF;
 INSERT INTO social_private.community_terms_acceptances(user_id,version) VALUES(auth.uid(),p_version)
 ON CONFLICT(user_id,version) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_community_terms(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_community_terms(text) TO authenticated;

CREATE OR REPLACE FUNCTION social_private.require_community_terms(p_author uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_author AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM social_private.community_terms_acceptances WHERE user_id=p_author AND version='2026-09-10')
 THEN RAISE EXCEPTION 'community_terms_required' USING ERRCODE='42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION social_private.require_community_terms(uuid) FROM PUBLIC,anon,authenticated;

CREATE TABLE social_private.staged_social_media(
 id uuid PRIMARY KEY, author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 path text NOT NULL UNIQUE, public_url text NOT NULL UNIQUE, mime_type text NOT NULL,
 media_kind text NOT NULL CHECK(media_kind IN ('image','audio','video')),
 declared_bytes bigint NOT NULL CHECK(declared_bytes BETWEEN 1 AND 1073741824),
 created_at timestamptz NOT NULL DEFAULT now(), copied_at timestamptz
);
ALTER TABLE social_private.staged_social_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.staged_social_media FROM PUBLIC,anon,authenticated;
GRANT ALL ON social_private.staged_social_media TO service_role;

CREATE TABLE social_private.publication_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_kind text NOT NULL CHECK(target_kind IN ('fomo_thread','fomo_reply','crush_post','story')),
 target_id uuid NOT NULL, author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 revision uuid NOT NULL DEFAULT gen_random_uuid(), document jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','approved','rejected','needs_review','deleted')),
 lease_id uuid, lease_until timestamptz, attempts int NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz, reviewed_by uuid, reason_code text, review_note text, UNIQUE(target_kind,target_id)
);
ALTER TABLE social_private.publication_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.publication_reviews FROM PUBLIC,anon,authenticated;
GRANT ALL ON social_private.publication_reviews TO service_role;
CREATE INDEX publication_reviews_pending ON social_private.publication_reviews(created_at) WHERE status IN ('pending','processing','needs_review');

CREATE OR REPLACE FUNCTION social_private.publication_document(p_kind text,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE p_kind
 WHEN 'fomo_thread' THEN (SELECT jsonb_build_object('body',t.body,'media_url',t.media_url,'media_type',t.media_type,'poll',
   (SELECT jsonb_build_object('question',p.question,'options',(SELECT jsonb_agg(o.label ORDER BY o.position) FROM public.fomo_poll_options o WHERE o.poll_id=p.id))
   FROM public.fomo_polls p WHERE p.thread_id=t.id)) FROM public.fomo_threads t WHERE t.id=p_id AND NOT t.is_deleted)
 WHEN 'fomo_reply' THEN (SELECT jsonb_build_object('body',body,'media_url',media_url,'media_type',media_type) FROM public.fomo_replies WHERE id=p_id AND NOT is_deleted)
 WHEN 'crush_post' THEN (SELECT jsonb_build_object('body',body,'offer',offer,'media_url',media_url,'media_type',media_type) FROM public.ligar_posts WHERE id=p_id AND NOT is_deleted)
 WHEN 'story' THEN (SELECT jsonb_build_object('body',caption,'media_url',media_url,'media_type',media_type) FROM public.stories WHERE id=p_id)
 END;
$$;
REVOKE ALL ON FUNCTION social_private.publication_document(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION social_private.review_publication_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'fomo_threads' THEN 'fomo_thread' WHEN 'fomo_replies' THEN 'fomo_reply' WHEN 'ligar_posts' THEN 'crush_post' ELSE 'story' END;
 n jsonb:=to_jsonb(NEW); o jsonb; changed boolean; stage social_private.staged_social_media;
BEGIN
 IF TG_OP='UPDATE' THEN
  o:=to_jsonb(OLD);
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN RAISE EXCEPTION 'author_immutable'; END IF;
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
END;
$$;
REVOKE ALL ON FUNCTION social_private.review_publication_write() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION social_private.queue_publication_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'fomo_threads' THEN 'fomo_thread' WHEN 'fomo_replies' THEN 'fomo_reply' WHEN 'ligar_posts' THEN 'crush_post' ELSE 'story' END;
 doc jsonb;
BEGIN
 IF TG_OP='UPDATE' AND ROW(to_jsonb(NEW)->'body',to_jsonb(NEW)->'offer',to_jsonb(NEW)->'caption',to_jsonb(NEW)->'media_url',to_jsonb(NEW)->'media_type')
  IS NOT DISTINCT FROM ROW(to_jsonb(OLD)->'body',to_jsonb(OLD)->'offer',to_jsonb(OLD)->'caption',to_jsonb(OLD)->'media_url',to_jsonb(OLD)->'media_type') THEN RETURN NEW; END IF;
 doc:=social_private.publication_document(kind,NEW.id);
 IF doc IS NULL THEN RETURN NEW; END IF;
 INSERT INTO social_private.publication_reviews(target_kind,target_id,author_id,document)
 VALUES(kind,NEW.id,NEW.author_id,doc)
 ON CONFLICT(target_kind,target_id) DO UPDATE SET document=excluded.document,revision=gen_random_uuid(),status='pending',
   lease_id=NULL,lease_until=NULL,attempts=0,reviewed_at=NULL,reviewed_by=NULL,reason_code=NULL,updated_at=now()
 WHERE publication_reviews.document IS DISTINCT FROM excluded.document;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION social_private.queue_publication_review() FROM PUBLIC,anon,authenticated;
DO $$DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['fomo_threads','fomo_replies','ligar_posts','stories'] LOOP
 EXECUTE format('CREATE TRIGGER publication_review_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION social_private.review_publication_write()',t);
 EXECUTE format('CREATE TRIGGER publication_review_queue AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION social_private.queue_publication_review()',t);
END LOOP; END$$;

-- Poll text is content too. Reactions/counts do not invalidate a decision.
REVOKE INSERT,UPDATE,DELETE ON public.fomo_polls,public.fomo_poll_options FROM anon,authenticated;
CREATE OR REPLACE FUNCTION social_private.queue_poll_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE thread_id uuid; doc jsonb; row_data jsonb;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' AND ((TG_TABLE_NAME='fomo_polls' AND to_jsonb(NEW)->'question'=to_jsonb(OLD)->'question')
  OR (TG_TABLE_NAME='fomo_poll_options' AND to_jsonb(NEW)->'label'=to_jsonb(OLD)->'label')) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='fomo_polls' THEN thread_id:=(row_data->>'thread_id')::uuid;
 ELSE SELECT p.thread_id INTO thread_id FROM public.fomo_polls p WHERE p.id=(row_data->>'poll_id')::uuid; END IF;
 IF thread_id IS NOT NULL THEN
  doc:=social_private.publication_document('fomo_thread',thread_id);
  UPDATE social_private.publication_reviews SET document=doc,revision=gen_random_uuid(),status='pending',lease_id=NULL,lease_until=NULL,attempts=0,reviewed_at=NULL,reviewed_by=NULL,reason_code=NULL,updated_at=now()
   WHERE target_kind='fomo_thread' AND target_id=thread_id AND doc IS NOT NULL AND document IS DISTINCT FROM doc;
  IF FOUND THEN UPDATE public.fomo_threads SET is_hidden=true WHERE id=thread_id; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION social_private.queue_poll_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER poll_review_queue AFTER INSERT OR UPDATE OR DELETE ON public.fomo_polls FOR EACH ROW EXECUTE FUNCTION social_private.queue_poll_review();
CREATE TRIGGER poll_option_review_queue AFTER INSERT OR UPDATE OR DELETE ON public.fomo_poll_options FOR EACH ROW EXECUTE FUNCTION social_private.queue_poll_review();

CREATE OR REPLACE FUNCTION public.register_staged_social_media(p_id uuid,p_author uuid,p_path text,p_public_url text,p_mime text,p_kind text,p_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM social_private.require_community_terms(p_author);
 IF p_path NOT LIKE p_author::text||'/'||p_id::text||'.%' OR p_public_url NOT LIKE 'https://%/storage/v1/object/public/ugc-approved/'||p_id::text||'.%'
 THEN RAISE EXCEPTION 'invalid_media_path'; END IF;
 INSERT INTO social_private.staged_social_media(id,author_id,path,public_url,mime_type,media_kind,declared_bytes)
 VALUES(p_id,p_author,p_path,p_public_url,p_mime,p_kind,p_bytes);
END;
$$;
REVOKE ALL ON FUNCTION public.register_staged_social_media(uuid,uuid,text,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_staged_social_media(uuid,uuid,text,text,text,text,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_publication_reviews(p_author uuid DEFAULT NULL,p_limit integer DEFAULT 3)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r social_private.publication_reviews; media jsonb;
BEGIN
 FOR r IN UPDATE social_private.publication_reviews SET status='needs_review',lease_id=NULL,lease_until=NULL,reason_code='worker_interrupted'
  WHERE status='processing' AND lease_until<now() AND attempts>=3 RETURNING * LOOP
  PERFORM public.dispatch_staff_alert('denuncia','Revisión de publicación interrumpida','Revisa manualmente el contenido retenido.',jsonb_build_object('publication_review_id',r.id,'url','/admin/fomo'));
 END LOOP;
 FOR r IN SELECT * FROM social_private.publication_reviews WHERE (p_author IS NULL OR author_id=p_author)
 AND (status='pending' OR (status='processing' AND lease_until<now())) AND attempts<3
 ORDER BY created_at LIMIT least(greatest(p_limit,1),5) FOR UPDATE SKIP LOCKED LOOP
  UPDATE social_private.publication_reviews SET status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=r.id RETURNING * INTO r;
  SELECT to_jsonb(m) INTO media FROM social_private.staged_social_media m WHERE public_url=r.document->>'media_url' AND author_id=r.author_id;
  RETURN NEXT to_jsonb(r)||jsonb_build_object('media',media);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_publication_reviews(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publication_reviews(uuid,integer) TO service_role;

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
  WHEN 'story' THEN UPDATE public.stories SET is_hidden=content_hidden,expires_at=CASE WHEN NOT content_hidden THEN now()+interval '24 hours' ELSE expires_at END WHERE id=r.target_id;
 END CASE;
 IF p_decision='needs_review' THEN PERFORM public.dispatch_staff_alert('denuncia','Publicación pendiente de revisión',
  'Revisa el contenido retenido antes de publicarlo.',jsonb_build_object('publication_review_id',r.id,'url','/admin/fomo')); END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_publication_review(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_publication_review(uuid,uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_social_media_copied(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE social_private.staged_social_media SET copied_at=now() WHERE id=p_id;
$$;
REVOKE ALL ON FUNCTION public.mark_social_media_copied(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_social_media_copied(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_publication_review(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM social_private.assert_moderator();
 SELECT to_jsonb(r)||jsonb_build_object('media',(SELECT to_jsonb(m) FROM social_private.staged_social_media m WHERE m.public_url=r.document->>'media_url' AND m.author_id=r.author_id))
 INTO result FROM social_private.publication_reviews r WHERE r.id=p_id;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_publication_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_publication_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_publication_reviews()
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM social_private.assert_moderator();
 RETURN QUERY SELECT to_jsonb(r) FROM social_private.publication_reviews r WHERE status IN ('pending','processing','needs_review') ORDER BY created_at LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_publication_reviews() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_publication_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_claim_publication_review(p_id uuid,p_revision uuid,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r social_private.publication_reviews;
BEGIN
 PERFORM social_private.assert_moderator();
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'review_note_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 UPDATE social_private.publication_reviews SET status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',reviewed_by=auth.uid(),review_note=btrim(p_note)
 WHERE id=p_id AND revision=p_revision AND (status IN ('pending','needs_review') OR (status='processing' AND lease_until<now())) RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'review_changed_or_busy'; END IF;
 RETURN public.admin_get_publication_review(r.id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_claim_publication_review(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_claim_publication_review(uuid,uuid,text) TO authenticated;

-- A raw poll read must not expose a pending question or its answer options.
CREATE OR REPLACE FUNCTION social_private.poll_visible(p_poll uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.fomo_polls p JOIN public.fomo_threads t ON t.id=p.thread_id
 WHERE p.id=p_poll AND NOT t.is_hidden AND NOT t.is_deleted AND social_private.content_visible('fomo_thread',t.id,t.author_id));
$$;
REVOKE ALL ON FUNCTION social_private.poll_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION social_private.poll_visible(uuid) TO authenticated,anon;
CREATE POLICY poll_review_visibility ON public.fomo_polls AS RESTRICTIVE FOR SELECT TO authenticated,anon USING(social_private.poll_visible(id));
CREATE POLICY poll_option_review_visibility ON public.fomo_poll_options AS RESTRICTIVE FOR SELECT TO authenticated,anon USING(social_private.poll_visible(poll_id));
CREATE OR REPLACE FUNCTION public.fomo_poll_json(p_thread uuid,p_viewer uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'question',p.question,'options',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'position',o.position,'label',o.label,'vote_count',o.vote_count) ORDER BY o.position) FROM public.fomo_poll_options o WHERE o.poll_id=p.id),'[]'::jsonb),
 'total_votes',coalesce((SELECT sum(vote_count) FROM public.fomo_poll_options WHERE poll_id=p.id),0),
 'my_option_id',(SELECT option_id FROM public.fomo_poll_votes WHERE poll_id=p.id AND voter_id=auth.uid()))
 FROM public.fomo_polls p WHERE p.thread_id=p_thread AND social_private.poll_visible(p.id);
$$;

-- Party content stays immutable. Approved publications may be released by the
-- service review worker; staff still needs MFA for later restoration.
CREATE OR REPLACE FUNCTION public.guard_crush_party_post_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.crush_party_posts WHERE post_id=OLD.id) THEN
  IF ROW(NEW.id,NEW.university_id,NEW.author_id,NEW.is_anonymous,NEW.body,NEW.offer,NEW.media_url,NEW.media_type,NEW.audience,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.university_id,OLD.author_id,OLD.is_anonymous,OLD.body,OLD.offer,OLD.media_url,OLD.media_type,OLD.audience,OLD.created_at)
  THEN RAISE EXCEPTION 'party_post_content_immutable'; END IF;
  IF (OLD.is_deleted AND NOT NEW.is_deleted) OR NEW.report_count<OLD.report_count THEN RAISE EXCEPTION 'party_post_moderation_monotonic'; END IF;
  IF OLD.is_hidden AND NOT NEW.is_hidden AND NOT (
   coalesce(auth.jwt()->>'role','')='service_role' AND EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_kind='crush_post' AND target_id=OLD.id AND status='approved'))
  THEN PERFORM social_private.assert_moderator(); END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE TABLE social_private.publication_notification_receipts(target_kind text NOT NULL,target_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(target_kind,target_id));
ALTER TABLE social_private.publication_notification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.publication_notification_receipts FROM PUBLIC,anon,authenticated;

-- Legacy INSERT notifications would otherwise disclose text before its review.
DROP TRIGGER IF EXISTS trg_fomo_reply_notify ON public.fomo_replies;
DROP TRIGGER IF EXISTS trg_fomo_thread_notify_followers ON public.fomo_threads;
CREATE OR REPLACE FUNCTION social_private.notify_reviewed_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'fomo_threads' THEN 'fomo_thread' ELSE 'fomo_reply' END;
 claimed uuid; who text; parent public.fomo_threads; slug text;
BEGIN
 IF NEW.is_hidden OR NOT OLD.is_hidden OR NEW.is_deleted THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM social_private.publication_reviews WHERE target_kind=kind AND target_id=NEW.id AND status='approved') THEN RETURN NEW; END IF;
 INSERT INTO social_private.publication_notification_receipts(target_kind,target_id) VALUES(kind,NEW.id)
 ON CONFLICT DO NOTHING RETURNING target_id INTO claimed;
 IF claimed IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce(full_name,'Alguien') INTO who FROM public.profiles WHERE id=NEW.author_id;
 IF kind='fomo_thread' THEN
  IF NEW.is_anonymous THEN RETURN NEW; END IF;
  SELECT u.slug INTO slug FROM public.universities u WHERE u.id=NEW.university_id;
  INSERT INTO public.notifications(user_id,type,title,body,data)
  SELECT f.follower_id,'post','✨ '||who||' ha publicado',left(coalesce(NEW.body,'Nueva publicación'),140),
   jsonb_build_object('url','/fomo/'||slug||'/'||NEW.id::text)
  FROM public.follows f WHERE f.followee_id=NEW.author_id AND NOT private.crush_live_is_blocked(f.follower_id,NEW.author_id)
   AND NOT EXISTS(SELECT 1 FROM public.social_content_reports WHERE reporter_id=f.follower_id AND target_kind=kind AND target_id=NEW.id)
  LIMIT 500;
 ELSE
  SELECT * INTO parent FROM public.fomo_threads WHERE id=NEW.thread_id;
  IF parent.id IS NULL OR parent.is_deleted OR parent.is_hidden OR parent.author_id=NEW.author_id OR private.crush_live_is_blocked(parent.author_id,NEW.author_id) THEN RETURN NEW; END IF;
  IF NEW.is_anonymous THEN who:='Alguien'; END IF;
  SELECT u.slug INTO slug FROM public.universities u WHERE u.id=parent.university_id;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(parent.author_id,'comment','💬 '||who||' ha comentado tu publicación',
   left(coalesce(NEW.body,'Toca para verlo'),140),jsonb_build_object('url','/fomo/'||slug||'/'||parent.id::text));
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION social_private.notify_reviewed_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reviewed_thread_notify AFTER UPDATE OF is_hidden ON public.fomo_threads FOR EACH ROW EXECUTE FUNCTION social_private.notify_reviewed_publication();
CREATE TRIGGER reviewed_reply_notify AFTER UPDATE OF is_hidden ON public.fomo_replies FOR EACH ROW EXECUTE FUNCTION social_private.notify_reviewed_publication();

-- Acquire the queue lock before content rows, including counter updates. This
-- gives writers, reports, human review and the worker one consistent lock order.
CREATE OR REPLACE FUNCTION social_private.lock_publication_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0)); RETURN NULL; END;
$$;
REVOKE ALL ON FUNCTION social_private.lock_publication_write() FROM PUBLIC,anon,authenticated;
DO $$DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['fomo_threads','fomo_replies','ligar_posts','stories','fomo_polls','fomo_poll_options'] LOOP
 EXECUTE format('CREATE TRIGGER publication_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION social_private.lock_publication_write()',t);
END LOOP; END$$;

CREATE OR REPLACE FUNCTION public.own_publication_review_status(p_target uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN social_private.publication_document(target_kind,target_id) IS NULL THEN 'unavailable'
  WHEN status IN ('pending','processing','needs_review') THEN 'pending' ELSE status END
 FROM social_private.publication_reviews WHERE target_id=p_target AND author_id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.own_publication_review_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.own_publication_review_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION social_private.guard_publication_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE doc jsonb:=to_jsonb(NEW); target uuid; author uuid; visible boolean;
BEGIN
 IF TG_TABLE_NAME='fomo_poll_votes' THEN
  visible:=social_private.poll_visible((doc->>'poll_id')::uuid)
   AND EXISTS(SELECT 1 FROM public.fomo_poll_options WHERE id=(doc->>'option_id')::uuid AND poll_id=(doc->>'poll_id')::uuid);
 ELSE
  target:=(doc->>'post_id')::uuid;
  SELECT p.author_id,NOT p.is_hidden AND NOT p.is_deleted INTO author,visible FROM public.ligar_posts p WHERE id=target;
  visible:=visible AND social_private.content_visible('crush_post',target,author);
 END IF;
 IF visible IS DISTINCT FROM true THEN RAISE EXCEPTION 'publication_unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION social_private.guard_publication_interaction() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER poll_vote_review_guard BEFORE INSERT OR UPDATE ON public.fomo_poll_votes FOR EACH ROW EXECUTE FUNCTION social_private.guard_publication_interaction();
CREATE TRIGGER crush_reaction_review_guard BEFORE INSERT OR UPDATE ON public.ligar_reactions FOR EACH ROW EXECUTE FUNCTION social_private.guard_publication_interaction();
CREATE OR REPLACE FUNCTION public.request_ig_for_post(p_post_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
 SELECT author_id INTO target FROM public.ligar_posts p WHERE id=p_post_id AND NOT is_deleted AND NOT is_hidden
 AND social_private.content_visible('crush_post',p.id,p.author_id);
 IF target IS NULL THEN RAISE EXCEPTION 'publicación no encontrada'; END IF;
 RETURN public._ig_request_apply(target);
END;
$$;

-- Existing public URLs keep working, but clients must use private staging for
-- new social uploads. Service-owned Mercado uploads have their separate flow.
CREATE POLICY social_legacy_uploads_closed ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated,anon
WITH CHECK (bucket_id NOT IN ('fomo-media','ligar-media','stories-media'));
CREATE POLICY social_legacy_overwrites_closed ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated,anon
USING (bucket_id NOT IN ('fomo-media','ligar-media','stories-media'))
WITH CHECK (bucket_id NOT IN ('fomo-media','ligar-media','stories-media'));

NOTIFY pgrst,'reload schema';
