"use client";
import { createClient } from './supabase-client';
import { useEffect, useRef } from 'react';
import { useSession } from '@/components/SessionProvider';

export type SocialContentKind = 'fomo_thread' | 'fomo_reply' | 'crush_post' | 'story' | 'story_highlight' | 'community' | 'community_post';

export function useSocialModerationRefresh(refresh: () => unknown) {
  const { user } = useSession();
  const current = useRef(refresh); current.current = refresh;
  useEffect(() => {
    const listener = (event: Event) => {
      if (user?.id && (event as CustomEvent).detail?.owner === user.id) current.current();
    };
    window.addEventListener('franky:social-suppressed', listener);
    return () => window.removeEventListener('franky:social-suppressed', listener);
  }, [user?.id]);
}

/** Pin the actor while a confirmation or SDK request is in flight. */
export async function suppressSocialContent(owner: string, isCurrent: () => boolean, kind: SocialContentKind, id: string, block = false, hide = false) {
  const client = createClient();
  const controller = new AbortController();
  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || session?.user.id !== owner) controller.abort();
  });
  const check = () => { if (!isCurrent() || controller.signal.aborted) throw new Error('session_changed'); };
  try {
    check();
    const { data: { session }, error: authError } = await client.auth.getSession();
    check();
    if (authError || session?.user.id !== owner) throw new Error('session_required');
    const query = hide ? client.rpc('hide_social_content', { p_kind: kind, p_id: id }) : block
      ? client.rpc('block_social_content_author', { p_kind: kind, p_id: id })
      : client.rpc('report_social_content', { p_kind: kind, p_id: id, p_reason: 'inapropiado' });
    const { error } = await query.setHeader('Authorization', `Bearer ${session.access_token}`).abortSignal(controller.signal);
    check();
    if (error) throw new Error('moderation_failed');
    window.dispatchEvent(new CustomEvent('franky:social-suppressed', { detail: { owner, kind, id } }));
  } finally {
    controller.abort();
    listener.subscription.unsubscribe();
  }
}
