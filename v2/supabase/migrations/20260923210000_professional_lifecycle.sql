-- Operational waitlists and durable in-app notices. No external provider or public
-- notification trigger is invoked. Existing bookings remain operable when pilot sales pause.
ALTER TABLE public.professional_bookings
 ADD COLUMN waitlist_offer_status text NOT NULL DEFAULT 'none' CHECK(waitlist_offer_status IN('none','offered','accepted','expired','declined')),
 ADD COLUMN waitlist_offer_expires_at timestamptz,
 ADD COLUMN waitlist_offer_version integer NOT NULL DEFAULT 0 CHECK(waitlist_offer_version>=0),
 ADD COLUMN lifecycle_version integer NOT NULL DEFAULT 0 CHECK(lifecycle_version>=0),
 ADD CONSTRAINT professional_offer_shape CHECK(waitlist_offer_status<>'offered' OR (status='requested' AND session_id IS NOT NULL AND waitlist_offer_expires_at IS NOT NULL));
CREATE INDEX professional_offer_due ON public.professional_bookings(waitlist_offer_expires_at,session_id) WHERE waitlist_offer_status='offered';
CREATE INDEX professional_session_waiters ON public.professional_bookings(session_id,created_at,id) WHERE status='waitlisted';
CREATE OR REPLACE FUNCTION workspace_private.professional_booking_json(p_booking uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (to_jsonb(b)-'request_hash'-'request_key'-'created_by')||jsonb_build_object('customer_name',c.display_name,'service_name',b.price_snapshot->>'service_name','timezone',s.timezone)
 FROM public.professional_bookings b JOIN public.professional_customers c ON c.id=b.customer_id JOIN public.professional_settings s ON s.organization_id=b.organization_id WHERE b.id=p_booking
$$;

CREATE TABLE public.professional_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 booking_id uuid NOT NULL REFERENCES public.professional_bookings(id),recipient_user_id uuid NOT NULL,
 recipient_kind text NOT NULL CHECK(recipient_kind IN('customer','operator')),demo_cohort_id uuid,
 lifecycle_version integer NOT NULL,kind text NOT NULL CHECK(kind IN('requested','confirmed','waitlisted','waitlist_offer','waitlist_expired','cancelled','reschedule_proposed','rescheduled','reminder_24h','reminder_2h')),
 title text NOT NULL,body text NOT NULL,payload jsonb NOT NULL,
 due_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','ready','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),ready_at timestamptz,read_at timestamptz,cancel_reason text,
 UNIQUE(booking_id,lifecycle_version,kind,recipient_user_id),CHECK(expires_at>due_at)
);
ALTER TABLE public.professional_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_notices FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.professional_notices TO service_role;
CREATE INDEX professional_notice_delivery ON public.professional_notices(due_at,id) WHERE state='pending';
CREATE INDEX professional_notice_inbox ON public.professional_notices(recipient_user_id,organization_id,id) WHERE state='ready';

CREATE FUNCTION workspace_private.professional_lifecycle_service() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'professional_forbidden' USING ERRCODE='42501';END IF;
END $$;

CREATE FUNCTION workspace_private.professional_notice_recipient(p_notice public.professional_notices) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_notice.recipient_user_id AND p.is_discarded IS NOT TRUE AND p.self_deleted IS NOT TRUE)
 AND (SELECT cohort_id FROM public.workspace_demo_accounts WHERE user_id=p_notice.recipient_user_id) IS NOT DISTINCT FROM p_notice.demo_cohort_id
 AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_notice.organization_id AND o.demo_cohort_id IS NOT DISTINCT FROM p_notice.demo_cohort_id)
 AND CASE WHEN p_notice.recipient_kind='customer' THEN EXISTS(SELECT 1 FROM public.professional_bookings b WHERE b.id=p_notice.booking_id AND b.customer_user_id=p_notice.recipient_user_id)
 ELSE EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id WHERE m.organization_id=p_notice.organization_id AND m.user_id=p_notice.recipient_user_id AND m.status='active' AND o.status='active' AND public.workspace_role_permissions(m.role)&&ARRAY['content.manage','attendees.manage']) END
$$;

CREATE FUNCTION workspace_private.professional_queue_notice(p_booking public.professional_bookings,p_kind text,p_due timestamptz,p_expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE zone text;org_name text;cohort uuid;caption text;message text;data jsonb;recipient record;BEGIN
 IF p_due IS NULL OR p_expires IS NULL OR p_due>=p_expires THEN RETURN;END IF;
 SELECT s.timezone,o.name,o.demo_cohort_id INTO zone,org_name,cohort FROM public.professional_settings s JOIN public.organizations o ON o.id=s.organization_id WHERE s.organization_id=p_booking.organization_id;
 caption:=CASE p_kind WHEN 'requested' THEN 'Solicitud de reserva recibida' WHEN 'confirmed' THEN 'Reserva confirmada' WHEN 'waitlisted' THEN 'Inscripción en lista de espera' WHEN 'waitlist_offer' THEN 'Tienes una plaza disponible' WHEN 'waitlist_expired' THEN 'La oferta de plaza ha caducado' WHEN 'cancelled' THEN 'Reserva cancelada' WHEN 'reschedule_proposed' THEN 'Propuesta de cambio de horario' WHEN 'rescheduled' THEN 'Nuevo horario confirmado' ELSE 'Recordatorio de tu reserva' END;
 message:=left(coalesce(org_name,'Tu establecimiento')||' · '||coalesce(p_booking.price_snapshot->>'service_name','Reserva')||' · '||to_char(p_booking.starts_at AT TIME ZONE zone,'DD/MM/YYYY HH24:MI'),350);
 IF p_kind='waitlist_offer' THEN message:=message||'. Acepta antes de '||to_char(p_booking.waitlist_offer_expires_at AT TIME ZONE zone,'DD/MM HH24:MI')||'.';END IF;
 data:=jsonb_build_object('booking_id',p_booking.id,'organization_id',p_booking.organization_id,'starts_at',p_booking.starts_at,'timezone',zone,'offer_expires_at',p_booking.waitlist_offer_expires_at,'offer_version',p_booking.waitlist_offer_version,'url','/espacios/servicios/mis-reservas','channel','in_app');
 FOR recipient IN
  SELECT p_booking.customer_user_id user_id,'customer'::text kind WHERE p_booking.customer_user_id IS NOT NULL
  UNION ALL
  SELECT m.user_id,'operator' FROM public.organization_memberships m WHERE m.organization_id=p_booking.organization_id AND m.status='active'
   AND m.user_id IS DISTINCT FROM p_booking.customer_user_id AND public.workspace_role_permissions(m.role)&&ARRAY['content.manage','attendees.manage']
   AND (p_kind NOT IN('reminder_24h','reminder_2h') OR p_booking.customer_user_id IS NULL)
 LOOP
  INSERT INTO public.professional_notices(organization_id,booking_id,recipient_user_id,recipient_kind,demo_cohort_id,lifecycle_version,kind,title,body,payload,due_at,expires_at)
  VALUES(p_booking.organization_id,p_booking.id,recipient.user_id,recipient.kind,cohort,p_booking.lifecycle_version,p_kind,caption,message,
   data||jsonb_build_object('url',CASE WHEN recipient.kind='operator' THEN '/espacios/servicios?organization='||p_booking.organization_id ELSE '/espacios/servicios/mis-reservas' END),p_due,p_expires)
  ON CONFLICT(booking_id,lifecycle_version,kind,recipient_user_id) DO NOTHING;
 END LOOP;
END $$;

CREATE FUNCTION workspace_private.professional_lifecycle_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.lifecycle_version:=1;RETURN NEW;END IF;
 IF OLD.waitlist_offer_status='offered' AND NEW.status='cancelled' AND NEW.waitlist_offer_status='offered' THEN NEW.waitlist_offer_status:='declined';END IF;
 IF ROW(NEW.status,NEW.starts_at,NEW.ends_at,NEW.reschedule,NEW.waitlist_offer_status,NEW.waitlist_offer_expires_at,NEW.total_cents,NEW.price_snapshot,NEW.lifecycle_version)
 IS DISTINCT FROM ROW(OLD.status,OLD.starts_at,OLD.ends_at,OLD.reschedule,OLD.waitlist_offer_status,OLD.waitlist_offer_expires_at,OLD.total_cents,OLD.price_snapshot,OLD.lifecycle_version) THEN NEW.lifecycle_version:=OLD.lifecycle_version+1;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION workspace_private.professional_lifecycle_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE kind text;BEGIN
 IF TG_OP='UPDATE' AND NEW.lifecycle_version=OLD.lifecycle_version THEN RETURN NEW;END IF;
 UPDATE public.professional_notices SET state='cancelled',cancel_reason='booking_changed' WHERE booking_id=NEW.id AND lifecycle_version<>NEW.lifecycle_version AND (state='pending' OR (state='ready' AND read_at IS NULL));
 IF NEW.waitlist_offer_status='offered' THEN kind:='waitlist_offer';
 ELSIF NEW.status='cancelled' THEN kind:=CASE WHEN NEW.waitlist_offer_status='expired' THEN 'waitlist_expired' ELSE 'cancelled' END;
 ELSIF TG_OP='UPDATE' AND NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN kind:='rescheduled';
 ELSIF NEW.reschedule IS NOT NULL THEN kind:='reschedule_proposed';
 ELSIF NEW.status IN('requested','confirmed','waitlisted') THEN kind:=NEW.status;END IF;
 IF kind IS NOT NULL THEN PERFORM workspace_private.professional_queue_notice(NEW,kind,clock_timestamp(),CASE WHEN kind='waitlist_offer' THEN NEW.waitlist_offer_expires_at ELSE greatest(clock_timestamp(),NEW.starts_at)+interval '30 days' END);END IF;
 IF NEW.status='confirmed' THEN
  -- A late booking gets its confirmation immediately, without an additional overdue reminder.
  IF NEW.starts_at>clock_timestamp()+interval '24 hours' THEN PERFORM workspace_private.professional_queue_notice(NEW,'reminder_24h',NEW.starts_at-interval '24 hours',NEW.starts_at);END IF;
  IF NEW.starts_at>clock_timestamp()+interval '2 hours' THEN PERFORM workspace_private.professional_queue_notice(NEW,'reminder_2h',NEW.starts_at-interval '2 hours',NEW.starts_at);END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER professional_lifecycle_before BEFORE INSERT OR UPDATE ON public.professional_bookings FOR EACH ROW EXECUTE FUNCTION workspace_private.professional_lifecycle_before();
CREATE TRIGGER professional_lifecycle_after AFTER INSERT OR UPDATE ON public.professional_bookings FOR EACH ROW EXECUTE FUNCTION workspace_private.professional_lifecycle_after();

CREATE OR REPLACE FUNCTION workspace_private.professional_promote(p_session uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.professional_sessions;b public.professional_bookings;used integer;offer_end timestamptz;BEGIN
 SELECT * INTO x FROM public.professional_sessions WHERE id=p_session;IF NOT FOUND THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(x.organization_id::text,195));
 SELECT * INTO x FROM public.professional_sessions WHERE id=p_session FOR UPDATE;
 IF x.status<>'open' OR x.starts_at<=clock_timestamp()+interval '5 minutes' OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=x.organization_id AND status='active') THEN RETURN;END IF;
 IF NOT workspace_private.professional_slot(x.organization_id,x.starts_at,x.blocked_until,x.resource_ids,1,NULL,x.id) THEN RETURN;END IF;
 offer_end:=least(clock_timestamp()+interval '30 minutes',x.starts_at-interval '5 minutes');
 SELECT coalesce(sum(party_size),0) INTO used FROM public.professional_bookings WHERE session_id=x.id AND status IN('requested','confirmed','attended');
 FOR b IN SELECT w.* FROM public.professional_bookings w WHERE w.session_id=x.id AND w.status='waitlisted' AND w.party_size<=greatest(x.capacity-used,0)
  AND (w.bundle_id IS NULL OR EXISTS(SELECT 1 FROM public.professional_bundles z WHERE z.id=w.bundle_id AND z.remaining>(SELECT count(*) FROM public.professional_bookings held WHERE held.bundle_id=z.id AND held.status IN('requested','confirmed'))))
  ORDER BY w.created_at,w.id LIMIT 100 FOR UPDATE LOOP
  IF used+b.party_size>x.capacity THEN CONTINUE;END IF;
  IF b.bundle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.professional_bundles z WHERE id=b.bundle_id AND remaining>(SELECT count(*) FROM public.professional_bookings WHERE bundle_id=z.id AND status IN('requested','confirmed'))) THEN CONTINUE;END IF;
  IF b.deposit_cents>0 OR (b.customer_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=b.customer_user_id AND p.is_discarded IS NOT TRUE AND p.self_deleted IS NOT TRUE)) THEN CONTINUE;END IF;
  UPDATE public.professional_bookings SET status='requested',waitlist_offer_status='offered',waitlist_offer_expires_at=offer_end,waitlist_offer_version=waitlist_offer_version+1,updated_at=clock_timestamp() WHERE id=b.id;
  INSERT INTO public.professional_booking_history(organization_id,booking_id,actor_id,action,details) VALUES(x.organization_id,b.id,auth.uid(),'waitlist_offered',jsonb_build_object('expires_at',offer_end));used:=used+b.party_size;
 END LOOP;
END $$;

CREATE FUNCTION workspace_private.professional_expire_session(p_session uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.professional_sessions;b public.professional_bookings;expired integer:=0;BEGIN
 SELECT * INTO x FROM public.professional_sessions WHERE id=p_session;IF NOT FOUND THEN RETURN 0;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(x.organization_id::text,195));
 SELECT * INTO x FROM public.professional_sessions WHERE id=p_session FOR UPDATE;
 FOR b IN SELECT * FROM public.professional_bookings WHERE session_id=x.id AND ((waitlist_offer_status='offered' AND waitlist_offer_expires_at<=clock_timestamp()) OR (status='waitlisted' AND (x.starts_at<=clock_timestamp()+interval '5 minutes' OR x.status='cancelled'))) ORDER BY id LIMIT 100 FOR UPDATE LOOP
  UPDATE public.professional_bookings SET status='cancelled',waitlist_offer_status='expired',updated_at=clock_timestamp() WHERE id=b.id;
  INSERT INTO public.professional_booking_history(organization_id,booking_id,actor_id,action,details) VALUES(x.organization_id,b.id,auth.uid(),'waitlist_expired',jsonb_build_object('expired_at',clock_timestamp()));expired:=expired+1;
 END LOOP;
 PERFORM workspace_private.professional_promote(x.id);RETURN expired;
END $$;

-- Keep the preceding authorization/financial implementation, but expose only the wrapper.
ALTER FUNCTION public.professional_booking_action(uuid,uuid,text,jsonb) SET SCHEMA workspace_private;
ALTER FUNCTION workspace_private.professional_booking_action(uuid,uuid,text,jsonb) RENAME TO professional_booking_action_v1;
CREATE FUNCTION public.professional_booking_action(p_organization_id uuid,p_booking_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.professional_bookings;x public.professional_sessions;operator boolean;customer boolean;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort()) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 SELECT * INTO b FROM public.professional_bookings WHERE id=p_booking_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 operator:=public.has_organization_permission(p_organization_id,'content.manage') OR public.has_organization_permission(p_organization_id,'attendees.manage');customer:=b.customer_user_id IS NOT DISTINCT FROM auth.uid();
 IF NOT operator AND NOT customer THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>4000 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF b.waitlist_offer_status='offered' AND b.waitlist_offer_expires_at<=clock_timestamp() THEN
  PERFORM workspace_private.professional_expire_session(b.session_id);
  -- Return the persisted expired state: raising would roll back expiry and promotion.
  RETURN workspace_private.professional_booking_json(b.id);
 END IF;
 IF p_action IN('accept_waitlist','decline_waitlist') THEN
  IF NOT customer AND NOT(operator AND b.customer_user_id IS NULL) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
  IF (p_data->>'offer_version')::integer IS DISTINCT FROM b.waitlist_offer_version THEN RAISE EXCEPTION 'professional_waitlist_changed';END IF;
  IF (p_action='accept_waitlist' AND b.waitlist_offer_status='accepted') OR (p_action='decline_waitlist' AND b.waitlist_offer_status='declined') OR b.waitlist_offer_status='expired' THEN RETURN workspace_private.professional_booking_json(b.id);END IF;
  IF b.waitlist_offer_status<>'offered' OR b.status<>'requested' THEN RAISE EXCEPTION 'professional_booking_closed';END IF;
  IF p_action='decline_waitlist' THEN
   UPDATE public.professional_bookings SET status='cancelled',waitlist_offer_status='declined',updated_at=clock_timestamp() WHERE id=b.id;
   PERFORM workspace_private.professional_promote(b.session_id);
  ELSE
   IF (p_data->>'expected_total_cents')::integer IS DISTINCT FROM b.total_cents OR p_data->>'expected_terms' IS DISTINCT FROM b.price_snapshot->>'terms' THEN RAISE EXCEPTION 'professional_quote_changed';END IF;
   SELECT * INTO x FROM public.professional_sessions WHERE id=b.session_id FOR UPDATE;
   IF b.waitlist_offer_expires_at<=clock_timestamp() THEN PERFORM workspace_private.professional_expire_session(b.session_id);RETURN workspace_private.professional_booking_json(b.id);END IF;
   IF x.status<>'open' OR x.starts_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=b.organization_id AND status='active') OR NOT workspace_private.professional_slot(b.organization_id,x.starts_at,x.blocked_until,x.resource_ids,1,NULL,x.id)
    OR (SELECT coalesce(sum(party_size),0) FROM public.professional_bookings WHERE session_id=x.id AND status IN('requested','confirmed','attended'))>x.capacity THEN RAISE EXCEPTION 'professional_slot_unavailable';END IF;
   IF b.deposit_cents>0 AND b.deposit_status<>'paid' THEN RAISE EXCEPTION 'professional_payment_pending';END IF;
   IF b.bundle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.professional_bundles z WHERE id=b.bundle_id AND remaining>=(SELECT count(*) FROM public.professional_bookings WHERE bundle_id=z.id AND status IN('requested','confirmed'))) THEN RAISE EXCEPTION 'professional_bundle_empty';END IF;
   UPDATE public.professional_bookings SET status='confirmed',waitlist_offer_status='accepted',updated_at=clock_timestamp() WHERE id=b.id;
  END IF;
  INSERT INTO public.professional_booking_history(organization_id,booking_id,actor_id,action) VALUES(b.organization_id,b.id,auth.uid(),p_action);
  RETURN workspace_private.professional_booking_json(b.id);
 END IF;
 IF p_action='confirm' AND b.waitlist_offer_status='offered' THEN RAISE EXCEPTION 'professional_waitlist_acceptance_required';END IF;
 RETURN workspace_private.professional_booking_action_v1(p_organization_id,p_booking_id,p_action,p_data);
END $$;

ALTER FUNCTION public.professional_book(uuid,uuid,timestamptz,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid) SET SCHEMA workspace_private;
ALTER FUNCTION workspace_private.professional_book(uuid,uuid,timestamptz,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid) RENAME TO professional_book_v1;
CREATE FUNCTION public.professional_book(p_organization_id uuid,p_service_id uuid,p_starts_at timestamptz,p_session_id uuid DEFAULT NULL,p_resource_ids uuid[] DEFAULT '{}',p_party_size integer DEFAULT 1,p_customer_name text DEFAULT NULL,p_customer_contact text DEFAULT NULL,p_request_key text DEFAULT NULL,p_customer_id uuid DEFAULT NULL,p_bundle_id uuid DEFAULT NULL,p_expected_service_version integer DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_expected_terms text DEFAULT NULL,p_card_quote_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM workspace_private.professional_require(p_organization_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,195));
 IF p_session_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.professional_sessions WHERE id=p_session_id AND organization_id=p_organization_id) THEN PERFORM workspace_private.professional_expire_session(p_session_id);END IF;
 RETURN workspace_private.professional_book_v1(p_organization_id,p_service_id,p_starts_at,p_session_id,p_resource_ids,p_party_size,p_customer_name,p_customer_contact,p_request_key,p_customer_id,p_bundle_id,p_expected_service_version,p_expected_total_cents,p_expected_terms,p_card_quote_id);
END $$;

-- Progress belongs to the worker, not the business: advance it even when a
-- business lock is busy, so an unpromotable or locked UUID cannot monopolize a batch.
CREATE TABLE public.professional_lifecycle_cursors (
 scope_key text PRIMARY KEY,expiry_cursor uuid,promotion_cursor uuid,notice_cursor uuid,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.professional_lifecycle_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_lifecycle_cursors FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.professional_lifecycle_cursors TO service_role;

CREATE FUNCTION public.service_professional_expire_waitlist(p_limit integer DEFAULT 50,p_demo_cohort_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate record;locked uuid;processed integer:=0;expired integer:=0;examined integer:=0;lane integer;cursor_id uuid;scope text:='waitlist:'||coalesce(p_demo_cohort_id::text,'real');BEGIN
 PERFORM workspace_private.professional_lifecycle_service();IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('professional_waitlist:'||scope,196)) THEN RETURN jsonb_build_object('sessions_processed',0,'offers_expired',0,'limit',p_limit,'demo',p_demo_cohort_id IS NOT NULL,'busy',true);END IF;
 INSERT INTO public.professional_lifecycle_cursors(scope_key) VALUES(scope) ON CONFLICT DO NOTHING;
 -- Due expirations take priority even for suspended organizations. Promotion
 -- uses a separate circular cursor so failed availability/bundle checks are fair.
 FOR lane IN 1..2 LOOP
  SELECT CASE WHEN lane=1 THEN expiry_cursor ELSE promotion_cursor END INTO cursor_id FROM public.professional_lifecycle_cursors WHERE scope_key=scope;
  FOR candidate IN SELECT s.id,s.organization_id FROM public.professional_sessions s JOIN public.organizations o ON o.id=s.organization_id
   WHERE o.demo_cohort_id IS NOT DISTINCT FROM p_demo_cohort_id AND EXISTS(SELECT 1 FROM public.professional_bookings b WHERE b.session_id=s.id AND
    CASE WHEN lane=1 THEN (b.waitlist_offer_status='offered' AND b.waitlist_offer_expires_at<=clock_timestamp()) OR (b.status='waitlisted' AND (s.starts_at<=clock_timestamp()+interval '5 minutes' OR s.status='cancelled'))
    ELSE o.status='active' AND b.status='waitlisted' AND s.status='open' AND s.starts_at>clock_timestamp()+interval '5 minutes' AND b.party_size<=s.capacity-(SELECT coalesce(sum(held.party_size),0) FROM public.professional_bookings held WHERE held.session_id=s.id AND held.status IN('requested','confirmed','attended')) END)
   ORDER BY (cursor_id IS NULL OR s.id>cursor_id) DESC,s.id LIMIT greatest(p_limit*4-examined,0) LOOP
   cursor_id:=candidate.id;examined:=examined+1;
   -- Never hold a row lock while waiting for the organization's mutation lock.
   IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.organization_id::text,195)) THEN CONTINUE;END IF;
   SELECT id INTO locked FROM public.professional_sessions WHERE id=candidate.id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
   expired:=expired+workspace_private.professional_expire_session(candidate.id);processed:=processed+1;
   EXIT WHEN processed>=p_limit;
  END LOOP;
  UPDATE public.professional_lifecycle_cursors SET expiry_cursor=CASE WHEN lane=1 THEN cursor_id ELSE expiry_cursor END,promotion_cursor=CASE WHEN lane=2 THEN cursor_id ELSE promotion_cursor END,updated_at=clock_timestamp() WHERE scope_key=scope;
  EXIT WHEN processed>=p_limit OR examined>=p_limit*4;
 END LOOP;
 RETURN jsonb_build_object('sessions_processed',processed,'offers_expired',expired,'limit',p_limit,'demo',p_demo_cohort_id IS NOT NULL);
END $$;

CREATE FUNCTION public.service_professional_deliver_notices(p_limit integer DEFAULT 100,p_demo_cohort_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate record;n public.professional_notices;b public.professional_bookings;delivered integer:=0;cancelled integer:=0;cursor_id uuid;scope text:='notices:'||coalesce(p_demo_cohort_id::text,'real');BEGIN
 PERFORM workspace_private.professional_lifecycle_service();IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('professional_notice:'||scope,196)) THEN RETURN jsonb_build_object('delivered',0,'cancelled',0,'limit',p_limit,'channel','in_app','demo',p_demo_cohort_id IS NOT NULL,'busy',true);END IF;
 INSERT INTO public.professional_lifecycle_cursors(scope_key) VALUES(scope) ON CONFLICT DO NOTHING;
 SELECT notice_cursor INTO cursor_id FROM public.professional_lifecycle_cursors WHERE scope_key=scope;
 FOR candidate IN SELECT id,organization_id FROM public.professional_notices WHERE state='pending' AND due_at<=clock_timestamp() AND demo_cohort_id IS NOT DISTINCT FROM p_demo_cohort_id ORDER BY (cursor_id IS NULL OR id>cursor_id) DESC,id LIMIT p_limit*4 LOOP
  cursor_id:=candidate.id;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.organization_id::text,195)) THEN CONTINUE;END IF;
  SELECT * INTO n FROM public.professional_notices WHERE id=candidate.id AND state='pending' FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO b FROM public.professional_bookings WHERE id=n.booking_id;
  IF n.expires_at<=clock_timestamp() OR b.lifecycle_version IS DISTINCT FROM n.lifecycle_version OR NOT workspace_private.professional_notice_recipient(n) THEN
   UPDATE public.professional_notices SET state='cancelled',cancel_reason='stale_or_recipient_unavailable' WHERE id=n.id;cancelled:=cancelled+1;
  ELSE UPDATE public.professional_notices SET state='ready',ready_at=clock_timestamp() WHERE id=n.id;delivered:=delivered+1;END IF;
  EXIT WHEN delivered+cancelled>=p_limit;
 END LOOP;
 UPDATE public.professional_lifecycle_cursors SET notice_cursor=cursor_id,updated_at=clock_timestamp() WHERE scope_key=scope;
 RETURN jsonb_build_object('delivered',delivered,'cancelled',cancelled,'limit',p_limit,'channel','in_app','demo',p_demo_cohort_id IS NOT NULL);
END $$;

CREATE FUNCTION public.professional_list_notices(p_organization_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 50,p_unread_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE items jsonb;unread integer;cursor_time timestamptz;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 IF p_cursor IS NOT NULL THEN SELECT n.created_at INTO cursor_time FROM public.professional_notices n WHERE n.id=p_cursor AND n.recipient_user_id=auth.uid() AND n.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND (p_organization_id IS NULL OR n.organization_id=p_organization_id) AND workspace_private.professional_notice_recipient(n);IF NOT FOUND THEN RAISE EXCEPTION 'professional_forbidden';END IF;END IF;
 SELECT count(*)::integer INTO unread FROM public.professional_notices n WHERE n.recipient_user_id=auth.uid() AND n.state='ready' AND n.read_at IS NULL AND n.expires_at>clock_timestamp() AND n.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND (p_organization_id IS NULL OR n.organization_id=p_organization_id) AND workspace_private.professional_notice_recipient(n);
 SELECT coalesce(jsonb_agg(to_jsonb(x)-ARRAY['state','demo_cohort_id','cancel_reason'] ORDER BY x.created_at DESC,x.id DESC),'[]') INTO items FROM(SELECT n.* FROM public.professional_notices n WHERE n.recipient_user_id=auth.uid() AND n.state='ready' AND n.expires_at>clock_timestamp() AND n.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() AND (p_organization_id IS NULL OR n.organization_id=p_organization_id) AND (p_cursor IS NULL OR (n.created_at,n.id)<(cursor_time,p_cursor)) AND (NOT p_unread_only OR n.read_at IS NULL) AND workspace_private.professional_notice_recipient(n) ORDER BY n.created_at DESC,n.id DESC LIMIT p_limit+1) x;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>p_limit THEN items-p_limit ELSE items END,'next_cursor',CASE WHEN jsonb_array_length(items)>p_limit THEN items->(p_limit-1)->>'id' END,'unread_count',unread);
END $$;
CREATE FUNCTION public.professional_read_notice(p_notice_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE n public.professional_notices;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 SELECT * INTO n FROM public.professional_notices WHERE id=p_notice_id AND recipient_user_id=auth.uid() AND state='ready' AND demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort() FOR UPDATE;
 IF NOT FOUND OR NOT workspace_private.professional_notice_recipient(n) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 UPDATE public.professional_notices SET read_at=coalesce(read_at,clock_timestamp()) WHERE id=n.id;RETURN jsonb_build_object('id',n.id,'read',true);
END $$;

CREATE FUNCTION public.professional_get_booking(p_organization_id uuid,p_booking_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE b public.professional_bookings;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 SELECT b0.* INTO b FROM public.professional_bookings b0 JOIN public.organizations o ON o.id=b0.organization_id WHERE b0.organization_id=p_organization_id AND b0.id=p_booking_id AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort();
 IF NOT FOUND OR NOT(b.customer_user_id IS NOT DISTINCT FROM auth.uid() OR public.has_organization_permission(p_organization_id,'content.manage') OR public.has_organization_permission(p_organization_id,'attendees.manage') OR public.has_organization_permission(p_organization_id,'finance.read')) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 RETURN workspace_private.professional_booking_json(b.id);
END $$;

CREATE FUNCTION public.professional_list_customer_bundles(p_organization_id uuid,p_customer_id uuid DEFAULT NULL,p_service_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE items jsonb;client_user uuid;client_id uuid;BEGIN
 IF auth.uid() IS NULL OR NOT public.account_session_usable() THEN RAISE EXCEPTION 'auth_required';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'professional_invalid_input';END IF;
 SELECT c.user_id,c.id INTO client_user,client_id FROM public.professional_customers c JOIN public.organizations o ON o.id=c.organization_id WHERE c.organization_id=p_organization_id AND (CASE WHEN p_customer_id IS NULL THEN c.user_id=auth.uid() ELSE c.id=p_customer_id END) AND o.demo_cohort_id IS NOT DISTINCT FROM public.current_demo_cohort();
 IF NOT FOUND AND p_customer_id IS NULL THEN RETURN jsonb_build_object('items','[]'::jsonb,'next_cursor',NULL);END IF;
 IF NOT FOUND OR NOT(client_user IS NOT DISTINCT FROM auth.uid() OR public.has_organization_permission(p_organization_id,'content.manage') OR public.has_organization_permission(p_organization_id,'attendees.manage') OR public.has_organization_permission(p_organization_id,'finance.read')) THEN RAISE EXCEPTION 'professional_forbidden';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO items FROM(SELECT z.id,z.organization_id,z.customer_id,z.service_id,z.label,z.remaining,z.granted FROM public.professional_bundles z WHERE z.organization_id=p_organization_id AND z.customer_id=client_id AND (p_service_id IS NULL OR z.service_id=p_service_id) AND (p_cursor IS NULL OR z.id>p_cursor) ORDER BY z.id LIMIT p_limit+1) x;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>p_limit THEN items-p_limit ELSE items END,'next_cursor',CASE WHEN jsonb_array_length(items)>p_limit THEN items->(p_limit-1)->>'id' END);
END $$;

-- Existing offered places receive a visible deadline; regular pending requests are unchanged.
UPDATE public.professional_bookings b SET waitlist_offer_status='offered',waitlist_offer_expires_at=least(clock_timestamp()+interval '30 minutes',b.starts_at-interval '5 minutes'),waitlist_offer_version=1
WHERE b.status='requested' AND b.session_id IS NOT NULL AND b.starts_at>clock_timestamp()+interval '5 minutes' AND EXISTS(SELECT 1 FROM public.professional_booking_history h WHERE h.booking_id=b.id AND h.action='waitlist_offered');
UPDATE public.professional_bookings b SET status='cancelled',waitlist_offer_status='expired' WHERE b.status='requested' AND b.session_id IS NOT NULL AND b.starts_at<=clock_timestamp()+interval '5 minutes' AND EXISTS(SELECT 1 FROM public.professional_booking_history h WHERE h.booking_id=b.id AND h.action='waitlist_offered');
UPDATE public.professional_bookings SET lifecycle_version=1 WHERE lifecycle_version=0 AND starts_at>clock_timestamp() AND status IN('requested','confirmed','waitlisted');

DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='workspace_private' AND p.proname LIKE 'professional_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('professional_book','professional_booking_action','professional_list_notices','professional_read_notice','professional_get_booking','professional_list_customer_bundles') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('service_professional_expire_waitlist','service_professional_deliver_notices') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);END LOOP;
END $$;
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF strpos(definition,'''/rpc/professional_list_notices''')=0 THEN
  IF strpos(definition,'''/rpc/current_demo_cohort''')=0 THEN RAISE EXCEPTION 'demo_allowlist_anchor_missing';END IF;
  EXECUTE replace(definition,'''/rpc/current_demo_cohort''','''/rpc/current_demo_cohort'',''/rpc/professional_list_notices'',''/rpc/professional_read_notice'',''/rpc/professional_get_booking'',''/rpc/professional_list_customer_bundles''');
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
