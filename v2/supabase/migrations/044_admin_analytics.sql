-- 044 — Admin analytics RPCs
--
-- One SQL file with 11 SECURITY DEFINER functions powering the admin
-- analytics dashboard. Each function:
--   - validates `is_admin()` at the top → 'forbidden' exception otherwise
--   - returns jsonb so the API layer just passes it through
--   - is exposed to `authenticated` (the admin check is inside, not via GRANT)
--
-- Filters are passed as a single jsonb to keep signatures stable while we
-- add filter dimensions over time. Recognised keys:
--   { comunidad: text[], city: text[], university: uuid[], gender: text[],
--     age_bucket: text[], student_type: text[], year: int[],
--     since: timestamptz, until: timestamptz }
--
-- The pricing JSON in admin_monetization_summary() mirrors lib/pricing.ts.

-- =====================================================================
-- Internal helpers
-- =====================================================================

CREATE OR REPLACE FUNCTION public._admin_required()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING HINT = 'admin role required';
    END IF;
END;
$$;

-- Build the WHERE fragment from a filters jsonb. Returns a text snippet
-- suitable for embedding after WHERE 1=1 in dynamic SQL. Always returns
-- something safe (empty string at worst).
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
    IF p_filters IS NULL OR p_filters = '{}'::jsonb THEN
        RETURN '';
    END IF;

    -- comunidad: text[]
    IF jsonb_array_length(p_filters -> 'comunidad') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'comunidad') AS value INTO v_arr;
        v_clauses := v_clauses || ('p.comunidad_autonoma IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    -- city: text[]
    IF jsonb_array_length(p_filters -> 'city') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'city') AS value INTO v_arr;
        v_clauses := v_clauses || ('p.city IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    -- university: uuid[]
    IF jsonb_array_length(p_filters -> 'university') > 0 THEN
        SELECT array_agg(value::uuid) FROM jsonb_array_elements_text(p_filters -> 'university') AS value INTO v_uuids;
        v_clauses := v_clauses || ('p.university_id = ANY(' || quote_literal(v_uuids::text) || '::uuid[])');
    END IF;

    -- gender: text[]
    IF jsonb_array_length(p_filters -> 'gender') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'gender') AS value INTO v_arr;
        v_clauses := v_clauses || ('p.gender IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    -- student_type: text[]
    IF jsonb_array_length(p_filters -> 'student_type') > 0 THEN
        SELECT array_agg(quote_literal(value)) FROM jsonb_array_elements_text(p_filters -> 'student_type') AS value INTO v_arr;
        v_clauses := v_clauses || ('p.student_type IN (' || array_to_string(v_arr, ',') || ')');
    END IF;

    -- year: int[] (university_course)
    IF jsonb_array_length(p_filters -> 'year') > 0 THEN
        SELECT array_agg((value)::int) FROM jsonb_array_elements_text(p_filters -> 'year') AS value INTO v_ints;
        v_clauses := v_clauses || ('p.university_course = ANY(' || quote_literal(v_ints::text) || '::int[])');
    END IF;

    -- age_bucket: text[] (e.g. ['18-21','22-25'])
    IF jsonb_array_length(p_filters -> 'age_bucket') > 0 THEN
        DECLARE
            v_age_clauses text[] := ARRAY[]::text[];
            v_bucket text;
        BEGIN
            FOR v_bucket IN SELECT jsonb_array_elements_text(p_filters -> 'age_bucket') LOOP
                IF v_bucket = '<18' THEN
                    v_age_clauses := v_age_clauses || 'date_part(''year'', age(p.birth_date)) < 18';
                ELSIF v_bucket = '18-21' THEN
                    v_age_clauses := v_age_clauses || 'date_part(''year'', age(p.birth_date)) BETWEEN 18 AND 21';
                ELSIF v_bucket = '22-25' THEN
                    v_age_clauses := v_age_clauses || 'date_part(''year'', age(p.birth_date)) BETWEEN 22 AND 25';
                ELSIF v_bucket = '26-30' THEN
                    v_age_clauses := v_age_clauses || 'date_part(''year'', age(p.birth_date)) BETWEEN 26 AND 30';
                ELSIF v_bucket = '30+' THEN
                    v_age_clauses := v_age_clauses || 'date_part(''year'', age(p.birth_date)) > 30';
                END IF;
            END LOOP;
            IF array_length(v_age_clauses, 1) > 0 THEN
                v_clauses := v_clauses || ('(' || array_to_string(v_age_clauses, ' OR ') || ')');
            END IF;
        END;
    END IF;

    -- since / until on created_at
    IF p_filters ? 'since' THEN
        v_clauses := v_clauses || ('p.created_at >= ' || quote_literal(p_filters ->> 'since') || '::timestamptz');
    END IF;
    IF p_filters ? 'until' THEN
        v_clauses := v_clauses || ('p.created_at < ' || quote_literal(p_filters ->> 'until') || '::timestamptz');
    END IF;

    -- Always exclude soft-deleted from analytics by default (admin can opt-in).
    IF (p_filters ->> 'include_discarded')::boolean IS NOT TRUE THEN
        v_clauses := v_clauses || 'p.is_discarded IS NOT TRUE';
    END IF;

    IF array_length(v_clauses, 1) IS NULL THEN
        RETURN '';
    END IF;
    RETURN ' AND ' || array_to_string(v_clauses, ' AND ');
END;
$$;

-- =====================================================================
-- 1) admin_kpis_summary(p_range_days)
-- =====================================================================
-- Quick overview: totals + deltas vs the previous period of equal length.

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
    v_total_users int;
    v_total_users_prev int;
    v_new_signups_today int;
    v_new_signups_period int;
    v_new_signups_prev_period int;
    v_total_propietarios int;
    v_total_premium int;
    v_total_student int;
    v_total_business int;
    v_verified_students int;
    v_pending_reports int;
    v_incidents_24h int;
    v_mrr numeric := 0;
    v_arr numeric := 0;
BEGIN
    PERFORM public._admin_required();

    SELECT count(*) INTO v_total_users
    FROM public.profiles
    WHERE is_discarded IS NOT TRUE;

    SELECT count(*) INTO v_total_users_prev
    FROM public.profiles
    WHERE is_discarded IS NOT TRUE
      AND created_at < v_period_start;

    SELECT count(*) INTO v_new_signups_today
    FROM public.profiles
    WHERE created_at >= date_trunc('day', v_now)
      AND is_discarded IS NOT TRUE;

    SELECT count(*) INTO v_new_signups_period
    FROM public.profiles
    WHERE created_at >= v_period_start
      AND is_discarded IS NOT TRUE;

    SELECT count(*) INTO v_new_signups_prev_period
    FROM public.profiles
    WHERE created_at >= v_prev_start
      AND created_at < v_period_start
      AND is_discarded IS NOT TRUE;

    SELECT count(*) INTO v_total_propietarios
    FROM public.profiles
    WHERE role = 'propietario' AND is_discarded IS NOT TRUE;

    SELECT count(*) INTO v_total_premium
    FROM public.subscriptions
    WHERE plan = 'premium' AND status IN ('active', 'trialing');

    SELECT count(*) INTO v_total_student
    FROM public.subscriptions
    WHERE plan = 'student' AND status IN ('active', 'trialing');

    SELECT count(*) INTO v_total_business
    FROM public.business_subscriptions
    WHERE status IN ('active', 'trialing');

    SELECT count(*) INTO v_verified_students
    FROM public.profiles
    WHERE student_email_verified = true AND is_discarded IS NOT TRUE;

    SELECT count(*) INTO v_pending_reports
    FROM public.user_reports
    WHERE status = 'pending';

    SELECT count(*) INTO v_incidents_24h
    FROM public.security_incidents
    WHERE created_at >= v_now - interval '24 hours';

    -- Best-effort MRR: ARR-aware estimate from active subs.
    -- Yearly: end - start ≈ 365d → divide price/12 (set by caller in monetization RPC).
    -- For kpis_summary we use a simple proxy: count × monthly_eq from PRICING constants.
    -- (These should match lib/pricing.ts but are duplicated here to make the
    -- function self-contained for the Overview KPI card. Exact MRR is in
    -- admin_monetization_summary which receives pricing as a param.)
    v_mrr :=
        (v_total_student * 4.99) +
        (v_total_premium * 9.99) +
        (v_total_business * 9.99);
    v_arr := v_mrr * 12;

    RETURN jsonb_build_object(
        'period_days', p_range_days,
        'total_users', v_total_users,
        'total_users_prev', v_total_users_prev,
        'new_signups_today', v_new_signups_today,
        'new_signups_period', v_new_signups_period,
        'new_signups_prev_period', v_new_signups_prev_period,
        'total_propietarios', v_total_propietarios,
        'total_premium', v_total_premium,
        'total_student', v_total_student,
        'total_business', v_total_business,
        'mrr_estimate', v_mrr,
        'arr_estimate', v_arr,
        'verified_students', v_verified_students,
        'pending_reports', v_pending_reports,
        'security_incidents_24h', v_incidents_24h,
        'generated_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_kpis_summary(int) TO authenticated;

-- =====================================================================
-- 2) admin_signups_daily(p_start, p_end, p_filters)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_signups_daily(
    p_start date,
    p_end date,
    p_filters jsonb DEFAULT '{}'::jsonb
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
            WHERE p.created_at >= %L::date
              AND p.created_at < (%L::date + interval '1 day')
              %s
            GROUP BY 1
        )
        SELECT jsonb_agg(
            jsonb_build_object(
                'date', d.d,
                'count', COALESCE(s.c, 0),
                'cumulative', sum(COALESCE(s.c, 0)) OVER (ORDER BY d.d)
            )
            ORDER BY d.d
        )
        FROM days d
        LEFT JOIN signups s USING (d)
        $q$,
        p_start, p_end, p_start, p_end, v_filter_sql
    );

    EXECUTE v_sql INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_signups_daily(date, date, jsonb) TO authenticated;

-- =====================================================================
-- 3) admin_users_demographics(p_filters)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_users_demographics(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_filter_sql text := public._profile_filter_sql(p_filters);
    v_by_gender jsonb;
    v_by_age jsonb;
    v_by_comunidad jsonb;
    v_by_student_type jsonb;
    v_by_year jsonb;
    v_by_intent jsonb;
    v_total int;
BEGIN
    PERFORM public._admin_required();

    -- Total population for percentages
    EXECUTE format(
        'SELECT count(*) FROM public.profiles p WHERE 1=1 %s', v_filter_sql
    ) INTO v_total;

    -- Gender
    EXECUTE format($q$
        SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY c DESC)
        FROM (
            SELECT COALESCE(p.gender, 'sin_dato') AS label, count(*) AS c
            FROM public.profiles p
            WHERE 1=1 %s
            GROUP BY 1
        ) t
    $q$, v_filter_sql) INTO v_by_gender;

    -- Age buckets
    EXECUTE format($q$
        SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY ord)
        FROM (
            SELECT
                CASE
                    WHEN p.birth_date IS NULL THEN 'sin_dato'
                    WHEN date_part('year', age(p.birth_date)) < 18 THEN '<18'
                    WHEN date_part('year', age(p.birth_date)) BETWEEN 18 AND 21 THEN '18-21'
                    WHEN date_part('year', age(p.birth_date)) BETWEEN 22 AND 25 THEN '22-25'
                    WHEN date_part('year', age(p.birth_date)) BETWEEN 26 AND 30 THEN '26-30'
                    ELSE '30+'
                END AS label,
                CASE
                    WHEN p.birth_date IS NULL THEN 99
                    WHEN date_part('year', age(p.birth_date)) < 18 THEN 0
                    WHEN date_part('year', age(p.birth_date)) BETWEEN 18 AND 21 THEN 1
                    WHEN date_part('year', age(p.birth_date)) BETWEEN 22 AND 25 THEN 2
                    WHEN date_part('year', age(p.birth_date)) BETWEEN 26 AND 30 THEN 3
                    ELSE 4
                END AS ord,
                count(*) AS c
            FROM public.profiles p
            WHERE 1=1 %s
            GROUP BY 1, 2
            ORDER BY 2
        ) t
    $q$, v_filter_sql) INTO v_by_age;

    -- Comunidad
    EXECUTE format($q$
        SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY c DESC)
        FROM (
            SELECT COALESCE(p.comunidad_autonoma, 'sin_dato') AS label, count(*) AS c
            FROM public.profiles p
            WHERE 1=1 %s
            GROUP BY 1
        ) t
    $q$, v_filter_sql) INTO v_by_comunidad;

    -- Student type
    EXECUTE format($q$
        SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY c DESC)
        FROM (
            SELECT COALESCE(p.student_type, 'sin_dato') AS label, count(*) AS c
            FROM public.profiles p
            WHERE 1=1 %s
            GROUP BY 1
        ) t
    $q$, v_filter_sql) INTO v_by_student_type;

    -- University course (year)
    EXECUTE format($q$
        SELECT jsonb_agg(jsonb_build_object('label', label, 'count', c) ORDER BY label::text)
        FROM (
            SELECT COALESCE(p.university_course::text, 'sin_dato') AS label, count(*) AS c
            FROM public.profiles p
            WHERE 1=1 %s
            GROUP BY 1
        ) t
    $q$, v_filter_sql) INTO v_by_year;

    -- Intent (housing / roommate / propietario)
    EXECUTE format($q$
        SELECT jsonb_build_object(
            'looking_housing', sum(CASE WHEN p.looking_for_housing = true THEN 1 ELSE 0 END),
            'looking_roommate', sum(CASE WHEN p.looking_for_roommate = true THEN 1 ELSE 0 END),
            'is_propietario', sum(CASE WHEN p.role = 'propietario' THEN 1 ELSE 0 END),
            'student_verified', sum(CASE WHEN p.student_email_verified = true THEN 1 ELSE 0 END)
        )
        FROM public.profiles p
        WHERE 1=1 %s
    $q$, v_filter_sql) INTO v_by_intent;

    RETURN jsonb_build_object(
        'total', v_total,
        'by_gender', COALESCE(v_by_gender, '[]'::jsonb),
        'by_age_bucket', COALESCE(v_by_age, '[]'::jsonb),
        'by_comunidad', COALESCE(v_by_comunidad, '[]'::jsonb),
        'by_student_type', COALESCE(v_by_student_type, '[]'::jsonb),
        'by_year', COALESCE(v_by_year, '[]'::jsonb),
        'by_intent', COALESCE(v_by_intent, '{}'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_users_demographics(jsonb) TO authenticated;

-- =====================================================================
-- 4) admin_top_universities(p_limit, p_filters)
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

    EXECUTE format(
        'SELECT count(*) FROM public.profiles p WHERE p.university_id IS NOT NULL %s', v_filter_sql
    ) INTO v_total;

    EXECUTE format($q$
        SELECT jsonb_agg(t ORDER BY t.user_count DESC)
        FROM (
            SELECT
                u.id,
                u.name,
                u.short_name,
                u.city,
                u.comunidad_autonoma,
                count(p.*)::int AS user_count,
                CASE WHEN %L::int > 0 THEN round(100.0 * count(p.*) / %L::int, 2) ELSE 0 END AS pct_of_total
            FROM public.universities u
            JOIN public.profiles p ON p.university_id = u.id
            WHERE 1=1 %s
            GROUP BY u.id, u.name, u.short_name, u.city, u.comunidad_autonoma
            ORDER BY count(p.*) DESC
            LIMIT %L
        ) t
    $q$, v_total, v_total, v_filter_sql, p_limit) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_top_universities(int, jsonb) TO authenticated;

-- =====================================================================
-- 5) admin_top_careers(p_limit, p_filters)
-- =====================================================================
-- Combines two signals:
--   a) profiles.desired_career_id (what users *want* to study)
--   b) vocational_results.top_careers (what the AI recommended in tests)
-- Weighted score: desired counts ×2, recommendations ×1.

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
            FROM public.profiles p
            WHERE p.desired_career_id IS NOT NULL
              %s
            GROUP BY p.desired_career_id
        ),
        recommended AS (
            SELECT (career ->> 'career_id')::uuid AS career_id, count(*) AS n
            FROM public.vocational_results vr
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(vr.top_careers, '[]'::jsonb)) AS career
            WHERE (career ->> 'career_id') IS NOT NULL
              AND (career ->> 'career_id') ~ '^[0-9a-f]{8}-'
            GROUP BY 1
        ),
        combined AS (
            SELECT
                COALESCE(d.career_id, r.career_id) AS career_id,
                COALESCE(d.n, 0) AS desired_count,
                COALESCE(r.n, 0) AS recommended_count,
                COALESCE(d.n, 0) * 2 + COALESCE(r.n, 0) AS score
            FROM desired d
            FULL OUTER JOIN recommended r ON d.career_id = r.career_id
        )
        SELECT jsonb_agg(t ORDER BY t.score DESC)
        FROM (
            SELECT
                c.career_id,
                cr.name,
                cr.branch,
                cr.cut_off_score,
                cr.employment_rate,
                comb.desired_count,
                comb.recommended_count,
                comb.score
            FROM combined comb
            LEFT JOIN public.careers cr ON cr.id = comb.career_id
            CROSS JOIN LATERAL (SELECT comb.career_id) c
            WHERE cr.id IS NOT NULL
            ORDER BY comb.score DESC
            LIMIT %L
        ) t
    $q$, v_filter_sql, p_limit) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_top_careers(int, jsonb) TO authenticated;

-- =====================================================================
-- 6) admin_top_cities(p_limit, p_filters)
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
            FROM public.profiles p
            WHERE 1=1 %s
            GROUP BY 1
        ),
        accommodation_cities AS (
            SELECT COALESCE(a.city, 'sin_dato') AS city, count(*) AS accommodation_count
            FROM public.accommodations a
            GROUP BY 1
        )
        SELECT jsonb_agg(t ORDER BY t.user_count DESC)
        FROM (
            SELECT
                u.city,
                u.user_count,
                COALESCE(a.accommodation_count, 0) AS accommodation_count
            FROM user_cities u
            LEFT JOIN accommodation_cities a USING (city)
            ORDER BY u.user_count DESC
            LIMIT %L
        ) t
    $q$, v_filter_sql, p_limit) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_top_cities(int, jsonb) TO authenticated;

-- =====================================================================
-- 7) admin_engagement_metrics(p_range_days)
-- =====================================================================
-- "Active" user = appears in messages.sender_id OR roommate_matches.user_id
-- OR vocational_results.user_id within the window.

CREATE OR REPLACE FUNCTION public.admin_engagement_metrics(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_dau int;
    v_wau int;
    v_mau int;
    v_messages int;
    v_tests int;
    v_matches int;
    v_events int;
    v_total_users int;
    v_verified int;
    v_completed_test int;
    v_first_match int;
    v_first_message int;
BEGIN
    PERFORM public._admin_required();

    -- DAU (today)
    SELECT count(DISTINCT user_id) INTO v_dau FROM (
        SELECT sender_id AS user_id FROM public.messages WHERE created_at >= date_trunc('day', v_now)
        UNION ALL
        SELECT user_id FROM public.roommate_matches WHERE created_at >= date_trunc('day', v_now)
        UNION ALL
        SELECT user_id FROM public.vocational_results WHERE created_at >= date_trunc('day', v_now)
    ) u WHERE user_id IS NOT NULL;

    -- WAU (last 7d)
    SELECT count(DISTINCT user_id) INTO v_wau FROM (
        SELECT sender_id AS user_id FROM public.messages WHERE created_at >= v_now - interval '7 days'
        UNION ALL
        SELECT user_id FROM public.roommate_matches WHERE created_at >= v_now - interval '7 days'
        UNION ALL
        SELECT user_id FROM public.vocational_results WHERE created_at >= v_now - interval '7 days'
    ) u WHERE user_id IS NOT NULL;

    -- MAU (last 30d)
    SELECT count(DISTINCT user_id) INTO v_mau FROM (
        SELECT sender_id AS user_id FROM public.messages WHERE created_at >= v_now - interval '30 days'
        UNION ALL
        SELECT user_id FROM public.roommate_matches WHERE created_at >= v_now - interval '30 days'
        UNION ALL
        SELECT user_id FROM public.vocational_results WHERE created_at >= v_now - interval '30 days'
    ) u WHERE user_id IS NOT NULL;

    SELECT count(*) INTO v_messages FROM public.messages WHERE created_at >= v_now - interval '7 days';
    SELECT count(*) INTO v_tests FROM public.vocational_results WHERE created_at >= v_now - interval '30 days';
    SELECT count(*) INTO v_matches FROM public.roommate_matches WHERE created_at >= v_now - interval '30 days';
    SELECT count(*) INTO v_events FROM public.event_participants WHERE created_at >= v_now - interval '30 days';

    -- Funnel
    SELECT count(*) INTO v_total_users FROM public.profiles WHERE is_discarded IS NOT TRUE;
    SELECT count(*) INTO v_verified FROM public.profiles WHERE student_email_verified = true AND is_discarded IS NOT TRUE;
    SELECT count(DISTINCT user_id) INTO v_completed_test FROM public.vocational_results;
    SELECT count(DISTINCT user_id) INTO v_first_match FROM public.roommate_matches;
    SELECT count(DISTINCT sender_id) INTO v_first_message FROM public.messages;

    RETURN jsonb_build_object(
        'period_days', p_range_days,
        'dau', v_dau,
        'wau', v_wau,
        'mau', v_mau,
        'dau_mau_ratio', CASE WHEN v_mau > 0 THEN round(100.0 * v_dau / v_mau, 1) ELSE 0 END,
        'messages_sent_7d', v_messages,
        'vocational_tests_completed_30d', v_tests,
        'roommate_matches_made_30d', v_matches,
        'events_joined_30d', v_events,
        'engagement_funnel', jsonb_build_object(
            'signup', v_total_users,
            'verified_email', v_verified,
            'completed_vocational', v_completed_test,
            'first_match', v_first_match,
            'first_message', v_first_message
        ),
        'generated_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_engagement_metrics(int) TO authenticated;

-- =====================================================================
-- 8) admin_monetization_summary(p_pricing)
-- =====================================================================
-- p_pricing JSON mirrors lib/pricing.ts. Caller provides it so the SSOT
-- stays in app code; this function multiplies counts × prices.

CREATE OR REPLACE FUNCTION public.admin_monetization_summary(p_pricing jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_pro_monthly int;
    v_pro_yearly int;
    v_premium_monthly int;
    v_premium_yearly int;
    v_business_leisure int;
    v_business_housing int;
    v_churn_30d int;
    v_new_subs_30d int;
    v_mrr numeric := 0;
    v_pricing_pro_m numeric;
    v_pricing_pro_y numeric;
    v_pricing_prem_m numeric;
    v_pricing_prem_y numeric;
    v_pricing_biz_l numeric;
    v_pricing_biz_h numeric;
    v_total_paying int;
BEGIN
    PERFORM public._admin_required();

    v_pricing_pro_m := COALESCE((p_pricing #>> '{pro,monthly}')::numeric, 4.99);
    v_pricing_pro_y := COALESCE((p_pricing #>> '{pro,yearly}')::numeric, 39.99);
    v_pricing_prem_m := COALESCE((p_pricing #>> '{premium,monthly}')::numeric, 9.99);
    v_pricing_prem_y := COALESCE((p_pricing #>> '{premium,yearly}')::numeric, 79.99);
    v_pricing_biz_l := COALESCE((p_pricing #>> '{business_leisure,monthly}')::numeric, 9.99);
    v_pricing_biz_h := COALESCE((p_pricing #>> '{business_housing,monthly}')::numeric, 9.99);

    -- Infer monthly vs yearly from current_period_end - start (≈30 days vs ≈365).
    SELECT
        count(*) FILTER (WHERE plan = 'student' AND COALESCE(
            extract(epoch FROM (current_period_end - current_period_start)) / 86400, 30
        ) < 60),
        count(*) FILTER (WHERE plan = 'student' AND COALESCE(
            extract(epoch FROM (current_period_end - current_period_start)) / 86400, 30
        ) >= 60),
        count(*) FILTER (WHERE plan = 'premium' AND COALESCE(
            extract(epoch FROM (current_period_end - current_period_start)) / 86400, 30
        ) < 60),
        count(*) FILTER (WHERE plan = 'premium' AND COALESCE(
            extract(epoch FROM (current_period_end - current_period_start)) / 86400, 30
        ) >= 60)
    INTO v_pro_monthly, v_pro_yearly, v_premium_monthly, v_premium_yearly
    FROM public.subscriptions
    WHERE status IN ('active', 'trialing');

    SELECT count(*) FILTER (WHERE type = 'leisure'),
           count(*) FILTER (WHERE type = 'housing')
    INTO v_business_leisure, v_business_housing
    FROM public.business_subscriptions
    WHERE status IN ('active', 'trialing');

    -- MRR normalized: yearly /12, monthly as-is.
    v_mrr :=
        (v_pro_monthly * v_pricing_pro_m) +
        (v_pro_yearly * v_pricing_pro_y / 12) +
        (v_premium_monthly * v_pricing_prem_m) +
        (v_premium_yearly * v_pricing_prem_y / 12) +
        (v_business_leisure * v_pricing_biz_l) +
        (v_business_housing * v_pricing_biz_h);

    SELECT count(*) INTO v_churn_30d
    FROM public.subscriptions
    WHERE status = 'canceled' AND updated_at >= v_now - interval '30 days';

    SELECT count(*) INTO v_new_subs_30d
    FROM public.subscriptions
    WHERE status IN ('active', 'trialing') AND created_at >= v_now - interval '30 days';

    v_total_paying := v_pro_monthly + v_pro_yearly + v_premium_monthly + v_premium_yearly + v_business_leisure + v_business_housing;

    RETURN jsonb_build_object(
        'active_subscriptions', jsonb_build_object(
            'pro_monthly', v_pro_monthly,
            'pro_yearly', v_pro_yearly,
            'premium_monthly', v_premium_monthly,
            'premium_yearly', v_premium_yearly,
            'business_leisure', v_business_leisure,
            'business_housing', v_business_housing,
            'total_paying', v_total_paying
        ),
        'mrr_normalized', round(v_mrr, 2),
        'arr_estimate', round(v_mrr * 12, 2),
        'churn_30d', v_churn_30d,
        'new_subscriptions_30d', v_new_subs_30d,
        'avg_revenue_per_paying_user', CASE WHEN v_total_paying > 0 THEN round(v_mrr / v_total_paying, 2) ELSE 0 END,
        'generated_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_monetization_summary(jsonb) TO authenticated;

-- =====================================================================
-- 9) admin_content_inventory()
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_content_inventory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_universities int;
    v_careers int;
    v_scholarships_total int;
    v_scholarships_active int;
    v_accommodations_total int;
    v_accommodations_by_type jsonb;
    v_leisure_total int;
    v_leisure_by_type jsonb;
    v_events_upcoming int;
    v_events_past int;
    v_news_total int;
BEGIN
    PERFORM public._admin_required();

    SELECT count(*) INTO v_universities FROM public.universities;
    SELECT count(*) INTO v_careers FROM public.careers;

    SELECT count(*) INTO v_scholarships_total FROM public.scholarships;
    SELECT count(*) INTO v_scholarships_active FROM public.scholarships
        WHERE is_active = true AND (deadline IS NULL OR deadline >= v_now::date);

    SELECT count(*) INTO v_accommodations_total FROM public.accommodations;
    SELECT jsonb_agg(jsonb_build_object('label', t, 'count', c) ORDER BY c DESC)
    INTO v_accommodations_by_type
    FROM (
        SELECT COALESCE(type, 'sin_dato') AS t, count(*) AS c
        FROM public.accommodations GROUP BY 1
    ) x;

    SELECT count(*) INTO v_leisure_total FROM public.leisure_spots;
    SELECT jsonb_agg(jsonb_build_object('label', t, 'count', c) ORDER BY c DESC)
    INTO v_leisure_by_type
    FROM (
        SELECT COALESCE(category, 'sin_dato') AS t, count(*) AS c
        FROM public.leisure_spots GROUP BY 1
    ) x;

    SELECT count(*) INTO v_events_upcoming FROM public.events WHERE start_at >= v_now;
    SELECT count(*) INTO v_events_past FROM public.events WHERE start_at < v_now;

    SELECT count(*) INTO v_news_total FROM public.news;

    RETURN jsonb_build_object(
        'universities', v_universities,
        'careers', v_careers,
        'scholarships', jsonb_build_object('total', v_scholarships_total, 'active', v_scholarships_active),
        'accommodations', jsonb_build_object('total', v_accommodations_total, 'by_type', COALESCE(v_accommodations_by_type, '[]'::jsonb)),
        'leisure_spots', jsonb_build_object('total', v_leisure_total, 'by_type', COALESCE(v_leisure_by_type, '[]'::jsonb)),
        'events', jsonb_build_object('upcoming', v_events_upcoming, 'past', v_events_past),
        'news', v_news_total,
        'generated_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_content_inventory() TO authenticated;

-- =====================================================================
-- 10) admin_security_summary(p_range_days)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_security_summary(p_range_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := now();
    v_since timestamptz := v_now - (p_range_days || ' days')::interval;
    v_by_kind jsonb;
    v_by_severity jsonb;
    v_csp_24h int;
    v_csp_top jsonb;
    v_admin_actions_7d int;
    v_unique_attacker_ips int;
BEGIN
    PERFORM public._admin_required();

    SELECT jsonb_agg(jsonb_build_object('kind', kind, 'count', c) ORDER BY c DESC)
    INTO v_by_kind
    FROM (
        SELECT kind, count(*) AS c
        FROM public.security_incidents
        WHERE created_at >= v_since
        GROUP BY kind
    ) t;

    SELECT jsonb_agg(jsonb_build_object('severity', severity, 'count', c) ORDER BY c DESC)
    INTO v_by_severity
    FROM (
        SELECT severity, count(*) AS c
        FROM public.security_incidents
        WHERE created_at >= v_since
        GROUP BY severity
    ) t;

    SELECT count(*) INTO v_csp_24h
    FROM public.csp_violations
    WHERE created_at >= v_now - interval '24 hours';

    SELECT jsonb_agg(jsonb_build_object('blocked_uri', uri, 'count', c) ORDER BY c DESC)
    INTO v_csp_top
    FROM (
        SELECT COALESCE(report ->> 'blocked-uri', report ->> 'blockedURI', 'unknown') AS uri,
               count(*) AS c
        FROM public.csp_violations
        WHERE created_at >= v_since
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 10
    ) t;

    SELECT count(*) INTO v_admin_actions_7d
    FROM public.admin_actions
    WHERE created_at >= v_now - interval '7 days';

    SELECT count(DISTINCT ip_hash) INTO v_unique_attacker_ips
    FROM public.security_incidents
    WHERE created_at >= v_since AND ip_hash IS NOT NULL;

    RETURN jsonb_build_object(
        'period_days', p_range_days,
        'incidents_by_kind', COALESCE(v_by_kind, '[]'::jsonb),
        'incidents_by_severity', COALESCE(v_by_severity, '[]'::jsonb),
        'csp_violations_24h', v_csp_24h,
        'csp_top_blocked', COALESCE(v_csp_top, '[]'::jsonb),
        'admin_actions_7d', v_admin_actions_7d,
        'unique_attacker_ips', v_unique_attacker_ips,
        'generated_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_security_summary(int) TO authenticated;

-- =====================================================================
-- 11) admin_growth_attribution(p_range_days)
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
    v_by_utm_source jsonb;
    v_by_utm_campaign jsonb;
    v_by_signup_source jsonb;
    v_qr_scans int;
    v_conversion numeric;
    v_total_signups int;
    v_active_after_signup int;
BEGIN
    PERFORM public._admin_required();

    SELECT jsonb_agg(jsonb_build_object('source', src, 'count', c) ORDER BY c DESC)
    INTO v_by_utm_source
    FROM (
        SELECT COALESCE(utm_source, 'direct') AS src, count(*) AS c
        FROM public.profiles
        WHERE created_at >= v_since AND is_discarded IS NOT TRUE
        GROUP BY 1
    ) t;

    SELECT jsonb_agg(jsonb_build_object('campaign', cmp, 'count', c) ORDER BY c DESC)
    INTO v_by_utm_campaign
    FROM (
        SELECT COALESCE(utm_campaign, 'none') AS cmp, count(*) AS c
        FROM public.profiles
        WHERE created_at >= v_since AND is_discarded IS NOT TRUE AND utm_campaign IS NOT NULL
        GROUP BY 1
    ) t;

    SELECT jsonb_agg(jsonb_build_object('source', src, 'count', c) ORDER BY c DESC)
    INTO v_by_signup_source
    FROM (
        SELECT COALESCE(signup_source, 'unknown') AS src, count(*) AS c
        FROM public.profiles
        WHERE created_at >= v_since AND is_discarded IS NOT TRUE
        GROUP BY 1
    ) t;

    SELECT count(*) INTO v_qr_scans
    FROM public.qr_scans
    WHERE created_at >= v_since;

    SELECT count(*) INTO v_total_signups
    FROM public.profiles
    WHERE created_at >= v_since AND is_discarded IS NOT TRUE;

    -- "Active after signup" = signed up in the period AND has at least one
    -- message OR vocational result OR roommate match afterwards.
    SELECT count(DISTINCT p.id) INTO v_active_after_signup
    FROM public.profiles p
    WHERE p.created_at >= v_since
      AND p.is_discarded IS NOT TRUE
      AND EXISTS (
          SELECT 1 FROM public.messages m WHERE m.sender_id = p.id AND m.created_at > p.created_at
          UNION
          SELECT 1 FROM public.vocational_results vr WHERE vr.user_id = p.id
          UNION
          SELECT 1 FROM public.roommate_matches rm WHERE rm.user_id = p.id
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

GRANT EXECUTE ON FUNCTION public.admin_growth_attribution(int) TO authenticated;

-- =====================================================================
-- Done — 11 RPCs, all SECURITY DEFINER + admin-gated.
-- =====================================================================
