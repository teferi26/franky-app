-- =====================================================
-- 063: Ruleta de eventos — random event picker server-side
-- =====================================================
-- La ruleta de eventos en mobile (EventRouletteScreen, Fase 2) llama este
-- RPC para obtener 1 evento aleatorio que cumpla:
--   - status = 'upcoming'
--   - start_date >= NOW()
--   - no swipeado por el caller todavía (LEFT JOIN swipe_actions IS NULL)
--   - prefer same city than caller profile (boost weight 3x, no exclusión)
--
-- Devuelve JSONB con la misma forma que tabla `events` (columnas relevantes
-- para el render: id, title, photos, city, category, start_date, ...).
--
-- Si no hay eventos disponibles, devuelve NULL.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_random_event_for_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_user_city TEXT;
    v_result JSONB;
BEGIN
    -- Solo el propio user puede pedir SU ruleta.
    IF v_uid IS NULL OR v_uid <> p_user_id THEN
        RETURN NULL;
    END IF;

    -- City del caller para ponderar selección (no excluir).
    SELECT city INTO v_user_city FROM public.profiles WHERE id = p_user_id;

    SELECT to_jsonb(e) INTO v_result
    FROM (
        SELECT
            ev.id,
            ev.title,
            ev.description,
            ev.venue,
            ev.address,
            ev.city,
            ev.start_date,
            ev.end_date,
            ev.photos,
            ev.status,
            ev.category,
            ev.created_at,
            ev.updated_at
        FROM public.events ev
        LEFT JOIN public.swipe_actions sa
            ON sa.target_id = ev.id
            AND sa.target_type = 'event'
            AND sa.user_id = p_user_id
        WHERE ev.status = 'upcoming'
          AND ev.start_date >= NOW()
          AND sa.id IS NULL
        ORDER BY
            -- Ponderar matching city: si v_user_city existe y matches, multiplica
            -- por 0.3 (más alto en orden ASC = más prioritario). Sino random uniforme.
            CASE
                WHEN v_user_city IS NOT NULL AND ev.city ILIKE v_user_city
                THEN random() * 0.3
                ELSE random()
            END ASC
        LIMIT 1
    ) e;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_event_for_user(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
