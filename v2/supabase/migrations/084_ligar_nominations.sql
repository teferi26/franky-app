-- =====================================================
-- 084: Ligar — nominar a un amigo (consentimiento GDPR) + cartel QR
-- =====================================================
-- "Nominar amigo": un usuario que ya participa en ligar puede invitar a alguien
-- de su confianza (un contacto de chat 1:1) a unirse. GDPR: NO le activamos
-- nada — solo recibe una invitación (notificación) y es ÉL quien decide activar
-- ligar (consentimiento explícito). Guardamos quién nominó para trazabilidad
-- anti-abuso, pero NUNCA se revela al nominado quién le invitó.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ligar_nominations (
    nominator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nominee_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (nominator_id, nominee_id),
    CHECK (nominator_id <> nominee_id)
);

CREATE INDEX IF NOT EXISTS idx_ligar_nominations_nominee
    ON public.ligar_nominations(nominee_id);

ALTER TABLE public.ligar_nominations ENABLE ROW LEVEL SECURITY;

-- Acceso solo vía RPC SECURITY DEFINER; lectura propia mínima.
DROP POLICY IF EXISTS "ligar_nominations_select_own" ON public.ligar_nominations;
CREATE POLICY "ligar_nominations_select_own"
    ON public.ligar_nominations FOR SELECT TO authenticated
    USING (nominator_id = auth.uid() OR nominee_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- get_ligar_nominatable: contactos de chat 1:1 a los que puedo invitar.
-- Solo mayores de 18, que aún no participan, que no he invitado ya y sin
-- bloqueos en ninguna dirección. No expone Instagram ni nada privado.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ligar_nominatable()
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    RETURN QUERY
    WITH my_convos AS (
        SELECT conversation_id
        FROM public.conversation_participants
        WHERE user_id = v_user
    ),
    peers AS (
        SELECT DISTINCT cp.user_id AS peer_id
        FROM public.conversation_participants cp
        JOIN my_convos mc ON mc.conversation_id = cp.conversation_id
        WHERE cp.user_id <> v_user
    )
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url
    )
    FROM peers
    JOIN public.profiles p ON p.id = peers.peer_id
    WHERE public.is_adult(p.id)
      AND COALESCE(p.ligar_opted_in, false) = false
      AND COALESCE(p.is_discarded, false) = false
      AND COALESCE(p.is_hidden, false) = false
      -- aún no le he invitado
      AND NOT EXISTS (
        SELECT 1 FROM public.ligar_nominations n
        WHERE n.nominator_id = v_user AND n.nominee_id = p.id
      )
      -- sin bloqueos en ninguna dirección
      AND p.id NOT IN (
        SELECT blocked_id FROM public.blocked_users WHERE blocker_id = v_user
        UNION
        SELECT blocker_id FROM public.blocked_users WHERE blocked_id = v_user
      )
    ORDER BY p.full_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ligar_nominatable() TO authenticated;

-- ─────────────────────────────────────────────────────
-- nominate_friend: invita a p_nominee a ligar. GDPR: solo notifica, no activa.
-- Anónimo para el nominado (no revela quién invita). Rate-limit: 10/día.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nominate_friend(p_nominee UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_recent INT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_user = p_nominee THEN RAISE EXCEPTION 'no puedes invitarte a ti mismo'; END IF;

    -- El que invita debe participar en ligar (y por tanto ser mayor de 18).
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Activa ligar primero';
    END IF;

    -- El invitado debe ser mayor de 18 y no participar todavía.
    IF NOT public.is_adult(p_nominee) THEN
        RAISE EXCEPTION 'Solo puedes invitar a mayores de 18';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_nominee AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Esa persona ya participa en ligar';
    END IF;

    -- Sin bloqueos en ninguna dirección.
    IF EXISTS (
        SELECT 1 FROM public.blocked_users
        WHERE (blocker_id = v_user AND blocked_id = p_nominee)
           OR (blocker_id = p_nominee AND blocked_id = v_user)
    ) THEN
        RAISE EXCEPTION 'No puedes invitar a esta persona';
    END IF;

    -- Rate-limit anti-spam: 10 invitaciones por día.
    SELECT COUNT(*) INTO v_recent
    FROM public.ligar_nominations
    WHERE nominator_id = v_user AND created_at > NOW() - INTERVAL '1 day';
    IF v_recent >= 10 THEN
        RAISE EXCEPTION 'Has invitado a demasiada gente hoy. Inténtalo mañana.';
    END IF;

    INSERT INTO public.ligar_nominations (nominator_id, nominee_id)
    VALUES (v_user, p_nominee)
    ON CONFLICT DO NOTHING;

    -- Notificación ANÓNIMA (no se revela quién invita).
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        p_nominee,
        'system',
        'Te han invitado a Ligar en la biblioteca 💘',
        'Alguien de tu confianza cree que encajarías. Tú decides: actívalo solo si quieres.',
        jsonb_build_object('kind', 'ligar_nomination', 'url', '/ligar')
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.nominate_friend(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_ligar_nomination_count: cuántos amigos me han invitado y aún no he
-- entrado (gancho de curiosidad anónimo en la pantalla de activación).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ligar_nomination_count()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COUNT(DISTINCT nominator_id)::int
    FROM public.ligar_nominations
    WHERE nominee_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_ligar_nomination_count() TO authenticated;
