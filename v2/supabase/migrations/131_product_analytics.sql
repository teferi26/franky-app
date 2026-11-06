-- ═══════════════════════════════════════════════════════════════════════════
-- 131: Analítica de producto (Ola 0, mejora 100)
--
-- Un event stream propio de acciones de usuario en la app (pantallas vistas,
-- publicar, apuntarse a evento, seguir, match, etc.). Sin esto no sabemos qué
-- de las 100 mejoras mueve la aguja. Escritura directa desde el cliente con
-- RLS (cada quien inserta sus propios eventos); la lectura la hace el panel
-- admin con service role. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    props       JSONB NOT NULL DEFAULT '{}'::jsonb,
    platform    TEXT CHECK (platform IN ('ios', 'android', 'web')),
    app_version TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_name_time ON public.analytics_events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_time ON public.analytics_events (user_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- Cada usuario inserta solo sus propios eventos; nadie lee vía anon/authenticated
-- (el análisis lo hace el service role / panel admin). Sin política SELECT.
DROP POLICY IF EXISTS analytics_events_insert ON public.analytics_events;
CREATE POLICY analytics_events_insert ON public.analytics_events
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Retención: purga a los 180 días (si pg_cron está disponible).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge_analytics_events') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_analytics_events');
    PERFORM cron.schedule('purge_analytics_events', '30 3 * * *',
      $job$DELETE FROM public.analytics_events WHERE created_at < NOW() - INTERVAL '180 days';$job$);
  END IF;
END $$;

COMMENT ON TABLE public.analytics_events IS '131: event stream de producto; inserción propia por RLS, lectura por service role.';

NOTIFY pgrst, 'reload schema';
