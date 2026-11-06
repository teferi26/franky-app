-- 029_business_extended_fields.sql
-- Extiende leisure_spots y accommodations con todos los campos que los negocios
-- pueden rellenar al registrarse. Crea también el bucket "business-photos" para
-- subir múltiples imágenes por ficha.

-- =====================================================
-- 1. leisure_spots: características + ubicación + extras
-- =====================================================
ALTER TABLE public.leisure_spots
    ADD COLUMN IF NOT EXISTS comunidad_autonoma TEXT,
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS has_wifi BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_billiards BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_air_conditioning BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_terrace BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_outdoor_seating BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_parking BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_food BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_live_music BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS accepts_groups BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS accepts_pets BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS student_discount BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS card_payment BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS reservations BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS min_age INTEGER,
    ADD COLUMN IF NOT EXISTS capacity INTEGER,
    ADD COLUMN IF NOT EXISTS instagram TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS extra_info TEXT;

CREATE INDEX IF NOT EXISTS idx_leisure_university ON public.leisure_spots(university_id);
CREATE INDEX IF NOT EXISTS idx_leisure_comunidad ON public.leisure_spots(comunidad_autonoma);

-- Cap a 20 fotos por ficha
CREATE OR REPLACE FUNCTION public.cap_leisure_images()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.images IS NULL THEN
        NEW.images := '{}'::text[];
    ELSIF array_length(NEW.images, 1) > 20 THEN
        NEW.images := NEW.images[1:20];
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cap_leisure_images_trigger ON public.leisure_spots;
CREATE TRIGGER cap_leisure_images_trigger
    BEFORE INSERT OR UPDATE OF images ON public.leisure_spots
    FOR EACH ROW EXECUTE FUNCTION public.cap_leisure_images();

-- =====================================================
-- 2. accommodations: campos adicionales para anuncios B2B
-- =====================================================
ALTER TABLE public.accommodations
    ADD COLUMN IF NOT EXISTS comunidad_autonoma TEXT,
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS gender_preference TEXT NOT NULL DEFAULT 'any'
        CHECK (gender_preference IN ('any', 'hombre', 'mujer')),
    ADD COLUMN IF NOT EXISTS allows_smokers BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS students_only BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS bills_included BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deposit_months NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS available_until DATE,
    ADD COLUMN IF NOT EXISTS current_flatmates_count INTEGER,
    ADD COLUMN IF NOT EXISTS current_flatmates_genders TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS has_double_bed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_private_bathroom BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_balcony BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS room_size_sqm INTEGER,
    ADD COLUMN IF NOT EXISTS instagram TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS extra_info TEXT;

CREATE INDEX IF NOT EXISTS idx_accom_university ON public.accommodations(university_id);
CREATE INDEX IF NOT EXISTS idx_accom_comunidad ON public.accommodations(comunidad_autonoma);
CREATE INDEX IF NOT EXISTS idx_accom_gender_pref ON public.accommodations(gender_preference);

-- Cap a 20 fotos por ficha (la columna images ya existe)
CREATE OR REPLACE FUNCTION public.cap_accommodation_images()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.images IS NULL THEN
        NEW.images := '{}'::text[];
    ELSIF array_length(NEW.images, 1) > 20 THEN
        NEW.images := NEW.images[1:20];
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cap_accommodation_images_trigger ON public.accommodations;
CREATE TRIGGER cap_accommodation_images_trigger
    BEFORE INSERT OR UPDATE OF images ON public.accommodations
    FOR EACH ROW EXECUTE FUNCTION public.cap_accommodation_images();

-- =====================================================
-- 3. Bucket public "business-photos"
--    Path: <owner_id>/<random>.<ext>
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'business-photos',
    'business-photos',
    true,
    8388608, -- 8 MB por foto
    ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "business_photos_public_select" ON storage.objects;
DROP POLICY IF EXISTS "business_photos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "business_photos_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "business_photos_owner_delete" ON storage.objects;

CREATE POLICY "business_photos_public_select"
    ON storage.objects FOR SELECT
    TO public
    USING ( bucket_id = 'business-photos' );

CREATE POLICY "business_photos_owner_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'business-photos'
        AND owner = auth.uid()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "business_photos_owner_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'business-photos'
        AND owner = auth.uid()
    );

CREATE POLICY "business_photos_owner_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'business-photos'
        AND owner = auth.uid()
    );
