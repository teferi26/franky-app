-- =====================================================================
-- 20260924202000_audit_db_hardening.sql
-- Endurecimiento de BD tras la auditoría de septiembre de 2026.
--
-- Idempotente y seguro de re-ejecutar. Nada destructivo: no borra datos,
-- columnas ni tablas. Solo fija configuración de funciones, reescribe una
-- función con la misma firma, crea índices si faltan y sustituye una política
-- SELECT demasiado abierta.
--
-- A. search_path fijo en funciones SECURITY DEFINER antiguas.
--    handle_new_user, handle_new_profile, check_premium_limit,
--    kick_event_participant, get_roulette_suggestion, save_roulette_result,
--    get_or_create_conversation, create_group_chat, leave_group_chat y
--    set_signup_attribution se crearon sin SET search_path ("function
--    search_path mutable"): quien controle un esquema que vaya antes en el
--    search_path del invocador podría secuestrar una llamada sin calificar
--    dentro de una función que corre con privilegios del dueño.
--    La 117 ya hacía esto en bloque y la 20260905203107 lo hizo para
--    handle_new_user, pero no hay garantía de que prod coincida con el repo.
--    En vez de reescribir cuerpos, un bloque DO recorre pg_proc por NOMBRE en
--    el esquema public y hace ALTER FUNCTION ... SET search_path a TODAS las
--    sobrecargas SECURITY DEFINER con ese nombre que aún no tengan search_path
--    en proconfig. Así no falla si una firma difiere en prod y no pisa las
--    que ya lo traen. Se usa 'public, pg_temp': revisados los cuerpos
--    vigentes, solo llaman a public.* (tablas e is_admin()), auth.uid()
--    (calificado) y funciones de pg_catalog (now, random, split_part,
--    date_trunc, coalesce...). Ninguna usa pgcrypto ni otra extensión, así
--    que no hace falta 'extensions'.
--
-- B. search_careers: page_size acotado a [1, 50] y page_offset >= 0.
--    Es ejecutable por anon: sin acotar, una sola llamada con page_size
--    enorme volcaba el catálogo entero de carreras (scraping y carga en BD).
--    Definición vigente: 20260906061000_fractional_academic_durations.sql
--    (no hay otra posterior). Se reproduce COMPLETA con la misma firma, tipo
--    de retorno, SET search_path, dueño y grants; lo único nuevo son las dos
--    variables acotadas del DECLARE. page_size NULL pasa a 20 (su DEFAULT)
--    en lugar de "sin límite".
--
-- C. Índices en claves foráneas de la facturación SaaS de organizaciones
--    (20260923234500_organization_saas_billing.sql). Postgres no indexa las
--    FK solo; las RPC filtran por organization_id, account_id, quote_id,
--    subscription_id... y un DELETE/UPDATE en la tabla padre recorrería la
--    hija entera. Solo se crean los que no cubre ya una PK/UNIQUE. Cada
--    tabla va con guarda to_regclass: en prod esa migración AÚN NO está
--    aplicada, y entonces el bloque se salta sin error.
--
-- D. qr_scans: la política qr_scans_select_authenticated (109) era
--    USING (true): cualquier usuario con sesión podía leer todos los escaneos
--    de QR (campaña, fecha, user agent...). Pasa a solo administradores.
--    Verificado antes: ningún código cliente (web/src, mobile) lee qr_scans
--    con la sesión del usuario; el panel admin usa la RPC SECURITY DEFINER
--    admin_growth_attribution, que no depende de esta política. La política
--    INSERT pública ("Anyone can register scans") no se toca.
-- =====================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------
-- A. search_path fijo en las SECURITY DEFINER antiguas
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'handle_new_user',
        'handle_new_profile',
        'check_premium_limit',
        'kick_event_participant',
        'get_roulette_suggestion',
        'save_roulette_result',
        'get_or_create_conversation',
        'create_group_chat',
        'leave_group_chat',
        'set_signup_attribution'
      ])
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'audit_db_hardening A: search_path fijado en % funciones.', v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- B. search_careers con paginación acotada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_careers(search_query text DEFAULT NULL::text, filter_branch text DEFAULT NULL::text, filter_university uuid DEFAULT NULL::uuid, filter_comunidad text DEFAULT NULL::text, min_score numeric DEFAULT NULL::numeric, max_score numeric DEFAULT NULL::numeric, sort_by text DEFAULT 'cut_off_score'::text, sort_order text DEFAULT 'DESC'::text, page_size integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, branch text, cut_off_score numeric, university_name text, university_slug text, university_city text, university_type text, duration_years numeric, credits integer, places_offered integer, modality text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    -- Acotado de paginación (auditoría sep-2026): máximo 50 filas por
    -- llamada y nunca un offset negativo.
    v_page_size integer := LEAST(GREATEST(COALESCE(page_size, 20), 1), 50);
    v_page_offset integer := GREATEST(COALESCE(page_offset, 0), 0);
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.branch,
        c.cut_off_score,
        u.name AS university_name,
        u.slug AS university_slug,
        u.city AS university_city,
        u.type AS university_type,
        c.duration_years,
        c.credits,
        c.places_offered,
        c.modality,
        COUNT(*) OVER() AS total_count
    FROM public.careers c
    JOIN public.universities u ON c.university_id = u.id
    WHERE
        (search_query IS NULL OR c.name ILIKE '%' || search_query || '%' OR u.name ILIKE '%' || search_query || '%')
        AND (filter_branch IS NULL OR c.branch = filter_branch)
        AND (filter_university IS NULL OR c.university_id = filter_university)
        AND (filter_comunidad IS NULL OR u.comunidad_autonoma = filter_comunidad)
        AND (min_score IS NULL OR c.cut_off_score >= min_score)
        AND (max_score IS NULL OR c.cut_off_score <= max_score)
    ORDER BY
        CASE WHEN sort_by = 'cut_off_score' AND sort_order = 'DESC' THEN c.cut_off_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'cut_off_score' AND sort_order = 'ASC' THEN c.cut_off_score END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_order = 'ASC' THEN c.name END ASC,
        CASE WHEN sort_by = 'name' AND sort_order = 'DESC' THEN c.name END DESC,
        c.name ASC
    LIMIT v_page_size
    OFFSET v_page_offset;
END;
$function$
;
ALTER FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_careers(text,text,uuid,text,numeric,numeric,text,text,integer,integer) TO PUBLIC, postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- C. Índices en FK de la facturación SaaS (solo si las tablas existen)
--    Ya cubiertos por PK/UNIQUE y por eso ausentes aquí:
--    organization_billing_accounts(organization_id) PK e (id) UNIQUE,
--    organization_founder_approvals(organization_id) PK,
--    organization_provider_prices(plan_key, plan_version) prefijo de la PK,
--    organization_checkout_attempts(organization_id) prefijo del UNIQUE
--    (organization_id, actor_id, request_key),
--    organization_subscriptions(attempt_id) UNIQUE,
--    organization_entitlement_grants(period_id) UNIQUE.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
  v_created integer := 0;
  v_skipped integer := 0;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ['organization_billing_quotes',        'organization_billing_quotes_organization_idx',   'organization_id'],
    ['organization_billing_quotes',        'organization_billing_quotes_account_idx',        'account_id'],
    ['organization_billing_quotes',        'organization_billing_quotes_plan_idx',           'plan_key, plan_version'],
    ['organization_checkout_attempts',     'organization_checkout_attempts_quote_idx',       'quote_id'],
    ['organization_checkout_attempts',     'organization_checkout_attempts_account_idx',     'account_id'],
    ['organization_subscriptions',         'organization_subscriptions_organization_idx',    'organization_id, environment'],
    ['organization_subscriptions',         'organization_subscriptions_account_idx',         'account_id'],
    ['organization_subscription_periods',  'organization_subscription_periods_subscription_idx', 'subscription_id'],
    ['organization_entitlement_grants',    'organization_entitlement_grants_organization_idx', 'organization_id'],
    ['organization_billing_events',        'organization_billing_events_organization_idx',   'organization_id'],
    ['organization_billing_audit',         'organization_billing_audit_organization_idx',    'organization_id']
  ]
  LOOP
    IF to_regclass(format('public.%I', spec[1])) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    -- spec[3] es una lista fija de columnas escrita aquí, no entrada externa.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', spec[2], spec[1], spec[3]);
    v_created := v_created + 1;
  END LOOP;
  RAISE NOTICE 'audit_db_hardening C: % índices asegurados, % saltados (tabla ausente).', v_created, v_skipped;
END;
$$;

-- ---------------------------------------------------------------------
-- D. qr_scans: lectura solo para administradores
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.qr_scans') IS NULL THEN
    RAISE NOTICE 'audit_db_hardening D: public.qr_scans no existe, se salta.';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "qr_scans_select_authenticated" ON public.qr_scans;
  DROP POLICY IF EXISTS "Scans viewable by authenticated" ON public.qr_scans;
  DROP POLICY IF EXISTS "qr_scans_select_admin" ON public.qr_scans;
  CREATE POLICY "qr_scans_select_admin"
    ON public.qr_scans FOR SELECT TO authenticated
    USING ((SELECT public.is_admin()));
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
