import type {
  Allergen,
  ProBooking,
  ProClientSource,
  ProData,
  ProTable,
  ProValidation,
  ProVerticalId,
} from "./types";
import { atLocal, localDate, localMinutes } from "./format";
import { openingIntervals } from "./agenda";

/**
 * Lógica del motor de mesas (restaurante, bar, cafetería): turnos, estado de
 * cada mesa ahora mismo, lista de espera, mesa sugerida, alérgenos y sellos.
 *
 * La demo conserva sus convenciones de ocupación. En real, tableOperation
 * separa la llegada, salida y limpieza del horario original de la reserva.
 * Convenciones de la demo:
 * - Una reserva de mesa es un `ProBooking` con `kind: "table"` y `resourceId` = mesa.
 * - `arrived` = sentada, `done` = se fue (su `end` es la hora real de salida).
 * - Lista de espera = reserva de mesa con `source: "walkin"` y `status: "requested"`
 *   (sin mesa todavía; `start` es la hora a la que se apuntó).
 * - Una mesa queda "por limpiar" durante `CLEANING_MIN` minutos tras irse la mesa.
 */

export type Turn = "comida" | "cena";

export const TURNS: Record<
  Turn,
  { label: string; from: number; to: number; lastSeat: number }
> = {
  comida: {
    label: "Comida",
    from: 13 * 60,
    to: 16 * 60 + 30,
    lastSeat: 15 * 60 + 30,
  },
  cena: {
    label: "Cena",
    from: 20 * 60,
    to: 23 * 60 + 30,
    lastSeat: 22 * 60 + 45,
  },
};

export const TURN_ORDER: Turn[] = ["comida", "cena"];

export const CLEANING_MIN = 10;

export function turnOf(minute: number): Turn {
  return minute < 17 * 60 + 30 ? "comida" : "cena";
}

/** El turno que toca mirar ahora: la comida hasta las 17:00, después la cena. */
export function currentTurn(nowMin: number): Turn {
  return nowMin < 17 * 60 ? "comida" : "cena";
}

/** Minutos que se queda una mesa de media. */
export function stayMinutes(vertical: ProVerticalId, turn: Turn): number {
  if (vertical === "restaurant") return turn === "cena" ? 120 : 105;
  if (vertical === "bar") return 90;
  return 60;
}

/** Horas de la rejilla de 15 minutos de un turno. */
export function turnSlots(turn: Turn): number[] {
  const t = TURNS[turn];
  const out: number[] = [];
  for (let m = t.from; m <= t.lastSeat; m += 15) out.push(m);
  return out;
}

export function isWaitlist(b: ProBooking): boolean {
  return (
    b.kind === "table" &&
    b.source === "walkin" &&
    b.status === "requested" &&
    !b.serviceId
  );
}

/** Reservas de mesa de un día (sin lista de espera ni canceladas), por hora. */
export function tableBookingsOn(data: ProData, date: string): ProBooking[] {
  return data.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        !isWaitlist(b) &&
        b.status !== "cancelled" &&
        localDate(b.start) === date,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function turnBookings(
  data: ProData,
  date: string,
  turn: Turn,
): ProBooking[] {
  return tableBookingsOn(data, date).filter(
    (b) => turnOf(localMinutes(b.start)) === turn,
  );
}

export function waitlistOn(data: ProData, date: string): ProBooking[] {
  if (!data.space.demo) return [];
  return data.bookings
    .filter((b) => isWaitlist(b) && localDate(b.start) === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Plazas que cuentan para reservas (la barra es para quien llega sin reservar). */
export function reservableTables(data: ProData): ProTable[] {
  return data.tables.filter((t) => t.shape !== "bar" && t.active !== false);
}

export function capacity(data: ProData, zone?: string): number {
  return data.tables
    .filter((t) => !zone || t.zone === zone)
    .reduce((a, t) => a + t.seats, 0);
}

export function covers(list: ProBooking[]): number {
  return list
    .filter((b) => b.status !== "no_show" && b.status !== "cancelled")
    .reduce((a, b) => a + b.partySize, 0);
}

export function zonesOf(data: ProData): string[] {
  return [...new Set(data.tables.map((t) => t.zone))];
}

export function tableName(data: ProData, id?: string): string | null {
  if (!id) return null;
  const t = data.tables.find((x) => x.id === id);
  if (!t) return null;
  return /^\d+$/.test(t.name) ? `Mesa ${t.name}` : t.name;
}

export type TableState = "free" | "soon" | "seated" | "dirty";

export type TableLive = {
  state: TableState;
  current?: ProBooking;
  next?: ProBooking;
  /** Minutos sentados (seated), minutos para la llegada (soon) o para estar lista (dirty). */
  minutes: number;
  occupiedPeople?: number;
};

function cleaningUntil(operation: ProBooking["tableOperation"]): number | null {
  if (!operation?.leftAt) return null;
  const deadline =
    Date.parse(operation.leftAt) + operation.cleaningMinutes * 60_000;
  // Confirmar la limpieza tarde no vuelve a ocupar una mesa ya liberada.
  return operation.cleanedAt
    ? Math.min(deadline, Date.parse(operation.cleanedAt))
    : deadline;
}

export function tableLive(
  data: ProData,
  table: ProTable,
  now: Date,
): TableLive {
  const today = localDate(now);
  const nowMs = now.getTime();
  const nowMin = localMinutes(now);
  if (!data.space.demo) {
    const list = data.bookings.filter(
      (booking) =>
        (booking.resourceId === table.id ||
          booking.resourceIds?.includes(table.id)) &&
        booking.kind === "table" &&
        booking.status !== "cancelled" &&
        booking.status !== "no_show",
    );
    const seated = list.filter(
      (booking) =>
        booking.tableOperation?.seatedAt &&
        !booking.tableOperation.leftAt &&
        Date.parse(booking.tableOperation.seatedAt) <= nowMs,
    );
    const current = seated.sort((a, b) =>
      a.tableOperation!.seatedAt!.localeCompare(b.tableOperation!.seatedAt!),
    )[0];
    const next = list
      .filter(
        (booking) =>
          ["confirmed", "requested"].includes(booking.status) &&
          !booking.tableOperation?.seatedAt &&
          Date.parse(booking.end) > nowMs,
      )
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (current)
      return {
        state: "seated",
        current,
        next,
        minutes: Math.max(
          0,
          Math.floor(
            (nowMs - Date.parse(current.tableOperation!.seatedAt!)) / 60_000,
          ),
        ),
        occupiedPeople: seated.reduce(
          (total, booking) => total + booking.partySize,
          0,
        ),
      };
    const cleaning = list
      .filter(
        (booking) =>
          booking.tableOperation?.leftAt &&
          Date.parse(booking.tableOperation.leftAt) <= nowMs,
      )
      .map((booking) => ({
        booking,
        until: cleaningUntil(booking.tableOperation)!,
      }))
      .filter((entry) => entry.until > nowMs)
      .sort((a, b) => b.until - a.until)[0];
    if (cleaning)
      return {
        state: "dirty",
        current: cleaning.booking,
        next,
        minutes: Math.ceil((cleaning.until - nowMs) / 60_000),
      };
    if (next && Date.parse(next.start) - nowMs <= 90 * 60_000)
      return {
        state: "soon",
        next,
        minutes: Math.max(
          0,
          Math.ceil((Date.parse(next.start) - nowMs) / 60_000),
        ),
      };
    return { state: "free", next, minutes: 0 };
  }
  // Un grupo en mesas unidas ocupa todas ellas (resourceIds).
  const list = tableBookingsOn(data, today).filter(
    (b) => b.resourceId === table.id || b.resourceIds?.includes(table.id),
  );
  const current = list.find((b) => b.status === "arrived");
  const next = list.find(
    (b) =>
      (b.status === "confirmed" || b.status === "requested") &&
      localMinutes(b.start) >= nowMin - 20 &&
      b !== current,
  );
  if (current)
    return {
      state: "seated",
      current,
      next,
      minutes: Math.max(0, nowMin - localMinutes(current.start)),
    };
  const leaving = list.find((b) => {
    if (b.status !== "done") return false;
    const since = (nowMs - new Date(b.end).getTime()) / 60000;
    return since >= 0 && since < CLEANING_MIN;
  });
  if (leaving) {
    const since = Math.round((nowMs - new Date(leaving.end).getTime()) / 60000);
    return {
      state: "dirty",
      current: leaving,
      next,
      minutes: Math.max(1, CLEANING_MIN - since),
    };
  }
  if (next && localMinutes(next.start) - nowMin <= 90)
    return { state: "soon", next, minutes: localMinutes(next.start) - nowMin };
  return { state: "free", next, minutes: 0 };
}

/** ¿Está libre esa mesa entre `from` y `to` (minutos) ese día? */
export function tableFree(
  data: ProData,
  tableId: string,
  date: string,
  from: number,
  to: number,
  ignoreId?: string,
  party = 1,
  now = new Date(),
): boolean {
  const table = data.tables.find((item) => item.id === tableId);
  if (
    !table ||
    table.active === false ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to <= from ||
    party < 1 ||
    party > table.seats
  )
    return false;
  if (!data.space.demo) {
    if (
      !data.calendar ||
      !openingIntervals(data, date, tableId).some(
        (interval) => from >= interval.open && to <= interval.close,
      )
    )
      return false;
    const start = Date.parse(atLocal(date, from));
    const end = Date.parse(atLocal(date, to));
    if (
      data.calendar.sessions.some(
        (session) =>
          session.status === "open" &&
          session.resource_ids.includes(tableId) &&
          Date.parse(session.starts_at) < end &&
          Date.parse(
            "blocked_until" in session &&
              typeof session.blocked_until === "string"
              ? session.blocked_until
              : session.ends_at,
          ) > start,
      )
    )
      return false;
    const operations = new Map(
      data.bookings.map((booking) => [booking.id, booking.tableOperation]),
    );
    const overlap = data.calendar.bookings
      .filter(
        (booking) =>
          booking.id !== ignoreId &&
          booking.session_id === null &&
          booking.resource_ids.includes(tableId) &&
          ["requested", "confirmed", "attended"].includes(booking.status),
      )
      .map((booking) => {
        const candidate = operations.get(booking.id);
        const operation =
          candidate?.tableId === tableId ? candidate : undefined;
        const plannedStart = Date.parse(booking.starts_at);
        const plannedUntil = Date.parse(
          booking.blocked_until ?? booking.ends_at,
        );
        const actualEnd = cleaningUntil(operation);
        return {
          from: operation?.seatedAt
            ? Math.min(plannedStart, Date.parse(operation.seatedAt))
            : plannedStart,
          until:
            actualEnd ??
            (operation?.seatedAt
              ? Math.max(
                  plannedUntil,
                  now.getTime() + operation.cleaningMinutes * 60_000,
                )
              : plannedUntil),
          party: booking.party_size,
        };
      })
      .filter((interval) => start < interval.until && end > interval.from);
    if (table.exclusive !== false) return overlap.length === 0;
    // Sumar toda la franja contaría juntas reservas que no coinciden entre sí.
    return [
      start,
      ...overlap.map((interval) => Math.max(start, interval.from)),
    ].every(
      (point) =>
        overlap.reduce(
          (total, interval) =>
            total +
            (interval.from <= point && interval.until > point
              ? interval.party
              : 0),
          0,
        ) +
          party <=
        table.seats,
    );
  }
  return !data.bookings.some((b) => {
    const onTable =
      b.resourceId === tableId || Boolean(b.resourceIds?.includes(tableId));
    if (b.id === ignoreId || !onTable || b.kind !== "table") return false;
    if (b.status === "cancelled" || b.status === "no_show") return false;
    if (localDate(b.start) !== date) return false;
    const s = localMinutes(b.start);
    const e =
      s + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000;
    return from < e && to > s;
  });
}

/** Mesas libres para un grupo, de la más ajustada a la más grande. */
export function freeTablesFor(
  data: ProData,
  date: string,
  from: number,
  duration: number,
  party: number,
  ignoreId?: string,
): ProTable[] {
  return reservableTables(data)
    .filter(
      (t) =>
        t.seats >= party &&
        tableFree(data, t.id, date, from, from + duration, ignoreId, party),
    )
    .sort(
      (a, b) =>
        a.seats - b.seats ||
        a.name.localeCompare(b.name, "es", { numeric: true }),
    );
}

export function suggestTable(
  data: ProData,
  date: string,
  from: number,
  duration: number,
  party: number,
  ignoreId?: string,
): ProTable | null {
  return freeTablesFor(data, date, from, duration, party, ignoreId)[0] ?? null;
}

/** Catálogo que admite el contrato de reserva presencial de mesas. */
export function tableServices(data: ProData) {
  return (
    data.calendar?.services.filter(
      (service) =>
        service.active &&
        ["group", "resource"].includes(service.mode) &&
        !service.staff_required &&
        service.deposit_cents === 0,
    ) ?? []
  );
}

export function realTablesForService(
  data: ProData,
  serviceId: string,
  date: string,
  minute: number,
  party: number,
  now = new Date(),
): ProTable[] {
  const service = tableServices(data).find((item) => item.id === serviceId);
  if (!service || party < 1 || party > service.capacity) return [];
  return reservableTables(data)
    .filter(
      (table) =>
        table.seats >= party &&
        !service.required_resource_ids.some((id) =>
          data.tables.some((other) => other.id === id && other.id !== table.id),
        ) &&
        tableFree(
          data,
          table.id,
          date,
          minute,
          minute +
            service.duration_minutes +
            Math.max(service.buffer_minutes, table.cleaningMinutes ?? 0),
          undefined,
          party,
          now,
        ),
    )
    .sort((a, b) => a.seats - b.seats);
}

export function isoAt(date: string, minute: number): string {
  return atLocal(date, minute);
}

/* ------------------------------------------------------------------ */
/* Alérgenos                                                           */
/* ------------------------------------------------------------------ */

export const ALLERGENS: { id: Allergen; label: string; code: string }[] = [
  { id: "gluten", label: "Gluten", code: "GL" },
  { id: "crustaceos", label: "Crustáceos", code: "CR" },
  { id: "huevo", label: "Huevo", code: "HU" },
  { id: "pescado", label: "Pescado", code: "PE" },
  { id: "cacahuete", label: "Cacahuete", code: "CA" },
  { id: "soja", label: "Soja", code: "SO" },
  { id: "lacteos", label: "Lácteos", code: "LA" },
  { id: "frutos_cascara", label: "Frutos de cáscara", code: "FC" },
  { id: "apio", label: "Apio", code: "AP" },
  { id: "mostaza", label: "Mostaza", code: "MO" },
  { id: "sesamo", label: "Sésamo", code: "SE" },
  { id: "sulfitos", label: "Sulfitos", code: "SU" },
  { id: "altramuces", label: "Altramuces", code: "AL" },
  { id: "moluscos", label: "Moluscos", code: "ML" },
];

export const ALLERGEN_BY_ID = Object.fromEntries(
  ALLERGENS.map((a) => [a.id, a]),
) as Record<Allergen, (typeof ALLERGENS)[number]>;

/** ¿La nota de la reserva avisa de una alergia o dieta? */
export function hasAllergyNote(note?: string): boolean {
  return Boolean(
    note &&
    /alerg|celiac|celíac|intoleran|sin gluten|vegan|lactosa|marisco|frutos secos/i.test(
      note,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Origen                                                              */
/* ------------------------------------------------------------------ */

export const TABLE_SOURCE: Record<ProClientSource, string> = {
  franky: "Franky",
  hueco: "Oferta Franky",
  card: "Franky Card",
  grupo: "Grupo Franky",
  instagram: "Instagram",
  phone: "Teléfono",
  walkin: "Sin reserva",
  google: "Google",
  unknown: "Sin indicar",
};

export function fromFranky(source: ProClientSource): boolean {
  return (
    source === "franky" ||
    source === "hueco" ||
    source === "card" ||
    source === "grupo"
  );
}

/* ------------------------------------------------------------------ */
/* Sellos                                                              */
/* ------------------------------------------------------------------ */

/** Sellos que lleva un cliente en su tarjeta actual (desde su último premio). */
export function stampsFor(
  validations: ProValidation[],
  clientName: string,
  stampsNeeded: number,
): number {
  const own = validations
    .filter((v) => v.clientName === clientName)
    .sort((a, b) => a.at.localeCompare(b.at));
  let count = 0;
  for (const v of own) {
    if (v.kind === "reward") count = 0;
    else count++;
  }
  return Math.min(count, stampsNeeded);
}

/** Estudiantes con la app que pasan a menos de 2 km en una franja (estimación de alcance). */
export function nearbyReach(walkMinutes: number): number {
  return walkMinutes <= 6 ? 1240 : walkMinutes <= 10 ? 960 : 720;
}
