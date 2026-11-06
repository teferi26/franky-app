-- Política explícita para pistas, salas y puestos. Los recursos anteriores
-- mantienen la unidad y capacidad del motor hasta que se configuren.
CREATE TABLE public.pro_resource_policies (
  resource_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  allocation_mode text NOT NULL CHECK (allocation_mode IN ('exclusive', 'shared')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id, resource_id)
    REFERENCES public.professional_resources(organization_id, id)
);
ALTER TABLE public.pro_resource_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_resource_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_resource_policies TO service_role;

-- Compone la política con las reglas de mesas, horarios, pausas, excepciones
-- y capacidad ya existentes. Una política compartida no cambia esas reglas.
ALTER FUNCTION workspace_private.professional_slot(uuid, timestamptz, timestamptz, uuid[], integer, uuid, uuid)
  RENAME TO professional_slot_before_resource_operations;
CREATE FUNCTION workspace_private.professional_slot(
  p_org uuid, p_start timestamptz, p_end timestamptz, p_resources uuid[], p_party integer,
  p_ignore uuid DEFAULT NULL, p_ignore_session uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT workspace_private.professional_slot_before_resource_operations(
    p_org, p_start, p_end, p_resources, p_party, p_ignore, p_ignore_session
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.pro_resource_policies policy
    JOIN public.professional_bookings booking
      ON booking.organization_id = policy.organization_id
      AND policy.resource_id = ANY(booking.resource_ids)
    WHERE policy.organization_id = p_org AND policy.resource_id = ANY(p_resources)
      AND policy.allocation_mode = 'exclusive'
      AND booking.id IS DISTINCT FROM p_ignore AND booking.session_id IS NULL
      AND booking.status IN ('requested', 'confirmed', 'attended')
      AND booking.starts_at < p_end AND booking.blocked_until > p_start
  ) THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE FUNCTION workspace_private.pro_resource_booking_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.session_id IS NOT NULL OR NEW.status NOT IN ('requested', 'confirmed', 'attended')
    OR NOT EXISTS (
      SELECT 1 FROM public.pro_resource_policies policy
      WHERE policy.organization_id = NEW.organization_id AND policy.resource_id = ANY(NEW.resource_ids)
        AND policy.allocation_mode = 'exclusive'
    ) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at
    AND NEW.blocked_until = OLD.blocked_until AND NEW.resource_ids = OLD.resource_ids
    AND NEW.party_size = OLD.party_size
    AND (NEW.status = OLD.status OR OLD.status IN ('requested', 'confirmed', 'attended')) THEN RETURN NEW; END IF;
  -- Acortar un intervalo ya ocupado no añade conflictos. Permite registrar
  -- salidas reales aunque después se haya ajustado el horario de apertura.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('requested', 'confirmed', 'attended')
    AND NEW.starts_at >= OLD.starts_at AND NEW.blocked_until <= OLD.blocked_until
    AND NEW.resource_ids = OLD.resource_ids AND NEW.party_size <= OLD.party_size THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 195));
  IF NOT workspace_private.professional_slot(
    NEW.organization_id, NEW.starts_at, NEW.blocked_until, NEW.resource_ids, NEW.party_size, NEW.id
  ) THEN RAISE EXCEPTION 'professional_slot_unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_pro_resource_booking_guard BEFORE INSERT OR UPDATE ON public.professional_bookings
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_resource_booking_guard();

CREATE FUNCTION workspace_private.pro_resource_has_bookings(p_organization_id uuid, p_resource_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.professional_bookings booking
    WHERE booking.organization_id = p_organization_id AND p_resource_id = ANY(booking.resource_ids)
      AND booking.status IN ('requested', 'confirmed', 'attended') AND booking.blocked_until > clock_timestamp()
  ) OR EXISTS (
    SELECT 1 FROM public.professional_sessions session
    WHERE session.organization_id = p_organization_id AND p_resource_id = ANY(session.resource_ids)
      AND session.status = 'open' AND session.blocked_until > clock_timestamp()
  )
$$;

CREATE FUNCTION workspace_private.pro_resource_kind_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pro_resource_policies WHERE resource_id = NEW.id
  ) THEN RETURN NEW; END IF;
  IF NEW.kind NOT IN ('court', 'room', 'desk') THEN RAISE EXCEPTION 'pro_resource_kind_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 195));
  IF ROW(NEW.kind, NEW.capacity, NEW.active) IS DISTINCT FROM ROW(OLD.kind, OLD.capacity, OLD.active)
    AND workspace_private.pro_resource_has_bookings(NEW.organization_id, NEW.id) THEN
    RAISE EXCEPTION 'professional_has_bookings';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pro_resource_kind_guard BEFORE UPDATE OF kind, capacity, active ON public.professional_resources
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_resource_kind_guard();

-- También detecta cambios realizados desde versiones anteriores del gestor.
CREATE FUNCTION workspace_private.pro_resource_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF ROW(NEW.name, NEW.kind, NEW.capacity, NEW.active)
    IS DISTINCT FROM ROW(OLD.name, OLD.kind, OLD.capacity, OLD.active) THEN
    UPDATE public.pro_resource_policies SET version = version + 1 WHERE resource_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pro_resource_version AFTER UPDATE ON public.professional_resources
  FOR EACH ROW EXECUTE FUNCTION workspace_private.pro_resource_version();

CREATE FUNCTION workspace_private.pro_resource_json(p_resource_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', resource.id, 'organization_id', resource.organization_id, 'name', resource.name,
    'kind', resource.kind, 'capacity', resource.capacity, 'active', resource.active,
    'allocation_mode', coalesce(policy.allocation_mode, 'shared'),
    'capacity_unit', CASE WHEN resource.kind = 'desk' THEN 'people' ELSE 'concurrent_bookings' END,
    'configured', policy.resource_id IS NOT NULL, 'version', policy.version
  )
  FROM public.professional_resources resource
  LEFT JOIN public.pro_resource_policies policy ON policy.resource_id = resource.id
  WHERE resource.id = p_resource_id AND resource.kind IN ('court', 'room', 'desk')
$$;

CREATE FUNCTION public.pro_get_resource_operations(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  RETURN jsonb_build_object(
    'resources', coalesce((
      SELECT jsonb_agg(workspace_private.pro_resource_json(resource.id) ORDER BY resource.name, resource.id)
      FROM public.professional_resources resource
      WHERE resource.organization_id = p_organization_id AND resource.kind IN ('court', 'room', 'desk')
    ), '[]'::jsonb),
    'can_manage', public.has_organization_permission(p_organization_id, 'content.manage')
  );
END $$;

CREATE FUNCTION public.pro_save_resource(
  p_organization_id uuid, p_resource_id uuid DEFAULT NULL, p_data jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  resource public.professional_resources;
  policy public.pro_resource_policies;
  prior public.professional_write_requests;
  v_resource_id uuid := p_resource_id;
  v_request_id uuid;
  v_fingerprint text;
  v_mode text;
  v_kind text;
  v_patch jsonb;
  v_saved jsonb;
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id, 'content.manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 195));
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 4000
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_data) key
      WHERE key NOT IN ('client_request_id', 'expected_version', 'allocation_mode', 'name', 'kind', 'capacity', 'active')
    ) THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  v_request_id := (p_data->>'client_request_id')::uuid;
  IF v_request_id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  v_fingerprint := md5(jsonb_build_array('pro.resource.save', p_resource_id, p_data - 'client_request_id')::text);
  SELECT * INTO prior FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = v_request_id;
  IF FOUND THEN
    IF prior.fingerprint <> v_fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN workspace_private.pro_resource_json((prior.result->>'id')::uuid);
  END IF;
  IF v_resource_id IS NOT NULL THEN
    SELECT * INTO resource FROM public.professional_resources
      WHERE id = v_resource_id AND organization_id = p_organization_id AND kind IN ('court', 'room', 'desk');
    IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden'; END IF;
    SELECT * INTO policy FROM public.pro_resource_policies WHERE resource_id = v_resource_id;
  END IF;
  v_kind := coalesce(p_data->>'kind', resource.kind);
  v_mode := coalesce(p_data->>'allocation_mode', policy.allocation_mode);
  IF v_kind IS NULL OR v_kind NOT IN ('court', 'room', 'desk') THEN
    RAISE EXCEPTION 'pro_resource_kind_required';
  END IF;
  IF v_mode IS NULL OR v_mode NOT IN ('exclusive', 'shared') THEN
    RAISE EXCEPTION 'pro_resource_mode_required';
  END IF;
  -- Court y room ya tienen capacidad técnica 1 por contrato del motor.
  -- El aforo de personas pertenece al servicio, no a este campo.
  IF v_kind IN ('court', 'room') AND coalesce((p_data->>'capacity')::integer, resource.capacity, 1) <> 1 THEN
    RAISE EXCEPTION 'pro_resource_capacity_required';
  END IF;
  IF p_data ? 'expected_version' AND (p_data->>'expected_version')::integer IS DISTINCT FROM policy.version THEN
    RAISE EXCEPTION 'pro_resource_changed';
  END IF;
  -- Cambiar la promesa de uso exige que no queden reservas o sesiones vigentes.
  -- Adoptar como compartido el comportamiento anterior no modifica esa promesa.
  IF (v_mode IS DISTINCT FROM coalesce(policy.allocation_mode, 'shared')
    OR v_resource_id IS NOT NULL AND (
      v_kind IS DISTINCT FROM resource.kind
      OR coalesce((p_data->>'capacity')::integer, resource.capacity) IS DISTINCT FROM resource.capacity
      OR coalesce((p_data->>'active')::boolean, resource.active) IS DISTINCT FROM resource.active
    )) AND workspace_private.pro_resource_has_bookings(p_organization_id, v_resource_id) THEN
    RAISE EXCEPTION 'professional_has_bookings';
  END IF;
  v_patch := p_data - ARRAY['client_request_id', 'expected_version', 'allocation_mode'];
  IF v_resource_id IS NOT NULL THEN
    IF v_patch->>'kind' = resource.kind THEN v_patch := v_patch - 'kind'; END IF;
    IF (v_patch->>'capacity')::integer = resource.capacity THEN v_patch := v_patch - 'capacity'; END IF;
    IF (v_patch->>'active')::boolean = resource.active THEN v_patch := v_patch - 'active'; END IF;
  END IF;
  v_saved := public.professional_save_record(p_organization_id, 'resource', v_resource_id, v_patch);
  v_resource_id := (v_saved->>'id')::uuid;
  INSERT INTO public.pro_resource_policies(resource_id, organization_id, allocation_mode)
    VALUES(v_resource_id, p_organization_id, v_mode)
  ON CONFLICT(resource_id) DO UPDATE SET allocation_mode = excluded.allocation_mode,
    version = pro_resource_policies.version + CASE
      WHEN pro_resource_policies.allocation_mode IS DISTINCT FROM excluded.allocation_mode THEN 1 ELSE 0 END;
  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES(p_organization_id, auth.uid(), v_request_id, v_fingerprint, jsonb_build_object('id', v_resource_id));
  INSERT INTO public.organization_audit(organization_id, actor_id, action, resource_id, details)
    VALUES(p_organization_id, auth.uid(), 'pro.resource.saved', v_resource_id,
      jsonb_build_object('allocation_mode', v_mode));
  RETURN workspace_private.pro_resource_json(v_resource_id);
END $$;

DO $$ DECLARE routine record; BEGIN
  FOR routine IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'workspace_private' AND (p.proname LIKE 'pro_resource_%'
      OR p.proname IN ('professional_slot', 'professional_slot_before_resource_operations')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', routine.signature);
  END LOOP;
  FOR routine IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('pro_get_resource_operations', 'pro_save_resource') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', routine.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', routine.signature);
  END LOOP;
END $$;
DO $$ DECLARE definition text; anchor text := '''/rpc/current_demo_cohort'''; BEGIN
  SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
  IF strpos(definition, anchor) = 0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing'; END IF;
  EXECUTE replace(definition, anchor, anchor || ',''/rpc/pro_get_resource_operations'',''/rpc/pro_save_resource''');
END $$;
NOTIFY pgrst, 'reload schema';
