-- =====================================================
-- 146: Alertas de plazo de beca
-- =====================================================
-- "Avísame antes de que cierre esta beca". Retención pura: cada año se
-- pierden becas por no enterarse del plazo, y este aviso es un motivo
-- legítimo para que el email del usuario valga algo (ver 141/145).
--
-- El envío lo hace un cron diario de Vercel (/api/cron/becas-alerts) con la
-- service role: busca alertas cuyas becas cierran en <= 7 días, manda el
-- correo y marca notified_at para no repetir.

CREATE TABLE IF NOT EXISTS public.scholarship_alerts (
    user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    scholarship_id UUID NOT NULL REFERENCES public.scholarships(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Cuándo se envió el aviso de cierre (NULL = pendiente).
    notified_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, scholarship_id)
);

-- El cron busca por beca y estado de notificación.
CREATE INDEX IF NOT EXISTS idx_scholarship_alerts_pending
    ON public.scholarship_alerts (scholarship_id)
    WHERE notified_at IS NULL;

ALTER TABLE public.scholarship_alerts ENABLE ROW LEVEL SECURITY;

-- Cada usuario gestiona SOLO sus alertas. El envío usa service role (salta RLS).
DROP POLICY IF EXISTS scholarship_alerts_select_own ON public.scholarship_alerts;
CREATE POLICY scholarship_alerts_select_own
    ON public.scholarship_alerts FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS scholarship_alerts_insert_own ON public.scholarship_alerts;
CREATE POLICY scholarship_alerts_insert_own
    ON public.scholarship_alerts FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS scholarship_alerts_delete_own ON public.scholarship_alerts;
CREATE POLICY scholarship_alerts_delete_own
    ON public.scholarship_alerts FOR DELETE TO authenticated
    USING (user_id = auth.uid());

COMMENT ON TABLE public.scholarship_alerts IS
'Suscripciones "avisame antes de que cierre esta beca". Insert/delete del propio usuario por RLS; el cron diario de Vercel envia el email con service role y marca notified_at.';

NOTIFY pgrst, 'reload schema';
