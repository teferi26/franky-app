import type { ProBooking, ProClassSession, ProClassType, ProData, ProMembershipPlan, ProOffer } from "./types";
import type {
  ProBoardBlock,
  ProBookingPolicy,
  ProClassTypeExtra,
  ProRoomBooking,
  ProSessionExtra,
  ProWaitOffer,
} from "./classes-types";
import { addDays, atLocal, localDate, localMinutes, minutesToLabel, weekdayIndex } from "./format";
import {
  FALLBACK_PER_PLAYER_CENTS,
  freeSpots,
  isRoomMode,
  isWaitlist,
  priceForPlayers,
  sessionRoster,
  weekStart,
  withRoster,
} from "./classes";

export { FALLBACK_PER_PLAYER_CENTS, isRoomMode, priceForPlayers };
import { extrasOf, firstName, withExtras } from "./classes-care";

/**
 * Operación del motor de clases alrededor de cada sesión: salas de ocio
 * (modo sala, precio por jugadores, montaje), la lista de espera que se mueve
 * sola, la pizarra, las sustituciones, la ocupación por franja, las horas de
 * cada coach y el calendario de exámenes de las academias.
 */

/* ------------------------------------------------------------------ */
/* Tipos de sesión y salas                                             */
/* ------------------------------------------------------------------ */

export function typeExtra(data: ProData, classTypeId: string | undefined): ProClassTypeExtra {
  return (classTypeId && extrasOf(data).types[classTypeId]) || {};
}

export function sessionExtra(data: ProData, sessionId: string): ProSessionExtra {
  return extrasOf(data).sessions[sessionId] ?? {};
}

export function patchSessionExtra(d: ProData, sessionId: string, changes: Partial<ProSessionExtra>): ProData {
  return withExtras(d, (x) => ({
    ...x,
    sessions: { ...x.sessions, [sessionId]: { ...x.sessions[sessionId], ...changes } },
  }));
}

export function patchTypeExtra(d: ProData, classTypeId: string, changes: Partial<ProClassTypeExtra>): ProData {
  return withExtras(d, (x) => ({
    ...x,
    types: { ...x.types, [classTypeId]: { ...x.types[classTypeId], ...changes } },
  }));
}

export function sessionIsRoom(data: ProData, s: ProClassSession): boolean {
  return isRoomMode(data, data.classTypes.find((c) => c.id === s.classTypeId));
}

export function roomBookingOf(data: ProData, bookingId: string): ProRoomBooking {
  return extrasOf(data).roomBookings[bookingId] ?? {};
}

export function patchRoomBooking(d: ProData, bookingId: string, changes: Partial<ProRoomBooking>): ProData {
  return withExtras(d, (x) => ({
    ...x,
    roomBookings: { ...x.roomBookings, [bookingId]: { ...x.roomBookings[bookingId], ...changes } },
  }));
}

/**
 * Cambia el número de jugadores de una reserva de sala y recalcula el precio
 * con la tabla de la sala. Es lo que pasa en recepción cuando vienen cinco en
 * vez de seis.
 */
export function setPlayers(d: ProData, sessionId: string, bookingId: string, players: number, now: Date): ProData {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return d;
  const extra = typeExtra(d, s.classTypeId);
  const next = withRoster(d, sessionId, now, (list) =>
    list.map((b) =>
      b.id === bookingId
        ? { ...b, partySize: players, priceCents: priceForPlayers(extra.playerPrices, players, Boolean(b.student)) }
        : b,
    ),
  );
  return patchRoomBooking(next, bookingId, { players });
}

/* ------------------------------------------------------------------ */
/* Montaje entre partidas y choques de sala                            */
/* ------------------------------------------------------------------ */

export function setupMinutes(data: ProData, s: Pick<ProClassSession, "classTypeId">): number {
  return typeExtra(data, s.classTypeId).setupMin ?? 0;
}

/** Hasta cuándo está ocupada la sala: fin de la sesión más el montaje. */
export function busyUntil(data: ProData, s: ProClassSession): string {
  const setup = setupMinutes(data, s);
  return new Date(new Date(s.end).getTime() + setup * 60000).toISOString();
}

/**
 * Sesiones que chocan con una nueva en la misma sala, contando el montaje de
 * la anterior y el de la nueva. Devuelve la lista para poder explicar el choque.
 */
export function roomConflicts(
  data: ProData,
  input: { room: string; start: string; end: string; classTypeId?: string; excludeId?: string },
): ProClassSession[] {
  const room = input.room.trim().toLowerCase();
  if (!room) return [];
  const setupNew = input.classTypeId ? typeExtra(data, input.classTypeId).setupMin ?? 0 : 0;
  const from = new Date(input.start).getTime();
  const to = new Date(input.end).getTime() + setupNew * 60000;
  return data.sessions.filter((s) => {
    if (s.id === input.excludeId || s.status === "cancelled") return false;
    if (s.room.trim().toLowerCase() !== room) return false;
    const a = new Date(s.start).getTime();
    const b = new Date(busyUntil(data, s)).getTime();
    return a < to && from < b;
  });
}

/** "Sala 1 lista a las 19:30": cuándo queda libre y montada cada sala hoy. */
export function roomsReady(data: ProData, now: Date): { room: string; readyAt: string; busy: boolean }[] {
  const today = localDate(now);
  const byRoom = new Map<string, ProClassSession[]>();
  for (const s of data.sessions) {
    if (s.status === "cancelled" || localDate(s.start) !== today || !sessionIsRoom(data, s)) continue;
    byRoom.set(s.room, [...(byRoom.get(s.room) ?? []), s]);
  }
  const t = now.getTime();
  return [...byRoom.entries()]
    .map(([room, list]) => {
      const current = list.find((s) => new Date(s.start).getTime() <= t && new Date(busyUntil(data, s)).getTime() > t);
      return { room, readyAt: current ? busyUntil(data, current) : now.toISOString(), busy: Boolean(current) };
    })
    .sort((a, b) => a.room.localeCompare(b.room, "es"));
}

/* ------------------------------------------------------------------ */
/* Llegada, cortesía y normas de reserva                               */
/* ------------------------------------------------------------------ */

export type ArrivalWindow =
  | { phase: "before"; minutes: number }
  | { phase: "courtesy"; minutesLeft: number }
  | { phase: "lost"; minutesLate: number }
  | { phase: "over" };

/** En qué punto está la llegada de un grupo respecto a su hora y a la cortesía. */
export function arrivalWindow(s: ProClassSession, now: Date, courtesyMin: number): ArrivalWindow {
  const start = new Date(s.start).getTime();
  const t = now.getTime();
  if (t >= new Date(s.end).getTime()) return { phase: "over" };
  if (t < start) return { phase: "before", minutes: Math.ceil((start - t) / 60000) };
  const late = Math.floor((t - start) / 60000);
  if (late < courtesyMin) return { phase: "courtesy", minutesLeft: courtesyMin - late };
  return { phase: "lost", minutesLate: late };
}

export type CancelVerdict = { free: boolean; title: string; detail: string };

/** Lo que toca según la norma del negocio cuando alguien cancela o cambia. */
export function cancelVerdict(policy: ProBookingPolicy, startIso: string, now: Date): CancelVerdict {
  const hours = (new Date(startIso).getTime() - now.getTime()) / 3600000;
  if (hours >= policy.freeChangeHours) {
    return {
      free: true,
      title: "Dentro de plazo",
      detail: `Faltan más de ${policy.freeChangeHours} h: cambio o cancelación sin coste.`,
    };
  }
  if (policy.lateNoticeVoucher && hours > 0) {
    return {
      free: false,
      title: "Aviso tardío",
      detail: `Faltan menos de ${policy.freeChangeHours} h. Según tu norma se le da un bono para otra fecha.`,
    };
  }
  return {
    free: false,
    title: hours > 0 ? "Fuera de plazo" : "No presentado",
    detail: "Según tu norma no hay devolución. Tú decides si haces una excepción.",
  };
}

export function policyLines(policy: ProBookingPolicy): string[] {
  return [
    `Cambios y cancelaciones sin coste hasta ${policy.freeChangeHours} h antes.`,
    policy.lateNoticeVoucher
      ? "Si avisas más tarde, te damos un bono para otra fecha."
      : "Si avisas más tarde, no hay devolución.",
    `Llega 10 minutos antes. Tenemos ${policy.courtesyMin} minutos de cortesía.`,
  ];
}

/* ------------------------------------------------------------------ */
/* Recordatorios de mañana y reseñas al salir (ocio)                   */
/* ------------------------------------------------------------------ */

export type RoomGroup = {
  session: ProClassSession;
  booking: ProBooking;
  info: ProRoomBooking;
  typeName: string;
};

function roomGroupsOn(data: ProData, date: string, now: Date): RoomGroup[] {
  return data.sessions
    .filter((s) => s.status !== "cancelled" && localDate(s.start) === date && s.booked > 0 && sessionIsRoom(data, s))
    .sort((a, b) => a.start.localeCompare(b.start))
    .flatMap((s) => {
      const ct = data.classTypes.find((c) => c.id === s.classTypeId);
      return sessionRoster(data, s, now).booked.map((b) => ({
        session: s,
        booking: b,
        info: roomBookingOf(data, b.id),
        typeName: ct?.name ?? "Sala",
      }));
    });
}

/** Grupos de mañana, para mandar el recordatorio por WhatsApp. */
export function tomorrowGroups(data: ProData, now: Date): RoomGroup[] {
  return roomGroupsOn(data, addDays(localDate(now), 1), now);
}

/** Grupos que acaban de salir (hasta 3 horas) y a los que aún no se ha pedido reseña. */
export function reviewCandidates(data: ProData, now: Date): RoomGroup[] {
  const t = now.getTime();
  return roomGroupsOn(data, localDate(now), now).filter(({ session, booking, info }) => {
    const end = new Date(session.end).getTime();
    return end <= t && t - end <= 3 * 3600000 && booking.status === "arrived" && !info.reviewAskedAt;
  });
}

export function reminderMessage(g: RoomGroup, place: string, address: string, courtesyMin: number): string {
  const who = firstName(g.booking.clientName);
  const hour = minutesToLabel(localMinutes(g.session.start));
  const players = g.info.players ?? g.booking.partySize;
  const english = g.info.language === "en";
  if (english) {
    return `Hi ${who}! See you tomorrow at ${hour} at ${place} (${address}) for ${g.typeName}, ${players} players. Please arrive 10 minutes early. Any change, just reply here.`;
  }
  return `¡Hola ${who}! Os esperamos mañana a las ${hour} en ${place} (${address}) para ${g.typeName}, ${players} jugadores. Llegad 10 minutos antes, tenemos ${courtesyMin} de cortesía. Cualquier cambio, contéstame aquí.`;
}

export function reviewMessage(g: RoomGroup, place: string, url: string | undefined): string {
  const who = firstName(g.booking.clientName);
  const link = url ? ` ${url}` : "";
  if (g.info.language === "en") {
    return `Thanks for coming to ${place}, ${who}! If you enjoyed ${g.typeName}, a quick review helps us a lot:${link}`;
  }
  return `¡Gracias por venir, ${who}! Si os ha gustado ${g.typeName}, una reseña nos ayuda muchísimo:${link}`;
}

export function lateMessage(g: Pick<RoomGroup, "booking" | "typeName" | "info">, place: string, minutesLeft: number): string {
  const who = firstName(g.booking.clientName);
  if (g.info.language === "en") {
    return `Hi ${who}, this is ${place}. Your ${g.typeName} game has started. You still have ${minutesLeft} minutes to arrive. Are you on your way?`;
  }
  return `Hola ${who}, te escribimos de ${place}. Vuestra partida de ${g.typeName} ya ha empezado y os quedan ${minutesLeft} minutos de cortesía. ¿Estáis de camino?`;
}

/* ------------------------------------------------------------------ */
/* Lista de espera que se mueve sola                                   */
/* ------------------------------------------------------------------ */

/**
 * Ofrece la plaza libre a la primera persona de la lista de espera. Su reserva
 * guarda la plaza mientras decide, con un plazo (por defecto 2 horas, nunca
 * más tarde de 30 minutos antes de empezar).
 */
export function offerFreedSpot(d: ProData, sessionId: string, now: Date, offerId: string): ProData {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s || freeSpots(s) < 1) return d;
  const { waitlist } = sessionRoster(d, s, now);
  const first = waitlist[0];
  if (!first) return d;
  const x = extrasOf(d);
  const hold = now.getTime() + x.waitHoldHours * 3600000;
  const cap = new Date(s.start).getTime() - 30 * 60000;
  const expiresAt = new Date(Math.max(now.getTime() + 10 * 60000, Math.min(hold, cap))).toISOString();
  const next = withRoster(d, sessionId, now, (list) =>
    list.map((b) => (b.id === first.id ? { ...b, status: "requested" as const, waitlisted: false } : b)),
  );
  const offer: ProWaitOffer = {
    id: offerId,
    sessionId,
    bookingId: first.id,
    clientName: first.clientName,
    offeredAt: now.toISOString(),
    expiresAt,
    status: "pending",
  };
  return withExtras(next, (e) => ({ ...e, waitOffers: [...e.waitOffers, offer] }));
}

/** La persona confirma su plaza (desde Franky o diciéndoselo al equipo). */
export function acceptWaitOffer(d: ProData, offerId: string, now: Date): ProData {
  const offer = extrasOf(d).waitOffers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") return d;
  const next = withRoster(d, offer.sessionId, now, (list) =>
    list.map((b) => (b.id === offer.bookingId ? { ...b, status: "confirmed" as const } : b)),
  );
  return withExtras(next, (x) => ({
    ...x,
    waitOffers: x.waitOffers.map((o) => (o.id === offerId ? { ...o, status: "accepted" as const } : o)),
  }));
}

/**
 * Caduca las ofertas vencidas: esa persona pierde la plaza y la siguiente de
 * la lista la recibe. `makeId` da los identificadores de las ofertas nuevas.
 */
export function expireWaitOffers(d: ProData, now: Date, makeId: (i: number) => string): ProData {
  const due = extrasOf(d).waitOffers.filter(
    (o) => o.status === "pending" && new Date(o.expiresAt).getTime() <= now.getTime(),
  );
  let next = d;
  due.forEach((offer, i) => {
    next = withRoster(next, offer.sessionId, now, (list) =>
      list.map((b) => (b.id === offer.bookingId ? { ...b, status: "cancelled" as const } : b)),
    );
    next = withExtras(next, (x) => ({
      ...x,
      waitOffers: x.waitOffers.map((o) => (o.id === offer.id ? { ...o, status: "expired" as const } : o)),
    }));
    const s = next.sessions.find((x) => x.id === offer.sessionId);
    if (s && new Date(s.start).getTime() > now.getTime()) next = offerFreedSpot(next, offer.sessionId, now, makeId(i));
  });
  return next;
}

export function hasExpiredOffers(data: ProData, now: Date): boolean {
  return extrasOf(data).waitOffers.some((o) => o.status === "pending" && new Date(o.expiresAt).getTime() <= now.getTime());
}

/** Rastro de la lista de espera de una sesión, del más reciente al más antiguo. */
export function waitTrace(data: ProData, sessionId: string): ProWaitOffer[] {
  return extrasOf(data)
    .waitOffers.filter((o) => o.sessionId === sessionId)
    .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt));
}

export function pendingOfferFor(data: ProData, bookingId: string): ProWaitOffer | undefined {
  return extrasOf(data).waitOffers.find((o) => o.bookingId === bookingId && o.status === "pending");
}

/**
 * Quita a alguien de la lista de una sesión y, si deja plaza, la ofrece sola a
 * la primera persona en espera.
 */
export function removeAndOffer(d: ProData, sessionId: string, bookingId: string, now: Date, offerId: string): ProData {
  const removed = withRoster(d, sessionId, now, (list) => list.filter((b) => b.id !== bookingId));
  return offerFreedSpot(removed, sessionId, now, offerId);
}

export { isWaitlist };

/* ------------------------------------------------------------------ */
/* Pizarra del día                                                     */
/* ------------------------------------------------------------------ */

export const BOARD_TEMPLATE: { title: string; body: string }[] = [
  { title: "Calentamiento", body: "" },
  { title: "Fuerza o técnica", body: "" },
  { title: "WOD", body: "" },
];

export function boardOf(data: ProData, sessionId: string): ProBoardBlock[] {
  return sessionExtra(data, sessionId).board ?? [];
}

/**
 * Guarda la pizarra de una sesión. Con `sameDayType` se copia a todas las
 * sesiones del mismo tipo ese día (el WOD suele ser el mismo en todas).
 */
export function saveBoard(d: ProData, sessionId: string, board: ProBoardBlock[], sameDayType: boolean): ProData {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return d;
  const clean = board.filter((b) => b.title.trim() || b.body.trim());
  const targets = sameDayType
    ? d.sessions.filter((x) => x.classTypeId === s.classTypeId && localDate(x.start) === localDate(s.start)).map((x) => x.id)
    : [sessionId];
  return targets.reduce((acc, id) => patchSessionExtra(acc, id, { board: clean }), d);
}

/* ------------------------------------------------------------------ */
/* Sustituciones y horas del equipo                                    */
/* ------------------------------------------------------------------ */

/** Cambia quién da una sesión y deja constancia de quién la daba. */
export function substituteCoach(d: ProData, sessionId: string, coachId: string): ProData {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s || s.coachId === coachId) return d;
  const original = sessionExtra(d, sessionId).originalCoachId ?? s.coachId;
  const next: ProData = {
    ...d,
    sessions: d.sessions.map((x) => (x.id === sessionId ? { ...x, coachId } : x)),
    bookings: d.bookings.map((b) => (b.sessionId === sessionId ? { ...b, staffId: coachId } : b)),
  };
  return patchSessionExtra(next, sessionId, { originalCoachId: original === coachId ? undefined : original });
}

export type CoachHours = {
  staffId: string;
  name: string;
  sessions: number;
  minutes: number;
  /** Sesiones que dio sustituyendo a otra persona. */
  covered: number;
  /** Sesiones suyas que dio otra persona. */
  coveredByOthers: number;
};

/** Horas impartidas por persona entre dos fechas (incluidas), para la nómina. */
export function coachHours(data: ProData, from: string, to: string): CoachHours[] {
  const rows = new Map<string, CoachHours>();
  const row = (id: string) => {
    const hit = rows.get(id);
    if (hit) return hit;
    const staff = data.staff.find((s) => s.id === id);
    const fresh: CoachHours = { staffId: id, name: staff?.name ?? "Sin asignar", sessions: 0, minutes: 0, covered: 0, coveredByOthers: 0 };
    rows.set(id, fresh);
    return fresh;
  };
  for (const s of data.sessions) {
    const day = localDate(s.start);
    if (s.status === "cancelled" || day < from || day > to || !s.coachId) continue;
    const r = row(s.coachId);
    r.sessions += 1;
    r.minutes += Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000);
    const original = sessionExtra(data, s.id).originalCoachId;
    if (original && original !== s.coachId) {
      r.covered += 1;
      row(original).coveredByOthers += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.minutes - a.minutes);
}

/* ------------------------------------------------------------------ */
/* Ocupación por franja                                                */
/* ------------------------------------------------------------------ */

export type HeatCell = { day: number; hour: number; booked: number; capacity: number; sessions: number; pct: number };

/**
 * Ocupación media por día de la semana y hora de inicio. Para las salas de
 * ocio cuenta partidas reservadas frente a partidas posibles; para las clases,
 * plazas frente a aforo.
 */
export function occupancyGrid(data: ProData, from: string, to: string): { cells: HeatCell[]; hours: number[]; worst: HeatCell[] } {
  const map = new Map<string, HeatCell>();
  for (const s of data.sessions) {
    const day = localDate(s.start);
    if (s.status === "cancelled" || day < from || day > to) continue;
    const key = `${weekdayIndex(day)}-${Math.floor(localMinutes(s.start) / 60)}`;
    const cell = map.get(key) ?? { day: weekdayIndex(day), hour: Math.floor(localMinutes(s.start) / 60), booked: 0, capacity: 0, sessions: 0, pct: 0 };
    const room = sessionIsRoom(data, s);
    cell.booked += room ? (s.booked > 0 ? 1 : 0) : s.booked;
    cell.capacity += room ? 1 : s.capacity;
    cell.sessions += 1;
    map.set(key, cell);
  }
  const cells = [...map.values()].map((c) => ({ ...c, pct: c.capacity ? Math.round((c.booked / c.capacity) * 100) : 0 }));
  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const worst = [...cells].filter((c) => c.sessions >= 1).sort((a, b) => a.pct - b.pct || a.day - b.day).slice(0, 3);
  return { cells, hours, worst };
}

/** Sesiones por delante que van por debajo del 50 % (o salas sin reservar). */
export function weakSessions(data: ProData, now: Date, days = 7): ProClassSession[] {
  const t = now.getTime();
  const limit = addDays(localDate(now), days);
  return data.sessions
    .filter((s) => s.status !== "cancelled" && new Date(s.start).getTime() > t && localDate(s.start) <= limit)
    .filter((s) => (sessionIsRoom(data, s) ? s.booked === 0 : s.booked / Math.max(1, s.capacity) < 0.5))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function isWeak(data: ProData, s: ProClassSession, now: Date): boolean {
  if (new Date(s.start).getTime() <= now.getTime()) return false;
  return sessionIsRoom(data, s) ? s.booked === 0 : s.booked / Math.max(1, s.capacity) < 0.5;
}

/* ------------------------------------------------------------------ */
/* Exámenes e intensivos (academias)                                   */
/* ------------------------------------------------------------------ */

export type ExamAhead = {
  classType: ProClassType;
  examOn: string;
  daysLeft: number;
  /** Plazas reservadas de media en las clases de las próximas dos semanas. */
  avgBooked: number;
  capacity: number;
  hasIntensive: boolean;
};

export function examsAhead(data: ProData, now: Date, days = 75): ExamAhead[] {
  const today = localDate(now);
  const limit = addDays(today, days);
  const twoWeeks = addDays(today, 14);
  return data.classTypes
    .map((ct) => ({ ct, examOn: typeExtra(data, ct.id).examOn }))
    .filter((x): x is { ct: ProClassType; examOn: string } => Boolean(x.examOn && x.examOn >= today && x.examOn <= limit))
    .map(({ ct, examOn }) => {
      const next = data.sessions.filter(
        (s) => s.classTypeId === ct.id && s.status !== "cancelled" && localDate(s.start) >= today && localDate(s.start) <= twoWeeks,
      );
      const avg = next.length ? Math.round(next.reduce((a, s) => a + s.booked, 0) / next.length) : 0;
      const daysLeft = Math.round((new Date(`${examOn}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
      const hasIntensive = data.offers.some((o) => o.kind === "exam" && o.title.includes(ct.name));
      return { classType: ct, examOn, daysLeft, avgBooked: avg, capacity: ct.capacity, hasIntensive };
    })
    .sort((a, b) => a.examOn.localeCompare(b.examOn));
}

export type IntensiveInput = {
  classType: ProClassType;
  examOn: string;
  /** Días de la semana (0 = lunes) en que hay clase. */
  days: number[];
  minute: number;
  durationMin: number;
  weeks: number;
  priceCents: number;
  studentPriceCents?: number;
  capacity: number;
  room: string;
  coachId: string;
};

/** Días de clase del intensivo: las `weeks` semanas antes del examen, sin pasarse del día anterior. */
export function intensiveDates(input: Pick<IntensiveInput, "examOn" | "days" | "weeks">, today: string): string[] {
  const last = addDays(input.examOn, -1);
  const first = addDays(input.examOn, -input.weeks * 7);
  const dates: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (d > today && input.days.includes(weekdayIndex(d))) dates.push(d);
  }
  return dates;
}

/**
 * Crea el intensivo entero de una vez: las sesiones en serie, el bono con su
 * precio y la oferta de examen que Franky enseña a quien tiene esa asignatura.
 */
export function applyIntensive(
  d: ProData,
  input: IntensiveInput,
  now: Date,
  ids: { type: string; plan: string; offer: string; series: string; session: (i: number) => string },
): { data: ProData; sessions: number; hours: number } {
  const today = localDate(now);
  const dates = intensiveDates(input, today);
  const ct: ProClassType = {
    ...input.classType,
    id: ids.type,
    name: `Intensivo ${input.classType.name}`,
    durationMin: input.durationMin,
    capacity: input.capacity,
    coachId: input.coachId,
  };
  const sessions: ProClassSession[] = dates.map((date, i) => ({
    id: ids.session(i),
    classTypeId: ct.id,
    start: atLocal(date, input.minute),
    end: atLocal(date, input.minute + input.durationMin),
    capacity: input.capacity,
    booked: 0,
    waitlist: 0,
    checkedIn: 0,
    room: input.room,
    coachId: input.coachId,
    seriesId: ids.series,
  }));
  const hours = Math.round((dates.length * input.durationMin) / 60);
  const plan: ProMembershipPlan = {
    id: ids.plan,
    name: `Intensivo ${input.classType.name} (${hours} h)`,
    priceCents: input.priceCents,
    studentPriceCents: input.studentPriceCents,
    period: "pack",
    sessions: dates.length,
    members: 0,
  };
  const examLabel = new Date(`${input.examOn}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
  const offer: ProOffer = {
    id: ids.offer,
    kind: "exam",
    title: `Intensivo de ${input.classType.name}`,
    detail: `${hours} horas antes del examen del ${examLabel}. Para ${input.classType.category}.`,
    discountPct: 0,
    startsAt: sessions[0]?.start,
    endsAt: sessions.at(-1)?.end,
    slots: input.capacity,
    claimed: 0,
    audience: { studentsOnly: true, radiusKm: 5, universities: [] },
    status: "scheduled",
    reach: 0,
    views: 0,
    bookings: 0,
    revenueCents: 0,
    createdAt: now.toISOString(),
  };
  let next: ProData = {
    ...d,
    classTypes: [...d.classTypes, ct],
    sessions: [...d.sessions, ...sessions],
    plans: [...d.plans, plan],
    offers: [offer, ...d.offers],
  };
  next = withExtras(next, (x) => ({ ...x, types: { ...x.types, [ct.id]: { examOn: input.examOn } } }));
  return { data: next, sessions: sessions.length, hours };
}

/* ------------------------------------------------------------------ */
/* Mensajes al grupo                                                   */
/* ------------------------------------------------------------------ */

export type GroupMessageKind = "cancelled" | "moved" | "exam" | "reminder" | "passed";

export const GROUP_MESSAGE_LABEL: Record<GroupMessageKind, string> = {
  reminder: "Recordatorio",
  moved: "Cambio de hora",
  cancelled: "Clase cancelada",
  exam: "Examen cerca",
  passed: "Enhorabuena",
};

export function groupMessage(
  kind: GroupMessageKind,
  ctx: { name: string; className: string; day: string; hour: string; sender: string; place: string; newHour?: string; examDay?: string },
): string {
  const hello = `Hola ${ctx.name}, soy ${ctx.sender} de ${ctx.place}.`;
  switch (kind) {
    case "cancelled":
      return `${hello} Te aviso de que la clase de ${ctx.className} del ${ctx.day} a las ${ctx.hour} no se da. Si tienes bono, no se te descuenta. Perdona las molestias.`;
    case "moved":
      return `${hello} La clase de ${ctx.className} del ${ctx.day} cambia de hora: pasa de las ${ctx.hour} a las ${ctx.newHour ?? ctx.hour}. ¿Te va bien?`;
    case "exam":
      return `${hello} Queda poco para el examen${ctx.examDay ? ` del ${ctx.examDay}` : ""}. Esta semana repasamos lo que más cuesta en ${ctx.className}. ¡A por ello!`;
    case "passed":
      return `${hello} ¡Enhorabuena por el aprobado! Si nos dejas una reseña en Franky nos ayudas muchísimo.`;
    default:
      return `${hello} Te recuerdo la clase de ${ctx.className} del ${ctx.day} a las ${ctx.hour}. ¡Nos vemos!`;
  }
}

/* ------------------------------------------------------------------ */
/* Salas enlazadas (grupo grande en varias salas)                      */
/* ------------------------------------------------------------------ */

/** Otras salas libres a la misma hora, donde puede entrar el resto del grupo. */
export function siblingRooms(data: ProData, s: ProClassSession): ProClassSession[] {
  return data.sessions.filter(
    (x) => x.id !== s.id && x.start === s.start && x.status !== "cancelled" && x.booked === 0 && sessionIsRoom(data, x),
  );
}

export function linkedSessions(data: ProData, sessionId: string): ProClassSession[] {
  const link = sessionExtra(data, sessionId).linkId;
  if (!link) return [];
  return data.sessions.filter((s) => s.id !== sessionId && sessionExtra(data, s.id).linkId === link);
}

/**
 * Reparte un grupo grande en dos salas a la misma hora: una reserva por sala
 * con la misma persona de contacto y las sesiones enlazadas.
 */
export function bookLinkedRooms(
  d: ProData,
  input: {
    sessions: ProClassSession[];
    clientName: string;
    people: number;
    student: boolean;
    phone?: string;
    linkId: string;
    bookingId: (i: number) => string;
  },
  now: Date,
): ProData {
  const count = input.sessions.length;
  if (!count) return d;
  const base = Math.floor(input.people / count);
  let rest = input.people - base * count;
  let next = d;
  input.sessions.forEach((s, i) => {
    const players = base + (rest > 0 ? 1 : 0);
    rest = Math.max(0, rest - 1);
    const price = priceForPlayers(typeExtra(d, s.classTypeId).playerPrices, players, input.student);
    const booking: ProBooking = {
      id: input.bookingId(i),
      kind: "class",
      clientName: input.clientName,
      sessionId: s.id,
      staffId: s.coachId,
      start: s.start,
      end: s.end,
      partySize: players,
      status: "confirmed",
      priceCents: price,
      paidCents: 0,
      source: "grupo",
      student: input.student,
    };
    next = withRoster(next, s.id, now, (list) => [...list, booking]);
    next = patchSessionExtra(next, s.id, { linkId: input.linkId });
    next = patchRoomBooking(next, booking.id, { players, phone: input.phone });
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* Idiomas y game masters                                              */
/* ------------------------------------------------------------------ */

/**
 * Quién puede llevar una sesión: habla el idioma, conoce la sala y no tiene
 * otra sesión a la misma hora. Los que no cumplen algo salen después con el motivo.
 */
export function staffFor(
  data: ProData,
  input: { room: string; language: "es" | "en"; start: string; end: string; excludeId?: string },
): { staffId: string; name: string; ok: boolean; why?: string }[] {
  const skills = extrasOf(data).staff;
  const from = new Date(input.start).getTime();
  const to = new Date(input.end).getTime();
  return data.staff
    .filter((s) => s.role !== "reception")
    .map((s) => {
      const k = skills[s.id];
      const busy = data.sessions.some(
        (x) => x.id !== input.excludeId && x.coachId === s.id && x.status !== "cancelled" && new Date(x.start).getTime() < to && from < new Date(x.end).getTime(),
      );
      const speaks = input.language === "es" || Boolean(k?.languages.includes(input.language));
      const knows = !k || !k.rooms.length || k.rooms.some((r) => r.toLowerCase() === input.room.trim().toLowerCase());
      const why = busy ? "Tiene otra sesión a esa hora" : !speaks ? "No lleva sesiones en inglés" : !knows ? "No conoce esta sala" : undefined;
      return { staffId: s.id, name: s.name, ok: !why, why };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok));
}

export function weekRange(date: string): { from: string; to: string } {
  const from = weekStart(date);
  return { from, to: addDays(from, 6) };
}

/** CSV de horas impartidas por persona, con separador español. */
export function coachHoursCsv(rows: CoachHours[], from: string, to: string, cell: (v: string) => string): string {
  const head = ["Persona", "Desde", "Hasta", "Sesiones", "Horas", "Sustituciones hechas", "Sustituida en"];
  const body = rows.map((r) => [
    r.name,
    from,
    to,
    String(r.sessions),
    (r.minutes / 60).toFixed(2).replace(".", ","),
    String(r.covered),
    String(r.coveredByOthers),
  ]);
  return [head, ...body].map((r) => r.map(cell).join(";")).join("\n");
}
