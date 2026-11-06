-- ═══════════════════════════════════════════════════════════════════════════
-- 128: Coordenadas propias en events
--
-- Los eventos creados desde la app rápida no aparecían donde el organizador
-- quería: el mapa solo sabía anclarlos si el texto del venue coincidía con
-- una zona del catálogo, y si no, caían al centroide de la ciudad. Ahora el
-- formulario nativo deja fijar el punto exacto en un mini-mapa y se guarda
-- aquí; el mapa de Eventos usa estas coordenadas con prioridad.
-- Aplicable desde el SQL Editor. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.events.latitude IS '128: punto exacto elegido por el organizador (mini-mapa del formulario móvil).';

NOTIFY pgrst, 'reload schema';
