-- =====================================================
-- 100: Crush — solicitudes entrantes de IG + notificaciones + chats sin leer
-- =====================================================
-- Tres cosas:
--  1) request_ig / request_ig_for_post ahora CREAN una notificación al
--     destinatario ("X quiere intercambiar tu Instagram", o "¡Match!" si se
--     completa la reciprocidad). Enlazan a /crush vía data.url.
--  2) get_ig_incoming_requests(): lista a quien te ha pedido el IG y aún no has
--     correspondido, para poder verlos y ACEPTARLOS (aceptar = pedírselo de
--     vuelta = match). Cambia el modelo de "anónimo a ciegas" a "ver y aceptar".
--  3) get_unread_chat_count(): nº de chats con mensajes sin leer (badge navbar).
-- =====================================================

-- ─────────────────────────────────────────────────────
-- Núcleo compartido: aplica una solicitud de IG de auth.uid() → p_target.
-- Usa auth.uid() como solicitante (no se puede falsear). Inserta la solicitud,
-- detecta match y emite la notificación adecuada SOLO si la solicitud es nueva.
-- Interno: se revoca de PUBLIC; lo invocan request_ig / request_ig_for_post
-- (SECURITY DEFINER, corren como owner).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ig_request_apply(p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_inserted INT;
    v_matched  BOOLEAN;
    v_handle   TEXT;
    v_name     TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_user = p_target THEN RAISE EXCEPTION 'no puedes solicitarte a ti mismo'; END IF;

    -- Ambos deben participar en Crush.
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Activa Crush primero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Esa persona ya no participa en Crush';
    END IF;

    INSERT INTO public.ig_requests (requester_id, target_id)
    VALUES (v_user, p_target)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- ¿Reciprocidad? Si el target ya me había solicitado → match.
    v_matched := EXISTS (
        SELECT 1 FROM public.ig_requests
        WHERE requester_id = p_target AND target_id = v_user
    );
    IF v_matched THEN
        SELECT instagram_handle INTO v_handle FROM public.profiles WHERE id = p_target;
    END IF;

    -- Notificación solo cuando esta llamada crea realmente la solicitud (evita
    -- spam si se pulsa varias veces).
    IF v_inserted = 1 THEN
        SELECT full_name INTO v_name FROM public.profiles WHERE id = v_user;
        IF v_matched THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                p_target, 'match',
                '¡Match en Crush! 💜',
                COALESCE(v_name, 'Alguien') || ' también quería tu Instagram. Ya podéis verlo.',
                jsonb_build_object('kind', 'ig_match', 'url', '/crush')
            );
        ELSE
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                p_target, 'match',
                COALESCE(v_name, 'Alguien') || ' quiere intercambiar Instagram contigo',
                'Acéptalo en Crush para ver su Instagram (y que vea el tuyo).',
                jsonb_build_object('kind', 'ig_request', 'url', '/crush')
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('matched', v_matched, 'instagram_handle', v_handle);
END;
$$;

REVOKE ALL ON FUNCTION public._ig_request_apply(UUID) FROM PUBLIC;

-- request_ig: solicitar por id de usuario (Descubrir, Matches, FOMO, aceptar).
CREATE OR REPLACE FUNCTION public.request_ig(p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN public._ig_request_apply(p_target);
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_ig(UUID) TO authenticated;

-- request_ig_for_post: solicitar a una publicación del muro (anónima o no);
-- resuelve el autor en el servidor sin exponerlo.
CREATE OR REPLACE FUNCTION public.request_ig_for_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_target UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT author_id INTO v_target FROM public.ligar_posts
        WHERE id = p_post_id AND is_deleted = false;
    IF v_target IS NULL THEN RAISE EXCEPTION 'publicación no encontrada'; END IF;
    RETURN public._ig_request_apply(v_target);
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_ig_for_post(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_ig_incoming_requests: quién te ha pedido el IG y aún no has correspondido.
-- Revela identidad (el modelo pasa a "ver y aceptar"). Aceptar = request_ig(id).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ig_incoming_requests(p_limit INT DEFAULT 50)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'age', CASE WHEN p.birth_date IS NOT NULL
                    THEN EXTRACT(YEAR FROM AGE(p.birth_date))::int ELSE NULL END,
        'city', p.city,
        'verified', COALESCE(p.instagram_verified, false),
        'requested_at', r.created_at
    )
    FROM public.ig_requests r
    JOIN public.profiles p ON p.id = r.requester_id
    WHERE r.target_id = v_user
      AND p.ligar_opted_in = true
      AND COALESCE(p.ig_quarantined, false) = false
      -- aún no le he correspondido (si ya, es match y va en "Matches")
      AND NOT EXISTS (
        SELECT 1 FROM public.ig_requests mine
        WHERE mine.requester_id = v_user AND mine.target_id = r.requester_id
      )
      AND p.id NOT IN (
        SELECT blocked_id FROM public.blocked_users WHERE blocker_id = v_user
        UNION
        SELECT blocker_id FROM public.blocked_users WHERE blocked_id = v_user
      )
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ig_incoming_requests(INT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_unread_chat_count: nº de conversaciones con mensajes sin leer (badge).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unread_chat_count()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COUNT(DISTINCT m.conversation_id)::int
    FROM public.messages m
    JOIN public.conversation_participants cp
      ON cp.conversation_id = m.conversation_id AND cp.user_id = auth.uid()
    WHERE m.sender_id <> auth.uid()
      AND m.read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_unread_chat_count() TO authenticated;

NOTIFY pgrst, 'reload schema';
