-- Preserve the profile -> university object used by installed mobile clients.
-- workspace_university_affiliations introduces a second, many-to-many path:
-- without this explicit relationship PostgREST rejects universities(...) with
-- PGRST201 before evaluating the profile query. No account data is rewritten.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.universities(profile_row public.profiles)
RETURNS SETOF public.universities
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 1
SET search_path = ''
AS $function$
  SELECT university.*
  FROM public.universities AS university
  WHERE university.id = profile_row.university_id
$function$;

REVOKE ALL ON FUNCTION public.universities(public.profiles) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.universities(public.profiles)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.universities(public.profiles) IS
  'Legacy profile university embed. Returns only the selected university under caller privileges and RLS, never affiliation records.';

NOTIFY pgrst, 'reload schema';
