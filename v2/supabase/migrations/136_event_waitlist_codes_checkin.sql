-- ═══════════════════════════════════════════════════════════════════════════
-- 136: Lista de espera, códigos de descuento y check-in en la puerta
--      (mejoras 71, 77 y 73 del ciclo 2)
--
--   71. Cuando un evento se agota, poder apuntarse a la lista de espera y que
--       el organizador vea cuánta demanda real hay.
--   77. Códigos de descuento y early bird (porcentaje o importe fijo, con
--       tope de usos y fecha de caducidad).
--   73. Check-in con QR en la puerta: marcar una entrada como usada, solo el
--       organizador del evento, y de forma idempotente.
--
-- Las entradas ya existen en public.event_tickets. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 71. Lista de espera
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_waitlist (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_waitlist_event
  ON public.event_waitlist (event_id, created_at);

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;

-- Cada uno gestiona su sitio en la lista.
DROP POLICY IF EXISTS "event_waitlist_own" ON public.event_waitlist;
CREATE POLICY "event_waitlist_own"
  ON public.event_waitlist FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- El organizador ve la lista de espera de SUS eventos (para saber la demanda).
DROP POLICY IF EXISTS "event_waitlist_organizer_select" ON public.event_waitlist;
CREATE POLICY "event_waitlist_organizer_select"
  ON public.event_waitlist FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_waitlist.event_id AND e.organizer_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────
-- 77. Códigos de descuento / early bird
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_discount_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  -- 'percent' descuenta un %, 'fixed' descuenta céntimos.
  kind          TEXT NOT NULL DEFAULT 'percent',
  value         INT  NOT NULL,
  max_uses      INT,
  used_count    INT  NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_discount_kind_check CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT event_discount_value_check CHECK (value > 0),
  CONSTRAINT event_discount_percent_range
    CHECK (kind <> 'percent' OR value <= 100)
);

-- El código es único por evento (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_discount_code
  ON public.event_discount_codes (event_id, lower(code));

ALTER TABLE public.event_discount_codes ENABLE ROW LEVEL SECURITY;

-- Solo el organizador crea y gestiona los códigos de su evento.
DROP POLICY IF EXISTS "event_discount_organizer_all" ON public.event_discount_codes;
CREATE POLICY "event_discount_organizer_all"
  ON public.event_discount_codes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_discount_codes.event_id AND e.organizer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_discount_codes.event_id AND e.organizer_id = auth.uid()
  ));

-- Validar un código SIN exponer la tabla al comprador: devuelve el descuento
-- aplicable en céntimos sobre el precio dado, o 0 si el código no vale.
CREATE OR REPLACE FUNCTION public.check_discount_code(
  p_event UUID,
  p_code  TEXT,
  p_price_cents INT
)
RETURNS TABLE (valid BOOLEAN, discount_cents INT, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_disc INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 0, 'no_auth'; RETURN;
  END IF;

  SELECT * INTO r FROM public.event_discount_codes
  WHERE event_id = p_event AND lower(code) = lower(trim(p_code));

  IF r IS NULL THEN
    RETURN QUERY SELECT false, 0, 'not_found'; RETURN;
  END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, 'expired'; RETURN;
  END IF;
  IF r.max_uses IS NOT NULL AND r.used_count >= r.max_uses THEN
    RETURN QUERY SELECT false, 0, 'exhausted'; RETURN;
  END IF;

  IF r.kind = 'percent' THEN
    v_disc := (p_price_cents * r.value) / 100;
  ELSE
    v_disc := r.value;
  END IF;

  -- Nunca descontar más que el precio.
  IF v_disc > p_price_cents THEN v_disc := p_price_cents; END IF;

  RETURN QUERY SELECT true, v_disc, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_discount_code(UUID, TEXT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 73. Check-in con QR en la puerta
-- ─────────────────────────────────────────────────────
-- event_tickets YA tiene `used_at` y `status` (la app los usa para pintar la
-- entrada como usada): no duplicamos columna, solo añadimos quién validó.
ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Valida el QR y marca la entrada como usada. Solo el organizador del evento.
-- Idempotente: si ya estaba usada lo dice, no la "desusa" ni falla.
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr_token TEXT)
RETURNS TABLE (
  ok          BOOLEAN,
  status      TEXT,
  event_title TEXT,
  holder_name TEXT,
  used_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  t    RECORD;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, 'no_auth', NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  SELECT et.*, e.title AS ev_title, e.organizer_id AS ev_organizer
  INTO t
  FROM public.event_tickets et
  JOIN public.events e ON e.id = et.event_id
  WHERE et.qr_token = p_qr_token;

  IF t IS NULL THEN
    RETURN QUERY SELECT false, 'not_found', NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  IF t.ev_organizer <> v_me THEN
    RETURN QUERY SELECT false, 'not_organizer', t.ev_title, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  IF t.used_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_used', t.ev_title,
      (SELECT full_name FROM public.profiles WHERE id = t.holder_id), t.used_at;
    RETURN;
  END IF;

  UPDATE public.event_tickets
    SET used_at = now(), checked_in_by = v_me, status = 'used'
    WHERE id = t.id;

  RETURN QUERY SELECT true, 'ok', t.ev_title,
    (SELECT full_name FROM public.profiles WHERE id = t.holder_id), now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT) TO authenticated;

COMMENT ON TABLE public.event_waitlist IS
  '136: lista de espera cuando el evento se agota (mejora 71).';
COMMENT ON TABLE public.event_discount_codes IS
  '136: códigos de descuento y early bird por evento (mejora 77).';

NOTIFY pgrst, 'reload schema';
