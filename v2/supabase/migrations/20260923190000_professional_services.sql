-- New sector engines. Additive/private pilot; does not enable commercial sales.
-- No direct client writes. DEFINER entrypoints resolve current identity, live
-- organization permission and demo cohort; all mutations serialize per organization.
CREATE TABLE public.professional_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK(category IN('hairdresser','beauty','cafe','bar','restaurant','pub','nightclub','sports','sports_facility','academy','culture','coworking')),
 timezone text NOT NULL DEFAULT 'Europe/Madrid', enabled boolean NOT NULL DEFAULT false,
 public_booking boolean NOT NULL DEFAULT false,require_approval boolean NOT NULL DEFAULT false,
 booking_horizon_days integer NOT NULL DEFAULT 90 CHECK(booking_horizon_days BETWEEN 1 AND 90),
 cancellation_hours integer NOT NULL DEFAULT 24 CHECK(cancellation_hours BETWEEN 0 AND 168),
 terms text NOT NULL DEFAULT '' CHECK(length(terms)<=4000),staff_limit integer NOT NULL DEFAULT 3 CHECK(staff_limit BETWEEN 1 AND 100),
 resource_limit integer NOT NULL DEFAULT 20 CHECK(resource_limit BETWEEN 1 AND 500),service_limit integer NOT NULL DEFAULT 50 CHECK(service_limit BETWEEN 1 AND 500),
 sales_enabled boolean NOT NULL DEFAULT false CHECK(NOT sales_enabled),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.professional_resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),kind text NOT NULL CHECK(kind IN('staff','room','equipment','table','court','desk')),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 500),active boolean NOT NULL DEFAULT true,
 CHECK(kind NOT IN('staff','room','equipment','court') OR capacity=1),UNIQUE(organization_id,id)
);
CREATE TABLE public.professional_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),description text NOT NULL DEFAULT '' CHECK(length(description)<=3000),
 mode text NOT NULL CHECK(mode IN('appointment','resource','session','group')),duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 720),
 buffer_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 180),price_cents integer NOT NULL DEFAULT 0 CHECK(price_cents BETWEEN 0 AND 1000000),
 price_basis text NOT NULL DEFAULT 'booking' CHECK(price_basis IN('booking','person')),deposit_cents integer NOT NULL DEFAULT 0 CHECK(deposit_cents BETWEEN 0 AND 1000000),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 500),required_resource_ids uuid[] NOT NULL DEFAULT '{}',staff_required boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,menu text NOT NULL DEFAULT '' CHECK(length(menu)<=4000),version integer NOT NULL DEFAULT 1,
 CHECK(cardinality(required_resource_ids)<=20),CHECK(deposit_cents<=price_cents),UNIQUE(organization_id,id)
);
CREATE TABLE public.professional_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),resource_id uuid,
 weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),start_minute integer NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 end_minute integer NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),CHECK(start_minute<end_minute),
 FOREIGN KEY(organization_id,resource_id) REFERENCES public.professional_resources(organization_id,id)
);
CREATE TABLE public.professional_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),resource_id uuid,
 local_date date NOT NULL,reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500),
 FOREIGN KEY(organization_id,resource_id) REFERENCES public.professional_resources(organization_id,id)
);
CREATE TABLE public.professional_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),service_id uuid NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,blocked_until timestamptz NOT NULL,capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 500),resource_ids uuid[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','cancelled')),series_id uuid,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '12 hours' AND blocked_until>=ends_at),CHECK(cardinality(resource_ids)<=20),
 FOREIGN KEY(organization_id,service_id) REFERENCES public.professional_services(organization_id,id),UNIQUE(organization_id,id)
);
CREATE TABLE public.professional_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 120),
 contact text CHECK(length(contact)<=254),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,user_id),UNIQUE(organization_id,id)
);
CREATE TABLE public.professional_bundles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),customer_id uuid NOT NULL,service_id uuid NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 160),remaining integer NOT NULL DEFAULT 0 CHECK(remaining BETWEEN 0 AND 10000),granted integer NOT NULL DEFAULT 0 CHECK(granted BETWEEN 0 AND 10000),
 FOREIGN KEY(organization_id,customer_id) REFERENCES public.professional_customers(organization_id,id),FOREIGN KEY(organization_id,service_id) REFERENCES public.professional_services(organization_id,id),UNIQUE(organization_id,id)
);
CREATE TABLE public.professional_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),service_id uuid NOT NULL,session_id uuid,customer_id uuid NOT NULL,
 customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,blocked_until timestamptz NOT NULL,
 resource_ids uuid[] NOT NULL DEFAULT '{}',party_size integer NOT NULL CHECK(party_size BETWEEN 1 AND 500),
 status text NOT NULL CHECK(status IN('requested','confirmed','waitlisted','attended','cancelled','no_show')),
 total_cents integer NOT NULL CHECK(total_cents>=0),deposit_cents integer NOT NULL CHECK(deposit_cents BETWEEN 0 AND total_cents),
 deposit_status text NOT NULL CHECK(deposit_status IN('not_required','pending','paid','refunded')),price_snapshot jsonb NOT NULL,
 cancellation_hours integer NOT NULL CHECK(cancellation_hours BETWEEN 0 AND 168),request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),request_hash text NOT NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),attended_at timestamptz,attended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 bundle_id uuid,card_quote_id uuid, reschedule jsonb,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,service_id) REFERENCES public.professional_services(organization_id,id),FOREIGN KEY(organization_id,session_id) REFERENCES public.professional_sessions(organization_id,id),
 FOREIGN KEY(organization_id,customer_id) REFERENCES public.professional_customers(organization_id,id),FOREIGN KEY(organization_id,bundle_id) REFERENCES public.professional_bundles(organization_id,id),
 CHECK(ends_at>starts_at AND blocked_until>=ends_at),UNIQUE(organization_id,created_by,request_key),UNIQUE(organization_id,id)
);
CREATE INDEX professional_bookings_agenda ON public.professional_bookings(organization_id,starts_at);
CREATE INDEX professional_bookings_customer ON public.professional_bookings(customer_user_id,starts_at);
CREATE INDEX professional_bookings_session ON public.professional_bookings(session_id,status,created_at,id);
CREATE TABLE public.professional_bundle_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),bundle_id uuid NOT NULL,
 booking_id uuid,units integer NOT NULL CHECK(units<>0 AND units BETWEEN -10000 AND 10000),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,request_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,bundle_id) REFERENCES public.professional_bundles(organization_id,id),FOREIGN KEY(organization_id,booking_id) REFERENCES public.professional_bookings(organization_id,id),
 UNIQUE(organization_id,request_key)
);
CREATE TABLE public.professional_booking_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,booking_id uuid NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,booking_id) REFERENCES public.professional_bookings(organization_id,id)
);
CREATE TABLE public.professional_write_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 request_key uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,actor_id,request_key)
);
-- Defence in depth: no client table grants, including raw customer/contact rows.
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['professional_settings','professional_resources','professional_services','professional_availability','professional_exceptions','professional_sessions','professional_customers','professional_bundles','professional_bookings','professional_bundle_ledger','professional_booking_history','professional_write_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
 END LOOP;
END $$;

CREATE FUNCTION workspace_private.professional_access(p_org uuid,p_permission text DEFAULT NULL) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_session_usable() AND EXISTS(
 SELECT 1 FROM public.organizations o JOIN public.professional_settings s ON s.organization_id=o.id
 WHERE o.id=p_org AND o.status='active' AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort()
 AND (s.enabled OR o.demo_cohort_id IS NOT NULL)
 AND (CASE WHEN p_permission IS NULL THEN s.public_booking OR public.has_organization_permission(o.id,'resource.read') ELSE public.has_organization_permission(o.id,p_permission) END))
$$;
CREATE FUNCTION workspace_private.professional_require(p_org uuid,p_permission text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';END IF;
 IF NOT workspace_private.professional_access(p_org,p_permission) THEN RAISE EXCEPTION 'professional_unavailable' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION workspace_private.professional_prices(p_category text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('monthly_cents',CASE WHEN p_category IN('cafe','bar') THEN 1900 WHEN p_category IN('hairdresser','beauty','pub','culture') THEN 2900 WHEN p_category='nightclub' THEN 5900 ELSE 3900 END,
 'annual_cents',CASE WHEN p_category IN('cafe','bar') THEN 19000 WHEN p_category IN('hairdresser','beauty','pub','culture') THEN 29000 WHEN p_category='nightclub' THEN 59000 ELSE 39000 END,
 'founder_cents',CASE WHEN p_category IN('cafe','bar') THEN 14900 WHEN p_category IN('hairdresser','beauty','pub','culture') THEN 19900 WHEN p_category='nightclub' THEN 44900 ELSE 29900 END,'currency','EUR','tax_included',false,'sales_enabled',false)
$$;
-- Caller holds organization advisory lock for writes. Read availability is advisory;
-- booking repeats this check under the lock. Existing bookings retain their price.
CREATE FUNCTION workspace_private.professional_slot(p_org uuid,p_start timestamptz,p_end timestamptz,p_resources uuid[],p_party integer,p_ignore uuid DEFAULT NULL,p_ignore_session uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.professional_settings;local_start timestamp;local_end timestamp;r public.professional_resources;minute_start integer;minute_end integer;used integer;point timestamptz;midnight timestamptz;BEGIN
 SELECT * INTO s FROM public.professional_settings WHERE organization_id=p_org;
 IF NOT FOUND OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_resources IS NULL OR p_party<1 THEN RETURN false;END IF;
 local_start:=p_start AT TIME ZONE s.timezone;local_end:=p_end AT TIME ZONE s.timezone;
 IF p_end>p_start+interval '18 hours' THEN RETURN false;END IF;
 IF local_start::date<>local_end::date AND local_end::time<>time '00:00' THEN
  midnight:=(local_start::date+interval '1 day') AT TIME ZONE s.timezone;
  RETURN workspace_private.professional_slot(p_org,p_start,midnight,p_resources,p_party,p_ignore,p_ignore_session) AND workspace_private.professional_slot(p_org,midnight,p_end,p_resources,p_party,p_ignore,p_ignore_session);
 END IF;
 minute_start:=extract(hour FROM local_start)::integer*60+extract(minute FROM local_start)::integer;
 minute_end:=CASE WHEN local_end::date>local_start::date THEN 1440 ELSE extract(hour FROM local_end)::integer*60+extract(minute FROM local_end)::integer END;
 IF NOT EXISTS(SELECT 1 FROM public.professional_availability a WHERE a.organization_id=p_org AND a.resource_id IS NULL AND a.weekday=extract(dow FROM local_start)::integer AND local_start>=local_start::date+a.start_minute*interval '1 minute' AND local_end<=local_start::date+a.end_minute*interval '1 minute')
 OR EXISTS(SELECT 1 FROM public.professional_exceptions e WHERE e.organization_id=p_org AND e.resource_id IS NULL AND e.local_date=local_start::date) THEN RETURN false;END IF;
 IF cardinality(p_resources)<>(SELECT count(DISTINCT id) FROM public.professional_resources WHERE organization_id=p_org AND id=ANY(p_resources) AND active) THEN RETURN false;END IF;
 FOR r IN SELECT * FROM public.professional_resources WHERE organization_id=p_org AND id=ANY(p_resources) LOOP
  IF EXISTS(SELECT 1 FROM public.professional_exceptions e WHERE e.organization_id=p_org AND e.resource_id=r.id AND e.local_date=local_start::date) THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM public.professional_availability a WHERE a.organization_id=p_org AND a.resource_id=r.id) AND NOT EXISTS(SELECT 1 FROM public.professional_availability a WHERE a.organization_id=p_org AND a.resource_id=r.id AND a.weekday=extract(dow FROM local_start)::integer AND local_start>=local_start::date+a.start_minute*interval '1 minute' AND local_end<=local_start::date+a.end_minute*interval '1 minute') THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM public.professional_sessions x WHERE x.organization_id=p_org AND x.status='open' AND r.id=ANY(x.resource_ids) AND x.id IS DISTINCT FROM p_ignore_session AND x.starts_at<p_end AND x.blocked_until>p_start) THEN RETURN false;END IF;
  -- Sweep each overlap start, rather than summing non-concurrent bookings.
  FOR point IN SELECT p_start UNION SELECT greatest(b.starts_at,p_start) FROM public.professional_bookings b WHERE b.organization_id=p_org AND b.id IS DISTINCT FROM p_ignore AND b.session_id IS NULL AND b.status IN('requested','confirmed','attended') AND r.id=ANY(b.resource_ids) AND b.starts_at<p_end AND b.blocked_until>p_start LOOP
   SELECT coalesce(sum(CASE WHEN r.kind IN('staff','equipment','room','court') THEN 1 ELSE b.party_size END),0) INTO used FROM public.professional_bookings b WHERE b.organization_id=p_org AND b.id IS DISTINCT FROM p_ignore AND b.session_id IS NULL AND b.status IN('requested','confirmed','attended') AND r.id=ANY(b.resource_ids) AND b.starts_at<=point AND b.blocked_until>point;
   IF used+(CASE WHEN r.kind IN('staff','equipment','room','court') THEN 1 ELSE p_party END)>r.capacity THEN RETURN false;END IF;
  END LOOP;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION workspace_private.professional_booking_json(p_booking uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (to_jsonb(b)-'request_hash'-'request_key'-'created_by')||jsonb_build_object('customer_name',c.display_name,'service_name',b.price_snapshot->>'service_name') FROM public.professional_bookings b JOIN public.professional_customers c ON c.id=b.customer_id WHERE b.id=p_booking
$$;

CREATE FUNCTION public.professional_save_record(p_organization_id uuid,p_entity text,p_record_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid:=coalesce(p_record_id,gen_random_uuid());cfg public.professional_settings;s public.professional_services;r public.professional_resources;sess public.professional_sessions;v_result jsonb;v_resources uuid[];v_count integer;v_repeat integer;v_start timestamptz;v_end timestamptz;v_series uuid;v_ids uuid[]:='{}';i integer;v_request uuid;v_fingerprint text;prior public.professional_write_requests;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16000 OR p_entity IS NULL THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF NOT public.has_organization_permission(p_organization_id,CASE WHEN p_entity='settings' THEN 'settings.manage' ELSE 'content.manage' END) THEN RAISE EXCEPTION 'professional_forbidden' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND kind IN('leisure','community')) THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 v_request:=(p_data->>'client_request_id')::uuid;v_fingerprint:=md5(jsonb_build_array(p_entity,p_record_id,p_data-'client_request_id')::text);
 IF v_request IS NOT NULL THEN
  SELECT * INTO prior FROM public.professional_write_requests WHERE organization_id=p_organization_id AND actor_id=auth.uid() AND request_key=v_request;
  IF FOUND THEN IF prior.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict';END IF;RETURN prior.result;END IF;
 END IF;
 SELECT * INTO cfg FROM public.professional_settings WHERE organization_id=p_organization_id;
 IF p_entity='settings' THEN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=coalesce(p_data->>'timezone',cfg.timezone,'Europe/Madrid')) THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
  IF cfg.organization_id IS NOT NULL AND p_data ? 'category' AND p_data->>'category'<>cfg.category AND EXISTS(SELECT 1 FROM public.professional_services WHERE organization_id=p_organization_id AND active) THEN RAISE EXCEPTION 'professional_has_bookings';END IF;
  INSERT INTO public.professional_settings(organization_id,category,timezone,public_booking,require_approval,terms,cancellation_hours)
  VALUES(p_organization_id,coalesce(p_data->>'category',cfg.category),coalesce(p_data->>'timezone',cfg.timezone,'Europe/Madrid'),coalesce((p_data->>'public_booking')::boolean,cfg.public_booking,false),coalesce((p_data->>'require_approval')::boolean,cfg.require_approval,false),coalesce(p_data->>'terms',cfg.terms,''),coalesce((p_data->>'cancellation_hours')::integer,cfg.cancellation_hours,24))
  ON CONFLICT(organization_id) DO UPDATE SET category=excluded.category,timezone=excluded.timezone,public_booking=excluded.public_booking,require_approval=excluded.require_approval,terms=excluded.terms,cancellation_hours=excluded.cancellation_hours,updated_at=now() RETURNING to_jsonb(professional_settings) INTO v_result;
 ELSE
  PERFORM workspace_private.professional_require(p_organization_id,'content.manage');
  IF p_entity='resource' THEN
   SELECT * INTO r FROM public.professional_resources WHERE id=p_record_id AND organization_id=p_organization_id;
   IF p_record_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden';END IF;
   IF coalesce((p_data->>'active')::boolean,r.active,true) AND (NOT coalesce(r.active,false) OR (coalesce(p_data->>'kind',r.kind)='staff' AND r.kind<>'staff')) THEN
    SELECT count(*) INTO v_count FROM public.professional_resources WHERE organization_id=p_organization_id AND active;
    IF v_count>=cfg.resource_limit THEN RAISE EXCEPTION 'professional_limit';END IF;
    IF coalesce(p_data->>'kind',r.kind)='staff' AND (SELECT count(*) FROM public.professional_resources WHERE organization_id=p_organization_id AND active AND kind='staff')>=cfg.staff_limit THEN RAISE EXCEPTION 'professional_limit';END IF;
   END IF;
   IF p_record_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.professional_bookings WHERE organization_id=p_organization_id AND v_id=ANY(resource_ids) AND ends_at>now() AND status IN('requested','confirmed')) OR EXISTS(SELECT 1 FROM public.professional_sessions WHERE organization_id=p_organization_id AND v_id=ANY(resource_ids) AND ends_at>now() AND status='open')) AND (p_data ? 'kind' OR p_data ? 'capacity' OR p_data->>'active'='false') THEN RAISE EXCEPTION 'professional_has_bookings';END IF;
   INSERT INTO public.professional_resources(id,organization_id,name,kind,capacity,active) VALUES(v_id,p_organization_id,coalesce(p_data->>'name',r.name),coalesce(p_data->>'kind',r.kind),coalesce((p_data->>'capacity')::integer,r.capacity,1),coalesce((p_data->>'active')::boolean,r.active,true))
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,capacity=excluded.capacity,active=excluded.active RETURNING to_jsonb(professional_resources) INTO v_result;
  ELSIF p_entity='service' THEN
   SELECT * INTO s FROM public.professional_services WHERE id=p_record_id AND organization_id=p_organization_id;
   -- Deposits remain unavailable until a separately verified provider can complete their lifecycle.
   IF coalesce((p_data->>'deposit_cents')::integer,s.deposit_cents,0)>0 THEN RAISE EXCEPTION 'professional_deposits_unavailable';END IF;
   IF p_record_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden';END IF;
   IF coalesce((p_data->>'active')::boolean,s.active,true) AND NOT coalesce(s.active,false) AND (SELECT count(*) FROM public.professional_services WHERE organization_id=p_organization_id AND active)>=cfg.service_limit THEN RAISE EXCEPTION 'professional_limit';END IF;
   SELECT coalesce(array_agg(value::uuid),'{}') INTO v_resources FROM jsonb_array_elements_text(coalesce(p_data->'required_resource_ids',to_jsonb(s.required_resource_ids),'[]'));
   IF cardinality(v_resources)<>(SELECT count(*) FROM public.professional_resources WHERE organization_id=p_organization_id AND active AND id=ANY(v_resources)) THEN RAISE EXCEPTION 'professional_resource_required';END IF;
   INSERT INTO public.professional_services(id,organization_id,name,description,mode,duration_minutes,buffer_minutes,price_cents,price_basis,deposit_cents,capacity,required_resource_ids,staff_required,active,menu)
   VALUES(v_id,p_organization_id,coalesce(p_data->>'name',s.name),coalesce(p_data->>'description',s.description,''),coalesce(p_data->>'mode',s.mode),coalesce((p_data->>'duration_minutes')::integer,s.duration_minutes,30),coalesce((p_data->>'buffer_minutes')::integer,s.buffer_minutes,0),coalesce((p_data->>'price_cents')::integer,s.price_cents,0),coalesce(p_data->>'price_basis',s.price_basis,'booking'),coalesce((p_data->>'deposit_cents')::integer,s.deposit_cents,0),coalesce((p_data->>'capacity')::integer,s.capacity,1),v_resources,coalesce((p_data->>'staff_required')::boolean,s.staff_required,false),coalesce((p_data->>'active')::boolean,s.active,true),coalesce(p_data->>'menu',s.menu,''))
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,mode=excluded.mode,duration_minutes=excluded.duration_minutes,buffer_minutes=excluded.buffer_minutes,price_cents=excluded.price_cents,price_basis=excluded.price_basis,deposit_cents=excluded.deposit_cents,capacity=excluded.capacity,required_resource_ids=excluded.required_resource_ids,staff_required=excluded.staff_required,active=excluded.active,menu=excluded.menu,version=professional_services.version+1 RETURNING to_jsonb(professional_services) INTO v_result;
  ELSIF p_entity='availability' THEN
   IF p_record_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.professional_availability WHERE id=p_record_id AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
   IF p_data->>'delete'='true' THEN DELETE FROM public.professional_availability WHERE id=v_id AND organization_id=p_organization_id;v_result:=jsonb_build_object('id',v_id,'deleted',true);
   ELSE
    IF p_record_id IS NULL AND (SELECT count(*) FROM public.professional_availability WHERE organization_id=p_organization_id)>=300 THEN RAISE EXCEPTION 'professional_limit';END IF;
    INSERT INTO public.professional_availability(id,organization_id,resource_id,weekday,start_minute,end_minute) VALUES(v_id,p_organization_id,(p_data->>'resource_id')::uuid,(p_data->>'weekday')::integer,(p_data->>'start_minute')::integer,(p_data->>'end_minute')::integer)
    ON CONFLICT(id) DO UPDATE SET resource_id=excluded.resource_id,weekday=excluded.weekday,start_minute=excluded.start_minute,end_minute=excluded.end_minute RETURNING to_jsonb(professional_availability) INTO v_result;
   END IF;
  ELSIF p_entity='exception' THEN
   IF p_record_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.professional_exceptions WHERE id=p_record_id AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
   IF p_data->>'delete'='true' THEN DELETE FROM public.professional_exceptions WHERE id=v_id AND organization_id=p_organization_id;v_result:=jsonb_build_object('id',v_id,'deleted',true);
   ELSE
    IF p_record_id IS NULL AND (SELECT count(*) FROM public.professional_exceptions WHERE organization_id=p_organization_id AND local_date>=current_date)>=400 THEN RAISE EXCEPTION 'professional_limit';END IF;
    INSERT INTO public.professional_exceptions(id,organization_id,resource_id,local_date,reason) VALUES(v_id,p_organization_id,(p_data->>'resource_id')::uuid,(p_data->>'local_date')::date,coalesce(p_data->>'reason',''))
    ON CONFLICT(id) DO UPDATE SET resource_id=excluded.resource_id,local_date=excluded.local_date,reason=excluded.reason RETURNING to_jsonb(professional_exceptions) INTO v_result;
   END IF;
  ELSIF p_entity='session' THEN
   IF p_record_id IS NOT NULL THEN
    SELECT * INTO sess FROM public.professional_sessions WHERE id=p_record_id AND organization_id=p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden';END IF;
    IF EXISTS(SELECT 1 FROM public.professional_bookings WHERE session_id=v_id AND status IN('requested','confirmed','waitlisted','attended')) THEN RAISE EXCEPTION 'professional_has_bookings';END IF;
    IF p_data->>'status'='cancelled' THEN UPDATE public.professional_sessions SET status='cancelled' WHERE id=v_id RETURNING to_jsonb(professional_sessions) INTO v_result;END IF;
   END IF;
   IF v_result IS NULL THEN
    SELECT * INTO s FROM public.professional_services WHERE id=coalesce((p_data->>'service_id')::uuid,sess.service_id) AND organization_id=p_organization_id AND active AND mode='session';
    IF NOT FOUND THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
    v_start:=coalesce((p_data->>'starts_at')::timestamptz,sess.starts_at);v_repeat:=coalesce((p_data->>'repeat_weeks')::integer,1);
    IF v_start IS NULL OR v_start<=now() OR v_start>now()+cfg.booking_horizon_days*interval '1 day' OR v_repeat NOT BETWEEN 1 AND 13 OR (p_record_id IS NOT NULL AND v_repeat<>1) THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
    SELECT coalesce(array_agg(DISTINCT x),'{}') INTO v_resources FROM (SELECT value::uuid x FROM jsonb_array_elements_text(coalesce(p_data->'resource_ids','[]')) UNION SELECT unnest(s.required_resource_ids)) z;
    IF s.staff_required AND NOT EXISTS(SELECT 1 FROM public.professional_resources WHERE organization_id=p_organization_id AND kind='staff' AND active AND id=ANY(v_resources)) THEN RAISE EXCEPTION 'professional_resource_required';END IF;
    IF v_repeat>1 THEN v_series:=gen_random_uuid();END IF;
    FOR i IN 0..v_repeat-1 LOOP
     v_start:=((coalesce((p_data->>'starts_at')::timestamptz,sess.starts_at) AT TIME ZONE cfg.timezone)+i*interval '7 days') AT TIME ZONE cfg.timezone;
     v_end:=v_start+s.duration_minutes*interval '1 minute';
     IF v_start>now()+cfg.booking_horizon_days*interval '1 day' OR NOT workspace_private.professional_slot(p_organization_id,v_start,v_end+s.buffer_minutes*interval '1 minute',v_resources,1,NULL,p_record_id) THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;
     IF i>0 THEN v_id:=gen_random_uuid();END IF;
     INSERT INTO public.professional_sessions(id,organization_id,service_id,starts_at,ends_at,blocked_until,capacity,resource_ids,series_id) VALUES(v_id,p_organization_id,s.id,v_start,v_end,v_end+s.buffer_minutes*interval '1 minute',coalesce((p_data->>'capacity')::integer,s.capacity),v_resources,v_series)
     ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,blocked_until=excluded.blocked_until,capacity=excluded.capacity,resource_ids=excluded.resource_ids RETURNING to_jsonb(professional_sessions) INTO v_result;
     v_ids:=array_append(v_ids,v_id);
    END LOOP;v_result:=v_result||jsonb_build_object('created_ids',v_ids);
   END IF;
  ELSE RAISE EXCEPTION 'professional_invalid_input';END IF;
 END IF;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,resource_id) VALUES(p_organization_id,auth.uid(),'professional.'||p_entity||'.saved',v_id);
 IF v_request IS NOT NULL THEN INSERT INTO public.professional_write_requests(organization_id,actor_id,request_key,fingerprint,result) VALUES(p_organization_id,auth.uid(),v_request,v_fingerprint,v_result);END IF;
 RETURN v_result;
END $$;

CREATE FUNCTION public.professional_book(p_organization_id uuid,p_service_id uuid,p_starts_at timestamptz,p_session_id uuid DEFAULT NULL,p_resource_ids uuid[] DEFAULT '{}',p_party_size integer DEFAULT 1,p_customer_name text DEFAULT NULL,p_customer_contact text DEFAULT NULL,p_request_key text DEFAULT NULL,p_customer_id uuid DEFAULT NULL,p_bundle_id uuid DEFAULT NULL,p_expected_service_version integer DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_expected_terms text DEFAULT NULL,p_card_quote_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.professional_settings;s public.professional_services;x public.professional_sessions;b public.professional_bookings;c public.professional_customers;r uuid;resources uuid[];v_staff boolean;v_customer_user uuid;v_start timestamptz;v_end timestamptz;v_status text;v_id uuid;v_total integer;v_deposit integer;v_hash text;v_buffer integer;v_card jsonb;BEGIN
 PERFORM workspace_private.professional_require(p_organization_id);
 v_staff:=public.has_organization_permission(p_organization_id,'attendees.manage') OR public.has_organization_permission(p_organization_id,'content.manage');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 160 OR p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 500 OR p_resource_ids IS NULL OR cardinality(p_resource_ids)>20 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 v_hash:=md5(jsonb_build_array(p_service_id,p_starts_at,p_session_id,p_resource_ids,p_party_size,p_customer_name,p_customer_contact,p_customer_id,p_bundle_id,p_card_quote_id)::text);
 SELECT * INTO b FROM public.professional_bookings WHERE organization_id=p_organization_id AND created_by=auth.uid() AND request_key=p_request_key;
 IF FOUND THEN IF b.request_hash<>v_hash THEN RAISE EXCEPTION 'professional_idempotency_conflict';END IF;RETURN workspace_private.professional_booking_json(b.id);END IF;
 SELECT * INTO cfg FROM public.professional_settings WHERE organization_id=p_organization_id;
  SELECT * INTO s FROM public.professional_services WHERE id=p_service_id AND organization_id=p_organization_id AND active;
  IF NOT FOUND OR p_party_size>s.capacity THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
  IF s.deposit_cents>0 THEN RAISE EXCEPTION 'professional_deposits_unavailable';END IF;
  IF NOT v_staff AND cardinality(p_resource_ids)>0 AND NOT(
   s.staff_required AND s.mode<>'session' AND cardinality(p_resource_ids)=1
   AND NOT EXISTS(SELECT 1 FROM public.professional_resources WHERE id=ANY(s.required_resource_ids) AND kind='staff')
   AND EXISTS(SELECT 1 FROM public.professional_resources WHERE id=p_resource_ids[1] AND organization_id=p_organization_id AND kind='staff' AND active)
  ) THEN RAISE EXCEPTION 'professional_resource_required';END IF;
 IF NOT v_staff AND (p_customer_id IS NOT NULL OR p_customer_name IS NOT NULL OR p_customer_contact IS NOT NULL) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 IF NOT v_staff AND (SELECT count(*) FROM public.professional_bookings WHERE organization_id=p_organization_id AND customer_user_id=auth.uid() AND starts_at>now() AND status IN('requested','confirmed','waitlisted'))>=5 THEN RAISE EXCEPTION 'professional_limit';END IF;
 IF p_customer_id IS NOT NULL THEN SELECT * INTO c FROM public.professional_customers WHERE id=p_customer_id AND organization_id=p_organization_id;IF NOT FOUND THEN RAISE EXCEPTION 'professional_customer_required';END IF;
 ELSIF v_staff AND nullif(btrim(p_customer_name),'') IS NOT NULL THEN INSERT INTO public.professional_customers(organization_id,display_name,contact) VALUES(p_organization_id,btrim(p_customer_name),nullif(btrim(p_customer_contact),'')) RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM public.professional_customers WHERE organization_id=p_organization_id AND user_id=auth.uid();
  IF NOT FOUND THEN INSERT INTO public.professional_customers(organization_id,user_id,display_name) SELECT p_organization_id,auth.uid(),coalesce(nullif(full_name,''),'Cliente') FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE RETURNING * INTO c;END IF;
 END IF;
 IF c.id IS NULL THEN RAISE EXCEPTION 'professional_customer_required';END IF;
 IF c.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=c.user_id AND cohort_id IS DISTINCT FROM public.current_demo_cohort()) OR c.user_id IS NOT NULL AND public.current_demo_cohort() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workspace_demo_accounts WHERE user_id=c.user_id AND cohort_id=public.current_demo_cohort()) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 v_status:=CASE WHEN cfg.require_approval OR s.deposit_cents>0 THEN 'requested' ELSE 'confirmed' END;
 IF s.mode='session' THEN
  SELECT * INTO x FROM public.professional_sessions WHERE id=p_session_id AND organization_id=p_organization_id AND service_id=s.id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
  v_start:=x.starts_at;v_end:=x.ends_at;resources:=x.resource_ids;v_buffer:=0;
  IF NOT workspace_private.professional_slot(p_organization_id,x.starts_at,x.blocked_until,x.resource_ids,1,NULL,x.id) THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;
  IF EXISTS(SELECT 1 FROM public.professional_bookings WHERE session_id=x.id AND customer_id=c.id AND status IN('requested','confirmed','waitlisted','attended')) THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
  IF (SELECT coalesce(sum(party_size),0) FROM public.professional_bookings WHERE session_id=x.id AND status IN('requested','confirmed','attended'))+p_party_size>x.capacity THEN v_status:='waitlisted';END IF;
 ELSE
  IF p_session_id IS NOT NULL THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
  v_start:=p_starts_at;v_end:=v_start+s.duration_minutes*interval '1 minute';v_buffer:=s.buffer_minutes;
  SELECT coalesce(array_agg(DISTINCT id),'{}') INTO resources FROM (SELECT unnest(s.required_resource_ids) id UNION SELECT unnest(p_resource_ids)) q;
  IF s.staff_required AND NOT EXISTS(SELECT 1 FROM public.professional_resources WHERE id=ANY(resources) AND organization_id=p_organization_id AND kind='staff' AND active) THEN
   SELECT id INTO r FROM public.professional_resources WHERE organization_id=p_organization_id AND kind='staff' AND active AND workspace_private.professional_slot(p_organization_id,v_start,v_end+v_buffer*interval '1 minute',array_append(resources,id),p_party_size) ORDER BY id LIMIT 1;
   IF r IS NULL THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;resources:=array_append(resources,r);
  END IF;
  IF cardinality(resources)=0 THEN RAISE EXCEPTION 'professional_resource_required';END IF;
  IF NOT workspace_private.professional_slot(p_organization_id,v_start,v_end+v_buffer*interval '1 minute',resources,p_party_size) THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;
 END IF;
 IF v_start IS NULL OR v_start<=now() OR v_start>now()+cfg.booking_horizon_days*interval '1 day' THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 v_total:=s.price_cents*CASE WHEN s.price_basis='person' THEN p_party_size ELSE 1 END;v_deposit:=s.deposit_cents*CASE WHEN s.price_basis='person' THEN p_party_size ELSE 1 END;
 IF p_bundle_id IS NOT NULL THEN
  IF p_party_size<>1 OR p_card_quote_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.professional_bundles z WHERE id=p_bundle_id AND organization_id=p_organization_id AND customer_id=c.id AND service_id=s.id AND remaining>(SELECT count(*) FROM public.professional_bookings WHERE bundle_id=z.id AND status IN('requested','confirmed'))) THEN RAISE EXCEPTION 'professional_bundle_empty';END IF;
  v_total:=0;v_deposit:=0;IF v_status='requested' AND NOT cfg.require_approval THEN v_status:='confirmed';END IF;
 END IF;
 IF NOT v_staff AND (p_expected_service_version IS DISTINCT FROM s.version OR p_expected_terms IS DISTINCT FROM cfg.terms) THEN RAISE EXCEPTION 'professional_quote_changed';END IF;
 INSERT INTO public.professional_bookings(organization_id,service_id,session_id,customer_id,customer_user_id,starts_at,ends_at,blocked_until,resource_ids,party_size,status,total_cents,deposit_cents,deposit_status,price_snapshot,cancellation_hours,request_key,request_hash,created_by,bundle_id)
 VALUES(p_organization_id,s.id,p_session_id,c.id,c.user_id,v_start,v_end,v_end+v_buffer*interval '1 minute',resources,p_party_size,v_status,v_total,v_deposit,CASE WHEN v_deposit>0 THEN 'pending' ELSE 'not_required' END,jsonb_build_object('service_name',s.name,'menu',s.menu,'terms',cfg.terms,'version',s.version,'unit_cents',s.price_cents,'price_basis',s.price_basis),cfg.cancellation_hours,p_request_key,v_hash,auth.uid(),p_bundle_id) RETURNING id INTO v_id;
 IF p_card_quote_id IS NOT NULL THEN
  IF c.user_id IS DISTINCT FROM auth.uid() OR v_status='waitlisted' OR to_regprocedure('card_private.consume_professional_quote(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'professional_card_quote_unavailable';END IF;
  EXECUTE 'SELECT card_private.consume_professional_quote($1,$2)' INTO v_card USING p_card_quote_id,v_id;
  IF (v_card->>'final_cents')::integer IS NULL OR (v_card->>'final_cents')::integer NOT BETWEEN 0 AND v_total THEN RAISE EXCEPTION 'professional_quote_changed';END IF;
  v_total:=(v_card->>'final_cents')::integer;v_deposit:=least(v_deposit,v_total);
  UPDATE public.professional_bookings SET total_cents=v_total,deposit_cents=v_deposit,deposit_status=CASE WHEN v_deposit=0 THEN 'not_required' ELSE deposit_status END,card_quote_id=p_card_quote_id,price_snapshot=price_snapshot||jsonb_build_object('card',v_card) WHERE id=v_id;
 END IF;
 IF NOT v_staff AND p_expected_total_cents IS DISTINCT FROM v_total THEN RAISE EXCEPTION 'professional_quote_changed';END IF;
 INSERT INTO public.professional_booking_history(organization_id,booking_id,actor_id,action) VALUES(p_organization_id,v_id,auth.uid(),'created');
 RETURN workspace_private.professional_booking_json(v_id);
END $$;

CREATE FUNCTION workspace_private.professional_promote(p_session uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.professional_sessions;b public.professional_bookings;v_used integer;BEGIN
 SELECT * INTO x FROM public.professional_sessions WHERE id=p_session AND status='open';IF NOT FOUND OR x.starts_at<=now() THEN RETURN;END IF;
 SELECT coalesce(sum(party_size),0) INTO v_used FROM public.professional_bookings WHERE session_id=x.id AND status IN('requested','confirmed','attended');
 FOR b IN SELECT * FROM public.professional_bookings WHERE session_id=x.id AND status='waitlisted' ORDER BY created_at,id LOOP
  IF v_used+b.party_size>x.capacity THEN EXIT;END IF;
  IF b.bundle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.professional_bundles z WHERE id=b.bundle_id AND remaining>(SELECT count(*) FROM public.professional_bookings WHERE bundle_id=z.id AND status IN('requested','confirmed'))) THEN CONTINUE;END IF;
  UPDATE public.professional_bookings SET status='requested',updated_at=now() WHERE id=b.id;
  INSERT INTO public.professional_booking_history(organization_id,booking_id,actor_id,action) VALUES(x.organization_id,b.id,auth.uid(),'waitlist_offered');v_used:=v_used+b.party_size;
 END LOOP;
END $$;
CREATE FUNCTION public.professional_booking_action(p_organization_id uuid,p_booking_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DECLARE b public.professional_bookings;is_operator boolean;is_customer boolean;v_start timestamptz;v_end timestamptz;units integer;card_outstanding boolean;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort()) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 SELECT * INTO b FROM public.professional_bookings WHERE id=p_booking_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 -- Pausing new business does not suspend the team's obligations for existing bookings.
 is_operator:=public.has_organization_permission(p_organization_id,'attendees.manage') OR public.has_organization_permission(p_organization_id,'content.manage');is_customer:=b.customer_user_id=auth.uid();
 IF NOT is_operator AND NOT coalesce(is_customer,false) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 IF jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>4000 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF p_action='cancel' THEN
  IF b.status='cancelled' THEN RETURN workspace_private.professional_booking_json(b.id);END IF;
  IF b.status IN('attended','no_show') THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
  IF NOT is_operator AND b.starts_at<now()+b.cancellation_hours*interval '1 hour' THEN RAISE EXCEPTION 'professional_cancellation_late';END IF;
  IF b.deposit_status='paid' THEN RAISE EXCEPTION 'professional_refund_review_required';END IF;
  UPDATE public.professional_bookings SET status='cancelled',reschedule=NULL,updated_at=now() WHERE id=b.id;
  PERFORM workspace_private.professional_promote(b.session_id);
 ELSIF p_action='confirm' THEN
  IF NOT is_operator THEN RAISE EXCEPTION 'professional_forbidden';END IF;
  IF b.status='confirmed' THEN RETURN workspace_private.professional_booking_json(b.id);END IF;
  IF b.status<>'requested' THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
  IF b.deposit_cents>0 AND b.deposit_status<>'paid' THEN RAISE EXCEPTION 'professional_payment_pending';END IF;
  UPDATE public.professional_bookings SET status='confirmed',updated_at=now() WHERE id=b.id;
 ELSIF p_action IN('attend','no_show') THEN
  IF NOT is_operator THEN RAISE EXCEPTION 'professional_forbidden';END IF;
  IF b.status=(CASE WHEN p_action='attend' THEN 'attended' ELSE 'no_show' END) THEN RETURN workspace_private.professional_booking_json(b.id);END IF;
  IF b.status<>'confirmed' OR b.starts_at>now()+interval '15 minutes' THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
  IF p_action='attend' AND b.bundle_id IS NOT NULL THEN
   UPDATE public.professional_bundles SET remaining=remaining-1 WHERE id=b.bundle_id AND remaining>0 RETURNING remaining INTO units;
   IF NOT FOUND THEN RAISE EXCEPTION 'professional_bundle_empty';END IF;
   INSERT INTO public.professional_bundle_ledger(organization_id,bundle_id,booking_id,units,reason,actor_id,request_key) VALUES(p_organization_id,b.bundle_id,b.id,-1,'Asistencia registrada',auth.uid(),'attendance:'||b.id||':'||gen_random_uuid());
  END IF;
  UPDATE public.professional_bookings SET status=CASE WHEN p_action='attend' THEN 'attended' ELSE 'no_show' END,attended_at=CASE WHEN p_action='attend' THEN now() END,attended_by=CASE WHEN p_action='attend' THEN auth.uid() END,reschedule=NULL,updated_at=now() WHERE id=b.id;
 ELSIF p_action='reverse_attendance' THEN
  IF NOT public.has_organization_permission(p_organization_id,'content.manage') OR length(btrim(coalesce(p_data->>'reason','')))<3 THEN RAISE EXCEPTION 'professional_forbidden';END IF;
   IF b.status NOT IN('attended','no_show') THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
   -- Both Card fulfillment and this branch serialize on the organization lock above.
   -- Undo economic evidence first; otherwise a reversed visit would retain a discount or stamp.
   IF to_regclass('public.franky_card_consumptions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.franky_card_consumptions c CROSS JOIN LATERAL jsonb_array_elements(c.lines) line WHERE c.external_reference=$1 AND NOT EXISTS(SELECT 1 FROM public.franky_card_adjustments a WHERE a.consumption_id=c.id AND line->>''id''=ANY(a.line_ids)))' INTO card_outstanding USING 'professional-booking:'||b.id::text;
    IF card_outstanding THEN RAISE EXCEPTION 'professional_card_reversal_required';END IF;
   END IF;
  IF b.status='attended' AND b.bundle_id IS NOT NULL THEN
   UPDATE public.professional_bundles SET remaining=remaining+1 WHERE id=b.bundle_id;
   INSERT INTO public.professional_bundle_ledger(organization_id,bundle_id,booking_id,units,reason,actor_id,request_key) VALUES(p_organization_id,b.bundle_id,b.id,1,p_data->>'reason',auth.uid(),'reversal:'||b.id||':'||gen_random_uuid());
  END IF;
  UPDATE public.professional_bookings SET status='confirmed',attended_at=NULL,attended_by=NULL,updated_at=now() WHERE id=b.id;
 ELSIF p_action='propose_reschedule' THEN
  IF NOT is_operator OR b.session_id IS NOT NULL OR b.status NOT IN('requested','confirmed') THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
  v_start:=(p_data->>'starts_at')::timestamptz;v_end:=v_start+(b.ends_at-b.starts_at);
  IF b.card_quote_id IS NOT NULL AND v_start>coalesce((b.price_snapshot->'card'->>'protected_until')::timestamptz,b.created_at+interval '90 days') THEN RAISE EXCEPTION 'professional_quote_changed';END IF;
  IF v_start<=now() OR v_start>now()+interval '90 days' OR NOT workspace_private.professional_slot(p_organization_id,v_start,v_end+(b.blocked_until-b.ends_at),b.resource_ids,b.party_size,b.id) THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;
  UPDATE public.professional_bookings SET reschedule=jsonb_build_object('starts_at',v_start,'expires_at',now()+interval '24 hours'),updated_at=now() WHERE id=b.id;
 ELSIF p_action='accept_reschedule' THEN
  IF NOT coalesce(is_customer,false) AND NOT(is_operator AND b.customer_user_id IS NULL) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
  IF b.status NOT IN('requested','confirmed') OR b.reschedule IS NULL OR (b.reschedule->>'expires_at')::timestamptz<=now() THEN RAISE EXCEPTION 'professional_reschedule_expired';END IF;
  v_start:=(b.reschedule->>'starts_at')::timestamptz;v_end:=v_start+(b.ends_at-b.starts_at);
  IF b.card_quote_id IS NOT NULL AND v_start>coalesce((b.price_snapshot->'card'->>'protected_until')::timestamptz,b.created_at+interval '90 days') THEN RAISE EXCEPTION 'professional_quote_changed';END IF;
  IF v_start<=now() OR NOT workspace_private.professional_slot(p_organization_id,v_start,v_end+(b.blocked_until-b.ends_at),b.resource_ids,b.party_size,b.id) THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;
  UPDATE public.professional_bookings SET starts_at=v_start,ends_at=v_end,blocked_until=v_end+(b.blocked_until-b.ends_at),reschedule=NULL,updated_at=now() WHERE id=b.id;
 ELSE RAISE EXCEPTION 'professional_invalid_input';END IF;
 INSERT INTO public.professional_booking_history(organization_id,booking_id,actor_id,action,details) VALUES(p_organization_id,b.id,auth.uid(),p_action,jsonb_build_object('reason',left(p_data->>'reason',500)));
 RETURN workspace_private.professional_booking_json(b.id);
END $$;

CREATE FUNCTION public.professional_grant_bundle(p_organization_id uuid,p_customer_id uuid,p_service_id uuid,p_units integer,p_label text,p_reason text,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;entry public.professional_bundle_ledger;BEGIN
 PERFORM workspace_private.professional_require(p_organization_id,'finance.manage');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 IF p_units IS NULL OR p_units NOT BETWEEN 1 AND 1000 OR length(btrim(coalesce(p_reason,'')))<3 OR length(coalesce(p_request_key,'')) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 SELECT * INTO entry FROM public.professional_bundle_ledger WHERE organization_id=p_organization_id AND request_key=p_request_key;
 IF FOUND THEN
  IF entry.units<>p_units OR NOT EXISTS(SELECT 1 FROM public.professional_bundles WHERE id=entry.bundle_id AND customer_id=p_customer_id AND service_id=p_service_id AND label=p_label) THEN RAISE EXCEPTION 'professional_idempotency_conflict';END IF;
  RETURN (SELECT to_jsonb(x) FROM public.professional_bundles x WHERE id=entry.bundle_id);
 END IF;
 INSERT INTO public.professional_bundles(organization_id,customer_id,service_id,label,remaining,granted) VALUES(p_organization_id,p_customer_id,p_service_id,p_label,p_units,p_units) RETURNING id INTO v_id;
 INSERT INTO public.professional_bundle_ledger(organization_id,bundle_id,units,reason,actor_id,request_key) VALUES(p_organization_id,v_id,p_units,p_reason,auth.uid(),p_request_key);
 -- Recording a session entitlement is not a receipt or a provider payment.
 RETURN (SELECT to_jsonb(x) FROM public.professional_bundles x WHERE id=v_id);
END $$;

CREATE FUNCTION public.professional_get_workspace(p_organization_id uuid,p_from timestamptz DEFAULT now(),p_until timestamptz DEFAULT now()+interval '30 days',p_local_date date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.professional_settings;v_demo boolean;v_permissions text[];v_operate boolean;v_manage boolean;v_finance boolean;BEGIN
 IF auth.uid() IS NULL OR NOT public.has_organization_permission(p_organization_id,'resource.read') THEN RAISE EXCEPTION 'professional_forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO cfg FROM public.professional_settings WHERE organization_id=p_organization_id;
 IF p_local_date IS NOT NULL THEN p_from:=p_local_date::timestamp AT TIME ZONE coalesce(cfg.timezone,'Europe/Madrid');p_until:=(p_local_date+31)::timestamp AT TIME ZONE coalesce(cfg.timezone,'Europe/Madrid');END IF;
 IF p_from IS NULL OR p_until IS NULL OR p_until<=p_from OR p_until>p_from+interval '93 days' THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 v_demo:=public.current_demo_cohort() IS NOT NULL;
 SELECT public.workspace_role_permissions(role) INTO v_permissions FROM public.organization_memberships WHERE organization_id=p_organization_id AND user_id=auth.uid() AND status='active';
 v_operate:='attendees.manage'=ANY(v_permissions) OR 'content.manage'=ANY(v_permissions);v_manage:='content.manage'=ANY(v_permissions);v_finance:='finance.read'=ANY(v_permissions);
 RETURN jsonb_build_object('settings',CASE WHEN cfg.organization_id IS NULL THEN NULL ELSE to_jsonb(cfg)||jsonb_build_object('enabled',cfg.enabled OR v_demo,'demo',v_demo) END,
 'services',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name),'[]') FROM public.professional_services x WHERE organization_id=p_organization_id),
 'resources',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name),'[]') FROM public.professional_resources x WHERE organization_id=p_organization_id),
 'availability',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY weekday,start_minute),'[]') FROM public.professional_availability x WHERE organization_id=p_organization_id),
 'exceptions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY local_date),'[]') FROM public.professional_exceptions x WHERE organization_id=p_organization_id AND local_date BETWEEN (p_from AT TIME ZONE coalesce(cfg.timezone,'Europe/Madrid'))::date AND (p_until AT TIME ZONE coalesce(cfg.timezone,'Europe/Madrid'))::date),
 'sessions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY starts_at),'[]') FROM (SELECT s.*,(SELECT coalesce(sum(party_size),0) FROM public.professional_bookings WHERE session_id=s.id AND status IN('confirmed','requested','attended')) reserved_seats,(SELECT coalesce(sum(party_size),0) FROM public.professional_bookings WHERE session_id=s.id AND status='waitlisted') waitlisted_seats FROM public.professional_sessions s WHERE organization_id=p_organization_id AND starts_at>=p_from AND starts_at<p_until ORDER BY starts_at,id LIMIT 300) x),
 'bookings',CASE WHEN v_operate OR v_finance THEN (SELECT coalesce(jsonb_agg(workspace_private.professional_booking_json(x.id) ORDER BY x.starts_at,x.id),'[]') FROM (SELECT id,starts_at FROM public.professional_bookings WHERE organization_id=p_organization_id AND starts_at>=p_from AND starts_at<p_until ORDER BY starts_at,id LIMIT 300) x) ELSE '[]'::jsonb END,
 'customers',CASE WHEN v_operate OR v_finance THEN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY display_name),'[]') FROM (SELECT id,organization_id,user_id,display_name,CASE WHEN v_manage THEN contact ELSE NULL END contact,created_at FROM public.professional_customers WHERE organization_id=p_organization_id ORDER BY created_at DESC,id LIMIT 300) x) ELSE '[]'::jsonb END,
 'bundles',CASE WHEN v_operate OR v_finance THEN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT * FROM public.professional_bundles WHERE organization_id=p_organization_id ORDER BY id LIMIT 300) x) ELSE '[]'::jsonb END,
 'permissions',v_permissions,'pricing',CASE WHEN cfg.organization_id IS NULL THEN NULL ELSE workspace_private.professional_prices(cfg.category) END,'demo',v_demo,
 'has_more',(SELECT count(*)>300 FROM public.professional_bookings WHERE organization_id=p_organization_id AND starts_at>=p_from AND starts_at<p_until) OR (SELECT count(*)>300 FROM public.professional_customers WHERE organization_id=p_organization_id) OR (SELECT count(*)>300 FROM public.professional_sessions WHERE organization_id=p_organization_id AND starts_at>=p_from AND starts_at<p_until));
END $$;
CREATE FUNCTION public.professional_get_catalog(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM workspace_private.professional_require(p_organization_id);
 RETURN jsonb_build_object('organization',(SELECT jsonb_build_object('id',id,'name',name,'city',city) FROM public.organizations WHERE id=p_organization_id),'settings',(SELECT jsonb_build_object('timezone',timezone,'require_approval',require_approval,'booking_horizon_days',booking_horizon_days,'cancellation_hours',cancellation_hours,'terms',terms) FROM public.professional_settings WHERE organization_id=p_organization_id),
  'services',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name),'[]') FROM public.professional_services x WHERE organization_id=p_organization_id AND active AND deposit_cents=0),
 'resources',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'capacity',capacity) ORDER BY name),'[]') FROM public.professional_resources WHERE organization_id=p_organization_id AND active),
 'sessions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY starts_at),'[]') FROM (SELECT s.id,s.organization_id,s.service_id,s.starts_at,s.ends_at,s.capacity,s.resource_ids,s.status,s.series_id,(SELECT coalesce(sum(party_size),0) FROM public.professional_bookings WHERE session_id=s.id AND status IN('requested','confirmed','attended')) reserved_seats FROM public.professional_sessions s WHERE organization_id=p_organization_id AND status='open' AND starts_at>now() ORDER BY starts_at LIMIT 100) x));
END $$;
CREATE FUNCTION public.professional_my_bookings(p_from timestamptz DEFAULT now()-interval '30 days',p_until timestamptz DEFAULT now()+interval '93 days') RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 IF p_from IS NULL OR p_until IS NULL OR p_until<=p_from OR p_until>p_from+interval '366 days' THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 RETURN (SELECT coalesce(jsonb_agg(workspace_private.professional_booking_json(x.id)||jsonb_build_object('organization_name',x.name) ORDER BY x.starts_at),'[]') FROM (SELECT b.id,b.starts_at,o.name FROM public.professional_bookings b JOIN public.organizations o ON o.id=b.organization_id WHERE b.customer_user_id=auth.uid() AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND b.starts_at>=p_from AND b.starts_at<p_until ORDER BY b.starts_at,id LIMIT 300) x);
END $$;
CREATE FUNCTION public.professional_get_slots(p_organization_id uuid,p_service_id uuid,p_date date,p_resource_ids uuid[] DEFAULT '{}',p_party_size integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.professional_settings;s public.professional_services;t timestamptz;resources uuid[];minute integer;v_result jsonb:='[]';free boolean;BEGIN
 PERFORM workspace_private.professional_require(p_organization_id);
 SELECT * INTO cfg FROM public.professional_settings WHERE organization_id=p_organization_id;
 SELECT * INTO s FROM public.professional_services WHERE organization_id=p_organization_id AND id=p_service_id AND active AND (mode<>'session' OR public.has_organization_permission(p_organization_id,'content.manage'));
  IF NOT FOUND OR p_date IS NULL OR p_date<(now() AT TIME ZONE cfg.timezone)::date OR p_date>(now() AT TIME ZONE cfg.timezone)::date+cfg.booking_horizon_days OR cardinality(p_resource_ids)>20 OR p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND s.capacity THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
  IF s.deposit_cents>0 THEN RAISE EXCEPTION 'professional_deposits_unavailable';END IF;
  IF NOT(public.has_organization_permission(p_organization_id,'attendees.manage') OR public.has_organization_permission(p_organization_id,'content.manage')) AND cardinality(p_resource_ids)>0 AND NOT(
   s.staff_required AND s.mode<>'session' AND cardinality(p_resource_ids)=1
   AND NOT EXISTS(SELECT 1 FROM public.professional_resources WHERE id=ANY(s.required_resource_ids) AND kind='staff')
   AND EXISTS(SELECT 1 FROM public.professional_resources WHERE id=p_resource_ids[1] AND organization_id=p_organization_id AND kind='staff' AND active)
  ) THEN RAISE EXCEPTION 'professional_resource_required';END IF;
 SELECT coalesce(array_agg(DISTINCT id),'{}') INTO resources FROM (SELECT unnest(s.required_resource_ids) id UNION SELECT unnest(p_resource_ids)) q;
 FOR minute IN 0..95 LOOP
  t:=(p_date+minute*interval '15 minutes') AT TIME ZONE cfg.timezone;
  IF t<=now() THEN CONTINUE;END IF;
  IF s.staff_required AND NOT EXISTS(SELECT 1 FROM public.professional_resources WHERE id=ANY(resources) AND organization_id=p_organization_id AND kind='staff') THEN
   SELECT EXISTS(SELECT 1 FROM public.professional_resources WHERE organization_id=p_organization_id AND active AND kind='staff' AND workspace_private.professional_slot(p_organization_id,t,t+(s.duration_minutes+s.buffer_minutes)*interval '1 minute',array_append(resources,id),p_party_size)) INTO free;
  ELSE free:=(cardinality(resources)>0 OR s.mode='session') AND workspace_private.professional_slot(p_organization_id,t,t+(s.duration_minutes+s.buffer_minutes)*interval '1 minute',resources,p_party_size);END IF;
  IF free THEN v_result:=v_result||jsonb_build_array(t);END IF;
 END LOOP;RETURN v_result;
END $$;

CREATE FUNCTION public.professional_list_workspaces() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name),'[]') FROM (SELECT o.id,o.kind,o.subtype,o.name,o.slug,o.city,o.status,o.verification_status,o.demo_cohort_id,m.role,public.workspace_role_permissions(m.role) permissions FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id WHERE m.user_id=auth.uid() AND o.kind IN('leisure','community') AND public.has_organization_permission(o.id,'resource.read')) x);
END $$;
CREATE FUNCTION public.admin_professional_settings(p_organization_id uuid,p_enabled boolean DEFAULT NULL,p_limits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() OR NOT public.is_admin() OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' OR public.current_demo_cohort() IS NOT NULL THEN RAISE EXCEPTION 'professional_forbidden' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_limits)<>'object' OR octet_length(p_limits::text)>2000 OR NOT EXISTS(SELECT 1 FROM public.professional_settings WHERE organization_id=p_organization_id) THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 UPDATE public.professional_settings SET enabled=coalesce(p_enabled,enabled),staff_limit=coalesce((p_limits->>'staff_limit')::integer,staff_limit),resource_limit=coalesce((p_limits->>'resource_limit')::integer,resource_limit),service_limit=coalesce((p_limits->>'service_limit')::integer,service_limit),updated_at=now() WHERE organization_id=p_organization_id RETURNING to_jsonb(professional_settings) INTO result;
 INSERT INTO public.organization_audit(organization_id,actor_id,action,details) VALUES(p_organization_id,auth.uid(),'professional.pilot.updated',jsonb_build_object('enabled',p_enabled,'limits',p_limits));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_professional_settings(uuid,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_professional_settings(uuid,boolean,jsonb) TO authenticated;
CREATE FUNCTION public.professional_list_businesses(p_city text DEFAULT NULL,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE items jsonb;lim integer:=least(greatest(coalesce(p_limit,30),1),50);BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO items FROM (SELECT o.id,o.name,o.city,s.category FROM public.organizations o JOIN public.professional_settings s ON s.organization_id=o.id WHERE o.status='active' AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND (s.enabled OR o.demo_cohort_id IS NOT NULL) AND s.public_booking AND (p_city IS NULL OR lower(o.city)=lower(btrim(p_city))) AND (p_cursor IS NULL OR o.id>p_cursor) AND EXISTS(SELECT 1 FROM public.professional_services WHERE organization_id=o.id AND active) ORDER BY o.id LIMIT lim+1) x;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>lim THEN items-lim ELSE items END,'next_cursor',CASE WHEN jsonb_array_length(items)>lim THEN items->(lim-1)->>'id' END);
END $$;
CREATE FUNCTION public.professional_list_records(p_organization_id uuid,p_entity text,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 50,p_from timestamptz DEFAULT now()-interval '30 days',p_until timestamptz DEFAULT now()+interval '93 days',p_search text DEFAULT NULL,p_local_date date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE items jsonb;lim integer:=least(greatest(coalesce(p_limit,50),1),100);can_operate boolean;can_finance boolean;can_contact boolean;BEGIN
 IF auth.uid() IS NULL OR NOT public.has_organization_permission(p_organization_id,'resource.read') THEN RAISE EXCEPTION 'professional_forbidden' USING ERRCODE='42501';END IF;
 IF p_local_date IS NOT NULL THEN SELECT p_local_date::timestamp AT TIME ZONE timezone,(p_local_date+31)::timestamp AT TIME ZONE timezone INTO p_from,p_until FROM public.professional_settings WHERE organization_id=p_organization_id;END IF;
 can_operate:=public.has_organization_permission(p_organization_id,'content.manage') OR public.has_organization_permission(p_organization_id,'attendees.manage');can_finance:=public.has_organization_permission(p_organization_id,'finance.read');can_contact:=public.has_organization_permission(p_organization_id,'content.manage');
 IF NOT(can_operate OR can_finance) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 IF p_from IS NULL OR p_until IS NULL OR p_until<=p_from OR p_until>p_from+interval '366 days' OR length(coalesce(p_search,''))>100 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF p_entity='bookings' THEN SELECT coalesce(jsonb_agg(workspace_private.professional_booking_json(x.id) ORDER BY x.id),'[]') INTO items FROM (SELECT id FROM public.professional_bookings WHERE organization_id=p_organization_id AND (p_cursor IS NULL OR id>p_cursor) AND starts_at>=p_from AND starts_at<p_until ORDER BY id LIMIT lim+1) x;
 ELSIF p_entity='customers' THEN SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO items FROM (SELECT id,organization_id,user_id,display_name,CASE WHEN can_contact THEN contact ELSE NULL END contact,created_at FROM public.professional_customers WHERE organization_id=p_organization_id AND (p_cursor IS NULL OR id>p_cursor) AND (p_search IS NULL OR position(lower(p_search) IN lower(display_name))>0) ORDER BY id LIMIT lim+1) x;
 ELSIF p_entity='bundles' THEN SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO items FROM (SELECT * FROM public.professional_bundles WHERE organization_id=p_organization_id AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT lim+1) x;
 ELSIF p_entity='history' THEN SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO items FROM (SELECT id,booking_id,action,details,created_at FROM public.professional_booking_history WHERE organization_id=p_organization_id AND (p_cursor IS NULL OR id>p_cursor) AND created_at>=p_from AND created_at<p_until ORDER BY id LIMIT lim+1) x;
 ELSE RAISE EXCEPTION 'professional_invalid_input';END IF;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>lim THEN items-lim ELSE items END,'next_cursor',CASE WHEN jsonb_array_length(items)>lim THEN items->(lim-1)->>'id' END);
END $$;

-- Explicit surface grants. Internal helpers are never callable via PostgREST.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='workspace_private' AND p.proname LIKE 'professional_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'professional_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END LOOP;
END $$;
DO $$ DECLARE definition text;BEGIN
 IF to_regprocedure('public.workspace_require_request()') IS NOT NULL THEN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF strpos(definition,'''/rpc/current_demo_cohort''')=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing';END IF;
 EXECUTE replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/professional_get_workspace'',''/rpc/professional_save_record'',''/rpc/professional_book'',''/rpc/professional_booking_action'',''/rpc/professional_get_catalog'',''/rpc/professional_my_bookings'',''/rpc/professional_get_slots'',''/rpc/professional_grant_bundle'',''/rpc/professional_list_businesses'',''/rpc/professional_list_records'',''/rpc/professional_list_workspaces''');
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
