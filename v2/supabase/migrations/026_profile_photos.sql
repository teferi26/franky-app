-- 026_profile_photos.sql
-- Adds support for up to 6 profile photos (used by RoomieMatch swipe cards
-- and the public profile view). Stored as an ordered array of public URLs
-- pointing to objects in the existing `avatars` bucket.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Defensive: cap to 6 entries on update.
CREATE OR REPLACE FUNCTION public.cap_profile_photos()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.photos IS NULL THEN
        NEW.photos := '{}'::text[];
    ELSIF array_length(NEW.photos, 1) > 6 THEN
        NEW.photos := NEW.photos[1:6];
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cap_profile_photos_trigger ON public.profiles;
CREATE TRIGGER cap_profile_photos_trigger
    BEFORE INSERT OR UPDATE OF photos ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.cap_profile_photos();
