import type {
  ProBooking,
  ProData,
  ProMember,
  ProMembershipPlan,
  ProPayment,
} from "./types";
import type { ProLocker, ProSeat } from "./courts-types";
import { addDays, atLocal, localDate, localMinutes } from "./format";
import { addMonths } from "./classes";
import { SLOT_MINUTES, hoursFor, isShared, resourceBookings } from "./courts";
import { courtsOps, patchCourts } from "./courts-base";
import { addNoShow, resourceOf } from "./courts-ops";

/**
 * Salas de estudio y coworking: turnos de un toque, puestos numerados,
 * entradas y salidas en recepción, bonos que se descuentan solos, puestos no
 * presentados, renovaciones, horas estudiadas, taquillas, previsión de
 * llenos y caja del día.
 */

/* ------------------------------------------------------------------ */
/* Turnos de un toque                                                  */
/* ------------------------------------------------------------------ */

export type ShiftPreset = {
  id: "morning" | "afternoon" | "night" | "day";
  label: string;
  from: number;
  to: number;
};

/**
 * Mañana, tarde, noche y día completo con las horas del día ya puestas.
 * Si es hoy, empiezan en la próxima media hora (no se vende lo que ya pasó).
 */
export function shiftPresets(
  data: ProData,
  date: string,
  nowMinute?: number,
): ShiftPreset[] {
  const hours = hoursFor(data, date);
  if (!hours) return [];
  const floor =
    nowMinute === undefined
      ? hours.open
      : Math.max(hours.open, Math.ceil(nowMinute / SLOT_MINUTES) * SLOT_MINUTES);
  const raw: ShiftPreset[] = [
    { id: "morning", label: "Mañana", from: hours.open, to: 14 * 60 },
    { id: "afternoon", label: "Tarde", from: 15 * 60, to: 21 * 60 },
    { id: "night", label: "Noche", from: 21 * 60, to: hours.close },
    { id: "day", label: "Día completo", from: hours.open, to: hours.close },
  ];
  return raw
    .map((s) => ({
      ...s,
      from: Math.max(s.from, floor),
      to: Math.min(s.to, hours.close),
    }))
    .filter((s) => s.to - s.from >= 60);
}

/* ------------------------------------------------------------------ */
/* Puestos numerados                                                   */
/* ------------------------------------------------------------------ */

export function seatsOf(data: ProData, resourceId: string): ProSeat[] {
  return (data.courts?.seats ?? []).filter((s) => s.resourceId === resourceId);
}

export type SeatState = {
  seat: ProSeat;
  state: "free" | "occupied" | "reserved" | "fixed";
  booking?: ProBooking;
};

/** Reservas de una zona que están en curso en ese minuto. */
function liveBookings(
  data: ProData,
  resourceId: string,
  date: string,
  minute: number,
): ProBooking[] {
  const dayStart = Date.parse(atLocal(date, 0));
  return resourceBookings(data, date, resourceId).filter((b) => {
    if (b.status === "cancelled" || b.status === "no_show" || b.status === "done")
      return false;
    const from = (Date.parse(b.start) - dayStart) / 60000;
    const to = (Date.parse(b.end) - dayStart) / 60000;
    return from <= minute && to > minute;
  });
}

/**
 * Plano de una zona en un momento: quién está sentado en cada puesto, qué
 * puestos están reservados sin llegar y cuáles son fijos de un socio.
 */
export function seatStates(
  data: ProData,
  resourceId: string,
  date: string,
  minute: number,
): SeatState[] {
  const seatByBooking = data.courts?.seatByBooking ?? {};
  const live = liveBookings(data, resourceId, date, minute);
  const bySeat = new Map<string, ProBooking>();
  for (const b of live) {
    const seatId = seatByBooking[b.id];
    if (seatId) bySeat.set(seatId, b);
  }
  return seatsOf(data, resourceId).map((seat) => {
    const booking = bySeat.get(seat.id);
    if (booking)
      return {
        seat,
        booking,
        state: booking.status === "arrived" ? "occupied" : "reserved",
      };
    if (seat.fixedMemberId) return { seat, state: "fixed" };
    return { seat, state: "free" };
  });
}

/** Puesto para quien llega: su puesto fijo o el primero libre. */
export function pickSeat(
  data: ProData,
  booking: ProBooking,
  date: string,
  minute: number,
): ProSeat | undefined {
  if (!booking.resourceId) return undefined;
  const states = seatStates(data, booking.resourceId, date, minute);
  const own = states.find(
    (s) => s.seat.fixedMemberId && s.seat.fixedMemberId === booking.clientId,
  );
  if (own && (!own.booking || own.booking.id === booking.id)) return own.seat;
  return states.find((s) => s.state === "free")?.seat;
}

export function assignFixedSeat(
  data: ProData,
  seatId: string,
  member: { id: string; name: string } | null,
): ProData {
  return patchCourts(data, (ops) => ({
    seats: ops.seats.map((s) =>
      s.id === seatId
        ? {
            ...s,
            fixedMemberId: member?.id,
            fixedName: member?.name,
          }
        : s.fixedMemberId && member && s.fixedMemberId === member.id
          ? { ...s, fixedMemberId: undefined, fixedName: undefined }
          : s,
    ),
  }));
}

export function setSeatGroup(
  data: ProData,
  seatIds: string[],
  group: string | undefined,
): ProData {
  const set = new Set(seatIds);
  return patchCourts(data, (ops) => ({
    seats: ops.seats.map((s) => (set.has(s.id) ? { ...s, group } : s)),
  }));
}

/* ------------------------------------------------------------------ */
/* Entrada y salida                                                    */
/* ------------------------------------------------------------------ */

export function memberOf(
  data: ProData,
  personId?: string,
): { member: ProMember; plan?: ProMembershipPlan } | null {
  const member = data.members.find((m) => m.id === personId);
  if (!member) return null;
  return { member, plan: data.plans.find((p) => p.id === member.planId) };
}

export type CheckInResult = {
  data: ProData;
  seat?: ProSeat;
  /** Usos que le quedan en el bono tras descontar este, si tiene. */
  bonoLeft?: number;
};

/**
 * Marca la llegada: guarda la hora real, le da su puesto y, si es socio con
 * bono de días, descuenta un uso.
 */
export function checkIn(
  data: ProData,
  bookingId: string,
  now: Date,
): CheckInResult {
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking || booking.status === "arrived") return { data };
  const date = localDate(now);
  const minute = localMinutes(now);
  const resource = resourceOf(data, booking.resourceId);
  const seat =
    resource && isShared(resource)
      ? pickSeat(data, booking, date, minute)
      : undefined;
  const found = memberOf(data, booking.clientId);
  const usesBono =
    found?.member.sessionsLeft !== null &&
    found?.member.sessionsLeft !== undefined &&
    found.plan?.period === "pack";
  const bonoLeft = usesBono
    ? Math.max(0, (found!.member.sessionsLeft ?? 0) - 1)
    : undefined;
  let next: ProData = {
    ...data,
    bookings: data.bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "arrived" } : b,
    ),
    members: usesBono
      ? data.members.map((m) =>
          m.id === found!.member.id ? { ...m, sessionsLeft: bonoLeft! } : m,
        )
      : data.members,
  };
  next = patchCourts(next, (ops) => ({
    checkins: {
      ...ops.checkins,
      [bookingId]: { ...ops.checkins[bookingId], inAt: now.toISOString() },
    },
    seatByBooking: seat
      ? { ...ops.seatByBooking, [bookingId]: seat.id }
      : ops.seatByBooking,
  }));
  return { data: next, seat, bonoLeft };
}

/**
 * Marca la salida: la reserva se cierra a esa hora y el puesto vuelve a
 * contar como libre para el aforo.
 */
export function checkOut(data: ProData, bookingId: string, now: Date): ProData {
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) return data;
  const at = now.toISOString();
  const ends = Date.parse(booking.end) > now.getTime() ? at : booking.end;
  const next: ProData = {
    ...data,
    bookings: data.bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "done", end: ends } : b,
    ),
  };
  return patchCourts(next, (ops) => ({
    checkins: {
      ...ops.checkins,
      [bookingId]: { ...ops.checkins[bookingId], outAt: at },
    },
  }));
}

/** Alguien entra sin reserva: se crea y se marca la llegada a la vez. */
export function walkIn(
  data: ProData,
  input: {
    id: string;
    resourceId: string;
    name: string;
    personId?: string;
    student: boolean;
    now: Date;
    minutes: number;
    priceCents: number;
  },
): CheckInResult {
  const date = localDate(input.now);
  const hours = hoursFor(data, date);
  const start = input.now.toISOString();
  const end = hours
    ? atLocal(
        date,
        Math.min(hours.close, localMinutes(input.now) + input.minutes),
      )
    : new Date(input.now.getTime() + input.minutes * 60000).toISOString();
  const booking: ProBooking = {
    id: input.id,
    kind: "court",
    clientId: input.personId,
    clientName: input.name,
    resourceId: input.resourceId,
    start,
    end,
    partySize: 1,
    status: "confirmed",
    priceCents: input.priceCents,
    paidCents: 0,
    source: "walkin",
    student: input.student,
    note: input.priceCents === 0 ? "Con bono" : undefined,
  };
  return checkIn(
    { ...data, bookings: [...data.bookings, booking] },
    input.id,
    input.now,
  );
}

/* ------------------------------------------------------------------ */
/* Puestos no presentados                                              */
/* ------------------------------------------------------------------ */

/**
 * Reservas de puesto que pasaron el margen del club sin llegar y siguen
 * ocupando aforo. Liberarlas deja el sitio para otro.
 */
export function lateArrivals(data: ProData, now: Date): ProBooking[] {
  const margin = courtsOps(data).policy.releaseAfterMinutes * 60000;
  const date = localDate(now);
  return resourceBookings(data, date)
    .filter((b) => {
      const r = resourceOf(data, b.resourceId);
      return (
        r &&
        isShared(r) &&
        b.status === "confirmed" &&
        Date.parse(b.start) + margin <= now.getTime() &&
        Date.parse(b.end) > now.getTime()
      );
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function releaseNoShows(data: ProData, bookingIds: string[]): ProData {
  let next = data;
  for (const id of bookingIds) {
    const b = next.bookings.find((x) => x.id === id);
    if (!b) continue;
    next = {
      ...next,
      bookings: next.bookings.map((x) =>
        x.id === id ? { ...x, status: "no_show" } : x,
      ),
    };
    next = addNoShow(next, b.clientId);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Renovaciones                                                        */
/* ------------------------------------------------------------------ */

export type Renewal = {
  member: ProMember;
  plan: ProMembershipPlan;
  reason: "running_out" | "charge_due" | "overdue";
  detail: string;
};

/**
 * Socios que tienen que renovar esta semana: bonos de días con dos usos o
 * menos, cuotas mensuales que se cobran en siete días y cuotas vencidas.
 */
export function renewals(data: ProData, today: string): Renewal[] {
  const soon = addDays(today, 7);
  const out: Renewal[] = [];
  for (const member of data.members) {
    if (member.status === "cancelled" || member.status === "paused") continue;
    const plan = data.plans.find((p) => p.id === member.planId);
    if (!plan) continue;
    if (plan.period === "pack" && member.sessionsLeft !== null) {
      if (member.sessionsLeft <= 2)
        out.push({
          member,
          plan,
          reason: "running_out",
          detail:
            member.sessionsLeft === 0
              ? "Bono agotado"
              : `Le ${member.sessionsLeft === 1 ? "queda 1 uso" : `quedan ${member.sessionsLeft} usos`}`,
        });
      continue;
    }
    if (!member.nextChargeAt) continue;
    const due = localDate(member.nextChargeAt);
    if (member.status === "overdue" || due < today)
      out.push({ member, plan, reason: "overdue", detail: "Cuota vencida" });
    else if (due <= soon)
      out.push({
        member,
        plan,
        reason: "charge_due",
        detail: `Se cobra el ${Number(due.slice(8))}`,
      });
  }
  const order = { overdue: 0, running_out: 1, charge_due: 2 };
  return out.sort(
    (a, b) =>
      order[a.reason] - order[b.reason] ||
      a.member.name.localeCompare(b.member.name),
  );
}

/** Renueva: cobra el plan y repone usos o mueve el próximo cobro un mes. */
export function renewMember(
  data: ProData,
  input: {
    memberId: string;
    method: ProPayment["method"];
    paymentId: string;
    now: Date;
    priceCents: number;
  },
): ProData {
  const found = memberOf(data, input.memberId);
  if (!found?.plan) return data;
  const { member, plan } = found;
  const at = input.now.toISOString();
  const nextCharge =
    plan.period === "month"
      ? addMonths(
          member.nextChargeAt && member.nextChargeAt > at
            ? member.nextChargeAt
            : at,
          1,
        )
      : member.nextChargeAt;
  return {
    ...data,
    members: data.members.map((m) =>
      m.id === member.id
        ? {
            ...m,
            status: "active",
            sessionsLeft:
              plan.period === "pack" ? (plan.sessions ?? m.sessionsLeft) : m.sessionsLeft,
            nextChargeAt: nextCharge,
          }
        : m,
    ),
    payments: [
      ...data.payments,
      {
        id: input.paymentId,
        at,
        clientName: member.name,
        concept: plan.name,
        amountCents: input.priceCents,
        tipCents: 0,
        method: input.method,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Horas estudiadas                                                    */
/* ------------------------------------------------------------------ */

/**
 * Minutos que una persona ha pasado en la sala este mes: con la hora real de
 * entrada y salida si se marcó, o con la de la reserva si no.
 */
export function studiedMinutes(
  data: ProData,
  personId: string,
  month: string,
  now: Date,
): number {
  const checkins = data.courts?.checkins ?? {};
  return data.bookings
    .filter((b) => {
      const r = resourceOf(data, b.resourceId);
      return (
        b.clientId === personId &&
        r &&
        isShared(r) &&
        (b.status === "done" || b.status === "arrived") &&
        localDate(b.start).slice(0, 7) === month
      );
    })
    .reduce((a, b) => {
      const c = checkins[b.id];
      const from = Date.parse(c?.inAt ?? b.start);
      const to = Math.min(
        Date.parse(c?.outAt ?? b.end),
        now.getTime(),
      );
      return a + Math.max(0, Math.round((to - from) / 60000));
    }, 0);
}

export type StudyRank = { personId: string; name: string; minutes: number };

/** Quién más horas lleva este mes (para el mensaje de ánimo mensual). */
export function studyRanking(
  data: ProData,
  month: string,
  now: Date,
): StudyRank[] {
  const people = new Map<string, string>();
  for (const b of data.bookings) {
    if (b.clientId && localDate(b.start).slice(0, 7) === month)
      people.set(b.clientId, b.clientName);
  }
  return [...people.entries()]
    .map(([personId, name]) => ({
      personId,
      name,
      minutes: studiedMinutes(data, personId, month, now),
    }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/* ------------------------------------------------------------------ */
/* Taquillas                                                           */
/* ------------------------------------------------------------------ */

export function lockerState(
  locker: ProLocker,
  today: string,
): "free" | "active" | "expired" {
  if (!locker.memberId && !locker.name) return "free";
  if (locker.until && locker.until < today) return "expired";
  return "active";
}

export function setLocker(
  data: ProData,
  lockerId: string,
  patch: Partial<Omit<ProLocker, "id" | "label">> | null,
): ProData {
  return patchCourts(data, (ops) => ({
    lockers: ops.lockers.map((l) =>
      l.id === lockerId
        ? patch
          ? { ...l, ...patch }
          : { id: l.id, label: l.label }
        : l,
    ),
  }));
}

/* ------------------------------------------------------------------ */
/* Horas de sala incluidas en la cuota                                 */
/* ------------------------------------------------------------------ */

/** Minutos de sala que le quedan este mes a un socio (null si su plan no incluye). */
export function roomMinutesLeft(
  data: ProData,
  memberId: string,
  month: string,
): number | null {
  const found = memberOf(data, memberId);
  const allowance = found?.plan
    ? data.courts?.roomAllowance?.[found.plan.id]
    : undefined;
  if (!allowance) return null;
  const credit = data.courts?.roomCredit ?? {};
  const used = data.bookings
    .filter(
      (b) =>
        b.clientId === memberId &&
        b.status !== "cancelled" &&
        localDate(b.start).slice(0, 7) === month &&
        credit[b.id],
    )
    .reduce((a, b) => a + (credit[b.id] ?? 0), 0);
  return Math.max(0, allowance - used);
}

/* ------------------------------------------------------------------ */
/* Previsión de llenos                                                 */
/* ------------------------------------------------------------------ */

export type ForecastWeek = {
  week: string;
  level: "baja" | "normal" | "alta" | "muy alta";
  factor: number;
  reason?: string;
};

/**
 * Semanas de exámenes habituales en las universidades de la zona (día y mes
 * de inicio y fin). Es una estimación: cada universidad publica su calendario
 * y conviene revisarlo cada curso.
 */
const EXAM_SEASONS: {
  from: string;
  to: string;
  factor: number;
  reason: string;
}[] = [
  { from: "12-01", to: "12-21", factor: 1.3, reason: "Antes de exámenes" },
  { from: "12-22", to: "01-06", factor: 0.9, reason: "Navidad" },
  { from: "01-07", to: "02-07", factor: 1.9, reason: "Exámenes de enero" },
  { from: "05-15", to: "06-20", factor: 1.9, reason: "Exámenes de junio" },
  { from: "06-21", to: "07-10", factor: 1.4, reason: "Convocatoria de julio" },
  { from: "07-25", to: "08-31", factor: 0.5, reason: "Verano" },
  { from: "09-01", to: "09-20", factor: 0.8, reason: "Inicio de curso" },
];

function seasonFor(date: string) {
  const md = date.slice(5);
  return EXAM_SEASONS.find((s) =>
    s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to,
  );
}

/**
 * Demanda esperada de las próximas semanas según el calendario habitual de
 * exámenes. Se enseña como nivel (normal, alta, muy alta), no como cifra.
 */
export function forecastWeeks(today: string, weeks = 16): ForecastWeek[] {
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const week = addDays(monday, i * 7);
    // Mitad de semana: representa mejor la semana que el lunes.
    const season = seasonFor(addDays(week, 3));
    const factor = season?.factor ?? 1;
    const level: ForecastWeek["level"] =
      factor >= 1.7
        ? "muy alta"
        : factor >= 1.2
          ? "alta"
          : factor < 0.7
            ? "baja"
            : "normal";
    return { week, level, factor, reason: season?.reason };
  });
}

/* ------------------------------------------------------------------ */
/* Caja del día                                                        */
/* ------------------------------------------------------------------ */

export type CashCategory =
  | "Pistas"
  | "Puestos y pases"
  | "Salas"
  | "Cuotas y bonos"
  | "Clases"
  | "Mostrador"
  | "Torneos"
  | "Penalizaciones";

/** Clasifica un cobro por lo que se ha vendido. */
export function cashCategory(data: ProData, p: ProPayment): CashCategory {
  if (/^Penalización/.test(p.concept)) return "Penalizaciones";
  if (/^Extra|^Venta/.test(p.concept)) return "Mostrador";
  if (/americana|liga|torneo/i.test(p.concept)) return "Torneos";
  if (/clase|escuela/i.test(p.concept)) return "Clases";
  if (data.plans.some((plan) => plan.name === p.concept) || /^Bono|^Monedero/.test(p.concept))
    return "Cuotas y bonos";
  const booking = data.bookings.find((b) => b.id === p.bookingId);
  const r = resourceOf(data, booking?.resourceId);
  if (r?.kind === "court") return "Pistas";
  if (r && isShared(r)) return "Puestos y pases";
  if (r) return "Salas";
  return "Cuotas y bonos";
}

export type CashSummary = {
  total: number;
  tips: number;
  byMethod: Record<ProPayment["method"], number>;
  byCategory: { category: CashCategory; cents: number; count: number }[];
  payments: ProPayment[];
};

export function cashSummary(data: ProData, date: string): CashSummary {
  const payments = data.payments
    .filter((p) => localDate(p.at) === date)
    .sort((a, b) => b.at.localeCompare(a.at));
  const byMethod: CashSummary["byMethod"] = { card: 0, cash: 0, bizum: 0 };
  const cats = new Map<CashCategory, { cents: number; count: number }>();
  let tips = 0;
  for (const p of payments) {
    byMethod[p.method] += p.amountCents + p.tipCents;
    tips += p.tipCents;
    const c = cashCategory(data, p);
    const prev = cats.get(c) ?? { cents: 0, count: 0 };
    cats.set(c, { cents: prev.cents + p.amountCents, count: prev.count + 1 });
  }
  return {
    total: payments.reduce((a, p) => a + p.amountCents, 0),
    tips,
    byMethod,
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.cents - a.cents),
    payments,
  };
}

export function closeCash(
  data: ProData,
  input: {
    id: string;
    date: string;
    at: string;
    countedCashCents: number;
    by: string;
  },
): ProData {
  const expected = cashSummary(data, input.date).byMethod.cash;
  return patchCourts(data, (ops) => ({
    cashClosings: [
      ...ops.cashClosings.filter((c) => c.date !== input.date),
      {
        id: input.id,
        date: input.date,
        at: input.at,
        expectedCashCents: expected,
        countedCashCents: input.countedCashCents,
        by: input.by,
      },
    ],
  }));
}

