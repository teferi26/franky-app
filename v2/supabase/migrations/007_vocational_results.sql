-- =====================================================
-- 007: Vocational Test Results & Feedback
-- =====================================================

-- Store user test results for persistence and analytics
CREATE TABLE public.vocational_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scores JSONB NOT NULL DEFAULT '{"R":0,"I":0,"A":0,"S":0,"E":0,"C":0}',
    top_categories TEXT[] NOT NULL DEFAULT '{}',
    answers JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vocational_results_user ON public.vocational_results(user_id);
CREATE INDEX idx_vocational_results_created ON public.vocational_results(created_at DESC);

-- Store user feedback on career recommendations
CREATE TABLE public.vocational_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    result_id UUID NOT NULL REFERENCES public.vocational_results(id) ON DELETE CASCADE,
    career_id UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
    is_positive BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(result_id, career_id)
);

CREATE INDEX idx_vocational_feedback_result ON public.vocational_feedback(result_id);
CREATE INDEX idx_vocational_feedback_career ON public.vocational_feedback(career_id);

-- RLS policies
ALTER TABLE public.vocational_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocational_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vocational results"
    ON public.vocational_results FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vocational results"
    ON public.vocational_results FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own vocational feedback"
    ON public.vocational_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own vocational feedback"
    ON public.vocational_feedback FOR ALL
    USING (auth.uid() = user_id);

-- Additional career questions (2 more per RIASEC category → 30 total)
INSERT INTO public.career_questions (question_text, category, difficulty, options, is_active, sort_order) VALUES

-- Realistic (R) — questions 19-20
('¿Te resulta satisfactorio ver el resultado tangible de tu trabajo, como un objeto construido o un aparato reparado?', 'R', 2,
 '[{"text":"Totalmente, es lo que más me motiva","value":5},{"text":"Sí, bastante","value":4},{"text":"Me es indiferente","value":3},{"text":"Prefiero resultados abstractos","value":2},{"text":"No me importa lo tangible","value":1}]', true, 19),
('¿Te atraen profesiones como mecánico, ingeniero de campo, agricultor o electricista?', 'R', 2,
 '[{"text":"Mucho, me veo en algo así","value":5},{"text":"Me interesan","value":4},{"text":"Podría considerarlo","value":3},{"text":"No especialmente","value":2},{"text":"Nada en absoluto","value":1}]', true, 20),

-- Investigative (I) — questions 21-22
('¿Cuándo lees una noticia científica o tecnológica, sientes curiosidad por profundizar?', 'I', 2,
 '[{"text":"Siempre, busco más información","value":5},{"text":"A menudo","value":4},{"text":"A veces","value":3},{"text":"Raramente","value":2},{"text":"Nunca","value":1}]', true, 21),
('¿Te gustaría dedicar tu carrera a descubrir cosas nuevas o avanzar el conocimiento humano?', 'I', 2,
 '[{"text":"Es mi mayor ambición","value":5},{"text":"Me atrae mucho","value":4},{"text":"Lo consideraría","value":3},{"text":"Prefiero aplicar lo que ya existe","value":2},{"text":"No me interesa la investigación","value":1}]', true, 22),

-- Artistic (A) — questions 23-24
('¿Sientes que necesitas expresarte de forma original, ya sea a través del arte, la moda, la escritura u otra vía creativa?', 'A', 2,
 '[{"text":"Es una necesidad vital","value":5},{"text":"Sí, bastante","value":4},{"text":"A veces","value":3},{"text":"Poco","value":2},{"text":"No lo necesito","value":1}]', true, 23),
('¿Te atraen carreras como Bellas Artes, Diseño, Comunicación Audiovisual o Arquitectura?', 'A', 2,
 '[{"text":"Mucho, es lo que quiero estudiar","value":5},{"text":"Me interesan","value":4},{"text":"Las considero","value":3},{"text":"No especialmente","value":2},{"text":"Nada","value":1}]', true, 24),

-- Social (S) — questions 25-26
('¿Cuándo ves a alguien con un problema, tu primer instinto es ayudarle?', 'S', 2,
 '[{"text":"Siempre, no puedo evitarlo","value":5},{"text":"Casi siempre","value":4},{"text":"Depende de la situación","value":3},{"text":"A veces","value":2},{"text":"Prefiero no involucrarme","value":1}]', true, 25),
('¿Te ves trabajando en educación, sanidad, trabajo social o cooperación internacional?', 'S', 2,
 '[{"text":"Es mi vocación","value":5},{"text":"Me atrae mucho","value":4},{"text":"Lo considero","value":3},{"text":"No demasiado","value":2},{"text":"No me interesa","value":1}]', true, 26),

-- Enterprising (E) — questions 27-28
('¿Cuándo trabajas en grupo, tiendes naturalmente a asumir el rol de líder o coordinador?', 'E', 2,
 '[{"text":"Siempre, es mi papel natural","value":5},{"text":"Con frecuencia","value":4},{"text":"A veces","value":3},{"text":"Raramente","value":2},{"text":"Nunca, prefiero seguir","value":1}]', true, 27),
('¿Te motiva la idea de crear tu propia empresa o dirigir una organización?', 'E', 2,
 '[{"text":"Es mi sueño","value":5},{"text":"Me motiva bastante","value":4},{"text":"Lo considero","value":3},{"text":"No demasiado","value":2},{"text":"Prefiero trabajar por cuenta ajena","value":1}]', true, 28),

-- Conventional (C) — questions 29-30
('¿Disfrutas creando hojas de cálculo, planificando agendas o manteniendo todo bien archivado?', 'C', 2,
 '[{"text":"Me encanta la organización","value":5},{"text":"Sí, bastante","value":4},{"text":"Normal","value":3},{"text":"No mucho","value":2},{"text":"Lo evito","value":1}]', true, 29),
('¿Te atraen carreras como Contabilidad, Administración Pública, Logística o Gestión Documental?', 'C', 2,
 '[{"text":"Mucho, encajan conmigo","value":5},{"text":"Me interesan","value":4},{"text":"Las considero","value":3},{"text":"No especialmente","value":2},{"text":"Nada","value":1}]', true, 30);
