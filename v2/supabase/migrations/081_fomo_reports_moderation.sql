-- =====================================================
-- 081: FOMO — reportar + moderación admin
-- =====================================================
-- El auto-ocultado tras 3 reportes y los rate-limit ya viven como triggers
-- en la 078. Aquí va la RPC para reportar (cualquier usuario) y las RPC de
-- moderación para admin (listar reportes y actuar).
-- =====================================================

-- ─────────────────────────────────────────────────────
-- report_fomo: reporta un hilo o respuesta. Un reporte por usuario/objeto.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_fomo(
    p_target_type TEXT,
    p_target_id   UUID,
    p_reason      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF p_target_type NOT IN ('thread', 'reply') THEN
        RAISE EXCEPTION 'target_type inválido';
    END IF;

    INSERT INTO public.fomo_reports (target_type, target_id, reporter_id, reason)
    VALUES (p_target_type, p_target_id, v_user, NULLIF(btrim(COALESCE(p_reason, '')), ''))
    ON CONFLICT (target_type, target_id, reporter_id) DO NOTHING;
    -- El trigger fomo_report_apply incrementa report_count y auto-oculta a las 3.
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_fomo(TEXT, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- admin_list_fomo_reports: cola de moderación. Hilos/respuestas con reportes
-- pendientes u ocultos. Solo admin.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_fomo_reports()
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

    RETURN QUERY
    -- Hilos reportados/ocultos
    SELECT jsonb_build_object(
        'target_type', 'thread',
        'target_id', t.id,
        'body', t.body,
        'media_url', t.media_url,
        'media_type', t.media_type,
        'is_anonymous', t.is_anonymous,
        'is_hidden', t.is_hidden,
        'is_deleted', t.is_deleted,
        'report_count', t.report_count,
        'created_at', t.created_at,
        'author_id', t.author_id,
        'author_name', (SELECT full_name FROM public.profiles WHERE id = t.author_id),
        'university_id', t.university_id,
        'reasons', COALESCE((
            SELECT jsonb_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL)
            FROM public.fomo_reports r
            WHERE r.target_type = 'thread' AND r.target_id = t.id AND r.status = 'pending'
        ), '[]'::jsonb)
    )
    FROM public.fomo_threads t
    WHERE t.is_deleted = false
      AND (t.is_hidden = true OR t.report_count > 0)

    UNION ALL

    -- Respuestas reportadas/ocultas
    SELECT jsonb_build_object(
        'target_type', 'reply',
        'target_id', rp.id,
        'thread_id', rp.thread_id,
        'body', rp.body,
        'media_url', rp.media_url,
        'media_type', rp.media_type,
        'is_anonymous', rp.is_anonymous,
        'is_hidden', rp.is_hidden,
        'is_deleted', rp.is_deleted,
        'report_count', rp.report_count,
        'created_at', rp.created_at,
        'author_id', rp.author_id,
        'author_name', (SELECT full_name FROM public.profiles WHERE id = rp.author_id),
        'reasons', COALESCE((
            SELECT jsonb_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL)
            FROM public.fomo_reports r
            WHERE r.target_type = 'reply' AND r.target_id = rp.id AND r.status = 'pending'
        ), '[]'::jsonb)
    )
    FROM public.fomo_replies rp
    WHERE rp.is_deleted = false
      AND (rp.is_hidden = true OR rp.report_count > 0)

    ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_fomo_reports() TO authenticated;

-- ─────────────────────────────────────────────────────
-- admin_fomo_moderate: acción de moderación sobre un objeto.
-- Acciones: 'delete' (borra), 'hide' (oculta), 'unhide' (restaura + descarta
-- reportes), 'dismiss' (descarta reportes y deja visible).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fomo_moderate(
    p_target_type TEXT,
    p_target_id   UUID,
    p_action      TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_target_type NOT IN ('thread', 'reply') THEN
        RAISE EXCEPTION 'target_type inválido';
    END IF;
    IF p_action NOT IN ('delete', 'hide', 'unhide', 'dismiss') THEN
        RAISE EXCEPTION 'acción inválida';
    END IF;

    IF p_target_type = 'thread' THEN
        IF p_action = 'delete' THEN
            UPDATE public.fomo_threads SET is_deleted = true, updated_at = NOW() WHERE id = p_target_id;
        ELSIF p_action = 'hide' THEN
            UPDATE public.fomo_threads SET is_hidden = true WHERE id = p_target_id;
        ELSIF p_action = 'unhide' THEN
            UPDATE public.fomo_threads SET is_hidden = false, report_count = 0 WHERE id = p_target_id;
        END IF;
    ELSE
        IF p_action = 'delete' THEN
            UPDATE public.fomo_replies SET is_deleted = true WHERE id = p_target_id;
        ELSIF p_action = 'hide' THEN
            UPDATE public.fomo_replies SET is_hidden = true WHERE id = p_target_id;
        ELSIF p_action = 'unhide' THEN
            UPDATE public.fomo_replies SET is_hidden = false, report_count = 0 WHERE id = p_target_id;
        END IF;
    END IF;

    -- En unhide/dismiss/delete descartamos los reportes pendientes asociados.
    IF p_action IN ('unhide', 'dismiss', 'delete') THEN
        UPDATE public.fomo_reports
        SET status = 'reviewed'
        WHERE target_type = p_target_type AND target_id = p_target_id AND status = 'pending';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fomo_moderate(TEXT, UUID, TEXT) TO authenticated;
