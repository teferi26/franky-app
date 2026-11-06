-- supabase/migrations/012_accommodation_filters.sql
-- Description: Add boolean filter columns to accommodations for advanced filtering
-- Date: 2026-04-20

-- 1. New boolean columns for supplies / utilities
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS water_included BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS electricity_included BOOLEAN DEFAULT false;

-- 2. Comfort & amenity booleans
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_wifi BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_air_conditioning BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_heating BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_elevator BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_parking BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_terrace BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_washing_machine BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_dishwasher BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_pool BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS has_gym BOOLEAN DEFAULT false;

-- 3. Other useful filters
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS is_furnished BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS pets_allowed BOOLEAN DEFAULT false;
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS min_stay_months INTEGER;

-- 4. Backfill from existing amenities TEXT[] array
UPDATE public.accommodations SET has_wifi = true WHERE 'wifi' = ANY(amenities);
UPDATE public.accommodations SET has_heating = true WHERE 'calefacción' = ANY(amenities);
UPDATE public.accommodations SET has_air_conditioning = true WHERE 'aire_acondicionado' = ANY(amenities);
UPDATE public.accommodations SET has_washing_machine = true WHERE 'lavadora' = ANY(amenities);
UPDATE public.accommodations SET has_dishwasher = true WHERE 'lavavajillas' = ANY(amenities);
UPDATE public.accommodations SET has_elevator = true WHERE 'ascensor' = ANY(amenities);
UPDATE public.accommodations SET has_terrace = true WHERE 'terraza' = ANY(amenities);
UPDATE public.accommodations SET has_parking = true WHERE 'parking' = ANY(amenities);
UPDATE public.accommodations SET has_pool = true WHERE 'piscina' = ANY(amenities);
UPDATE public.accommodations SET has_gym = true WHERE 'gym' = ANY(amenities);

-- 5. Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_accommodations_advanced_filters
    ON public.accommodations (status, city, type, price)
    WHERE status = 'active';
