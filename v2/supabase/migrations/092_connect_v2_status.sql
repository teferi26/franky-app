-- =====================================================
-- 092: Connect — estado de cuenta bajo el modelo V2 "recipient"
-- =====================================================
-- La integración pasa de la API Express V1 a cuentas V2 (configuración
-- `recipient`): la plataforma es merchant of record y el vendedor solo recibe
-- transferencias (capability `stripe_transfers`). El estado vivo de la cuenta
-- ya no se describe con `charges_enabled` de la cuenta Stripe, sino con dos
-- señales nuevas que mantiene fresco el webhook de thin-events:
--
--   transfers_status     → estado de la capability stripe_transfers
--                          (active | pending | restricted | unsupported)
--   requirements_status  → requirements.summary.minimum_deadline.status
--                          (currently_due | eventually_due | past_due | null)
--
-- `charges_enabled` se reutiliza como "listo para recibir": true cuando
-- transfers_status = 'active'. Las rutas de cobro siguen comprobando esa
-- columna, así que su semántica de gate no cambia.
-- =====================================================

ALTER TABLE public.connect_accounts
    ADD COLUMN IF NOT EXISTS transfers_status    TEXT,
    ADD COLUMN IF NOT EXISTS requirements_status TEXT;
