/**
 * Atención al estudiante con cita previa y contador de "Pedir ayuda".
 *
 * El servicio publica franjas semanales (becas los martes de 10:00 a 13:00,
 * por ejemplo). Cada franja se parte en huecos de `minutes` minutos; el
 * estudiante pide uno desde Franky y el equipo ve la agenda del día.
 *
 * Funciones puras: las usan la web, la app nativa y los tests. Los datos se
 * leen con `officeOf()`, que devuelve listas vacías si el espacio aún no los
 * tiene (un espacio real o una demo guardada antes de que existieran).
 */

import type { ProData } from "./types";
import type {
  ProUniAppointment,
  ProUniAppointmentStatus,
  ProUniDesk,
  ProUniExtras,
  ProUniHelpWeek,
  ProUniOfficeSlot,
} from "./university-types";
import { addDays, localDate, localMinutes, pct, weekdayIndex } from "./format";
import { PRIVACY_MIN_GROUP, uniExtrasOf } from "./university";

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export type OfficeData = {
  slots: ProUniOfficeSlot[];
  appointments: ProUniAppointment[];
  helpWeeks: ProUniHelpWeek[];
};

export function officeOf(data: Pick<ProData, "uniExtras">): OfficeData {
  const extras = uniExtrasOf(data);
  return {
    slots: extras.officeSlots ?? [],
    appointments: extras.appointments ?? [],
    helpWeeks: extras.helpWeeks ?? [],
  };
}

/** Aplica un cambio sobre las franjas y las citas sin tocar el resto. */
export function withOffice(
  data: ProData,
  fn: (office: OfficeData) => Partial<OfficeData>,
): ProData {
  const extras: ProUniExtras = uniExtrasOf(data);
  const next = fn(officeOf(data));
  return {
    ...data,
    uniExtras: {
      ...extras,
      officeSlots: next.slots ?? extras.officeSlots ?? [],
      appointments: next.appointments ?? extras.appointments ?? [],
      helpWeeks: next.helpWeeks ?? extras.helpWeeks ?? [],
    },
  };
}

export const DESK_LABEL: Record<ProUniDesk, string> = {
  general: "Atención general",
  becas: "Becas y ayudas",
  alojamiento: "Alojamiento",
  internacional: "Internacional y Erasmus",
  matricula: "Matrícula y secretaría",
};

export const DESK_ORDER: ProUniDesk[] = [
  "general",
  "becas",
  "matricula",
  "alojamiento",
  "internacional",
];

export const WEEKDAY_LABEL = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export const APPOINTMENT_STATUS_LABEL: Record<ProUniAppointmentStatus, string> = {
  booked: "Pendiente",
  done: "Atendida",
  no_show: "No vino",
  cancelled: "Cancelada",
};

/* ------------------------------------------------------------------ */
/* Franjas                                                             */
/* ------------------------------------------------------------------ */

/** Minutos de inicio de cada hueco de una franja. */
export function slotTimes(slot: Pick<ProUniOfficeSlot, "start" | "end" | "minutes">): number[] {
  const step = Math.max(5, slot.minutes);
  const times: number[] = [];
  for (let t = slot.start; t + step <= slot.end; t += step) times.push(t);
  return times;
}

/** Huecos por semana que ofrece una franja. */
export function slotCapacity(slot: ProUniOfficeSlot): number {
  return slotTimes(slot).length;
}

/** Franjas publicadas un día concreto, por hora de inicio. */
export function slotsForDate(slots: ProUniOfficeSlot[], date: string): ProUniOfficeSlot[] {
  const weekday = weekdayIndex(date);
  return slots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.start - b.start || a.desk.localeCompare(b.desk));
}

/**
 * Franjas que chocan con otra: misma persona el mismo día a la vez. Dos mesas
 * distintas a la misma hora sí pueden convivir si las atienden personas
 * distintas.
 */
export function slotConflicts(
  slots: ProUniOfficeSlot[],
  candidate: Omit<ProUniOfficeSlot, "id"> & { id?: string },
): ProUniOfficeSlot[] {
  const who = candidate.staff.trim().toLowerCase();
  return slots.filter(
    (s) =>
      s.id !== candidate.id &&
      s.weekday === candidate.weekday &&
      s.staff.trim().toLowerCase() === who &&
      s.start < candidate.end &&
      candidate.start < s.end,
  );
}

/** Motivo por el que una franja nueva no es válida, o null si se puede publicar. */
export function slotProblem(
  slots: ProUniOfficeSlot[],
  candidate: Omit<ProUniOfficeSlot, "id"> & { id?: string },
): string | null {
  if (!candidate.staff.trim()) return "Falta quién atiende.";
  if (!candidate.place.trim()) return candidate.online ? "Falta el enlace de la videollamada." : "Falta el lugar.";
  if (candidate.end <= candidate.start) return "La franja tiene que terminar después de empezar.";
  if (slotTimes(candidate).length === 0) return "No cabe ninguna cita con esa duración.";
  const clash = slotConflicts(slots, candidate)[0];
  if (clash) {
    return `${candidate.staff.trim()} ya atiende ${DESK_LABEL[clash.desk].toLowerCase()} a esa hora.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Agenda del día                                                      */
/* ------------------------------------------------------------------ */

/** Un hueco de la agenda: libre, con cita o ya pasado sin cita. */
export type OfficeCell = {
  slotId: string;
  date: string;
  start: number;
  end: number;
  appointment: ProUniAppointment | null;
  /** Ya ha empezado (no se puede dar a nadie). */
  past: boolean;
};

export type OfficeColumn = { slot: ProUniOfficeSlot; cells: OfficeCell[] };

/** Citas que ocupan un hueco (las canceladas lo liberan). */
function occupying(a: ProUniAppointment): boolean {
  return a.status !== "cancelled";
}

/** La agenda de un día: una columna por franja, un hueco por cita posible. */
export function dayAgenda(office: OfficeData, date: string, now: Date): OfficeColumn[] {
  const today = localDate(now);
  const nowMinutes = localMinutes(now);
  const byKey = new Map<string, ProUniAppointment>();
  for (const a of office.appointments) {
    if (a.date === date && occupying(a)) byKey.set(`${a.slotId}:${a.start}`, a);
  }
  return slotsForDate(office.slots, date).map((slot) => ({
    slot,
    cells: slotTimes(slot).map((start) => ({
      slotId: slot.id,
      date,
      start,
      end: start + slot.minutes,
      appointment: byKey.get(`${slot.id}:${start}`) ?? null,
      past: date < today || (date === today && start < nowMinutes),
    })),
  }));
}

export type DaySummary = {
  capacity: number;
  booked: number;
  done: number;
  noShow: number;
  /** Huecos libres que aún se pueden dar. */
  free: number;
  /** Primera cita pendiente a partir de ahora. */
  next: OfficeCell | null;
};

export function daySummary(columns: OfficeColumn[]): DaySummary {
  const cells = columns.flatMap((c) => c.cells).sort((a, b) => a.start - b.start);
  const withAppointment = cells.filter((c) => c.appointment);
  return {
    capacity: cells.length,
    booked: withAppointment.filter((c) => c.appointment?.status === "booked").length,
    done: withAppointment.filter((c) => c.appointment?.status === "done").length,
    noShow: withAppointment.filter((c) => c.appointment?.status === "no_show").length,
    free: cells.filter((c) => !c.appointment && !c.past).length,
    next: cells.find((c) => c.appointment?.status === "booked" && !c.past) ?? null,
  };
}

/** ¿Está libre ese hueco? Evita dar dos veces la misma hora. */
export function isCellFree(
  appointments: ProUniAppointment[],
  slotId: string,
  date: string,
  start: number,
): boolean {
  return !appointments.some(
    (a) => a.slotId === slotId && a.date === date && a.start === start && occupying(a),
  );
}

/**
 * Apunta una cita en un hueco libre. Devuelve la lista nueva o null si el
 * hueco ya está dado (dos personas del equipo a la vez).
 */
export function bookAppointment(
  appointments: ProUniAppointment[],
  input: Omit<ProUniAppointment, "status" | "createdAt">,
  now: Date,
): ProUniAppointment[] | null {
  if (!isCellFree(appointments, input.slotId, input.date, input.start)) return null;
  return [...appointments, { ...input, status: "booked", createdAt: now.toISOString() }];
}

export function setAppointmentStatus(
  appointments: ProUniAppointment[],
  id: string,
  status: ProUniAppointmentStatus,
): ProUniAppointment[] {
  return appointments.map((a) => (a.id === id ? { ...a, status } : a));
}

/** Carga de cada día de la semana que empieza el lunes `monday`. */
export function weekLoad(office: OfficeData, monday: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const capacity = slotsForDate(office.slots, date).reduce((a, s) => a + slotCapacity(s), 0);
    const booked = office.appointments.filter((a) => a.date === date && occupying(a)).length;
    return { date, capacity, booked };
  });
}

/** Días con franjas a partir de hoy, para elegir en la agenda. */
export function openDays(office: OfficeData, from: string, count = 10): string[] {
  const weekdays = new Set(office.slots.map((s) => s.weekday));
  if (!weekdays.size) return [];
  const days: string[] = [];
  for (let i = 0; days.length < count && i < 60; i++) {
    const date = addDays(from, i);
    if (weekdays.has(weekdayIndex(date))) days.push(date);
  }
  return days;
}

/** Temas más pedidos en las últimas semanas, por mesa. */
export function demandByDesk(appointments: ProUniAppointment[], now: Date, days = 28) {
  const from = addDays(localDate(now), -days);
  const counts = new Map<ProUniDesk, number>();
  for (const a of appointments) {
    if (a.date < from || a.status === "cancelled") continue;
    counts.set(a.desk, (counts.get(a.desk) ?? 0) + 1);
  }
  return DESK_ORDER.map((desk) => ({ desk, count: counts.get(desk) ?? 0 }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Porcentaje de citas pasadas a las que no vino nadie. */
export function noShowRate(appointments: ProUniAppointment[], now: Date, days = 28): number {
  const today = localDate(now);
  const from = addDays(today, -days);
  const closed = appointments.filter(
    (a) => a.date >= from && a.date <= today && (a.status === "done" || a.status === "no_show"),
  );
  return pct(closed.filter((a) => a.status === "no_show").length, closed.length);
}

/* ------------------------------------------------------------------ */
/* Pedir ayuda: contador semanal                                       */
/* ------------------------------------------------------------------ */

/** Lunes de la semana de una fecha. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** Las últimas `count` semanas (la actual incluida), con 0 si no hubo datos. */
export function helpSeries(weeks: ProUniHelpWeek[], now: Date, count = 8): ProUniHelpWeek[] {
  const current = weekStart(localDate(now));
  const byWeek = new Map(weeks.map((w) => [w.week, w.presses]));
  return Array.from({ length: count }, (_, i) => {
    const week = addDays(current, -7 * (count - 1 - i));
    return { week, presses: byWeek.get(week) ?? 0 };
  });
}

export type HelpTrend = {
  /** Semana en curso. */
  current: number;
  /** Semana anterior completa. */
  previous: number;
  /** Media de las cuatro semanas anteriores a la actual. */
  average: number;
  /** Diferencia con la media, en %. null si no hay base. */
  deltaPct: number | null;
  /** Por debajo del umbral de privacidad no se enseña la cifra exacta. */
  hidden: boolean;
};

export function helpTrend(weeks: ProUniHelpWeek[], now: Date): HelpTrend {
  const series = helpSeries(weeks, now, 5);
  const current = series[4].presses;
  const base = series.slice(0, 4).map((w) => w.presses);
  const average = Math.round(base.reduce((a, b) => a + b, 0) / base.length);
  return {
    current,
    previous: series[3].presses,
    average,
    deltaPct: average ? Math.round(((current - average) / average) * 100) : null,
    hidden: current < PRIVACY_MIN_GROUP,
  };
}

/** Texto de una cifra semanal respetando el umbral de privacidad. */
export function helpCountLabel(presses: number): string {
  return presses < PRIVACY_MIN_GROUP
    ? `Menos de ${PRIVACY_MIN_GROUP}`
    : presses.toLocaleString("es-ES");
}
