// ─── Analítica de producto (tabla analytics_events, migración 131) ───────────
// track(nombre, props) registra una acción del usuario. Best-effort y no
// bloqueante: si no hay sesión o falla la red, no pasa nada (el producto nunca
// se rompe por telemetría). La lectura la hace el panel admin con service role.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'franky_product_analytics';
export async function getAnalyticsConsent(): Promise<boolean> {
  try { return await AsyncStorage.getItem(CONSENT_KEY) === 'true'; } catch { return false; }
}
export async function setAnalyticsConsent(value: boolean): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, String(value));
}

const APP_VERSION = Constants.expoConfig?.version ?? null;
const PLATFORM = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

export async function track(name: string, props: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!await getAnalyticsConsent()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // RLS solo deja insertar eventos propios
    await supabase.from('analytics_events').insert({
      user_id: user.id,
      name: name.slice(0, 60),
      props,
      platform: PLATFORM,
      app_version: APP_VERSION,
    });
  } catch {
    /* best-effort: la telemetría jamás rompe la app */
  }
}
