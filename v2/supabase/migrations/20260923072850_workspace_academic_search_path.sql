-- Pin the lookup path of this immutable constant-field helper without changing its body or grants.
ALTER FUNCTION public.workspace_academic_fields(text) SET search_path = pg_catalog, pg_temp;
