/**
 * Operación diaria del motor de agenda: mensajes con plantilla, recordatorios
 * y confirmaciones, señales contra los no presentados, lista de espera,
 * bloqueos, citas periódicas y cola de sin cita.
 *
 * Son funciones puras: calculan listas o devuelven el `ProData` siguiente, y
 * las pantallas las pasan a `update`. Los identificadores y la hora los pone
 * quien llama, así los resultados se pueden probar sin trucos.
 */
import type {
  BookingStatus,
  ProBooking,
  ProClient,
  ProData,
  ProPayment,
  ProService,
  ProSpace,
  ProStaff,
} from "./types";
import type {
  ProAgendaAbsence,
  ProAgendaBlock,
  ProAgendaOps,
  ProAgendaSettings,
  ProBookingAgenda,
  ProCabin,
  ProConsentTemplate,
  ProTemplateKind,
  ProWaitlistEntry,
  ProWalkin,
} from "./agenda-types";
import {
  bookingsOn,
  durationFor,
  freeGaps,
  isoFor,
  plusMinutes,
  serviceFor,
  startTimes,
  type Gap,
} from "./agenda";
import {
  addDays,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  time,
  weekdayIndex,
} from "./format";

/* ------------------------------------------------------------------ */
/* Ajustes y plantillas                                                */
/* ------------------------------------------------------------------ */

export const DEFAULT_TEMPLATES: Record<ProTemplateKind, string> = {
  reminder:
    "Hola {nombre}, te recordamos tu cita en {negocio} el {dia} a las {hora} para {servicio} con {profesional}. ¿Nos confirmas que vienes? Si necesitas cambiarla: {enlace}",
  change:
    "Hola {nombre}, te escribimos de {negocio}. Tu cita de {servicio} queda el {dia} a las {hora}. Si no te viene bien, dinos y buscamos otra hora.",
  thanks:
    "Gracias por venir, {nombre}. Si te ha gustado, nos ayuda muchísimo que lo cuentes aquí: {resena}",
  comeback:
    "Hola {nombre}, ya van {semanas} semanas desde tu último {servicio}. Te guardo hueco el {dia} a las {hora} con {profesional}. ¿Te lo reservo?",
  birthday:
    "¡Feliz cumpleaños, {nombre}! Todo el equipo de {negocio} te desea un gran día. Cuando quieras darte un capricho, aquí estamos.",
  waitlist:
    "Hola {nombre}, se nos ha liberado un hueco el {dia} a las {hora} para {servicio}. ¿Te lo guardo?",
  deposit:
    "Hola {nombre}, para guardarte la cita del {dia} a las {hora} te pedimos una señal de {senal} por Bizum. Se descuenta del precio cuando vengas.",
  aftercare:
    "Hola {nombre}, gracias por venir. Para cuidar tu {servicio}: {cuidados}",
};

export const TEMPLATE_META: Record<
  ProTemplateKind,
  { label: string; when: string }
> = {
  reminder: { label: "Recordatorio", when: "El día antes de la cita" },
  change: { label: "Cambio de cita", when: "Cuando mueves una cita" },
  thanks: { label: "Gracias y reseña", when: "Después de cobrar" },
  comeback: { label: "Te toca volver", when: "Cuando pasa su ritmo habitual" },
  birthday: { label: "Cumpleaños", when: "La semana de su cumpleaños" },
  waitlist: { label: "Hueco libre", when: "Cuando se libera un hueco" },
  deposit: { label: "Señal", when: "Al pedir señal por Bizum" },
  aftercare: { label: "Cuidados", when: "Al terminar el tratamiento" },
};

export const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "dia", label: "Día" },
  { key: "hora", label: "Hora" },
  { key: "servicio", label: "Servicio" },
  { key: "profesional", label: "Profesional" },
  { key: "negocio", label: "Negocio" },
];

export function defaultAgendaSettings(space: ProSpace): ProAgendaSettings {
  return {
    depositAfterNoShows: 2,
    depositCents: 500,
    patchTestValidDays: 180,
    cancellationPolicy:
      "Si no puedes venir, avísanos con 24 horas para dar tu hueco a otra persona.",
    reviewUrl: publicLink(space),
  };
}

/** Estado inicial vacío: lo que tiene un negocio que acaba de empezar. */
export function emptyAgendaOps(space: ProSpace): ProAgendaOps {
  return {
    settings: defaultAgendaSettings(space),
    templates: { ...DEFAULT_TEMPLATES },
    waitlist: [],
    blocks: [],
    absences: [],
    products: [],
    bundles: [],
    giftCards: [],
    walkins: [],
    cabins: [],
    consentTemplates: [],
  };
}

export function publicLink(space: Pick<ProSpace, "slug">): string {
  return `https://franky.es/n/${space.slug}`;
}

/** Sustituye {nombre}, {hora}... Las claves que no se conocen se dejan tal cual. */
export function fillTemplate(
  text: string,
  vars: Record<string, string | undefined>,
): string {
  return text.replace(/\{([a-zñ]+)\}/gi, (match, key: string) => {
    const value = vars[key.toLowerCase()];
    return value === undefined || value === "" ? match : value;
  });
}

export function templateText(data: ProData, kind: ProTemplateKind): string {
  return data.agendaOps?.templates[kind]?.trim() || DEFAULT_TEMPLATES[kind];
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Variables de una cita para rellenar cualquier plantilla. */
export function bookingVars(
  data: ProData,
  booking: ProBooking,
): Record<string, string> {
  const service = serviceFor(data, booking);
  const staff = data.staff.find((row) => row.id === booking.staffId);
  return {
    nombre: firstName(booking.clientName),
    negocio: data.space.name,
    dia: dayLabel(booking.start),
    hora: time(booking.start),
    servicio: service?.name.toLowerCase() ?? "tu cita",
    profesional: staff ? firstName(staff.name) : "el equipo",
    enlace: publicLink(data.space),
    resena: data.agendaOps?.settings.reviewUrl ?? publicLink(data.space),
    senal: money(booking.agenda?.deposit?.cents ?? 0),
    cuidados: service?.agenda?.aftercare ?? "",
  };
}

export function bookingMessage(
  data: ProData,
  kind: ProTemplateKind,
  booking: ProBooking,
): string {
  return fillTemplate(templateText(data, kind), bookingVars(data, booking));
}

/* ------------------------------------------------------------------ */
/* Cambios pequeños sobre una cita                                     */
/* ------------------------------------------------------------------ */

function patchBooking(
  data: ProData,
  bookingId: string,
  fn: (booking: ProBooking) => ProBooking,
): ProData {
  return {
    ...data,
    bookings: data.bookings.map((row) =>
      row.id === bookingId ? fn(row) : row,
    ),
  };
}

function withAgenda(
  booking: ProBooking,
  patch: Partial<ProBookingAgenda>,
): ProBooking {
  return { ...booking, agenda: { ...booking.agenda, ...patch } };
}

function patchOps(
  data: ProData,
  fn: (ops: ProAgendaOps) => ProAgendaOps,
): ProData {
  if (!data.agendaOps) return data;
  return { ...data, agendaOps: fn(data.agendaOps) };
}

/* ------------------------------------------------------------------ */
/* Recordatorios y confirmación                                        */
/* ------------------------------------------------------------------ */

export type ReminderRow = {
  booking: ProBooking;
  client?: ProClient;
  service?: ProService;
  staff?: ProStaff;
  phone?: string;
  reminded: boolean;
  confirmed: boolean;
};

/** Citas de un día que conviene recordar, en orden de hora. */
export function remindersOn(data: ProData, date: string): ReminderRow[] {
  return bookingsOn(data, date)
    .filter(
      (booking) =>
        booking.kind === "appointment" &&
        localDate(booking.start) === date &&
        (booking.status === "confirmed" || booking.status === "requested"),
    )
    .map((booking) => {
      const client = data.clients.find((row) => row.id === booking.clientId);
      return {
        booking,
        client,
        service: serviceFor(data, booking),
        staff: data.staff.find((row) => row.id === booking.staffId),
        phone: client?.phone,
        reminded: Boolean(booking.agenda?.remindedAt),
        confirmed: Boolean(booking.agenda?.confirmedAt),
      };
    });
}

export function reminderStats(rows: ReminderRow[]) {
  return {
    total: rows.length,
    reminded: rows.filter((row) => row.reminded).length,
    confirmed: rows.filter((row) => row.confirmed).length,
    unconfirmed: rows.filter((row) => !row.confirmed).length,
    toRemind: rows.filter((row) => !row.reminded && !row.confirmed).length,
  };
}

/** Una cita confirmada por el salón pero de la que el cliente no ha dicho nada. */
export function awaitsClient(booking: ProBooking): boolean {
  return (
    (booking.status === "confirmed" || booking.status === "requested") &&
    !booking.agenda?.confirmedAt
  );
}

export function markReminded(data: ProData, bookingId: string, at: string) {
  return patchBooking(data, bookingId, (row) =>
    withAgenda(row, { remindedAt: at }),
  );
}

export function markConfirmed(data: ProData, bookingId: string, at: string) {
  return patchBooking(data, bookingId, (row) =>
    withAgenda(row, {
      confirmedAt: at,
      remindedAt: row.agenda?.remindedAt ?? at,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Estados y señal                                                     */
/* ------------------------------------------------------------------ */

/**
 * Cambia el estado de una cita. Al no presentarse suma una falta a la ficha
 * y, si había señal cobrada, la señal se queda en caja.
 */
export function setBookingStatus(
  data: ProData,
  bookingId: string,
  status: BookingStatus,
): ProData {
  const booking = data.bookings.find((row) => row.id === bookingId);
  if (!booking) return data;
  const deposit = booking.agenda?.deposit;
  const keep = status === "no_show" && deposit?.status === "paid";
  return {
    ...data,
    bookings: data.bookings.map((row) =>
      row.id === bookingId
        ? keep
          ? withAgenda(
              { ...row, status },
              { deposit: { ...deposit, status: "kept" } },
            )
          : { ...row, status }
        : row,
    ),
    clients:
      status === "no_show" && booking.clientId
        ? data.clients.map((client) =>
            client.id === booking.clientId
              ? { ...client, noShows: client.noShows + 1 }
              : client,
          )
        : data.clients,
  };
}

export type DepositRule = { cents: number; reason: "noshows" | "service" };

/**
 * ¿Hay que pedir señal? Primero la del servicio (tratamientos largos), después
 * la regla de faltas del negocio.
 */
export function depositRule(
  data: ProData,
  clientId: string | undefined,
  serviceId: string | undefined,
): DepositRule | null {
  const service = data.services.find((row) => row.id === serviceId);
  const serviceCents = service?.agenda?.depositCents ?? 0;
  if (serviceCents > 0) return { cents: serviceCents, reason: "service" };
  const settings = data.agendaOps?.settings;
  const client = data.clients.find((row) => row.id === clientId);
  if (
    settings &&
    client &&
    settings.depositAfterNoShows > 0 &&
    client.noShows >= settings.depositAfterNoShows
  )
    return { cents: settings.depositCents, reason: "noshows" };
  return null;
}

export function requestDeposit(
  data: ProData,
  bookingId: string,
  cents: number,
) {
  return patchBooking(data, bookingId, (row) =>
    withAgenda(row, { deposit: { cents, status: "pending" } }),
  );
}

/** La señal llega (casi siempre por Bizum): entra en caja y rebaja lo pendiente. */
export function receiveDeposit(
  data: ProData,
  bookingId: string,
  input: { method: ProPayment["method"]; at: string; paymentId: string },
): ProData {
  const booking = data.bookings.find((row) => row.id === bookingId);
  const deposit = booking?.agenda?.deposit;
  if (!booking || !deposit || deposit.status !== "pending") return data;
  const service = serviceFor(data, booking);
  const payment: ProPayment = {
    id: input.paymentId,
    at: input.at,
    bookingId,
    clientName: booking.clientName,
    staffId: booking.staffId,
    concept: `Señal · ${service?.name ?? "Cita"}`,
    amountCents: deposit.cents,
    tipCents: 0,
    method: input.method,
    agenda: {
      kind: "deposit",
      lines: [
        {
          kind: "service",
          refId: booking.serviceId,
          name: `Señal · ${service?.name ?? "Cita"}`,
          qty: 1,
          cents: deposit.cents,
        },
      ],
      discountCents: 0,
      depositAppliedCents: 0,
      giftCardCents: 0,
    },
  };
  return {
    ...patchBooking(data, bookingId, (row) =>
      withAgenda(
        { ...row, paidCents: (row.paidCents ?? 0) + deposit.cents },
        {
          deposit: {
            ...deposit,
            status: "paid",
            method: input.method,
            at: input.at,
          },
        },
      ),
    ),
    payments: [...data.payments, payment],
  };
}

/** Se devuelve la señal (cancelación con tiempo): sale de caja. */
export function returnDeposit(data: ProData, bookingId: string): ProData {
  const booking = data.bookings.find((row) => row.id === bookingId);
  const deposit = booking?.agenda?.deposit;
  if (!booking || !deposit || deposit.status === "pending") return data;
  if (deposit.status === "returned") return data;
  return {
    ...patchBooking(data, bookingId, (row) =>
      withAgenda(
        {
          ...row,
          paidCents: Math.max(0, (row.paidCents ?? 0) - deposit.cents),
        },
        { deposit: { ...deposit, status: "returned" } },
      ),
    ),
    payments: data.payments.filter(
      (payment) =>
        !(
          payment.bookingId === bookingId && payment.agenda?.kind === "deposit"
        ),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

export type WaitlistMatch = {
  entry: ProWaitlistEntry;
  gap: Gap;
  /** Minuto en el que empezaría la cita dentro del hueco. */
  start: number;
};

/** ¿Cabe lo que pide esta persona en el hueco? */
export function waitlistFit(
  data: ProData,
  entry: ProWaitlistEntry,
  gap: Gap,
): number | null {
  if (entry.status !== "waiting") return null;
  if (entry.date && entry.date !== gap.date) return null;
  if (entry.staffId && entry.staffId !== gap.staffId) return null;
  const service = data.services.find((row) => row.id === entry.serviceId);
  if (!service || !service.staffIds.includes(gap.staffId)) return null;
  const start = Math.max(gap.from, entry.from);
  const end = Math.min(gap.to, entry.to);
  return end - start >= durationFor(service, gap.staffId) ? start : null;
}

export function waitlistMatches(data: ProData, gap: Gap): WaitlistMatch[] {
  return (data.agendaOps?.waitlist ?? [])
    .map((entry) => ({ entry, gap, start: waitlistFit(data, entry, gap) }))
    .filter((row): row is WaitlistMatch => row.start !== null)
    .sort((a, b) => a.entry.createdAt.localeCompare(b.entry.createdAt));
}

/** Cruza los huecos del día con la lista: cada persona aparece una vez. */
export function waitlistForDay(
  data: ProData,
  date: string,
  fromMinute: number,
): WaitlistMatch[] {
  const seen = new Set<string>();
  const out: WaitlistMatch[] = [];
  for (const gap of freeGaps(data, date, fromMinute, 15)) {
    for (const match of waitlistMatches(data, gap)) {
      if (seen.has(match.entry.id)) continue;
      seen.add(match.entry.id);
      out.push(match);
    }
  }
  return out;
}

export function waitingCount(data: ProData): number {
  return (data.agendaOps?.waitlist ?? []).filter(
    (entry) => entry.status === "waiting" || entry.status === "offered",
  ).length;
}

export function addWaitlist(data: ProData, entry: ProWaitlistEntry): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    waitlist: [...ops.waitlist, entry],
  }));
}

export function setWaitlistStatus(
  data: ProData,
  entryId: string,
  status: ProWaitlistEntry["status"],
  at?: string,
): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    waitlist: ops.waitlist.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            status,
            offeredAt: status === "offered" ? at : entry.offeredAt,
          }
        : entry,
    ),
  }));
}

/** Da el hueco a alguien de la lista: crea la cita y la marca como recuperada. */
export function bookFromWaitlist(
  data: ProData,
  entryId: string,
  input: { bookingId: string; staffId: string; date: string; minute: number },
): ProData {
  const entry = data.agendaOps?.waitlist.find((row) => row.id === entryId);
  const service = data.services.find((row) => row.id === entry?.serviceId);
  if (!entry || !service) return data;
  const client = data.clients.find((row) => row.id === entry.clientId);
  const booking: ProBooking = {
    id: input.bookingId,
    kind: "appointment",
    clientId: entry.clientId,
    clientName: entry.name,
    staffId: input.staffId,
    serviceId: service.id,
    start: isoFor(input.date, input.minute),
    end: isoFor(input.date, input.minute + durationFor(service, input.staffId)),
    partySize: 1,
    status: "confirmed",
    priceCents: service.priceCents,
    paidCents: 0,
    source: client?.source ?? "phone",
    student: Boolean(client?.student?.verified),
    agenda: { recoveredFrom: "waitlist" },
  };
  return patchOps(
    { ...data, bookings: [...data.bookings, booking] },
    (ops) => ({
      ...ops,
      waitlist: ops.waitlist.map((row) =>
        row.id === entryId
          ? { ...row, status: "booked", bookingId: booking.id }
          : row,
      ),
    }),
  );
}

/** Mensaje de hueco libre para alguien de la lista. */
export function waitlistMessage(
  data: ProData,
  match: { entry: ProWaitlistEntry; gap: Gap; start: number },
): string {
  const service = data.services.find((row) => row.id === match.entry.serviceId);
  const iso = isoFor(match.gap.date, match.start);
  return fillTemplate(templateText(data, "waitlist"), {
    nombre: firstName(match.entry.name),
    negocio: data.space.name,
    dia: dayLabel(iso),
    hora: minutesToLabel(match.start),
    servicio: service?.name.toLowerCase(),
  });
}

/* ------------------------------------------------------------------ */
/* Bloqueos y ausencias                                                */
/* ------------------------------------------------------------------ */

export const BLOCK_REASONS = [
  "Descanso",
  "Formación",
  "Médico",
  "Recado",
  "Limpieza de máquina",
];

export const ABSENCE_REASONS = ["Vacaciones", "Baja", "Asuntos propios"];

export function addBlock(data: ProData, block: ProAgendaBlock): ProData {
  return patchOps(data, (ops) => ({ ...ops, blocks: [...ops.blocks, block] }));
}

export function removeBlock(data: ProData, blockId: string): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    blocks: ops.blocks.filter((block) => block.id !== blockId),
  }));
}

export function addAbsence(data: ProData, absence: ProAgendaAbsence): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    absences: [...ops.absences, absence],
  }));
}

export function removeAbsence(data: ProData, absenceId: string): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    absences: ops.absences.filter((absence) => absence.id !== absenceId),
  }));
}

/** Citas que ya existen dentro de un bloqueo o una ausencia: hay que moverlas. */
export function clashesWithBlock(
  data: ProData,
  staffId: string,
  from: string,
  to: string,
  fromMinute = 0,
  toMinute = 1440,
): ProBooking[] {
  return data.bookings.filter((booking) => {
    if (booking.staffId !== staffId) return false;
    if (["cancelled", "no_show", "done"].includes(booking.status)) return false;
    const date = localDate(booking.start);
    if (date < from || date > to) return false;
    const start = localMinutes(booking.start);
    const end =
      start + (Date.parse(booking.end) - Date.parse(booking.start)) / 60000;
    return start < toMinute && end > fromMinute;
  });
}

/* ------------------------------------------------------------------ */
/* Citas periódicas                                                    */
/* ------------------------------------------------------------------ */

export type SeriesStep = {
  date: string;
  minute: number;
  free: boolean;
  /** Hora pedida cuando la cita se ha movido a la hora libre más cercana. */
  movedFrom?: number;
};

/**
 * Fechas de una serie (cada N semanas, mismo día y hora). La primera es la cita
 * que se está creando; las demás dicen si esa hora está libre o choca.
 *
 * Con `shiftMin`, una fecha que choca se mueve a la hora libre más cercana de
 * ese mismo día sin pasar de ese margen: un plan de tratamiento prefiere la
 * sesión media hora antes que perderla.
 */
export function seriesPlan(
  data: ProData,
  input: {
    serviceId: string;
    staffId: string;
    date: string;
    minute: number;
    everyWeeks: number;
    count: number;
    shiftMin?: number;
  },
): SeriesStep[] {
  const service = data.services.find((row) => row.id === input.serviceId);
  if (!service) return [];
  const duration = durationFor(service, input.staffId);
  const shift = input.shiftMin ?? 0;
  return Array.from({ length: input.count }, (_, index) => {
    const date = addDays(input.date, index * input.everyWeeks * 7);
    const times = startTimes(
      data,
      date,
      input.staffId,
      duration,
      0,
      undefined,
      service.id,
    );
    if (times.includes(input.minute) || index === 0 || !shift)
      return { date, minute: input.minute, free: times.includes(input.minute) };
    // La más cercana; a igual distancia, antes que después.
    const alt = times
      .filter((m) => Math.abs(m - input.minute) <= shift)
      .sort(
        (a, b) =>
          Math.abs(a - input.minute) - Math.abs(b - input.minute) || a - b,
      )[0];
    return alt === undefined
      ? { date, minute: input.minute, free: false }
      : { date, minute: alt, free: true, movedFrom: input.minute };
  });
}

/** Crea las citas libres de la serie a partir de una cita modelo. */
export function createSeries(
  data: ProData,
  model: Omit<ProBooking, "id" | "start" | "end">,
  steps: SeriesStep[],
  ids: string[],
  seriesId: string,
  durationMin: number,
): ProData {
  const created: ProBooking[] = steps
    .filter((step) => step.free)
    .map((step, index) => ({
      ...model,
      id: ids[index],
      start: isoFor(step.date, step.minute),
      end: isoFor(step.date, step.minute + durationMin),
      agenda: { ...model.agenda, seriesId },
    }));
  return { ...data, bookings: [...data.bookings, ...created] };
}

export function seriesOf(data: ProData, seriesId: string): ProBooking[] {
  return data.bookings
    .filter((booking) => booking.agenda?.seriesId === seriesId)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/* ------------------------------------------------------------------ */
/* Cola de sin cita (barberías)                                        */
/* ------------------------------------------------------------------ */

export type WalkinTurn = {
  entry: ProWalkin;
  staffId: string | null;
  /** Minuto del día en el que se le puede atender. */
  startMinute: number | null;
  waitMin: number | null;
};

/**
 * Espera calculada con la agenda real: cada persona de la cola ocupa el primer
 * hueco libre de quien sabe hacer su servicio, en orden de llegada.
 */
export function walkinQueue(data: ProData, now: Date): WalkinTurn[] {
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const taken = new Map<string, { from: number; to: number }[]>();
  const waiting = (data.agendaOps?.walkins ?? [])
    .filter((entry) => entry.status === "waiting")
    .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  return waiting.map((entry) => {
    const service = data.services.find((row) => row.id === entry.serviceId);
    if (!service)
      return { entry, staffId: null, startMinute: null, waitMin: null };
    const candidates = entry.staffId ? [entry.staffId] : service.staffIds;
    let best: { staffId: string; minute: number } | null = null;
    for (const staffId of candidates) {
      const reserved = taken.get(staffId) ?? [];
      const duration = durationFor(service, staffId);
      const minute = startTimes(
        data,
        today,
        staffId,
        duration,
        nowMin,
        undefined,
        service.id,
      ).find(
        (m) =>
          !reserved.some((slot) => m < slot.to && m + duration > slot.from),
      );
      if (minute !== undefined && (!best || minute < best.minute))
        best = { staffId, minute };
    }
    if (!best)
      return { entry, staffId: null, startMinute: null, waitMin: null };
    taken.set(best.staffId, [
      ...(taken.get(best.staffId) ?? []),
      {
        from: best.minute,
        to: best.minute + durationFor(service, best.staffId),
      },
    ]);
    return {
      entry,
      staffId: best.staffId,
      startMinute: best.minute,
      waitMin: Math.max(0, best.minute - nowMin),
    };
  });
}

export function addWalkin(data: ProData, entry: ProWalkin): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    walkins: [...ops.walkins, entry],
  }));
}

export function setWalkinStatus(
  data: ProData,
  entryId: string,
  status: ProWalkin["status"],
): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    walkins: ops.walkins.map((entry) =>
      entry.id === entryId ? { ...entry, status } : entry,
    ),
  }));
}

/** Le toca: su turno se convierte en una cita en marcha con esa persona. */
export function serveWalkin(
  data: ProData,
  entryId: string,
  input: { bookingId: string; staffId: string; start: string },
): ProData {
  const entry = data.agendaOps?.walkins.find((row) => row.id === entryId);
  const service = data.services.find((row) => row.id === entry?.serviceId);
  if (!entry || !service) return data;
  const booking: ProBooking = {
    id: input.bookingId,
    kind: "appointment",
    clientName: entry.name,
    staffId: input.staffId,
    serviceId: service.id,
    start: input.start,
    end: plusMinutes(input.start, durationFor(service, input.staffId)),
    partySize: 1,
    status: "in_service",
    priceCents: service.priceCents,
    paidCents: 0,
    source: "walkin",
    agenda: { recoveredFrom: "walkin" },
  };
  return patchOps(
    { ...data, bookings: [...data.bookings, booking] },
    (ops) => ({
      ...ops,
      walkins: ops.walkins.map((row) =>
        row.id === entryId
          ? {
              ...row,
              status: "served",
              bookingId: booking.id,
              staffId: input.staffId,
            }
          : row,
      ),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

export function saveSettings(
  data: ProData,
  settings: Partial<ProAgendaSettings>,
): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    settings: { ...ops.settings, ...settings },
  }));
}

export function saveTemplate(
  data: ProData,
  kind: ProTemplateKind,
  text: string,
): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    templates: {
      ...ops.templates,
      [kind]: text.trim() || DEFAULT_TEMPLATES[kind],
    },
  }));
}

/** Huecos recuperados este mes con la lista de espera y la cola de sin cita. */
export function recoveredThisMonth(data: ProData, now: Date): number {
  const month = localDate(now).slice(0, 7);
  return data.bookings.filter(
    (booking) =>
      booking.agenda?.recoveredFrom &&
      booking.status !== "cancelled" &&
      localDate(booking.start).slice(0, 7) === month,
  ).length;
}

export function noShowsThisMonth(data: ProData, now: Date): number {
  const month = localDate(now).slice(0, 7);
  return data.bookings.filter(
    (booking) =>
      booking.status === "no_show" &&
      localDate(booking.start).slice(0, 7) === month,
  ).length;
}

/* ------------------------------------------------------------------ */
/* Después de cobrar: reseña y cuidados                                */
/* ------------------------------------------------------------------ */

export function markReviewAsked(data: ProData, bookingId: string, at: string) {
  return patchBooking(data, bookingId, (row) =>
    withAgenda(row, { reviewAskedAt: at }),
  );
}

export function markAftercareSent(
  data: ProData,
  bookingId: string,
  at: string,
) {
  return patchBooking(data, bookingId, (row) =>
    withAgenda(row, { aftercareSentAt: at }),
  );
}

/**
 * Reseñas pedidas este mes y reseñas nuevas recibidas en el mismo tiempo.
 * Las recibidas son las de la ficha pública, sin cruzarlas con quién se pidió.
 */
export function reviewStats(data: ProData, now: Date) {
  const month = localDate(now).slice(0, 7);
  const asked = data.bookings.filter(
    (booking) =>
      booking.agenda?.reviewAskedAt &&
      localDate(booking.agenda.reviewAskedAt).slice(0, 7) === month,
  ).length;
  const received = data.reviews.filter(
    (review) => localDate(review.at).slice(0, 7) === month,
  ).length;
  return { asked, received };
}

/* ------------------------------------------------------------------ */
/* Hueco que deja una cita cancelada o no presentada                   */
/* ------------------------------------------------------------------ */

/**
 * Hueco libre en el que cae el inicio de una cita que ya no ocupa la agenda
 * (se calcula con los datos después de cancelarla). Solo si es de hoy en
 * adelante: un hueco pasado ya no se puede ofrecer.
 */
export function freedGap(
  data: ProData,
  booking: ProBooking,
  now: Date,
): Gap | null {
  if (!booking.staffId) return null;
  const date = localDate(booking.start);
  const today = localDate(now);
  if (date < today) return null;
  const fromMinute = date === today ? localMinutes(now) : 0;
  const start = localMinutes(booking.start);
  return (
    freeGaps(data, date, fromMinute, 15).find(
      (gap) =>
        gap.staffId === booking.staffId &&
        gap.from <= Math.max(start, fromMinute) &&
        gap.to > Math.max(start, fromMinute),
    ) ?? null
  );
}

/* ------------------------------------------------------------------ */
/* Precio estudiante en horas valle                                    */
/* ------------------------------------------------------------------ */

/**
 * ¿Vale el precio estudiante a esa hora? Si el servicio no tiene franjas
 * valle, vale siempre (como hasta ahora).
 */
export function studentPriceApplies(
  service: ProService | undefined,
  date: string,
  minute: number,
): boolean {
  if (!service?.studentPriceCents) return false;
  const valley = service.agenda?.valley;
  if (!valley) return true;
  return (
    valley.days.includes(weekdayIndex(date)) &&
    minute >= valley.from &&
    minute < valley.to
  );
}

export const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

/** "L a J de 10:00 a 13:00" para enseñar una franja valle. */
export function valleyLabel(
  service: Pick<ProService, "agenda"> | undefined,
): string | null {
  const valley = service?.agenda?.valley;
  if (!valley || !valley.days.length) return null;
  const days = [...valley.days].sort((a, b) => a - b);
  const consecutive = days.every(
    (day, i) => i === 0 || day === days[i - 1] + 1,
  );
  const dayText =
    consecutive && days.length > 2
      ? `${WEEKDAY_SHORT[days[0]]} a ${WEEKDAY_SHORT[days.at(-1)!]}`
      : days.map((day) => WEEKDAY_SHORT[day]).join(", ");
  return `${dayText} de ${minutesToLabel(valley.from)} a ${minutesToLabel(valley.to)}`;
}

/* ------------------------------------------------------------------ */
/* Cabinas y consentimientos                                           */
/* ------------------------------------------------------------------ */

export function saveCabin(data: ProData, cabin: ProCabin): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    cabins: ops.cabins.some((row) => row.id === cabin.id)
      ? ops.cabins.map((row) => (row.id === cabin.id ? cabin : row))
      : [...ops.cabins, cabin],
  }));
}

/** Quita la cabina y deja sin cabina los tratamientos que la usaban. */
export function removeCabin(data: ProData, cabinId: string): ProData {
  const next = patchOps(data, (ops) => ({
    ...ops,
    cabins: ops.cabins.filter((row) => row.id !== cabinId),
  }));
  return {
    ...next,
    services: next.services.map((service) =>
      service.agenda?.cabinId === cabinId
        ? { ...service, agenda: { ...service.agenda, cabinId: undefined } }
        : service,
    ),
  };
}

export function saveConsentTemplate(
  data: ProData,
  template: ProConsentTemplate,
): ProData {
  return patchOps(data, (ops) => ({
    ...ops,
    consentTemplates: ops.consentTemplates.some((row) => row.id === template.id)
      ? ops.consentTemplates.map((row) =>
          row.id === template.id ? template : row,
        )
      : [...ops.consentTemplates, template],
  }));
}

/* ------------------------------------------------------------------ */
/* Reglas de cada profesional                                          */
/* ------------------------------------------------------------------ */

export type StaffRules = {
  commissionPct: number;
  productCommissionPct: number;
  /** 0 = trabaja a comisión; si no, alquila el sillón por esta cuota. */
  chairRentCents: number;
};

export function staffRules(staff: ProStaff): StaffRules {
  return {
    commissionPct: staff.commissionPct,
    productCommissionPct: staff.agenda?.productCommissionPct ?? 0,
    chairRentCents: staff.agenda?.chairRentCents ?? 0,
  };
}

/** Quien alquila sillón no lleva comisión: se guarda a 0 para no sumarla. */
export function saveStaffRules(
  data: ProData,
  staffId: string,
  rules: StaffRules,
): ProData {
  const rent = Math.max(0, Math.round(rules.chairRentCents));
  const clamp = (pct: number) => Math.min(100, Math.max(0, Math.round(pct)));
  return {
    ...data,
    staff: data.staff.map((person) =>
      person.id === staffId
        ? {
            ...person,
            commissionPct: rent ? 0 : clamp(rules.commissionPct),
            agenda: {
              ...person.agenda,
              productCommissionPct: rent
                ? undefined
                : clamp(rules.productCommissionPct) || undefined,
              chairRentCents: rent || undefined,
            },
          }
        : person,
    ),
  };
}
