-- The Card RLS policies already permit private owner photos. Complete the
-- independent demo trigger fence without opening any public media bucket.
DO $$DECLARE definition text;anchor text:='data:=CASE WHEN TG_OP=''DELETE'' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;';BEGIN
 SELECT pg_get_functiondef('workspace_private.guard_demo_storage()'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'demo_storage_boundary_changed';END IF;
 IF strpos(definition,'card_private_photo_scope')=0 THEN
  EXECUTE replace(definition,anchor,anchor||$patch$
 -- card_private_photo_scope: exact immutable owner path, never another bucket.
 IF data->>'bucket_id'='card-media'
 AND data->>'name' ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'
 AND (
   (auth.uid() IS NOT NULL AND split_part(data->>'name','/',1)=auth.uid()::text AND public.account_session_usable())
   OR (TG_OP='DELETE' AND coalesce(auth.jwt()->>'role','')='service_role'
     AND EXISTS(SELECT 1 FROM public.workspace_demo_accounts d WHERE d.user_id::text=split_part(data->>'name','/',1)))
 ) AND (TG_OP<>'UPDATE' OR (OLD.bucket_id='card-media' AND OLD.name=data->>'name'))
 THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 $patch$);
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
