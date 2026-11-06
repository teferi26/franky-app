-- Preserve existing durations while admitting official fractional programmes.
-- No fixed numeric scale: unsupported precision must fail, never round silently.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) RESTRICT;
ALTER TABLE public.careers
  ALTER COLUMN duration_years TYPE numeric USING duration_years::numeric;
ALTER TABLE public.careers
  ADD CONSTRAINT careers_duration_years_precision CHECK (
    duration_years IS NULL OR (
      duration_years > 0 AND duration_years < 100
      AND duration_years = round(duration_years, 1)
    )
  );

CREATE OR REPLACE FUNCTION public.search_careers(search_query text DEFAULT NULL::text, filter_branch text DEFAULT NULL::text, filter_university uuid DEFAULT NULL::uuid, filter_comunidad text DEFAULT NULL::text, min_score numeric DEFAULT NULL::numeric, max_score numeric DEFAULT NULL::numeric, sort_by text DEFAULT 'cut_off_score'::text, sort_order text DEFAULT 'DESC'::text, page_size integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, branch text, cut_off_score numeric, university_name text, university_slug text, university_city text, university_type text, duration_years numeric, credits integer, places_offered integer, modality text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.branch,
        c.cut_off_score,
        u.name AS university_name,
        u.slug AS university_slug,
        u.city AS university_city,
        u.type AS university_type,
        c.duration_years,
        c.credits,
        c.places_offered,
        c.modality,
        COUNT(*) OVER() AS total_count
    FROM public.careers c
    JOIN public.universities u ON c.university_id = u.id
    WHERE 
        (search_query IS NULL OR c.name ILIKE '%' || search_query || '%' OR u.name ILIKE '%' || search_query || '%')
        AND (filter_branch IS NULL OR c.branch = filter_branch)
        AND (filter_university IS NULL OR c.university_id = filter_university)
        AND (filter_comunidad IS NULL OR u.comunidad_autonoma = filter_comunidad)
        AND (min_score IS NULL OR c.cut_off_score >= min_score)
        AND (max_score IS NULL OR c.cut_off_score <= max_score)
    ORDER BY
        CASE WHEN sort_by = 'cut_off_score' AND sort_order = 'DESC' THEN c.cut_off_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'cut_off_score' AND sort_order = 'ASC' THEN c.cut_off_score END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_order = 'ASC' THEN c.name END ASC,
        CASE WHEN sort_by = 'name' AND sort_order = 'DESC' THEN c.name END DESC,
        c.name ASC
    LIMIT page_size
    OFFSET page_offset;
END;
$function$
;
ALTER FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) TO PUBLIC, postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
