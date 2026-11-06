/**
 * Lógica del motor de noche (pub y discoteca): fases de un evento, tramos,
 * cifras de puerta y comisiones de RRPP. Todo son funciones puras sobre
 * `ProData`, para que Hoy, Eventos, RRPP, Puerta y Reservados cuenten igual.
 */
import type { ProCommissionRule, ProData, ProEvent, ProGuest, ProPromoter, ProTicketTier, ProZone } from "./types";
import { addDays, localDate, localMinutes, money } from "./format";

/** Comisión de Franky por entrada vendida. La paga el comprador, no la sala. */
export const FRANKY_TICKET_FEE = 0.025;
/**
 * Comisión publicada de un marketplace de ocio nocturno por las ventas que trae
 * (Xceed cobra un 15 % en su marketplace, xceed.me/es/pricing, sep-2026).
 */
export const MARKETPLACE_TICKET_FEE = 0.15;

/* ---------- Tiempo ---------- */

/** La noche a la que pertenece un instante: hasta las 8:00 sigue siendo "anoche". */
export function nightOf(now: Date): string {
  const today = localDate(now);
  return localMinutes(now) < 8 * 60 ? addDays(today, -1) : today;
}

export type EventPhase = "draft" | "upcoming" | "today" | "live" | "past";

export function eventPhase(ev: ProEvent, now: Date): EventPhase {
  if (ev.status === "draft") return "draft";
  const t = now.getTime();
  if (t >= new Date(ev.closes).getTime()) return "past";
  if (t >= new Date(ev.doorsOpen).getTime()) return "live";
  if (ev.date === nightOf(now)) return "today";
  return ev.date < nightOf(now) ? "past" : "upcoming";
}

export const PHASE_LABEL: Record<EventPhase, string> = {
  draft: "Borrador",
  upcoming: "A la venta",
  today: "Esta noche",
  live: "En directo",
  past: "Terminado",
};

export function sortedEvents(data: ProData): ProEvent[] {
  return [...data.events].sort((a, b) => a.doorsOpen.localeCompare(b.doorsOpen));
}

/** El evento de esta noche (antes de abrir o en marcha), si lo hay. */
export function tonightEvent(data: ProData, now: Date): ProEvent | null {
  const night = nightOf(now);
  return sortedEvents(data).find((e) => e.status !== "draft" && e.date === night && eventPhase(e, now) !== "past") ?? null;
}

export function upcomingEvents(data: ProData, now: Date): ProEvent[] {
  return sortedEvents(data).filter((e) => {
    const p = eventPhase(e, now);
    return p === "upcoming" || p === "today" || p === "live";
  });
}

export function pastEvents(data: ProData, now: Date): ProEvent[] {
  return sortedEvents(data)
    .filter((e) => eventPhase(e, now) === "past")
    .reverse();
}

/** El evento en el que se centra la operación: el de esta noche o el siguiente. */
export function focusEvent(data: ProData, now: Date): ProEvent | null {
  return tonightEvent(data, now) ?? upcomingEvents(data, now)[0] ?? null;
}

/** "2 h 14 min", "3 días", "45 min". */
export function countdown(fromMs: number, toIso: string): string {
  const diff = Math.max(0, new Date(toIso).getTime() - fromMs);
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 36) return `${h} h ${min % 60} min`;
  return `${Math.round(h / 24)} días`;
}

/* ---------- Tramos y cifras de un evento ---------- */

/** El tramo que se vende ahora: el primero sin agotar y sin caducar. */
export function activeTier(ev: ProEvent, now: Date): ProTicketTier | null {
  if (eventPhase(ev, now) === "past") return null;
  return ev.tiers.find((t) => t.sold < t.quantity && (!t.until || new Date(t.until).getTime() > now.getTime())) ?? null;
}

export function tierState(t: ProTicketTier, ev: ProEvent, now: Date): "active" | "sold_out" | "closed" | "next" {
  if (t.sold >= t.quantity) return "sold_out";
  const active = activeTier(ev, now);
  if (active?.id === t.id) return "active";
  if (t.until && new Date(t.until).getTime() <= now.getTime()) return "closed";
  return "next";
}

export function guestsOf(data: ProData, eventId: string): ProGuest[] {
  return data.guests.filter((g) => g.eventId === eventId);
}

export function eventStats(data: ProData, ev: ProEvent) {
  const guests = guestsOf(data, ev.id);
  const tickets = guests.filter((g) => g.kind === "ticket");
  const list = guests.filter((g) => g.kind === "list");
  const reserved = guests.filter((g) => g.kind === "reserved");
  const sold = ev.tiers.reduce((a, t) => a + t.sold, 0);
  const revenueCents = ev.tiers.reduce((a, t) => a + t.sold * t.priceCents, 0);
  const ticketsIn = tickets.filter((g) => g.checkedInAt).length;
  const listIn = list.filter((g) => g.checkedInAt).length;
  const reservedIn = reserved.filter((g) => g.checkedInAt).length;
  const students = tickets.filter((g) => g.university).length;
  const walkIns = ev.walkIns ?? 0;
  return {
    sold,
    revenueCents,
    ticketsIn,
    list: list.length,
    listIn,
    reserved: reserved.length,
    reservedIn,
    students,
    walkIns,
    inside: ev.checkedIn,
    scanned: ticketsIn + listIn + reservedIn,
    noShows: tickets.length - ticketsIn + (list.length - listIn),
    frankyFeeCents: Math.round(revenueCents * FRANKY_TICKET_FEE),
  };
}

/** Entradas por minuto en los últimos `minutes` minutos. */
export function entryRate(data: ProData, ev: ProEvent, now: Date, minutes = 10): number {
  const from = now.getTime() - minutes * 60000;
  const n = guestsOf(data, ev.id).filter((g) => g.checkedInAt && new Date(g.checkedInAt).getTime() >= from && new Date(g.checkedInAt).getTime() <= now.getTime()).length;
  return Math.round((n / minutes) * 10) / 10;
}

/** Entradas por franjas de 15 minutos desde que se abrieron las puertas. */
export function entryCurve(data: ProData, ev: ProEvent, now: Date, buckets = 16): number[] {
  const start = new Date(ev.doorsOpen).getTime();
  const out = Array.from({ length: buckets }, () => 0);
  for (const g of guestsOf(data, ev.id)) {
    if (!g.checkedInAt) continue;
    const t = new Date(g.checkedInAt).getTime();
    if (t > now.getTime()) continue;
    const i = Math.floor((t - start) / (15 * 60000));
    if (i >= 0 && i < buckets) out[i]++;
  }
  return out;
}

export function listClosed(ev: ProEvent, now: Date): boolean {
  return Boolean(ev.listCutoff && now.getTime() >= new Date(ev.listCutoff).getTime());
}

/**
 * Crush Live: quién juega y cuántos matches salen en pantalla. Solo se cuenta
 * lo medido en la noche (`ev.crush`); sin ese dato las cifras son 0 y
 * `known` es false, para que la pantalla no enseñe números supuestos.
 * `sold` se mantiene por compatibilidad con las pantallas que ya lo pasan.
 */
export function crushStats(ev: ProEvent, sold?: number) {
  void sold;
  return {
    players: ev.crush?.players ?? 0,
    matches: ev.crush?.matches ?? 0,
    live: ev.checkedIn > 0,
    known: Boolean(ev.crush),
  };
}

/* ---------- RRPP ---------- */

export function ruleLabel(spec: ProCommissionRule | undefined, fallback = ""): string {
  if (!spec) return fallback;
  if (spec.kind === "per_scan") return `${money(spec.cents)} por entrada escaneada`;
  return `${money(spec.lowCents)} hasta ${spec.upTo} entradas, ${money(spec.highCents)} desde la ${spec.upTo + 1}`;
}

/** Comisión de una noche según las entradas que de verdad pasaron por puerta. */
export function commissionFor(spec: ProCommissionRule | undefined, scanned: number): number {
  if (!spec) return scanned * 100;
  if (spec.kind === "per_scan") return scanned * spec.cents;
  const low = Math.min(scanned, spec.upTo);
  return low * spec.lowCents + Math.max(0, scanned - spec.upTo) * spec.highCents;
}

export type PromoterNight = { eventId: string; sold: number; list: number; scanned: number; commissionCents: number };

export function promoterNights(data: ProData, p: ProPromoter): PromoterNight[] {
  const spec = p.spec;
  const map = new Map<string, PromoterNight>();
  for (const g of data.guests) {
    if (g.promoterId !== p.id) continue;
    const row = map.get(g.eventId) ?? { eventId: g.eventId, sold: 0, list: 0, scanned: 0, commissionCents: 0 };
    if (g.kind === "list") row.list++;
    else row.sold++;
    if (g.checkedInAt) row.scanned++;
    map.set(g.eventId, row);
  }
  const rows = [...map.values()];
  rows.forEach((r) => (r.commissionCents = commissionFor(spec, r.scanned)));
  const order = new Map(sortedEvents(data).map((e, i) => [e.id, i]));
  return rows.sort((a, b) => (order.get(b.eventId) ?? 0) - (order.get(a.eventId) ?? 0));
}

export function promoterTotals(data: ProData, p: ProPromoter, eventId?: string) {
  const nights = promoterNights(data, p).filter((n) => !eventId || n.eventId === eventId);
  const sold = nights.reduce((a, n) => a + n.sold, 0);
  const list = nights.reduce((a, n) => a + n.list, 0);
  const scanned = nights.reduce((a, n) => a + n.scanned, 0);
  const commissionCents = nights.reduce((a, n) => a + n.commissionCents, 0);
  /** Lo que habría cobrado si se pagara por apuntado, como en las listas de WhatsApp. */
  const byListCents = commissionFor(p.spec, sold + list);
  return { sold, list, scanned, commissionCents, byListCents, conversion: sold + list ? Math.round((scanned / (sold + list)) * 100) : 0 };
}

/** Lo que se le debe a un RRPP: noches terminadas y aún sin liquidar. */
export function pendingSettlement(data: ProData, p: ProPromoter, now: Date) {
  const settled = new Set(p.settledEventIds ?? []);
  const nights = promoterNights(data, p).filter((n) => {
    const ev = data.events.find((e) => e.id === n.eventId);
    return ev && eventPhase(ev, now) === "past" && !settled.has(n.eventId) && n.scanned > 0;
  });
  return {
    nights,
    scanned: nights.reduce((a, n) => a + n.scanned, 0),
    cents: nights.reduce((a, n) => a + n.commissionCents, 0),
  };
}

export function promoterCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "");
  return `${base || "rrpp"}${String(new Date().getFullYear()).slice(2)}`;
}

/** Enlace personal del RRPP: la ficha de la sala en Franky con su código. */
export function promoterLink(code: string, slug: string): string {
  return `franky.es/n/${slug}?rrpp=${code.toLowerCase()}`;
}

/* ---------- Reservados ---------- */

export const ZONE_STATUS: Record<ProZone["status"], { label: string; tone: "neutral" | "warning" | "violet" | "success" }> = {
  free: { label: "Libre", tone: "neutral" },
  held: { label: "Apartado", tone: "warning" },
  booked: { label: "Reservado", tone: "violet" },
  arrived: { label: "Han llegado", tone: "success" },
};

export function zoneTotals(zones: ProZone[]) {
  const taken = zones.filter((z) => z.status !== "free");
  return {
    taken: taken.length,
    free: zones.length - taken.length,
    arrived: zones.filter((z) => z.status === "arrived").length,
    held: zones.filter((z) => z.status === "held").length,
    minimumCents: taken.filter((z) => z.status !== "held").reduce((a, z) => a + z.minimumSpendCents, 0),
    depositCents: taken.filter((z) => z.status !== "held").reduce((a, z) => a + z.depositCents, 0),
    people: taken.reduce((a, z) => a + (z.people ?? 0), 0),
  };
}

/* ---------- Lo que trae Franky ---------- */

/** Entradas vendidas a estudiantes en Franky en los últimos `days` días (y las de las próximas noches). */
export function nightFranky(data: ProData, now: Date, days = 30) {
  const from = addDays(nightOf(now), -days);
  const events = data.events.filter((e) => e.status !== "draft" && e.date >= from);
  const ids = new Set(events.map((e) => e.id));
  const tickets = data.guests.filter((g) => ids.has(g.eventId) && g.kind === "ticket");
  const studentTickets = tickets.filter((g) => g.university);
  const priceOf = (g: ProGuest) => {
    const ev = events.find((e) => e.id === g.eventId);
    return ev?.tiers.find((t) => t.name === g.tierName)?.priceCents ?? 0;
  };
  const revenueCents = studentTickets.reduce((a, g) => a + priceOf(g), 0);
  const allRevenue = tickets.reduce((a, g) => a + priceOf(g), 0);
  return {
    studentTickets: studentTickets.length,
    tickets: tickets.length,
    revenueCents,
    /** Lo que un marketplace al 15 % se habría quedado de esas mismas entradas. */
    savedCents: Math.round(allRevenue * MARKETPLACE_TICKET_FEE),
    universities: studentTickets.reduce<Record<string, number>>((acc, g) => {
      acc[g.university as string] = (acc[g.university as string] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export function shortUni(name?: string): string {
  if (!name) return "";
  if (name.includes("Miguel Hernández")) return "UMH";
  if (name.includes("CEU")) return "CEU";
  if (name.includes("Alicante")) return "UA";
  return name;
}
