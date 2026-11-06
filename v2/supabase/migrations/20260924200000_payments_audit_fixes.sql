-- =====================================================================
-- 20260924200000: arreglos de la auditoría de pagos (23-sep-2026)
--
-- Todo es idempotente (IF NOT EXISTS / CREATE OR REPLACE / guards
-- to_regclass) y aditivo: ninguna tabla existente pierde datos ni columnas.
--
--   1. webhook_events (116) pasa a ser un registro real de idempotencia:
--      estado (processing/succeeded/failed), contador de intentos y último
--      error. RPC claim_webhook_event_v2 / finish_webhook_event_v2 para el webhook.
--   2. payment_review_queue + flag_payment_review: cola de revisión manual
--      para incidencias de cobro que NO deben tumbar el webhook (rotación
--      trimestral fallida, factura de organización con nombre o IVA raros,
--      evento de contrato diferido con la oferta apagada, etc.). Avisa al
--      equipo la primera vez.
--   3. payment_disputes + record_payment_dispute: contracargos de pagos del
--      marketplace (entradas, visitas, alquiler) y de pedidos Origin. Marca el
--      pago en revisión, invalida la entrada si la disputa se pierde y guarda
--      la reversión de la transferencia al organizador.
--   4. admin_payment_review incluye disputas abiertas y la cola de revisión.
--   5. admin_organization_revenue: MRR neto de las suscripciones de
--      organizaciones (sus tablas no son legibles por service_role).
--
-- NO aplicar sin revisar: la escribe la auditoría y la aplica el equipo.
-- Aplicar antes del nuevo webhook: ante fallo del registro devuelve 503 para reintento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. webhook_events con estado e intentos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_events FROM anon, authenticated;
GRANT ALL ON public.webhook_events TO service_role;

-- Las filas que ya existieran se consideran procesadas (semántica de la 116).
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'succeeded';
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_status_check'
                 AND conrelid = 'public.webhook_events'::regclass) THEN
    ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_status_check
      CHECK (status IN ('processing', 'succeeded', 'failed'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS webhook_events_failed ON public.webhook_events(updated_at) WHERE status = 'failed';

-- RPC versionada: reserva exclusiva de 5 minutos, superior al límite de 60s del webhook.
-- Todo fallo o reserva ocupada exige reintento; la finalización lleva el token de intento.
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE OR REPLACE FUNCTION public.claim_webhook_event_v2(p_event_id text, p_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.webhook_events%ROWTYPE; v_token uuid := gen_random_uuid();
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 3 AND 255
     OR p_type IS NULL OR length(p_type) NOT BETWEEN 3 AND 255 THEN RAISE EXCEPTION 'invalid_event'; END IF;
  INSERT INTO public.webhook_events(event_id,type,status,attempts,processed_at,updated_at,lease_token,lease_expires_at)
  VALUES (p_event_id,p_type,'processing',1,now(),now(),v_token,now()+interval '5 minutes')
  ON CONFLICT (event_id) DO NOTHING;
  SELECT * INTO w FROM public.webhook_events WHERE event_id=p_event_id FOR UPDATE;
  IF w.type IS DISTINCT FROM p_type THEN RAISE EXCEPTION 'event_type_mismatch'; END IF;
  IF w.status='succeeded' THEN RETURN jsonb_build_object('duplicate',true); END IF;
  IF w.lease_token=v_token THEN RETURN jsonb_build_object('duplicate',false,'token',v_token); END IF;
  IF w.status='processing' AND w.lease_expires_at>now() THEN
    RETURN jsonb_build_object('duplicate',false,'busy',true);
  END IF;
  UPDATE public.webhook_events SET attempts=attempts+1,status='processing',updated_at=now(),
    lease_token=v_token,lease_expires_at=now()+interval '5 minutes' WHERE event_id=p_event_id;
  RETURN jsonb_build_object('duplicate',false,'token',v_token);
END $$;
REVOKE ALL ON FUNCTION public.claim_webhook_event_v2(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event_v2(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_webhook_event_v2(p_event_id text,p_token uuid,p_status text,p_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_finished boolean;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('succeeded', 'failed') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.webhook_events
     SET status = p_status,
         failures = failures + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
         last_error = CASE WHEN p_status = 'failed' THEN left(p_error, 500) ELSE NULL END,
         processed_at = CASE WHEN p_status = 'succeeded' THEN now() ELSE processed_at END,
         updated_at = now(), lease_expires_at=NULL
   WHERE event_id=p_event_id AND lease_token=p_token AND status='processing' AND lease_expires_at>now()
   RETURNING true INTO v_finished;
  IF NOT coalesce(v_finished,false) THEN
    SELECT true INTO v_finished FROM public.webhook_events
    WHERE event_id=p_event_id AND lease_token=p_token AND status=p_status AND p_status='succeeded';
  END IF;
  RETURN jsonb_build_object('finished',coalesce(v_finished,false));
END $$;
REVOKE ALL ON FUNCTION public.finish_webhook_event_v2(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_webhook_event_v2(text,uuid,text,text) TO service_role;

-- ---------------------------------------------------------------------
-- 2. Cola de revisión manual de cobros
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_review_queue (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (length(kind) BETWEEN 3 AND 80),
  reference   TEXT NOT NULL CHECK (length(reference) BETWEEN 1 AND 255),
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (kind, reference)
);
ALTER TABLE public.payment_review_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_review_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_review_queue TO service_role;
CREATE INDEX IF NOT EXISTS payment_review_queue_open ON public.payment_review_queue(created_at) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.flag_payment_review(p_kind text, p_reference text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_new boolean;
BEGIN
  INSERT INTO public.payment_review_queue(kind, reference, detail)
  VALUES (p_kind, p_reference, coalesce(p_detail, '{}'::jsonb))
  ON CONFLICT (kind, reference) DO UPDATE
    SET detail = excluded.detail, occurrences = public.payment_review_queue.occurrences + 1,
        resolved_at = NULL, updated_at = now()
  RETURNING (xmax = 0) INTO v_new;
  -- Solo la primera vez: los reintentos de Stripe no deben inundar el buzón.
  IF v_new THEN
    BEGIN
      PERFORM public.dispatch_staff_alert('otro', 'Pagos: incidencia pendiente de revisión',
        'Hay un cobro que necesita revisión manual en el panel de pagos. No se ha tocado el dinero automáticamente.',
        jsonb_build_object('kind', p_kind, 'reference', p_reference));
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('new', v_new);
END $$;
REVOKE ALL ON FUNCTION public.flag_payment_review(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_payment_review(text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Disputas (contracargos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id                   TEXT PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 255),
  source               TEXT NOT NULL CHECK (source IN ('marketplace', 'origin')),
  payment_id           UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  origin_order_id      UUID,
  stripe_charge_id     TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  amount_cents         INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency             TEXT NOT NULL,
  status               TEXT NOT NULL,
  reason               TEXT,
  livemode             BOOLEAN NOT NULL DEFAULT false,
  stripe_transfer_id   TEXT,
  transfer_reversal_id TEXT,
  reversal_status      TEXT NOT NULL DEFAULT 'none'
    CHECK (reversal_status IN ('none', 'not_applicable', 'reversed', 'failed')),
  reversed_cents       INTEGER NOT NULL DEFAULT 0 CHECK (reversed_cents >= 0),
  needs_admin          BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((source = 'marketplace' AND payment_id IS NOT NULL) OR (source = 'origin' AND origin_order_id IS NOT NULL))
);
ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_disputes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_disputes TO service_role;
CREATE INDEX IF NOT EXISTS payment_disputes_payment ON public.payment_disputes(payment_id);
CREATE INDEX IF NOT EXISTS payment_disputes_open ON public.payment_disputes(updated_at) WHERE needs_admin;

-- Registra el estado ACTUAL de una disputa (el webhook lo relee de Stripe, así
-- que un evento tardío no puede reabrir una disputa ya cerrada). Idempotente.
CREATE OR REPLACE FUNCTION public.record_payment_dispute(
  p_dispute text, p_source text, p_payment uuid, p_origin_order uuid, p_charge text, p_intent text,
  p_amount integer, p_currency text, p_status text, p_reason text, p_livemode boolean,
  p_transfer text, p_reversal text, p_reversal_status text, p_reversed_cents integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.payments%ROWTYPE; d public.payment_disputes%ROWTYPE; v_prev text; v_prev_reversal text; v_first boolean; v_issue text;
BEGIN
  IF p_dispute IS NULL OR p_charge IS NULL OR p_status IS NULL OR p_amount IS NULL OR p_amount < 0
     OR coalesce(p_reversal_status, 'none') NOT IN ('none', 'not_applicable', 'reversed', 'failed') THEN
    RAISE EXCEPTION 'invalid_dispute';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('payment_dispute:' || p_dispute, 0));
  IF p_source = 'marketplace' THEN
    SELECT * INTO p FROM public.payments WHERE id = p_payment;
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_missing'; END IF;
    PERFORM public.lock_marketplace_resource(p.type,
      CASE WHEN p.type = 'rent' THEN (p.metadata->>'contract_id')::uuid ELSE p.ref_id END,
      coalesce(p.metadata->>'event_id', p.metadata->>'slot_id')::uuid);
    SELECT * INTO p FROM public.payments WHERE id = p_payment FOR UPDATE;
    IF p.stripe_payment_intent_id IS NOT NULL AND p.stripe_payment_intent_id IS DISTINCT FROM p_intent THEN
      RAISE EXCEPTION 'dispute_identity_mismatch';
    END IF;
  ELSIF p_source = 'origin' THEN
    IF NOT EXISTS (SELECT 1 FROM public.origin_event_orders WHERE id = p_origin_order
                   AND (stripe_payment_intent IS NULL OR stripe_payment_intent = p_intent)) THEN
      RAISE EXCEPTION 'dispute_identity_mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_dispute_source';
  END IF;

  SELECT status, reversal_status INTO v_prev, v_prev_reversal FROM public.payment_disputes WHERE id = p_dispute FOR UPDATE;
  v_first := NOT FOUND;
  -- Keep the terminal outcome while reconciling any transfer reversal which
  -- completed after another worker recorded that outcome.
  IF v_prev IN ('won','lost','warning_closed') AND p_status IS DISTINCT FROM v_prev THEN
    p_status := v_prev;
    SELECT reason INTO p_reason FROM public.payment_disputes WHERE id=p_dispute;
  END IF;
  INSERT INTO public.payment_disputes(id, source, payment_id, origin_order_id, stripe_charge_id, stripe_payment_intent_id,
    amount_cents, currency, status, reason, livemode, stripe_transfer_id, transfer_reversal_id, reversal_status, reversed_cents)
  VALUES (p_dispute, p_source, CASE WHEN p_source = 'marketplace' THEN p_payment END,
    CASE WHEN p_source = 'origin' THEN p_origin_order END, p_charge, p_intent, p_amount, lower(p_currency), p_status,
    p_reason, coalesce(p_livemode, false), p_transfer, p_reversal, coalesce(p_reversal_status, 'none'), coalesce(p_reversed_cents, 0))
  ON CONFLICT (id) DO UPDATE SET
    status = excluded.status, reason = excluded.reason, amount_cents = excluded.amount_cents,
    stripe_transfer_id = coalesce(excluded.stripe_transfer_id, public.payment_disputes.stripe_transfer_id),
    transfer_reversal_id = coalesce(excluded.transfer_reversal_id, public.payment_disputes.transfer_reversal_id),
    -- Una reversión hecha no se "deshace" por un reintento que no la ve.
    reversal_status = CASE WHEN public.payment_disputes.reversal_status = 'reversed' THEN 'reversed'
                           WHEN excluded.reversal_status = 'none' THEN public.payment_disputes.reversal_status
                           ELSE excluded.reversal_status END,
    reversed_cents = greatest(public.payment_disputes.reversed_cents, excluded.reversed_cents),
    needs_admin = public.payment_disputes.needs_admin OR public.payment_disputes.status IS DISTINCT FROM excluded.status,
    updated_at = now()
  RETURNING * INTO d;

  v_issue := CASE WHEN p_status = 'won' THEN 'dispute_won' WHEN p_status = 'lost' THEN 'dispute_lost' ELSE 'dispute_open' END;
  IF p_source = 'marketplace' THEN
    -- El pago queda en la revisión de pagos que ya consulta el panel admin.
    INSERT INTO public.payment_checkout_state(payment_id, state, issue)
    VALUES (p.id, 'review', v_issue)
    ON CONFLICT (payment_id) DO UPDATE SET state = 'review', issue = v_issue, updated_at = now();
    -- Disputa perdida: el comprador ya ha recuperado su dinero por el banco.
    -- La entrada deja de ser válida (mismo estado que una devolución) salvo
    -- que ya se haya usado o transferido.
    IF p_status = 'lost' AND p.type = 'ticket' THEN
      UPDATE public.event_tickets SET status = 'refunded'
       WHERE id = p.ref_id AND order_id = p.id AND status IN ('valid', 'listed_for_resale');
    END IF;
  END IF;

  -- Un aviso por hecho nuevo (disputa, cambio de estado o reversión fallida),
  -- no uno por cada reintento del mismo evento.
  IF v_first OR v_prev IS DISTINCT FROM p_status
     OR (d.reversal_status = 'reversed' AND v_prev_reversal IS DISTINCT FROM 'reversed')
     OR (d.reversal_status = 'failed' AND v_prev_reversal IS DISTINCT FROM 'failed') THEN
    BEGIN
      PERFORM public.dispatch_staff_alert('otro', 'Pagos: disputa (contracargo) ' || p_status,
        CASE WHEN d.reversal_status = 'failed'
             THEN 'Hay una disputa de un pago y no se pudo recuperar la transferencia del organizador. Revisar en Stripe.'
             WHEN p_status = 'won'
             THEN 'Disputa ganada. Si se revirtió la transferencia del organizador, hay que devolvérsela manualmente.'
             ELSE 'Un comprador ha abierto o cambiado una disputa. Revisar el pago en el panel y en Stripe.' END,
        jsonb_build_object('dispute_id', p_dispute, 'source', p_source, 'payment_id', p_payment,
          'origin_order_id', p_origin_order, 'status', p_status, 'reversal_status', d.reversal_status));
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('first', v_first, 'status', d.status, 'reversal_status', d.reversal_status);
END $$;
REVOKE ALL ON FUNCTION public.record_payment_dispute(text, text, uuid, uuid, text, text, integer, text, text, text, boolean, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_dispute(text, text, uuid, uuid, text, text, integer, text, text, text, boolean, text, text, text, integer)
  TO service_role;

-- ---------------------------------------------------------------------
-- 4. Revisión de pagos del panel: añade disputas y cola manual
--    (mismo contrato que 20260905203115; solo se añaden claves).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payment_review() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() OR coalesce(auth.jwt()->>'aal','')<>'aal2' THEN
  RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('generated_at',now(),
  'counts',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT state,count(*) AS orders FROM public.payment_checkout_state GROUP BY state) x),
  'review',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT p.id,p.type,p.amount_cents,p.currency,p.status,p.created_at,p.stripe_payment_intent_id,s.issue,
      s.state AS checkout_state FROM public.payment_checkout_state s JOIN public.payments p ON p.id=s.payment_id
    WHERE s.state='review' OR (s.state='closing' AND s.updated_at<now()-interval '15 minutes')
    ORDER BY p.created_at LIMIT 50) x),
  'disputes',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT d.id,d.source,d.payment_id,d.origin_order_id,d.amount_cents,d.currency,d.status,d.reason,
      d.reversal_status,d.reversed_cents,d.created_at,d.updated_at
    FROM public.payment_disputes d WHERE d.needs_admin ORDER BY d.updated_at DESC LIMIT 50) x),
  'manual',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT q.id,q.kind,q.reference,q.detail,q.occurrences,q.created_at,q.updated_at
    FROM public.payment_review_queue q WHERE q.resolved_at IS NULL ORDER BY q.created_at LIMIT 50) x),
  'webhook_failures',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT w.event_id,w.type,w.attempts,w.failures,w.last_error,w.updated_at
    FROM public.webhook_events w WHERE w.status='failed' ORDER BY w.updated_at DESC LIMIT 50) x));
END $$;
REVOKE ALL ON FUNCTION public.admin_payment_review() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_payment_review() TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Ingresos de organizaciones para el panel (service_role no puede leer
--    esas tablas directamente). Precios de organización: IVA NO incluido, así
--    que subtotal - descuento ya es neto de IVA. Normaliza a mes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_organization_revenue() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_mrr numeric := 0; v_active integer := 0; v_env text;
BEGIN
  IF to_regclass('public.organization_subscriptions') IS NULL THEN
    RETURN jsonb_build_object('available', false);
  END IF;
  SELECT environment INTO v_env FROM public.organization_billing_configuration WHERE singleton;
  SELECT count(*), coalesce(sum(x.monthly_net_cents), 0) INTO v_active, v_mrr FROM (
    SELECT DISTINCT ON (s.id) s.id,
      (greatest(0, per.subtotal_cents - per.discount_cents - per.refunded_cents)::numeric
        / greatest(1, round(extract(epoch FROM (per.period_end - per.period_start)) / 86400 / 30.44))) AS monthly_net_cents
    FROM public.organization_subscriptions s
    JOIN public.organization_subscription_periods per ON per.subscription_id = s.id AND per.paid
    WHERE s.status = 'active' AND s.environment = coalesce(v_env, 'live')
    ORDER BY s.id, per.period_start DESC
  ) x;
  RETURN jsonb_build_object('available', true, 'environment', v_env, 'active', v_active,
    'mrr_net_cents', round(v_mrr));
END $$;
REVOKE ALL ON FUNCTION public.admin_organization_revenue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_organization_revenue() TO service_role;

NOTIFY pgrst, 'reload schema';
