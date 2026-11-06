-- La reserva conserva lo prometido. La sala registra por separado cuánto
-- tiempo se ocupó la mesa y cuándo terminó su limpieza.
CREATE FUNCTION workspace_private.pro_booking_resource_span(
  p_booking public.professional_bookings,
  p_resource uuid,
  p_now timestamptz
) RETURNS tstzrange
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT tstzrange(
    least(p_booking.starts_at, coalesce(operation.seated_at, p_booking.starts_at)),
    CASE
      WHEN operation.left_at IS NOT NULL THEN
        least(
          coalesce(operation.cleaned_at, operation.left_at + operation.cleaning_minutes * interval '1 minute'),
          operation.left_at + operation.cleaning_minutes * interval '1 minute'
        )
      WHEN operation.seated_at IS NOT NULL THEN
        greatest(p_booking.blocked_until, p_now + operation.cleaning_minutes * interval '1 minute')
      ELSE p_booking.blocked_until
    END,
    '[)'
  )
  FROM (SELECT 1) singleton
  LEFT JOIN public.pro_table_booking_operations operation
    ON operation.booking_id = p_booking.id AND operation.table_id = p_resource
$$;

-- Una sola comprobación mantiene horarios, excepciones y unidades del motor.
-- Solo las mesas con operación de sala utilizan su ocupación real. Los demás
-- recursos de una misma reserva conservan el intervalo contratado.
CREATE OR REPLACE FUNCTION workspace_private.professional_slot(
  p_org uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_resources uuid[],
  p_party integer,
  p_ignore uuid DEFAULT NULL,
  p_ignore_session uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  settings public.professional_settings;
  resource public.professional_resources;
  local_start timestamp;
  local_end timestamp;
  midnight timestamptz;
  moment timestamptz := clock_timestamp();
  point timestamptz;
  used integer;
  exclusive boolean;
BEGIN
  SELECT * INTO settings FROM public.professional_settings WHERE organization_id = p_org;
  IF NOT FOUND OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start
    OR p_resources IS NULL OR p_party < 1 THEN RETURN false; END IF;
  local_start := p_start AT TIME ZONE settings.timezone;
  local_end := p_end AT TIME ZONE settings.timezone;
  IF p_end > p_start + interval '18 hours' THEN RETURN false; END IF;
  IF local_start::date <> local_end::date AND local_end::time <> time '00:00' THEN
    midnight := (local_start::date + interval '1 day') AT TIME ZONE settings.timezone;
    RETURN workspace_private.professional_slot(
      p_org, p_start, midnight, p_resources, p_party, p_ignore, p_ignore_session
    ) AND workspace_private.professional_slot(
      p_org, midnight, p_end, p_resources, p_party, p_ignore, p_ignore_session
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.professional_availability availability
    WHERE availability.organization_id = p_org AND availability.resource_id IS NULL
      AND availability.weekday = extract(dow FROM local_start)::integer
      AND local_start >= local_start::date + availability.start_minute * interval '1 minute'
      AND local_end <= local_start::date + availability.end_minute * interval '1 minute'
  ) OR EXISTS (
    SELECT 1 FROM public.professional_exceptions exception
    WHERE exception.organization_id = p_org AND exception.resource_id IS NULL
      AND exception.local_date = local_start::date
  ) THEN RETURN false; END IF;
  IF cardinality(p_resources) <> (
    SELECT count(DISTINCT id) FROM public.professional_resources
    WHERE organization_id = p_org AND id = ANY(p_resources) AND active
  ) THEN RETURN false; END IF;

  FOR resource IN SELECT * FROM public.professional_resources
    WHERE organization_id = p_org AND id = ANY(p_resources)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.professional_exceptions exception
      WHERE exception.organization_id = p_org AND exception.resource_id = resource.id
        AND exception.local_date = local_start::date
    ) THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM public.professional_availability availability
      WHERE availability.organization_id = p_org AND availability.resource_id = resource.id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.professional_availability availability
      WHERE availability.organization_id = p_org AND availability.resource_id = resource.id
        AND availability.weekday = extract(dow FROM local_start)::integer
        AND local_start >= local_start::date + availability.start_minute * interval '1 minute'
        AND local_end <= local_start::date + availability.end_minute * interval '1 minute'
    ) THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM public.professional_sessions session
      WHERE session.organization_id = p_org AND session.status = 'open'
        AND resource.id = ANY(session.resource_ids) AND session.id IS DISTINCT FROM p_ignore_session
        AND session.starts_at < p_end AND session.blocked_until > p_start
    ) THEN RETURN false; END IF;

    exclusive := EXISTS (
      SELECT 1 FROM public.pro_tables table_plan
      WHERE table_plan.resource_id = resource.id AND table_plan.exclusive
    ) OR EXISTS (
      SELECT 1 FROM public.pro_resource_policies policy
      WHERE policy.resource_id = resource.id AND policy.allocation_mode = 'exclusive'
    );
    -- Se comprueba cada inicio real de solapamiento, no la suma de reservas
    -- que utilizan la misma mesa en momentos diferentes.
    FOR point IN
      SELECT p_start
      UNION
      SELECT greatest(lower(span.value), p_start)
      FROM public.professional_bookings booking
      CROSS JOIN LATERAL (
        SELECT workspace_private.pro_booking_resource_span(booking, resource.id, moment) AS value
      ) span
      WHERE booking.organization_id = p_org AND booking.id IS DISTINCT FROM p_ignore
        AND booking.session_id IS NULL AND booking.status IN ('requested', 'confirmed', 'attended')
        AND resource.id = ANY(booking.resource_ids) AND span.value && tstzrange(p_start, p_end, '[)')
    LOOP
      SELECT coalesce(sum(
        CASE WHEN resource.kind IN ('staff', 'equipment', 'room', 'court')
          THEN 1 ELSE booking.party_size END
      ), 0) INTO used
      FROM public.professional_bookings booking
      WHERE booking.organization_id = p_org AND booking.id IS DISTINCT FROM p_ignore
        AND booking.session_id IS NULL AND booking.status IN ('requested', 'confirmed', 'attended')
        AND resource.id = ANY(booking.resource_ids)
        AND workspace_private.pro_booking_resource_span(booking, resource.id, moment) @> point;
      IF exclusive AND used > 0 OR used + (
        CASE WHEN resource.kind IN ('staff', 'equipment', 'room', 'court') THEN 1 ELSE p_party END
      ) > resource.capacity THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION workspace_private.pro_table_booking_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cleaning integer;
  operation public.pro_table_booking_operations;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT * INTO operation FROM public.pro_table_booking_operations WHERE booking_id = NEW.id;
    IF operation.booking_id IS NOT NULL AND NEW.resource_ids IS DISTINCT FROM OLD.resource_ids THEN
      RAISE EXCEPTION 'pro_table_reassignment_unavailable';
    END IF;
  END IF;
  SELECT max(table_plan.cleaning_minutes) INTO cleaning FROM public.pro_tables table_plan
    WHERE table_plan.organization_id = NEW.organization_id AND table_plan.resource_id = ANY(NEW.resource_ids);
  IF cleaning IS NULL OR NEW.session_id IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 195));
  IF TG_OP = 'UPDATE' THEN
    IF operation.seated_at IS NOT NULL THEN
      IF ROW(NEW.starts_at, NEW.ends_at, NEW.blocked_until, NEW.resource_ids, NEW.party_size)
        IS DISTINCT FROM ROW(OLD.starts_at, OLD.ends_at, OLD.blocked_until, OLD.resource_ids, OLD.party_size)
        OR NEW.reschedule IS DISTINCT FROM OLD.reschedule AND NEW.reschedule IS NOT NULL THEN
        RAISE EXCEPTION 'pro_table_seated';
      END IF;
      IF operation.left_at IS NULL AND NEW.status <> 'confirmed' THEN
        RAISE EXCEPTION 'pro_table_seated';
      END IF;
      IF operation.left_at IS NOT NULL AND NEW.status <> 'attended' THEN
        RAISE EXCEPTION 'pro_table_booking_closed';
      END IF;
      -- Finalizar asistencia no vuelve a comprobar una disponibilidad pasada.
      -- La operación sigue protegida por la misma cerradura del motor.
      RETURN NEW;
    END IF;
    IF ROW(NEW.starts_at, NEW.ends_at, NEW.blocked_until, NEW.resource_ids, NEW.party_size, NEW.status)
      IS NOT DISTINCT FROM ROW(OLD.starts_at, OLD.ends_at, OLD.blocked_until, OLD.resource_ids, OLD.party_size, OLD.status)
      THEN RETURN NEW; END IF;
  END IF;
  IF NEW.status NOT IN ('requested', 'confirmed', 'attended') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.resource_ids IS DISTINCT FROM OLD.resource_ids THEN
    NEW.blocked_until := greatest(NEW.blocked_until, NEW.ends_at + cleaning * interval '1 minute');
  END IF;
  IF NOT workspace_private.professional_slot(
    NEW.organization_id, NEW.starts_at, NEW.blocked_until, NEW.resource_ids, NEW.party_size, NEW.id
  ) THEN RAISE EXCEPTION 'professional_slot_unavailable'; END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION public.pro_table_operation(uuid, text, jsonb, uuid) SET SCHEMA workspace_private;
ALTER FUNCTION workspace_private.pro_table_operation(uuid, text, jsonb, uuid)
  RENAME TO pro_table_operation_before_actual_intervals;
CREATE FUNCTION public.pro_table_operation(
  p_organization_id uuid, p_action text, p_data jsonb DEFAULT '{}', p_record_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  booking public.professional_bookings;
  operation public.pro_table_booking_operations;
  prior public.professional_write_requests;
  request_id uuid;
  fingerprint text;
  moment timestamptz;
BEGIN
  IF p_action IS DISTINCT FROM 'leave' AND p_action IS DISTINCT FROM 'clean' THEN
    RETURN workspace_private.pro_table_operation_before_actual_intervals(
      p_organization_id, p_action, p_data, p_record_id
    );
  END IF;
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  IF NOT (public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage')) THEN
    RAISE EXCEPTION 'professional_forbidden';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 12000
    OR p_data ?| ARRAY['student', 'verified', 'user_id', 'paid_cents', 'price_cents'] THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  request_id := (p_data->>'client_request_id')::uuid;
  IF request_id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  fingerprint := md5(jsonb_build_array('pro.table.operation', p_action, p_record_id, p_data - 'client_request_id')::text);
  SELECT * INTO prior FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = request_id;
  IF FOUND THEN
    IF prior.fingerprint <> fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.pro_table_result((prior.result->>'booking_id')::uuid, (prior.result->>'queue_id')::uuid);
  END IF;
  SELECT * INTO booking FROM public.professional_bookings
    WHERE id = p_record_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
  SELECT * INTO operation FROM public.pro_table_booking_operations WHERE booking_id = booking.id;
  IF operation.booking_id IS NULL THEN RAISE EXCEPTION 'pro_table_booking_required'; END IF;
  IF p_data ? 'table_id' AND (p_data->>'table_id')::uuid IS DISTINCT FROM operation.table_id THEN
    RAISE EXCEPTION 'pro_table_reassignment_unavailable';
  END IF;
  IF p_action = 'leave' AND operation.left_at IS NULL THEN
    IF operation.seated_at IS NULL OR booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'professional_booking_closed';
    END IF;
    moment := clock_timestamp();
    UPDATE public.pro_table_booking_operations SET left_at = moment WHERE booking_id = booking.id;
    -- El motor permite asistencia desde 15 minutos antes del inicio. Conserva
    -- sus comprobaciones, historial y bonos sin inferir un cobro de la cuenta.
    PERFORM public.professional_booking_action(p_organization_id, booking.id, 'attend');
  ELSIF p_action = 'clean' THEN
    IF operation.left_at IS NULL OR booking.status <> 'attended' THEN
      RAISE EXCEPTION 'professional_booking_closed';
    END IF;
    IF operation.cleaned_at IS NULL THEN
      UPDATE public.pro_table_booking_operations SET cleaned_at = clock_timestamp() WHERE booking_id = booking.id;
      UPDATE public.professional_bookings SET updated_at = clock_timestamp() WHERE id = booking.id;
    END IF;
  END IF;
  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES(p_organization_id, auth.uid(), request_id, fingerprint, jsonb_build_object('booking_id', booking.id, 'queue_id', NULL));
  INSERT INTO public.organization_audit(organization_id, actor_id, action, resource_id)
    VALUES(p_organization_id, auth.uid(), 'pro.table.' || p_action, booking.id);
  RETURN workspace_private.pro_table_result(booking.id);
END $$;

REVOKE ALL ON FUNCTION workspace_private.pro_booking_resource_span(public.professional_bookings, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION workspace_private.pro_table_operation_before_actual_intervals(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pro_table_operation(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pro_table_operation(uuid, text, jsonb, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
