BEGIN;
CREATE FUNCTION public.admin_decision_metrics(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE since_at timestamptz; result jsonb;
BEGIN
 PERFORM public._admin_required();
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'mfa_required'; END IF;
 IF p_days IS NULL OR p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'invalid_period'; END IF;
 since_at:=now()-make_interval(days=>p_days);
 WITH eligible AS (
   SELECT p.id,p.created_at,p.career,p.student_email_verified FROM public.profiles p WHERE p.is_discarded IS NOT TRUE
 ), demand AS (
   SELECT p.id,CASE WHEN h.enabled AND h.expires_at>now() THEN coalesce(h.province,'Zona sin identificar')
     ELSE coalesce(public.provincia_de(coalesce(nullif(p.desired_city,''),nullif(u.city,''),p.city)),'Zona sin identificar') END AS province,
     CASE WHEN h.enabled AND h.expires_at>now() THEN h.budget_max ELSE p.budget_max END AS budget
   FROM public.profiles p LEFT JOIN public.universities u ON u.id=p.university_id
   LEFT JOIN public.housing_search_intents h ON h.user_id=p.id
   WHERE p.is_discarded IS NOT TRUE AND h.enabled IS DISTINCT FROM false AND
     ((h.enabled AND h.expires_at>now()) OR p.looking_for_housing)
 ), supply AS (
   SELECT coalesce(public.provincia_de(a.city),public.provincia_de(u.city),'Zona sin identificar') AS province,count(*) AS listings
   FROM public.accommodations a LEFT JOIN public.universities u ON u.id=a.university_id
   WHERE a.status='active' AND a.is_paid AND a.deleted_at IS NULL GROUP BY 1
 ), demand_grouped AS (
   SELECT province,count(*) AS seekers,count(*) FILTER(WHERE budget IS NOT NULL) AS with_budget,
     round(percentile_cont(0.5) WITHIN GROUP(ORDER BY budget)::numeric) AS median_budget,
     count(*) FILTER(WHERE budget<=400) AS up_to_400,count(*) FILTER(WHERE budget>400 AND budget<=700) AS from_401_to_700,
     count(*) FILTER(WHERE budget>700) AS above_700 FROM demand GROUP BY province
 ), screens AS (
   SELECT e.props->>'screen' AS screen,e.platform,count(*) AS views,count(DISTINCT e.user_id) AS users
   FROM public.analytics_events e JOIN eligible p ON p.id=e.user_id WHERE e.name='screen_view' AND e.created_at>=since_at GROUP BY 1,2
 ), actions AS (
   SELECT e.name,count(*) AS events,count(DISTINCT e.user_id) AS users FROM public.analytics_events e JOIN eligible p ON p.id=e.user_id
   WHERE e.created_at>=since_at AND e.name IN('signup_completed','onboarding_completed','fomo_thread_created','vocational_started','vocational_completed',
     'crush_live_event_opt_in','crush_live_swipe','crush_live_match_created','checkout_started','checkout_completed','career_viewed','scholarship_viewed') GROUP BY e.name
 ), studies AS (
   SELECT coalesce(nullif(trim(career),''),'Sin carrera indicada') AS career,count(*) AS users FROM eligible GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 30
 )
 SELECT jsonb_build_object(
   'period_days',p_days,'generated_at',now(),
   'audience',jsonb_build_object('registered',(SELECT count(*) FROM eligible),'new_users',(SELECT count(*) FROM eligible WHERE created_at>=since_at),
     'career_missing',(SELECT count(*) FROM eligible WHERE nullif(trim(career),'') IS NULL),'student_verified',(SELECT count(*) FROM eligible WHERE student_email_verified),
     'tracked_users',(SELECT count(DISTINCT e.user_id) FROM public.analytics_events e JOIN eligible p ON p.id=e.user_id WHERE e.created_at>=since_at),
     'first_recorded_event',(SELECT min(created_at) FROM public.analytics_events)),
   'careers',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM studies s),'[]'::jsonb),
   'screens',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM screens ORDER BY views DESC,screen,platform LIMIT 40) s),'[]'::jsonb),
   'actions',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM actions a),'[]'::jsonb),
   'housing',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM (SELECT d.*,coalesce(s.listings,0) AS listings FROM demand_grouped d LEFT JOIN supply s USING(province) ORDER BY d.seekers DESC,d.province LIMIT 30) h),'[]'::jsonb),
   'alerts',jsonb_build_object(
     'publications',coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM (SELECT kind,status,count(*) AS jobs,sum(inserted) AS inbox_created,min(audience_at) AS oldest FROM private.product_alert_jobs WHERE status<>'suppressed' GROUP BY kind,status) j),'[]'::jsonb),
     'push',coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM (SELECT status,count(*) AS jobs,min(created_at) AS oldest FROM public.push_delivery_outbox WHERE created_at>=since_at OR status IN('pending','sending','processing','provider_sending') GROUP BY status) j),'[]'::jsonb),
     'staff',coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM (SELECT status,count(*) AS jobs FROM public.staff_alert_outbox WHERE created_at>=since_at OR status IN('pending','sending') GROUP BY status) j),'[]'::jsonb)
   ),
   'quality',jsonb_build_object('housing_without_photo',(SELECT count(*) FROM public.accommodations WHERE status='active' AND is_paid AND deleted_at IS NULL AND coalesce(array_length(images,1),0)=0),
     'leisure_without_coordinates',(SELECT count(*) FROM public.leisure_spots WHERE is_verified AND is_paid AND (latitude IS NULL OR longitude IS NULL)),
     'recent_searches',(SELECT count(*) FROM public.housing_search_intents WHERE enabled AND expires_at>now()))
 ) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_decision_metrics(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decision_metrics(integer) TO authenticated;
COMMIT;
