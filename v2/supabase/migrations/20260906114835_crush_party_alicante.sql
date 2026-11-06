-- Crush Party Alicante: reviewed, 83 local assertions and 5 concurrency scenarios passed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF to_regclass('public.crush_parties') IS NOT NULL OR to_regclass('public.crush_party_members') IS NOT NULL
    OR to_regclass('public.crush_party_posts') IS NOT NULL
 THEN RAISE EXCEPTION 'crush_party_schema_already_exists'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.universities WHERE id='28ef67ae-2ac4-4e41-935a-04681776e2cd')
 THEN RAISE EXCEPTION 'alicante_catalogue_identity_missing'; END IF;
 IF to_regprocedure('public.set_ligar_profile(text,boolean)') IS NULL
    OR to_regprocedure('public.is_adult(uuid)') IS NULL
 THEN RAISE EXCEPTION 'crush_party_dependency_missing'; END IF;
END $guard$;

CREATE TABLE public.crush_parties(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 100),
 university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
 starts_at timestamptz NOT NULL,
 opens_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 active boolean NOT NULL DEFAULT true,
 screen_paused boolean NOT NULL DEFAULT false,
 terms_version text NOT NULL DEFAULT 'crush-party-2026-09-06-v1',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(opens_at<=starts_at AND starts_at<ends_at)
);
CREATE TABLE public.crush_party_members(
 party_id uuid NOT NULL REFERENCES public.crush_parties(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 2 AND 50 AND display_name !~ '[[:cntrl:]]'),
 terms_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 last_join_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(party_id,user_id)
);
CREATE TABLE public.crush_party_posts(
 -- id remains the original ligar_post id even if a physical deletion nulls post_id.
 -- The tombstone preserves retry/rate-limit history without resurrecting deleted posts.
 id uuid PRIMARY KEY,
 post_id uuid UNIQUE REFERENCES public.ligar_posts(id) ON DELETE SET NULL,
 party_id uuid NOT NULL,
 author_id uuid NOT NULL,
 client_request_id uuid NOT NULL,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 320),
 is_anonymous boolean NOT NULL DEFAULT true,
 share_instagram boolean NOT NULL DEFAULT false,
 display_name text,
 instagram_handle text,
 screen_consent boolean NOT NULL CHECK(screen_consent IS TRUE),
 screen_consent_version text NOT NULL,
 screen_consented_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(party_id,author_id) REFERENCES public.crush_party_members(party_id,user_id) ON DELETE CASCADE,
 UNIQUE(author_id,client_request_id),
 CHECK(post_id IS NULL OR post_id=id),
 CHECK(NOT(is_anonymous AND share_instagram)),
 CHECK((is_anonymous AND display_name IS NULL) OR
       (NOT is_anonymous AND char_length(display_name) BETWEEN 2 AND 50)),
 CHECK((NOT share_instagram AND instagram_handle IS NULL) OR
       (share_instagram AND instagram_handle ~ '^[a-z0-9._]{1,30}$'))
);
CREATE INDEX crush_party_posts_screen ON public.crush_party_posts(party_id,created_at DESC,id DESC);
CREATE INDEX crush_party_posts_actor_time ON public.crush_party_posts(author_id,created_at DESC);
ALTER TABLE public.crush_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crush_party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crush_party_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crush_parties,public.crush_party_members,public.crush_party_posts FROM PUBLIC,anon,authenticated,service_role;
-- Deliberately no direct policies: only the explicit projections/mutations below.
COMMENT ON TABLE public.crush_party_posts IS 'Private consent and idempotency ledger. Public projection only through get_crush_party_feed; no direct table access. Not a second Crush wall.';

CREATE FUNCTION public._crush_party_public(p_party_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
 SELECT jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title,
  'university_id',p.university_id,'university_name',u.name,'starts_at',p.starts_at,
  'opens_at',p.opens_at,'ends_at',p.ends_at,'active',p.active,'screen_paused',p.screen_paused,
  'terms_version',p.terms_version)
 FROM public.crush_parties p JOIN public.universities u ON u.id=p.university_id WHERE p.id=p_party_id;
$fn$;

CREATE FUNCTION public.get_crush_party_state(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE
 v_uid uuid:=auth.uid(); v_party public.crush_parties%ROWTYPE;
 v_profile public.profiles%ROWTYPE; v_member public.crush_party_members%ROWTYPE;
 v_reasons text[]:='{}'; v_open boolean; v_adult boolean;
 v_my_posts jsonb:='[]'; v_my_ids jsonb:='[]';
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_party FROM public.crush_parties WHERE slug=p_slug;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_ready' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_member FROM public.crush_party_members WHERE party_id=v_party.id AND user_id=v_uid;
 v_open:=v_party.active AND now()>=v_party.opens_at AND now()<v_party.ends_at;
 v_adult:=public.is_adult(v_uid);
 IF v_profile.is_discarded IS TRUE THEN v_reasons:=array_append(v_reasons,'account_inactive'); END IF;
 IF NOT v_adult THEN v_reasons:=array_append(v_reasons,
  CASE WHEN v_profile.birth_date IS NULL THEN 'birth_date_required' ELSE 'adult_required' END); END IF;
 IF v_profile.university_id IS NULL THEN v_reasons:=array_append(v_reasons,'university_required'); END IF;
 IF NULLIF(btrim(v_profile.career),'') IS NULL THEN v_reasons:=array_append(v_reasons,'career_required'); END IF;
 IF NULLIF(btrim(v_profile.instagram_handle),'') IS NULL THEN v_reasons:=array_append(v_reasons,'instagram_required'); END IF;
 IF v_profile.ligar_opted_in IS NOT TRUE THEN v_reasons:=array_append(v_reasons,'crush_opt_in_required'); END IF;
 IF v_profile.ig_quarantined IS TRUE THEN v_reasons:=array_append(v_reasons,'instagram_quarantined'); END IF;
 IF v_profile.email_verified_at IS NULL AND v_profile.created_at >= TIMESTAMPTZ '2026-07-25 00:00:00+02'
 THEN v_reasons:=array_append(v_reasons,'email_verification_required'); END IF;
 IF v_member.user_id IS NULL OR v_member.terms_version IS DISTINCT FROM v_party.terms_version
 THEN v_reasons:=array_append(v_reasons,'party_acceptance_required'); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'body',q.body,'created_at',q.created_at,
   'is_anonymous',q.is_anonymous,'available',q.available,'deleted',q.deleted)
   ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb),
  COALESCE(jsonb_agg(to_jsonb(q.id) ORDER BY q.created_at DESC,q.id DESC)
   FILTER(WHERE q.existing AND NOT q.deleted),'[]'::jsonb)
 INTO v_my_posts,v_my_ids
 FROM (SELECT link.id,link.body,link.created_at,link.is_anonymous,
   t.id IS NOT NULL AS existing,COALESCE(t.is_deleted,true) AS deleted,
   t.id IS NOT NULL AND NOT t.is_deleted AND NOT t.is_hidden AS available
  FROM public.crush_party_posts link LEFT JOIN public.ligar_posts t ON t.id=link.post_id
  WHERE link.author_id=v_uid AND link.party_id=v_party.id
  ORDER BY link.created_at DESC,link.id DESC LIMIT 60) q;
 RETURN jsonb_build_object('party',public._crush_party_public(v_party.id),
  'joined',v_member.user_id IS NOT NULL,'eligible',cardinality(v_reasons)=0,'posting_open',v_open,
  'my_post_ids',v_my_ids,'my_posts',v_my_posts,
  'display_name',v_member.display_name,'needs_birth_date',v_profile.birth_date IS NULL,
  'ineligibility_reasons',to_jsonb(v_reasons),
  'profile',jsonb_build_object('full_name',v_profile.full_name,'university_id',v_profile.university_id,
    'career',v_profile.career,'instagram_handle',v_profile.instagram_handle,'birth_date',v_profile.birth_date,
    'opted_in',v_profile.ligar_opted_in,'role',v_profile.role));
END $fn$;

CREATE FUNCTION public.join_crush_party(
 p_slug text,p_university_id uuid,p_career text,p_instagram_handle text,
 p_birth_date date,p_display_name text,p_accept_terms boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE
 v_uid uuid:=auth.uid(); v_party public.crush_parties%ROWTYPE; v_profile public.profiles%ROWTYPE;
 v_name text:=btrim(p_display_name); v_career text:=btrim(p_career); v_dob date;
 v_handle text:=regexp_replace(lower(btrim(p_instagram_handle)),'^@','');
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF p_accept_terms IS NOT TRUE THEN RAISE EXCEPTION 'party_terms_required' USING ERRCODE='22023'; END IF;
 IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 50 OR v_name ~ '[[:cntrl:]]'
  OR v_career IS NULL OR char_length(v_career) NOT BETWEEN 1 AND 160 OR v_career ~ '[[:cntrl:]]'
  OR v_handle IS NULL OR v_handle !~ '^[a-z0-9._]{1,30}$'
 THEN RAISE EXCEPTION 'invalid_party_profile' USING ERRCODE='22023'; END IF;
 -- Every party write: own profile -> party. No client-supplied actor/role.
 SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_ready' USING ERRCODE='P0002'; END IF;
 IF v_profile.is_discarded IS TRUE THEN RAISE EXCEPTION 'account_inactive' USING ERRCODE='42501'; END IF;
 IF v_profile.ig_quarantined IS TRUE THEN RAISE EXCEPTION 'instagram_quarantined' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_party FROM public.crush_parties WHERE slug=p_slug AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_not_found' USING ERRCODE='P0002'; END IF;
 IF now()<v_party.opens_at OR now()>=v_party.ends_at THEN RAISE EXCEPTION 'party_closed' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.universities WHERE id=p_university_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_university' USING ERRCODE='22023'; END IF;
 -- Existing age is authoritative, including an encrypted-only legacy value.
 v_dob:=v_profile.birth_date;
 IF v_dob IS NULL AND v_profile.birth_date_encrypted IS NOT NULL THEN
  v_dob:=NULLIF(public._pii_decrypt(v_profile.birth_date_encrypted),'')::date;
  IF v_dob IS NULL THEN RAISE EXCEPTION 'birth_date_unavailable' USING ERRCODE='22023'; END IF;
 END IF;
 IF v_dob IS NULL THEN
  v_dob:=p_birth_date;
  IF v_dob IS NULL THEN RAISE EXCEPTION 'birth_date_required' USING ERRCODE='22023'; END IF;
  IF v_dob<CURRENT_DATE-INTERVAL '120 years' OR v_dob>CURRENT_DATE
  THEN RAISE EXCEPTION 'invalid_birth_date' USING ERRCODE='22023'; END IF;
 END IF;
 IF v_dob>CURRENT_DATE-INTERVAL '18 years' THEN RAISE EXCEPTION 'adult_required' USING ERRCODE='42501'; END IF;
 UPDATE public.profiles SET
  university_id=p_university_id,career=v_career,birth_date=v_dob,
  full_name=CASE WHEN NULLIF(btrim(full_name),'') IS NULL THEN v_name ELSE full_name END
 WHERE id=v_uid;
 -- Preserve the canonical handle uniqueness/cooldown, opt-in and verification invalidation.
 PERFORM public.set_ligar_profile(v_handle,true);
 UPDATE public.profiles SET onboarding_completed=true WHERE id=v_uid;
 INSERT INTO public.crush_party_members(party_id,user_id,display_name,terms_version)
 VALUES(v_party.id,v_uid,v_name,v_party.terms_version)
 ON CONFLICT(party_id,user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
  accepted_at=CASE WHEN public.crush_party_members.terms_version IS DISTINCT FROM EXCLUDED.terms_version
    THEN now() ELSE public.crush_party_members.accepted_at END,
  terms_version=EXCLUDED.terms_version,last_join_at=now();
 RETURN public.get_crush_party_state(p_slug);
END $fn$;

CREATE FUNCTION public.create_crush_party_post(
 p_slug text,p_body text,p_is_anonymous boolean,p_share_instagram boolean,
 p_client_request_id uuid,p_screen_consent boolean,
 p_expected_instagram_handle text,p_expected_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE
 v_uid uuid:=auth.uid(); v_party public.crush_parties%ROWTYPE; v_profile public.profiles%ROWTYPE;
 v_member public.crush_party_members%ROWTYPE; v_existing public.crush_party_posts%ROWTYPE;
 v_body text:=btrim(p_body); v_id uuid; v_now timestamptz:=now(); v_available boolean;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF p_screen_consent IS NOT TRUE THEN RAISE EXCEPTION 'screen_consent_required' USING ERRCODE='22023'; END IF;
 IF p_client_request_id IS NULL OR p_is_anonymous IS NULL OR p_share_instagram IS NULL
    OR (p_is_anonymous AND p_share_instagram) OR v_body IS NULL OR char_length(v_body) NOT BETWEEN 1 AND 320
 THEN RAISE EXCEPTION 'invalid_party_post' USING ERRCODE='22023'; END IF;
 IF (p_is_anonymous AND p_expected_display_name IS NOT NULL)
  OR (NOT p_share_instagram AND p_expected_instagram_handle IS NOT NULL)
  OR (NOT p_is_anonymous AND p_expected_display_name IS NULL)
  OR (p_share_instagram AND p_expected_instagram_handle IS NULL)
 THEN RAISE EXCEPTION 'invalid_party_post' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid FOR NO KEY UPDATE;
 IF NOT FOUND OR v_profile.is_discarded IS TRUE THEN RAISE EXCEPTION 'account_inactive' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_party FROM public.crush_parties WHERE slug=p_slug FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_existing FROM public.crush_party_posts WHERE author_id=v_uid AND client_request_id=p_client_request_id;
 IF FOUND THEN
  IF v_existing.party_id IS DISTINCT FROM v_party.id OR v_existing.body IS DISTINCT FROM v_body
    OR v_existing.is_anonymous IS DISTINCT FROM p_is_anonymous OR v_existing.share_instagram IS DISTINCT FROM p_share_instagram
    OR v_existing.display_name IS DISTINCT FROM p_expected_display_name
    OR v_existing.instagram_handle IS DISTINCT FROM p_expected_instagram_handle
  THEN RAISE EXCEPTION 'client_request_conflict' USING ERRCODE='22023'; END IF;
  v_available:=EXISTS(SELECT 1 FROM public.ligar_posts t WHERE t.id=v_existing.post_id AND NOT t.is_deleted AND NOT t.is_hidden);
  RETURN jsonb_build_object('id',v_existing.id,'party_slug',v_party.slug,'already_created',true,
   'available',v_available,'created_at',v_existing.created_at);
 END IF;
 IF NOT v_party.active OR v_now<v_party.opens_at OR v_now>=v_party.ends_at
 THEN RAISE EXCEPTION 'party_closed' USING ERRCODE='22023'; END IF;
 IF NOT public.is_adult(v_uid) THEN RAISE EXCEPTION 'adult_required' USING ERRCODE='42501'; END IF;
 IF NOT v_profile.ligar_opted_in OR v_profile.ig_quarantined IS TRUE
 THEN RAISE EXCEPTION 'crush_participation_required' USING ERRCODE='42501'; END IF;
 IF v_profile.university_id IS NULL OR NULLIF(btrim(v_profile.career),'') IS NULL
  OR v_profile.instagram_handle IS NULL OR v_profile.instagram_handle !~ '^[a-z0-9._]{1,30}$'
 THEN RAISE EXCEPTION 'party_profile_incomplete' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_member FROM public.crush_party_members WHERE party_id=v_party.id AND user_id=v_uid;
 IF NOT FOUND OR v_member.terms_version IS DISTINCT FROM v_party.terms_version
 THEN RAISE EXCEPTION 'party_acceptance_required' USING ERRCODE='22023'; END IF;
 -- Capture exactly what the client displayed, never a handle/name changed in another tab.
 IF (p_share_instagram AND v_profile.instagram_handle IS DISTINCT FROM p_expected_instagram_handle)
  OR (NOT p_is_anonymous AND v_member.display_name IS DISTINCT FROM p_expected_display_name)
 THEN RAISE EXCEPTION 'party_profile_changed' USING ERRCODE='22023'; END IF;
 -- Includes tombstones. Serialization is independent of the legacy wall trigger.
 IF (SELECT count(*) FROM public.crush_party_posts WHERE author_id=v_uid AND created_at>v_now-INTERVAL '1 hour')>=10
 THEN RAISE EXCEPTION 'party_rate_limit' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.ligar_posts(university_id,author_id,is_anonymous,body,offer,media_url,media_type,audience)
 VALUES(v_party.university_id,v_uid,p_is_anonymous,v_body,NULL,NULL,NULL,'todos') RETURNING id INTO v_id;
 INSERT INTO public.crush_party_posts(id,post_id,party_id,author_id,client_request_id,body,is_anonymous,
  share_instagram,display_name,instagram_handle,screen_consent,screen_consent_version)
 VALUES(v_id,v_id,v_party.id,v_uid,p_client_request_id,v_body,p_is_anonymous,p_share_instagram,
  CASE WHEN p_is_anonymous THEN NULL ELSE v_member.display_name END,
  CASE WHEN p_share_instagram THEN v_profile.instagram_handle ELSE NULL END,true,v_party.terms_version);
 RETURN jsonb_build_object('id',v_id,'party_slug',v_party.slug,'already_created',false,'available',true,'created_at',v_now);
END $fn$;

CREATE FUNCTION public.guard_crush_party_post_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.crush_party_posts WHERE post_id=OLD.id) AND
  (ROW(NEW.id,NEW.university_id,NEW.author_id,NEW.is_anonymous,NEW.body,NEW.offer,NEW.media_url,NEW.media_type,NEW.audience,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.university_id,OLD.author_id,OLD.is_anonymous,OLD.body,OLD.offer,OLD.media_url,OLD.media_type,OLD.audience,OLD.created_at))
 THEN RAISE EXCEPTION 'party_post_content_immutable' USING ERRCODE='22023'; END IF;
 -- A linked publication cannot be resurrected or unhidden by a direct author UPDATE.
 IF EXISTS(SELECT 1 FROM public.crush_party_posts WHERE post_id=OLD.id)
  AND ((OLD.is_deleted AND NOT NEW.is_deleted) OR (OLD.is_hidden AND NOT NEW.is_hidden)
       OR NEW.report_count<OLD.report_count)
 THEN RAISE EXCEPTION 'party_post_moderation_monotonic' USING ERRCODE='42501'; END IF;
 -- Report/reaction increments and soft deletion remain canonical.
 RETURN NEW;
END $fn$;
CREATE TRIGGER a_guard_crush_party_post_content BEFORE UPDATE ON public.ligar_posts
 FOR EACH ROW EXECUTE FUNCTION public.guard_crush_party_post_content();

CREATE FUNCTION public.get_crush_party_feed(p_slug text,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE v_party public.crush_parties%ROWTYPE; v_posts jsonb:='[]';
BEGIN
 SELECT * INTO v_party FROM public.crush_parties WHERE slug=p_slug AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_not_found' USING ERRCODE='P0002'; END IF;
 IF NOT v_party.screen_paused AND now()>=v_party.opens_at AND now()<v_party.ends_at THEN
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO v_posts
  FROM (
   SELECT t.id,t.body,
    CASE WHEN t.is_anonymous THEN NULL ELSE link.display_name END AS display_name,
    CASE WHEN link.share_instagram AND NOT t.is_anonymous AND p.ig_quarantined IS NOT TRUE
      AND p.instagram_handle=link.instagram_handle THEN link.instagram_handle ELSE NULL END AS instagram_handle,
    t.is_anonymous,t.created_at,t.reaction_count
   FROM public.crush_party_posts link JOIN public.ligar_posts t ON t.id=link.post_id
    JOIN public.profiles p ON p.id=t.author_id
   WHERE link.party_id=v_party.id AND link.screen_consent IS TRUE
    AND NOT t.is_deleted AND NOT t.is_hidden
    AND p.is_discarded IS NOT TRUE AND p.ligar_opted_in AND public.is_adult(p.id)
    AND t.author_id=link.author_id AND t.university_id=v_party.university_id
    AND t.body=link.body AND t.is_anonymous=link.is_anonymous AND t.audience='todos'
    AND t.offer IS NULL AND t.media_url IS NULL AND t.media_type IS NULL
   ORDER BY t.created_at DESC,t.id DESC LIMIT LEAST(60,GREATEST(1,COALESCE(p_limit,40)))
  ) q;
 END IF;
 RETURN jsonb_build_object('party',public._crush_party_public(v_party.id),'posts',v_posts,'generated_at',now());
END $fn$;

CREATE FUNCTION public.admin_set_crush_party(p_slug text,p_active boolean,p_screen_paused boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_party public.crush_parties%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR COALESCE(auth.jwt()->>'aal','')<>'aal2'
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=v_uid AND role='admin' AND is_discarded IS NOT TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 IF p_active IS NULL AND p_screen_paused IS NULL THEN RAISE EXCEPTION 'invalid_party_control' USING ERRCODE='22023'; END IF;
 UPDATE public.crush_parties SET active=COALESCE(p_active,active),screen_paused=COALESCE(p_screen_paused,screen_paused),updated_at=now()
 WHERE slug=p_slug RETURNING * INTO v_party;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_not_found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_table,target_id,changes)
 VALUES(v_uid,'set_crush_party','crush_parties',v_party.id::text,
  jsonb_build_object('active',v_party.active,'screen_paused',v_party.screen_paused));
 RETURN public._crush_party_public(v_party.id);
END $fn$;

CREATE FUNCTION public.admin_hide_crush_party_post(p_slug text,p_post_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_party_id uuid;
BEGIN
 IF v_uid IS NULL OR COALESCE(auth.jwt()->>'aal','')<>'aal2'
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=v_uid AND role='admin' AND is_discarded IS NOT TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 SELECT id INTO v_party_id FROM public.crush_parties WHERE slug=p_slug;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.crush_party_posts WHERE party_id=v_party_id AND post_id=p_post_id)
 THEN RAISE EXCEPTION 'party_post_not_found' USING ERRCODE='P0002'; END IF;
 UPDATE public.ligar_posts SET is_hidden=true,updated_at=now() WHERE id=p_post_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_post_not_found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_table,target_id,changes)
 VALUES(v_uid,'hide_crush_party_post','ligar_posts',p_post_id::text,jsonb_build_object('party_id',v_party_id));
 RETURN jsonb_build_object('id',p_post_id,'hidden',true);
END $fn$;

CREATE FUNCTION public.admin_get_crush_party(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_party_id uuid; v_posts jsonb;
BEGIN
 IF v_uid IS NULL OR COALESCE(auth.jwt()->>'aal','')<>'aal2'
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_uid AND role='admin' AND is_discarded IS NOT TRUE)
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 SELECT id INTO v_party_id FROM public.crush_parties WHERE slug=p_slug;
 IF NOT FOUND THEN RAISE EXCEPTION 'party_not_found' USING ERRCODE='P0002'; END IF;
 SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO v_posts
 FROM (SELECT link.id,link.body,CASE WHEN link.is_anonymous THEN NULL ELSE link.display_name END AS display_name,
   link.is_anonymous,link.created_at,COALESCE(t.is_hidden,false) AS hidden,COALESCE(t.is_deleted,true) AS deleted
  FROM public.crush_party_posts link LEFT JOIN public.ligar_posts t ON t.id=link.post_id
  WHERE link.party_id=v_party_id ORDER BY link.created_at DESC,link.id DESC LIMIT 100) q;
 RETURN jsonb_build_object('party',public._crush_party_public(v_party_id),'posts',v_posts);
END $fn$;

-- No private projection/helper is executable by anon. No service bypass RPC grants.
REVOKE ALL ON FUNCTION public._crush_party_public(uuid),
 public.get_crush_party_state(text),
 public.join_crush_party(text,uuid,text,text,date,text,boolean),
 public.create_crush_party_post(text,text,boolean,boolean,uuid,boolean,text,text),
 public.guard_crush_party_post_content(),
 public.get_crush_party_feed(text,integer),
 public.admin_set_crush_party(text,boolean,boolean),
 public.admin_get_crush_party(text),
 public.admin_hide_crush_party_post(text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_crush_party_feed(text,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_crush_party_state(text),
 public.join_crush_party(text,uuid,text,text,date,text,boolean),
 public.create_crush_party_post(text,text,boolean,boolean,uuid,boolean,text,text),
 public.admin_set_crush_party(text,boolean,boolean),
 public.admin_get_crush_party(text),
 public.admin_hide_crush_party_post(text,uuid) TO authenticated;

INSERT INTO public.crush_parties(slug,title,university_id,starts_at,opens_at,ends_at)
 VALUES('franky-11-septiembre','Franky Event · Alicante','28ef67ae-2ac4-4e41-935a-04681776e2cd',
  '2026-09-11T22:00:00Z','2026-09-06T00:00:00Z','2026-09-12T06:00:00Z');
-- starts_at is provisional: Fri 11 -> Sat 12 at 00:00 Europe/Madrid. No physical venue asserted.
NOTIFY pgrst,'reload schema';
COMMIT;
