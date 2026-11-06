/**
 * Grupos en la agenda: graduaciones, orlas, clubes y fiestas de facultad.
 *
 * Una petición de grupo se convierte en un horario montado: una cita por
 * persona, repartidas entre los profesionales elegidos y colocadas en los
 * primeros huecos reales de la agenda a partir de la hora que pidieron.
 */
import type { ProBooking, ProData, ProGroupRequest } from "./types";
import { durationFor, isoFor, startTimes } from "./agenda";
import { localDate, localMinutes, minutesToLabel } from "./format";

export type GroupSlot = {
  /** Posición en la lista de nombres (0 = primera persona). */
  index: number;
  staffId: string;
  minute: number;
};

export type GroupPlan = {
  date: string;
  slots: GroupSlot[];
  /** Personas que no caben ese día con esos profesionales. */
  missing: number;
  /** Hora a la que termina la última cita, si hay alguna. */
  endMinute: number | null;
};

export type GroupPlanInput = {
  date: string;
  fromMinute: number;
  serviceId: string;
  people: number;
  staffIds: string[];
};

/** Cita de trabajo para ir ocupando la agenda mientras se planifica. */
function draftBooking(
  input: GroupPlanInput,
  slot: GroupSlot,
  duration: number,
): ProBooking {
  return {
    id: `plan-${slot.index}`,
    kind: "appointment",
    clientName: "",
    staffId: slot.staffId,
    serviceId: input.serviceId,
    start: isoFor(input.date, slot.minute),
    end: isoFor(input.date, slot.minute + duration),
    partySize: 1,
    status: "confirmed",
    priceCents: 0,
    paidCents: 0,
    source: "grupo",
  };
}

/**
 * Coloca a cada persona en el primer hueco libre de cualquiera de los
 * profesionales elegidos. Cada cita planificada ocupa la agenda para la
 * siguiente, así que nunca se pisan entre ellas ni con lo que ya había.
 */
export function groupPlan(data: ProData, input: GroupPlanInput): GroupPlan {
  const service = data.services.find((row) => row.id === input.serviceId);
  const people = Math.max(0, Math.floor(input.people));
  if (!service || !input.staffIds.length || !people)
    return { date: input.date, slots: [], missing: people, endMinute: null };

  let working: ProData = data;
  const slots: GroupSlot[] = [];
  for (let index = 0; index < people; index++) {
    let best: GroupSlot | null = null;
    for (const staffId of input.staffIds) {
      const first = startTimes(
        working,
        input.date,
        staffId,
        durationFor(service, staffId),
        input.fromMinute,
        undefined,
        service.id,
      )[0];
      if (first === undefined) continue;
      // A igual hora, quien lleva menos citas del grupo: reparto equilibrado.
      const load = (id: string) => slots.filter((s) => s.staffId === id).length;
      if (
        !best ||
        first < best.minute ||
        (first === best.minute && load(staffId) < load(best.staffId))
      )
        best = { index, staffId, minute: first };
    }
    if (!best) break;
    slots.push(best);
    working = {
      ...working,
      bookings: [
        ...working.bookings,
        draftBooking(input, best, durationFor(service, best.staffId)),
      ],
    };
  }
  const endMinute = slots.length
    ? Math.max(
        ...slots.map(
          (slot) => slot.minute + durationFor(service, slot.staffId),
        ),
      )
    : null;
  return {
    date: input.date,
    slots,
    missing: people - slots.length,
    endMinute,
  };
}

/** Nombres pegados de una lista (uno por línea o separados por comas). */
export function parseNames(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Nombre de cada cita: el de la lista o "Grupo 3" si faltan nombres. */
export function groupMemberName(
  request: Pick<ProGroupRequest, "organization">,
  names: string[],
  index: number,
): string {
  return names[index] ?? `${request.organization} ${index + 1}`;
}

export type CreateGroupInput = {
  request: ProGroupRequest;
  plan: GroupPlan;
  serviceId: string;
  names: string[];
  perPersonCents: number;
  /** Un id por cita, en el mismo orden que `plan.slots`. */
  ids: string[];
};

/** Guarda las citas del grupo y marca la petición como aceptada. */
export function createGroupBookings(
  data: ProData,
  input: CreateGroupInput,
): ProData {
  const service = data.services.find((row) => row.id === input.serviceId);
  if (!service || !input.plan.slots.length) return data;
  const bookings: ProBooking[] = input.plan.slots.map((slot, i) => ({
    id: input.ids[i],
    kind: "appointment",
    clientName: groupMemberName(input.request, input.names, slot.index),
    staffId: slot.staffId,
    serviceId: service.id,
    start: isoFor(input.plan.date, slot.minute),
    end: isoFor(
      input.plan.date,
      slot.minute + durationFor(service, slot.staffId),
    ),
    partySize: 1,
    status: "confirmed",
    priceCents: input.perPersonCents,
    paidCents: 0,
    source: "grupo",
    note: `${input.request.kind}, ${input.request.organization}`,
    agenda: { groupId: input.request.id },
  }));
  return {
    ...data,
    bookings: [...data.bookings, ...bookings],
    groupRequests: data.groupRequests.map((row) =>
      row.id === input.request.id
        ? {
            ...row,
            status: "accepted" as const,
            quoteCents: input.perPersonCents,
          }
        : row,
    ),
  };
}

/** Citas ya montadas de un grupo. */
export function groupBookings(data: ProData, groupId: string): ProBooking[] {
  return data.bookings
    .filter(
      (booking) =>
        booking.agenda?.groupId === groupId && booking.status !== "cancelled",
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Horario para mandar al organizador: una línea por persona. */
export function groupScheduleText(
  data: ProData,
  request: ProGroupRequest,
  bookings: ProBooking[],
): string {
  const staffName = (id?: string) =>
    data.staff.find((row) => row.id === id)?.name.split(" ")[0] ?? "";
  const date = bookings[0] ? localDate(bookings[0].start) : "";
  const lines = bookings.map(
    (booking) =>
      `${minutesToLabel(localMinutes(booking.start))} ${booking.clientName}, con ${staffName(booking.staffId)}`,
  );
  return [
    `Hola ${request.organizer.split(" ")[0]}, este es el horario de ${request.organization} en ${data.space.name}${date ? ` el ${date.split("-").reverse().join("/")}` : ""}:`,
    "",
    ...lines,
    "",
    "Si alguien necesita cambiar su hora, escríbenos y lo movemos.",
  ].join("\n");
}
