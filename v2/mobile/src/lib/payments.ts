// ─── Pago de entradas desde la app (iOS/Android) ─────────────────────────
// Mismo backend y misma comisión que la web: reserve_event_ticket bloquea el
// aforo, /api/stripe/pay/ticket crea el Stripe Checkout con application_fee
// (FEE_TICKET_PCT, 8% por defecto) y transfer al organizador (Connect).
// El Checkout se abre en navegador in-app: tarjeta, Apple Pay y Google Pay.
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { captureSessionIdentity } from './session';
import { withOwnedRequest, type OwnedRequest } from './owned-request';
import { parsePaymentReply, safeStripeUrl, ticketPaymentStatus } from './payment-contract';
import { supabase, WEB_URL, fetchConTimeout } from './supabase';
import type { SellerPayment, StripeInvoice } from './types';

// Comisión de servicio de Franky sobre entradas, en puntos porcentuales.
// Mantener sincronizado con NEXT_PUBLIC_FEE_TICKET_PCT / FEE_TICKET_PCT de la
// web (el importe REAL siempre lo calcula el servidor; esto es solo para el
// desglose informativo que ve el usuario antes de pagar).
export const TICKET_FEE_PCT = 8;

// Tasa de procesamiento de Stripe por cobro con tarjeta (1,5% + 0,25 €). Se
// suma a la comisión Franky en la application_fee del servidor porque, con
// destination charges de Connect, Stripe se la cobra a la plataforma; si no se
// repercutiera, Franky se quedaría sin su %. Mantener en paridad con
// STRIPE_PROCESSING en web/src/lib/pricing.ts.
export const STRIPE_FEE_PCT = 1.5;
export const STRIPE_FEE_FIXED_CENTS = 25;
export const STRIPE_FEE_LABEL = '1,5 % + 0,25 €';

// Desglose transparente de un precio de entrada: cuánto va al organizador,
// cuánto es comisión de servicio Franky y cuánto son los gastos de pago con
// tarjeta (Stripe). Misma fórmula y redondeo que feeBreakdown() en la web. Las
// entradas de eventos presenciales se pagan con Stripe también dentro de la
// app: Apple y Google no aplican tasas a servicios del mundo real, así que no
// hay recargo por comprar desde el móvil (y lo decimos tal cual en la UI).
export function ticketBreakdown(amountCents: number) {
  if (amountCents <= 0) {
    return { feeCents: 0, frankyCents: 0, stripeCents: 0, organizerCents: 0, feePct: TICKET_FEE_PCT };
  }
  const franky = Math.max(0, Math.round(amountCents * TICKET_FEE_PCT / 100));
  const stripe = Math.round(amountCents * STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED_CENTS;
  const fee = Math.min(franky + stripe, amountCents);
  const stripeCents = Math.min(stripe, fee);
  return {
    // Total retenido por la plataforma (comisión + Stripe) = application_fee.
    feeCents: fee,
    frankyCents: fee - stripeCents,
    stripeCents,
    organizerCents: amountCents - fee,
    feePct: TICKET_FEE_PCT,
  };
}

/**
 * ¿La reserva de esta entrada sigue guardando la plaza? (migración 165)
 *
 * Una reserva sin pagar solo retiene el sitio hasta `reserved_until`; después la
 * plaza vuelve al aforo y ya no se puede pagar sin reservar de nuevo. Sin fecha
 * (filas viejas o migración sin aplicar) se considera viva, igual que hace la
 * base de datos. Mismo criterio que holdIsLive() en la web.
 */
export function holdIsLive(reservedUntil: string | null | undefined, now = Date.now()): boolean {
  if (!reservedUntil) return true;
  const until = new Date(reservedUntil).getTime();
  if (!Number.isFinite(until)) return true;
  return until > now;
}

export type BuyResult =
  | { ok: true; status: 'paid' }
  | { ok: false; status: 'pending'; ticketId: string }
  | { ok: false; status: 'cancelled'; ticketId: string }
  | { ok: false; status: 'error'; message: string };

const RPC_ERRORS: Record<string, string> = {
  'event_audience_forbidden': 'Tu cuenta no cumple las condiciones actuales de acceso. Revisa la invitación, membresía o afiliación universitaria con el organizador.',
  'auth required': 'Inicia sesión para comprar entradas.',
  'entradas agotadas': 'Las entradas se han agotado.',
  'el evento ya ha pasado': 'Este evento ya ha pasado.',
  'el evento no admite compras': 'Este evento no admite compras ahora mismo.',
  'evento gratuito: usa la inscripción': 'Este evento es gratuito: usa Apuntarme.',
  'no puedes comprar una entrada de tu propio evento': 'No puedes comprar entradas de tu propio evento.',
};
const operations = new Map<string, Promise<BuyResult>>();
function singlePayment(key: string, work: () => Promise<BuyResult>): Promise<BuyResult> {
  const running = operations.get(key);
  if (running) return running;
  const operation = work().finally(() => { if (operations.get(key) === operation) operations.delete(key); });
  operations.set(key, operation);
  return operation;
}

async function ticketState(ticketId: string, request: OwnedRequest) {
  const { data, error } = await request.query(supabase.from('event_tickets')
    .select('status').eq('id', ticketId).eq('holder_id', request.owner.userId)).maybeSingle();
  request.check();
  return error ? 'pending' : ticketPaymentStatus(data?.status);
}

async function checkoutTicket(ticketId: string, request: OwnedRequest, code?: string): Promise<BuyResult> {
  try {
    const res = await fetchConTimeout(WEB_URL + '/api/stripe/pay/ticket', {
      method: 'POST', signal: request.signal,
      headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
      body: JSON.stringify({ ticket_id: ticketId, return_to: 'app', ...(code?.trim() ? { code: code.trim() } : {}) }),
    });
    request.check();
    const raw = await res.json();
    request.check();
    const reply = parsePaymentReply(raw);
    if (!res.ok) {
      if (res.status >= 500) return { ok: false, status: 'pending', ticketId };
      return { ok: false, status: 'error', message: reply.error ?? 'No se pudo iniciar el cobro. Revisa tu reserva.' };
    }
    // Even a paid reply must agree with the owned ticket. URLs never grant it.
    if (reply.invalid_url) return { ok: false, status: 'error', message: 'No se pudo verificar el enlace de pago.' };
    if (reply.status === 'checkout') {
      if (!reply.url) return { ok: false, status: 'error', message: 'No se pudo verificar el enlace de pago.' };
      request.check();
      await WebBrowser.openBrowserAsync(reply.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      request.check();
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise<void>(resolve => setTimeout(resolve, attempt * 800));
      request.check();
      const status = await ticketState(ticketId, request);
      if (status === 'paid') return { ok: true, status };
      if (status === 'cancelled') return { ok: false, status, ticketId };
    }
    return { ok: false, status: 'pending', ticketId };
  } catch {
    request.check();
    // Network loss can occur AFTER Stripe created a charge. Never auto-cancel.
    return { ok: false, status: 'pending', ticketId };
  }
}

export async function buyTicket(eventId: string, code?: string, owner = captureSessionIdentity()): Promise<BuyResult> {
  if (!owner) return { ok: false, status: 'error', message: 'Inicia sesión para comprar entradas.' };
  return singlePayment(owner.userId + ':' + owner.generation + ':event:' + eventId, () => withOwnedRequest(owner, async request => {
    const { data, error } = await request.query(supabase.rpc('reserve_event_ticket', { p_event_id: eventId }));
    request.check();
    if (error) {
      const known = Object.keys(RPC_ERRORS).find(k => error.message?.includes(k));
      return { ok: false, status: 'error', message: known ? RPC_ERRORS[known] : 'No se pudo reservar la entrada.' };
    }
    const ticketId = (data as { ticket_id?: string })?.ticket_id;
    if (!ticketId) return { ok: false, status: 'error', message: 'Respuesta inesperada del servidor.' };
    return checkoutTicket(ticketId, request, code);
  }));
}

/** The server resumes the frozen discount quote; the client never invents it. */
export async function resumeTicketPayment(ticketId: string, owner = captureSessionIdentity()): Promise<BuyResult> {
  if (!owner) return { ok: false, status: 'error', message: 'Sesión caducada. Vuelve a entrar.' };
  return singlePayment(owner.userId + ':' + owner.generation + ':ticket:' + ticketId,
    () => withOwnedRequest(owner, request => checkoutTicket(ticketId, request)));
}

export async function checkTicket(ticketId: string, owner = captureSessionIdentity()): Promise<boolean> {
  if (!owner) return false;
  return withOwnedRequest(owner, async request => await ticketState(ticketId, request) === 'paid');
}

// ─── Cartera del organizador ─────────────────────────────────────────────
// Lee el ledger `payments` como vendedor (RLS payments_select_seller) y trae
// los títulos de los eventos para agrupar. Todo importe sale del servidor:
// amount_cents (recaudado), application_fee_cents (comisión Franky) y
// refunded_cents (devoluciones).
export async function getMyEarnings(): Promise<{ rows: SellerPayment[]; eventTitles: Record<string, string> }> {
  const owner = captureSessionIdentity();
  if (!owner) return { rows: [], eventTitles: {} };
  return withOwnedRequest(owner, async request => {
    const rows: SellerPayment[] = [];
    // Read every page, with a deterministic secondary ordering. Never label a
    // silently truncated 500-row client list as lifetime earnings.
    let cursor: { created_at: string; id: string } | null = null;
    for (;;) {
      let page = supabase.from('payments')
        .select('id, type, amount_cents, application_fee_cents, refunded_cents, status, created_at, metadata')
        .eq('seller_id', owner.userId).in('status', ['succeeded', 'partially_refunded', 'refunded'])
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500);
      // Keyset pagination: a new sale cannot shift offsets and count an older
      // payment twice while the organizer's wallet is loading.
      if (cursor) page = page.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      const { data, error } = await request.query(page);
      request.check();
      if (error) throw error;
      rows.push(...(data ?? []) as SellerPayment[]);
      if (!data || data.length < 500) break;
      const last: { created_at: string; id: string } = data[data.length - 1];
      if (cursor?.id === last.id) throw new Error('payments_pagination_stalled');
      cursor = last;
    }
    const ids = [...new Set(rows.map(r => r.metadata?.event_id).filter((x): x is string => !!x))];
    const eventTitles: Record<string, string> = {};
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await request.query(supabase.from('events').select('id, title').in('id', ids.slice(offset, offset + 100)));
      request.check(); if (error) throw error;
      for (const event of data ?? []) eventTitles[event.id] = event.title ?? 'Evento';
    }
    return { rows, eventTitles };
  });
}

// ─── Alta de cobros del vendedor (Stripe Connect) ────────────────────────
// Para vender entradas hace falta una cuenta de cobros activa. Antes esto solo
// se podía empezar desde la web (y encima desde un evento de pago YA publicado),
// así que el organizador leía un aparente círculo vicioso: "necesito cuenta para
// vender, pero solo puedo crearla después de publicar". Aquí se puede empezar
// desde el propio formulario, antes de publicar nada.
export type PayoutStatus = 'none' | 'pending' | 'active' | 'unknown';

/** Estado real de la cuenta de cobros del usuario (lo consulta a Stripe). */
export async function getPayoutStatus(): Promise<PayoutStatus> {
  const owner = captureSessionIdentity();
  if (!owner) return 'unknown';
  return withOwnedRequest(owner, async request => {
    try {
      const res = await fetchConTimeout(WEB_URL + '/api/stripe/connect/status', { signal: request.signal, headers: { Authorization: request.authorization } });
      request.check(); const json = await res.json(); request.check();
      return res.ok && ['none', 'pending', 'active'].includes(json.status) ? json.status : 'unknown';
    } catch { request.check(); return 'unknown'; }
  });
}

async function openPaymentPanel(path: string, hosts: string[], body?: object): Promise<{ ok: boolean; error?: string }> {
  const owner = captureSessionIdentity();
  if (!owner) return { ok: false, error: 'Sesión caducada. Vuelve a entrar.' };
  return withOwnedRequest(owner, async request => {
    try {
      const res = await fetchConTimeout(WEB_URL + path, {
        method: 'POST', signal: request.signal,
        headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      request.check(); const json = await res.json(); request.check();
      if (!res.ok) return { ok: false, error: json.error ?? 'No se pudo abrir el servicio de pagos.' };
      // The one first-party exception is the existing merchant onboarding route.
      const partner = path.endsWith('/onboard') && json.url === 'https://franky.es/api/partners/origin/connect' ? json.url as string : null;
      const url = partner ?? safeStripeUrl(json.url, hosts);
      if (!url) return { ok: false, error: 'No se pudo verificar el enlace de pagos.' };
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      request.check(); return { ok: true };
    } catch { request.check(); return { ok: false, error: 'No se pudo conectar con el servicio de pagos.' }; }
  });
}

export function startPayoutsOnboarding() {
  return openPaymentPanel('/api/stripe/connect/onboard', ['connect.stripe.com'], { return_to: '/cobros?onboarded=1' });
}
export function openConnectDashboard() {
  return openPaymentPanel('/api/stripe/connect/login-link', ['connect.stripe.com', 'dashboard.stripe.com']);
}

export async function getMyInvoices(): Promise<{ rows: StripeInvoice[]; error?: string }> {
  const owner = captureSessionIdentity();
  if (!owner) return { rows: [], error: 'Sesión caducada. Vuelve a entrar.' };
  return withOwnedRequest(owner, async request => {
    try {
      const res = await fetchConTimeout(WEB_URL + '/api/stripe/invoices', { signal: request.signal,
        headers: { Authorization: request.authorization, 'X-Franky-Client': Platform.OS === 'web' ? 'web' : 'native' } });
      request.check(); const json = await res.json(); request.check();
      return res.ok ? { rows: json.invoices ?? [] } : { rows: [], error: json.error ?? 'No se pudieron cargar las facturas.' };
    } catch { request.check(); return { rows: [], error: 'Sin conexión con el servidor.' }; }
  });
}

export async function openBillingPortal(): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'web') return { ok: false, error: 'La gestión de compras digitales no está disponible en este portal desde la app.' };
  return openPaymentPanel('/api/stripe/portal', ['billing.stripe.com']);
}
