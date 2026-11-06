-- Reviewed and rehearsed: 59 synthetic checks. Preserve H1 MFA gate and every ACL/attribute.
-- Public metrics corrections; no historical timestamp inference or data changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE metrics_targets(signature text PRIMARY KEY,expected_hash text,steps jsonb) ON COMMIT DROP;
INSERT INTO metrics_targets VALUES
('public.admin_engagement_metrics(integer)','889d1a093167ab0b8e8a25af70b8cb1c','[["v_messages int; v_tests int; v_matches int; v_events int;","v_messages int; v_tests int; v_matches int; v_current_matches int; v_events int;"],["SELECT count(*) INTO v_matches FROM public.roommate_matches WHERE created_at >= v_now - interval ''30 days'';","-- One row per currently reciprocal pair. Row creation is NOT match time.\n    WITH pairs AS (\n        SELECT mine.user_id AS user_a, mine.matched_user_id AS user_b,\n               CASE WHEN mine.created_at IS NOT NULL AND theirs.created_at IS NOT NULL\n                    THEN greatest(mine.created_at, theirs.created_at) END AS latest_direction_created_at\n        FROM public.roommate_matches mine\n        JOIN public.roommate_matches theirs\n          ON theirs.user_id = mine.matched_user_id AND theirs.matched_user_id = mine.user_id\n        WHERE mine.user_id < mine.matched_user_id\n          AND mine.status = ''matched'' AND theirs.status = ''matched''\n    ), participants AS (\n        SELECT user_a AS user_id FROM pairs\n        UNION SELECT user_b AS user_id FROM pairs\n    )\n    SELECT (SELECT count(*) FROM pairs WHERE latest_direction_created_at >= v_now - interval ''30 days''\n                                               AND latest_direction_created_at <= v_now),\n           (SELECT count(*) FROM pairs),\n           (SELECT count(*) FROM participants)\n    INTO v_matches, v_current_matches, v_first_match;"],["    SELECT count(DISTINCT user_id) INTO v_first_match FROM public.roommate_matches;\n",""],["''roommate_matches_made_30d'', v_matches, ''events_joined_30d'', v_events,","''roommate_matches_made_30d'', v_matches, ''events_joined_30d'', v_events,\n        ''roommate_connections_current'', v_current_matches,\n        ''_roomie_scope'', jsonb_build_object(\n            ''current_connections'', ''unique_reciprocal_matched_pairs'',\n            ''legacy_30d'', ''current_pairs_latest_direction_created_at'',\n            ''match_date_available'', false\n        ),"]]'::jsonb),
('public.admin_monetization_summary(jsonb)','ecff434a98f905375fee91f6780e8230','[["FROM public.subscriptions WHERE status IN (''active'', ''trialing'');","FROM public.subscriptions WHERE status = ''active'';"],["FROM public.business_subscriptions WHERE status IN (''active'', ''trialing'');","FROM public.business_subscriptions WHERE status = ''active'';"]]'::jsonb);
DO $patch$
DECLARE t record;v_oid oid;v_before jsonb;v_after jsonb;v_definition text;v_source text;v_step jsonb;v_old text;v_new text;
BEGIN
 IF (SELECT count(*) FROM metrics_targets)<>2 THEN RAISE EXCEPTION 'unexpected_target_count'; END IF;
 FOR t IN SELECT * FROM metrics_targets ORDER BY signature LOOP
  v_oid:=to_regprocedure(t.signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'missing_function: %',t.signature; END IF;
  SELECT to_jsonb(p),pg_get_functiondef(p.oid) INTO v_before,v_definition FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_definition) IS DISTINCT FROM t.expected_hash THEN RAISE EXCEPTION 'definition_drift: %',t.signature; END IF;
  v_source:=v_before->>'prosrc';
  FOR v_step IN SELECT value FROM jsonb_array_elements(t.steps) LOOP
   v_old:=v_step->>0;v_new:=v_step->>1;
   IF v_old='' OR (length(v_source)-length(replace(v_source,v_old,'')))/length(v_old)<>1
   THEN RAISE EXCEPTION 'replacement_not_unique: %',t.signature; END IF;
   v_source:=replace(v_source,v_old,v_new);
   v_definition:=replace(v_definition,v_old,v_new);
  END LOOP;
  IF position('PERFORM public._admin_required();' in v_source)=0
     OR position('IF coalesce(auth.jwt()->>''aal'','''') <> ''aal2'' THEN RAISE EXCEPTION ''mfa_required''; END IF;' in v_source)=0
  THEN RAISE EXCEPTION 'missing_mfa_guard: %',t.signature; END IF;
  EXECUTE v_definition;
  SELECT to_jsonb(p) INTO v_after FROM pg_proc p WHERE p.oid=v_oid;
  IF (v_before-'prosrc') IS DISTINCT FROM (v_after-'prosrc')
     OR v_after->>'prosrc' IS DISTINCT FROM v_source
  THEN RAISE EXCEPTION 'unexpected_catalog_change: %',t.signature; END IF;
  IF has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
     OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl WHERE p.oid=v_oid AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'unexpected_acl: %',t.signature; END IF;
 END LOOP;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
