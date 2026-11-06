-- Client-owned preferences remain writable. Authority, verification, billing and
-- moderation fields are controlled by verified RPCs and server credentials.
-- INVOKER is essential: a direct Data API write runs as authenticated; an
-- authorised SECURITY DEFINER operation retains its effective database owner.
CREATE OR REPLACE FUNCTION public.guard_profile_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
  v_key text;
  v_managed text[] := ARRAY['id','email','role','created_at','is_premium',
    'can_view_student_profiles','stripe_customer_id','email_verified_at',
    'student_email','student_email_verified','student_email_verified_at',
    'instagram_handle','instagram_verified','instagram_verified_at','instagram_verify_token',
    'instagram_handle_updated_at','ligar_opted_in','ligar_activated_at',
    'ig_quarantined','photo_reports','photo_hidden','photo_cleared',
    'phone_encrypted','birth_date_encrypted','streak_count','streak_best','streak_last_day'];
  v_moderation text[] := ARRAY['is_discarded','discarded_at','discarded_by','self_deleted','strikes_count'];
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
    -- Minimal legacy profile creation is retained; all privileged values must be defaults.
    IF NEW.id <> auth.uid() OR NEW.email IS DISTINCT FROM (auth.jwt()->>'email')
       OR NEW.role IS DISTINCT FROM 'user' OR NEW.is_premium IS TRUE
       OR NEW.can_view_student_profiles IS TRUE OR NEW.is_discarded IS TRUE
       OR NEW.self_deleted IS TRUE OR coalesce(NEW.strikes_count,0)<>0
       OR NEW.student_email_verified IS TRUE OR NEW.instagram_verified IS TRUE
       OR NEW.ig_quarantined IS TRUE OR NEW.photo_hidden IS TRUE OR NEW.photo_cleared IS TRUE
       OR NEW.ligar_opted_in IS TRUE OR coalesce(NEW.photo_reports,0)<>0
       OR coalesce(NEW.streak_count,0)<>0 OR coalesce(NEW.streak_best,0)<>0 THEN
      RAISE EXCEPTION 'profile_server_fields' USING ERRCODE='42501';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['stripe_customer_id','email_verified_at','student_email',
      'student_email_verified_at','discarded_at','discarded_by','instagram_handle',
      'instagram_verified_at','instagram_verify_token','instagram_handle_updated_at',
      'ligar_activated_at','phone_encrypted','birth_date_encrypted','streak_last_day'] LOOP
      IF v_new->v_key IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'profile_server_fields' USING ERRCODE='42501';
      END IF;
    END LOOP;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  v_old := to_jsonb(OLD);
  FOREACH v_key IN ARRAY v_managed LOOP
    IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
      RAISE EXCEPTION 'profile_server_fields' USING ERRCODE='42501';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY v_moderation LOOP
    IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
      IF NOT public.is_admin() OR coalesce(auth.jwt()->>'aal','')<>'aal2' THEN
        RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501';
      END IF;
      -- A moderation action must never become a recoverable self-deletion.
      NEW.self_deleted := false;
      IF NEW.is_discarded IS TRUE THEN NEW.discarded_by := auth.uid(); END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_profile_authority() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS a_guard_profile_authority ON public.profiles;
CREATE TRIGGER a_guard_profile_authority BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_authority();

CREATE OR REPLACE FUNCTION public.recover_my_account()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET is_discarded=false
  WHERE id=auth.uid() AND is_discarded IS TRUE AND self_deleted IS TRUE AND discarded_by IS NULL
    AND coalesce(strikes_count,0)<3
    AND (SELECT count(*) FROM public.user_strikes WHERE user_id=auth.uid())<3;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.recover_my_account() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recover_my_account() TO authenticated;
CREATE OR REPLACE FUNCTION public.handle_new_strike()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer; v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id=NEW.user_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_profile.role='admin' THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.user_strikes WHERE user_id=NEW.user_id;
  UPDATE public.profiles SET strikes_count=v_count,updated_at=now() WHERE id=NEW.user_id;
  IF v_count>=3 THEN
    IF v_profile.is_discarded IS NOT TRUE OR v_profile.self_deleted IS TRUE THEN
      INSERT INTO public.discarded_records(original_table,original_id,data,deleted_by,reason)
      VALUES('profiles',NEW.user_id,to_jsonb(v_profile),NEW.issued_by,'3 strikes reached - auto discard');
    END IF;
    UPDATE public.profiles SET is_discarded=true,self_deleted=false,
      discarded_by=NEW.issued_by,discarded_at=coalesce(discarded_at,now()),updated_at=now() WHERE id=NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_strike() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path=public,pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_contract_document()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'contract_owner_required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' OR NEW.locked_at IS NOT NULL
       OR NEW.content_sha256 IS NOT NULL OR NEW.rent_cents IS NOT NULL OR NEW.deposit_cents IS NOT NULL THEN
      RAISE EXCEPTION 'contract_server_fields' USING ERRCODE='42501';
    END IF;
    NEW.created_at:=now();
  ELSE
    IF OLD.status<>'draft' OR OLD.locked_at IS NOT NULL
       OR (to_jsonb(NEW)-ARRAY['title','answers','updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['title','answers','updated_at']) THEN
      RAISE EXCEPTION 'contract_frozen' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_document() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS a_guard_contract_document ON public.contracts;
CREATE TRIGGER a_guard_contract_document BEFORE INSERT OR UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.guard_contract_document();

-- The server computes the PDF/content hash and amounts. Compare the exact
-- snapshot under the same row lock used by edit/send/sign/cancel.
CREATE OR REPLACE FUNCTION public.send_contract_verified(
  p_actor uuid,p_contract_id uuid,p_tenant_ids uuid[],p_expected_answers jsonb,
  p_expected_updated_at timestamptz,p_content_sha256 text,p_rent_cents integer,p_deposit_cents integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_contract public.contracts%ROWTYPE; v_tenant uuid; v_order integer:=0; v_ids uuid[];
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_discarded IS NOT TRUE) THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_contract FROM public.contracts WHERE id=p_contract_id FOR UPDATE;
  IF NOT FOUND OR v_contract.owner_id<>p_actor THEN RAISE EXCEPTION 'contract_not_found'; END IF;
  IF v_contract.status<>'draft' OR v_contract.locked_at IS NOT NULL THEN RAISE EXCEPTION 'contract_not_draft'; END IF;
  IF v_contract.answers IS DISTINCT FROM p_expected_answers
    OR v_contract.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'contract_changed'; END IF;
  IF p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-f]{64}$'
    OR p_rent_cents<0 OR p_deposit_cents<0 THEN RAISE EXCEPTION 'invalid_contract_snapshot'; END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_tenant_ids) x WHERE x IS NOT NULL AND x<>p_actor;
  IF coalesce(cardinality(v_ids),0) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'invalid_contract_tenants'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=x AND p.is_discarded IS NOT TRUE)) THEN RAISE EXCEPTION 'invalid_contract_tenants'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accommodations WHERE id=v_contract.accommodation_id AND owner_id=p_actor) THEN
    RAISE EXCEPTION 'contract_owner_required'; END IF;
  UPDATE public.contracts SET status='sent',locked_at=now(),content_sha256=p_content_sha256,
    rent_cents=p_rent_cents,deposit_cents=p_deposit_cents WHERE id=p_contract_id;
  INSERT INTO public.contract_signers(contract_id,user_id,role,sign_order) VALUES(p_contract_id,p_actor,'owner',0);
  FOREACH v_tenant IN ARRAY v_ids LOOP
    v_order:=v_order+1;
    INSERT INTO public.contract_signers(contract_id,user_id,role,sign_order) VALUES(p_contract_id,v_tenant,'tenant',v_order);
    INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(v_tenant,'contract','Tienes un contrato para firmar',
      'Un propietario te ha enviado un contrato de alquiler para revisar y firmar.',
      jsonb_build_object('kind','contract_to_sign','contract_id',p_contract_id,'url','/contratos/'||p_contract_id));
  END LOOP;
  RETURN jsonb_build_object('ok',true,'contract_id',p_contract_id);
END $$;
REVOKE ALL ON FUNCTION public.send_contract_verified(uuid,uuid,uuid[],jsonb,timestamptz,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.send_contract_verified(uuid,uuid,uuid[],jsonb,timestamptz,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.send_contract(uuid,uuid[],text,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sign_contract_verified(
 p_actor uuid,p_contract_id uuid,p_ip text,p_user_agent text,p_consent_text text,p_audit jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_contract public.contracts%ROWTYPE; v_signer public.contract_signers%ROWTYPE; v_pending integer;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_discarded IS NOT TRUE) THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF p_consent_text IS NULL OR length(trim(p_consent_text)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'consent_required'; END IF;
  SELECT * INTO v_contract FROM public.contracts WHERE id=p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found'; END IF;
  SELECT * INTO v_signer FROM public.contract_signers WHERE contract_id=p_contract_id AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_signer_required' USING ERRCODE='42501'; END IF;
  IF v_contract.status NOT IN ('sent','partially_signed','fully_signed') OR v_contract.locked_at IS NULL
    OR v_contract.content_sha256 IS NULL THEN RAISE EXCEPTION 'contract_not_signable'; END IF;
  SELECT count(*) INTO v_pending FROM public.contract_signers WHERE contract_id=p_contract_id AND status='pending';
  IF v_signer.status='signed' THEN
    RETURN jsonb_build_object('ok',true,'fully_signed',v_pending=0,'pending',v_pending);
  END IF;
  IF v_contract.status='fully_signed' THEN RAISE EXCEPTION 'contract_not_signable'; END IF;
  INSERT INTO public.contract_signatures(contract_id,signer_id,user_id,ip,user_agent,consent_text,content_sha256,audit)
  VALUES(p_contract_id,v_signer.id,p_actor,left(p_ip,100),left(p_user_agent,500),p_consent_text,v_contract.content_sha256,p_audit);
  UPDATE public.contract_signers SET status='signed',signed_at=now() WHERE id=v_signer.id;
  v_pending:=v_pending-1;
  UPDATE public.contracts SET status=CASE WHEN v_pending=0 THEN 'fully_signed' ELSE 'partially_signed' END WHERE id=p_contract_id;
  IF v_pending=0 THEN
    INSERT INTO public.notifications(user_id,type,title,body,data)
    SELECT user_id,'contract','Contrato firmado por todas las partes','Todas las partes han firmado el mismo documento.',
      jsonb_build_object('kind','contract_fully_signed','contract_id',p_contract_id,'url','/contratos/'||p_contract_id)
    FROM public.contract_signers WHERE contract_id=p_contract_id;
  ELSE
    INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(v_contract.owner_id,'contract','Nueva firma en tu contrato',
      'Una parte ha firmado tu contrato.',jsonb_build_object('kind','contract_signed_progress','contract_id',p_contract_id,
      'pending',v_pending,'url','/propietario/dashboard/contratos'));
  END IF;
  RETURN jsonb_build_object('ok',true,'fully_signed',v_pending=0,'pending',v_pending);
END $$;
REVOKE ALL ON FUNCTION public.sign_contract_verified(uuid,uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract_verified(uuid,uuid,text,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.sign_contract(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cancel_contract(p_contract_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_status text;
BEGIN
  IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user AND is_discarded IS NOT TRUE) THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  SELECT status INTO v_status FROM public.contracts WHERE id=p_contract_id AND owner_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found'; END IF;
  IF v_status='fully_signed' THEN RAISE EXCEPTION 'contract_already_signed'; END IF;
  IF v_status='cancelled' THEN RETURN jsonb_build_object('ok',true); END IF;
  UPDATE public.contracts SET status='cancelled' WHERE id=p_contract_id;
  INSERT INTO public.notifications(user_id,type,title,body,data)
  SELECT user_id,'contract','Contrato cancelado','El propietario ha cancelado un contrato que tenías pendiente de firma.',
    jsonb_build_object('kind','contract_cancelled','contract_id',p_contract_id)
  FROM public.contract_signers WHERE contract_id=p_contract_id AND role='tenant';
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_contract(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_contract(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_email_verification(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_token public.email_verification_tokens%ROWTYPE; v_email text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok',false,'reason','invalid'); END IF;
  SELECT * INTO v_token FROM public.email_verification_tokens WHERE token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','invalid'); END IF;
  IF v_token.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reason','used'); END IF;
  IF v_token.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','expired'); END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=v_token.user_id FOR SHARE;
  IF v_email IS NULL OR lower(v_email) IS DISTINCT FROM lower(v_token.email) THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid'); END IF;
  UPDATE public.profiles SET email_verified_at=now() WHERE id=v_token.user_id
    AND lower(email)=lower(v_token.email) AND is_discarded IS NOT TRUE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','invalid'); END IF;
  UPDATE public.email_verification_tokens SET consumed_at=now() WHERE token_hash=p_token_hash;
  RETURN jsonb_build_object('ok',true,'userId',v_token.user_id);
END $$;
REVOKE ALL ON FUNCTION public.consume_email_verification(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_email_verification(text) TO service_role;
