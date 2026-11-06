-- Extend existing irreversible requests; create no new deletion request.
-- Shared organizations, their contracts, invoice periods and ledger amounts survive.
-- The erased_at tombstone is necessary because Auth later SET NULLs customer.user_id.
ALTER TABLE public.professional_customers ADD COLUMN erased_at timestamptz;
ALTER TABLE public.professional_bookings ADD COLUMN erased_request_key_hash text;
ALTER TABLE public.professional_bundle_ledger ADD COLUMN erased_request_key_hash text;
CREATE INDEX professional_customers_account ON public.professional_customers(user_id)
 WHERE user_id IS NOT NULL;
CREATE INDEX professional_bookings_creator ON public.professional_bookings(created_by)
 WHERE created_by IS NOT NULL;

CREATE FUNCTION workspace_private.professional_erased_user(p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_user IS NULL THEN RETURN false; END IF;
 -- Same lock as request_account_erasure. A late service write waits and then
 -- observes the committed deletion, rather than restoring a stale snapshot.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,912003));
 RETURN EXISTS(SELECT 1 FROM account_private.erasures WHERE user_id=p_user);
END $$;

CREATE FUNCTION workspace_private.professional_erased_customer(p_customer uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c public.professional_customers;
BEGIN
 SELECT * INTO c FROM public.professional_customers WHERE id=p_customer;
 RETURN c.erased_at IS NOT NULL OR workspace_private.professional_erased_user(c.user_id);
END $$;

-- Opaque request references may have contained caller supplied text. Preserve a
-- deterministic digest so a replay cannot award a second bundle after redaction.
CREATE FUNCTION workspace_private.professional_erased_key(p_key text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT encode(extensions.digest(p_key,'sha256'),'hex')
$$;

CREATE FUNCTION workspace_private.professional_erasure_write_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE erased boolean; customer uuid; creator_erased boolean:=false; original_erased boolean:=false;
BEGIN
 IF TG_TABLE_NAME='professional_customers' THEN
  erased:=workspace_private.professional_erased_user(NEW.user_id);
  IF TG_OP='UPDATE' THEN
   erased:=erased OR OLD.erased_at IS NOT NULL OR workspace_private.professional_erased_user(OLD.user_id);
   -- Auth's ON DELETE SET NULL must remain possible; a tombstone can never be
   -- reassigned to a different live account.
   IF erased AND NEW.user_id IS NOT NULL THEN NEW.user_id:=OLD.user_id; END IF;
  END IF;
  IF erased THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'professional_customer_erased' USING ERRCODE='42501'; END IF;
   NEW.display_name:='Cuenta eliminada';NEW.contact:=NULL;
   NEW.erased_at:=coalesce(OLD.erased_at,clock_timestamp());
  ELSIF NEW.erased_at IS NOT NULL THEN
   RAISE EXCEPTION 'professional_erasure_not_requested' USING ERRCODE='42501';
  END IF;
 ELSIF TG_TABLE_NAME='professional_bookings' THEN
  erased:=workspace_private.professional_erased_customer(NEW.customer_id)
   OR workspace_private.professional_erased_user(NEW.customer_user_id);
  creator_erased:=workspace_private.professional_erased_user(NEW.created_by);
  IF TG_OP='UPDATE' THEN
   original_erased:=workspace_private.professional_erased_customer(OLD.customer_id);
   erased:=erased OR original_erased;
   -- A deleted employee can have booked for a different customer. Only the
   -- employee's opaque request reference is personal in that shared record.
   creator_erased:=creator_erased OR OLD.erased_request_key_hash IS NOT NULL
    OR workspace_private.professional_erased_user(OLD.created_by);
   IF original_erased THEN NEW.customer_id:=OLD.customer_id;END IF;
  END IF;
  IF erased THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'professional_customer_erased' USING ERRCODE='42501';END IF;
   NEW.customer_user_id:=NULL;NEW.reschedule:=NULL;
   IF NEW.status IN('requested','confirmed','waitlisted') THEN NEW.status:='cancelled';END IF;
   IF NEW.waitlist_offer_status='offered' THEN NEW.waitlist_offer_status:='declined';END IF;
   NEW.waitlist_offer_expires_at:=NULL;
   -- Canonical commercial terms and prices come from the shared catalogue;
   -- discard any non-contract personal extension copied into the JSON snapshot.
   SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO NEW.price_snapshot
   FROM jsonb_each(NEW.price_snapshot) WHERE key=ANY(ARRAY['service_name','menu','terms','version','unit_cents','price_basis','card']);
   IF jsonb_typeof(NEW.price_snapshot->'card')='object' THEN
    NEW.price_snapshot:=jsonb_set(NEW.price_snapshot,'{card}',
     (SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(NEW.price_snapshot->'card')
      WHERE key=ANY(ARRAY['quote_id','gross_cents','discount_cents','incremental_savings_cents','final_cents','protected_until','offer_id','offer_version','percent','currency'])));
   END IF;
  END IF;
  -- Keep customer cancellation separate from creator redaction: deleting a
  -- staff member must not cancel or rewrite an independent guest's booking.
  IF erased OR creator_erased THEN
   IF TG_OP='UPDATE' AND OLD.erased_request_key_hash IS NOT NULL THEN
    NEW.erased_request_key_hash:=OLD.erased_request_key_hash;NEW.request_key:=OLD.request_key;
   ELSE
    NEW.erased_request_key_hash:=workspace_private.professional_erased_key(
     CASE WHEN TG_OP='UPDATE' THEN OLD.request_key ELSE NEW.request_key END);
    NEW.request_key:='erased:'||gen_random_uuid()::text;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='professional_bundles' THEN
  erased:=workspace_private.professional_erased_customer(NEW.customer_id);
  IF TG_OP='UPDATE' THEN
   original_erased:=workspace_private.professional_erased_customer(OLD.customer_id);
   erased:=erased OR original_erased;
   IF original_erased THEN NEW.customer_id:=OLD.customer_id;END IF;
  END IF;
  IF erased THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'professional_customer_erased' USING ERRCODE='42501';END IF;
   NEW.label:='Bono de cuenta eliminada';
  END IF;
 ELSIF TG_TABLE_NAME='professional_bundle_ledger' THEN
  SELECT customer_id INTO customer FROM public.professional_bundles WHERE id=NEW.bundle_id;
  IF workspace_private.professional_erased_customer(customer) OR workspace_private.professional_erased_user(NEW.actor_id) THEN
   NEW.reason:='Dato personal eliminado';
   IF TG_OP='UPDATE' AND OLD.erased_request_key_hash IS NOT NULL THEN
    NEW.erased_request_key_hash:=OLD.erased_request_key_hash;NEW.request_key:=OLD.request_key;
   ELSE
    NEW.erased_request_key_hash:=workspace_private.professional_erased_key(NEW.request_key);
    NEW.request_key:='erased:'||gen_random_uuid()::text;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='professional_booking_history' THEN
  SELECT customer_id INTO customer FROM public.professional_bookings WHERE id=NEW.booking_id;
  IF workspace_private.professional_erased_customer(customer) OR workspace_private.professional_erased_user(NEW.actor_id) THEN
   NEW.details:='{}';
  END IF;
 ELSIF TG_TABLE_NAME='professional_write_requests' THEN
  IF workspace_private.professional_erased_user(NEW.actor_id) THEN RETURN NULL;END IF;
 ELSIF TG_TABLE_NAME='professional_notices' THEN
  SELECT customer_id INTO customer FROM public.professional_bookings WHERE id=NEW.booking_id;
  IF workspace_private.professional_erased_user(NEW.recipient_user_id)
    OR workspace_private.professional_erased_customer(customer) THEN RETURN NULL;END IF;
 END IF;
 RETURN NEW;
END $$;

DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['professional_customers','professional_bookings','professional_bundles','professional_bundle_ledger','professional_booking_history','professional_write_requests','professional_notices'] LOOP
  -- User writes and background writes both obey the durable erasure boundary.
  EXECUTE format('CREATE TRIGGER aaa_professional_erasure_actor BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION account_private.guard_actor()',t);
  EXECUTE format('CREATE TRIGGER aab_professional_erasure_subject BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION workspace_private.professional_erasure_write_guard()',t);
 END LOOP;
END $$;

CREATE FUNCTION workspace_private.professional_scrub_erasure() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid;session uuid;
BEGIN
 -- Trigger-only entrypoint: the existing request RPC authenticates the user in
 -- the API and permits only service_role execution. Its BEFORE owner guard must
 -- succeed first, so no shared organization loses its responsible owner.
 FOR org IN
  SELECT DISTINCT organization_id FROM (
   SELECT organization_id FROM public.professional_customers WHERE user_id=NEW.user_id
   UNION ALL SELECT organization_id FROM public.professional_bookings WHERE created_by=NEW.user_id
  ) owned ORDER BY organization_id
 LOOP PERFORM pg_advisory_xact_lock(hashtextextended(org::text,195));END LOOP;
 UPDATE public.professional_customers SET display_name='Cuenta eliminada',contact=NULL
 WHERE user_id=NEW.user_id;
 UPDATE public.professional_bookings b SET customer_user_id=NULL,reschedule=NULL,updated_at=clock_timestamp()
 WHERE b.customer_user_id=NEW.user_id OR EXISTS(SELECT 1 FROM public.professional_customers c WHERE c.id=b.customer_id AND c.user_id=NEW.user_id);
 -- Trigger redacts only the creator's request reference for an independent
 -- customer. No cancellation, guest contact update or lifecycle notification.
 UPDATE public.professional_bookings SET request_key=request_key WHERE created_by=NEW.user_id;
 UPDATE public.professional_bundles z SET label='Bono de cuenta eliminada'
 WHERE EXISTS(SELECT 1 FROM public.professional_customers c WHERE c.id=z.customer_id AND c.user_id=NEW.user_id);
 UPDATE public.professional_bundle_ledger l SET reason='Dato personal eliminado'
 WHERE actor_id=NEW.user_id OR EXISTS(SELECT 1 FROM public.professional_bundles z JOIN public.professional_customers c ON c.id=z.customer_id WHERE z.id=l.bundle_id AND c.user_id=NEW.user_id);
 UPDATE public.professional_booking_history h SET details='{}'
 WHERE actor_id=NEW.user_id OR EXISTS(SELECT 1 FROM public.professional_bookings b JOIN public.professional_customers c ON c.id=b.customer_id WHERE b.id=h.booking_id AND c.user_id=NEW.user_id);
 DELETE FROM public.professional_write_requests WHERE actor_id=NEW.user_id;
 DELETE FROM public.professional_notices n WHERE recipient_user_id=NEW.user_id
  OR EXISTS(SELECT 1 FROM public.professional_bookings b JOIN public.professional_customers c ON c.id=b.customer_id WHERE b.id=n.booking_id AND c.user_id=NEW.user_id);
 INSERT INTO public.professional_booking_history(organization_id,booking_id,action)
 SELECT b.organization_id,b.id,'account_erasure' FROM public.professional_bookings b
 JOIN public.professional_customers c ON c.id=b.customer_id WHERE c.user_id=NEW.user_id
 AND NOT EXISTS(SELECT 1 FROM public.professional_booking_history h WHERE h.booking_id=b.id AND h.action='account_erasure');
 -- Release cancelled seats fairly with the existing explicit-offer mechanism.
 FOR session IN SELECT DISTINCT b.session_id FROM public.professional_bookings b
 JOIN public.professional_customers c ON c.id=b.customer_id WHERE c.user_id=NEW.user_id AND b.session_id IS NOT NULL ORDER BY b.session_id
 LOOP PERFORM workspace_private.professional_promote(session);END LOOP;
 -- Organization billing is a contract with the organization, not this actor's
 -- personal subscription. Retain legal entity, accepted terms, invoice amounts
 -- and pseudonymous actor references. Do not cancel or transfer its Stripe account.
 RETURN NEW;
END $$;
CREATE TRIGGER professional_private_erasure AFTER INSERT OR UPDATE OF state ON account_private.erasures
FOR EACH ROW EXECUTE FUNCTION workspace_private.professional_scrub_erasure();

-- Resume already explicitly requested deletions too. A retry of request itself
-- returns the existing job, so relying only on a new INSERT would miss these.
UPDATE account_private.erasures SET state=state;

-- Replays of digested references retain economic idempotency. Editing a previous
-- migration is deliberately avoided; fail closed if the expected body changed.
DO $$DECLARE signature text;body text;needle text:='AND request_key=p_request_key';BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'workspace_private.professional_book_v1(uuid,uuid,timestamp with time zone,uuid,uuid[],integer,text,text,text,uuid,uuid,integer,integer,text,uuid)',
  'public.professional_grant_bundle(uuid,uuid,uuid,integer,text,text,text)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO body;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'professional_erasure_idempotency_contract_changed';END IF;
  body:=replace(body,needle,'AND (request_key=p_request_key OR erased_request_key_hash=workspace_private.professional_erased_key(p_request_key))');
  EXECUTE body;
 END LOOP;
END $$;

DO $$DECLARE body text;needle text:='to_jsonb(b)-''request_hash''-''request_key''-''created_by''';BEGIN
 SELECT pg_get_functiondef('workspace_private.professional_booking_json(uuid)'::regprocedure) INTO body;
 IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'professional_erasure_json_contract_changed';END IF;
 EXECUTE replace(body,needle,needle||'-''erased_request_key_hash''');
END $$;

REVOKE ALL ON FUNCTION workspace_private.professional_erased_user(uuid),workspace_private.professional_erased_customer(uuid),
 workspace_private.professional_erased_key(text),workspace_private.professional_erasure_write_guard(),workspace_private.professional_scrub_erasure()
 FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON COLUMN public.professional_customers.erased_at IS 'Irreversible account erasure tombstone; keeps economic parent IDs but blocks contact/name restoration after Auth removes its FK.';
NOTIFY pgrst,'reload schema';
