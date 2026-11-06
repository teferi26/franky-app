SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA IF NOT EXISTS social_private;
REVOKE ALL ON SCHEMA social_private FROM PUBLIC,anon,authenticated;

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.story_highlights ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
-- Keep the origin even when an author deletes the 24h story. Clearing it would
-- allow a previously reported copy to reappear in highlights.
ALTER TABLE public.story_highlights ADD COLUMN IF NOT EXISTS source_story_id uuid;
CREATE INDEX story_highlights_source_lookup ON public.story_highlights(author_id,source_story_id) WHERE source_story_id IS NOT NULL;
UPDATE public.story_highlights h SET source_story_id=(SELECT s.id FROM public.stories s
 WHERE s.author_id=h.author_id AND s.media_url=h.media_url AND s.caption IS NOT DISTINCT FROM h.caption
 ORDER BY s.created_at DESC LIMIT 1) WHERE h.source_story_id IS NULL;

-- An anonymous author is resolved only inside the database. In particular,
-- never mirror these rows to user_blocks: that table reveals blocked_id.
CREATE TABLE social_private.social_author_blocks (
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin_kind text NOT NULL,
  origin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(viewer_id, author_id),
  CHECK(viewer_id <> author_id)
);
ALTER TABLE social_private.social_author_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.social_author_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON social_private.social_author_blocks TO service_role;
CREATE INDEX social_author_blocks_reverse ON social_private.social_author_blocks(author_id,viewer_id);
CREATE OR REPLACE FUNCTION social_private.lock_anonymous_social_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a uuid; b uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.viewer_id,NEW.author_id) IS DISTINCT FROM (OLD.viewer_id,OLD.author_id)
 THEN RAISE EXCEPTION 'block_pair_immutable'; END IF;
 IF TG_OP='DELETE' THEN a:=OLD.viewer_id; b:=OLD.author_id;
 ELSE a:=NEW.viewer_id; b:=NEW.author_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(a,b)::text||':'||greatest(a,b)::text,0));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION social_private.lock_anonymous_social_block() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER social_author_blocks_pair_lock BEFORE INSERT OR UPDATE OR DELETE
ON social_private.social_author_blocks FOR EACH ROW EXECUTE FUNCTION social_private.lock_anonymous_social_block();

-- No author identifier is returned to the reporter, including in anonymous posts.
CREATE TABLE public.social_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK(target_kind IN ('fomo_thread','fomo_reply','crush_post','story','story_highlight')),
  target_id uuid NOT NULL,
  reason text NOT NULL DEFAULT 'inapropiado' CHECK(length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','quarantined','resolved','dismissed')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolution text CHECK(length(resolution)<=1000),
  UNIQUE(reporter_id,target_kind,target_id)
);
ALTER TABLE public.social_content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.social_content_reports TO authenticated;
GRANT ALL ON public.social_content_reports TO service_role;
CREATE POLICY social_reports_read ON public.social_content_reports FOR SELECT TO authenticated
USING(reporter_id=auth.uid() OR (public.is_staff() AND auth.jwt()->>'aal'='aal2'));
CREATE INDEX social_reports_target ON public.social_content_reports(target_kind,target_id,reporter_id);
CREATE INDEX social_reports_pending ON public.social_content_reports(due_at)
WHERE status IN ('pending','quarantined');
-- Writing content uses existing authenticated DEFINER RPCs (or the stories
-- server endpoint). Owners cannot bypass age checks or undo staff quarantine.
REVOKE INSERT,UPDATE ON public.fomo_threads,public.fomo_replies,public.ligar_posts,public.stories,public.story_highlights FROM anon,authenticated;

CREATE OR REPLACE FUNCTION social_private.pair_blocked(p_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NULL OR p_other IS NULL OR EXISTS(
  SELECT 1 FROM public.blocked_users b
   WHERE (b.blocker_id=auth.uid() AND b.blocked_id=p_other)
      OR (b.blocker_id=p_other AND b.blocked_id=auth.uid())
 ) OR EXISTS(
  SELECT 1 FROM public.user_blocks b
   WHERE (b.blocker_id=auth.uid() AND b.blocked_id=p_other)
      OR (b.blocker_id=p_other AND b.blocked_id=auth.uid())
 ) OR EXISTS(
  SELECT 1 FROM social_private.social_author_blocks b
   WHERE (b.viewer_id=auth.uid() AND b.author_id=p_other)
      OR (b.viewer_id=p_other AND b.author_id=auth.uid())
 );
$$;
REVOKE ALL ON FUNCTION social_private.pair_blocked(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION social_private.pair_blocked(uuid) TO authenticated,service_role;

-- Used by existing DEFINER read RPCs and restrictive table policies. Anon is
-- intentional for the existing public preview; it has no personal suppression.
CREATE OR REPLACE FUNCTION social_private.content_visible(p_kind text,p_id uuid,p_author uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_author
   AND p.is_discarded IS NOT TRUE AND (p.is_hidden IS NOT TRUE OR p.id=auth.uid()))
 AND NOT EXISTS(SELECT 1 FROM public.social_content_reports r WHERE r.target_kind=p_kind AND r.target_id=p_id AND r.status IN ('quarantined','resolved'))
 AND (auth.uid() IS NULL OR (
   NOT social_private.pair_blocked(p_author)
   AND NOT EXISTS(SELECT 1 FROM public.social_content_reports r
     WHERE r.reporter_id=auth.uid() AND r.target_kind=p_kind AND r.target_id=p_id)
   AND NOT EXISTS(SELECT 1 FROM public.fomo_reports r
     WHERE r.reporter_id=auth.uid() AND r.target_id=p_id
       AND ((p_kind='fomo_thread' AND r.target_type='thread') OR (p_kind='fomo_reply' AND r.target_type='reply')))
   AND NOT EXISTS(SELECT 1 FROM public.ligar_reports r
     WHERE p_kind='crush_post' AND r.reporter_id=auth.uid() AND r.post_id=p_id)
 ));
$$;
REVOKE ALL ON FUNCTION social_private.content_visible(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION social_private.content_visible(text,uuid,uuid) TO authenticated,service_role;

CREATE POLICY fomo_personal_suppression ON public.fomo_threads AS RESTRICTIVE
FOR SELECT TO authenticated USING(social_private.content_visible('fomo_thread',id,author_id));
CREATE POLICY fomo_reply_personal_suppression ON public.fomo_replies AS RESTRICTIVE
FOR SELECT TO authenticated USING(social_private.content_visible('fomo_reply',id,author_id));
CREATE POLICY crush_personal_suppression ON public.ligar_posts AS RESTRICTIVE
FOR SELECT TO authenticated USING(public.is_adult(auth.uid()) AND social_private.content_visible('crush_post',id,author_id));
CREATE POLICY story_personal_suppression ON public.stories AS RESTRICTIVE
FOR SELECT TO authenticated USING(NOT is_hidden AND social_private.content_visible('story',id,author_id));
CREATE POLICY highlight_personal_suppression ON public.story_highlights AS RESTRICTIVE
FOR SELECT TO authenticated USING(NOT is_hidden AND social_private.content_visible('story_highlight',id,author_id)
 AND (source_story_id IS NULL OR social_private.content_visible('story',source_story_id,author_id)));

CREATE OR REPLACE FUNCTION public.save_story_highlight(p_story_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.stories; result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.stories WHERE id=p_story_id AND author_id=auth.uid() AND NOT is_hidden AND expires_at>now() FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'content_unavailable' USING ERRCODE='42501'; END IF;
 SELECT id INTO result FROM public.story_highlights WHERE author_id=auth.uid() AND source_story_id=s.id ORDER BY created_at LIMIT 1;
 IF result IS NULL THEN
  INSERT INTO public.story_highlights(author_id,source_story_id,media_url,media_type,caption)
  VALUES(auth.uid(),s.id,s.media_url,s.media_type,s.caption) RETURNING id INTO result;
 END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_story_highlight(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_story_highlight(uuid) TO authenticated;

-- Private helper: resolves only content the current user can access. No grant
-- to clients and no caller-supplied author, reporter or university identifiers.
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
REVOKE ALL ON FUNCTION social_private.social_target_author(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.queue_social_content_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_kind text; v_id uuid;
BEGIN
 IF TG_TABLE_NAME='fomo_reports' THEN
  v_kind:=CASE NEW.target_type WHEN 'thread' THEN 'fomo_thread' ELSE 'fomo_reply' END;
  v_id:=NEW.target_id;
 ELSE v_kind:='crush_post'; v_id:=NEW.post_id;
 END IF;
 INSERT INTO public.social_content_reports(reporter_id,target_kind,target_id,reason)
 VALUES(NEW.reporter_id,v_kind,v_id,left(coalesce(nullif(btrim(NEW.reason),''),'inapropiado'),500))
 ON CONFLICT(reporter_id,target_kind,target_id) DO NOTHING;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_social_content_report() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fomo_report_staff_queue AFTER INSERT ON public.fomo_reports
FOR EACH ROW EXECUTE FUNCTION public.queue_social_content_report();
CREATE TRIGGER crush_report_staff_queue AFTER INSERT ON public.ligar_reports
FOR EACH ROW EXECUTE FUNCTION public.queue_social_content_report();
-- All existing clients report through RPCs. Direct inserts bypass target/rate checks.
REVOKE INSERT ON public.fomo_reports,public.ligar_reports FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_social_content_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.dispatch_staff_alert('denuncia','Revisar denuncia de contenido',
  'Nueva denuncia en '||NEW.target_kind||'. Debe revisarse antes de '||NEW.due_at::text,
  jsonb_build_object('content_report_id',NEW.id,'target_kind',NEW.target_kind,'target_id',NEW.target_id,'url','/admin'));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_social_content_report() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER social_report_staff_alert AFTER INSERT ON public.social_content_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_social_content_report();

-- Carry pending cases forward, without changing their original review deadline.
INSERT INTO public.social_content_reports(reporter_id,target_kind,target_id,reason,created_at,due_at)
SELECT reporter_id,CASE target_type WHEN 'thread' THEN 'fomo_thread' ELSE 'fomo_reply' END,target_id,
 left(coalesce(nullif(btrim(reason),''),'inapropiado'),500),created_at,created_at+interval '24 hours'
FROM public.fomo_reports WHERE status='pending' ON CONFLICT(reporter_id,target_kind,target_id) DO NOTHING;
INSERT INTO public.social_content_reports(reporter_id,target_kind,target_id,reason,created_at,due_at)
SELECT reporter_id,'crush_post',post_id,left(coalesce(nullif(btrim(reason),''),'inapropiado'),500),created_at,created_at+interval '24 hours'
FROM public.ligar_reports WHERE status='pending' ON CONFLICT(reporter_id,target_kind,target_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.report_social_content(p_kind text,p_id uuid,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_me uuid:=auth.uid();
BEGIN
 IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 IF EXISTS(SELECT 1 FROM public.social_content_reports WHERE reporter_id=v_me AND target_kind=p_kind AND target_id=p_id) THEN RETURN; END IF;
 PERFORM social_private.social_target_author(p_kind,p_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('social-reports:'||v_me::text,0));
 IF (SELECT count(*) FROM public.social_content_reports WHERE reporter_id=v_me AND created_at>now()-interval '1 hour')>=30
 THEN RAISE EXCEPTION 'report_rate_limit' USING ERRCODE='P0001'; END IF;
 IF p_kind IN ('fomo_thread','fomo_reply') THEN
  INSERT INTO public.fomo_reports(target_type,target_id,reporter_id,reason)
  VALUES(CASE p_kind WHEN 'fomo_thread' THEN 'thread' ELSE 'reply' END,p_id,v_me,left(p_reason,500))
  ON CONFLICT(target_type,target_id,reporter_id) DO NOTHING;
 ELSIF p_kind='crush_post' THEN
  INSERT INTO public.ligar_reports(post_id,reporter_id,reason) VALUES(p_id,v_me,left(p_reason,500))
  ON CONFLICT(post_id,reporter_id) DO NOTHING;
 END IF;
 INSERT INTO public.social_content_reports(reporter_id,target_kind,target_id,reason)
 VALUES(v_me,p_kind,p_id,left(coalesce(nullif(btrim(p_reason),''),'inapropiado'),500))
 ON CONFLICT(reporter_id,target_kind,target_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.report_social_content(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_social_content(text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_fomo(p_target_type text,p_target_id uuid,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF p_target_type NOT IN ('thread','reply') THEN RAISE EXCEPTION 'invalid_content_kind'; END IF;
 PERFORM public.report_social_content(CASE p_target_type WHEN 'thread' THEN 'fomo_thread' ELSE 'fomo_reply' END,p_target_id,p_reason);
END;
$$;
CREATE OR REPLACE FUNCTION public.report_ligar_post(p_post_id uuid,p_reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 PERFORM public.report_social_content('crush_post',p_post_id,p_reason);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.report_fomo(text,uuid,text),public.report_ligar_post(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_fomo(text,uuid,text),public.report_ligar_post(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_social_content_author(p_kind text,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_me uuid:=auth.uid(); v_author uuid;
BEGIN
 IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM social_private.social_author_blocks WHERE viewer_id=v_me AND origin_kind=p_kind AND origin_id=p_id) THEN RETURN; END IF;
 v_author:=social_private.social_target_author(p_kind,p_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(v_me,v_author)::text||':'||greatest(v_me,v_author)::text,0));
 INSERT INTO social_private.social_author_blocks(viewer_id,author_id,origin_kind,origin_id)
 VALUES(v_me,v_author,p_kind,p_id) ON CONFLICT(viewer_id,author_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.block_social_content_author(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.block_social_content_author(text,uuid) TO authenticated;

-- Fail closed before the 24h review deadline if the team has not acted yet.
-- Quarantine is reversible; it does not count as a completed human review.
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
REVOKE ALL ON FUNCTION public.escalate_social_content_reports() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_social_content_reports() TO service_role;

-- Preserve the production RPC contracts; add server-side visibility checks.
CREATE OR REPLACE FUNCTION public.get_fomo_feed(p_university_id uuid, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'recent'::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_viewer UUID := auth.uid();
    v_q TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
    IF v_viewer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', t.id,
        'university_id', t.university_id,
        'body', t.body,
        'media_url', t.media_url,
        'media_type', t.media_type,
        'is_anonymous', t.is_anonymous,
        'reply_count', t.reply_count,
        'reaction_count', t.reaction_count,
        'created_at', t.created_at,
        'author', public.fomo_author_json(t.author_id, t.is_anonymous),
        'poll', public.fomo_poll_json(t.id, v_viewer),
        'my_reaction', EXISTS (
            SELECT 1 FROM public.fomo_reactions r
            WHERE r.thread_id = t.id AND r.user_id = v_viewer
        ),
        'is_mine', t.author_id = v_viewer
    )
    FROM public.fomo_threads t
    WHERE t.university_id = p_university_id
      AND t.is_deleted = false
      AND t.is_hidden = false
      AND social_private.content_visible('fomo_thread',t.id,t.author_id)
      AND (p_before IS NULL OR t.created_at < p_before)
      AND (v_q IS NULL OR t.body ILIKE '%' || v_q || '%')
    ORDER BY
      CASE WHEN p_sort = 'top'    THEN t.reaction_count END DESC NULLS LAST,
      CASE WHEN p_sort = 'oldest' THEN t.created_at     END ASC,
      CASE WHEN p_sort NOT IN ('top','oldest') THEN t.created_at END DESC,
      t.id DESC
    LIMIT  LEAST(GREATEST(p_limit, 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_fomo_preview(p_university_id uuid, p_limit integer DEFAULT 4)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT jsonb_build_object(
        'id', t.id,
        'body', t.body,
        'media_type', t.media_type,
        'is_anonymous', t.is_anonymous,
        'reply_count', t.reply_count,
        'reaction_count', t.reaction_count,
        'created_at', t.created_at,
        'author_name', CASE WHEN t.is_anonymous THEN NULL ELSE pr.full_name END,
        'author_avatar', CASE WHEN t.is_anonymous THEN NULL ELSE pr.avatar_url END
    )
    FROM public.fomo_threads t
    LEFT JOIN public.profiles pr ON pr.id = t.author_id
    WHERE t.university_id = p_university_id
      AND t.is_deleted = false
      AND t.is_hidden = false
      AND social_private.content_visible('fomo_thread',t.id,t.author_id)
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 10);
$function$
;
CREATE OR REPLACE FUNCTION public.get_fomo_public_preview(p_university_slug text, p_limit integer DEFAULT 6)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uni UUID;
BEGIN
    SELECT id INTO v_uni
      FROM public.universities
     WHERE slug = p_university_slug
     LIMIT 1;

    IF v_uni IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        -- Sin id de hilo a propósito: la vista previa no enlaza a la ficha
        -- (que sigue siendo privada), así que el id no aporta y sí filtra
        -- información sobre el volumen y el orden de publicación.
        'body', left(t.body, 180),
        'is_truncated', char_length(t.body) > 180,
        'reply_count', t.reply_count,
        'reaction_count', t.reaction_count,
        -- Solo el día, no la hora exacta: con hora exacta más el muro de una
        -- uni pequeña se puede correlacionar quién publicó qué.
        'created_on', t.created_at::date
    )
    FROM public.fomo_threads t
    WHERE t.university_id = v_uni
      AND t.is_deleted = false
      AND t.is_hidden  = false
      AND social_private.content_visible('fomo_thread',t.id,t.author_id)
      AND t.report_count = 0
      AND t.body IS NOT NULL
      AND char_length(btrim(t.body)) >= 20
      AND t.created_at < NOW() - INTERVAL '15 minutes'
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 10);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_fomo_thread(p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_viewer UUID := auth.uid();
    v_thread public.fomo_threads%ROWTYPE;
    v_is_admin BOOLEAN;
    v_result JSONB;
BEGIN
    IF v_viewer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT * INTO v_thread FROM public.fomo_threads WHERE id = p_thread_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF NOT social_private.content_visible('fomo_thread',v_thread.id,v_thread.author_id) THEN RETURN NULL; END IF;

    SELECT public.is_admin() INTO v_is_admin;

    -- Visibilidad: oculto/borrado solo para autor o admin.
    IF (v_thread.is_deleted OR v_thread.is_hidden)
       AND v_thread.author_id <> v_viewer AND NOT v_is_admin THEN
        RETURN NULL;
    END IF;

    v_result := jsonb_build_object(
        'id', v_thread.id,
        'university_id', v_thread.university_id,
        'body', v_thread.body,
        'media_url', v_thread.media_url,
        'media_type', v_thread.media_type,
        'is_anonymous', v_thread.is_anonymous,
        'reply_count', v_thread.reply_count,
        'reaction_count', v_thread.reaction_count,
        'created_at', v_thread.created_at,
        'is_hidden', v_thread.is_hidden,
        'author', public.fomo_author_json(v_thread.author_id, v_thread.is_anonymous),
        'poll', public.fomo_poll_json(v_thread.id, v_viewer),
        'my_reaction', EXISTS (
            SELECT 1 FROM public.fomo_reactions r
            WHERE r.thread_id = v_thread.id AND r.user_id = v_viewer
        ),
        'is_mine', v_thread.author_id = v_viewer,
        'replies', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', rp.id,
                    'body', rp.body,
                    'media_url', rp.media_url,
                    'media_type', rp.media_type,
                    'is_anonymous', rp.is_anonymous,
                    'created_at', rp.created_at,
                    'author', public.fomo_author_json(rp.author_id, rp.is_anonymous),
                    'is_mine', rp.author_id = v_viewer
                ) ORDER BY rp.created_at ASC
            )
            FROM public.fomo_replies rp
            WHERE rp.thread_id = v_thread.id
              AND rp.is_deleted = false
              AND rp.is_hidden = false
              AND social_private.content_visible('fomo_reply',rp.id,rp.author_id)
        ), '[]'::jsonb)
    );

    RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_ligar_feed(p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'recent'::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_viewer UUID := auth.uid();
    v_uni    UUID;
    v_gender TEXT;
    v_q TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
    IF v_viewer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NOT public.is_adult(v_viewer) THEN RETURN; END IF;
    SELECT university_id, gender INTO v_uni, v_gender
        FROM public.profiles WHERE id = v_viewer;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', t.id,
        'university_id', t.university_id,
        'body', t.body,
        'offer', t.offer,
        'media_url', t.media_url,
        'media_type', t.media_type,
        'audience', t.audience,
        'is_anonymous', t.is_anonymous,
        'reaction_count', t.reaction_count,
        'created_at', t.created_at,
        'is_mine', t.author_id = v_viewer,
        'my_reaction', EXISTS (
            SELECT 1 FROM public.ligar_reactions r
            WHERE r.post_id = t.id AND r.user_id = v_viewer
        ),
        'author', CASE WHEN t.is_anonymous THEN NULL ELSE (
            SELECT jsonb_build_object(
                'id', pr.id,
                'full_name', pr.full_name,
                'avatar_url', pr.avatar_url,
                'age', CASE WHEN pr.birth_date IS NOT NULL
                            THEN EXTRACT(YEAR FROM AGE(pr.birth_date))::int ELSE NULL END,
                'opted_in', COALESCE(pr.ligar_opted_in, false)
            )
            FROM public.profiles pr WHERE pr.id = t.author_id
        ) END
    )
    FROM public.ligar_posts t
    WHERE t.is_deleted = false
      AND t.is_hidden = false
      AND social_private.content_visible('crush_post',t.id,t.author_id)
      AND (v_uni IS NULL OR t.university_id = v_uni)
      AND (p_before IS NULL OR t.created_at < p_before)
      AND (
            t.author_id = v_viewer                       -- siempre veo los míos
            OR t.audience = 'todos'
            OR (v_gender IS NOT NULL AND t.audience = v_gender)
          )
      AND (
            v_q IS NULL
            OR t.body  ILIKE '%' || v_q || '%'
            OR t.offer ILIKE '%' || v_q || '%'
          )
    ORDER BY
      CASE WHEN p_sort = 'top'    THEN t.reaction_count END DESC NULLS LAST,
      CASE WHEN p_sort = 'oldest' THEN t.created_at     END ASC,
      CASE WHEN p_sort NOT IN ('top','oldest') THEN t.created_at END DESC,
      t.id DESC
    LIMIT  LEAST(GREATEST(p_limit, 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_fomo_reply(p_thread_id uuid, p_body text DEFAULT NULL::text, p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text, p_is_anonymous boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_author UUID := auth.uid();
    v_reply UUID;
    v_clean_body TEXT;
    v_thread public.fomo_threads%ROWTYPE;
BEGIN
    IF v_author IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT * INTO v_thread FROM public.fomo_threads WHERE id = p_thread_id;
    IF NOT FOUND OR v_thread.is_deleted OR v_thread.is_hidden OR NOT social_private.content_visible('fomo_thread',v_thread.id,v_thread.author_id) THEN
        RAISE EXCEPTION 'El hilo no existe';
    END IF;

    v_clean_body := NULLIF(btrim(COALESCE(p_body, '')), '');
    IF v_clean_body IS NULL AND p_media_url IS NULL THEN
        RAISE EXCEPTION 'La respuesta necesita texto o media';
    END IF;
    IF p_media_url IS NOT NULL AND p_media_type IS NULL THEN
        RAISE EXCEPTION 'media_type requerido cuando hay media';
    END IF;

    INSERT INTO public.fomo_replies (thread_id, author_id, is_anonymous, body, media_url, media_type)
    VALUES (p_thread_id, v_author, COALESCE(p_is_anonymous, false), v_clean_body, p_media_url, p_media_type)
    RETURNING id INTO v_reply;

    RETURN v_reply;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_ligar_post(p_body text, p_offer text, p_media_url text, p_media_type text, p_audience text, p_is_anonymous boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_uni  UUID;
    v_body  TEXT;
    v_offer TEXT;
    v_aud   TEXT;
    v_id    UUID;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NOT public.is_adult(v_user) THEN RAISE EXCEPTION 'adult_required' USING ERRCODE='42501'; END IF;

    -- Debe participar en ligar (y por tanto ser mayor de 18).
    SELECT university_id INTO v_uni FROM public.profiles
        WHERE id = v_user AND ligar_opted_in = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activa ligar primero'; END IF;
    IF v_uni IS NULL THEN RAISE EXCEPTION 'Necesitas una universidad en tu perfil'; END IF;

    v_body  := NULLIF(btrim(COALESCE(p_body, '')), '');
    v_offer := NULLIF(btrim(COALESCE(p_offer, '')), '');
    v_aud   := COALESCE(p_audience, 'todos');
    IF v_aud NOT IN ('todos', 'hombre', 'mujer') THEN v_aud := 'todos'; END IF;

    IF v_body IS NULL AND v_offer IS NULL AND p_media_url IS NULL THEN
        RAISE EXCEPTION 'Escribe algo o añade un archivo';
    END IF;
    IF p_media_url IS NOT NULL
       AND COALESCE(p_media_type, '') NOT IN ('image', 'audio', 'video') THEN
        RAISE EXCEPTION 'Tipo de archivo no válido';
    END IF;

    INSERT INTO public.ligar_posts (
        university_id, author_id, is_anonymous, body, offer,
        media_url, media_type, audience
    ) VALUES (
        v_uni, v_user, COALESCE(p_is_anonymous, false), v_body, v_offer,
        p_media_url,
        CASE WHEN p_media_url IS NULL THEN NULL ELSE p_media_type END,
        v_aud
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id);
END;
$function$
;


-- Internal callers use the non-exposed helper. The legacy public RPC never reads anonymous blocks.
CREATE OR REPLACE FUNCTION public._roomie_write_score(p_target uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target IS NULL OR p_target = v_me THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(v_me,p_target)::text || ':' || greatest(v_me,p_target)::text, 0));
  -- Orden estable: evita cambios de opt-in/descarte durante la escritura.
  PERFORM p.id FROM public.profiles p
    WHERE p.id IN (v_me,p_target) ORDER BY p.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = v_me AND p.is_discarded IS NOT TRUE)
    OR NOT public.roomie_profile_complete(v_me) THEN
    RAISE EXCEPTION 'roomie_profile_incomplete';
  END IF;
  IF social_private.pair_blocked(p_target) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_target
      AND p.looking_for_roommate AND p.onboarding_completed
      AND p.is_discarded IS NOT TRUE AND p.is_hidden IS NOT TRUE
      AND p.photo_hidden IS NOT TRUE
  ) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  RETURN public.calculate_compatibility(v_me, p_target);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_other_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_me uuid := auth.uid(); v_conv_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(v_me,p_other_user_id)::text || ':' || greatest(v_me,p_other_user_id)::text, 0));
  PERFORM p.id FROM public.profiles p
    WHERE p.id IN (v_me,p_other_user_id) ORDER BY p.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_me AND is_discarded IS NOT TRUE)
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_other_user_id AND is_discarded IS NOT TRUE)
    OR social_private.pair_blocked(p_other_user_id)
    OR NOT coalesce(public.can_message_user(p_other_user_id),false) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  SELECT c.id INTO v_conv_id FROM public.conversations c
  WHERE coalesce(c.is_group,false)=false
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id AND cp.user_id=v_me)
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id AND cp.user_id=p_other_user_id)
    AND (SELECT count(*) FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id)=2
  ORDER BY c.created_at, c.id LIMIT 1;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  INSERT INTO public.conversations(is_group) VALUES(false) RETURNING id INTO v_conv_id;
  INSERT INTO public.conversation_participants(conversation_id,user_id)
    VALUES(v_conv_id,v_me),(v_conv_id,p_other_user_id);
  RETURN v_conv_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_ig_matches()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_user
    AND p.ligar_opted_in AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE) THEN RETURN; END IF;
  RETURN QUERY SELECT jsonb_build_object(
    'id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,
    'age',CASE WHEN p.birth_date IS NOT NULL THEN extract(year FROM age(p.birth_date))::int ELSE NULL END,
    'instagram_handle',p.instagram_handle,'verified',coalesce(p.instagram_verified,false),
    'matched_at',greatest(mine.created_at,theirs.created_at))
  FROM public.ig_requests mine JOIN public.ig_requests theirs
    ON theirs.requester_id=mine.target_id AND theirs.target_id=mine.requester_id
  JOIN public.profiles p ON p.id=mine.target_id
  WHERE mine.requester_id=v_user AND p.ligar_opted_in
    AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE
    AND NOT social_private.pair_blocked(p.id)
  ORDER BY greatest(mine.created_at,theirs.created_at) DESC;
END;
$function$
;
CREATE OR REPLACE FUNCTION public._ig_request_apply(p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user uuid := auth.uid(); v_inserted int; v_matched boolean; v_handle text; v_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target IS NULL OR v_user=p_target THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(v_user,p_target)::text || ':' || greatest(v_user,p_target)::text,0));
  PERFORM p.id FROM public.profiles p
    WHERE p.id IN (v_user,p_target) ORDER BY p.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_user
    AND p.ligar_opted_in AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE) THEN
    RAISE EXCEPTION 'Activa Crush primero';
  END IF;
  IF social_private.pair_blocked(p_target) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=p_target
      AND p.ligar_opted_in AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE
  ) THEN RAISE EXCEPTION 'Esa persona ya no participa en Crush'; END IF;
  INSERT INTO public.ig_requests(requester_id,target_id)
    VALUES(v_user,p_target) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  v_matched := EXISTS(SELECT 1 FROM public.ig_requests
    WHERE requester_id=p_target AND target_id=v_user);
  IF v_matched THEN SELECT instagram_handle INTO v_handle FROM public.profiles WHERE id=p_target; END IF;
  IF v_inserted=1 THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id=v_user;
    INSERT INTO public.notifications(user_id,type,title,body,data)
    VALUES(p_target,'match',
      CASE WHEN v_matched THEN '¡Match en Crush! 💜'
        ELSE coalesce(v_name,'Alguien') || ' quiere intercambiar Instagram contigo' END,
      CASE WHEN v_matched THEN coalesce(v_name,'Alguien') || ' también quería tu Instagram. Ya podéis verlo.'
        ELSE 'Acéptalo en Crush para ver su Instagram (y que vea el tuyo).' END,
      jsonb_build_object('kind',CASE WHEN v_matched THEN 'ig_match' ELSE 'ig_request' END,'url','/crush'));
  END IF;
  RETURN jsonb_build_object('matched',v_matched,'instagram_handle',v_handle);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_discovery_feed(p_user_id uuid, p_target_type text, p_limit integer DEFAULT 20)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid         UUID := auth.uid();
    v_user_city   TEXT;
    v_budget_min  INT;
    v_budget_max  INT;
    v_me_answered BOOLEAN;
    v_limit       INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    SELECT city, budget_min, budget_max, lifestyle_answered_at IS NOT NULL
    INTO v_user_city, v_budget_min, v_budget_max, v_me_answered
    FROM public.profiles WHERE id = v_uid;
    v_me_answered := COALESCE(v_me_answered, false);

    IF p_target_type = 'accommodation' THEN
        RETURN QUERY
        SELECT to_jsonb(a.*)
        FROM public.accommodations a
        WHERE a.status = 'active'
          -- 163: is_paid y deleted_at. Esta funcion es SECURITY DEFINER, asi
          -- que se salta la RLS de la 161: sin estas dos condiciones devolvia
          -- fichas sin pagar y fichas retiradas a cualquiera que la invocara.
          AND a.is_paid = true
          AND a.deleted_at IS NULL
          -- 140: un piso sin fotos no se puede juzgar deslizando.
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) >= 1
          AND a.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'accommodation'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = a.owner_id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            CASE WHEN v_user_city IS NOT NULL AND a.city ILIKE v_user_city THEN 0 ELSE 1 END,
            CASE WHEN a.price BETWEEN COALESCE(v_budget_min, 0) AND COALESCE(v_budget_max, 9999) THEN 0 ELSE 1 END,
            a.created_at DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'roomie' THEN
        IF NOT public.roomie_profile_complete(v_uid) THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT jsonb_build_object(
            -- ── lo que ya devolvía la 140 ──
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'career', p.career,
            'academic_year', p.academic_year,
            'bio', p.bio,
            'city', p.city,
            'interests', COALESCE(p.interests, '{}'::text[]),
            'age', CASE WHEN p.birth_date IS NOT NULL
                        THEN date_part('year', age(p.birth_date))::int
                   END,
            -- ── 158: los datos REALES de la persona ──
            'photos', COALESCE(p.photos, '{}'::text[]),
            'hobbies', COALESCE(p.hobbies, '{}'::text[]),
            'budget_min', p.budget_min,
            'budget_max', p.budget_max,
            'university', u.short_name,
            'university_name', u.name,
            'is_verified', COALESCE(p.student_email_verified, false),
            'smoking', p.smoking::text,
            'partying', p.partying::text,
            'study_habits', p.study_habits::text,
            'sleep_schedule', p.sleep_schedule::text,
            'cleanliness', p.cleanliness::text,
            'noise_tolerance', p.noise_tolerance::text,
            'friends_at_home', p.friends_at_home::text,
            'pet_friendly', p.pet_friendly::text,
            'lifestyle_answered', p.lifestyle_answered_at IS NOT NULL,
            -- 157: NULL cuando alguno de los dos no ha contestado de verdad.
            'compatibility', public.roomie_compatibility(v_uid, p.id),
            'compatibility_reason',
                CASE WHEN NOT v_me_answered AND p.lifestyle_answered_at IS NULL THEN 'both'
                     WHEN NOT v_me_answered                                     THEN 'me'
                     WHEN p.lifestyle_answered_at IS NULL                       THEN 'them'
                     ELSE 'ok' END
            -- 158: lifestyle_preferences y housing_preferences YA NO se envían.
            -- Nadie las escribe nunca; solo servían para pintar el DEFAULT de la
            -- migración 001 como si fuera el perfil de esa persona.
        )
        FROM public.profiles p
        LEFT JOIN public.universities u ON u.id = p.university_id
        WHERE p.id != v_uid
          AND p.looking_for_roommate = true
 AND p.is_hidden IS NOT TRUE
 AND NOT social_private.pair_blocked(p.id)
          AND p.onboarding_completed = true
          AND COALESCE(p.is_discarded, false) = false
          -- 140: FOTO OBLIGATORIA para aparecer en el mazo.
          AND (
            COALESCE(btrim(p.avatar_url), '') <> ''
            OR COALESCE(array_length(p.photos, 1), 0) >= 1
          )
          -- 140: fuera quien tenga la foto retenida por denuncias.
          AND COALESCE(p.photo_hidden, false) = false
          AND p.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'roomie'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = p.id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            -- Se ordena con calculate_compatibility (nunca NULL) y no con
            -- roomie_compatibility: con DESC, los NULL se irían los PRIMEROS.
            public.calculate_compatibility(v_uid, p.id) DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'event' THEN
        RETURN QUERY
        SELECT to_jsonb(e.*)
        FROM public.events e
        WHERE e.start_date >= NOW()
          AND e.status = 'upcoming'
          AND e.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'event'
          )
        ORDER BY
            CASE WHEN v_user_city IS NOT NULL AND e.city ILIKE v_user_city THEN 0 ELSE 1 END,
            e.start_date ASC
        LIMIT v_limit;
    END IF;
END;
$function$
;

-- Existing Crush Live pairing and all direct-message writes share the block.
CREATE OR REPLACE FUNCTION private.crush_live_is_blocked(p_user_a uuid,p_user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_blocks b
  WHERE (b.blocker_id=p_user_a AND b.blocked_id=p_user_b) OR (b.blocker_id=p_user_b AND b.blocked_id=p_user_a))
 OR EXISTS(SELECT 1 FROM public.blocked_users b
  WHERE (b.blocker_id=p_user_a AND b.blocked_id=p_user_b) OR (b.blocker_id=p_user_b AND b.blocked_id=p_user_a))
 OR EXISTS(SELECT 1 FROM social_private.social_author_blocks b
  WHERE (b.viewer_id=p_user_a AND b.author_id=p_user_b) OR (b.viewer_id=p_user_b AND b.author_id=p_user_a));
$$;

CREATE OR REPLACE FUNCTION social_private.can_send_to_conversation(p_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.conversations c JOIN public.conversation_participants cp ON cp.conversation_id=c.id
   WHERE c.id=p_conversation AND coalesce(c.is_group,false)=false AND cp.user_id<>auth.uid()
    AND social_private.pair_blocked(cp.user_id));
$$;
REVOKE ALL ON FUNCTION social_private.can_send_to_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION social_private.can_send_to_conversation(uuid) TO authenticated;
CREATE POLICY social_private_block_message_insert ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(social_private.can_send_to_conversation(conversation_id));
CREATE POLICY social_private_block_message_update ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated
USING(social_private.can_send_to_conversation(conversation_id))
WITH CHECK(social_private.can_send_to_conversation(conversation_id));

-- Serialize a reply/message with the same bilateral lock used by blocking.
-- The visibility check must run AFTER acquiring the lock, not before waiting.
CREATE OR REPLACE FUNCTION social_private.check_social_write_pair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE other_user uuid; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RETURN NEW; END IF; -- service jobs retain their existing contract
 IF TG_TABLE_NAME='fomo_replies' THEN
  SELECT author_id INTO other_user FROM public.fomo_threads WHERE id=NEW.thread_id;
  IF other_user IS NULL THEN RAISE EXCEPTION 'content_unavailable' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(actor,other_user)::text||':'||greatest(actor,other_user)::text,0));
  IF social_private.pair_blocked(other_user) OR NOT social_private.content_visible('fomo_thread',NEW.thread_id,other_user)
  THEN RAISE EXCEPTION 'content_unavailable' USING ERRCODE='42501'; END IF;
 ELSE
  FOR other_user IN SELECT cp.user_id FROM public.conversation_participants cp JOIN public.conversations c ON c.id=cp.conversation_id
   WHERE cp.conversation_id=NEW.conversation_id AND NOT coalesce(c.is_group,false) AND cp.user_id<>actor ORDER BY cp.user_id LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(actor,other_user)::text||':'||greatest(actor,other_user)::text,0));
   IF social_private.pair_blocked(other_user) THEN RAISE EXCEPTION 'content_unavailable' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION social_private.check_social_write_pair() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER social_reply_pair_guard BEFORE INSERT ON public.fomo_replies FOR EACH ROW EXECUTE FUNCTION social_private.check_social_write_pair();
CREATE TRIGGER social_message_pair_guard BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION social_private.check_social_write_pair();

CREATE TABLE social_private.moderation_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES public.social_content_reports(id),
 actor_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('remove','restore','dismiss')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE social_private.moderation_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.moderation_decisions FROM PUBLIC,anon,authenticated;
GRANT ALL ON social_private.moderation_decisions TO service_role;

CREATE OR REPLACE FUNCTION social_private.assert_moderator()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'staff_mfa_required' USING ERRCODE='42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION social_private.assert_moderator() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_social_reports()
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM social_private.assert_moderator();
 RETURN QUERY SELECT to_jsonb(r)||jsonb_build_object('content',CASE r.target_kind
  WHEN 'fomo_thread' THEN (SELECT jsonb_build_object('body',body,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.fomo_threads WHERE id=r.target_id)
  WHEN 'fomo_reply' THEN (SELECT jsonb_build_object('body',body,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.fomo_replies WHERE id=r.target_id)
  WHEN 'crush_post' THEN (SELECT jsonb_build_object('body',concat_ws(E'\n',body,offer),'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.ligar_posts WHERE id=r.target_id)
  WHEN 'story' THEN (SELECT jsonb_build_object('body',caption,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.stories WHERE id=r.target_id)
  WHEN 'story_highlight' THEN (SELECT jsonb_build_object('body',caption,'media_url',media_url,'media_type',media_type,'is_hidden',is_hidden) FROM public.story_highlights WHERE id=r.target_id)
 END) FROM public.social_content_reports r WHERE r.status IN ('pending','quarantined') ORDER BY r.due_at LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_social_reports() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_social_reports() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_social_report(p_report_id uuid,p_action text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.social_content_reports; hide_content boolean;
BEGIN
 PERFORM social_private.assert_moderator();
 IF p_action NOT IN ('remove','restore','dismiss') OR p_action IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000
 THEN RAISE EXCEPTION 'invalid_resolution' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 SELECT * INTO r FROM public.social_content_reports WHERE id=p_report_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'report_unavailable'; END IF;
 IF r.status IN ('resolved','dismissed') THEN RETURN; END IF;
 IF p_action<>'dismiss' THEN
  hide_content:=p_action='remove';
  CASE r.target_kind
   WHEN 'fomo_thread' THEN UPDATE public.fomo_threads SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'fomo_reply' THEN UPDATE public.fomo_replies SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'crush_post' THEN UPDATE public.ligar_posts SET is_hidden=hide_content WHERE id=r.target_id;
   WHEN 'story' THEN
    UPDATE public.stories SET is_hidden=hide_content WHERE id=r.target_id;
    UPDATE public.story_highlights h SET is_hidden=hide_content WHERE h.source_story_id=r.target_id
     AND (hide_content OR NOT EXISTS(SELECT 1 FROM public.social_content_reports own_report
      WHERE own_report.target_kind='story_highlight' AND own_report.target_id=h.id AND own_report.status IN ('quarantined','resolved')));
   WHEN 'story_highlight' THEN UPDATE public.story_highlights SET is_hidden=hide_content WHERE id=r.target_id;
  END CASE;
 END IF;
 -- Resolve all currently reviewed reports for this content; keep each report
 -- row so the reporter's personal suppression survives an admin dismissal.
 INSERT INTO social_private.moderation_decisions(report_id,actor_id,action,reason)
 SELECT id,auth.uid(),p_action,btrim(p_reason) FROM public.social_content_reports
 WHERE target_kind=r.target_kind AND target_id=r.target_id AND status IN ('pending','quarantined');
 UPDATE public.social_content_reports SET status=CASE WHEN p_action='remove' THEN 'resolved' ELSE 'dismissed' END,
  assigned_to=auth.uid(),resolved_at=now(),resolution=btrim(p_reason)
 WHERE target_kind=r.target_kind AND target_id=r.target_id AND status IN ('pending','quarantined');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_social_report(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_social_report(uuid,text,text) TO authenticated;
-- Retire the legacy path which bypassed MFA, case history and the queue lock.
REVOKE EXECUTE ON FUNCTION public.admin_fomo_moderate(text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_crush_party_post_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.crush_party_posts WHERE post_id=OLD.id) THEN
  IF ROW(NEW.id,NEW.university_id,NEW.author_id,NEW.is_anonymous,NEW.body,NEW.offer,NEW.media_url,NEW.media_type,NEW.audience,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.university_id,OLD.author_id,OLD.is_anonymous,OLD.body,OLD.offer,OLD.media_url,OLD.media_type,OLD.audience,OLD.created_at)
  THEN RAISE EXCEPTION 'party_post_content_immutable' USING ERRCODE='22023'; END IF;
  IF (OLD.is_deleted AND NOT NEW.is_deleted) OR NEW.report_count<OLD.report_count
  THEN RAISE EXCEPTION 'party_post_moderation_monotonic' USING ERRCODE='42501'; END IF;
  -- Clients have no UPDATE grant. Only a checked, audited staff operation can
  -- restore a party publication, and none of its immutable content may change.
  IF OLD.is_hidden AND NOT NEW.is_hidden THEN PERFORM social_private.assert_moderator(); END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_crush_party_post_content() FROM PUBLIC,anon,authenticated;

DO $$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL THEN
  PERFORM cron.schedule('social-report-deadlines','*/5 * * * *','SELECT public.escalate_social_content_reports()');
 END IF;
END $$;

NOTIFY pgrst, 'reload schema';
