-- ═══════════════════════════════════════════════════════════════════════════
-- 130: Cimientos de chat y eventos (Ola 0 del plan de las 100 mejoras)
--
-- Reacciones a mensajes, silenciar conversación, reconciliación de las dos
-- tablas de bloqueo (user_blocks vs blocked_users) y crons de recordatorio
-- (eventos que empiezan en 24h y becas que cierran en 3 días).
-- Idempotente. Aplicable desde el SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. Silenciar una conversación (por participante)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_conversation_muted(p_conversation_id UUID, p_muted BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    UPDATE public.conversation_participants
       SET is_muted = COALESCE(p_muted, false)
     WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_conversation_muted(UUID, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 2. Reacciones a mensajes (emoji por usuario y mensaje)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Ver reacciones: solo si eres participante de la conversación del mensaje.
DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE m.id = message_id AND cp.user_id = auth.uid()
        )
    );
-- Reaccionar: tu propia fila y solo en conversaciones donde participas.
DROP POLICY IF EXISTS message_reactions_write ON public.message_reactions;
CREATE POLICY message_reactions_write ON public.message_reactions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE m.id = message_id AND cp.user_id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────────────
-- 3. Reconciliar las dos tablas de bloqueo
--    La app escribe en user_blocks; los feeds de discovery filtran por
--    blocked_users. Espejamos en ambos sentidos para que un bloqueo hecho en
--    la app también valga en discovery, y viceversa. Guardas anti-recursión.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mirror_block_to_blocked_users()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.blocked_users (blocker_id, blocked_id)
        VALUES (NEW.blocker_id, NEW.blocked_id) ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.blocked_users WHERE blocker_id = OLD.blocker_id AND blocked_id = OLD.blocked_id;
    END IF;
    RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION public.mirror_blocked_users_to_block()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.user_blocks (blocker_id, blocked_id)
        VALUES (NEW.blocker_id, NEW.blocked_id) ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.user_blocks WHERE blocker_id = OLD.blocker_id AND blocked_id = OLD.blocked_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_mirror_user_blocks ON public.user_blocks;
CREATE TRIGGER trg_mirror_user_blocks
    AFTER INSERT OR DELETE ON public.user_blocks
    FOR EACH ROW EXECUTE FUNCTION public.mirror_block_to_blocked_users();
DROP TRIGGER IF EXISTS trg_mirror_blocked_users ON public.blocked_users;
CREATE TRIGGER trg_mirror_blocked_users
    AFTER INSERT OR DELETE ON public.blocked_users
    FOR EACH ROW EXECUTE FUNCTION public.mirror_blocked_users_to_block();

-- Backfill: unificar lo ya existente en ambas tablas.
INSERT INTO public.blocked_users (blocker_id, blocked_id)
    SELECT blocker_id, blocked_id FROM public.user_blocks ON CONFLICT DO NOTHING;
INSERT INTO public.user_blocks (blocker_id, blocked_id)
    SELECT blocker_id, blocked_id FROM public.blocked_users ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────
-- 4. Recordatorios de eventos (24h antes) — cron horario
-- ─────────────────────────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.send_event_reminders()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ev RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_ev IN
        SELECT id, title, city, start_date FROM public.events
        WHERE status IN ('upcoming', 'ongoing')
          AND reminder_sent_at IS NULL
          AND start_date > NOW()
          AND start_date <= NOW() + INTERVAL '24 hours'
    LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        SELECT ep.user_id, 'event',
               '⏰ Mañana: ' || v_ev.title,
               'Tu evento en ' || COALESCE(v_ev.city, 'tu ciudad') || ' es pronto. ¡No te lo pierdas!',
               jsonb_build_object('url', '/evento/' || v_ev.id::text)
        FROM public.event_participants ep
        WHERE ep.event_id = v_ev.id AND ep.status <> 'cancelled';
        UPDATE public.events SET reminder_sent_at = NOW() WHERE id = v_ev.id;
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 5. Recordatorios de becas guardadas (3 días antes del cierre) — cron diario
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_scholarship_reminders()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT f.user_id, 'scholarship',
           '🎓 Cierra pronto: ' || s.name,
           'La beca que guardaste cierra en unos días. Revisa el plazo.',
           jsonb_build_object('url', '/beca/' || s.id::text, 'scholarship_id', s.id::text)
    FROM public.favorites f
    JOIN public.scholarships s ON s.id = f.target_id AND f.target_type = 'scholarship'
    WHERE s.deadline IS NOT NULL
      AND s.deadline::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
      AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = f.user_id AND n.type = 'scholarship'
            AND n.data->>'scholarship_id' = s.id::text
            AND n.created_at > NOW() - INTERVAL '7 days'
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Programación de los crons (si pg_cron está disponible).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('send_event_reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_event_reminders');
    PERFORM cron.schedule('send_event_reminders', '0 * * * *', $job$SELECT public.send_event_reminders();$job$);
    PERFORM cron.unschedule('send_scholarship_reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_scholarship_reminders');
    PERFORM cron.schedule('send_scholarship_reminders', '0 9 * * *', $job$SELECT public.send_scholarship_reminders();$job$);
    RAISE NOTICE '130: crons de recordatorio programados (eventos horario, becas 09:00 UTC)';
  ELSE
    RAISE NOTICE '130: pg_cron no disponible; ejecutar send_event_reminders()/send_scholarship_reminders() manualmente o programar tras habilitar pg_cron';
  END IF;
END $$;

COMMENT ON TABLE public.message_reactions IS '130: reacciones emoji a mensajes de chat.';
COMMENT ON COLUMN public.conversation_participants.is_muted IS '130: conversación silenciada por este participante.';

NOTIFY pgrst, 'reload schema';
