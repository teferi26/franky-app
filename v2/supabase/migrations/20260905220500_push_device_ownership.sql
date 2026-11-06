-- One active recipient per installation token. Never choose a guessed owner.
LOCK TABLE public.device_tokens IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT token FROM public.device_tokens GROUP BY token HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ambiguous_push_ownership_requires_review';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_one_owner ON public.device_tokens(token);

CREATE OR REPLACE FUNCTION public.register_my_push_device(
  p_expected_user_id uuid, p_token text, p_platform text,
  p_app_version text DEFAULT NULL, p_device_model text DEFAULT NULL, p_locale text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_expected_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'session_changed' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR length(p_token) > 300 OR p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
     OR p_platform IS NULL OR p_platform NOT IN ('ios','android')
     OR length(p_app_version) > 100 OR length(p_device_model) > 200 OR length(p_locale) > 100 THEN
    RAISE EXCEPTION 'invalid_device_registration' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.device_tokens(user_id,token,platform,app_version,device_model,locale,last_seen_at)
  VALUES(auth.uid(),p_token,p_platform,p_app_version,p_device_model,p_locale,now())
  ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
    app_version=EXCLUDED.app_version,device_model=EXCLUDED.device_model,locale=EXCLUDED.locale,last_seen_at=now();
END;
$$;
CREATE OR REPLACE FUNCTION public.unregister_my_push_device(p_expected_user_id uuid,p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_expected_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'session_changed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.device_tokens WHERE user_id=auth.uid() AND token=p_token;
END;
$$;
REVOKE ALL ON FUNCTION public.register_my_push_device(uuid,text,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.unregister_my_push_device(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_my_push_device(uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_my_push_device(uuid,text) TO authenticated;
