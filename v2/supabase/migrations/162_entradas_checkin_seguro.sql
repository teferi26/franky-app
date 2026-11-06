-- =====================================================
-- 162: check_in_ticket solo admite entradas PAGADAS (y vuelve a bloquear la fila)
-- =====================================================
-- La versión de la migración 136 validaba la entrada mirando únicamente
-- `used_at`: aceptaba cualquier estado, incluidos 'pending_payment' (reserva sin
-- pagar), 'refunded' (ya devuelta) y 'transferred' (cedida a otra persona).
-- Como el `qr_token` viaja al cliente también en las entradas pendientes,
-- bastaba con reservar sin pagar para entrar gratis al evento.
--
-- Además perdió el bloqueo de fila (`FOR UPDATE`) que sí tenía
-- validate_event_ticket (migración 095): dos escaneos simultáneos del mismo QR
-- podían leer `used_at` a NULL a la vez y dar las dos "entrada válida".
--
-- Esta migración recrea la función (CREATE OR REPLACE, idempotente) con:
--   1. `status = 'valid'` obligatorio para dejar pasar.
--   2. `FOR UPDATE OF et` al leer la entrada, serializando escaneos simultáneos.
--
-- Estados nuevos que puede devolver (los clientes ya tienen rama por defecto):
--   'not_paid'  → la reserva sigue sin pagarse.
--   'refunded'  → la entrada se devolvió.
--   'not_valid' → cualquier otro estado que no da acceso ('transferred',
--                 'listed_for_resale'...).
-- =====================================================

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

  -- FOR UPDATE OF et: bloquea la entrada hasta el final de la transacción para
  -- que dos escaneos del mismo QR no puedan marcarla como usada a la vez. Solo
  -- se bloquea event_tickets (events va en la parte interna del JOIN y no hace
  -- falta bloquearlo; profiles se consulta aparte más abajo).
  SELECT et.*, e.title AS ev_title, e.organizer_id AS ev_organizer
  INTO t
  FROM public.event_tickets et
  JOIN public.events e ON e.id = et.event_id
  WHERE et.qr_token = p_qr_token
  FOR UPDATE OF et;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  IF t.ev_organizer <> v_me THEN
    RETURN QUERY SELECT false, 'not_organizer', t.ev_title, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  IF t.used_at IS NOT NULL OR t.status = 'used' THEN
    RETURN QUERY SELECT false, 'already_used', t.ev_title,
      (SELECT full_name FROM public.profiles WHERE id = t.holder_id), t.used_at;
    RETURN;
  END IF;

  -- El dinero manda: solo una entrada pagada ('valid') abre la puerta.
  IF t.status <> 'valid' THEN
    RETURN QUERY SELECT
      false,
      CASE t.status
        WHEN 'pending_payment' THEN 'not_paid'
        WHEN 'refunded'        THEN 'refunded'
        ELSE 'not_valid'
      END,
      t.ev_title,
      (SELECT full_name FROM public.profiles WHERE id = t.holder_id),
      NULL::TIMESTAMPTZ;
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

COMMENT ON FUNCTION public.check_in_ticket(TEXT) IS
  '162: check-in en la puerta. Exige status = ''valid'' (entrada pagada) y bloquea la fila con FOR UPDATE.';

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- 2. No se puede borrar un evento con entradas vendidas
-- =====================================================
-- events -> event_tickets es ON DELETE CASCADE, así que un DELETE del
-- organizador se llevaba por delante entradas YA PAGADAS, sin reembolso y sin
-- rastro para el comprador. La interfaz ya lo impide, pero el borrado sale del
-- cliente con la RLS del organizador: cualquiera con su sesión puede llamarlo
-- a mano. El guardarraíl tiene que estar en la base de datos.
--
-- Para cancelar un evento con entradas vendidas: reembolsar desde Stripe (el
-- webhook marca las entradas como 'refunded') y entonces sí se puede borrar.
CREATE OR REPLACE FUNCTION public.prevent_delete_event_with_tickets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_vendidas INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_vendidas
      FROM public.event_tickets
     WHERE event_id = OLD.id
       AND status IN ('valid', 'used');

    IF v_vendidas > 0 THEN
        RAISE EXCEPTION
          'No se puede borrar el evento: tiene % entradas vendidas. Reembólsalas primero desde Stripe.', v_vendidas
          USING ERRCODE = 'P0001';
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_event_with_tickets ON public.events;
CREATE TRIGGER trg_prevent_delete_event_with_tickets
    BEFORE DELETE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_event_with_tickets();

COMMENT ON FUNCTION public.prevent_delete_event_with_tickets() IS
  '162: impide borrar un evento con entradas vendidas (el CASCADE las destruía sin reembolso).';

NOTIFY pgrst, 'reload schema';
