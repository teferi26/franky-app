-- =====================================================
-- 017: Chat Pro — user_blocks, read_at, unread index
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. USER BLOCKS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Blockers can see/create/delete their own blocks
CREATE POLICY "Users manage own blocks"
  ON public.user_blocks
  FOR ALL
  USING  (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

-- Blocked users can see they are blocked (needed for UI to work)
CREATE POLICY "Blocked users can see they are blocked"
  ON public.user_blocks
  FOR SELECT
  USING (auth.uid() = blocked_id);

-- ─────────────────────────────────────────────────────
-- 2. ADD read_at TO messages (per-message read timestamp)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Index: fast unread count queries per conversation
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages(conversation_id, read_at)
  WHERE read_at IS NULL;

-- ─────────────────────────────────────────────────────
-- 3. FUNCTION: get_or_create_conversation(uid1, uid2)
-- Returns the existing direct conversation_id between two users,
-- or creates a new one.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_user1 UUID,
  p_user2 UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Look for existing 1-on-1 conversation (exactly 2 participants)
  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = p_user1
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = p_user2
  WHERE (
    SELECT COUNT(*) FROM public.conversation_participants cp3
    WHERE cp3.conversation_id = c.id
  ) = 2
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, p_user1), (v_conv_id, p_user2);
  END IF;

  RETURN v_conv_id;
END;
$$;
