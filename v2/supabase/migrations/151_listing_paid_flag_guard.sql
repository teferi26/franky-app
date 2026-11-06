-- 151_listing_paid_flag_guard.sql
--
-- HALLAZGO (auditoría 27-jul-2026): bypass de pago por asignación masiva.
--
-- Las políticas de escritura de anuncios solo comprueban la PROPIEDAD de la
-- fila, nunca QUÉ columnas cambian:
--
--     -- 001_schema.sql:694
--     CREATE POLICY "Owners can update their accommodations"
--       ON public.accommodations FOR UPDATE USING (auth.uid() = owner_id);
--     -- 028_business_subscriptions.sql:51
--     CREATE POLICY "Owners manage own leisure spots"
--       ON public.leisure_spots FOR ALL
--       USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
--
-- is_paid y el vínculo a la suscripción los escribe el webhook de Stripe,
-- pero nada lo impedía desde el cliente. Un usuario registrado podía hacer
--
--     PATCH /rest/v1/accommodations?id=eq.<su-anuncio>   { "is_paid": true }
--
-- con la anon key (pública) y su propio JWT, y colocar su anuncio en el
-- catálogo público sin pasar por Stripe, o reactivarlo tras cancelar la
-- suscripción (el webhook lo pone en false, el dueño lo revertía).
--
-- ARREGLO: trigger que VALIDA en vez de forzar. El alta legítima de
-- /api/negocio/registro escribe is_paid=true cuando el propietario ya tiene
-- plan contratado, y eso debe seguir funcionando: por eso el trigger no pone
-- false a ciegas, sino que comprueba contra owner_subscriptions /
-- business_subscriptions que la suscripción existe y está viva. Si no la hay,
-- la columna cae a false (fail-closed) en vez de romper la petición; el
-- webhook de Stripe la pondrá a true cuando el cobro se confirme.
--
-- service_role (webhook) y admins quedan fuera del guard, igual que en la 101.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.

-- ─────────────────────────────────────────────────────
-- 1. ¿Tiene este propietario una suscripción viva que cubra este anuncio?
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._listing_has_live_subscription(
    p_owner_id UUID,
    p_kind     TEXT,      -- 'housing' | 'leisure'
    p_listing  UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        -- Plan de propietario a nivel de cuenta (solo pisos).
        (p_kind = 'housing' AND EXISTS (
            SELECT 1 FROM public.owner_subscriptions os
             WHERE os.owner_id = p_owner_id
               AND os.status IN ('active', 'trialing')
        ))
        OR
        -- Suscripción por ficha (pisos sueltos y locales de ocio).
        EXISTS (
            SELECT 1 FROM public.business_subscriptions bs
             WHERE bs.owner_id = p_owner_id
               AND bs.type     = p_kind
               AND bs.status IN ('active', 'trialing')
               AND (bs.listing_id IS NULL OR bs.listing_id = p_listing)
        );
$$;

-- ─────────────────────────────────────────────────────
-- 2. Guard de las columnas de cobro
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_listing_billing_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
    -- "usuario final" = autenticado normal (ni admin, ni service_role, ni
    -- conexión backend directa sin claims JWT). Mismo criterio que la 101.
    v_is_end_user boolean := (v_uid IS NOT NULL
                              AND v_jwt_role = 'authenticated'
                              AND NOT public.is_admin());
    v_kind     text := CASE WHEN TG_TABLE_NAME = 'leisure_spots' THEN 'leisure' ELSE 'housing' END;
BEGIN
    IF NOT v_is_end_user THEN
        RETURN NEW;   -- webhook de Stripe (service_role) y admins pasan.
    END IF;

    -- El vínculo con la suscripción no lo elige el cliente.
    IF TG_OP = 'INSERT' THEN
        NEW.subscription_id := NULL;
        IF TG_TABLE_NAME = 'accommodations' THEN
            NEW.owner_subscription_id := NULL;
        END IF;
    ELSE
        NEW.subscription_id := OLD.subscription_id;
        IF TG_TABLE_NAME = 'accommodations' THEN
            NEW.owner_subscription_id := OLD.owner_subscription_id;
        END IF;
    END IF;

    -- is_paid solo se sostiene si hay suscripción viva de verdad.
    IF COALESCE(NEW.is_paid, false) THEN
        IF NOT public._listing_has_live_subscription(NEW.owner_id, v_kind, NEW.id) THEN
            NEW.is_paid := false;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accommodations_billing_guard ON public.accommodations;
CREATE TRIGGER trg_accommodations_billing_guard
    BEFORE INSERT OR UPDATE ON public.accommodations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_billing_guard();

DROP TRIGGER IF EXISTS trg_leisure_spots_billing_guard ON public.leisure_spots;
CREATE TRIGGER trg_leisure_spots_billing_guard
    BEFORE INSERT OR UPDATE ON public.leisure_spots
    FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_billing_guard();

-- NOTA: no se usa aquí REVOKE UPDATE (columna) porque en PostgreSQL un GRANT
-- de UPDATE a nivel de tabla ya cubre todas las columnas y el REVOKE por
-- columna no lo "resta"; habría que revocar la tabla entera y re-conceder
-- columna a columna, lo que se rompería con cada migración futura que añada
-- una. El trigger es el mecanismo que realmente lo impide.
--
-- PENDIENTE (decisión de producto, no de seguridad): /api/negocio/registro
-- da de alta los locales de ocio con is_verified = true sin revisión humana.
-- Conviene que nazcan sin verificar y que un admin los apruebe.
