import type { ProData, ProPayment } from "./types";
import type {
  ProConductWarning,
  ProCourtPass,
  ProCourtPassKind,
  ProCourtPolicy,
  ProLeague,
  ProLeagueTeam,
  ProLocker,
  ProPrivateLesson,
  ProSchoolGroup,
  ProSpecialHours,
} from "./courts-types";
import { addDays, atLocal, localDate, weekdayIndex } from "./format";
import { courtsOps, patchCourts } from "./courts-base";
import { isFree, isValley, priceFor } from "./courts";
import {
  isPassActive,
  passesToRenew,
  weekHeatmap,
  type Heatmap,
  type NewId,
} from "./courts-ops";
import { cashSummary } from "./courts-desk";
import {
  groupMeetsOn,
  leagueBlocks,
  leagueFixtures,
  type RankingRow,
} from "./courts-compete";

/**
 * Lógica de las pantallas de gestión del motor de pistas: normas, bonos,
 * caja, ocupación, escuela, puestos y taquillas. Todo es puro (recibe
 * `ProData` y devuelve `ProData` nuevo) para que web y móvil lo compartan y
 * se pueda probar sin pantalla.
 */

/* ------------------------------------------------------------------ */
/* Normas del club                                                     */
/* ------------------------------------------------------------------ */

/**
 * Deja la política dentro de valores con sentido: preaviso de 0 a 72 h,
 * penalización de 0 a 100 %, aviso a partir de 1 a 10 ausencias, liberación
 * de partidos de 1 a 24 h y de puestos de 10 a 120 minutos.
 */
export function clampPolicy(policy: ProCourtPolicy): ProCourtPolicy {
  const clamp = (n: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
  return {
    ...policy,
    noticeHours: clamp(policy.noticeHours, 0, 72),
    penaltyPct: clamp(policy.penaltyPct, 0, 100),
    noShowWarnAt: clamp(policy.noShowWarnAt, 1, 10),
    matchReleaseHours: clamp(policy.matchReleaseHours, 1, 24),
    releaseAfterMinutes: clamp(policy.releaseAfterMinutes, 10, 120),
    punctualityNote: policy.punctualityNote.trim().slice(0, 400),
  };
}

export function setPolicy(data: ProData, policy: ProCourtPolicy): ProData {
  return patchCourts(data, { policy: clampPolicy(policy) });
}

/** Lo que paga quien cancela tarde o no viene, con la política de ahora. */
export function penaltyFor(policy: ProCourtPolicy, priceCents: number): number {
  return Math.round((priceCents * policy.penaltyPct) / 100);
}

/**
 * Texto de normas para mandar con la confirmación: cancelación, lluvia y
 * puntualidad, en frases cortas.
 */
export function policyShareText(
  policy: ProCourtPolicy,
  club: string,
  coworking: boolean,
  rules: string[] = [],
): string {
  const lines: string[] = [`Normas de ${club}`];
  if (policy.noticeHours === 0) lines.push("Puedes cancelar sin coste hasta la hora de la reserva.");
  else if (policy.penaltyPct === 0)
    lines.push(`Si no puedes venir, avísanos con ${policy.noticeHours} h de antelación.`);
  else
    lines.push(
      `Cancelar es gratis hasta ${policy.noticeHours} h antes. Después, o si no vienes, se cobra el ${policy.penaltyPct} % de la reserva.`,
    );
  if (coworking)
    lines.push(`Si no llegas en ${policy.releaseAfterMinutes} minutos, el puesto se libera para otra persona.`);
  else if (policy.rainFree) lines.push("Si llueve y no hay pista cubierta libre, cancelar no cuesta nada.");
  if (policy.punctualityNote) lines.push(policy.punctualityNote);
  for (const rule of rules) lines.push(rule);
  return lines.join("\n");
}

/** Servicios que el estudiante ve en la ficha de la sala. */
export const COURTS_AMENITIES: { id: string; label: string }[] = [
  { id: "silencio", label: "Silencio total" },
  { id: "portatil", label: "Zona de portátil" },
  { id: "salas", label: "Salas de grupo" },
  { id: "cabinas", label: "Cabinas para llamadas" },
  { id: "taquillas", label: "Taquillas" },
  { id: "enchufes", label: "Enchufe en cada puesto" },
  { id: "wifi", label: "Wifi" },
  { id: "cafe", label: "Café y agua" },
  { id: "impresora", label: "Impresora" },
  { id: "clima", label: "Climatización" },
  { id: "noche", label: "Abre de noche en exámenes" },
];

/* ------------------------------------------------------------------ */
/* Horarios especiales                                                 */
/* ------------------------------------------------------------------ */

export type SpecialHoursCheck =
  | { ok: true }
  | { ok: false; reason: "dates" | "hours" | "overlap"; with?: string };

/** Fechas en orden, cierre después de apertura y sin pisar otro horario. */
export function checkSpecialHours(
  data: ProData,
  input: ProSpecialHours,
): SpecialHoursCheck {
  if (!input.from || !input.to || input.from > input.to)
    return { ok: false, reason: "dates" };
  if (input.close <= input.open || input.close > 30 * 60)
    return { ok: false, reason: "hours" };
  const other = courtsOps(data).specialHours.find(
    (s) => s.id !== input.id && s.from <= input.to && input.from <= s.to,
  );
  if (other) return { ok: false, reason: "overlap", with: other.label };
  return { ok: true };
}

export function saveSpecialHours(
  data: ProData,
  input: ProSpecialHours,
): ProData {
  return patchCourts(data, (ops) => ({
    specialHours: [
      ...ops.specialHours.filter((s) => s.id !== input.id),
      input,
    ].sort((a, b) => a.from.localeCompare(b.from)),
  }));
}

export function removeSpecialHours(data: ProData, id: string): ProData {
  return patchCourts(data, (ops) => ({
    specialHours: ops.specialHours.filter((s) => s.id !== id),
  }));
}

/* ------------------------------------------------------------------ */
/* Convivencia (sala de estudio)                                       */
/* ------------------------------------------------------------------ */

export const WARNING_LABEL: Record<ProConductWarning["kind"], string> = {
  noise: "Ruido",
  phone: "Llamada en silencio",
  food: "Comida en el puesto",
  saving: "Puesto guardado",
  other: "Otro",
};

export function addWarning(
  data: ProData,
  warning: ProConductWarning,
): ProData {
  return patchCourts(data, (ops) => ({
    warnings: [...ops.warnings, warning],
  }));
}

export function removeWarning(data: ProData, id: string): ProData {
  return patchCourts(data, (ops) => ({
    warnings: ops.warnings.filter((w) => w.id !== id),
  }));
}

export type WarningPerson = {
  key: string;
  name: string;
  memberId?: string;
  count: number;
  last: ProConductWarning;
};

/**
 * Avisos agrupados por persona en los últimos `days` días, primero quien más
 * lleva. A partir del tercero la ficha se marca.
 */
export function warningsByPerson(
  data: ProData,
  today: string,
  days = 90,
): WarningPerson[] {
  const since = addDays(today, -days);
  const map = new Map<string, WarningPerson>();
  for (const w of courtsOps(data).warnings) {
    if (localDate(w.at) < since) continue;
    const key = w.memberId ?? w.name.trim().toLowerCase();
    const hit = map.get(key);
    if (!hit) map.set(key, { key, name: w.name, memberId: w.memberId, count: 1, last: w });
    else {
      hit.count++;
      if (w.at > hit.last.at) hit.last = w;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || b.last.at.localeCompare(a.last.at),
  );
}

/* ------------------------------------------------------------------ */
/* Bonos y monedero                                                    */
/* ------------------------------------------------------------------ */

export type PassTemplate = {
  id: string;
  kind: ProCourtPassKind;
  label: string;
  /** Partidos, horas o céntimos de saldo. */
  total: number;
  priceCents: number;
  days: number;
};

/**
 * Bonos habituales de un club para empezar con un toque. El precio sale de
 * la tarifa de la primera pista (hora punta y hora valle), con un pequeño
 * descuento por comprar por adelantado. Se puede cambiar antes de vender.
 */
export function passTemplates(data: ProData, date: string): PassTemplate[] {
  const court = data.resources.find((r) => r.kind === "court");
  const peak = court ? (priceFor(court, date, 19 * 60, 90) ?? 0) : 0;
  const valley = court ? (priceFor(court, date, 11 * 60, 60) ?? 0) : 0;
  const round = (cents: number) => Math.round(cents / 500) * 500;
  const out: PassTemplate[] = [];
  if (peak) {
    out.push({ id: "m5", kind: "matches", label: "Bono 5 partidos", total: 5, priceCents: round(peak * 5 * 0.92), days: 60 });
    out.push({ id: "m10", kind: "matches", label: "Bono 10 partidos", total: 10, priceCents: round(peak * 10 * 0.88), days: 120 });
  }
  if (valley)
    out.push({ id: "h10", kind: "hours", label: "Bono mañanas 10 horas", total: 10, priceCents: round(valley * 10 * 0.85), days: 90 });
  out.push({ id: "w50", kind: "wallet", label: "Monedero 50 €", total: 5500, priceCents: 5000, days: 180 });
  out.push({ id: "w100", kind: "wallet", label: "Monedero 100 €", total: 11000, priceCents: 10000, days: 180 });
  return out;
}

export function buildPass(
  template: Omit<PassTemplate, "id">,
  who: { clientId?: string; name: string; phone?: string },
  input: { id: string; now: Date },
): ProCourtPass {
  const today = localDate(input.now);
  return {
    id: input.id,
    clientId: who.clientId,
    name: who.name.trim(),
    phone: who.phone?.trim() || undefined,
    kind: template.kind,
    label: template.label.trim(),
    total: template.total,
    left: template.total,
    priceCents: template.priceCents,
    soldAt: input.now.toISOString(),
    expiresAt: atLocal(addDays(today, template.days), 23 * 60),
    uses: [],
  };
}

/**
 * Al renovar antes de que caduque, lo que no se gastó del bono anterior pasa
 * al nuevo. Si ya había caducado, se pierde.
 */
export function carryOver(pass: ProCourtPass, today: string): number {
  return localDate(pass.expiresAt) >= today ? pass.left : 0;
}

/** Días que duraba el bono: el renovado dura lo mismo (30 como mínimo). */
export function passDays(pass: ProCourtPass): number {
  // Por días de calendario: la hora de venta y el cambio de hora no cuentan.
  const days =
    (Date.parse(`${localDate(pass.expiresAt)}T12:00:00Z`) -
      Date.parse(`${localDate(pass.soldAt)}T12:00:00Z`)) /
    86_400_000;
  return Math.max(30, Math.round(days));
}

export type PassStats = {
  active: number;
  /** Partidos y horas pendientes de jugar, y saldo pendiente de gastar. */
  matchesLeft: number;
  hoursLeft: number;
  walletLeftCents: number;
  soldThisMonthCents: number;
  toRenew: number;
};

export function passStats(data: ProData, today: string): PassStats {
  const passes = courtsOps(data).passes;
  const active = passes.filter((p) => isPassActive(p, today));
  const month = today.slice(0, 7);
  return {
    active: active.length,
    matchesLeft: active.filter((p) => p.kind === "matches").reduce((a, p) => a + p.left, 0),
    hoursLeft: active.filter((p) => p.kind === "hours").reduce((a, p) => a + p.left, 0),
    walletLeftCents: active.filter((p) => p.kind === "wallet").reduce((a, p) => a + p.left, 0),
    soldThisMonthCents: passes
      .filter((p) => localDate(p.soldAt).slice(0, 7) === month)
      .reduce((a, p) => a + p.priceCents, 0),
    toRenew: passesToRenew(data, today).length,
  };
}

/** "Quedan 3 partidos", "Quedan 4,5 h", "Quedan 6,40 €". */
export function passLeftLabel(p: Pick<ProCourtPass, "kind" | "left">): string {
  if (p.kind === "wallet")
    return `${(p.left / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  if (p.kind === "hours")
    return `${p.left.toLocaleString("es-ES", { maximumFractionDigits: 2 })} h`;
  return `${p.left} ${p.left === 1 ? "partido" : "partidos"}`;
}

/* ------------------------------------------------------------------ */
/* Caja                                                                */
/* ------------------------------------------------------------------ */

export type CashCheck = {
  expectedCashCents: number;
  countedCashCents: number;
  /** Positivo si sobra, negativo si falta. */
  diffCents: number;
  status: "ok" | "short" | "over";
};

/** Compara el efectivo contado con el que debería haber. Un euro de margen. */
export function cashCheck(
  data: ProData,
  date: string,
  countedCashCents: number,
  openingFloatCents = 0,
): CashCheck {
  const expected = cashSummary(data, date).byMethod.cash + openingFloatCents;
  const diff = countedCashCents - expected;
  return {
    expectedCashCents: expected,
    countedCashCents,
    diffCents: diff,
    status: Math.abs(diff) <= 100 ? "ok" : diff < 0 ? "short" : "over",
  };
}

/** Días con cobros de las últimas `days` jornadas, con su total. */
export function cashHistory(
  data: ProData,
  today: string,
  days = 7,
): { date: string; totalCents: number; closed: boolean; diffCents: number | null }[] {
  const closings = courtsOps(data).cashClosings;
  return Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i))).map(
    (date) => {
      const closing = closings.find((c) => c.date === date);
      return {
        date,
        totalCents: cashSummary(data, date).total,
        closed: Boolean(closing),
        diffCents: closing ? closing.countedCashCents - closing.expectedCashCents : null,
      };
    },
  );
}

/** CSV de los cobros de un mes para la gestoría (sin prometer más). */
export function cashMonthRows(
  data: ProData,
  month: string,
  category: (p: ProPayment) => string,
): string[][] {
  const method: Record<ProPayment["method"], string> = {
    card: "Tarjeta",
    cash: "Efectivo",
    bizum: "Bizum",
  };
  const rows = data.payments
    .filter((p) => localDate(p.at).slice(0, 7) === month)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((p) => [
      localDate(p.at),
      p.clientName,
      p.concept,
      category(p),
      method[p.method],
      ((p.amountCents + p.tipCents) / 100).toFixed(2).replace(".", ","),
    ]);
  return [["Fecha", "Cliente", "Concepto", "Tipo", "Método", "Importe (€)"], ...rows];
}

/* ------------------------------------------------------------------ */
/* Ocupación                                                           */
/* ------------------------------------------------------------------ */

/** Lunes de la semana de una fecha. */
export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export type OccupancyCompare = {
  thisWeek: Heatmap;
  lastWeek: Heatmap;
  /** Puntos porcentuales de diferencia (de -100 a 100). */
  deltaPoints: number;
  valley: number;
  peak: number;
};

/**
 * Semana de lunes a domingo frente a la anterior, con la media en franja
 * valle (la del club, de 10 a 14 entre semana) y en el resto de horas.
 */
export function occupancyCompare(
  data: ProData,
  anyDay: string,
  resourceId?: string,
): OccupancyCompare {
  const monday = mondayOf(anyDay);
  const thisWeek = weekHeatmap(data, monday, 7, resourceId);
  const lastWeek = weekHeatmap(data, addDays(monday, -7), 7, resourceId);
  let valleySum = 0;
  let valleyN = 0;
  let peakSum = 0;
  let peakN = 0;
  for (const row of thisWeek.rows) {
    row.cells.forEach((v, k) => {
      if (v === null) return;
      const valley = isValley(row.date, thisWeek.slots[k]);
      if (valley) {
        valleySum += v;
        valleyN++;
      } else {
        peakSum += v;
        peakN++;
      }
    });
  }
  return {
    thisWeek,
    lastWeek,
    deltaPoints: Math.round((thisWeek.average - lastWeek.average) * 100),
    valley: valleyN ? valleySum / valleyN : 0,
    peak: peakN ? peakSum / peakN : 0,
  };
}

/** Horas jugadas en cada pista durante un mes (reservas y clases). */
export function resourceMonthHours(
  data: ProData,
  month: string,
): { resourceId: string; minutes: number }[] {
  return data.resources.map((r) => ({
    resourceId: r.id,
    minutes: data.bookings
      .filter(
        (b) =>
          b.resourceId === r.id &&
          b.status !== "cancelled" &&
          b.status !== "no_show" &&
          localDate(b.start).slice(0, 7) === month,
      )
      .reduce((a, b) => a + Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60000), 0),
  }));
}

/* ------------------------------------------------------------------ */
/* Escuela                                                             */
/* ------------------------------------------------------------------ */

export type SchoolStats = {
  groups: number;
  students: number;
  freeSpots: number;
  pendingFees: number;
  pendingCents: number;
};

export function schoolStats(data: ProData): SchoolStats {
  const school = courtsOps(data).school;
  let pendingFees = 0;
  let pendingCents = 0;
  for (const g of school) {
    for (const s of g.students) {
      if (s.feeStatus === "pending") {
        pendingFees++;
        pendingCents += g.monthlyFeeCents;
      }
    }
  }
  return {
    groups: school.length,
    students: school.reduce((a, g) => a + g.students.length, 0),
    freeSpots: school.reduce((a, g) => a + Math.max(0, g.capacity - g.students.length), 0),
    pendingFees,
    pendingCents,
  };
}

/** Grupos que tienen clase ese día, por hora. */
export function groupsOn(data: ProData, date: string): ProSchoolGroup[] {
  return courtsOps(data)
    .school.filter((g) => groupMeetsOn(g, date))
    .sort((a, b) => a.from - b.from);
}

export function addStudent(
  data: ProData,
  groupId: string,
  student: { id: string; name: string; phone?: string; minor?: boolean },
): ProData {
  return patchCourts(data, (ops) => ({
    school: ops.school.map((g) =>
      g.id === groupId && g.students.length < g.capacity
        ? {
            ...g,
            students: [
              ...g.students,
              {
                id: student.id,
                name: student.name.trim(),
                phone: student.phone?.trim() || undefined,
                minor: student.minor || undefined,
                feeStatus: "pending" as const,
              },
            ],
          }
        : g,
    ),
  }));
}

export function removeStudent(
  data: ProData,
  groupId: string,
  studentId: string,
): ProData {
  return patchCourts(data, (ops) => ({
    school: ops.school.map((g) =>
      g.id === groupId
        ? { ...g, students: g.students.filter((s) => s.id !== studentId) }
        : g,
    ),
  }));
}

export type GroupCheck = { ok: true } | { ok: false; reason: "coach" | "court" | "hours" };

/**
 * Un grupo nuevo no puede pisar a otro grupo en la misma pista ni al mismo
 * monitor, y tiene que caber en el horario normal de ese día de la semana.
 */
export function checkGroup(data: ProData, group: ProSchoolGroup): GroupCheck {
  const hours = data.space.hours[group.weekday];
  if (!hours || group.from < hours.open || group.from + group.duration > hours.close)
    return { ok: false, reason: "hours" };
  const overlaps = (g: ProSchoolGroup) =>
    g.id !== group.id &&
    g.weekday === group.weekday &&
    g.from < group.from + group.duration &&
    g.from + g.duration > group.from &&
    g.season.from <= group.season.to &&
    group.season.from <= g.season.to;
  const others = courtsOps(data).school.filter(overlaps);
  if (others.some((g) => g.coachId === group.coachId)) return { ok: false, reason: "coach" };
  if (others.some((g) => g.resourceId === group.resourceId)) return { ok: false, reason: "court" };
  return { ok: true };
}

export function saveGroup(data: ProData, group: ProSchoolGroup): ProData {
  return patchCourts(data, (ops) => ({
    school: [...ops.school.filter((g) => g.id !== group.id), group],
  }));
}

export type LessonCheck = { ok: true } | { ok: false; reason: "court" | "coach" };

/** ¿Están libres la pista y el monitor a esa hora? */
export function checkLesson(
  data: ProData,
  input: { coachId: string; resourceId: string; date: string; from: number; duration: number },
): LessonCheck {
  const resource = data.resources.find((r) => r.id === input.resourceId);
  if (!resource || !isFree(data, resource, input.date, input.from, input.duration))
    return { ok: false, reason: "court" };
  const end = input.from + input.duration;
  const busyLesson = courtsOps(data).lessons.some(
    (l) =>
      l.coachId === input.coachId &&
      l.status !== "cancelled" &&
      l.date === input.date &&
      l.from < end &&
      l.from + l.duration > input.from,
  );
  const busyGroup = groupsOn(data, input.date).some(
    (g) => g.coachId === input.coachId && g.from < end && g.from + g.duration > input.from,
  );
  if (busyLesson || busyGroup) return { ok: false, reason: "coach" };
  return { ok: true };
}

/**
 * Clase particular en un paso: reserva la pista a nombre del alumno (el
 * cobro va en la reserva) y apunta la clase al monitor para sus horas.
 */
export function createLesson(
  data: ProData,
  input: {
    coachId: string;
    resourceId: string;
    date: string;
    from: number;
    duration: number;
    studentName: string;
    phone?: string;
    priceCents: number;
  },
  newId: NewId,
): { data: ProData; lesson: ProPrivateLesson } | null {
  if (!checkLesson(data, input).ok) return null;
  const bookingId = newId("b");
  const coach = data.staff.find((s) => s.id === input.coachId);
  const lesson: ProPrivateLesson = {
    id: newId("cl"),
    coachId: input.coachId,
    resourceId: input.resourceId,
    date: input.date,
    from: input.from,
    duration: input.duration,
    studentName: input.studentName.trim(),
    phone: input.phone?.trim() || undefined,
    priceCents: input.priceCents,
    bookingId,
    status: "scheduled",
  };
  const withBooking: ProData = {
    ...data,
    bookings: [
      ...data.bookings,
      {
        id: bookingId,
        kind: "court",
        clientName: lesson.studentName,
        resourceId: input.resourceId,
        staffId: input.coachId,
        start: atLocal(input.date, input.from),
        end: atLocal(input.date, input.from + input.duration),
        partySize: 2,
        status: "confirmed",
        priceCents: input.priceCents,
        paidCents: 0,
        source: "phone",
        note: coach ? `Clase particular con ${coach.name.split(" ")[0]}` : "Clase particular",
      },
    ],
  };
  return {
    data: patchCourts(withBooking, (ops) => ({ lessons: [...ops.lessons, lesson] })),
    lesson,
  };
}

/* ------------------------------------------------------------------ */
/* Puestos y taquillas                                                 */
/* ------------------------------------------------------------------ */

export type LockerStats = { free: number; active: number; expired: number };

export function lockerStats(lockers: ProLocker[], today: string): LockerStats {
  const out: LockerStats = { free: 0, active: 0, expired: 0 };
  for (const l of lockers) {
    if (!l.memberId && !l.name) out.free++;
    else if (l.until && l.until < today) out.expired++;
    else out.active++;
  }
  return out;
}

/** Alquila una taquilla hasta el mismo día del mes siguiente (o la renueva). */
export function rentLocker(
  data: ProData,
  lockerId: string,
  who: { memberId?: string; name: string },
  today: string,
): ProData {
  const locker = courtsOps(data).lockers.find((l) => l.id === lockerId);
  const from = locker?.until && locker.until >= today ? locker.until : today;
  const [y, m, d] = from.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, Math.min(d, 28)));
  const until = next.toISOString().slice(0, 10);
  return patchCourts(data, (ops) => ({
    lockers: ops.lockers.map((l) =>
      l.id === lockerId ? { ...l, memberId: who.memberId, name: who.name.trim(), until } : l,
    ),
  }));
}

export function addLocker(data: ProData, id: string): ProData {
  return patchCourts(data, (ops) => {
    const n = ops.lockers.length + 1;
    return { lockers: [...ops.lockers, { id, label: `T-${String(n).padStart(2, "0")}` }] };
  });
}

/* ------------------------------------------------------------------ */
/* Liga y ranking                                                      */
/* ------------------------------------------------------------------ */

/**
 * Crea la liga entre facultades: calendario de todos contra todos desde la
 * fecha de inicio y pistas bloqueadas en cada jornada. Sustituye a la
 * anterior (y a sus bloqueos) si la había.
 */
export function createLeague(
  data: ProData,
  input: {
    id: string;
    name: string;
    weekday: number;
    from: number;
    startDate: string;
    resourceIds: string[];
    teams: ProLeagueTeam[];
  },
  newId: NewId,
): ProData {
  const fixtures = leagueFixtures(input.teams, {
    startDate: input.startDate,
    weekday: input.weekday,
    from: input.from,
    resourceIds: input.resourceIds,
    newId,
  });
  const league: ProLeague = { ...input, name: input.name.trim(), fixtures };
  return patchCourts(data, (ops) => ({
    league,
    blocks: [
      ...ops.blocks.filter((b) => !ops.league || b.sourceId !== ops.league.id),
      ...leagueBlocks(league, input.startDate, newId),
    ],
  }));
}

/** Próxima jornada con partidos sin resultado (o la última si ya acabó). */
export function currentRound(league: ProLeague, today: string): number {
  const pending = league.fixtures
    .filter((f) => f.homeSets === null || f.awaySets === null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
  const due = pending.find((f) => f.date <= today) ?? pending[0];
  if (due) return due.round;
  return Math.max(0, ...league.fixtures.map((f) => f.round));
}

export type LevelBand = "all" | "low" | "mid" | "high";

export const LEVEL_BAND_LABEL: Record<LevelBand, string> = {
  all: "Todos",
  low: "Hasta 3,0",
  mid: "De 3,0 a 4,5",
  high: "Más de 4,5",
};

/** Ranking separado por nivel: nadie compite con quien le saca dos puntos. */
export function rankingByBand(rows: RankingRow[], band: LevelBand): RankingRow[] {
  if (band === "all") return rows;
  return rows.filter((r) => {
    if (r.level === undefined) return band === "mid";
    if (band === "low") return r.level < 3;
    if (band === "mid") return r.level >= 3 && r.level <= 4.5;
    return r.level > 4.5;
  });
}

export function rankingShareText(
  rows: RankingRow[],
  club: string,
  band: LevelBand,
): string {
  const title = `Ranking de ${club}${band === "all" ? "" : ` (${LEVEL_BAND_LABEL[band].toLowerCase()})`}`;
  const table = rows
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.name}: ${r.points} pts`)
    .join("\n");
  return `${title}\n\n${table}`;
}
