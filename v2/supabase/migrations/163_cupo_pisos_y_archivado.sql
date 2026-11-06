-- =====================================================
-- 163: el cupo de pisos del Plan Inmobiliarias, aplicado de verdad
-- =====================================================
--
-- EL AGUJERO QUE SE CIERRA
--
-- El límite de 40 pisos se comprobaba en un único sitio del servidor web
-- (api/negocio/registro) contando SOLO los pisos con status='active'. Pero el
-- propietario cambia ese estado él mismo desde su panel, con una escritura
-- directa a Supabase que solo pasaba la política "auth.uid() = owner_id".
--
-- Receta completa, reproducible por cualquier inmobiliaria:
--   1. Llega a 40 pisos activos.
--   2. Oculta uno  -> el contador del alta baja a 39.
--   3. Publica el piso 41  -> le deja, porque solo mira los activos.
--   4. Vuelve a activar el que ocultó  -> nada lo comprueba.
-- Repitiendo el ciclo: pisos ilimitados por 80 €/mes. El propio panel se lo
-- sugería al usuario ("desactiva algún piso que ya no alquiles").
--
-- REGLA NUEVA: ocupa plaza TODO lo que el propietario tenga subido, esté
-- activo, oculto o alquilado. Solo lo archivado deja de contar. Así no hay
-- ningún cambio de estado que libere hueco, y por tanto no hay ciclo que
-- explotar.
--
-- POR QUÉ VA EN LA BASE DE DATOS Y NO EN EL SERVIDOR WEB
--
-- Porque el cliente escribe directo contra PostgREST con la clave anónima. Un
-- guardarraíl que viva en una ruta de Next.js se esquiva con una petición a
-- mano. El único sitio por el que pasan TODAS las escrituras es aquí.
--
-- POR QUÉ ARCHIVAR Y NO BORRAR
--
-- accommodations tiene borrado en cascada hacia contracts, tenancies,
-- visit_bookings y visit_slots. Un DELETE real destruiría contratos firmados y
-- el rastro de cobros de visitas, que hay que conservar por obligación fiscal
-- y probatoria. Se marca deleted_at: libera la plaza, conserva el registro.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. Archivado
-- ---------------------------------------------------------------
ALTER TABLE public.accommodations
  ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

-- Índice parcial: todas las consultas de cupo y de catálogo filtran por vivos.
CREATE INDEX IF NOT EXISTS idx_accommodations_owner_vivos
  ON public.accommodations(owner_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.accommodations.deleted_at IS
  'Archivado por el propietario. Libera plaza de cupo y lo saca del catálogo, '
  'pero conserva la fila: borrarla arrastraría contratos y pagos en cascada.';

-- ---------------------------------------------------------------
-- 2. Contador canónico de cupo
-- ---------------------------------------------------------------
--
-- Las fichas con su PROPIA suscripción suelta de 9,99 €/mes no comen plaza del
-- plan: el propietario ya las paga aparte. Si contaran, quien llega a 40 y
-- paga 9,99 por el piso 41 nunca podría publicarlo, que es justo la salida que
-- le ofrece hoy el alta cuando se queda sin cupo.
CREATE OR REPLACE FUNCTION public.owner_listing_quota_used(p_owner UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::int
      FROM public.accommodations a
     WHERE a.owner_id = p_owner
       AND a.deleted_at IS NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.business_subscriptions bs
              WHERE bs.owner_id = p_owner
                AND bs.type = 'housing'
                AND bs.listing_id = a.id
                AND bs.status IN ('active', 'trialing'));
$$;

REVOKE ALL ON FUNCTION public.owner_listing_quota_used(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_listing_quota_used(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.owner_listing_quota_used(UUID) IS
  'Plazas de cupo consumidas por un propietario: todo lo no archivado, salvo '
  'las fichas que pagan su propia suscripción suelta.';

-- ---------------------------------------------------------------
-- 3. Tope para quien no tiene plan
-- ---------------------------------------------------------------
-- Publicar sin plan es legítimo (se paga ficha a ficha), pero sin ningún tope
-- cualquier cuenta puede crear filas sin límite. El rate limit del alta es por
-- ventana de tiempo, no un máximo absoluto.
INSERT INTO public.app_settings(key, value)
VALUES ('no_plan_listing_cap', '10')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. El guardarraíl
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_owner_listing_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_role TEXT := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
    -- Mismo criterio que el guardarraíl de facturación de la 151: el webhook
    -- de Stripe (service_role), los backfills y los administradores pasan de
    -- largo. El cupo es una regla comercial contra el usuario final, no una
    -- invariante de integridad que deba frenar a soporte.
    v_es_usuario BOOLEAN := (v_uid IS NOT NULL
                             AND v_role = 'authenticated'
                             AND NOT public.is_admin());
    v_max  INTEGER;
    v_used INTEGER;
BEGIN
    IF NOT v_es_usuario THEN
        RETURN NEW;
    END IF;

    -- En un UPDATE solo importa el cambio de dueño (mover un piso a otra
    -- cuenta consume plaza allí). Ocultar, activar o marcar como alquilado ya
    -- no altera el consumo: por eso el ciclo de ocultar/reactivar deja de
    -- servir para nada.
    IF TG_OP = 'UPDATE' AND NEW.owner_id = OLD.owner_id THEN
        RETURN NEW;
    END IF;

    -- Sin esto, dos altas simultáneas del mismo propietario leen las dos "39"
    -- y entran las dos: el clásico leer-y-luego-escribir. El bloqueo es
    -- consultivo y por propietario, así que no toca ninguna tabla y no
    -- compite con el webhook de Stripe, que escribe en owner_subscriptions.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('franky.listing_quota:' || NEW.owner_id::text, 0));

    SELECT os.max_listings
      INTO v_max
      FROM public.owner_subscriptions os
     WHERE os.owner_id = NEW.owner_id
       AND os.status IN ('active', 'trialing')
     ORDER BY os.max_listings DESC NULLS LAST, os.created_at DESC
     LIMIT 1;

    -- Suscripción caducada, impagada o cancelada no da cupo de plan: cae al
    -- tope de "sin plan". Los pisos ya publicados no se tocan; simplemente no
    -- puede publicar más hasta regularizar.
    v_max := COALESCE(
        v_max,
        (SELECT value::int FROM public.app_settings WHERE key = 'no_plan_listing_cap'),
        10);

    v_used := public.owner_listing_quota_used(NEW.owner_id);

    IF v_used >= v_max THEN
        RAISE EXCEPTION
          'Has alcanzado el limite de pisos de tu plan (% de %). Ocultar un piso NO libera plaza: archiva uno que ya no ofrezcas o amplia el plan.',
          v_used, v_max
          USING ERRCODE = 'PT402',
                DETAIL  = json_build_object(
                            'code', 'listing_quota_exceeded',
                            'used', v_used,
                            'max',  v_max)::text;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accommodations_quota ON public.accommodations;
CREATE TRIGGER trg_accommodations_quota
    BEFORE INSERT OR UPDATE OF owner_id ON public.accommodations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_listing_quota();

COMMENT ON FUNCTION public.enforce_owner_listing_quota() IS
  'Aplica el cupo de pisos del plan. Cuenta todo lo no archivado, de modo que '
  'ocultar un piso no libere hueco (agujero cerrado en agosto de 2026).';

-- ---------------------------------------------------------------
-- 5. Políticas: lo archivado no se ve, no se resucita y no se puede regalar
-- ---------------------------------------------------------------

-- El catálogo público ignora lo archivado.
DROP POLICY IF EXISTS "accommodations_select_public" ON public.accommodations;
CREATE POLICY "accommodations_select_public"
    ON public.accommodations FOR SELECT
    USING (status = 'active' AND is_paid = true AND deleted_at IS NULL);

-- El propietario SÍ sigue viendo su archivo (histórico, facturación, métricas).
DROP POLICY IF EXISTS "accommodations_select_owner" ON public.accommodations;
CREATE POLICY "accommodations_select_owner"
    ON public.accommodations FOR SELECT
    TO authenticated
    USING (owner_id = auth.uid());

-- La política de UPDATE original no tenía WITH CHECK. Eso permitía dos cosas
-- que no debería: editar un piso archivado (resucitarlo) y, peor, cambiar
-- owner_id para pasarle los pisos a una cuenta mula y vaciar el cupo propio.
DROP POLICY IF EXISTS "Owners can update their accommodations" ON public.accommodations;
DROP POLICY IF EXISTS "accommodations_update_owner" ON public.accommodations;
CREATE POLICY "accommodations_update_owner"
    ON public.accommodations FOR UPDATE
    TO authenticated
    USING      (owner_id = auth.uid() AND deleted_at IS NULL)
    WITH CHECK (owner_id = auth.uid() AND deleted_at IS NULL);

-- Nadie borra pisos desde el cliente. La política anterior lo permitía y un
-- solo DELETE se llevaba por delante contratos firmados, inquilinos y el
-- rastro de los cobros de visitas, todo en cascada y sin vuelta atrás.
DROP POLICY IF EXISTS "Owners can delete their accommodations" ON public.accommodations;

-- ---------------------------------------------------------------
-- 6. Archivar un piso (la única salida legítima al cupo)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_accommodation(
    p_id     UUID,
    p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_owner    UUID;
    v_borrado  TIMESTAMPTZ;
    v_bloqueos TEXT[] := '{}';
    v_admin    BOOLEAN := public.is_admin();
    v_hay      BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_auth');
    END IF;

    SELECT owner_id, deleted_at
      INTO v_owner, v_borrado
      FROM public.accommodations
     WHERE id = p_id
     FOR UPDATE;

    IF NOT FOUND OR (v_owner <> v_uid AND NOT v_admin) THEN
        -- Mismo mensaje para "no existe" y "no es tuyo": no confirmamos la
        -- existencia de fichas ajenas a quien va probando identificadores.
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    IF v_borrado IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;

    -- Cosas vivas que harían del archivado un problema para OTRA persona.
    --
    -- tenancies (086) NO existe en producción: esa migración nunca llegó a
    -- aplicarse allí. Referenciarla a pelo compila igual (plpgsql resuelve los
    -- nombres al ejecutar) pero revienta en la primera llamada real, y dejaría
    -- al propietario sin la única salida al cupo. Guard to_regclass + SQL
    -- dinámico, como el resto de migraciones que conviven con esa divergencia.
    IF to_regclass('public.tenancies') IS NOT NULL THEN
        EXECUTE $q$SELECT EXISTS (SELECT 1 FROM public.tenancies t
                                   WHERE t.accommodation_id = $1
                                     AND t.status IN ('active', 'pending_confirmation'))$q$
           INTO v_hay USING p_id;
        IF v_hay THEN
            v_bloqueos := v_bloqueos || 'inquilinos';
        END IF;
    END IF;

    IF EXISTS (SELECT 1
                 FROM public.visit_bookings vb
                 JOIN public.visit_slots vs ON vs.id = vb.slot_id
                WHERE vs.accommodation_id = p_id
                  AND vb.status IN ('pending', 'confirmed')
                  AND (vs.slot_date + vs.start_time) > NOW()) THEN
        v_bloqueos := v_bloqueos || 'visitas';
    END IF;

    IF EXISTS (SELECT 1 FROM public.contracts c
                WHERE c.accommodation_id = p_id
                  AND c.status = 'signed') THEN
        v_bloqueos := v_bloqueos || 'contratos';
    END IF;

    IF array_length(v_bloqueos, 1) IS NOT NULL AND NOT v_admin THEN
        RETURN jsonb_build_object(
            'ok', false, 'error', 'tiene_cosas_vivas', 'bloqueos', v_bloqueos);
    END IF;

    UPDATE public.accommodations
       SET deleted_at     = NOW(),
           deleted_reason = left(COALESCE(p_reason, ''), 200),
           status         = 'inactive',
           is_paid        = false
     WHERE id = p_id;

    -- Cerrar lo que colgaba del piso para que nadie siga pidiendo visita a un
    -- anuncio retirado.
    UPDATE public.visit_schedules SET active = false WHERE accommodation_id = p_id;
    UPDATE public.visit_slots     SET status = 'closed'
     WHERE accommodation_id = p_id AND status = 'open';
    UPDATE public.accommodation_requests SET status = 'rejected'
     WHERE accommodation_id = p_id AND status = 'pending';

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_accommodation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_accommodation(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.archive_accommodation(UUID, TEXT) IS
  'Retira un piso del catalogo y libera su plaza de cupo sin borrar la fila '
  '(el borrado real arrastraria contratos y pagos en cascada).';

-- ---------------------------------------------------------------
-- 7. Vista de sobrecupo para soporte
-- ---------------------------------------------------------------
-- El guardarraíl nunca actúa hacia atrás: si un plan baja su max_listings por
-- debajo de lo ya publicado, esos pisos se quedan. Sin esta vista nadie se
-- entera de que ese propietario existe.
CREATE OR REPLACE VIEW public.owner_quota_overage AS
    SELECT os.owner_id,
           os.max_listings,
           public.owner_listing_quota_used(os.owner_id) AS used
      FROM public.owner_subscriptions os
     WHERE os.status IN ('active', 'trialing')
       AND public.owner_listing_quota_used(os.owner_id) > os.max_listings;

REVOKE ALL ON public.owner_quota_overage FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- 8. Las métricas del propietario ignoran lo retirado
-- ---------------------------------------------------------------
-- get_owner_listing_stats (161) es SECURITY DEFINER, así que se salta la RLS
-- y seguiría enseñando los pisos archivados en el panel y en la app móvil.
-- Solo cambia el WHERE; el resto es idéntico a la 161.
CREATE OR REPLACE FUNCTION public.get_owner_listing_stats()
RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'accommodation_id', a.id,
        'title', a.title,
        'status', a.status,
        'is_paid', a.is_paid,
        'price', a.price,
        'cover_image', (a.images)[1],
        'views_total', COALESCE(a.views_count, 0),
        'views_7d', COALESCE(v7.views, 0),
        'likes', COALESCE(sw.likes, 0),
        'favorites', COALESCE(fav.favs, 0),
        'requests_pending', COALESCE(req.pending, 0),
        'requests_total', COALESCE(req.total, 0),
        'visits_upcoming', COALESCE(vis.upcoming, 0),
        'visits_total', COALESCE(vis.total, 0),
        'created_at', a.created_at
    )
    FROM public.accommodations a
    LEFT JOIN (
        SELECT accommodation_id, COUNT(*) AS views
        FROM public.accommodation_views
        WHERE view_date >= CURRENT_DATE - 7
        GROUP BY accommodation_id
    ) v7 ON v7.accommodation_id = a.id
    LEFT JOIN (
        SELECT target_id, COUNT(*) AS likes
        FROM public.swipe_actions
        WHERE target_type = 'accommodation' AND action IN ('like', 'superlike')
        GROUP BY target_id
    ) sw ON sw.target_id = a.id
    LEFT JOIN (
        SELECT target_id, COUNT(*) AS favs
        FROM public.favorites
        WHERE target_type = 'accommodation'
        GROUP BY target_id
    ) fav ON fav.target_id = a.id
    LEFT JOIN (
        SELECT accommodation_id,
               COUNT(*) FILTER (WHERE status = 'pending') AS pending,
               COUNT(*) AS total
        FROM public.accommodation_requests
        GROUP BY accommodation_id
    ) req ON req.accommodation_id = a.id
    LEFT JOIN (
        SELECT vs.accommodation_id,
               COUNT(*) FILTER (
                   WHERE vb.status IN ('pending', 'confirmed')
                     AND (vs.slot_date + vs.start_time) > NOW()
               ) AS upcoming,
               COUNT(*) AS total
        FROM public.visit_bookings vb
        JOIN public.visit_slots vs ON vs.id = vb.slot_id
        GROUP BY vs.accommodation_id
    ) vis ON vis.accommodation_id = a.id
    WHERE a.owner_id = auth.uid()
      AND a.deleted_at IS NULL
    ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_listing_stats() TO authenticated;

-- ---------------------------------------------------------------
-- 9. El swipe de pisos tampoco enseña lo retirado ni lo impagado
-- ---------------------------------------------------------------
-- get_discovery_feed es SECURITY DEFINER y su rama de alojamiento solo exigía
-- status='active': se saltaba el filtro is_paid de la 161. Hoy ningún cliente
-- la llama para pisos (el swipe usa una consulta normal), pero está concedida
-- a `authenticated`, así que cualquiera podía sacar por ahí las fichas que no
-- pagan. Se cierra junto con el archivado.

-- ---------------------------------------------------------------
-- 9. El descubrimiento de pisos tampoco enseña lo impagado ni lo retirado
-- ---------------------------------------------------------------
-- get_discovery_feed es SECURITY DEFINER y su rama de alojamiento solo exigia
-- status='active': se saltaba el filtro is_paid que impuso la 161 en la RLS.
-- Hoy ningun cliente la llama para pisos (el swipe usa una consulta normal),
-- pero esta concedida a `authenticated`, asi que cualquiera con sesion podia
-- sacar por ahi las fichas que no pagan. Cuerpo identico al de la 158 salvo
-- las dos condiciones nuevas.
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
    p_user_id UUID,
    p_target_type TEXT,
    p_limit INT DEFAULT 20
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid         UUID := auth.uid();
    v_user_city   TEXT;
    v_budget_min  INT;
    v_budget_max  INT;
    v_me_answered BOOLEAN;
    v_limit       INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    SELECT city, budget_min, budget_max, lifestyle_answered_at IS NOT NULL
    INTO v_user_city, v_budget_min, v_budget_max, v_me_answered
    FROM public.profiles WHERE id = v_uid;
    v_me_answered := COALESCE(v_me_answered, false);

    IF p_target_type = 'accommodation' THEN
        RETURN QUERY
        SELECT to_jsonb(a.*)
        FROM public.accommodations a
        WHERE a.status = 'active'
          -- 163: is_paid y deleted_at. Esta funcion es SECURITY DEFINER, asi
          -- que se salta la RLS de la 161: sin estas dos condiciones devolvia
          -- fichas sin pagar y fichas retiradas a cualquiera que la invocara.
          AND a.is_paid = true
          AND a.deleted_at IS NULL
          -- 140: un piso sin fotos no se puede juzgar deslizando.
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) >= 1
          AND a.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'accommodation'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = a.owner_id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            CASE WHEN v_user_city IS NOT NULL AND a.city ILIKE v_user_city THEN 0 ELSE 1 END,
            CASE WHEN a.price BETWEEN COALESCE(v_budget_min, 0) AND COALESCE(v_budget_max, 9999) THEN 0 ELSE 1 END,
            a.created_at DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'roomie' THEN
        IF NOT public.roomie_profile_complete(v_uid) THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT jsonb_build_object(
            -- ── lo que ya devolvía la 140 ──
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'career', p.career,
            'academic_year', p.academic_year,
            'bio', p.bio,
            'city', p.city,
            'interests', COALESCE(p.interests, '{}'::text[]),
            'age', CASE WHEN p.birth_date IS NOT NULL
                        THEN date_part('year', age(p.birth_date))::int
                   END,
            -- ── 158: los datos REALES de la persona ──
            'photos', COALESCE(p.photos, '{}'::text[]),
            'hobbies', COALESCE(p.hobbies, '{}'::text[]),
            'budget_min', p.budget_min,
            'budget_max', p.budget_max,
            'university', u.short_name,
            'university_name', u.name,
            'is_verified', COALESCE(p.student_email_verified, false),
            'smoking', p.smoking::text,
            'partying', p.partying::text,
            'study_habits', p.study_habits::text,
            'sleep_schedule', p.sleep_schedule::text,
            'cleanliness', p.cleanliness::text,
            'noise_tolerance', p.noise_tolerance::text,
            'friends_at_home', p.friends_at_home::text,
            'pet_friendly', p.pet_friendly::text,
            'lifestyle_answered', p.lifestyle_answered_at IS NOT NULL,
            -- 157: NULL cuando alguno de los dos no ha contestado de verdad.
            'compatibility', public.roomie_compatibility(v_uid, p.id),
            'compatibility_reason',
                CASE WHEN NOT v_me_answered AND p.lifestyle_answered_at IS NULL THEN 'both'
                     WHEN NOT v_me_answered                                     THEN 'me'
                     WHEN p.lifestyle_answered_at IS NULL                       THEN 'them'
                     ELSE 'ok' END
            -- 158: lifestyle_preferences y housing_preferences YA NO se envían.
            -- Nadie las escribe nunca; solo servían para pintar el DEFAULT de la
            -- migración 001 como si fuera el perfil de esa persona.
        )
        FROM public.profiles p
        LEFT JOIN public.universities u ON u.id = p.university_id
        WHERE p.id != v_uid
          AND p.looking_for_roommate = true
          AND p.onboarding_completed = true
          AND COALESCE(p.is_discarded, false) = false
          -- 140: FOTO OBLIGATORIA para aparecer en el mazo.
          AND (
            COALESCE(btrim(p.avatar_url), '') <> ''
            OR COALESCE(array_length(p.photos, 1), 0) >= 1
          )
          -- 140: fuera quien tenga la foto retenida por denuncias.
          AND COALESCE(p.photo_hidden, false) = false
          AND p.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'roomie'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = p.id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            -- Se ordena con calculate_compatibility (nunca NULL) y no con
            -- roomie_compatibility: con DESC, los NULL se irían los PRIMEROS.
            public.calculate_compatibility(v_uid, p.id) DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'event' THEN
        RETURN QUERY
        SELECT to_jsonb(e.*)
        FROM public.events e
        WHERE e.start_date >= NOW()
          AND e.status = 'upcoming'
          AND e.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'event'
          )
        ORDER BY
            CASE WHEN v_user_city IS NOT NULL AND e.city ILIKE v_user_city THEN 0 ELSE 1 END,
            e.start_date ASC
        LIMIT v_limit;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) TO authenticated;
