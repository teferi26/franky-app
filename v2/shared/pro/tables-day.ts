import type {
  Allergen,
  ProBooking,
  ProClient,
  ProDailyMenu,
  ProData,
  ProGroupRequest,
  ProMenuItem,
  ProStaff,
  ProTable,
  ProValidation,
} from "./types";
import type {
  ProBono,
  ProBonoTemplate,
  ProCashClosing,
  ProDroppedTable,
  ProGroupDeal,
  ProGroupMenu,
  ProShowcaseItem,
  ProStudySettings,
  ProTablesOps,
  ProVenueEvent,
} from "./tables-types";
import {
  addDays,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
} from "./format";
import {
  ALLERGENS,
  fromFranky,
  isWaitlist,
  stampsFor,
  waitlistOn,
} from "./tables";
import {
  bonoRemaining,
  bookingPhone,
  choiceTally,
  closingTotals,
  dealFor,
  dishMargin,
  eventStats,
  eventsOn,
  lastSeen,
  netPrice,
  priceForTarget,
  priceRises,
  recipeCost,
  weekDates,
} from "./tables-ops";

/**
 * Lo que un hostelero hace cada día de pie tras la barra: sellar sin pedir
 * importe, vender y gastar bonos, cambiar la vitrina, colocar las sobras de
 * la tarde, confirmar las reservas de mañana, llenar la mesa que se cae y
 * mandar el cierre al dueño. Funciones puras, igual que `tables-ops.ts`:
 * web, Expo y los tests llegan siempre al mismo resultado.
 */

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const sameName = (a: string, b: string) => plain(a) === plain(b);

/** Fecha de un campo que puede venir como día (AAAA-MM-DD) o como instante. */
function dayOf(value: string): string {
  return value.length === 10 ? value : localDate(value);
}

/* ------------------------------------------------------------------ */
/* Sello en un toque                                                   */
/* ------------------------------------------------------------------ */

/** Un sello sin importe: el habitual pide y el camarero sella. */
export function stampValidation(input: {
  id: string;
  at: string;
  clientName: string;
  university?: string;
  staffId?: string;
}): ProValidation {
  return {
    id: input.id,
    at: input.at,
    clientName: input.clientName,
    university: input.university,
    kind: "stamp",
    amountCents: 0,
    discountCents: 0,
    staffId: input.staffId,
  };
}

export function stampStatus(
  validations: ProValidation[],
  clientName: string,
  needed: number,
) {
  const stamps = stampsFor(validations, clientName, needed);
  return { stamps, full: stamps >= needed, left: Math.max(0, needed - stamps) };
}

export type StampCandidate = {
  client: ProClient;
  stamps: number;
  full: boolean;
  seen?: string;
};

/**
 * A quién sellar: los que tienen tarjeta, primero quien vino más reciente
 * (el que está en la barra suele ser el de todos los días). Con texto, filtra
 * por nombre sin importar tildes ni mayúsculas.
 */
export function stampCandidates(
  data: ProData,
  query: string,
  needed: number,
  limit = 8,
): StampCandidate[] {
  const q = plain(query);
  const seenBy = new Map<string, string>();
  for (const v of data.validations) {
    const prev = seenBy.get(v.clientName);
    if (!prev || v.at > prev) seenBy.set(v.clientName, v.at);
  }
  return data.clients
    .filter((c) => c.cardMember || seenBy.has(c.name))
    .filter((c) => !q || plain(c.name).includes(q))
    .map((client) => {
      const status = stampStatus(data.validations, client.name, needed);
      return {
        client,
        stamps: status.stamps,
        full: status.full,
        seen: seenBy.get(client.name) ?? client.lastVisit,
      };
    })
    .sort(
      (a, b) =>
        (b.seen ?? "").localeCompare(a.seen ?? "") ||
        a.client.name.localeCompare(b.client.name, "es"),
    )
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Bonos prepago                                                       */
/* ------------------------------------------------------------------ */

/** Lo que se ahorra el cliente con el bono frente a pagar cada consumición. */
export function bonoSaving(template: ProBonoTemplate): number {
  return Math.max(0, template.regularCents - template.priceCents);
}

/** Precio por uso del bono, para enseñarlo en la barra. */
export function bonoUnitCents(template: ProBonoTemplate): number {
  return template.uses > 0 ? Math.round(template.priceCents / template.uses) : 0;
}

export function sellBono(input: {
  id: string;
  template: ProBonoTemplate;
  at: string;
  buyer: string;
  phone?: string;
  clientId?: string;
  /** Si es un bono de grupo: quiénes pueden gastarlo. */
  members?: string[];
  channel?: ProBono["channel"];
}): ProBono {
  const members = input.members
    ?.map((m) => m.trim())
    .filter((m, i, list) => m && list.indexOf(m) === i);
  return {
    id: input.id,
    templateId: input.template.id,
    clientName: input.buyer.trim(),
    clientId: input.clientId,
    phone: input.phone?.trim() || undefined,
    soldAt: input.at,
    paidCents: input.template.priceCents,
    uses: input.template.uses,
    usedAt: [],
    channel: input.channel ?? "barra",
    members: members?.length ? members : undefined,
    usedBy: members?.length ? [] : undefined,
  };
}

/** Historial de un bono, el uso más reciente primero. */
export function bonoHistory(bono: ProBono): { at: string; by: string }[] {
  return bono.usedAt
    .map((at, i) => ({ at, by: bono.usedBy?.[i] ?? bono.clientName }))
    .reverse();
}

/** Quién ha gastado cuánto de un bono de grupo. */
export function bonoUsageByMember(
  bono: ProBono,
): { name: string; uses: number }[] {
  if (!bono.members?.length) return [];
  const counts = new Map<string, number>(bono.members.map((m) => [m, 0]));
  for (const who of bono.usedBy ?? []) counts.set(who, (counts.get(who) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, uses]) => ({ name, uses }))
    .sort((a, b) => b.uses - a.uses);
}

/** Bonos por estado: vivos (con usos) y gastados, los más recientes primero. */
export function bonosByState(ops: ProTablesOps) {
  const sorted = [...ops.bonos].sort((a, b) => b.soldAt.localeCompare(a.soldAt));
  return {
    live: sorted.filter((b) => bonoRemaining(b) > 0),
    spent: sorted.filter((b) => bonoRemaining(b) === 0),
  };
}

/** Bonos a los que les queda un uso o ninguno usado en 21 días: toca avisar. */
export function bonosToNudge(ops: ProTablesOps, now: Date) {
  const since = now.getTime() - 21 * 86_400_000;
  return ops.bonos.filter((b) => {
    const left = bonoRemaining(b);
    if (left <= 0) return false;
    const last = b.usedAt[b.usedAt.length - 1] ?? b.soldAt;
    return left === 1 || Date.parse(last) < since;
  });
}

/** Recordatorio de un bono con usos por gastar, listo para WhatsApp. */
export function bonoNudgeMessage(
  bono: ProBono,
  itemName: string,
  spaceName: string,
): string {
  const left = bonoRemaining(bono);
  const first = bono.clientName.split(" ")[0];
  const what = `${left} ${itemName.toLowerCase()}`;
  return left === 1
    ? `Hola ${first}, te queda 1 ${itemName.toLowerCase()} en tu bono de ${spaceName}. Cuando lo gastes, te preparamos otro si quieres. ¡Te esperamos!`
    : `Hola ${first}, te quedan ${what} en tu bono de ${spaceName}. ¡Te esperamos cuando quieras!`;
}

/* ------------------------------------------------------------------ */
/* Vitrina del día y sobras de última hora                             */
/* ------------------------------------------------------------------ */

export type ShowcaseRow = {
  item: ProMenuItem;
  left: number;
  soldLate: number;
};

/** Lo que hay hoy en la vitrina. Si la vitrina es de otro día, está vacía. */
export function showcaseToday(
  ops: ProTablesOps,
  menu: ProMenuItem[],
  date: string,
): ShowcaseRow[] {
  if (!ops.showcase || ops.showcase.date !== date) return [];
  return ops.showcase.items
    .map((row) => {
      const item = menu.find((m) => m.id === row.menuItemId);
      return item
        ? { item, left: row.left, soldLate: row.soldLate ?? 0 }
        : null;
    })
    .filter((x): x is ShowcaseRow => x !== null);
}

/**
 * Productos que suelen ir a la vitrina: dulces, bollería y bocadillos. Sirve
 * para proponer la vitrina de hoy sin que haya que buscarlos en la carta.
 */
export function showcaseCandidates(menu: ProMenuItem[]): ProMenuItem[] {
  const pattern =
    /dulce|tarta|bizcocho|boller|croissant|cookie|bocadillo|sandwich|sándwich|empanad|tortilla|montadito/i;
  return menu.filter(
    (m) => pattern.test(m.section) || pattern.test(m.name),
  );
}

/** Pone las unidades de un producto en la vitrina de hoy (0 lo deja agotado). */
export function setShowcaseItem(
  ops: ProTablesOps,
  date: string,
  menuItemId: string,
  left: number,
): ProTablesOps {
  const current =
    ops.showcase && ops.showcase.date === date
      ? ops.showcase.items
      : ([] as ProShowcaseItem[]);
  const exists = current.some((r) => r.menuItemId === menuItemId);
  const items = exists
    ? current.map((r) =>
        r.menuItemId === menuItemId ? { ...r, left: Math.max(0, left) } : r,
      )
    : [...current, { menuItemId, left: Math.max(0, left) }];
  return { ...ops, showcase: { date, items } };
}

export function removeShowcaseItem(
  ops: ProTablesOps,
  date: string,
  menuItemId: string,
): ProTablesOps {
  if (!ops.showcase || ops.showcase.date !== date) return ops;
  return {
    ...ops,
    showcase: {
      date,
      items: ops.showcase.items.filter((r) => r.menuItemId !== menuItemId),
    },
  };
}

/**
 * Franja de sobras: desde la hora elegida hasta el cierre. `null` si no hay
 * hora puesta o hoy no se abre.
 */
export function leftoversWindow(
  ops: ProTablesOps,
  hours: { open: number; close: number } | null,
  nowMin: number,
) {
  if (ops.leftoversFrom === undefined || !hours) return null;
  const from = Math.max(ops.leftoversFrom, hours.open);
  const until = hours.close;
  if (from >= until) return null;
  return {
    from,
    until,
    active: nowMin >= from && nowMin < until,
    startsIn: Math.max(0, from - nowMin),
  };
}

/** Oferta relámpago con lo que queda en la vitrina, lista para publicar. */
export function leftoversOffer(
  rows: ShowcaseRow[],
  window: { from: number; until: number },
  nowMin: number,
  discountPct = 50,
) {
  const left = rows.filter((r) => r.left > 0 && r.item.available);
  if (!left.length) return null;
  const units = left.reduce((a, r) => a + r.left, 0);
  const names = left
    .slice(0, 3)
    .map((r) => r.item.name.toLowerCase())
    .join(", ");
  const avg = Math.round(
    left.reduce((a, r) => a + r.item.priceCents * r.left, 0) / units,
  );
  return {
    title: "Lo que queda de hoy",
    what: `${names.charAt(0).toUpperCase()}${names.slice(1)}${left.length > 3 ? " y más" : ""} a mitad de precio`,
    from: Math.max(window.from, Math.ceil(nowMin / 15) * 15),
    to: window.until,
    priceCents: Math.round((avg * (100 - discountPct)) / 100 / 10) * 10,
    slots: units,
  };
}

/** Coste aproximado de una unidad: su escandallo o el objetivo de coste. */
export function unitCostCents(ops: ProTablesOps, item: ProMenuItem): number {
  const recipe = ops.recipes.find((r) => r.menuItemId === item.id);
  if (recipe?.lines.length) return recipeCost(ops, recipe);
  return Math.round((netPrice(item.priceCents) * ops.targetFoodCostPct) / 100);
}

/**
 * Vende unidades como sobra de última hora: salen de la vitrina y quedan en
 * el registro de desperdicio como "vendido" (cuenta para el plan de la Ley
 * 1/2025 sin tener que apuntarlo dos veces).
 */
export function sellLeftovers(
  ops: ProTablesOps,
  input: { id: string; date: string; at: string; item: ProMenuItem; qty: number },
): ProTablesOps {
  if (!ops.showcase || ops.showcase.date !== input.date) return ops;
  const row = ops.showcase.items.find((r) => r.menuItemId === input.item.id);
  if (!row) return ops;
  const qty = Math.min(Math.max(0, Math.round(input.qty)), row.left);
  if (!qty) return ops;
  return {
    ...ops,
    showcase: {
      date: input.date,
      items: ops.showcase.items.map((r) =>
        r.menuItemId === input.item.id
          ? { ...r, left: r.left - qty, soldLate: (r.soldLate ?? 0) + qty }
          : r,
      ),
    },
    waste: [
      {
        id: input.id,
        date: input.date,
        at: input.at,
        item: input.item.name,
        qty,
        unit: "ud",
        fate: "vendido",
        valueCents: unitCostCents(ops, input.item) * qty,
        reason: "Sobra de última hora",
      },
      ...ops.waste,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Sitio para estudiar                                                 */
/* ------------------------------------------------------------------ */

/** Mueve el contador de la barra sin pasarse del aforo ni bajar de cero. */
export function studyCount(
  settings: ProStudySettings,
  delta: number,
  at: string,
): ProStudySettings {
  const occupied = Math.min(
    settings.seats,
    Math.max(0, settings.occupied + delta),
  );
  return { ...settings, occupied, occupiedAt: at };
}

export function defaultStudySettings(
  hours: { open: number; close: number } | null,
): ProStudySettings {
  return {
    enabled: true,
    seats: 12,
    plugs: 8,
    wifi: true,
    fromMinute: Math.max(hours?.open ?? 9 * 60, 15 * 60),
    toMinute: Math.min(hours?.close ?? 20 * 60, 20 * 60),
    rule: "every2h",
    noLaptopDays: [],
    occupied: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Cierre: resumen para el dueño                                       */
/* ------------------------------------------------------------------ */

/**
 * El texto del día para el WhatsApp del dueño cuando cierra otra persona.
 * Solo cifras apuntadas: nada que el camarero no haya contado.
 */
export function closingSummaryMessage(input: {
  spaceName: string;
  closing: ProCashClosing;
  closedBy?: string;
  card: { count: number; chargedCents: number };
  bonosUsed?: number;
  pending: { haccpPending: number; wasteLogged: boolean; shoppingLines: number };
}): string {
  const { closing } = input;
  const totals = closingTotals(closing);
  const day = new Date(`${closing.date}T12:00:00Z`).toLocaleDateString(
    "es-ES",
    { weekday: "long", day: "numeric", timeZone: "Europe/Madrid" },
  );
  const lines = [
    `Cierre de ${input.spaceName}, ${day}`,
    `Total: ${money(totals.totalCents)} (efectivo ${money(totals.cashSalesCents)}, tarjeta ${money(closing.cardCents)}, Bizum ${money(closing.bizumCents)})`,
  ];
  if (totals.diffCents !== null)
    lines.push(
      totals.diffCents === 0
        ? "Caja: cuadra"
        : `Caja: ${totals.diffCents > 0 ? "sobran" : "faltan"} ${money(Math.abs(totals.diffCents))}`,
    );
  if (closing.tipsCents > 0) lines.push(`Propinas: ${money(closing.tipsCents)}`);
  if (closing.covers) lines.push(`Cubiertos: ${closing.covers}`);
  if (input.card.count > 0)
    lines.push(
      `Franky Card: ${input.card.count} ${input.card.count === 1 ? "validación" : "validaciones"}, ${money(input.card.chargedCents)}`,
    );
  if (input.bonosUsed)
    lines.push(`Bonos: ${input.bonosUsed} ${input.bonosUsed === 1 ? "uso" : "usos"} servidos`);
  const pending: string[] = [];
  if (input.pending.haccpPending)
    pending.push(`APPCC del cierre (faltan ${input.pending.haccpPending})`);
  if (!input.pending.wasteLogged) pending.push("sobras sin apuntar");
  if (input.pending.shoppingLines)
    pending.push(`${input.pending.shoppingLines} en la lista de la compra`);
  lines.push(pending.length ? `Pendiente: ${pending.join(", ")}` : "Todo el cierre hecho");
  if (closing.nextDayNote) lines.push(`Para mañana: ${closing.nextDayNote}`);
  const hour = minutesToLabel(localMinutes(closing.closedAt));
  lines.push(input.closedBy ? `Cerró ${input.closedBy} a las ${hour}` : `Cerrado a las ${hour}`);
  return lines.join("\n");
}

/** La nota del último cierre anterior a hoy, para el equipo que abre. */
export function lastClosingNote(ops: ProTablesOps, today: string) {
  const previous = ops.closings
    .filter((c) => c.date < today && c.nextDayNote?.trim())
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!previous || previous.date < addDays(today, -3)) return null;
  return { date: previous.date, note: previous.nextDayNote!.trim(), staffId: previous.staffId };
}

/* ------------------------------------------------------------------ */
/* Alérgenos                                                           */
/* ------------------------------------------------------------------ */

/** Carta en matriz de 14 columnas, por secciones, para imprimir. */
export function allergenMatrix(menu: ProMenuItem[]) {
  const sections = [...new Set(menu.map((m) => m.section))];
  return sections.map((section) => ({
    section,
    rows: menu
      .filter((m) => m.section === section)
      .map((item) => ({
        item,
        has: ALLERGENS.map((a) => item.allergens.includes(a.id)),
      })),
  }));
}

const NOTE_ALLERGENS: [RegExp, Allergen[]][] = [
  [/celiac|celíac|gluten|trigo/i, ["gluten"]],
  [/lactosa|l[aá]cteo|leche|queso/i, ["lacteos"]],
  [/frutos secos|nuez|nueces|almendra|avellana|pistacho/i, ["frutos_cascara"]],
  [/cacahuete|man[ií]/i, ["cacahuete"]],
  [/marisco|crust[aá]ceo|gamba|langostino/i, ["crustaceos", "moluscos"]],
  [/molusco|calamar|mejill[oó]n|sepia/i, ["moluscos"]],
  [/pescado/i, ["pescado"]],
  [/huevo/i, ["huevo"]],
  [/soja/i, ["soja"]],
  [/s[eé]samo/i, ["sesamo"]],
  [/mostaza/i, ["mostaza"]],
  [/apio/i, ["apio"]],
  [/sulfito/i, ["sulfitos"]],
  [/altramuz|tramus/i, ["altramuces"]],
];

/** Alérgenos que se leen en la nota de una reserva ("sin gluten, lactosa"). */
export function allergensInNote(note?: string): Allergen[] {
  if (!note) return [];
  const out = new Set<Allergen>();
  for (const [pattern, list] of NOTE_ALLERGENS)
    if (pattern.test(note)) list.forEach((a) => out.add(a));
  return ALLERGENS.map((a) => a.id).filter((id) => out.has(id));
}

/** Lo que puede tomar alguien que evita estos alérgenos, de lo disponible. */
export function safeDishes(menu: ProMenuItem[], avoid: Allergen[]): ProMenuItem[] {
  return menu.filter(
    (m) => m.available && !m.allergens.some((a) => avoid.includes(a)),
  );
}

/* ------------------------------------------------------------------ */
/* Menú del día en un minuto                                           */
/* ------------------------------------------------------------------ */

type Course = "starters" | "mains" | "desserts";

/**
 * Platos de otros días para volver a ponerlos con un toque: primero los que
 * más se repiten y, a igualdad, los más recientes.
 */
export function recentDishes(
  history: ProDailyMenu[],
  course: Course,
  exclude: string[] = [],
  limit = 8,
): string[] {
  const skip = new Set(exclude.map(plain));
  const stats = new Map<string, { name: string; n: number; last: string }>();
  for (const menu of history) {
    for (const dish of menu[course]) {
      const key = plain(dish);
      if (!key || skip.has(key)) continue;
      const prev = stats.get(key);
      stats.set(key, {
        name: prev?.name ?? dish.trim(),
        n: (prev?.n ?? 0) + 1,
        last: !prev || menu.date > prev.last ? menu.date : prev.last,
      });
    }
  }
  return [...stats.values()]
    .sort((a, b) => b.n - a.n || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map((s) => s.name);
}

/** Guarda el menú de hoy en el historial (uno por día, los últimos 60). */
export function rememberDailyMenu(
  ops: ProTablesOps,
  menu: ProDailyMenu,
): ProTablesOps {
  const history = (ops.dailyMenuHistory ?? []).filter((m) => m.date !== menu.date);
  return {
    ...ops,
    dailyMenuHistory: [menu, ...history]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60),
  };
}

/** Texto del menú para compartir por WhatsApp o en un estado. */
export function dailyMenuMessage(
  menu: ProDailyMenu,
  spaceName: string,
  link?: string,
): string {
  const lines = [`Menú del día en ${spaceName}: ${money(menu.priceCents)}`];
  if (menu.studentPriceCents)
    lines.push(`Con Franky verificado: ${money(menu.studentPriceCents)}`);
  if (menu.starters.length) lines.push(`Primeros: ${menu.starters.join(", ")}`);
  if (menu.mains.length) lines.push(`Segundos: ${menu.mains.join(", ")}`);
  if (menu.desserts.length) lines.push(`Postres: ${menu.desserts.join(", ")}`);
  if (menu.includes) lines.push(`Incluye ${menu.includes.toLowerCase()}.`);
  if (link) lines.push(link);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Confirmaciones y reseñas                                            */
/* ------------------------------------------------------------------ */

/** Apunta que se avisó, se confirmó o se pidió reseña de una reserva. */
export function markContact(
  ops: ProTablesOps,
  bookingId: string,
  field: "remindedAt" | "confirmedAt" | "reviewAskedAt",
  at: string,
): ProTablesOps {
  const exists = ops.contacts.some((c) => c.bookingId === bookingId);
  return {
    ...ops,
    contacts: exists
      ? ops.contacts.map((c) =>
          c.bookingId === bookingId ? { ...c, [field]: at } : c,
        )
      : [...ops.contacts, { bookingId, [field]: at }],
  };
}

/** ¿Se puede pedir reseña? Solo a quien dio permiso y una vez por reserva. */
export function canAskReview(
  data: ProData,
  ops: ProTablesOps,
  booking: ProBooking,
): boolean {
  if (booking.status !== "done" || !ops.reviewLink) return false;
  const client = data.clients.find((c) => c.id === booking.clientId);
  if (!client?.marketingConsent || !client.phone) return false;
  return !ops.contacts.some((c) => c.bookingId === booking.id && c.reviewAskedAt);
}

/* ------------------------------------------------------------------ */
/* Mesa que se cae                                                     */
/* ------------------------------------------------------------------ */

export type DroppedTable = {
  booking: ProBooking;
  tables: ProTable[];
  seats: number;
  /** Minutos que quedan del hueco que ha dejado. */
  minutesLeft: number;
  /** Gente en espera que cabe en esa mesa, por orden de llegada. */
  candidates: { booking: ProBooking; phone?: string }[];
};

/**
 * Reservas de hoy que no vinieron o se cancelaron con mesa asignada y cuyo
 * hueco sigue abierto. Son mesas que aún se pueden llenar.
 */
export function droppedTables(
  data: ProData,
  ops: ProTablesOps,
  now: Date,
): DroppedTable[] {
  const today = localDate(now);
  const handled = new Set((ops.dropped ?? []).map((d) => d.bookingId));
  const waiting = waitlistOn(data, today);
  return data.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        !isWaitlist(b) &&
        (b.status === "no_show" || (b.status === "cancelled" && b.resourceId)) &&
        localDate(b.start) === today &&
        Date.parse(b.end) - now.getTime() >= 30 * 60_000 &&
        !handled.has(b.id),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((booking) => {
      const ids = booking.resourceIds?.length
        ? booking.resourceIds
        : booking.resourceId
          ? [booking.resourceId]
          : [];
      const tables = data.tables.filter((t) => ids.includes(t.id));
      const seats = tables.reduce((a, t) => a + t.seats, 0) || booking.partySize;
      return {
        booking,
        tables,
        seats,
        minutesLeft: Math.round((Date.parse(booking.end) - now.getTime()) / 60_000),
        candidates: waiting
          .filter((w) => w.partySize <= seats)
          .map((w) => ({ booking: w, phone: bookingPhone(data, w) })),
      };
    });
}

export function markDropped(
  ops: ProTablesOps,
  bookingId: string,
  how: ProDroppedTable["how"],
  at: string,
): ProTablesOps {
  const rest = (ops.dropped ?? []).filter((d) => d.bookingId !== bookingId);
  return { ...ops, dropped: [...rest, { bookingId, how, handledAt: at }] };
}

/* ------------------------------------------------------------------ */
/* Grupos del día                                                      */
/* ------------------------------------------------------------------ */

export type GroupToday = {
  request: ProGroupRequest;
  deal: ProGroupDeal;
  menu?: ProGroupMenu;
  tally?: ReturnType<typeof choiceTally>;
};

/** Grupos que vienen ese día, con su recuento de platos y alergias. */
export function groupsOn(
  data: ProData,
  ops: ProTablesOps,
  date: string,
): GroupToday[] {
  return data.groupRequests
    .filter((g) => g.status === "accepted" && dayOf(g.date) === date)
    .flatMap((request): GroupToday[] => {
      const deal = dealFor(ops, request.id);
      if (!deal || deal.stage === "served") return [];
      const menu = ops.groupMenus.find((m) => m.id === deal.menuId);
      return [
        { request, deal, menu, tally: menu ? choiceTally(menu, deal) : undefined },
      ];
    });
}

/** Grupos que tienen que cerrar número hoy o mañana y aún no lo han hecho. */
export function groupsClosingSoon(
  data: ProData,
  ops: ProTablesOps,
  today: string,
) {
  const tomorrow = addDays(today, 1);
  return ops.groupDeals
    .filter(
      (d) =>
        d.closeBy &&
        (d.stage === "quoted" || d.stage === "deposit") &&
        (dayOf(d.closeBy) === today || dayOf(d.closeBy) === tomorrow),
    )
    .map((deal) => ({
      deal,
      request: data.groupRequests.find((g) => g.id === deal.requestId),
      today: dayOf(deal.closeBy!) === today,
    }))
    .filter(
      (x): x is { deal: ProGroupDeal; request: ProGroupRequest; today: boolean } =>
        Boolean(x.request),
    );
}

/* ------------------------------------------------------------------ */
/* Hoy de barra                                                        */
/* ------------------------------------------------------------------ */

/** Quién trabaja hoy según el cuadrante, en orden de entrada. */
export function rotaToday(
  ops: ProTablesOps,
  staff: ProStaff[],
  date: string,
): { person: ProStaff; from: number; to: number; label?: string }[] {
  return ops.rota
    .filter((s) => s.date === date)
    .sort((a, b) => a.from - b.from)
    .flatMap((s) => {
      const person = staff.find((p) => p.id === s.staffId);
      return person ? [{ person, from: s.from, to: s.to, label: s.label }] : [];
    });
}

/** El partido o evento de hoy con sus plazas y señales pendientes. */
export function eventToday(ops: ProTablesOps, date: string) {
  const event: ProVenueEvent | undefined = eventsOn(ops, date)[0];
  return event ? { event, stats: eventStats(event) } : null;
}

/* ------------------------------------------------------------------ */
/* Márgenes que avisan solos                                           */
/* ------------------------------------------------------------------ */

/**
 * Platos que se han salido del coste objetivo por un ingrediente que ha
 * subido, con el precio que los devuelve al objetivo.
 */
export function marginAlerts(ops: ProTablesOps, menu: ProMenuItem[]) {
  const rises = priceRises(ops);
  const out = new Map<
    string,
    {
      item: ProMenuItem;
      ingredient: string;
      risePct: number;
      foodCostPct: number;
      suggestedPriceCents: number;
    }
  >();
  for (const rise of rises) {
    for (const recipe of ops.recipes) {
      if (!recipe.lines.some((l) => l.ingredientId === rise.ingredient.id)) continue;
      const item = menu.find((m) => m.id === recipe.menuItemId);
      if (!item) continue;
      const margin = dishMargin(ops, item);
      if (!margin || margin.status === "ok") continue;
      const prev = out.get(item.id);
      if (prev && prev.risePct >= rise.risePct) continue;
      out.set(item.id, {
        item,
        ingredient: rise.ingredient.name,
        risePct: rise.risePct,
        foodCostPct: margin.foodCostPct,
        suggestedPriceCents: priceForTarget(margin.costCents, ops.targetFoodCostPct),
      });
    }
  }
  return [...out.values()].sort((a, b) => b.foodCostPct - a.foodCostPct);
}

/* ------------------------------------------------------------------ */
/* Informe de la semana                                                */
/* ------------------------------------------------------------------ */

export type WeekDay = {
  date: string;
  /** Total del cierre de ese día o null si no se cerró en Franky. */
  totalCents: number | null;
  covers: number;
  bookings: number;
  noShows: number;
  franky: number;
  card: number;
};

/**
 * La semana del local de lunes a domingo: caja de los cierres, cubiertos,
 * reservas, plantones, lo que trajo Franky y la Card. Solo lo que hay
 * apuntado; los días sin cierre no cuentan en la caja.
 */
export function weekReport(
  data: ProData,
  ops: ProTablesOps,
  monday: string,
  now: Date,
) {
  const today = localDate(now);
  const days: WeekDay[] = weekDates(monday)
    .filter((date) => date <= today)
    .map((date) => {
      const list = data.bookings.filter(
        (b) =>
          b.kind === "table" &&
          !isWaitlist(b) &&
          b.status !== "cancelled" &&
          localDate(b.start) === date,
      );
      const closing = ops.closings.find((c) => c.date === date);
      const served = list.filter((b) => b.status !== "no_show");
      return {
        date,
        totalCents: closing ? closingTotals(closing).totalCents : null,
        covers:
          closing?.covers ?? served.reduce((a, b) => a + b.partySize, 0),
        bookings: list.length,
        noShows: list.filter((b) => b.status === "no_show").length,
        franky: served.filter((b) => fromFranky(b.source)).length,
        card: data.validations.filter((v) => localDate(v.at) === date).length,
      };
    });
  const closed = days.filter((d) => d.totalCents !== null);
  const totalCents = closed.reduce((a, d) => a + (d.totalCents ?? 0), 0);
  const covers = days.reduce((a, d) => a + d.covers, 0);
  const bookings = days.reduce((a, d) => a + d.bookings, 0);
  const noShows = days.reduce((a, d) => a + d.noShows, 0);
  const groups = data.groupRequests.filter(
    (g) =>
      g.status === "accepted" &&
      dayOf(g.date) >= monday &&
      dayOf(g.date) <= addDays(monday, 6),
  ).length;
  return {
    days,
    closedDays: closed.length,
    totalCents,
    covers,
    bookings,
    noShows,
    noShowPct: bookings ? Math.round((noShows / bookings) * 1000) / 10 : 0,
    franky: days.reduce((a, d) => a + d.franky, 0),
    card: days.reduce((a, d) => a + d.card, 0),
    groups,
    /** Ticket medio por cubierto de los días cerrados con cubiertos. */
    perCoverCents: (() => {
      const withCovers = closed.filter((d) => d.covers > 0);
      const c = withCovers.reduce((a, d) => a + d.covers, 0);
      return c
        ? Math.round(withCovers.reduce((a, d) => a + (d.totalCents ?? 0), 0) / c)
        : null;
    })(),
  };
}

/* ------------------------------------------------------------------ */
/* Habituales                                                          */
/* ------------------------------------------------------------------ */

export function birthdayMessage(
  name: string,
  spaceName: string,
  gift: string,
): string {
  return `¡Feliz cumpleaños, ${name.split(" ")[0]}! En ${spaceName} te invitamos a ${gift.toLowerCase()} cuando vengas esta semana. Solo tienes que enseñar tu Franky.`;
}

/** Días desde la última visita de un cliente (null si nunca se le vio). */
export function daysAway(data: ProData, client: ProClient, now: Date): number | null {
  const seen = lastSeen(data, client);
  if (!seen) return null;
  return Math.floor((now.getTime() - Date.parse(seen)) / 86_400_000);
}
