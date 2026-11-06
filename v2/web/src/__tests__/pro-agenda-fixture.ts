import { buildDemo } from "@/lib/pro/demo";
import { emptyAgendaOps } from "@/lib/pro/agenda-ops";
import { atLocal } from "@/lib/pro/format";
import type { ProBooking, ProClient, ProData } from "@/lib/pro/types";

/**
 * Barbería de la demo sin citas ni cobros, para probar la lógica de agenda
 * con datos controlados. Jueves 24 de septiembre de 2026 a las 10:00.
 * Equipo: s1 Dani y s3 Marcos (cortes, sv1 a sv4) y s2 Lucía (color, sv5 a sv10).
 */
export const NOW = new Date("2026-09-24T08:00:00.000Z");
export const TODAY = "2026-09-24";
export const TOMORROW = "2026-09-25";

export function agendaFixture(): ProData {
  const demo = buildDemo("hairdresser", NOW);
  return {
    ...demo,
    bookings: [],
    payments: [],
    shifts: [],
    reviews: [],
    clients: [client("c1", "Pablo Ruiz"), client("c2", "Marta Gil")],
    agendaOps: emptyAgendaOps(demo.space),
  };
}

export function client(id: string, name: string, extra: Partial<ProClient> = {}): ProClient {
  return {
    id,
    name,
    phone: "600 111 222",
    tags: [],
    visits: 0,
    spentCents: 0,
    noShows: 0,
    source: "phone",
    marketingConsent: true,
    cardMember: false,
    createdAt: "2026-01-10T10:00:00.000Z",
    ...extra,
  };
}

export function booking(
  id: string,
  date: string,
  minute: number,
  extra: Partial<ProBooking> & { serviceId?: string; durationMin?: number } = {},
): ProBooking {
  const { durationMin = 30, ...rest } = extra;
  return {
    id,
    kind: "appointment",
    clientId: "c1",
    clientName: "Pablo Ruiz",
    staffId: "s1",
    serviceId: "sv2",
    start: atLocal(date, minute),
    end: atLocal(date, minute + durationMin),
    partySize: 1,
    status: "confirmed",
    priceCents: 1500,
    paidCents: 0,
    source: "phone",
    ...rest,
  };
}
