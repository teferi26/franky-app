-- Restore catalogue rows atomically after admin+AAL2 verification. Never user recovery.
-- Excluded pending explicit workflows: news/events/accommodations and owned/billed leisure.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF to_regprocedure('public.restore_discarded_record(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'restore_rpc_contract_drift'; END IF;
END $guard$;

CREATE FUNCTION public.restore_discarded_record(p_record_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_record public.discarded_records%ROWTYPE;
 v_data jsonb;
 v_relation regclass;
 v_columns text;
 v_values text;
 v_exists boolean;
 v_written uuid;
 v_at timestamptz;
BEGIN
 IF v_actor IS NULL OR COALESCE(auth.jwt()->>'aal','')<>'aal2'
 THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles
  WHERE id=v_actor AND role='admin' AND is_discarded IS NOT TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'admin_mfa_required' USING ERRCODE='42501'; END IF;
 IF p_record_id IS NULL THEN RAISE EXCEPTION 'invalid_record_id' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_record FROM public.discarded_records WHERE id=p_record_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'discarded_record_not_found' USING ERRCODE='P0002'; END IF;

 -- Only literal, server-controlled names. No table or payload argument from the client.
 IF v_record.original_table <> ALL(ARRAY['universities','careers','scholarships','leisure_spots'])
 THEN RAISE EXCEPTION 'restore_requires_specific_workflow' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(v_record.data) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'invalid_record_snapshot' USING ERRCODE='22023'; END IF;
 IF v_record.data ? 'id' AND
    (v_record.data->>'id')::uuid IS DISTINCT FROM v_record.original_id
 THEN RAISE EXCEPTION 'snapshot_identity_mismatch' USING ERRCODE='22023'; END IF;
 v_data:=v_record.data || jsonb_build_object('id',v_record.original_id);
 IF v_record.original_table='leisure_spots' AND
    ((v_data->'owner_id') IS DISTINCT FROM 'null'::jsonb
     OR (v_data->'subscription_id') IS DISTINCT FROM 'null'::jsonb)
 THEN RAISE EXCEPTION 'restore_requires_billing_review' USING ERRCODE='22023'; END IF;

 v_relation:=to_regclass(format('public.%I',v_record.original_table));
 IF v_relation IS NULL THEN RAISE EXCEPTION 'snapshot_schema_changed' USING ERRCODE='55000'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_object_keys(v_data) AS k(name)
   WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a
     WHERE a.attrelid=v_relation AND a.attnum>0 AND NOT a.attisdropped
       AND a.attgenerated='' AND a.attidentity='' AND a.attname=k.name)
 ) THEN RAISE EXCEPTION 'snapshot_schema_changed' USING ERRCODE='55000'; END IF;

 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1 FOR KEY SHARE)',v_record.original_table)
 INTO v_exists USING v_record.original_id;
 IF v_record.restored_at IS NOT NULL THEN
   IF NOT v_exists THEN RAISE EXCEPTION 'restored_target_missing' USING ERRCODE='55000'; END IF;
   RETURN jsonb_build_object('original_id',v_record.original_id,'original_table',v_record.original_table,
     'restored_at',v_record.restored_at,'already_restored',true);
 END IF;
 -- A previous partial client restore requires manual reconciliation, never overwrite.
 IF v_exists THEN RAISE EXCEPTION 'restore_target_already_exists' USING ERRCODE='23505'; END IF;

 -- Include only keys in the snapshot. Columns added later retain their defaults.
 -- Type conversion and all current NOT NULL/CHECK/FK/UNIQUE constraints remain active.
 SELECT string_agg(format('%I',a.attname),',' ORDER BY a.attnum),
        string_agg(format('r.%I',a.attname),',' ORDER BY a.attnum)
 INTO v_columns,v_values
 FROM pg_attribute a WHERE a.attrelid=v_relation AND a.attnum>0 AND NOT a.attisdropped
   AND v_data ? a.attname;
 EXECUTE format(
  'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) AS r RETURNING id',
  v_record.original_table,v_columns,v_values,v_record.original_table)
 INTO v_written USING v_data;
 IF v_written IS DISTINCT FROM v_record.original_id
 THEN RAISE EXCEPTION 'restored_identity_changed' USING ERRCODE='55000'; END IF;
 v_at:=now();
 UPDATE public.discarded_records SET restored_at=v_at,restored_by=v_actor WHERE id=p_record_id;
 INSERT INTO public.admin_actions(actor_id,action,target_table,target_id,changes)
 VALUES(v_actor,'restore_discarded_record',v_record.original_table,v_record.original_id::text,
   jsonb_build_object('discarded_record_id',p_record_id));
 RETURN jsonb_build_object('original_id',v_record.original_id,'original_table',v_record.original_table,
   'restored_at',v_at,'already_restored',false);
END $function$;
ALTER FUNCTION public.restore_discarded_record(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restore_discarded_record(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restore_discarded_record(uuid) TO authenticated;
COMMENT ON FUNCTION public.restore_discarded_record(uuid) IS
 'Admin+AAL2 atomic catalogue row restoration from a stored UUID. Does not recover accounts, cascade-deleted relations or publication/billing workflows.';
NOTIFY pgrst,'reload schema';
COMMIT;