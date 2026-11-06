BEGIN;
CREATE TABLE public.push_delivery_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','processing','provider_sending','accepted','skipped','failed')),
 attempts integer NOT NULL DEFAULT 0, lease_id uuid, request_id bigint, throttle_claimed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz, last_error text, device_results jsonb NOT NULL DEFAULT '[]'::jsonb,
 CHECK(jsonb_typeof(device_results)='array')
);
ALTER TABLE public.push_delivery_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_delivery_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.push_delivery_outbox TO service_role;
CREATE INDEX push_delivery_pending ON public.push_delivery_outbox(next_attempt_at) WHERE status IN('pending','sending','processing');

-- Deploy-safe switch. Existing triggers keep working while the matching route is built.
INSERT INTO public.app_settings(key,value) VALUES('push_outbox_enabled','false') ON CONFLICT(key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.on_notification_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.is_read IS NOT TRUE THEN
   IF EXISTS(SELECT 1 FROM public.app_settings WHERE key='push_outbox_enabled' AND value='true') THEN
     INSERT INTO public.push_delivery_outbox(notification_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
   ELSE
     PERFORM public.dispatch_push(NEW.user_id,NEW.title,NEW.body,coalesce(NEW.data,'{}'::jsonb)||jsonb_build_object('type',NEW.type));
   END IF;
   IF NEW.type IN('message','match','roomie_like','comment','event','accommodation') THEN
     PERFORM public.dispatch_email(NEW.user_id,NEW.type,NEW.title,NEW.body,coalesce(NEW.data,'{}'::jsonb));
   END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.on_notification_insert() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.flush_push_deliveries() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; secret text; job record; lease uuid; request bigint; sent integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_settings WHERE key='push_outbox_enabled' AND value='true') THEN RETURN 0; END IF;
 SELECT value INTO endpoint FROM public.app_settings WHERE key='notify_push_url';
 SELECT value INTO secret FROM public.app_settings WHERE key='notify_email_secret';
 IF nullif(endpoint,'') IS NULL OR nullif(secret,'') IS NULL THEN RETURN 0; END IF;
 -- An expired request that reached the provider has an ambiguous outcome.
 -- Do not automatically repeat it without a provider idempotency guarantee.
 UPDATE public.push_delivery_outbox SET status='failed',last_error='Provider outcome unknown; manual review required'
   WHERE status='provider_sending' AND next_attempt_at<=now();
 UPDATE public.push_delivery_outbox SET status='failed',last_error=coalesce(last_error,'No provider acknowledgement after retries')
   WHERE status IN('pending','sending','processing') AND next_attempt_at<=now() AND attempts>=8;
 FOR job IN SELECT id,attempts FROM public.push_delivery_outbox WHERE status IN('pending','sending','processing') AND attempts<8 AND next_attempt_at<=now()
   ORDER BY created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED
 LOOP
   BEGIN
     lease:=gen_random_uuid();
     SELECT net.http_post(url:=endpoint,headers:=jsonb_build_object('content-type','application/json','authorization','Bearer '||secret),
       body:=jsonb_build_object('alert_id',job.id,'lease_id',lease),timeout_milliseconds:=30000) INTO request;
     UPDATE public.push_delivery_outbox SET status='sending',lease_id=lease,request_id=request,attempts=attempts+1,
       next_attempt_at=now()+make_interval(secs=>least(3600,120*power(2,job.attempts)::integer)) WHERE id=job.id;
     sent:=sent+1;
   EXCEPTION WHEN OTHERS THEN
     UPDATE public.push_delivery_outbox SET attempts=attempts+1,last_error='HTTP dispatch failed',next_attempt_at=now()+interval '5 minutes' WHERE id=job.id;
   END;
 END LOOP;
 RETURN sent;
END; $$;
REVOKE ALL ON FUNCTION public.flush_push_deliveries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flush_push_deliveries() TO service_role;
SELECT cron.schedule('push-delivery-outbox','* * * * *',$cron$SELECT public.flush_push_deliveries();$cron$);

CREATE FUNCTION public.claim_product_push_window(p_user_id uuid,p_category text,p_job_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claimed uuid; gap interval; reserved boolean;
BEGIN
 IF p_category NOT IN('events','news','housing') OR p_user_id IS NULL THEN RETURN false; END IF;
 IF p_job_id IS NOT NULL THEN
   SELECT o.throttle_claimed INTO reserved FROM public.push_delivery_outbox o JOIN public.notifications n ON n.id=o.notification_id
     WHERE o.id=p_job_id AND n.user_id=p_user_id FOR UPDATE OF o;
   IF NOT FOUND THEN RETURN false; END IF;
   IF reserved THEN RETURN true; END IF;
 END IF;
 gap:=CASE WHEN p_category='events' THEN interval '6 hours' ELSE interval '1 hour' END;
 INSERT INTO public.email_notification_log(user_id,category,ref,last_sent_at)
   VALUES(p_user_id,'push_'||p_category,p_category,now())
   ON CONFLICT(user_id,category,ref) DO UPDATE SET last_sent_at=excluded.last_sent_at
     WHERE public.email_notification_log.last_sent_at<=now()-gap
   RETURNING user_id INTO claimed;
 IF claimed IS NOT NULL AND p_job_id IS NOT NULL THEN UPDATE public.push_delivery_outbox SET throttle_claimed=true WHERE id=p_job_id; END IF;
 RETURN claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_product_push_window(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_product_push_window(uuid,text,uuid) TO service_role;
COMMIT;
