-- ============================================================================
-- 033 — UTM TRACKING (first-touch attribution)
-- Captura origen de tráfico en redes sociales al registrar al usuario.
-- ============================================================================

-- 1. Columnas de attribution en profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS utm_source TEXT,
    ADD COLUMN IF NOT EXISTS utm_medium TEXT,
    ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS utm_content TEXT,
    ADD COLUMN IF NOT EXISTS utm_term TEXT,
    ADD COLUMN IF NOT EXISTS signup_referrer TEXT,
    ADD COLUMN IF NOT EXISTS signup_landing_path TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_utm_source
    ON public.profiles(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_utm_campaign
    ON public.profiles(utm_campaign) WHERE utm_campaign IS NOT NULL;

-- 2. Trigger: extiende handle_new_user para persistir UTMs desde raw_user_meta_data.
--    Mantiene presence + onboarding_completed = false (migración 010).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        avatar_url,
        onboarding_completed,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        signup_referrer,
        signup_landing_path
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        false,
        NULLIF(NEW.raw_user_meta_data->>'utm_source', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_medium', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_campaign', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_content', ''),
        NULLIF(NEW.raw_user_meta_data->>'utm_term', ''),
        NULLIF(NEW.raw_user_meta_data->>'signup_referrer', ''),
        NULLIF(NEW.raw_user_meta_data->>'signup_landing_path', '')
    );

    INSERT INTO public.user_presence (user_id, status, last_seen)
    VALUES (NEW.id, 'online', NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC para attribution post-OAuth (first-touch: solo escribe si está vacío).
--    El callback OAuth llama a esto tras leer la cookie de attribution.
CREATE OR REPLACE FUNCTION public.set_signup_attribution(
    p_utm_source TEXT,
    p_utm_medium TEXT,
    p_utm_campaign TEXT,
    p_utm_content TEXT,
    p_utm_term TEXT,
    p_referrer TEXT,
    p_landing_path TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET
        utm_source = COALESCE(utm_source, NULLIF(p_utm_source, '')),
        utm_medium = COALESCE(utm_medium, NULLIF(p_utm_medium, '')),
        utm_campaign = COALESCE(utm_campaign, NULLIF(p_utm_campaign, '')),
        utm_content = COALESCE(utm_content, NULLIF(p_utm_content, '')),
        utm_term = COALESCE(utm_term, NULLIF(p_utm_term, '')),
        signup_referrer = COALESCE(signup_referrer, NULLIF(p_referrer, '')),
        signup_landing_path = COALESCE(signup_landing_path, NULLIF(p_landing_path, ''))
    WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_signup_attribution(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
