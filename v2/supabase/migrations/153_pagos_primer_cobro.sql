-- 153_pagos_primer_cobro.sql
--
-- Auditoría del camino de pago (27-jul-2026), antes del primer cliente real.
-- Todavía no ha habido ningún cobro, así que estos fallos nunca se han visto,
-- pero cada uno rompería un pago en cuanto llegue.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.

-- ─────────────────────────────────────────────────────
-- 1. [P0] profiles.stripe_customer_id no está en NINGUNA migración
--
-- El webhook la escribe (webhook/route.ts:422, dentro de assertWrite, o sea
-- que si falla responde 500 y Stripe reintenta 3 días), y la leen checkout,
-- portal, invoices, pay/ticket y el cron de facturas mensuales.
--
-- En producción parece existir (la 113 la nombra al tapar la fuga de PII), o
-- sea que se creó a mano en su día. Pero al no estar en migraciones, cualquier
-- entorno reconstruido desde el repo se queda sin ella y TODOS los pagos de
-- Pro/Premium fallan. Se añade con IF NOT EXISTS: si ya está, no hace nada.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
    ON public.profiles(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS
    'ID de cliente en Stripe. Lo escribe el webhook y checkout; nunca el cliente.';

-- ─────────────────────────────────────────────────────
-- 2. [P0] Regresión de la 151: se perdía el vínculo con el plan del propietario
--
-- La 151 anulaba owner_subscription_id en los INSERT de usuario final, para
-- que nadie se autoasignara un plan. Pero /api/negocio/registro da de alta el
-- piso con el cliente de sesión y escribe ahí el plan que YA tiene contratado
-- (registro/route.ts:260). Resultado: el piso se publicaba bien, pero sin
-- vínculo.
--
-- Eso importa porque el webhook propaga la visibilidad por ese vínculo:
--   * al cancelar o impagar  -> webhook/route.ts:527 despublica los pisos
--     filtrando por owner_subscription_id
--   * al reactivar           -> webhook/route.ts:164 los vuelve a publicar
-- Sin vínculo, ambos afectan a 0 filas: los pisos de quien deje de pagar
-- seguirían publicados para siempre.
--
-- Arreglo: en vez de anularlo a ciegas, se ACEPTA si apunta a una suscripción
-- viva DEL PROPIO dueño. Si no, se anula. Mismo criterio que ya se usa para
-- is_paid: validar en lugar de forzar.
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
    v_is_end_user boolean := (v_uid IS NOT NULL
                              AND v_jwt_role = 'authenticated'
                              AND NOT public.is_admin());
    v_kind     text := CASE WHEN TG_TABLE_NAME = 'leisure_spots' THEN 'leisure' ELSE 'housing' END;
    v_owner_ok boolean;
BEGIN
    IF NOT v_is_end_user THEN
        RETURN NEW;   -- webhook de Stripe (service_role) y admins pasan.
    END IF;

    -- subscription_id (suscripción por ficha) sí lo escribe solo el webhook.
    IF TG_OP = 'INSERT' THEN
        NEW.subscription_id := NULL;
    ELSE
        NEW.subscription_id := OLD.subscription_id;
    END IF;

    -- owner_subscription_id: se acepta si es un plan vivo del propio dueño.
    IF TG_TABLE_NAME = 'accommodations' THEN
        IF NEW.owner_subscription_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.owner_subscriptions os
                 WHERE os.id       = NEW.owner_subscription_id
                   AND os.owner_id = NEW.owner_id
                   AND os.status IN ('active', 'trialing')
            ) INTO v_owner_ok;

            IF NOT v_owner_ok THEN
                -- En UPDATE conservamos el valor anterior en vez de borrarlo:
                -- si el plan caduca, el vínculo debe seguir para que el webhook
                -- sepa qué pisos despublicar.
                NEW.owner_subscription_id := CASE WHEN TG_OP = 'INSERT'
                                                  THEN NULL
                                                  ELSE OLD.owner_subscription_id END;
            END IF;
        ELSIF TG_OP <> 'INSERT' THEN
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

-- ─────────────────────────────────────────────────────
-- 3. [P1] Los CHECK de status no admiten todos los estados que manda Stripe
--
-- El webhook escribe el estado CRUDO de Stripe (webhook/route.ts:500 y :475).
-- Stripe emite además 'unpaid', 'incomplete_expired' y 'paused'. Con el CHECK
-- actual, esa escritura viola la restricción, assertWrite lanza, se responde
-- 500 y Stripe reintenta en bucle hasta rendirse: la suscripción se queda
-- congelada en un estado que no refleja la realidad.
-- ─────────────────────────────────────────────────────
DO $$
DECLARE
    v_estados CONSTANT TEXT :=
        '(''active'',''trialing'',''canceled'',''past_due'',''incomplete'',''unpaid'',''incomplete_expired'',''paused'')';
    v_tabla TEXT;
    v_con   TEXT;
    v_nuevo TEXT;
BEGIN
    FOREACH v_tabla IN ARRAY ARRAY['subscriptions', 'owner_subscriptions', 'business_subscriptions']
    LOOP
        IF to_regclass('public.' || v_tabla) IS NULL THEN
            CONTINUE;   -- entorno donde esa tabla aún no existe
        END IF;

        -- El nombre lo generó Postgres al declarar el CHECK en línea, así que
        -- no se adivina: se busca el CHECK que menciona la columna `status`.
        SELECT c.conname INTO v_con
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = ('public.' || v_tabla)::regclass
           AND c.contype  = 'c'
           AND a.attname  = 'status'
         LIMIT 1;

        IF v_con IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tabla, v_con);
        END IF;

        v_nuevo := v_tabla || '_status_check';
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (status IN %s)',
                       v_tabla, v_nuevo, v_estados);
        RAISE NOTICE 'CHECK de status ampliado en %', v_tabla;
    END LOOP;
END;
$$;
