-- =====================================================
-- 088: Notificaciones de like / match sobre roommate_matches
-- =====================================================
-- El swipe de roomies escribe en `roommate_matches` (status 'liked'/'passed'),
-- pero el único trigger de match existente vivía sobre la tabla legada
-- `swipe_actions` (sin uso). Resultado: los likes y matches NO generaban
-- ninguna notificación (ni in-app, ni push, ni email).
--
-- Este trigger conecta `roommate_matches` al embudo central `notifications`:
--   - like de una dirección  → notification type 'roomie_like' para el receptor
--   - like recíproco         → ambas filas pasan a 'matched' + 2 notifications 'match'
--
-- Al insertar en `notifications` se disparan automáticamente:
--   - push  (trigger on_notification_insert → dispatch_push, migración 054)
--   - email (dispatch_email, migración 089)
-- =====================================================

CREATE OR REPLACE FUNCTION public.on_roommate_match_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reciprocal_status TEXT;
  v_liker_name        TEXT;
  v_target_name       TEXT;
BEGIN
  -- Solo nos interesa la transición a 'liked'. Cuando este mismo trigger
  -- marca filas como 'matched' más abajo, vuelve a dispararse con
  -- NEW.status = 'matched' y sale aquí sin recursión.
  IF NEW.status <> 'liked' THEN
    RETURN NEW;
  END IF;

  -- En UPDATE, ignorar si el status no cambió realmente (p.ej. upsert de una
  -- fila que ya estaba 'liked').
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- ¿El otro usuario ya me había dado like / ya estamos emparejados?
  SELECT status INTO v_reciprocal_status
  FROM public.roommate_matches
  WHERE user_id = NEW.matched_user_id
    AND matched_user_id = NEW.user_id
  LIMIT 1;

  IF v_reciprocal_status = 'liked' THEN
    -- Match recíproco nuevo: marcar ambas filas como 'matched' y avisar a ambos.
    UPDATE public.roommate_matches
       SET status = 'matched'
     WHERE (user_id = NEW.user_id        AND matched_user_id = NEW.matched_user_id)
        OR (user_id = NEW.matched_user_id AND matched_user_id = NEW.user_id);

    SELECT COALESCE(full_name, 'Tu match') INTO v_liker_name
      FROM public.profiles WHERE id = NEW.user_id;
    SELECT COALESCE(full_name, 'Tu match') INTO v_target_name
      FROM public.profiles WHERE id = NEW.matched_user_id;

    INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
      (
        NEW.user_id,
        'match',
        'Has hecho match con ' || v_target_name,
        'Empieza la conversación antes de que se enfríe.',
        jsonb_build_object('target_user_id', NEW.matched_user_id::text)
      ),
      (
        NEW.matched_user_id,
        'match',
        'Has hecho match con ' || v_liker_name,
        'Empieza la conversación antes de que se enfríe.',
        jsonb_build_object('target_user_id', NEW.user_id::text)
      );

  ELSIF v_reciprocal_status = 'matched' THEN
    -- Ya estaban emparejados; no renotificar.
    RETURN NEW;

  ELSE
    -- Like de una sola dirección: avisar a quien lo recibe.
    SELECT COALESCE(full_name, 'Alguien') INTO v_liker_name
      FROM public.profiles WHERE id = NEW.user_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.matched_user_id,
      'roomie_like',
      v_liker_name || ' te ha dado like',
      'Échale un vistazo a su perfil en Roomie Match.',
      jsonb_build_object('from_user_id', NEW.user_id::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roommate_match_change ON public.roommate_matches;
CREATE TRIGGER trg_roommate_match_change
AFTER INSERT OR UPDATE OF status ON public.roommate_matches
FOR EACH ROW EXECUTE FUNCTION public.on_roommate_match_change();

COMMENT ON FUNCTION public.on_roommate_match_change IS
  '088: crea notifications roomie_like/match desde roommate_matches → alimenta push (054) y email (089).';
