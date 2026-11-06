import type { ProBooking, ProData, ProService, ProStaff } from "./types";
import type { ProAgendaAbsence, ProAgendaBlock } from "./agenda-types";
import { atLocal, localDate, localMinutes, weekdayIndex } from "./format";

type Span = { from: number; to: number };

/* ------------------------------------------------------------------ */
/* Reglas del salón: bloqueos, ausencias, pose, preparación y cabinas   */
/* ------------------------------------------------------------------ */

export function serviceFor(
  data: ProData,
  booking: Pick<ProBooking, "serviceId">,
): ProService | undefined {
  return booking.serviceId
    ? data.services.find((service) => service.id === booking.serviceId)
    : undefined;
}

/**
 * Minutos que tarda una persona en hacer un servicio. Hay quien tarda más en
 * un degradado o en unas uñas de gel: si tiene duración propia, manda esa.
 */
export function durationFor(
  service: ProService | undefined,
  staffId?: string,
): number {
  if (!service) return 0;
  const own = staffId ? service.agenda?.staffMin?.[staffId] : undefined;
  return own && own > 0 ? own : service.durationMin;
}

/** Suma minutos a un instante ISO sin pasar por la hora local. */
export function plusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

/**
 * Tramo de la cita en el que el color posa y el profesional tiene las manos
 * libres. Solo existe si el servicio está dividido en aplicación, pose y
 * aclarado.
 */
export function poseWindow(
  data: ProData,
  booking: ProBooking,
): { start: string; end: string } | null {
  const phases = serviceFor(data, booking)?.agenda?.phases;
  if (!phases || phases.processMin < 15) return null;
  const start = plusMinutes(booking.start, phases.applyMin);
  const end = plusMinutes(start, phases.processMin);
  return end <= booking.end ? { start, end } : null;
}

/** Bloqueos del día para una persona (o de todo el equipo si no se indica). */
export function blocksOn(
  data: ProData,
  date: string,
  staffId?: string,
): ProAgendaBlock[] {
  const blocks = data.agendaOps?.blocks ?? [];
  return blocks.filter(
    (block) =>
      (!staffId || block.staffId === staffId) &&
      (block.date === date ||
        (block.weekly &&
          block.date <= date &&
          weekdayIndex(block.date) === weekdayIndex(date))),
  );
}

/** Vacaciones o baja de una persona ese día, si la hay. */
export function absenceOn(
  data: ProData,
  date: string,
  staffId: string,
): ProAgendaAbsence | undefined {
  return data.agendaOps?.absences.find(
    (absence) =>
      absence.staffId === staffId && absence.from <= date && absence.to >= date,
  );
}

/** Cabina o máquina que ocupa una cita: la suya propia o la de su servicio. */
export function cabinFor(data: ProData, booking: ProBooking) {
  return booking.agenda?.cabinId ?? serviceFor(data, booking)?.agenda?.cabinId;
}

function spanOn(startIso: string, endIso: string, date: string): Span | null {
  if (endIso <= startIso) return null;
  const from = localDate(startIso) < date ? 0 : localMinutes(startIso);
  const to = localDate(endIso) > date ? 1440 : localMinutes(endIso);
  if (localDate(startIso) > date || localDate(endIso) < date) return null;
  return to > from ? { from, to } : null;
}

/** Tramos ocupados de una cita: sin la pose y con la preparación posterior. */
function bookingBusySpans(
  data: ProData,
  booking: ProBooking,
  date: string,
  blockedUntil: string,
): Span[] {
  const buffer = serviceFor(data, booking)?.agenda?.bufferMin ?? 0;
  const end = buffer ? plusMinutes(blockedUntil, buffer) : blockedUntil;
  const pose = poseWindow(data, booking);
  const pieces = pose
    ? [spanOn(booking.start, pose.start, date), spanOn(pose.end, end, date)]
    : [spanOn(booking.start, end, date)];
  return pieces.filter((piece): piece is Span => piece !== null);
}

/** Partes de un servicio que necesitan al profesional, relativas al inicio. */
function staffPieces(service: ProService | undefined, duration: number) {
  const phases = service?.agenda?.phases;
  const buffer = service?.agenda?.bufferMin ?? 0;
  if (!phases || phases.processMin < 15)
    return { pieces: [{ from: 0, to: duration + buffer }], buffer };
  const poseStart = phases.applyMin;
  const poseEnd = phases.applyMin + phases.processMin;
  return {
    pieces: [
      { from: 0, to: poseStart },
      { from: poseEnd, to: duration + buffer },
    ],
    buffer,
  };
}

/** Tramos en los que la cabina o máquina ya está ocupada ese día. */
function cabinBusy(
  data: ProData,
  date: string,
  cabinId: string,
  ignoreBookingId?: string,
): Span[] {
  return bookingsOn(data, date)
    .filter(
      (booking) =>
        booking.id !== ignoreBookingId &&
        booking.status !== "no_show" &&
        cabinFor(data, booking) === cabinId,
    )
    .flatMap((booking) => {
      const buffer = serviceFor(data, booking)?.agenda?.bufferMin ?? 0;
      const span = spanOn(
        booking.start,
        plusMinutes(booking.end, buffer),
        date,
      );
      return span ? [span] : [];
    });
}

/** Citas que ocupan la agenda (las canceladas no cuentan). */
export function activeBookings(bookings: ProBooking[]): ProBooking[] {
  return bookings.filter((b) => b.status !== "cancelled");
}

/** Recorta la cita al día visible sin ocultar la parte que cruza medianoche. */
export function bookingDaySpan(
  booking: ProBooking,
  date: string,
): { from: number; to: number } | null {
  const dayStart = Date.parse(atLocal(date, 0));
  const dayEnd = Date.parse(atLocal(date, 1440));
  const starts = Date.parse(booking.start);
  const ends = Date.parse(booking.end);
  if (starts >= dayEnd || ends <= dayStart || ends <= starts) return null;
  const from = starts < dayStart ? 0 : localMinutes(booking.start);
  const wallEnd = ends >= dayEnd ? 1440 : localMinutes(booking.end);
  // En el cambio de hora otoñal, la hora local final puede ser anterior.
  const to =
    wallEnd > from
      ? wallEnd
      : Math.min(1440, from + (ends - Math.max(starts, dayStart)) / 60000);
  return { from, to };
}

export function bookingsOn(
  data: ProData,
  date: string,
  staffId?: string,
): ProBooking[] {
  return activeBookings(data.bookings)
    .filter(
      (b) =>
        bookingDaySpan(b, date) !== null &&
        (!staffId || b.staffId === staffId || b.resourceIds?.includes(staffId)),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function hoursOn(data: ProData, date: string) {
  if (data.calendar) {
    const intervals = openingIntervals(data, date);
    return intervals.length
      ? {
          open: Math.min(...intervals.map((item) => item.open)),
          close: Math.max(...intervals.map((item) => item.close)),
        }
      : null;
  }
  return data.space.hours[weekdayIndex(date)] ?? null;
}

/** Conserva las pausas y los cierres de cada profesional. */
export function openingIntervals(
  data: ProData,
  date: string,
  staffId?: string,
): { open: number; close: number }[] {
  // Vacaciones o baja: la columna de esa persona queda cerrada todo el día.
  if (staffId && absenceOn(data, date, staffId)) return [];
  const calendar = data.calendar;
  if (!calendar) {
    const hours = data.space.hours[weekdayIndex(date)];
    return hours ? [hours] : [];
  }
  if (
    date < localDate(calendar.range.from) ||
    date >= localDate(calendar.range.until)
  )
    return [];
  if (
    calendar.exceptions.some(
      (row) =>
        row.local_date === date &&
        (!row.resource_id || row.resource_id === staffId),
    )
  )
    return [];
  const weekday = (weekdayIndex(date) + 1) % 7;
  const business = calendar.availability.filter(
    (row) => !row.resource_id && row.weekday === weekday,
  );
  const specific = staffId
    ? calendar.availability.filter((row) => row.resource_id === staffId)
    : [];
  return business
    .flatMap((row) => {
      if (!specific.length)
        return [{ open: row.start_minute, close: row.end_minute }];
      return specific
        .filter((shift) => shift.weekday === weekday)
        .map((shift) => ({
          open: Math.max(shift.start_minute, row.start_minute),
          close: Math.min(shift.end_minute, row.end_minute),
        }))
        .filter((shift) => shift.close > shift.open);
    })
    .sort((a, b) => a.open - b.open);
}

function busyIntervals(
  data: ProData,
  date: string,
  staffId: string,
  ignoreBookingId?: string,
): Span[] {
  const blocked = blocksOn(data, date, staffId).map((block) => ({
    from: block.from,
    to: block.to,
  }));
  return [
    ...bookedIntervals(data, date, staffId, ignoreBookingId),
    ...blocked,
  ].sort((a, b) => a.from - b.from);
}

function bookedIntervals(
  data: ProData,
  date: string,
  staffId: string,
  ignoreBookingId?: string,
): Span[] {
  if (data.calendar) {
    const start = atLocal(date, 0);
    const end = atLocal(date, 1440);
    const rows = [
      ...data.calendar.bookings.filter(
        (row) =>
          row.id !== ignoreBookingId &&
          row.session_id === null &&
          ["requested", "confirmed", "attended"].includes(row.status),
      ),
      ...data.calendar.sessions.filter((row) => row.status === "open"),
    ];
    return rows
      .filter((row) => row.resource_ids.includes(staffId))
      .map((row) => {
        const blocked =
          "blocked_until" in row && typeof row.blocked_until === "string"
            ? row.blocked_until
            : row.ends_at;
        return { start: row.starts_at, end: blocked };
      })
      .filter((row) => row.start < end && row.end > start)
      .map((row) => ({
        from: row.start < start ? 0 : localMinutes(row.start),
        to: row.end >= end ? 1440 : localMinutes(row.end),
      }))
      .sort((a, b) => a.from - b.from);
  }
  return bookingsOn(data, date, staffId)
    .filter(
      (booking) =>
        booking.id !== ignoreBookingId &&
        booking.status !== "no_show" &&
        !booking.waitlisted,
    )
    .flatMap((booking) => {
      const raw = data.calendar?.bookings.find((row) => row.id === booking.id);
      const blocked =
        raw && "blocked_until" in raw && typeof raw.blocked_until === "string"
          ? raw.blocked_until
          : booking.end;
      return bookingBusySpans(data, booking, date, blocked);
    });
}

export type Gap = { staffId: string; date: string; from: number; to: number };

/**
 * Huecos libres de un día por profesional, a partir de `fromMinute`.
 * Solo devuelve huecos de al menos `minLength` minutos: los que de verdad se
 * pueden ofrecer a un estudiante.
 */
export function freeGaps(
  data: ProData,
  date: string,
  fromMinute: number,
  minLength = 30,
): Gap[] {
  const hours = hoursOn(data, date);
  if (!hours) return [];
  const gaps: Gap[] = [];
  for (const s of data.staff) {
    if (!data.services.some((sv) => sv.staffIds.includes(s.id))) continue;
    const busy = busyIntervals(data, date, s.id);
    for (const interval of openingIntervals(data, date, s.id)) {
      let cursor = Math.max(interval.open, roundUp(fromMinute, 15));
      for (const slot of busy) {
        if (slot.to <= cursor || slot.from >= interval.close) continue;
        if (slot.from - cursor >= minLength)
          gaps.push({
            staffId: s.id,
            date,
            from: cursor,
            to: Math.min(slot.from, interval.close),
          });
        cursor = Math.max(cursor, slot.to);
      }
      if (interval.close - cursor >= minLength)
        gaps.push({ staffId: s.id, date, from: cursor, to: interval.close });
    }
  }
  return gaps.sort((a, b) => a.from - b.from);
}

function roundUp(minutes: number, step: number) {
  return Math.ceil(minutes / step) * step;
}

/** Horas a las que se puede empezar un servicio con un profesional ese día. */
export function startTimes(
  data: ProData,
  date: string,
  staffId: string,
  durationMin: number,
  fromMinute = 0,
  ignoreBookingId?: string,
  serviceId?: string,
): number[] {
  const hours = hoursOn(data, date);
  if (!hours) return [];
  const busy = busyIntervals(data, date, staffId, ignoreBookingId);
  const service = serviceId
    ? data.services.find((row) => row.id === serviceId)
    : undefined;
  // Un color con pose solo necesita al profesional al aplicar y al aclarar.
  const { pieces, buffer } = staffPieces(service, durationMin);
  const cabinId = service?.agenda?.cabinId;
  const cabin = cabinId ? cabinBusy(data, date, cabinId, ignoreBookingId) : [];
  const clashes = (list: Span[], from: number, to: number) =>
    list.some((b) => from < b.to && to > b.from);
  const out: number[] = [];
  for (const interval of openingIntervals(data, date, staffId)) {
    for (
      let m = Math.max(interval.open, roundUp(fromMinute, 15));
      m + durationMin <= interval.close;
      m += 15
    ) {
      const staffFree = pieces.every(
        (piece) => !clashes(busy, m + piece.from, m + piece.to),
      );
      const cabinFree = !clashes(cabin, m, m + durationMin + buffer);
      if (staffFree && cabinFree) out.push(m);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Segunda persona de una cita (ayudante, novias, eventos): tiene que estar
 * dentro de su horario y sin nada apuntado durante toda la cita. No se le
 * aplica la pose: quien ayuda suele estar de principio a fin.
 */
export function staffFreeFor(
  data: ProData,
  date: string,
  staffId: string,
  from: number,
  to: number,
  ignoreBookingId?: string,
): boolean {
  if (to <= from) return false;
  const open = openingIntervals(data, date, staffId).some(
    (interval) => interval.open <= from && interval.close >= to,
  );
  if (!open) return false;
  return !busyIntervals(data, date, staffId, ignoreBookingId).some(
    (busy) => from < busy.to && to > busy.from,
  );
}

/** Quién más puede entrar en una cita de `from` a `to`, sin contar al titular. */
export function helpersFor(
  data: ProData,
  date: string,
  mainStaffId: string,
  from: number,
  to: number,
): { staff: ProStaff; free: boolean }[] {
  return data.staff
    .filter((person) => person.id !== mainStaffId)
    .map((person) => ({
      staff: person,
      free: staffFreeFor(data, date, person.id, from, to),
    }));
}

export function staffForService(
  data: ProData,
  service: ProService | undefined,
): ProStaff[] {
  if (!service) return data.staff;
  return data.staff.filter((s) => service.staffIds.includes(s.id));
}

export function isoFor(date: string, minutes: number) {
  return atLocal(date, minutes);
}

/** Resumen del día para Hoy y la cabecera de la agenda. */
export function daySummary(data: ProData, date: string, nowMinute: number) {
  const list = bookingsOn(data, date);
  const done = list.filter((b) => b.status === "done");
  const charged = data.payments.filter((p) => localDate(p.at) === date);
  return {
    total: list.filter((b) => b.status !== "no_show").length,
    done: done.length,
    pending: list.filter(
      (b) =>
        localDate(b.start) === date &&
        localMinutes(b.start) >= nowMinute &&
        b.status !== "no_show" &&
        b.status !== "done",
    ).length,
    requested: list.filter((b) => b.status === "requested").length,
    noShows: list.filter((b) => b.status === "no_show").length,
    chargedCents: charged.reduce((a, p) => a + p.amountCents + p.tipCents, 0),
    expectedCents: list
      .filter((b) => b.status !== "no_show" && localDate(b.start) === date)
      .reduce((a, b) => a + b.priceCents, 0),
    fromFranky: list.filter(
      (b) =>
        b.source === "franky" || b.source === "hueco" || b.source === "card",
    ).length,
  };
}
