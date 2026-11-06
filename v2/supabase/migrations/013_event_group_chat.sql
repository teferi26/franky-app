-- =====================================================
-- 013: Event Group Chat, Event Rules, Participant Privacy
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. EVENT CONVERSATIONS (maps events ↔ conversations)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_conv_event ON public.event_conversations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_conv_conversation ON public.event_conversations(conversation_id);

ALTER TABLE public.event_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event participants can view event conversation"
  ON public.event_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = event_conversations.event_id
        AND ep.user_id = auth.uid()
        AND ep.status != 'cancelled'
    )
    OR is_admin()
  );

CREATE POLICY "Admins manage event conversations"
  ON public.event_conversations FOR ALL
  USING (is_admin());

-- ─────────────────────────────────────────────────────
-- 2. EVENT RULES
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    rule_text TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_rules_event ON public.event_rules(event_id, display_order);

ALTER TABLE public.event_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read event rules"
  ON public.event_rules FOR SELECT
  USING (true);

CREATE POLICY "Organizer or admin can manage rules"
  ON public.event_rules FOR ALL
  USING (
    created_by = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_rules.event_id
        AND e.organizer_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────
-- 3. ADD PRIVACY + KICK FIELDS TO event_participants
-- ─────────────────────────────────────────────────────
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS privacy TEXT NOT NULL DEFAULT 'public'
    CHECK (privacy IN ('public', 'private')),
  ADD COLUMN IF NOT EXISTS kicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kicked_by UUID REFERENCES auth.users(id);

-- ─────────────────────────────────────────────────────
-- 4. FUNCTION: join_event_chat(event_id, user_id)
-- Creates or retrieves the group conversation for an event
-- and adds the user as a participant.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_event_chat(
  p_event_id UUID,
  p_user_id  UUID
)
RETURNS UUID  -- returns the conversation_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
  v_event_title     TEXT;
BEGIN
  -- 1. Get or create the event conversation
  SELECT ec.conversation_id INTO v_conversation_id
  FROM public.event_conversations ec
  WHERE ec.event_id = p_event_id;

  IF v_conversation_id IS NULL THEN
    -- Create a new conversation for this event
    SELECT e.title INTO v_event_title FROM public.events e WHERE e.id = p_event_id;

    INSERT INTO public.conversations (type, name)
    VALUES ('group', v_event_title)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.event_conversations (event_id, conversation_id)
    VALUES (p_event_id, v_conversation_id);
  END IF;

  -- 2. Add user to conversation if not already there
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, p_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 5. FUNCTION: kick_event_participant(event_id, target_user_id)
-- Only the event organizer or admin can kick.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kick_event_participant(
  p_event_id     UUID,
  p_target_user  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_organizer_id UUID;
  v_caller_id    UUID;
  v_conversation_id UUID;
BEGIN
  v_caller_id := auth.uid();

  SELECT organizer_id INTO v_organizer_id
  FROM public.events WHERE id = p_event_id;

  IF v_caller_id IS DISTINCT FROM v_organizer_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only the event organizer or an admin can kick participants';
  END IF;

  -- Mark as kicked in event_participants
  UPDATE public.event_participants
  SET status = 'cancelled', kicked_at = NOW(), kicked_by = v_caller_id
  WHERE event_id = p_event_id AND user_id = p_target_user;

  -- Remove from event group conversation
  SELECT ec.conversation_id INTO v_conversation_id
  FROM public.event_conversations ec
  WHERE ec.event_id = p_event_id;

  IF v_conversation_id IS NOT NULL THEN
    DELETE FROM public.conversation_participants
    WHERE conversation_id = v_conversation_id AND user_id = p_target_user;
  END IF;
END;
$$;

-- Ensure conversations table has a 'type' and 'name' column (may already exist)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  ADD COLUMN IF NOT EXISTS name TEXT;
