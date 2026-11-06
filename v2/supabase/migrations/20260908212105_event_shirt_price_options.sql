-- Two explicit tariffs for registrations paid directly to the organiser.
-- Stripe ticket reservations and previously issued tickets are not changed.
ALTER TABLE public.events
 ADD COLUMN price_without_shirt numeric(10,2),
 ADD COLUMN price_with_shirt numeric(10,2),
 ADD CONSTRAINT events_shirt_prices_valid CHECK (
   (price_without_shirt IS NULL AND price_with_shirt IS NULL) OR
   (price_without_shirt IS NOT NULL AND price_with_shirt IS NOT NULL
    AND shirts_enabled IS TRUE AND payment_mode IS NOT DISTINCT FROM 'info'
    AND price_without_shirt > 0 AND price_with_shirt >= price_without_shirt AND price_with_shirt <= 10000)
 );
ALTER TABLE public.event_shirt_sizes ADD COLUMN quoted_price_cents integer CHECK (quoted_price_cents >= 0);
COMMENT ON COLUMN public.event_shirt_sizes.quoted_price_cents IS 'Server-derived quote for the selected option, paid to the organiser; not proof of payment.';

CREATE FUNCTION public.sync_event_shirt_price() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.price_without_shirt IS NOT NULL AND NEW.price_with_shirt IS NOT NULL THEN
  NEW.price := least(NEW.price_without_shirt, NEW.price_with_shirt);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_event_shirt_price BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.sync_event_shirt_price();
REVOKE ALL ON FUNCTION public.sync_event_shirt_price() FROM PUBLIC,anon,authenticated;

-- Derive quotes even for direct API writes. A size-only change preserves the
-- original quote; switching with/without a shirt explicitly selects a new tariff.
CREATE FUNCTION public.quote_event_shirt_option() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.event_id<>OLD.event_id OR NEW.user_id<>OLD.user_id) THEN RAISE EXCEPTION 'shirt answer cannot be reassigned'; END IF;
 SELECT * INTO e FROM public.events WHERE id=NEW.event_id FOR UPDATE;
 IF e.price_without_shirt IS NULL OR e.price_with_shirt IS NULL THEN
  NEW.quoted_price_cents := CASE WHEN TG_OP='UPDATE' THEN OLD.quoted_price_cents ELSE NULL END;
  RETURN NEW;
 END IF;
 IF auth.uid() IS NULL OR auth.uid()<>NEW.user_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'auth required'; END IF;
 IF e.payment_mode IS DISTINCT FROM 'info' OR coalesce(e.status,'') NOT IN ('upcoming','ongoing') OR e.start_date IS NULL OR e.start_date<=now() THEN RAISE EXCEPTION 'el evento no admite cambios'; END IF;
 IF TG_OP='UPDATE' AND OLD.quoted_price_cents IS NOT NULL AND (NEW.size='ninguna')=(OLD.size='ninguna')
 AND EXISTS(SELECT 1 FROM public.event_participants WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND status='registered' AND kicked_at IS NULL) THEN
  NEW.quoted_price_cents := OLD.quoted_price_cents;
 ELSE
  NEW.quoted_price_cents := round(100*CASE WHEN NEW.size='ninguna' THEN e.price_without_shirt ELSE e.price_with_shirt END)::integer;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_quote_event_shirt_option BEFORE INSERT OR UPDATE ON public.event_shirt_sizes
FOR EACH ROW EXECUTE FUNCTION public.quote_event_shirt_option();
REVOKE ALL ON FUNCTION public.quote_event_shirt_option() FROM PUBLIC,anon,authenticated;

-- Keep direct/older-client registration writes from creating a new attendee
-- without choosing a priced option. Existing registrations are not rewritten.
CREATE FUNCTION public.require_event_shirt_option() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE; previous public.event_participants%ROWTYPE; manager boolean;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.event_id<>OLD.event_id OR NEW.user_id<>OLD.user_id)
 AND EXISTS(SELECT 1 FROM public.events WHERE id IN(OLD.event_id,NEW.event_id) AND price_without_shirt IS NOT NULL) THEN RAISE EXCEPTION 'registration cannot be reassigned'; END IF;
 SELECT * INTO e FROM public.events WHERE id=NEW.event_id FOR UPDATE;
 IF e.price_without_shirt IS NULL THEN RETURN NEW; END IF;
 manager := auth.uid()=e.organizer_id OR public.is_admin();
 IF auth.uid() IS NULL OR (auth.uid()<>NEW.user_id AND NOT coalesce(manager,false)) THEN RAISE EXCEPTION 'auth required'; END IF;
 IF NEW.status IS NULL OR (NEW.status NOT IN ('registered','cancelled') AND NOT coalesce(manager,false)
 AND NOT (TG_OP='UPDATE' AND OLD.status='attended' AND NEW.status='attended' AND OLD.event_id=NEW.event_id AND OLD.user_id=NEW.user_id)) THEN RAISE EXCEPTION 'invalid registration status'; END IF;
 IF NOT coalesce(manager,false) THEN
  IF TG_OP='INSERT' AND (NEW.kicked_at IS NOT NULL OR NEW.kicked_by IS NOT NULL) THEN RAISE EXCEPTION 'invalid expulsion metadata'; END IF;
  IF TG_OP='UPDATE' AND (NEW.kicked_at IS DISTINCT FROM OLD.kicked_at OR NEW.kicked_by IS DISTINCT FROM OLD.kicked_by) THEN RAISE EXCEPTION 'expulsion cannot be changed'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='attended' AND NEW.status<>'attended' THEN RAISE EXCEPTION 'attendance cannot be changed'; END IF;
 END IF;
 SELECT * INTO previous FROM public.event_participants WHERE event_id=NEW.event_id AND user_id=NEW.user_id;
 IF previous.kicked_at IS NOT NULL AND NEW.status<>'cancelled' AND NOT coalesce(manager,false) THEN RAISE EXCEPTION 'No puedes volver a un evento del que has sido expulsado'; END IF;
 IF NEW.status='cancelled' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'auth required'; END IF;
 -- Existing attendees retain their seat, including at full capacity. Preserve
 -- legacy registrations without choosing a new option on an unrelated update.
 IF TG_OP='UPDATE' AND OLD.status IN ('registered','attended') AND OLD.event_id=NEW.event_id AND OLD.user_id=NEW.user_id THEN RETURN NEW; END IF;
 IF coalesce(e.status,'') NOT IN ('upcoming','ongoing') OR e.start_date IS NULL OR e.start_date<=now() THEN RAISE EXCEPTION 'el evento no admite inscripciones'; END IF;
 IF e.max_capacity IS NOT NULL AND coalesce(previous.status,'') NOT IN ('registered','attended') AND (SELECT count(*) FROM public.event_participants WHERE event_id=e.id AND status IN ('registered','attended'))>=e.max_capacity THEN RAISE EXCEPTION 'Aforo completo'; END IF;
 IF coalesce(previous.status,'') NOT IN ('registered','attended') THEN
  UPDATE public.event_shirt_sizes SET size=size WHERE event_id=NEW.event_id AND user_id=NEW.user_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.event_shirt_sizes WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND quoted_price_cents IS NOT NULL) THEN RAISE EXCEPTION 'Elige la opción con o sin camiseta desde la ficha actualizada del evento'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_require_event_shirt_option BEFORE INSERT OR UPDATE ON public.event_participants
FOR EACH ROW EXECUTE FUNCTION public.require_event_shirt_option();
REVOKE ALL ON FUNCTION public.require_event_shirt_option() FROM PUBLIC,anon,authenticated;

-- SECURITY DEFINER is needed for the atomic participation + size write. Caller
-- is always auth.uid(), the event is locked and existing capacity guards run.
CREATE FUNCTION public.register_event_shirt_option(p_event_id uuid,p_size text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); e public.events%ROWTYPE; quote integer;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'auth required'; END IF;
 IF p_size IS NULL OR p_size NOT IN ('XS','S','M','L','XL','XXL','ninguna') THEN RAISE EXCEPTION 'Elige una talla válida o la opción sin camiseta'; END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND OR coalesce(e.status,'') NOT IN ('upcoming','ongoing') OR e.start_date IS NULL OR e.start_date<=now() THEN RAISE EXCEPTION 'el evento no admite inscripciones'; END IF;
 IF e.payment_mode IS DISTINCT FROM 'info' OR e.price_without_shirt IS NULL OR e.price_with_shirt IS NULL OR e.shirts_enabled IS NOT TRUE THEN RAISE EXCEPTION 'opciones de camiseta no disponibles'; END IF;
 IF EXISTS(SELECT 1 FROM public.event_participants WHERE event_id=p_event_id AND user_id=u AND (kicked_at IS NOT NULL OR status='attended')) THEN RAISE EXCEPTION 'Esta inscripción no se puede reactivar'; END IF;
 INSERT INTO public.event_shirt_sizes(event_id,user_id,size) VALUES(p_event_id,u,p_size)
 ON CONFLICT(event_id,user_id) DO UPDATE SET size=excluded.size
 RETURNING quoted_price_cents INTO quote;
 INSERT INTO public.event_participants(event_id,user_id,status) VALUES(p_event_id,u,'registered')
 ON CONFLICT(event_id,user_id) DO UPDATE SET status='registered';
 RETURN jsonb_build_object('registered',true,'size',p_size,'price_cents',quote);
END $$;
REVOKE ALL ON FUNCTION public.register_event_shirt_option(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_event_shirt_option(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
