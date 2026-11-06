import type {
  ProBooking,
  ProClient,
  ProData,
  ProPayment,
  ProResource,
} from "./types";
import type {
  ProBookingExtra,
  ProCourtBlock,
  ProCourtPass,
  ProCourtPenalty,
  ProCourtSeries,
  ProPlayerLevel,
  ProPlayerShare,
  ProSeriesClash,
  ProShopItem,
  ProWaitEntry,
} from "./courts-types";
import {
  addDays,
  atLocal,
  localDate,
  localMinutes,
  weekdayIndex,
} from "./format";
import {
  MATCH_MINUTES,
  SLOT_MINUTES,
  bookingMinutes,
  hoursFor,
  isFree,
  isShared,
  isValley,
  matchesOn,
  occupancyRow,
  priceFor,
  resourceBookings,
  type OpenMatchX,
} from "./courts";
import { blocksOn, courtsOps, patchCourts } from "./courts-base";

/**
 * Operaciones del día a día de un club de pádel (y lo que comparte con una
 * sala de estudio): pago por jugador, cancelaciones con preaviso, lista de
 * espera, bloqueos, turnos fijos, niveles, bonos, lluvia, luces, mapa de calor
 * y extras de mostrador.
 *
 * Todo son funciones puras sobre `ProData`: devuelven datos nuevos y las
 * pantallas los guardan con `update`. Los identificadores nuevos los pasa
 * quien llama, así las pruebas son deterministas.
 */

export type NewId = (prefix: string) => string;

const ACTIVE: ProBooking["status"][] = [
  "requested",
  "confirmed",
  "arrived",
  "in_service",
];

export function isActiveBooking(b: ProBooking): boolean {
  return ACTIVE.includes(b.status);
}

export function resourceOf(
  data: ProData,
  id: string | undefined,
): ProResource | undefined {
  return data.resources.find((r) => r.id === id);
}

/* ------------------------------------------------------------------ */
/* Pago por jugador                                                    */
/* ------------------------------------------------------------------ */

/** Reparte un importe entre n personas; la última absorbe el redondeo. */
export function shareAmounts(total: number, players: number): number[] {
  if (players <= 0) return [];
  const base = Math.floor(total / players / 5) * 5;
  const list = Array.from({ length: players }, () => base);
  list[players - 1] = total - base * (players - 1);
  return list;
}

export type ShareView = ProPlayerShare & {
  amountCents: number;
  dueCents: number;
};

/** ¿Esta reserva se paga a partes? Solo las pistas de pádel (cuatro jugadores). */
export function isSplitBooking(data: ProData, b: ProBooking): boolean {
  return resourceOf(data, b.resourceId)?.kind === "court" && b.priceCents > 0;
}

/**
 * Las cuatro partes de una reserva. Si nadie ha tocado el reparto, lo ya
 * pagado se reparte por orden (el que reservó primero).
 */
export function playerShares(data: ProData, b: ProBooking): ShareView[] {
  const stored = data.courts?.splits?.[b.id];
  const players = stored?.length ?? 4;
  const amounts = shareAmounts(b.priceCents, players);
  if (stored) {
    return stored.map((s, i) => ({
      ...s,
      amountCents: amounts[i],
      dueCents: Math.max(0, amounts[i] - s.paidCents),
    }));
  }
  let paid = b.paidCents ?? 0;
  return amounts.map((amount, i) => {
    const take = Math.min(amount, paid);
    paid -= take;
    return {
      name: i === 0 ? b.clientName : `Jugador ${i + 1}`,
      clientId: i === 0 ? b.clientId : undefined,
      paidCents: take,
      amountCents: amount,
      dueCents: amount - take,
    };
  });
}

function storeShares(data: ProData, bookingId: string, shares: ShareView[]) {
  const clean: ProPlayerShare[] = shares.map((s) => ({
    name: s.name,
    clientId: s.clientId,
    phone: s.phone,
    paidCents: s.paidCents,
    method: s.method,
    paidAt: s.paidAt,
    fromPassId: s.fromPassId,
  }));
  return patchCourts(data, (ops) => ({
    splits: { ...ops.splits, [bookingId]: clean },
  }));
}

/** Cambia el nombre o el teléfono de un jugador de la reserva. */
export function renameShare(
  data: ProData,
  bookingId: string,
  index: number,
  patch: { name?: string; phone?: string; clientId?: string },
): ProData {
  const b = data.bookings.find((x) => x.id === bookingId);
  if (!b) return data;
  const shares = playerShares(data, b).map((s, i) =>
    i === index ? { ...s, ...patch } : s,
  );
  return storeShares(data, bookingId, shares);
}

/** Cobra la parte de un jugador y deja el cobro en caja. */
export function payShare(
  data: ProData,
  input: {
    bookingId: string;
    index: number;
    method: ProPayment["method"];
    at: string;
    paymentId: string;
  },
): ProData {
  const b = data.bookings.find((x) => x.id === input.bookingId);
  if (!b) return data;
  const shares = playerShares(data, b);
  const share = shares[input.index];
  if (!share || share.dueCents <= 0) return data;
  const due = share.dueCents;
  const next = shares.map((s, i) =>
    i === input.index
      ? {
          ...s,
          paidCents: s.amountCents,
          method: input.method,
          paidAt: input.at,
        }
      : s,
  );
  const resource = resourceOf(data, b.resourceId);
  const withShares = storeShares(data, b.id, next);
  return {
    ...withShares,
    bookings: withShares.bookings.map((x) =>
      x.id === b.id ? { ...x, paidCents: (x.paidCents ?? 0) + due } : x,
    ),
    payments: [
      ...withShares.payments,
      {
        id: input.paymentId,
        at: input.at,
        bookingId: b.id,
        clientName: share.name,
        concept: `${resource?.name ?? "Pista"}, parte de ${share.name}`,
        amountCents: due,
        tipCents: 0,
        method: input.method,
      },
    ],
  };
}

export function pendingCents(b: ProBooking): number {
  if (b.paidCents === null) return 0;
  return Math.max(0, b.priceCents - b.paidCents);
}

/** Lo que falta por cobrar de las reservas de un día (sin canceladas). */
export function pendingOn(data: ProData, date: string): number {
  return resourceBookings(data, date)
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .reduce((a, b) => a + pendingCents(b), 0);
}

/* ------------------------------------------------------------------ */
/* Cancelaciones y no presentados                                      */
/* ------------------------------------------------------------------ */

export type LateCheck = {
  late: boolean;
  /** Horas que faltan para empezar (puede ser negativo si ya empezó). */
  hoursLeft: number;
  penaltyCents: number;
};

/** ¿Cancelar ahora cae dentro del preaviso del club? */
export function lateCancellation(
  data: ProData,
  b: ProBooking,
  now: Date,
): LateCheck {
  const { noticeHours, penaltyPct } = courtsOps(data).policy;
  const hoursLeft = (Date.parse(b.start) - now.getTime()) / 3600000;
  const penaltyCents =
    b.note === "Con bono" || !b.priceCents
      ? 0
      : Math.round((b.priceCents * penaltyPct) / 100 / 50) * 50;
  return {
    late: hoursLeft < noticeHours,
    hoursLeft,
    penaltyCents,
  };
}

/** Ausencias de una persona: clientes en su ficha, socios en el motor. */
export function noShowCount(data: ProData, personId?: string): number {
  if (!personId) return 0;
  const client = data.clients.find((c) => c.id === personId);
  if (client) return client.noShows;
  return data.courts?.memberNoShows?.[personId] ?? 0;
}

export function isFlagged(data: ProData, personId?: string): boolean {
  return (
    noShowCount(data, personId) >= courtsOps(data).policy.noShowWarnAt &&
    Boolean(personId)
  );
}

/** Suma una ausencia a la ficha (cliente o socio). */
export function addNoShow(data: ProData, personId?: string): ProData {
  if (!personId) return data;
  if (data.clients.some((c) => c.id === personId)) {
    return {
      ...data,
      clients: data.clients.map((c) =>
        c.id === personId ? { ...c, noShows: c.noShows + 1 } : c,
      ),
    };
  }
  return patchCourts(data, (ops) => ({
    memberNoShows: {
      ...ops.memberNoShows,
      [personId]: (ops.memberNoShows[personId] ?? 0) + 1,
    },
  }));
}

/**
 * Cierra una cancelación tardía o un no presentado: cobra la penalización o la
 * perdona, y queda anotado en el historial de la persona.
 */
export function settlePenalty(
  data: ProData,
  input: {
    bookingId: string;
    kind: ProCourtPenalty["kind"];
    charge: boolean;
    amountCents: number;
    method?: ProPayment["method"];
    at: string;
    penaltyId: string;
    paymentId: string;
  },
): ProData {
  const b = data.bookings.find((x) => x.id === input.bookingId);
  if (!b) return data;
  const penalty: ProCourtPenalty = {
    id: input.penaltyId,
    bookingId: b.id,
    clientId: b.clientId,
    clientName: b.clientName,
    at: input.at,
    kind: input.kind,
    amountCents: input.amountCents,
    status: input.charge ? "charged" : "forgiven",
  };
  const withPenalty = patchCourts(data, (ops) => ({
    penalties: [...ops.penalties, penalty],
  }));
  if (!input.charge || !input.amountCents) return withPenalty;
  const resource = resourceOf(data, b.resourceId);
  return {
    ...withPenalty,
    payments: [
      ...withPenalty.payments,
      {
        id: input.paymentId,
        at: input.at,
        bookingId: b.id,
        clientName: b.clientName,
        concept: `Penalización ${
          input.kind === "no_show" ? "por no venir" : "por cancelar tarde"
        }, ${resource?.name ?? "reserva"}`,
        amountCents: input.amountCents,
        tipCents: 0,
        method: input.method ?? "card",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

function overlaps(aFrom: number, aTo: number, bFrom: number, bTo: number) {
  return aFrom < bTo && bFrom < aTo;
}

/** Quién espera una franja que se acaba de liberar, por orden de llegada. */
export function waitersFor(
  data: ProData,
  slot: { resourceId?: string; date: string; from: number; duration: number },
): ProWaitEntry[] {
  const resource = resourceOf(data, slot.resourceId);
  return (data.courts?.waitlist ?? [])
    .filter(
      (w) =>
        (w.status === "waiting" || w.status === "notified") &&
        w.date === slot.date &&
        overlaps(w.from, w.from + w.duration, slot.from, slot.from + slot.duration) &&
        (!w.resourceId ||
          !slot.resourceId ||
          w.resourceId === slot.resourceId ||
          resourceOf(data, w.resourceId)?.kind === resource?.kind),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function waitingOn(data: ProData, date: string): ProWaitEntry[] {
  return (data.courts?.waitlist ?? [])
    .filter((w) => w.date === date && w.status === "waiting")
    .sort((a, b) => a.from - b.from || a.createdAt.localeCompare(b.createdAt));
}

export function addWaiter(data: ProData, entry: ProWaitEntry): ProData {
  return patchCourts(data, (ops) => ({ waitlist: [...ops.waitlist, entry] }));
}

export function setWaiterStatus(
  data: ProData,
  id: string,
  status: ProWaitEntry["status"],
  at: string,
): ProData {
  return patchCourts(data, (ops) => ({
    waitlist: ops.waitlist.map((w) =>
      w.id === id
        ? {
            ...w,
            status,
            notifiedAt: status === "notified" ? at : w.notifiedAt,
          }
        : w,
    ),
  }));
}

/* ------------------------------------------------------------------ */
/* Bloqueos                                                            */
/* ------------------------------------------------------------------ */

/** Reservas activas que chocan con un bloqueo antes de guardarlo. */
export function blockConflicts(
  data: ProData,
  block: Pick<ProCourtBlock, "resourceIds" | "date" | "from" | "to">,
): ProBooking[] {
  const dayStart = Date.parse(atLocal(block.date, 0));
  return block.resourceIds.flatMap((id) =>
    resourceBookings(data, block.date, id).filter((b) => {
      if (!isActiveBooking(b)) return false;
      const from = (Date.parse(b.start) - dayStart) / 60000;
      const to = (Date.parse(b.end) - dayStart) / 60000;
      return overlaps(from, to, block.from, block.to);
    }),
  );
}

export function addBlock(data: ProData, block: ProCourtBlock): ProData {
  return patchCourts(data, (ops) => ({ blocks: [...ops.blocks, block] }));
}

export function removeBlock(data: ProData, id: string): ProData {
  return patchCourts(data, (ops) => ({
    blocks: ops.blocks.filter((b) => b.id !== id),
  }));
}

/* ------------------------------------------------------------------ */
/* Turnos fijos semanales                                              */
/* ------------------------------------------------------------------ */

/** Fin de curso por defecto: 30 de junio del curso en marcha. */
export function endOfCourse(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return `${m >= 7 ? y + 1 : y}-06-30`;
}

/** Fechas de un día de la semana entre dos fechas (ambas incluidas). */
export function weeklyDates(
  startDate: string,
  until: string,
  weekday: number,
): string[] {
  let first = startDate;
  while (weekdayIndex(first) !== weekday) first = addDays(first, 1);
  const out: string[] = [];
  for (let d = first; d <= until; d = addDays(d, 7)) out.push(d);
  return out;
}

export type SeriesSpec = {
  resourceId: string;
  weekday: number;
  from: number;
  duration: number;
  startDate: string;
  until: string;
  clientId?: string;
  clientName: string;
  phone?: string;
};

export type SeriesPlan = { free: string[]; clashes: ProSeriesClash[] };

/** Qué semanas se pueden reservar y cuáles chocan, antes de crear el turno. */
export function planSeries(data: ProData, spec: SeriesSpec): SeriesPlan {
  const resource = resourceOf(data, spec.resourceId);
  const free: string[] = [];
  const clashes: ProSeriesClash[] = [];
  if (!resource) return { free, clashes };
  for (const date of weeklyDates(spec.startDate, spec.until, spec.weekday)) {
    const hours = hoursFor(data, date);
    const to = spec.from + spec.duration;
    if (!hours || spec.from < hours.open || to > hours.close) {
      clashes.push({ date, reason: "closed", status: "open" });
      continue;
    }
    const block = blocksOn(data, date, resource.id).find((b) =>
      overlaps(b.from, b.to, spec.from, to),
    );
    if (block) {
      clashes.push({
        date,
        reason: "blocked",
        withName: block.note,
        status: "open",
      });
      continue;
    }
    if (!isFree(data, resource, date, spec.from, spec.duration)) {
      const dayStart = Date.parse(atLocal(date, 0));
      const other = resourceBookings(data, date, resource.id).find((b) => {
        const f = (Date.parse(b.start) - dayStart) / 60000;
        const t = (Date.parse(b.end) - dayStart) / 60000;
        return isActiveBooking(b) && overlaps(f, t, spec.from, to);
      });
      clashes.push({
        date,
        reason: "booked",
        withName: other?.clientName ?? "Partido abierto",
        status: "open",
      });
      continue;
    }
    free.push(date);
  }
  return { free, clashes };
}

function seriesBooking(
  data: ProData,
  spec: SeriesSpec,
  resourceId: string,
  date: string,
  from: number,
  id: string,
): ProBooking {
  const resource = resourceOf(data, resourceId);
  const price = resource
    ? (priceFor(resource, date, from, spec.duration) ?? 0)
    : 0;
  return {
    id,
    kind: "court",
    clientId: spec.clientId,
    clientName: spec.clientName,
    resourceId,
    start: atLocal(date, from),
    end: atLocal(date, from + spec.duration),
    partySize: 4,
    status: "confirmed",
    priceCents: price,
    paidCents: 0,
    source: "phone",
    note: "Turno fijo",
  };
}

/** Crea el turno fijo: reserva las semanas libres y apunta los choques. */
export function createSeries(
  data: ProData,
  spec: SeriesSpec,
  input: { id: string; now: string; newId: NewId },
): { data: ProData; series: ProCourtSeries } {
  const plan = planSeries(data, spec);
  const bookings = plan.free.map((date) =>
    seriesBooking(
      data,
      spec,
      spec.resourceId,
      date,
      spec.from,
      input.newId("b"),
    ),
  );
  const resource = resourceOf(data, spec.resourceId);
  const sample = plan.free[0] ?? spec.startDate;
  const series: ProCourtSeries = {
    id: input.id,
    resourceId: spec.resourceId,
    weekday: spec.weekday,
    from: spec.from,
    duration: spec.duration,
    clientId: spec.clientId,
    clientName: spec.clientName,
    phone: spec.phone,
    startDate: spec.startDate,
    until: spec.until,
    priceCents: resource
      ? (priceFor(resource, sample, spec.from, spec.duration) ?? 0)
      : 0,
    bookingIds: bookings.map((b) => b.id),
    clashes: plan.clashes,
    createdAt: input.now,
    active: true,
  };
  const next = patchCourts(
    { ...data, bookings: [...data.bookings, ...bookings] },
    (ops) => ({ series: [...ops.series, series] }),
  );
  return { data: next, series };
}

/** Pistas u horas cercanas libres para una semana que chocaba. */
export function clashAlternatives(
  data: ProData,
  series: ProCourtSeries,
  date: string,
): { resourceId: string; from: number }[] {
  const out: { resourceId: string; from: number }[] = [];
  const main = resourceOf(data, series.resourceId);
  const courts = data.resources.filter((r) => r.kind === main?.kind);
  // Primero la misma hora en otra pista; después media hora antes o después.
  for (const shift of [0, -30, 30, -60, 60]) {
    const from = series.from + shift;
    for (const r of courts) {
      if (shift === 0 && r.id === series.resourceId) continue;
      if (isFree(data, r, date, from, series.duration))
        out.push({ resourceId: r.id, from });
      if (out.length >= 4) return out;
    }
  }
  return out;
}

/** Resuelve una semana que chocaba: moverla o dejarla sin reservar. */
export function resolveClash(
  data: ProData,
  input: {
    seriesId: string;
    date: string;
    action: { move: { resourceId: string; from: number } } | "skip";
    bookingId: string;
  },
): ProData {
  const series = courtsOps(data).series.find((s) => s.id === input.seriesId);
  if (!series) return data;
  if (input.action === "skip") {
    return patchCourts(data, (ops) => ({
      series: ops.series.map((s) =>
        s.id === series.id
          ? {
              ...s,
              clashes: s.clashes.map((c) =>
                c.date === input.date ? { ...c, status: "skipped" } : c,
              ),
            }
          : s,
      ),
    }));
  }
  const { resourceId, from } = input.action.move;
  const booking = seriesBooking(
    data,
    series,
    resourceId,
    input.date,
    from,
    input.bookingId,
  );
  return patchCourts(
    { ...data, bookings: [...data.bookings, booking] },
    (ops) => ({
      series: ops.series.map((s) =>
        s.id === series.id
          ? {
              ...s,
              bookingIds: [...s.bookingIds, booking.id],
              clashes: s.clashes.map((c) =>
                c.date === input.date
                  ? {
                      ...c,
                      status: "moved",
                      movedTo: { resourceId, from, bookingId: booking.id },
                    }
                  : c,
              ),
            }
          : s,
      ),
    }),
  );
}

/** Da de baja el turno: cancela las semanas que aún no se han jugado. */
export function endSeries(
  data: ProData,
  seriesId: string,
  fromDate: string,
): ProData {
  const series = courtsOps(data).series.find((s) => s.id === seriesId);
  if (!series) return data;
  const ids = new Set(series.bookingIds);
  return patchCourts(
    {
      ...data,
      bookings: data.bookings.map((b) =>
        ids.has(b.id) && localDate(b.start) >= fromDate && isActiveBooking(b)
          ? { ...b, status: "cancelled" }
          : b,
      ),
    },
    (ops) => ({
      series: ops.series.map((s) =>
        s.id === seriesId ? { ...s, active: false } : s,
      ),
    }),
  );
}

export function seriesOf(
  data: ProData,
  bookingId: string,
): ProCourtSeries | undefined {
  return data.courts?.series?.find((s) => s.bookingIds.includes(bookingId));
}

/* ------------------------------------------------------------------ */
/* Nivel de juego                                                      */
/* ------------------------------------------------------------------ */

export const LEVEL_STEPS = Array.from({ length: 25 }, (_, i) => 1 + i * 0.25);

export function levelLabel(level: number): string {
  return level.toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

/** "3,0" → 3; "Iniciación" → 1,5. Para los partidos abiertos y americanas. */
export function levelValue(label: string): number {
  if (/inicia/i.test(label)) return 1.5;
  const n = Number(label.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export function levelOf(
  data: ProData,
  clientId?: string,
): ProPlayerLevel | undefined {
  return clientId ? data.courts?.levels?.[clientId] : undefined;
}

export function setLevel(
  data: ProData,
  clientId: string,
  patch: Partial<Omit<ProPlayerLevel, "history">>,
  at: string,
): ProData {
  return patchCourts(data, (ops) => {
    const prev: ProPlayerLevel = ops.levels[clientId] ?? {
      level: 3,
      hand: "right",
      side: "both",
      history: [],
    };
    const level = patch.level ?? prev.level;
    const history =
      patch.level !== undefined && patch.level !== prev.level
        ? [...prev.history, { at, level }]
        : prev.history;
    return {
      levels: {
        ...ops.levels,
        [clientId]: { ...prev, ...patch, level, history },
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/* Partidos abiertos que liberan la pista a tiempo                     */
/* ------------------------------------------------------------------ */

/** Hora a la que un partido incompleto deja de ocupar la pista. */
export function matchDeadline(data: ProData, m: OpenMatchX): string {
  if (m.releaseAt) return m.releaseAt;
  const hours = courtsOps(data).policy.matchReleaseHours;
  return new Date(Date.parse(m.start) - hours * 3600000).toISOString();
}

/** Partidos incompletos que ya han pasado su hora límite y siguen ocupando. */
export function overdueMatches(data: ProData, now: Date): OpenMatchX[] {
  return (data.openMatches as OpenMatchX[]).filter(
    (m) =>
      !m.releasedAt &&
      m.needed > 0 &&
      Date.parse(m.start) > now.getTime() - MATCH_MINUTES * 60000 &&
      Date.parse(matchDeadline(data, m)) <= now.getTime(),
  );
}

/** Marca los partidos vencidos como liberados: la pista vuelve a estar libre. */
export function releaseMatches(
  data: ProData,
  ids: string[],
  at: string,
): ProData {
  if (!ids.length) return data;
  const set = new Set(ids);
  return {
    ...data,
    openMatches: data.openMatches.map((m) =>
      set.has(m.id) ? ({ ...m, releasedAt: at } as OpenMatchX) : m,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Buscador de cuarto jugador y jugadores dormidos                     */
/* ------------------------------------------------------------------ */

export type PlayerSuggestion = {
  client: ProClient;
  level: number;
  /** Veces que ha jugado a una hora parecida en las últimas semanas. */
  sameHour: number;
};

/**
 * Jugadores del club de nivel parecido (medio punto arriba o abajo) que
 * suelen jugar a esa hora. Los que ya están en el partido no salen.
 */
export function fourthPlayerCandidates(
  data: ProData,
  input: { level: number; minute: number; exclude: string[]; limit?: number },
): PlayerSuggestion[] {
  const levels = data.courts?.levels ?? {};
  const exclude = new Set(input.exclude.map((n) => n.toLowerCase()));
  const habits = new Map<string, number>();
  for (const b of data.bookings) {
    if (!b.clientId || b.status === "cancelled") continue;
    if (Math.abs(localMinutes(b.start) - input.minute) > 90) continue;
    habits.set(b.clientId, (habits.get(b.clientId) ?? 0) + 1);
  }
  return data.clients
    .filter((c) => levels[c.id] && !exclude.has(c.name.toLowerCase()))
    .map((c) => ({
      client: c,
      level: levels[c.id].level,
      sameHour: habits.get(c.id) ?? 0,
    }))
    .filter((s) => Math.abs(s.level - input.level) <= 0.5 && s.client.phone)
    .sort(
      (a, b) =>
        b.sameHour - a.sameHour ||
        Math.abs(a.level - input.level) - Math.abs(b.level - input.level) ||
        a.client.name.localeCompare(b.client.name),
    )
    .slice(0, input.limit ?? 6);
}

/** Quien venía a menudo y lleva tres semanas o más sin reservar. */
export function dormantPlayers(data: ProData, today: string): ProClient[] {
  const limit = addDays(today, -21);
  return data.clients
    .filter(
      (c) =>
        c.visits >= 6 &&
        c.lastVisit &&
        localDate(c.lastVisit) <= limit &&
        !data.bookings.some(
          (b) =>
            b.clientId === c.id &&
            isActiveBooking(b) &&
            localDate(b.start) >= today,
        ),
    )
    .sort((a, b) => b.visits - a.visits);
}

/* ------------------------------------------------------------------ */
/* Bonos y monedero                                                    */
/* ------------------------------------------------------------------ */

export function passUnit(p: Pick<ProCourtPass, "kind">): string {
  return p.kind === "matches" ? "partidos" : p.kind === "hours" ? "horas" : "";
}

export function isPassActive(p: ProCourtPass, today: string): boolean {
  return p.left > 0 && localDate(p.expiresAt) >= today;
}

/** Bonos en vigor de una persona, por id de cliente o por nombre. */
export function passesOf(
  data: ProData,
  who: { clientId?: string; name?: string },
  today: string,
): ProCourtPass[] {
  const name = who.name?.trim().toLowerCase();
  return (data.courts?.passes ?? []).filter(
    (p) =>
      isPassActive(p, today) &&
      ((who.clientId && p.clientId === who.clientId) ||
        (!!name && p.name.toLowerCase() === name)),
  );
}

/** Cuánto descuenta del bono una reserva: 1 partido, sus horas o su precio. */
export function passCost(
  p: ProCourtPass,
  minutes: number,
  priceCents: number,
): number {
  if (p.kind === "matches") return 1;
  if (p.kind === "hours") return Math.round((minutes / 60) * 100) / 100;
  return priceCents;
}

export function sellPass(
  data: ProData,
  pass: ProCourtPass,
  input: { method: ProPayment["method"]; paymentId: string },
): ProData {
  const withPass = patchCourts(data, (ops) => ({
    passes: [...ops.passes, pass],
  }));
  return {
    ...withPass,
    payments: [
      ...withPass.payments,
      {
        id: input.paymentId,
        at: pass.soldAt,
        clientName: pass.name,
        concept: pass.label,
        amountCents: pass.priceCents,
        tipCents: 0,
        method: input.method,
      },
    ],
  };
}

/** Descuenta una reserva del bono o del monedero. */
export function usePass(
  data: ProData,
  input: { passId: string; bookingId: string; amount: number; at: string },
): ProData {
  return patchCourts(data, (ops) => ({
    passes: ops.passes.map((p) =>
      p.id === input.passId
        ? {
            ...p,
            left: Math.max(0, Math.round((p.left - input.amount) * 100) / 100),
            uses: [
              ...p.uses,
              { at: input.at, bookingId: input.bookingId, amount: input.amount },
            ],
          }
        : p,
    ),
  }));
}

/** Bonos a punto de acabarse o de caducar: la venta más fácil de la semana. */
export function passesToRenew(data: ProData, today: string): ProCourtPass[] {
  const soon = addDays(today, 7);
  return (data.courts?.passes ?? [])
    .filter((p) => localDate(p.expiresAt) >= addDays(today, -14))
    .filter(
      (p) =>
        (p.kind === "wallet" ? p.left < 1000 : p.left <= 1) ||
        localDate(p.expiresAt) <= soon,
    )
    .sort((a, b) => a.left - b.left || a.expiresAt.localeCompare(b.expiresAt));
}

/* ------------------------------------------------------------------ */
/* Lluvia                                                              */
/* ------------------------------------------------------------------ */

export type RainMove = {
  bookingId: string;
  clientName: string;
  fromResourceId: string;
  from: number;
  duration: number;
  /** Pista cubierta y hora propuestas, o null si no cabe en ninguna. */
  to: { resourceId: string; from: number } | null;
};

export function isCovered(data: ProData, resourceId?: string): boolean {
  return Boolean(
    resourceId && data.courts?.coveredIds?.includes(resourceId),
  );
}

/**
 * Plan para un día de lluvia: cada reserva en pista exterior que aún no ha
 * empezado pasa a la cubierta libre más cercana en hora (primero la misma
 * hora, después hasta dos horas antes o después). Las que no caben se
 * proponen para cancelar sin coste.
 */
export function rainPlan(
  data: ProData,
  date: string,
  fromMinute: number,
): RainMove[] {
  const covered = data.resources.filter(
    (r) => r.kind === "court" && isCovered(data, r.id),
  );
  const outdoor = data.resources.filter(
    (r) => r.kind === "court" && !isCovered(data, r.id),
  );
  const moves: RainMove[] = [];
  // Se va ocupando una copia para que dos reservas no acaben en el mismo hueco.
  let work = data;
  const list = outdoor
    .flatMap((r) => resourceBookings(data, date, r.id))
    .filter(
      (b) =>
        (b.status === "confirmed" || b.status === "requested") &&
        localDate(b.start) === date &&
        localMinutes(b.start) >= fromMinute,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const b of list) {
    const from = localMinutes(b.start);
    const duration = bookingMinutes(b);
    let target: RainMove["to"] = null;
    for (const shift of [0, -30, 30, -60, 60, -90, 90, -120, 120]) {
      const start = from + shift;
      if (start < fromMinute) continue;
      const court = covered.find((r) =>
        isFree(work, r, date, start, duration),
      );
      if (court) {
        target = { resourceId: court.id, from: start };
        break;
      }
    }
    moves.push({
      bookingId: b.id,
      clientName: b.clientName,
      fromResourceId: b.resourceId ?? "",
      from,
      duration,
      to: target,
    });
    if (target) {
      work = {
        ...work,
        bookings: work.bookings.map((x) =>
          x.id === b.id
            ? {
                ...x,
                resourceId: target.resourceId,
                start: atLocal(date, target.from),
                end: atLocal(date, target.from + duration),
              }
            : x,
        ),
      };
    }
  }
  return moves;
}

/** Aplica el plan: mueve lo que cabe y cancela sin coste lo que no. */
export function applyRain(
  data: ProData,
  date: string,
  moves: RainMove[],
): ProData {
  const byId = new Map(moves.map((m) => [m.bookingId, m]));
  return {
    ...data,
    bookings: data.bookings.map((b) => {
      const m = byId.get(b.id);
      if (!m) return b;
      if (!m.to) {
        return { ...b, status: "cancelled", note: "Cancelada por lluvia" };
      }
      const resource = resourceOf(data, m.to.resourceId);
      const price = resource
        ? priceFor(resource, date, m.to.from, m.duration)
        : null;
      return {
        ...b,
        resourceId: m.to.resourceId,
        start: atLocal(date, m.to.from),
        end: atLocal(date, m.to.from + m.duration),
        // Se respeta el precio que tenía: la lluvia no la paga el jugador.
        priceCents: Math.min(b.priceCents, price ?? b.priceCents),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Hoja de luces                                                       */
/* ------------------------------------------------------------------ */

/**
 * Hora aproximada a la que anochece en Alicante, por mes (hora oficial de
 * Madrid, día 15). Solo sirve para decidir desde cuándo hace falta luz en las
 * pistas exteriores.
 */
const DUSK_ALICANTE = [
  18 * 60 + 10, // enero
  18 * 60 + 40,
  19 * 60 + 5,
  20 * 60 + 35, // abril (horario de verano)
  21 * 60,
  21 * 60 + 25,
  21 * 60 + 20,
  20 * 60 + 50,
  20 * 60 + 5,
  19 * 60 + 20,
  18 * 60 + 5, // noviembre (horario de invierno)
  17 * 60 + 55,
];

export function duskMinute(date: string): number {
  return DUSK_ALICANTE[Number(date.slice(5, 7)) - 1] ?? 19 * 60;
}

export type LightSpan = { on: number; off: number };

/**
 * A qué hora encender y apagar cada pista: las cubiertas cuando hay juego,
 * las exteriores solo desde que anochece. Huecos de menos de 15 minutos no
 * apagan la luz.
 */
export function lightsPlan(
  data: ProData,
  date: string,
): { resourceId: string; spans: LightSpan[] }[] {
  const dayStart = Date.parse(atLocal(date, 0));
  const dusk = duskMinute(date);
  return data.resources
    .filter((r) => r.kind === "court")
    .map((r) => {
      const busy: LightSpan[] = [
        ...resourceBookings(data, date, r.id)
          .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
          .map((b) => ({
            on: (Date.parse(b.start) - dayStart) / 60000,
            off: (Date.parse(b.end) - dayStart) / 60000,
          })),
        ...matchesOn(data, date, r.id)
          .filter((m) => !m.releasedAt)
          .map((m) => ({
            on: localMinutes(m.start),
            off: localMinutes(m.start) + MATCH_MINUTES,
          })),
        ...blocksOn(data, date, r.id)
          .filter((b) => b.reason !== "maintenance")
          .map((b) => ({ on: b.from, off: b.to })),
      ].sort((a, b) => a.on - b.on);
      const covered = isCovered(data, r.id);
      const spans: LightSpan[] = [];
      for (const span of busy) {
        const on = covered ? span.on : Math.max(span.on, dusk);
        if (on >= span.off) continue;
        const last = spans[spans.length - 1];
        if (last && on - last.off < 15) last.off = Math.max(last.off, span.off);
        else spans.push({ on, off: span.off });
      }
      return { resourceId: r.id, spans };
    });
}

/* ------------------------------------------------------------------ */
/* Mapa de calor semanal y huecos repetidos                            */
/* ------------------------------------------------------------------ */

export type HeatRow = {
  date: string;
  weekday: number;
  /** Ocupación de 0 a 1 por media hora; null si está cerrado. */
  cells: (number | null)[];
  average: number;
};

export type Heatmap = { slots: number[]; rows: HeatRow[]; average: number };

/**
 * Ocupación por media hora de varios días seguidos. Con `resourceId`, de esa
 * pista o zona; sin él, la media de todas.
 */
export function weekHeatmap(
  data: ProData,
  fromDate: string,
  days = 7,
  resourceId?: string,
): Heatmap {
  const dates = Array.from({ length: days }, (_, i) => addDays(fromDate, i));
  const hours = dates.map((d) => hoursFor(data, d));
  const open = Math.min(...hours.map((h) => h?.open ?? 24 * 60));
  const close = Math.max(...hours.map((h) => h?.close ?? 0));
  const slots: number[] = [];
  for (let m = open; m < close; m += SLOT_MINUTES) slots.push(m);
  const resources = data.resources.filter(
    (r) => !resourceId || r.id === resourceId,
  );
  let sum = 0;
  let count = 0;
  const rows = dates.map((date, i) => {
    const h = hours[i];
    const rowsByResource = resources.map((r) =>
      occupancyRow(data, r, date, slots).map((occ) =>
        Math.min(1, isShared(r) ? occ / Math.max(1, r.capacity) : occ ? 1 : 0),
      ),
    );
    let rowSum = 0;
    let rowCount = 0;
    const cells = slots.map((m, k) => {
      if (!h || m < h.open || m >= h.close || !resources.length) return null;
      const v =
        rowsByResource.reduce((a, list) => a + list[k], 0) / resources.length;
      rowSum += v;
      rowCount++;
      return v;
    });
    sum += rowSum;
    count += rowCount;
    return {
      date,
      weekday: weekdayIndex(date),
      cells,
      average: rowCount ? rowSum / rowCount : 0,
    };
  });
  return { slots, rows, average: count ? sum / count : 0 };
}

export type ColdSpot = {
  from: number;
  to: number;
  /** Días laborables en los que esa franja se queda casi vacía. */
  weekdays: number[];
  valley: boolean;
};

/**
 * Franjas que se repiten casi vacías (25 % o menos) al menos tres días
 * laborables: ahí es donde una oferta o un partido abierto rinde de verdad.
 */
export function coldSpots(heat: Heatmap, threshold = 0.25): ColdSpot[] {
  const weekdayRows = heat.rows.filter((r) => r.weekday < 5);
  const coldDays = heat.slots.map((_, k) =>
    weekdayRows
      .filter((r) => r.cells[k] !== null && (r.cells[k] as number) <= threshold)
      .map((r) => r.weekday),
  );
  const spots: ColdSpot[] = [];
  let run: { from: number; days: Set<number> } | null = null;
  const flush = (to: number) => {
    if (run && to - run.from >= 60) {
      const from = run.from;
      spots.push({
        from,
        to,
        weekdays: [...run.days].sort(),
        valley: weekdayRows.length > 0 && isValley(weekdayRows[0].date, from),
      });
    }
    run = null;
  };
  heat.slots.forEach((m, k) => {
    if (coldDays[k].length >= 3) {
      if (!run) run = { from: m, days: new Set(coldDays[k]) };
      else coldDays[k].forEach((d) => run!.days.add(d));
    } else flush(m);
  });
  flush((heat.slots[heat.slots.length - 1] ?? 0) + SLOT_MINUTES);
  return spots.sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 4);
}

/** Reservas y euros que han llegado por franjas valle desde una fecha. */
export function valleyResults(
  data: ProData,
  since: string,
  until: string,
): { bookings: number; revenueCents: number } {
  const list = data.bookings.filter(
    (b) =>
      b.resourceId &&
      (b.status === "done" || isActiveBooking(b)) &&
      localDate(b.start) >= since &&
      localDate(b.start) <= until &&
      (b.source === "hueco" ||
        (b.student && isValley(localDate(b.start), localMinutes(b.start)))),
  );
  return {
    bookings: list.length,
    revenueCents: list.reduce((a, b) => a + b.priceCents, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Mostrador: extras y pistas libres ahora                             */
/* ------------------------------------------------------------------ */

export function extrasOf(data: ProData, bookingId: string): ProBookingExtra[] {
  return data.courts?.extras?.[bookingId] ?? [];
}

/** Añade palas, bolas o bebidas a una reserva y los suma a lo que se paga. */
export function addExtra(
  data: ProData,
  bookingId: string,
  item: ProShopItem,
  qty = 1,
): ProData {
  const b = data.bookings.find((x) => x.id === bookingId);
  if (!b || (item.stock !== null && item.stock < qty)) return data;
  const current = extrasOf(data, bookingId);
  const found = current.find((e) => e.itemId === item.id);
  const list = found
    ? current.map((e) => (e.itemId === item.id ? { ...e, qty: e.qty + qty } : e))
    : [
        ...current,
        { itemId: item.id, name: item.name, qty, priceCents: item.priceCents },
      ];
  const withExtras = patchCourts(data, (ops) => ({
    extras: { ...ops.extras, [bookingId]: list },
    shop: ops.shop.map((s) =>
      s.id === item.id && s.stock !== null ? { ...s, stock: s.stock - qty } : s,
    ),
  }));
  return {
    ...withExtras,
    bookings: withExtras.bookings.map((x) =>
      x.id === bookingId
        ? { ...x, priceCents: x.priceCents + item.priceCents * qty }
        : x,
    ),
  };
}

/** Minutos que una pista seguirá libre desde ese momento (hasta cerrar). */
export function freeFor(
  data: ProData,
  resource: ProResource,
  date: string,
  minute: number,
): number {
  const hours = hoursFor(data, date);
  if (!hours) return 0;
  let m = Math.ceil(minute / SLOT_MINUTES) * SLOT_MINUTES;
  const start = m;
  while (m < hours.close && isFree(data, resource, date, m, SLOT_MINUTES))
    m += SLOT_MINUTES;
  return m - start;
}

/** Quién entra en las próximas horas (o ya está dentro sin haber llegado). */
export function arrivalsSoon(
  data: ProData,
  now: Date,
  windowMinutes = 120,
): ProBooking[] {
  const date = localDate(now);
  const limit = now.getTime() + windowMinutes * 60000;
  return resourceBookings(data, date)
    .filter(
      (b) =>
        (b.status === "confirmed" ||
          b.status === "requested" ||
          b.status === "arrived") &&
        Date.parse(b.end) > now.getTime() &&
        Date.parse(b.start) <= limit,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Precio de una pista en una franja o 0 si no tiene tarifa. */
export function slotPrice(
  resource: ProResource,
  date: string,
  from: number,
  duration: number,
): number {
  return priceFor(resource, date, from, duration) ?? 0;
}

