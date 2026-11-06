// ─── Franky Tap: cliente de las RPC ─────────────────────────────────────────
// Acercar dos móviles con esta pantalla abierta hace match al instante. El
// servidor (migración 20260914120000_franky_tap_match) crea el chat, cruza
// Instagram si las dos personas tienen Crush y avisa a la otra pantalla.
import { supabase } from './supabase';

export type TapPeer = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  university: string | null;
  /** Solo llega cuando las dos personas tienen Crush activo (ig_matched). */
  instagram_handle: string | null;
  instagram_verified: boolean;
};

export type TapResult = {
  match: true;
  conversation_id: string | null;
  ig_matched: boolean;
  event_id: string | null;
  peer: TapPeer;
  created_at: string;
};

export type TapSession = { token: string; expires_at: string };

export type TapErrorCode =
  | 'auth_required'
  | 'token_expired'
  | 'peer_unavailable'
  | 'profile_unavailable'
  | 'rate_limit'
  | 'self'
  | 'network'
  | 'unknown';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Clave aleatoria por detección: repetirla en el servidor devuelve el mismo match. */
export function newTapKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bloque = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${bloque()}${bloque()}-${bloque()}-4${bloque().slice(1)}-${((8 + Math.random() * 4) | 0).toString(16)}${bloque().slice(1)}-${bloque()}${bloque()}${bloque()}`;
}

/** Contenido del código escaneable. Se acepta también el prefijo de la versión anterior. */
export const tapCode = (token: string) => 'franky:tap:v2:' + token;
export function parseTapCode(value: string): string | null {
  const m = /^franky:(?:tap:v2|live:v1|tap:v1):([0-9a-f-]{36})$/i.exec(value.trim());
  return m && isUuid(m[1]) ? m[1].toLowerCase() : null;
}

export function tapErrorCode(error: unknown): TapErrorCode {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '');
  if (/auth_required|not_authenticated|JWT/i.test(message)) return 'auth_required';
  if (/tap_token_expired/.test(message)) return 'token_expired';
  if (/invalid_target/.test(message)) return 'self';
  if (/peer_unavailable/.test(message)) return 'peer_unavailable';
  if (/profile_unavailable/.test(message)) return 'profile_unavailable';
  if (/rate_limit/.test(message)) return 'rate_limit';
  if (/Network|fetch|abort|timeout|Failed to/i.test(message)) return 'network';
  return 'unknown';
}

// Los fallos que vienen de la OTRA persona (bloqueo, cuenta retirada, perfil
// oculto) comparten mensaje: acercar el móvil no debe servir para averiguar
// cosas de alguien.
const MENSAJES: Record<TapErrorCode, string> = {
  auth_required: 'Entra en tu cuenta para usar Franky Tap.',
  token_expired: 'Ese código ha caducado. Pide a la otra persona que vuelva a abrir Franky Tap.',
  self: 'Ese es tu propio código.',
  peer_unavailable: 'Ahora mismo no se puede hacer match con esa persona.',
  profile_unavailable: 'Tu perfil no está visible, así que nadie puede encontrarte.',
  rate_limit: 'Has ido muy rápido. Espera unos segundos.',
  network: 'Sin conexión. Acercadlos otra vez cuando vuelva.',
  unknown: 'No se pudo completar el match. Inténtalo de nuevo.',
};
export const tapErrorMessage = (error: unknown) => MENSAJES[tapErrorCode(error)];

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw error;
    return data as T;
  } finally { clearTimeout(timeout); }
}

export const tapStart = (eventId: string | null) => call<TapSession>('tap_start', { p_event_id: eventId });
export const tapConnect = (peerToken: string, key: string, eventId: string | null) =>
  call<TapResult>('tap_connect', { p_peer_token: peerToken, p_idempotency_key: key, p_event_id: eventId });
export const tapPoll = (token: string) => call<{ match: boolean; expired?: boolean } | TapResult>('tap_poll', { p_token: token });
export const tapStop = (token: string) => call<null>('tap_stop', { p_token: token });
