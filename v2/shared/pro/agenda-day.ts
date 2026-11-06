/**
 * El día en el salón: tareas de apertura y cierre, el resumen de cada
 * profesional con los avisos de sus fichas y los colores por tipo de
 * servicio de la agenda.
 *
 * Funciones puras como el resto del motor: calculan o devuelven el `ProData`
 * siguiente; la hora y los identificadores los pone quien llama.
 */
import type {
  ProBooking,
  ProClient,
  ProData,
  ProService,
  ProVerticalId,
} from "./types";
import type {
  ProAgendaOps,
  ProChecklistItem,
  ProChecklistMark,
  ProChecklistMoment,
} from "./agenda-types";
import { bookingsOn, hoursOn, serviceFor } from "./agenda";
import { awaitsClient, firstName, seriesOf } from "./agenda-ops";
import {
  healthAlerts,
  isTechnicalService,
  lastFormula,
  needsPatchTest,
  pendingSignature,
} from "./agenda-clients";
import { activeBundle, bundleRemaining } from "./agenda-money";
import { addDays, dayLabel, time } from "./format";

/* ------------------------------------------------------------------ */
/* Apertura y cierre                                                   */
/* ------------------------------------------------------------------ */

type Seed = [ProChecklistMoment, string];

const HAIR_CHECKLIST: Seed[] = [
  ["open", "Luces, música y climatización"],
  ["open", "Revisar la agenda del día y las fichas con aviso"],
  ["open", "Toallas y capas limpias en cada puesto"],
  ["open", "Cambio en la caja"],
  ["close", "Desinfectar tijeras, peines y máquinas"],
  ["close", "Barrer y limpiar puestos y lavacabezas"],
  ["close", "Poner la lavadora de toallas"],
  ["close", "Cuadrar la caja"],
  ["close", "Apagar secadores, planchas y luces"],
];

const BEAUTY_CHECKLIST: Seed[] = [
  ["open", "Encender cabinas, calentador de cera y climatización"],
  ["open", "Revisar la agenda del día y las fichas con aviso"],
  ["open", "Camillas con papel y toallas limpias"],
  ["open", "Esterilizador en marcha"],
  ["close", "Esterilizar el instrumental y limpiar las lámparas"],
  ["close", "Limpiar cabinas y cambiar el papel de camilla"],
  ["close", "Apagar la máquina de láser y el calentador de cera"],
  ["close", "Cuadrar la caja"],
  ["close", "Apuntar el material que falta"],
];

/** Lista con la que empieza cada negocio; se cambia en Ajustes. */
export function defaultChecklist(vertical: ProVerticalId): ProChecklistItem[] {
  const seed = vertical === "beauty" ? BEAUTY_CHECKLIST : HAIR_CHECKLIST;
  return seed.map(([moment, label], index) => ({
    id: `ck${index + 1}`,
    label,
    moment,
  }));
}

export function checklistItems(
  ops: Pick<ProAgendaOps, "checklist"> | null | undefined,
  vertical: ProVerticalId,
  moment?: ProChecklistMoment,
): ProChecklistItem[] {
  const items = ops?.checklist ?? defaultChecklist(vertical);
  return moment ? items.filter((item) => item.moment === moment) : items;
}

/**
 * Qué toca a esta hora: la apertura hasta la mitad de la jornada y el cierre
 * después. Un día cerrado no tiene ni una cosa ni otra.
 */
export function checklistMoment(
  data: ProData,
  date: string,
  nowMinute: number,
): ProChecklistMoment | null {
  const hours = hoursOn(data, date);
  if (!hours) return null;
  return nowMinute < (hours.open + hours.close) / 2 ? "open" : "close";
}

export function marksOn(
  ops: Pick<ProAgendaOps, "checklistLog"> | null | undefined,
  date: string,
): ProChecklistMark[] {
  return (ops?.checklistLog ?? []).filter((mark) => mark.date === date);
}

export function checklistProgress(
  items: ProChecklistItem[],
  marks: ProChecklistMark[],
): { done: number; total: number } {
  const ids = new Set(marks.map((mark) => mark.itemId));
  return {
    done: items.filter((item) => ids.has(item.id)).length,
    total: items.length,
  };
}

/** Días de historial que se guardan: suficiente para revisar el mes. */
export const CHECKLIST_KEEP_DAYS = 45;

/**
 * Marca o desmarca una tarea de ese día. Al marcar se apunta quién y cuándo;
 * de paso se olvidan las marcas de hace más de 45 días.
 */
export function toggleCheck(
  data: ProData,
  input: { itemId: string; date: string; at: string; staffId?: string },
): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  const oldest = addDays(input.date, -CHECKLIST_KEEP_DAYS);
  const log = (ops.checklistLog ?? []).filter((mark) => mark.date >= oldest);
  const done = log.some(
    (mark) => mark.itemId === input.itemId && mark.date === input.date,
  );
  const next = done
    ? log.filter(
        (mark) => !(mark.itemId === input.itemId && mark.date === input.date),
      )
    : [
        ...log,
        {
          itemId: input.itemId,
          date: input.date,
          at: input.at,
          ...(input.staffId ? { staffId: input.staffId } : {}),
        },
      ];
  return { ...data, agendaOps: { ...ops, checklistLog: next } };
}

/** Guarda la lista del negocio: sin tareas vacías ni repetidas. */
export function saveChecklist(
  data: ProData,
  items: ProChecklistItem[],
): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  const seen = new Set<string>();
  const clean = items
    .map((item) => ({ ...item, label: item.label.trim() }))
    .filter((item) => {
      const key = `${item.moment}:${item.label.toLowerCase()}`;
      if (!item.label || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { ...data, agendaOps: { ...ops, checklist: clean } };
}

/* ------------------------------------------------------------------ */
/* Resumen del día de cada profesional                                 */
/* ------------------------------------------------------------------ */

export type BriefTone = "danger" | "warning" | "violet" | "neutral";

export type BriefFlag = { label: string; tone: BriefTone };

export type BriefRow = {
  booking: ProBooking;
  service?: ProService;
  client?: ProClient;
  flags: BriefFlag[];
  /** Hay algo de salud en la ficha: se mira antes de empezar. */
  health: boolean;
};

/**
 * Avisos de una cita para quien la va a hacer: salud, prueba pendiente,
 * firma, señal, bono, primera visita, estudiante y preferencias. Primero lo
 * urgente, al final lo que solo ayuda a tratarle bien.
 */
export function bookingFlags(
  data: ProData,
  booking: ProBooking,
  date: string,
): BriefFlag[] {
  const client = data.clients.find((row) => row.id === booking.clientId);
  const service = serviceFor(data, booking);
  const flags: BriefFlag[] = [];
  for (const alert of healthAlerts(client))
    flags.push({ label: alert, tone: "danger" });
  if (needsPatchTest(data, client, service, date))
    flags.push({ label: "Sin prueba de sensibilidad", tone: "warning" });
  const consent = pendingSignature(data, client, service);
  if (consent)
    flags.push({ label: `Falta firmar: ${consent.title}`, tone: "warning" });
  if (booking.agenda?.deposit?.status === "pending")
    flags.push({ label: "Señal sin cobrar", tone: "warning" });
  if (data.agendaOps && awaitsClient(booking))
    flags.push({ label: "Sin confirmar", tone: "warning" });
  if (!client || client.visits === 0)
    flags.push({ label: "Primera visita", tone: "violet" });
  if (booking.student) flags.push({ label: "Estudiante", tone: "violet" });
  const bundle = activeBundle(data, client?.id, service?.id, date);
  if (bundle)
    flags.push({
      label:
        bundleRemaining(bundle) === 1
          ? "Última sesión del bono"
          : `Bono: quedan ${bundleRemaining(bundle)}`,
      tone: "violet",
    });
  const helper = booking.resourceIds?.find((id) => id !== booking.staffId);
  if (helper) {
    const person = data.staff.find((row) => row.id === helper);
    if (person)
      flags.push({ label: `Con ${firstName(person.name)}`, tone: "neutral" });
  }
  if (isTechnicalService(service)) {
    const formula = lastFormula(client);
    if (formula)
      flags.push({ label: `Última fórmula: ${formula.mix}`, tone: "neutral" });
  }
  for (const tag of client?.tags.slice(0, 2) ?? [])
    flags.push({ label: tag, tone: "neutral" });
  return flags;
}

/** Citas del día de una persona (como titular o como ayudante) con sus avisos. */
export function staffDayBrief(
  data: ProData,
  date: string,
  staffId: string,
): BriefRow[] {
  return bookingsOn(data, date, staffId)
    .filter((booking) => booking.status !== "no_show")
    .map((booking) => {
      const client = data.clients.find((row) => row.id === booking.clientId);
      return {
        booking,
        service: serviceFor(data, booking),
        client,
        flags: bookingFlags(data, booking, date),
        health: healthAlerts(client).length > 0,
      };
    });
}

/** Cuántas citas del día tienen algo que mirar antes (salud, prueba, firma). */
export function briefWarnings(rows: BriefRow[]): number {
  return rows.filter((row) =>
    row.flags.some((flag) => flag.tone === "danger" || flag.tone === "warning"),
  ).length;
}

/**
 * Texto para mandar a la persona por WhatsApp. Los datos de salud no salen
 * del salón: se dice "mira su ficha antes" y el detalle se ve en Franky.
 */
export function briefText(
  data: ProData,
  date: string,
  staffId: string,
): string {
  const person = data.staff.find((row) => row.id === staffId);
  const rows = staffDayBrief(data, date, staffId);
  const day = dayLabel(`${date}T12:00:00Z`);
  const who = person ? `${firstName(person.name)}, así` : "Así";
  const head = `${who} va tu día (${day}):`;
  if (!rows.length)
    return `${person ? `${firstName(person.name)}, ` : ""}el ${day} no tienes citas.`;
  const lines = rows.map((row) => {
    const notes: string[] = [];
    if (row.health) notes.push("mira su ficha antes");
    for (const flag of row.flags) {
      if (flag.tone === "danger") continue;
      if (flag.label === "Sin confirmar" || flag.label === "Señal sin cobrar")
        continue;
      notes.push(flag.label.charAt(0).toLowerCase() + flag.label.slice(1));
    }
    const service = row.service?.name ?? "Cita";
    return [
      `${time(row.booking.start)} ${firstName(row.booking.clientName)}`,
      service,
      ...(notes.length ? [notes.join(", ")] : []),
    ].join(" · ");
  });
  return [head, ...lines].join("\n");
}

/* ------------------------------------------------------------------ */
/* Plan de sesiones                                                    */
/* ------------------------------------------------------------------ */

/** "Sesión 3 de 6" de una cita fija o de un plan (sin contar las canceladas). */
export function seriesPosition(
  data: ProData,
  booking: ProBooking,
): { index: number; total: number } | null {
  const seriesId = booking.agenda?.seriesId;
  if (!seriesId) return null;
  const list = seriesOf(data, seriesId).filter(
    (row) => row.status !== "cancelled",
  );
  const index = list.findIndex((row) => row.id === booking.id);
  return index === -1 ? null : { index: index + 1, total: list.length };
}

export type ClientPlan = {
  seriesId: string;
  service?: ProService;
  done: number;
  total: number;
  next?: ProBooking;
};

/**
 * Planes en marcha de una ficha: cuántas sesiones lleva y cuál es la
 * siguiente. Solo los que aún tienen alguna cita por delante.
 */
export function clientPlans(
  data: ProData,
  clientId: string,
  now: Date,
): ClientPlan[] {
  const ids = new Set(
    data.bookings
      .filter((row) => row.clientId === clientId && row.agenda?.seriesId)
      .map((row) => row.agenda!.seriesId!),
  );
  const out: ClientPlan[] = [];
  for (const seriesId of ids) {
    const list = seriesOf(data, seriesId).filter(
      (row) => row.status !== "cancelled",
    );
    const next = list.find(
      (row) =>
        Date.parse(row.end) > now.getTime() &&
        row.status !== "done" &&
        row.status !== "no_show",
    );
    if (!next) continue;
    out.push({
      seriesId,
      service: serviceFor(data, list[0]),
      done: list.filter((row) => row.status === "done").length,
      total: list.length,
      next,
    });
  }
  return out.sort((a, b) =>
    (a.next?.start ?? "").localeCompare(b.next?.start ?? ""),
  );
}

/* ------------------------------------------------------------------ */
/* Colores por tipo de servicio                                        */
/* ------------------------------------------------------------------ */

/** Categorías de la carta en el orden en que aparecen. */
export function serviceCategories(services: ProService[]): string[] {
  const out: string[] = [];
  for (const service of services) {
    const category = service.category.trim();
    if (category && !out.includes(category)) out.push(category);
  }
  return out;
}

/**
 * Posición de la categoría de una cita en la leyenda (o -1 si no tiene).
 * La pantalla la convierte en color: así cada tipo conserva el suyo mientras
 * no cambie la carta.
 */
export function categoryIndex(
  data: ProData,
  booking: Pick<ProBooking, "serviceId">,
): number {
  const service = serviceFor(data, booking);
  if (!service) return -1;
  return serviceCategories(data.services).indexOf(service.category.trim());
}
