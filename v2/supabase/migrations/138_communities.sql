-- ═══════════════════════════════════════════════════════════════════════════
-- 138: Comunidades del campus (mejoras 56, 66 y 85 del ciclo 2)
--
-- Las tres mejoras son la MISMA funcionalidad con distinta etiqueta, así que
-- comparten modelo en vez de duplicarse:
--   56. Grupos y comunidades por carrera, piso o afición  -> kind 'carrera'/'aficion'
--   66. Muro de la residencia o colegio mayor             -> kind 'residencia'
--   85. Grupos de estudio por asignatura                  -> kind 'estudio'
--
-- Una comunidad vive dentro de una universidad (como el FOMO) y tiene su muro
-- de publicaciones. Las privadas solo las ven sus miembros.
--
-- Idempotente y con RLS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL DEFAULT 'aficion',
  university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
  created_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url     TEXT,
  is_private    BOOLEAN NOT NULL DEFAULT false,
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT communities_kind_check
    CHECK (kind IN ('carrera', 'residencia', 'estudio', 'aficion')),
  CONSTRAINT communities_name_len
    CHECK (char_length(name) BETWEEN 3 AND 80)
);

CREATE INDEX IF NOT EXISTS idx_communities_campus
  ON public.communities (university_id, kind, created_at DESC)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'miembro',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id),
  CONSTRAINT community_members_role_check CHECK (role IN ('admin', 'miembro'))
);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         TEXT,
  image_url    TEXT,
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_has_content
    CHECK (COALESCE(btrim(body), '') <> '' OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_wall
  ON public.community_posts (community_id, created_at DESC)
  WHERE is_deleted = false;

ALTER TABLE public.communities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts   ENABLE ROW LEVEL SECURITY;

-- ── Helper: ¿soy miembro? SECURITY DEFINER para poder usarlo en las políticas
-- sin que la propia RLS de community_members provoque recursión.
CREATE OR REPLACE FUNCTION public.is_community_member(p_community UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_community_member(UUID) TO authenticated;

-- ── RLS de communities ─────────────────────────────────────────────────────
-- Las públicas de tu campus las ve cualquiera con cuenta; las privadas, solo
-- sus miembros (y siempre su creador).
DROP POLICY IF EXISTS "communities_select" ON public.communities;
CREATE POLICY "communities_select"
  ON public.communities FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      created_by = auth.uid()
      OR public.is_community_member(id)
      OR (
        is_private = false
        AND (
          university_id IS NULL
          OR university_id = (SELECT university_id FROM public.profiles WHERE id = auth.uid())
        )
      )
    )
  );

-- Crear: cualquiera con cuenta, siempre a su nombre.
DROP POLICY IF EXISTS "communities_insert" ON public.communities;
CREATE POLICY "communities_insert"
  ON public.communities FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Editar y borrar: solo quien la creó.
DROP POLICY IF EXISTS "communities_owner_update" ON public.communities;
CREATE POLICY "communities_owner_update"
  ON public.communities FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ── RLS de community_members ───────────────────────────────────────────────
-- Ves los miembros de las comunidades a las que perteneces (o tu propia fila).
DROP POLICY IF EXISTS "community_members_select" ON public.community_members;
CREATE POLICY "community_members_select"
  ON public.community_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_community_member(community_id));

-- Unirse y salir: cada uno gestiona SU membresía.
DROP POLICY IF EXISTS "community_members_own" ON public.community_members;
CREATE POLICY "community_members_own"
  ON public.community_members FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── RLS de community_posts ─────────────────────────────────────────────────
-- El muro lo leen los miembros (y, si la comunidad es pública, cualquiera del
-- campus que pueda verla).
DROP POLICY IF EXISTS "community_posts_select" ON public.community_posts;
CREATE POLICY "community_posts_select"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_posts.community_id)
    AND (
      public.is_community_member(community_id)
      OR EXISTS (
        SELECT 1 FROM public.communities c
        WHERE c.id = community_posts.community_id
          AND c.is_private = false
          AND c.is_deleted = false
          AND (c.university_id IS NULL
               OR c.university_id = (SELECT university_id FROM public.profiles WHERE id = auth.uid()))
      )
    )
  );

-- Publicar: SOLO miembros, y siempre a tu nombre.
DROP POLICY IF EXISTS "community_posts_member_insert" ON public.community_posts;
CREATE POLICY "community_posts_member_insert"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_community_member(community_id));

-- Borrar lo tuyo.
DROP POLICY IF EXISTS "community_posts_author_update" ON public.community_posts;
CREATE POLICY "community_posts_author_update"
  ON public.community_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- ── Quien crea una comunidad entra como admin automáticamente ──────────────
CREATE OR REPLACE FUNCTION public.communities_add_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.university_id IS NULL THEN
    SELECT university_id INTO NEW.university_id
    FROM public.profiles WHERE id = NEW.created_by;
  END IF;
  INSERT INTO public.community_members (community_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communities_add_creator ON public.communities;
CREATE TRIGGER trg_communities_add_creator
  AFTER INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.communities_add_creator();

-- ── RPCs de lectura y acciones ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_communities(
  p_kind   TEXT DEFAULT NULL,
  p_limit  INT  DEFAULT 40,
  p_offset INT  DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  name         TEXT,
  description  TEXT,
  kind         TEXT,
  image_url    TEXT,
  is_private   BOOLEAN,
  created_at   TIMESTAMPTZ,
  member_count BIGINT,
  is_member    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  UUID := auth.uid();
  v_uni UUID;
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  SELECT university_id INTO v_uni FROM public.profiles WHERE id = v_me;

  RETURN QUERY
  SELECT c.id, c.name, c.description, c.kind, c.image_url, c.is_private, c.created_at,
         (SELECT COUNT(*) FROM public.community_members m WHERE m.community_id = c.id),
         EXISTS (SELECT 1 FROM public.community_members m
                 WHERE m.community_id = c.id AND m.user_id = v_me)
  FROM public.communities c
  WHERE c.is_deleted = false
    AND (p_kind IS NULL OR c.kind = p_kind)
    AND (
      c.created_by = v_me
      OR EXISTS (SELECT 1 FROM public.community_members m
                 WHERE m.community_id = c.id AND m.user_id = v_me)
      OR (c.is_private = false AND (c.university_id IS NULL OR c.university_id = v_uni))
    )
  ORDER BY c.created_at DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_communities(TEXT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_community(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_priv BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT is_private INTO v_priv FROM public.communities
    WHERE id = p_id AND is_deleted = false;
  IF v_priv IS NULL THEN RAISE EXCEPTION 'community_not_found'; END IF;
  -- Las privadas requieren invitación: de momento no se puede entrar solo.
  IF v_priv THEN RAISE EXCEPTION 'community_is_private'; END IF;

  INSERT INTO public.community_members (community_id, user_id, role)
  VALUES (p_id, v_me, 'miembro')
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_community(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_community(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.community_members
   WHERE community_id = p_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_community(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_community_posts(
  p_community UUID,
  p_limit     INT DEFAULT 30,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  body          TEXT,
  image_url     TEXT,
  created_at    TIMESTAMPTZ,
  author_id     UUID,
  author_name   TEXT,
  author_avatar TEXT,
  is_mine       BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  -- Reutiliza exactamente el mismo criterio de visibilidad que la RLS.
  IF NOT EXISTS (SELECT 1 FROM public.communities c WHERE c.id = p_community) THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.body, p.image_url, p.created_at,
         p.author_id, pr.full_name, pr.avatar_url, (p.author_id = v_me)
  FROM public.community_posts p
  JOIN public.profiles pr ON pr.id = p.author_id
  WHERE p.community_id = p_community
    AND p.is_deleted = false
    AND (
      public.is_community_member(p_community)
      OR EXISTS (SELECT 1 FROM public.communities c
                 WHERE c.id = p_community AND c.is_private = false AND c.is_deleted = false
                   AND (c.university_id IS NULL
                        OR c.university_id = (SELECT university_id FROM public.profiles WHERE id = v_me)))
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_posts(UUID, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_community_post(
  p_community UUID,
  p_body      TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_community_member(p_community) THEN RAISE EXCEPTION 'not_a_member'; END IF;
  IF COALESCE(btrim(p_body), '') = '' AND p_image_url IS NULL THEN
    RAISE EXCEPTION 'empty_post';
  END IF;

  INSERT INTO public.community_posts (community_id, author_id, body, image_url)
  VALUES (p_community, v_me, NULLIF(btrim(p_body), ''), p_image_url)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_community_post(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.communities IS
  '138: comunidades del campus (carrera, residencia, estudio, afición). Mejoras 56, 66 y 85.';

NOTIFY pgrst, 'reload schema';
