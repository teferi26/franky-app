import { File } from 'expo-file-system';
import { normalizeImage } from './media';
import { withOwnedRequest } from './owned-request';
import type { SessionIdentity } from './session';
import { WEB_URL, SUPABASE_URL, fetchConTimeout } from './supabase';
import { parsePaymentReply, type PaymentReply } from '../../../shared/payment-contract';
import { CARD_AGREEMENT_VERSION } from '../../../shared/franky-card';

export type CardProviderConfig = { checkoutEnabled: boolean; annualPriceCents: number; introPriceCents: number; appleWallet: boolean; googleWallet: boolean; reason: string | null };

export async function cardApi<T>(path: 'config' | 'checkout' | 'wallet' | 'media', owner: SessionIdentity, body?: unknown, signal?: AbortSignal, query?: string): Promise<T> {
  return withOwnedRequest(owner, async request => {
    const response = await fetchConTimeout(`${WEB_URL}/api/card/${path}${query ? `?${query}` : ''}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: request.authorization, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: request.signal,
    }, 25_000);
    request.check(); const data = await response.json(); request.check();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'card_unavailable');
    return data as T;
  }, signal);
}

export async function checkoutCard(owner: SessionIdentity, requestId: string, quote: { amount_cents: number; price_version: string }, signal?: AbortSignal): Promise<PaymentReply> {
  return parsePaymentReply(await cardApi('checkout', owner, { requestId, acceptedAmountCents: quote.amount_cents, priceVersion: quote.price_version, termsVersion: CARD_AGREEMENT_VERSION }, signal));
}

/** Prevent a compromised or stale response from opening an arbitrary external origin. */
export function cardWalletUrl(value: unknown, platform: 'apple' | 'google'): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (platform === 'google' && url.hostname === 'pay.google.com' && url.pathname.startsWith('/gp/v/save/')) return url.href;
    if (platform === 'apple' && url.origin === new URL(SUPABASE_URL).origin && url.pathname.startsWith('/storage/v1/object/sign/card-wallet/')) return url.href;
  } catch { /* Invalid response stays unavailable. */ }
  return null;
}

export function privateCardPhotoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.origin === new URL(SUPABASE_URL).origin && url.pathname.startsWith('/storage/v1/object/sign/card-media/') ? url.href : null;
  } catch { return null; }
}

export async function getCardPhoto(owner: SessionIdentity, path: string, signal?: AbortSignal): Promise<string | null> {
  const data = await cardApi<{ url: string }>('media', owner, undefined, signal, `path=${encodeURIComponent(path)}`);
  return privateCardPhotoUrl(data.url);
}

export async function uploadCardPhoto(owner: SessionIdentity, asset: { uri: string; width?: number | null; mimeType?: string | null }, signal?: AbortSignal): Promise<{ path: string; url: string | null }> {
  return withOwnedRequest(owner, async request => {
    const normalized = await normalizeImage(asset.uri, asset.width, 960, asset.mimeType ?? 'image/jpeg'); request.check();
    const file = new File(normalized.uri);
    try {
      if (!file.exists || file.size <= 0 || file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(normalized.mime)) throw new Error('card_photo_invalid');
      const body = new FormData(); body.append('file', { uri: normalized.uri, name: 'card-photo.jpg', type: normalized.mime } as unknown as Blob);
      const response = await fetchConTimeout(`${WEB_URL}/api/card/media`, { method: 'POST', headers: { Authorization: request.authorization }, body, signal: request.signal }, 30_000);
      request.check(); const data = await response.json(); request.check();
      if (!response.ok || typeof data.path !== 'string' || !data.path.startsWith(`${owner.userId}/`)) throw new Error(typeof data.error === 'string' ? data.error : 'card_photo_invalid');
      return { path: data.path, url: privateCardPhotoUrl(data.url) };
    } finally { if (normalized.uri !== asset.uri && file.exists) file.delete(); }
  }, signal);
}
