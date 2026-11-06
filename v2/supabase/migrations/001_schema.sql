-- =====================================================
-- FRANKY v2 - Complete Database Schema
-- Supabase PostgreSQL
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- DROP EVERYTHING (clean slate)
-- =====================================================
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop all tables in public schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    -- Drop only user-defined functions (not extension functions)
    FOR r IN (SELECT p.proname, oidvectortypes(p.proargtypes) as args 
              FROM pg_proc p
              LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
              WHERE p.pronamespace = 'public'::regnamespace
              AND d.objid IS NULL) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- =====================================================
-- 1. UNIVERSITIES
-- =====================================================
CREATE TABLE public.universities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    short_name TEXT,
    type TEXT NOT NULL CHECK (type IN ('publica', 'privada')),
    city TEXT NOT NULL,
    comunidad_autonoma TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    website TEXT,
    phone TEXT,
    email TEXT,
    description TEXT,
    founded_year INTEGER,
    student_count INTEGER,
    campus_count INTEGER DEFAULT 1,
    image_url TEXT,
    logo_url TEXT,
    ranking_national INTEGER,
    facilities JSONB DEFAULT '{}',
    social_links JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_universities_slug ON public.universities(slug);
CREATE INDEX idx_universities_comunidad ON public.universities(comunidad_autonoma);
CREATE INDEX idx_universities_type ON public.universities(type);
CREATE INDEX idx_universities_city ON public.universities(city);
CREATE INDEX idx_universities_name_trgm ON public.universities USING gin(name gin_trgm_ops);

-- =====================================================
-- 2. CAREERS (with cut-off scores)
-- =====================================================
CREATE TABLE public.careers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    branch TEXT NOT NULL CHECK (branch IN (
        'ciencias', 'ciencias_salud', 'ingenieria_arquitectura', 
        'artes_humanidades', 'ciencias_sociales_juridicas'
    )),
    degree_type TEXT NOT NULL DEFAULT 'grado' CHECK (degree_type IN ('grado', 'doble_grado', 'master')),
    duration_years INTEGER DEFAULT 4,
    credits INTEGER DEFAULT 240,
    cut_off_score NUMERIC(6,3),
    cut_off_year INTEGER DEFAULT 2024,
    places_offered INTEGER,
    demand_ratio NUMERIC(4,2),
    campus TEXT,
    modality TEXT DEFAULT 'presencial' CHECK (modality IN ('presencial', 'online', 'hibrida')),
    riasec_scores JSONB DEFAULT '{"R":0,"I":0,"A":0,"S":0,"E":0,"C":0}',
    tags TEXT[] DEFAULT '{}',
    description TEXT,
    career_prospects TEXT,
    avg_salary NUMERIC(10,2),
    employment_rate NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_careers_university ON public.careers(university_id);
CREATE INDEX idx_careers_branch ON public.careers(branch);
CREATE INDEX idx_careers_cut_off ON public.careers(cut_off_score DESC NULLS LAST);
CREATE INDEX idx_careers_name_trgm ON public.careers USING gin(name gin_trgm_ops);
CREATE INDEX idx_careers_riasec ON public.careers USING gin(riasec_scores);
CREATE INDEX idx_careers_tags ON public.careers USING gin(tags);

-- =====================================================
-- 3. SCHOLARSHIPS
-- =====================================================
CREATE TABLE public.scholarships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('nacional', 'autonomica', 'privada', 'europea', 'internacional')),
    description TEXT,
    requirements JSONB DEFAULT '{}',
    amount_min NUMERIC(10,2),
    amount_max NUMERIC(10,2),
    deadline DATE,
    url TEXT,
    target_audience TEXT[] DEFAULT '{}',
    income_threshold NUMERIC(10,2),
    gpa_requirement NUMERIC(4,2),
    comunidad_autonoma TEXT,
    is_active BOOLEAN DEFAULT true,
    documents_required TEXT[] DEFAULT '{}',
    coverage TEXT[] DEFAULT '{}',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scholarships_type ON public.scholarships(type);
CREATE INDEX idx_scholarships_active ON public.scholarships(is_active) WHERE is_active = true;
CREATE INDEX idx_scholarships_deadline ON public.scholarships(deadline);
CREATE INDEX idx_scholarships_comunidad ON public.scholarships(comunidad_autonoma);

-- =====================================================
-- 4. PROFILES (extends auth.users)
-- =====================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    career TEXT,
    academic_year INTEGER,
    bio TEXT,
    city TEXT,
    phone TEXT,
    birth_date DATE,
    lifestyle_preferences JSONB DEFAULT '{
        "cleanliness": 3,
        "noise_tolerance": 3,
        "sleep_schedule": "normal",
        "cooking": true,
        "guests": "sometimes",
        "pets": false,
        "smoking": false,
        "study_habits": "moderate"
    }',
    housing_preferences JSONB DEFAULT '{
        "budget_min": 200,
        "budget_max": 500,
        "preferred_zone": "",
        "preferred_type": "habitacion"
    }',
    interests TEXT[] DEFAULT '{}',
    is_premium BOOLEAN DEFAULT false,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    onboarding_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_university ON public.profiles(university_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_city ON public.profiles(city);
CREATE INDEX idx_profiles_interests ON public.profiles USING gin(interests);

-- =====================================================
-- 5. ACCOMMODATIONS
-- =====================================================
CREATE TABLE public.accommodations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('piso_completo', 'habitacion', 'estudio', 'residencia')),
    price NUMERIC(10,2) NOT NULL,
    city TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    rooms INTEGER DEFAULT 1,
    bathrooms INTEGER DEFAULT 1,
    sqm INTEGER,
    amenities TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    is_verified BOOLEAN DEFAULT false,
    is_promoted BOOLEAN DEFAULT false,
    available_from DATE,
    university_ids UUID[] DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'rented')),
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accommodations_owner ON public.accommodations(owner_id);
CREATE INDEX idx_accommodations_city ON public.accommodations(city);
CREATE INDEX idx_accommodations_type ON public.accommodations(type);
CREATE INDEX idx_accommodations_price ON public.accommodations(price);
CREATE INDEX idx_accommodations_status ON public.accommodations(status) WHERE status = 'active';
CREATE INDEX idx_accommodations_promoted ON public.accommodations(is_promoted) WHERE is_promoted = true;

-- =====================================================
-- 6. REVIEWS
-- =====================================================
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('accommodation', 'user')),
    target_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_target ON public.reviews(target_type, target_id);
CREATE INDEX idx_reviews_reviewer ON public.reviews(reviewer_id);

-- =====================================================
-- 7. CONVERSATIONS & MESSAGES
-- =====================================================
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conv_participants_user ON public.conversation_participants(user_id);
CREATE INDEX idx_conv_participants_conv ON public.conversation_participants(conversation_id);

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);

-- =====================================================
-- 8. NOTIFICATIONS
-- =====================================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('message', 'match', 'review', 'accommodation', 'event', 'promotion', 'system', 'scholarship')),
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- =====================================================
-- 9. EVENTS
-- =====================================================
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    organizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    city TEXT NOT NULL,
    venue TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    category TEXT NOT NULL CHECK (category IN ('fiesta', 'academico', 'deportivo', 'cultural', 'networking', 'feria', 'otro')),
    price NUMERIC(10,2) DEFAULT 0,
    max_capacity INTEGER,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.event_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled')),
    payment_intent_id TEXT,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_events_city ON public.events(city);
CREATE INDEX idx_events_date ON public.events(start_date);
CREATE INDEX idx_events_category ON public.events(category);
CREATE INDEX idx_events_university ON public.events(university_id);
CREATE INDEX idx_event_participants_event ON public.event_participants(event_id);
CREATE INDEX idx_event_participants_user ON public.event_participants(user_id);

-- =====================================================
-- 10. LEISURE SPOTS
-- =====================================================
CREATE TABLE public.leisure_spots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('bar', 'restaurante', 'cafeteria', 'discoteca', 'parque', 'cultural', 'deportivo', 'coworking')),
    description TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    price_range INTEGER CHECK (price_range BETWEEN 1 AND 4),
    rating NUMERIC(2,1) DEFAULT 0,
    image_url TEXT,
    opening_hours JSONB DEFAULT '{}',
    university_ids UUID[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    google_maps_url TEXT,
    website TEXT,
    phone TEXT,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leisure_city ON public.leisure_spots(city);
CREATE INDEX idx_leisure_category ON public.leisure_spots(category);
CREATE INDEX idx_leisure_tags ON public.leisure_spots USING gin(tags);

-- =====================================================
-- 11. LEISURE SPOT SUGGESTIONS (user-submitted)
-- =====================================================
CREATE TABLE public.leisure_spot_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    address TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 12. NEWS
-- =====================================================
CREATE TABLE public.news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    category TEXT DEFAULT 'general' CHECK (category IN ('general', 'becas', 'universidades', 'empleo', 'eventos', 'tecnologia', 'alojamiento')),
    image_url TEXT,
    is_featured BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT true,
    views_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_news_slug ON public.news(slug);
CREATE INDEX idx_news_published ON public.news(is_published, created_at DESC) WHERE is_published = true;
CREATE INDEX idx_news_category ON public.news(category);

-- =====================================================
-- 13. SUBSCRIPTIONS (Stripe)
-- =====================================================
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'student', 'premium')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'canceled', 'past_due', 'incomplete')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions(stripe_subscription_id);

-- =====================================================
-- 14. USER PRESENCE
-- =====================================================
CREATE TABLE public.user_presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_presence_user ON public.user_presence(user_id);

-- =====================================================
-- 15. CAREER TEST SESSIONS
-- =====================================================
CREATE TABLE public.career_test_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    session_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    answers JSONB DEFAULT '{}',
    riasec_result JSONB DEFAULT '{}',
    recommended_careers UUID[] DEFAULT '{}',
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_career_sessions_user ON public.career_test_sessions(user_id);

-- =====================================================
-- 16. CAREER QUESTIONS
-- =====================================================
CREATE TABLE public.career_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_text TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('R', 'I', 'A', 'S', 'E', 'C')),
    difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
    options JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_career_questions_category ON public.career_questions(category);

-- =====================================================
-- 17. RECOMMENDATION FEEDBACK
-- =====================================================
CREATE TABLE public.recommendation_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.career_test_sessions(id) ON DELETE CASCADE,
    career_id UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    is_useful BOOLEAN,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 18. QR CAMPAIGNS & SCANS
-- =====================================================
CREATE TABLE public.qr_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    target_url TEXT NOT NULL,
    description TEXT,
    university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.qr_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.qr_campaigns(id) ON DELETE CASCADE,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    ip_hash TEXT,
    referrer TEXT
);

CREATE INDEX idx_qr_scans_campaign ON public.qr_scans(campaign_id, scanned_at DESC);

-- =====================================================
-- 19. FAVORITES
-- =====================================================
CREATE TABLE public.favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('accommodation', 'university', 'career', 'event', 'leisure_spot')),
    target_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX idx_favorites_user ON public.favorites(user_id, target_type);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with that column
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()',
            t
        );
    END LOOP;
END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- Auto-create presence on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_presence (user_id, status)
    VALUES (NEW.id, 'offline')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- Search careers function
CREATE OR REPLACE FUNCTION public.search_careers(
    search_query TEXT DEFAULT NULL,
    filter_branch TEXT DEFAULT NULL,
    filter_university UUID DEFAULT NULL,
    filter_comunidad TEXT DEFAULT NULL,
    min_score NUMERIC DEFAULT NULL,
    max_score NUMERIC DEFAULT NULL,
    sort_by TEXT DEFAULT 'cut_off_score',
    sort_order TEXT DEFAULT 'DESC',
    page_size INTEGER DEFAULT 20,
    page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    branch TEXT,
    cut_off_score NUMERIC,
    university_name TEXT,
    university_slug TEXT,
    university_city TEXT,
    university_type TEXT,
    duration_years INTEGER,
    credits INTEGER,
    places_offered INTEGER,
    modality TEXT,
    total_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.branch,
        c.cut_off_score,
        u.name AS university_name,
        u.slug AS university_slug,
        u.city AS university_city,
        u.type AS university_type,
        c.duration_years,
        c.credits,
        c.places_offered,
        c.modality,
        COUNT(*) OVER() AS total_count
    FROM public.careers c
    JOIN public.universities u ON c.university_id = u.id
    WHERE 
        (search_query IS NULL OR c.name ILIKE '%' || search_query || '%' OR u.name ILIKE '%' || search_query || '%')
        AND (filter_branch IS NULL OR c.branch = filter_branch)
        AND (filter_university IS NULL OR c.university_id = filter_university)
        AND (filter_comunidad IS NULL OR u.comunidad_autonoma = filter_comunidad)
        AND (min_score IS NULL OR c.cut_off_score >= min_score)
        AND (max_score IS NULL OR c.cut_off_score <= max_score)
    ORDER BY
        CASE WHEN sort_by = 'cut_off_score' AND sort_order = 'DESC' THEN c.cut_off_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'cut_off_score' AND sort_order = 'ASC' THEN c.cut_off_score END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_order = 'ASC' THEN c.name END ASC,
        CASE WHEN sort_by = 'name' AND sort_order = 'DESC' THEN c.name END DESC,
        c.name ASC
    LIMIT page_size
    OFFSET page_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.careers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leisure_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leisure_spot_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ policies (anon + authenticated)
CREATE POLICY "Universities are viewable by everyone" ON public.universities FOR SELECT USING (true);
CREATE POLICY "Careers are viewable by everyone" ON public.careers FOR SELECT USING (true);
CREATE POLICY "Scholarships are viewable by everyone" ON public.scholarships FOR SELECT USING (is_active = true);
CREATE POLICY "Active accommodations viewable by everyone" ON public.accommodations FOR SELECT USING (status = 'active');
CREATE POLICY "Reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Events are viewable by everyone" ON public.events FOR SELECT USING (true);
CREATE POLICY "Leisure spots viewable by everyone" ON public.leisure_spots FOR SELECT USING (true);
CREATE POLICY "Published news viewable by everyone" ON public.news FOR SELECT USING (is_published = true);
CREATE POLICY "Career questions viewable by everyone" ON public.career_questions FOR SELECT USING (is_active = true);
CREATE POLICY "QR campaigns viewable by everyone" ON public.qr_campaigns FOR SELECT USING (is_active = true);
CREATE POLICY "Public profiles viewable by authenticated" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "User presence viewable by authenticated" ON public.user_presence FOR SELECT USING (true);

-- AUTHENTICATED INSERT/UPDATE/DELETE policies
-- Profiles
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Accommodations
CREATE POLICY "Authenticated users can create accommodations" ON public.accommodations FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their accommodations" ON public.accommodations FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their accommodations" ON public.accommodations FOR DELETE USING (auth.uid() = owner_id);

-- Reviews
CREATE POLICY "Authenticated users can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "Users can delete own reviews" ON public.reviews FOR DELETE USING (auth.uid() = reviewer_id);

-- Conversations & Messages
CREATE POLICY "Users see own conversations" ON public.conversation_participants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can join conversations" ON public.conversation_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users see messages in their conversations" ON public.messages FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM public.conversation_participants cp 
        WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    ));
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT 
    WITH CHECK (auth.uid() = sender_id AND EXISTS (
        SELECT 1 FROM public.conversation_participants cp 
        WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    ));
CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Users see their conversations" ON public.conversations FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.conversation_participants cp 
        WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
    ));

-- Notifications
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Events
CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "Organizers can update events" ON public.events FOR UPDATE USING (auth.uid() = organizer_id);

-- Event participants
CREATE POLICY "Event participants viewable by everyone" ON public.event_participants FOR SELECT USING (true);
CREATE POLICY "Users can register for events" ON public.event_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can cancel own registration" ON public.event_participants FOR UPDATE USING (auth.uid() = user_id);

-- Leisure spot suggestions
CREATE POLICY "Users can submit suggestions" ON public.leisure_spot_suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users see own suggestions" ON public.leisure_spot_suggestions FOR SELECT USING (auth.uid() = user_id);

-- Subscriptions
CREATE POLICY "Users see own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Presence
CREATE POLICY "Users can update own presence" ON public.user_presence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own presence" ON public.user_presence FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Career test sessions
CREATE POLICY "Anyone can create test sessions" ON public.career_test_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users see own sessions" ON public.career_test_sessions FOR SELECT 
    USING (auth.uid() = user_id OR session_token IS NOT NULL);
CREATE POLICY "Users can update own sessions" ON public.career_test_sessions FOR UPDATE 
    USING (auth.uid() = user_id OR session_token IS NOT NULL);

-- Feedback
CREATE POLICY "Anyone can submit feedback" ON public.recommendation_feedback FOR INSERT WITH CHECK (true);

-- QR scans (anyone can create)
CREATE POLICY "Anyone can register scans" ON public.qr_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Scans viewable by authenticated" ON public.qr_scans FOR SELECT USING (auth.role() = 'authenticated');

-- Favorites
CREATE POLICY "Users see own favorites" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add favorites" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove favorites" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- ADMIN policies (for users with role = 'admin')
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Admin can do everything
CREATE POLICY "Admins can manage universities" ON public.universities FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage careers" ON public.careers FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage scholarships" ON public.scholarships FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage all accommodations" ON public.accommodations FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage events" ON public.events FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage leisure spots" ON public.leisure_spots FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage news" ON public.news FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage career questions" ON public.career_questions FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage suggestions" ON public.leisure_spot_suggestions FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage qr campaigns" ON public.qr_campaigns FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL USING (public.is_admin());
CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());

-- =====================================================
-- REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
