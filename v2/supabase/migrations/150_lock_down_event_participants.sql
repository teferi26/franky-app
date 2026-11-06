-- 150_lock_down_event_participants.sql
--
-- HALLAZGO (auditoría 27-jul-2026): la política de 001_schema.sql
--
--     CREATE POLICY "Event participants viewable by everyone"
--       ON public.event_participants FOR SELECT USING (true);
--
-- no lleva cláusula TO, así que aplica al rol PUBLIC: cualquiera con la anon
-- key (que es pública por diseño) podía hacer
--
--     GET /rest/v1/event_participants?select=*
--
-- y descargarse el grafo completo de "quién va a qué evento" junto con el
-- payment_intent_id de Stripe. Sin cuenta, sin login, sin dejar rastro.
--
-- ARREGLO: la tabla pasa a ser legible solo por el propio inscrito, el
-- organizador del evento y los admins. El contador público de asistentes y
-- los avatares de la vista previa (funciones reales de la web y de la app)
-- siguen funcionando a través de dos RPC SECURITY DEFINER que devuelven
-- únicamente lo mínimo y respetan events.show_participant_count.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.

-- ─────────────────────────────────────────────────────
-- 1. Cerrar la lectura abierta
-- ─────────────────────────────────────────────────────
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event participants viewable by everyone" ON public.event_participants;
DROP POLICY IF EXISTS "event_participants_select_self"      ON public.event_participants;
DROP POLICY IF EXISTS "event_participants_select_organizer" ON public.event_participants;
DROP POLICY IF EXISTS "event_participants_select_admin"     ON public.event_participants;

-- Cada uno ve su propia inscripción.
CREATE POLICY "event_participants_select_self"
    ON public.event_participants FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- El organizador ve la lista de su evento (la página /eventos/[id]/asistentes).
CREATE POLICY "event_participants_select_organizer"
    ON public.event_participants FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events e
             WHERE e.id = event_participants.event_id
               AND e.organizer_id = auth.uid()
        )
    );

-- Los admins ven todo (moderación).
CREATE POLICY "event_participants_select_admin"
    ON public.event_participants FOR SELECT TO authenticated
    USING (public.is_admin());

-- ─────────────────────────────────────────────────────
-- 2. payment_intent_id no sale nunca del servidor
--    El webhook de Stripe escribe con service_role, que ignora estos GRANT.
-- ─────────────────────────────────────────────────────
REVOKE SELECT (payment_intent_id) ON public.event_participants FROM anon, authenticated;

-- ─────────────────────────────────────────────────────
-- 3. Contador público de asistentes
--    Devuelve solo un número, nunca identidades, así que no depende de
--    show_participant_count: ese ajuste es de presentación y lo aplica el
--    cliente. Además el aforo completo se calcula con este conteo, y
--    devolver 0 al ocultarlo dejaría vender plazas por encima del límite.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_event_participant_count(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN 0;
  END IF;

  SELECT count(*)::INTEGER INTO v_count
    FROM public.event_participants
   WHERE event_id = p_event_id
     AND status <> 'cancelled';

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_participant_count(UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────
-- 4. Vista previa de asistentes (los avatares de la app)
--    Devuelve como mucho 12 user_id, nunca la lista entera, y nada de pagos.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_event_attendee_preview(
  p_event_id UUID,
  p_limit    INT DEFAULT 8
)
RETURNS TABLE (user_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_show  BOOLEAN;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 12);
BEGIN
  SELECT show_participant_count INTO v_show
    FROM public.events WHERE id = p_event_id;

  IF v_show IS NULL OR v_show = false THEN RETURN; END IF;

  RETURN QUERY
    SELECT ep.user_id
      FROM public.event_participants ep
     WHERE ep.event_id = p_event_id
       AND ep.status <> 'cancelled'
     ORDER BY ep.registered_at ASC
     LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_attendee_preview(UUID, INT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────
-- 5. user_presence: misma clase de fallo (USING (true) sin TO), el estado
--    "en línea / visto por última vez" de todo el mundo era legible por anon.
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "User presence viewable by authenticated" ON public.user_presence;
DROP POLICY IF EXISTS "user_presence_select_authenticated"      ON public.user_presence;

CREATE POLICY "user_presence_select_authenticated"
    ON public.user_presence FOR SELECT TO authenticated
    USING (true);
