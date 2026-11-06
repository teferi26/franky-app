SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.staff_alert_outbox') IS NULL
    OR to_regprocedure('public.flush_staff_alerts()') IS NULL THEN
    RAISE EXCEPTION 'staff_outbox_prerequisite_missing';
  END IF;
END;
$$;

ALTER TABLE public.staff_alert_outbox
  ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz;

COMMENT ON COLUMN public.staff_alert_outbox.first_attempt_at IS
  'First HTTP dispatch attempt, including local dispatch errors. NULL until first attempt. Historical attempted rows backfilled conservatively from created_at.';

UPDATE public.staff_alert_outbox
SET first_attempt_at = created_at
WHERE attempts > 0 AND first_attempt_at IS NULL;

CREATE OR REPLACE FUNCTION public.flush_staff_alerts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_url text;
  v_secret text;
  v_job record;
  v_request bigint;
  v_count int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE key = 'staff_outbox_enabled' AND value = 'true'
  ) THEN RETURN 0; END IF;

  SELECT value INTO v_url FROM public.app_settings WHERE key = 'notify_staff_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'notify_email_secret';
  IF nullif(v_url, '') IS NULL OR nullif(v_secret, '') IS NULL THEN RETURN 0; END IF;

  -- Stop within the provider's idempotency window, measured from FIRST ATTEMPT.
  -- A queue paused for more than 20 h must still allow its first dispatch.
  UPDATE public.staff_alert_outbox
  SET status = 'failed',
      last_error = coalesce(last_error, 'Delivery was not acknowledged')
  WHERE status IN ('pending', 'sending')
    AND (
      attempts >= 8
      OR (first_attempt_at IS NOT NULL AND first_attempt_at < now() - interval '20 hours')
    )
    AND next_attempt_at <= now();

  FOR v_job IN
    SELECT id, attempts FROM public.staff_alert_outbox
    WHERE status IN ('pending', 'sending')
      AND next_attempt_at <= now()
      AND attempts < 8
    ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'authorization', 'Bearer ' || v_secret
        ),
        body := jsonb_build_object('alert_id', v_job.id),
        timeout_milliseconds := 30000
      ) INTO v_request;

      UPDATE public.staff_alert_outbox
      SET status = 'sending',
          attempts = attempts + 1,
          first_attempt_at = coalesce(first_attempt_at, now()),
          request_id = v_request,
          next_attempt_at = now() + make_interval(
            secs => least(3600, 60 * power(2, v_job.attempts)::int)
          )
      WHERE id = v_job.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- The failed subtransaction may roll back a tentative timestamp update.
      -- Set/preserve it here too; never restart the window on later retries.
      UPDATE public.staff_alert_outbox
      SET attempts = attempts + 1,
          first_attempt_at = coalesce(first_attempt_at, now()),
          last_error = 'HTTP dispatch failed',
          next_attempt_at = now() + interval '10 minutes'
      WHERE id = v_job.id;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.flush_staff_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flush_staff_alerts() TO service_role;

-- Read-only checks: NEVER invoke flush_staff_alerts or net.http_post here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_alert_outbox
    WHERE attempts > 0 AND first_attempt_at IS NULL
  ) THEN RAISE EXCEPTION 'attempted_alert_missing_first_attempt'; END IF;

  IF has_function_privilege('anon', 'public.flush_staff_alerts()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.flush_staff_alerts()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.flush_staff_alerts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected_outbox_flush_privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.flush_staff_alerts()'::regprocedure AND prosecdef
  ) THEN RAISE EXCEPTION 'outbox_flush_must_remain_definer'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_product_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_me uuid := auth.uid(); v_props jsonb := '{}'::jsonb; v_key text; v_value jsonb;
BEGIN
  IF v_me IS NULL OR NEW.user_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF NEW.name IS NULL OR NEW.name !~ '^[a-z][a-z0-9_]{0,59}$' OR NEW.platform IS NULL OR NEW.platform NOT IN ('web','ios','android')
    OR jsonb_typeof(NEW.props) IS DISTINCT FROM 'object' OR octet_length(NEW.props::text)>16384 THEN
    RAISE EXCEPTION 'invalid_product_event';
  END IF;
  NEW.created_at := now();
  NEW.app_version := left(NEW.app_version,50);
  PERFORM pg_advisory_xact_lock(hashtextextended('analytics:'||v_me::text,0));
  IF (SELECT count(*) FROM public.analytics_events WHERE user_id=v_me
      AND created_at>now()-interval '1 minute') >= 120 THEN RETURN NULL; END IF;
  -- Older builds included text in telemetry. Recover it only if no preceding
  -- inbox insert exists, then strip it from analytics in all cases.
  IF NEW.name='feedback_submitted' AND nullif(btrim(NEW.props->>'texto'),'') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.platform_messages WHERE user_id=v_me
      AND created_at>now()-interval '5 minutes'
      AND left(body,2000)=left(NEW.props->>'texto',2000)) THEN
    PERFORM public.submit_platform_suggestion(NEW.props->>'texto',
      CASE WHEN NEW.props->>'tipo'='fallo' THEN 'fallo' WHEN NEW.props->>'tipo'='idea' THEN 'sugerencia' ELSE 'otro' END,
      CASE WHEN NEW.platform='web' THEN 'web' ELSE 'movil' END);
  END IF;
  IF NEW.name='screen_view' THEN
    IF coalesce(NEW.props->>'screen','') NOT IN (
      'inicio','fomo','fomo_hilo','crush','crush_live','roomie','roomie_conexiones',
      'universidades','carreras','notas_corte','becas','carrera_ideal','alojamiento',
      'eventos','chats','perfil','novedades','comunidades','mercado','ocio','agenda',
      'favoritos','notificaciones','sugerencias','contacto','entradas','onboarding',
      'nota_media','simulador','explorar','ayuda','otra') THEN RAISE EXCEPTION 'invalid_screen'; END IF;
    v_props := jsonb_build_object('screen',NEW.props->>'screen');
    IF NEW.props->>'surface'='home' THEN v_props:=v_props||'{"surface":"home"}'::jsonb; END IF;
  ELSE
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(NEW.props) LOOP
      IF v_key IN ('mode','event_id','ticket_id','action','method','count','total','kind','source',
        'step','intent','page','seconds','has_avatar','has_city','has_instagram','has_bio',
        'has_career','has_university','has_gender','has_birthdate','key','variant','via','destino',
        'code','matched','direction','deck_size','eligible','ready','tab')
        AND jsonb_typeof(v_value) IN ('string','number','boolean','null')
        AND char_length(v_value::text)<=100
        AND (jsonb_typeof(v_value)<>'string' OR v_value#>>'{}' ~ '^[A-Za-z0-9_ ./:-]{0,80}$')
      THEN v_props := v_props || jsonb_build_object(v_key,v_value); END IF;
    END LOOP;
  END IF;
  NEW.props:=v_props;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_product_event() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_product_event_guard ON public.analytics_events;
CREATE TRIGGER trg_product_event_guard BEFORE INSERT ON public.analytics_events
FOR EACH ROW EXECUTE FUNCTION public.guard_product_event();

CREATE OR REPLACE FUNCTION public.undo_last_swipe(p_target_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_me uuid:=auth.uid(); v_swipe public.swipe_actions;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('undo-swipe:'||v_me::text,0));
  SELECT * INTO v_swipe FROM public.swipe_actions
  WHERE user_id=v_me AND target_type=p_target_type
  ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF v_swipe.id IS NULL THEN RETURN NULL; END IF;
  IF p_target_type='roomie' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crush-live-pair:'||least(v_me,v_swipe.target_id)::text||':'||greatest(v_me,v_swipe.target_id)::text,0));
    IF EXISTS (SELECT 1 FROM public.roommate_matches a JOIN public.roommate_matches b
      ON b.user_id=a.matched_user_id AND b.matched_user_id=a.user_id
      WHERE a.user_id=v_me AND a.matched_user_id=v_swipe.target_id
      AND a.status IN ('liked','matched') AND b.status IN ('liked','matched'))
    THEN RAISE EXCEPTION 'cannot_undo_mutual_match'; END IF;
    DELETE FROM public.roommate_matches WHERE user_id=v_me AND matched_user_id=v_swipe.target_id;
  END IF;
  DELETE FROM public.swipe_actions WHERE id=v_swipe.id AND user_id=v_me;
  RETURN v_swipe.target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_last_swipe(p_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_me uuid:=auth.uid(); v_type text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id<>v_me THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('undo-swipe:'||v_me::text,0));
  SELECT target_type INTO v_type FROM public.swipe_actions WHERE user_id=v_me
  ORDER BY created_at DESC,id DESC LIMIT 1;
  IF v_type IS NULL THEN RETURN NULL; END IF;
  RETURN public.undo_last_swipe(v_type);
END;
$$;
REVOKE ALL ON FUNCTION public.undo_last_swipe(text),public.undo_last_swipe(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.undo_last_swipe(text),public.undo_last_swipe(uuid) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon','public.undo_last_swipe(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.guard_product_event()','EXECUTE')
    THEN RAISE EXCEPTION 'unexpected_guard_privileges'; END IF;
END;
$$;
NOTIFY pgrst,'reload schema';

-- Transactional guard checks. The inserted test event is rolled back inside
-- the subtransaction; no suggestion, outbox row, mail or social action occurs.
DO $$
DECLARE v_uid uuid; v_event public.analytics_events; v_claims text:=current_setting('request.jwt.claims',true);
BEGIN
  SELECT id INTO v_uid FROM public.profiles WHERE is_discarded IS NOT TRUE ORDER BY id LIMIT 1;
  IF v_uid IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated','aal','aal1')::text,true);
  BEGIN
    INSERT INTO public.analytics_events(user_id,name,platform,props,created_at)
    VALUES(v_uid,'screen_view','web','{"screen":"becas","renta":"private","query":"private"}',now()-interval '1 year') RETURNING * INTO v_event;
    IF v_event.id IS NULL OR v_event.props IS DISTINCT FROM '{"screen":"becas"}'::jsonb
      OR v_event.created_at<>now() THEN RAISE EXCEPTION 'event_guard_smoke_failed'; END IF;
    RAISE EXCEPTION 'rollback_smoke_event' USING ERRCODE='Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
END;
$$;
