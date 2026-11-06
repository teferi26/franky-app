-- Storage 1.77.5 checks RLS with the user and then completes the upload using
-- its service identity. Keep this exception restricted to that second phase.
DO $$DECLARE definition text; anchor text := '-- card_private_photo_scope: exact immutable owner path, never another bucket.';BEGIN
 SELECT pg_get_functiondef('workspace_private.guard_demo_storage()'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'card_storage_boundary_changed';END IF;
 IF strpos(definition,'card_storage_service_completion')=0 THEN
 EXECUTE replace(definition,anchor,$patch$
 -- card_storage_service_completion: clients cannot assume the Storage login.
 IF session_user='supabase_storage_admin' AND auth.uid() IS NULL
 AND coalesce(auth.jwt()->>'role','')='service_role'
 AND current_setting('storage.operation',true)='storage.object.upload'
 AND TG_OP IN('INSERT','UPDATE') AND data->>'bucket_id'='card-media'
 AND data->>'name' ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'
 AND data->>'owner_id'=split_part(data->>'name','/',1)
 AND data->'metadata'->>'mimetype'='image/jpeg'
 AND (data->'metadata'->>'size') ~ '^[0-9]{1,7}$'
 AND (data->'metadata'->>'size')::bigint BETWEEN 1 AND 3145728
 AND EXISTS(SELECT 1 FROM public.workspace_demo_accounts d
   JOIN auth.users u ON u.id=d.user_id
   JOIN public.workspace_demo_scenarios s ON s.user_id=d.user_id
   JOIN public.organizations o ON o.id=s.organization_id AND o.demo_cohort_id=d.cohort_id
   WHERE d.user_id::text=data->>'owner_id' AND u.deleted_at IS NULL
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
   AND s.revoked_at IS NULL AND o.status='active'
   AND NOT EXISTS(SELECT 1 FROM account_private.erasures e WHERE e.user_id=d.user_id))
 AND (TG_OP<>'UPDATE' OR (OLD.bucket_id='card-media' AND OLD.name=data->>'name' AND OLD.owner_id=data->>'owner_id'))
 THEN RETURN NEW;END IF;
 $patch$||anchor);
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
