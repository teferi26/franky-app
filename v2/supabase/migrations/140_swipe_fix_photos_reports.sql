-- ═══════════════════════════════════════════════════════════════════════════
-- 140: Arreglo del "pass" en swipes, foto obligatoria en el descubrimiento y
--      denuncia de foto de perfil
--
-- BUG REAL (causa del "No se pudo registrar. Revisa tu conexión" al dar
-- dislike en Roomie): la tabla swipe_actions solo admite
--   action IN ('like','dislike','superlike')   (migración 011)
-- pero process_swipe_action valida e inserta 'pass' (migración 108/119). El
-- like colaba y el pass violaba el CHECK, así que el RPC petaba y el cliente
-- lo interpretaba como fallo de red. NO era conexión.
--
-- Y ese mismo bug explicaba el segundo síntoma: como el pass nunca llegaba a
-- guardarse, el perfil descartado VOLVÍA a salir en el mazo (el feed excluye
-- por swipe_actions, que estaba vacío de passes).
--
-- Además:
--   · Foto obligatoria para aparecer en Roomie Match y en Pisos: un perfil sin
--     foto (o un piso sin imágenes) no se puede juzgar deslizando.
--   · Denuncia de foto de perfil: con 1 denuncia se avisa al admin, con 2 el
--     perfil deja de aparecer hasta que el admin decida.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. El CHECK de swipe_actions admite 'pass'
-- ─────────────────────────────────────────────────────
-- Se admite tanto 'dislike' (vocabulario histórico, hay filas antiguas) como
-- 'pass' (el que manda el RPC). El RPC normaliza a 'dislike' más abajo para
-- que a partir de ahora haya UN solo valor canónico en la tabla.
ALTER TABLE public.swipe_actions DROP CONSTRAINT IF EXISTS swipe_actions_action_check;
ALTER TABLE public.swipe_actions ADD CONSTRAINT swipe_actions_action_check
  CHECK (action IN ('like', 'dislike', 'superlike', 'pass'));

-- ─────────────────────────────────────────────────────
-- 2. Denuncia de foto de perfil
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_photo_reports (
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (reporter_id, target_id),
  CONSTRAINT profile_photo_reports_no_self CHECK (reporter_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_photo_reports_target
  ON public.profile_photo_reports (target_id);

ALTER TABLE public.profile_photo_reports ENABLE ROW LEVEL SECURITY;

-- Cada uno gestiona SUS denuncias. Nadie ve las de los demás (ni el denunciado,
-- que si no podría tomar represalias).
DROP POLICY IF EXISTS "profile_photo_reports_own" ON public.profile_photo_reports;
CREATE POLICY "profile_photo_reports_own"
  ON public.profile_photo_reports FOR ALL TO authenticated
  USING (reporter_id = auth.uid())
  WITH CHECK (reporter_id = auth.uid());

-- Estado de moderación de la foto en el propio perfil:
--   photo_reports  cuántas denuncias distintas acumula
--   photo_hidden   true = deja de aparecer en descubrimiento (2 denuncias)
--   photo_cleared  true = el admin la revisó y la dio por buena (inmuniza)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_reports INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_hidden  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_cleared BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.photo_hidden IS
  '140: la foto acumuló 2 denuncias y el perfil no aparece en descubrimiento hasta revisión del admin.';

-- Denunciar la foto de alguien. Una denuncia por persona (la PK lo garantiza).
-- Con 1 denuncia se avisa al admin; con 2 se oculta el perfil.
CREATE OR REPLACE FUNCTION public.report_profile_photo(p_target UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_count   INT;
  v_cleared BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_me = p_target THEN RAISE EXCEPTION 'cannot report yourself'; END IF;

  INSERT INTO public.profile_photo_reports (reporter_id, target_id, reason)
  VALUES (v_me, p_target, NULLIF(btrim(p_reason), ''))
  ON CONFLICT (reporter_id, target_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count
  FROM public.profile_photo_reports WHERE target_id = p_target;

  SELECT COALESCE(photo_cleared, false) INTO v_cleared
  FROM public.profiles WHERE id = p_target;

  UPDATE public.profiles
     SET photo_reports = v_count,
         -- Si el admin ya la revisó y la dio por buena, no se vuelve a ocultar
         -- sola: hace falta que él la vuelva a marcar.
         photo_hidden = (v_count >= 2 AND NOT COALESCE(v_cleared, false))
   WHERE id = p_target;

  -- Aviso al admin desde la PRIMERA denuncia.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT pr.id, 'admin_photo_report',
         'Foto de perfil denunciada',
         'Un perfil acumula ' || v_count || ' denuncia(s) sobre su foto.',
         jsonb_build_object('target_id', p_target, 'reports', v_count)
  FROM public.profiles pr
  WHERE pr.role = 'admin';

  RETURN jsonb_build_object('reports', v_count, 'hidden', v_count >= 2 AND NOT COALESCE(v_cleared, false));
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_profile_photo(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 3. process_swipe_action NO se toca (a propósito)
-- ─────────────────────────────────────────────────────
-- Con el CHECK ya ampliado, el 'pass' que inserta el RPC entra sin más. NO se
-- redefine la función: su cuerpo real crea la conversación con saludo, escribe
-- en roommate_matches (que es quien decide el match por trigger), gestiona el
-- superlike y el favorito de eventos. Reescribirla "de memoria" para cambiar
-- una línea era la forma perfecta de cargarse los matches, así que se queda
-- exactamente como la dejó la migración 119.
--
-- Consecuencia: en swipe_actions conviven 'dislike' (filas antiguas) y 'pass'
-- (las nuevas). Da igual para el descubrimiento, que excluye por existencia de
-- fila sin mirar la acción, y las funciones de deshacer/reiniciar de abajo
-- contemplan los dos valores.

-- ─────────────────────────────────────────────────────
-- 4. Deshacer el último swipe (volver atrás)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.undo_last_swipe(p_target_type TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  DELETE FROM public.swipe_actions sa
  WHERE sa.id = (
    SELECT s.id FROM public.swipe_actions s
    WHERE s.user_id = v_uid AND s.target_type = p_target_type
    ORDER BY s.created_at DESC LIMIT 1
  )
  RETURNING sa.target_id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_swipe(TEXT) TO authenticated;

-- Empezar de cero: borra los descartes (NO los likes, que pueden ser matches)
-- para volver a ver a quien pasaste. Es lo que se ofrece al agotar el mazo.
CREATE OR REPLACE FUNCTION public.reset_passed_swipes(p_target_type TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_n   INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  WITH deleted AS (
    DELETE FROM public.swipe_actions
    WHERE user_id = v_uid AND target_type = p_target_type
      AND action IN ('dislike', 'pass')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_n FROM deleted;

  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_passed_swipes(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 5. get_discovery_feed: foto obligatoria y sin fotos denunciadas
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
    p_user_id UUID,
    p_target_type TEXT,
    p_limit INT DEFAULT 20
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_user_city  TEXT;
    v_budget_min INT;
    v_budget_max INT;
    v_limit      INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    SELECT city, budget_min, budget_max
    INTO v_user_city, v_budget_min, v_budget_max
    FROM public.profiles WHERE id = v_uid;

    IF p_target_type = 'accommodation' THEN
        RETURN QUERY
        SELECT to_jsonb(a.*)
        FROM public.accommodations a
        WHERE a.status = 'active'
          -- 140: un piso sin fotos no se puede juzgar deslizando.
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) >= 1
          AND a.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'accommodation'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = a.owner_id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            CASE WHEN v_user_city IS NOT NULL AND a.city ILIKE v_user_city THEN 0 ELSE 1 END,
            CASE WHEN a.price BETWEEN COALESCE(v_budget_min, 0) AND COALESCE(v_budget_max, 9999) THEN 0 ELSE 1 END,
            a.created_at DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'roomie' THEN
        IF NOT public.roomie_profile_complete(v_uid) THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'career', p.career,
            'academic_year', p.academic_year,
            'bio', p.bio,
            'city', p.city,
            'interests', COALESCE(p.interests, '{}'::text[]),
            'age', CASE WHEN p.birth_date IS NOT NULL
                        THEN date_part('year', age(p.birth_date))::int
                   END,
            'lifestyle_preferences', p.lifestyle_preferences,
            'housing_preferences', p.housing_preferences,
            'compatibility', public.calculate_compatibility(v_uid, p.id)
        )
        FROM public.profiles p
        WHERE p.id != v_uid
          AND p.looking_for_roommate = true
          AND p.onboarding_completed = true
          AND COALESCE(p.is_discarded, false) = false
          -- 140: FOTO OBLIGATORIA para aparecer en el mazo.
          AND (
            COALESCE(btrim(p.avatar_url), '') <> ''
            OR COALESCE(array_length(p.photos, 1), 0) >= 1
          )
          -- 140: fuera quien tenga la foto retenida por denuncias.
          AND COALESCE(p.photo_hidden, false) = false
          AND p.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'roomie'
          )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM public.user_boosts ub
                WHERE ub.user_id = p.id
                  AND ub.boost_type = 'profile_boost'
                  AND ub.expires_at > NOW()
            ) THEN 0 ELSE 1 END,
            public.calculate_compatibility(v_uid, p.id) DESC
        LIMIT v_limit;

    ELSIF p_target_type = 'event' THEN
        RETURN QUERY
        SELECT to_jsonb(e.*)
        FROM public.events e
        WHERE e.start_date >= NOW()
          AND e.status = 'upcoming'
          AND e.id NOT IN (
            SELECT sa.target_id FROM public.swipe_actions sa
            WHERE sa.user_id = v_uid AND sa.target_type = 'event'
          )
        ORDER BY
            CASE WHEN v_user_city IS NOT NULL AND e.city ILIKE v_user_city THEN 0 ELSE 1 END,
            e.start_date ASC
        LIMIT v_limit;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(UUID, TEXT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
