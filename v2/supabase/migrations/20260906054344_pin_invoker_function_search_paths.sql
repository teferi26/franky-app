-- Pin reviewed PL/pgSQL invoker functions without recreating bodies or ACL.
-- SQL helpers remain unchanged: SET disables SQL inlining and regressed the
-- Roomie microbenchmark from 9 ms to 430 ms for 10,000 evaluations.
-- All application objects are schema-qualified; remaining calls use pg_catalog.
ALTER FUNCTION public._profile_filter_sql(p_filters jsonb)
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.accommodations_search_vector_update()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.calculate_compatibility(user1_id uuid, user2_id uuid)
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.cap_accommodation_images()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.cap_accommodation_videos()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.cap_event_photos()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.cap_leisure_images()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.cap_profile_photos()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.handle_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.provincia_de(p_texto text)
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.search_careers(search_query text, filter_branch text, filter_university uuid, filter_comunidad text, min_score numeric, max_score numeric, sort_by text, sort_order text, page_size integer, page_offset integer)
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.sync_discarded_metadata()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.sync_lifestyle_answered_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_business_subscriptions_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_connect_accounts_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_contracts_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_event_shirt_sizes_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_event_tickets_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_noti_prefs_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_owner_subscriptions_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_payments_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_user_keys_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_visit_bookings_updated_at()
  SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_visit_slots_updated_at()
  SET search_path = pg_catalog, pg_temp;
