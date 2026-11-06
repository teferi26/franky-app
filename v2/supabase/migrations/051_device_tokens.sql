-- =====================================================
-- 051: Device Tokens — push notifications registry
-- =====================================================
-- Tabla para guardar FCM (Android) y APNs (iOS) device tokens.
-- La edge function `send-push-notification` lee de aquí para enviar
-- notificaciones al recipient correcto en cada device suyo.
--
-- Cada user puede tener N tokens (iPhone + iPad + Android phone).
-- Tokens antiguos se purgan cuando dejan de recibirse en `last_seen_at`.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    app_version TEXT,
    device_model TEXT,
    locale TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user
  ON public.device_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_last_seen
  ON public.device_tokens(last_seen_at DESC);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users CRUD only their own tokens
CREATE POLICY "Users manage own device tokens"
  ON public.device_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role (used by edge functions) bypasses RLS by design.

COMMENT ON TABLE public.device_tokens IS
  'FCM/APNs device tokens for push notifications. One row per (user, device).';
