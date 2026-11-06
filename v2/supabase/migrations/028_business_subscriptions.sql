-- 028_business_subscriptions.sql
-- B2B payment gateway: businesses (zonas de ocio + inmobiliarias) pay 9.99€/month
-- per listing to appear in the public app. Admin-curated rows keep is_paid=true so
-- nothing already visible disappears.

-- =====================================================
-- 1. business_subscriptions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.business_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('leisure', 'housing')),
    listing_id UUID,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'incomplete'
        CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_subs_owner ON public.business_subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_business_subs_status ON public.business_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_business_subs_listing ON public.business_subscriptions(listing_id);

ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own business subs" ON public.business_subscriptions;
CREATE POLICY "Owners read own business subs"
    ON public.business_subscriptions FOR SELECT
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners insert own business subs" ON public.business_subscriptions;
CREATE POLICY "Owners insert own business subs"
    ON public.business_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- 2. leisure_spots: add owner + paid gate
-- =====================================================
ALTER TABLE public.leisure_spots
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_leisure_owner ON public.leisure_spots(owner_id);
CREATE INDEX IF NOT EXISTS idx_leisure_is_paid ON public.leisure_spots(is_paid) WHERE is_paid = true;

-- Owners can manage their own paid leisure spots
DROP POLICY IF EXISTS "Owners manage own leisure spots" ON public.leisure_spots;
CREATE POLICY "Owners manage own leisure spots"
    ON public.leisure_spots FOR ALL
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- 3. accommodations: add subscription link + paid gate
-- =====================================================
ALTER TABLE public.accommodations
    ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_accommodations_is_paid ON public.accommodations(is_paid) WHERE is_paid = true;

-- =====================================================
-- 4. updated_at trigger for business_subscriptions
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_business_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS business_subs_updated_at ON public.business_subscriptions;
CREATE TRIGGER business_subs_updated_at
    BEFORE UPDATE ON public.business_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.touch_business_subscriptions_updated_at();
