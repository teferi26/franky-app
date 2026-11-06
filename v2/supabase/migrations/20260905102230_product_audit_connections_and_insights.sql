-- Product audit: actual studies and screen usage. Staff + MFA only.
CREATE OR REPLACE FUNCTION public.admin_product_insights(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_careers jsonb;
  v_screens jsonb;
  v_coverage jsonb;
  v_profile_filter text;
  v_event_filter text;
BEGIN
  PERFORM public._admin_required();
  IF coalesce(auth.jwt()->>'aal','') <> 'aal2' THEN RAISE EXCEPTION 'mfa_required'; END IF;
  p_filters := COALESCE(p_filters, '{}'::jsonb);
  v_profile_filter := public._profile_filter_sql(p_filters);
  v_event_filter := public._profile_filter_sql(p_filters - 'since' - 'until');
  IF p_filters->>'since' IS NOT NULL THEN
    v_event_filter := v_event_filter || format(' AND e.created_at >= %L::timestamptz', p_filters->>'since');
  END IF;
  IF p_filters->>'until' IS NOT NULL THEN
    v_event_filter := v_event_filter || format(' AND e.created_at < %L::timestamptz', p_filters->>'until');
  END IF;
  EXECUTE 'SELECT coalesce(jsonb_agg(t ORDER BY t.user_count DESC, t.name), ''[]''::jsonb) FROM (
    SELECT coalesce(nullif(lower(trim(p.career)), ''''), ''Sin especificar'') AS name,
      count(*) AS user_count
    FROM public.profiles p WHERE true ' || v_profile_filter || '
    GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50) t' INTO v_careers;
  EXECUTE 'SELECT coalesce(jsonb_agg(t ORDER BY t.views DESC, t.screen, t.platform), ''[]''::jsonb) FROM (
    SELECT e.props->>''screen'' AS screen, coalesce(e.platform, ''unknown'') AS platform,
      count(*) AS views, count(DISTINCT e.user_id) AS users
    FROM public.analytics_events e JOIN public.profiles p ON p.id = e.user_id
    WHERE e.name = ''screen_view'' AND e.props->>''screen'' ~ ''^[a-z_]{1,40}$'' ' || v_event_filter || '
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 150) t' INTO v_screens;
  EXECUTE 'SELECT jsonb_build_object(''views'', count(*), ''users'', count(DISTINCT e.user_id),
    ''first_seen'', min(e.created_at), ''last_seen'', max(e.created_at))
    FROM public.analytics_events e JOIN public.profiles p ON p.id = e.user_id
    WHERE e.name = ''screen_view'' AND e.props->>''screen'' ~ ''^[a-z_]{1,40}$'' ' || v_event_filter INTO v_coverage;
  RETURN jsonb_build_object('current_careers', v_careers, 'screens', v_screens, 'coverage', v_coverage);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_product_insights(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_insights(jsonb) TO authenticated;
COMMENT ON FUNCTION public.admin_product_insights(jsonb) IS 'Current self-reported studies by registration cohort; screen usage by event date. No IDs, search terms or feedback bodies.';

CREATE OR REPLACE FUNCTION public.get_my_roomie_connections(
  p_tab text DEFAULT 'matches', p_limit int DEFAULT 30, p_offset int DEFAULT 0
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tab text := coalesce(p_tab, 'matches');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF v_tab NOT IN ('matches', 'given', 'received') THEN
    RAISE EXCEPTION 'invalid_tab';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = v_me AND is_discarded IS NOT TRUE) THEN
    RAISE EXCEPTION 'profile_unavailable';
  END IF;
  RETURN QUERY
  WITH connections AS (
    SELECT CASE WHEN r.user_id = v_me THEN r.matched_user_id ELSE r.user_id END AS peer,
      bool_or(r.user_id = v_me) AS outgoing,
      bool_or(r.matched_user_id = v_me) AS incoming,
      max(r.created_at) AS latest
    FROM public.roommate_matches r
    WHERE (r.user_id = v_me OR r.matched_user_id = v_me)
      AND r.user_id <> r.matched_user_id
      AND r.status IN ('liked', 'matched')
    GROUP BY 1
  ), selected AS (
    SELECT c.* FROM connections c
    WHERE CASE v_tab
      WHEN 'matches' THEN c.outgoing AND c.incoming
      WHEN 'given' THEN c.outgoing AND NOT c.incoming
      ELSE c.incoming AND NOT c.outgoing END
      AND NOT EXISTS (SELECT 1 FROM public.blocked_users b
        WHERE (b.blocker_id = v_me AND b.blocked_id = c.peer)
           OR (b.blocker_id = c.peer AND b.blocked_id = v_me))
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = v_me AND b.blocked_id = c.peer)
           OR (b.blocker_id = c.peer AND b.blocked_id = v_me))
  )
  SELECT jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
    'photos', coalesce(p.photos, '{}'::text[]),
    'city', p.city, 'career', p.career,
    'budget_min', p.budget_min, 'budget_max', p.budget_max,
    'university_name', u.name,
    'compatibility_score', public.roomie_compatibility(v_me, p.id),
    'conversation_id', chat.id)
  FROM selected s
  JOIN public.profiles p ON p.id = s.peer AND p.is_discarded IS NOT TRUE
    AND p.is_hidden IS NOT TRUE AND p.photo_hidden IS NOT TRUE
  LEFT JOIN public.universities u ON u.id = p.university_id
  LEFT JOIN LATERAL (
    SELECT c.id FROM public.conversations c
    WHERE coalesce(c.is_group, false) = false
      AND EXISTS (SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = c.id AND cp.user_id = v_me)
      AND EXISTS (SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = c.id AND cp.user_id = p.id)
      AND (SELECT count(*) FROM public.conversation_participants cp
        WHERE cp.conversation_id = c.id) = 2
    ORDER BY c.created_at DESC, c.id LIMIT 1
  ) chat ON true
  ORDER BY s.latest DESC NULLS LAST, p.id
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 50)
  OFFSET least(greatest(coalesce(p_offset, 0), 0), 10000);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_roomie_connections(text,int,int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_roomie_connections(text,int,int)
  TO authenticated;

-- Read-only smoke checks in the same transaction: fail before deployment if
-- the live schema cannot satisfy the curated projection or permissions.
DO $$
DECLARE v_saved text := current_setting('request.jwt.claims',true); v_me uuid; v_count int;
BEGIN
  IF has_function_privilege('anon','public.get_my_roomie_connections(text,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.admin_product_insights(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected_public_grant';
  END IF;
  SELECT id INTO v_me FROM public.profiles WHERE role NOT IN ('admin','analyst') AND is_discarded IS NOT TRUE LIMIT 1;
  IF v_me IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_me,'role','authenticated','aal','aal1')::text,true);
    SELECT count(*) INTO v_count FROM public.get_my_roomie_connections('matches',1,0);
    BEGIN
      PERFORM public.admin_product_insights('{}');
      RAISE EXCEPTION 'staff_gate_missing';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT IN ('forbidden','mfa_required') THEN RAISE; END IF;
    END;
  END IF;
  PERFORM set_config('request.jwt.claims',coalesce(v_saved,''),true);
END; $$;
