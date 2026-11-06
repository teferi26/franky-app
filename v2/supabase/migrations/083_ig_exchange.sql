-- =====================================================
-- 083: Ligar — intercambio mutuo de Instagram
-- =====================================================
-- Mecánica anti-acoso: para VER el Instagram de alguien tienes que darle el
-- tuyo (solicitarle). Solo cuando AMBOS se han solicitado (reciprocidad) se
-- revelan los handles. Gancho de curiosidad: "X personas quieren tu IG"
-- (recuento anónimo de quien te ha solicitado y aún no has correspondido).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ig_requests (
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (requester_id, target_id),
    CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_requests_target ON public.ig_requests(target_id);

ALTER TABLE public.ig_requests ENABLE ROW LEVEL SECURITY;

-- Acceso solo vía RPC SECURITY DEFINER; políticas mínimas de lectura propia.
DROP POLICY IF EXISTS "ig_requests_select_own" ON public.ig_requests;
CREATE POLICY "ig_requests_select_own"
    ON public.ig_requests FOR SELECT TO authenticated
    USING (requester_id = auth.uid() OR target_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- request_ig: el usuario actual solicita el IG de p_target (le da el suyo).
-- Devuelve { matched, instagram_handle }.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_ig(p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_matched BOOLEAN;
    v_handle TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_user = p_target THEN RAISE EXCEPTION 'no puedes solicitarte a ti mismo'; END IF;

    -- Ambos deben participar en ligar (y por tanto ser mayores de 18).
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Activa ligar primero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target AND ligar_opted_in) THEN
        RAISE EXCEPTION 'Esa persona no participa en ligar';
    END IF;

    INSERT INTO public.ig_requests (requester_id, target_id)
    VALUES (v_user, p_target)
    ON CONFLICT DO NOTHING;

    -- ¿Reciprocidad? Si el target ya me había solicitado → match.
    v_matched := EXISTS (
        SELECT 1 FROM public.ig_requests
        WHERE requester_id = p_target AND target_id = v_user
    );

    IF v_matched THEN
        SELECT instagram_handle INTO v_handle FROM public.profiles WHERE id = p_target;
    END IF;

    RETURN jsonb_build_object('matched', v_matched, 'instagram_handle', v_handle);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_ig(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_ig_candidates: gente de tu universidad que participa en ligar y a la
-- que aún no has solicitado. NO expone el Instagram ni quién te ha solicitado
-- (aunque ordena primero a quienes te han echado el ojo, para subir el match).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ig_candidates(p_limit INT DEFAULT 20)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_uni UUID;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT university_id INTO v_uni FROM public.profiles WHERE id = v_user;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'age', CASE WHEN p.birth_date IS NOT NULL
                    THEN EXTRACT(YEAR FROM AGE(p.birth_date))::int ELSE NULL END,
        'city', p.city
    )
    FROM public.profiles p
    WHERE p.id <> v_user
      AND p.ligar_opted_in = true
      AND COALESCE(p.is_discarded, false) = false
      AND COALESCE(p.is_hidden, false) = false
      AND (v_uni IS NULL OR p.university_id = v_uni)
      -- aún no le he solicitado
      AND NOT EXISTS (
        SELECT 1 FROM public.ig_requests r
        WHERE r.requester_id = v_user AND r.target_id = p.id
      )
      -- excluir bloqueos en cualquier dirección
      AND p.id NOT IN (
        SELECT blocked_id FROM public.blocked_users WHERE blocker_id = v_user
        UNION
        SELECT blocker_id FROM public.blocked_users WHERE blocked_id = v_user
      )
    ORDER BY
      -- primero quienes ya me solicitaron (match probable), sin revelarlo
      EXISTS (
        SELECT 1 FROM public.ig_requests r2
        WHERE r2.requester_id = p.id AND r2.target_id = v_user
      ) DESC,
      random()
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ig_candidates(INT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_ig_matches: intercambios mutuos confirmados, con el Instagram revelado.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ig_matches()
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
        'instagram_handle', p.instagram_handle,
        'matched_at', GREATEST(mine.created_at, theirs.created_at)
    )
    FROM public.ig_requests mine
    JOIN public.ig_requests theirs
      ON theirs.requester_id = mine.target_id
     AND theirs.target_id = mine.requester_id
    JOIN public.profiles p ON p.id = mine.target_id
    WHERE mine.requester_id = v_user
    ORDER BY GREATEST(mine.created_at, theirs.created_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ig_matches() TO authenticated;

-- ─────────────────────────────────────────────────────
-- get_ig_pending_count: "X personas quieren tu IG" — quienes te han
-- solicitado y aún no les has correspondido (gancho de curiosidad, anónimo).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ig_pending_count()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COUNT(*)::int
    FROM public.ig_requests r
    WHERE r.target_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.ig_requests mine
        WHERE mine.requester_id = auth.uid() AND mine.target_id = r.requester_id
      );
$$;

GRANT EXECUTE ON FUNCTION public.get_ig_pending_count() TO authenticated;
