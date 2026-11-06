-- Franky Pro, motor de pistas y espacios por horas (pádel y coworking).
--
-- Guarda en la cuenta real lo que hasta ahora solo existía en la demo:
-- normas del club, turnos fijos, pagos por jugador, lista de espera, niveles,
-- bonos y monedero, americanas, liga, escuela, puestos, taquillas, horarios
-- especiales y cierres de caja. Es un único documento por negocio que la app
-- lee y escribe entero (shared/pro/remote-courts-state.ts). Las reservas y los
-- cobros siguen en professional_bookings y sus RPC: este documento no los toca.
--
-- Concurrencia: cada guardado indica la revisión sobre la que se hizo. Si otra
-- persona del equipo guardó antes, se rechaza y la app recarga.
-- Idempotencia: el mismo client_request_id devuelve el resultado anterior.
--
-- NO APLICADA. Revisar con Teferi antes de llevarla a producción.

CREATE TABLE public.pro_courts_state (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
-- Sin políticas: nadie lee ni escribe la tabla directamente. Solo las dos RPC
-- de abajo, que comprueban el permiso de la organización en cada llamada.
ALTER TABLE public.pro_courts_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_courts_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_courts_state TO service_role;

CREATE FUNCTION public.pro_get_courts_state(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  state public.pro_courts_state;
BEGIN
  -- Leer exige ver la operación del negocio (recepción, monitores, dueño).
  PERFORM workspace_private.professional_require(p_organization_id, 'resource.read');
  SELECT * INTO state FROM public.pro_courts_state WHERE organization_id = p_organization_id;
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'revision', coalesce(state.revision, 0),
    'data', state.data
  );
END $$;

CREATE FUNCTION public.pro_save_courts_state(
  p_organization_id uuid, p_data jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  prior public.professional_write_requests;
  current_revision integer;
  v_request_id uuid;
  v_fingerprint text;
  v_state jsonb;
  v_expected integer;
  v_label text;
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id, 'resource.read');
  IF NOT (
    public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage')
  ) THEN
    RAISE EXCEPTION 'professional_forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_data) key
      WHERE key NOT IN ('client_request_id', 'expected_revision', 'label', 'state')
    ) THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;

  v_state := p_data->'state';
  v_label := left(coalesce(p_data->>'label', ''), 60);
  -- Mismo tope que la app (COURTS_STATE_MAX_BYTES).
  IF jsonb_typeof(v_state) IS DISTINCT FROM 'object'
    OR octet_length(v_state::text) > 900000
    OR v_state ? 'revision' THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;
  -- Cada lista del documento debe ser una lista: evita guardar basura que
  -- después rompa la lectura en la app.
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_state) entry
    WHERE entry.key IN (
      'coveredIds', 'blocks', 'series', 'waitlist', 'passes', 'penalties',
      'americanas', 'school', 'lessons', 'shop', 'seats', 'lockers',
      'specialHours', 'amenities', 'rules', 'warnings', 'cashClosings'
    ) AND jsonb_typeof(entry.value) <> 'array'
  ) THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;

  v_request_id := (p_data->>'client_request_id')::uuid;
  v_expected := (p_data->>'expected_revision')::integer;
  IF v_request_id IS NULL OR v_expected IS NULL OR v_expected < 0 THEN
    RAISE EXCEPTION 'professional_invalid_input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 196));
  v_fingerprint := md5(jsonb_build_array('pro.courts.save', p_data - 'client_request_id')::text);
  SELECT * INTO prior FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = v_request_id;
  IF FOUND THEN
    IF prior.fingerprint <> v_fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN prior.result;
  END IF;

  SELECT revision INTO current_revision FROM public.pro_courts_state
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF coalesce(current_revision, 0) <> v_expected THEN
    RAISE EXCEPTION 'pro_courts_state_version';
  END IF;

  INSERT INTO public.pro_courts_state(organization_id, data, revision, updated_at, updated_by)
    VALUES (p_organization_id, v_state, 1, now(), auth.uid())
  ON CONFLICT (organization_id) DO UPDATE SET
    data = excluded.data,
    revision = pro_courts_state.revision + 1,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING revision INTO current_revision;

  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES (p_organization_id, auth.uid(), v_request_id, v_fingerprint,
      jsonb_build_object('organization_id', p_organization_id, 'revision', current_revision));
  INSERT INTO public.organization_audit(organization_id, actor_id, action, details)
    VALUES (p_organization_id, auth.uid(), 'pro.courts.saved',
      jsonb_build_object('label', v_label, 'revision', current_revision));
  RETURN jsonb_build_object('organization_id', p_organization_id, 'revision', current_revision);
END $$;

DO $$ DECLARE routine record; BEGIN
  FOR routine IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('pro_get_courts_state', 'pro_save_courts_state') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', routine.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', routine.signature);
  END LOOP;
END $$;

-- Las cuentas de demostración de espacios también pueden llamar a estas RPC.
DO $$ DECLARE definition text; anchor text := '''/rpc/current_demo_cohort'''; BEGIN
  SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
  IF strpos(definition, anchor) = 0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing'; END IF;
  EXECUTE replace(definition, anchor, anchor || ',''/rpc/pro_get_courts_state'',''/rpc/pro_save_courts_state''');
END $$;
NOTIFY pgrst, 'reload schema';
