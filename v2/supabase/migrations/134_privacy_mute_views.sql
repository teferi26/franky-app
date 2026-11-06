-- ═══════════════════════════════════════════════════════════════════════════
-- 134: Quién puede escribirte, silenciar sin bloquear, y visitas de perfil
--
-- Tres piezas del ciclo 2 que necesitaban modelo de datos:
--   67. "Quién puede escribirte": profiles.dm_privacy.
--   68. Silenciar a alguien sin bloquearlo: tabla muted_users (asimétrica y
--       privada; el silenciado NO se entera, a diferencia del bloqueo).
--   19/70. Contador de visitas al perfil: tabla profile_views + RPC de conteo.
--
-- El badge de estudiante verificado (65) NO necesita nada: ya existe
-- profiles.student_email_verified desde la migración 025.
--
-- Todo idempotente y con RLS cerrada por defecto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 67. Quién puede escribirte
--   'todos'        cualquiera con cuenta (por defecto, como hasta ahora)
--   'seguidos'     solo gente a la que sigues
--   'verificados'  solo estudiantes con email de universidad verificado
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dm_privacy TEXT NOT NULL DEFAULT 'todos';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_dm_privacy_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_dm_privacy_check
  CHECK (dm_privacy IN ('todos', 'seguidos', 'verificados'));

COMMENT ON COLUMN public.profiles.dm_privacy IS
  '134: quién puede abrir un chat contigo (todos / seguidos / verificados).';

-- ¿Puede v_sender escribir a v_target? Se consulta antes de crear el chat.
CREATE OR REPLACE FUNCTION public.can_message_user(p_target UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_policy  TEXT;
BEGIN
  IF v_me IS NULL THEN RETURN false; END IF;
  IF v_me = p_target THEN RETURN true; END IF;

  -- Un bloqueo en cualquier dirección manda por encima de todo.
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_target AND blocked_id = v_me)
       OR (blocker_id = v_me AND blocked_id = p_target)
  ) THEN
    RETURN false;
  END IF;

  SELECT dm_privacy INTO v_policy FROM public.profiles WHERE id = p_target;
  IF v_policy IS NULL OR v_policy = 'todos' THEN RETURN true; END IF;

  IF v_policy = 'seguidos' THEN
    -- El destinatario debe seguirte (te ha "dado permiso" siguiéndote).
    RETURN EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = p_target AND followee_id = v_me
    );
  END IF;

  IF v_policy = 'verificados' THEN
    RETURN COALESCE(
      (SELECT student_email_verified FROM public.profiles WHERE id = v_me),
      false
    );
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_message_user(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 68. Silenciar sin bloquear (asimétrico y privado)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.muted_users (
  muter_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CONSTRAINT muted_users_no_self CHECK (muter_id <> muted_id)
);

ALTER TABLE public.muted_users ENABLE ROW LEVEL SECURITY;

-- Solo el que silencia ve y gestiona sus silenciados. El silenciado nunca lo ve.
DROP POLICY IF EXISTS "muted_users_own" ON public.muted_users;
CREATE POLICY "muted_users_own"
  ON public.muted_users FOR ALL TO authenticated
  USING (muter_id = auth.uid())
  WITH CHECK (muter_id = auth.uid());

COMMENT ON TABLE public.muted_users IS
  '134: silenciar sin bloquear. Asimétrico y privado: el silenciado no se entera.';

-- ─────────────────────────────────────────────────────
-- 19/70. Visitas de perfil
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_views (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_views_profile
  ON public.profile_views (profile_id, viewed_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Solo el dueño del perfil ve sus visitas (quién le ha visitado es dato suyo).
DROP POLICY IF EXISTS "profile_views_owner_select" ON public.profile_views;
CREATE POLICY "profile_views_owner_select"
  ON public.profile_views FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- Registrar una visita: el visitante solo puede insertar su propia fila y
-- nunca sobre su propio perfil (verse a uno mismo no cuenta como visita).
CREATE OR REPLACE FUNCTION public.register_profile_view(p_profile UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL OR v_me = p_profile THEN RETURN; END IF;
  INSERT INTO public.profile_views (profile_id, viewer_id, viewed_at)
  VALUES (p_profile, v_me, now())
  ON CONFLICT (profile_id, viewer_id) DO UPDATE SET viewed_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_profile_view(UUID) TO authenticated;

-- Visitas y seguidores nuevos de los últimos N días (para el propio perfil).
CREATE OR REPLACE FUNCTION public.get_profile_activity(p_days INT DEFAULT 7)
RETURNS TABLE (views BIGINT, new_followers BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_from TIMESTAMPTZ := now() - make_interval(days => GREATEST(p_days, 1));
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.profile_views
       WHERE profile_id = v_me AND viewed_at >= v_from),
    (SELECT COUNT(*) FROM public.follows
       WHERE followee_id = v_me AND created_at >= v_from);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_activity(INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
