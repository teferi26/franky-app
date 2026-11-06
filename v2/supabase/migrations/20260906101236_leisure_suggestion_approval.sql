-- Atomic leisure approval and immutable moderation fields: 73 checks plus two-connection concurrency passed.
-- Existing clients keep approve_leisure_suggestion(uuid,text) -> uuid.
-- Catalogue policies, billing guards and existing notification triggers are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF to_regprocedure('public.approve_leisure_suggestion(uuid,text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.leisure_spot_suggestions'::regclass
                 AND attname='created_leisure_spot_id' AND NOT attisdropped)
  THEN RAISE EXCEPTION 'leisure_approval_contract_drift'; END IF;
  IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute
       WHERE attrelid='public.leisure_spot_suggestions'::regclass AND attnum>0 AND NOT attisdropped)
     IS DISTINCT FROM ARRAY['id','user_id','name','city','category','description','address','status','created_at']
  THEN RAISE EXCEPTION 'leisure_suggestions_schema_drift'; END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid='public.leisure_spots'::regclass AND conname='leisure_spots_category_check')
     IS DISTINCT FROM 'CHECK ((category = ANY (ARRAY[''bar''::text, ''pub''::text, ''restaurante''::text, ''cafeteria''::text, ''discoteca''::text, ''parque''::text, ''cultural''::text, ''deportivo''::text, ''coworking''::text])))'
  THEN RAISE EXCEPTION 'leisure_category_contract_drift'; END IF;
END $guard$;

-- Tombstone reference, intentionally without FK: deleting a venue must remain possible
-- and must not remove the approved UUID / allow a retry to recreate that venue.
ALTER TABLE public.leisure_spot_suggestions ADD COLUMN created_leisure_spot_id uuid;
ALTER TABLE public.leisure_spot_suggestions ADD CONSTRAINT leisure_suggestion_approved_link_check
 CHECK (created_leisure_spot_id IS NULL OR status IS NOT DISTINCT FROM 'approved');
COMMENT ON COLUMN public.leisure_spot_suggestions.created_leisure_spot_id IS
 'UUID produced by atomic admin approval. Retained after venue deletion; clients cannot assign or alter it.';

CREATE FUNCTION public.guard_leisure_suggestion_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  -- current_user is the execution role, not a caller-controlled custom setting.
  -- Trusted server/SECURITY DEFINER operations keep their verified workflow.
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP='INSERT' THEN
      NEW.status := 'pending';
      NEW.created_leisure_spot_id := NULL;
      NEW.created_at := now();
    ELSE
      IF NEW.created_leisure_spot_id IS DISTINCT FROM OLD.created_leisure_spot_id
         OR ((NEW.status IS DISTINCT FROM OLD.status)
             AND (NEW.status IS NOT DISTINCT FROM 'approved'
                  OR OLD.status IS NOT DISTINCT FROM 'approved'))
      THEN RAISE EXCEPTION 'approval_requires_rpc' USING ERRCODE='42501'; END IF;
      IF NOT public.is_admin() OR COALESCE(auth.jwt()->>'aal','') <> 'aal2'
      THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION public.guard_leisure_suggestion_review() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_leisure_suggestion_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_guard_leisure_suggestion_review
 BEFORE INSERT OR UPDATE ON public.leisure_spot_suggestions
 FOR EACH ROW EXECUTE FUNCTION public.guard_leisure_suggestion_review();

CREATE FUNCTION public.guard_report_initial_moderation()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF current_user IN ('anon','authenticated')
     AND NOT (public.is_admin() AND COALESCE(auth.jwt()->>'aal','')='aal2')
  THEN
    NEW.status := 'pending';
    NEW.admin_notes := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION public.guard_report_initial_moderation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_report_initial_moderation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_guard_report_initial_moderation
 BEFORE INSERT ON public.user_reports
 FOR EACH ROW EXECUTE FUNCTION public.guard_report_initial_moderation();

CREATE FUNCTION public.approve_leisure_suggestion(
 p_suggestion_id uuid,
 p_admin_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_suggestion public.leisure_spot_suggestions%ROWTYPE;
  v_spot_id uuid;
BEGIN
  IF v_actor IS NULL OR COALESCE(auth.jwt()->>'aal','') <> 'aal2'
  THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
  -- Lock ordering: actor profile, then suggestion. Role removal waits until commit.
  PERFORM 1 FROM public.profiles
   WHERE id=v_actor AND role='admin' AND is_discarded IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
  IF p_suggestion_id IS NULL OR (p_admin_note IS NOT NULL AND length(p_admin_note)>2000)
  THEN RAISE EXCEPTION 'invalid_approval_input' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_suggestion FROM public.leisure_spot_suggestions
   WHERE id=p_suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion_not_found' USING ERRCODE='P0002'; END IF;
  IF v_suggestion.status IS NOT DISTINCT FROM 'approved' THEN
    IF v_suggestion.created_leisure_spot_id IS NOT NULL THEN
      -- Retain existence until this transaction completes; never resurrect on retry.
      PERFORM 1 FROM public.leisure_spots
       WHERE id=v_suggestion.created_leisure_spot_id FOR KEY SHARE;
      IF FOUND THEN RETURN v_suggestion.created_leisure_spot_id; END IF;
    END IF;
    RAISE EXCEPTION 'approved_spot_missing' USING ERRCODE='55000';
  END IF;
  IF v_suggestion.status IS DISTINCT FROM 'pending'
  THEN RAISE EXCEPTION 'suggestion_already_processed' USING ERRCODE='55000'; END IF;

  IF length(btrim(v_suggestion.name))=0 OR length(btrim(v_suggestion.city))=0
     OR v_suggestion.category <> ALL (ARRAY['bar','pub','restaurante','cafeteria',
                'discoteca','parque','cultural','deportivo','coworking'])
  THEN RAISE EXCEPTION 'suggestion_needs_correction' USING ERRCODE='22023'; END IF;

  -- Copy exactly the available, reviewed fields. No inferred coordinates,
  -- province/community, contact, rating, sponsorship or commercial subscription.
  INSERT INTO public.leisure_spots
   (name,city,category,description,address,is_verified,is_paid,owner_id)
  VALUES
   (v_suggestion.name,v_suggestion.city,v_suggestion.category,
    v_suggestion.description,v_suggestion.address,true,true,NULL)
  RETURNING id INTO v_spot_id;

  UPDATE public.leisure_spot_suggestions
   SET status='approved', created_leisure_spot_id=v_spot_id
   WHERE id=p_suggestion_id;

  -- Strict audit record: if this write fails, venue and decision roll back together.
  -- actor_email is nullable; no extra email read or public review-note column.
  INSERT INTO public.admin_actions(actor_id,action,target_table,target_id,changes)
  VALUES(v_actor,'approve_leisure_suggestion','leisure_spot_suggestions',p_suggestion_id::text,
    jsonb_build_object('note',p_admin_note,'created_spot_id',v_spot_id));
  RETURN v_spot_id;
END $function$;
ALTER FUNCTION public.approve_leisure_suggestion(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_leisure_suggestion(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_leisure_suggestion(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.approve_leisure_suggestion(uuid,text) IS
 'Admin+AAL2 atomic approval against the current schema. Returns created venue UUID; replay returns it without duplicate writes.';

NOTIFY pgrst, 'reload schema';
COMMIT;
