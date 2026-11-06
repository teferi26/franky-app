-- =====================================================================
-- 110: Rol ANALISTA (solo lectura del panel) + blindaje del ADMIN único
--
-- Qué hace:
--   1. Nuevo rol 'analyst' en profiles.role: ve TODO el panel de control
--      pero no puede escribir nada (ninguna policy de INSERT/UPDATE/DELETE
--      lo incluye; las RPCs de escritura siguen exigiendo admin).
--   2. Solo puede existir UN admin: índice único parcial. Si hubiera más de
--      uno al aplicar, se conserva el más antiguo y el resto pasa a analyst.
--   3. El admin es imborrable: trigger que bloquea DELETE de su fila (también
--      el CASCADE desde auth.users), el cambio de su rol y su soft-delete
--      (is_discarded). Ni siquiera la service_role puede saltárselo.
--   4. admin_set_user_role(): el admin convierte cualquier usuario en
--      analista (y lo revierte). Whitelist estricta, con auditoría.
--   5. Policies RLS de SOLO LECTURA para staff (admin o analyst) sobre las
--      tablas que alimenta el panel: profiles, reportes, strikes, auditoría,
--      papelera, sugerencias de ocio, pagos y entradas.
--   6. Guard de RPCs: _admin_required() pasa a ser el guard de LECTURA del
--      panel (admin o analyst). Para escrituras existe _admin_write_required()
--      (solo admin). Las dos únicas RPCs de escritura que usaban el guard
--      antiguo (alta/baja de gestores de universidad, 103) se recrean con el
--      guard de escritura. Las listas de moderación FOMO/Crush se recrean
--      aceptando staff (las acciones de moderar siguen siendo solo admin).
--   7. RPCs nuevas de analítica:
--      · admin_ambassador_leads(): leads captados por embajador (Tafa vs Pau)
--        vía UTM (utm_medium=ambassador), con serie diaria y totales.
--      · admin_event_creator_revenue(): ranking de creadores de eventos por
--        dinero generado (bruto, comisión Franky y neto del organizador).
--
-- Seguridad: todas las funciones son SECURITY DEFINER con search_path
-- fijado y el guard DENTRO de la función (GRANT a authenticated, patrón 044).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Rol nuevo 'analyst'
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'propietario', 'university_admin', 'analyst'));

-- Helper: ¿el usuario actual es staff del panel (admin o analista)?
-- Mismo patrón que is_admin() (040): SECURITY DEFINER para poder leer
-- profiles sin recursión de RLS.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'analyst')
          AND is_discarded IS NOT TRUE
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 2. UN solo admin
-- ---------------------------------------------------------------------
-- Si hubiera más de un admin, se conserva el más antiguo (el fundador) y el
-- resto pasa a 'analyst' (mantienen lectura del panel, pierden escritura).
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC NULLS LAST, id) AS rn
    FROM public.profiles
    WHERE role = 'admin'
)
UPDATE public.profiles p
SET role = 'analyst'
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- Índice único parcial: como todas las filas con role='admin' comparten la
-- misma clave, solo puede existir una.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_admin_uniq
    ON public.profiles ((role))
    WHERE role = 'admin';

-- ---------------------------------------------------------------------
-- 3. Blindaje de la cuenta admin (imborrable e indegradable)
-- ---------------------------------------------------------------------
-- El trigger corre para CUALQUIER rol de conexión (authenticated, service_role
-- y conexiones backend). Bloquea:
--   · DELETE de la fila admin (incluye el CASCADE de borrar auth.users).
--   · Cambiar role del admin a otra cosa.
--   · Marcar al admin como is_discarded (soft-delete / baneo).
-- Único escape: deshabilitar el trigger a mano desde la consola SQL de
-- Supabase (decisión consciente del propietario de la BD).
CREATE OR REPLACE FUNCTION public.protect_admin_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.role = 'admin' THEN
            RAISE EXCEPTION 'admin_account_protected'
                USING HINT = 'La cuenta admin no puede eliminarse.';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    IF OLD.role = 'admin' THEN
        IF NEW.role IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'admin_role_is_permanent'
                USING HINT = 'El rol admin no puede cambiarse ni transferirse desde la aplicación.';
        END IF;
        IF COALESCE(NEW.is_discarded, false) THEN
            RAISE EXCEPTION 'admin_account_protected'
                USING HINT = 'La cuenta admin no puede mandarse a la papelera ni banearse.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_account ON public.profiles;
CREATE TRIGGER trg_protect_admin_account
    BEFORE UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_admin_account();

-- Refuerzo explícito (revisión de seguridad): handle_new_strike (010) hace
-- auto-discard a los 3 strikes. El trigger escudo ya lo bloquearía para el
-- admin, pero abortaría toda la transacción del strike; mejor que la función
-- ignore a la cuenta admin de forma explícita e independiente del orden de
-- triggers. Cuerpo idéntico a 010 + guard inicial.
-- CONDICIONAL: en la BD de producción la migración 010 nunca se aplicó
-- (user_strikes no existe; lo documenta 045), así que solo se redefine donde
-- la tabla exista de verdad.
DO $do$
BEGIN
    IF to_regclass('public.user_strikes') IS NOT NULL THEN
        EXECUTE $def$
CREATE OR REPLACE FUNCTION public.handle_new_strike()
RETURNS TRIGGER AS $fn$
DECLARE
    current_strikes INTEGER;
    user_data JSONB;
BEGIN
    -- La cuenta admin no acumula strikes ni se auto-banea.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND role = 'admin') THEN
        RETURN NEW;
    END IF;

    -- Count total strikes for this user
    SELECT COUNT(*) INTO current_strikes
    FROM public.user_strikes
    WHERE user_id = NEW.user_id;

    -- Update strikes_count on profile
    UPDATE public.profiles
    SET strikes_count = current_strikes,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Auto-discard at 3 strikes
    IF current_strikes >= 3 THEN
        SELECT to_jsonb(p.*) INTO user_data
        FROM public.profiles p
        WHERE p.id = NEW.user_id;

        INSERT INTO public.discarded_records (original_table, original_id, data, discarded_by, reason)
        VALUES ('profiles', NEW.user_id, user_data, NEW.issued_by, '3 strikes reached - auto discard');

        UPDATE public.profiles
        SET is_discarded = true,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
        $def$;
    END IF;
END $do$;

-- ---------------------------------------------------------------------
-- 4. Guards de RPC: lectura (staff) vs escritura (solo admin)
-- ---------------------------------------------------------------------
-- ⚠️ SEMÁNTICA NUEVA: _admin_required() es desde esta migración el guard de
-- LECTURA del panel (acepta admin O analyst). Lo usan las ~20 RPCs de
-- analítica de 044/044b, que son todas de solo lectura, y así los analistas
-- ven el dashboard completo sin reescribirlas una a una.
-- Cualquier RPC que ESCRIBA debe usar _admin_write_required().
CREATE OR REPLACE FUNCTION public._admin_required()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'forbidden' USING HINT = 'admin or analyst role required';
    END IF;
END;
$$;

COMMENT ON FUNCTION public._admin_required() IS
    'Guard de LECTURA del panel admin: deja pasar a admin y analyst. '
    'Para RPCs que escriben usar _admin_write_required() (solo admin).';

CREATE OR REPLACE FUNCTION public._admin_write_required()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING HINT = 'admin role required';
    END IF;
END;
$$;

-- Las dos RPCs de ESCRITURA que usaban el guard antiguo (103) se recrean con
-- el guard de escritura. Cuerpos idénticos a 103 salvo el guard.
CREATE OR REPLACE FUNCTION public.admin_grant_university_admin(
    p_email text,
    p_university_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile_id uuid;
    v_uni uuid;
BEGIN
    PERFORM public._admin_write_required();

    SELECT id INTO v_profile_id FROM public.profiles WHERE lower(email) = lower(p_email);
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'profile_not_found' USING HINT = p_email;
    END IF;

    SELECT id INTO v_uni FROM public.universities WHERE slug = p_university_slug;
    IF v_uni IS NULL THEN
        RAISE EXCEPTION 'university_not_found' USING HINT = p_university_slug;
    END IF;

    INSERT INTO public.university_admins (university_id, profile_id, created_by)
    VALUES (v_uni, v_profile_id, auth.uid())
    ON CONFLICT (university_id, profile_id) DO NOTHING;

    -- Solo promociona si era usuario normal (no degrada admin/propietario).
    UPDATE public.profiles SET role = 'university_admin'
    WHERE id = v_profile_id AND role = 'user';

    RETURN jsonb_build_object('ok', true, 'profile_id', v_profile_id, 'university_id', v_uni);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_university_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile_id uuid;
BEGIN
    PERFORM public._admin_write_required();

    SELECT id INTO v_profile_id FROM public.profiles WHERE lower(email) = lower(p_email);
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'profile_not_found' USING HINT = p_email;
    END IF;

    DELETE FROM public.university_admins WHERE profile_id = v_profile_id;
    UPDATE public.profiles SET role = 'user'
    WHERE id = v_profile_id AND role = 'university_admin';

    RETURN jsonb_build_object('ok', true, 'profile_id', v_profile_id);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. admin_set_user_role: convertir usuarios en analista (y revertir)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target RECORD;
BEGIN
    PERFORM public._admin_write_required();

    -- Whitelist estricta: por aquí SOLO se concede/retira 'analyst'.
    -- ('admin' jamás: es único y fijo. 'propietario' tiene su propio flujo.)
    IF p_role NOT IN ('user', 'analyst') THEN
        RAISE EXCEPTION 'rol_invalido' USING HINT = 'Solo se permite user o analyst.';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'no_self' USING HINT = 'No puedes cambiar tu propio rol.';
    END IF;

    SELECT id, role, email, full_name INTO v_target
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'usuario_no_encontrado';
    END IF;
    IF v_target.role = 'admin' THEN
        RAISE EXCEPTION 'admin_account_protected';
    END IF;
    IF v_target.role = 'university_admin' THEN
        RAISE EXCEPTION 'university_admin_first'
            USING HINT = 'Retira antes su gestión con admin_revoke_university_admin().';
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

    PERFORM public.log_admin_action(
        auth.uid(),
        CASE WHEN p_role = 'analyst' THEN 'grant_analyst' ELSE 'revoke_analyst' END,
        'user',
        p_user_id::text,
        jsonb_build_object('old_role', v_target.role, 'new_role', p_role, 'email', v_target.email)
    );

    RETURN jsonb_build_object(
        'ok', true, 'user_id', p_user_id,
        'old_role', v_target.role, 'new_role', p_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Policies de SOLO LECTURA para staff (las tablas que pinta el panel)
-- ---------------------------------------------------------------------
-- profiles: el analista ve todas las filas (gestión de usuarios, papelera).
-- Las escrituras NO cambian: siguen siendo "propia fila" + admin.
-- DECISIÓN consciente: el analista ve los mismos datos de perfil que el panel
-- muestra al admin (incluye email). Si en el futuro se quiere ocultar PII
-- extra (teléfono, fecha de nacimiento), crear una vista recortada y apuntar
-- esta policy a ella.
DROP POLICY IF EXISTS "Staff read all profiles" ON public.profiles;
CREATE POLICY "Staff read all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- Resto de tablas del panel: SOLO si existen en este entorno. La BD de
-- producción diverge del repo (010/015 nunca aplicadas: user_reports,
-- user_strikes y admin_audit_log pueden no existir; lo documenta 045), así
-- que cada policy se crea de forma condicional. Si alguna de estas tablas se
-- crea en una migración futura, esa migración debe añadir también su policy
-- de staff (o re-ejecutar este bloque, que es idempotente).
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT * FROM (VALUES
            ('public.user_reports',             'Staff view reports'),
            ('public.user_strikes',             'Staff view strikes'),
            ('public.admin_audit_log',          'Staff view audit log'),
            ('public.payments',                 'payments_select_staff'),
            ('public.event_tickets',            'event_tickets_select_staff'),
            ('public.discarded_records',        'Staff view discarded records'),
            ('public.leisure_spot_suggestions', 'Staff view leisure suggestions'),
            ('public.admin_actions',            'Staff view admin actions')
        ) AS v(tbl, pol)
    LOOP
        IF to_regclass(t.tbl) IS NOT NULL THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %s', t.pol, t.tbl);
            EXECUTE format(
                'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (public.is_staff())',
                t.pol, t.tbl
            );
        ELSE
            RAISE NOTICE 'Tabla % no existe en este entorno: policy % omitida', t.tbl, t.pol;
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. Listas de moderación FOMO/Crush: lectura para staff
--    (las acciones admin_fomo_moderate / admin_ig_moderate NO cambian:
--    siguen exigiendo is_admin()).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_fomo_reports()
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_staff() THEN RAISE EXCEPTION 'forbidden'; END IF;

    RETURN QUERY
    -- Hilos reportados/ocultos
    SELECT jsonb_build_object(
        'target_type', 'thread',
        'target_id', t.id,
        'body', t.body,
        'media_url', t.media_url,
        'media_type', t.media_type,
        'is_anonymous', t.is_anonymous,
        'is_hidden', t.is_hidden,
        'is_deleted', t.is_deleted,
        'report_count', t.report_count,
        'created_at', t.created_at,
        'author_id', t.author_id,
        'author_name', (SELECT full_name FROM public.profiles WHERE id = t.author_id),
        'university_id', t.university_id,
        'reasons', COALESCE((
            SELECT jsonb_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL)
            FROM public.fomo_reports r
            WHERE r.target_type = 'thread' AND r.target_id = t.id AND r.status = 'pending'
        ), '[]'::jsonb)
    )
    FROM public.fomo_threads t
    WHERE t.is_deleted = false
      AND (t.is_hidden = true OR t.report_count > 0)

    UNION ALL

    -- Respuestas reportadas/ocultas
    SELECT jsonb_build_object(
        'target_type', 'reply',
        'target_id', rp.id,
        'thread_id', rp.thread_id,
        'body', rp.body,
        'media_url', rp.media_url,
        'media_type', rp.media_type,
        'is_anonymous', rp.is_anonymous,
        'is_hidden', rp.is_hidden,
        'is_deleted', rp.is_deleted,
        'report_count', rp.report_count,
        'created_at', rp.created_at,
        'author_id', rp.author_id,
        'author_name', (SELECT full_name FROM public.profiles WHERE id = rp.author_id),
        'reasons', COALESCE((
            SELECT jsonb_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL)
            FROM public.fomo_reports r
            WHERE r.target_type = 'reply' AND r.target_id = rp.id AND r.status = 'pending'
        ), '[]'::jsonb)
    )
    FROM public.fomo_replies rp
    WHERE rp.is_deleted = false
      AND (rp.is_hidden = true OR rp.report_count > 0)

    ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_ig_reports()
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_staff() THEN RAISE EXCEPTION 'forbidden'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'reported_id', p.id,
        'full_name', p.full_name,
        'instagram_handle', p.instagram_handle,
        'instagram_verified', COALESCE(p.instagram_verified, false),
        'ig_quarantined', COALESCE(p.ig_quarantined, false),
        'report_count', (SELECT COUNT(DISTINCT r.reporter_id) FROM public.ig_reports r
                         WHERE r.reported_id = p.id AND r.status = 'pending'),
        'reasons', COALESCE((
            SELECT jsonb_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL)
            FROM public.ig_reports r
            WHERE r.reported_id = p.id AND r.status = 'pending'
        ), '[]'::jsonb)
    )
    FROM public.profiles p
    WHERE EXISTS (
        SELECT 1 FROM public.ig_reports r
        WHERE r.reported_id = p.id AND r.status = 'pending'
    )
    ORDER BY (SELECT COUNT(*) FROM public.ig_reports r WHERE r.reported_id = p.id AND r.status = 'pending') DESC;
END;
$$;

-- ---------------------------------------------------------------------
-- 8. admin_ambassador_leads: leads por embajador (Tafa vs Pau) vía UTM
-- ---------------------------------------------------------------------
-- Cuenta perfiles cuyo first-touch llegó con utm_medium=ambassador (links de
-- captación personales). Acepta también utm_source tafa/pau sueltos por si
-- alguien recorta el link. Devuelve totales del período, totales históricos
-- y serie diaria (filas planas: la UI pivota por embajador).
-- Nota: sin STABLE a propósito; el guard is_staff() es VOLATILE y no queremos
-- que el planner pueda cachear el resultado saltándose la comprobación.
CREATE OR REPLACE FUNCTION public.admin_ambassador_leads(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_days int := GREATEST(LEAST(COALESCE(p_range_days, 30), 3650), 1);
    v_since date;
BEGIN
    v_since := (now() - (v_days || ' days')::interval)::date;
    PERFORM public._admin_required();

    RETURN jsonb_build_object(
        'period_days', v_days,
        'totals', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('ambassador', t.amb, 'signups', t.n) ORDER BY t.n DESC)
            FROM (
                SELECT lower(p.utm_source) AS amb, COUNT(*)::int AS n
                FROM public.profiles p
                WHERE p.utm_source IS NOT NULL
                  AND (lower(COALESCE(p.utm_medium, '')) = 'ambassador'
                       OR lower(p.utm_source) IN ('tafa', 'pau'))
                  AND p.created_at >= v_since
                GROUP BY 1
            ) t
        ), '[]'::jsonb),
        'all_time', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('ambassador', t.amb, 'signups', t.n) ORDER BY t.n DESC)
            FROM (
                SELECT lower(p.utm_source) AS amb, COUNT(*)::int AS n
                FROM public.profiles p
                WHERE p.utm_source IS NOT NULL
                  AND (lower(COALESCE(p.utm_medium, '')) = 'ambassador'
                       OR lower(p.utm_source) IN ('tafa', 'pau'))
                GROUP BY 1
            ) t
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'date', to_char(d.day, 'YYYY-MM-DD'),
                    'ambassador', d.amb,
                    'count', d.n
                ) ORDER BY d.day, d.amb)
            FROM (
                SELECT gs.day::date AS day, a.amb, COUNT(p.id)::int AS n
                FROM generate_series(v_since, now()::date, interval '1 day') gs(day)
                CROSS JOIN (
                    SELECT DISTINCT lower(utm_source) AS amb
                    FROM public.profiles
                    WHERE utm_source IS NOT NULL
                      AND (lower(COALESCE(utm_medium, '')) = 'ambassador'
                           OR lower(utm_source) IN ('tafa', 'pau'))
                ) a
                LEFT JOIN public.profiles p
                  ON lower(p.utm_source) = a.amb
                 AND (lower(COALESCE(p.utm_medium, '')) = 'ambassador'
                      OR lower(p.utm_source) IN ('tafa', 'pau'))
                 AND p.created_at::date = gs.day::date
                GROUP BY 1, 2
            ) d
        ), '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ambassador_leads(int) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. admin_event_creator_revenue: ranking de creadores de eventos por dinero
-- ---------------------------------------------------------------------
-- Fuente: ledger payments (type='ticket'). Solo pagos cobrados de verdad
-- (succeeded o partially_refunded, restando lo reembolsado del bruto).
-- "franky_fee" = comisión de plataforma (application_fee del Connect).
CREATE OR REPLACE FUNCTION public.admin_event_creator_revenue(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_days int := GREATEST(LEAST(COALESCE(p_range_days, 30), 3650), 1);
    v_since timestamptz;
BEGIN
    v_since := now() - (v_days || ' days')::interval;
    PERFORM public._admin_required();

    RETURN jsonb_build_object(
        'period_days', v_days,
        'creators', COALESCE((
            SELECT jsonb_agg(to_jsonb(t) ORDER BY t.franky_fee_cents DESC)
            FROM (
                SELECT
                    pay.seller_id AS organizer_id,
                    COALESCE(pr.full_name, 'Usuario eliminado') AS name,
                    pr.email,
                    COUNT(*)::int AS tickets_sold,
                    COUNT(DISTINCT COALESCE(pay.metadata->>'event_id', pay.ref_id::text))::int AS events_count,
                    SUM(pay.amount_cents - pay.refunded_cents)::bigint AS gross_cents,
                    SUM(pay.application_fee_cents)::bigint AS franky_fee_cents,
                    SUM(pay.amount_cents - pay.refunded_cents - pay.application_fee_cents)::bigint AS organizer_net_cents
                FROM public.payments pay
                LEFT JOIN public.profiles pr ON pr.id = pay.seller_id
                WHERE pay.type = 'ticket'
                  AND pay.status IN ('succeeded', 'partially_refunded')
                  AND pay.created_at >= v_since
                GROUP BY pay.seller_id, pr.full_name, pr.email
                ORDER BY SUM(pay.application_fee_cents) DESC
                LIMIT 25
            ) t
        ), '[]'::jsonb),
        'totals', (
            SELECT jsonb_build_object(
                'tickets', COUNT(*)::int,
                'gross_cents', COALESCE(SUM(amount_cents - refunded_cents), 0)::bigint,
                'franky_fee_cents', COALESCE(SUM(application_fee_cents), 0)::bigint
            )
            FROM public.payments
            WHERE type = 'ticket'
              AND status IN ('succeeded', 'partially_refunded')
              AND created_at >= v_since
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_event_creator_revenue(int) TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (ejecutar manualmente tras aplicar)
-- =====================================================================
-- Como admin:
--   SELECT public.admin_set_user_role('<uuid_de_un_user>', 'analyst');  -> ok:true
--   SELECT public.admin_ambassador_leads(30);                           -> jsonb con totals/daily
--   SELECT public.admin_event_creator_revenue(30);                      -> jsonb con creators
--   DELETE FROM public.profiles WHERE role='admin';                     -> EXCEPTION admin_account_protected
--   UPDATE public.profiles SET role='user' WHERE role='admin';          -> EXCEPTION admin_role_is_permanent
--   INSERT de un segundo admin                                          -> viola profiles_single_admin_uniq
--
-- Como analista:
--   SELECT COUNT(*) FROM public.profiles;            -> ve todas las filas
--   SELECT public.admin_kpis_summary(30);            -> jsonb (lectura ok)
--   SELECT public.admin_fomo_moderate(...);          -> EXCEPTION forbidden
--   SELECT public.admin_set_user_role(...);          -> EXCEPTION forbidden
--   UPDATE public.profiles SET full_name='x' WHERE id <> auth.uid(); -> 0 filas
-- =====================================================================
