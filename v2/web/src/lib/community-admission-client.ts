import { createClient } from './supabase-client';

export type CommunityAdmission = {
  id: string; name: string; description: string | null; kind: string; image_url: string | null;
  is_private: boolean; created_by: string; is_member: boolean; member_count: number;
  join_policy: 'open' | 'request' | 'invite'; admission_id: string | null; admission_status: string | null;
};
export type CommunityInvitation = { id: string; community_id: string; name: string; expires_at: string };

/** Pin the actor through delayed SDK requests and discard account-switched responses. */
export async function communityRpc<T>(name: string, args: Record<string, unknown>, owner: string | null, isCurrent: () => boolean): Promise<T> {
  if (!owner || !isCurrent()) throw new Error('session_changed');
  const client = createClient(); const controller = new AbortController();
  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== owner) controller.abort();
  });
  const check = () => { if (!isCurrent() || controller.signal.aborted) throw new Error('session_changed'); };
  try {
    const { data: { session }, error: sessionError } = await client.auth.getSession(); check();
    if (sessionError || session?.user.id !== owner || !session.access_token) throw new Error('session_changed');
    const { data, error } = await client.rpc(name, args).setHeader('Authorization', `Bearer ${session.access_token}`).abortSignal(controller.signal);
    check(); if (error) throw error; return data as T;
  } finally { subscription.unsubscribe(); controller.abort(); }
}

export function communityAdmissionAction(community: CommunityAdmission): { name: string; args: Record<string, unknown>; requested: boolean } {
  if (community.admission_status === 'invited' && community.admission_id) return { name: 'respond_community_invitation', args: { p_id: community.admission_id, p_accept: true }, requested: false };
  return { name: community.join_policy === 'request' ? 'request_community_admission' : 'join_community', args: { p_id: community.id }, requested: community.join_policy === 'request' };
}

export function communityAdmissionError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/session_changed/.test(message)) return 'La cuenta ha cambiado. Vuelve a abrir la comunidad.';
  if (/community_request_cooldown/.test(message)) return 'Podrás volver a solicitar acceso cuando hayan pasado siete días desde el rechazo.';
  if (/community_invitation_(required|unavailable)/.test(message)) return 'Necesitas una invitación vigente para entrar en esta comunidad.';
  if (/community_not_found/.test(message)) return 'Esta comunidad no está disponible para tu cuenta.';
  return 'No se ha completado la operación. Comprueba tu conexión e inténtalo de nuevo.';
}
