-- =====================================================
-- 006: Roommate compatibility profile + accommodation rooms
-- =====================================================

-- Add detailed roommate compatibility fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS smoking TEXT DEFAULT 'no' CHECK (smoking IN ('no', 'si', 'ocasional')),
  ADD COLUMN IF NOT EXISTS partying TEXT DEFAULT 'ocasional' CHECK (partying IN ('nunca', 'ocasional', 'fines_semana', 'frecuente')),
  ADD COLUMN IF NOT EXISTS study_habits TEXT DEFAULT 'moderado' CHECK (study_habits IN ('poco', 'moderado', 'intenso', 'bibliofilo')),
  ADD COLUMN IF NOT EXISTS friends_at_home TEXT DEFAULT 'a_veces' CHECK (friends_at_home IN ('nunca', 'a_veces', 'a_menudo', 'diario')),
  ADD COLUMN IF NOT EXISTS sleep_schedule TEXT DEFAULT 'flexible' CHECK (sleep_schedule IN ('madrugador', 'nocturno', 'flexible')),
  ADD COLUMN IF NOT EXISTS cleanliness INTEGER DEFAULT 3 CHECK (cleanliness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS noise_tolerance TEXT DEFAULT 'moderado' CHECK (noise_tolerance IN ('silencio', 'moderado', 'no_importa')),
  ADD COLUMN IF NOT EXISTS hobbies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS budget_min INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS budget_max INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS pet_friendly BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS diet TEXT DEFAULT 'sin_preferencia' CHECK (diet IN ('sin_preferencia', 'vegetariano', 'vegano', 'halal', 'otro')),
  ADD COLUMN IF NOT EXISTS looking_for_roommate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS roommate_partner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bachillerato_instituto TEXT;

-- Add rooms_available to accommodations
ALTER TABLE public.accommodations
  ADD COLUMN IF NOT EXISTS rooms_available INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_residence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS residence_photos TEXT[] DEFAULT '{}';

-- Create roommate matches table
CREATE TABLE IF NOT EXISTS public.roommate_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    matched_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    compatibility_score NUMERIC(5,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'liked', 'passed', 'matched')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, matched_user_id)
);

CREATE INDEX IF NOT EXISTS idx_roommate_matches_user ON public.roommate_matches(user_id, status);
CREATE INDEX IF NOT EXISTS idx_roommate_matches_matched ON public.roommate_matches(matched_user_id);

ALTER TABLE public.roommate_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own matches" ON public.roommate_matches FOR SELECT USING (auth.uid() = user_id OR auth.uid() = matched_user_id);
CREATE POLICY "Users can create matches" ON public.roommate_matches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own matches" ON public.roommate_matches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage matches" ON public.roommate_matches FOR ALL USING (public.is_admin());

-- Create soft-delete table (descartados)
CREATE TABLE IF NOT EXISTS public.discarded_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_table TEXT NOT NULL,
    original_id UUID NOT NULL,
    data JSONB NOT NULL,
    discarded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    discarded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.discarded_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins see discarded" ON public.discarded_records FOR SELECT USING (public.is_admin());
CREATE POLICY "Only admins insert discarded" ON public.discarded_records FOR INSERT WITH CHECK (public.is_admin());

-- Roommate compatibility function
CREATE OR REPLACE FUNCTION public.calculate_compatibility(user1_id UUID, user2_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    u1 RECORD;
    u2 RECORD;
    score NUMERIC := 0;
    max_score NUMERIC := 0;
BEGIN
    SELECT * INTO u1 FROM public.profiles WHERE id = user1_id;
    SELECT * INTO u2 FROM public.profiles WHERE id = user2_id;
    
    IF u1 IS NULL OR u2 IS NULL THEN RETURN 0; END IF;
    
    -- Smoking (critical weight: 20)
    max_score := max_score + 20;
    IF u1.smoking = u2.smoking THEN score := score + 20;
    ELSIF u1.smoking = 'ocasional' OR u2.smoking = 'ocasional' THEN score := score + 10;
    END IF;
    
    -- Study habits (critical weight: 20)
    max_score := max_score + 20;
    IF u1.study_habits = u2.study_habits THEN score := score + 20;
    ELSIF ABS(
        CASE u1.study_habits WHEN 'poco' THEN 1 WHEN 'moderado' THEN 2 WHEN 'intenso' THEN 3 WHEN 'bibliofilo' THEN 4 ELSE 2 END -
        CASE u2.study_habits WHEN 'poco' THEN 1 WHEN 'moderado' THEN 2 WHEN 'intenso' THEN 3 WHEN 'bibliofilo' THEN 4 ELSE 2 END
    ) = 1 THEN score := score + 12;
    END IF;
    
    -- Sleep schedule (critical weight: 15)
    max_score := max_score + 15;
    IF u1.sleep_schedule = u2.sleep_schedule THEN score := score + 15;
    ELSIF u1.sleep_schedule = 'flexible' OR u2.sleep_schedule = 'flexible' THEN score := score + 10;
    END IF;
    
    -- Cleanliness (critical weight: 15)
    max_score := max_score + 15;
    IF ABS(COALESCE(u1.cleanliness, 3) - COALESCE(u2.cleanliness, 3)) = 0 THEN score := score + 15;
    ELSIF ABS(COALESCE(u1.cleanliness, 3) - COALESCE(u2.cleanliness, 3)) = 1 THEN score := score + 10;
    ELSIF ABS(COALESCE(u1.cleanliness, 3) - COALESCE(u2.cleanliness, 3)) = 2 THEN score := score + 5;
    END IF;
    
    -- Partying (weight: 10)
    max_score := max_score + 10;
    IF u1.partying = u2.partying THEN score := score + 10;
    ELSIF ABS(
        CASE u1.partying WHEN 'nunca' THEN 1 WHEN 'ocasional' THEN 2 WHEN 'fines_semana' THEN 3 WHEN 'frecuente' THEN 4 ELSE 2 END -
        CASE u2.partying WHEN 'nunca' THEN 1 WHEN 'ocasional' THEN 2 WHEN 'fines_semana' THEN 3 WHEN 'frecuente' THEN 4 ELSE 2 END
    ) = 1 THEN score := score + 6;
    END IF;
    
    -- Friends at home (weight: 10)
    max_score := max_score + 10;
    IF u1.friends_at_home = u2.friends_at_home THEN score := score + 10;
    ELSIF ABS(
        CASE u1.friends_at_home WHEN 'nunca' THEN 1 WHEN 'a_veces' THEN 2 WHEN 'a_menudo' THEN 3 WHEN 'diario' THEN 4 ELSE 2 END -
        CASE u2.friends_at_home WHEN 'nunca' THEN 1 WHEN 'a_veces' THEN 2 WHEN 'a_menudo' THEN 3 WHEN 'diario' THEN 4 ELSE 2 END
    ) = 1 THEN score := score + 6;
    END IF;
    
    -- Noise tolerance (weight: 5)
    max_score := max_score + 5;
    IF u1.noise_tolerance = u2.noise_tolerance THEN score := score + 5;
    ELSIF u1.noise_tolerance = 'moderado' OR u2.noise_tolerance = 'moderado' THEN score := score + 3;
    END IF;
    
    -- Pet friendly (weight: 5)
    max_score := max_score + 5;
    IF u1.pet_friendly = u2.pet_friendly THEN score := score + 5;
    END IF;
    
    IF max_score = 0 THEN RETURN 0; END IF;
    RETURN ROUND((score::NUMERIC / max_score) * 100, 1);
END;
$$ LANGUAGE plpgsql STABLE;
