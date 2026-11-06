-- 105_owner_plan.sql
-- Plan "Usuario Propietario": suscripción a nivel de cuenta (no por ficha).
-- 80 €/mes y permite publicar hasta 40 pisos sin pasar por la pasarela
-- de pago individual de 9,99 €/ficha. Oferta de alta: 3 primeros meses
-- pagados de golpe con 20% de descuento (192 € en vez de 240 €), después
-- la suscripción pasa automáticamente a 80 €/mes.
--
-- También añade a accommodations:
--   * agency_commission_pct  -> % de comisión de la inmobiliaria (opcional)
--   * videos                 -> vídeos del piso (máx 10)
--   * owner_subscription_id  -> qué plan de propietario cubre la ficha
-- Y amplía el bucket business-photos para aceptar vídeo.

-- =====================================================
-- 1. owner_subscriptions (a nivel de cuenta)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.owner_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    -- 'monthly' = 80€/mes desde el principio.
    -- 'quarterly_intro' = primer trimestre pagado de golpe con -20% (192€),
    --   luego Stripe lo convierte automáticamente a 80€/mes (subscription schedule).
    billing TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing IN ('monthly', 'quarterly_intro')),
    status TEXT NOT NULL DEFAULT 'incomplete'
        CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')),
    max_listings INTEGER NOT NULL DEFAULT 40,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_subs_owner ON public.owner_subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_subs_status ON public.owner_subscriptions(status);

ALTER TABLE public.owner_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own owner subs" ON public.owner_subscriptions;
CREATE POLICY "Owners read own owner subs"
    ON public.owner_subscriptions FOR SELECT
    USING (auth.uid() = owner_id);

-- Solo el service role (webhook de Stripe) escribe en esta tabla.

CREATE OR REPLACE FUNCTION public.touch_owner_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS owner_subs_updated_at ON public.owner_subscriptions;
CREATE TRIGGER owner_subs_updated_at
    BEFORE UPDATE ON public.owner_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.touch_owner_subscriptions_updated_at();

-- =====================================================
-- 2. accommodations: comisión, vídeos y vínculo al plan
-- =====================================================
ALTER TABLE public.accommodations
    ADD COLUMN IF NOT EXISTS agency_commission_pct NUMERIC(5,2)
        CHECK (agency_commission_pct IS NULL OR (agency_commission_pct >= 0 AND agency_commission_pct <= 100)),
    ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS owner_subscription_id UUID
        REFERENCES public.owner_subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accom_owner_subscription
    ON public.accommodations(owner_subscription_id)
    WHERE owner_subscription_id IS NOT NULL;

-- Cap de 10 vídeos por ficha (espejo del cap de 20 fotos de la 029)
CREATE OR REPLACE FUNCTION public.cap_accommodation_videos()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.videos IS NULL THEN
        NEW.videos := '{}'::text[];
    ELSIF array_length(NEW.videos, 1) > 10 THEN
        NEW.videos := NEW.videos[1:10];
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cap_accommodation_videos_trigger ON public.accommodations;
CREATE TRIGGER cap_accommodation_videos_trigger
    BEFORE INSERT OR UPDATE OF videos ON public.accommodations
    FOR EACH ROW EXECUTE FUNCTION public.cap_accommodation_videos();

-- =====================================================
-- 3. Bucket business-photos: aceptar vídeo y subir el límite
--    (8MB se queda corto para vídeo; el cliente limita fotos a 8MB
--    y vídeos a 50MB; el bucket aplica el techo de 50MB por archivo)
-- =====================================================
UPDATE storage.buckets
SET file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = ARRAY[
        'image/jpeg','image/png','image/webp','image/gif',
        'video/mp4','video/quicktime','video/webm'
    ]
WHERE id = 'business-photos';
