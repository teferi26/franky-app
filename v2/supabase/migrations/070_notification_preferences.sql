-- Migration 070: notification_preferences — toggles por categoría + DnD horario.
--
-- NOTI-003: cada usuario controla qué tipos de notification quiere recibir.
-- NOTI-004: do-not-disturb window — el server (push_dispatcher Edge Function
-- Wave 13) consulta esta tabla antes de enviar push. Si la hora caller cae
-- dentro de la ventana DnD, se silencia.
--
-- Categorías iniciales:
--   chat_messages: mensajes de chat 1:1 + grupales
--   matches: nuevas conexiones recíprocas
--   likes: alguien te ha dado like (sin match recíproco)
--   events: invitaciones a eventos / recordatorios
--   accommodation: solicitudes de pisos / actualizaciones
--   marketing: promos, novedades, encuestas (default off)
--   system: avisos importantes (mantenimiento, security, payment) — NO togglable

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Toggles por categoría
    chat_messages BOOLEAN NOT NULL DEFAULT true,
    matches BOOLEAN NOT NULL DEFAULT true,
    likes BOOLEAN NOT NULL DEFAULT true,
    events BOOLEAN NOT NULL DEFAULT true,
    accommodation BOOLEAN NOT NULL DEFAULT true,
    marketing BOOLEAN NOT NULL DEFAULT false,

    -- Do-not-disturb window (timezone implícito UTC; cliente convierte a local)
    dnd_enabled BOOLEAN NOT NULL DEFAULT false,
    dnd_start_hour SMALLINT NOT NULL DEFAULT 23 CHECK (dnd_start_hour BETWEEN 0 AND 23),
    dnd_end_hour SMALLINT NOT NULL DEFAULT 8 CHECK (dnd_end_hour BETWEEN 0 AND 23),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "noti_prefs_select_own" ON public.notification_preferences;
CREATE POLICY "noti_prefs_select_own"
    ON public.notification_preferences
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "noti_prefs_insert_own" ON public.notification_preferences;
CREATE POLICY "noti_prefs_insert_own"
    ON public.notification_preferences
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "noti_prefs_update_own" ON public.notification_preferences;
CREATE POLICY "noti_prefs_update_own"
    ON public.notification_preferences
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_noti_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_noti_prefs_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_noti_prefs_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION public.touch_noti_prefs_updated_at();

/**
 * Helper para Edge Function push_dispatcher (Wave 13):
 *   SELECT public.should_send_push(:user_id, :category) -> BOOLEAN
 *
 * Devuelve false si:
 *   - el toggle de la categoría está OFF, o
 *   - DnD activo y la hora actual cae en la ventana.
 *
 * Categorías especiales:
 *   - 'system' siempre devuelve true (no togglable, son críticos).
 *   - Cualquier categoría desconocida → true (fail open para no bloquear).
 */
CREATE OR REPLACE FUNCTION public.should_send_push(
    p_user_id UUID,
    p_category TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefs RECORD;
    v_now_hour INT := EXTRACT(HOUR FROM NOW())::INT;
    v_allowed BOOLEAN;
BEGIN
    IF p_category = 'system' THEN RETURN true; END IF;

    SELECT * INTO v_prefs FROM public.notification_preferences WHERE user_id = p_user_id;
    -- Sin prefs definidas → defaults (todos los toggles ON excepto marketing).
    IF v_prefs IS NULL THEN
        RETURN p_category <> 'marketing';
    END IF;

    -- Categoría toggle
    v_allowed := CASE p_category
        WHEN 'chat_messages' THEN v_prefs.chat_messages
        WHEN 'matches' THEN v_prefs.matches
        WHEN 'likes' THEN v_prefs.likes
        WHEN 'events' THEN v_prefs.events
        WHEN 'accommodation' THEN v_prefs.accommodation
        WHEN 'marketing' THEN v_prefs.marketing
        ELSE true
    END;
    IF NOT v_allowed THEN RETURN false; END IF;

    -- DnD window (handle wrap-around 23 → 8 = duerme de 23h a 8h)
    IF v_prefs.dnd_enabled THEN
        IF v_prefs.dnd_start_hour <= v_prefs.dnd_end_hour THEN
            IF v_now_hour >= v_prefs.dnd_start_hour AND v_now_hour < v_prefs.dnd_end_hour THEN
                RETURN false;
            END IF;
        ELSE
            -- wrap-around
            IF v_now_hour >= v_prefs.dnd_start_hour OR v_now_hour < v_prefs.dnd_end_hour THEN
                RETURN false;
            END IF;
        END IF;
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.should_send_push(UUID, TEXT) TO authenticated, service_role;

COMMENT ON TABLE public.notification_preferences IS
    'NOTI-003 + NOTI-004: toggles por categoría + ventana DnD horaria.';
