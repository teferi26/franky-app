import type { ProBooking, ProData, ProMember } from "./types";
import { addDays, localDate, time } from "./format";
import { isShared } from "./courts";
import { courtsOps } from "./courts-base";
import { resourceOf } from "./courts-ops";
import { studyRanking } from "./courts-desk";
import { warningsByPerson } from "./courts-admin";
import { monthName } from "./courts-growth";

/**
 * Sala de estudio: lo que hace que un socio se quede todo el curso. El resumen
 * de horas del mes, los avisos de convivencia a la vista de recepción y los
 * socios que han dejado de venir, con el mensaje ya escrito.
 */

function firstName(name: string): string {
  return name.trim().split(" ")[0] ?? name;
}

/** Móvil de un socio o de un cliente suelto. */
export function personPhone(data: ProData, personId: string): string | undefined {
  return (
    data.members.find((m) => m.id === personId)?.phone ??
    data.clients.find((c) => c.id === personId)?.phone
  );
}

/* ------------------------------------------------------------------ */
/* Resumen de horas del mes                                            */
/* ------------------------------------------------------------------ */

export type StudySummary = {
  personId: string;
  name: string;
  minutes: number;
  /** Puesto en la clasificación del mes (1 = quien más horas lleva). */
  rank: number;
  phone?: string;
  message: string;
};

/** "86 h" o "3 h 30 min": las horas redondas se leen mejor en un WhatsApp. */
export function studyHoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m >= 15 ? `${h} h ${m} min` : `${h} h`;
}

export function studySummaryMessage(input: {
  name: string;
  minutes: number;
  month: string;
  space: string;
  rank?: number;
  of?: number;
}): string {
  const top =
    input.rank && input.of && input.of >= 10 && input.rank <= Math.ceil(input.of / 10)
      ? " Estás entre quienes más horas llevan este mes."
      : "";
  return `Hola ${firstName(input.name)}, en ${monthName(input.month)} has estudiado ${studyHoursLabel(input.minutes)} en ${input.space}.${top} Gracias por venir, ¡a por el siguiente mes!`;
}

/**
 * El resumen de horas de cada persona que ha estudiado en la sala ese mes,
 * con el mensaje escrito para mandarlo por WhatsApp a fin de mes.
 */
export function monthlyStudySummaries(
  data: ProData,
  month: string,
  now: Date,
): StudySummary[] {
  const ranking = studyRanking(data, month, now);
  return ranking.map((r, i) => ({
    ...r,
    rank: i + 1,
    phone: personPhone(data, r.personId),
    message: studySummaryMessage({
      name: r.name,
      minutes: r.minutes,
      month,
      space: data.space.name,
      rank: i + 1,
      of: ranking.length,
    }),
  }));
}

/** Últimos cuatro días del mes o primeros cinco del siguiente: toca enviarlo. */
export function summaryMonth(today: string): string | null {
  const day = Number(today.slice(8));
  const month = today.slice(0, 7);
  if (day <= 5) return addDays(`${month}-01`, -1).slice(0, 7);
  const last = Number(addDays(addDays(`${month}-01`, 32).slice(0, 7) + "-01", -1).slice(8));
  return day >= last - 3 ? month : null;
}

/* ------------------------------------------------------------------ */
/* Avisos de convivencia en recepción                                  */
/* ------------------------------------------------------------------ */

export type DeskWarning = { count: number; flagged: boolean; lastKind?: string };

/**
 * Avisos de los últimos 90 días de quien entra, por socio o por nombre.
 * A partir del tercero la ficha se marca en recepción.
 */
export function deskWarning(
  data: ProData,
  person: { memberId?: string; name: string },
  today: string,
): DeskWarning {
  const key = person.memberId ?? person.name.trim().toLowerCase();
  const hit = warningsByPerson(data, today).find(
    (w) =>
      w.key === key ||
      (!!person.memberId && w.memberId === person.memberId) ||
      w.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
  );
  if (!hit) return { count: 0, flagged: false };
  return { count: hit.count, flagged: hit.count >= 3, lastKind: hit.last.kind };
}

/* ------------------------------------------------------------------ */
/* Socios que han dejado de venir                                      */
/* ------------------------------------------------------------------ */

export type AwayMember = {
  member: ProMember;
  /** Última entrada real (o reserva a la que vino), si la hay. */
  lastSeen: string | null;
  days: number;
  message: string;
};

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000,
  );
}

/** Último día que un socio entró en la sala (entrada marcada o reserva a la que vino). */
export function lastSeenOf(
  data: ProData,
  memberId: string,
  today: string,
): string | null {
  const checkins = courtsOps(data).checkins;
  let last: string | null = null;
  for (const b of data.bookings) {
    if (b.clientId !== memberId) continue;
    const r = resourceOf(data, b.resourceId);
    if (!r) continue;
    const came =
      Boolean(checkins[b.id]?.inAt) ||
      b.status === "arrived" ||
      b.status === "in_service" ||
      b.status === "done";
    if (!came) continue;
    const day = localDate(checkins[b.id]?.inAt ?? b.start);
    if (day > today) continue;
    if (!last || day > last) last = day;
  }
  return last;
}

/**
 * Socios con cuota que llevan `days` días o más sin venir. Son los que se dan
 * de baja el mes que viene: el mensaje recuerda su puesto y ofrece pausar
 * en vez de perderlos.
 */
export function membersAway(
  data: ProData,
  today: string,
  days = 10,
): AwayMember[] {
  const seatsOf = new Map(
    courtsOps(data)
      .seats.filter((s) => s.fixedMemberId)
      .map((s) => [s.fixedMemberId!, s.label]),
  );
  const hasStudyZone = data.resources.some(isShared);
  if (!hasStudyZone) return [];
  return data.members
    .filter((m) => m.status === "active" || m.status === "overdue" || m.status === "trial")
    .map((member) => {
      const lastSeen = lastSeenOf(data, member.id, today);
      const since = lastSeen ?? localDate(member.since);
      return { member, lastSeen, days: daysBetween(since, today) };
    })
    .filter((x) => x.days >= days)
    .map((x) => {
      const seat = seatsOf.get(x.member.id);
      const place = seat ? `Tu puesto ${seat} sigue aquí.` : "Tu sitio sigue aquí.";
      // Pasado un mes, la cifra exacta suena a reproche: mejor "más de un mes".
      const since = x.days > 30 ? "más de un mes" : `${x.days} días`;
      return {
        ...x,
        message: `Hola ${firstName(x.member.name)}, hace ${since} que no te vemos por ${data.space.name}. ${place} Si estas semanas no vas a venir, podemos pausar tu cuota hasta que vuelvas, sin perder nada.`,
      };
    })
    .sort((a, b) => b.days - a.days || a.member.name.localeCompare(b.member.name));
}

/* ------------------------------------------------------------------ */
/* Buscar en recepción                                                 */
/* ------------------------------------------------------------------ */

export type DeskFound = {
  key: string;
  name: string;
  detail: string;
  personId?: string;
  booking?: ProBooking;
};

/**
 * Busca entre las reservas de hoy y los socios por nombre o móvil: lo que
 * escribe recepción cuando alguien llega a la puerta.
 */
export function searchDesk(
  members: ProMember[],
  todays: ProBooking[],
  query: string,
): DeskFound[] {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\s/g, "");
  const out: DeskFound[] = [];
  const seen = new Set<string>();
  for (const b of todays) {
    if (b.status === "cancelled" || b.status === "no_show" || b.status === "done") continue;
    if (!b.clientName.toLowerCase().includes(q)) continue;
    seen.add(b.clientId ?? b.clientName);
    out.push({
      key: b.id,
      name: b.clientName,
      detail: `${b.status === "arrived" ? "Dentro" : "Reserva"} de ${time(b.start)} a ${time(b.end)}`,
      personId: b.clientId,
      booking: b,
    });
  }
  for (const m of members) {
    if (seen.has(m.id) || m.status === "cancelled") continue;
    const phone = m.phone?.replace(/\s/g, "") ?? "";
    if (!m.name.toLowerCase().includes(q) && !(digits.length >= 3 && phone.includes(digits))) continue;
    out.push({
      key: m.id,
      name: m.name,
      detail:
        m.sessionsLeft !== null
          ? `Socio con bono, ${m.sessionsLeft === 1 ? "le queda 1 uso" : `le quedan ${m.sessionsLeft} usos`}`
          : "Socio mensual, sin reserva hoy",
      personId: m.id,
    });
  }
  return out.slice(0, 6);
}
