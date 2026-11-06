-- Demo-only presentation and sample benefits. Does not approve a real merchant,
-- enable sales, change public statistics or issue a provider payment.
CREATE TABLE card_private.demo_seed_versions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 category text NOT NULL, venue_id uuid NOT NULL REFERENCES public.franky_card_venues(id) ON DELETE RESTRICT,
 offer_id uuid NOT NULL REFERENCES public.franky_card_offers(id) ON DELETE RESTRICT,
 program_id uuid NOT NULL REFERENCES public.franky_card_programs(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE card_private.demo_seed_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON card_private.demo_seed_versions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.service_seed_franky_card_demo(p_user_id uuid,p_category text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cohort uuid;org uuid;kind text;chosen_category text;configured_category text;venue uuid;offer uuid;program uuid;
 record card_private.demo_seed_versions;label text;service_key text;service_label text;amount integer;
BEGIN
 PERFORM card_private.require_service();
 PERFORM pg_advisory_xact_lock(hashtextextended('demo-seed:'||p_user_id::text,742));
 SELECT d.cohort_id,o.id,o.kind INTO cohort,org,kind
 FROM public.workspace_demo_accounts d
 JOIN public.workspace_demo_scenarios ds ON ds.user_id=d.user_id AND ds.revoked_at IS NULL
 -- Older service-provisioned demos can lack the later Auth marker. The
 -- authoritative server-owned registry and scenario remain mandatory; a
 -- contradictory marker always rejects the identity.
 JOIN auth.users u ON u.id=d.user_id AND (u.raw_app_meta_data->>'workspace_demo_scenario' IS NULL OR u.raw_app_meta_data->>'workspace_demo_scenario'=ds.scenario)
 JOIN public.profiles p ON p.id=d.user_id AND p.role IS DISTINCT FROM 'admin' AND p.is_discarded IS NOT TRUE AND p.self_deleted IS NOT TRUE
 JOIN public.organizations o ON o.id=ds.organization_id AND o.demo_cohort_id=d.cohort_id AND o.status='active'
 JOIN public.organization_memberships m ON m.organization_id=o.id AND m.user_id=d.user_id AND m.role='owner' AND m.status='active'
 WHERE d.user_id=p_user_id AND d.cohort_id IS NOT NULL AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
 FOR UPDATE OF d,o;
 IF cohort IS NULL THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 SELECT s.category INTO configured_category FROM public.professional_settings s WHERE s.organization_id=org;
 chosen_category:=coalesce(p_category,configured_category,'demo');
 IF chosen_category NOT IN('demo','hairdresser','beauty','cafe','bar','restaurant','pub','nightclub','sports','sports_facility','academy','culture','coworking')
 OR(chosen_category<>'demo' AND kind NOT IN('leisure','community')) OR(configured_category IS NOT NULL AND configured_category<>chosen_category) THEN RAISE EXCEPTION 'card_demo_category_mismatch';END IF;
 SELECT x.label,x.service_key,x.service_label,x.amount INTO label,service_key,service_label,amount FROM (VALUES
  ('demo','Comercio ficticio','demo_service','Servicio ficticio',2000),
  ('hairdresser','Peluquería ficticia','cut','Corte y peinado ficticio',2000),
  ('beauty','Centro de estética ficticio','manicure','Manicura ficticia',2400),
  ('cafe','Cafetería ficticia','breakfast','Desayuno ficticio',600),
  ('bar','Bar ficticio','tapa_soft_drink','Tapa y bebida sin alcohol ficticias',1000),
  ('restaurant','Restaurante ficticio','menu','Menú ficticio',2000),
  ('pub','Pub ficticio','mocktail','Bebida sin alcohol ficticia',800),
  ('nightclub','Discoteca ficticia','entry_no_drink','Entrada ficticia sin consumición',1200),
  ('sports','Gimnasio ficticio','training','Clase de entrenamiento ficticia',800),
  ('sports_facility','Instalación deportiva ficticia','court','Reserva de pista ficticia',1800),
  ('academy','Academia ficticia','lesson','Clase de conversación ficticia',1200),
  ('culture','Taller cultural ficticio','workshop','Taller creativo ficticio',1000),
  ('coworking','Coworking ficticio','desk','Puesto de trabajo ficticio',800)
 )x(category,label,service_key,service_label,amount) WHERE x.category=chosen_category;
 IF EXISTS(SELECT 1 FROM public.franky_card_profiles WHERE user_id=p_user_id AND demo_cohort_id IS DISTINCT FROM cohort)
 OR EXISTS(SELECT 1 FROM public.franky_card_memberships WHERE user_id=p_user_id AND demo_cohort_id IS DISTINCT FROM cohort) THEN RAISE EXCEPTION 'card_forbidden' USING ERRCODE='42501';END IF;
 INSERT INTO public.franky_card_profiles(user_id,full_name,demo_cohort_id) VALUES(p_user_id,'Titular ficticio de demostración',cohort) ON CONFLICT(user_id) DO NOTHING;
 INSERT INTO public.franky_card_memberships(user_id,starts_at,ends_at,demo_cohort_id) VALUES(p_user_id,now(),now()+interval '12 months',cohort) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO record FROM card_private.demo_seed_versions WHERE user_id=p_user_id;
 IF FOUND THEN
  IF record.category<>chosen_category OR record.organization_id<>org OR NOT EXISTS(SELECT 1 FROM public.franky_card_venues v WHERE v.id=record.venue_id AND v.organization_id=org AND v.demo_cohort_id=cohort) THEN RAISE EXCEPTION 'card_demo_category_mismatch';END IF;
  venue:=record.venue_id;offer:=record.offer_id;program:=record.program_id;
 ELSE
  -- Existing demo benefits are preserved, including their ledger and protected
  -- conditions. No existing pending submission is silently approved.
  -- Name only the untouched initial leisure space; do not overwrite a tester's
  -- edits or rename community, housing or university organizations.
  UPDATE public.organizations o SET name=label||' · demo',updated_at=now()
  WHERE o.id=org AND o.demo_cohort_id=cohort AND o.kind='leisure' AND o.name='Café Campus · demo';
  INSERT INTO public.franky_card_venues(organization_id,name,city,category,address,status,agreement_version,agreement_accepted_by,demo_cohort_id)
  VALUES(org,label||' · demo','Ciudad de demostración',chosen_category,'Dirección ficticia; ningún comercio real','active',(SELECT agreement_version FROM public.franky_card_settings),p_user_id,cohort) RETURNING id INTO venue;
  INSERT INTO public.franky_card_offers(venue_id,version,title,kind,percent,service_keys,terms,status)
  VALUES(venue,1,'10 % · '||service_label||' · demo','base',10,ARRAY[service_key],'Simulación privada sin compra ni derecho frente a un comercio real. Sin descuentos en alcohol.','active') RETURNING id INTO offer;
  INSERT INTO public.franky_card_programs(venue_id,version,title,service_keys,required_stamps,reward_service_key,reward_label,reward_max_cents,terms)
  VALUES(venue,1,'Cinco visitas y una ventaja gratis · demo',ARRAY[service_key],5,service_key,service_label,amount,'Un sello por consumo ficticio confirmado. Al reunir cinco, una unidad del servicio de ejemplo. No incluye alcohol ni una ventaja real.') RETURNING id INTO program;
  INSERT INTO card_private.demo_seed_versions(user_id,organization_id,category,venue_id,offer_id,program_id) VALUES(p_user_id,org,chosen_category,venue,offer,program);
  INSERT INTO public.franky_card_audit(action,target_id,data) VALUES('demo_category_seeded',p_user_id,jsonb_build_object('demo',true,'category',chosen_category,'organization_id',org));
 END IF;
 RETURN jsonb_build_object('ok',true,'demo',true,'category',chosen_category,'venue_id',venue,'offer_id',offer,'program_id',program,'discount_percent',10,'required_stamps',5,'demo_line',jsonb_build_object('service_key',service_key,'label',service_label,'gross_cents',amount));
END$$;
REVOKE ALL ON FUNCTION public.service_seed_franky_card_demo(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_seed_franky_card_demo(uuid,text) TO service_role;

-- Preserve callers using the original signature without a default-argument
-- overload, which would make PostgREST resolution ambiguous.
CREATE OR REPLACE FUNCTION public.service_seed_franky_card_demo(p_user_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.service_seed_franky_card_demo(p_user_id,NULL)
$$;
REVOKE ALL ON FUNCTION public.service_seed_franky_card_demo(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_seed_franky_card_demo(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
