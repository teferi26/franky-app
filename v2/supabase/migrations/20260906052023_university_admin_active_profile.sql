-- Delegated catalogue editors must retain an active profile. SECURITY DEFINER
-- is required to resolve their university assignment under the existing RLS.
-- Preserve the signature, errors and ACL of the existing authorization helper.
CREATE OR REPLACE FUNCTION public._require_university_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_uni uuid;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;

    SELECT ua.university_id INTO v_uni
    FROM public.university_admins AS ua
    JOIN public.profiles AS p ON p.id = ua.profile_id
    WHERE ua.profile_id = v_actor
      AND p.is_discarded IS NOT TRUE
    ORDER BY ua.created_at
    LIMIT 1;

    IF v_uni IS NULL THEN
        RAISE EXCEPTION 'forbidden'
            USING HINT = 'university_admin role required';
    END IF;

    RETURN v_uni;
END;
$function$;
