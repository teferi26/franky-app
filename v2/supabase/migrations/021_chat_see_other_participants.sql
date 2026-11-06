-- =====================================================
-- 021: Allow users to see other participants in their conversations
-- =====================================================
-- The original policy on conversation_participants only allowed users to
-- see their own row (auth.uid() = user_id). This caused the chat list to
-- never resolve the other participant's profile, so the UI fell back to
-- the literal "Usuario" placeholder for every conversation.
--
-- A naive policy that subqueries conversation_participants would recurse
-- through its own policy, so we route the membership check through a
-- SECURITY DEFINER helper that bypasses RLS for that single check.

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conv UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conv
      AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "Users see own conversations" ON public.conversation_participants;

CREATE POLICY "Users see participants of their conversations"
  ON public.conversation_participants FOR SELECT
  USING (
    public.is_conversation_member(conversation_id)
  );
