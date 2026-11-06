-- 027_event_photos.sql
-- Stores up to 5 uploaded photos per event. The first photo is mirrored to
-- `image_url` (already used as the listing thumbnail) so existing screens keep working.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.cap_event_photos()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.photos IS NULL THEN
        NEW.photos := '{}'::text[];
    ELSIF array_length(NEW.photos, 1) > 5 THEN
        NEW.photos := NEW.photos[1:5];
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cap_event_photos_trigger ON public.events;
CREATE TRIGGER cap_event_photos_trigger
    BEFORE INSERT OR UPDATE OF photos ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.cap_event_photos();
