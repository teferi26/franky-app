BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.housing_search_intents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  city text NOT NULL CHECK(length(city) BETWEEN 1 AND 120), province text,
  budget_max numeric CHECK(budget_max>0 AND budget_max<=100000),
  enabled boolean NOT NULL DEFAULT true,
  searched_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
ALTER TABLE public.housing_search_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_housing_search_read ON public.housing_search_intents FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_housing_search_delete ON public.housing_search_intents FOR DELETE TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.housing_search_intents FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.housing_search_intents TO authenticated;
GRANT ALL ON public.housing_search_intents TO service_role;

CREATE FUNCTION public.save_housing_search(p_city text,p_budget_max numeric,p_enabled boolean,p_expected_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); normalized text:=public.normalizar_localidad(p_city); result jsonb;
BEGIN
  IF me IS NULL OR p_expected_user_id IS NULL OR me<>p_expected_user_id THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF nullif(trim(p_city),'') IS NULL OR length(p_city)>120 OR p_enabled IS NULL OR p_budget_max<=0 OR p_budget_max>100000 THEN RAISE EXCEPTION 'invalid_search'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.provincias_localidades WHERE localidad=normalized)
    AND NOT EXISTS(SELECT 1 FROM public.accommodations a WHERE public.normalizar_localidad(a.city)=normalized AND a.status='active' AND a.is_paid AND a.deleted_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM public.universities u WHERE public.normalizar_localidad(u.city)=normalized) THEN RAISE EXCEPTION 'unknown_search_city'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=me AND is_discarded IS NOT TRUE) THEN RAISE EXCEPTION 'auth_required'; END IF;
  INSERT INTO public.housing_search_intents(user_id,city,province,budget_max,enabled)
    VALUES(me,trim(p_city),public.provincia_de(p_city),p_budget_max,p_enabled)
    ON CONFLICT(user_id) DO UPDATE SET city=excluded.city,province=excluded.province,budget_max=excluded.budget_max,enabled=excluded.enabled,searched_at=now(),expires_at=now()+interval '30 days'
    RETURNING jsonb_build_object('city',city,'province',province,'enabled',enabled,'expires_at',expires_at) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_housing_search(text,numeric,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_housing_search(text,numeric,boolean,uuid) TO authenticated;

CREATE TABLE private.product_alert_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN('news','housing')),
  source_id uuid NOT NULL, reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','done','failed','suppressed')),
  audience_at timestamptz NOT NULL DEFAULT now(), cursor_user_id uuid,
  not_before timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
  scanned integer NOT NULL DEFAULT 0, inserted integer NOT NULL DEFAULT 0, last_error text,
  CHECK((kind='news' AND reason='published') OR(kind='housing' AND reason IN('nuevo','habitaciones')))
);
CREATE UNIQUE INDEX product_alert_news_once ON private.product_alert_jobs(source_id) WHERE kind='news';
CREATE UNIQUE INDEX product_alert_pending_once ON private.product_alert_jobs(kind,source_id,reason) WHERE status='pending';
CREATE INDEX product_alert_pending_due ON private.product_alert_jobs(not_before) WHERE status='pending';
CREATE TABLE private.product_alert_deliveries (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL, source_id uuid NOT NULL, reason text NOT NULL,
  last_notified_at timestamptz NOT NULL DEFAULT now(), notification_id uuid NOT NULL,
  PRIMARY KEY(user_id,kind,source_id,reason)
);
ALTER TABLE private.product_alert_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.product_alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.product_alert_jobs,private.product_alert_deliveries FROM PUBLIC,anon,authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK(type IN(
 'message','match','review','accommodation','event','promotion','system','scholarship','accommodation_request',
 'roomie_like','payment','comment','post','tenancy','visit','contract','mention','admin_photo_report','call','community','waitlist','news'));

-- Installation never broadcasts historical news, including later republication.
LOCK TABLE public.news IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO private.product_alert_jobs(kind,source_id,reason,status)
  SELECT 'news',id,'published','suppressed' FROM public.news;
CREATE FUNCTION private.on_news_published_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.is_published AND (TG_OP='INSERT' OR OLD.is_published IS NOT TRUE) THEN
    INSERT INTO private.product_alert_jobs(kind,source_id,reason) VALUES('news',NEW.id,'published') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.on_news_published_alert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER news_publication_alert AFTER INSERT OR UPDATE OF is_published ON public.news FOR EACH ROW EXECUTE FUNCTION private.on_news_published_alert();

CREATE OR REPLACE FUNCTION public.notify_housing_seekers(p_accommodation_id uuid,p_kind text DEFAULT 'nuevo')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_kind NOT IN('nuevo','habitaciones') THEN RAISE EXCEPTION 'invalid_alert_kind'; END IF;
  IF EXISTS(SELECT 1 FROM public.accommodations WHERE id=p_accommodation_id AND status='active' AND is_paid AND deleted_at IS NULL) THEN
    INSERT INTO private.product_alert_jobs(kind,source_id,reason) VALUES('housing',p_accommodation_id,p_kind) ON CONFLICT DO NOTHING;
  END IF;
  RETURN 0; -- Asynchronous queue: no recipient has been notified yet.
END; $$;
REVOKE ALL ON FUNCTION public.notify_housing_seekers(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_housing_seekers(uuid,text) TO service_role;

CREATE FUNCTION public.process_product_alert_jobs(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job private.product_alert_jobs%ROWTYPE; person record; source record; anchor text; province text;
  caption text; message text; payload jsonb; notification_type text; last_user uuid;
  count_scanned integer:=0; count_inserted integer:=0; notification uuid; claimed uuid; batch integer:=greatest(1,least(coalesce(p_limit,200),500));
BEGIN
  SELECT * INTO job FROM private.product_alert_jobs WHERE status='pending' AND not_before<=now() ORDER BY audience_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('scanned',0,'inserted',0); END IF;
  BEGIN
    IF job.kind='news' THEN
      SELECT id,title,excerpt,slug FROM public.news WHERE id=job.source_id AND is_published INTO source;
      IF NOT FOUND THEN UPDATE private.product_alert_jobs SET status='suppressed' WHERE id=job.id; RETURN jsonb_build_object('suppressed',true); END IF;
      caption:='Novedades en Franky'; message:=left(source.title,480); notification_type:='news';
      payload:=jsonb_build_object('url','/noticias/'||source.slug,'news_id',source.id,'kind','news_published');
    ELSE
      SELECT a.id,a.title,a.city,a.owner_id,a.price,a.type,u.city AS university_city FROM public.accommodations a LEFT JOIN public.universities u ON u.id=a.university_id
        WHERE a.id=job.source_id AND a.status='active' AND a.is_paid AND a.deleted_at IS NULL INTO source;
      IF NOT FOUND THEN UPDATE private.product_alert_jobs SET status='suppressed' WHERE id=job.id; RETURN jsonb_build_object('suppressed',true); END IF;
      province:=coalesce(public.provincia_de(source.city),public.provincia_de(source.university_city));
      caption:='Nuevo alojamiento'||CASE WHEN province IS NOT NULL THEN ' en '||province ELSE '' END;
      message:=left(source.title||' · '||coalesce(source.city,'Consulta la ubicación')||CASE WHEN source.price IS NOT NULL THEN ' · '||source.price||' €/mes' ELSE '' END,480);
      notification_type:='accommodation';
      payload:=jsonb_build_object('url','/alojamiento/'||source.id,'accommodation_id',source.id,'kind',job.reason,'city',source.city,'provincia',province);
    END IF;
    FOR person IN
      SELECT p.id,p.is_discarded,p.looking_for_housing,p.desired_city,p.city,u.city AS university_city,
        h.city AS search_city,h.enabled AS search_enabled,h.searched_at,h.expires_at,h.budget_max
      FROM public.profiles p LEFT JOIN public.universities u ON u.id=p.university_id LEFT JOIN public.housing_search_intents h ON h.user_id=p.id
      WHERE (job.cursor_user_id IS NULL OR p.id>job.cursor_user_id) AND p.created_at<=job.audience_at ORDER BY p.id LIMIT batch
    LOOP
      count_scanned:=count_scanned+1; last_user:=person.id;
      IF person.is_discarded IS TRUE THEN CONTINUE; END IF;
      IF job.kind='housing' THEN
        IF person.id=source.owner_id OR person.search_enabled IS FALSE THEN CONTINUE; END IF;
        IF person.search_enabled AND person.searched_at>job.audience_at THEN CONTINUE; END IF;
        -- Latest explicit destination takes precedence, never OR it with an old home city.
        IF person.search_enabled AND person.expires_at>now() AND person.searched_at<=job.audience_at THEN
          anchor:=person.search_city;
          IF person.budget_max IS NOT NULL AND (source.price IS NULL OR source.price>person.budget_max) THEN CONTINUE; END IF;
        ELSIF person.looking_for_housing THEN anchor:=coalesce(nullif(trim(person.desired_city),''),nullif(trim(person.university_city),''),nullif(trim(person.city),''));
        ELSE CONTINUE; END IF;
        IF anchor IS NULL OR NOT coalesce((province IS NOT NULL AND public.provincia_de(anchor)=province)
          OR (province IS NULL AND public.normalizar_localidad(anchor)=public.normalizar_localidad(source.city)),false) THEN CONTINUE; END IF;
      END IF;
      notification:=gen_random_uuid(); claimed:=NULL;
      INSERT INTO private.product_alert_deliveries(user_id,kind,source_id,reason,notification_id)
        VALUES(person.id,job.kind,job.source_id,job.reason,notification)
        ON CONFLICT(user_id,kind,source_id,reason) DO UPDATE SET last_notified_at=now(),notification_id=excluded.notification_id
          WHERE excluded.kind='housing' AND private.product_alert_deliveries.last_notified_at<=now()-interval '30 days'
        RETURNING notification_id INTO claimed;
      IF claimed IS NOT NULL THEN
        INSERT INTO public.notifications(id,user_id,type,title,body,data) VALUES(notification,person.id,notification_type,caption,message,payload);
        count_inserted:=count_inserted+1;
      END IF;
    END LOOP;
    UPDATE private.product_alert_jobs SET cursor_user_id=coalesce(last_user,cursor_user_id),scanned=scanned+count_scanned,inserted=inserted+count_inserted,
      status=CASE WHEN count_scanned<batch THEN 'done' ELSE 'pending' END,attempts=0,last_error=NULL WHERE id=job.id;
  EXCEPTION WHEN OTHERS THEN
    -- The page and ledger roll back together. Keep the cursor and retry this page.
    UPDATE private.product_alert_jobs SET attempts=attempts+1,status=CASE WHEN attempts>=7 THEN 'failed' ELSE 'pending' END,
      last_error=left(SQLSTATE||': '||SQLERRM,300),not_before=now()+interval '5 minutes' WHERE id=job.id;
    RETURN jsonb_build_object('retry',true,'job_id',job.id);
  END;
  RETURN jsonb_build_object('scanned',count_scanned,'inserted',count_inserted,'job_id',job.id);
END; $$;
REVOKE ALL ON FUNCTION public.process_product_alert_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_product_alert_jobs(integer) TO service_role;

-- Enable only after the matching web push endpoint is deployed.
INSERT INTO public.app_settings(key,value) VALUES('product_alerts_enabled','false') ON CONFLICT(key) DO NOTHING;
SELECT cron.schedule('product-publication-alerts','* * * * *',
  $cron$SELECT public.process_product_alert_jobs(250) WHERE EXISTS(SELECT 1 FROM public.app_settings WHERE key='product_alerts_enabled' AND value='true');$cron$);
COMMIT;
