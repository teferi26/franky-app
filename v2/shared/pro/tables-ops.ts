import type {
  ProBooking,
  ProClient,
  ProData,
  ProMenuItem,
  ProShift,
  ProStaff,
  ProTable,
  ProValidation,
} from "./types";
import type {
  ProBono,
  ProCashClosing,
  ProColdUnit,
  ProGroupDeal,
  ProGroupMenu,
  ProHaccpEntry,
  ProHaccpMoment,
  ProHaccpTask,
  ProPickupOrder,
  ProRecipe,
  ProShoppingLine,
  ProStockItem,
  ProStudySettings,
  ProSupplier,
  ProTablesOps,
  ProVenueEvent,
  ProWasteEntry,
  ProWasteFate,
} from "./tables-types";
import {
  addDays,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  weekdayIndex,
} from "./format";
import { isWaitlist, tableFree, reservableTables } from "./tables";

/**
 * Cálculos de la operación diaria de hostelería. Funciones puras: reciben
 * datos y devuelven datos, sin fechas del sistema ni almacenamiento, para que
 * web, Expo y los tests den siempre el mismo resultado.
 */

export function emptyTablesOps(): ProTablesOps {
  return {
    bonoTemplates: [],
    bonos: [],
    orders: [],
    coldUnits: [],
    haccpTasks: [],
    haccpLog: [],
    waste: [],
    suppliers: [],
    stock: [],
    shopping: [],
    purchaseOrders: [],
    ingredients: [],
    recipes: [],
    targetFoodCostPct: 32,
    rota: [],
    closings: [],
    events: [],
    groupMenus: [],
    groupDeals: [],
    contacts: [],
    usuals: [],
  };
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Bonos prepago                                                       */
/* ------------------------------------------------------------------ */

export function bonoRemaining(bono: ProBono): number {
  return Math.max(0, bono.uses - bono.usedAt.length);
}

/** Bonos con usos pendientes de un cliente, el más antiguo primero. */
export function activeBonosFor(
  ops: ProTablesOps,
  clientName: string,
): ProBono[] {
  return ops.bonos
    .filter(
      (b) =>
        (sameName(b.clientName, clientName) ||
          Boolean(b.members?.some((m) => sameName(m, clientName)))) &&
        bonoRemaining(b) > 0,
    )
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt));
}

/**
 * Descuenta un uso. En un bono de grupo se apunta quién lo gastó; en uno
 * personal, `usedBy` no se toca.
 */
export function consumeBono(bono: ProBono, at: string, by?: string): ProBono {
  if (bonoRemaining(bono) <= 0) return bono;
  if (!bono.members?.length) return { ...bono, usedAt: [...bono.usedAt, at] };
  const who = by?.trim() || bono.clientName;
  // Rellena usos antiguos sin autor para que las dos listas vayan a la par.
  const previous = bono.usedAt.map((_, i) => bono.usedBy?.[i] ?? bono.clientName);
  return {
    ...bono,
    usedAt: [...bono.usedAt, at],
    usedBy: [...previous, who],
  };
}

export type BonoSummary = {
  soldToday: number;
  cashTodayCents: number;
  usedToday: number;
  activeBonos: number;
  pendingUses: number;
  /** Lo ya cobrado que aún queda por servir. */
  pendingValueCents: number;
};

export function bonoSummary(ops: ProTablesOps, date: string): BonoSummary {
  const sold = ops.bonos.filter((b) => localDate(b.soldAt) === date);
  const active = ops.bonos.filter((b) => bonoRemaining(b) > 0);
  return {
    soldToday: sold.length,
    cashTodayCents: sold.reduce((a, b) => a + b.paidCents, 0),
    usedToday: ops.bonos.reduce(
      (a, b) => a + b.usedAt.filter((at) => localDate(at) === date).length,
      0,
    ),
    activeBonos: active.length,
    pendingUses: active.reduce((a, b) => a + bonoRemaining(b), 0),
    pendingValueCents: active.reduce(
      (a, b) => a + Math.round((b.paidCents * bonoRemaining(b)) / b.uses),
      0,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Pedidos para recoger y encargos                                     */
/* ------------------------------------------------------------------ */

export const ORDER_STATUS_LABEL: Record<ProPickupOrder["status"], string> = {
  new: "Nuevo",
  preparing: "Preparando",
  ready: "Listo",
  collected: "Recogido",
  cancelled: "Cancelado",
};

export function orderTotal(order: ProPickupOrder): number {
  return order.lines.reduce((a, l) => a + l.qty * l.priceCents, 0);
}

export function ordersOn(
  ops: ProTablesOps,
  date: string,
  kind?: ProPickupOrder["kind"],
): ProPickupOrder[] {
  return ops.orders
    .filter(
      (o) => localDate(o.pickupAt) === date && (!kind || o.kind === kind),
    )
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}

/** Pedidos pendientes agrupados por franja de 15 minutos de recogida. */
export function ordersBySlot(
  orders: ProPickupOrder[],
): { minute: number; orders: ProPickupOrder[] }[] {
  const slots = new Map<number, ProPickupOrder[]>();
  for (const order of orders) {
    const minute = Math.floor(localMinutes(order.pickupAt) / 15) * 15;
    slots.set(minute, [...(slots.get(minute) ?? []), order]);
  }
  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, list]) => ({ minute, orders: list }));
}

/** Encargos de los próximos días que hay que recordar hoy (recogida mañana). */
export function ordersToRemind(
  ops: ProTablesOps,
  today: string,
): ProPickupOrder[] {
  const tomorrow = addDays(today, 1);
  return ops.orders.filter(
    (o) =>
      o.kind === "encargo" &&
      !o.remindedAt &&
      o.status !== "cancelled" &&
      localDate(o.pickupAt) === tomorrow,
  );
}

export function orderReadyMessage(
  order: ProPickupOrder,
  spaceName: string,
): string {
  const first = order.clientName.split(" ")[0];
  return `Hola ${first}, tu pedido de ${spaceName} ya está listo. Te esperamos en la barra.`;
}

export function orderReminderMessage(
  order: ProPickupOrder,
  spaceName: string,
): string {
  const first = order.clientName.split(" ")[0];
  const what = order.lines.map((l) => `${l.qty} ${l.name}`).join(", ");
  return `Hola ${first}, te recordamos que mañana a las ${minutesToLabel(localMinutes(order.pickupAt))} tienes listo tu encargo en ${spaceName}: ${what}. ¡Hasta mañana!`;
}

/* ------------------------------------------------------------------ */
/* APPCC                                                               */
/* ------------------------------------------------------------------ */

export function tempInRange(unit: ProColdUnit, value: number): boolean {
  return value >= unit.min && value <= unit.max;
}

export type HaccpMomentState = {
  temps: { unit: ProColdUnit; entry?: ProHaccpEntry }[];
  tasks: { task: ProHaccpTask; entry?: ProHaccpEntry }[];
  pending: number;
  alerts: ProHaccpEntry[];
};

/** Qué se ha apuntado en la apertura o el cierre de un día y qué falta. */
export function haccpMoment(
  ops: ProTablesOps,
  date: string,
  moment: ProHaccpMoment,
): HaccpMomentState {
  const log = ops.haccpLog.filter(
    (e) => e.date === date && e.moment === moment,
  );
  const latest = (fn: (e: ProHaccpEntry) => boolean) =>
    log.filter(fn).sort((a, b) => b.at.localeCompare(a.at))[0];
  const temps = ops.coldUnits.map((unit) => ({
    unit,
    entry: latest((e) => e.unitId === unit.id),
  }));
  const tasks = ops.haccpTasks
    .filter((t) => t.moment === moment)
    .map((task) => ({ task, entry: latest((e) => e.taskId === task.id) }));
  return {
    temps,
    tasks,
    pending:
      temps.filter((t) => !t.entry).length +
      tasks.filter((t) => !t.entry).length,
    alerts: log.filter((e) => !e.ok),
  };
}

/** Días del mes con registro completo, alertas y acciones correctoras. */
export function haccpMonth(ops: ProTablesOps, month: string, today: string) {
  const days: { date: string; complete: boolean; alerts: number }[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    if (date > today || localDate(`${date}T12:00:00Z`) !== date) continue;
    const open = haccpMoment(ops, date, "apertura");
    const close = haccpMoment(ops, date, "cierre");
    const logged = ops.haccpLog.some((e) => e.date === date);
    if (!logged && date !== today) {
      days.push({ date, complete: false, alerts: 0 });
      continue;
    }
    days.push({
      date,
      complete: open.pending === 0 && close.pending === 0,
      alerts: open.alerts.length + close.alerts.length,
    });
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Desperdicio alimentario                                             */
/* ------------------------------------------------------------------ */

export const WASTE_FATES: { id: ProWasteFate; label: string }[] = [
  { id: "vendido", label: "Vendido con descuento" },
  { id: "donado", label: "Donado" },
  { id: "aprovechado", label: "Aprovechado" },
  { id: "tirado", label: "Tirado" },
];

export function wasteSummary(ops: ProTablesOps, month: string) {
  const list = ops.waste.filter((w) => w.date.startsWith(month));
  const byFate = Object.fromEntries(
    WASTE_FATES.map((f) => [f.id, { count: 0, valueCents: 0 }]),
  ) as Record<ProWasteFate, { count: number; valueCents: number }>;
  for (const w of list) {
    byFate[w.fate].count += 1;
    byFate[w.fate].valueCents += w.valueCents;
  }
  const total = list.reduce((a, w) => a + w.valueCents, 0);
  const saved = total - byFate.tirado.valueCents;
  return {
    entries: list.length,
    days: new Set(list.map((w) => w.date)).size,
    byFate,
    totalCents: total,
    savedCents: saved,
    /** Parte del valor que no acabó en la basura. */
    savedPct: total ? Math.round((saved / total) * 100) : 0,
    topThrown: topItems(list.filter((w) => w.fate === "tirado")),
  };
}

function topItems(list: ProWasteEntry[]) {
  const map = new Map<string, number>();
  for (const w of list) map.set(w.item, (map.get(w.item) ?? 0) + w.valueCents);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([item, valueCents]) => ({ item, valueCents }));
}

/* ------------------------------------------------------------------ */
/* Compras                                                             */
/* ------------------------------------------------------------------ */

/** Lo que está por debajo del mínimo y cuánto pedir para llegar al doble. */
export function lowStock(
  ops: ProTablesOps,
): { item: ProStockItem; suggest: number }[] {
  return ops.stock
    .filter((i) => i.current < i.min)
    .map((item) => ({
      item,
      suggest: Math.max(1, Math.ceil(item.min * 2 - item.current)),
    }));
}

export function stockValue(ops: ProTablesOps): number {
  return ops.stock.reduce(
    (a, i) => a + Math.round(i.current * i.costCents),
    0,
  );
}

export function shoppingBySupplier(
  ops: ProTablesOps,
): { supplier: ProSupplier; lines: ProShoppingLine[] }[] {
  return ops.suppliers
    .map((supplier) => ({
      supplier,
      lines: ops.shopping.filter((l) => l.supplierId === supplier.id),
    }))
    .filter((g) => g.lines.length > 0);
}

/** Próximo día de reparto a partir de `date` (incluido si aún se llega). */
export function nextDelivery(
  supplier: ProSupplier,
  date: string,
  nowMinute: number,
): string | null {
  if (!supplier.deliveryDays.length) return null;
  for (let i = 0; i < 8; i++) {
    const day = addDays(date, i);
    if (!supplier.deliveryDays.includes(weekdayIndex(day))) continue;
    // Si hoy ya ha pasado la hora de pedido, el reparto de hoy no cuenta.
    if (i === 0) continue;
    if (
      i === 1 &&
      supplier.orderBefore !== undefined &&
      nowMinute > supplier.orderBefore
    )
      continue;
    return day;
  }
  return null;
}

export function supplierMessage(
  supplier: ProSupplier,
  lines: { name: string; qty: number; unit: string }[],
  spaceName: string,
): string {
  const body = lines.map((l) => `- ${l.qty} ${l.unit} de ${l.name}`).join("\n");
  return `Hola, soy de ${spaceName}. Para el próximo reparto os pido:\n${body}\nGracias.`;
}

/* ------------------------------------------------------------------ */
/* Escandallo                                                          */
/* ------------------------------------------------------------------ */

/** IVA de la hostelería: el coste se compara con el precio sin IVA. */
export const IVA_HOSTELERIA = 10;

export function netPrice(priceCents: number): number {
  return Math.round((priceCents * 100) / (100 + IVA_HOSTELERIA));
}

export function recipeCost(
  ops: ProTablesOps,
  recipe: ProRecipe,
  override?: { ingredientId: string; costCents: number },
): number {
  return Math.round(
    recipe.lines.reduce((total, line) => {
      const ing = ops.ingredients.find((i) => i.id === line.ingredientId);
      if (!ing) return total;
      const cost =
        override?.ingredientId === ing.id ? override.costCents : ing.costCents;
      return total + cost * line.qty;
    }, 0),
  );
}

export type DishMargin = {
  item: ProMenuItem;
  costCents: number;
  netCents: number;
  marginCents: number;
  foodCostPct: number;
  status: "ok" | "watch" | "high";
};

function marginOf(
  item: ProMenuItem,
  costCents: number,
  target: number,
): DishMargin {
  const net = netPrice(item.priceCents);
  const pctValue = net > 0 ? Math.round((costCents / net) * 1000) / 10 : 0;
  return {
    item,
    costCents,
    netCents: net,
    marginCents: net - costCents,
    foodCostPct: pctValue,
    status: pctValue <= target ? "ok" : pctValue <= target + 5 ? "watch" : "high",
  };
}

export function dishMargin(
  ops: ProTablesOps,
  item: ProMenuItem,
): DishMargin | null {
  const recipe = ops.recipes.find((r) => r.menuItemId === item.id);
  if (!recipe || !recipe.lines.length) return null;
  return marginOf(item, recipeCost(ops, recipe), ops.targetFoodCostPct);
}

/** Carta con escandallo, de lo que más deja a lo que menos. */
export function marginRanking(
  ops: ProTablesOps,
  menu: ProMenuItem[],
): DishMargin[] {
  return menu
    .map((item) => dishMargin(ops, item))
    .filter((m): m is DishMargin => m !== null)
    .sort((a, b) => b.marginCents - a.marginCents);
}

/** Precio con IVA que devuelve el plato al objetivo, redondeado a 10 céntimos. */
export function priceForTarget(costCents: number, targetPct: number): number {
  if (targetPct <= 0) return 0;
  const net = costCents / (targetPct / 100);
  return Math.ceil((net * (100 + IVA_HOSTELERIA)) / 100 / 10) * 10;
}

/** Si un ingrediente sube, qué platos pierden margen y a cuánto subirlos. */
export function priceImpact(
  ops: ProTablesOps,
  menu: ProMenuItem[],
  ingredientId: string,
  newCostCents: number,
) {
  return ops.recipes
    .filter((r) => r.lines.some((l) => l.ingredientId === ingredientId))
    .map((recipe) => {
      const item = menu.find((m) => m.id === recipe.menuItemId);
      if (!item) return null;
      const before = marginOf(
        item,
        recipeCost(ops, recipe),
        ops.targetFoodCostPct,
      );
      const after = marginOf(
        item,
        recipeCost(ops, recipe, { ingredientId, costCents: newCostCents }),
        ops.targetFoodCostPct,
      );
      return {
        item,
        before,
        after,
        suggestedPriceCents:
          after.status === "ok"
            ? null
            : priceForTarget(after.costCents, ops.targetFoodCostPct),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Ingredientes que han subido desde el último precio apuntado. */
export function priceRises(ops: ProTablesOps) {
  return ops.ingredients
    .filter(
      (i) =>
        i.previousCostCents !== undefined && i.costCents > i.previousCostCents,
    )
    .map((i) => ({
      ingredient: i,
      risePct:
        Math.round(
          ((i.costCents - (i.previousCostCents ?? i.costCents)) /
            (i.previousCostCents || 1)) *
            1000,
        ) / 10,
    }));
}

/* ------------------------------------------------------------------ */
/* Cuadrante y fichaje                                                 */
/* ------------------------------------------------------------------ */

export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function rotaMinutes(from: number, to: number): number {
  // Un turno que acaba después de medianoche se guarda con `to` > 1440.
  return Math.max(0, to - from);
}

export function plannedMinutes(
  ops: ProTablesOps,
  staffId: string,
  monday: string,
): number {
  const days = new Set(weekDates(monday));
  return ops.rota
    .filter((s) => s.staffId === staffId && days.has(s.date))
    .reduce((a, s) => a + rotaMinutes(s.from, s.to), 0);
}

export function workedMinutes(
  shifts: ProShift[],
  staffId: string,
  dates: string[],
  now: Date,
): number {
  const set = new Set(dates);
  return shifts
    .filter((s) => s.staffId === staffId && set.has(s.date))
    .reduce((a, s) => {
      const end = s.outAt ? Date.parse(s.outAt) : now.getTime();
      const minutes = Math.round((end - Date.parse(s.inAt)) / 60000);
      return a + Math.max(0, minutes - s.breakMinutes);
    }, 0);
}

/** Quién tenía turno ya empezado y no ha fichado todavía. */
export function missingClockIns(
  ops: ProTablesOps,
  staff: ProStaff[],
  shifts: ProShift[],
  now: Date,
  graceMinutes = 10,
): { staff: ProStaff; from: number; late: number }[] {
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const out: { staff: ProStaff; from: number; late: number }[] = [];
  for (const shift of ops.rota) {
    if (shift.date !== today) continue;
    if (shift.from + graceMinutes > nowMin || shift.to <= nowMin) continue;
    const person = staff.find((p) => p.id === shift.staffId);
    if (!person || person.clockedInAt) continue;
    const clocked = shifts.some(
      (sh) => sh.staffId === person.id && sh.date === today,
    );
    if (clocked) continue;
    out.push({ staff: person, from: shift.from, late: nowMin - shift.from });
  }
  return out;
}

/** Minutos de apertura de cada día que nadie cubre en el cuadrante. */
export function coverageGaps(
  ops: ProTablesOps,
  monday: string,
  hours: ({ open: number; close: number } | null)[],
): { date: string; uncovered: number }[] {
  return weekDates(monday)
    .map((date) => {
      const h = hours[weekdayIndex(date)];
      if (!h) return { date, uncovered: 0 };
      const shifts = ops.rota.filter((s) => s.date === date);
      let uncovered = 0;
      for (let m = h.open; m < h.close; m += 15) {
        if (!shifts.some((s) => s.from <= m && s.to > m)) uncovered += 15;
      }
      return { date, uncovered };
    })
    .filter((d) => d.uncovered > 0);
}

export function rotaMessage(
  ops: ProTablesOps,
  staff: ProStaff[],
  monday: string,
  spaceName: string,
): string {
  const lines = weekDates(monday).map((date) => {
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      timeZone: "Europe/Madrid",
    });
    const people = ops.rota
      .filter((s) => s.date === date)
      .sort((a, b) => a.from - b.from)
      .map((s) => {
        const name = staff.find((p) => p.id === s.staffId)?.name.split(" ")[0];
        return `${name ?? "?"} ${minutesToLabel(s.from)} a ${minutesToLabel(s.to % 1440)}`;
      });
    return `${day}: ${people.length ? people.join(", ") : "cerrado"}`;
  });
  return `Cuadrante de ${spaceName}, semana del ${Number(monday.slice(8))}:\n${lines.join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* Propinas y caja                                                     */
/* ------------------------------------------------------------------ */

/** Reparte el bote según los minutos trabajados. La suma cuadra al céntimo. */
export function splitTips(
  totalCents: number,
  minutes: { staffId: string; minutes: number }[],
): { staffId: string; minutes: number; cents: number }[] {
  const worked = minutes.filter((m) => m.minutes > 0);
  const sum = worked.reduce((a, m) => a + m.minutes, 0);
  if (!sum || totalCents <= 0)
    return minutes.map((m) => ({ ...m, cents: 0 }));
  const raw = worked.map((m) => ({
    ...m,
    exact: (totalCents * m.minutes) / sum,
  }));
  const out = raw.map((m) => ({ ...m, cents: Math.floor(m.exact) }));
  let left = totalCents - out.reduce((a, m) => a + m.cents, 0);
  // Los céntimos que sobran van a quien más decimales perdió.
  const order = [...out].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  );
  for (const m of order) {
    if (left <= 0) break;
    m.cents += 1;
    left -= 1;
  }
  return minutes.map((m) => {
    const found = out.find((o) => o.staffId === m.staffId);
    return { staffId: m.staffId, minutes: m.minutes, cents: found?.cents ?? 0 };
  });
}

export function closingTotals(closing: ProCashClosing) {
  const cashSales = closing.cashCents - closing.floatCents;
  return {
    totalCents: cashSales + closing.cardCents + closing.bizumCents,
    cashSalesCents: cashSales,
    diffCents:
      closing.expectedCashCents === null
        ? null
        : cashSales - closing.expectedCashCents,
  };
}

/** Lo que pasó por Franky Card en un día. */
export function cardDay(validations: ProValidation[], date: string) {
  const list = validations.filter((v) => localDate(v.at) === date);
  return {
    count: list.length,
    chargedCents: list.reduce((a, v) => a + v.amountCents - v.discountCents, 0),
    discountCents: list.reduce((a, v) => a + v.discountCents, 0),
    rewards: list.filter((v) => v.kind === "reward").length,
    people: new Set(list.map((v) => v.clientName)).size,
  };
}

/* ------------------------------------------------------------------ */
/* Partidos y eventos                                                  */
/* ------------------------------------------------------------------ */

export function eventStats(event: ProVenueEvent) {
  const people = event.bookings.reduce((a, b) => a + b.people, 0);
  return {
    people,
    free: Math.max(0, event.capacity - people),
    groups: event.bookings.length,
    depositsPaidCents: event.bookings
      .filter((b) => b.depositPaid)
      .reduce((a, b) => a + b.depositCents, 0),
    depositsPending: event.bookings.filter(
      (b) => b.depositCents > 0 && !b.depositPaid,
    ).length,
    /** Consumo mínimo comprometido por todas las reservas. */
    minimumCents: people * event.minimumSpendCents,
    arrived: event.bookings
      .filter((b) => b.arrived)
      .reduce((a, b) => a + b.people, 0),
  };
}

export function eventsOn(ops: ProTablesOps, date: string): ProVenueEvent[] {
  return ops.events
    .filter((e) => localDate(e.start) === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function upcomingEvents(
  ops: ProTablesOps,
  now: Date,
): ProVenueEvent[] {
  return ops.events
    .filter((e) => Date.parse(e.end) > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));
}

/* ------------------------------------------------------------------ */
/* Grupos con menú cerrado                                             */
/* ------------------------------------------------------------------ */

export const GROUP_STAGE_LABEL: Record<ProGroupDeal["stage"], string> = {
  quoted: "Presupuesto enviado",
  deposit: "Señal recibida",
  closed: "Número cerrado",
  served: "Servido",
};

export function dealFor(
  ops: ProTablesOps,
  requestId: string,
): ProGroupDeal | undefined {
  return ops.groupDeals.find((d) => d.requestId === requestId);
}

/** Recuento para cocina: cuántos de cada plato y qué alergias hay. */
export function choiceTally(menu: ProGroupMenu, deal: ProGroupDeal) {
  const courses = menu.courses.map((course, index) => {
    const counts = new Map<string, number>();
    for (const option of course.options) counts.set(option, 0);
    for (const choice of deal.choices) {
      const dish = choice.dishes[index];
      if (dish) counts.set(dish, (counts.get(dish) ?? 0) + 1);
    }
    return {
      label: course.label,
      counts: [...counts.entries()].map(([dish, n]) => ({ dish, n })),
    };
  });
  const people = deal.finalPeople ?? 0;
  return {
    courses,
    allergies: deal.choices
      .filter((c) => c.allergies?.trim())
      .map((c) => ({ name: c.name, allergies: c.allergies!.trim() })),
    answered: deal.choices.length,
    missing: Math.max(0, people - deal.choices.length),
  };
}

export function groupQuoteMessage(opts: {
  organizer: string;
  kind: string;
  people: number;
  dateLabel: string;
  menu?: ProGroupMenu;
  perPersonCents: number;
  depositCents: number;
  closeByLabel?: string;
  spaceName: string;
}): string {
  const first = opts.organizer.split(" ")[0];
  const lines = [
    `Hola ${first}, te escribimos de ${opts.spaceName} por vuestra ${opts.kind.toLowerCase()} (${opts.people} personas, ${opts.dateLabel}).`,
    `Precio: ${money(opts.perPersonCents)} por persona, ${money(opts.perPersonCents * opts.people, { round: true })} en total.`,
  ];
  if (opts.menu) {
    lines.push(`Menú ${opts.menu.name}:`);
    for (const course of opts.menu.courses)
      lines.push(`${course.label}: ${course.options.join(" o ")}`);
    if (opts.menu.includes) lines.push(`Incluye ${opts.menu.includes.toLowerCase()}.`);
  }
  if (opts.depositCents > 0)
    lines.push(
      `Para guardaros la fecha pedimos una señal de ${money(opts.depositCents, { round: true })} por Bizum o en el local.`,
    );
  if (opts.closeByLabel)
    lines.push(`El número final de personas lo cerramos el ${opts.closeByLabel}.`);
  lines.push("¿Os lo reservamos?");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Confirmaciones y reseñas                                            */
/* ------------------------------------------------------------------ */

/** El teléfono de una reserva: el de su ficha o el que se apuntó en la nota. */
export function bookingPhone(
  data: ProData,
  booking: ProBooking,
): string | undefined {
  const client = data.clients.find((c) => c.id === booking.clientId);
  if (client?.phone) return client.phone;
  const match = booking.note?.match(/(?:tel\.?|tlf\.?|teléfono)\s*([+\d][\d\s]{7,})/i);
  return match?.[1]?.trim();
}

export function confirmationMessage(
  booking: ProBooking,
  spaceName: string,
  today: string,
): string {
  const first = booking.clientName.split(" ")[0];
  const day =
    localDate(booking.start) === today
      ? "hoy"
      : localDate(booking.start) === addDays(today, 1)
        ? "mañana"
        : new Date(booking.start).toLocaleDateString("es-ES", {
            weekday: "long",
            day: "numeric",
            timeZone: "Europe/Madrid",
          });
  const hour = minutesToLabel(localMinutes(booking.start));
  return `Hola ${first}, te escribimos de ${spaceName} para confirmar tu reserva de ${day} a las ${hour} para ${booking.partySize} ${booking.partySize === 1 ? "persona" : "personas"}. ¿Nos confirmas que venís? Si no podéis, avísanos y liberamos la mesa. ¡Gracias!`;
}

export function waitlistReadyMessage(name: string, spaceName: string): string {
  return `Hola ${name.split(" ")[0]}, tu mesa en ${spaceName} ya está lista. Te esperamos en la entrada.`;
}

export function reviewMessage(
  name: string,
  spaceName: string,
  link: string,
): string {
  return `Hola ${name.split(" ")[0]}, gracias por venir a ${spaceName}. Si te gustó, nos ayudas mucho dejando tu opinión aquí: ${link}`;
}

export type ConfirmState = "pending" | "reminded" | "confirmed";

/** Reservas de hoy (aún por llegar) y de mañana que conviene confirmar. */
export function bookingsToConfirm(
  data: ProData,
  ops: ProTablesOps,
  now: Date,
): { booking: ProBooking; state: ConfirmState; phone?: string }[] {
  const today = localDate(now);
  const tomorrow = addDays(today, 1);
  return data.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        !isWaitlist(b) &&
        b.status === "confirmed" &&
        (localDate(b.start) === tomorrow ||
          (localDate(b.start) === today &&
            Date.parse(b.start) > now.getTime())),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((booking) => {
      const contact = ops.contacts.find((c) => c.bookingId === booking.id);
      const state: ConfirmState = contact?.confirmedAt
        ? "confirmed"
        : contact?.remindedAt
          ? "reminded"
          : "pending";
      return { booking, state, phone: bookingPhone(data, booking) };
    });
}

/** Veces que una persona no se ha presentado, por ficha, nombre o teléfono. */
export function noShowHistory(
  data: ProData,
  who: { clientId?: string; name?: string; phone?: string },
): number {
  const digits = (s?: string) => (s ?? "").replace(/\D/g, "").slice(-9);
  const phone = digits(who.phone);
  const client =
    data.clients.find((c) => c.id === who.clientId) ??
    data.clients.find(
      (c) =>
        (who.name && who.name.trim().length > 2 && sameName(c.name, who.name)) ||
        (phone.length === 9 && digits(c.phone) === phone),
    );
  const fromBookings = data.bookings.filter(
    (b) =>
      b.status === "no_show" &&
      ((client && b.clientId === client.id) ||
        (who.name && who.name.trim().length > 2 && sameName(b.clientName, who.name))),
  ).length;
  return Math.max(client?.noShows ?? 0, fromBookings);
}

/* ------------------------------------------------------------------ */
/* Unir mesas                                                          */
/* ------------------------------------------------------------------ */

/**
 * Combinaciones de dos o tres mesas libres de la misma zona que juntas
 * sientan al grupo. Primero las que menos sillas desperdician.
 */
export function joinOptions(
  data: ProData,
  date: string,
  from: number,
  duration: number,
  party: number,
  /** Reserva que se está moviendo: sus propias mesas cuentan como libres. */
  ignoreId?: string,
): ProTable[][] {
  const free = reservableTables(data).filter((t) =>
    tableFree(data, t.id, date, from, from + duration, ignoreId, 1),
  );
  const options: ProTable[][] = [];
  const zones = [...new Set(free.map((t) => t.zone))];
  for (const zone of zones) {
    const list = free.filter((t) => t.zone === zone);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const pair = [list[i], list[j]];
        if (seats(pair) >= party) options.push(pair);
        for (let k = j + 1; k < list.length; k++) {
          const trio = [list[i], list[j], list[k]];
          if (seats(pair) < party && seats(trio) >= party) options.push(trio);
        }
      }
    }
  }
  return options
    .sort(
      (a, b) =>
        seats(a) - party - (seats(b) - party) || a.length - b.length,
    )
    .slice(0, 4);
}

function seats(list: ProTable[]): number {
  return list.reduce((a, t) => a + t.seats, 0);
}

/* ------------------------------------------------------------------ */
/* Cafetería: habituales, estudio y horas valle                        */
/* ------------------------------------------------------------------ */

/** Última vez que se le vio: ficha o su última validación. */
export function lastSeen(data: ProData, client: ProClient): string | undefined {
  const lastValidation = data.validations
    .filter((v) => v.clientName === client.name)
    .reduce<string | undefined>(
      (max, v) => (!max || v.at > max ? v.at : max),
      undefined,
    );
  if (!client.lastVisit) return lastValidation;
  if (!lastValidation) return client.lastVisit;
  return lastValidation > client.lastVisit ? lastValidation : client.lastVisit;
}

/** Habituales (muchas visitas) que llevan `days` días sin aparecer. */
export function dormantRegulars(
  data: ProData,
  now: Date,
  days = 14,
  minVisits = 8,
): { client: ProClient; lastSeen: string; daysAway: number }[] {
  return data.clients
    .filter((c) => c.visits >= minVisits && c.phone && c.marketingConsent)
    .map((client) => {
      const seen = lastSeen(data, client);
      const daysAway = seen
        ? Math.floor((now.getTime() - Date.parse(seen)) / 86_400_000)
        : 0;
      return { client, lastSeen: seen ?? "", daysAway };
    })
    .filter((x) => x.lastSeen && x.daysAway >= days)
    .sort((a, b) => b.client.visits - a.client.visits);
}

export function comebackMessage(name: string, spaceName: string): string {
  return `Hola ${name.split(" ")[0]}, hace días que no te vemos por ${spaceName}. El próximo café te lo guardamos con tu tarjeta de sellos. ¡Te esperamos!`;
}

/** Cumpleaños en los próximos 7 días (formato AAAA-MM-DD o MM-DD). */
export function birthdaysSoon(
  clients: ProClient[],
  today: string,
  days = 7,
): { client: ProClient; inDays: number }[] {
  const out: { client: ProClient; inDays: number }[] = [];
  for (let i = 0; i < days; i++) {
    const md = addDays(today, i).slice(5);
    for (const client of clients) {
      if (client.birthday && client.birthday.slice(-5) === md)
        out.push({ client, inDays: i });
    }
  }
  return out;
}

/** Radar de septiembre: estudiantes nuevos en las primeras semanas de curso. */
export function septemberRadar(data: ProData, now: Date) {
  const today = localDate(now);
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  if (!(month === 9 || (month === 10 && day <= 15))) return null;
  const since = addDays(today, -21);
  const fresh = data.clients.filter(
    (c) => c.student && localDate(c.createdAt) >= since,
  );
  return {
    newStudents: fresh.length,
    repeat: fresh.filter((c) => c.visits >= 2).length,
    cardMembers: fresh.filter((c) => c.cardMember).length,
  };
}

/**
 * Horas valle a partir del historial: validaciones por hora de los mismos
 * días de la semana (laborables o fin de semana) de las dos últimas semanas.
 * Si la tarde queda por debajo del 40 % de la hora punta, se sugiere llenarla.
 */
export function valleySuggestion(
  validations: ProValidation[],
  now: Date,
  window: { from: number; to: number } = { from: 16 * 60, to: 19 * 60 },
) {
  const today = localDate(now);
  const weekend = weekdayIndex(today) >= 5;
  const perHour = new Map<number, number>();
  const sampled = new Set<string>();
  for (const v of validations) {
    const date = localDate(v.at);
    if (date >= today || date < addDays(today, -14)) continue;
    if (weekdayIndex(date) >= 5 !== weekend) continue;
    sampled.add(date);
    const hour = Math.floor(localMinutes(v.at) / 60);
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }
  if (sampled.size < 3) return null;
  const avg = (h: number) => (perHour.get(h) ?? 0) / sampled.size;
  let peakHour = 0;
  for (const h of perHour.keys()) if (avg(h) > avg(peakHour)) peakHour = h;
  const hours: number[] = [];
  for (let h = window.from / 60; h < window.to / 60; h++) hours.push(h);
  const afternoon = hours.reduce((a, h) => a + avg(h), 0) / hours.length;
  const peak = avg(peakHour);
  if (peak <= 0 || afternoon > peak * 0.4) return null;
  return {
    from: window.from,
    to: window.to,
    perHour: Math.round(afternoon * 10) / 10,
    peakPerHour: Math.round(peak * 10) / 10,
    peakHour,
    byHour: Array.from({ length: 14 }, (_, i) => ({
      hour: 7 + i,
      value: Math.round(avg(7 + i) * 10) / 10,
    })),
  };
}

export const STUDY_RULE_LABEL: Record<ProStudySettings["rule"], string> = {
  none: "Sin consumición mínima",
  one: "Una consumición al llegar",
  every2h: "Una consumición cada dos horas",
};

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function studyStatus(settings: ProStudySettings, now: Date) {
  const nowMin = localMinutes(now);
  const weekday = weekdayIndex(localDate(now));
  const open =
    settings.enabled &&
    nowMin >= settings.fromMinute &&
    nowMin < settings.toMinute;
  return {
    open,
    free: Math.max(0, settings.seats - settings.occupied),
    laptopsToday: !settings.noLaptopDays.includes(weekday),
    rules: [
      `De ${minutesToLabel(settings.fromMinute)} a ${minutesToLabel(settings.toMinute)}`,
      STUDY_RULE_LABEL[settings.rule],
      settings.plugs > 0 ? `${settings.plugs} enchufes` : "Sin enchufes",
      settings.wifi ? "Wifi" : "Sin wifi",
      settings.noLaptopDays.length
        ? `Sin portátiles: ${settings.noLaptopDays.map((d) => WEEKDAYS[d]).join(", ")}`
        : "Portátiles bienvenidos",
    ],
  };
}

export function usualFor(
  ops: ProTablesOps,
  clientName: string,
): string | undefined {
  return ops.usuals.find((u) => sameName(u.clientName, clientName))?.order;
}

/** Pendientes del cierre del día: lo que conviene no dejar para mañana. */
export function closingChecklist(ops: ProTablesOps, date: string) {
  const close = haccpMoment(ops, date, "cierre");
  return {
    haccpPending: close.pending,
    wasteLogged: ops.waste.some((w) => w.date === date),
    shoppingLines: ops.shopping.length,
    closed: ops.closings.some((c) => c.date === date),
  };
}

