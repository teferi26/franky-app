-- =====================================================
-- 090: Config de email en tabla (sustituye a app.* GUC)
-- =====================================================
-- En este proyecto el rol `postgres` (vía pooler) NO puede ejecutar
-- `ALTER DATABASE postgres SET app.*` ("permission denied to set parameter").
-- Por eso `dispatch_email` (089) no podía leer su URL/secreto desde
-- current_setting(). Aquí movemos esa config a una tabla normal a la que el
-- rol sí tiene acceso, y reescribimos dispatch_email para leer de ella.
--
-- La URL no es secreta y se inserta aquí. El secreto se inserta aparte con un
-- script one-off (no commiteado) para no exponerlo en el repo.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. Tabla de settings (solo service-role / SECURITY DEFINER)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- Sin políticas para `authenticated`/`anon`: solo el service-role y las
-- funciones SECURITY DEFINER (que saltan RLS) pueden leer el secreto.

COMMENT ON TABLE public.app_settings IS
  '090: config interna (notify_email_url/secret). Solo accesible vía service-role.';

-- URL pública del endpoint (el secreto se inserta con script aparte).
INSERT INTO public.app_settings (key, value)
VALUES ('notify_email_url', 'https://franky.es/api/internal/notify-email')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ─────────────────────────────────────────────────────
-- 2. Reescribir dispatch_email para leer de app_settings
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_email(
  p_user_id UUID,
  p_type    TEXT,
  p_title   TEXT,
  p_body    TEXT,
  p_data    JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url    FROM public.app_settings WHERE key = 'notify_email_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'notify_email_secret';
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    -- Sin settings configurados → silencioso (email opcional).
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object(
      'user_id', p_user_id::text,
      'type',    p_type,
      'title',   p_title,
      'body',    p_body,
      'data',    p_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_email failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.dispatch_email IS
  '090: invoca /api/internal/notify-email vía pg_net leyendo config de app_settings.';
