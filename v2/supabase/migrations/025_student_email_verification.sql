-- =====================================================
-- 025: Student email verification + friend search
-- =====================================================
-- Goal: only verified students can search and add friends.
-- A student's email must match a recognised academic domain
-- (e.g. @alu.uma.es, @gcloud.ua.es, @estudiantes.unizar.es).

-- ─────────────────────────────────────────────────────
-- 1. profiles columns
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_email TEXT,
  ADD COLUMN IF NOT EXISTS student_email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS student_email_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_student_email_verified
  ON public.profiles (lower(student_email))
  WHERE student_email_verified = true;

-- ─────────────────────────────────────────────────────
-- 2. Recognised academic domains
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_email_domains (
  domain        TEXT PRIMARY KEY,
  university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.student_email_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "domains_read_all" ON public.student_email_domains;
CREATE POLICY "domains_read_all" ON public.student_email_domains
  FOR SELECT TO authenticated, anon USING (true);

-- Seed common Spanish university domains (extendable from admin UI later)
INSERT INTO public.student_email_domains (domain, notes) VALUES
  ('alu.ua.es', 'Universidad de Alicante'),
  ('gcloud.ua.es', 'Universidad de Alicante'),
  ('ua.es', 'Universidad de Alicante (staff/legacy)'),
  ('alu.uma.es', 'Universidad de Málaga'),
  ('uma.es', 'Universidad de Málaga'),
  ('alu.umh.es', 'Universidad Miguel Hernández'),
  ('umh.es', 'Universidad Miguel Hernández'),
  ('alumnos.upv.es', 'Universitat Politècnica de València'),
  ('upv.es', 'Universitat Politècnica de València'),
  ('upm.es', 'Universidad Politécnica de Madrid'),
  ('alumnos.upm.es', 'Universidad Politécnica de Madrid'),
  ('estudiantes.unizar.es', 'Universidad de Zaragoza'),
  ('unizar.es', 'Universidad de Zaragoza'),
  ('alu.usal.es', 'Universidad de Salamanca'),
  ('usal.es', 'Universidad de Salamanca'),
  ('rai.usc.es', 'Universidade de Santiago de Compostela'),
  ('usc.es', 'Universidade de Santiago de Compostela'),
  ('alumnos.uam.es', 'Universidad Autónoma de Madrid'),
  ('uam.es', 'Universidad Autónoma de Madrid'),
  ('alumnos.uca.es', 'Universidad de Cádiz'),
  ('uca.es', 'Universidad de Cádiz'),
  ('alumnos.ucm.es', 'Universidad Complutense de Madrid'),
  ('ucm.es', 'Universidad Complutense de Madrid'),
  ('alumnos.us.es', 'Universidad de Sevilla'),
  ('us.es', 'Universidad de Sevilla'),
  ('alumnos.uniovi.es', 'Universidad de Oviedo'),
  ('uniovi.es', 'Universidad de Oviedo'),
  ('alumnos.upo.es', 'Universidad Pablo de Olavide'),
  ('upo.es', 'Universidad Pablo de Olavide'),
  ('alumnos.uji.es', 'Universitat Jaume I'),
  ('uji.es', 'Universitat Jaume I'),
  ('alu.uv.es', 'Universitat de València'),
  ('uv.es', 'Universitat de València'),
  ('alumnos.uam.es', 'Universidad Autónoma de Madrid'),
  ('alumnos.uc3m.es', 'Universidad Carlos III de Madrid'),
  ('uc3m.es', 'Universidad Carlos III de Madrid'),
  ('alumnes.uab.cat', 'Universitat Autònoma de Barcelona'),
  ('uab.cat', 'Universitat Autònoma de Barcelona'),
  ('alumnes.ub.edu', 'Universitat de Barcelona'),
  ('ub.edu', 'Universitat de Barcelona'),
  ('estudiantat.upc.edu', 'Universitat Politècnica de Catalunya'),
  ('upc.edu', 'Universitat Politècnica de Catalunya'),
  ('alumnes.urv.cat', 'Universitat Rovira i Virgili'),
  ('urv.cat', 'Universitat Rovira i Virgili'),
  ('uoc.edu', 'Universitat Oberta de Catalunya'),
  ('alumnos.unirioja.es', 'Universidad de La Rioja'),
  ('unirioja.es', 'Universidad de La Rioja'),
  ('alumnos.udl.cat', 'Universitat de Lleida'),
  ('udl.cat', 'Universitat de Lleida'),
  ('alumnos.uvigo.es', 'Universidad de Vigo'),
  ('uvigo.es', 'Universidad de Vigo'),
  ('alumnos.unican.es', 'Universidad de Cantabria'),
  ('unican.es', 'Universidad de Cantabria'),
  ('alumnos.unileon.es', 'Universidad de León'),
  ('unileon.es', 'Universidad de León'),
  ('alumnos.um.es', 'Universidad de Murcia'),
  ('um.es', 'Universidad de Murcia'),
  ('alumno.upct.es', 'Universidad Politécnica de Cartagena'),
  ('upct.es', 'Universidad Politécnica de Cartagena'),
  ('ehu.eus', 'Universidad del País Vasco'),
  ('ikasle.ehu.eus', 'Universidad del País Vasco'),
  ('alumnos.unav.es', 'Universidad de Navarra'),
  ('unav.es', 'Universidad de Navarra'),
  ('alumnos.unex.es', 'Universidad de Extremadura'),
  ('unex.es', 'Universidad de Extremadura')
ON CONFLICT (domain) DO NOTHING;

-- ─────────────────────────────────────────────────────
-- 3. student_email_verifications (tokens)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_email_verifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sev_user ON public.student_email_verifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sev_token ON public.student_email_verifications(token) WHERE used_at IS NULL;

ALTER TABLE public.student_email_verifications ENABLE ROW LEVEL SECURITY;
-- Only owner can read their pending verifications (UI helpers)
DROP POLICY IF EXISTS "sev_select_own" ON public.student_email_verifications;
CREATE POLICY "sev_select_own" ON public.student_email_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Inserts/updates go through SECURITY DEFINER RPCs only
DROP POLICY IF EXISTS "sev_no_direct_writes" ON public.student_email_verifications;
CREATE POLICY "sev_no_direct_writes" ON public.student_email_verifications
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────
-- 4. Helper: extract domain from email
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._email_domain(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(split_part(trim(p_email), '@', 2));
$$;

-- ─────────────────────────────────────────────────────
-- 5. RPC: request_student_email_verification
--    Validates email/domain, generates token, returns token + email
--    The web layer is then responsible for sending the email.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_student_email_verification(p_email TEXT)
RETURNS TABLE (token TEXT, email TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_email   TEXT := lower(trim(p_email));
  v_domain  TEXT;
  v_token   TEXT;
  v_expires TIMESTAMPTZ := now() + INTERVAL '24 hours';
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  v_domain := public._email_domain(v_email);

  -- Domain must be a recognised academic domain
  IF NOT EXISTS (SELECT 1 FROM public.student_email_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'unsupported_domain' USING HINT = v_domain;
  END IF;

  -- Email must not be verified by a different user
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE student_email_verified = true
      AND lower(student_email) = v_email
      AND id <> v_me
  ) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  -- Invalidate any previous unused verifications for this user
  UPDATE public.student_email_verifications
     SET used_at = now()
   WHERE user_id = v_me AND used_at IS NULL;

  -- Generate a 48-char hex token
  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.student_email_verifications (user_id, email, token, expires_at)
  VALUES (v_me, v_email, v_token, v_expires);

  -- Stash the unverified email on the profile so the user can see it pending
  UPDATE public.profiles
     SET student_email = v_email,
         student_email_verified = CASE
           WHEN lower(student_email) = v_email THEN student_email_verified
           ELSE false
         END,
         student_email_verified_at = CASE
           WHEN lower(student_email) = v_email THEN student_email_verified_at
           ELSE NULL
         END
   WHERE id = v_me;

  RETURN QUERY SELECT v_token, v_email, v_expires;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_student_email_verification(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 6. RPC: confirm_student_email
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_student_email(p_token TEXT)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.student_email_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.student_email_verifications
   WHERE token = p_token
     AND used_at IS NULL
     AND expires_at > now()
   LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_or_expired_token'; END IF;

  -- Make sure no one else stole the email between request and confirm
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE student_email_verified = true
      AND lower(student_email) = lower(v_row.email)
      AND id <> v_row.user_id
  ) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  UPDATE public.student_email_verifications
     SET used_at = now()
   WHERE id = v_row.id;

  UPDATE public.profiles
     SET student_email = v_row.email,
         student_email_verified = true,
         student_email_verified_at = now()
   WHERE id = v_row.user_id;

  RETURN QUERY SELECT v_row.user_id, v_row.email;
END;
$$;

-- Anonymous can call this RPC because the user clicks the link from any browser/device.
-- Token itself is the credential.
GRANT EXECUTE ON FUNCTION public.confirm_student_email(TEXT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────
-- 7. RPC: search_students
--    Returns verified students matching filters,
--    excluding self and blocked users, with friend status.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_students(
  p_query         TEXT DEFAULT NULL,
  p_university_id UUID DEFAULT NULL,
  p_city          TEXT DEFAULT NULL,
  p_limit         INT  DEFAULT 30,
  p_offset        INT  DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  avatar_url      TEXT,
  city            TEXT,
  university_id   UUID,
  university_name TEXT,
  bio             TEXT,
  friend_status   TEXT  -- 'none' | 'pending_out' | 'pending_in' | 'friends'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_q  TEXT := nullif(trim(coalesce(p_query, '')), '');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Caller must be a verified student to search
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_me AND student_email_verified = true
  ) THEN
    RAISE EXCEPTION 'not_verified';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.city,
    p.university_id,
    u.name AS university_name,
    p.bio,
    CASE
      WHEN f.status = 'accepted' THEN 'friends'
      WHEN f.status = 'pending' AND f.requested_by = v_me THEN 'pending_out'
      WHEN f.status = 'pending' AND f.requested_by <> v_me THEN 'pending_in'
      ELSE 'none'
    END AS friend_status
  FROM public.profiles p
  LEFT JOIN public.universities u ON u.id = p.university_id
  LEFT JOIN public.friendships f ON
    f.user_a_id = LEAST(v_me, p.id) AND f.user_b_id = GREATEST(v_me, p.id)
  WHERE p.id <> v_me
    AND p.student_email_verified = true
    -- exclude blocked users in either direction
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
       WHERE (b.blocker_id = v_me AND b.blocked_id = p.id)
          OR (b.blocker_id = p.id AND b.blocked_id = v_me)
    )
    AND (p_university_id IS NULL OR p.university_id = p_university_id)
    AND (p_city IS NULL OR lower(p.city) = lower(p_city))
    AND (
      v_q IS NULL
      OR p.full_name ILIKE '%' || v_q || '%'
      OR p.city      ILIKE '%' || v_q || '%'
      OR u.name      ILIKE '%' || v_q || '%'
    )
  ORDER BY
    -- friends-of-similar-context first: same university + city
    (p.university_id IS NOT DISTINCT FROM (
       SELECT university_id FROM public.profiles WHERE id = v_me
     ))::int DESC,
    p.full_name ASC
  LIMIT GREATEST(1, LEAST(p_limit, 60))
  OFFSET GREATEST(0, p_offset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_students(TEXT, UUID, TEXT, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 8. Tighten send_friend_request: require sender verified
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target UUID)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_a  UUID;
  v_b  UUID;
  v_row public.friendships%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_me = p_target THEN RAISE EXCEPTION 'cannot_friend_self'; END IF;

  -- Sender must be a verified student
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_me AND student_email_verified = true
  ) THEN
    RAISE EXCEPTION 'not_verified';
  END IF;

  -- Target must also be a verified student (otherwise they can't appear in search)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target AND student_email_verified = true
  ) THEN
    RAISE EXCEPTION 'target_not_verified';
  END IF;

  IF v_me < p_target THEN v_a := v_me; v_b := p_target;
  ELSE v_a := p_target; v_b := v_me;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = v_me AND blocked_id = p_target)
       OR (blocker_id = p_target AND blocked_id = v_me)
  ) THEN RAISE EXCEPTION 'blocked_user'; END IF;

  INSERT INTO public.friendships (user_a_id, user_b_id, status, requested_by)
  VALUES (v_a, v_b, 'pending', v_me)
  ON CONFLICT (user_a_id, user_b_id) DO UPDATE
    SET status = CASE
      WHEN public.friendships.status = 'declined' THEN 'pending'
      ELSE public.friendships.status
    END,
    requested_by = CASE
      WHEN public.friendships.status = 'declined' THEN v_me
      ELSE public.friendships.requested_by
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_target,
    'system',
    'Nueva solicitud de amistad',
    'Tienes una nueva solicitud de amistad',
    jsonb_build_object('kind','friend_request','from', v_me)
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 9. RPC: list_universities_for_search (light list)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_universities_for_search()
RETURNS TABLE (id UUID, name TEXT, city TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, city FROM public.universities ORDER BY name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.list_universities_for_search() TO authenticated;
