import type { LeadStage, ProData, ProLead, ProProperty, ProRoom, ProTenant, ProVisit } from "./types";
import { addDays, localDate, localMinutes, weekdayIndex } from "./format";

/**
 * Motor de vivienda (inmobiliaria y propietario): reglas y cálculos que
 * comparten las pantallas de Resumen, Interesados, Cartera, Visitas e
 * Inquilinos.
 */

/* ---------- Etiquetas ---------- */

export const STAGES: { id: LeadStage; label: string; hint: string }[] = [
  { id: "new", label: "Nuevo", hint: "Sin contestar" },
  { id: "contacted", label: "Contactado", hint: "Ya habéis hablado" },
  { id: "visit", label: "Visita", hint: "Visita propuesta o hecha" },
  { id: "reserved", label: "Reserva", hint: "Contrato enviado o señal" },
  { id: "signed", label: "Firmado", hint: "Ya es inquilino" },
  { id: "lost", label: "Perdido", hint: "No sigue adelante" },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<LeadStage, string>;

export const ROOM_STATUS: Record<ProRoom["status"], { label: string; tone: "success" | "violet" | "neutral" | "warning" }> = {
  free: { label: "Libre", tone: "success" },
  reserved: { label: "Reservada", tone: "violet" },
  occupied: { label: "Ocupada", tone: "neutral" },
  leaving: { label: "Se libera", tone: "warning" },
};

export const CONTRACT_LABEL: Record<ProTenant["contractKind"], string> = {
  temporada: "Temporada",
  habitacion: "Habitación",
  vivienda: "Vivienda",
};

export const LOST_REASONS = ["Encontró otro piso", "Se sale de su presupuesto", "No le cuadran las fechas", "No contesta", "Quería piso entero"];

export const ZONES = ["San Vicente centro", "Tómbola", "Ciudad Jardín", "Alicante centro"];

/** Comisión que cobran los portales de alojamiento para estudiantes al propietario, sobre el contrato. */
export const PORTAL_FEE = 0.08;

export const GVA_URL = "https://sede.gva.es";

/* ---------- Universidad ---------- */

export function uniShort(university: string): string {
  if (university === "Universidad de Alicante") return "UA";
  if (university === "Universidad Miguel Hernández") return "UMH";
  if (university === "CEU Cardenal Herrera") return "CEU";
  return university;
}

/* ---------- Pisos y habitaciones ---------- */

export function allRooms(data: ProData): { property: ProProperty; room: ProRoom }[] {
  return data.properties.flatMap((property) => property.rooms.map((room) => ({ property, room })));
}

export function findRoom(data: ProData, propertyId?: string, roomId?: string) {
  const property = data.properties.find((p) => p.id === propertyId);
  const room = property?.rooms.find((r) => r.id === roomId);
  return { property, room };
}

export function occupancy(data: ProData) {
  const rooms = allRooms(data).map((x) => x.room);
  const occupied = rooms.filter((r) => r.status === "occupied" || r.status === "leaving").length;
  return {
    total: rooms.length,
    occupied,
    reserved: rooms.filter((r) => r.status === "reserved").length,
    free: rooms.filter((r) => r.status === "free").length,
    leaving: rooms.filter((r) => r.status === "leaving").length,
  };
}

export function propertyOccupancy(p: ProProperty) {
  const occupied = p.rooms.filter((r) => r.status === "occupied" || r.status === "leaving" || r.status === "reserved").length;
  return { occupied, total: p.rooms.length };
}

export function priceRange(p: ProProperty) {
  const prices = p.rooms.map((r) => r.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * Las dos entradas del curso: la próxima (septiembre, o "ya" fuera de temporada)
 * y febrero (los Erasmus del segundo cuatrimestre).
 */
export function intakes(now: Date) {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const febYear = month <= 2 ? year : year + 1;
  const inSeason = month >= 7 && month <= 10;
  return {
    soon: { label: inSeason ? "septiembre" : "ahora", by: addDays(today, 45) },
    feb: { label: "febrero", by: `${febYear}-02-28`, start: `${febYear}-02-01` },
  };
}

/** Habitaciones que estarán libres para una fecha: libres ya o que se liberan antes. */
export function freeBy(data: ProData, by: string) {
  return allRooms(data).filter(({ room }) => (room.status === "free" || room.status === "leaving") && room.availableFrom.slice(0, 10) <= by);
}

export function isFebMoveIn(iso: string) {
  const m = Number(iso.slice(5, 7));
  return m === 1 || m === 2 || m === 3;
}

export function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function monthName(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime()) / 86400000);
}

export function addMonths(date: string, months: number) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/* ---------- Inquilinos y cobros ---------- */

export function currentTenants(data: ProData, now: Date): ProTenant[] {
  const today = localDate(now);
  return data.tenants.filter((t) => t.contractEnd.slice(0, 10) >= today);
}

export function formerTenants(data: ProData, now: Date): ProTenant[] {
  const today = localDate(now);
  return data.tenants.filter((t) => t.contractEnd.slice(0, 10) < today);
}

export function rentSummary(data: ProData, now: Date) {
  const today = localDate(now);
  const list = currentTenants(data, now).filter((t) => t.contractStart.slice(0, 10) <= today);
  const sum = (s: ProTenant["rentStatus"]) => list.filter((t) => t.rentStatus === s).reduce((a, t) => a + t.rentCents, 0);
  return {
    tenants: list,
    totalCents: list.reduce((a, t) => a + t.rentCents, 0),
    paidCents: sum("paid"),
    pendingCents: sum("pending"),
    lateCents: sum("late"),
    paid: list.filter((t) => t.rentStatus === "paid").length,
    pending: list.filter((t) => t.rentStatus === "pending").length,
    late: list.filter((t) => t.rentStatus === "late").length,
  };
}

/** Compatibilidad de Roomie entre dos personas (estable para la misma pareja). */
export function compatibility(a: string, b: string): number {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 68 + (h % 27);
}

/**
 * Sustitutos que Roomie propone para la habitación de alguien que se va:
 * interesados activos que entran por esas fechas, con presupuesto y buena
 * compatibilidad con los que se quedan.
 */
export function roomieSuggestions(data: ProData, tenant: ProTenant, now: Date, limit = 3) {
  const flatmates = currentTenants(data, now).filter((t) => t.propertyId === tenant.propertyId && t.id !== tenant.id && !t.leavingAt);
  const from = tenant.leavingAt ?? tenant.contractEnd;
  return data.leads
    .filter((l) => (l.stage === "new" || l.stage === "contacted" || l.stage === "visit") && !l.roomieGroup)
    .filter((l) => Math.abs(daysBetween(from, l.moveIn)) <= 75 && l.budgetCents >= tenant.rentCents - 4000)
    .map((lead) => {
      const scores = flatmates.length ? flatmates.map((f) => compatibility(lead.id, f.id)) : [compatibility(lead.id, tenant.id)];
      return { lead, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), with: flatmates.length };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ---------- Visitas ---------- */

export const VISIT_STATUS: Record<ProVisit["status"], { label: string; tone: "neutral" | "success" | "danger" | "info" }> = {
  scheduled: { label: "Programada", tone: "info" },
  done: { label: "Hecha", tone: "success" },
  no_show: { label: "No vino", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const VISIT_MINUTES = 30;

/** Franjas libres de un día para proponer visitas, según el horario de visitas y lo ya citado. */
export function visitSlots(data: ProData, date: string, now: Date, agentId?: string): number[] {
  const hours = data.space.hours[weekdayIndex(date)];
  if (!hours) return [];
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const taken = new Set(
    data.visits
      .filter((v) => v.status !== "cancelled" && localDate(v.start) === date && (!agentId || !v.agentId || v.agentId === agentId))
      .map((v) => localMinutes(v.start)),
  );
  const out: number[] = [];
  for (let m = hours.open; m + VISIT_MINUTES <= hours.close; m += VISIT_MINUTES) {
    if (date === today && m < nowMin + 30) continue;
    if (!taken.has(m)) out.push(m);
  }
  return out;
}

export function nextVisitDays(data: ProData, now: Date, count = 4): string[] {
  const today = localDate(now);
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 14; i++) {
    const date = addDays(today, i);
    if (visitSlots(data, date, now).length) out.push(date);
  }
  return out;
}

export function visitLink(visitId: string) {
  return `https://meet.jit.si/franky-visita-${visitId}`;
}

/* ---------- Lo que trae Franky ---------- */

export function leadRoomPrice(data: ProData, lead: ProLead): number {
  const { room } = findRoom(data, lead.propertyId, lead.roomId);
  return room?.priceCents ?? lead.budgetCents;
}

export function housingResults(data: ProData, now: Date, days = 30) {
  const today = localDate(now);
  const from = addDays(today, -days + 1);
  const recent = data.leads.filter((l) => localDate(l.createdAt) >= from);
  const signed = data.leads.filter((l) => l.stage === "signed" && localDate(l.lastContactAt ?? l.createdAt) >= from);
  const contractCents = signed.reduce((a, l) => a + leadRoomPrice(data, l) * l.months * (l.roomieGroup?.size ?? 1), 0);
  return {
    leads: recent.length,
    verified: recent.filter((l) => l.verified).length,
    erasmus: recent.filter((l) => l.erasmus).length,
    groups: data.leads.filter((l) => l.roomieGroup && l.stage !== "lost").length,
    signed: signed.length,
    contractCents,
    savedCents: Math.round(contractCents * PORTAL_FEE),
  };
}

/** Minutos que lleva esperando un interesado nuevo. */
export function waitingMinutes(lead: ProLead, now: Date) {
  return Math.max(0, Math.round((now.getTime() - new Date(lead.createdAt).getTime()) / 60000));
}

export function waitingLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round(minutes / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 día" : `${d} días`;
}

export function waitingTone(minutes: number): "danger" | "warning" | "neutral" {
  if (minutes >= 24 * 60) return "danger";
  if (minutes >= 3 * 60) return "warning";
  return "neutral";
}
