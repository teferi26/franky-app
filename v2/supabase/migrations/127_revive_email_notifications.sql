-- ═══════════════════════════════════════════════════════════════════════════
-- 127: Revivir emails de actividad + eventos por ciudad
--
-- La 125 reescribió on_notification_insert para pasar el type al push y
-- eliminó sin querer la llamada a dispatch_email que había añadido la 089:
-- desde entonces NINGÚN email de actividad se envía. Esta migración:
--
--   1. Restaura dispatch_email en el trigger y amplía los tipos que envían
--      email: message, match (incluye Crush ig_request/ig_match), roomie_like,
--      comment y event. Los usuarios solo-web (sin app móvil, sin token push)
--      dependen de estos emails para enterarse de algo.
--   2. Repara el CHECK de notifications.type: las migraciones 086/087/094
--      insertan 'tenancy', 'visit' y 'contract', que la 125 dejó fuera del
--      constraint (esos INSERT fallaban en silencio dentro de sus triggers).
--   3. Nuevo trigger: al crear un evento próximo, notifica ('event') a los
--      usuarios de la misma ciudad o universidad. El gating de email
--      (preferencias 'events', DnD, máx. 1 email de eventos al día) vive en
--      /api/internal/notify-email.
--
-- Aplicable desde el SQL Editor. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. CHECK de tipos completo (añade tenancy/visit/contract a los de la 125)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'message', 'match', 'review', 'accommodation', 'event', 'promotion',
    'system', 'scholarship', 'accommodation_request', 'roomie_like', 'payment',
    'comment', 'post', 'tenancy', 'visit', 'contract'
  ));

-- ─────────────────────────────────────────────────────
-- 2. Trigger de notifications: push + email
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_read, false) = false THEN
    PERFORM public.dispatch_push(
      NEW.user_id, NEW.title, NEW.body,
      COALESCE(NEW.data, '{}'::jsonb) || jsonb_build_object('type', NEW.type)
    );

    IF NEW.type IN ('message', 'match', 'roomie_like', 'comment', 'event') THEN
      PERFORM public.dispatch_email(
        NEW.user_id, NEW.type, NEW.title, NEW.body, COALESCE(NEW.data, '{}'::jsonb)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 3. Nuevo evento próximo → notification 'event' a la gente de la zona
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_event_created_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'upcoming' OR NEW.start_date <= NOW() THEN
    RETURN NEW;
  END IF;

  -- Anti-spam: si el organizador ya ha creado más de 2 eventos en 24h, los
  -- siguientes no abren fan-out (el evento se crea igual, solo que sin avisos
  -- masivos). Sin esto, cualquier cuenta gratuita podría notificar a 500
  -- personas por evento en bucle.
  IF NEW.organizer_id IS NOT NULL AND (
    SELECT COUNT(*) FROM public.events
    WHERE organizer_id = NEW.organizer_id
      AND created_at > NOW() - INTERVAL '24 hours'
  ) > 2 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id, 'event',
    '📅 Nuevo plan en ' || NEW.city || ': ' || LEFT(NEW.title, 80),
    LEFT(COALESCE(NULLIF(NEW.description, ''), 'Toca para ver los detalles.'), 140),
    jsonb_build_object('url', '/eventos/' || NEW.id::text, 'event_id', NEW.id::text)
  FROM public.profiles p
  WHERE p.id IS DISTINCT FROM NEW.organizer_id
    AND (
      (p.city IS NOT NULL AND lower(trim(p.city)) = lower(trim(NEW.city)))
      OR (NEW.university_id IS NOT NULL AND p.university_id = NEW.university_id)
    )
  ORDER BY p.id
  LIMIT 500;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- notificar jamás debe romper la creación del evento
END;
$$;

DROP TRIGGER IF EXISTS trg_event_created_notify ON public.events;
CREATE TRIGGER trg_event_created_notify
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.on_event_created_notify();

COMMENT ON FUNCTION public.on_event_created_notify IS
  '126: al crear un evento upcoming futuro, notifica (event) a usuarios de la misma ciudad o universidad, máx. 500.';

NOTIFY pgrst, 'reload schema';
