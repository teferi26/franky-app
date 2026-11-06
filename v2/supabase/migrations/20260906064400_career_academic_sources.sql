begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Evidence is tied to the field value; clients must ignore it after an edit
-- changes that value. No existing data, policies or grants are replaced.
alter table public.careers add column academic_sources jsonb;
alter table public.careers add constraint careers_academic_sources_object
  check (academic_sources is null or (
    jsonb_typeof(academic_sources) = 'object'
    and octet_length(academic_sources::text) <= 65536
  ));
comment on column public.careers.academic_sources is
  'Public field-level academic references. Each item records reference_value, checked_at, source title and HTTPS URL. Not a certification of the whole career profile.';
notify pgrst, 'reload schema';
commit;
