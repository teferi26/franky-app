-- Plano y operaciones de sala sobre professional_book. No activa ventas ni crea
-- servicios, precios o reservas paralelas al motor profesional.
CREATE TABLE public.pro_tables (
  resource_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  zone text NOT NULL DEFAULT 'Sala' CHECK (length(btrim(zone)) BETWEEN 1 AND 80),
  x integer NOT NULL CHECK (x BETWEEN 0 AND 11),
  y integer NOT NULL CHECK (y BETWEEN 0 AND 7),
  w integer NOT NULL CHECK (w BETWEEN 1 AND 12),
  h integer NOT NULL CHECK (h BETWEEN 1 AND 8),
  shape text NOT NULL CHECK (shape IN ('square','round','bar')),
  exclusive boolean NOT NULL,
  cleaning_minutes integer NOT NULL DEFAULT 10 CHECK (cleaning_minutes BETWEEN 0 AND 120),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (organization_id, resource_id) REFERENCES public.professional_resources(organization_id, id),
  CHECK (x + w <= 12 AND y + h <= 8)
);
CREATE TABLE public.pro_table_booking_operations (
  booking_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  table_id uuid NOT NULL REFERENCES public.pro_tables(resource_id),
  seated_at timestamptz,
  left_at timestamptz,
  cleaned_at timestamptz,
  cleaning_minutes integer NOT NULL CHECK (cleaning_minutes BETWEEN 0 AND 120),
  FOREIGN KEY (organization_id, booking_id) REFERENCES public.professional_bookings(organization_id, id),
  FOREIGN KEY (organization_id, table_id) REFERENCES public.professional_resources(organization_id, id),
  CHECK (left_at IS NULL OR seated_at IS NOT NULL AND left_at >= seated_at),
  CHECK (cleaned_at IS NULL OR left_at IS NOT NULL AND cleaned_at >= left_at)
);
CREATE TABLE public.pro_table_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),
  customer_id uuid NOT NULL,
  service_id uuid NOT NULL,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 500),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '12 hours',
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','seated','cancelled')),
  booking_id uuid UNIQUE,
  service_version integer NOT NULL,
  expected_total_cents integer NOT NULL CHECK (expected_total_cents >= 0),
  FOREIGN KEY (organization_id, customer_id) REFERENCES public.professional_customers(organization_id, id),
  FOREIGN KEY (organization_id, service_id) REFERENCES public.professional_services(organization_id, id),
  FOREIGN KEY (organization_id, booking_id) REFERENCES public.professional_bookings(organization_id, id),
  CHECK (expires_at > requested_at),
  CHECK (status <> 'seated' OR booking_id IS NOT NULL)
);
CREATE INDEX pro_table_waitlist_org ON public.pro_table_waitlist(organization_id, requested_at);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pro_tables','pro_table_booking_operations','pro_table_waitlist'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated', t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- La comprobación adicional se aplica solo a recursos incorporados al plano.
-- Los recursos anteriores mantienen su capacidad compartida mientras no se
-- configure explícitamente su política exclusiva.
ALTER FUNCTION workspace_private.professional_slot(uuid,timestamptz,timestamptz,uuid[],integer,uuid,uuid)
  RENAME TO professional_slot_before_tables;
CREATE FUNCTION workspace_private.professional_slot(
  p_org uuid, p_start timestamptz, p_end timestamptz, p_resources uuid[], p_party integer,
  p_ignore uuid DEFAULT NULL, p_ignore_session uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT workspace_private.professional_slot_before_tables(p_org, p_start, p_end, p_resources,
    p_party, p_ignore, p_ignore_session) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.pro_tables t JOIN public.professional_bookings b
      ON b.organization_id = t.organization_id AND t.resource_id = ANY(b.resource_ids)
    LEFT JOIN public.pro_table_booking_operations op ON op.booking_id = b.id
    WHERE t.organization_id = p_org AND t.resource_id = ANY(p_resources) AND t.exclusive
      AND b.id IS DISTINCT FROM p_ignore AND b.session_id IS NULL
      AND b.status IN ('requested','confirmed','attended')
      AND least(b.starts_at, coalesce(op.seated_at, b.starts_at)) < p_end
      AND greatest(b.blocked_until,
        CASE WHEN op.seated_at IS NOT NULL AND op.left_at IS NULL AND b.status = 'confirmed'
          THEN clock_timestamp() ELSE b.blocked_until END) > p_start
  ) THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE FUNCTION workspace_private.pro_table_booking_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cleaning integer; op public.pro_table_booking_operations; finalizing boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT * INTO op FROM public.pro_table_booking_operations WHERE booking_id = NEW.id;
    IF op.booking_id IS NOT NULL AND NEW.resource_ids IS DISTINCT FROM OLD.resource_ids THEN
      RAISE EXCEPTION 'pro_table_reassignment_unavailable';
    END IF;
  END IF;
  SELECT max(t.cleaning_minutes) INTO cleaning FROM public.pro_tables t
    WHERE t.organization_id = NEW.organization_id AND t.resource_id = ANY(NEW.resource_ids);
  IF cleaning IS NULL OR NEW.session_id IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 195));
  IF TG_OP = 'UPDATE' THEN
    -- Una cancelación, cambio de hora o asistencia genérica no puede liberar
    -- una mesa ocupada. Primero se registra la salida real de sala.
    IF op.seated_at IS NOT NULL AND op.left_at IS NULL AND
      (NEW.status <> 'confirmed' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
        OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.resource_ids IS DISTINCT FROM OLD.resource_ids) THEN
      RAISE EXCEPTION 'pro_table_seated';
    END IF;
    finalizing := op.left_at IS NOT NULL AND NEW.starts_at = OLD.starts_at AND NEW.resource_ids = OLD.resource_ids
      AND (NEW.ends_at = op.left_at AND NEW.blocked_until =
        CASE WHEN op.cleaned_at IS NOT NULL THEN greatest(op.left_at, op.cleaned_at)
          ELSE op.left_at + op.cleaning_minutes * interval '1 minute' END
        OR OLD.status = 'confirmed' AND NEW.status = 'attended'
          AND NEW.ends_at = OLD.ends_at AND NEW.blocked_until = OLD.blocked_until);
    IF finalizing THEN RETURN NEW; END IF;
    IF NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at AND NEW.resource_ids = OLD.resource_ids
      AND NEW.blocked_until = OLD.blocked_until AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  END IF;
  IF NEW.status NOT IN ('requested','confirmed','attended') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.resource_ids IS DISTINCT FROM OLD.resource_ids THEN
    NEW.blocked_until := greatest(NEW.blocked_until, NEW.ends_at + cleaning * interval '1 minute');
  END IF;
  IF NOT workspace_private.professional_slot(NEW.organization_id, NEW.starts_at, NEW.blocked_until,
    NEW.resource_ids, NEW.party_size, NEW.id) THEN RAISE EXCEPTION 'professional_slot_unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_pro_table_booking_guard BEFORE INSERT OR UPDATE ON public.professional_bookings
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_table_booking_guard();

CREATE FUNCTION workspace_private.pro_table_resource_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.pro_tables WHERE resource_id = NEW.id) AND NEW.kind <> 'table' THEN
    RAISE EXCEPTION 'pro_table_resource_required';
  END IF;
  IF (NEW.active IS DISTINCT FROM OLD.active OR NEW.capacity IS DISTINCT FROM OLD.capacity)
    AND EXISTS(SELECT 1 FROM public.pro_table_booking_operations op JOIN public.professional_bookings b ON b.id = op.booking_id
      WHERE op.table_id = NEW.id AND op.seated_at IS NOT NULL AND op.left_at IS NULL AND b.status = 'confirmed') THEN
    RAISE EXCEPTION 'professional_has_bookings';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pro_table_resource_guard BEFORE UPDATE OF kind, active, capacity ON public.professional_resources
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_table_resource_guard();

CREATE FUNCTION workspace_private.pro_table_erasure_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.erased_at IS NOT NULL THEN
    UPDATE public.pro_table_waitlist SET note = '', status = CASE WHEN status = 'waiting' THEN 'cancelled' ELSE status END
      WHERE customer_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pro_table_customer_erasure AFTER UPDATE ON public.professional_customers
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_table_erasure_guard();

CREATE FUNCTION workspace_private.pro_table_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT to_jsonb(t) || jsonb_build_object('id', r.id, 'name', r.name, 'capacity', r.capacity, 'active', r.active)
  FROM public.pro_tables t JOIN public.professional_resources r ON r.id = t.resource_id WHERE t.resource_id = p_id
$$;
CREATE FUNCTION workspace_private.pro_table_queue_json(p_id uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('id', q.id, 'organization_id', q.organization_id, 'customer_id', q.customer_id,
    'customer_name', c.display_name, 'service_id', q.service_id, 'party_size', q.party_size,
    'requested_at', q.requested_at, 'expires_at', q.expires_at,
    'status', CASE WHEN q.status = 'waiting' AND q.expires_at <= clock_timestamp() THEN 'expired' ELSE q.status END,
    'booking_id', q.booking_id, 'service_version', q.service_version,
    'expected_total_cents', CASE WHEN public.has_organization_permission(q.organization_id, 'finance.read')
      OR public.has_organization_permission(q.organization_id, 'content.manage') THEN q.expected_total_cents END)
    || CASE WHEN public.has_organization_permission(q.organization_id, 'content.manage')
      THEN jsonb_build_object('note', q.note, 'customer_contact', c.contact) ELSE '{}'::jsonb END
  FROM public.pro_table_waitlist q JOIN public.professional_customers c ON c.id = q.customer_id WHERE q.id = p_id
$$;
CREATE FUNCTION workspace_private.pro_table_result(p_booking uuid, p_queue uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('booking', workspace_private.professional_booking_json(p_booking),
    'operation', (SELECT to_jsonb(op) FROM public.pro_table_booking_operations op WHERE op.booking_id = p_booking),
    'waitlist', workspace_private.pro_table_queue_json(p_queue))
$$;

CREATE FUNCTION public.pro_get_table_operations(p_organization_id uuid, p_from timestamptz, p_until timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE can_operate boolean;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from OR p_until > p_from + interval '93 days' THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  can_operate := public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage');
  RETURN jsonb_build_object(
    'tables', coalesce((SELECT jsonb_agg(workspace_private.pro_table_json(t.resource_id) ORDER BY t.zone, t.y, t.x, t.resource_id)
      FROM public.pro_tables t WHERE t.organization_id = p_organization_id), '[]'::jsonb),
    'unmapped_resource_ids', coalesce((SELECT jsonb_agg(r.id ORDER BY r.id) FROM public.professional_resources r
      WHERE r.organization_id = p_organization_id AND r.kind = 'table' AND NOT EXISTS(
        SELECT 1 FROM public.pro_tables t WHERE t.resource_id = r.id)), '[]'::jsonb),
    'waitlist', CASE WHEN can_operate THEN coalesce((SELECT jsonb_agg(workspace_private.pro_table_queue_json(q.id)
      ORDER BY q.requested_at, q.id) FROM public.pro_table_waitlist q
      WHERE q.organization_id = p_organization_id AND q.requested_at >= p_from AND q.requested_at < p_until), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'booking_operations', CASE WHEN can_operate OR public.has_organization_permission(p_organization_id, 'finance.read')
      THEN coalesce((SELECT jsonb_agg(to_jsonb(op) ORDER BY b.starts_at, b.id)
        FROM public.pro_table_booking_operations op JOIN public.professional_bookings b ON b.id = op.booking_id
        WHERE op.organization_id = p_organization_id AND b.starts_at >= p_from AND b.starts_at < p_until), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'can_manage', public.has_organization_permission(p_organization_id, 'content.manage'), 'can_operate', can_operate);
END $$;

CREATE FUNCTION public.pro_save_table(p_organization_id uuid, p_table_id uuid DEFAULT NULL, p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t public.pro_tables; r public.professional_resources; v_id uuid := p_table_id;
  v_request uuid; fingerprint text; prior public.professional_write_requests; patch jsonb; saved jsonb;
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id, 'content.manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 8000 THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  v_request := (p_data->>'client_request_id')::uuid;
  IF v_request IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  fingerprint := md5(jsonb_build_array('pro.table.save', p_table_id, p_data - 'client_request_id')::text);
  SELECT * INTO prior FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = v_request;
  IF FOUND THEN
    IF prior.fingerprint <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.pro_table_json((prior.result->>'id')::uuid);
  END IF;
  IF v_id IS NOT NULL THEN
    SELECT * INTO r FROM public.professional_resources WHERE id = v_id AND organization_id = p_organization_id AND kind = 'table';
    IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
    SELECT * INTO t FROM public.pro_tables WHERE resource_id = v_id;
  END IF;
  IF p_data ? 'expected_version' AND (p_data->>'expected_version')::integer IS DISTINCT FROM t.version THEN
    RAISE EXCEPTION 'pro_table_changed';
  END IF;
  IF (p_data->>'active' = 'false' OR p_data ? 'exclusive' AND (p_data->>'exclusive')::boolean IS DISTINCT FROM coalesce(t.exclusive, false))
    AND EXISTS(SELECT 1 FROM public.professional_bookings b LEFT JOIN public.pro_table_booking_operations op ON op.booking_id = b.id
      WHERE b.organization_id = p_organization_id AND v_id = ANY(b.resource_ids) AND b.status IN ('requested','confirmed','attended')
        AND (b.blocked_until > clock_timestamp() OR op.seated_at IS NOT NULL AND op.left_at IS NULL AND b.status = 'confirmed')) THEN
    RAISE EXCEPTION 'professional_has_bookings';
  END IF;
  patch := p_data - ARRAY['client_request_id','expected_version','zone','x','y','w','h','shape','exclusive','cleaning_minutes'];
  IF p_data ? 'kind' THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  IF v_id IS NOT NULL THEN
    IF (patch->>'capacity')::integer = r.capacity THEN patch := patch - 'capacity'; END IF;
    IF (patch->>'active')::boolean = r.active THEN patch := patch - 'active'; END IF;
  END IF;
  IF v_id IS NULL THEN patch := patch || jsonb_build_object('kind', 'table'); END IF;
  saved := public.professional_save_record(p_organization_id, 'resource', v_id, patch);
  v_id := (saved->>'id')::uuid;
  INSERT INTO public.pro_tables(resource_id, organization_id, zone, x, y, w, h, shape, exclusive, cleaning_minutes)
  VALUES(v_id, p_organization_id, coalesce(p_data->>'zone', t.zone, 'Sala'),
    coalesce((p_data->>'x')::integer, t.x), coalesce((p_data->>'y')::integer, t.y),
    coalesce((p_data->>'w')::integer, t.w), coalesce((p_data->>'h')::integer, t.h),
    coalesce(p_data->>'shape', t.shape, 'square'),
    coalesce((p_data->>'exclusive')::boolean, t.exclusive, p_table_id IS NULL),
    coalesce((p_data->>'cleaning_minutes')::integer, t.cleaning_minutes, 10))
  ON CONFLICT(resource_id) DO UPDATE SET zone = excluded.zone, x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h,
    shape = excluded.shape, exclusive = excluded.exclusive, cleaning_minutes = excluded.cleaning_minutes, version = pro_tables.version + 1;
  SELECT * INTO t FROM public.pro_tables WHERE resource_id = v_id;
  IF (saved->>'active')::boolean AND EXISTS(SELECT 1 FROM public.pro_tables other JOIN public.professional_resources res ON res.id = other.resource_id
    WHERE other.organization_id = p_organization_id AND other.resource_id <> v_id AND res.active AND other.zone = t.zone
      AND t.x < other.x + other.w AND t.x + t.w > other.x AND t.y < other.y + other.h AND t.y + t.h > other.y) THEN
    RAISE EXCEPTION 'pro_table_layout_overlap';
  END IF;
  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES(p_organization_id, auth.uid(), v_request, fingerprint, jsonb_build_object('id', v_id));
  RETURN workspace_private.pro_table_json(v_id);
END $$;

CREATE FUNCTION public.pro_table_operation(
  p_organization_id uuid, p_action text, p_data jsonb DEFAULT '{}', p_record_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  request_id uuid; fingerprint text; prior public.professional_write_requests;
  table_row public.pro_tables; resource public.professional_resources; service public.professional_services;
  booking public.professional_bookings; queue public.pro_table_waitlist; op public.pro_table_booking_operations;
  customer public.professional_customers; v_table_id uuid; v_booking_id uuid; v_queue_id uuid;
  result jsonb; starts timestamptz; moment timestamptz; party integer; total integer;
  v_source text; customer_name text; customer_contact text;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  IF NOT (public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage')) THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 12000
    OR p_data ?| ARRAY['student','verified','user_id','paid_cents','price_cents'] THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  request_id := (p_data->>'client_request_id')::uuid;
  IF request_id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  fingerprint := md5(jsonb_build_array('pro.table.operation', p_action, p_record_id, p_data - 'client_request_id')::text);
  SELECT * INTO prior FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = request_id;
  IF FOUND THEN
    IF prior.fingerprint <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.pro_table_result((prior.result->>'booking_id')::uuid, (prior.result->>'queue_id')::uuid);
  END IF;
  v_table_id := (p_data->>'table_id')::uuid;
  IF p_record_id IS NOT NULL THEN
    SELECT * INTO queue FROM public.pro_table_waitlist WHERE id = p_record_id AND organization_id = p_organization_id FOR UPDATE;
    IF FOUND THEN v_queue_id := queue.id;
    ELSE
      SELECT * INTO booking FROM public.professional_bookings WHERE id = p_record_id AND organization_id = p_organization_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
      v_booking_id := booking.id;
      SELECT * INTO op FROM public.pro_table_booking_operations bo WHERE bo.booking_id = booking.id;
      IF op.booking_id IS NULL THEN
        -- Las reservas públicas ya existentes también se atienden desde la sala.
        SELECT * INTO table_row FROM public.pro_tables t WHERE t.organization_id = p_organization_id
          AND t.resource_id = ANY(booking.resource_ids);
        IF table_row.resource_id IS NULL OR booking.session_id IS NOT NULL
          OR (SELECT count(*) FROM public.pro_tables t WHERE t.resource_id = ANY(booking.resource_ids)) <> 1 THEN
          RAISE EXCEPTION 'pro_table_booking_required';
        END IF;
        INSERT INTO public.pro_table_booking_operations(booking_id, organization_id, table_id, cleaning_minutes)
          VALUES(booking.id, p_organization_id, table_row.resource_id, table_row.cleaning_minutes) RETURNING * INTO op;
      END IF;
      v_table_id := coalesce(v_table_id, op.table_id);
    END IF;
  END IF;
  IF queue.id IS NOT NULL AND p_action = 'seat' AND queue.status = 'seated' THEN
    INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
      VALUES(p_organization_id, auth.uid(), request_id, fingerprint,
        jsonb_build_object('booking_id', queue.booking_id, 'queue_id', queue.id));
    RETURN workspace_private.pro_table_result(queue.booking_id, queue.id);
  END IF;
  IF p_action IN ('reserve','walkin','waitlist') OR p_action = 'seat' AND queue.id IS NOT NULL THEN
    PERFORM workspace_private.professional_require(p_organization_id);
    IF p_action IN ('reserve','walkin','waitlist') AND p_record_id IS NOT NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    IF queue.id IS NOT NULL AND (queue.status <> 'waiting' OR queue.expires_at <= clock_timestamp()) THEN
      RAISE EXCEPTION 'pro_table_queue_closed';
    END IF;
    SELECT * INTO service FROM public.professional_services
      WHERE id = coalesce(queue.service_id, (p_data->>'service_id')::uuid) AND organization_id = p_organization_id AND active
        AND mode IN ('group','resource') AND NOT staff_required;
    IF NOT FOUND THEN RAISE EXCEPTION 'pro_table_service_required'; END IF;
    party := coalesce(queue.party_size, (p_data->>'party_size')::integer);
    IF party IS NULL OR party NOT BETWEEN 1 AND service.capacity THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    total := service.price_cents * CASE WHEN service.price_basis = 'person' THEN party ELSE 1 END;
    IF ((p_data ? 'expected_service_version' OR queue.id IS NOT NULL)
      AND coalesce((p_data->>'expected_service_version')::integer, queue.service_version) IS DISTINCT FROM service.version)
      OR ((p_data ? 'expected_total_cents' OR queue.id IS NOT NULL)
      AND coalesce((p_data->>'expected_total_cents')::integer, queue.expected_total_cents) IS DISTINCT FROM total) THEN
      RAISE EXCEPTION 'professional_quote_changed';
    END IF;
    IF service.deposit_cents > 0 THEN RAISE EXCEPTION 'professional_deposits_unavailable'; END IF;
    v_source := CASE WHEN p_action IN ('walkin','waitlist') OR queue.id IS NOT NULL THEN 'walkin' ELSE nullif(p_data->>'source', 'unknown') END;
    IF v_source IS NOT NULL AND v_source NOT IN ('phone','instagram','walkin','google','grupo') THEN RAISE EXCEPTION 'pro_source_not_manual'; END IF;
    SELECT * INTO customer FROM public.professional_customers
      WHERE id = coalesce(queue.customer_id, (p_data->>'customer_id')::uuid) AND organization_id = p_organization_id;
    IF queue.customer_id IS NOT NULL OR p_data ? 'customer_id' AND p_data->>'customer_id' IS NOT NULL THEN
      IF customer.id IS NULL OR workspace_private.professional_erased_customer(customer.id) THEN RAISE EXCEPTION 'professional_customer_required'; END IF;
    END IF;
    customer_name := coalesce(p_data->>'customer_name', CASE WHEN p_action = 'walkin' THEN 'Sin reserva' END);
    customer_contact := p_data->>'customer_contact';
    IF p_action = 'waitlist' THEN
      IF NOT EXISTS(SELECT 1 FROM public.pro_tables t JOIN public.professional_resources r ON r.id = t.resource_id
        WHERE t.organization_id = p_organization_id AND r.active AND r.capacity >= party) THEN RAISE EXCEPTION 'pro_table_party_too_large'; END IF;
      IF (SELECT count(*) FROM public.pro_table_waitlist WHERE organization_id = p_organization_id
        AND status = 'waiting' AND expires_at > clock_timestamp()) >= 500 THEN RAISE EXCEPTION 'professional_limit'; END IF;
      IF customer.id IS NULL THEN
        INSERT INTO public.professional_customers(organization_id, display_name, contact)
          VALUES(p_organization_id, btrim(customer_name), nullif(btrim(customer_contact), '')) RETURNING * INTO customer;
      END IF;
      INSERT INTO public.pro_table_waitlist(organization_id, customer_id, service_id, party_size, note, service_version, expected_total_cents)
        VALUES(p_organization_id, customer.id, service.id, party, coalesce(p_data->>'note', ''), service.version, total) RETURNING id INTO v_queue_id;
    ELSE
      SELECT * INTO table_row FROM public.pro_tables WHERE resource_id = v_table_id AND organization_id = p_organization_id;
      SELECT * INTO resource FROM public.professional_resources WHERE id = v_table_id AND organization_id = p_organization_id AND kind = 'table' AND active;
      IF table_row.resource_id IS NULL OR resource.id IS NULL THEN RAISE EXCEPTION 'pro_table_resource_required'; END IF;
      IF party > resource.capacity THEN RAISE EXCEPTION 'pro_table_party_too_large'; END IF;
      IF EXISTS(SELECT 1 FROM public.professional_resources r WHERE r.id = ANY(service.required_resource_ids)
        AND r.kind = 'table' AND r.id <> v_table_id) THEN RAISE EXCEPTION 'professional_resource_required'; END IF;
      starts := CASE WHEN p_action = 'reserve' THEN (p_data->>'starts_at')::timestamptz ELSE clock_timestamp() END;
      -- Algunos relojes locales tienen resolución de milisegundos. Esperamos
      -- un instante real si coincide con el inicio de transacción, sin cambiar
      -- artificialmente la fecha ni relajar la validación del motor.
      IF p_action <> 'reserve' AND starts <= transaction_timestamp() THEN
        PERFORM pg_sleep(0.001);
        starts := clock_timestamp();
      END IF;
      result := public.professional_book(p_organization_id, service.id, starts, NULL, ARRAY[v_table_id], party,
        CASE WHEN customer.id IS NULL THEN customer_name END, CASE WHEN customer.id IS NULL THEN customer_contact END,
        request_id::text, customer.id, NULL, service.version, total);
      v_booking_id := (result->>'id')::uuid;
      UPDATE public.professional_bookings b SET note = coalesce(queue.note, p_data->>'note', ''), source = coalesce(b.source, v_source)
        WHERE id = v_booking_id;
      INSERT INTO public.pro_table_booking_operations(booking_id, organization_id, table_id, cleaning_minutes)
        VALUES(v_booking_id, p_organization_id, v_table_id, table_row.cleaning_minutes);
      IF p_action <> 'reserve' THEN
        IF result->>'status' = 'requested' THEN PERFORM public.professional_booking_action(p_organization_id, v_booking_id, 'confirm'); END IF;
        UPDATE public.pro_table_booking_operations SET seated_at = clock_timestamp() WHERE booking_id = v_booking_id;
        UPDATE public.professional_bookings SET phase = 'arrived' WHERE id = v_booking_id;
        IF queue.id IS NOT NULL THEN UPDATE public.pro_table_waitlist SET status = 'seated', booking_id = v_booking_id WHERE id = queue.id; END IF;
      END IF;
    END IF;
  ELSIF p_action = 'cancel' AND queue.id IS NOT NULL THEN
    IF queue.status = 'seated' THEN RAISE EXCEPTION 'pro_table_queue_closed'; END IF;
    UPDATE public.pro_table_waitlist SET status = 'cancelled' WHERE id = queue.id;
  ELSE
    IF booking.id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    IF v_table_id IS DISTINCT FROM op.table_id THEN RAISE EXCEPTION 'pro_table_reassignment_unavailable'; END IF;
    IF p_action IN ('confirm','cancel','no_show') THEN
      PERFORM public.professional_booking_action(p_organization_id, booking.id,
        CASE WHEN p_action = 'cancel' THEN 'cancel' ELSE p_action END);
    ELSIF p_action = 'seat' THEN
      IF op.left_at IS NOT NULL OR booking.status <> 'confirmed' THEN RAISE EXCEPTION 'professional_booking_closed'; END IF;
      IF op.seated_at IS NULL THEN
        moment := clock_timestamp();
        IF moment < booking.starts_at - interval '15 minutes' OR moment >= booking.ends_at
          OR NOT workspace_private.professional_slot(p_organization_id, moment, booking.blocked_until,
            booking.resource_ids, booking.party_size, booking.id) THEN RAISE EXCEPTION 'professional_slot_unavailable'; END IF;
        UPDATE public.pro_table_booking_operations SET seated_at = moment WHERE pro_table_booking_operations.booking_id = booking.id;
        UPDATE public.professional_bookings SET phase = 'arrived' WHERE id = booking.id;
      END IF;
    ELSIF p_action = 'leave' THEN
      IF op.left_at IS NULL THEN
        moment := clock_timestamp();
        IF op.seated_at IS NULL OR booking.status <> 'confirmed' THEN
          RAISE EXCEPTION 'professional_booking_closed';
        END IF;
        IF moment <= booking.starts_at THEN RAISE EXCEPTION 'pro_table_early_departure_unavailable'; END IF;
        -- La salida real no significa que se haya cobrado la cuenta.
        UPDATE public.pro_table_booking_operations SET left_at = moment WHERE pro_table_booking_operations.booking_id = booking.id;
        PERFORM public.professional_booking_action(p_organization_id, booking.id, 'attend');
        UPDATE public.professional_bookings SET ends_at = moment, blocked_until = moment + op.cleaning_minutes * interval '1 minute',
          updated_at = clock_timestamp() WHERE id = booking.id;
      END IF;
    ELSIF p_action = 'clean' THEN
      IF op.left_at IS NULL OR booking.status <> 'attended' THEN RAISE EXCEPTION 'professional_booking_closed'; END IF;
      IF op.cleaned_at IS NULL THEN
        moment := clock_timestamp();
        UPDATE public.pro_table_booking_operations SET cleaned_at = moment WHERE pro_table_booking_operations.booking_id = booking.id;
        UPDATE public.professional_bookings SET blocked_until = greatest(ends_at, moment), updated_at = clock_timestamp() WHERE id = booking.id;
      END IF;
    ELSE RAISE EXCEPTION 'professional_invalid_input'; END IF;
  END IF;
  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES(p_organization_id, auth.uid(), request_id, fingerprint, jsonb_build_object('booking_id', v_booking_id, 'queue_id', v_queue_id));
  INSERT INTO public.organization_audit(organization_id, actor_id, action, resource_id)
    VALUES(p_organization_id, auth.uid(), 'pro.table.' || p_action, coalesce(v_booking_id, v_queue_id));
  RETURN workspace_private.pro_table_result(v_booking_id, v_queue_id);
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'workspace_private' AND (p.proname LIKE 'pro_table_%'
      OR p.proname IN ('professional_slot','professional_slot_before_tables')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role', f.signature);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('pro_get_table_operations','pro_save_table','pro_table_operation') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.signature);
  END LOOP;
END $$;
DO $$ DECLARE body text; anchor text := '''/rpc/current_demo_cohort'''; BEGIN
  SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO body;
  IF strpos(body, anchor) = 0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing'; END IF;
  EXECUTE replace(body, anchor, anchor || ',''/rpc/pro_get_table_operations'',''/rpc/pro_save_table'',''/rpc/pro_table_operation''');
END $$;
NOTIFY pgrst, 'reload schema';
