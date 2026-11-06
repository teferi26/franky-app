-- ─────────────────────────────────────────────────────────────────────────────
-- 168: repercutir la tasa de Stripe en el precio de las entradas
-- ─────────────────────────────────────────────────────────────────────────────
-- Contexto (ago-2026, primer evento cobrado por la app): la comisión Franky del
-- 8% eran 7,31 € pero a Franky le llegaron 1,40 €. Con "destination charges" de
-- Stripe Connect la tasa de procesamiento (1,5% + 0,25 € por cobro) se descuenta
-- de la application_fee de la plataforma, no de lo que recibe el organizador.
--
-- El código (web/src/lib/pricing.ts) pasa a retener en Stripe:
--     application_fee = comisión Franky (8%) + tasa Stripe (1,5% + 0,25 €)
-- y el precio bruto de una entrada nueva se calcula para que el organizador
-- reciba íntegro el neto que tecleó.
--
-- Problema con lo YA publicado: events.price guarda el BRUTO calculado con la
-- fórmula antigua (neto + 8%). Con la fee nueva, esos organizadores recibirían
-- ~0,33 € menos por entrada de lo prometido. Esta migración recalcula el bruto
-- de los eventos de pago por la app que todavía no han empezado, de modo que:
--     bruto_nuevo - 8% - (1,5% + 0,25 €) >= neto_antiguo (= bruto_viejo - 8%)
-- y sincroniza el snapshot price_cents de las entradas aún pendientes de pago
-- (reserve_event_ticket ya lo hace al re-reservar; aquí lo hacemos de golpe).
--
-- Idempotente: apunta en app_settings que ya se ejecutó y no vuelve a tocar
-- nada en re-ejecuciones (si no, cada pasada subiría el precio otra vez).
-- Los % están fijados a los valores por defecto del código (FEE_TICKET_PCT=8,
-- STRIPE_FEE 1,5% + 25 c). Si en Vercel hubiera otro %, ajustar antes de aplicar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._franky_gross_from_net_168(p_net_cents INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_gross INTEGER;
  v_net   INTEGER;
BEGIN
  IF p_net_cents <= 0 THEN RETURN 0; END IF;
  -- Arranque por división y ajuste céntimo a céntimo (misma lógica que
  -- grossFromNetCents en la web: la comisión se redondea).
  v_gross := GREATEST(1, CEIL((p_net_cents + 25) / (1 - 0.08 - 0.015))::INTEGER);
  LOOP
    v_net := v_gross - ROUND(v_gross * 0.08)::INTEGER - (ROUND(v_gross * 0.015)::INTEGER + 25);
    EXIT WHEN v_net >= p_net_cents;
    v_gross := v_gross + 1;
  END LOOP;
  LOOP
    EXIT WHEN v_gross <= 1;
    v_net := (v_gross - 1) - ROUND((v_gross - 1) * 0.08)::INTEGER - (ROUND((v_gross - 1) * 0.015)::INTEGER + 25);
    EXIT WHEN v_net < p_net_cents;
    v_gross := v_gross - 1;
  END LOOP;
  RETURN v_gross;
END;
$$;

DO $$
DECLARE
  v_done TEXT;
  v_ev RECORD;
  v_old_cents INTEGER;
  v_old_net   INTEGER;
  v_new_cents INTEGER;
  v_count INTEGER := 0;
BEGIN
  SELECT value INTO v_done FROM public.app_settings WHERE key = 'pricing_regross_168_done';
  IF v_done IS NOT NULL THEN
    RAISE NOTICE '168: ya aplicada (% ), no se toca nada', v_done;
    RETURN;
  END IF;

  FOR v_ev IN
    SELECT id, price
      FROM public.events
     WHERE payment_mode = 'app'
       AND COALESCE(price, 0) > 0
       AND start_date > NOW()
       AND COALESCE(status, 'upcoming') IN ('upcoming', 'ongoing')
  LOOP
    v_old_cents := ROUND(v_ev.price * 100)::INTEGER;
    -- Neto que se le prometió al organizador con la fórmula antigua (solo 8%).
    v_old_net   := v_old_cents - ROUND(v_old_cents * 0.08)::INTEGER;
    v_new_cents := public._franky_gross_from_net_168(v_old_net);
    IF v_new_cents <> v_old_cents THEN
      UPDATE public.events
         SET price = v_new_cents / 100.0
       WHERE id = v_ev.id;
      -- Entradas reservadas y aún sin pagar: que el cobro salga al precio nuevo.
      UPDATE public.event_tickets
         SET price_cents = v_new_cents
       WHERE event_id = v_ev.id
         AND status = 'pending_payment';
      v_count := v_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.app_settings (key, value)
  VALUES ('pricing_regross_168_done', NOW()::TEXT || ' eventos=' || v_count)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RAISE NOTICE '168: recalculados % eventos de pago futuros', v_count;
END;
$$;

DROP FUNCTION public._franky_gross_from_net_168(INTEGER);
