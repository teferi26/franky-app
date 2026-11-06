-- API handlers check the caller's own account state before returning private
-- data. Permit that boolean read for demos without opening any business RPC.
DO $$DECLARE definition text;anchor text:='IF public.current_demo_cohort() IS NULL THEN RETURN; END IF;';BEGIN
 SELECT pg_get_functiondef('public.workspace_require_request()'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 OR strpos(definition,'PERFORM public.require_account_session();')=0 THEN
  RAISE EXCEPTION 'demo_session_boundary_changed';
 END IF;
 IF strpos(definition,'''/rpc/account_session_usable''')=0 THEN
  EXECUTE replace(definition,anchor,$patch$
 IF method IN('GET','HEAD','POST') AND route='/rpc/account_session_usable' THEN RETURN; END IF;
 $patch$||anchor);
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
