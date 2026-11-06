-- Migration 074: Wave 8 polish — request status + current roommates helpers.
--
-- LIST-002: helper RPC para saber si el caller ya tiene un request pending
-- a este piso (deshabilita botón Contactar y muestra status).
-- LIST-004: helper RPC para listar usuarios que ya viven en el piso
-- (accommodation_requests con status='accepted').

CREATE OR REPLACE FUNCTION public.get_my_request_status(p_accommodation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_status TEXT;
BEGIN
    IF v_caller IS NULL THEN RETURN NULL; END IF;
    SELECT status INTO v_status
    FROM public.accommodation_requests
    WHERE user_id = v_caller AND accommodation_id = p_accommodation_id
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN v_status;  -- 'pending' | 'accepted' | 'rejected' | NULL
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_request_status(UUID) TO authenticated;

/**
 * LIST-004: devuelve los usuarios que ya viven en el piso (accommodation_
 * requests con status='accepted'). Incluye preview (full_name, avatar_url,
 * university_id). El owner del piso NO se incluye automáticamente — solo
 * compañeros accepted.
 *
 * Útil para mostrar "Vas a vivir con Pedro, María..." en el AccommodationDetail.
 */
CREATE OR REPLACE FUNCTION public.list_current_roommates(p_accommodation_id UUID)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT jsonb_build_object(
        'user_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'university_id', p.university_id
    )
    FROM public.accommodation_requests r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.accommodation_id = p_accommodation_id
      AND r.status = 'accepted'
      AND COALESCE(p.is_discarded, false) = false
    ORDER BY r.updated_at DESC
    LIMIT 8;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_current_roommates(UUID) TO authenticated;
