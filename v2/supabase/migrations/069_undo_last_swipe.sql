-- Migration 069: undo_last_swipe RPC
--
-- RM-003: permite al usuario deshacer su último swipe (dislike o like).
-- Devuelve el target_id deshecho para que el cliente lo reinserta en el deck.
--
-- Reglas:
-- - Sólo deshace el ÚLTIMO swipe del usuario en `swipe_actions`.
-- - No deshace swipes que ya generaron match recíproco (conversation_id existe)
--   porque eso requeriría limpiar la conversación, lo cual es destructivo.
-- - SECURITY DEFINER porque swipe_actions tiene RLS estricto.

-- Drop overload existente (mig anterior creó undo_last_swipe(UUID, TEXT))
-- para que CREATE OR REPLACE pueda crear la firma nueva sin ambigüedad.
DROP FUNCTION IF EXISTS public.undo_last_swipe(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.undo_last_swipe(p_user_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_user UUID := COALESCE(p_user_id, v_caller);
    v_swipe_id UUID;
    v_target_id UUID;
    v_target_type TEXT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;
    -- Sólo permitido deshacer sobre uno mismo (no admin actuando sobre otros).
    IF v_caller <> v_user THEN
        RAISE EXCEPTION 'forbidden — only self';
    END IF;

    -- Localiza último swipe del usuario.
    SELECT id, target_id, target_type
    INTO v_swipe_id, v_target_id, v_target_type
    FROM public.swipe_actions
    WHERE user_id = v_user
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_swipe_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Si el swipe generó un match (existe conversation con ambos), no lo
    -- deshacemos — el usuario debería borrar la conv explícitamente.
    IF v_target_type = 'roomie' AND EXISTS (
        SELECT 1
        FROM public.conversation_participants cp1
        JOIN public.conversation_participants cp2 USING (conversation_id)
        WHERE cp1.user_id = v_user AND cp2.user_id = v_target_id
    ) THEN
        RAISE EXCEPTION 'cannot undo — match already created';
    END IF;

    DELETE FROM public.swipe_actions WHERE id = v_swipe_id;

    RETURN v_target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_swipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.undo_last_swipe IS
    'RM-003: deshace el último swipe del usuario. Devuelve target_id o NULL.';
