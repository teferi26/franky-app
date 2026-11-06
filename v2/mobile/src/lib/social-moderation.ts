import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from './supabase';
import { toast, toastError } from './toast';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';

export type SocialContentKind = 'fomo_thread' | 'fomo_reply' | 'crush_post' | 'story' | 'story_highlight' | 'community' | 'community_post';
const listeners = new Set<(owner: string) => void>();

/** Refresh every mounted social surface after a persisted report or block. */
export function useSocialModerationRefresh(refresh: () => unknown) {
  const current = useRef(refresh);
  current.current = refresh;
  useEffect(() => {
    let alive = true;
    const listener = (owner: string) => {
      void supabase.auth.getSession().then(({ data }) => {
        if (alive && data.session?.user.id === owner) current.current();
      });
    };
    listeners.add(listener);
    return () => { alive = false; listeners.delete(listener); };
  }, []);
}

async function persistAction(kind: SocialContentKind, id: string, reason: string | null, block: boolean, owner: SessionIdentity | null) {
  return withOwnedRequest(owner, async request => {
    const query = block
      ? supabase.rpc('block_social_content_author', { p_kind: kind, p_id: id })
      : supabase.rpc('report_social_content', { p_kind: kind, p_id: id, p_reason: reason });
    const { error } = await request.query(query);
    request.check();
    if (error) throw error;
    listeners.forEach(listener => listener(request.owner.userId));
    return true;
  });
}

export async function reportSocialContent(kind: SocialContentKind, id: string, reason: string | null = null) {
  const owner = captureSessionIdentity();
  try {
    if (!await persistAction(kind, id, reason, false, owner)) return false;
    toast('Denuncia enviada', { body: 'Ya no verás este contenido. El equipo revisará la denuncia.' });
    return true;
  } catch {
    if (!owner || !isCurrentSessionIdentity(owner)) return false;
    toastError('No se pudo denunciar', 'Inténtalo de nuevo. La denuncia todavía no se ha guardado.');
    return false;
  }
}

/** One tap, no confirmation dialog: persist the viewer's choice across feeds/devices. */
export async function hideSocialContent(kind: SocialContentKind, id: string, onSuppressed: () => void) {
  const owner = captureSessionIdentity();
  try {
    await withOwnedRequest(owner, async request => {
      const { error } = await request.query(supabase.rpc('hide_social_content', { p_kind: kind, p_id: id }));
      request.check();
      if (error) throw error;
      onSuppressed();
      listeners.forEach(listener => listener(request.owner.userId));
      toast('Contenido oculto');
    });
  } catch {
    if (owner && isCurrentSessionIdentity(owner)) toastError('No se pudo ocultar', 'Comprueba la conexión e inténtalo de nuevo.');
  }
}

export async function confirmSocialAction(kind: SocialContentKind, id: string, block: boolean, onSuppressed: () => void) {
  const owner = captureSessionIdentity();
  if (!owner) { toastError('Inicia sesión para continuar'); return; }
  Alert.alert(block ? 'Bloquear a esta persona' : 'Denunciar contenido',
    block ? 'Dejarás de ver sus publicaciones. Si publicó en anónimo, su identidad seguirá oculta.'
      : 'Este contenido desaparecerá de tu vista y el equipo recibirá la denuncia.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: block ? 'Bloquear' : 'Denunciar', style: 'destructive', onPress: async () => {
        try {
          if (!await persistAction(kind, id, 'inapropiado', block, owner)) return;
          onSuppressed();
          toast(block ? 'Persona bloqueada' : 'Denuncia enviada');
        } catch { if (isCurrentSessionIdentity(owner)) toastError('No se ha guardado', 'Comprueba la conexión e inténtalo de nuevo.'); }
      } },
    ]);
}
