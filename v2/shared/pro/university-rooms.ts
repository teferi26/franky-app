/**
 * Espacios para asociaciones: aulas y salas del campus que las asociaciones
 * piden, el servicio aprueba o rechaza, y que al aprobarse pasan a ser una
 * actividad más (calendario del curso y aviso de choques).
 *
 * Lo que ocupa una sala sale de dos sitios: las reservas (aprobadas o
 * pedidas) y las actividades de asociaciones apuntadas en ese mismo lugar sin
 * pasar por una reserva. Así una sala no se da dos veces aunque la actividad
 * se apuntara antes de que existiera esta pantalla.
 *
 * Funciones puras: las usan la web, la app nativa y los tests.
 */

import type { ProData } from "./types";
import type { ProUniAssocActivity, ProUniRoom, ProUniRoomBooking } from "./university-types";
import { addDays, atLocal, localDate, localMinutes, minutesToLabel, pct, weekdayIndex } from "./format";
import { uniExtrasOf } from "./university";

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export type RoomsData = {
  rooms: ProUniRoom[];
  bookings: ProUniRoomBooking[];
  activities: ProUniAssocActivity[];
};

/** Salas, reservas y actividades del espacio (listas vacías si aún no las tiene). */
export function roomsOf(data: Pick<ProData, "uniExtras">): RoomsData {
  const x = uniExtrasOf(data);
  return { rooms: x.rooms ?? [], bookings: x.roomBookings ?? [], activities: x.assocActivities };
}

/** Aplica un cambio sobre salas, reservas o actividades sin tocar lo demás. */
export function withRooms(data: ProData, fn: (r: RoomsData) => Partial<RoomsData>): ProData {
  const x = uniExtrasOf(data);
  const next = fn(roomsOf(data));
  return {
    ...data,
    uniExtras: {
      ...x,
      ...(next.rooms ? { rooms: next.rooms } : {}),
      ...(next.bookings ? { roomBookings: next.bookings } : {}),
      ...(next.activities ? { assocActivities: next.activities } : {}),
    },
  };
}

/** Lugar tal y como aparece en las actividades: "Aula 12, Filosofía y Letras". */
export function roomPlace(room: Pick<ProUniRoom, "name" | "building">): string {
  return `${room.name}, ${room.building}`;
}

function normPlace(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Interval = { start: string; end: string };

function overlaps(a: Interval, b: Interval): boolean {
  return new Date(a.start).getTime() < new Date(b.end).getTime() && new Date(b.start).getTime() < new Date(a.end).getTime();
}

export const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

const WEEKDAY_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/* ------------------------------------------------------------------ */
/* Lo que ocupa una sala                                               */
/* ------------------------------------------------------------------ */

export type RoomBlockKind = "approved" | "requested" | "activity";

export type RoomBlock = {
  id: string;
  kind: RoomBlockKind;
  title: string;
  associationId: string;
  start: string;
  end: string;
  /** Reserva de la que sale (no la tienen las actividades sueltas). */
  bookingId?: string;
};

/** Reservas vivas y actividades apuntadas en la sala, por hora de inicio. */
export function roomBlocks(room: ProUniRoom, data: RoomsData): RoomBlock[] {
  const place = normPlace(roomPlace(room));
  const linked = new Set(data.bookings.map((b) => b.activityId).filter(Boolean));
  const fromBookings: RoomBlock[] = data.bookings
    .filter((b) => b.roomId === room.id && (b.status === "approved" || b.status === "requested"))
    .map((b) => ({
      id: b.id,
      kind: b.status === "approved" ? "approved" : "requested",
      title: b.title,
      associationId: b.associationId,
      start: b.start,
      end: b.end,
      bookingId: b.id,
    }));
  const fromActivities: RoomBlock[] = data.activities
    .filter((a) => !linked.has(a.id) && normPlace(a.place) === place)
    .map((a) => ({ id: a.id, kind: "activity", title: a.title, associationId: a.associationId, start: a.start, end: a.end }));
  return [...fromBookings, ...fromActivities].sort((a, b) => a.start.localeCompare(b.start));
}

export type BookingConflict = RoomBlock & {
  /** true si lo que choca ya está confirmado (bloquea la aprobación). */
  hard: boolean;
};

/** Lo que coincide con una reserva en su sala. Otra petición avisa; lo aprobado bloquea. */
export function bookingConflicts(
  candidate: Pick<ProUniRoomBooking, "id" | "roomId" | "start" | "end">,
  data: RoomsData,
): BookingConflict[] {
  const room = data.rooms.find((r) => r.id === candidate.roomId);
  if (!room) return [];
  return roomBlocks(room, data)
    .filter((b) => b.bookingId !== candidate.id && overlaps(b, candidate))
    .map((b) => ({ ...b, hard: b.kind !== "requested" }));
}

/** Qué impide dar la sala a esa hora, aunque esté libre. */
export function requestProblem(
  candidate: Pick<ProUniRoomBooking, "start" | "end" | "attendees">,
  room: ProUniRoom,
): string | null {
  if (candidate.end <= candidate.start) return "La hora de fin tiene que ser posterior a la de inicio.";
  const day = localDate(candidate.start);
  if (localDate(candidate.end) !== day) return "La reserva tiene que empezar y acabar el mismo día.";
  const weekday = weekdayIndex(day);
  if (!room.weekdays.includes(weekday)) return `${room.name} no se presta los ${WEEKDAY_PLURAL[weekday]}.`;
  const from = localMinutes(candidate.start);
  const to = localMinutes(candidate.end);
  if (from < room.open || to > room.close) {
    return `${room.name} se presta de ${minutesToLabel(room.open)} a ${minutesToLabel(room.close)}.`;
  }
  if (candidate.attendees > room.capacity) {
    return `En ${room.name} caben ${room.capacity} personas y esperan ${candidate.attendees}.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Huecos y alternativas                                               */
/* ------------------------------------------------------------------ */

export type FreeWindow = { start: number; end: number };

/** Tramos libres de la sala un día (en minutos), sin contar la reserva `excludeId`. */
export function freeWindows(room: ProUniRoom, date: string, data: RoomsData, excludeId?: string): FreeWindow[] {
  if (!room.active || !room.weekdays.includes(weekdayIndex(date))) return [];
  const busy = roomBlocks(room, data)
    .filter((b) => b.bookingId !== excludeId && localDate(b.start) === date)
    .map((b) => ({ start: Math.max(room.open, localMinutes(b.start)), end: Math.min(room.close, localMinutes(b.end)) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const windows: FreeWindow[] = [];
  let cursor = room.open;
  for (const b of busy) {
    if (b.start > cursor) windows.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < room.close) windows.push({ start: cursor, end: room.close });
  return windows;
}

export type RoomAlternative = {
  roomId: string;
  start: string;
  end: string;
  /** "Aula 3, a la misma hora" o "Aula 12, a las 21:00". */
  label: string;
};

/**
 * Dónde cabe una petición que choca: primero otras salas con aforo libres a la
 * misma hora; después la misma sala en el hueco más cercano de ese día.
 */
export function bookingAlternatives(booking: ProUniRoomBooking, data: RoomsData, max = 3): RoomAlternative[] {
  const date = localDate(booking.start);
  const from = localMinutes(booking.start);
  const length = Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000);
  const result: RoomAlternative[] = [];

  for (const room of data.rooms) {
    if (room.id === booking.roomId || !room.active) continue;
    const moved = { ...booking, roomId: room.id };
    if (requestProblem(moved, room)) continue;
    if (bookingConflicts(moved, data).length) continue;
    result.push({ roomId: room.id, start: booking.start, end: booking.end, label: `${room.name}, a la misma hora` });
  }
  // Las salas más justas de aforo primero: no se gasta el salón de actos en un taller de 20.
  result.sort((a, b) => capacityOf(data, a.roomId) - capacityOf(data, b.roomId));

  const same = data.rooms.find((r) => r.id === booking.roomId);
  if (same) {
    const fits = freeWindows(same, date, data, booking.id)
      .filter((w) => w.end - w.start >= length)
      .map((w) => {
        // Lo más cerca posible de la hora pedida dentro del tramo libre.
        const start = Math.min(Math.max(from, w.start), w.end - length);
        return { start, distance: Math.abs(start - from) };
      })
      .filter((w) => w.distance > 0)
      .sort((a, b) => a.distance - b.distance);
    if (fits[0]) {
      result.push({
        roomId: same.id,
        start: atLocal(date, fits[0].start),
        end: atLocal(date, fits[0].start + length),
        label: `${same.name}, a las ${minutesToLabel(fits[0].start)}`,
      });
    }
  }
  return result.slice(0, max);
}

function capacityOf(data: RoomsData, roomId: string): number {
  return data.rooms.find((r) => r.id === roomId)?.capacity ?? 0;
}

/* ------------------------------------------------------------------ */
/* Decisiones                                                          */
/* ------------------------------------------------------------------ */

export type RoomRequestState = "free" | "pending_clash" | "clash" | "problem" | "past";

/** Cómo está una petición: libre, compite con otra, choca con algo confirmado o no cabe. */
export function requestState(booking: ProUniRoomBooking, data: RoomsData, now: Date): RoomRequestState {
  if (new Date(booking.start).getTime() < now.getTime()) return "past";
  const room = data.rooms.find((r) => r.id === booking.roomId);
  if (!room || requestProblem(booking, room)) return "problem";
  const conflicts = bookingConflicts(booking, data);
  if (conflicts.some((c) => c.hard)) return "clash";
  return conflicts.length ? "pending_clash" : "free";
}

/** Peticiones por contestar, la más próxima primero. */
export function pendingRequests(bookings: ProUniRoomBooking[]): ProUniRoomBooking[] {
  return bookings.filter((b) => b.status === "requested").sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Aprueba (o mueve y aprueba) una petición y crea su actividad. Devuelve null
 * si ya no se puede: algo confirmado ocupa la sala o la sala no la admite.
 */
export function approveBooking(
  data: RoomsData,
  id: string,
  now: Date,
  opts: { activityId: string; by?: string; move?: { roomId: string; start: string; end: string } },
): Pick<RoomsData, "bookings" | "activities"> | null {
  const current = data.bookings.find((b) => b.id === id);
  if (!current || current.status === "cancelled") return null;
  const booking = opts.move ? { ...current, ...opts.move } : current;
  const room = data.rooms.find((r) => r.id === booking.roomId);
  if (!room || requestProblem(booking, room)) return null;
  const others: RoomsData = { ...data, bookings: data.bookings.filter((b) => b.id !== id) };
  if (bookingConflicts(booking, others).some((c) => c.hard)) return null;

  const activity: ProUniAssocActivity = {
    id: booking.activityId ?? opts.activityId,
    associationId: booking.associationId,
    title: booking.title,
    start: booking.start,
    end: booking.end,
    place: roomPlace(room),
  };
  const approved: ProUniRoomBooking = {
    ...booking,
    status: "approved",
    decidedAt: now.toISOString(),
    decidedBy: opts.by,
    reason: undefined,
    activityId: activity.id,
  };
  return {
    bookings: data.bookings.map((b) => (b.id === id ? approved : b)),
    activities: [...data.activities.filter((a) => a.id !== activity.id), activity],
  };
}

/** Rechaza con un motivo que le llega a la asociación. */
export function rejectBooking(
  bookings: ProUniRoomBooking[],
  id: string,
  reason: string,
  now: Date,
  by?: string,
): ProUniRoomBooking[] {
  return bookings.map((b) =>
    b.id === id ? { ...b, status: "rejected", reason: reason.trim(), decidedAt: now.toISOString(), decidedBy: by } : b,
  );
}

/** Anula una reserva aprobada y quita su actividad del calendario. */
export function cancelBooking(data: RoomsData, id: string, now: Date): Pick<RoomsData, "bookings" | "activities"> {
  const booking = data.bookings.find((b) => b.id === id);
  return {
    bookings: data.bookings.map((b) => (b.id === id ? { ...b, status: "cancelled", decidedAt: now.toISOString() } : b)),
    activities: booking?.activityId ? data.activities.filter((a) => a.id !== booking.activityId) : data.activities,
  };
}

/** Motivos de rechazo más habituales, para contestar con un toque. */
export const REJECT_REASONS = [
  "La sala ya está dada a esa hora. Os proponemos otra en la petición.",
  "No caben tantas personas en esa sala.",
  "Ese día el edificio cierra antes por un acto institucional.",
  "Falta el plan de actividades del curso en el registro.",
];

/* ------------------------------------------------------------------ */
/* Día y semana                                                        */
/* ------------------------------------------------------------------ */

export type RoomDayRow = { room: ProUniRoom; open: boolean; blocks: RoomBlock[] };

/** Una fila por sala activa con lo que la ocupa ese día. */
export function roomDay(data: RoomsData, date: string): RoomDayRow[] {
  const weekday = weekdayIndex(date);
  return data.rooms
    .filter((r) => r.active)
    .map((room) => ({
      room,
      open: room.weekdays.includes(weekday),
      blocks: roomBlocks(room, data).filter((b) => localDate(b.start) === date),
    }));
}

/** Horas que cubre el tablero de un día: de la primera apertura al último cierre. */
export function dayBounds(rows: RoomDayRow[]): { start: number; end: number } {
  const open = rows.filter((r) => r.open);
  if (!open.length) return { start: 9 * 60, end: 21 * 60 };
  const start = Math.min(...open.map((r) => r.room.open));
  const end = Math.max(...open.map((r) => r.room.close));
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

/** Parte de las horas prestables de la semana que ya están ocupadas (aprobado y actividades). */
export function weekOccupancy(room: ProUniRoom, data: RoomsData, monday: string): number {
  let open = 0;
  let used = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    if (!room.active || !room.weekdays.includes(i)) continue;
    open += room.close - room.open;
    for (const b of roomBlocks(room, data)) {
      if (b.kind === "requested" || localDate(b.start) !== date) continue;
      const from = Math.max(room.open, localMinutes(b.start));
      const to = Math.min(room.close, localMinutes(b.end));
      used += Math.max(0, to - from);
    }
  }
  return pct(used, open);
}

export type RoomsSummary = {
  pending: number;
  /** Peticiones que chocan con algo ya confirmado. */
  clashes: number;
  approvedWeek: number;
  /** Ocupación media de las salas activas esta semana. */
  weekPct: number;
};

export function roomsSummary(data: RoomsData, now: Date): RoomsSummary {
  const today = localDate(now);
  const monday = addDays(today, -weekdayIndex(today));
  const sunday = addDays(monday, 6);
  const pending = pendingRequests(data.bookings).filter((b) => requestState(b, data, now) !== "past");
  const active = data.rooms.filter((r) => r.active);
  return {
    pending: pending.length,
    clashes: pending.filter((b) => requestState(b, data, now) === "clash").length,
    approvedWeek: data.bookings.filter((b) => {
      const day = localDate(b.start);
      return b.status === "approved" && day >= monday && day <= sunday;
    }).length,
    weekPct: active.length ? Math.round(active.reduce((a, r) => a + weekOccupancy(r, data, monday), 0) / active.length) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Alta y edición de salas y reservas                                  */
/* ------------------------------------------------------------------ */

export type RoomDraft = Omit<ProUniRoom, "id">;

export function roomProblem(rooms: ProUniRoom[], draft: RoomDraft, editingId?: string): string | null {
  if (draft.name.trim().length < 2) return "Ponle nombre a la sala.";
  if (draft.building.trim().length < 2) return "Di en qué edificio está.";
  if (!(draft.capacity > 0)) return "Indica cuántas personas caben.";
  if (draft.close <= draft.open) return "La hora de cierre tiene que ser posterior a la de apertura.";
  if (!draft.weekdays.length) return "Elige al menos un día.";
  const place = normPlace(roomPlace(draft));
  if (rooms.some((r) => r.id !== editingId && normPlace(roomPlace(r)) === place)) return "Ya tienes esa sala.";
  return null;
}

export function saveRoom(rooms: ProUniRoom[], draft: RoomDraft, id: string): ProUniRoom[] {
  const clean: ProUniRoom = {
    ...draft,
    id,
    name: draft.name.trim(),
    building: draft.building.trim(),
    weekdays: [...new Set(draft.weekdays)].sort((a, b) => a - b),
    features: draft.features?.map((f) => f.trim()).filter(Boolean),
  };
  return rooms.some((r) => r.id === id) ? rooms.map((r) => (r.id === id ? clean : r)) : [...rooms, clean];
}

/** Reserva que hace el propio servicio (la asociación la pidió por correo o en persona). */
export function newBooking(input: {
  id: string;
  roomId: string;
  associationId: string;
  title: string;
  date: string;
  from: number;
  to: number;
  attendees: number;
  now: Date;
}): ProUniRoomBooking {
  return {
    id: input.id,
    roomId: input.roomId,
    associationId: input.associationId,
    title: input.title.trim(),
    start: atLocal(input.date, input.from),
    end: atLocal(input.date, input.to),
    attendees: input.attendees,
    status: "requested",
    requestedAt: input.now.toISOString(),
  };
}
