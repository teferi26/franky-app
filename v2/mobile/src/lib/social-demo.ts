import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { supabase } from './supabase';
import { captureSessionIdentity, isCurrentSessionIdentity } from './session';
import { useSessionOwner } from './useSessionOwner';
import { toastError } from './toast';

export type SocialDemoAccess = { demo: false } | { demo: true; active: boolean; label: string; cohort_id: string };

export type SocialDemoFeature = 'calls' | 'groups' | 'chatPolls' | 'avatar' | 'publicMedia';

const DEMO_FEATURE_NOTICES: Record<SocialDemoFeature, string> = {
  calls: 'Las llamadas no están disponibles en esta demostración. Puedes probar los mensajes y los adjuntos privados del chat.',
  groups: 'Esta demostración incluye chats individuales. Crear grupos no está disponible.',
  chatPolls: 'Esta demo incluye chat individual y adjuntos privados. Las llamadas, encuestas y quedadas del chat no están disponibles. Sí puedes probar las encuestas de FOMO.',
  avatar: 'Esta demostración utiliza un avatar ficticio fijo. Puedes editar los demás datos permitidos del perfil.',
  publicMedia: 'En esta demostración puedes publicar texto y encuestas de FOMO. Las fotos, vídeos, audios públicos e historias no están disponibles; los adjuntos privados del chat sí.',
};

/** Presentation only: the server remains responsible for authorizing every operation. */
export function socialDemoFeatureNotice(access: SocialDemoAccess | null, feature: SocialDemoFeature): string | null {
  if (!access) return 'No se ha podido comprobar la disponibilidad de esta función. Comprueba tu conexión y vuelve a intentarlo.';
  if (!access.demo) return null;
  if (!access.active) return 'Esta demostración ya no está activa. Solicita un nuevo acceso a Franky.';
  return DEMO_FEATURE_NOTICES[feature];
}

/** Recheck before opening devices or submitting: an old render/cache is not authorization. */
export async function ensureSocialDemoFeature(feature: SocialDemoFeature): Promise<boolean> {
  const owner = captureSessionIdentity();
  if (!owner) return false;
  const access = await readSocialDemoAccess({ fresh: true });
  if (!isCurrentSessionIdentity(owner)) return false;
  const notice = socialDemoFeatureNotice(access, feature);
  if (notice) {
    Alert.alert(access?.demo ? 'Límite de la demostración' : 'Verifica tu conexión', notice);
    return false;
  }
  return true;
}

type AccessEntry = { key: string; access: SocialDemoAccess | null; expiresAt: number; pending: Promise<SocialDemoAccess | null> | null; failures: number; retryable: boolean; errorUntil: number };
let cached: AccessEntry | null = null;
const CACHE_MS = 10_000;

/** The marker comes from the server registry, never editable user metadata. */
export async function readSocialDemoAccess({ fresh = false }: { fresh?: boolean } = {}): Promise<SocialDemoAccess | null> {
  const owner = captureSessionIdentity();
  if (!owner) { cached = null; return null; }
  const key = `${owner.userId}:${owner.generation}`;
  if (cached?.key !== key) cached = { key, access: null, expiresAt: 0, pending: null, failures: 0, retryable: true, errorUntil: 0 };
  const entry = cached;
  if (entry.pending) return entry.pending;
  if (entry.errorUntil > Date.now()) return null;
  if (!fresh && entry.access && entry.expiresAt > Date.now()) return entry.access;
  const failed = (code?: string) => {
    entry.failures++;
    entry.retryable = !['401', '403', '42501', 'PGRST202', 'PGRST301'].includes(code ?? '');
    entry.errorUntil = entry.retryable ? 0 : Date.now() + 60_000;
  };
  entry.pending = (async () => {
    // Keep single-flight assignment valid even if an adapter throws synchronously.
    await Promise.resolve();
    try {
      const { data, error } = await supabase.rpc('get_social_demo_access');
      if (!isCurrentSessionIdentity(owner)) return null;
      if (error || typeof data?.demo !== 'boolean') { failed(error?.code); return null; }
      if (data.demo && (typeof data.active !== 'boolean' || typeof data.label !== 'string' || typeof data.cohort_id !== 'string')) { failed(); return null; }
      const access = data as SocialDemoAccess;
      entry.access = access;
      entry.expiresAt = Date.now() + CACHE_MS;
      entry.failures = 0;
      entry.retryable = true;
      entry.errorUntil = 0;
      return access;
    } catch { failed(); return null; }
    finally { entry.pending = null; }
  })();
  return entry.pending;
}

export function useSocialDemoAccessState() {
  const owner = useSessionOwner();
  const key = owner ? `${owner.userId}:${owner.generation}` : '';
  const [state, setState] = useState<{ key: string; access: SocialDemoAccess | null; checking: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async (fresh = false) => {
      if (retry) clearTimeout(retry);
      if (!key) return;
      setState(previous => ({ key, access: previous?.key === key ? previous.access : null, checking: true }));
      const access = await readSocialDemoAccess({ fresh });
      if (!current) return;
      // Preserve a known demo warning during outages, never a stale real-account capability.
      if (access) setState({ key, access, checking: false });
      else {
        setState(previous => ({ key, access: previous?.key === key && previous.access?.demo ? previous.access : null, checking: false }));
        if (cached?.key === key && cached.retryable && cached.failures < 3) {
          retry = setTimeout(() => { void refresh(true); }, 4_000 * 2 ** Math.max(0, cached.failures - 1));
        }
      }
    };
    void refresh(revision > 0);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(true); });
    return () => { current = false; if (retry) clearTimeout(retry); subscription.remove(); };
  }, [key, revision]);
  return { access: state?.key === key ? state.access : null, checking: !!key && (state?.key !== key || state.checking), retry };
}

export function useSocialDemoAccess() {
  return useSocialDemoAccessState().access;
}

export async function openSocialInstagram(rawHandle: string) {
  const handle = rawHandle.replace(/^@/, '');
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return;
  const access = await readSocialDemoAccess({ fresh: true });
  if (!access) { toastError('No se pudo comprobar el contacto', 'Vuelve a intentarlo.'); return; }
  if (access.demo) {
    Alert.alert('Contacto ficticio', 'Esta cuenta es una demostración aislada. Puedes probar el match y el chat dentro de Franky; este Instagram no pertenece a una persona real.');
    return;
  }
  await Linking.openURL(`https://www.instagram.com/${encodeURIComponent(handle)}/`).catch(() => toastError('No se pudo abrir Instagram'));
}
