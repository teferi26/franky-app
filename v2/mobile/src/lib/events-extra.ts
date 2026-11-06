// ─── Extras de eventos y pisos: galería, lista de asistentes, residentes ────
// Capa de datos para las pantallas que cierran huecos de paridad con la web:
//   · Galería de fotos del evento (events.photos, migración 027: hasta 5).
//   · Lista completa de asistentes con tallas para el organizador
//     (event_participants por la 150, event_tickets por la 095,
//     event_shirt_sizes por la 164).
//   · Residentes públicos de un piso (RPC get_flat_public_residents, 086;
//     desde la 101 solo para usuarios con sesión).
import { supabase } from './supabase';
import { uploadPickedImage } from './media';
import { SHIRT_SIZES, type EventItem, type ShirtSize } from './types';

// ── Galería ────────────────────────────────────────────────────────────────

/** Evento con la columna photos (027), que EventItem no declara. */
export type EventWithPhotos = EventItem & { photos?: string[] | null };

/** Máximo de fotos por evento: lo recorta el trigger cap_event_photos (027). */
export const MAX_EVENT_PHOTOS = 5;

/**
 * Fotos a enseñar: la portada (image_url) primero y después el resto de
 * `photos`, sin repetir. La edición desde la app guarda solo image_url, así
 * que ambas columnas pueden no coincidir; aquí se unen.
 */
export function getEventPhotos(ev: EventWithPhotos): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === 'string' && u && !out.includes(u)) out.push(u);
  };
  push(ev.image_url);
  for (const p of ev.photos ?? []) push(p);
  return out;
}

/**
 * Sube una foto nueva al evento (solo el organizador: la política
 * "Organizers can update events" de 001 impide el UPDATE a cualquier otro).
 * Pasa por uploadPickedImage, que transcodifica SIEMPRE a JPEG: el HEIC del
 * iPhone lo rechaza Storage. Nunca se pasa asset.mimeType en crudo.
 */
export async function addEventPhoto(
  eventId: string,
  asset: { uri: string; width?: number | null; mimeType?: string | null },
): Promise<{ ok: true; photos: string[] } | { ok: false; message: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Inicia sesión para subir fotos.' };

    // Estado actual, para no pisar fotos subidas desde otro sitio.
    const { data: current, error: readError } = await supabase
      .from('events').select('image_url, photos').eq('id', eventId).maybeSingle();
    if (readError || !current) return { ok: false, message: 'No se pudo leer el evento.' };
    const existing = ((current as { photos?: string[] | null }).photos ?? []).filter(Boolean);
    if (existing.length >= MAX_EVENT_PHOTOS) {
      return { ok: false, message: `Un evento admite como mucho ${MAX_EVENT_PHOTOS} fotos.` };
    }

    const up = await uploadPickedImage('avatars', user.id, asset, 3 * 1024 * 1024);
    if (!up.ok) return { ok: false, message: up.message };

    const photos = [...existing, up.publicUrl];
    const patch: { photos: string[]; image_url?: string } = { photos };
    // La primera foto hace de portada si aún no había (misma regla que la 027).
    if (!(current as { image_url?: string | null }).image_url) patch.image_url = up.publicUrl;

    // .select() para que un UPDATE que la RLS deja en 0 filas no pase por éxito.
    const { data: updated, error } = await supabase
      .from('events').update(patch).eq('id', eventId).select('id');
    if (error || !updated || updated.length === 0) {
      return { ok: false, message: 'Solo el organizador puede añadir fotos.' };
    }
    return { ok: true, photos };
  } catch {
    return { ok: false, message: 'Sin conexión al subir la foto.' };
  }
}

// ── Asistentes (organizador) ───────────────────────────────────────────────

export type AttendeeRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  /** Cuándo se apuntó o compró. */
  since: string | null;
  /** Estado de la entrada (eventos de pago por la app) o inscripción. */
  entry: 'registered' | 'valid' | 'used';
  shirt: ShirtSize | null;
  quotedPriceCents?: number | null;
  /** Guest ticket bought on the ORIGIN website; has no Franky profile. */
  originGuestEmail?: string;
};

export type ShirtTally = {
  bySize: { size: ShirtSize; count: number }[];
  answered: number;
  missing: number;
  shirtsNeeded: number;
};

export type AttendeesResult =
  | { ok: true; event: EventItem; mode: 'free' | 'tickets'; shirtsEnabled: boolean; attendees: AttendeeRow[]; tally: ShirtTally | null }
  | { ok: false; reason: 'auth' | 'forbidden' | 'not_found' | 'error' };

const isShirtSize = (v: unknown): v is ShirtSize =>
  typeof v === 'string' && (SHIRT_SIZES as readonly string[]).includes(v);

/** Recuento por talla de asistentes REALES (misma regla que web/lib/event-shirts). */
export function tallyShirtSizes(sizes: (ShirtSize | null)[]): ShirtTally {
  const counts = new Map<ShirtSize, number>();
  let answered = 0;
  let missing = 0;
  for (const s of sizes) {
    if (!s) { missing++; continue; }
    answered++;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const bySize = SHIRT_SIZES.filter((s) => counts.has(s)).map((size) => ({ size, count: counts.get(size) ?? 0 }));
  return { bySize, answered, missing, shirtsNeeded: answered - (counts.get('ninguna') ?? 0) };
}

export const shirtSizeLabel = (size: ShirtSize) => (size === 'ninguna' ? 'Sin camiseta' : size);

/**
 * Lista completa de asistentes de un evento para su organizador (o un admin).
 * Eventos de pago por la app: la lista real son las entradas (valid/used).
 * El resto: inscripciones vigentes (status 'registered'). La RLS ya limita
 * ambas tablas al organizador; la comprobación de aquí es para dar un mensaje
 * claro en vez de una lista vacía.
 */
export async function getEventAttendees(eventId: string): Promise<AttendeesResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: 'auth' };

    // select('*') para no depender de que la 164 (shirts_enabled) esté aplicada.
    const { data: evRaw, error: evError } = await supabase
      .from('events').select('*').eq('id', eventId).maybeSingle();
    if (evError) return { ok: false, reason: 'error' };
    if (!evRaw) return { ok: false, reason: 'not_found' };
    const event = evRaw as EventItem;

    if (event.organizer_id !== user.id) {
      // Un admin también puede verla (política *_select_admin). Fail-soft.
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if ((prof as { role?: string } | null)?.role !== 'admin') return { ok: false, reason: 'forbidden' };
    }

    const paymentMode = event.payment_mode ?? (Number(event.price) > 0 ? 'app' : 'free');
    const viaTickets = Number(event.price) > 0 && paymentMode === 'app';

    type Base = { id: string; since: string | null; entry: AttendeeRow['entry'] };
    let base: Base[] = [];
    if (viaTickets) {
      const { data, error } = await supabase
        .from('event_tickets').select('holder_id, status, created_at')
        .eq('event_id', eventId).in('status', ['valid', 'used'])
        .order('created_at', { ascending: true });
      if (error) return { ok: false, reason: 'error' };
      const seen = new Set<string>();
      for (const t of (data ?? []) as { holder_id: string; status: string; created_at: string | null }[]) {
        // Una persona con varias entradas cuenta una vez; 'used' pesa más.
        if (seen.has(t.holder_id)) {
          const prev = base.find((b) => b.id === t.holder_id);
          if (prev && t.status === 'used') prev.entry = 'used';
          continue;
        }
        seen.add(t.holder_id);
        base.push({ id: t.holder_id, since: t.created_at, entry: t.status === 'used' ? 'used' : 'valid' });
      }
    } else {
      const { data, error } = await supabase
        .from('event_participants').select('user_id, registered_at')
        .eq('event_id', eventId).eq('status', 'registered')
        .order('registered_at', { ascending: true });
      if (error) return { ok: false, reason: 'error' };
      base = ((data ?? []) as { user_id: string; registered_at: string | null }[])
        .map((p) => ({ id: p.user_id, since: p.registered_at, entry: 'registered' as const }));
    }

    const ids = base.map((b) => b.id);
    const profiles = new Map<string, { full_name: string | null; avatar_url: string | null; verified: boolean }>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from('public_profiles').select('id, full_name, avatar_url, student_email_verified').in('id', ids);
      for (const p of (profs ?? []) as { id: string; full_name: string | null; avatar_url: string | null; student_email_verified?: boolean | null }[]) {
        profiles.set(p.id, { full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null, verified: p.student_email_verified === true });
      }
    }

    const shirtsEnabled = event.shirts_enabled === true;
    const shirtByUser = new Map<string, ShirtSize>();
    const quoteByUser = new Map<string, number>();
    if (shirtsEnabled && ids.length) {
      const { data: shirts } = await supabase
        .from('event_shirt_sizes').select('user_id, size, quoted_price_cents').eq('event_id', eventId).in('user_id', ids);
      for (const s of (shirts ?? []) as { user_id: string; size: string; quoted_price_cents: number | null }[]) {
        if (isShirtSize(s.size)) shirtByUser.set(s.user_id, s.size);
        if (s.quoted_price_cents != null) quoteByUser.set(s.user_id, s.quoted_price_cents);
      }
    }

    const attendees: AttendeeRow[] = base.map((b) => {
      const p = profiles.get(b.id);
      return {
        id: b.id,
        full_name: p?.full_name ?? null,
        avatar_url: p?.avatar_url ?? null,
        verified: p?.verified ?? false,
        since: b.since,
        entry: b.entry,
        shirt: shirtByUser.get(b.id) ?? null,
        quotedPriceCents: quoteByUser.get(b.id) ?? null,
      };
    });

    if(event.organizer_id==='efc99d1b-c713-4061-9146-e905fc599f56') {
      const {data:guests,error:guestError}=await supabase.rpc('get_origin_event_attendees',{p_event:eventId});
      if(guestError)return {ok:false,reason:'error'};
      for(const guest of guests??[])attendees.push({id:guest.id,full_name:guest.buyer_name,avatar_url:null,verified:false,since:guest.paid_at,entry:guest.checked_in_at?'used':'valid',shirt:isShirtSize(guest.size)?guest.size:null,quotedPriceCents:guest.amount_cents,originGuestEmail:guest.buyer_email});
    }

    return {
      ok: true, event, mode: viaTickets ? 'tickets' : 'free', shirtsEnabled, attendees,
      tally: shirtsEnabled ? tallyShirtSizes(attendees.map((a) => a.shirt)) : null,
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

// ── Residentes públicos del piso ───────────────────────────────────────────

export type FlatResident = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  career: string | null;
  university_course: string | null;
  room_label: string | null;
};

/**
 * Inquilinos activos que han hecho pública su tenencia (tenancies.is_public).
 * La RPC solo la pueden ejecutar usuarios con sesión (101): para anónimos y
 * ante cualquier error devuelve lista vacía, y la sección no se pinta.
 */
export async function getFlatPublicResidents(accommodationId: string): Promise<FlatResident[]> {
  try {
    const { data, error } = await supabase.rpc('get_flat_public_residents', { p_accommodation_id: accommodationId });
    if (error || !Array.isArray(data)) return [];
    return (data as Partial<FlatResident>[])
      .filter((r): r is FlatResident => !!r && typeof r.id === 'string')
      .map((r) => ({
        id: r.id,
        full_name: r.full_name ?? null,
        avatar_url: r.avatar_url ?? null,
        career: r.career ?? null,
        university_course: r.university_course ?? null,
        room_label: r.room_label ?? null,
      }));
  } catch {
    return [];
  }
}
