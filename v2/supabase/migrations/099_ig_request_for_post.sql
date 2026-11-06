-- =====================================================
-- 099: Crush — pedir IG a una publicación anónima (sin revelar al autor)
-- =====================================================
-- En el muro, un post anónimo oculta al autor: get_ligar_feed (092) devuelve
-- author = NULL, así que el cliente no tenía a quién pedirle el intercambio de
-- Instagram y el botón quedaba escondido.
--
-- Esta RPC resuelve el autor del post EN EL SERVIDOR y crea la solicitud de IG
-- sin exponer nunca su identidad al cliente. Se mantiene el anonimato del muro:
-- la identidad/handle solo se revela si hay MATCH mutuo (ambos se han pedido el
-- IG), exactamente igual que request_ig (083). Es el mismo mecanismo, pero
-- direccionado por post_id en lugar de por user_id.
-- =====================================================
CREATE OR REPLACE FUNCTION public.request_ig_for_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user    UUID := auth.uid();
    v_target  UUID;
    v_matched BOOLEAN;
    v_handle  TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    -- Autor del post (anónimo o no). NUNCA se devuelve al cliente: así se
    -- preserva el anonimato; la identidad solo aparece con match mutuo.
    SELECT author_id INTO v_target
        FROM public.ligar_posts
        WHERE id = p_post_id AND is_deleted = false;
    IF v_target IS NULL THEN RAISE EXCEPTION 'publicación no encontrada'; END IF;
    IF v_target = v_user THEN RAISE EXCEPTION 'no puedes solicitarte a ti mismo'; END IF;

    -- Ambos deben participar en ligar (el autor lo está por haber publicado).
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Activa ligar primero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_target AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Esa persona ya no participa en ligar';
    END IF;

    INSERT INTO public.ig_requests (requester_id, target_id)
    VALUES (v_user, v_target)
    ON CONFLICT DO NOTHING;

    -- ¿Reciprocidad? Si el autor ya me había solicitado → match.
    v_matched := EXISTS (
        SELECT 1 FROM public.ig_requests
        WHERE requester_id = v_target AND target_id = v_user
    );
    IF v_matched THEN
        SELECT instagram_handle INTO v_handle FROM public.profiles WHERE id = v_target;
    END IF;

    RETURN jsonb_build_object('matched', v_matched, 'instagram_handle', v_handle);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_ig_for_post(UUID) TO authenticated;
