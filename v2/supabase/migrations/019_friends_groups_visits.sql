-- =====================================================
-- 019: Fase E — Friendships, Groups & Visit Requests
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. FRIENDSHIPS (symmetric via LEAST/GREATEST)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
  user_a_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','declined')),
  requested_by  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_a ON public.friendships(user_a_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON public.friendships(user_b_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requested_by ON public.friendships(requested_by);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select_own" ON public.friendships;
CREATE POLICY "friendships_select_own" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "friendships_insert_requester" ON public.friendships;
CREATE POLICY "friendships_insert_requester" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  );

DROP POLICY IF EXISTS "friendships_update_participants" ON public.friendships;
CREATE POLICY "friendships_update_participants" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "friendships_delete_participants" ON public.friendships;
CREATE POLICY "friendships_delete_participants" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Helper: send friend request (handles LEAST/GREATEST ordering)
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target UUID)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_a  UUID;
  v_b  UUID;
  v_row public.friendships%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_me = p_target THEN RAISE EXCEPTION 'cannot_friend_self'; END IF;

  IF v_me < p_target THEN v_a := v_me; v_b := p_target;
  ELSE v_a := p_target; v_b := v_me;
  END IF;

  -- Block check
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

  -- Notify target
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
-- 2. GROUPS (reuses conversations; each group owns one chat)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS group_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add admin role per participant
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin','member'));

-- Helper: create group with members (creator becomes admin)
CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_name    TEXT,
  p_members UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_conv UUID;
  v_uid UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_members IS NULL OR array_length(p_members, 1) IS NULL THEN RAISE EXCEPTION 'members_required'; END IF;

  INSERT INTO public.conversations (is_group, group_name, created_by)
  VALUES (true, trim(p_name), v_me)
  RETURNING id INTO v_conv;

  -- Creator as admin
  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_conv, v_me, 'admin');

  -- Members (skip duplicates, skip creator)
  FOREACH v_uid IN ARRAY p_members LOOP
    IF v_uid IS NOT NULL AND v_uid <> v_me THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, role)
      VALUES (v_conv, v_uid, 'member')
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  -- System welcome message
  INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
  VALUES (v_conv, v_me, 'Grupo creado', 'system');

  RETURN v_conv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, UUID[]) TO authenticated;

-- Helper: leave group (last admin promotes oldest remaining member)
CREATE OR REPLACE FUNCTION public.leave_group_chat(p_conv UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_is_group BOOLEAN;
  v_remaining INT;
  v_admins_left INT;
  v_promote UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT is_group INTO v_is_group FROM public.conversations WHERE id = p_conv;
  IF v_is_group IS NOT TRUE THEN RAISE EXCEPTION 'not_a_group'; END IF;

  DELETE FROM public.conversation_participants
  WHERE conversation_id = p_conv AND user_id = v_me;

  SELECT COUNT(*) INTO v_remaining
  FROM public.conversation_participants WHERE conversation_id = p_conv;

  IF v_remaining = 0 THEN
    DELETE FROM public.conversations WHERE id = p_conv;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_admins_left
  FROM public.conversation_participants
  WHERE conversation_id = p_conv AND role = 'admin';

  IF v_admins_left = 0 THEN
    SELECT user_id INTO v_promote
    FROM public.conversation_participants
    WHERE conversation_id = p_conv
    ORDER BY joined_at ASC LIMIT 1;

    UPDATE public.conversation_participants
    SET role = 'admin'
    WHERE conversation_id = p_conv AND user_id = v_promote;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_group_chat(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 3. VISIT REQUESTS (roomie duo proposes a joint flat visit)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_requests (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  requester_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accommodation_id   UUID        REFERENCES public.accommodations(id) ON DELETE SET NULL,
  preferred_date     DATE,
  notes              TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_requests_conv ON public.visit_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_target ON public.visit_requests(target_id, status);
CREATE INDEX IF NOT EXISTS idx_visit_requests_requester ON public.visit_requests(requester_id);

ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_requests_select_participants" ON public.visit_requests;
CREATE POLICY "visit_requests_select_participants" ON public.visit_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

DROP POLICY IF EXISTS "visit_requests_insert_requester" ON public.visit_requests;
CREATE POLICY "visit_requests_insert_requester" ON public.visit_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = visit_requests.conversation_id
        AND cp.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = visit_requests.conversation_id
        AND cp.user_id = visit_requests.target_id
    )
  );

DROP POLICY IF EXISTS "visit_requests_update_participants" ON public.visit_requests;
CREATE POLICY "visit_requests_update_participants" ON public.visit_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = target_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = target_id);
