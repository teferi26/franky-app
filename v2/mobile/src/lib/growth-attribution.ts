import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeReferralCode } from '../../../shared/growth';
import { supabase, WEB_URL, fetchConTimeout } from './supabase';
import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { Platform } from 'react-native';
import { getInstallReferrerAsync } from 'expo-application';

const KEY = 'franky_pending_growth_invite_v1';
let pendingWrite = Promise.resolve();
let installRead: Promise<void> | null = null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Invite = { code?: string; first?: string; last?: string; capturedAt: number };
async function read(): Promise<Invite | null> {
  try {
    const data = JSON.parse(await AsyncStorage.getItem(KEY) ?? 'null') as Invite | null;
    return data && Number.isFinite(data.capturedAt) && Date.now() - data.capturedAt < 30*86400000 ? data : null;
  } catch { return null; }
}
/** Explicit code entry is reliable on either platform, even after installation. */
export function setGrowthExplicitCode(code: string): Promise<void> {
  const safe = normalizeReferralCode(code);
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const stored = await read();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...stored, code: safe ?? undefined, capturedAt: stored?.capturedAt ?? Date.now() }));
  });
  return pendingWrite;
}
/** Already-installed app link handling. This makes no deferred iOS claim. */
export async function captureGrowthInvite(raw: string): Promise<void> {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || !['franky.es','www.franky.es'].includes(url.hostname)) return;
    const code = normalizeReferralCode(url.pathname.startsWith('/r/') ? url.pathname.split('/')[2] : url.searchParams.get('invite') ?? url.searchParams.get('ref'));
    if (!code) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return; // Don't attach an acquisition to an existing account.
    const res = await fetchConTimeout(`${WEB_URL}/api/growth/touch?code=${encodeURIComponent(code)}`);
    const payload = await res.json();
    if (!res.ok || typeof payload.touch !== 'string') return;
    const stored = await read();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...stored, first: stored?.first ?? payload.touch, last: payload.touch, capturedAt: stored?.capturedAt ?? Date.now() }));
  } catch { /* Attribution never prevents sign in. */ }
}
export async function getGrowthSignupMetadata(): Promise<Record<string,string>> {
  await captureAndroidInstallReferral();
  await pendingWrite.catch(() => {});
  const stored = await read();
  if (!stored) return {};
  return { ...(stored.code ? { growth_explicit_code: stored.code } : {}), ...(stored.first ? { growth_first_touch: stored.first } : {}), ...(stored.last ? { growth_last_touch: stored.last } : {}) };
}
export async function captureAndroidInstallReferral(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (installRead) return installRead;
  installRead = (async () => {
    try {
      if (await AsyncStorage.getItem('franky_growth_install_referrer_seen')) return;
      const raw = await getInstallReferrerAsync();
      const params = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?')+1) : raw);
      const token = params.get('growth_touch');
      if (token && UUID.test(token)) {
        const stored = await read();
        await AsyncStorage.setItem(KEY, JSON.stringify({ ...stored, first: stored?.first ?? token, last: stored?.last ?? token, capturedAt: stored?.capturedAt ?? Date.now() }));
      }
      await AsyncStorage.setItem('franky_growth_install_referrer_seen','1');
    } catch { installRead = null; /* Play referrer may be unavailable in Expo Go/offline. */ }
  })();
  return installRead;
}
export async function claimPendingGrowthInvite(): Promise<void> {
  const owner = captureSessionIdentity();
  if (!owner) return;
  await captureAndroidInstallReferral();
  await pendingWrite.catch(() => {});
  const stored = await read(); if (!stored) return;
  await withOwnedRequest(owner, async request => {
    const { error } = await request.query(supabase.rpc('growth_claim_referral', { p_code: stored.code ?? null, p_first: stored.first ?? null, p_last: stored.last ?? null }));
    request.check();
    if (!error) await AsyncStorage.removeItem(KEY);
  });
}
