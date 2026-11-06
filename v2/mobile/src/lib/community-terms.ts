import { Alert, Linking } from 'react-native';
import { supabase } from './supabase';
import { captureSessionIdentity, isCurrentSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAccountStorage } from './account-storage';

export const COMMUNITY_TERMS_VERSION = '2026-09-10';
const acceptedAccounts = new Set<string>();
const acceptanceKey = `franky:community-terms:${COMMUNITY_TERMS_VERSION}`;
const acceptanceStorage = createAccountStorage(AsyncStorage, { capture: captureSessionIdentity, current: isCurrentSessionIdentity });
/** This cache avoids a legal-form flash; social writes still validate on server. */
export function hasCachedCommunityAcceptance(id: string) { return acceptedAccounts.has(id); }
export async function loadCachedCommunityAcceptance(id: string): Promise<boolean> {
 if (acceptedAccounts.has(id)) return true;
 const owner = captureSessionIdentity();
 if (!owner || owner.userId !== id) return false;
 const accepted = await acceptanceStorage.get(owner, acceptanceKey).catch(() => null) === 'accepted';
 if (accepted) acceptedAccounts.add(id);
 return accepted;
}
export async function cacheCommunityAcceptance(id: string, accepted: boolean): Promise<void> {
 const owner = captureSessionIdentity();
 if (!owner || owner.userId !== id) return;
 if (accepted) acceptedAccounts.add(id); else acceptedAccounts.delete(id);
 await (accepted ? acceptanceStorage.set(owner, acceptanceKey, 'accepted') : acceptanceStorage.remove(owner, acceptanceKey)).catch(() => {});
}
export async function ensureCommunityTerms(): Promise<boolean> {
 const owner = captureSessionIdentity();
 if (!owner) return false;
 return withOwnedRequest(owner, async request => {
  const { data, error } = await request.query(supabase.rpc('community_terms_accepted'));
  request.check();
  if (error) throw new Error('No se pudieron consultar las normas. Inténtalo de nuevo.');
  if (data === true) { await cacheCommunityAcceptance(owner.userId, true); return true; }
  await cacheCommunityAcceptance(owner.userId, false);
  const accepted = await new Promise<boolean>(resolve => Alert.alert('Normas de la comunidad',
   'Tolerancia cero con el acoso, las amenazas, el odio, la explotación sexual, el contenido sexual explícito y la difusión de datos privados. Revisamos las publicaciones antes de mostrarlas. Al aceptar autorizas enviar el texto, las encuestas y las imágenes de tus publicaciones a Google Gemini para detectar abusos; no enviamos tu identificador interno de cuenta. Los audios y vídeos los revisa nuestro equipo. Puedes denunciar y bloquear personas. Las infracciones pueden suponer retirada de contenido y suspensión de la cuenta. Aceptas las normas y los términos de uso; consulta el tratamiento de datos en franky.es/privacidad.', [
    { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Leer normas', onPress: () => { void Linking.openURL('https://franky.es/terminos'); resolve(false); } },
    { text: 'He leído y acepto', onPress: () => resolve(true) },
   ], { cancelable: true, onDismiss: () => resolve(false) }));
  if (!accepted || !isCurrentSessionIdentity(owner)) return false;
  const result = await request.query(supabase.rpc('accept_community_terms', { p_version: COMMUNITY_TERMS_VERSION }));
  request.check();
  if (result.error) throw new Error('No se ha guardado la aceptación. Inténtalo de nuevo.');
  await cacheCommunityAcceptance(owner.userId, true);
  return true;
 });
}
