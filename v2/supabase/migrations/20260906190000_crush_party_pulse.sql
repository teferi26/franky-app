-- Crush Party pulse: the venue screen shows how many Instagrams each message has
-- been asked for and how many matches the party has produced. Counts only, never
-- who: identities stay private until the match itself reveals them to the pair.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF to_regclass('public.crush_parties') IS NULL OR to_regclass('public.ig_requests') IS NULL
    OR to_regprocedure('public.get_crush_party_feed(text,integer)') IS NULL
 THEN RAISE EXCEPTION 'crush_party_pulse_dependency_missing'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.get_crush_party_feed(p_slug text,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE v_party public.crush_parties%ROWTYPE; v_posts jsonb:='[]'; v_matches integer:=0; v_requests integer:=0;
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
    t.is_anonymous,t.created_at,t.reaction_count,
    -- Party members who asked this author for their Instagram since the party opened.
    (SELECT count(*)::int FROM public.ig_requests r
      JOIN public.crush_party_members rm ON rm.party_id=v_party.id AND rm.user_id=r.requester_id
      WHERE r.target_id=t.author_id AND r.created_at>=v_party.opens_at) AS request_count
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
 -- Mutual requests between two party members, completed since the party opened.
 SELECT count(*)::int INTO v_matches
 FROM public.ig_requests a JOIN public.ig_requests b ON b.requester_id=a.target_id AND b.target_id=a.requester_id
  JOIN public.crush_party_members ma ON ma.party_id=v_party.id AND ma.user_id=a.requester_id
  JOIN public.crush_party_members mb ON mb.party_id=v_party.id AND mb.user_id=a.target_id
  JOIN public.profiles pa ON pa.id=a.requester_id JOIN public.profiles pb ON pb.id=a.target_id
 WHERE a.requester_id<a.target_id AND GREATEST(a.created_at,b.created_at)>=v_party.opens_at
  AND pa.ligar_opted_in AND pb.ligar_opted_in AND pa.is_discarded IS NOT TRUE AND pb.is_discarded IS NOT TRUE;
 SELECT count(*)::int INTO v_requests
 FROM public.ig_requests r JOIN public.crush_party_members m ON m.party_id=v_party.id AND m.user_id=r.requester_id
 WHERE r.created_at>=v_party.opens_at;
 RETURN jsonb_build_object('party',public._crush_party_public(v_party.id),'posts',v_posts,
  'matches',v_matches,'requests',v_requests,'generated_at',now());
END $fn$;

-- CREATE OR REPLACE keeps the existing grants (anon, authenticated). Assert it.
DO $check$ BEGIN
 IF NOT has_function_privilege('anon','public.get_crush_party_feed(text,integer)','EXECUTE')
    OR has_function_privilege('anon','public.get_crush_party_state(text)','EXECUTE')
 THEN RAISE EXCEPTION 'crush_party_pulse_grants_unexpected'; END IF;
END $check$;
NOTIFY pgrst,'reload schema';
COMMIT;
