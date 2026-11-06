-- 044b — Schema fixes for analytics RPCs after production rollout
--
-- The 044 migration assumed columns/tables that don't exist in this schema:
--   • profiles.signup_source  → does not exist (use utm_source as proxy)
--   • events.start_at         → real column is `start_date`
--   • event_participants.created_at → real column is `registered_at`
--   • qr_scans.created_at     → real column is `scanned_at`
--   • user_reports            → table does not exist (set pending = 0)
--
-- Additional fixes:
--   • _profile_filter_sql used `text[] || 'literal'` which PG sometimes resolves
--     to the array-concat-array overload, producing
--     "malformed array literal: 'p.is_discarded IS NOT TRUE'". Replaced every
--     concat with array_append() for unambiguous typing. Also added
--     jsonb_typeof() guards so non-array filter values don't blow up
--     jsonb_array_length().
--   • admin_signups_daily had `jsonb_agg(... OVER ())` — a window function
--     inside an aggregate, which Postgres rejects with
--     "aggregate function calls cannot contain window function calls".
--     Split into a CTE that computes the cumulative sum first.
--   • admin_top_careers used a complex FULL OUTER JOIN that referenced
--     cr.cut_off_score / cr.employment_rate (which may not exist). Rewrote
--     as a simpler desired-only ranking that's safe across schemas.
--   • Switched all `LIMIT %L` from format() to `LIMIT %s` with explicit
--     `int::text` casts to avoid `'20'::int` cast noise.
--
-- This migration is idempotent (CREATE OR REPLACE) and safe to re-run.

-- =====================================================================
-- _profile_filter_sql — defensive rewrite
-- =====================================================================

CREATE OR REPLACE FUNCTION public._profile_filter_sql(p_filters jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clauses text[] := ARRAY[]::text[];
    v_arr text[];
    v_uuids uuid[];
    v_ints int[];
BEGIN
    IF p_filters IS NULL THEN
        RETURN '';
    END IF;

    IF jsonb_typeof(p_filters -> 'comunidad') = 'array' AND jsonb_array_length(p_filters -> 'comunidad') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'comunidad') AS value INTO v_arr;
        v_clauses := array_append(v_clauses, 'p.comunidad_autonoma IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    IF jsonb_typeof(p_filters -> 'city') = 'array' AND jsonb_array_length(p_filters -> 'city') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'city') AS value INTO v_arr;
        v_clauses := array_append(v_clauses, 'p.city IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    IF jsonb_typeof(p_filters -> 'university') = 'array' AND jsonb_array_length(p_filters -> 'university') > 0 THEN
        SELECT array_agg(value::uuid) FROM jsonb_array_elements_text(p_filters -> 'university') AS value INTO v_uuids;
        v_clauses := array_append(v_clauses, 'p.university_id = ANY(' || quote_literal(v_uuids::text) || '::uuid[])');
    END IF;

    IF jsonb_typeof(p_filters -> 'gender') = 'array' AND jsonb_array_length(p_filters -> 'gender') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'gender') AS value INTO v_arr;
        v_clauses := array_append(v_clauses, 'p.gender IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    IF jsonb_typeof(p_filters -> 'student_type') = 'array' AND jsonb_array_length(p_filters -> 'student_type') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'student_type') AS value INTO v_arr;
        v_clauses := array_append(v_clauses, 'p.student_type IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    IF jsonb_typeof(p_filters -> 'year') = 'array' AND jsonb_array_length(p_filters -> 'year') > 0 THEN
        SELECT array_agg((value)::int) FROM jsonb_array_elements_text(p_filters -> 'year') AS value INTO v_ints;
        v_clauses := array_append(v_clauses, 'p.university_course = ANY(' || quote_literal(v_ints::text) || '::int[])');
    END IF;

    IF jsonb_typeof(p_filters -> 'age_bucket') = 'array' AND jsonb_array_length(p_filters -> 'age_bucket') > 0 THEN
        DECLARE
            v_age_clauses text[] := ARRAY[]::text[];
            v_bucket text;
        BEGIN
            FOR v_bucket IN SELECT jsonb_array_elements_text(p_filters -> 'age_bucket') LOOP
                IF v_bucket = '<18' THEN
                    v_age_clauses := array_append(v_age_clauses, 'date_part(''year'', age(p.birth_date)) < 18');
                ELSIF v_bucket = '18-21' THEN
                    v_age_clauses := array_append(v_age_clauses, 'date_part(''year'', age(p.birth_date)) BETWEEN 18 AND 21');
                ELSIF v_bucket = '22-25' THEN
                    v_age_clauses := array_append(v_age_clauses, 'date_part(''year'', age(p.birth_date)) BETWEEN 22 AND 25');
                ELSIF v_bucket = '26-30' THEN
                    v_age_clauses := array_append(v_age_clauses, 'date_part(''year'', age(p.birth_date)) BETWEEN 26 AND 30');
                ELSIF v_bucket = '30+' THEN
                    v_age_clauses := array_append(v_age_clauses, 'date_part(''year'', age(p.birth_date)) > 30');
                END IF;
            END LOOP;
            IF array_length(v_age_clauses, 1) > 0 THEN
                v_clauses := array_append(v_clauses, '(' || array_to_string(v_age_clauses, ' OR ') || ')');
            END IF;
        END;
    END IF;

    IF p_filters ? 'since' AND jsonb_typeof(p_filters -> 'since') = 'string' THEN
        v_clauses := array_append(v_clauses, 'p.created_at >= ' || quote_literal(p_filters ->> 'since') || '::timestamptz');
    END IF;
    IF p_filters ? 'until' AND jsonb_typeof(p_filters -> 'until') = 'string' THEN
        v_clauses := array_append(v_clauses, 'p.created_at < ' || quote_literal(p_filters ->> 'until') || '::timestamptz');
    END IF;

    v_clauses := array_append(v_clauses, 'p.is_discarded IS NOT TRUE');

    IF array_length(v_clauses, 1) IS NULL THEN
        RETURN '';
    END IF;
    RETURN ' AND ' || array_to_string(v_clauses, ' AND ');
END;
$$;

-- =====================================================================
-- admin_kpis_summary — remove user_reports dependency
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_kpis_summary(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_period_start timestamptz := v_now - (p_range_days || ' days')::interval;
    v_prev_start timestamptz := v_period_start - (p_range_days || ' days')::interval;
    v_total_users int; v_total_users_prev int;
    v_new_signups_today int; v_new_signups_period int; v_new_signups_prev_period int;
    v_total_propietarios int; v_total_premium int; v_total_student int; v_total_business int;
    v_verified_students int; v_pending_reports int := 0;
    v_incidents_24h int;
    v_mrr numeric := 0; v_arr numeric := 0;
BEGIN
    PERFORM public._admin_required();
    SELECT count(*) INTO v_total_users FROM public.profiles WHERE is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_total_users_prev FROM public.profiles WHERE is_discarded IS NOT TRUE AND created_at < v_period_start;
    SELECT count(*) INTO v_new_signups_today FROM public.profiles WHERE created_at >= date_trunc('day', v_now) AND is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_new_signups_period FROM public.profiles WHERE created_at >= v_period_start AND is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_new_signups_prev_period FROM public.profiles WHERE created_at >= v_prev_start AND created_at < v_period_start AND is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_total_propietarios FROM public.profiles WHERE role = 'propietario' AND is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_total_premium FROM public.subscriptions WHERE plan = 'premium' AND status IN ('active', 'trialing');
    SELECT count(*) INTO v_total_student FROM public.subscriptions WHERE plan = 'student' AND status IN ('active', 'trialing');
    SELECT count(*) INTO v_total_business FROM public.business_subscriptions WHERE status IN ('active', 'trialing');
    SELECT count(*) INTO v_verified_students FROM public.profiles WHERE student_email_verified = true AND is_discarded IS NOT TRUE;
    -- user_reports table does not exist in this schema; v_pending_reports stays 0
    SELECT count(*) INTO v_incidents_24h FROM public.security_incidents WHERE created_at >= v_now - interval '24 hours';
    v_mrr := (v_total_student * 4.99) + (v_total_premium * 9.99) + (v_total_business * 9.99);
    v_arr := v_mrr * 12;
    RETURN jsonb_build_object(
        'period_days', p_range_days, 'total_users', v_total_users, 'total_users_prev', v_total_users_prev,
        'new_signups_today', v_new_signups_today, 'new_signups_period', v_new_signups_period,
        'new_signups_prev_period', v_new_signups_prev_period, 'total_propietarios', v_total_propietarios,
        'total_premium', v_total_premium, 'total_student', v_total_student, 'total_business', v_total_business,
        'mrr_estimate', v_mrr, 'arr_estimate', v_arr, 'verified_students', v_verified_students,
        'pending_reports', v_pending_reports, 'security_incidents_24h', v_incidents_24h, 'generated_at', v_now
    );
END;
$$;

-- =====================================================================
-- admin_signups_daily — split window function out of aggregate
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_signups_daily(
    p_start date, p_end date, p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result jsonb;
    v_filter_sql text := public._profile_filter_sql(p_filters);
    v_sql text;
BEGIN
    PERFORM public._admin_required();
    v_sql := format(
        $q$
        WITH days AS (
            SELECT generate_series(%L::date, %L::date, '1 day'::interval)::date AS d
        ),
        signups AS (
            SELECT date(p.created_at) AS d, count(*) AS c
            FROM public.profiles p
            WHERE p.created_at >= %L::date AND p.created_at < (%L::date + interval '1 day') %s
            GROUP BY 1
        ),
        joined AS (
            SELECT d.d, COALESCE(s.c, 0) AS c
            FROM days d LEFT JOIN signups s USING (d)
        ),
        cumulative AS (
            SELECT d, c, sum(c) OVER (ORDER BY d) AS cum
            FROM joined
        )
        SELECT jsonb_agg(jsonb_build_object('date', d, 'count', c, 'cumulative', cum) ORDER BY d)
        FROM cumulative
        $q$,
        p_start, p_end, p_start, p_end, v_filter_sql
    );
    EXECUTE v_sql INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =====================================================================
-- admin_engagement_metrics — registered_at instead of created_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_engagement_metrics(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_dau int; v_wau int; v_mau int;
    v_messages int; v_tests int; v_matches int; v_events int;
    v_total_users int; v_verified int; v_completed_test int; v_first_match int; v_first_message int;
BEGIN
    PERFORM public._admin_required();
    SELECT count(DISTINCT user_id) INTO v_dau FROM (
        SELECT sender_id AS user_id FROM public.messages WHERE created_at >= date_trunc('day', v_now)
        UNION ALL SELECT user_id FROM public.roommate_matches WHERE created_at >= date_trunc('day', v_now)
        UNION ALL SELECT user_id FROM public.vocational_results WHERE created_at >= date_trunc('day', v_now)
    ) u WHERE user_id IS NOT NULL;
    SELECT count(DISTINCT user_id) INTO v_wau FROM (
        SELECT sender_id AS user_id FROM public.messages WHERE created_at >= v_now - interval '7 days'
        UNION ALL SELECT user_id FROM public.roommate_matches WHERE created_at >= v_now - interval '7 days'
        UNION ALL SELECT user_id FROM public.vocational_results WHERE created_at >= v_now - interval '7 days'
    ) u WHERE user_id IS NOT NULL;
    SELECT count(DISTINCT user_id) INTO v_mau FROM (
        SELECT sender_id AS user_id FROM public.messages WHERE created_at >= v_now - interval '30 days'
        UNION ALL SELECT user_id FROM public.roommate_matches WHERE created_at >= v_now - interval '30 days'
        UNION ALL SELECT user_id FROM public.vocational_results WHERE created_at >= v_now - interval '30 days'
    ) u WHERE user_id IS NOT NULL;
    SELECT count(*) INTO v_messages FROM public.messages WHERE created_at >= v_now - interval '7 days';
    SELECT count(*) INTO v_tests FROM public.vocational_results WHERE created_at >= v_now - interval '30 days';
    SELECT count(*) INTO v_matches FROM public.roommate_matches WHERE created_at >= v_now - interval '30 days';
    SELECT count(*) INTO v_events FROM public.event_participants WHERE registered_at >= v_now - interval '30 days';
    SELECT count(*) INTO v_total_users FROM public.profiles WHERE is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_verified FROM public.profiles WHERE student_email_verified = true AND is_discarded IS NOT TRUE;
    SELECT count(DISTINCT user_id) INTO v_completed_test FROM public.vocational_results;
    SELECT count(DISTINCT user_id) INTO v_first_match FROM public.roommate_matches;
    SELECT count(DISTINCT sender_id) INTO v_first_message FROM public.messages;
    RETURN jsonb_build_object(
        'period_days', p_range_days, 'dau', v_dau, 'wau', v_wau, 'mau', v_mau,
        'dau_mau_ratio', CASE WHEN v_mau > 0 THEN round(100.0 * v_dau / v_mau, 1) ELSE 0 END,
        'messages_sent_7d', v_messages, 'vocational_tests_completed_30d', v_tests,
        'roommate_matches_made_30d', v_matches, 'events_joined_30d', v_events,
        'engagement_funnel', jsonb_build_object(
            'signup', v_total_users, 'verified_email', v_verified,
            'completed_vocational', v_completed_test, 'first_match', v_first_match, 'first_message', v_first_message
        ),
        'generated_at', v_now
    );
END;
$$;

-- =====================================================================
-- admin_content_inventory — events.start_date (not start_at)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_content_inventory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_universities int; v_careers int;
    v_scholarships_total int; v_scholarships_active int;
    v_accommodations_total int; v_accommodations_by_type jsonb;
    v_leisure_total int; v_leisure_by_type jsonb;
    v_events_upcoming int; v_events_past int;
    v_news_total int;
BEGIN
    PERFORM public._admin_required();
    SELECT count(*) INTO v_universities FROM public.universities;
    SELECT count(*) INTO v_careers FROM public.careers;
    SELECT count(*) INTO v_scholarships_total FROM public.scholarships;
    SELECT count(*) INTO v_scholarships_active FROM public.scholarships WHERE is_active = true AND (deadline IS NULL OR deadline >= v_now::date);
    SELECT count(*) INTO v_accommodations_total FROM public.accommodations;
    SELECT jsonb_agg(jsonb_build_object('label', t, 'count', c) ORDER BY c DESC) INTO v_accommodations_by_type
    FROM (SELECT COALESCE(type, 'sin_dato') AS t, count(*) AS c FROM public.accommodations GROUP BY 1) x;
    SELECT count(*) INTO v_leisure_total FROM public.leisure_spots;
    SELECT jsonb_agg(jsonb_build_object('label', t, 'count', c) ORDER BY c DESC) INTO v_leisure_by_type
    FROM (SELECT COALESCE(category, 'sin_dato') AS t, count(*) AS c FROM public.leisure_spots GROUP BY 1) x;
    SELECT count(*) INTO v_events_upcoming FROM public.events WHERE start_date >= v_now::date;
    SELECT count(*) INTO v_events_past FROM public.events WHERE start_date < v_now::date;
    SELECT count(*) INTO v_news_total FROM public.news;
    RETURN jsonb_build_object(
        'universities', v_universities, 'careers', v_careers,
        'scholarships', jsonb_build_object('total', v_scholarships_total, 'active', v_scholarships_active),
        'accommodations', jsonb_build_object('total', v_accommodations_total, 'by_type', COALESCE(v_accommodations_by_type, '[]'::jsonb)),
        'leisure_spots', jsonb_build_object('total', v_leisure_total, 'by_type', COALESCE(v_leisure_by_type, '[]'::jsonb)),
        'events', jsonb_build_object('upcoming', v_events_upcoming, 'past', v_events_past),
        'news', v_news_total, 'generated_at', v_now
    );
END;
$$;

-- =====================================================================
-- admin_growth_attribution — signup_source proxy + scanned_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_growth_attribution(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_since timestamptz := v_now - (p_range_days || ' days')::interval;
    v_by_utm_source jsonb; v_by_utm_campaign jsonb; v_by_signup_source jsonb;
    v_qr_scans int; v_conversion numeric;
    v_total_signups int; v_active_after_signup int;
BEGIN
    PERFORM public._admin_required();
    SELECT jsonb_agg(jsonb_build_object('source', src, 'count', c) ORDER BY c DESC) INTO v_by_utm_source
    FROM (SELECT COALESCE(utm_source, 'direct') AS src, count(*) AS c FROM public.profiles
          WHERE created_at >= v_since AND is_discarded IS NOT TRUE GROUP BY 1) t;
    SELECT jsonb_agg(jsonb_build_object('campaign', cmp, 'count', c) ORDER BY c DESC) INTO v_by_utm_campaign
    FROM (SELECT COALESCE(utm_campaign, 'none') AS cmp, count(*) AS c FROM public.profiles
          WHERE created_at >= v_since AND is_discarded IS NOT TRUE AND utm_campaign IS NOT NULL GROUP BY 1) t;
    -- profiles.signup_source doesn't exist in this schema; reuse utm_source as proxy
    v_by_signup_source := v_by_utm_source;
    SELECT count(*) INTO v_qr_scans FROM public.qr_scans WHERE scanned_at >= v_since;
    SELECT count(*) INTO v_total_signups FROM public.profiles WHERE created_at >= v_since AND is_discarded IS NOT TRUE;
    SELECT count(DISTINCT p.id) INTO v_active_after_signup
    FROM public.profiles p
    WHERE p.created_at >= v_since AND p.is_discarded IS NOT TRUE
      AND EXISTS (
          SELECT 1 FROM public.messages m WHERE m.sender_id = p.id AND m.created_at > p.created_at
          UNION SELECT 1 FROM public.vocational_results vr WHERE vr.user_id = p.id
          UNION SELECT 1 FROM public.roommate_matches rm WHERE rm.user_id = p.id
      );
    v_conversion := CASE WHEN v_total_signups > 0 THEN round(100.0 * v_active_after_signup / v_total_signups, 1) ELSE 0 END;
    RETURN jsonb_build_object(
        'period_days', p_range_days,
        'by_utm_source', COALESCE(v_by_utm_source, '[]'::jsonb),
        'by_utm_campaign', COALESCE(v_by_utm_campaign, '[]'::jsonb),
        'by_signup_source', COALESCE(v_by_signup_source, '[]'::jsonb),
        'qr_scans_period', v_qr_scans,
        'signups_period', v_total_signups,
        'active_after_signup', v_active_after_signup,
        'conversion_pct', v_conversion,
        'generated_at', v_now
    );
END;
$$;

-- =====================================================================
-- admin_top_universities — use %s for int placeholders (avoid '20'::int)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_top_universities(
    p_limit int DEFAULT 20,
    p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_filter_sql text := public._profile_filter_sql(p_filters);
    v_result jsonb;
    v_total int;
BEGIN
    PERFORM public._admin_required();
    EXECUTE format('SELECT count(*) FROM public.profiles p WHERE p.university_id IS NOT NULL %s', v_filter_sql) INTO v_total;
    EXECUTE format($q$
        SELECT jsonb_agg(t ORDER BY t.user_count DESC)
        FROM (
            SELECT u.id, u.name, u.short_name, u.city, u.comunidad_autonoma,
                count(p.*)::int AS user_count,
                CASE WHEN %s > 0 THEN round(100.0 * count(p.*) / %s, 2) ELSE 0 END AS pct_of_total
            FROM public.universities u
            JOIN public.profiles p ON p.university_id = u.id
            WHERE 1=1 %s
            GROUP BY u.id, u.name, u.short_name, u.city, u.comunidad_autonoma
            ORDER BY count(p.*) DESC LIMIT %s
        ) t
    $q$, v_total::text, v_total::text, v_filter_sql, p_limit::text) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =====================================================================
-- admin_top_careers — simpler ranking without missing columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_top_careers(
    p_limit int DEFAULT 20,
    p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_filter_sql text := public._profile_filter_sql(p_filters);
    v_result jsonb;
BEGIN
    PERFORM public._admin_required();
    EXECUTE format($q$
        WITH desired AS (
            SELECT p.desired_career_id AS career_id, count(*) AS n
            FROM public.profiles p WHERE p.desired_career_id IS NOT NULL %s
            GROUP BY p.desired_career_id
        )
        SELECT jsonb_agg(t ORDER BY t.score DESC)
        FROM (
            SELECT
                d.career_id,
                cr.name,
                cr.branch,
                d.n AS desired_count,
                0 AS recommended_count,
                d.n AS score
            FROM desired d
            LEFT JOIN public.careers cr ON cr.id = d.career_id
            WHERE cr.id IS NOT NULL
            ORDER BY d.n DESC LIMIT %s
        ) t
    $q$, v_filter_sql, p_limit::text) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =====================================================================
-- admin_top_cities — use %s for int placeholders
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_top_cities(
    p_limit int DEFAULT 20,
    p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_filter_sql text := public._profile_filter_sql(p_filters);
    v_result jsonb;
BEGIN
    PERFORM public._admin_required();
    EXECUTE format($q$
        WITH user_cities AS (
            SELECT COALESCE(p.city, 'sin_dato') AS city, count(*) AS user_count
            FROM public.profiles p WHERE 1=1 %s GROUP BY 1
        ),
        accommodation_cities AS (
            SELECT COALESCE(a.city, 'sin_dato') AS city, count(*) AS accommodation_count
            FROM public.accommodations a GROUP BY 1
        )
        SELECT jsonb_agg(t ORDER BY t.user_count DESC)
        FROM (
            SELECT u.city, u.user_count, COALESCE(a.accommodation_count, 0) AS accommodation_count
            FROM user_cities u LEFT JOIN accommodation_cities a USING (city)
            ORDER BY u.user_count DESC LIMIT %s
        ) t
    $q$, v_filter_sql, p_limit::text) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
