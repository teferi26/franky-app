-- =====================================================
-- 055: Fix calculate_compatibility cleanliness TEXT vs INTEGER
-- =====================================================
-- Contexto: la migration 006 creó `profiles.cleanliness` como INTEGER
-- (1-5) y `calculate_compatibility` hace aritmética sobre el valor
-- (`ABS(u1.cleanliness - u2.cleanliness)`). La migration 016 cambió
-- el tipo a TEXT con valores 'relajado' / 'normal' / 'muy_limpio'
-- pero el RPC no se actualizó, por lo que falla con:
--   ERROR 42804: COALESCE types text and integer cannot be matched
-- en cuanto hay datos reales.
--
-- El bug bloquea TODOS los flows que invocan calculate_compatibility:
--   - get_daily_match (Home hero card)
--   - process_swipe_action (línea 56: INSERT INTO roommate_matches
--     usa public.calculate_compatibility(p_user_id, p_target_id))
--   - cualquier llamada directa desde el cliente RoomieDetail
--
-- Fix: mappear text -> int con CASE dentro del COALESCE, sin cambiar
-- el rest of the function. Mismas weights, mismo formato de retorno
-- NUMERIC 0-100 con 1 decimal — backwards compatible.
--
-- Descubierto durante Wave 0 MIG-006 smoke testing 2026-05-16. Ticket
-- BE-005 del IMPROVEMENTS_TRACKER.md Wave 1.
-- =====================================================

CREATE OR REPLACE FUNCTION public.calculate_compatibility(user1_id UUID, user2_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    u1 RECORD;
    u2 RECORD;
    score NUMERIC := 0;
    max_score NUMERIC := 0;
    u1_clean INT;
    u2_clean INT;
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

    -- Cleanliness (critical weight: 15) — TEXT mapped to INT 1-5 scale
    -- Phase A values: 'relajado' (laid-back) / 'normal' / 'muy_limpio' (clean-freak)
    -- Legacy integers kept as fallback if somehow strings differ.
    max_score := max_score + 15;
    u1_clean := CASE u1.cleanliness
                  WHEN 'relajado'   THEN 2
                  WHEN 'normal'     THEN 3
                  WHEN 'muy_limpio' THEN 5
                  ELSE 3
                END;
    u2_clean := CASE u2.cleanliness
                  WHEN 'relajado'   THEN 2
                  WHEN 'normal'     THEN 3
                  WHEN 'muy_limpio' THEN 5
                  ELSE 3
                END;
    IF ABS(u1_clean - u2_clean) = 0 THEN score := score + 15;
    ELSIF ABS(u1_clean - u2_clean) = 1 THEN score := score + 10;
    ELSIF ABS(u1_clean - u2_clean) = 2 THEN score := score + 5;
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

    -- Noise tolerance (weight: 5) — already TEXT
    max_score := max_score + 5;
    IF u1.noise_tolerance = u2.noise_tolerance THEN score := score + 5;
    ELSIF u1.noise_tolerance = 'moderado' OR u2.noise_tolerance = 'moderado' THEN score := score + 3;
    END IF;

    -- Pet friendly (weight: 5) — pet_friendly is TEXT post-016 ('no'/'me_gustan'/'tengo')
    -- Equality comparison still works for TEXT, just count exact matches.
    max_score := max_score + 5;
    IF u1.pet_friendly = u2.pet_friendly THEN score := score + 5;
    END IF;

    IF max_score = 0 THEN RETURN 0; END IF;
    RETURN ROUND((score::NUMERIC / max_score) * 100, 1);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_compatibility(UUID, UUID) IS
  'Compatibilidad roomie 0-100. Cleanliness TEXT (relajado/normal/muy_limpio) mappeada a int 1-5 scale. Fix BE-005 Wave 1.';
