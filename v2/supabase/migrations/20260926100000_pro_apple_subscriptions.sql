-- Franky Pro cobrado con suscripciones de la App Store (compra dentro de la app).
--
-- La app compra con appAccountToken = id del usuario de Supabase y manda la
-- transacción firmada a /api/apple/pro/verify. Apple avisa después de cada
-- renovación, fallo de cobro, reembolso o baja a /api/apple/notifications.
-- Las dos rutas verifican la firma de Apple y escriben aquí con service_role
-- a través de pro_apply_apple_state: ningún cliente escribe en estas tablas.
--
--   * pro_subscriptions        una fila por suscripción de Apple
--                              (original_transaction_id).
--   * pro_apple_notifications  registro de notificaciones ya procesadas para
--                              que un reenvío de Apple no se aplique dos veces.
--   * get_my_pro_access()      lo que la app necesita saber del usuario.
--   * pro_access_for_organization(uuid)
--                              si el espacio tiene Pro por su dueño o admin.

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL
    OR to_regclass('public.organization_memberships') IS NULL THEN
    RAISE EXCEPTION 'pro_apple_subscriptions_predecessor_missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pro_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'apple' CHECK (source IN ('apple')),
  product_id text NOT NULL CHECK (product_id IN (
    'es.franky.app.pro.m12','es.franky.app.pro.m19','es.franky.app.pro.m29',
    'es.franky.app.pro.m39','es.franky.app.pro.m49','es.franky.app.pro.m80')),
  tier text NOT NULL CHECK (tier IN ('m12','m19','m29','m39','m49','m80')),
  original_transaction_id text NOT NULL UNIQUE CHECK (original_transaction_id ~ '^[0-9A-Za-z._-]{1,64}$'),
  latest_transaction_id text NOT NULL CHECK (latest_transaction_id ~ '^[0-9A-Za-z._-]{1,64}$'),
  environment text NOT NULL CHECK (environment IN ('Sandbox','Production')),
  status text NOT NULL CHECK (status IN (
    'trialing','active','billing_retry','grace','expired','revoked','refunded')),
  is_trial boolean NOT NULL DEFAULT false,
  auto_renew boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  -- Fin del periodo de gracia de Apple (solo con status grace).
  grace_expires_at timestamptz,
  raw_last_notification_type text CHECK (length(raw_last_notification_type) <= 80),
  -- Fecha de firma del último dato aplicado: un aviso más viejo que llega
  -- tarde no pisa un estado más reciente.
  last_signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_subscriptions_user_idx
  ON public.pro_subscriptions (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_apple_notifications (
  notification_uuid text PRIMARY KEY CHECK (length(notification_uuid) BETWEEN 1 AND 80),
  notification_type text NOT NULL CHECK (length(notification_type) <= 80),
  subtype text CHECK (length(subtype) <= 80),
  original_transaction_id text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_apple_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_subscriptions, public.pro_apple_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pro_subscriptions, public.pro_apple_notifications TO service_role;
-- El usuario ve sus propias suscripciones; nunca las de otro y nunca escribe.
GRANT SELECT ON public.pro_subscriptions TO authenticated;

DROP POLICY IF EXISTS pro_subscriptions_own_read ON public.pro_subscriptions;
CREATE POLICY pro_subscriptions_own_read ON public.pro_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reglas de acceso
-- ---------------------------------------------------------------------------

-- Pro vigente: prueba, activa o en reintento de cobro con el periodo pagado
-- aún por delante; o en periodo de gracia mientras Apple sigue intentando
-- cobrar. Caducada, revocada o reembolsada nunca da acceso.
CREATE OR REPLACE FUNCTION public.pro_subscription_grants_access(
  p_status text, p_expires_at timestamptz, p_grace_expires_at timestamptz, p_now timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_status IN ('trialing','active','billing_retry') THEN coalesce(p_expires_at > p_now, false)
    WHEN p_status = 'grace' THEN coalesce(greatest(p_expires_at, p_grace_expires_at) > p_now, false)
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION public.pro_subscription_grants_access(text,timestamptz,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_subscription_grants_access(text,timestamptz,timestamptz,timestamptz)
  TO service_role;

-- Resumen del acceso de una persona. Privada: solo la usan las RPC de abajo
-- y el servidor (service_role).
CREATE OR REPLACE FUNCTION public.pro_access_for_user(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  best public.pro_subscriptions;
  has_pro boolean;
BEGIN
  SELECT s.* INTO best
    FROM public.pro_subscriptions s
   WHERE s.user_id = p_user
   ORDER BY public.pro_subscription_grants_access(s.status, s.expires_at, s.grace_expires_at) DESC,
            s.expires_at DESC NULLS LAST,
            s.updated_at DESC
   LIMIT 1;

  IF best.id IS NULL THEN
    RETURN jsonb_build_object(
      'pro', false, 'status', null, 'tier', null, 'product_id', null,
      'expires_at', null, 'is_trial', false, 'trial_eligible', true);
  END IF;

  has_pro := public.pro_subscription_grants_access(best.status, best.expires_at, best.grace_expires_at);
  RETURN jsonb_build_object(
    'pro', has_pro,
    'status', best.status,
    'tier', best.tier,
    'product_id', best.product_id,
    'expires_at', CASE WHEN best.status = 'grace'
                       THEN greatest(best.expires_at, best.grace_expires_at)
                       ELSE best.expires_at END,
    'is_trial', has_pro AND best.is_trial,
    -- Apple da la prueba una vez por grupo; quien ya tuvo Pro no la repite.
    'trial_eligible', false);
END $$;
REVOKE ALL ON FUNCTION public.pro_access_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_access_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_pro_access() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN public.pro_access_for_user(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.get_my_pro_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pro_access() TO authenticated;

-- Un espacio tiene Pro si alguno de sus dueños o administradores activos lo
-- tiene. Solo lo puede preguntar quien es miembro activo de ese espacio.
CREATE OR REPLACE FUNCTION public.pro_access_for_organization(p_org uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
     WHERE m.organization_id = p_org AND m.user_id = auth.uid() AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.organization_memberships m
      JOIN public.pro_subscriptions s ON s.user_id = m.user_id
     WHERE m.organization_id = p_org
       AND m.status = 'active'
       AND m.role IN ('owner','admin')
       AND public.pro_subscription_grants_access(s.status, s.expires_at, s.grace_expires_at));
END $$;
REVOKE ALL ON FUNCTION public.pro_access_for_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_access_for_organization(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Escritura (solo servidor, tras verificar la firma de Apple)
-- ---------------------------------------------------------------------------

-- p_state: { user_id, product_id, tier, original_transaction_id,
--   latest_transaction_id, environment, status, is_trial, auto_renew,
--   expires_at, grace_expires_at, signed_at, notification_type }
-- p_notification: { uuid, type, subtype } cuando viene de un aviso de Apple.
--
-- Devuelve { applied, duplicate, stale, created }. Lanza
-- pro_subscription_owner_conflict si la transacción ya es de otra cuenta y
-- pro_subscription_owner_unknown si no hay fila ni usuario al que asignarla.
CREATE OR REPLACE FUNCTION public.pro_apply_apple_state(p_state jsonb, p_notification jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_original text := p_state->>'original_transaction_id';
  v_user uuid := nullif(p_state->>'user_id', '')::uuid;
  v_signed timestamptz := nullif(p_state->>'signed_at', '')::timestamptz;
  v_uuid text := p_notification->>'uuid';
  existing public.pro_subscriptions;
BEGIN
  IF v_original IS NULL THEN
    RAISE EXCEPTION 'pro_subscription_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_uuid IS NOT NULL THEN
    INSERT INTO public.pro_apple_notifications(notification_uuid, notification_type, subtype, original_transaction_id)
    VALUES (v_uuid, coalesce(p_notification->>'type', 'UNKNOWN'), p_notification->>'subtype', v_original)
    ON CONFLICT (notification_uuid) DO NOTHING;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('applied', false, 'duplicate', true, 'stale', false, 'created', false);
    END IF;
  END IF;

  SELECT * INTO existing FROM public.pro_subscriptions
   WHERE original_transaction_id = v_original FOR UPDATE;

  IF existing.id IS NULL THEN
    IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
      RAISE EXCEPTION 'pro_subscription_owner_unknown' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.pro_subscriptions(
      user_id, source, product_id, tier, original_transaction_id, latest_transaction_id,
      environment, status, is_trial, auto_renew, expires_at, grace_expires_at,
      raw_last_notification_type, last_signed_at)
    VALUES (
      v_user, 'apple', p_state->>'product_id', p_state->>'tier', v_original,
      coalesce(p_state->>'latest_transaction_id', v_original),
      p_state->>'environment', p_state->>'status',
      coalesce((p_state->>'is_trial')::boolean, false),
      coalesce((p_state->>'auto_renew')::boolean, true),
      nullif(p_state->>'expires_at', '')::timestamptz,
      nullif(p_state->>'grace_expires_at', '')::timestamptz,
      p_state->>'notification_type', v_signed);
    RETURN jsonb_build_object('applied', true, 'duplicate', false, 'stale', false, 'created', true);
  END IF;

  IF v_user IS NOT NULL AND existing.user_id <> v_user THEN
    RAISE EXCEPTION 'pro_subscription_owner_conflict' USING ERRCODE = '42501';
  END IF;
  IF existing.environment <> p_state->>'environment' THEN
    RAISE EXCEPTION 'pro_subscription_environment_mismatch' USING ERRCODE = '22023';
  END IF;

  -- Un dato firmado antes que el último aplicado llega tarde: se ignora.
  IF v_signed IS NOT NULL AND existing.last_signed_at IS NOT NULL AND v_signed < existing.last_signed_at THEN
    RETURN jsonb_build_object('applied', false, 'duplicate', false, 'stale', true, 'created', false);
  END IF;

  UPDATE public.pro_subscriptions SET
    product_id = coalesce(p_state->>'product_id', product_id),
    tier = coalesce(p_state->>'tier', tier),
    latest_transaction_id = coalesce(p_state->>'latest_transaction_id', latest_transaction_id),
    status = coalesce(p_state->>'status', status),
    is_trial = coalesce((p_state->>'is_trial')::boolean, is_trial),
    auto_renew = coalesce((p_state->>'auto_renew')::boolean, auto_renew),
    expires_at = coalesce(nullif(p_state->>'expires_at', '')::timestamptz, expires_at),
    grace_expires_at = CASE WHEN p_state ? 'grace_expires_at'
                            THEN nullif(p_state->>'grace_expires_at', '')::timestamptz
                            ELSE grace_expires_at END,
    raw_last_notification_type = coalesce(p_state->>'notification_type', raw_last_notification_type),
    last_signed_at = greatest(last_signed_at, v_signed),
    updated_at = now()
  WHERE id = existing.id;
  RETURN jsonb_build_object('applied', true, 'duplicate', false, 'stale', false, 'created', false);
END $$;
REVOKE ALL ON FUNCTION public.pro_apply_apple_state(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_apply_apple_state(jsonb, jsonb) TO service_role;
