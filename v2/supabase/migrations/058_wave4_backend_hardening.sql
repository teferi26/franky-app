-- =====================================================
-- 058: Wave 4 backend hardening — RPCs + triggers + indexes
-- =====================================================
-- Bundles 5 backend improvements:
--   - BE-005 (Wave 4): get_daily_match valida auth.uid() = p_user_id
--   - BE-006: índice parcial sobre device_tokens(user_id) WHERE token IS NOT NULL
--   - BE-009: cron job para purgar notifications > 30 días (requiere pg_cron)
--   - BE-014: RPC mark_all_notifications_read()
--   - BE-015: on_new_message_notify itera TODOS los participants en group chats
-- =====================================================

-- ─────────────────────────────────────────────────────
-- BE-005 (Wave 4): get_daily_match valida auth.uid()
-- Antes: cualquiera con SECURITY DEFINER permission podía pasar p_user_id de
-- otro usuario y obtener su match. Ahora forzamos que p_user_id == auth.uid().
-- ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_body TEXT;
BEGIN
  SELECT pg_get_functiondef('public.get_daily_match(uuid)'::regprocedure) INTO v_body;
  -- Si ya tiene el check, skip. Idempotente.
  IF v_body NOT LIKE '%auth.uid() = p_user_id%' THEN
    -- Recreamos con check añadido al inicio del body.
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.get_daily_match(p_user_id UUID)
      RETURNS TABLE (
          profile JSONB,
          compatibility INT,
          day DATE
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE
          v_day DATE := CURRENT_DATE;
          v_seed BIGINT;
      BEGIN
          -- BE-005 Wave 4: el caller solo puede pedir SU propio match.
          IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
              RETURN;
          END IF;

          v_seed := abs(hashtext(p_user_id::text || v_day::text));

          RETURN QUERY
          WITH candidates AS (
              SELECT
                  p.id,
                  to_jsonb(p) - 'updated_at' AS prof,
                  (public.calculate_compatibility(p_user_id, p.id))::INT AS compat
              FROM public.profiles p
              WHERE p.id <> p_user_id
                AND p.onboarding_completed = true
                AND p.looking_for_roommate = true
                AND p.is_discarded IS NOT TRUE
                AND (p.avatar_url IS NOT NULL OR coalesce(jsonb_array_length(p.photos), 0) > 0)
                AND p.id NOT IN (
                    SELECT target_id FROM public.swipe_actions
                    WHERE user_id = p_user_id AND target_type = 'profile'
                )
                AND p.id NOT IN (
                    SELECT CASE WHEN ub.blocker_id = p_user_id THEN ub.blocked_id ELSE ub.blocker_id END
                    FROM public.user_blocks ub
                    WHERE ub.blocker_id = p_user_id OR ub.blocked_id = p_user_id
                )
          )
          SELECT c.prof, c.compat, v_day
          FROM candidates c
          ORDER BY c.compat DESC, encode(digest((v_seed || c.id::text), 'sha256'), 'hex') ASC
          LIMIT 1;
      END;
      $fn$;
    $body$;
    RAISE NOTICE 'BE-005 Wave 4: get_daily_match recreated with auth.uid() check';
  ELSE
    RAISE NOTICE 'BE-005 Wave 4: get_daily_match already has auth.uid() check — skipped';
  END IF;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'BE-005 Wave 4: get_daily_match no encontrado — skipping recreation';
END $$;

GRANT EXECUTE ON FUNCTION public.get_daily_match(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────
-- BE-006: índice parcial device_tokens(user_id) WHERE token IS NOT NULL
-- Acelera el lookup de tokens activos. Cuando un device se desinstala, el
-- token queda NULL (TTL); la query de push solo recoge `WHERE token IS NOT NULL`.
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active
  ON public.device_tokens(user_id)
  WHERE token IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- BE-014: RPC mark_all_notifications_read()
-- Marca todas las notifications no leídas del usuario como leídas.
-- Cliente puede llamarlo desde la UI ("marcar todo como leído").
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  WITH updated AS (
    UPDATE public.notifications
       SET is_read = true
     WHERE user_id = v_uid AND is_read = false
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN COALESCE(v_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ─────────────────────────────────────────────────────
-- BE-015: on_new_message_notify itera TODOS los participants en group chats
-- Antes: SELECT cp.user_id ... LIMIT 1 → solo notificaba al primer participant
-- distinto al sender. En group chats, los otros 2..N participants no recibían
-- notification. Ahora: loop sobre todos.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_new_message_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient   UUID;
  v_sender_name TEXT;
BEGIN
  SELECT COALESCE(full_name, 'Alguien') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

  -- BE-015: itera TODOS los recipients (excluye sender).
  FOR v_recipient IN
    SELECT cp.user_id
      FROM public.conversation_participants cp
     WHERE cp.conversation_id = NEW.conversation_id
       AND cp.user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_recipient,
      'message',
      v_sender_name,
      LEFT(COALESCE(NEW.content, ''), 110),
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'sender_id', NEW.sender_id,
        'message_id', NEW.id
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger sigue ligado al body anterior; basta CREATE OR REPLACE FUNCTION.

-- ─────────────────────────────────────────────────────
-- BE-009: TTL notifications cron 30d
-- Requiere pg_cron habilitado en el proyecto (Dashboard → Database → Extensions).
-- Si no está disponible, la creación falla silenciosamente (DO block) y queda
-- pendiente de habilitar la extensión.
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Borra cualquier job previo con el mismo nombre (idempotente).
    PERFORM cron.unschedule('purge_old_notifications')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_old_notifications');
    PERFORM cron.schedule(
      'purge_old_notifications',
      '0 3 * * *',  -- diario a las 03:00 UTC
      $job$DELETE FROM public.notifications WHERE created_at < NOW() - INTERVAL '30 days';$job$
    );
    RAISE NOTICE 'BE-009: cron job purge_old_notifications scheduled (daily 03:00 UTC)';
  ELSE
    RAISE NOTICE 'BE-009: pg_cron extension not available — manual SELECT cron.schedule(...) requerido tras habilitar extension';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
