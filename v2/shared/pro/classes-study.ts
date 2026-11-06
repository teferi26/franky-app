import type {
  ProClassSession,
  ProClassType,
  ProData,
  ProMember,
  ProMembershipPlan,
} from "./types";
import type {
  ProCefrLevel,
  ProChargeMethod,
  ProGrade,
  ProGroupMaterial,
  ProPlanExtra,
  ProRecoveryRules,
} from "./classes-types";
import { addDays, localDate, localMinutes, minutesToLabel, weekdayIndex } from "./format";
import { PERIOD_LABEL, memberPrice, monthlyEquivalent } from "./classes";
import {
  addRecovery,
  careOf,
  extrasOf,
  firstName,
  monthOf,
  patchCare,
  pendingRecoveries,
  recordCharge,
  shiftMonth,
  withExtras,
} from "./classes-care";
import { patchTypeExtra, typeExtra } from "./classes-ops";
import { groupStudents } from "./classes-play";

/**
 * Lo propio de una academia que no cabe en el horario: notas de simulacros,
 * niveles de idiomas, el grupo que sigue al acabar una asignatura, el
 * material de cada grupo, la matrícula, la norma de recuperaciones, el
 * tablón del centro y la previsión del curso entero. Funciones puras sobre
 * `ProData`, como el resto del motor.
 */

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Notas y simulacros                                                  */
/* ------------------------------------------------------------------ */

export const GRADE_KIND_LABEL: Record<ProGrade["kind"], string> = {
  mock: "Simulacro",
  partial: "Parcial",
  test: "Prueba de clase",
};

/** Por debajo de esta media el alumno necesita refuerzo antes del examen. */
export const REINFORCE_BELOW = 5;

export function gradesOf(data: ProData): ProGrade[] {
  return extrasOf(data).grades ?? [];
}

/** Notas de un alumno de la más antigua a la más reciente. */
export function memberGrades(data: ProData, memberId: string, classTypeId?: string): ProGrade[] {
  return gradesOf(data)
    .filter((g) => g.memberId === memberId && (!classTypeId || g.classTypeId === classTypeId))
    .sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id));
}

/** "6,5" o "6.5" a 6.5; null si no es una nota de 0 a 10. */
export function parseGrade(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(clean)) return null;
  const n = Number(clean);
  return n >= 0 && n <= 10 ? round1(n) : null;
}

export function formatGrade(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export function addGrade(d: ProData, grade: ProGrade): ProData {
  return withExtras(d, (x) => ({
    ...x,
    grades: [...(x.grades ?? []).filter((g) => g.id !== grade.id), grade],
  }));
}

export function removeGrade(d: ProData, gradeId: string): ProData {
  return withExtras(d, (x) => ({
    ...x,
    grades: (x.grades ?? []).filter((g) => g.id !== gradeId),
  }));
}

export type GradeTrend = {
  count: number;
  last: number | null;
  /** Media de las tres últimas notas. */
  average: number | null;
  /** Diferencia entre la última y la media de las anteriores. */
  delta: number | null;
  direction: "up" | "down" | "flat" | null;
};

/** Cómo va un alumno: su última nota frente a las anteriores. */
export function gradeTrend(grades: ProGrade[]): GradeTrend {
  if (!grades.length) {
    return { count: 0, last: null, average: null, delta: null, direction: null };
  }
  const sorted = [...grades].sort((a, b) => a.on.localeCompare(b.on));
  const last = sorted[sorted.length - 1].grade;
  const recent = sorted.slice(-3);
  const average = round1(recent.reduce((a, g) => a + g.grade, 0) / recent.length);
  const before = sorted.slice(-4, -1);
  if (!before.length) return { count: sorted.length, last, average, delta: null, direction: null };
  const prev = before.reduce((a, g) => a + g.grade, 0) / before.length;
  const delta = round1(last - prev);
  // Medio punto arriba o abajo es ruido de un simulacro a otro.
  const direction = delta >= 0.5 ? "up" : delta <= -0.5 ? "down" : "flat";
  return { count: sorted.length, last, average, delta, direction };
}

export type ReinforceItem = { member: ProMember; trend: GradeTrend };

/**
 * Alumnos de un grupo que necesitan refuerzo: media reciente por debajo del
 * cinco o una última nota floja que además va a peor. Primero los más flojos.
 */
export function needsReinforcement(data: ProData, classTypeId: string): ReinforceItem[] {
  return groupStudents(data, classTypeId)
    .map((member) => ({ member, trend: gradeTrend(memberGrades(data, member.id, classTypeId)) }))
    .filter(({ trend }) => {
      if (trend.average === null || trend.last === null) return false;
      if (trend.average < REINFORCE_BELOW) return true;
      return trend.direction === "down" && trend.last < REINFORCE_BELOW + 1;
    })
    .sort((a, b) => (a.trend.average ?? 0) - (b.trend.average ?? 0));
}

export function reinforcementMessage(
  member: ProMember,
  group: string,
  examOn: string | undefined,
  today: string,
  sender: string,
  place: string,
): string {
  const exam = examOn
    ? ` Quedan ${Math.max(0, daysBetween(today, examOn))} días para el examen`
    : " Antes del examen";
  return `Hola ${firstName(member.name)}, soy ${sender} de ${place}. He visto tu último simulacro de ${group}.${exam} y me gustaría darte una clase de refuerzo para repasar lo que más te cuesta. ¿Te va bien esta semana?`;
}

/* ------------------------------------------------------------------ */
/* Niveles de idiomas                                                  */
/* ------------------------------------------------------------------ */

export const CEFR_LEVELS: ProCefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function nextLevel(level: ProCefrLevel): ProCefrLevel | null {
  const i = CEFR_LEVELS.indexOf(level);
  return i >= 0 && i < CEFR_LEVELS.length - 1 ? CEFR_LEVELS[i + 1] : null;
}

/**
 * Nivel de un grupo: el que se le puso a mano o el que se lee en su nombre
 * ("Inglés B2") o en su rótulo de nivel ("B1 a B2", se queda con el último).
 */
export function groupLevel(data: ProData, ct: ProClassType): ProCefrLevel | null {
  const manual = typeExtra(data, ct.id).cefr;
  if (manual) return manual;
  for (const text of [ct.name, ct.level ?? ""]) {
    const found = text.toUpperCase().match(/\b[ABC][12]\b/g);
    if (found?.length) return found[found.length - 1] as ProCefrLevel;
  }
  return null;
}

/** ¿Hay algún grupo de idiomas? Si no, la academia no ve nada de niveles. */
export function hasLevelGroups(data: ProData): boolean {
  return data.classTypes.some((ct) => ct.active !== false && groupLevel(data, ct) !== null);
}

export type LevelGroup = {
  classType: ProClassType;
  level: ProCefrLevel;
  nextSession?: ProClassSession;
  /** Plazas libres en su próxima clase. */
  free: number;
};

function nextSessionOf(data: ProData, typeId: string, now: Date): ProClassSession | undefined {
  return data.sessions
    .filter(
      (s) =>
        s.classTypeId === typeId &&
        s.status !== "cancelled" &&
        new Date(s.start).getTime() > now.getTime(),
    )
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

/** Grupos de ese nivel, primero los que tienen sitio en su próxima clase. */
export function groupsForLevel(data: ProData, level: ProCefrLevel, now: Date): LevelGroup[] {
  return data.classTypes
    .filter((ct) => ct.active !== false && groupLevel(data, ct) === level)
    .map((classType) => {
      const nextSession = nextSessionOf(data, classType.id, now);
      const free = nextSession ? Math.max(0, nextSession.capacity - nextSession.booked) : 0;
      return { classType, level, nextSession, free };
    })
    .sort((a, b) => b.free - a.free || a.classType.name.localeCompare(b.classType.name, "es"));
}

export function setMemberLevel(d: ProData, memberId: string, level: ProCefrLevel): ProData {
  return patchCare(d, memberId, { level });
}

export function setGroupLevel(d: ProData, typeId: string, level: ProCefrLevel | undefined): ProData {
  return patchTypeExtra(d, typeId, { cefr: level });
}

/* ------------------------------------------------------------------ */
/* Continuidad: el grupo que sigue al acabar                           */
/* ------------------------------------------------------------------ */

/** Días antes del examen en que ya se propone el grupo siguiente. */
export const CONTINUITY_BEFORE_DAYS = 14;
/** Días después del examen en que todavía tiene sentido proponerlo. */
export const CONTINUITY_AFTER_DAYS = 45;

export function setNextGroup(d: ProData, typeId: string, nextTypeId: string | undefined): ProData {
  return patchTypeExtra(d, typeId, { nextTypeId: nextTypeId && nextTypeId !== typeId ? nextTypeId : undefined });
}

export type ContinuityItem = {
  from: ProClassType;
  to: ProClassType;
  examOn?: string;
  nextSession?: ProClassSession;
  /** Alumnos del grupo que no están en el siguiente ni se les ha propuesto. */
  students: ProMember[];
};

/** Lo que se puede proponer a los alumnos de un grupo que tiene siguiente. */
export function continuityFor(data: ProData, typeId: string, now: Date): ContinuityItem | null {
  const from = data.classTypes.find((c) => c.id === typeId);
  const nextId = from ? typeExtra(data, from.id).nextTypeId : undefined;
  const to = nextId ? data.classTypes.find((c) => c.id === nextId) : undefined;
  if (!from || !to) return null;
  const already = new Set(groupStudents(data, to.id).map((m) => m.id));
  const recent = addDays(localDate(now), -60);
  const students = groupStudents(data, from.id).filter((m) => {
    if (already.has(m.id)) return false;
    const offered = careOf(data, m.id).continuityOfferedAt;
    return !offered || localDate(offered) < recent;
  });
  return {
    from,
    to,
    examOn: typeExtra(data, from.id).examOn,
    nextSession: nextSessionOf(data, to.id, now),
    students,
  };
}

/**
 * Grupos que acaban ahora (examen en las dos próximas semanas o hace menos
 * de mes y medio) y tienen un grupo siguiente con alumnos por proponer.
 */
export function continuityDue(data: ProData, now: Date): ContinuityItem[] {
  const today = localDate(now);
  return data.classTypes
    .map((ct) => {
      const examOn = typeExtra(data, ct.id).examOn;
      if (!examOn) return null;
      const days = daysBetween(today, examOn);
      if (days > CONTINUITY_BEFORE_DAYS || days < -CONTINUITY_AFTER_DAYS) return null;
      const item = continuityFor(data, ct.id, now);
      return item && item.students.length ? item : null;
    })
    .filter((x): x is ContinuityItem => Boolean(x));
}

export function markContinuityOffered(d: ProData, memberIds: string[], now: Date): ProData {
  return memberIds.reduce(
    (acc, id) => patchCare(acc, id, { continuityOfferedAt: now.toISOString() }),
    d,
  );
}

export function continuityMessage(
  member: ProMember,
  item: Pick<ContinuityItem, "from" | "to">,
  when: string,
  sender: string,
  place: string,
): string {
  const start = when ? ` Empezamos ${when}.` : "";
  return `Hola ${firstName(member.name)}, soy ${sender} de ${place}. Ahora que acabas ${item.from.name}, te guardo sitio en ${item.to.name} con el mismo ritmo de clases.${start} ¿Te apunto?`;
}

/* ------------------------------------------------------------------ */
/* Material de cada grupo                                              */
/* ------------------------------------------------------------------ */

export function materialsOf(data: ProData, typeId: string): ProGroupMaterial[] {
  return typeExtra(data, typeId).materials ?? [];
}

/** Acepta "drive.google.com/..." o una URL completa; null si no es un enlace. */
export function normalizeUrl(text: string): string | null {
  const raw = text.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function addMaterial(
  d: ProData,
  typeId: string,
  input: { title: string; url: string },
  id: string,
  now: Date,
): ProData {
  const url = normalizeUrl(input.url);
  const title = input.title.trim();
  if (!url || !title) return d;
  const list = materialsOf(d, typeId);
  return patchTypeExtra(d, typeId, {
    materials: [...list, { id, title, url, addedOn: localDate(now) }],
  });
}

export function removeMaterial(d: ProData, typeId: string, materialId: string): ProData {
  return patchTypeExtra(d, typeId, {
    materials: materialsOf(d, typeId).filter((m) => m.id !== materialId),
  });
}

export function materialsMessage(
  group: string,
  materials: ProGroupMaterial[],
  sender: string,
  place: string,
): string {
  const lines = materials.map((m) => `${m.title}: ${m.url}`).join("\n");
  return `Hola, soy ${sender} de ${place}. Os dejo el material de ${group}:\n${lines}`;
}

/* ------------------------------------------------------------------ */
/* Matrícula                                                           */
/* ------------------------------------------------------------------ */

export function planExtra(data: ProData, planId: string): ProPlanExtra {
  return extrasOf(data).plans?.[planId] ?? {};
}

export function enrollmentFee(data: ProData, planId: string): number {
  return planExtra(data, planId).enrollmentCents ?? 0;
}

export function setEnrollmentFee(d: ProData, planId: string, cents: number): ProData {
  return withExtras(d, (x) => ({
    ...x,
    plans: {
      ...x.plans,
      [planId]: { ...x.plans?.[planId], enrollmentCents: cents > 0 ? cents : undefined },
    },
  }));
}

/** ¿Ya pagó la matrícula alguna vez? Solo se cobra una. */
export function hasPaidEnrollment(data: ProData, memberId: string): boolean {
  return extrasOf(data).charges.some(
    (c) => c.memberId === memberId && c.concept.startsWith("Matrícula") && c.status === "paid",
  );
}

/**
 * Cobra la matrícula del plan con su propio recibo, si el plan la tiene y
 * esa persona no la ha pagado antes. Si no toca, devuelve los datos tal cual.
 */
export function chargeEnrollment(
  d: ProData,
  member: Pick<ProMember, "id" | "name">,
  planId: string,
  method: ProChargeMethod,
  now: Date,
  id: string,
): ProData {
  const fee = enrollmentFee(d, planId);
  if (!fee || hasPaidEnrollment(d, member.id)) return d;
  const plan = d.plans.find((p) => p.id === planId);
  return recordCharge(
    d,
    { id, member, concept: `Matrícula ${plan?.name ?? ""}`.trim(), amountCents: fee, method },
    now,
  );
}

/* ------------------------------------------------------------------ */
/* Norma de recuperaciones                                             */
/* ------------------------------------------------------------------ */

export const DEFAULT_RECOVERY_RULES: ProRecoveryRules = { maxPending: 4 };

export function recoveryRulesOf(data: ProData): ProRecoveryRules {
  return { ...DEFAULT_RECOVERY_RULES, ...extrasOf(data).recoveryRules };
}

export function setRecoveryRules(d: ProData, rules: ProRecoveryRules, days: number): ProData {
  const maxPending = Math.max(1, Math.min(20, Math.round(rules.maxPending)));
  const recoveryDays = Math.max(7, Math.min(120, Math.round(days)));
  return withExtras(d, (x) => ({ ...x, recoveryRules: { maxPending }, recoveryDays }));
}

/**
 * Apunta una clase por recuperar respetando el tope de la academia. Si ya
 * tiene el máximo pendiente, no se añade y se dice por qué.
 */
export function addRecoveryWithRules(
  d: ProData,
  memberId: string,
  sessionId: string,
  missedOn: string,
  id: string,
  now: Date,
): { data: ProData; added: boolean; reason?: "limit" } {
  const pending = pendingRecoveries(d, memberId, now);
  if (pending.some((r) => r.fromSessionId === sessionId)) return { data: d, added: false };
  if (pending.length >= recoveryRulesOf(d).maxPending) {
    return { data: d, added: false, reason: "limit" };
  }
  return { data: addRecovery(d, memberId, sessionId, missedOn, id), added: true };
}

/* ------------------------------------------------------------------ */
/* Tablón del centro                                                   */
/* ------------------------------------------------------------------ */

const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function joinDays(days: number[]): string {
  const names = days.map((d) => WEEKDAY_NAMES[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export type NoticeGroup = {
  id: string;
  name: string;
  category: string;
  level?: string;
  teacher: string;
  capacity: number;
  /** "Lunes y miércoles, 16:00". */
  slots: string[];
};

export type NoticePlan = {
  id: string;
  name: string;
  price: number;
  studentPrice?: number;
  period: string;
  enrollment?: number;
};

export type Noticeboard = { groups: NoticeGroup[]; plans: NoticePlan[] };

/**
 * Lo que va en el tablón del centro: cada grupo con sus días y horas (sacados
 * de las dos próximas semanas del horario), quién lo da, y los precios de
 * cada plan con su matrícula. Todo sale de los datos, nada se escribe a mano.
 */
export function noticeboard(data: ProData, now: Date): Noticeboard {
  const today = localDate(now);
  const until = addDays(today, 14);
  const groups = data.classTypes
    .filter((ct) => ct.active !== false)
    .map((ct): NoticeGroup => {
      const byTime = new Map<number, Set<number>>();
      for (const s of data.sessions) {
        if (s.classTypeId !== ct.id || s.status === "cancelled") continue;
        const day = localDate(s.start);
        if (day < today || day > until) continue;
        const minute = localMinutes(s.start);
        const set = byTime.get(minute) ?? new Set<number>();
        set.add(weekdayIndex(day));
        byTime.set(minute, set);
      }
      const slots = [...byTime.entries()]
        .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]) || a[0] - b[0])
        .map(([minute, days]) => {
          const text = joinDays([...days].sort((a, b) => a - b));
          return `${text.charAt(0).toUpperCase()}${text.slice(1)}, ${minutesToLabel(minute)}`;
        });
      return {
        id: ct.id,
        name: ct.name,
        category: ct.category,
        level: ct.level,
        teacher: data.staff.find((s) => s.id === ct.coachId)?.name ?? "",
        capacity: ct.capacity,
        slots,
      };
    })
    .filter((g) => g.slots.length);
  const plans = data.plans.map(
    (p: ProMembershipPlan): NoticePlan => ({
      id: p.id,
      name: p.name,
      price: p.priceCents,
      studentPrice:
        p.studentPriceCents !== undefined && p.studentPriceCents < p.priceCents
          ? p.studentPriceCents
          : undefined,
      period: PERIOD_LABEL[p.period],
      enrollment: enrollmentFee(data, p.id) || undefined,
    }),
  );
  return { groups, plans };
}

/* ------------------------------------------------------------------ */
/* Previsión del curso entero                                          */
/* ------------------------------------------------------------------ */

export type CourseMonth = {
  /** YYYY-MM. */
  period: string;
  /** Cuotas mensuales que siguen ese mes. */
  recurringCents: number;
  /** Intensivos ya reservados que empiezan ese mes. */
  intensiveCents: number;
  totalCents: number;
  /** Personas que pagan cuota ese mes. */
  paying: number;
  /** Personas en pausa ese mes. */
  paused: number;
  /** Personas que ya han dicho que no siguen el curso que viene. */
  leaving: number;
};

/**
 * Cómo pinta el curso de aquí a agosto con lo que se sabe hoy: las cuotas
 * activas, las pausas con su fecha de vuelta, quien ya ha dicho que no sigue
 * (deja de contar en julio) y los intensivos que ya tienen reservas. No se
 * inventa nada: si nadie ha avisado, el verano sale plano y así se enseña.
 */
export function courseForecast(data: ProData, now: Date): { months: CourseMonth[]; totalCents: number } {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  // El curso acaba en agosto: el de este año si estamos antes de septiembre.
  const endYear = Number(today.slice(5, 7)) >= 9 ? year + 1 : year;
  const last = `${endYear}-08`;
  const priceOf = (m: ProMember) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    if (!plan || plan.period === "pack") return 0;
    return monthlyEquivalent(plan, memberPrice(m, plan));
  };
  const months: CourseMonth[] = [];
  for (let period = monthOf(today); period <= last; period = shiftMonth(period, 1)) {
    let recurringCents = 0;
    let paying = 0;
    let paused = 0;
    let leaving = 0;
    const summer = period.slice(5) === "07" || period.slice(5) === "08";
    for (const m of data.members) {
      const care = careOf(data, m.id);
      const price = priceOf(m);
      if (!price) continue;
      if (m.status === "paused") {
        // Vuelve el mes de su fecha de vuelta y cuenta desde entonces.
        if (care.pausedUntil && monthOf(care.pausedUntil) <= period) {
          recurringCents += price;
          paying++;
        } else paused++;
        continue;
      }
      if (m.status !== "active" && m.status !== "overdue") continue;
      if (summer && care.nextCourse === "declined") {
        leaving++;
        continue;
      }
      recurringCents += price;
      paying++;
    }
    const intensiveCents = data.offers
      .filter(
        (o) =>
          o.kind === "exam" &&
          o.status !== "ended" &&
          o.status !== "draft" &&
          Boolean(o.startsAt) &&
          monthOf(localDate(o.startsAt as string)) === period,
      )
      .reduce((a, o) => a + o.revenueCents, 0);
    months.push({
      period,
      recurringCents,
      intensiveCents,
      totalCents: recurringCents + intensiveCents,
      paying,
      paused,
      leaving,
    });
  }
  return { months, totalCents: months.reduce((a, m) => a + m.totalCents, 0) };
}
