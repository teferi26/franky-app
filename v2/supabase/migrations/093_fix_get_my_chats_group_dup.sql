-- =====================================================
-- 093: Fix duplicados de chats grupales en get_my_chats
-- =====================================================
-- BUG: en la lista de chats, un grupo de evento (p.ej. "RUN + COFFEE · 20")
-- aparecía repetido decenas de veces.
--
-- CAUSA: el CTE `other_parts` devuelve UNA FILA POR CADA OTRO PARTICIPANTE de
-- la conversación. El query final hace:
--   FROM conversations c
--   LEFT JOIN other_parts op ON op.conversation_id = c.id
-- Para un chat directo other_parts tiene 1 fila (correcto), pero para un grupo
-- de N miembros tiene N-1 filas → el LEFT JOIN multiplica la fila del grupo
-- N-1 veces, generando N-1 entradas duplicadas en la lista.
--
-- FIX: `DISTINCT ON (cp.conversation_id)` en other_parts → como mucho una fila
-- por conversación. En chats directos sigue siendo el único "otro" usuario; en
-- grupos da igual cuál se elija porque other_user se fuerza a NULL para grupos.
-- No se toca ningún dato: cada evento sigue teniendo una sola conversación.

CREATE OR REPLACE FUNCTION public.get_my_chats()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result  JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;

  WITH my_convs AS (
    SELECT cp.conversation_id
    FROM public.conversation_participants cp
    WHERE cp.user_id = v_user_id
  ),
  blocked AS (
    SELECT CASE WHEN ub.blocker_id = v_user_id
                THEN ub.blocked_id
                ELSE ub.blocker_id END AS uid
    FROM public.user_blocks ub
    WHERE ub.blocker_id = v_user_id OR ub.blocked_id = v_user_id
  ),
  other_parts AS (
    -- DISTINCT ON evita que los grupos (N participantes) multipliquen la fila
    -- de la conversación en el LEFT JOIN final.
    SELECT DISTINCT ON (cp.conversation_id)
           cp.conversation_id,
           p.id AS user_id,
           p.full_name,
           p.avatar_url,
           u.name AS university
    FROM public.conversation_participants cp
    JOIN public.profiles p ON p.id = cp.user_id
    LEFT JOIN public.universities u ON u.id = p.university_id
    JOIN my_convs mc ON mc.conversation_id = cp.conversation_id
    WHERE cp.user_id <> v_user_id
    ORDER BY cp.conversation_id, p.full_name NULLS LAST, p.id
  ),
  member_counts AS (
    SELECT cp.conversation_id, COUNT(*)::INTEGER AS cnt
    FROM public.conversation_participants cp
    JOIN my_convs mc ON mc.conversation_id = cp.conversation_id
    GROUP BY cp.conversation_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content,
      m.message_type,
      m.created_at
    FROM public.messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.conversation_id, COUNT(*)::INTEGER AS cnt
    FROM public.messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    WHERE m.sender_id <> v_user_id AND m.read_at IS NULL
    GROUP BY m.conversation_id
  )
  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.sort_at DESC NULLS LAST), '[]'::json)
  INTO v_result
  FROM (
    SELECT
      c.id,
      COALESCE(c.is_group, false) AS is_group,
      CASE
        WHEN COALESCE(c.is_group, false) THEN 'group'
        ELSE 'direct'
      END AS conversation_type,
      c.group_name,
      c.group_avatar_url,
      COALESCE(mc.cnt, 1) AS member_count,
      CASE
        WHEN COALESCE(c.is_group, false) THEN NULL
        WHEN op.user_id IS NULL THEN NULL
        ELSE json_build_object(
          'id', op.user_id,
          'full_name', op.full_name,
          'avatar_url', op.avatar_url,
          'university', op.university
        )
      END AS other_user,
      CASE
        WHEN lm.message_type = 'system' THEN '📣 Mensaje del sistema'
        WHEN lm.message_type = 'image'  THEN '📷 Foto'
        WHEN lm.message_type = 'audio'  THEN '🎙️ Audio'
        ELSE lm.content
      END AS last_message,
      lm.created_at AS last_message_at,
      lm.created_at AS sort_at,
      COALESCE(u.cnt, 0) AS unread_count
    FROM public.conversations c
    JOIN my_convs mcv ON mcv.conversation_id = c.id
    LEFT JOIN other_parts op ON op.conversation_id = c.id
    LEFT JOIN member_counts mc ON mc.conversation_id = c.id
    LEFT JOIN last_msgs lm ON lm.conversation_id = c.id
    LEFT JOIN unread u ON u.conversation_id = c.id
    WHERE NOT (
      NOT COALESCE(c.is_group, false)
      AND op.user_id IS NOT NULL
      AND op.user_id IN (SELECT uid FROM blocked)
    )
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_chats() TO authenticated;

NOTIFY pgrst, 'reload schema';
