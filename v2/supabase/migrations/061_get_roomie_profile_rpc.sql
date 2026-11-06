-- =====================================================
-- 061: RPC get_roomie_profile — expone profile completo para detail
-- =====================================================
-- La mig 040 endureció RLS de profiles a `auth.uid() = id` (solo propio).
-- La app móvil necesita el profile COMPLETO de roomie candidates (incluyendo
-- habits/preferences) para mostrar el detail screen + compatibility breakdown.
-- public_profiles (mig 040) NO incluye habits.
--
-- Solución: SECURITY DEFINER RPC que devuelve el profile del target solo si
-- (a) el caller está autenticado, y (b) el target tiene onboarding_completed
-- + looking_for_roommate. No expone email, phone, birth_date (PII estricta).
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_roomie_profile(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_result JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    -- Propio profile o profile público de roomie buscando.
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'photos', p.photos,
        'city', p.city,
        'gender', p.gender,
        'birth_date', CASE WHEN p.id = v_uid THEN p.birth_date::text ELSE NULL END,
        'university_id', p.university_id,
        'budget_min', p.budget_min,
        'budget_max', p.budget_max,
        'sleep_schedule', p.sleep_schedule,
        'cleanliness', p.cleanliness,
        'noise_tolerance', p.noise_tolerance,
        'partying', p.partying,
        'pet_friendly', p.pet_friendly,
        'hobbies', p.hobbies,
        'bio', p.bio,
        'looking_for_roommate', p.looking_for_roommate,
        'onboarding_completed', p.onboarding_completed
    ) INTO v_result
    FROM public.profiles p
    WHERE p.id = p_target_id
      AND (
        -- Self always allowed
        p.id = v_uid
        -- Otros: solo si target busca roomie + ha completado onboarding +
        -- no está discarded.
        OR (
          p.onboarding_completed = true
          AND p.looking_for_roommate = true
          AND p.is_discarded IS NOT TRUE
        )
      )
    LIMIT 1;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_roomie_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
