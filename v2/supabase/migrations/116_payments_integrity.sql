-- =====================================================================
-- 116: Integridad de pagos (cierra los follow-ups del webhook de Stripe)
--
-- Origen: robustecimiento del webhook (12-jun-2026). Tres arreglos que el
-- codigo nuevo necesita para ser idempotente y no fallar en silencio:
--
--   1. notifications.type no admitia 'payment': el webhook inserta una
--      notificacion "Pago confirmado" con type 'payment' que violaba el CHECK
--      (notifications_type_check, definido por ultima vez en 011) y fallaba sin
--      avisar. Se amplia el CHECK para incluir 'payment' (y se dejan todos los
--      tipos ya validos para no romper nada).
--   2. subscriptions.stripe_subscription_id no tenia UNIQUE (solo un indice
--      normal, 001): por eso el webhook hace leer-antes-de-escribir. Se anade
--      el UNIQUE de forma DEFENSIVA: solo si no existen duplicados; si los hay,
--      se avisa por NOTICE para deduplicar a mano antes (no se fuerza).
--   3. Tabla webhook_events de idempotencia por event.id: permite blindar
--      tambien los efectos no idempotentes (el webhook puede consultarla para
--      saltar un evento ya procesado).
--
-- Todo idempotente y resiliente a la divergencia prod (guards to_regclass).
-- =====================================================================

-- 1. notifications.type admite 'payment'
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'message', 'match', 'review', 'accommodation', 'event', 'promotion',
        'system', 'scholarship', 'accommodation_request', 'roomie_like', 'payment'
      ));
  END IF;
END;
$$;

-- 2. UNIQUE en subscriptions.stripe_subscription_id (solo si no hay duplicados)
DO $$
DECLARE
  v_dups INT;
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dups FROM (
      SELECT stripe_subscription_id
      FROM public.subscriptions
      WHERE stripe_subscription_id IS NOT NULL
      GROUP BY stripe_subscription_id
      HAVING COUNT(*) > 1
    ) d;

    IF v_dups = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_uniq
        ON public.subscriptions(stripe_subscription_id)
        WHERE stripe_subscription_id IS NOT NULL;
    ELSE
      RAISE NOTICE 'subscriptions: % stripe_subscription_id duplicados. Deduplica a mano y vuelve a ejecutar este bloque para crear el UNIQUE.', v_dups;
    END IF;
  END IF;
END;
$$;

-- 3. Tabla de idempotencia de eventos de webhook
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- Solo el service_role (webhook) escribe/lee; ningun cliente. Sin policies =
-- sin acceso para anon/authenticated, que es lo que queremos.
REVOKE ALL ON public.webhook_events FROM anon, authenticated;

COMMENT ON TABLE public.webhook_events IS
  '116: idempotencia de webhooks de Stripe por event.id. El handler puede insertar el event.id y, si choca con la PK, saltar el evento ya procesado.';
