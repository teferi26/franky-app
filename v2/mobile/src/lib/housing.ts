// ─── Pisos: visitas con calendario, vistas y likes (migraciones 087/108/161) ─
// El estudiante ve los huecos de visita del piso (get_bookable_visit_times:
// mezcla de slots manuales y el horario semanal de la inmobiliaria), reserva
// (book_visit_slot si el hueco ya existe, book_visit_at si sale del horario) y,
// si la visita es de pago, paga con el mismo flujo Stripe Checkout que las
// entradas (buyTicket en payments.ts): fetch → navegador in-app → poll en BD.
import * as WebBrowser from 'expo-web-browser';
import { supabase, WEB_URL, fetchConTimeout } from './supabase';
import { captureError } from './monitoring';
import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { parsePaymentReply } from './payment-contract';

// Un hueco reservable tal y como lo devuelve get_bookable_visit_times (161).
// slot_id null = hueco del horario semanal aún sin materializar en visit_slots.
export interface VisitTime {
  slot_id: string | null;
  slot_date: string;   // 'YYYY-MM-DD'
  start_time: string;  // 'HH:MM:SS'
  end_time: string;    // 'HH:MM:SS'
  price_cents: number;
  available: number;
}

export async function getBookableVisitTimes(accommodationId: string): Promise<VisitTime[]> {
  const { data, error } = await supabase.rpc('get_bookable_visit_times', {
    p_accommodation_id: accommodationId,
  });
  if (error) throw error;
  return (data ?? []) as VisitTime[];
}

// Mensajes de las RPC de reserva (087/161) traducidos a copy de UI.
const BOOK_ERRORS: Record<string, string> = {
  'auth required': 'Inicia sesión para reservar una visita.',
  'hueco no encontrado': 'Ese hueco ya no existe. Elige otro.',
  'hueco no disponible': 'Ese hueco ya no está disponible. Elige otro.',
  'no puedes reservar tu propio piso': 'No puedes reservar una visita a tu propio piso.',
  'ya tienes una reserva en este hueco': 'Ya tienes una reserva en ese hueco.',
  'aforo completo': 'Ese hueco se acaba de llenar. Elige otro.',
  'ese hueco ya ha pasado': 'Ese hueco ya ha pasado. Elige otro.',
  'ese hueco no está dentro del horario de visitas': 'Ese hueco ya no está en el horario de visitas.',
  'piso no encontrado': 'Este anuncio ya no está disponible.',
};

export type BookVisitResult =
  | { ok: true; bookingId: string; priceCents: number; requiresPayment: boolean }
  | { ok: false; message: string; needsAuth?: boolean };

export async function bookVisit(
  accommodationId: string,
  slot: Pick<VisitTime, 'slot_id' | 'slot_date' | 'start_time'>,
  owner = captureSessionIdentity(),
  signal?: AbortSignal,
): Promise<BookVisitResult> {
  if (!owner) return { ok: false, needsAuth: true, message: 'Inicia sesión para reservar una visita.' };
  return withOwnedRequest(owner, async request => {
  // Hueco manual ya materializado → book_visit_slot (087). Hueco del horario
  // semanal → book_visit_at (161), que materializa el slot sin overbooking.
  const { data, error } = slot.slot_id
    ? await request.query(supabase.rpc('book_visit_slot', { p_slot_id: slot.slot_id }))
    : await request.query(supabase.rpc('book_visit_at', {
        p_accommodation_id: accommodationId,
        p_slot_date: slot.slot_date,
        p_start_time: slot.start_time,
      }));
  request.check();
  if (error) {
    const known = Object.keys(BOOK_ERRORS).find(k => error.message?.includes(k));
    if (!known) captureError(error, { where: 'housing.bookVisit', accommodationId });
    return {
      ok: false,
      message: known ? BOOK_ERRORS[known] : 'No se pudo reservar la visita. Inténtalo de nuevo.',
      needsAuth: known === 'auth required',
    };
  }
  const r = data as { booking_id?: string; price_cents?: number; requires_payment?: boolean } | null;
  if (!r?.booking_id) return { ok: false, message: 'Respuesta inesperada del servidor.' };
  return {
    ok: true,
    bookingId: r.booking_id,
    priceCents: r.price_cents ?? 0,
    requiresPayment: !!r.requires_payment,
  };
  }, signal);
}

export type PayVisitResult =
  | { ok: true; status: 'paid' }
  | { ok: false; status: 'pending' }
  | { ok: false; status: 'error'; message: string };
const visitPayments = new Map<string, Promise<PayVisitResult>>();

// Mismo patrón que buyTicket (payments.ts): el endpoint de la web acepta el
// Bearer del móvil, crea el Checkout de Stripe Connect y el webhook confirma.
export async function payVisit(bookingId: string, owner = captureSessionIdentity(), signal?: AbortSignal): Promise<PayVisitResult> {
  if (!owner) return { ok: false, status: 'error', message: 'Sesión caducada. Vuelve a entrar.' };
  const key = `${owner.userId}:${owner.generation}:${bookingId}`;
  const existing = visitPayments.get(key);
  if (existing) return existing;
  const operation = withOwnedRequest<PayVisitResult>(owner, async request => {
    let url: string | undefined;
    try {
      const res = await fetchConTimeout(`${WEB_URL}/api/stripe/pay/visit`, {
        method: 'POST', signal: request.signal,
        headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
        body: JSON.stringify({ booking_id: bookingId, return_to: 'app' }),
      });
      request.check();
      const json = parsePaymentReply(await res.json());
      request.check();
      if (!res.ok) return res.status >= 500 ? { ok: false, status: 'pending' } : { ok: false, status: 'error', message: json.error ?? 'No se pudo iniciar el cobro.' };
      if (json.invalid_url || (json.status === 'checkout' && !json.url)) return { ok: false, status: 'error', message: 'No se pudo verificar el enlace de pago.' };
      url = json.url;
    } catch {
      request.check();
      return { ok: false, status: 'pending' };
    }
    request.check();
    try {
      if (url) await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      request.check();
      if (await checkVisitPaid(bookingId, owner, request.signal)) return { ok: true, status: 'paid' };
      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise<void>(resolve => setTimeout(resolve, attempt * 800));
        request.check();
        if (await checkVisitPaid(bookingId, owner, request.signal)) return { ok: true, status: 'paid' };
      }
    } catch { request.check(); }
    return { ok: false, status: 'pending' };
  }, signal).finally(() => { if (visitPayments.get(key) === operation) visitPayments.delete(key); });
  visitPayments.set(key, operation);
  return operation;
}

export async function checkVisitPaid(bookingId: string, owner = captureSessionIdentity(), signal?: AbortSignal): Promise<boolean> {
  if (!owner) return false;
  return withOwnedRequest(owner, async request => {
    const { data, error } = await request.query(supabase.from('visit_bookings')
      .select('payment_status').eq('id', bookingId).eq('visitor_id', owner.userId)).maybeSingle();
    request.check();
    if (error) throw error;
    return data?.payment_status === 'paid';
  }, signal);
}

// Vista de ficha (161): dedupe usuario/día en el servidor. Fire and forget:
// la métrica del propietario jamás puede romper (ni retrasar) la ficha.
export function registerAccommodationView(accommodationId: string): void {
  try {
    supabase
      .rpc('register_accommodation_view', { p_accommodation_id: accommodationId })
      .then(() => undefined, () => undefined);
  } catch { /* silencioso */ }
}

// Contact is an explicit action; saving a favorite never sends this request.
export type ContactOwnerResult =
  | { ok: true }
  | { ok: false; needsAuth?: boolean; message: string };

export async function requestAccommodationContact(accommodationId: string, owner = captureSessionIdentity(), signal?: AbortSignal): Promise<ContactOwnerResult> {
  if (!owner) return { ok: false, needsAuth: true, message: 'Necesitas una cuenta para escribir al propietario.' };
  return withOwnedRequest(owner, async request => {
    const { error } = await request.query(supabase.rpc('process_swipe_action', {
      p_user_id: owner.userId, p_target_id: accommodationId,
      p_target_type: 'accommodation', p_action: 'like',
    }));
    request.check();
    if (!error) return { ok: true };
    const mentionsNetwork = /network|fetch|conexi[oó]n|timeout|timed out/i.test(error.message ?? '');
    if (error.code && !mentionsNetwork) {
      captureError(error, { where: 'housing.requestAccommodationContact', accommodationId });
      return { ok: false, message: 'No se pudo completar la solicitud. Inténtalo de nuevo en un momento.' };
    }
    return { ok: false, message: 'No pudimos confirmar la solicitud. Consulta su estado antes de volver a enviarla.' };
  }, signal);
}
