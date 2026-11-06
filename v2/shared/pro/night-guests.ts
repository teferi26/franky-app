/**
 * Quién entra y quién reserva: las condiciones de acceso del local (el
 * portero elige una al vetar), el historial de cada persona que reserva
 * zona y los reservados que no se presentaron.
 *
 * Funciones puras: la web y la app nativa cuentan igual.
 */
import type { ProData, ProZone } from "./types";
import type { ProBan, ProNightIncident, ProNightOps, ProZoneNoShow } from "./night-types";
import { nightOf } from "./night";
import { freeZone, nightOpsOf, normalizeName, withNightOps } from "./night-ops";

/* ------------------------------------------------------------------ */
/* Condiciones de acceso                                               */
/* ------------------------------------------------------------------ */

/** Las que tienen casi todos los locales; cada uno las cambia a su gusto. */
export const DEFAULT_ACCESS_CONDITIONS = [
  "Mayores de 18 años con documento",
  "Sin ropa deportiva ni chanclas",
  "Sin signos de embriaguez",
  "Sin actitud violenta o molesta",
  "Sin bebida ni comida de fuera",
];

export function accessConditionsOf(ops: ProNightOps): string[] {
  const own = ops.settings.accessConditions?.map((c) => c.trim()).filter(Boolean);
  return own?.length ? own : DEFAULT_ACCESS_CONDITIONS;
}

export function setAccessConditions(ops: ProNightOps, list: string[]): ProNightOps {
  const clean = [...new Set(list.map((c) => c.trim()).filter(Boolean))];
  return { ...ops, settings: { ...ops.settings, accessConditions: clean } };
}

/** Vetos que se apoyan en cada condición, de más a menos usada. */
export function bansByCondition(ops: ProNightOps) {
  const map = new Map<string, number>();
  for (const b of ops.bans) {
    if (!b.condition) continue;
    map.set(b.condition, (map.get(b.condition) ?? 0) + 1);
  }
  return [...map.entries()].map(([condition, count]) => ({ condition, count })).sort((a, b) => b.count - a.count);
}

/**
 * Añade un veto y, si se pide, lo apunta también en el libro de incidencias de
 * esa noche con la condición y el motivo.
 */
export function addBan(
  ops: ProNightOps,
  ban: ProBan,
  log: { incidentId: string; at: string; eventId?: string } | null,
): ProNightOps {
  const next: ProNightOps = { ...ops, bans: [...ops.bans, ban] };
  if (!log) return next;
  const incident: ProNightIncident = {
    id: log.incidentId,
    night: nightOf(new Date(log.at)),
    eventId: log.eventId,
    at: log.at,
    kind: "expulsion",
    description: `Acceso denegado a ${ban.name}${ban.condition ? ` (${ban.condition.toLowerCase()})` : ""}: ${ban.reason}`,
    by: ban.by,
  };
  return { ...next, incidents: [...next.incidents, incident] };
}

/* ------------------------------------------------------------------ */
/* Historial de quien reserva                                          */
/* ------------------------------------------------------------------ */

function phoneKey(phone?: string): string {
  return (phone ?? "").replace(/\D/g, "").slice(-9);
}

function samePerson(a: { name: string; phone?: string }, b: { name: string; phone?: string }): boolean {
  const pa = phoneKey(a.phone);
  const pb = phoneKey(b.phone);
  if (pa && pb) return pa === pb;
  const na = normalizeName(a.name);
  return Boolean(na) && na === normalizeName(b.name);
}

export type BookerHistory = {
  /** Reservados que llegaron y cerraron cuenta. */
  visits: number;
  totalCents: number;
  avgCents: number;
  noShows: number;
  depositKeptCents: number;
  lastNight: string | null;
  /** Si no se presentó alguna vez, conviene pedir señal. */
  askDeposit: boolean;
};

/** Veces que ha reservado y venido, lo que gasta de media y los plantones. */
export function bookerHistory(
  data: Pick<ProData, "nightOps">,
  who: { name: string; phone?: string },
  excludeNight?: string,
): BookerHistory {
  const ops = nightOpsOf(data);
  const bills = ops.zoneBills.filter(
    (b) =>
      samePerson({ name: b.bookedBy }, { name: who.name }) &&
      (!excludeNight || nightOf(new Date(b.closedAt)) !== excludeNight),
  );
  const noShows = (ops.noShows ?? []).filter((n) => samePerson({ name: n.bookedBy, phone: n.phone }, who));
  // Lo cobrado de verdad: el mayor entre consumo y mínimo.
  const totalCents = bills.reduce((a, b) => a + Math.max(b.consumedCents, b.minimumCents), 0);
  const nights = [...bills.map((b) => nightOf(new Date(b.closedAt))), ...noShows.map((n) => n.night)].sort();
  return {
    visits: bills.length,
    totalCents,
    avgCents: bills.length ? Math.round(totalCents / bills.length) : 0,
    noShows: noShows.length,
    depositKeptCents: noShows.reduce((a, n) => a + n.depositKeptCents, 0),
    lastNight: nights.length ? nights[nights.length - 1] : null,
    askDeposit: noShows.length > 0,
  };
}

/**
 * El reservado no se ha presentado: queda apuntado (con la señal que se queda
 * el local, si la había pagado) y la zona vuelve a estar libre.
 */
export function recordNoShow(data: ProData, zoneId: string, at: string, id: string): ProData {
  const zone = data.zones.find((z) => z.id === zoneId);
  if (!zone || !zone.bookedBy) return data;
  const paid = zone.status === "booked" || zone.status === "arrived";
  const entry: ProZoneNoShow = {
    id,
    night: nightOf(new Date(at)),
    eventId: zone.eventId,
    zoneName: zone.name,
    bookedBy: zone.bookedBy,
    phone: zone.phone,
    people: zone.people,
    depositKeptCents: paid ? zone.depositCents : 0,
    at,
  };
  const withFree: ProData = {
    ...data,
    zones: data.zones.map((z): ProZone => (z.id === zoneId ? freeZone(z) : z)),
  };
  return withNightOps(withFree, (ops) => ({ ...ops, noShows: [...(ops.noShows ?? []), entry] }));
}
