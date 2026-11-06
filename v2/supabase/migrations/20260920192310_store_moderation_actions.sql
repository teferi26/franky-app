-- Store review 1.2: personal hiding and an audited account sanction on removal.
-- Requires account_erasure (session gate). No existing accounts are suspended.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE social_private.hidden_content (
 viewer_id uuid NOT NULL REFERENCES public.profiles(id),
 target_kind text NOT NULL CHECK(target_kind IN ('fomo_thread','fomo_reply','crush_post','story','story_highlight')),
 target_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(viewer_id,target_kind,target_id)
);
CREATE TABLE social_private.account_suspensions (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 report_id uuid NOT NULL REFERENCES public.social_content_reports(id),
 issued_by uuid NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(),
 restored_by uuid, restored_at timestamptz,
 CHECK((restored_at IS NULL)=(restored_by IS NULL))
);
-- Preserve attribution privately if a reported story expires or is deleted
-- before staff review. This mapping is never returned by the reporting RPC.
CREATE TABLE social_private.report_authors (
 report_id uuid PRIMARY KEY REFERENCES public.social_content_reports(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id)
);
-- Free-text decisions stay in the existing moderation audit. This account
-- ledger stores identifiers only and is separate from irreversible erasure.
CREATE TABLE social_private.account_suspension_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 report_id uuid NOT NULL REFERENCES public.social_content_reports(id), actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('suspend','restore')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE social_private.moderation_auth_jobs (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id), desired_ban boolean NOT NULL,
 revision uuid NOT NULL DEFAULT gen_random_uuid(), lease_id uuid, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
ALTER TABLE social_private.hidden_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_private.account_suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_private.report_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_private.account_suspension_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_private.moderation_auth_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_private.hidden_content,social_private.account_suspensions,
 social_private.account_suspension_actions,social_private.moderation_auth_jobs,social_private.report_authors FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION social_private.capture_report_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE subject uuid;
BEGIN
 -- Trigger-only capability. The report insert remains governed by the
 -- existing validating RPC; no caller-provided author is ever accepted.
 CASE NEW.target_kind
  WHEN 'fomo_thread' THEN SELECT author_id INTO subject FROM public.fomo_threads WHERE id=NEW.target_id;
  WHEN 'fomo_reply' THEN SELECT author_id INTO subject FROM public.fomo_replies WHERE id=NEW.target_id;
  WHEN 'crush_post' THEN SELECT author_id INTO subject FROM public.ligar_posts WHERE id=NEW.target_id;
  WHEN 'story' THEN SELECT author_id INTO subject FROM public.stories WHERE id=NEW.target_id;
  WHEN 'story_highlight' THEN SELECT author_id INTO subject FROM public.story_highlights WHERE id=NEW.target_id;
 END CASE;
 IF subject IS NOT NULL THEN INSERT INTO social_private.report_authors(report_id,user_id) VALUES(NEW.id,subject) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_private.capture_report_author() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER social_report_capture_author AFTER INSERT ON public.social_content_reports
 FOR EACH ROW EXECUTE FUNCTION social_private.capture_report_author();
INSERT INTO social_private.report_authors(report_id,user_id)
 SELECT r.id,c.author_id FROM public.social_content_reports r JOIN (
 SELECT 'fomo_thread' kind,id,author_id FROM public.fomo_threads UNION ALL
 SELECT 'fomo_reply',id,author_id FROM public.fomo_replies UNION ALL
 SELECT 'crush_post',id,author_id FROM public.ligar_posts UNION ALL
 SELECT 'story',id,author_id FROM public.stories UNION ALL
 SELECT 'story_highlight',id,author_id FROM public.story_highlights
 ) c ON c.kind=r.target_kind AND c.id=r.target_id;

-- Same helper/OID used by restrictive RLS and the Data API pre-request hook.
-- The caller can ask only about their own identity, not probe another user.
CREATE OR REPLACE FUNCTION public.account_session_usable() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NULL OR (
  NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=auth.uid())
  AND NOT EXISTS(SELECT 1 FROM social_private.account_suspensions WHERE user_id=auth.uid() AND restored_at IS NULL))
$$;
REVOKE ALL ON FUNCTION public.account_session_usable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_session_usable() TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.require_account_session() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.account_session_usable() THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_account_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_account_session() TO anon,authenticated,service_role;

-- Rechecks after the per-account lock, including writes inside old DEFINER
-- RPCs. A service callback has no end-user JWT and retains its existing scope.
CREATE OR REPLACE FUNCTION account_private.guard_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(u::text,912003));
  IF NOT public.account_session_usable() THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION account_private.guard_actor() FROM PUBLIC,anon,authenticated;

-- Preserve ALL existing report, block, discarded-author and hidden-profile
-- restrictions. Add only a private per-viewer content suppression.
CREATE OR REPLACE FUNCTION social_private.content_visible(p_kind text,p_id uuid,p_author uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.account_session_usable()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_author
   AND p.is_discarded IS NOT TRUE AND (p.is_hidden IS NOT TRUE OR p.id=auth.uid()))
 AND NOT EXISTS(SELECT 1 FROM public.social_content_reports r WHERE r.target_kind=p_kind AND r.target_id=p_id AND r.status IN ('quarantined','resolved'))
 AND (auth.uid() IS NULL OR (
   NOT social_private.pair_blocked(p_author)
   AND NOT EXISTS(SELECT 1 FROM social_private.hidden_content h WHERE h.viewer_id=auth.uid() AND h.target_kind=p_kind AND h.target_id=p_id)
   AND NOT EXISTS(SELECT 1 FROM public.social_content_reports r WHERE r.reporter_id=auth.uid() AND r.target_kind=p_kind AND r.target_id=p_id)
   AND NOT EXISTS(SELECT 1 FROM public.fomo_reports r WHERE r.reporter_id=auth.uid() AND r.target_id=p_id
     AND ((p_kind='fomo_thread' AND r.target_type='thread') OR (p_kind='fomo_reply' AND r.target_type='reply')))
   AND NOT EXISTS(SELECT 1 FROM public.ligar_reports r WHERE p_kind='crush_post' AND r.reporter_id=auth.uid() AND r.post_id=p_id)
 ));
$$;
REVOKE ALL ON FUNCTION social_private.content_visible(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION social_private.content_visible(text,uuid,uuid) TO authenticated,service_role;

-- DEFINER is necessary to validate accessibility without revealing anonymous
-- authors, and to write only the caller's suppression into an unexposed table.
CREATE FUNCTION public.hide_social_content(p_kind text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,912003));
 PERFORM public.require_account_session();
 IF EXISTS(SELECT 1 FROM social_private.hidden_content WHERE viewer_id=auth.uid() AND target_kind=p_kind AND target_id=p_id) THEN RETURN; END IF;
 PERFORM social_private.social_target_author(p_kind,p_id);
 INSERT INTO social_private.hidden_content(viewer_id,target_kind,target_id) VALUES(auth.uid(),p_kind,p_id) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.hide_social_content(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hide_social_content(text,uuid) TO authenticated;
INSERT INTO account_private.rules(relation,owner_columns,tombstone)
 VALUES('social_private.hidden_content',ARRAY['viewer_id'],NULL),
 ('social_private.account_suspension_actions',ARRAY['user_id'],'{"reason":"Cuenta eliminada"}'::jsonb);
CREATE TRIGGER aaa_account_erasure_actor BEFORE INSERT OR UPDATE OR DELETE ON social_private.hidden_content
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_actor();
CREATE TRIGGER aab_account_erasure_subject BEFORE INSERT OR UPDATE ON social_private.hidden_content
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_subject();
CREATE TRIGGER aab_account_erasure_subject BEFORE INSERT OR UPDATE ON social_private.account_suspension_actions
 FOR EACH ROW EXECUTE FUNCTION account_private.guard_subject();

-- An unrelated profile update (billing, recovery or stale metadata) cannot
-- reactivate a suspended account. Erasure's stronger tombstone takes priority.
CREATE FUNCTION social_private.guard_suspended_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s social_private.account_suspensions;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=NEW.id) THEN
  SELECT * INTO s FROM social_private.account_suspensions WHERE user_id=NEW.id AND restored_at IS NULL;
  IF s.user_id IS NOT NULL THEN
   NEW.is_discarded:=true; NEW.self_deleted:=false;
   NEW.discarded_at:=s.issued_at; NEW.discarded_by:=s.issued_by;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION social_private.guard_suspended_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_social_suspension_profile BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION social_private.guard_suspended_profile();

-- Existing moderation API; staff + MFA are rechecked after all actor locks.
-- Removing a validated case ejects its author without invoking erasure.
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
REVOKE ALL ON FUNCTION public.admin_resolve_social_report(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_social_report(uuid,text,text) TO authenticated;

-- Appeals are explicit admin + MFA operations, distinct from content restore
-- and self-service account recovery. An erased identity is never restorable.
CREATE FUNCTION public.admin_restore_social_account(p_user uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s social_private.account_suspensions; lock_user uuid;
BEGIN
 PERFORM social_private.assert_moderator();
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 PERFORM public.require_account_session();
 IF p_user IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'invalid_resolution' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('social-moderation-queue',0));
 FOR lock_user IN SELECT DISTINCT x FROM unnest(ARRAY[auth.uid(),p_user]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(lock_user::text,912003));
 END LOOP;
 PERFORM social_private.assert_moderator();
 PERFORM public.require_account_session();
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=p_user) THEN RAISE EXCEPTION 'account_erased' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM social_private.account_suspensions WHERE user_id=p_user FOR UPDATE;
 IF s.user_id IS NULL OR s.restored_at IS NOT NULL THEN RETURN; END IF;
 UPDATE social_private.account_suspensions SET restored_at=now(),restored_by=auth.uid() WHERE user_id=p_user;
 INSERT INTO social_private.account_suspension_actions(user_id,report_id,actor_id,action,reason)
 VALUES(p_user,s.report_id,auth.uid(),'restore',btrim(p_reason));
 UPDATE public.profiles SET is_discarded=false,self_deleted=false WHERE id=p_user;
 INSERT INTO social_private.moderation_auth_jobs(user_id,desired_ban) VALUES(p_user,false)
 ON CONFLICT(user_id) DO UPDATE SET desired_ban=false,revision=gen_random_uuid(),
  completed_at=NULL,retry_at=now(),updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.admin_restore_social_account(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_social_account(uuid,text) TO authenticated;

-- Service-only reconciliation with Auth Admin API updateUserById. Database
-- suspension is authoritative even during Auth outage, retries or old JWTs.
CREATE FUNCTION public.claim_moderation_auth_job() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j social_private.moderation_auth_jobs;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND session_user<>'postgres' THEN RAISE EXCEPTION 'service_required' USING ERRCODE='42501'; END IF;
 UPDATE social_private.moderation_auth_jobs q SET completed_at=now(),lease_id=NULL,lease_until=NULL
 WHERE completed_at IS NULL AND EXISTS(SELECT 1 FROM account_private.erasures e WHERE e.user_id=q.user_id)
  AND (q.lease_until IS NULL OR q.lease_until<now());
 SELECT * INTO j FROM social_private.moderation_auth_jobs q WHERE completed_at IS NULL
  AND retry_at<=now() AND (lease_until IS NULL OR lease_until<now())
  AND NOT EXISTS(SELECT 1 FROM account_private.erasures e WHERE e.user_id=q.user_id)
 ORDER BY updated_at,user_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.user_id IS NULL THEN RETURN NULL; END IF;
 UPDATE social_private.moderation_auth_jobs SET lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1
 WHERE user_id=j.user_id RETURNING * INTO j;
 RETURN jsonb_build_object('user_id',j.user_id,'desired_ban',j.desired_ban,'revision',j.revision,'lease_id',j.lease_id);
END $$;
CREATE FUNCTION public.finish_moderation_auth_job(p_user uuid,p_revision uuid,p_lease uuid,p_success boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j social_private.moderation_auth_jobs;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND session_user<>'postgres' THEN RAISE EXCEPTION 'service_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM social_private.moderation_auth_jobs WHERE user_id=p_user FOR UPDATE;
 IF j.user_id IS NULL THEN RETURN false; END IF;
 IF j.lease_id IS DISTINCT FROM p_lease OR p_lease IS NULL OR j.lease_until<now() THEN
  -- A very late Auth request can finish after its replacement. Reconcile the
  -- latest desired state again, even if that replacement had already finished.
  IF p_success IS TRUE THEN UPDATE social_private.moderation_auth_jobs SET completed_at=NULL,retry_at=now() WHERE user_id=p_user; END IF;
  RETURN false;
 END IF;
 IF j.revision IS DISTINCT FROM p_revision THEN
  UPDATE social_private.moderation_auth_jobs SET lease_id=NULL,lease_until=NULL,retry_at=now() WHERE user_id=p_user;
  RETURN false;
 END IF;
 UPDATE social_private.moderation_auth_jobs SET lease_id=NULL,lease_until=NULL,
  completed_at=CASE WHEN p_success IS TRUE THEN now() ELSE NULL END,
  retry_at=CASE WHEN p_success IS TRUE THEN now() ELSE now()+interval '1 minute' END WHERE user_id=p_user;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_moderation_auth_job(),public.finish_moderation_auth_job(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_moderation_auth_job(),public.finish_moderation_auth_job(uuid,uuid,uuid,boolean) TO service_role;

COMMENT ON TABLE social_private.account_suspensions IS 'Moderation sanctions; no account erasure. Active until explicit audited admin MFA appeal restoration.';
COMMENT ON TABLE social_private.hidden_content IS 'Caller-owned per-content suppression; no author identifier is exposed.';
COMMIT;
