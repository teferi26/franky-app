-- Franky Pro, motor de clases (gimnasios, academias y ocio): guarda en el
-- servidor lo que hasta ahora solo vivía en la demo. Riesgo de baja, pausas,
-- cobros de cuotas, pizarra, lista de espera, salas de escape, interesados,
-- retos, marcas, ranking, bonos regalo y resultados de examen.
--
-- Un documento JSON por negocio. Las listas se guardan como objetos por id
-- para poder cambiar una fila sin reescribir el resto: dos personas del
-- equipo que tocan cosas distintas a la vez no se pisan.
--
-- PENDIENTE DE APROBACIÓN DE TEFERI. No aplicar sin su visto bueno.

CREATE TABLE public.pro_class_extras (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(doc) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.pro_class_extras ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo se lee y se escribe por las RPC de abajo.
REVOKE ALL ON public.pro_class_extras FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_class_extras TO service_role;

-- Qué permiso hace falta para escribir cada clave de primer nivel.
-- Cobros y numeración de recibos: finanzas. Fichas de personas y operación
-- del día: equipo que atiende. Configuración del negocio: gestión.
CREATE FUNCTION workspace_private.pro_class_extras_key_permission(p_key text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_key IN ('charges', 'receiptSeq', 'invoiceSeq') THEN ARRAY['finance.manage']
    WHEN p_key IN ('members', 'trials', 'leads', 'referrals', 'records', 'examResults',
      'checkins', 'sessions', 'roomBookings', 'waitOffers', 'roomResults', 'reviews',
      'vouchers', 'voucherSeq', 'grades') THEN ARRAY['content.manage', 'attendees.manage']
    WHEN p_key IN ('types', 'staff', 'policy', 'recoveryDays', 'waitHoldHours',
      'referralReward', 'challenges', 'seasonDone', 'plans', 'recoveryRules')
      THEN ARRAY['content.manage']
    ELSE NULL
  END
$$;

-- Claves que se guardan como objeto por id (mapas y listas con id propio).
CREATE FUNCTION workspace_private.pro_class_extras_is_map(p_key text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_key IN ('members', 'sessions', 'types', 'roomBookings', 'staff', 'charges',
    'waitOffers', 'trials', 'leads', 'checkins', 'challenges', 'records', 'referrals',
    'roomResults', 'vouchers', 'examResults', 'grades', 'plans')
$$;

-- Documento recortado según lo que puede ver quien pregunta. La salud de los
-- socios y los cobros no salen a quien no los necesita.
CREATE FUNCTION workspace_private.pro_class_extras_visible(p_organization_id uuid, p_doc jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doc jsonb := coalesce(p_doc, '{}'::jsonb);
  v_people boolean := public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage');
BEGIN
  IF NOT v_people THEN
    v_doc := v_doc - ARRAY['members', 'trials', 'leads', 'referrals', 'records', 'examResults',
      'checkins', 'roomBookings', 'waitOffers', 'vouchers', 'grades'];
  END IF;
  IF NOT public.has_organization_permission(p_organization_id, 'finance.read') THEN
    v_doc := v_doc - ARRAY['charges', 'receiptSeq', 'invoiceSeq'];
  END IF;
  RETURN v_doc;
END $$;

CREATE FUNCTION public.pro_get_class_extras(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.pro_class_extras;
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id, 'resource.read');
  SELECT * INTO v_row FROM public.pro_class_extras WHERE organization_id = p_organization_id;
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'version', coalesce(v_row.version, 0),
    'doc', workspace_private.pro_class_extras_visible(p_organization_id, v_row.doc)
  );
END $$;

-- p_data = { client_request_id, patches: [{ k: clave, id?: fila, v?: valor }] }
-- Sin "v" (o con null) se borra la clave o la fila.
CREATE FUNCTION public.pro_patch_class_extras(p_organization_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  prior public.professional_write_requests;
  v_request_id uuid;
  v_fingerprint text;
  v_doc jsonb;
  v_patch jsonb;
  v_key text;
  v_id text;
  v_value jsonb;
  v_allowed text[];
  v_version integer;
BEGIN
  PERFORM workspace_private.professional_require(p_organization_id, 'resource.read');
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_data->'patches') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_data->'patches') NOT BETWEEN 1 AND 200
    OR octet_length(p_data::text) > 200000
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) key WHERE key NOT IN ('client_request_id', 'patches'))
  THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
  v_request_id := (p_data->>'client_request_id')::uuid;
  IF v_request_id IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 196));
  v_fingerprint := md5(jsonb_build_array('pro.class_extras.patch', p_data - 'client_request_id')::text);
  SELECT * INTO prior FROM public.professional_write_requests
    WHERE organization_id = p_organization_id AND actor_id = auth.uid() AND request_key = v_request_id;
  IF FOUND THEN
    IF prior.fingerprint <> v_fingerprint THEN RAISE EXCEPTION 'professional_idempotency_conflict'; END IF;
    RETURN public.pro_get_class_extras(p_organization_id);
  END IF;

  SELECT doc INTO v_doc FROM public.pro_class_extras WHERE organization_id = p_organization_id FOR UPDATE;
  v_doc := coalesce(v_doc, '{}'::jsonb);

  FOR v_patch IN SELECT value FROM jsonb_array_elements(p_data->'patches') LOOP
    IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object'
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_patch) key WHERE key NOT IN ('k', 'id', 'v'))
    THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    v_key := v_patch->>'k';
    v_id := v_patch->>'id';
    v_value := CASE WHEN jsonb_typeof(v_patch->'v') = 'null' THEN NULL ELSE v_patch->'v' END;
    v_allowed := workspace_private.pro_class_extras_key_permission(v_key);
    IF v_allowed IS NULL THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM unnest(v_allowed) permission
      WHERE public.has_organization_permission(p_organization_id, permission)
    ) THEN RAISE EXCEPTION 'professional_forbidden' USING ERRCODE = '42501'; END IF;

    IF v_id IS NOT NULL THEN
      IF NOT workspace_private.pro_class_extras_is_map(v_key)
        OR length(v_id) NOT BETWEEN 1 AND 120
        OR (v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'object')
      THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
      IF jsonb_typeof(v_doc->v_key) IS DISTINCT FROM 'object' THEN
        v_doc := jsonb_set(v_doc, ARRAY[v_key], '{}'::jsonb);
      END IF;
      IF v_value IS NULL THEN
        v_doc := v_doc #- ARRAY[v_key, v_id];
      ELSE
        v_doc := jsonb_set(v_doc, ARRAY[v_key, v_id], v_value);
      END IF;
    ELSE
      IF workspace_private.pro_class_extras_is_map(v_key)
        AND v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'object'
      THEN RAISE EXCEPTION 'professional_invalid_input'; END IF;
      IF v_value IS NULL THEN
        v_doc := v_doc - v_key;
      ELSE
        v_doc := jsonb_set(v_doc, ARRAY[v_key], v_value);
      END IF;
    END IF;
  END LOOP;

  -- Un negocio grande con varios cursos de historia cabe de sobra en 2 MB.
  IF octet_length(v_doc::text) > 2000000 THEN RAISE EXCEPTION 'pro_class_extras_too_large'; END IF;

  INSERT INTO public.pro_class_extras(organization_id, doc, updated_at, updated_by)
    VALUES (p_organization_id, v_doc, now(), auth.uid())
  ON CONFLICT (organization_id) DO UPDATE
    SET doc = excluded.doc, version = pro_class_extras.version + 1,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  RETURNING version INTO v_version;

  INSERT INTO public.professional_write_requests(organization_id, actor_id, request_key, fingerprint, result)
    VALUES (p_organization_id, auth.uid(), v_request_id, v_fingerprint, jsonb_build_object('version', v_version));
  INSERT INTO public.organization_audit(organization_id, actor_id, action, details)
    VALUES (p_organization_id, auth.uid(), 'pro.class_extras.patched',
      jsonb_build_object('keys', (
        SELECT jsonb_agg(DISTINCT patch->>'k') FROM jsonb_array_elements(p_data->'patches') patch
      ), 'version', v_version));
  RETURN public.pro_get_class_extras(p_organization_id);
END $$;

-- Entrada con el QR de la puerta. Quien escanea entra con su cuenta de Franky
-- y su reserva de ahora (de 30 minutos antes a 20 después de empezar) pasa a
-- asistida, igual que si el monitor pasara lista: si va con bono, gasta una
-- sesión. Sin huella ni torno. Sin reserva no entra nadie por aquí: se le
-- manda a reservar o a hablar con el monitor.
CREATE FUNCTION public.pro_class_door_checkin(p_slug text, p_room text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_booking public.professional_bookings;
  v_units integer;
  v_name text;
  v_id text := gen_random_uuid()::text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  SELECT profile.organization_id INTO v_org FROM public.pro_profiles profile
    WHERE profile.public_slug = lower(btrim(coalesce(p_slug, '')));
  IF v_org IS NULL THEN RETURN jsonb_build_object('outcome', 'unknown'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text, 195));

  SELECT booking.* INTO v_booking
  FROM public.professional_bookings booking
  JOIN public.professional_sessions session ON session.id = booking.session_id
  WHERE booking.organization_id = v_org
    AND booking.customer_user_id = auth.uid()
    AND booking.status IN ('confirmed', 'attended')
    AND session.status = 'open'
    AND clock_timestamp() BETWEEN session.starts_at - interval '30 minutes'
      AND session.starts_at + interval '20 minutes'
    AND (
      p_room IS NULL OR btrim(p_room) = '' OR EXISTS (
        SELECT 1 FROM public.professional_resources resource
        WHERE resource.id = ANY(session.resource_ids)
          AND lower(btrim(resource.name)) = lower(btrim(p_room))
      )
    )
  ORDER BY session.starts_at
  LIMIT 1
  FOR UPDATE OF booking;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_booking'); END IF;
  IF v_booking.status = 'attended' THEN
    RETURN jsonb_build_object('outcome', 'already', 'starts_at', v_booking.starts_at);
  END IF;

  IF v_booking.bundle_id IS NOT NULL THEN
    UPDATE public.professional_bundles SET remaining = remaining - 1
      WHERE id = v_booking.bundle_id AND remaining > 0 RETURNING remaining INTO v_units;
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'bundle_empty'); END IF;
    INSERT INTO public.professional_bundle_ledger(organization_id, bundle_id, booking_id, units, reason, actor_id, request_key)
      VALUES (v_org, v_booking.bundle_id, v_booking.id, -1, 'Entrada con el QR de la puerta', auth.uid(),
        'door:' || v_booking.id || ':' || gen_random_uuid());
  END IF;
  UPDATE public.professional_bookings
    SET status = 'attended', attended_at = now(), attended_by = auth.uid(), reschedule = NULL, updated_at = now()
    WHERE id = v_booking.id;

  -- Queda también en la lista de entradas del día que ve el equipo.
  SELECT customer.display_name INTO v_name FROM public.professional_customers customer
    WHERE customer.id = v_booking.customer_id;
  INSERT INTO public.pro_class_extras(organization_id, doc)
    VALUES (v_org, jsonb_build_object('checkins', jsonb_build_object(v_id, jsonb_build_object(
      'id', v_id, 'sessionId', v_booking.session_id, 'name', coalesce(v_name, ''),
      'at', to_jsonb(clock_timestamp()), 'kind', 'booked'))))
  ON CONFLICT (organization_id) DO UPDATE
    SET doc = jsonb_set(
        CASE WHEN jsonb_typeof(pro_class_extras.doc->'checkins') = 'object' THEN pro_class_extras.doc
          ELSE jsonb_set(pro_class_extras.doc, '{checkins}', '{}'::jsonb) END,
        ARRAY['checkins', v_id], excluded.doc->'checkins'->v_id),
      version = pro_class_extras.version + 1, updated_at = now();
  INSERT INTO public.organization_audit(organization_id, actor_id, action, resource_id, details)
    VALUES (v_org, auth.uid(), 'pro.class_door.checkin', v_booking.id, '{}'::jsonb);
  RETURN jsonb_build_object('outcome', 'booked', 'starts_at', v_booking.starts_at);
END $$;
REVOKE ALL ON FUNCTION public.pro_class_door_checkin(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pro_class_door_checkin(text, text) TO authenticated;

DO $$ DECLARE routine record; BEGIN
  FOR routine IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'workspace_private' AND p.proname LIKE 'pro_class_extras_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', routine.signature);
  END LOOP;
  FOR routine IN SELECT p.oid::regprocedure signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('pro_get_class_extras', 'pro_patch_class_extras') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', routine.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', routine.signature);
  END LOOP;
END $$;

-- Las cuentas de demostración solo llegan a las RPC de la lista blanca.
DO $$ DECLARE definition text; anchor text := '''/rpc/current_demo_cohort'''; BEGIN
  SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
  IF strpos(definition, anchor) = 0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing'; END IF;
  EXECUTE replace(definition, anchor, anchor || ',''/rpc/pro_get_class_extras'',''/rpc/pro_patch_class_extras''');
END $$;
NOTIFY pgrst, 'reload schema';
