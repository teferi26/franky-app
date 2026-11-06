import type { ProBooking, ProData, ProOpenMatch, ProResource } from "./types";
import {
  addDays,
  atLocal,
  localDate,
  localMinutes,
  weekdayIndex,
} from "./format";
import { openingIntervals } from "./agenda";
import { blocksOn, specialHoursOn } from "./courts-base";

/**
 * Motor de recursos por franja: pistas de pádel, puestos y salas de estudio.
 * Una pista o una sala se reserva entera; una zona de puestos se comparte y lo
 * que cuenta es cuántas personas hay a la vez.
 */

/** Franja valle entre semana: la tarifa universitaria de 10 a 14 h. */
export const VALLEY_FROM = 10 * 60;
export const VALLEY_TO = 14 * 60;
export const MATCH_MINUTES = 90;
export const SLOT_MINUTES = 30;

/** Campos propios de un partido abierto que no están en `ProOpenMatch`. */
export type OpenMatchX = ProOpenMatch & {
  publishedAt?: string;
  reach?: number;
  /**
   * Si a esta hora no se ha completado, el partido deja de ocupar la pista.
   * Sin fecha, se aplica la regla del club (`policy.matchReleaseHours`).
   */
  releaseAt?: string;
  /** Momento en que se liberó la pista por no completarse. */
  releasedAt?: string;
};

export function isValley(date: string, minute: number): boolean {
  return weekdayIndex(date) < 5 && minute >= VALLEY_FROM && minute < VALLEY_TO;
}

export function isShared(r: ProResource): boolean {
  if (r.capacityUnit)
    return (
      r.allocationMode !== "exclusive" &&
      (r.capacityUnit === "people" || r.capacity > 1)
    );
  return r.kind === "desk";
}

export function resourceOpenings(
  data: ProData,
  date: string,
  resourceId?: string,
) {
  if (data.calendar) return openingIntervals(data, date, resourceId);
  const hours = hoursFor(data, date);
  return hours ? [hours] : [];
}

/** Horario de ese día: el especial por fechas manda sobre el semanal. */
export function hoursFor(data: ProData, date: string) {
  const special = specialHoursOn(data, date);
  if (special) return { open: special.open, close: special.close };
  return data.space.hours[weekdayIndex(date)] ?? null;
}

export function resourceBookings(
  data: ProData,
  date: string,
  resourceId?: string,
): ProBooking[] {
  return data.bookings
    .filter(
      (b) =>
        b.resourceId &&
        b.status !== "cancelled" &&
        !b.waitlisted &&
        (!data.calendar || !b.sessionId) &&
        Date.parse(b.start) < Date.parse(atLocal(addDays(date, 1), 0)) &&
        Date.parse(b.end) > Date.parse(atLocal(date, 0)) &&
        (!resourceId ||
          b.resourceId === resourceId ||
          b.resourceIds?.includes(resourceId)),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function matchesOn(
  data: ProData,
  date: string,
  resourceId?: string,
): OpenMatchX[] {
  return data.openMatches
    .filter(
      (m) =>
        localDate(m.start) === date &&
        (!resourceId || m.resourceId === resourceId),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Precio de una franja: se cobra cada media hora a precio normal o valle. */
export function priceFor(
  resource: ProResource,
  date: string,
  from: number,
  duration: number,
): number | null {
  let cents = 0;
  for (let m = from; m < from + duration; m += SLOT_MINUTES) {
    const hourly =
      isValley(date, m) && resource.valleyPricePerHourCents
        ? resource.valleyPricePerHourCents
        : resource.pricePerHourCents;
    if (hourly === null) return null;
    cents += hourly / 2;
  }
  return Math.round(cents / 50) * 50;
}

export function valleyApplies(
  resource: ProResource,
  date: string,
  from: number,
  duration: number,
) {
  return (
    Boolean(resource.valleyPricePerHourCents) &&
    isValley(date, from) &&
    isValley(date, from + duration - SLOT_MINUTES)
  );
}

type Interval = { from: number; to: number; people: number; id: string };

function intervals(
  data: ProData,
  resourceId: string,
  date: string,
  ignoreId?: string,
): Interval[] {
  if (data.calendar) {
    const start = Date.parse(atLocal(date, 0));
    const end = Date.parse(atLocal(addDays(date, 1), 0));
    const rows = data.bookings
      .filter(
        (booking) =>
          booking.id !== ignoreId &&
          (booking.resourceId === resourceId ||
            booking.resourceIds?.includes(resourceId)) &&
          !["cancelled", "no_show"].includes(booking.status) &&
          !booking.waitlisted &&
          !booking.sessionId &&
          Date.parse(booking.start) < end &&
          Date.parse(booking.blockedUntil ?? booking.end) > start,
      )
      .map((booking) => ({
        id: booking.id,
        from: (Date.parse(booking.start) - start) / 60000,
        to: (Date.parse(booking.blockedUntil ?? booking.end) - start) / 60000,
        people: booking.partySize,
      }));
    for (const session of data.calendar.sessions) {
      const blockedUntil =
        "blocked_until" in session && typeof session.blocked_until === "string"
          ? session.blocked_until
          : session.ends_at;
      if (
        session.status === "cancelled" ||
        !session.resource_ids.includes(resourceId) ||
        Date.parse(session.starts_at) >= end ||
        Date.parse(blockedUntil) <= start
      )
        continue;
      rows.push({
        id: session.id,
        from: (Date.parse(session.starts_at) - start) / 60000,
        to: (Date.parse(blockedUntil) - start) / 60000,
        people:
          data.resources.find((resource) => resource.id === resourceId)
            ?.capacity ?? 1,
      });
    }
    return rows;
  }
  // Minutos relativos a la medianoche del día: una reserva que acaba a la
  // 1:00 del día siguiente (horario de exámenes) termina en el minuto 1500.
  const dayStart = Date.parse(atLocal(date, 0));
  const list: Interval[] = resourceBookings(data, date, resourceId)
    .filter((b) => b.id !== ignoreId && b.status !== "no_show")
    .map((b) => ({
      from: (Date.parse(b.start) - dayStart) / 60000,
      to: (Date.parse(b.end) - dayStart) / 60000,
      people: b.partySize,
      id: b.id,
    }));
  for (const m of matchesOn(data, date, resourceId)) {
    // Un partido que no se completó a tiempo ya no ocupa la pista.
    if (m.id === ignoreId || m.releasedAt) continue;
    const from = localMinutes(m.start);
    list.push({ from, to: from + MATCH_MINUTES, people: 4, id: m.id });
  }
  // Mantenimiento, torneos, eventos privados y grupos de escuela llenan la
  // pista o la zona entera.
  const resource = data.resources.find((r) => r.id === resourceId);
  for (const block of blocksOn(data, date, resourceId)) {
    if (block.id === ignoreId) continue;
    list.push({
      from: block.from,
      to: block.to,
      people: resource?.capacity ?? 1,
      id: block.id,
    });
  }
  return list;
}

/** Personas a la vez en ese minuto (en pistas y salas, 0 o el grupo). */
export function occupancyAt(
  data: ProData,
  resource: ProResource,
  date: string,
  minute: number,
  ignoreId?: string,
): number {
  return intervals(data, resource.id, date, ignoreId)
    .filter((i) => i.from <= minute && i.to > minute)
    .reduce(
      (a, i) =>
        a +
        (resource.capacityUnit === "concurrent_bookings"
          ? 1
          : isShared(resource)
            ? i.people
            : 1),
      0,
    );
}

/**
 * Ocupación de un recurso en varias medias horas de un día, calculando las
 * reservas una sola vez (para mapas de calor y rejillas grandes).
 */
export function occupancyRow(
  data: ProData,
  resource: ProResource,
  date: string,
  minutes: number[],
): number[] {
  const list = intervals(data, resource.id, date);
  return minutes.map((minute) =>
    list
      .filter((i) => i.from <= minute && i.to > minute)
      .reduce(
        (a, i) =>
          a +
          (resource.capacityUnit === "concurrent_bookings"
            ? 1
            : isShared(resource)
              ? i.people
              : 1),
        0,
      ),
  );
}

export function isBusy(
  data: ProData,
  resource: ProResource,
  date: string,
  minute: number,
  ignoreId?: string,
): boolean {
  if (
    data.calendar &&
    !resourceOpenings(data, date, resource.id).some(
      (window) => window.open <= minute && window.close > minute,
    )
  )
    return true;
  const occ = occupancyAt(data, resource, date, minute, ignoreId);
  return isShared(resource) ? occ >= resource.capacity : occ > 0;
}

export function isFree(
  data: ProData,
  resource: ProResource,
  date: string,
  from: number,
  duration: number,
  ignoreId?: string,
): boolean {
  if (data.calendar) {
    const end = from + duration;
    if (
      !resourceOpenings(data, date, resource.id).some(
        (window) => window.open <= from && window.close >= end,
      )
    )
      return false;
    const boundaries = [
      from,
      ...intervals(data, resource.id, date, ignoreId)
        .flatMap((interval) => [interval.from, interval.to])
        .filter((minute) => minute > from && minute < end),
    ];
    const capacity = isShared(resource) ? resource.capacity : 1;
    return boundaries.every(
      (minute) =>
        occupancyAt(data, resource, date, minute, ignoreId) < capacity,
    );
  }
  for (let m = from; m < from + duration; m += SLOT_MINUTES)
    if (isBusy(data, resource, date, m, ignoreId)) return false;
  return true;
}

/** Horas a las que puede empezar una reserva de esa duración. */
export function freeStarts(
  data: ProData,
  resource: ProResource,
  date: string,
  duration: number,
  fromMinute = 0,
  ignoreId?: string,
): number[] {
  if (data.calendar) {
    return resourceOpenings(data, date, resource.id).flatMap((window) => {
      const starts: number[] = [];
      for (
        let minute = Math.max(
          window.open,
          Math.ceil(fromMinute / SLOT_MINUTES) * SLOT_MINUTES,
        );
        minute + duration <= window.close;
        minute += SLOT_MINUTES
      ) {
        if (isFree(data, resource, date, minute, duration, ignoreId))
          starts.push(minute);
      }
      return starts;
    });
  }
  const hours = hoursFor(data, date);
  if (!hours) return [];
  const out: number[] = [];
  const first = Math.max(
    hours.open,
    Math.ceil(fromMinute / SLOT_MINUTES) * SLOT_MINUTES,
  );
  for (let m = first; m + duration <= hours.close; m += SLOT_MINUTES) {
    if (isFree(data, resource, date, m, duration, ignoreId)) out.push(m);
  }
  return out;
}

/** Ocupación del día (0 a 100) sumando todas las pistas o puestos. */
export function dayOccupancy(
  data: ProData,
  date: string,
  fromMinute?: number,
  toMinute?: number,
): number {
  if (data.calendar) {
    let used = 0;
    let total = 0;
    for (const resource of data.resources) {
      const capacity = isShared(resource) ? resource.capacity : 1;
      const busy = intervals(data, resource.id, date);
      for (const window of resourceOpenings(data, date, resource.id)) {
        const from = Math.max(window.open, fromMinute ?? window.open);
        const to = Math.min(window.close, toMinute ?? window.close);
        if (to <= from) continue;
        const points = [
          ...new Set([
            from,
            to,
            ...busy
              .flatMap((interval) => [interval.from, interval.to])
              .filter((minute) => minute > from && minute < to),
          ]),
        ].sort((a, b) => a - b);
        total += (to - from) * capacity;
        for (let index = 0; index < points.length - 1; index++) {
          used +=
            (points[index + 1] - points[index]) *
            Math.min(
              capacity,
              occupancyAt(data, resource, date, points[index]),
            );
        }
      }
    }
    return total ? Math.round((used / total) * 100) : 0;
  }
  const hours = hoursFor(data, date);
  if (!hours || !data.resources.length) return 0;
  let used = 0;
  let total = 0;
  const from = fromMinute ?? hours.open;
  const to = toMinute ?? hours.close;
  for (const r of data.resources) {
    for (
      let m = Math.max(hours.open, from);
      m < Math.min(hours.close, to);
      m += SLOT_MINUTES
    ) {
      const cap = isShared(r) ? r.capacity : 1;
      used += Math.min(
        cap,
        isShared(r)
          ? occupancyAt(data, r, date, m)
          : isBusy(data, r, date, m)
            ? 1
            : 0,
      );
      total += cap;
    }
  }
  return total ? Math.round((used / total) * 100) : 0;
}

export type ValleyGap = {
  resourceId: string;
  date: string;
  from: number;
  to: number;
  free: number;
};

/**
 * Franjas valle vacías: en pistas y salas, tramos libres de al menos una hora;
 * en zonas de puestos, las horas con más de la mitad de los puestos libres.
 */
export function valleyGaps(
  data: ProData,
  date: string,
  fromMinute = 0,
): ValleyGap[] {
  const hours = hoursFor(data, date);
  if (!hours || weekdayIndex(date) >= 5) return [];
  const start = Math.max(
    VALLEY_FROM,
    hours.open,
    Math.ceil(fromMinute / SLOT_MINUTES) * SLOT_MINUTES,
  );
  const end = Math.min(VALLEY_TO, hours.close);
  const gaps: ValleyGap[] = [];
  for (const r of data.resources) {
    let runFrom: number | null = null;
    let minFree = r.capacity;
    const flush = (to: number) => {
      if (runFrom !== null && to - runFrom >= 60)
        gaps.push({
          resourceId: r.id,
          date,
          from: runFrom,
          to,
          free: isShared(r) ? minFree : 1,
        });
      runFrom = null;
      minFree = r.capacity;
    };
    for (let m = start; m < end; m += SLOT_MINUTES) {
      const occ = occupancyAt(data, r, date, m);
      const open = isShared(r)
        ? r.capacity - occ >= Math.ceil(r.capacity / 2)
        : occ === 0;
      if (open) {
        if (runFrom === null) runFrom = m;
        minFree = Math.min(minFree, r.capacity - occ);
      } else flush(m);
    }
    flush(end);
  }
  return gaps.sort(
    (a, b) => a.from - b.from || a.resourceId.localeCompare(b.resourceId),
  );
}

export function bookingMinutes(b: ProBooking): number {
  return Math.round(
    (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000,
  );
}

export function perPlayer(cents: number, players = 4): number {
  return Math.round(cents / players / 5) * 5;
}
