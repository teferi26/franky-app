-- 032_event_show_participant_count.sql
-- Permite al organizador decidir si el número de personas apuntadas es público.
-- Por defecto sí se muestra para no romper el comportamiento histórico.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS show_participant_count BOOLEAN NOT NULL DEFAULT true;
