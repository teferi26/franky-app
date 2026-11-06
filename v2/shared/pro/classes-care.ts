import type { ProData, ProMember, ProMembershipPlan, ProVerticalId } from "./types";
import type {
  ProChargeMethod,
  ProClassesExtras,
  ProLeaveReason,
  ProMemberCare,
  ProMemberCharge,
  ProPauseReason,
  ProRecovery,
} from "./classes-types";
import { addDays, atLocal, localDate } from "./format";
import { addMonths, memberPrice, monthlyEquivalent } from "./classes";

/**
 * Cuidado de socios y alumnos: quién se está yendo, los primeros 90 días, las
 * pausas con fecha de vuelta, los bonos que caducan, los cobros del mes y las
 * clases de prueba que hay que cerrar. Funciones puras sobre `ProData`: las
 * pantallas solo pintan y llaman a `update` con lo que devuelven.
 */

/* ------------------------------------------------------------------ */
/* Extras: valores por defecto y lectura segura                        */
/* ------------------------------------------------------------------ */

export function emptyClassExtras(): ProClassesExtras {
  return {
    members: {},
    charges: [],
    receiptSeq: 0,
    waitOffers: [],
    trials: [],
    sessions: {},
    types: {},
    roomBookings: {},
    staff: {},
    policy: { freeChangeHours: 48, lateNoticeVoucher: true, courtesyMin: 10 },
    recoveryDays: 30,
    waitHoldHours: 2,
    reviews: { asked: 0, received: 0 },
  };
}

/** Los extras del espacio o unos vacíos si aún no hay (espacio real nuevo). */
export function extrasOf(data: ProData): ProClassesExtras {
  // Se mezcla con los valores por defecto: un documento guardado antes de una
  // ampliación (o recortado por permisos en el servidor) no trae todo.
  return data.classExtras
    ? { ...emptyClassExtras(), ...data.classExtras }
    : emptyClassExtras();
}

/** Aplica un cambio a los extras y devuelve los datos nuevos. */
export function withExtras(
  d: ProData,
  fn: (x: ProClassesExtras) => ProClassesExtras,
): ProData {
  return { ...d, classExtras: fn(extrasOf(d)) };
}

export function careOf(data: ProData, memberId: string): ProMemberCare {
  return extrasOf(data).members[memberId] ?? {};
}

/** Cambia la ficha de cuidado de un socio sin tocar las demás. */
export function patchCare(
  d: ProData,
  memberId: string,
  changes: Partial<ProMemberCare>,
): ProData {
  return withExtras(d, (x) => ({
    ...x,
    members: { ...x.members, [memberId]: { ...x.members[memberId], ...changes } },
  }));
}

function patchMember(d: ProData, memberId: string, changes: Partial<ProMember>): ProData {
  return {
    ...d,
    members: d.members.map((m) => (m.id === memberId ? { ...m, ...changes } : m)),
  };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** Sesiones que se esperan al mes de un socio según su plan (12 si no lo dice). */
export function monthlyTarget(plan: ProMembershipPlan | undefined): number {
  return plan?.sessions && plan.period !== "pack" ? plan.sessions : 12;
}

/* ------------------------------------------------------------------ */
/* Riesgo de baja                                                      */
/* ------------------------------------------------------------------ */

export type MemberRisk = {
  member: ProMember;
  level: "high" | "medium";
  /** Frase corta que explica por qué, en el idioma del dueño. */
  reason: string;
  daysAway: number | null;
  /** Lleva menos de 90 días: es el tramo donde más gente se va. */
  isNew: boolean;
  contactedAt?: string;
};

/**
 * Quién puede irse. Mira dos señales: días sin venir y asistencia del último
 * mes frente a lo que su plan espera. Los socios nuevos (menos de 90 días)
 * saltan antes porque es cuando más bajas hay.
 */
export function memberRisk(data: ProData, m: ProMember, now: Date): MemberRisk | null {
  if (m.status !== "active" && m.status !== "overdue") return null;
  const today = localDate(now);
  const plan = data.plans.find((p) => p.id === m.planId);
  const care = careOf(data, m.id);
  const isNew = daysBetween(localDate(m.since), today) < 90;
  const daysAway = care.lastVisitAt ? daysBetween(localDate(care.lastVisitAt), today) : null;
  const target = monthlyTarget(plan);
  const low = m.attendanceLast30 < target / 3;
  const awayLimit = isNew ? 7 : 12;

  let level: MemberRisk["level"] | null = null;
  let reason = "";
  if (daysAway !== null && daysAway >= awayLimit * 1.5) {
    level = "high";
    reason = `Lleva ${daysAway} días sin venir`;
  } else if (daysAway !== null && daysAway >= awayLimit) {
    level = isNew ? "high" : "medium";
    reason = `Lleva ${daysAway} días sin venir`;
  } else if (low && m.attendanceLast30 <= 1) {
    level = "high";
    reason = m.attendanceLast30 ? "Solo ha venido una vez este mes" : "No ha venido este mes";
  } else if (low) {
    level = "medium";
    reason = `Ha venido ${m.attendanceLast30} veces este mes, suele venir más`;
  }
  if (!level) return null;
  if (isNew) reason += ", y es nuevo";
  return { member: m, level, reason, daysAway, isNew, contactedAt: care.contactedAt };
}

/**
 * Lista de socios en riesgo, los más urgentes primero. Quien ya recibió un
 * mensaje en la última semana baja al final para no escribirle dos veces.
 */
export function atRiskMembers(data: ProData, now: Date): MemberRisk[] {
  const week = addDays(localDate(now), -7);
  const recent = (r: MemberRisk) => Boolean(r.contactedAt && localDate(r.contactedAt) >= week);
  return data.members
    .map((m) => memberRisk(data, m, now))
    .filter((r): r is MemberRisk => r !== null)
    .sort(
      (a, b) =>
        Number(recent(a)) - Number(recent(b)) ||
        Number(b.level === "high") - Number(a.level === "high") ||
        Number(b.isNew) - Number(a.isNew) ||
        (b.daysAway ?? 0) - (a.daysAway ?? 0),
    );
}

export function wasContactedRecently(risk: MemberRisk, now: Date): boolean {
  return Boolean(risk.contactedAt && localDate(risk.contactedAt) >= addDays(localDate(now), -7));
}

export function markContacted(d: ProData, memberId: string, now: Date): ProData {
  return patchCare(d, memberId, { contactedAt: now.toISOString() });
}

/** Mensaje en primera persona del coach o del profesor, sin tono comercial. */
export function riskMessage(
  vertical: ProVerticalId,
  m: ProMember,
  sender: string,
  place: string,
): string {
  const who = firstName(m.name);
  if (vertical === "academy") {
    return `Hola ${who}, soy ${sender} de ${place}. Hace unos días que no te vemos por clase. ¿Va todo bien? Si te viene mejor otro grupo o necesitas recuperar alguna clase, dímelo y lo buscamos.`;
  }
  return `Hola ${who}, soy ${sender} de ${place}. Te echamos de menos estos días en el box. ¿Va todo bien? Si te cuadra mejor otra hora te guardo sitio en la clase que prefieras.`;
}

/* ------------------------------------------------------------------ */
/* Primeros 90 días                                                    */
/* ------------------------------------------------------------------ */

export const TOUCH_WEEKS = [1, 2, 4, 8, 12] as const;

export type TouchDue = {
  member: ProMember;
  week: (typeof TOUCH_WEEKS)[number];
  /** Día en que tocaba (YYYY-MM-DD). */
  dueOn: string;
  title: string;
};

const TOUCH_TITLE: Record<(typeof TOUCH_WEEKS)[number], string> = {
  1: "Su primera semana",
  2: "Dos semanas: fijar rutina",
  4: "Primer mes",
  8: "Dos meses: siguiente objetivo",
  12: "Tres meses: ya es de la casa",
};

/**
 * Toques del recorrido de bienvenida que tocan hoy o se han quedado atrás esta
 * semana. Cada socio nuevo recibe cinco en sus primeros 90 días; si uno se
 * pasa más de 7 días, se da por perdido y aparece el siguiente.
 */
export function touchesDue(data: ProData, now: Date): TouchDue[] {
  const today = localDate(now);
  const list: TouchDue[] = [];
  for (const m of data.members) {
    if (m.status === "cancelled" || m.status === "paused") continue;
    const start = localDate(m.since);
    if (daysBetween(start, today) > 91) continue;
    const done = new Set(careOf(data, m.id).touchesDone ?? []);
    for (const week of TOUCH_WEEKS) {
      if (done.has(week)) continue;
      const dueOn = addDays(start, week * 7);
      const late = daysBetween(dueOn, today);
      if (late >= 0 && late <= 7) {
        list.push({ member: m, week, dueOn, title: TOUCH_TITLE[week] });
        break;
      }
    }
  }
  return list.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export function markTouchDone(d: ProData, memberId: string, week: number): ProData {
  const done = careOf(d, memberId).touchesDone ?? [];
  return patchCare(d, memberId, { touchesDone: [...new Set([...done, week])].sort((a, b) => a - b) });
}

export function touchMessage(
  vertical: ProVerticalId,
  week: number,
  m: ProMember,
  sender: string,
  place: string,
): string {
  const who = firstName(m.name);
  const hello = `Hola ${who}, soy ${sender} de ${place}.`;
  if (vertical === "academy") {
    switch (week) {
      case 1:
        return `${hello} ¿Qué tal tu primera semana con nosotros? Si algo no ha quedado claro en clase, pregúntame sin miedo.`;
      case 2:
        return `${hello} Llevas dos semanas. ¿Cómo lo ves de cara al examen? Si quieres, repasamos juntos lo que más te cuesta.`;
      case 4:
        return `${hello} Ya llevas un mes. ¿Notas el cambio? Cuéntame qué tal te está yendo.`;
      case 8:
        return `${hello} Dos meses ya. ¿Te preparo un simulacro para ver cómo llegas al examen?`;
      default:
        return `${hello} Tres meses con nosotros. Gracias por la confianza, ¿cómo podemos ayudarte más?`;
    }
  }
  switch (week) {
    case 1:
      return `${hello} ¿Qué tal tu primera semana? Si tienes agujetas es buena señal. ¿Te reservo la clase de mañana?`;
    case 2:
      return `${hello} Dos semanas ya. Lo que más ayuda ahora es fijar dos o tres días fijos. ¿Cuáles te vienen mejor?`;
    case 4:
      return `${hello} ¡Un mes entrenando! ¿Nos marcamos un objetivo para el siguiente?`;
    case 8:
      return `${hello} Dos meses. Se nota el progreso. ¿Quieres que probemos tus marcas esta semana?`;
    default:
      return `${hello} Tres meses con nosotros, ya eres de la casa. Gracias por entrenar aquí.`;
  }
}

/* ------------------------------------------------------------------ */
/* Pausas con fecha de vuelta y bajas                                  */
/* ------------------------------------------------------------------ */

export const PAUSE_REASONS: Record<ProPauseReason, string> = {
  summer: "Verano",
  exams: "Exámenes",
  injury: "Lesión",
  travel: "Viaje o Erasmus",
  other: "Otro motivo",
};

export const LEAVE_REASONS: Record<ProLeaveReason, string> = {
  price: "Precio",
  schedule: "Horario",
  moving: "Se muda",
  injury: "Lesión o salud",
  exams: "Exámenes",
  results: "Ya consiguió su objetivo",
  other: "Otro motivo",
};

/** Fecha de vuelta sugerida para cada motivo de pausa. */
export function suggestedReturn(reason: ProPauseReason, now: Date): string {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (reason) {
    case "summer":
      // Vuelta el 1 de septiembre (el del año que viene si ya pasó).
      return month >= 9 ? `${year + 1}-09-01` : `${year}-09-01`;
    case "exams":
      return addDays(today, 28);
    case "injury":
      return addDays(today, 21);
    case "travel":
      return addDays(today, 60);
    default:
      return addDays(today, 30);
  }
}

export function pauseMember(
  d: ProData,
  memberId: string,
  until: string,
  reason: ProPauseReason,
  now: Date,
  insteadOfLeaving = false,
): ProData {
  const next = patchMember(d, memberId, {
    status: "paused",
    nextChargeAt: null,
    changedAt: now.toISOString(),
  });
  return patchCare(next, memberId, {
    pausedUntil: until,
    pauseReason: reason,
    pausedInsteadOfLeaving: insteadOfLeaving || careOf(d, memberId).pausedInsteadOfLeaving,
  });
}

/** Reactiva una cuota pausada: el próximo cobro es el día de vuelta (u hoy). */
export function resumeMember(d: ProData, memberId: string, now: Date): ProData {
  const today = localDate(now);
  const care = careOf(d, memberId);
  const back = care.pausedUntil && care.pausedUntil > today ? care.pausedUntil : today;
  const member = d.members.find((m) => m.id === memberId);
  const plan = d.plans.find((p) => p.id === member?.planId);
  const next = patchMember(d, memberId, {
    status: "active",
    nextChargeAt: plan?.period === "pack" ? null : atLocal(back, 9 * 60),
    changedAt: undefined,
  });
  return patchCare(next, memberId, { pausedUntil: undefined, pauseReason: undefined });
}

export type PauseReturn = { member: ProMember; returnsOn: string; daysLeft: number; reason?: ProPauseReason };

/** Pausas que vuelven en los próximos `days` días (o que ya tendrían que haber vuelto). */
export function pausesReturning(data: ProData, now: Date, days = 7): PauseReturn[] {
  const today = localDate(now);
  const limit = addDays(today, days);
  return data.members
    .filter((m) => m.status === "paused")
    .map((m) => ({ member: m, care: careOf(data, m.id) }))
    .filter(({ care }) => care.pausedUntil && care.pausedUntil <= limit)
    .map(({ member, care }) => ({
      member,
      returnsOn: care.pausedUntil!,
      daysLeft: daysBetween(today, care.pausedUntil!),
      reason: care.pauseReason,
    }))
    .sort((a, b) => a.returnsOn.localeCompare(b.returnsOn));
}

export function leaveMember(d: ProData, memberId: string, reason: ProLeaveReason, now: Date): ProData {
  const next = patchMember(d, memberId, {
    status: "cancelled",
    nextChargeAt: null,
    changedAt: now.toISOString(),
  });
  return patchCare(next, memberId, { leaveReason: reason, pausedUntil: undefined });
}

/** Bajas de los últimos `days` días por motivo, y cuántas se convirtieron en pausa. */
export function leaveSummary(data: ProData, now: Date, days = 90) {
  const from = addDays(localDate(now), -days);
  const left = data.members.filter(
    (m) => m.status === "cancelled" && localDate(m.changedAt ?? m.since) >= from,
  );
  const byReason = new Map<ProLeaveReason, number>();
  for (const m of left) {
    const r = careOf(data, m.id).leaveReason ?? "other";
    byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  const avoided = data.members.filter((m) => careOf(data, m.id).pausedInsteadOfLeaving).length;
  return {
    total: left.length,
    avoided,
    reasons: [...byReason.entries()]
      .map(([reason, count]) => ({ reason, label: LEAVE_REASONS[reason], count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Exsocios a los que merece la pena escribir: se fueron hace más de un mes y
 * no por mudanza. Septiembre y enero son los meses de volver.
 */
export function winbackCandidates(data: ProData, now: Date) {
  const today = localDate(now);
  const month = Number(today.slice(5, 7));
  const list = data.members
    .filter((m) => m.status === "cancelled")
    .map((m) => ({ member: m, care: careOf(data, m.id) }))
    .filter(({ care }) => care.leaveReason !== "moving")
    .map(({ member, care }) => ({
      member,
      reason: care.leaveReason ? LEAVE_REASONS[care.leaveReason] : null,
      leftOn: localDate(member.changedAt ?? member.since),
      contactedAt: care.winbackAt,
    }))
    .sort((a, b) => b.leftOn.localeCompare(a.leftOn));
  return { season: month === 9 || month === 1, list };
}

export function winbackMessage(m: ProMember, sender: string, place: string, vertical: ProVerticalId): string {
  const who = firstName(m.name);
  if (vertical === "academy") {
    return `Hola ${who}, soy ${sender} de ${place}. Empezamos cuatrimestre y he pensado en ti. Si te hace falta apoyo con alguna asignatura, tienes una clase de prueba gratis para volver cuando quieras.`;
  }
  return `Hola ${who}, soy ${sender} de ${place}. Empieza temporada y nos encantaría volver a verte. Si te animas, esta semana tienes una clase gratis para retomar.`;
}

/* ------------------------------------------------------------------ */
/* Bonos que caducan                                                   */
/* ------------------------------------------------------------------ */

/** Validez por defecto de un bono al renovarlo. */
export const BUNDLE_DAYS = 90;

export type BundleAlert = {
  member: ProMember;
  plan: ProMembershipPlan;
  sessionsLeft: number;
  expiresOn: string | null;
  daysLeft: number | null;
  reason: "sessions" | "date" | "expired";
};

/** Bonos a los que les quedan 2 sesiones o menos, o que caducan en 7 días. */
export function bundlesExpiring(data: ProData, now: Date): BundleAlert[] {
  const today = localDate(now);
  const list: BundleAlert[] = [];
  for (const m of data.members) {
    if (m.status === "cancelled" || m.status === "paused") continue;
    const plan = data.plans.find((p) => p.id === m.planId);
    if (!plan || plan.period !== "pack" || !plan.sessions || plan.sessions < 2) continue;
    const expiresOn = careOf(data, m.id).bundleExpiresOn ?? null;
    const daysLeft = expiresOn ? daysBetween(today, expiresOn) : null;
    const left = m.sessionsLeft ?? 0;
    let reason: BundleAlert["reason"] | null = null;
    if (daysLeft !== null && daysLeft < 0) reason = "expired";
    else if (left <= 2) reason = "sessions";
    else if (daysLeft !== null && daysLeft <= 7) reason = "date";
    if (reason) list.push({ member: m, plan, sessionsLeft: left, expiresOn, daysLeft, reason });
  }
  return list.sort((a, b) => a.sessionsLeft - b.sessionsLeft || (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
}

/* ------------------------------------------------------------------ */
/* Cobros del mes                                                      */
/* ------------------------------------------------------------------ */

export const CHARGE_METHOD_LABEL: Record<ProChargeMethod, string> = {
  card: "Tarjeta",
  bizum: "Bizum",
  cash: "Efectivo",
  transfer: "Transferencia",
  sepa: "Recibo domiciliado",
};

export const CHARGE_METHODS: ProChargeMethod[] = ["card", "bizum", "cash", "transfer", "sepa"];

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
}

export type ChargeSummary = {
  period: string;
  paidCents: number;
  pendingCents: number;
  /** Pendientes cuyo vencimiento ya pasó. */
  lateCents: number;
  returnedCents: number;
  byMethod: { method: ProChargeMethod; label: string; cents: number; count: number }[];
  counts: { paid: number; pending: number; late: number; returned: number };
};

export function isLate(c: ProMemberCharge, today: string): boolean {
  return c.status === "pending" && c.dueOn < today;
}

export function chargesFor(data: ProData, period: string): ProMemberCharge[] {
  return extrasOf(data).charges.filter((c) => c.period === period);
}

export function chargeSummary(data: ProData, period: string, now: Date): ChargeSummary {
  const today = localDate(now);
  const list = chargesFor(data, period);
  const sum = (items: ProMemberCharge[]) => items.reduce((a, c) => a + c.amountCents, 0);
  const paid = list.filter((c) => c.status === "paid");
  const pending = list.filter((c) => c.status === "pending");
  const late = pending.filter((c) => isLate(c, today));
  const returned = list.filter((c) => c.status === "returned");
  const byMethod = CHARGE_METHODS.map((method) => {
    const items = paid.filter((c) => (c.method ?? "card") === method);
    return { method, label: CHARGE_METHOD_LABEL[method], cents: sum(items), count: items.length };
  }).filter((x) => x.count > 0);
  return {
    period,
    paidCents: sum(paid),
    pendingCents: sum(pending),
    lateCents: sum(late),
    returnedCents: sum(returned),
    byMethod,
    counts: { paid: paid.length, pending: pending.length, late: late.length, returned: returned.length },
  };
}

/** Siguiente número de recibo de la serie del año: R2026-0001, R2026-0002... */
export function nextReceiptNo(x: ProClassesExtras, year: string): { no: string; seq: number } {
  const seq = x.receiptSeq + 1;
  return { no: `R${year}-${String(seq).padStart(4, "0")}`, seq };
}

/**
 * Marca una cuota como cobrada: le da número de recibo y, si el socio tenía el
 * pago pendiente, lo pone al día y mueve su próximo cobro un mes.
 */
export function markChargePaid(
  d: ProData,
  chargeId: string,
  method: ProChargeMethod,
  now: Date,
): ProData {
  const x = extrasOf(d);
  const charge = x.charges.find((c) => c.id === chargeId);
  if (!charge || charge.status === "paid") return d;
  const { no, seq } = nextReceiptNo(x, localDate(now).slice(0, 4));
  let next: ProData = {
    ...d,
    classExtras: {
      ...x,
      receiptSeq: seq,
      charges: x.charges.map((c) =>
        c.id === chargeId
          ? { ...c, status: "paid" as const, method, paidAt: now.toISOString(), receiptNo: no }
          : c,
      ),
    },
  };
  const member = d.members.find((m) => m.id === charge.memberId);
  if (member && (member.status === "overdue" || member.status === "active")) {
    const stillOwes = extrasOf(next).charges.some(
      (c) => c.memberId === member.id && c.status !== "paid",
    );
    const base = member.nextChargeAt && localDate(member.nextChargeAt) > charge.dueOn
      ? member.nextChargeAt
      : addMonths(atLocal(charge.dueOn, 9 * 60), 1);
    next = patchMember(next, member.id, {
      status: stillOwes ? member.status : "active",
      nextChargeAt: base,
    });
  }
  return next;
}

export function markChargeReminded(d: ProData, chargeId: string, now: Date): ProData {
  return withExtras(d, (x) => ({
    ...x,
    charges: x.charges.map((c) => (c.id === chargeId ? { ...c, remindedAt: now.toISOString() } : c)),
  }));
}

/**
 * Registra un cobro hecho desde la ficha (alta, renovación, cuota en mano) y
 * lo deja cobrado con su recibo. Devuelve también el id para enseñar el recibo.
 */
export function recordCharge(
  d: ProData,
  input: {
    id: string;
    member: Pick<ProMember, "id" | "name">;
    concept: string;
    amountCents: number;
    method: ProChargeMethod;
  },
  now: Date,
): ProData {
  const x = extrasOf(d);
  const today = localDate(now);
  const { no, seq } = nextReceiptNo(x, today.slice(0, 4));
  const charge: ProMemberCharge = {
    id: input.id,
    memberId: input.member.id,
    memberName: input.member.name,
    period: monthOf(today),
    concept: input.concept,
    amountCents: input.amountCents,
    dueOn: today,
    status: "paid",
    method: input.method,
    paidAt: now.toISOString(),
    receiptNo: no,
  };
  return { ...d, classExtras: { ...x, receiptSeq: seq, charges: [...x.charges, charge] } };
}

/** Recordatorio amable, antes o después del vencimiento. */
export function chargeMessage(c: ProMemberCharge, sender: string, place: string, today: string, amount: string): string {
  const who = firstName(c.memberName);
  if (c.status === "returned") {
    return `Hola ${who}, soy ${sender} de ${place}. Nos ha llegado devuelto el recibo de este mes (${amount}). ¿Te va bien pagarlo por Bizum o en mano la próxima vez que vengas?`;
  }
  if (c.dueOn < today) {
    return `Hola ${who}, soy ${sender} de ${place}. Te recuerdo que tienes pendiente la cuota de este mes (${amount}). Cuando puedas, por Bizum o en mano. ¡Gracias!`;
  }
  return `Hola ${who}, soy ${sender} de ${place}. Te aviso de que el ${c.dueOn.slice(8)}/${c.dueOn.slice(5, 7)} se pasa tu cuota (${amount}). Cualquier cambio, dímelo.`;
}

/** Historial de cobros de una persona, del más reciente al más antiguo. */
export function memberCharges(data: ProData, memberId: string): ProMemberCharge[] {
  return extrasOf(data)
    .charges.filter((c) => c.memberId === memberId)
    .sort((a, b) => b.dueOn.localeCompare(a.dueOn));
}

/* ------------------------------------------------------------------ */
/* Clases de prueba que hay que cerrar                                  */
/* ------------------------------------------------------------------ */

export type TrialFollowUp = {
  bookingId: string;
  sessionId: string;
  clientId?: string;
  clientName: string;
  coachId: string;
  sessionName: string;
  endedAt: string;
  came: boolean;
  student: boolean;
};

/**
 * Pruebas que terminaron en los últimos tres días y todavía no tienen
 * respuesta. Es el momento de preguntar "¿te quedas?".
 */
export function trialsToFollow(data: ProData, now: Date): TrialFollowUp[] {
  const x = extrasOf(data);
  const done = new Set(x.trials.map((t) => t.bookingId));
  const from = now.getTime() - 3 * 86400000;
  const members = new Set(data.members.map((m) => m.clientId));
  return data.bookings
    .filter((b) => b.kind === "class" && (b.trial ?? b.note === "Clase de prueba"))
    .filter((b) => !done.has(b.id) && !(b.clientId && members.has(b.clientId)))
    .filter((b) => {
      const end = new Date(b.end).getTime();
      return end <= now.getTime() && end >= from && b.status !== "cancelled";
    })
    .map((b) => {
      const s = data.sessions.find((x2) => x2.id === b.sessionId);
      const ct = data.classTypes.find((c) => c.id === s?.classTypeId);
      return {
        bookingId: b.id,
        sessionId: b.sessionId ?? "",
        clientId: b.clientId,
        clientName: b.clientName,
        coachId: s?.coachId ?? b.staffId ?? "",
        sessionName: ct?.name ?? "Clase",
        endedAt: b.end,
        came: b.status === "arrived" || b.status === "done",
        student: Boolean(b.student),
      };
    })
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

/** Convierte una prueba en alta: socio nuevo, primer cobro con recibo y resultado guardado. */
export function convertTrial(
  d: ProData,
  trial: TrialFollowUp,
  input: { memberId: string; chargeId: string; planId: string; student: boolean; university?: string; method: ProChargeMethod; phone?: string },
  now: Date,
): ProData {
  const plan = d.plans.find((p) => p.id === input.planId);
  if (!plan) return d;
  const client = d.clients.find((c) => c.id === trial.clientId);
  const member: ProMember = {
    id: input.memberId,
    clientId: trial.clientId ?? input.memberId,
    name: trial.clientName,
    planId: plan.id,
    status: "active",
    nextChargeAt: plan.period === "pack" ? null : addMonths(now.toISOString(), 1),
    sessionsLeft: plan.sessions ?? null,
    since: now.toISOString(),
    attendanceLast30: trial.came ? 1 : 0,
    student: input.student
      ? { university: input.university ?? client?.student?.university ?? "Universidad de Alicante", verified: true }
      : undefined,
    phone: input.phone ?? client?.phone,
    source: client?.source ?? "franky",
  };
  const price = memberPrice(member, plan);
  let next: ProData = { ...d, members: [member, ...d.members] };
  next = recordCharge(next, { id: input.chargeId, member, concept: `Alta ${plan.name}`, amountCents: price, method: input.method }, now);
  if (plan.period === "pack") {
    next = patchCare(next, member.id, { bundleExpiresOn: addDays(localDate(now), BUNDLE_DAYS) });
  }
  return withExtras(next, (x) => ({
    ...x,
    trials: [
      ...x.trials,
      {
        bookingId: trial.bookingId,
        sessionId: trial.sessionId,
        clientName: trial.clientName,
        coachId: trial.coachId,
        outcome: "joined",
        planId: plan.id,
        at: now.toISOString(),
      },
    ],
  }));
}

export function declineTrial(d: ProData, trial: TrialFollowUp, reason: string, now: Date): ProData {
  return withExtras(d, (x) => ({
    ...x,
    trials: [
      ...x.trials,
      {
        bookingId: trial.bookingId,
        sessionId: trial.sessionId,
        clientName: trial.clientName,
        coachId: trial.coachId,
        outcome: "declined",
        reason,
        at: now.toISOString(),
      },
    ],
  }));
}

/** Conversión de pruebas por coach o profesor. */
export function trialConversion(data: ProData) {
  const x = extrasOf(data);
  const by = new Map<string, { joined: number; total: number }>();
  for (const t of x.trials) {
    const row = by.get(t.coachId) ?? { joined: 0, total: 0 };
    row.total += 1;
    if (t.outcome === "joined") row.joined += 1;
    by.set(t.coachId, row);
  }
  const joined = x.trials.filter((t) => t.outcome === "joined").length;
  return {
    total: x.trials.length,
    joined,
    byCoach: [...by.entries()].map(([coachId, v]) => ({ coachId, ...v })),
  };
}

/* ------------------------------------------------------------------ */
/* Previsión del mes que viene                                         */
/* ------------------------------------------------------------------ */

export type ForecastLine = { label: string; cents: number; hint: string };

/**
 * Estimación de lo que entra el mes que viene: cuotas que siguen, pausas que
 * vuelven, bonos que se agotan y se suelen renovar, y pruebas en curso. Es una
 * estimación y así se enseña: cada línea dice de dónde sale.
 */
export function forecastNextMonth(data: ProData, now: Date): { totalCents: number; lines: ForecastLine[]; period: string } {
  const period = shiftMonth(monthOf(localDate(now)), 1);
  const priceOf = (m: ProMember) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    return plan ? monthlyEquivalent(plan, memberPrice(m, plan)) : 0;
  };
  const steady = data.members.filter((m) => m.status === "active" || m.status === "overdue");
  const steadyCents = steady.reduce((a, m) => a + priceOf(m), 0);
  const returning = data.members.filter((m) => {
    const back = careOf(data, m.id).pausedUntil;
    return m.status === "paused" && back && monthOf(back) <= period;
  });
  const returningCents = returning.reduce((a, m) => a + priceOf(m), 0);
  const bundles = bundlesExpiring(data, now);
  // Solo se cuenta la mitad: no todos renuevan, y así la cifra no promete de más.
  const bundleCents = Math.round(
    bundles.reduce((a, b) => a + memberPrice(b.member, b.plan), 0) * 0.5,
  );
  const trials = data.members.filter((m) => m.status === "trial");
  const trialCents = Math.round(trials.reduce((a, m) => a + priceOf(m), 0) * 0.5);
  const lines: ForecastLine[] = [
    { label: "Cuotas que siguen", cents: steadyCents, hint: `${steady.length} personas con cuota activa` },
    { label: "Pausas que vuelven", cents: returningCents, hint: `${returning.length} vuelven antes de fin de mes` },
    { label: "Bonos por renovar", cents: bundleCents, hint: `la mitad de ${bundles.length} bonos que se acaban` },
    { label: "Pruebas en curso", cents: trialCents, hint: `la mitad de ${trials.length} en semana de prueba` },
  ];
  return { period, totalCents: lines.reduce((a, l) => a + l.cents, 0), lines };
}

/* ------------------------------------------------------------------ */
/* Recuperaciones (academias) y no presentados                         */
/* ------------------------------------------------------------------ */

export function pendingRecoveries(data: ProData, memberId: string, now: Date): ProRecovery[] {
  const today = localDate(now);
  return (careOf(data, memberId).recoveries ?? []).filter((r) => !r.usedSessionId && r.expiresOn >= today);
}

/** Crea una recuperación por una falta (si no existe ya para esa clase). */
export function addRecovery(d: ProData, memberId: string, sessionId: string, missedOn: string, id: string): ProData {
  const care = careOf(d, memberId);
  const list = care.recoveries ?? [];
  if (list.some((r) => r.fromSessionId === sessionId)) return d;
  const days = extrasOf(d).recoveryDays;
  return patchCare(d, memberId, {
    recoveries: [...list, { id, fromSessionId: sessionId, missedOn, expiresOn: addDays(missedOn, days) }],
  });
}

/** Descuenta la recuperación más antigua al apuntarle en otra clase. */
export function spendRecovery(d: ProData, memberId: string, sessionId: string, now: Date): ProData {
  const oldest = pendingRecoveries(d, memberId, now).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))[0];
  if (!oldest) return d;
  const list = careOf(d, memberId).recoveries ?? [];
  return patchCare(d, memberId, {
    recoveries: list.map((r) => (r.id === oldest.id ? { ...r, usedSessionId: sessionId } : r)),
  });
}

/** Faltas sin avisar: las guardadas en la ficha más las de las listas de clase. */
export function noShowCount(data: ProData, memberId: string): number {
  const fromLists = data.bookings.filter((b) => b.clientId === memberId && b.status === "no_show").length;
  return (careOf(data, memberId).noShows ?? 0) + fromLists;
}

/* ------------------------------------------------------------------ */
/* Exportación para la gestoría                                        */
/* ------------------------------------------------------------------ */

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const CHARGE_STATUS_LABEL: Record<ProMemberCharge["status"], string> = {
  paid: "Cobrada",
  pending: "Pendiente",
  returned: "Devuelta",
};

/** CSV con separador español (punto y coma y coma decimal) de las cuotas de un mes. */
export function chargesCsv(charges: ProMemberCharge[], cell: (v: string) => string): string {
  const rows = [
    ["Recibo", "Persona", "Concepto", "Mes", "Vence", "Estado", "Forma de pago", "Cobrada el", "Importe (EUR)"],
    ...[...charges]
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.memberName.localeCompare(b.memberName, "es"))
      .map((c) => [
        c.receiptNo ?? "",
        c.memberName,
        c.concept,
        c.period,
        c.dueOn,
        CHARGE_STATUS_LABEL[c.status],
        c.method ? CHARGE_METHOD_LABEL[c.method] : "",
        c.paidAt ? localDate(c.paidAt) : "",
        euros(c.amountCents),
      ]),
  ];
  return rows.map((r) => r.map(cell).join(";")).join("\n");
}
