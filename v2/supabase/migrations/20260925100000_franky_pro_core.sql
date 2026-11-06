-- Franky Pro: la capa que conecta cada negocio con los estudiantes.
--
-- Se apoya en las organizaciones y permisos de la versión 2.4.0 de espacios
-- (organizations, organization_memberships, workspace_require). Añade lo que
-- el software de cada sector necesita y no existía:
--   * pro_profiles        ficha pública del negocio (slug franky.es/n/<slug>,
--                         enlace con su local de /ocio, Card y reservas).
--   * pro_offers          huecos relámpago, horas valle, primera visita...
--   * pro_offer_claims    plazas de una oferta que coge un estudiante.
--   * pro_menu_items      carta con los 14 alérgenos (RD 126/2015).
--   * pro_daily_menus     menú del día.
--   * pro_group_requests  peticiones de clases y asociaciones (cenas, previas).
--   * pro_shifts          registro de jornada (fichaje) del equipo.
--   * pro_reviews         reseñas solo de quien ha ido de verdad.
--   * pro_promoters       RRPP de la noche con su código.
--
-- Todo lo público excluye las organizaciones de demostración y las que no
-- están activas o publicadas. Las escrituras pasan por RPC con
-- workspace_require: nada se escribe directamente desde el cliente.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pro_profiles (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  vertical text NOT NULL CHECK (vertical IN (
    'hairdresser','beauty','cafe','bar','restaurant','pub','nightclub','sports',
    'sports_facility','academy','culture','coworking','agency','landlord','community','university')),
  public_slug text NOT NULL UNIQUE CHECK (public_slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  leisure_spot_id uuid UNIQUE REFERENCES public.leisure_spots(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 280),
  address text CHECK (length(address) <= 160),
  hours jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hours) = 'array' AND jsonb_array_length(hours) <= 7),
  booking_enabled boolean NOT NULL DEFAULT false,
  card_enabled boolean NOT NULL DEFAULT false,
  card_discount_pct smallint NOT NULL DEFAULT 5 CHECK (card_discount_pct BETWEEN 5 AND 100),
  walk_minutes_to_campus smallint CHECK (walk_minutes_to_campus BETWEEN 0 AND 240),
  campus_university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pro_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pro_profiles(organization_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('flash','valley','card','first_visit','group','exam')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 80),
  detail text NOT NULL CHECK (length(btrim(detail)) BETWEEN 3 AND 200),
  discount_pct smallint NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  price_cents integer CHECK (price_cents BETWEEN 0 AND 10000000),
  final_price_cents integer CHECK (final_price_cents BETWEEN 0 AND 10000000),
  starts_at timestamptz,
  ends_at timestamptz,
  days smallint[] CHECK (days IS NULL OR days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  from_minute smallint CHECK (from_minute BETWEEN 0 AND 1439),
  to_minute smallint CHECK (to_minute BETWEEN 1 AND 1440),
  slots integer NOT NULL DEFAULT 0 CHECK (slots BETWEEN 0 AND 1000),
  claimed integer NOT NULL DEFAULT 0 CHECK (claimed >= 0),
  students_only boolean NOT NULL DEFAULT true,
  radius_km smallint NOT NULL DEFAULT 2 CHECK (radius_km BETWEEN 1 AND 50),
  university_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('draft','scheduled','live','ended')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_offers_flash_window CHECK (
    kind <> 'flash' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at AND ends_at - starts_at <= interval '24 hours')),
  CONSTRAINT pro_offers_valley_window CHECK (
    kind <> 'valley' OR (days IS NOT NULL AND cardinality(days) > 0 AND from_minute IS NOT NULL AND to_minute IS NOT NULL AND to_minute > from_minute)),
  CONSTRAINT pro_offers_claimed_within_slots CHECK (slots = 0 OR claimed <= slots),
  CONSTRAINT pro_offers_final_price CHECK (final_price_cents IS NULL OR price_cents IS NULL OR final_price_cents <= price_cents)
);
CREATE INDEX IF NOT EXISTS pro_offers_live_idx ON public.pro_offers (status, ends_at);
CREATE INDEX IF NOT EXISTS pro_offers_org_idx ON public.pro_offers (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_offer_claims (
  offer_id uuid NOT NULL REFERENCES public.pro_offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','cancelled','used')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, user_id)
);
CREATE INDEX IF NOT EXISTS pro_offer_claims_user_idx ON public.pro_offer_claims (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pro_profiles(organization_id) ON DELETE CASCADE,
  section text NOT NULL CHECK (length(btrim(section)) BETWEEN 1 AND 60),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  description text CHECK (length(description) <= 280),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  allergens text[] NOT NULL DEFAULT '{}' CHECK (allergens <@ ARRAY[
    'gluten','crustaceos','huevo','pescado','cacahuete','soja','lacteos','frutos_cascara',
    'apio','mostaza','sesamo','sulfitos','altramuces','moluscos']::text[]),
  available boolean NOT NULL DEFAULT true,
  student_favorite boolean NOT NULL DEFAULT false,
  vegetarian boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_menu_items_org_idx ON public.pro_menu_items (organization_id, section, position);

CREATE TABLE IF NOT EXISTS public.pro_daily_menus (
  organization_id uuid NOT NULL REFERENCES public.pro_profiles(organization_id) ON DELETE CASCADE,
  menu_date date NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000),
  student_price_cents integer CHECK (student_price_cents BETWEEN 0 AND 100000),
  starters text[] NOT NULL DEFAULT '{}' CHECK (cardinality(starters) <= 12),
  mains text[] NOT NULL DEFAULT '{}' CHECK (cardinality(mains) <= 12),
  desserts text[] NOT NULL DEFAULT '{}' CHECK (cardinality(desserts) <= 12),
  includes text NOT NULL DEFAULT '' CHECK (length(includes) <= 160),
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, menu_date),
  CONSTRAINT pro_daily_menus_student_price CHECK (student_price_cents IS NULL OR student_price_cents <= price_cents)
);

CREATE TABLE IF NOT EXISTS public.pro_group_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pro_profiles(organization_id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizer_name text NOT NULL CHECK (length(btrim(organizer_name)) BETWEEN 2 AND 100),
  organization_name text NOT NULL DEFAULT '' CHECK (length(organization_name) <= 120),
  kind text NOT NULL CHECK (length(btrim(kind)) BETWEEN 3 AND 100),
  people integer NOT NULL CHECK (people BETWEEN 2 AND 1000),
  starts_at timestamptz NOT NULL,
  budget_per_person_cents integer NOT NULL DEFAULT 0 CHECK (budget_per_person_cents BETWEEN 0 AND 100000),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 1000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','quoted','accepted','declined','cancelled')),
  quote_cents integer CHECK (quote_cents BETWEEN 0 AND 100000),
  quote_includes text CHECK (length(quote_includes) <= 500),
  deposit_pct smallint CHECK (deposit_pct BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_group_requests_org_idx ON public.pro_group_requests (organization_id, status, starts_at);
CREATE INDEX IF NOT EXISTS pro_group_requests_requester_idx ON public.pro_group_requests (requester_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  in_at timestamptz NOT NULL DEFAULT now(),
  out_at timestamptz,
  break_minutes smallint NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_shifts_order CHECK (out_at IS NULL OR out_at > in_at)
);
-- Una sola jornada abierta por persona y organización.
CREATE UNIQUE INDEX IF NOT EXISTS pro_shifts_one_open_idx ON public.pro_shifts (organization_id, user_id) WHERE out_at IS NULL;
CREATE INDEX IF NOT EXISTS pro_shifts_org_idx ON public.pro_shifts (organization_id, in_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pro_profiles(organization_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 3 AND 1000),
  reply text CHECK (length(reply) <= 1000),
  replied_at timestamptz,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS pro_reviews_org_idx ON public.pro_reviews (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_promoters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.pro_profiles(organization_id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  code text NOT NULL CHECK (code ~ '^[a-z0-9]{3,20}$'),
  commission_cents_per_entry integer NOT NULL DEFAULT 0 CHECK (commission_cents_per_entry BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

-- ---------------------------------------------------------------------------
-- Acceso: todo cerrado por defecto; se lee y escribe con las funciones.
-- ---------------------------------------------------------------------------

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pro_profiles','pro_offers','pro_offer_claims','pro_menu_items','pro_daily_menus',
                           'pro_group_requests','pro_shifts','pro_reviews','pro_promoters'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Ayudantes internos
-- ---------------------------------------------------------------------------

-- El sector representa la clase de organización asignada, no una identidad que
-- el editor pueda elegir. Una universidad necesita la acreditación administrativa.
CREATE OR REPLACE FUNCTION public.pro_profile_kind_allowed(p_organization_id uuid, p_vertical text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id AND CASE o.kind
      WHEN 'leisure' THEN p_vertical IN ('hairdresser','beauty','cafe','bar','restaurant','pub','nightclub',
        'sports','sports_facility','academy','culture','coworking')
      WHEN 'housing' THEN p_vertical IN ('agency','landlord')
      WHEN 'community' THEN p_vertical = 'community'
      WHEN 'university' THEN p_vertical = 'university' AND o.verification_status = 'verified'
        AND EXISTS (SELECT 1 FROM public.organization_campuses c WHERE c.organization_id = o.id)
      ELSE false END)
$$;
REVOKE ALL ON FUNCTION public.pro_profile_kind_allowed(uuid,text) FROM PUBLIC, anon, authenticated;

-- Un negocio es visible para el público si está publicado, activo y no es demo.
CREATE OR REPLACE FUNCTION public.pro_is_public(p_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pro_profiles p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.organization_id = p_organization_id AND p.published
      AND o.status = 'active' AND o.demo_cohort_id IS NULL
      AND public.pro_profile_kind_allowed(o.id, p.vertical))
$$;
REVOKE ALL ON FUNCTION public.pro_is_public(uuid) FROM PUBLIC, anon, authenticated;

-- Las preferencias del perfil no conceden adhesión a Card ni fijan un descuento.
-- Solo se anuncia un beneficio que el motor de Card puede aplicar actualmente.
CREATE OR REPLACE FUNCTION public.pro_effective_card(p_organization_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH venues AS (
    SELECT v.id FROM public.franky_card_venues v
    JOIN public.organizations o ON o.id = v.organization_id
    JOIN public.franky_card_settings cfg ON cfg.singleton
    WHERE v.organization_id = p_organization_id AND v.status = 'active'
      AND v.demo_cohort_id IS NULL AND o.demo_cohort_id IS NULL AND o.status = 'active'
      AND cfg.enabled AND v.agreement_version = cfg.agreement_version
  ), offers AS (
    SELECT f.percent FROM public.franky_card_offers f JOIN venues v ON v.id = f.venue_id
    WHERE f.kind = 'base' AND f.status = 'active' AND f.starts_at <= now()
      AND (f.ends_at IS NULL OR f.ends_at > now())
  ), benefits AS (
    SELECT EXISTS(SELECT 1 FROM offers) OR EXISTS(
      SELECT 1 FROM public.franky_card_programs p JOIN venues v ON v.id = p.venue_id WHERE p.status = 'active') available
  )
  SELECT jsonb_build_object(
    'card_enabled', coalesce((SELECT card_enabled FROM public.pro_profiles WHERE organization_id = p_organization_id), false) AND b.available,
    'card_discount_pct', CASE WHEN b.available AND coalesce((SELECT card_enabled FROM public.pro_profiles
      WHERE organization_id = p_organization_id), false) THEN (SELECT min(percent) FROM offers) END)
  FROM benefits b
$$;
REVOKE ALL ON FUNCTION public.pro_effective_card(uuid) FROM PUBLIC, anon, authenticated;

-- ¿Es estudiante verificado? Correo universitario verificado y cuenta en uso.
CREATE OR REPLACE FUNCTION public.pro_is_verified_student(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND student_email_verified IS TRUE AND is_discarded IS NOT TRUE)
$$;
REVOKE ALL ON FUNCTION public.pro_is_verified_student(uuid) FROM PUBLIC, anon, authenticated;

-- Ofertas activas en este instante (relámpago en su franja, recurrentes en su
-- día y hora de Madrid, el resto mientras estén en estado live).
CREATE OR REPLACE FUNCTION public.pro_offer_is_active(o public.pro_offers, p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT o.status = 'live' AND (o.slots = 0 OR o.claimed < o.slots) AND CASE
    WHEN o.kind = 'flash' THEN p_at >= o.starts_at - interval '6 hours' AND p_at < o.ends_at
    WHEN o.kind = 'valley' THEN
      ((extract(isodow FROM p_at AT TIME ZONE 'Europe/Madrid')::int - 1)::smallint = ANY (o.days))
      AND (extract(hour FROM p_at AT TIME ZONE 'Europe/Madrid') * 60 + extract(minute FROM p_at AT TIME ZONE 'Europe/Madrid')) < o.to_minute
    ELSE o.ends_at IS NULL OR p_at < o.ends_at END
$$;
REVOKE ALL ON FUNCTION public.pro_offer_is_active(public.pro_offers, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pro_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pro_profiles','pro_offers','pro_offer_claims','pro_menu_items','pro_daily_menus','pro_group_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pro_touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Lado del negocio (requieren permiso en la organización)
-- ---------------------------------------------------------------------------

-- Crea o actualiza la ficha. El sector solo se fija la primera vez.
CREATE OR REPLACE FUNCTION public.pro_save_profile(p_organization_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.pro_profiles;
  v_slug text := lower(btrim(coalesce(p_data->>'public_slug', '')));
  v_spot uuid := nullif(p_data->>'leisure_spot_id', '')::uuid;
  v_constraint text;
  v_vertical text;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'settings.manage');
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'pro_invalid_input' USING ERRCODE = '22023'; END IF;
  SELECT vertical INTO v_vertical FROM public.pro_profiles WHERE organization_id = p_organization_id;
  v_vertical := coalesce(v_vertical, p_data->>'vertical');
  IF NOT public.pro_profile_kind_allowed(p_organization_id, v_vertical) THEN
    RAISE EXCEPTION 'pro_vertical_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Un local sin dueño no se convierte en propiedad del primer solicitante.
  -- La excepción administrativa exige una intención explícita y sesión con MFA.
  IF v_spot IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leisure_spots s WHERE s.id = v_spot AND (
      s.organization_id = p_organization_id
      OR (s.organization_id IS NULL AND s.owner_id = auth.uid())
      OR (coalesce((p_data->>'admin_link_override')::boolean, false)
        AND public.is_admin() AND auth.jwt()->>'aal' = 'aal2' AND public.current_demo_cohort() IS NULL))) THEN
    RAISE EXCEPTION 'pro_spot_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Actualización parcial: solo cambia lo que llega. El sector no se toca.
  UPDATE public.pro_profiles p SET
    public_slug = CASE WHEN p_data ? 'public_slug' THEN v_slug ELSE p.public_slug END,
    leisure_spot_id = CASE WHEN p_data ? 'leisure_spot_id' THEN v_spot ELSE p.leisure_spot_id END,
    description = CASE WHEN p_data ? 'description' THEN coalesce(p_data->>'description', '') ELSE p.description END,
    address = CASE WHEN p_data ? 'address' THEN nullif(p_data->>'address', '') ELSE p.address END,
    hours = CASE WHEN p_data ? 'hours' THEN coalesce(p_data->'hours', '[]'::jsonb) ELSE p.hours END,
    booking_enabled = CASE WHEN p_data ? 'booking_enabled' THEN coalesce((p_data->>'booking_enabled')::boolean, false) ELSE p.booking_enabled END,
    card_enabled = CASE WHEN p_data ? 'card_enabled' THEN coalesce((p_data->>'card_enabled')::boolean, false) ELSE p.card_enabled END,
    card_discount_pct = CASE WHEN p_data ? 'card_discount_pct' THEN coalesce((p_data->>'card_discount_pct')::smallint, 5) ELSE p.card_discount_pct END,
    walk_minutes_to_campus = CASE WHEN p_data ? 'walk_minutes_to_campus' THEN nullif(p_data->>'walk_minutes_to_campus', '')::smallint ELSE p.walk_minutes_to_campus END,
    campus_university_id = CASE WHEN p_data ? 'campus_university_id' THEN nullif(p_data->>'campus_university_id', '')::uuid ELSE p.campus_university_id END,
    published = CASE WHEN p_data ? 'published' THEN coalesce((p_data->>'published')::boolean, false) ELSE p.published END
  WHERE p.organization_id = p_organization_id
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    INSERT INTO public.pro_profiles (organization_id, vertical, public_slug, leisure_spot_id, description, address, hours,
      booking_enabled, card_enabled, card_discount_pct, walk_minutes_to_campus, campus_university_id, published)
    VALUES (
      p_organization_id,
      p_data->>'vertical',
      v_slug,
      v_spot,
      coalesce(p_data->>'description', ''),
      nullif(p_data->>'address', ''),
      coalesce(p_data->'hours', '[]'::jsonb),
      coalesce((p_data->>'booking_enabled')::boolean, false),
      coalesce((p_data->>'card_enabled')::boolean, false),
      coalesce((p_data->>'card_discount_pct')::smallint, 5),
      nullif(p_data->>'walk_minutes_to_campus', '')::smallint,
      nullif(p_data->>'campus_university_id', '')::uuid,
      coalesce((p_data->>'published')::boolean, false))
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint LIKE '%leisure_spot%' THEN RAISE EXCEPTION 'pro_spot_taken' USING ERRCODE = '23505'; END IF;
  RAISE EXCEPTION 'pro_slug_taken' USING ERRCODE = '23505';
END $$;

-- Crea una oferta. El precio final lo calcula el servidor.
CREATE OR REPLACE FUNCTION public.pro_save_offer(p_organization_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.pro_offers;
  v_price integer := nullif(p_data->>'price_cents', '')::integer;
  v_pct smallint := coalesce((p_data->>'discount_pct')::smallint, 0);
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'content.manage');
  IF NOT EXISTS (SELECT 1 FROM public.pro_profiles WHERE organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'pro_profile_required' USING ERRCODE = '22023';
  END IF;
  -- Freno al abuso: como mucho 10 ofertas relámpago vivas a la vez por negocio.
  IF p_data->>'kind' = 'flash' AND (SELECT count(*) FROM public.pro_offers
      WHERE organization_id = p_organization_id AND kind = 'flash' AND status = 'live' AND ends_at > now()) >= 10 THEN
    RAISE EXCEPTION 'pro_offer_limit' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.pro_offers (organization_id, kind, title, detail, discount_pct, price_cents, final_price_cents,
    starts_at, ends_at, days, from_minute, to_minute, slots, students_only, radius_km, university_ids, status, created_by)
  VALUES (
    p_organization_id,
    p_data->>'kind',
    btrim(p_data->>'title'),
    btrim(p_data->>'detail'),
    v_pct,
    v_price,
    CASE WHEN v_price IS NULL THEN NULL ELSE round(v_price * (100 - v_pct) / 100.0)::integer END,
    nullif(p_data->>'starts_at', '')::timestamptz,
    nullif(p_data->>'ends_at', '')::timestamptz,
    CASE WHEN p_data ? 'days' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'days')::smallint) END,
    nullif(p_data->>'from_minute', '')::smallint,
    nullif(p_data->>'to_minute', '')::smallint,
    coalesce((p_data->>'slots')::integer, 0),
    coalesce((p_data->>'students_only')::boolean, true),
    coalesce((p_data->>'radius_km')::smallint, 2),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'university_ids', '[]'::jsonb))::uuid), '{}'),
    coalesce(p_data->>'status', 'live'),
    auth.uid())
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.pro_set_offer_status(p_offer_id uuid, p_status text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_offers;
BEGIN
  SELECT * INTO v_row FROM public.pro_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.workspace_require(v_row.organization_id, 'content.manage');
  IF p_status NOT IN ('live','ended','draft','scheduled') THEN RAISE EXCEPTION 'pro_invalid_input' USING ERRCODE = '22023'; END IF;
  UPDATE public.pro_offers SET status = p_status WHERE id = p_offer_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.pro_save_menu_item(p_organization_id uuid, p_item_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_menu_items;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'content.manage');
  IF coalesce((p_data->>'delete')::boolean, false) THEN
    DELETE FROM public.pro_menu_items WHERE id = p_item_id AND organization_id = p_organization_id;
    RETURN jsonb_build_object('deleted', p_item_id);
  END IF;
  IF p_item_id IS NULL THEN
    INSERT INTO public.pro_menu_items (organization_id, section, name, description, price_cents, allergens, available, student_favorite, vegetarian, position)
    VALUES (p_organization_id, btrim(p_data->>'section'), btrim(p_data->>'name'), nullif(p_data->>'description', ''),
      (p_data->>'price_cents')::integer,
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'allergens', '[]'::jsonb))), '{}'),
      coalesce((p_data->>'available')::boolean, true), coalesce((p_data->>'student_favorite')::boolean, false),
      coalesce((p_data->>'vegetarian')::boolean, false), coalesce((p_data->>'position')::integer, 0))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pro_menu_items SET
      section = coalesce(btrim(p_data->>'section'), section),
      name = coalesce(btrim(p_data->>'name'), name),
      description = CASE WHEN p_data ? 'description' THEN nullif(p_data->>'description', '') ELSE description END,
      price_cents = coalesce((p_data->>'price_cents')::integer, price_cents),
      allergens = CASE WHEN p_data ? 'allergens' THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(p_data->'allergens')), '{}') ELSE allergens END,
      available = coalesce((p_data->>'available')::boolean, available),
      student_favorite = coalesce((p_data->>'student_favorite')::boolean, student_favorite),
      vegetarian = coalesce((p_data->>'vegetarian')::boolean, vegetarian),
      position = coalesce((p_data->>'position')::integer, position)
    WHERE id = p_item_id AND organization_id = p_organization_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.pro_save_daily_menu(p_organization_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_daily_menus;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'content.manage');
  INSERT INTO public.pro_daily_menus AS m (organization_id, menu_date, price_cents, student_price_cents, starters, mains, desserts, includes, published)
  VALUES (p_organization_id,
    coalesce(nullif(p_data->>'menu_date', '')::date, (now() AT TIME ZONE 'Europe/Madrid')::date),
    (p_data->>'price_cents')::integer,
    nullif(p_data->>'student_price_cents', '')::integer,
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'starters', '[]'::jsonb))), '{}'),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'mains', '[]'::jsonb))), '{}'),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'desserts', '[]'::jsonb))), '{}'),
    coalesce(p_data->>'includes', ''),
    coalesce((p_data->>'published')::boolean, false))
  ON CONFLICT (organization_id, menu_date) DO UPDATE SET
    price_cents = EXCLUDED.price_cents, student_price_cents = EXCLUDED.student_price_cents,
    starters = EXCLUDED.starters, mains = EXCLUDED.mains, desserts = EXCLUDED.desserts,
    includes = EXCLUDED.includes, published = EXCLUDED.published
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

-- Presupuestar, aceptar en nombre del grupo no: eso lo hace el organizador.
CREATE OR REPLACE FUNCTION public.pro_respond_group_request(p_request_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_group_requests;
BEGIN
  SELECT * INTO v_row FROM public.pro_group_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.workspace_require(v_row.organization_id, 'content.manage');
  IF v_row.status NOT IN ('new','quoted') THEN RAISE EXCEPTION 'pro_request_closed' USING ERRCODE = '22023'; END IF;
  IF p_action = 'quote' THEN
    UPDATE public.pro_group_requests SET status = 'quoted',
      quote_cents = (p_data->>'quote_cents')::integer,
      quote_includes = nullif(p_data->>'quote_includes', ''),
      deposit_pct = coalesce((p_data->>'deposit_pct')::smallint, 0)
    WHERE id = p_request_id RETURNING * INTO v_row;
  ELSIF p_action = 'decline' THEN
    UPDATE public.pro_group_requests SET status = 'declined' WHERE id = p_request_id RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'pro_invalid_input' USING ERRCODE = '22023';
  END IF;
  -- La escritura confirma el resultado sin exponer datos de otros permisos.
  -- Los datos completos se recuperan por el lector con su proyección autorizada.
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END $$;

-- Fichaje: entra si no hay jornada abierta, sale si la hay.
CREATE OR REPLACE FUNCTION public.pro_clock(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_shifts;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  UPDATE public.pro_shifts SET out_at = now()
  WHERE organization_id = p_organization_id AND user_id = auth.uid() AND out_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    INSERT INTO public.pro_shifts (organization_id, user_id) VALUES (p_organization_id, auth.uid()) RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END $$;

-- Registro de jornada: cada persona ve el suyo; quien gestiona el equipo, el de todos.
CREATE OR REPLACE FUNCTION public.pro_list_shifts(p_organization_id uuid, p_from timestamptz, p_until timestamptz) RETURNS SETOF public.pro_shifts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  IF p_until - p_from > interval '400 days' THEN RAISE EXCEPTION 'pro_invalid_input' USING ERRCODE = '22023'; END IF;
  RETURN QUERY SELECT s.* FROM public.pro_shifts s
    WHERE s.organization_id = p_organization_id AND s.in_at >= p_from AND s.in_at < p_until
      AND (s.user_id = auth.uid() OR public.has_organization_permission(p_organization_id, 'members.manage'))
    ORDER BY s.in_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.pro_reply_review(p_review_id uuid, p_reply text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_reviews;
BEGIN
  SELECT * INTO v_row FROM public.pro_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.workspace_require(v_row.organization_id, 'content.manage');
  UPDATE public.pro_reviews SET reply = nullif(btrim(p_reply), ''), replied_at = now() WHERE id = p_review_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

-- Todo lo de Franky Pro de un espacio, para pintar la app del negocio.
CREATE OR REPLACE FUNCTION public.pro_get_space(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE can_operate boolean; can_finance boolean;
BEGIN
  PERFORM public.workspace_require(p_organization_id, 'resource.read');
  can_operate := public.has_organization_permission(p_organization_id, 'content.manage')
    OR public.has_organization_permission(p_organization_id, 'attendees.manage');
  can_finance := public.has_organization_permission(p_organization_id, 'finance.read');
  RETURN jsonb_build_object(
    'organization', (SELECT jsonb_build_object('id', o.id, 'name', o.name, 'city', o.city, 'kind', o.kind, 'demo', o.demo_cohort_id IS NOT NULL)
                     FROM public.organizations o WHERE o.id = p_organization_id),
    'profile', (SELECT to_jsonb(p) FROM public.pro_profiles p WHERE p.organization_id = p_organization_id),
    'offers', coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC) FROM (
       SELECT * FROM public.pro_offers WHERE organization_id = p_organization_id ORDER BY created_at DESC LIMIT 100) o), '[]'::jsonb),
    'menu', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.section, m.position) FROM public.pro_menu_items m
       WHERE m.organization_id = p_organization_id), '[]'::jsonb),
    'daily_menu', (SELECT to_jsonb(d) FROM public.pro_daily_menus d WHERE d.organization_id = p_organization_id
       AND d.menu_date = (now() AT TIME ZONE 'Europe/Madrid')::date),
    'group_requests', CASE WHEN can_operate OR can_finance THEN coalesce((SELECT jsonb_agg(
       jsonb_build_object('id', g.id, 'starts_at', g.starts_at, 'people', g.people, 'status', g.status, 'created_at', g.created_at)
       || CASE WHEN can_operate THEN jsonb_build_object('organizer_name', g.organizer_name,
         'organization_name', g.organization_name, 'kind', g.kind, 'message', g.message, 'quote_includes', g.quote_includes)
         ELSE '{}'::jsonb END
       || CASE WHEN can_finance THEN jsonb_build_object('budget_per_person_cents', g.budget_per_person_cents,
         'quote_cents', g.quote_cents, 'deposit_pct', g.deposit_pct) ELSE '{}'::jsonb END
       ORDER BY g.starts_at) FROM (
       SELECT * FROM public.pro_group_requests WHERE organization_id = p_organization_id AND status IN ('new','quoted','accepted')
       ORDER BY starts_at LIMIT 200) g), '[]'::jsonb) ELSE '[]'::jsonb END,
    'reviews', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'reply', r.reply,
       'created_at', r.created_at, 'author', split_part(coalesce(pr.full_name, 'Estudiante'), ' ', 1)) ORDER BY r.created_at DESC)
       FROM (SELECT * FROM public.pro_reviews WHERE organization_id = p_organization_id AND NOT hidden ORDER BY created_at DESC LIMIT 50) r
       LEFT JOIN public.profiles pr ON pr.id = r.user_id), '[]'::jsonb),
    'promoters', CASE WHEN can_operate OR can_finance THEN coalesce((SELECT jsonb_agg(
       jsonb_build_object('id', x.id, 'active', x.active, 'created_at', x.created_at)
       || CASE WHEN can_operate THEN jsonb_build_object('name', x.name, 'code', x.code) ELSE '{}'::jsonb END
       || CASE WHEN can_finance THEN jsonb_build_object('commission_cents_per_entry', x.commission_cents_per_entry)
         ELSE '{}'::jsonb END ORDER BY x.created_at)
       FROM public.pro_promoters x WHERE x.organization_id = p_organization_id), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END $$;

-- ---------------------------------------------------------------------------
-- Lado del estudiante y del público
-- ---------------------------------------------------------------------------

-- Ficha pública de un negocio: franky.es/n/<slug>.
CREATE OR REPLACE FUNCTION public.get_pro_public_profile(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.pro_profiles p WHERE p.public_slug = lower(btrim(p_slug));
  IF v_org IS NULL OR NOT public.pro_is_public(v_org) THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'organization_id', o.id,
      'name', o.name,
      'city', o.city,
      'vertical', p.vertical,
      'slug', p.public_slug,
      'description', p.description,
      'address', p.address,
      'hours', p.hours,
      'booking_enabled', p.booking_enabled,
      'card_enabled', (public.pro_effective_card(o.id)->>'card_enabled')::boolean,
      'card_discount_pct', (public.pro_effective_card(o.id)->>'card_discount_pct')::integer,
      'walk_minutes_to_campus', p.walk_minutes_to_campus,
      'leisure_spot_id', p.leisure_spot_id,
      'image_url', s.image_url,
      'rating', (SELECT round(avg(rating)::numeric, 1) FROM public.pro_reviews WHERE organization_id = o.id AND NOT hidden),
      'reviews_count', (SELECT count(*) FROM public.pro_reviews WHERE organization_id = o.id AND NOT hidden),
      'offers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'title', f.title, 'detail', f.detail,
          'discount_pct', f.discount_pct, 'price_cents', f.price_cents, 'final_price_cents', f.final_price_cents,
          'starts_at', f.starts_at, 'ends_at', f.ends_at, 'slots_left', CASE WHEN f.slots = 0 THEN NULL ELSE f.slots - f.claimed END,
          'students_only', f.students_only) ORDER BY f.ends_at NULLS LAST)
        FROM public.pro_offers f WHERE f.organization_id = o.id AND public.pro_offer_is_active(f)), '[]'::jsonb),
      'menu', coalesce((SELECT jsonb_agg(jsonb_build_object('section', m.section, 'name', m.name, 'description', m.description,
          'price_cents', m.price_cents, 'allergens', m.allergens, 'student_favorite', m.student_favorite, 'vegetarian', m.vegetarian)
          ORDER BY m.section, m.position)
        FROM public.pro_menu_items m WHERE m.organization_id = o.id AND m.available), '[]'::jsonb),
      'daily_menu', (SELECT jsonb_build_object('price_cents', d.price_cents, 'student_price_cents', d.student_price_cents,
          'starters', d.starters, 'mains', d.mains, 'desserts', d.desserts, 'includes', d.includes)
        FROM public.pro_daily_menus d WHERE d.organization_id = o.id AND d.published
          AND d.menu_date = (now() AT TIME ZONE 'Europe/Madrid')::date),
      'reviews', coalesce((SELECT jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'reply', r.reply, 'created_at', r.created_at,
          'author', split_part(coalesce(pr.full_name, 'Estudiante'), ' ', 1)) ORDER BY r.created_at DESC)
        FROM (SELECT * FROM public.pro_reviews WHERE organization_id = o.id AND NOT hidden ORDER BY created_at DESC LIMIT 6) r
        LEFT JOIN public.profiles pr ON pr.id = r.user_id), '[]'::jsonb))
    FROM public.organizations o
    JOIN public.pro_profiles p ON p.organization_id = o.id
    LEFT JOIN public.leisure_spots s ON s.id = p.leisure_spot_id
    WHERE o.id = v_org);
END $$;

-- "Ahora cerca": ofertas activas de la ciudad, las más cercanas primero si se
-- conoce la posición. Sin datos personales: solo del negocio y la oferta.
CREATE OR REPLACE FUNCTION public.list_pro_live_offers(p_city text DEFAULT NULL, p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL, p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'distance_km')::float NULLS LAST, x->>'ends_at'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', f.id, 'kind', f.kind, 'title', f.title, 'detail', f.detail, 'discount_pct', f.discount_pct,
      'price_cents', f.price_cents, 'final_price_cents', f.final_price_cents,
      'starts_at', f.starts_at, 'ends_at', f.ends_at,
      'slots_left', CASE WHEN f.slots = 0 THEN NULL ELSE f.slots - f.claimed END,
      'students_only', f.students_only,
      'business', jsonb_build_object('name', o.name, 'slug', p.public_slug, 'vertical', p.vertical, 'city', o.city,
                                     'walk_minutes_to_campus', p.walk_minutes_to_campus, 'image_url', s.image_url),
      'distance_km', CASE WHEN p_lat IS NULL OR p_lng IS NULL OR s.latitude IS NULL OR s.longitude IS NULL THEN NULL
        ELSE round((6371 * 2 * asin(sqrt(power(sin(radians(s.latitude - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(s.latitude)) * power(sin(radians(s.longitude - p_lng) / 2), 2))))::numeric, 2) END
    ) AS x
    FROM public.pro_offers f
    JOIN public.pro_profiles p ON p.organization_id = f.organization_id
    JOIN public.organizations o ON o.id = f.organization_id
    LEFT JOIN public.leisure_spots s ON s.id = p.leisure_spot_id
    WHERE public.pro_is_public(o.id)
      AND f.kind IN ('flash','valley','first_visit','exam')
      AND public.pro_offer_is_active(f)
      AND (p_city IS NULL OR o.city ILIKE p_city)
    ORDER BY f.ends_at NULLS LAST
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  ) q
$$;

-- Para /ocio/[id]: si ese local está en Franky Pro, a dónde lleva "Reservar".
CREATE OR REPLACE FUNCTION public.get_pro_link_for_spot(p_spot_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('slug', p.public_slug, 'vertical', p.vertical, 'booking_enabled', p.booking_enabled,
    'card_enabled', (public.pro_effective_card(p.organization_id)->>'card_enabled')::boolean,
    'card_discount_pct', (public.pro_effective_card(p.organization_id)->>'card_discount_pct')::integer,
    'live_offers', (SELECT count(*) FROM public.pro_offers f WHERE f.organization_id = p.organization_id AND public.pro_offer_is_active(f)))
  FROM public.pro_profiles p
  WHERE p.leisure_spot_id = p_spot_id AND public.pro_is_public(p.organization_id)
$$;

-- Coger una plaza de una oferta. Atómico: la última plaza la coge una sola persona.
CREATE OR REPLACE FUNCTION public.claim_pro_offer(p_offer_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_offer public.pro_offers;
  v_existing public.pro_offer_claims;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_offer FROM public.pro_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pro_is_public(v_offer.organization_id) THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_existing FROM public.pro_offer_claims WHERE offer_id = p_offer_id AND user_id = auth.uid();
  IF FOUND AND v_existing.status IN ('claimed','used') THEN
    RETURN jsonb_build_object('status', v_existing.status, 'offer_id', p_offer_id, 'already', true);
  END IF;
  IF NOT public.pro_offer_is_active(v_offer) THEN RAISE EXCEPTION 'pro_offer_unavailable' USING ERRCODE = '22023'; END IF;
  IF v_offer.students_only AND NOT public.pro_is_verified_student(auth.uid()) THEN
    RAISE EXCEPTION 'pro_student_required' USING ERRCODE = '42501';
  END IF;
  IF cardinality(v_offer.university_ids) > 0 AND NOT EXISTS (
      SELECT 1 FROM unnest(v_offer.university_ids) campus
      WHERE workspace_private.verified_affiliation(auth.uid(), campus)) THEN
    RAISE EXCEPTION 'pro_offer_other_university' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.pro_offer_claims (offer_id, user_id) VALUES (p_offer_id, auth.uid())
  ON CONFLICT (offer_id, user_id) DO UPDATE SET status = 'claimed';
  UPDATE public.pro_offers SET claimed = claimed + 1 WHERE id = p_offer_id;
  RETURN jsonb_build_object('status', 'claimed', 'offer_id', p_offer_id, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_pro_offer_claim(p_offer_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.pro_offers WHERE id = p_offer_id FOR UPDATE;
  UPDATE public.pro_offer_claims SET status = 'cancelled' WHERE offer_id = p_offer_id AND user_id = auth.uid() AND status = 'claimed';
  IF FOUND THEN UPDATE public.pro_offers SET claimed = greatest(claimed - 1, 0) WHERE id = p_offer_id; END IF;
  RETURN jsonb_build_object('status', 'cancelled', 'offer_id', p_offer_id);
END $$;

-- Un delegado o una asociación pide presupuesto a un negocio.
CREATE OR REPLACE FUNCTION public.request_pro_group_quote(p_slug text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_row public.pro_group_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  SELECT organization_id INTO v_org FROM public.pro_profiles WHERE public_slug = lower(btrim(p_slug));
  IF v_org IS NULL OR NOT public.pro_is_public(v_org) THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  -- Como mucho 5 peticiones abiertas por persona: evita inundar a un negocio.
  IF (SELECT count(*) FROM public.pro_group_requests WHERE requester_id = auth.uid() AND status IN ('new','quoted')) >= 5 THEN
    RAISE EXCEPTION 'pro_request_limit' USING ERRCODE = '54000';
  END IF;
  IF (p_data->>'starts_at')::timestamptz < now() THEN RAISE EXCEPTION 'pro_invalid_input' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.pro_group_requests (organization_id, requester_id, organizer_name, organization_name, kind, people, starts_at,
    budget_per_person_cents, message)
  VALUES (v_org, auth.uid(), btrim(p_data->>'organizer_name'), coalesce(btrim(p_data->>'organization_name'), ''), btrim(p_data->>'kind'),
    (p_data->>'people')::integer, (p_data->>'starts_at')::timestamptz, coalesce((p_data->>'budget_per_person_cents')::integer, 0),
    coalesce(p_data->>'message', ''))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row) - 'requester_id';
END $$;

-- El organizador acepta o cancela el presupuesto recibido.
CREATE OR REPLACE FUNCTION public.answer_pro_group_quote(p_request_id uuid, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.pro_group_requests;
BEGIN
  SELECT * INTO v_row FROM public.pro_group_requests WHERE id = p_request_id AND requester_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_accept AND v_row.status <> 'quoted' THEN RAISE EXCEPTION 'pro_request_closed' USING ERRCODE = '22023'; END IF;
  IF v_row.status NOT IN ('new','quoted') THEN RAISE EXCEPTION 'pro_request_closed' USING ERRCODE = '22023'; END IF;
  UPDATE public.pro_group_requests SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'cancelled' END
  WHERE id = p_request_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row) - 'requester_id';
END $$;

-- Reseña: solo quien ha ido (cita atendida en el negocio o plaza de oferta usada).
CREATE OR REPLACE FUNCTION public.review_pro_business(p_slug text, p_rating integer, p_body text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_row public.pro_reviews;
  v_visited boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  SELECT organization_id INTO v_org FROM public.pro_profiles WHERE public_slug = lower(btrim(p_slug));
  IF v_org IS NULL OR NOT public.pro_is_public(v_org) THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  v_visited := EXISTS (SELECT 1 FROM public.pro_offer_claims c JOIN public.pro_offers f ON f.id = c.offer_id
                       WHERE f.organization_id = v_org AND c.user_id = auth.uid() AND c.status = 'used');
  IF NOT v_visited AND to_regclass('public.professional_bookings') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.professional_bookings b JOIN public.professional_customers c ON c.id = b.customer_id
             WHERE b.organization_id = $1 AND c.user_id = $2 AND b.status = ''attended'')'
      INTO v_visited USING v_org, auth.uid();
  END IF;
  IF NOT v_visited THEN RAISE EXCEPTION 'pro_visit_required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.pro_reviews (organization_id, user_id, rating, body)
  VALUES (v_org, auth.uid(), p_rating, btrim(p_body))
  ON CONFLICT (organization_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, created_at = now()
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row) - 'user_id';
END $$;

-- El negocio marca en caja que una plaza de oferta se ha usado (y abre la reseña).
CREATE OR REPLACE FUNCTION public.pro_mark_claim_used(p_offer_id uuid, p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.pro_offers WHERE id = p_offer_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.workspace_require(v_org, 'attendees.manage');
  UPDATE public.pro_offer_claims SET status = 'used' WHERE offer_id = p_offer_id AND user_id = p_user_id AND status = 'claimed';
  IF NOT FOUND THEN RAISE EXCEPTION 'pro_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('status', 'used');
END $$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'pro_save_profile(uuid,jsonb)', 'pro_save_offer(uuid,jsonb)', 'pro_set_offer_status(uuid,text)',
    'pro_save_menu_item(uuid,uuid,jsonb)', 'pro_save_daily_menu(uuid,jsonb)', 'pro_respond_group_request(uuid,text,jsonb)',
    'pro_clock(uuid)', 'pro_list_shifts(uuid,timestamptz,timestamptz)', 'pro_reply_review(uuid,text)', 'pro_get_space(uuid)',
    'claim_pro_offer(uuid)', 'cancel_pro_offer_claim(uuid)', 'request_pro_group_quote(text,jsonb)', 'answer_pro_group_quote(uuid,boolean)',
    'review_pro_business(text,integer,text)', 'pro_mark_claim_used(uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['get_pro_public_profile(text)', 'list_pro_live_offers(text,double precision,double precision,integer)',
                           'get_pro_link_for_spot(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated, service_role', f);
  END LOOP;
END $$;
