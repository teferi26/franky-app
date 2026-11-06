import type {
  ProBooking,
  ProClassSession,
  ProClassType,
  ProData,
  ProMember,
  ProMembershipPlan,
  ProVerticalId,
} from "./types";
import type { ProPlayerPrice } from "./classes-types";
import { addDays, localDate, weekdayIndex } from "./format";
import { rng } from "./demo/common";

/**
 * Lógica del motor de clases (gimnasio, box, academia, talleres y escape room)
 * y de las cuotas que comparte con el coworking. Todo son funciones puras sobre
 * `ProData`, para que las pantallas solo pinten.
 */

/* ------------------------------------------------------------------ */
/* Palabras de cada sector                                             */
/* ------------------------------------------------------------------ */

export type ClassCopy = {
  typeOne: string;
  typeMany: string;
  sessionOne: string;
  sessionMany: string;
  coach: string;
  member: string;
  members: string;
  Members: string;
  place: string;
  newType: string;
  newSession: string;
  /** Las sesiones se reservan por grupo cerrado (escape room). */
  groups: boolean;
};

export function classCopy(vertical: ProVerticalId): ClassCopy {
  switch (vertical) {
    case "academy":
      return {
        typeOne: "grupo",
        typeMany: "grupos",
        sessionOne: "clase",
        sessionMany: "clases",
        coach: "profesor",
        member: "alumno",
        members: "alumnos",
        Members: "Alumnos",
        place: "aula",
        newType: "Nuevo grupo",
        newSession: "Nueva clase",
        groups: false,
      };
    case "culture":
      return {
        typeOne: "actividad",
        typeMany: "actividades",
        sessionOne: "sesión",
        sessionMany: "sesiones",
        coach: "monitor",
        member: "cliente",
        members: "clientes",
        Members: "Clientes",
        place: "sala",
        newType: "Nueva actividad",
        newSession: "Nueva sesión",
        groups: true,
      };
    case "coworking":
      return {
        typeOne: "espacio",
        typeMany: "espacios",
        sessionOne: "franja",
        sessionMany: "franjas",
        coach: "encargado",
        member: "socio",
        members: "socios",
        Members: "Socios",
        place: "zona",
        newType: "Nuevo espacio",
        newSession: "Nueva reserva",
        groups: false,
      };
    default:
      return {
        typeOne: "clase",
        typeMany: "clases",
        sessionOne: "clase",
        sessionMany: "clases",
        coach: "coach",
        member: "socio",
        members: "socios",
        Members: "Socios",
        place: "sala",
        newType: "Nueva clase",
        newSession: "Nueva sesión",
        groups: false,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

export function weekStart(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function sessionsOn(data: ProData, date: string): ProClassSession[] {
  return data.sessions.filter((s) => s.status !== "cancelled" && localDate(s.start) === date).sort((a, b) => a.start.localeCompare(b.start));
}

export type SessionState = "past" | "live" | "next";

export function sessionState(s: ProClassSession, now: Date): SessionState {
  const t = now.getTime();
  if (new Date(s.end).getTime() <= t) return "past";
  if (new Date(s.start).getTime() <= t) return "live";
  return "next";
}

export function freeSpots(s: ProClassSession): number {
  return Math.max(0, s.capacity - s.booked);
}

/**
 * ¿Se reserva la sala entera para un grupo (escape room)? Lo dice el tipo de
 * sesión en `classExtras.types`. Si todavía no está configurado, en ocio se
 * sigue deduciendo por aforo (hasta 8) para que nada cambie de golpe.
 */
export function isRoomMode(
  data: Pick<ProData, "classExtras" | "space">,
  ct: Pick<ProClassType, "id" | "capacity"> | undefined,
): boolean {
  if (!ct) return false;
  const extra = data.classExtras?.types[ct.id];
  if (extra?.roomMode) return true;
  if (extra) return false;
  return data.space.vertical === "culture" && ct.capacity <= 8;
}

/** Precio de referencia por persona cuando la sala no tiene tabla propia. */
export const FALLBACK_PER_PLAYER_CENTS = 1400;

/**
 * Precio total del grupo según cuántos juegan. Si hay tabla se usa el tramo
 * exacto (o el más cercano por debajo); si no, precio por persona.
 */
export function priceForPlayers(
  prices: ProPlayerPrice[] | undefined,
  players: number,
  student: boolean,
): number {
  const n = Math.max(1, Math.round(players));
  if (!prices?.length) return n * FALLBACK_PER_PLAYER_CENTS;
  const sorted = [...prices].sort((a, b) => a.players - b.players);
  const row = sorted.filter((p) => p.players <= n).at(-1) ?? sorted[0];
  const base = student && row.studentPriceCents ? row.studentPriceCents : row.priceCents;
  // Por encima del último tramo, cada jugador extra paga la parte proporcional.
  if (n > row.players) return base + Math.round((base / row.players) * (n - row.players));
  return base;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const FALLBACK_NAMES = ["Lucía Soler", "Hugo Pastor", "Marta Ruiz", "Pablo Mora", "Carla Vidal", "Adrián Ferrer", "Irene Blasco", "Sergio Llorca"];

/**
 * Lista de una sesión cuando todavía no se ha tocado: se deduce de los socios
 * de forma estable (la misma sesión da siempre las mismas personas). En cuanto
 * se pasa lista o se apunta a alguien, se guarda como reservas de verdad.
 */
export function deriveRoster(data: ProData, s: ProClassSession, now: Date): ProBooking[] {
  if (!data.space.demo) return [];
  const r = rng(hash(s.id));
  const state = sessionState(s, now);
  const statusFor = (i: number, checked: number): ProBooking["status"] => {
    if (state === "past") return i < checked ? "arrived" : "no_show";
    if (state === "live") return i < checked ? "arrived" : "confirmed";
    return "confirmed";
  };
  const base = {
    kind: "class" as const,
    sessionId: s.id,
    staffId: s.coachId,
    start: s.start,
    end: s.end,
    priceCents: 0,
    paidCents: 0,
  };

  if (data.space.vertical === "culture") {
    // Escape room y talleres: se reserva por grupo.
    const list: ProBooking[] = [];
    const ct = data.classTypes.find((c) => c.id === s.classTypeId);
    const perGroup = isRoomMode(data, ct);
    if (!s.booked) return list;
    if (perGroup) {
      const client = data.clients.length ? data.clients[r.int(0, data.clients.length - 1)] : null;
      const price = priceForPlayers(
        data.classExtras?.types[s.classTypeId]?.playerPrices,
        s.booked,
        Boolean(client?.student?.verified),
      );
      list.push({
        ...base,
        id: `${s.id}-g`,
        clientId: client?.id,
        clientName: client?.name ?? FALLBACK_NAMES[r.int(0, FALLBACK_NAMES.length - 1)],
        partySize: s.booked,
        status: state === "next" ? "confirmed" : s.checkedIn ? "arrived" : state === "past" ? "no_show" : "confirmed",
        priceCents: price,
        paidCents: state === "past" ? price : 0,
        source: client?.source ?? "franky",
        student: Boolean(client?.student?.verified),
      });
      return list;
    }
  }

  const pool = data.members.filter((m) => m.status !== "cancelled" && m.status !== "paused");
  const order = pool.map((m) => ({ m, k: r.next() })).sort((a, b) => a.k - b.k).map((x) => x.m);
  const list: ProBooking[] = [];
  const total = s.booked + s.waitlist;
  for (let i = 0; i < total; i++) {
    const m = order[i % Math.max(1, order.length)];
    const waiting = i >= s.booked;
    const name = m && i < order.length ? m.name : FALLBACK_NAMES[i % FALLBACK_NAMES.length] + (i >= FALLBACK_NAMES.length ? ` ${i}` : "");
    list.push({
      ...base,
      id: `${s.id}-${i}`,
      clientId: m && i < order.length ? m.id : undefined,
      clientName: name,
      partySize: 1,
      status: waiting ? "requested" : statusFor(i, s.checkedIn ?? 0),
      source: m?.source ?? "walkin",
      student: Boolean(m?.student?.verified),
      waitlisted: waiting,
    });
  }
  return list;
}

export function isWaitlist(b: ProBooking) {
  // Las sesiones guardadas antes de tener este campo conservan la etiqueta.
  return b.status === "requested" && (b.waitlisted ?? b.note === "Lista de espera");
}

export function isTrial(b: ProBooking) {
  return b.trial ?? b.note === "Clase de prueba";
}

/** Inscritos y lista de espera de una sesión (guardados o deducidos). */
export function sessionRoster(data: ProData, s: ProClassSession, now: Date) {
  const saved = data.bookings.filter((b) => b.sessionId === s.id && b.status !== "cancelled");
  const list = saved.length ? saved : deriveRoster(data, s, now);
  return {
    booked: list.filter((b) => !isWaitlist(b)),
    waitlist: list.filter(isWaitlist),
    saved: saved.length > 0,
  };
}

function recount(s: ProClassSession, list: ProBooking[]): ProClassSession {
  const active = list.filter((b) => b.status !== "cancelled");
  return {
    ...s,
    booked: active.filter((b) => !isWaitlist(b)).reduce((a, b) => a + b.partySize, 0),
    checkedIn: active.filter((b) => b.status === "arrived" || b.status === "in_service" || b.status === "done").reduce((a, b) => a + b.partySize, 0),
    waitlist: active.filter(isWaitlist).length,
  };
}

/**
 * Cambia la lista de una sesión. Si aún era deducida, primero la guarda como
 * reservas y después aplica el cambio; al final recuenta plazas y check-in.
 */
export function withRoster(d: ProData, sessionId: string, now: Date, fn: (list: ProBooking[]) => ProBooking[]): ProData {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return d;
  const saved = d.bookings.filter((b) => b.sessionId === sessionId);
  const current = saved.length ? saved : deriveRoster(d, s, now);
  const next = fn(current);
  return {
    ...d,
    bookings: [...d.bookings.filter((b) => b.sessionId !== sessionId), ...next],
    sessions: d.sessions.map((x) => (x.id === sessionId ? recount(x, next) : x)),
  };
}

/* ------------------------------------------------------------------ */
/* Socios, cuotas y planes                                             */
/* ------------------------------------------------------------------ */

export const MEMBER_STATUS: Record<ProMember["status"], { label: string; tone: "success" | "danger" | "violet" | "neutral" | "warning" }> = {
  active: { label: "Al día", tone: "success" },
  overdue: { label: "Pago pendiente", tone: "danger" },
  trial: { label: "De prueba", tone: "violet" },
  paused: { label: "Pausado", tone: "warning" },
  cancelled: { label: "De baja", tone: "neutral" },
};

export const PERIOD_LABEL: Record<ProMembershipPlan["period"], string> = {
  month: "al mes",
  quarter: "al trimestre",
  year: "al año",
  pack: "bono",
};

export function memberPrice(m: ProMember, plan: ProMembershipPlan | undefined): number {
  if (!plan) return 0;
  return m.student?.verified && plan.studentPriceCents ? plan.studentPriceCents : plan.priceCents;
}

/** Lo que aporta un plan cada mes (los bonos no son recurrentes). */
export function monthlyEquivalent(plan: ProMembershipPlan, priceCents = plan.priceCents): number {
  switch (plan.period) {
    case "month":
      return priceCents;
    case "quarter":
      return Math.round(priceCents / 3);
    case "year":
      return Math.round(priceCents / 12);
    default:
      return 0;
  }
}

/** Ingreso recurrente mensual: cuotas de socios al día o pendientes de cobro. */
export function recurringCents(data: ProData): number {
  return data.members
    .filter((m) => m.status === "active" || m.status === "overdue")
    .reduce((acc, m) => {
      const plan = data.plans.find((p) => p.id === m.planId);
      return plan ? acc + monthlyEquivalent(plan, memberPrice(m, plan)) : acc;
    }, 0);
}

export function overdueCents(data: ProData): number {
  return data.members
    .filter((m) => m.status === "overdue")
    .reduce((acc, m) => acc + memberPrice(m, data.plans.find((p) => p.id === m.planId)), 0);
}

export function planMembers(data: ProData, planId: string): number {
  return data.members.filter((m) => m.planId === planId && m.status !== "cancelled").length;
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

export function shortUni(u: string) {
  if (u.includes("Alicante")) return "UA";
  if (u.includes("Miguel")) return "UMH";
  if (u.includes("CEU")) return "CEU";
  return u;
}
