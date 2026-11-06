-- ============================================================================
-- Migration 010: Auth Roles, Onboarding, Strikes, Reports, Audit
-- ============================================================================

-- ============================================================================
-- 1. EXTEND PROFILES TABLE
-- ============================================================================

-- Gender
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    gender TEXT CHECK (gender IN ('hombre', 'mujer', 'no_binario', 'prefiero_no_decirlo'));

-- Location (comunidad_autonoma at profile level)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    comunidad_autonoma TEXT;

-- Student info
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    is_student BOOLEAN DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    student_type TEXT CHECK (student_type IN ('bachillerato', 'fp', 'universidad', 'master', 'otro'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    bachillerato_course INTEGER CHECK (bachillerato_course IN (1, 2));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    bachillerato_modality TEXT CHECK (bachillerato_modality IN ('ciencias', 'sociales', 'humanidades_artes', 'general'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    fp_study TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    university_course INTEGER CHECK (university_course BETWEEN 1 AND 6);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    master_study TEXT;

-- Desired career / future plans
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    knows_desired_career BOOLEAN DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    desired_career_id UUID REFERENCES public.careers(id) ON DELETE SET NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    desired_city TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    study_anywhere BOOLEAN DEFAULT false;

-- Housing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    looking_for_housing BOOLEAN DEFAULT false;

-- Extra roommate/lifestyle columns (complement existing from 006)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    disorder_tolerance INTEGER DEFAULT 3 CHECK (disorder_tolerance BETWEEN 1 AND 5);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    is_homebody BOOLEAN DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    home_gatherings TEXT DEFAULT 'a_veces'
    CHECK (home_gatherings IN ('nunca', 'a_veces', 'a_menudo', 'siempre'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    is_early_riser BOOLEAN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    accepts_different_gender_roommate BOOLEAN DEFAULT true;

-- Strikes & moderation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    strikes_count INTEGER DEFAULT 0;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
    is_discarded BOOLEAN DEFAULT false;

-- Extend role to include 'propietario'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'propietario'));

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_profiles_is_student ON public.profiles(is_student) WHERE is_student = true;
CREATE INDEX IF NOT EXISTS idx_profiles_student_type ON public.profiles(student_type) WHERE student_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_looking_housing ON public.profiles(looking_for_housing) WHERE looking_for_housing = true;
CREATE INDEX IF NOT EXISTS idx_profiles_looking_roommate ON public.profiles(looking_for_roommate) WHERE looking_for_roommate = true;
CREATE INDEX IF NOT EXISTS idx_profiles_is_discarded ON public.profiles(is_discarded) WHERE is_discarded = true;
CREATE INDEX IF NOT EXISTS idx_profiles_comunidad ON public.profiles(comunidad_autonoma) WHERE comunidad_autonoma IS NOT NULL;


-- ============================================================================
-- 2. USER REPORTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    context TEXT NOT NULL CHECK (context IN ('profile', 'chat', 'comment', 'accommodation')),
    context_id UUID,
    reason TEXT NOT NULL CHECK (reason IN (
        'comportamiento_inapropiado', 'spam', 'acoso',
        'contenido_ofensivo', 'suplantacion', 'otro'
    )),
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
    admin_notes TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    CONSTRAINT no_self_report CHECK (reporter_id != reported_user_id),
    CONSTRAINT unique_report_context UNIQUE (reporter_id, reported_user_id, context, context_id)
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_reports_reported_user ON public.user_reports(reported_user_id);
CREATE INDEX idx_reports_status ON public.user_reports(status) WHERE status = 'pending';
CREATE INDEX idx_reports_created ON public.user_reports(created_at DESC);

-- Users can create reports (rate limited in application)
CREATE POLICY "Users can create reports"
    ON public.user_reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

-- Users can see own submitted reports
CREATE POLICY "Users can view own reports"
    ON public.user_reports FOR SELECT
    USING (auth.uid() = reporter_id);

-- Admins can see and manage all reports
CREATE POLICY "Admins can manage reports"
    ON public.user_reports FOR ALL
    USING (public.is_admin());


-- ============================================================================
-- 3. USER STRIKES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_strikes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    report_id UUID REFERENCES public.user_reports(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_strikes_user ON public.user_strikes(user_id);
CREATE INDEX idx_strikes_created ON public.user_strikes(created_at DESC);

-- Users can see own strikes
CREATE POLICY "Users can view own strikes"
    ON public.user_strikes FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can manage all strikes
CREATE POLICY "Admins can manage strikes"
    ON public.user_strikes FOR ALL
    USING (public.is_admin());


-- ============================================================================
-- 4. STRIKE TRIGGER: auto-increment + auto-discard at 3
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_strike()
RETURNS TRIGGER AS $$
DECLARE
    current_strikes INTEGER;
    user_data JSONB;
BEGIN
    -- Count total strikes for this user
    SELECT COUNT(*) INTO current_strikes
    FROM public.user_strikes
    WHERE user_id = NEW.user_id;

    -- Update strikes_count on profile
    UPDATE public.profiles
    SET strikes_count = current_strikes,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Auto-discard at 3 strikes
    IF current_strikes >= 3 THEN
        -- Get user data for discarded_records
        SELECT to_jsonb(p.*) INTO user_data
        FROM public.profiles p
        WHERE p.id = NEW.user_id;

        -- Insert into discarded_records
        INSERT INTO public.discarded_records (original_table, original_id, data, discarded_by, reason)
        VALUES ('profiles', NEW.user_id, user_data, NEW.issued_by, '3 strikes reached - auto discard');

        -- Mark as discarded
        UPDATE public.profiles
        SET is_discarded = true,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_strike_created ON public.user_strikes;
CREATE TRIGGER on_strike_created
    AFTER INSERT ON public.user_strikes
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_strike();


-- ============================================================================
-- 5. ADMIN AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_table TEXT,
    target_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_admin ON public.admin_audit_log(admin_id);
CREATE INDEX idx_audit_action ON public.admin_audit_log(action);
CREATE INDEX idx_audit_created ON public.admin_audit_log(created_at DESC);

-- Only admins can read audit logs
CREATE POLICY "Admins can view audit log"
    ON public.admin_audit_log FOR SELECT
    USING (public.is_admin());

-- Insert via SECURITY DEFINER function only
CREATE POLICY "Admins can insert audit log"
    ON public.admin_audit_log FOR INSERT
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 6. ADMIN AUDIT LOG HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_action TEXT,
    p_target_table TEXT DEFAULT NULL,
    p_target_id UUID DEFAULT NULL,
    p_old_data JSONB DEFAULT NULL,
    p_new_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can log actions';
    END IF;

    INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, old_data, new_data)
    VALUES (auth.uid(), p_action, p_target_table, p_target_id, p_old_data, p_new_data)
    RETURNING id INTO log_id;

    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. UPDATE handle_new_user() TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, onboarding_completed)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        false
    );

    -- Create presence record
    INSERT INTO public.user_presence (user_id, status, last_seen)
    VALUES (NEW.id, 'online', NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 8. RATE LIMITING FUNCTION FOR REPORTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_report_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    report_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO report_count
    FROM public.user_reports
    WHERE reporter_id = NEW.reporter_id
      AND created_at > NOW() - INTERVAL '24 hours';

    IF report_count >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 5 reports per 24 hours';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_report_rate ON public.user_reports;
CREATE TRIGGER check_report_rate
    BEFORE INSERT ON public.user_reports
    FOR EACH ROW EXECUTE FUNCTION public.check_report_rate_limit();


-- ============================================================================
-- 9. RLS POLICY UPDATES FOR PROFILES
-- ============================================================================

-- Prevent users from modifying their own role, strikes_count, or is_discarded
-- (handled by dropping and recreating the update policy)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        -- Role cannot be changed by user (only admin can)
        AND (
            role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        )
        -- strikes_count cannot be changed by user
        AND (
            strikes_count = (SELECT strikes_count FROM public.profiles WHERE id = auth.uid())
        )
        -- is_discarded cannot be changed by user
        AND (
            is_discarded = (SELECT is_discarded FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Discarded users get restricted access
-- Note: we keep existing SELECT policy (viewable by authenticated) but
-- add application-level checks for discarded users


-- ============================================================================
-- 10. ENABLE REALTIME FOR ADMIN-RELEVANT TABLES
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_strikes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log;

-- Ensure profiles is in realtime (may already be)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.accommodations;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
