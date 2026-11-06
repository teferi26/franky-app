-- =====================================================================
-- 112: Moderación FOMO/Crush para STAFF (admin + analista)
--
-- Decisión de producto (12-jun-2026): el analista, además de ver todo el
-- panel en solo lectura, SÍ puede moderar contenido reportado de FOMO y de
-- Crush (ocultar, borrar, cuarentena, descartar reportes). Sigue sin poder
-- editar nada más: catálogos, usuarios, roles y pagos quedan como estaban
-- (solo admin).
--
-- Cambios:
--   · admin_fomo_moderate() y admin_ig_moderate() pasan del guard is_admin()
--     a is_staff() (admin o analyst, no descartado).
--   · Ambas dejan ahora rastro en admin_actions (quién moderó qué), con
--     inserción best-effort que jamás bloquea la moderación.
--
-- Notas de seguridad:
--   · admin_ig_moderate actualiza profiles pero NUNCA toca role/is_premium/
--     strikes_count, así que ni el guard anti-escalada (101) ni el guard de
--     role de prod tienen nada que objetar.
--   · Cuerpos idénticos a 081/096 salvo guard + auditoría.
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────
-- admin_fomo_moderate: acción de moderación sobre un hilo/respuesta FOMO.
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
    IF NOT public.is_staff() THEN RAISE EXCEPTION 'forbidden'; END IF;
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

    -- Auditoría best-effort: quién moderó qué. Nunca bloquea la operación.
    BEGIN
        INSERT INTO public.admin_actions (actor_id, actor_email, action, target_table, target_id, changes)
        VALUES (
            auth.uid(),
            (SELECT email FROM public.profiles WHERE id = auth.uid()),
            'fomo_' || p_action,
            CASE WHEN p_target_type = 'thread' THEN 'fomo_threads' ELSE 'fomo_replies' END,
            p_target_id::text,
            jsonb_build_object('target_type', p_target_type)
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fomo_moderate(TEXT, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- admin_ig_moderate: moderación de Instagram reportados (Crush).
--   'quarantine' → oculta de Descubrir + quita verificación,
--   'clear'      → levanta la cuarentena y descarta los reportes,
--   'wipe_handle'→ borra el handle y lo saca de Crush (suplantación).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ig_moderate(p_target UUID, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.is_staff() THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_action NOT IN ('quarantine', 'clear', 'wipe_handle') THEN
        RAISE EXCEPTION 'acción inválida';
    END IF;

    IF p_action = 'quarantine' THEN
        UPDATE public.profiles
        SET ig_quarantined = true, instagram_verified = false, instagram_verified_at = NULL
        WHERE id = p_target;
    ELSIF p_action = 'clear' THEN
        UPDATE public.profiles SET ig_quarantined = false WHERE id = p_target;
        UPDATE public.ig_reports SET status = 'reviewed'
        WHERE reported_id = p_target AND status = 'pending';
    ELSIF p_action = 'wipe_handle' THEN
        UPDATE public.profiles
        SET instagram_handle = NULL, instagram_verified = false, instagram_verified_at = NULL,
            instagram_verify_token = NULL, ligar_opted_in = false, ig_quarantined = false
        WHERE id = p_target;
        UPDATE public.ig_reports SET status = 'reviewed'
        WHERE reported_id = p_target AND status = 'pending';
    END IF;

    -- Auditoría best-effort.
    BEGIN
        INSERT INTO public.admin_actions (actor_id, actor_email, action, target_table, target_id, changes)
        VALUES (
            auth.uid(),
            (SELECT email FROM public.profiles WHERE id = auth.uid()),
            'ig_' || p_action,
            'profiles',
            p_target::text,
            '{}'::jsonb
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ig_moderate(UUID, TEXT) TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (tras aplicar)
-- =====================================================================
-- Como analista:
--   SELECT public.admin_fomo_moderate('thread', gen_random_uuid(), 'dismiss');
--     -> sin error (0 filas afectadas)
--   SELECT public.admin_ig_moderate(gen_random_uuid(), 'clear');
--     -> sin error (0 filas afectadas)
-- Como usuario normal:
--   ambas -> EXCEPTION forbidden
-- =====================================================================
