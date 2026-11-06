import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { notificationNativeDestination as routeForNotificationData } from './notification-destinations';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from './session';
import { createPushRegistration } from './push-registration';
import { createNotificationResponseHandler } from './notification-response';

const TOKEN_KEY = 'franky.push.device-token.v1';

// Canales de Android. El servidor (web/src/lib/push-delivery.ts, pushChannel)
// elige uno por categoría: mensajes y matches saltan como aviso emergente con
// sonido (HIGH); comentarios y seguidos avisan sin interrumpir; el resto va
// al canal general. Los nombres son los que la persona ve en Ajustes.
const ANDROID_CHANNELS: { id: string; name: string; description: string; importance: Notifications.AndroidImportance }[] = [
  { id: 'messages', name: 'Mensajes', description: 'Chats nuevos y respuestas', importance: Notifications.AndroidImportance.HIGH },
  { id: 'crush', name: 'Crush y matches', description: 'Matches, Franky Tap y me gusta', importance: Notifications.AndroidImportance.HIGH },
  { id: 'social', name: 'Comentarios y seguidos', description: 'Comentarios a tus publicaciones y gente a la que sigues', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'default', name: 'General', description: 'Eventos, pisos, becas y avisos de Franky', importance: Notifications.AndroidImportance.DEFAULT },
];
async function ensureAndroidChannels(): Promise<void> {
  for (const channel of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name, description: channel.description, importance: channel.importance,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE, lightColor: '#8C58D4',
      sound: 'default', vibrationPattern: channel.importance === Notifications.AndroidImportance.HIGH ? [0, 200, 120, 200] : undefined,
    }).catch(() => {});
  }
}
const seenResponses = new Set<string>();
function projectId(): string | null {
  const value = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof value === 'string' && value !== 'RELLENAR_CON_EAS_INIT' ? value : null;
}
async function expoToken(): Promise<string | null> {
  const project = projectId();
  if (!Device.isDevice || !project || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: project });
  if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(data)) throw new Error('invalid_push_token');
  await AsyncStorage.setItem(TOKEN_KEY, data);
  return data;
}
const registration = createPushRegistration({
  current: isCurrentSessionIdentity,
  async prepare() {
    if (!Device.isDevice || !projectId() || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
    if (Platform.OS === 'android') await ensureAndroidChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    return status === 'granted' ? expoToken() : null;
  },
  async existing() {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
    if (!Device.isDevice || (await Notifications.getPermissionsAsync()).status !== 'granted') return null;
    return expoToken();
  },
  async claim(owner, token) {
    if (!isCurrentSessionIdentity(owner)) return;
    const { error } = await supabase.rpc('register_my_push_device', {
      p_expected_user_id: owner.userId, p_token: token, p_platform: Platform.OS,
      p_app_version: Constants.expoConfig?.version ?? null, p_device_model: Device.modelName ?? null,
      p_locale: Intl.DateTimeFormat().resolvedOptions().locale ?? null,
    });
    if (error) throw error;
  },
  async remove(owner, token) {
    if (!isCurrentSessionIdentity(owner)) throw new Error('session_changed');
    const { error } = await supabase.rpc('unregister_my_push_device', { p_expected_user_id: owner.userId, p_token: token });
    if (error) throw error;
  },
});

export async function registerForPushNotifications(expectedUserId?: string): Promise<void> {
  const owner = captureSessionIdentity();
  if (!owner || (expectedUserId && owner.userId !== expectedUserId)) return;
  try { await registration.register(owner); }
  catch { console.warn('[push] No se pudo registrar este dispositivo; se reintentará al abrir la app.'); }
}
export function unregisterPushToken(owner: SessionIdentity): Promise<void> {
  return registration.unregister(owner);
}
export function resumePushRegistration(owner: SessionIdentity): void { registration.resume(owner); }

/** Remote and local payloads carry the actual recipient, never the match peer. */
export function canPresentNotification(data: Record<string, unknown>): boolean {
  const owner = captureSessionIdentity();
  return !!owner && data?.recipient_user_id === owner.userId;
}
export { routeForNotificationData };

export function addNotificationResponseListener(navigate: (route: string) => void, expectedUserId: string): () => void {
  const owner = captureSessionIdentity();
  if (!owner || owner.userId !== expectedUserId) return () => {};
  const handler = createNotificationResponseHandler({
    owner: owner.userId, isCurrent: () => isCurrentSessionIdentity(owner), destination: routeForNotificationData,
    navigate, consume: () => Notifications.clearLastNotificationResponseAsync(), seen: seenResponses,
  });
  const subscription = Notifications.addNotificationResponseReceivedListener(handler.handle);
  void Notifications.getLastNotificationResponseAsync().then(handler.handle).catch(() => {});
  return () => { handler.stop(); subscription.remove(); };
}
