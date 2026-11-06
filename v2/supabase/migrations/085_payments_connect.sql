-- =====================================================
-- 085: Marketplace — Stripe Connect + ledger de pagos
-- =====================================================
-- Convierte Franky en marketplace: el propietario/organizador conecta su cuenta
-- Stripe (Express), el estudiante paga dentro de la app y Franky se queda una
-- comisión (application_fee). Tres flujos de dinero comparten un único ledger
-- `payments`: visitas de pago, alquiler/fianza y entradas de eventos.
--
-- Escrituras: SOLO vía service-role (webhook + rutas API). RLS solo concede
-- LECTURA al comprador, al vendedor y a admin. Nada de INSERT/UPDATE para
-- `authenticated` — así un cliente no puede falsear importes/estados.
-- =====================================================

-- =====================================================
-- 1. connect_accounts — cuenta Stripe Connect del vendedor (1:1 con profiles)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.connect_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_connect_account_id TEXT NOT NULL UNIQUE,
    charges_enabled BOOLEAN NOT NULL DEFAULT false,
    payouts_enabled BOOLEAN NOT NULL DEFAULT false,
    details_submitted BOOLEAN NOT NULL DEFAULT false,
    requirements_currently_due TEXT[] NOT NULL DEFAULT '{}',
    country TEXT NOT NULL DEFAULT 'ES',
    default_currency TEXT NOT NULL DEFAULT 'eur',
    onboarding_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (onboarding_status IN ('pending', 'restricted', 'active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connect_accounts_user ON public.connect_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connect_accounts_acct ON public.connect_accounts(stripe_connect_account_id);

ALTER TABLE public.connect_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connect_accounts_select_own" ON public.connect_accounts;
CREATE POLICY "connect_accounts_select_own"
    ON public.connect_accounts FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "connect_accounts_select_admin" ON public.connect_accounts;
CREATE POLICY "connect_accounts_select_admin"
    ON public.connect_accounts FOR SELECT TO authenticated
    USING (public.is_admin());

-- =====================================================
-- 2. payments — ledger unificado de los tres flujos
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('visit', 'rent', 'ticket')),
    buyer_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Referencia polimórfica a lo que se paga (sin FK dura: las tablas de
    -- dominio se crean en migraciones posteriores).
    ref_table TEXT NOT NULL CHECK (ref_table IN ('accommodations', 'events', 'visit_bookings', 'event_tickets')),
    ref_id UUID NOT NULL,
    amount_cents          INTEGER NOT NULL CHECK (amount_cents >= 0),
    application_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (application_fee_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'eur',
    stripe_checkout_session_id TEXT UNIQUE,
    stripe_payment_intent_id   TEXT UNIQUE,
    stripe_charge_id           TEXT,
    stripe_connect_account_id  TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'canceled')),
    refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (application_fee_cents <= amount_cents)
);

CREATE INDEX IF NOT EXISTS idx_payments_buyer  ON public.payments(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_seller ON public.payments(seller_id);
CREATE INDEX IF NOT EXISTS idx_payments_ref    ON public.payments(ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_buyer" ON public.payments;
CREATE POLICY "payments_select_buyer"
    ON public.payments FOR SELECT TO authenticated
    USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "payments_select_seller" ON public.payments;
CREATE POLICY "payments_select_seller"
    ON public.payments FOR SELECT TO authenticated
    USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "payments_select_admin" ON public.payments;
CREATE POLICY "payments_select_admin"
    ON public.payments FOR SELECT TO authenticated
    USING (public.is_admin());

-- =====================================================
-- 3. Triggers updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_connect_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS connect_accounts_updated_at ON public.connect_accounts;
CREATE TRIGGER connect_accounts_updated_at
    BEFORE UPDATE ON public.connect_accounts
    FOR EACH ROW EXECUTE FUNCTION public.touch_connect_accounts_updated_at();

CREATE OR REPLACE FUNCTION public.touch_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.touch_payments_updated_at();

-- =====================================================
-- 4. Extender notifications.type para las nuevas features
-- =====================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'message', 'match', 'review', 'accommodation', 'event', 'promotion',
    'system', 'scholarship', 'accommodation_request', 'roomie_like',
    'tenancy', 'visit', 'contract', 'payment'
  ));
