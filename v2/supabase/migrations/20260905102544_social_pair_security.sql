SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Helper acotado al solicitante. Permite consultar solo su bloqueo bilateral.
CREATE OR REPLACE FUNCTION public._social_pair_blocked(p_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NULL OR p_other IS NULL OR EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p_other)
       OR (b.blocker_id = p_other AND b.blocked_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p_other)
       OR (b.blocker_id = p_other AND b.blocked_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public._social_pair_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._social_pair_blocked(uuid) TO authenticated;

-- Mismo lock ordenado que Crush Live. Se instala en AMBAS tablas de bloqueos;
-- los triggers espejo y el trigger de Live pueden tomarlo otra vez sin problema.
-- Impide insertar un bloqueo concurrente mientras se confirma una interaccion.
CREATE OR REPLACE FUNCTION public.lock_social_block_pair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE a uuid; b uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.blocker_id, NEW.blocked_id)
    IS DISTINCT FROM (OLD.blocker_id, OLD.blocked_id) THEN
    RAISE EXCEPTION 'block_pair_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN a := OLD.blocker_id; b := OLD.blocked_id;
  ELSE a := NEW.blocker_id; b := NEW.blocked_id; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(a,b)::text || ':' || greatest(a,b)::text, 0));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_social_block_pair() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_social_block_pair ON public.blocked_users;
CREATE TRIGGER trg_social_block_pair BEFORE INSERT OR UPDATE OR DELETE
ON public.blocked_users FOR EACH ROW EXECUTE FUNCTION public.lock_social_block_pair();
DROP TRIGGER IF EXISTS trg_social_block_pair ON public.user_blocks;
CREATE TRIGGER trg_social_block_pair BEFORE INSERT OR UPDATE OR DELETE
ON public.user_blocks FOR EACH ROW EXECUTE FUNCTION public.lock_social_block_pair();

-- DEFINER necesario para comprobar ficha destino y calcular puntuacion real,
-- sin abrir SELECT de profiles. No acepta actor: siempre auth.uid().
CREATE OR REPLACE FUNCTION public._roomie_write_score(p_target uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target IS NULL OR p_target = v_me THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(v_me,p_target)::text || ':' || greatest(v_me,p_target)::text, 0));
  -- Orden estable: evita cambios de opt-in/descarte durante la escritura.
  PERFORM p.id FROM public.profiles p
    WHERE p.id IN (v_me,p_target) ORDER BY p.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = v_me AND p.is_discarded IS NOT TRUE)
    OR NOT public.roomie_profile_complete(v_me) THEN
    RAISE EXCEPTION 'roomie_profile_incomplete';
  END IF;
  IF public._social_pair_blocked(p_target) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_target
      AND p.looking_for_roommate AND p.onboarding_completed
      AND p.is_discarded IS NOT TRUE AND p.is_hidden IS NOT TRUE
      AND p.photo_hidden IS NOT TRUE
  ) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  RETURN public.calculate_compatibility(v_me, p_target);
END;
$$;
REVOKE ALL ON FUNCTION public._roomie_write_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._roomie_write_score(uuid) TO authenticated;

-- INVOKER deliberado: current_user conserva el rol efectivo del INSERT.
-- Los UPDATE internos del trigger DEFINER de reciprocidad siguen autorizados.
-- No usar claims personalizados ni pg_trigger_depth como permiso de elevacion.
CREATE OR REPLACE FUNCTION public.guard_roommate_client_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.user_id,NEW.matched_user_id)
    IS DISTINCT FROM (OLD.user_id,OLD.matched_user_id) THEN
    RAISE EXCEPTION 'roomie_pair_immutable';
  END IF;
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  -- UPDATE directo puede haber bloqueado su fila antes de este trigger.
  -- No esperar por la pareja: evita invertir el orden de locks frente a la
  -- RPC y al UPDATE reciproco. Un conflicto revierte entero y permite retry.
  IF NOT pg_try_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(NEW.user_id,NEW.matched_user_id)::text
    || ':' || greatest(NEW.user_id,NEW.matched_user_id)::text,0)) THEN
    RAISE EXCEPTION 'retry_social_action' USING ERRCODE='40001';
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('pending','liked','passed','matched') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'matched' THEN RAISE EXCEPTION 'match_requires_reciprocity'; END IF;
    NEW.created_at := now();
  ELSE
    IF NEW.status = 'matched' AND OLD.status IS DISTINCT FROM 'matched' THEN
      RAISE EXCEPTION 'match_requires_reciprocity';
    END IF;
    -- Un reintento de like de un cliente antiguo no degrada un match existente.
    IF OLD.status = 'matched' AND NEW.status = 'liked' THEN NEW.status := 'matched'; END IF;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.compatibility_score := public._roomie_write_score(NEW.matched_user_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_roommate_client_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_00_roommate_client_write ON public.roommate_matches;
CREATE TRIGGER trg_00_roommate_client_write BEFORE INSERT OR UPDATE
ON public.roommate_matches FOR EACH ROW EXECUTE FUNCTION public.guard_roommate_client_write();

-- El chat directo conserva su firma; comprueba ambos bloqueos y exactamente
-- dos participantes, tambien en conversaciones antiguas mal etiquetadas.
CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_me uuid := auth.uid(); v_conv_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(v_me,p_other_user_id)::text || ':' || greatest(v_me,p_other_user_id)::text, 0));
  PERFORM p.id FROM public.profiles p
    WHERE p.id IN (v_me,p_other_user_id) ORDER BY p.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_me AND is_discarded IS NOT TRUE)
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_other_user_id AND is_discarded IS NOT TRUE)
    OR public._social_pair_blocked(p_other_user_id)
    OR NOT coalesce(public.can_message_user(p_other_user_id),false) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  SELECT c.id INTO v_conv_id FROM public.conversations c
  WHERE coalesce(c.is_group,false)=false
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id AND cp.user_id=v_me)
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id AND cp.user_id=p_other_user_id)
    AND (SELECT count(*) FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id)=2
  ORDER BY c.created_at, c.id LIMIT 1;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  INSERT INTO public.conversations(is_group) VALUES(false) RETURNING id INTO v_conv_id;
  INSERT INTO public.conversation_participants(conversation_id,user_id)
    VALUES(v_conv_id,v_me),(v_conv_id,p_other_user_id);
  RETURN v_conv_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_direct_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(uuid) TO authenticated;

-- Parche minimo del cuerpo REAL: no altera ramas accommodation/event.
-- Permanece p_user_id por compatibilidad; el actor efectivo sigue auth.uid().
DO $patch$
DECLARE d text; start_at int; end_at int; marker text;
BEGIN
  d := pg_get_functiondef('public.process_swipe_action(uuid,uuid,text,text)'::regprocedure);
  IF strpos(d,'_roomie_write_score(p_target_id)') > 0 THEN RETURN; END IF;
  marker := '    INSERT INTO public.swipe_actions (user_id, target_id, target_type, action)';
  IF strpos(d,marker)=0 THEN RAISE EXCEPTION 'review_changed_swipe_definition'; END IF;
  d := replace(d, marker, $new$
    IF p_action IS NULL OR p_target_type IS NULL OR p_target_id IS NULL THEN
      RAISE EXCEPTION 'invalid action';
    END IF;
    IF p_target_type = 'roomie' THEN
      PERFORM public._roomie_write_score(p_target_id);
    END IF;
    INSERT INTO public.swipe_actions (user_id, target_id, target_type, action)$new$);
  start_at := strpos(d, '        ELSIF p_target_type = ''roomie'' THEN');
  end_at := strpos(d, '        ELSIF p_target_type = ''event'' THEN');
  IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'review_changed_swipe_branch'; END IF;
  d := left(d,start_at-1) || $new$
        ELSIF p_target_type = 'roomie' THEN
            INSERT INTO public.roommate_matches(user_id,matched_user_id,compatibility_score,status)
            VALUES(v_uid,p_target_id,public.calculate_compatibility(v_uid,p_target_id),'liked')
            ON CONFLICT(user_id,matched_user_id) DO UPDATE
              SET status='liked',updated_at=now() WHERE roommate_matches.status<>'matched';
            SELECT EXISTS (
              SELECT 1 FROM public.roommate_matches mine
              JOIN public.roommate_matches theirs
                ON theirs.user_id=mine.matched_user_id AND theirs.matched_user_id=mine.user_id
              WHERE mine.user_id=v_uid AND mine.matched_user_id=p_target_id
                AND mine.status IN ('liked','matched') AND theirs.status IN ('liked','matched')
            ) INTO v_match;
            -- Un like no implica permiso de DM. Se guarda y devuelve chat NULL
            -- si la privacidad impide escribir; no se crea saludo a espaldas del usuario.
            IF coalesce(public.can_message_user(p_target_id),false) THEN
              v_conversation_id := public.get_or_create_direct_chat(p_target_id);
            END IF;
            v_result := jsonb_build_object(
              'action', CASE WHEN v_conversation_id IS NULL THEN 'liked' ELSE 'chat_created' END,
              'conversation_id',v_conversation_id,'match',v_match);

$new$ || substring(d FROM end_at);
  EXECUTE d;
END;
$patch$;
REVOKE ALL ON FUNCTION public.process_swipe_action(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_swipe_action(uuid,uuid,text,text) TO authenticated;

-- Feed: modifica solo el predicado de opt-in de Roomie. Abortara si cambian
-- alias/estructura, preservando intactos alojamiento y eventos de produccion.
DO $patch$
DECLARE d text; marker text := 'AND p.looking_for_roommate = true';
BEGIN
  d := pg_get_functiondef('public.get_discovery_feed(uuid,text,integer)'::regprocedure);
  IF strpos(d,'NOT public._social_pair_blocked(p.id)')>0 THEN RETURN; END IF;
  IF (length(d)-length(replace(d,marker,''))) <> length(marker) THEN
    RAISE EXCEPTION 'review_changed_roomie_feed_definition';
  END IF;
  d := replace(d,marker,marker || E'\n AND p.is_hidden IS NOT TRUE\n AND NOT public._social_pair_blocked(p.id)');
  EXECUTE d;
END;
$patch$;

-- Crush clasico: mismo contrato matched/instagram_handle y notificaciones.
-- No cambia politica de edad ni identidad de publicaciones anonimas.
CREATE OR REPLACE FUNCTION public._ig_request_apply(p_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_inserted int; v_matched boolean; v_handle text; v_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target IS NULL OR v_user=p_target THEN RAISE EXCEPTION 'invalid_target'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crush-live-pair:' || least(v_user,p_target)::text || ':' || greatest(v_user,p_target)::text,0));
  PERFORM p.id FROM public.profiles p
    WHERE p.id IN (v_user,p_target) ORDER BY p.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_user
    AND p.ligar_opted_in AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE) THEN
    RAISE EXCEPTION 'Activa Crush primero';
  END IF;
  IF public._social_pair_blocked(p_target) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=p_target
      AND p.ligar_opted_in AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE
  ) THEN RAISE EXCEPTION 'Esa persona ya no participa en Crush'; END IF;
  INSERT INTO public.ig_requests(requester_id,target_id)
    VALUES(v_user,p_target) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  v_matched := EXISTS(SELECT 1 FROM public.ig_requests
    WHERE requester_id=p_target AND target_id=v_user);
  IF v_matched THEN SELECT instagram_handle INTO v_handle FROM public.profiles WHERE id=p_target; END IF;
  IF v_inserted=1 THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id=v_user;
    INSERT INTO public.notifications(user_id,type,title,body,data)
    VALUES(p_target,'match',
      CASE WHEN v_matched THEN '¡Match en Crush! 💜'
        ELSE coalesce(v_name,'Alguien') || ' quiere intercambiar Instagram contigo' END,
      CASE WHEN v_matched THEN coalesce(v_name,'Alguien') || ' también quería tu Instagram. Ya podéis verlo.'
        ELSE 'Acéptalo en Crush para ver su Instagram (y que vea el tuyo).' END,
      jsonb_build_object('kind',CASE WHEN v_matched THEN 'ig_match' ELSE 'ig_request' END,'url','/crush'));
  END IF;
  RETURN jsonb_build_object('matched',v_matched,'instagram_handle',v_handle);
END;
$$;
REVOKE ALL ON FUNCTION public._ig_request_apply(uuid) FROM PUBLIC, anon, authenticated;
-- request_ig/request_ig_for_post existentes son DEFINER y conservan acceso owner.

CREATE OR REPLACE FUNCTION public.get_ig_matches()
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_user
    AND p.ligar_opted_in AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE) THEN RETURN; END IF;
  RETURN QUERY SELECT jsonb_build_object(
    'id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,
    'age',CASE WHEN p.birth_date IS NOT NULL THEN extract(year FROM age(p.birth_date))::int ELSE NULL END,
    'instagram_handle',p.instagram_handle,'verified',coalesce(p.instagram_verified,false),
    'matched_at',greatest(mine.created_at,theirs.created_at))
  FROM public.ig_requests mine JOIN public.ig_requests theirs
    ON theirs.requester_id=mine.target_id AND theirs.target_id=mine.requester_id
  JOIN public.profiles p ON p.id=mine.target_id
  WHERE mine.requester_id=v_user AND p.ligar_opted_in
    AND p.is_discarded IS NOT TRUE AND p.ig_quarantined IS NOT TRUE
    AND NOT public._social_pair_blocked(p.id)
  ORDER BY greatest(mine.created_at,theirs.created_at) DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ig_matches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ig_matches() TO authenticated;

-- Smoke checks execute before this migration can commit. No messages or swipes
-- are created: the forged write must abort in its BEFORE trigger.
DO $$
DECLARE v_saved text:=current_setting('request.jwt.claims',true); v_me uuid; v_other uuid; v_count int;
BEGIN
  IF has_function_privilege('anon','public.process_swipe_action(uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public._ig_request_apply(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected_social_grant';
  END IF;
  SELECT id INTO v_me FROM public.profiles WHERE role NOT IN ('admin','analyst') AND is_discarded IS NOT TRUE ORDER BY ligar_opted_in DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_other FROM public.profiles WHERE id<>v_me AND is_discarded IS NOT TRUE LIMIT 1;
  IF v_me IS NOT NULL AND v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_me,'role','authenticated','aal','aal1')::text,true);
    SELECT count(*) INTO v_count FROM public.get_ig_matches();
    PERFORM set_config('role','authenticated',true);
    BEGIN
      INSERT INTO public.roommate_matches(user_id,matched_user_id,status,compatibility_score)
      VALUES(v_me,v_other,'matched',100);
      RAISE EXCEPTION 'forged_match_not_rejected';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'match_requires_reciprocity' THEN RAISE; END IF;
    END;
    PERFORM set_config('role','none',true);
  END IF;
  PERFORM set_config('request.jwt.claims',coalesce(v_saved,''),true);
END; $$;
