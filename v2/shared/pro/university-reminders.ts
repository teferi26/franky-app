/**
 * Recordatorio de la cita previa por WhatsApp. No hay envío automático: un
 * toque abre WhatsApp (wa.me) con el texto ya escrito para esa persona y la
 * cita queda marcada como recordada. Con eso se mide si baja la gente que no
 * viene, comparando citas recordadas y sin recordar.
 */

import type { ProUniAppointment, ProUniOfficeSlot } from "./university-types";
import { addDays, dayLabel, localDate, minutesToLabel, pct } from "./format";
import { PRIVACY_MIN_GROUP } from "./university";
import { DESK_LABEL, openDays, type OfficeData } from "./university-office";

/**
 * Móvil en el formato que entiende wa.me (solo dígitos, con prefijo de país).
 * Sin prefijo se entiende de España: 9 cifras que empiezan por 6 o 7. Devuelve
 * null si no parece un móvil.
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  if (!international) {
    return /^[67]\d{8}$/.test(digits) ? `34${digits}` : null;
  }
  if (digits.startsWith("34")) return /^34[67]\d{8}$/.test(digits) ? digits : null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** "600 123 456" o "+44 7700 900123" para enseñarlo en pantalla. */
export function phoneLabel(phone: string): string {
  const digits = normalizePhone(phone);
  if (!digits) return phone;
  if (digits.startsWith("34")) {
    const n = digits.slice(2);
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return `+${digits}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Texto del recordatorio, escrito como lo escribiría alguien del servicio. */
export function reminderText(
  a: Pick<ProUniAppointment, "student" | "date" | "start" | "desk">,
  slot: Pick<ProUniOfficeSlot, "place" | "online"> | undefined,
  spaceName: string,
  now: Date,
): string {
  const today = localDate(now);
  const when =
    a.date === today ? "hoy" : a.date === addDays(today, 1) ? "mañana" : `el ${dayLabel(`${a.date}T12:00:00Z`)}`;
  const where = slot ? (slot.online ? ", por videollamada desde Franky" : `, en ${slot.place}`) : "";
  return [
    `Hola, ${firstName(a.student)}. Te recordamos tu cita ${when} a las ${minutesToLabel(a.start)} en ${spaceName}, mesa de ${DESK_LABEL[a.desk].toLowerCase()}${where}.`,
    "Si al final no puedes venir, anúlala en Franky y el hueco le sirve a otra persona. ¡Hasta pronto!",
  ].join("\n\n");
}

/** Enlace de WhatsApp: con móvil abre su chat; sin móvil, el selector de contacto. */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const to = normalizePhone(phone);
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Marca la cita como recordada. */
export function markReminded(appointments: ProUniAppointment[], id: string, now: Date): ProUniAppointment[] {
  return appointments.map((a) => (a.id === id ? { ...a, remindedAt: now.toISOString() } : a));
}

/** Añade o cambia el móvil de una cita (el que dejó al llamar). */
export function setAppointmentPhone(appointments: ProUniAppointment[], id: string, phone: string): ProUniAppointment[] {
  const clean = phone.trim();
  return appointments.map((a) => (a.id === id ? { ...a, phone: clean || undefined } : a));
}

export type ReminderDay = {
  /** Siguiente día con atención (mañana, o el lunes si hoy es viernes). */
  date: string | null;
  due: ProUniAppointment[];
  reminded: number;
  /** Sin móvil: se les puede escribir desde Franky, no por WhatsApp. */
  withoutPhone: number;
};

/** Citas del siguiente día de atención que aún no se han recordado. */
export function remindersDue(office: OfficeData, now: Date): ReminderDay {
  const today = localDate(now);
  const date = openDays(office, addDays(today, 1), 1)[0] ?? null;
  if (!date) return { date: null, due: [], reminded: 0, withoutPhone: 0 };
  const booked = office.appointments
    .filter((a) => a.date === date && a.status === "booked")
    .sort((a, b) => a.start - b.start);
  const pending = booked.filter((a) => !a.remindedAt);
  return {
    date,
    due: pending,
    reminded: booked.length - pending.length,
    withoutPhone: pending.filter((a) => !normalizePhone(a.phone)).length,
  };
}

export type ReminderEffect = {
  reminded: { total: number; noShowPct: number } | null;
  notReminded: { total: number; noShowPct: number } | null;
};

/**
 * Cuánta gente no vino con y sin recordatorio en las últimas semanas. Cada
 * grupo necesita al menos 10 citas ya pasadas para enseñarse.
 */
export function reminderEffect(appointments: ProUniAppointment[], now: Date, days = 56): ReminderEffect {
  const today = localDate(now);
  const since = addDays(today, -days);
  const past = appointments.filter(
    (a) => a.date >= since && a.date < today && (a.status === "done" || a.status === "no_show"),
  );
  const group = (list: ProUniAppointment[]) =>
    list.length >= PRIVACY_MIN_GROUP
      ? { total: list.length, noShowPct: pct(list.filter((a) => a.status === "no_show").length, list.length) }
      : null;
  return {
    reminded: group(past.filter((a) => a.remindedAt)),
    notReminded: group(past.filter((a) => !a.remindedAt)),
  };
}
