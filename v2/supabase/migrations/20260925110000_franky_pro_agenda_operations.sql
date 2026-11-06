-- Operaciones de agenda. Los cobros de esta migración son registros externos:
-- no realizan cargos, no activan planes y no cambian los precios del catálogo.
ALTER TABLE public.professional_customers
  ADD COLUMN notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  ADD COLUMN technical text NOT NULL DEFAULT '' CHECK (length(technical) <= 4000),
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 20 AND length(tags::text) <= 1000),
  ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN consent_recorded_at timestamptz,
  ADD COLUMN consent_recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.professional_services
  ADD COLUMN category text NOT NULL DEFAULT 'General' CHECK (length(btrim(category)) BETWEEN 1 AND 80),
  ADD COLUMN online boolean NOT NULL DEFAULT true,
  ADD COLUMN eligible_staff_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(eligible_staff_ids) <= 100);

ALTER TABLE public.professional_bookings
  ADD COLUMN note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  ADD COLUMN source text CHECK (source IN ('franky','card','instagram','phone','walkin','google','grupo')),
  ADD COLUMN trial boolean NOT NULL DEFAULT false,
  ADD COLUMN phase text CHECK (phase IN ('arrived','in_service'));

-- Este serializador también lo usan las RPC anteriores de reservas. Las notas
-- internas no viajan al cliente ni a roles sin permiso para gestionar contenido.
CREATE OR REPLACE FUNCTION workspace_private.professional_booking_json(p_booking uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (to_jsonb(b) - ARRAY['request_hash','request_key','created_by','erased_request_key_hash','note'])
    || jsonb_build_object('customer_name', c.display_name,
      'service_name', b.price_snapshot->>'service_name', 'timezone', s.timezone)
    || CASE WHEN public.has_organization_permission(b.organization_id, 'content.manage')
      THEN jsonb_build_object('note', b.note) ELSE '{}'::jsonb END
  FROM public.professional_bookings b
  JOIN public.professional_customers c ON c.id = b.customer_id
  JOIN public.professional_settings s ON s.organization_id = b.organization_id
  WHERE b.id = p_booking
$$;

CREATE TABLE public.pro_agenda_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),
  booking_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  tip_cents integer NOT NULL DEFAULT 0 CHECK (tip_cents BETWEEN 0 AND 1000000),
  method text NOT NULL CHECK (method IN ('cash','card','bizum')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id, booking_id) REFERENCES public.professional_bookings(organization_id, id)
);
CREATE INDEX pro_agenda_payments_booking ON public.pro_agenda_payments(organization_id, booking_id);
CREATE INDEX pro_agenda_payments_date ON public.pro_agenda_payments(organization_id, recorded_at);
ALTER TABLE public.pro_agenda_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_agenda_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_agenda_payments TO service_role;

-- Se conserva la huella de la solicitud original antes de elegir automáticamente
-- profesional. Reintentar no vuelve a buscar otro hueco ni otro profesional.
CREATE TABLE public.pro_agenda_booking_requests (
  organization_id uuid NOT NULL REFERENCES public.professional_settings(organization_id),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_key_hash text NOT NULL,
  fingerprint text NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.professional_bookings(id),
  UNIQUE (organization_id, actor_id, request_key_hash)
);
ALTER TABLE public.pro_agenda_booking_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_agenda_booking_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_agenda_booking_requests TO service_role;

-- La eliminación de cuenta también limpia las nuevas notas. Los importes
-- compartidos se conservan sin guardar nombres ni contactos en el libro de caja.
CREATE FUNCTION workspace_private.pro_agenda_erasure_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'professional_customers' THEN
    IF NEW.erased_at IS NOT NULL OR workspace_private.professional_erased_user(NEW.user_id) THEN
      NEW.notes := ''; NEW.technical := ''; NEW.tags := '{}';
      NEW.marketing_consent := false;
      NEW.consent_recorded_at := NULL; NEW.consent_recorded_by := NULL;
    END IF;
  ELSE
    IF workspace_private.professional_erased_customer(NEW.customer_id) THEN
      NEW.note := ''; NEW.source := NULL; NEW.trial := false; NEW.phase := NULL;
    END IF;
    IF NEW.status NOT IN ('confirmed') THEN NEW.phase := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_pro_agenda_erasure BEFORE INSERT OR UPDATE ON public.professional_customers
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_agenda_erasure_guard();
CREATE TRIGGER zz_pro_agenda_erasure BEFORE INSERT OR UPDATE ON public.professional_bookings
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_agenda_erasure_guard();

CREATE FUNCTION workspace_private.pro_agenda_customer_json(p_customer uuid, p_manage boolean, p_finance boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'organization_id', c.organization_id, 'display_name', c.display_name,
    'user_id', c.user_id, 'contact', CASE WHEN p_manage THEN c.contact END,
    'created_at', c.created_at,
    'notes', CASE WHEN p_manage THEN c.notes ELSE '' END,
    'technical', CASE WHEN p_manage THEN c.technical ELSE '' END,
    'tags', CASE WHEN p_manage THEN c.tags ELSE '{}'::text[] END,
    'marketing_consent', CASE WHEN p_manage THEN c.marketing_consent ELSE false END,
    'consent_recorded_at', CASE WHEN p_manage THEN c.consent_recorded_at END,
    'visits', (SELECT count(*) FROM public.professional_bookings b WHERE b.customer_id = c.id AND b.status = 'attended'),
    'no_shows', (SELECT count(*) FROM public.professional_bookings b WHERE b.customer_id = c.id AND b.status = 'no_show'),
    'last_visit', (SELECT max(b.starts_at) FROM public.professional_bookings b WHERE b.customer_id = c.id AND b.status = 'attended'),
    'spent_cents', CASE WHEN p_finance THEN
      (SELECT coalesce(sum(p.amount_cents), 0) FROM public.pro_agenda_payments p
        JOIN public.professional_bookings b ON b.id = p.booking_id WHERE b.customer_id = c.id)
      + (SELECT coalesce(sum(b.deposit_cents), 0) FROM public.professional_bookings b
        WHERE b.customer_id = c.id AND b.deposit_status = 'paid') END
  ) FROM public.professional_customers c WHERE c.id = p_customer
$$;

CREATE FUNCTION public.pro_get_agenda_operations(
  p_organization_id uuid, p_from timestamptz, p_until timestamptz,
  p_customer_cursor uuid DEFAULT NULL, p_limit integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  can_manage boolean;
  can_operate boolean;
  can_finance boolean;
  ids uuid[];
  lim integer := least(greatest(coalesce(p_limit, 300), 1), 1000);
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from OR p_until > p_from + interval '366 days' THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  can_manage := public.has_organization_permission(p_organization_id, 'content.manage');
  can_operate := can_manage OR public.has_organization_permission(p_organization_id, 'attendees.manage');
  can_finance := public.has_organization_permission(p_organization_id, 'finance.read');
  IF can_operate OR can_finance THEN
    SELECT array_agg(x.id ORDER BY x.id) INTO ids FROM (
      SELECT c.id FROM public.professional_customers c
      WHERE c.organization_id = p_organization_id AND (p_customer_cursor IS NULL OR c.id > p_customer_cursor)
      ORDER BY c.id LIMIT lim + 1
    ) x;
  END IF;
  RETURN jsonb_build_object(
    'customers', coalesce((SELECT jsonb_agg(workspace_private.pro_agenda_customer_json(id, can_manage, can_finance) ORDER BY id)
      FROM unnest(ids[1:lim]) id), '[]'::jsonb),
    'next_customer_cursor', CASE WHEN cardinality(ids) > lim THEN ids[lim] END,
    'services', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name)
      FROM public.professional_services s WHERE s.organization_id = p_organization_id), '[]'::jsonb),
    'sessions', coalesce((SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object(
      'reserved_seats', (SELECT coalesce(sum(b.party_size), 0) FROM public.professional_bookings b
        WHERE b.session_id = s.id AND b.status IN ('requested','confirmed','attended')),
      'waitlisted_seats', (SELECT coalesce(sum(b.party_size), 0) FROM public.professional_bookings b
        WHERE b.session_id = s.id AND b.status = 'waitlisted')) ORDER BY s.starts_at, s.id)
      FROM public.professional_sessions s WHERE s.organization_id = p_organization_id
        AND s.starts_at >= p_from AND s.starts_at < p_until), '[]'::jsonb),
    'bookings', CASE WHEN can_operate OR can_finance THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'phase', b.phase, 'note', CASE WHEN can_manage THEN b.note ELSE '' END,
        'source', b.source, 'trial', b.trial,
        'paid_cents', CASE WHEN can_finance THEN
          (SELECT coalesce(sum(p.amount_cents), 0) FROM public.pro_agenda_payments p WHERE p.booking_id = b.id)
          + CASE WHEN b.deposit_status = 'paid' THEN b.deposit_cents ELSE 0 END END)
        ORDER BY b.starts_at, b.id)
      FROM public.professional_bookings b WHERE b.organization_id = p_organization_id
        AND b.starts_at >= p_from AND b.starts_at < p_until), '[]'::jsonb) ELSE '[]'::jsonb END,
    'payments', CASE WHEN can_finance THEN coalesce((
      SELECT jsonb_agg(to_jsonb(p) - 'recorded_by' ORDER BY p.recorded_at, p.id)
      FROM public.pro_agenda_payments p WHERE p.organization_id = p_organization_id
        AND p.recorded_at >= p_from AND p.recorded_at < p_until), '[]'::jsonb) ELSE '[]'::jsonb END,
    'can_record_payment', public.has_organization_permission(p_organization_id, 'finance.manage'),
    'review_stats', (SELECT jsonb_build_object('rating', round(avg(r.rating)::numeric, 1), 'count', count(*))
      FROM public.pro_reviews r WHERE r.organization_id = p_organization_id AND NOT r.hidden),
    'limits', jsonb_build_object(
      'offers_truncated', (SELECT count(*) > 100 FROM public.pro_offers WHERE organization_id = p_organization_id),
      'reviews_truncated', (SELECT count(*) > 50 FROM public.pro_reviews WHERE organization_id = p_organization_id AND NOT hidden),
      'group_requests_truncated', (SELECT count(*) > 200 FROM public.pro_group_requests
        WHERE organization_id = p_organization_id AND status IN ('new','quoted','accepted')))
  );
END $$;

-- Las respuestas de reintento se reconstruyen desde los registros actuales.
-- El registro de idempotencia no guarda copias de nombres, contactos o notas.
CREATE FUNCTION public.pro_save_agenda_record(
  p_organization_id uuid, p_entity text, p_record_id uuid DEFAULT NULL, p_data jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  record_id uuid := p_record_id;
  request_id uuid;
  fingerprint text;
  previous public.professional_write_requests;
  customer public.professional_customers;
  service public.professional_services;
  staff_ids uuid[];
  result jsonb;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'content.manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 16000
    OR p_entity NOT IN ('customer','service','booking') OR p_entity IS NULL THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  request_id := (p_data->>'client_request_id')::uuid;
  IF request_id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  fingerprint := md5(jsonb_build_array('pro.agenda.save', p_entity, p_record_id, p_data - 'client_request_id')::text);
  SELECT * INTO previous FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = request_id;
  IF FOUND THEN
    IF previous.fingerprint <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    record_id := (previous.result->>'id')::uuid;
    IF p_entity = 'customer' THEN RETURN workspace_private.pro_agenda_customer_json(record_id, true,
      public.has_organization_permission(p_organization_id, 'finance.read')); END IF;
    IF p_entity = 'service' THEN RETURN (SELECT to_jsonb(s) FROM public.professional_services s WHERE id = record_id); END IF;
    RETURN workspace_private.professional_booking_json(record_id);
  END IF;
  IF p_entity = 'customer' THEN
    PERFORM workspace_private.professional_require(p_organization_id, 'content.manage');
    IF record_id IS NOT NULL THEN
      SELECT * INTO customer FROM public.professional_customers
        WHERE id = record_id AND organization_id = p_organization_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
      IF workspace_private.professional_erased_customer(record_id) THEN RAISE EXCEPTION 'professional_customer_erased'; END IF;
    END IF;
    IF p_data ?| ARRAY['user_id','student','verified','source'] THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    IF p_data ? 'marketing_consent' AND (p_data->>'marketing_consent')::boolean
      AND coalesce((p_data->>'consent_confirmed')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'pro_consent_confirmation_required';
    END IF;
    record_id := coalesce(record_id, gen_random_uuid());
    INSERT INTO public.professional_customers(id, organization_id, display_name, contact, notes, technical, tags,
      marketing_consent, consent_recorded_at, consent_recorded_by)
    VALUES(record_id, p_organization_id, coalesce(p_data->>'display_name', customer.display_name),
      CASE WHEN p_data ? 'contact' THEN nullif(btrim(p_data->>'contact'), '') ELSE customer.contact END,
      coalesce(p_data->>'notes', customer.notes, ''), coalesce(p_data->>'technical', customer.technical, ''),
      CASE WHEN p_data ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')) ELSE coalesce(customer.tags, '{}') END,
      coalesce((p_data->>'marketing_consent')::boolean, customer.marketing_consent, false),
      CASE WHEN p_data ? 'marketing_consent' THEN now() ELSE customer.consent_recorded_at END,
      CASE WHEN p_data ? 'marketing_consent' THEN auth.uid() ELSE customer.consent_recorded_by END)
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, contact = excluded.contact,
      notes = excluded.notes, technical = excluded.technical, tags = excluded.tags,
      marketing_consent = excluded.marketing_consent, consent_recorded_at = excluded.consent_recorded_at,
      consent_recorded_by = excluded.consent_recorded_by;
    result := workspace_private.pro_agenda_customer_json(record_id, true,
      public.has_organization_permission(p_organization_id, 'finance.read'));
  ELSIF p_entity = 'service' THEN
    IF p_data ?| ARRAY['student_price_cents','valley_price_cents'] THEN RAISE EXCEPTION 'pro_price_rule_unavailable'; END IF;
    IF p_data ? 'expected_version' AND NOT EXISTS(SELECT 1 FROM public.professional_services s
      WHERE s.id = record_id AND s.organization_id = p_organization_id
        AND s.version = (p_data->>'expected_version')::integer) THEN
      RAISE EXCEPTION 'professional_quote_changed';
    END IF;
    -- La operación base y sus metadatos forman una sola transacción.
    result := public.professional_save_record(p_organization_id, 'service', record_id,
      p_data - ARRAY['client_request_id','category','online','eligible_staff_ids','expected_version']);
    record_id := (result->>'id')::uuid;
    SELECT * INTO service FROM public.professional_services WHERE id = record_id;
    staff_ids := CASE WHEN p_data ? 'eligible_staff_ids'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'eligible_staff_ids')::uuid)
      ELSE service.eligible_staff_ids END;
    IF cardinality(staff_ids) <> (SELECT count(*) FROM public.professional_resources r
      WHERE r.organization_id = p_organization_id AND r.id = ANY(staff_ids) AND r.kind = 'staff' AND r.active)
      OR (cardinality(staff_ids) > 0 AND (NOT service.staff_required OR service.mode = 'session'))
      OR EXISTS(SELECT 1 FROM public.professional_resources r WHERE r.id = ANY(service.required_resource_ids)
        AND r.kind = 'staff' AND cardinality(staff_ids) > 0 AND NOT r.id = ANY(staff_ids)) THEN
      RAISE EXCEPTION 'professional_resource_required';
    END IF;
    UPDATE public.professional_services SET category = coalesce(p_data->>'category', category),
      online = coalesce((p_data->>'online')::boolean, online), eligible_staff_ids = staff_ids
      WHERE id = record_id RETURNING to_jsonb(professional_services) INTO result;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.professional_bookings WHERE id = record_id AND organization_id = p_organization_id) THEN
      RAISE EXCEPTION 'professional_forbidden';
    END IF;
    IF p_data ? 'source' AND coalesce(p_data->>'source', '') NOT IN ('instagram','phone','walkin','google','grupo') THEN
      RAISE EXCEPTION 'pro_source_not_manual';
    END IF;
    UPDATE public.professional_bookings SET note = coalesce(p_data->>'note', note),
      source = CASE WHEN p_data ? 'source' AND source IS NULL THEN p_data->>'source' ELSE source END,
      trial = coalesce((p_data->>'trial')::boolean, trial), updated_at = now()
      WHERE id = record_id;
    result := workspace_private.professional_booking_json(record_id);
  END IF;
  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES(p_organization_id, auth.uid(), request_id, fingerprint, jsonb_build_object('id', record_id));
  INSERT INTO public.organization_audit(organization_id, actor_id, action, resource_id)
    VALUES(p_organization_id, auth.uid(), 'pro.agenda.' || p_entity || '.saved', record_id);
  RETURN result;
END $$;

CREATE FUNCTION public.pro_booking_operation(
  p_organization_id uuid, p_booking_id uuid, p_action text, p_data jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  booking public.professional_bookings;
  previous public.professional_write_requests;
  request_id uuid;
  fingerprint text;
  result jsonb;
  amount integer;
  tip integer;
  paid bigint;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  IF p_action = 'payment' THEN
    PERFORM public.workspace_require(p_organization_id, 'finance.manage');
  ELSIF NOT (public.has_organization_permission(p_organization_id, 'content.manage')
      OR public.has_organization_permission(p_organization_id, 'attendees.manage')) THEN
    RAISE EXCEPTION 'professional_forbidden';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  SELECT * INTO booking FROM public.professional_bookings
    WHERE id = p_booking_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 4000 THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  request_id := (p_data->>'client_request_id')::uuid;
  IF request_id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  fingerprint := md5(jsonb_build_array('pro.agenda.operation', p_booking_id, p_action, p_data - 'client_request_id')::text);
  SELECT * INTO previous FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = request_id;
  IF FOUND THEN
    IF previous.fingerprint <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.professional_booking_json(booking.id);
  END IF;
  IF p_action IN ('arrived','in_service') THEN
    IF booking.status <> 'confirmed' OR booking.starts_at > now() + interval '2 hours' THEN
      RAISE EXCEPTION 'professional_booking_closed';
    END IF;
    IF p_action = 'in_service' AND booking.phase IS DISTINCT FROM 'arrived' AND booking.phase IS DISTINCT FROM 'in_service' THEN
      RAISE EXCEPTION 'professional_booking_closed';
    END IF;
    IF booking.phase = 'in_service' AND p_action = 'arrived' THEN RAISE EXCEPTION 'professional_booking_closed'; END IF;
    UPDATE public.professional_bookings SET phase = p_action, updated_at = now() WHERE id = booking.id;
  ELSIF p_action = 'payment' THEN
    IF booking.status NOT IN ('confirmed','attended') THEN RAISE EXCEPTION 'professional_booking_closed'; END IF;
    amount := (p_data->>'amount_cents')::integer;
    tip := coalesce((p_data->>'tip_cents')::integer, 0);
    IF amount IS NULL OR amount < 1 OR tip NOT BETWEEN 0 AND 1000000
      OR coalesce(p_data->>'method', '') NOT IN ('cash','card','bizum') THEN
      RAISE EXCEPTION 'professional_invalid_input';
    END IF;
    SELECT coalesce(sum(amount_cents), 0) INTO paid FROM public.pro_agenda_payments WHERE booking_id = booking.id;
    paid := paid + CASE WHEN booking.deposit_status = 'paid' THEN booking.deposit_cents ELSE 0 END;
    IF paid + amount > booking.total_cents THEN RAISE EXCEPTION 'pro_payment_exceeds_total'; END IF;
    INSERT INTO public.pro_agenda_payments(organization_id, booking_id, amount_cents, tip_cents, method, recorded_by)
      VALUES(p_organization_id, booking.id, amount, tip, p_data->>'method', auth.uid());
    IF coalesce((p_data->>'complete')::boolean, false) THEN
      IF paid + amount <> booking.total_cents THEN RAISE EXCEPTION 'pro_payment_incomplete'; END IF;
      PERFORM public.professional_booking_action(p_organization_id, booking.id, 'attend');
    END IF;
  ELSIF p_action = 'move' THEN
    -- Los cambios de profesional necesitan una propuesta de recursos versionada.
    -- Hasta disponer de ese contrato, no se cambia silenciosamente su asignación.
    IF p_data ? 'resource_ids' OR (p_data ? 'staff_id' AND NOT (p_data->>'staff_id')::uuid = ANY(booking.resource_ids)) THEN
      RAISE EXCEPTION 'pro_reassignment_unavailable';
    END IF;
    PERFORM public.professional_booking_action(p_organization_id, booking.id, 'propose_reschedule',
      jsonb_build_object('starts_at', p_data->>'starts_at'));
    IF booking.customer_user_id IS NULL THEN
      PERFORM public.professional_booking_action(p_organization_id, booking.id, 'accept_reschedule');
    END IF;
  ELSE RAISE EXCEPTION 'professional_invalid_input'; END IF;
  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES(p_organization_id, auth.uid(), request_id, fingerprint, jsonb_build_object('id', booking.id));
  INSERT INTO public.professional_booking_history(organization_id, booking_id, actor_id, action)
    VALUES(p_organization_id, booking.id, auth.uid(), 'pro.' || p_action);
  result := workspace_private.professional_booking_json(booking.id);
  RETURN result;
END $$;

-- Se conserva el motor de reservas y se compone su API, sin modificar su texto.
ALTER FUNCTION public.professional_book(uuid,uuid,timestamptz,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid)
  SET SCHEMA workspace_private;
ALTER FUNCTION workspace_private.professional_book(uuid,uuid,timestamptz,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid)
  RENAME TO professional_book_before_pro_agenda;
CREATE FUNCTION public.professional_book(
  p_organization_id uuid, p_service_id uuid, p_starts_at timestamptz,
  p_session_id uuid DEFAULT NULL, p_resource_ids uuid[] DEFAULT '{}', p_party_size integer DEFAULT 1,
  p_customer_name text DEFAULT NULL, p_customer_contact text DEFAULT NULL, p_request_key text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL, p_bundle_id uuid DEFAULT NULL, p_expected_service_version integer DEFAULT NULL,
  p_expected_total_cents integer DEFAULT NULL, p_expected_terms text DEFAULT NULL, p_card_quote_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  service public.professional_services;
  resources uuid[] := p_resource_ids;
  required uuid[];
  selected uuid;
  result jsonb;
  operator boolean;
  previous public.pro_agenda_booking_requests;
  legacy public.professional_bookings;
  fingerprint text;
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 160 OR p_resource_ids IS NULL
    OR p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 500 OR cardinality(p_resource_ids) > 20 THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  fingerprint := md5(jsonb_build_array(p_service_id, p_starts_at, p_session_id, p_resource_ids,
    p_party_size, p_customer_name, p_customer_contact, p_customer_id, p_bundle_id, p_card_quote_id)::text);
  operator := public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage');
  SELECT * INTO previous FROM public.pro_agenda_booking_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key_hash = md5(p_request_key);
  IF FOUND THEN
    IF NOT operator AND NOT EXISTS(SELECT 1 FROM public.professional_bookings b
      WHERE b.id = previous.booking_id AND b.organization_id = p_organization_id AND b.customer_user_id = auth.uid()) THEN
      RAISE EXCEPTION 'professional_forbidden' USING ERRCODE = '42501';
    END IF;
    IF previous.fingerprint <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.professional_booking_json(previous.booking_id);
  END IF;
  -- También se conservan los reintentos de citas creadas antes de esta extensión,
  -- aunque después se haya archivado el servicio o cambiado su equipo elegible.
  SELECT * INTO legacy FROM public.professional_bookings
    WHERE organization_id = p_organization_id AND created_by = auth.uid()
      AND (request_key = p_request_key OR erased_request_key_hash = workspace_private.professional_erased_key(p_request_key));
  IF FOUND THEN
    IF NOT operator AND legacy.customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'professional_forbidden' USING ERRCODE = '42501';
    END IF;
    IF legacy.request_hash <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.professional_booking_json(legacy.id);
  END IF;
  SELECT * INTO service FROM public.professional_services WHERE id = p_service_id AND organization_id = p_organization_id;
  IF NOT FOUND OR (NOT operator AND NOT service.online) THEN RAISE EXCEPTION 'professional_unavailable'; END IF;
  IF cardinality(service.eligible_staff_ids) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT x), '{}') INTO required FROM (
      SELECT unnest(service.required_resource_ids) x UNION SELECT unnest(resources)
    ) r;
    IF EXISTS(SELECT 1 FROM public.professional_resources r WHERE r.id = ANY(required)
      AND r.kind = 'staff' AND NOT r.id = ANY(service.eligible_staff_ids)) THEN
      RAISE EXCEPTION 'professional_resource_required';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.professional_resources r WHERE r.id = ANY(required) AND r.kind = 'staff') THEN
      SELECT r.id INTO selected FROM public.professional_resources r
      WHERE r.organization_id = p_organization_id AND r.id = ANY(service.eligible_staff_ids) AND r.active
        AND workspace_private.professional_slot(p_organization_id, p_starts_at,
          p_starts_at + (service.duration_minutes + service.buffer_minutes) * interval '1 minute',
          array_append(required, r.id), p_party_size)
      ORDER BY r.id LIMIT 1;
      IF selected IS NULL THEN RAISE EXCEPTION 'professional_slot_unavailable'; END IF;
      resources := array_append(resources, selected);
    END IF;
  END IF;
  result := workspace_private.professional_book_before_pro_agenda(p_organization_id, p_service_id, p_starts_at,
    p_session_id, resources, p_party_size, p_customer_name, p_customer_contact, p_request_key, p_customer_id,
    p_bundle_id, p_expected_service_version, p_expected_total_cents, p_expected_terms, p_card_quote_id);
  -- Solo las reservas propias de una cuenta acreditan procedencia Franky/Card.
  UPDATE public.professional_bookings SET source = CASE WHEN card_quote_id IS NOT NULL THEN 'card' ELSE 'franky' END
    WHERE id = (result->>'id')::uuid AND customer_user_id = auth.uid() AND source IS NULL;
  INSERT INTO public.pro_agenda_booking_requests(organization_id, actor_id, request_key_hash, fingerprint, booking_id)
    VALUES(p_organization_id, auth.uid(), md5(p_request_key), fingerprint, (result->>'id')::uuid);
  RETURN workspace_private.professional_booking_json((result->>'id')::uuid);
END $$;

ALTER FUNCTION public.professional_get_slots(uuid,uuid,date,uuid[],integer) SET SCHEMA workspace_private;
ALTER FUNCTION workspace_private.professional_get_slots(uuid,uuid,date,uuid[],integer)
  RENAME TO professional_get_slots_before_pro_agenda;
CREATE FUNCTION public.professional_get_slots(
  p_organization_id uuid, p_service_id uuid, p_date date, p_resource_ids uuid[] DEFAULT '{}', p_party_size integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE service public.professional_services; staff uuid; result jsonb := '[]';
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id);
  SELECT * INTO service FROM public.professional_services WHERE id = p_service_id AND organization_id = p_organization_id;
  IF NOT FOUND OR (NOT service.online AND NOT (public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage'))) THEN
    RAISE EXCEPTION 'professional_unavailable';
  END IF;
  IF cardinality(service.eligible_staff_ids) = 0 THEN
    RETURN workspace_private.professional_get_slots_before_pro_agenda(p_organization_id, p_service_id, p_date, p_resource_ids, p_party_size);
  END IF;
  IF EXISTS(SELECT 1 FROM public.professional_resources r
    WHERE r.id = ANY(p_resource_ids || service.required_resource_ids) AND r.kind = 'staff') THEN
    IF EXISTS(SELECT 1 FROM public.professional_resources r
      WHERE r.id = ANY(p_resource_ids || service.required_resource_ids) AND r.kind = 'staff' AND NOT r.id = ANY(service.eligible_staff_ids)) THEN
      RAISE EXCEPTION 'professional_resource_required';
    END IF;
    RETURN workspace_private.professional_get_slots_before_pro_agenda(p_organization_id, p_service_id, p_date, p_resource_ids, p_party_size);
  END IF;
  FOR staff IN SELECT r.id FROM public.professional_resources r WHERE r.organization_id = p_organization_id
    AND r.id = ANY(service.eligible_staff_ids) AND r.active LOOP
    result := result || workspace_private.professional_get_slots_before_pro_agenda(
      p_organization_id, p_service_id, p_date, array_append(p_resource_ids, staff), p_party_size);
  END LOOP;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb)
    FROM (SELECT DISTINCT value x FROM jsonb_array_elements(result)) slots);
END $$;

-- Alta manual completa: la reserva y sus notas se confirman juntas o se revierte
-- toda la operación, incluida la creación del cliente de mostrador.
CREATE FUNCTION public.pro_create_agenda_booking(p_organization_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; metadata jsonb; request_id uuid; service public.professional_services; expected_total integer;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'content.manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 16000 THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  request_id := (p_data->>'client_request_id')::uuid;
  IF request_id IS NULL OR p_data ?| ARRAY['student','verified','user_id'] THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  IF p_data ? 'source' AND coalesce(p_data->>'source', '') NOT IN ('unknown','phone','walkin','instagram','google','grupo') THEN
    RAISE EXCEPTION 'pro_source_not_manual';
  END IF;
  -- Un reintento conserva la cita ya creada. Una operación nueva debe coincidir
  -- con la tarifa y versión que el equipo tenía delante al confirmar.
  IF NOT EXISTS(SELECT 1 FROM public.pro_agenda_booking_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key_hash = md5(request_id::text))
    AND NOT EXISTS(SELECT 1 FROM public.professional_bookings WHERE organization_id = p_organization_id
      AND created_by = auth.uid() AND request_key = request_id::text) THEN
    SELECT * INTO service FROM public.professional_services
      WHERE id = (p_data->>'service_id')::uuid AND organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    expected_total := CASE WHEN nullif(p_data->>'bundle_id', '') IS NOT NULL THEN 0
      ELSE service.price_cents * CASE WHEN service.price_basis = 'person' THEN coalesce((p_data->>'party_size')::integer, 1) ELSE 1 END END;
    IF (p_data ? 'expected_service_version' AND (p_data->>'expected_service_version')::integer IS DISTINCT FROM service.version)
      OR (p_data ? 'expected_total_cents' AND (p_data->>'expected_total_cents')::integer IS DISTINCT FROM expected_total) THEN
      RAISE EXCEPTION 'professional_quote_changed';
    END IF;
  END IF;
  result := public.professional_book(
    p_organization_id, (p_data->>'service_id')::uuid, (p_data->>'starts_at')::timestamptz,
    (p_data->>'session_id')::uuid,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'resource_ids', '[]'::jsonb))::uuid),
    coalesce((p_data->>'party_size')::integer, 1), p_data->>'customer_name', p_data->>'customer_contact',
    request_id::text, (p_data->>'customer_id')::uuid, (p_data->>'bundle_id')::uuid,
    (p_data->>'expected_service_version')::integer, (p_data->>'expected_total_cents')::integer
  );
  metadata := jsonb_build_object('client_request_id', request_id, 'note', coalesce(p_data->>'note', ''),
    'trial', coalesce((p_data->>'trial')::boolean, false));
  IF p_data ? 'source' AND p_data->>'source' <> 'unknown' THEN
    metadata := metadata || jsonb_build_object('source', p_data->>'source');
  END IF;
  RETURN public.pro_save_agenda_record(p_organization_id, 'booking', (result->>'id')::uuid, metadata);
END $$;

DO $$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'workspace_private.pro_agenda_erasure_guard()', 'workspace_private.pro_agenda_customer_json(uuid,boolean,boolean)',
    'workspace_private.professional_book_before_pro_agenda(uuid,uuid,timestamptz,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid)',
    'workspace_private.professional_get_slots_before_pro_agenda(uuid,uuid,date,uuid[],integer)'
  ] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role', signature); END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'public.pro_get_agenda_operations(uuid,timestamptz,timestamptz,uuid,integer)',
    'public.pro_save_agenda_record(uuid,text,uuid,jsonb)', 'public.pro_booking_operation(uuid,uuid,text,jsonb)',
    'public.pro_create_agenda_booking(uuid,jsonb)',
    'public.professional_book(uuid,uuid,timestamptz,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid)',
    'public.professional_get_slots(uuid,uuid,date,uuid[],integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature);
  END LOOP;
END $$;

-- Añadir rutas únicamente a la lista ya restringida de las cuentas de prueba.
DO $$ DECLARE body text; anchor text := '''/rpc/current_demo_cohort'''; BEGIN
  SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO body;
  IF strpos(body, anchor) = 0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing'; END IF;
  EXECUTE replace(body, anchor, anchor ||
    ',''/rpc/pro_get_space'',''/rpc/pro_get_agenda_operations'',''/rpc/pro_save_agenda_record'',''/rpc/pro_booking_operation'',''/rpc/pro_create_agenda_booking''');
END $$;
NOTIFY pgrst, 'reload schema';
