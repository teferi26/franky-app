-- =====================================================
-- 023: Fix chat RPCs so 1:1 and event chats land in /chats
-- =====================================================
-- Two bugs were keeping chats out of the user's list:
--
-- 1) Event chats (migration 013) were created with the columns
--    (type, name) added by 013, but the rest of the codebase + the
--    new get_my_chats() RPC reads (is_group, group_name). Result: the
--    event conversation rows were treated as 1:1 with no other_user
--    and (worse) sometimes filtered out entirely.
--
-- 2) get_or_create_direct_chat (used by Roomie Match → "Mensaje")
--    was referenced from the client but missing from migrations,
--    so 1:1 chats spawned from Roomie Match were either failing or
--    landing in an inconsistent state where one of the participants
--    was never inserted.
--
-- This migration:
-- - Backfills is_group/group_name from the legacy type/name columns
-- - Recreates join_event_chat to populate is_group/group_name
-- - Creates get_or_create_direct_chat (idempotent 1:1 conversation)

-- ─── Backfill legacy event conversations ──────────────────────────────────────
-- Some conversations created by the old join_event_chat have type='group' /
-- name='...' but is_group=false/null. Bring them into the canonical shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'type'
  ) THEN
    UPDATE public.conversations
       SET is_group = true,
           group_name = COALESCE(group_name, name)
     WHERE type = 'group' AND COALESCE(is_group, false) = false;
  END IF;
END $$;

-- ─── Fix join_event_chat to use is_group/group_name ───────────────────────────
CREATE OR REPLACE FUNCTION public.join_event_chat(
  p_event_id UUID,
  p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_event_title     TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  SELECT ec.conversation_id INTO v_conversation_id
  FROM public.event_conversations ec
  WHERE ec.event_id = p_event_id;

  IF v_conversation_id IS NULL THEN
    SELECT e.title INTO v_event_title
    FROM public.events e
    WHERE e.id = p_event_id;

    INSERT INTO public.conversations (is_group, group_name)
    VALUES (true, COALESCE(v_event_title, 'Evento'))
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.event_conversations (event_id, conversation_id)
    VALUES (p_event_id, v_conversation_id);
  ELSE
    -- Make sure existing event conversation has the new-shape fields populated
    UPDATE public.conversations
       SET is_group = true,
           group_name = COALESCE(group_name,
                         (SELECT title FROM public.events WHERE id = p_event_id))
     WHERE id = v_conversation_id
       AND COALESCE(is_group, false) = false;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, p_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_event_chat(UUID, UUID) TO authenticated, anon, service_role;

-- ─── get_or_create_direct_chat (used by Roomie Match) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_conv_id UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  -- Find an existing 1:1 conversation between us
  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants p1
    ON p1.conversation_id = c.id AND p1.user_id = v_me
  JOIN public.conversation_participants p2
    ON p2.conversation_id = c.id AND p2.user_id = p_other_user_id
  WHERE COALESCE(c.is_group, false) = false
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Otherwise create a fresh 1:1 conversation with both participants
  INSERT INTO public.conversations (is_group)
  VALUES (false)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_me),
         (v_conv_id, p_other_user_id);

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
