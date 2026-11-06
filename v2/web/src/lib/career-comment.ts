import type { SupabaseClient } from '@supabase/supabase-js';

export type CareerCommentDraft = {
  id: string;
  career_id: string;
  user_id: string;
  content: string;
  is_anonymous: boolean;
  parent_id: string | null;
};

/** Reuse the draft ID after an uncertain response; never retry under another identity. */
export async function publishCareerComment(client: SupabaseClient, draft: CareerCommentDraft) {
  const { error } = await client.from('career_comments').insert(draft);
  if (!error) return;
  if (error.code === '23505') {
    const { data: existing, error: readError } = await client.from('career_comments')
      .select('id, career_id, user_id, content, is_anonymous, parent_id')
      .eq('id', draft.id).eq('user_id', draft.user_id).maybeSingle();
    if (!readError && existing && (Object.keys(draft) as (keyof CareerCommentDraft)[]).every(key =>
      existing[key] === draft[key])) return;
  }
  throw error;
}
