import type { ProClientSource, ProData } from "./types";
import { addDays, localDate } from "./format";

const FRANKY_SOURCES: ProClientSource[] = ["franky", "hueco", "card", "grupo"];

/** Comisión típica de los marketplaces por cliente nuevo (Booksy Boost cobra el 30 % de la primera visita). */
export const MARKETPLACE_FEE = 0.3;

/**
 * Lo que Franky ha traído en los últimos `days` días. Cuenta reservas y
 * visitas reales con origen Franky; en los motores sin reservas (noche,
 * vivienda) suma lo que cada motor aporta.
 */
export function frankyResults(data: ProData, now: Date, days = 30) {
  const today = localDate(now);
  const from = addDays(today, -days + 1);
  const inRange = (iso: string) => {
    const d = localDate(iso);
    return d >= from && d <= today;
  };
  const bookings = data.bookings.filter((b) => FRANKY_SOURCES.includes(b.source) && b.status !== "cancelled" && inRange(b.start));
  const clientIds = new Set(bookings.map((b) => b.clientId ?? b.clientName));
  const newClients = data.clients.filter((c) => FRANKY_SOURCES.includes(c.source) && inRange(c.createdAt)).length;
  const bookingRevenue = bookings.filter((b) => b.status !== "no_show").reduce((a, b) => a + b.priceCents, 0);
  const validations = data.validations.filter((v) => inRange(v.at));
  const validationRevenue = validations.reduce((a, v) => a + v.amountCents - v.discountCents, 0);
  const guests = data.guests.filter((g) => g.promoterId || g.university).length;

  const bySource: Record<string, number> = {};
  for (const b of bookings) bySource[b.source] = (bySource[b.source] ?? 0) + 1;

  const people = Math.max(clientIds.size, newClients) + validations.length + guests;
  const revenueCents = bookingRevenue + validationRevenue;
  return {
    people,
    bookings: bookings.length,
    newClients: Math.max(newClients, Math.round(clientIds.size * 0.4)),
    revenueCents,
    bySource,
    /** Lo que habría costado en comisiones de marketplace por los clientes nuevos. */
    savedCents: Math.round(bookings.filter((b) => b.status !== "no_show").slice(0, Math.max(newClients, Math.round(clientIds.size * 0.4))).reduce((a, b) => a + b.priceCents, 0) * MARKETPLACE_FEE),
  };
}

/** Serie semanal de clientes que llegaron por Franky (últimas `weeks` semanas). */
export function weeklyFranky(data: ProData, now: Date, weeks = 8) {
  if (data.history.length) {
    return data.history.slice(-weeks).map((w) => ({
      label: new Date(`${w.week}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      value: w.franky,
      total: w.total,
      revenueCents: w.revenueCents,
    }));
  }
  const today = localDate(now);
  return Array.from({ length: weeks }, (_, i) => {
    const end = addDays(today, -7 * (weeks - 1 - i));
    const start = addDays(end, -6);
    const count = data.bookings.filter((b) => {
      const d = localDate(b.start);
      return FRANKY_SOURCES.includes(b.source) && b.status !== "cancelled" && d >= start && d <= end;
    }).length;
    return { label: new Date(`${start}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" }), value: count, total: count, revenueCents: 0 };
  });
}

/**
 * Las cifras de "últimos 30 días" que se enseñan en Hoy y en Estudiantes. Se
 * toma lo mayor entre las reservas cargadas y la serie semanal (que cubre
 * todo el mes aunque solo estén cargados los últimos días), para que las dos
 * pantallas digan siempre lo mismo.
 */
export function frankyMonth(data: ProData, now: Date) {
  const results = frankyResults(data, now, 30);
  const lastWeeks = weeklyFranky(data, now, 8).slice(-4);
  const weeklyPeople = lastWeeks.reduce((a, w) => a + w.value, 0);
  const weeklyRevenue = lastWeeks.reduce(
    (a, w) => a + (w.total ? (w.revenueCents * w.value) / w.total : 0),
    0,
  );
  const revenueCents = Math.max(results.revenueCents, Math.round(weeklyRevenue));
  return {
    results,
    people: Math.max(results.people, weeklyPeople),
    revenueCents,
    /** Agenda: el 30 % de la primera visita de los clientes nuevos (unos 4 de cada 10). */
    agendaSavedCents: Math.max(results.savedCents, Math.round(revenueCents * MARKETPLACE_FEE * 0.4)),
  };
}
