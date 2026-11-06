-- Migration 076: Wave 12 BE polish — indexes + FTS + compat cache.

-- BE-017: index sobre swipe_actions(user_id, created_at DESC) para acelerar
-- undo_last_swipe (LIMIT 1 ORDER BY created_at DESC).
CREATE INDEX IF NOT EXISTS idx_swipe_actions_user_created_desc
    ON public.swipe_actions(user_id, created_at DESC);

-- BE-018: Full-text search en accommodations sobre title + city + description.
-- Permite WHERE search_vector @@ plainto_tsquery('castellano', :q) en lugar de
-- ILIKE '%q%' (mucho más rápido + soporta stemming).
ALTER TABLE public.accommodations
    ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Trigger para mantener search_vector sincronizado en INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.accommodations_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('spanish', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('spanish', COALESCE(NEW.city, '')), 'B') ||
        setweight(to_tsvector('spanish', COALESCE(NEW.description, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accommodations_search_vector ON public.accommodations;
CREATE TRIGGER trg_accommodations_search_vector
    BEFORE INSERT OR UPDATE OF title, city, description
    ON public.accommodations
    FOR EACH ROW EXECUTE FUNCTION public.accommodations_search_vector_update();

-- Backfill existing rows (one-time).
UPDATE public.accommodations
SET search_vector =
    setweight(to_tsvector('spanish', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('spanish', COALESCE(city, '')), 'B') ||
    setweight(to_tsvector('spanish', COALESCE(description, '')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_accommodations_search ON public.accommodations USING GIN(search_vector);

-- BE-016: calculate_compatibility cache table — evita recalcular pares
-- frecuentes en cada get_discovery_feed call.
CREATE TABLE IF NOT EXISTS public.compatibility_cache (
    user_a UUID NOT NULL,
    user_b UUID NOT NULL,
    score INT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)  -- canonical ordering para evitar duplicar pares
);

CREATE INDEX IF NOT EXISTS idx_compat_cache_user_a ON public.compatibility_cache(user_a);
CREATE INDEX IF NOT EXISTS idx_compat_cache_user_b ON public.compatibility_cache(user_b);

/**
 * Wrapper que consulta el cache, recalcula si stale (>7 días) o ausente,
 * upserts el resultado, devuelve el score. Mantiene canonical ordering
 * (user_a < user_b) para no duplicar pares.
 */
CREATE OR REPLACE FUNCTION public.cached_compatibility(p_user_a UUID, p_user_b UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a UUID := LEAST(p_user_a, p_user_b);
    v_b UUID := GREATEST(p_user_a, p_user_b);
    v_score INT;
    v_age INTERVAL;
BEGIN
    IF v_a = v_b THEN RETURN 100; END IF;

    SELECT score, NOW() - computed_at INTO v_score, v_age
    FROM public.compatibility_cache
    WHERE user_a = v_a AND user_b = v_b;

    IF v_score IS NOT NULL AND v_age < INTERVAL '7 days' THEN
        RETURN v_score;
    END IF;

    -- Recalcula
    v_score := public.calculate_compatibility(p_user_a, p_user_b);
    INSERT INTO public.compatibility_cache (user_a, user_b, score, computed_at)
    VALUES (v_a, v_b, v_score, NOW())
    ON CONFLICT (user_a, user_b) DO UPDATE
        SET score = EXCLUDED.score,
            computed_at = NOW();
    RETURN v_score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cached_compatibility(UUID, UUID) TO authenticated;

COMMENT ON TABLE public.compatibility_cache IS
    'BE-016: cache de pares (user_a < user_b) con score + TTL 7d.';
