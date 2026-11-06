import type {
  ProBooking,
  ProDailyMenu,
  ProData,
  ProSectionId,
  ProVerticalId,
} from "./types";
import type { ProDailyDishCost, ProTablesOps, ProVenueEvent } from "./tables-types";
import {
  addDays,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
} from "./format";
import {
  CLEANING_MIN,
  TURNS,
  TURN_ORDER,
  isWaitlist,
  stayMinutes,
  tableFree,
  turnOf,
  type Turn,
} from "./tables";
import {
  eventStats,
  netPrice,
  plannedMinutes,
  priceForTarget,
  weekDates,
  workedMinutes,
} from "./tables-ops";
import { weekReport } from "./tables-day";

/**
 * Lo que el hostelero ve de un vistazo para decidir: cuántos pedidos caben
 * en cada franja de la barra, qué toca preparar según el calendario de la
 * universidad, cuánto se queda de verdad una mesa, cuánto cuesta el menú del
 * día y cómo fue la semana frente a las horas trabajadas.
 *
 * Funciones puras, igual que `tables-ops.ts` y `tables-day.ts`.
 */

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/* ------------------------------------------------------------------ */
/* Franjas de recogida                                                 */
/* ------------------------------------------------------------------ */

/** Tamaño de cada franja de recogida en la barra. */
export const PICKUP_SLOT_MINUTES = 10;

export function pickupSlotOf(minute: number): number {
  return Math.floor(minute / PICKUP_SLOT_MINUTES) * PICKUP_SLOT_MINUTES;
}

/**
 * Pedidos para recoger de un día por franja de 10 minutos. Cuentan todos los
 * que la barra tiene que sacar (de Franky, por teléfono o en persona) menos
 * los cancelados: la cafetera es la misma para todos.
 */
export function pickupLoad(ops: ProTablesOps, date: string): Map<number, number> {
  const load = new Map<number, number>();
  for (const order of ops.orders) {
    if (order.kind !== "pickup" || order.status === "cancelled") continue;
    if (localDate(order.pickupAt) !== date) continue;
    const slot = pickupSlotOf(localMinutes(order.pickupAt));
    load.set(slot, (load.get(slot) ?? 0) + 1);
  }
  return load;
}

export type PickupSlot = {
  minute: number;
  count: number;
  /** null si el local no ha puesto límite. */
  capacity: number | null;
  full: boolean;
};

/** Franjas de un tramo del día con lo que llevan y si están llenas. */
export function pickupSlots(
  ops: ProTablesOps,
  date: string,
  from: number,
  to: number,
): PickupSlot[] {
  const load = pickupLoad(ops, date);
  const capacity = ops.pickupCapacity && ops.pickupCapacity > 0 ? ops.pickupCapacity : null;
  const out: PickupSlot[] = [];
  for (let m = pickupSlotOf(from); m < to; m += PICKUP_SLOT_MINUTES) {
    const count = load.get(m) ?? 0;
    out.push({ minute: m, count, capacity, full: capacity !== null && count >= capacity });
  }
  return out;
}

/**
 * La primera franja con sitio desde `minute` (incluida), dentro de las dos
 * horas siguientes. Sin límite de barra, la misma franja. null si todo
 * está lleno.
 */
export function nextPickupSlot(
  ops: ProTablesOps,
  date: string,
  minute: number,
  horizon = 120,
): number | null {
  const start = pickupSlotOf(minute);
  const capacity = ops.pickupCapacity && ops.pickupCapacity > 0 ? ops.pickupCapacity : null;
  if (capacity === null) return start;
  const load = pickupLoad(ops, date);
  for (let m = start; m <= start + horizon && m < 24 * 60; m += PICKUP_SLOT_MINUTES) {
    if ((load.get(m) ?? 0) < capacity) return m;
  }
  return null;
}

/** La franja más cargada del día (la punta), para enseñarla en la cabecera. */
export function pickupPeak(ops: ProTablesOps, date: string) {
  let best: { minute: number; count: number } | null = null;
  for (const [minute, count] of pickupLoad(ops, date)) {
    if (!best || count > best.count || (count === best.count && minute < best.minute))
      best = { minute, count };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Temporada universitaria                                             */
/* ------------------------------------------------------------------ */

export type SeasonMomentId =
  | "exams_winter"
  | "exams_summer"
  | "erasmus"
  | "class_dinners"
  | "graduations";

export type SeasonMoment = {
  id: SeasonMomentId;
  title: string;
  body: string;
  /** Fechas habituales en las universidades de la zona (inicio y fin). */
  from: string;
  to: string;
  /** "soon" mientras llega, "now" durante la temporada. */
  phase: "soon" | "now";
  /** Días que faltan para el inicio (0 si ya ha empezado). */
  inDays: number;
  action: { label: string; section: ProSectionId };
};

type SeasonDef = {
  id: SeasonMomentId;
  /** Mes y día de inicio y fin (MM-DD). Si el fin es menor, cruza de año. */
  from: string;
  to: string;
  /** Con cuántos días de antelación conviene prepararlo. */
  lead: number;
  verticals: ProVerticalId[];
};

/**
 * Calendario orientativo de las universidades españolas: exámenes de enero
 * y de junio, llegada de Erasmus del segundo cuatrimestre, cenas de Navidad
 * de clase y graduaciones. Las fechas exactas cambian por universidad, por
 * eso los textos hablan de "suele".
 */
const SEASONS: SeasonDef[] = [
  { id: "exams_winter", from: "01-08", to: "02-06", lead: 7, verticals: ["cafe", "bar", "restaurant"] },
  { id: "erasmus", from: "02-01", to: "02-21", lead: 10, verticals: ["cafe", "bar", "restaurant"] },
  { id: "graduations", from: "05-10", to: "06-30", lead: 42, verticals: ["bar", "restaurant"] },
  { id: "exams_summer", from: "05-20", to: "06-30", lead: 7, verticals: ["cafe", "bar", "restaurant"] },
  { id: "class_dinners", from: "11-15", to: "12-22", lead: 42, verticals: ["bar", "restaurant"] },
];

function seasonCopy(
  id: SeasonMomentId,
  vertical: ProVerticalId,
  phase: "soon" | "now",
): { title: string; body: string; action: { label: string; section: ProSectionId } } {
  const soon = phase === "soon";
  switch (id) {
    case "exams_winter":
    case "exams_summer": {
      const when = id === "exams_winter" ? "enero" : "junio";
      if (vertical === "cafe")
        return {
          title: soon ? `Los exámenes de ${when} están al caer` : "Modo exámenes",
          body: soon
            ? "Los estudiantes buscan dónde estudiar. Amplía la franja del sitio para estudiar y ten listo un bono de estudio."
            : "Son semanas de muchas horas de estudio. Mantén al día el contador de sitios libres y ofrece un bono de estudio.",
          action: { label: "Ajustar sitio para estudiar", section: "hoy" },
        };
      if (vertical === "bar")
        return {
          title: soon ? `Llegan los exámenes de ${when}` : "Semanas de exámenes",
          body: "Bajan las noches y suben los cafés y la caña de desconexión de media tarde. Una oferta de tarde solo para estudiantes llena esas horas.",
          action: { label: "Crear oferta de tarde", section: "estudiantes" },
        };
      return {
        title: soon ? `Llegan los exámenes de ${when}` : "Semanas de exámenes",
        body: "Se come rápido o para llevar. Un menú exprés o un táper de menú del día con hora de recogida encaja con quien está estudiando.",
        action: { label: "Crear oferta para estudiantes", section: "estudiantes" },
      };
    }
    case "erasmus":
      return {
        title: soon ? "Llegan los Erasmus del segundo cuatrimestre" : "Semanas de bienvenida Erasmus",
        body: "Estudiantes nuevos que aún no tienen su sitio. Una oferta de bienvenida en Franky les da el primer motivo para entrar.",
        action: { label: "Preparar oferta de bienvenida", section: "estudiantes" },
      };
    case "class_dinners":
      return {
        title: soon ? "Se acercan las cenas de Navidad de clase" : "Temporada de cenas de Navidad",
        body: soon
          ? "Los delegados empiezan a buscar sitio semanas antes. Ten listo tu menú de Navidad con precio por persona y señal."
          : "Responder el mismo día a cada petición de grupo ayuda a que no se vayan a otro sitio.",
        action: { label: soon ? "Preparar menú de grupo" : "Ver grupos", section: "grupos" },
      };
    case "graduations":
      return {
        title: soon ? "Las graduaciones se reservan con tiempo" : "Temporada de graduaciones",
        body: soon
          ? "Las comidas y cenas de graduación se cierran con semanas de antelación. Publica un menú de graduación con señal."
          : "Grupos grandes con fecha fija: pide el número cerrado 72 horas antes y la elección de plato por enlace.",
        action: { label: soon ? "Preparar menú de graduación" : "Ver grupos", section: "grupos" },
      };
  }
}

/** Momentos del curso que tocan ahora o en las próximas semanas. */
export function seasonMoments(vertical: ProVerticalId, today: string): SeasonMoment[] {
  const year = Number(today.slice(0, 4));
  const out: SeasonMoment[] = [];
  for (const def of SEASONS) {
    if (!def.verticals.includes(vertical)) continue;
    // Se prueba la temporada de este año y la del siguiente (para avisar en
    // diciembre de los exámenes de enero).
    for (const y of [year, year + 1]) {
      const from = `${y}-${def.from}`;
      const to = def.to < def.from ? `${y + 1}-${def.to}` : `${y}-${def.to}`;
      const warnFrom = addDays(from, -def.lead);
      if (today < warnFrom || today > to) continue;
      const phase = today >= from ? "now" : "soon";
      const inDays = phase === "now" ? 0 : daysBetween(today, from);
      out.push({ id: def.id, from, to, phase, inDays, ...seasonCopy(def.id, vertical, phase) });
      break;
    }
  }
  // Primero lo que ya está en marcha, después lo más cercano.
  return out.sort((a, b) => (a.phase === b.phase ? a.inDays - b.inDays : a.phase === "now" ? -1 : 1));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/**
 * Horas del sitio para estudiar en semanas de exámenes: dos horas más por la
 * tarde, sin pasar de las 22:00 ni del cierre del local.
 */
export function examStudyHours(
  settings: { fromMinute: number; toMinute: number },
  closeMinute: number | null,
): { fromMinute: number; toMinute: number } {
  const limit = Math.min(22 * 60, closeMinute ?? 22 * 60);
  return {
    fromMinute: settings.fromMinute,
    toMinute: Math.max(settings.toMinute, Math.min(limit, settings.toMinute + 120)),
  };
}

/* ------------------------------------------------------------------ */
/* Tiempo de mesa y rotación                                           */
/* ------------------------------------------------------------------ */

/**
 * Minutos reales que estuvo sentada una mesa. En real, de la llegada a la
 * salida apuntadas en sala; en la demo, de la hora de la reserva a la hora
 * real de salida (su `end`). Estancias sin sentido (menos de 10 minutos o
 * más de 5 horas) no cuentan.
 */
export function tableStay(booking: ProBooking): number | null {
  if (booking.kind !== "table" || isWaitlist(booking)) return null;
  const op = booking.tableOperation;
  let minutes: number | null = null;
  if (op?.seatedAt && op.leftAt) {
    minutes = (Date.parse(op.leftAt) - Date.parse(op.seatedAt)) / 60_000;
  } else if (!op && booking.status === "done") {
    minutes = (Date.parse(booking.end) - Date.parse(booking.start)) / 60_000;
  }
  if (minutes === null || minutes < 10 || minutes > 300) return null;
  return Math.round(minutes);
}

export type PartyBand = "1-2" | "3-4" | "5+";

export function partyBand(size: number): PartyBand {
  return size <= 2 ? "1-2" : size <= 4 ? "3-4" : "5+";
}

export type TurnoverTurn = {
  turn: Turn;
  label: string;
  samples: number;
  /** Media real; null sin suficientes mesas. */
  avgMinutes: number | null;
  /** Lo que Franky reserva hoy por mesa en ese turno. */
  plannedMinutes: number;
  /** Hora a la que cabría una segunda mesa si la primera entra al abrir. */
  secondSeatAt: number | null;
};

/**
 * Cuánto se queda de verdad una mesa por turno y por tamaño, con las mesas
 * que se fueron en los últimos `days` días. Sirve para ajustar la duración
 * de las reservas y ver si cabe un segundo turno.
 */
export function tableTurnover(data: ProData, now: Date, days = 28, minSamples = 5) {
  const today = localDate(now);
  const since = addDays(today, -days);
  const rows: { turn: Turn; band: PartyBand; minutes: number }[] = [];
  for (const b of data.bookings) {
    const date = localDate(b.start);
    if (date < since || date > today) continue;
    const minutes = tableStay(b);
    if (minutes === null) continue;
    rows.push({ turn: turnOf(localMinutes(b.start)), band: partyBand(b.partySize), minutes });
  }
  const avg = (list: number[]) =>
    list.length >= minSamples ? Math.round(list.reduce((a, m) => a + m, 0) / list.length) : null;

  const byTurn: TurnoverTurn[] = TURN_ORDER.map((turn) => {
    const list = rows.filter((r) => r.turn === turn).map((r) => r.minutes);
    const average = avg(list);
    const T = TURNS[turn];
    // Una mesa que se sienta al abrir, se va a la media y se limpia: ¿hay
    // otra reserva antes de la última hora de entrada?
    const second =
      average === null ? null : Math.ceil((T.from + average + CLEANING_MIN) / 15) * 15;
    return {
      turn,
      label: T.label,
      samples: list.length,
      avgMinutes: average,
      plannedMinutes: stayMinutes(data.space.vertical, turn),
      secondSeatAt: second !== null && second <= T.lastSeat ? second : null,
    };
  });

  const byParty = (["1-2", "3-4", "5+"] as PartyBand[]).map((band) => {
    const list = rows.filter((r) => r.band === band).map((r) => r.minutes);
    return { band, samples: list.length, avgMinutes: avg(list) };
  });

  return { samples: rows.length, byTurn, byParty };
}

/** Frase corta para la cabecera: "Una cena dura 1 h 38 min de media". */
export function turnoverHeadline(turn: TurnoverTurn): string | null {
  if (turn.avgMinutes === null) return null;
  const diff = turn.avgMinutes - turn.plannedMinutes;
  const h = Math.floor(turn.avgMinutes / 60);
  const m = turn.avgMinutes % 60;
  const length = h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  const vs =
    Math.abs(diff) < 5
      ? "lo mismo que reservas"
      : diff < 0
        ? `${Math.abs(diff)} min menos de lo que reservas`
        : `${diff} min más de lo que reservas`;
  return `${turn.label}: ${length} de media, ${vs}.`;
}

/* ------------------------------------------------------------------ */
/* Escandallo del menú del día                                         */
/* ------------------------------------------------------------------ */

export type DailyMenuCost = {
  /** Coste por comensal (media de cada plato elegible + extras). */
  perDinerCents: number | null;
  courses: { label: string; dishes: { dish: string; costCents: number | null }[]; avgCents: number | null }[];
  extrasCents: number;
  missing: string[];
  /** Coste sobre el precio sin IVA (%). null sin coste completo. */
  foodCostPct: number | null;
  studentFoodCostPct: number | null;
  marginCents: number | null;
  studentMarginCents: number | null;
  /** Precio con IVA que devuelve el menú al objetivo del local. */
  targetPriceCents: number | null;
};

export function dishCostOf(costs: ProDailyDishCost[] | undefined, dish: string): number | null {
  const found = costs?.find((c) => plain(c.dish) === plain(dish));
  return found ? found.costCents : null;
}

/**
 * Coste de servir el menú del día a una persona: la media de lo que cuesta
 * cada primero, cada segundo y cada postre (cada comensal elige uno de cada)
 * más lo que incluye aparte. Solo con platos que tienen coste apuntado.
 */
export function dailyMenuCost(ops: ProTablesOps, menu: ProDailyMenu): DailyMenuCost {
  const courses = [
    { label: "Primeros", list: menu.starters },
    { label: "Segundos", list: menu.mains },
    { label: "Postres", list: menu.desserts },
  ]
    .filter((c) => c.list.length)
    .map((c) => {
      const dishes = c.list.map((dish) => ({ dish, costCents: dishCostOf(ops.dailyMenuCosts, dish) }));
      const known = dishes.filter((d) => d.costCents !== null).map((d) => d.costCents as number);
      return {
        label: c.label,
        dishes,
        avgCents: known.length ? Math.round(known.reduce((a, v) => a + v, 0) / known.length) : null,
      };
    });
  const missing = courses.flatMap((c) => c.dishes.filter((d) => d.costCents === null).map((d) => d.dish));
  const extrasCents = ops.dailyMenuExtrasCents ?? 0;
  const complete = courses.length > 0 && courses.every((c) => c.avgCents !== null);
  const perDiner = complete ? courses.reduce((a, c) => a + (c.avgCents ?? 0), 0) + extrasCents : null;
  const pctOf = (price: number | undefined) => {
    if (perDiner === null || !price) return null;
    const net = netPrice(price);
    return net > 0 ? Math.round((perDiner / net) * 1000) / 10 : null;
  };
  return {
    perDinerCents: perDiner,
    courses,
    extrasCents,
    missing,
    foodCostPct: pctOf(menu.priceCents),
    studentFoodCostPct: pctOf(menu.studentPriceCents),
    marginCents: perDiner === null ? null : netPrice(menu.priceCents) - perDiner,
    studentMarginCents:
      perDiner === null || !menu.studentPriceCents ? null : netPrice(menu.studentPriceCents) - perDiner,
    targetPriceCents: perDiner === null ? null : priceForTarget(perDiner, ops.targetFoodCostPct),
  };
}

/** Guarda (o borra, con null) el coste de un plato del menú del día. */
export function setDishCost(
  ops: ProTablesOps,
  dish: string,
  costCents: number | null,
): ProTablesOps {
  const rest = (ops.dailyMenuCosts ?? []).filter((c) => plain(c.dish) !== plain(dish));
  return {
    ...ops,
    dailyMenuCosts: costCents === null ? rest : [...rest, { dish: dish.trim(), costCents }],
  };
}

/* ------------------------------------------------------------------ */
/* Informe de la semana: horas, franjas y WhatsApp                     */
/* ------------------------------------------------------------------ */

/** Horas previstas en el cuadrante y horas fichadas de la semana. */
export function weekLabor(data: ProData, ops: ProTablesOps, monday: string, now: Date) {
  const today = localDate(now);
  const dates = weekDates(monday).filter((d) => d <= today);
  let planned = 0;
  let worked = 0;
  for (const person of data.staff) {
    planned += plannedMinutes(ops, person.id, monday);
    worked += workedMinutes(data.shifts, person.id, dates, now);
  }
  return { plannedMinutes: planned, workedMinutes: worked };
}

/**
 * Cubiertos por hora de llegada en la semana (de 12:00 a 24:00), para ver
 * qué franjas llenan y cuáles no. Solo reservas que se sentaron.
 */
export function coversByHour(data: ProData, monday: string, now: Date) {
  const today = localDate(now);
  const end = addDays(monday, 6);
  const hours = Array.from({ length: 12 }, (_, i) => 12 + i);
  const perHour = new Map<number, number>();
  for (const b of data.bookings) {
    if (b.kind !== "table" || isWaitlist(b)) continue;
    if (b.status !== "done" && b.status !== "arrived") continue;
    const date = localDate(b.start);
    if (date < monday || date > end || date > today) continue;
    const hour = Math.floor(localMinutes(b.start) / 60);
    perHour.set(hour, (perHour.get(hour) ?? 0) + b.partySize);
  }
  return hours.map((hour) => ({ hour, covers: perHour.get(hour) ?? 0 }));
}

/**
 * El texto de la semana para el WhatsApp del dueño o del socio. Solo cifras
 * apuntadas: caja de los días cerrados, cubiertos, plantones, lo que trajo
 * Franky y las horas del equipo.
 */
export function weekReportMessage(input: {
  data: ProData;
  ops: ProTablesOps;
  monday: string;
  now: Date;
}): string {
  const { data, ops, monday, now } = input;
  const week = weekReport(data, ops, monday, now);
  const labor = weekLabor(data, ops, monday, now);
  const tables = data.space.vertical !== "cafe";
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Madrid",
    });
  const lines = [`Semana de ${data.space.name}, del ${fmt(monday)} al ${fmt(addDays(monday, 6))}`];
  lines.push(
    week.closedDays
      ? `Caja: ${money(week.totalCents, { round: true })} en ${week.closedDays} ${week.closedDays === 1 ? "día cerrado" : "días cerrados"}`
      : "Caja: sin cierres apuntados",
  );
  const best = week.days
    .filter((d) => d.totalCents !== null)
    .sort((a, b) => (b.totalCents ?? 0) - (a.totalCents ?? 0))[0];
  if (best && week.closedDays > 1) {
    const day = new Date(`${best.date}T12:00:00Z`).toLocaleDateString("es-ES", {
      weekday: "long",
      timeZone: "Europe/Madrid",
    });
    lines.push(`Mejor día: ${day}, ${money(best.totalCents ?? 0, { round: true })}`);
  }
  if (tables) {
    lines.push(`Cubiertos: ${week.covers}${week.perCoverCents !== null ? `, ${money(week.perCoverCents)} por cubierto` : ""}`);
    lines.push(`Reservas: ${week.bookings}, no vinieron ${week.noShows} (${week.noShowPct.toLocaleString("es-ES")} %)`);
    lines.push(`Por Franky: ${week.franky} ${week.franky === 1 ? "reserva" : "reservas"}${week.groups ? `, ${week.groups} ${week.groups === 1 ? "grupo" : "grupos"}` : ""}`);
  }
  lines.push(`Franky Card: ${week.card} ${week.card === 1 ? "validación" : "validaciones"}`);
  if (labor.workedMinutes > 0) {
    const worked = Math.round(labor.workedMinutes / 6) / 10;
    const planned = Math.round(labor.plannedMinutes / 6) / 10;
    lines.push(
      `Equipo: ${worked.toLocaleString("es-ES")} h fichadas${labor.plannedMinutes ? ` de ${planned.toLocaleString("es-ES")} h previstas` : ""}`,
    );
    if (tables && week.covers > 0) {
      const perHour = Math.round((week.covers / (labor.workedMinutes / 60)) * 10) / 10;
      lines.push(`Cubiertos por hora trabajada: ${perHour.toLocaleString("es-ES")}`);
    }
  }
  return lines.join("\n");
}


/* ------------------------------------------------------------------ */
/* Partidos, eventos y previas                                         */
/* ------------------------------------------------------------------ */

export const VENUE_EVENT_KIND_LABEL: Record<ProVenueEvent["kind"], string> = {
  partido: "Partido",
  evento: "Evento",
  previa: "Previa",
};

/**
 * Texto para mandar al grupo de clase, a la asociación o a los delegados:
 * qué es, cuándo, qué incluye y cuántas plazas quedan. Si está publicado,
 * con el enlace a la ficha para reservar.
 */
export function eventInviteMessage(
  event: ProVenueEvent,
  spaceName: string,
  link?: string,
): string {
  const stats = eventStats(event);
  const day = new Date(event.start).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid",
  });
  const hour = minutesToLabel(localMinutes(event.start));
  const head =
    event.kind === "previa"
      ? `Previa${event.party ? ` de ${event.party}` : ""} en ${spaceName}: ${day} a las ${hour}.`
      : `${event.title} en ${spaceName}: ${day} a las ${hour}.`;
  const lines = [head];
  if (event.kind === "previa" && event.title) lines.push(event.title);
  if (event.menu) lines.push(event.menu);
  if (event.minimumSpendCents)
    lines.push(`Consumo mínimo: ${money(event.minimumSpendCents)} por persona.`);
  lines.push(
    stats.free
      ? `Quedan ${stats.free} ${stats.free === 1 ? "plaza" : "plazas"}.`
      : "Estamos completos.",
  );
  if (event.published && link) lines.push(`Reserva aquí: ${link}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Unir mesas desde el plano                                           */
/* ------------------------------------------------------------------ */

/**
 * Mesas marcadas en el plano para unirlas: cuántos sitios suman, si son de
 * la misma zona y si están libres el tiempo que dura una mesa. Se pueden unir
 * con dos o más mesas libres de la misma zona.
 */
export function joinSelection(
  data: ProData,
  ids: string[],
  date: string,
  from: number,
  duration: number,
  ignoreId?: string,
) {
  const tables = ids
    .map((id) => data.tables.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const seats = tables.reduce((a, t) => a + t.seats, 0);
  const zones = [...new Set(tables.map((t) => t.zone))];
  const busy = tables.filter(
    (t) => !tableFree(data, t.id, date, from, from + duration, ignoreId, 1),
  );
  return {
    tables,
    seats,
    sameZone: zones.length <= 1,
    busy,
    ok: tables.length >= 2 && zones.length === 1 && busy.length === 0,
  };
}

/**
 * Reservas de hoy por sentar (en las próximas horas) que no caben en la mesa
 * que tienen y sí en las mesas unidas: las candidatas a ocupar la unión.
 */
export function bookingsForJoin(
  data: ProData,
  now: Date,
  seats: number,
  horizonMinutes = 180,
): ProBooking[] {
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const seatsOf = (b: ProBooking) =>
    (b.resourceIds?.length ? b.resourceIds : b.resourceId ? [b.resourceId] : [])
      .map((id) => data.tables.find((t) => t.id === id)?.seats ?? 0)
      .reduce((a, n) => a + n, 0);
  return data.bookings
    .filter((b) => {
      if (b.kind !== "table" || isWaitlist(b)) return false;
      if (b.status !== "confirmed" && b.status !== "requested") return false;
      if (localDate(b.start) !== today) return false;
      const start = localMinutes(b.start);
      if (start < nowMin - 30 || start > nowMin + horizonMinutes) return false;
      return seatsOf(b) < b.partySize && b.partySize <= seats;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Grupo sin reserva sentado en mesas unidas (demo: la reserva nace sentada). */
export function joinedWalkIn(input: {
  id: string;
  tableIds: string[];
  party: number;
  now: Date;
  stayMinutes: number;
  name?: string;
}): ProBooking {
  return {
    id: input.id,
    kind: "table",
    clientName: input.name?.trim() || "Grupo sin reserva",
    resourceId: input.tableIds[0],
    resourceIds: input.tableIds,
    start: input.now.toISOString(),
    end: new Date(input.now.getTime() + input.stayMinutes * 60_000).toISOString(),
    partySize: input.party,
    status: "arrived",
    priceCents: 0,
    paidCents: null,
    source: "walkin",
  };
}
