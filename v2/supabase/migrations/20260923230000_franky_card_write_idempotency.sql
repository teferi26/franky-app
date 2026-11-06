-- Optional command keys preserve compatibility with old clients, while new clients
-- can safely retry a lost save response without creating another venue/version/program.
CREATE TABLE public.franky_card_write_requests (
 actor_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('venue','offer','program')),request_key uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),fingerprint text NOT NULL,result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,operation,request_key)
);
ALTER TABLE public.franky_card_write_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.franky_card_write_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.franky_card_write_requests TO service_role;
CREATE TRIGGER franky_card_write_immutable BEFORE UPDATE OR DELETE ON public.franky_card_write_requests FOR EACH ROW EXECUTE FUNCTION card_private.immutable();

CREATE FUNCTION card_private.begin_write(p_operation text,p_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row public.franky_card_write_requests;fingerprint text;BEGIN
 IF p_key IS NULL THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation||':'||p_key::text,743));
 fingerprint:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 SELECT * INTO row FROM public.franky_card_write_requests WHERE actor_id=auth.uid() AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN IF row.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'card_request_conflict';END IF;RETURN row.result;END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION card_private.finish_write(p_operation text,p_key uuid,p_organization_id uuid,p_payload jsonb,p_result jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF p_key IS NULL THEN RETURN;END IF;
 INSERT INTO public.franky_card_write_requests(actor_id,operation,request_key,organization_id,fingerprint,result)
 VALUES(auth.uid(),p_operation,p_key,p_organization_id,encode(extensions.digest(p_payload::text,'sha256'),'hex'),p_result);
END $$;

ALTER FUNCTION public.save_franky_card_venue(uuid,uuid,jsonb) SET SCHEMA card_private;
ALTER FUNCTION card_private.save_franky_card_venue(uuid,uuid,jsonb) RENAME TO save_venue_before_write_keys;
CREATE FUNCTION public.save_franky_card_venue(p_organization_id uuid,p_venue_id uuid,p_data jsonb,p_request_key uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=card_private.require_user();org public.organizations;payload jsonb;result jsonb;BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16384 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 SELECT * INTO org FROM public.organizations WHERE id=p_organization_id;
 IF org.id IS NULL OR org.demo_cohort_id IS DISTINCT FROM public.current_demo_cohort() OR NOT public.has_organization_permission(p_organization_id,'settings.manage') THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 IF p_venue_id IS NOT NULL THEN PERFORM card_private.require_merchant(p_venue_id,'settings.manage');END IF;
 payload:=jsonb_build_array(p_organization_id,p_venue_id,p_data);
 result:=card_private.begin_write('venue',p_request_key,payload);
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.franky_card_venues WHERE id=(result->>'id')::uuid AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'card_forbidden';END IF;
  PERFORM card_private.require_merchant((result->>'id')::uuid,'settings.manage');RETURN result;
 END IF;
 result:=card_private.save_venue_before_write_keys(p_organization_id,p_venue_id,p_data);
 PERFORM card_private.finish_write('venue',p_request_key,p_organization_id,payload,result);RETURN result;
END $$;

ALTER FUNCTION public.save_franky_card_offer(uuid,jsonb) SET SCHEMA card_private;
ALTER FUNCTION card_private.save_franky_card_offer(uuid,jsonb) RENAME TO save_offer_before_write_keys;
CREATE FUNCTION public.save_franky_card_offer(p_venue_id uuid,p_data jsonb,p_request_key uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.franky_card_venues:=card_private.require_merchant(p_venue_id,'settings.manage');payload jsonb;result jsonb;BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16384 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 payload:=jsonb_build_array(p_venue_id,p_data);result:=card_private.begin_write('offer',p_request_key,payload);
 IF result IS NOT NULL THEN
  PERFORM card_private.require_merchant(p_venue_id,'settings.manage');
  IF NOT EXISTS(SELECT 1 FROM public.franky_card_offers WHERE id=(result->>'id')::uuid AND venue_id=p_venue_id) THEN RAISE EXCEPTION 'card_forbidden';END IF;RETURN result;
 END IF;
 result:=card_private.save_offer_before_write_keys(p_venue_id,p_data);
 PERFORM card_private.finish_write('offer',p_request_key,v.organization_id,payload,result);RETURN result;
END $$;

ALTER FUNCTION public.save_franky_card_program(uuid,jsonb) SET SCHEMA card_private;
ALTER FUNCTION card_private.save_franky_card_program(uuid,jsonb) RENAME TO save_program_before_write_keys;
CREATE FUNCTION public.save_franky_card_program(p_venue_id uuid,p_data jsonb,p_request_key uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.franky_card_venues:=card_private.require_merchant(p_venue_id,'settings.manage');payload jsonb;result jsonb;BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16384 THEN RAISE EXCEPTION 'card_invalid_input';END IF;
 payload:=jsonb_build_array(p_venue_id,p_data);result:=card_private.begin_write('program',p_request_key,payload);
 IF result IS NOT NULL THEN
  PERFORM card_private.require_merchant(p_venue_id,'settings.manage');
  IF NOT EXISTS(SELECT 1 FROM public.franky_card_programs WHERE id=(result->>'id')::uuid AND venue_id=p_venue_id) THEN RAISE EXCEPTION 'card_forbidden';END IF;RETURN result;
 END IF;
 result:=card_private.save_program_before_write_keys(p_venue_id,p_data);
 PERFORM card_private.finish_write('program',p_request_key,v.organization_id,payload,result);RETURN result;
END $$;

REVOKE ALL ON FUNCTION card_private.begin_write(text,uuid,jsonb),card_private.finish_write(text,uuid,uuid,jsonb,jsonb),card_private.save_venue_before_write_keys(uuid,uuid,jsonb),card_private.save_offer_before_write_keys(uuid,jsonb),card_private.save_program_before_write_keys(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_franky_card_venue(uuid,uuid,jsonb,uuid),public.save_franky_card_offer(uuid,jsonb,uuid),public.save_franky_card_program(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_franky_card_venue(uuid,uuid,jsonb,uuid),public.save_franky_card_offer(uuid,jsonb,uuid),public.save_franky_card_program(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
