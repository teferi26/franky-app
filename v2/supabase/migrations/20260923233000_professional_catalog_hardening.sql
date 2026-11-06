-- Preserve the existing catalog RPC, grants, idempotency and limits. An inactive
-- historical service may retain its own archived resources; activation may not.
DO $migration$
DECLARE original text;definition text;needle text;replacement text;BEGIN
 SELECT pg_get_functiondef('public.professional_save_record(uuid,text,uuid,jsonb)'::regprocedure) INTO original;
 needle:='IF cardinality(v_resources)<>(SELECT count(*) FROM public.professional_resources WHERE organization_id=p_organization_id AND active AND id=ANY(v_resources)) THEN RAISE EXCEPTION ''professional_resource_required'';END IF;';
 replacement:='IF cardinality(v_resources)<>(SELECT count(*) FROM public.professional_resources WHERE organization_id=p_organization_id AND (active OR NOT coalesce((p_data->>''active'')::boolean,s.active,true)) AND id=ANY(v_resources)) THEN RAISE EXCEPTION ''professional_resource_required'';END IF;';
 IF strpos(original,needle)=0 THEN RAISE EXCEPTION 'professional_catalog_definition_changed';END IF;
 definition:=replace(original,needle,replacement);
 needle:='INSERT INTO public.professional_resources(id,organization_id,name,kind,capacity,active)';
 replacement:='IF p_record_id IS NOT NULL AND NOT coalesce((p_data->>''active'')::boolean,r.active,true) AND EXISTS(SELECT 1 FROM public.professional_services linked WHERE linked.organization_id=p_organization_id AND linked.active AND v_id=ANY(linked.required_resource_ids)) THEN RAISE EXCEPTION ''professional_resource_in_use'';END IF;
   INSERT INTO public.professional_resources(id,organization_id,name,kind,capacity,active)';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'professional_catalog_definition_changed';END IF;
 EXECUTE replace(definition,needle,replacement);
END;
$migration$;
NOTIFY pgrst,'reload schema';
