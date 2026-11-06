/**
 * Operación del motor de noche más allá de las entradas: consumo de
 * reservados, apartados que caducan, taquilla, aforo, cierre de caja, cuenta
 * de la noche, recuento de barra, pedidos, turnos, incidencias, vetados,
 * previsión, happy hour, cumpleaños y noches que se repiten.
 *
 * Todo son funciones puras sobre `ProData` y `ProNightOps`: la web y la app
 * nativa cuentan igual, y los tests no necesitan pantallas.
 */
import type {
  ProClient,
  ProData,
  ProEvent,
  ProOffer,
  ProPromoter,
  ProSpace,
  ProStaff,
  ProZone,
  ToneKey,
} from "./types";
import type {
  ProBan,
  ProIncidentKind,
  ProNightClose,
  ProNightCostKind,
  ProNightIncident,
  ProNightOps,
  ProPlannedShift,
  ProRotaRole,
  ProStockItem,
  ProStockUnit,
  ProSupplier,
  ProZoneBill,
  ProZoneTabLine,
} from "./night-types";
import {
  addDays,
  atLocal,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  shortDay,
  weekdayIndex,
} from "./format";
import {
  eventPhase,
  eventStats,
  guestsOf,
  nightOf,
  pastEvents,
  promoterNights,
  promoterTotals,
  ruleLabel,
  sortedEvents,
} from "./night";

/* ------------------------------------------------------------------ */
/* Contenedor                                                          */
/* ------------------------------------------------------------------ */

export const EMPTY_NIGHT_OPS: ProNightOps = {
  zoneBills: [],
  doorSales: [],
  doorMoves: [],
  closes: [],
  stockItems: [],
  stockCounts: [],
  suppliers: [],
  orders: [],
  rota: [],
  incidents: [],
  bans: [],
  reviewAsks: [],
  karaoke: [],
  invites: [],
  noShows: [],
  settings: { peoplePerBartender: 60 },
};

/** Los datos de operación de la noche, con listas vacías si aún no existen. */
export function nightOpsOf(data: Pick<ProData, "nightOps">): ProNightOps {
  const ops = data.nightOps;
  if (!ops) return EMPTY_NIGHT_OPS;
  return {
    ...EMPTY_NIGHT_OPS,
    ...ops,
    settings: { ...EMPTY_NIGHT_OPS.settings, ...ops.settings },
  };
}

/** Aplica un cambio a `nightOps` y devuelve los datos nuevos (para `update`). */
export function withNightOps(
  data: ProData,
  fn: (ops: ProNightOps) => ProNightOps,
): ProData {
  return { ...data, nightOps: fn(nightOpsOf(data)) };
}

function sum<T>(list: T[], fn: (item: T) => number): number {
  return list.reduce((acc, item) => acc + fn(item), 0);
}

/* ------------------------------------------------------------------ */
/* Consumo de reservados                                               */
/* ------------------------------------------------------------------ */

export function zoneTab(zone: ProZone) {
  const lines = zone.tab ?? [];
  const consumedCents = sum(lines, (l) => l.priceCents * l.qty);
  const minimumCents = zone.minimumSpendCents;
  // La señal solo se descuenta si está cobrada (reservado o ya dentro).
  const depositCents =
    zone.status === "booked" || zone.status === "arrived" ? zone.depositCents : 0;
  // Se cobra lo consumido, pero nunca menos que el consumo mínimo.
  const billCents = Math.max(consumedCents, minimumCents);
  return {
    lines,
    consumedCents,
    minimumCents,
    missingCents: Math.max(0, minimumCents - consumedCents),
    depositCents,
    billCents,
    dueCents: Math.max(0, billCents - depositCents),
    progress: minimumCents
      ? Math.min(100, Math.round((consumedCents / minimumCents) * 100))
      : 100,
    reached: consumedCents >= minimumCents,
  };
}

/** Suma una línea al consumo; si es el mismo producto, suma la cantidad. */
export function addToTab(zone: ProZone, line: ProZoneTabLine): ProZone {
  const tab = zone.tab ?? [];
  const same = line.itemId
    ? tab.find((l) => l.itemId === line.itemId && l.priceCents === line.priceCents)
    : undefined;
  if (same) {
    return {
      ...zone,
      tab: tab.map((l) => (l.id === same.id ? { ...l, qty: l.qty + line.qty, at: line.at } : l)),
    };
  }
  return { ...zone, tab: [...tab, line] };
}

/** Resta una unidad de una línea (y la quita si llega a cero). */
export function removeFromTab(zone: ProZone, lineId: string): ProZone {
  const tab = (zone.tab ?? [])
    .map((l) => (l.id === lineId ? { ...l, qty: l.qty - 1 } : l))
    .filter((l) => l.qty > 0);
  return { ...zone, tab };
}

/** La cuenta cerrada de un reservado en un evento, si ya se cerró. */
export function zoneBillFor(ops: ProNightOps, zone: ProZone): ProZoneBill | null {
  return (
    ops.zoneBills.find(
      (b) => b.zoneId === zone.id && (b.eventId ?? null) === (zone.eventId ?? null),
    ) ?? null
  );
}

/** Cierra la cuenta: guarda el resumen y deja el consumo a cero. */
export function closeZoneBill(
  data: ProData,
  zoneId: string,
  by: string,
  at: string,
  id: string,
): ProData {
  const zone = data.zones.find((z) => z.id === zoneId);
  if (!zone) return data;
  const t = zoneTab(zone);
  const bill: ProZoneBill = {
    id,
    zoneId: zone.id,
    zoneName: zone.name,
    eventId: zone.eventId,
    bookedBy: zone.bookedBy ?? zone.name,
    people: zone.people ?? 0,
    minimumCents: t.minimumCents,
    consumedCents: t.consumedCents,
    depositCents: t.depositCents,
    dueCents: t.dueCents,
    closedAt: at,
    by,
  };
  const next = withNightOps(data, (ops) => ({ ...ops, zoneBills: [...ops.zoneBills, bill] }));
  return {
    ...next,
    zones: next.zones.map((z) => (z.id === zone.id ? { ...z, tab: [] } : z)),
  };
}

/* ------------------------------------------------------------------ */
/* Apartados con caducidad                                             */
/* ------------------------------------------------------------------ */

export function holdExpired(zone: ProZone, now: Date): boolean {
  return (
    zone.status === "held" &&
    Boolean(zone.holdUntil) &&
    new Date(zone.holdUntil as string).getTime() <= now.getTime()
  );
}

export function freeZone(zone: ProZone): ProZone {
  return {
    ...zone,
    status: "free",
    bookedBy: undefined,
    people: undefined,
    birthday: undefined,
    phone: undefined,
    note: undefined,
    holdUntil: undefined,
    tab: undefined,
  };
}

/** Libera los apartados sin señal cuya hora ya ha pasado. */
export function releaseExpiredHolds(data: ProData, now: Date) {
  const released = data.zones.filter((z) => holdExpired(z, now));
  if (!released.length) return { data, released };
  const ids = new Set(released.map((z) => z.id));
  return {
    data: { ...data, zones: data.zones.map((z) => (ids.has(z.id) ? freeZone(z) : z)) },
    released,
  };
}

/** Opciones de "si no paga la señal, se libera...". */
export function holdChoices(now: Date, ev?: ProEvent | null) {
  const out: { value: string; label: string }[] = [];
  const inHours = (h: number) => new Date(now.getTime() + h * 3600000).toISOString();
  out.push({ value: inHours(1), label: "En 1 hora" });
  out.push({ value: inHours(3), label: "En 3 horas" });
  if (ev) {
    // Dos horas antes de abrir: da tiempo a ofrecer la zona a otro grupo.
    const before = new Date(new Date(ev.doorsOpen).getTime() - 2 * 3600000);
    if (before.getTime() > now.getTime() + 3 * 3600000) {
      out.push({ value: before.toISOString(), label: `${shortDay(before.toISOString())}, ${minutesToLabel(localMinutes(before))}` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Puerta: taquilla, precio tras el corte y aforo                      */
/* ------------------------------------------------------------------ */

export const PAY_METHOD_LABEL = { cash: "Efectivo", card: "Tarjeta" } as const;

export function doorTotals(ops: ProNightOps, eventId: string) {
  const sales = ops.doorSales.filter((s) => s.eventId === eventId);
  const cash = sales.filter((s) => s.method === "cash");
  const card = sales.filter((s) => s.method === "card");
  return {
    sales,
    count: sales.length,
    cashCents: sum(cash, (s) => s.cents),
    cardCents: sum(card, (s) => s.cents),
    totalCents: sum(sales, (s) => s.cents),
    afterCutoff: sales.filter((s) => s.afterCutoff).length,
  };
}

/** Tramo de taquilla que se vende ahora en puerta, si queda. */
export function doorTier(ev: ProEvent) {
  return ev.tiers.find((t) => t.until === null && t.sold < t.quantity) ?? null;
}

/** Lo que paga quien viene en lista y llega tarde: su precio propio o la taquilla. */
export function afterCutoffPrice(ev: ProEvent): number | null {
  if (typeof ev.afterCutoffCents === "number") return ev.afterCutoffCents;
  return doorTier(ev)?.priceCents ?? null;
}

export type CapacityLevel = "ok" | "high" | "full";

/** Aviso al 90 % del aforo de licencia y bloqueo al 100 %. */
export function capacityState(ev: ProEvent) {
  const pct = ev.capacity ? Math.round((ev.checkedIn / ev.capacity) * 100) : 0;
  const level: CapacityLevel = ev.checkedIn >= ev.capacity ? "full" : pct >= 90 ? "high" : "ok";
  return { level, pct, left: Math.max(0, ev.capacity - ev.checkedIn) };
}

export type OccupancyRow = { from: string; entries: number; exits: number; inside: number };

/**
 * Registro de aforo cada 15 minutos desde la apertura: entradas escaneadas y
 * pulsaciones de Entra y Sale. Sirve para enseñarlo en una inspección.
 */
export function occupancyLog(data: ProData, ev: ProEvent, now: Date, bucketMinutes = 15): OccupancyRow[] {
  const start = new Date(ev.doorsOpen).getTime();
  const end = Math.min(now.getTime(), new Date(ev.closes).getTime());
  if (end <= start) return [];
  const step = bucketMinutes * 60000;
  const buckets = Math.ceil((end - start) / step);
  const rows = Array.from({ length: buckets }, (_, i) => ({
    from: new Date(start + i * step).toISOString(),
    entries: 0,
    exits: 0,
    inside: 0,
  }));
  // Lo que pasó antes de abrir cuenta en la primera franja y lo de después
  // del cierre en la última; lo que aún no ha pasado no cuenta.
  const slot = (iso: string) => {
    const t = new Date(iso).getTime();
    if (t > now.getTime()) return -1;
    return Math.max(0, Math.min(buckets - 1, Math.floor((t - start) / step)));
  };
  for (const g of guestsOf(data, ev.id)) {
    if (!g.checkedInAt) continue;
    const i = slot(g.checkedInAt);
    if (i >= 0) rows[i].entries++;
  }
  for (const m of nightOpsOf(data).doorMoves) {
    if (m.eventId !== ev.id) continue;
    const i = slot(m.at);
    if (i < 0) continue;
    if (m.delta > 0) rows[i].entries++;
    else rows[i].exits++;
  }
  let inside = 0;
  for (const r of rows) {
    inside = Math.max(0, inside + r.entries - r.exits);
    r.inside = inside;
  }
  return rows;
}

export function peakInside(rows: OccupancyRow[]): { inside: number; at: string | null } {
  return rows.reduce<{ inside: number; at: string | null }>(
    (best, r) => (r.inside > best.inside ? { inside: r.inside, at: r.from } : best),
    { inside: 0, at: null },
  );
}

/* ------------------------------------------------------------------ */
/* Cierre de caja                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cuadre de una noche. En efectivo se espera el fondo, lo cobrado en barra
 * según el TPV y la taquilla cobrada en efectivo. Con tarjeta, lo del TPV más
 * la taquilla con tarjeta. Positivo: sobra dinero. Negativo: falta.
 */
export function closeMath(
  close: Pick<
    ProNightClose,
    "floatCents" | "tpvCashCents" | "tpvCardCents" | "cashCountedCents" | "cardCountedCents"
  >,
  door: { cashCents: number; cardCents: number },
) {
  const expectedCashCents = close.floatCents + close.tpvCashCents + door.cashCents;
  const expectedCardCents = close.tpvCardCents + door.cardCents;
  const cashDiffCents = close.cashCountedCents - expectedCashCents;
  const cardDiffCents = close.cardCountedCents - expectedCardCents;
  return {
    expectedCashCents,
    expectedCardCents,
    cashDiffCents,
    cardDiffCents,
    diffCents: cashDiffCents + cardDiffCents,
    salesCents: close.tpvCashCents + close.tpvCardCents + door.cashCents + door.cardCents,
  };
}

/** Cantidad con signo para descuadres: "+2 €", "-18,50 €", "Cuadra". */
export function diffLabel(cents: number): string {
  if (cents === 0) return "Cuadra";
  return `${cents > 0 ? "+" : "-"}${money(Math.abs(cents))}`;
}

/** Menos de 1 € es cuadrar; hasta 10 €, aviso; más, alarma. */
export function diffTone(cents: number): "success" | "warning" | "danger" {
  const abs = Math.abs(cents);
  if (abs < 100) return "success";
  if (abs <= 1000) return "warning";
  return "danger";
}

/** "Jue 24 sept." con mayúscula: el nombre de una noche en listas y títulos. */
export function nightTitle(night: string): string {
  const label = shortDay(atLocal(night, 12 * 60));
  return label ? label[0].toUpperCase() + label.slice(1) : label;
}

/** Cómo vende la barra esta noche frente a la media de las mismas noches anteriores. */
export function barCompareLabel(barCents: number, previous: ProNightClose[]): string {
  if (!previous.length) return "no tiene con qué compararse";
  const avg = sum(previous, (c) => c.tpvCashCents + c.tpvCardCents) / previous.length;
  if (!avg) return "no tiene con qué compararse";
  const pct = Math.round(((barCents - avg) / avg) * 100);
  if (Math.abs(pct) < 3) return "vende en barra lo mismo que la media de esas noches";
  return pct > 0
    ? `vende en barra un ${pct} % más que la media de esas noches`
    : `vende en barra un ${Math.abs(pct)} % menos que la media de esas noches`;
}

export function closeForNight(ops: ProNightOps, night: string): ProNightClose | null {
  return ops.closes.find((c) => c.night === night) ?? null;
}

/** Los cierres del mismo día de la semana, de más reciente a más antiguo. */
export function sameWeekdayCloses(ops: ProNightOps, night: string, limit = 4): ProNightClose[] {
  const wd = weekdayIndex(night);
  return ops.closes
    .filter((c) => c.night < night && weekdayIndex(c.night) === wd)
    .sort((a, b) => b.night.localeCompare(a.night))
    .slice(0, limit);
}

/** El evento de una noche concreta (el primero que abre esa fecha). */
export function eventOfNight(data: ProData, night: string): ProEvent | null {
  return sortedEvents(data).find((e) => e.status !== "draft" && e.date === night) ?? null;
}

/** Noches que se pueden cerrar: la de hoy (o la que acaba de terminar) y las anteriores sin cerrar. */
export function closableNights(data: ProData, now: Date, days = 14): string[] {
  const ops = nightOpsOf(data);
  const today = nightOf(now);
  const out: string[] = [];
  for (let d = 0; d <= days; d++) {
    const night = addDays(today, -d);
    const ev = eventOfNight(data, night);
    const open = data.space.hours[weekdayIndex(night)];
    if (!ev && !open) continue;
    if (d === 0 && ev && eventPhase(ev, now) === "upcoming") continue;
    if (!closeForNight(ops, night)) out.push(night);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cuenta de la noche                                                  */
/* ------------------------------------------------------------------ */

export const COST_KIND_LABEL: Record<ProNightCostKind, string> = {
  dj: "DJ y artistas",
  security: "Seguridad",
  staff: "Personal extra",
  ads: "Publicidad",
  other: "Otros",
};

export function nightAccount(data: ProData, ev: ProEvent) {
  const ops = nightOpsOf(data);
  const onlineCents = sum(
    ev.tiers.filter((t) => t.until !== null),
    (t) => t.sold * t.priceCents,
  );
  // Taquilla: lo cobrado con su forma de pago y, si hay ventas sin registrar
  // (noches anteriores a esta versión), su precio de tramo.
  const door = doorTotals(ops, ev.id);
  const untracked = sum(
    ev.tiers.filter((t) => t.until === null),
    (t) => Math.max(0, t.sold - door.sales.filter((s) => s.tierName === t.name).length) * t.priceCents,
  );
  const doorCents = door.totalCents + untracked;
  const zones = data.zones.filter((z) => z.eventId === ev.id && (z.status === "booked" || z.status === "arrived"));
  const bills = ops.zoneBills.filter((b) => b.eventId === ev.id);
  const billedZoneIds = new Set(bills.map((b) => b.zoneId));
  const depositsCents =
    sum(bills, (b) => b.depositCents) +
    sum(zones.filter((z) => !billedZoneIds.has(z.id)), (z) => z.depositCents);
  const close = closeForNight(ops, ev.date);
  const barCents = close ? close.tpvCashCents + close.tpvCardCents : null;
  const commissionsCents = sum(data.promoters, (p) => promoterTotals(data, p, ev.id).commissionCents);
  const costs = ev.costs ?? [];
  const costsCents = sum(costs, (c) => c.cents);
  const incomeCents = onlineCents + doorCents + depositsCents + (barCents ?? 0);
  return {
    onlineCents,
    doorCents,
    doorCashCents: door.cashCents,
    doorCardCents: door.cardCents,
    depositsCents,
    barCents,
    incomeCents,
    commissionsCents,
    costs,
    costsCents,
    resultCents: incomeCents - commissionsCents - costsCents,
    frankyFeeCents: eventStats(data, ev).frankyFeeCents,
  };
}

/** Noche a noche: las últimas noches terminadas con sus cifras clave. */
export function nightsReport(data: ProData, now: Date, limit = 8) {
  const ops = nightOpsOf(data);
  return pastEvents(data, now)
    .slice(0, limit)
    .map((ev) => {
      const account = nightAccount(data, ev);
      const close = closeForNight(ops, ev.date);
      const door = doorTotals(ops, ev.id);
      const peak = peakInside(occupancyLog(data, ev, now));
      return {
        event: ev,
        people: ev.checkedIn,
        fillPct: ev.capacity ? Math.round((ev.checkedIn / ev.capacity) * 100) : 0,
        peak: peak.inside,
        ticketsCents: account.onlineCents + account.doorCents,
        depositsCents: account.depositsCents,
        barCents: account.barCents,
        resultCents: account.resultCents,
        closeDiffCents: close ? closeMath(close, door).diffCents : null,
        incidents: ops.incidents.filter((i) => i.night === ev.date).length,
      };
    });
}

type NightReportRow = ReturnType<typeof nightsReport>[number];

function euroCell(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/** Filas del CSV "noche a noche" para la gestoría (importes con coma decimal). */
export function nightsReportRows(report: NightReportRow[]): string[][] {
  return [
    [
      "Noche",
      "Fecha",
      "Personas",
      "Aforo (%)",
      "Pico dentro",
      "Entradas y taquilla (€)",
      "Señales (€)",
      "Barra (€)",
      "Descuadre (€)",
      "Resultado (€)",
      "Incidencias",
    ],
    ...report.map((r) => [
      r.event.name,
      r.event.date,
      String(r.people),
      String(r.fillPct),
      String(r.peak),
      euroCell(r.ticketsCents),
      euroCell(r.depositsCents),
      euroCell(r.barCents),
      euroCell(r.closeDiffCents),
      euroCell(r.resultCents),
      String(r.incidents),
    ]),
  ];
}

/** Resumen de la semana para mandarlo por WhatsApp al socio o al encargado. */
export function nightsReportMessage(space: Pick<ProSpace, "name">, report: NightReportRow[]): string {
  if (!report.length) return `${space.name}: aún no hay noches terminadas.`;
  const lines = report.map((r) => {
    const diff =
      r.closeDiffCents === null
        ? "sin cierre"
        : Math.abs(r.closeDiffCents) < 100
          ? "caja cuadrada"
          : `descuadre de ${r.closeDiffCents > 0 ? "+" : "-"}${money(Math.abs(r.closeDiffCents))}`;
    return `- ${r.event.name} (${shortDay(r.event.doorsOpen)}): ${r.people} personas, resultado ${money(r.resultCents, { round: true })}, ${diff}`;
  });
  const people = sum(report, (r) => r.people);
  const result = sum(report, (r) => r.resultCents);
  return [
    `${space.name}, noche a noche:`,
    ...lines,
    `Total: ${people} personas y ${money(result, { round: true })} de resultado.`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Barra: recuento, mermas y pedidos                                   */
/* ------------------------------------------------------------------ */

const UNIT_PLURAL: Record<ProStockUnit, [string, string]> = {
  botella: ["botella", "botellas"],
  barril: ["barril", "barriles"],
  caja: ["caja", "cajas"],
  unidad: ["unidad", "unidades"],
};

export function unitLabel(unit: ProStockUnit, qty: number): string {
  const [one, many] = UNIT_PLURAL[unit];
  const n = Math.round(qty * 100) / 100;
  return `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;
}

/** Paso de los botones más y menos: las botellas y los barriles se cuentan por cuartos. */
export function countStep(unit: ProStockUnit): number {
  return unit === "botella" || unit === "barril" ? 0.25 : 1;
}

export function sortedCounts(ops: ProNightOps) {
  return [...ops.stockCounts].sort((a, b) => a.at.localeCompare(b.at));
}

function receivedBetween(ops: ProNightOps, itemId: string, fromIso: string | null, toIso: string | null): number {
  return sum(
    ops.orders.filter(
      (o) =>
        o.status === "received" &&
        o.receivedAt &&
        (!fromIso || o.receivedAt > fromIso) &&
        (!toIso || o.receivedAt <= toIso),
    ),
    (o) => sum(o.lines.filter((l) => l.itemId === itemId), (l) => l.qty),
  );
}

/** Nivel actual: el último recuento más lo recibido después. */
export function stockLevel(ops: ProNightOps, itemId: string): number | null {
  const counts = sortedCounts(ops);
  const last = counts[counts.length - 1];
  if (!last || typeof last.counts[itemId] !== "number") return null;
  return last.counts[itemId] + receivedBetween(ops, itemId, last.at, null);
}

/** Lo que bajó cada producto entre dos recuentos seguidos (teniendo en cuenta lo recibido). */
export function usageSeries(ops: ProNightOps, itemId: string): number[] {
  const counts = sortedCounts(ops).filter((c) => typeof c.counts[itemId] === "number");
  const out: number[] = [];
  for (let i = 1; i < counts.length; i++) {
    const prev = counts[i - 1];
    const cur = counts[i];
    const used = prev.counts[itemId] + receivedBetween(ops, itemId, prev.at, cur.at) - cur.counts[itemId];
    out.push(Math.round(used * 100) / 100);
  }
  return out;
}

export type StockRow = {
  item: ProStockItem;
  level: number | null;
  lastUsed: number | null;
  avgUsed: number | null;
  /** Bajó bastante más que en los recuentos anteriores: posible merma. */
  unusual: boolean;
  below: boolean;
};

export function stockRows(ops: ProNightOps): StockRow[] {
  return ops.stockItems.map((item) => {
    const series = usageSeries(ops, item.id);
    const lastUsed = series.length ? series[series.length - 1] : null;
    const previous = series.slice(0, -1);
    const avgUsed = previous.length ? sum(previous, (n) => n) / previous.length : null;
    const level = stockLevel(ops, item.id);
    const unusual =
      lastUsed !== null &&
      avgUsed !== null &&
      previous.length >= 2 &&
      lastUsed >= avgUsed * 1.5 &&
      lastUsed - avgUsed >= 1;
    return {
      item,
      level,
      lastUsed,
      avgUsed: avgUsed === null ? null : Math.round(avgUsed * 100) / 100,
      unusual,
      below: level !== null && level < item.par,
    };
  });
}

/** Coste de lo que bajó de más respecto a lo normal, en los productos marcados. */
export function unusualCostCents(rows: StockRow[]): number {
  return Math.round(
    sum(
      rows.filter((r) => r.unusual),
      (r) => ((r.lastUsed ?? 0) - (r.avgUsed ?? 0)) * r.item.costCents,
    ),
  );
}

export type OrderLine = { item: ProStockItem; qty: number; packs: number };

/**
 * Pedido propuesto: lo que está por debajo del mínimo, hasta el nivel
 * objetivo, redondeado a cajas completas. No repite lo que ya está pedido.
 */
export function suggestedOrder(ops: ProNightOps): { supplier: ProSupplier; lines: OrderLine[] }[] {
  const pending = new Set(
    ops.orders.filter((o) => o.status === "sent").flatMap((o) => o.lines.map((l) => l.itemId)),
  );
  const bySupplier = new Map<string, OrderLine[]>();
  for (const item of ops.stockItems) {
    if (pending.has(item.id)) continue;
    const level = stockLevel(ops, item.id);
    if (level === null || level >= item.par) continue;
    const need = Math.max(0, item.target - level);
    const packs = Math.max(1, Math.ceil(need / Math.max(1, item.packSize)));
    const lines = bySupplier.get(item.supplierId) ?? [];
    lines.push({ item, qty: packs * item.packSize, packs });
    bySupplier.set(item.supplierId, lines);
  }
  return ops.suppliers
    .filter((s) => bySupplier.has(s.id))
    .map((supplier) => ({ supplier, lines: bySupplier.get(supplier.id) as OrderLine[] }));
}

export function orderMessage(
  space: Pick<ProSpace, "name" | "owner">,
  supplier: ProSupplier,
  lines: { item: ProStockItem; qty: number }[],
): string {
  const rows = lines.map((l) => `- ${unitLabel(l.item.unit, l.qty)} de ${l.item.name}`);
  return [
    `Hola ${supplier.contact.split(" ")[0]}, soy ${space.owner.firstName} de ${space.name}.`,
    "Para esta semana os pido:",
    ...rows,
    "¿Me confirmas cuándo lo traéis? Gracias.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Turnos de las noches                                                */
/* ------------------------------------------------------------------ */

export const ROTA_ROLES: Record<ProRotaRole, { label: string; tone: ToneKey }> = {
  barra: { label: "Barra", tone: "sky" },
  puerta: { label: "Puerta", tone: "slate" },
  taquilla: { label: "Taquilla", tone: "amber" },
  karaoke: { label: "Karaoke", tone: "rose" },
  cabina: { label: "Cabina", tone: "violet" },
  guardarropa: { label: "Guardarropa", tone: "teal" },
  encargado: { label: "Encargado", tone: "emerald" },
};

/** Minutos de un turno, aunque cruce la medianoche. */
export function shiftMinutes(s: Pick<ProPlannedShift, "fromMinute" | "toMinute">): number {
  const to = s.toMinute <= s.fromMinute ? s.toMinute + 24 * 60 : s.toMinute;
  return to - s.fromMinute;
}

export function shiftLabel(s: Pick<ProPlannedShift, "fromMinute" | "toMinute">): string {
  return `${minutesToLabel(s.fromMinute)} a ${minutesToLabel(s.toMinute % (24 * 60))}`;
}

export function weekStartOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** Noches que abre el local en la semana que empieza en `weekStart` (lunes). */
export function openNightsOfWeek(space: Pick<ProSpace, "hours">, weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d) => space.hours[weekdayIndex(d)] !== null && space.hours[weekdayIndex(d)] !== undefined,
  );
}

export function rotaOf(ops: ProNightOps, night: string, staffId?: string): ProPlannedShift[] {
  return ops.rota
    .filter((s) => s.night === night && (!staffId || s.staffId === staffId))
    .sort((a, b) => a.fromMinute - b.fromMinute);
}

export function rotaMinutesByStaff(ops: ProNightOps, nights: string[]): Record<string, number> {
  const set = new Set(nights);
  const out: Record<string, number> = {};
  for (const s of ops.rota) {
    if (!set.has(s.night)) continue;
    out[s.staffId] = (out[s.staffId] ?? 0) + shiftMinutes(s);
  }
  return out;
}

/** Noches a las que les falta alguien en un puesto imprescindible. */
export function rotaGaps(ops: ProNightOps, nights: string[], needed: ProRotaRole[] = ["barra", "puerta"]) {
  return nights
    .map((night) => {
      const roles = new Set(rotaOf(ops, night).map((s) => s.role));
      return { night, missing: needed.filter((r) => !roles.has(r)) };
    })
    .filter((g) => g.missing.length > 0);
}

/** Copia los turnos de la semana anterior a la semana que empieza en `weekStart`. */
export function copyPreviousWeek(ops: ProNightOps, weekStart: string, makeId: () => string): ProPlannedShift[] {
  const prevStart = addDays(weekStart, -7);
  const prevDates = new Set(Array.from({ length: 7 }, (_, i) => addDays(prevStart, i)));
  const thisDates = new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  const kept = ops.rota.filter((s) => !thisDates.has(s.night));
  const copied = ops.rota
    .filter((s) => prevDates.has(s.night))
    .map((s) => ({ ...s, id: makeId(), night: addDays(s.night, 7) }));
  return [...kept, ...copied];
}

export function rotaMessage(
  space: Pick<ProSpace, "name">,
  staff: ProStaff[],
  ops: ProNightOps,
  nights: string[],
): string {
  const lines = [`Turnos de ${space.name}`];
  for (const night of nights) {
    const shifts = rotaOf(ops, night);
    if (!shifts.length) continue;
    lines.push("", capitalizeFirst(shortDay(atLocal(night, 12 * 60))));
    for (const s of shifts) {
      const who = staff.find((p) => p.id === s.staffId)?.name.split(" ")[0] ?? "Sin asignar";
      lines.push(`- ${who}: ${ROTA_ROLES[s.role].label}, ${shiftLabel(s)}`);
    }
  }
  return lines.join("\n");
}

function capitalizeFirst(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/* ------------------------------------------------------------------ */
/* Incidencias y vetados                                               */
/* ------------------------------------------------------------------ */

export const INCIDENT_KINDS: Record<ProIncidentKind, { label: string; tone: "danger" | "warning" | "info" | "neutral" }> = {
  pelea: { label: "Pelea", tone: "danger" },
  expulsion: { label: "Expulsión", tone: "danger" },
  sanitaria: { label: "Atención sanitaria", tone: "warning" },
  policia: { label: "Policía o inspección", tone: "warning" },
  vecinos: { label: "Queja de vecinos", tone: "warning" },
  reclamacion: { label: "Hoja de reclamaciones", tone: "info" },
  objeto: { label: "Objeto perdido", tone: "neutral" },
  otro: { label: "Otro", tone: "neutral" },
};

export function incidentsOfNight(ops: ProNightOps, night: string): ProNightIncident[] {
  return ops.incidents.filter((i) => i.night === night).sort((a, b) => a.at.localeCompare(b.at));
}

/** Informe de una noche en texto, para enviarlo o guardarlo. */
export function incidentReport(space: Pick<ProSpace, "name">, night: string, list: ProNightIncident[]): string {
  const head = `Libro de incidencias de ${space.name}, noche del ${shortDay(atLocal(night, 12 * 60))}`;
  if (!list.length) return `${head}\nSin incidencias.`;
  return [
    head,
    ...list.map(
      (i) =>
        `- ${minutesToLabel(localMinutes(i.at))} ${INCIDENT_KINDS[i.kind].label}: ${i.description} (apuntó ${i.by})`,
    ),
  ].join("\n");
}

/** Nombre sin tildes, en minúsculas y con espacios simples, para comparar. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function banActive(ban: ProBan, now: Date): boolean {
  return ban.until === null || ban.until >= localDate(now);
}

export function activeBans(ops: ProNightOps, now: Date): ProBan[] {
  return ops.bans.filter((b) => banActive(b, now));
}

/**
 * ¿Esta persona tiene el acceso denegado? Coincide si todas las palabras del
 * nombre vetado están en el nombre buscado ("Raúl Pérez" veta a "Raúl Pérez
 * Gil"). Un nombre de una sola palabra solo coincide si es exactamente igual.
 */
export function banFor(ops: ProNightOps, name: string, now: Date): ProBan | null {
  const target = normalizeName(name);
  if (!target) return null;
  const words = new Set(target.split(" "));
  for (const ban of activeBans(ops, now)) {
    const banned = normalizeName(ban.name);
    const parts = banned.split(" ").filter(Boolean);
    if (!parts.length) continue;
    if (parts.length === 1 ? banned === target : parts.every((p) => words.has(p))) return ban;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Previsión de la noche                                               */
/* ------------------------------------------------------------------ */

/**
 * Cuánta gente esperar esta noche con lo que ya hay (entradas, lista,
 * reservados) y lo que pasó en las últimas noches iguales (mismo nombre o,
 * si no hay, mismo día de la semana). Sin noches pasadas no hay previsión.
 */
export function nightForecast(data: ProData, ev: ProEvent, now: Date) {
  const past = pastEvents(data, now);
  const sameName = past.filter((e) => e.name === ev.name);
  const sameDay = past.filter((e) => weekdayIndex(e.date) === weekdayIndex(ev.date));
  const basis = (sameName.length ? sameName : sameDay).slice(0, 4);
  if (!basis.length) return null;

  let tickets = 0;
  let ticketsIn = 0;
  let list = 0;
  let listIn = 0;
  let walkIns = 0;
  let door = 0;
  for (const p of basis) {
    const guests = guestsOf(data, p.id);
    const online = guests.filter((g) => g.kind === "ticket" && !isDoorGuest(p, g.tierName));
    tickets += online.length;
    ticketsIn += online.filter((g) => g.checkedInAt).length;
    list += guests.filter((g) => g.kind === "list").length;
    listIn += guests.filter((g) => g.kind === "list" && g.checkedInAt).length;
    walkIns += p.walkIns ?? 0;
    door += guests.filter((g) => g.kind === "ticket" && isDoorGuest(p, g.tierName)).length;
  }
  const showTicket = tickets ? ticketsIn / tickets : 0.9;
  const showList = list ? listIn / list : 0.6;
  const guests = guestsOf(data, ev.id);
  const onlineNow = guests.filter((g) => g.kind === "ticket" && !isDoorGuest(ev, g.tierName)).length;
  const listNow = guests.filter((g) => g.kind === "list").length;
  const reservedGuests = guests.filter((g) => g.kind === "reserved").length;
  const zonePeople = sum(
    data.zones.filter((z) => z.eventId === ev.id && z.status !== "free"),
    (z) => z.people ?? 0,
  );
  const reserved = reservedGuests || zonePeople;
  const avgWalkIns = Math.round(walkIns / basis.length);
  const avgDoor = Math.round(door / basis.length);
  const expected = Math.min(
    ev.capacity,
    Math.round(onlineNow * showTicket + listNow * showList + reserved + avgWalkIns + avgDoor),
  );
  const ops = nightOpsOf(data);
  const last = basis[0];
  return {
    expected,
    basis: basis.length,
    basisLabel: sameName.length ? ev.name : "el mismo día de la semana",
    showTicketPct: Math.round(showTicket * 100),
    showListPct: Math.round(showList * 100),
    walkIns: avgWalkIns,
    door: avgDoor,
    reserved,
    bartenders: Math.max(1, Math.ceil(expected / Math.max(1, ops.settings.peoplePerBartender))),
    plannedBar: rotaOf(ops, ev.date).filter((s) => s.role === "barra").length,
    last: { name: last.name, date: last.date, sold: eventStats(data, last).sold, inside: last.checkedIn },
  };
}

function isDoorGuest(ev: ProEvent, tierName?: string): boolean {
  return ev.tiers.some((t) => t.name === tierName && t.until === null);
}

/* ------------------------------------------------------------------ */
/* Happy hour y ofertas con reloj                                      */
/* ------------------------------------------------------------------ */

type OfferWindow = { offer: ProOffer; startsAt: string; endsAt: string };

/**
 * Ofertas con días y franja (happy hour, jueves universitario) activas ahora
 * y las que empiezan más tarde hoy. Las franjas pueden cruzar la medianoche.
 */
export function offerWindows(data: ProData, now: Date) {
  const today = localDate(now);
  const yesterday = addDays(today, -1);
  const m = localMinutes(now);
  const active: OfferWindow[] = [];
  const later: OfferWindow[] = [];
  for (const offer of data.offers) {
    if (offer.status !== "live" || !offer.days?.length) continue;
    if (typeof offer.fromMinute !== "number" || typeof offer.toMinute !== "number") continue;
    const from = offer.fromMinute;
    const to = offer.toMinute;
    const crosses = to <= from;
    const onDay = (date: string) => offer.days?.includes(weekdayIndex(date)) ?? false;
    const window = (date: string): OfferWindow => ({
      offer,
      startsAt: atLocal(date, from),
      endsAt: atLocal(crosses ? addDays(date, 1) : date, to),
    });
    if (!crosses) {
      if (onDay(today) && m >= from && m < to) active.push(window(today));
      else if (onDay(today) && m < from) later.push(window(today));
    } else if (onDay(today) && m >= from) {
      active.push(window(today));
    } else if (onDay(yesterday) && m < to) {
      active.push(window(yesterday));
    } else if (onDay(today) && m < from) {
      later.push(window(today));
    }
  }
  const byStart = (a: OfferWindow, b: OfferWindow) => a.startsAt.localeCompare(b.startsAt);
  return { active: active.sort(byStart), later: later.sort(byStart) };
}

/* ------------------------------------------------------------------ */
/* Cumpleaños de la semana                                             */
/* ------------------------------------------------------------------ */

/** Clientes que cumplen años en los próximos días y aceptan comunicaciones. */
export function upcomingBirthdays(clients: ProClient[], now: Date, days = 7) {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const out: { client: ProClient; date: string; inDays: number; turns: number | null }[] = [];
  for (const client of clients) {
    if (!client.birthday || !client.marketingConsent) continue;
    const [by, bm, bd] = client.birthday.split("-").map(Number);
    if (!bm || !bd) continue;
    for (const y of [year, year + 1]) {
      const date = `${y}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
      const inDays = Math.round(
        (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000,
      );
      if (inDays >= 0 && inDays <= days) {
        out.push({ client, date, inDays, turns: by > 1900 ? y - by : null });
        break;
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

export function birthdayInvite(
  client: Pick<ProClient, "name">,
  space: Pick<ProSpace, "name" | "slug">,
  turns: number | null,
): string {
  const first = client.name.split(" ")[0];
  return [
    `¡Hola ${first}! Somos ${space.name}.`,
    `Vemos que ${turns ? `cumples ${turns}` : "es tu cumple"} esta semana: si lo quieres celebrar con tu gente, te guardamos un reservado.`,
    `Pídelo aquí: https://franky.es/n/${space.slug}`,
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* Cola del karaoke                                                    */
/* ------------------------------------------------------------------ */

/** Noche de karaoke: el nombre lo dice o hay un turno de karaoke esa noche. */
export function isKaraokeNight(data: ProData, ev: ProEvent): boolean {
  if (/karaoke/i.test(ev.name)) return true;
  return rotaOf(nightOpsOf(data), ev.date).some((s) => s.role === "karaoke");
}

/** La cola de una noche: quién canta, quién va después (por orden de llegada) y cuántos han cantado. */
export function karaokeQueue(ops: ProNightOps, eventId: string) {
  const songs = (ops.karaoke ?? []).filter((s) => s.eventId === eventId);
  const waiting = songs
    .filter((s) => s.status === "waiting")
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    singing: songs.find((s) => s.status === "singing") ?? null,
    waiting,
    done: songs.filter((s) => s.status === "done").length,
  };
}

/** Pasa a la siguiente canción: la que sonaba se da por cantada y sube la primera de la cola. */
export function karaokeNext(ops: ProNightOps, eventId: string): ProNightOps {
  const { singing, waiting } = karaokeQueue(ops, eventId);
  const nextId = waiting[0]?.id;
  return {
    ...ops,
    karaoke: (ops.karaoke ?? []).map((s) => {
      if (singing && s.id === singing.id) return { ...s, status: "done" as const };
      if (s.id === nextId) return { ...s, status: "singing" as const };
      return s;
    }),
  };
}

/** Minutos de espera aproximados para el puesto `position` (1 = el siguiente), a 4 minutos por canción. */
export function karaokeWait(position: number): number {
  return Math.max(0, position) * 4;
}

/* ------------------------------------------------------------------ */
/* Opiniones al día siguiente                                          */
/* ------------------------------------------------------------------ */

/**
 * La noche de la que se pide opinión: anoche o, si no abriste, anteayer.
 * Cuenta una noche con evento o con horario de apertura. Devuelve la franja
 * en la que alguien pudo estar dentro (una hora de margen a cada lado).
 */
export function reviewAskNight(data: ProData, now: Date) {
  const today = nightOf(now);
  for (const back of [1, 2]) {
    const night = addDays(today, -back);
    const event = eventOfNight(data, night);
    const hours = data.space.hours[weekdayIndex(night)];
    if (!event && !hours) continue;
    const from = event
      ? new Date(event.doorsOpen).getTime()
      : new Date(atLocal(night, hours?.open ?? 20 * 60)).getTime();
    const closeMinute = hours?.close ?? 3 * 60;
    const to = event
      ? new Date(event.closes).getTime()
      : new Date(atLocal(closeMinute <= (hours?.open ?? 0) ? addDays(night, 1) : night, closeMinute)).getTime();
    return { night, event, from: from - 3600000, to: to + 3600000 };
  }
  return null;
}

/**
 * Clientes que vinieron esa noche (su última visita cae en la franja),
 * aceptan mensajes y tienen teléfono. A quien ya se le pidió no se repite.
 */
export function reviewAskTargets(data: ProData, now: Date) {
  const target = reviewAskNight(data, now);
  if (!target) return { night: null, event: null, clients: [] as ProClient[], asked: 0 };
  const asked = new Set(
    (nightOpsOf(data).reviewAsks ?? []).filter((a) => a.night === target.night).map((a) => a.clientId),
  );
  const came = data.clients.filter((c) => {
    if (!c.lastVisit || !c.phone || !c.marketingConsent) return false;
    const t = new Date(c.lastVisit).getTime();
    return t >= target.from && t <= target.to;
  });
  return {
    night: target.night,
    event: target.event,
    clients: came.filter((c) => !asked.has(c.id)),
    asked: asked.size,
  };
}

export function reviewAskMessage(
  client: Pick<ProClient, "name">,
  space: Pick<ProSpace, "name" | "slug">,
  event?: Pick<ProEvent, "name"> | null,
): string {
  const first = client.name.split(" ")[0];
  return [
    `¡Hola ${first}! Gracias por venir ${event ? `a ${event.name} en` : "anoche a"} ${space.name}.`,
    "¿Qué tal lo pasaste? Nos ayuda mucho que lo cuentes en Franky:",
    `https://franky.es/n/${space.slug}`,
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* Noches que se repiten                                               */
/* ------------------------------------------------------------------ */

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000,
  );
}

/** Mueve un instante de la noche `fromDate` a la noche `toDate` con la misma hora local. */
export function shiftToNight(iso: string, fromDate: string, toDate: string): string {
  const offset = daysBetween(fromDate, localDate(iso));
  return atLocal(addDays(toDate, offset), localMinutes(iso));
}

/** Copia un evento a otra fecha: mismos tramos, lista, aforo y costes, sin ventas. */
export function cloneEventTo(ev: ProEvent, date: string, id: string, seriesId?: string): ProEvent {
  const move = (iso: string) => shiftToNight(iso, ev.date, date);
  return {
    ...ev,
    id,
    date,
    doorsOpen: move(ev.doorsOpen),
    closes: move(ev.closes),
    listCutoff: ev.listCutoff ? move(ev.listCutoff) : undefined,
    checkedIn: 0,
    walkIns: 0,
    status: "on_sale",
    seriesId,
    crush: undefined,
    tiers: ev.tiers.map((t, i) => ({
      ...t,
      id: `${id}-t${i + 1}`,
      sold: 0,
      until: t.until ? move(t.until) : null,
    })),
    costs: ev.costs?.map((c, i) => ({ ...c, id: `${id}-c${i + 1}` })),
  };
}

/**
 * Las próximas `weeks` noches iguales, una por semana. Si ya hay un evento
 * con el mismo nombre esa fecha, se salta.
 */
export function repeatWeekly(
  data: ProData,
  ev: ProEvent,
  weeks: number,
  makeId: (i: number) => string,
  seriesId: string,
) {
  const events: ProEvent[] = [];
  const skipped: string[] = [];
  for (let w = 1; w <= weeks; w++) {
    const date = addDays(ev.date, 7 * w);
    const exists = data.events.some((e) => e.date === date && e.name === ev.name);
    if (exists) {
      skipped.push(date);
      continue;
    }
    events.push(cloneEventTo(ev, date, makeId(w), seriesId));
  }
  return { events, skipped };
}

/**
 * Repite la noche cada semana y devuelve los datos nuevos para `update`.
 * Si el evento tenía reservados propios, cada noche nueva los recibe libres
 * (mismo mínimo, señal y capacidad). Los RRPP no se copian: son del local y
 * sus enlaces valen para todas las noches.
 */
export function applyRepeatWeekly(
  data: ProData,
  ev: ProEvent,
  weeks: number,
  makeId: (prefix: string) => string,
) {
  const seriesId = ev.seriesId ?? ev.id;
  const { events, skipped } = repeatWeekly(data, ev, weeks, () => makeId("ev"), seriesId);
  const ownZones = data.zones.filter((z) => z.eventId === ev.id);
  const zones = events.flatMap((e) =>
    ownZones.map((z) => ({ ...freeZone(z), id: makeId("zn"), eventId: e.id })),
  );
  const next: ProData = {
    ...data,
    events: [
      ...data.events.map((e) => (e.id === ev.id ? { ...e, seriesId } : e)),
      ...events,
    ],
    zones: [...data.zones, ...zones],
  };
  return { data: next, events, skipped };
}

/** Fechas de las próximas `weeks` noches iguales con sus avisos de calendario. */
export function repeatPreview(data: ProData, ev: ProEvent, weeks: number) {
  const out: { date: string; exists: boolean; notes: string[] }[] = [];
  for (let w = 1; w <= weeks; w++) {
    const date = addDays(ev.date, 7 * w);
    out.push({
      date,
      exists: data.events.some((e) => e.date === date && e.name === ev.name),
      notes: nightDateNotes(date),
    });
  }
  return out;
}

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Festivos nacionales y de la Comunitat Valenciana que caen siempre (más Semana Santa). */
export function holidaysOf(year: number): Record<string, string> {
  const fixed: [string, string][] = [
    ["01-01", "Año Nuevo"],
    ["01-06", "Reyes"],
    ["05-01", "Día del Trabajo"],
    ["06-24", "San Juan"],
    ["08-15", "la Asunción"],
    ["10-09", "Día de la Comunitat Valenciana"],
    ["10-12", "Fiesta Nacional"],
    ["11-01", "Todos los Santos"],
    ["12-06", "Día de la Constitución"],
    ["12-08", "la Inmaculada"],
    ["12-25", "Navidad"],
  ];
  const out: Record<string, string> = {};
  for (const [md, name] of fixed) out[`${year}-${md}`] = name;
  const easter = easterSunday(year);
  out[addDays(easter, -2)] = "Viernes Santo";
  out[addDays(easter, 1)] = "Lunes de Pascua";
  return out;
}

/** Avisos de calendario de una noche: si cae en festivo o es víspera de uno. */
export function nightDateNotes(date: string): string[] {
  const year = Number(date.slice(0, 4));
  const all = { ...holidaysOf(year), ...holidaysOf(year + 1) };
  const notes: string[] = [];
  if (all[date]) notes.push(`Festivo: ${all[date]}`);
  const tomorrow = addDays(date, 1);
  if (all[tomorrow]) notes.push(`Víspera de festivo: ${all[tomorrow]}`);
  return notes;
}

/** Noches señaladas que no son festivo pero llenan los locales. */
const SPECIAL_NIGHTS: Record<string, string> = {
  "10-31": "Halloween",
  "12-31": "Nochevieja",
  "02-14": "San Valentín",
};

/**
 * Las fechas de las próximas semanas que mueven la noche (festivos, vísperas
 * y noches señaladas), con el evento que ya tengas ese día o `null`.
 */
export function nightCalendar(data: ProData, now: Date, days = 56) {
  const start = nightOf(now);
  const out: { date: string; notes: string[]; event: ProEvent | null }[] = [];
  for (let d = 0; d <= days; d++) {
    const date = addDays(start, d);
    const special = SPECIAL_NIGHTS[date.slice(5)];
    const notes = [...(special ? [special] : []), ...nightDateNotes(date)];
    if (!notes.length) continue;
    const event = sortedEvents(data).find((e) => e.date === date && e.status !== "draft") ?? null;
    out.push({ date, notes, event });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* RRPP: cupos, recibos y exportación                                  */
/* ------------------------------------------------------------------ */

export function promoterCapState(data: ProData, p: ProPromoter, eventId: string) {
  const signedUp = data.guests.filter((g) => g.eventId === eventId && g.promoterId === p.id).length;
  const max = p.cap?.maxPerNight ?? null;
  return {
    signedUp,
    max,
    full: max !== null && signedUp >= max,
    left: max === null ? null : Math.max(0, max - signedUp),
  };
}

/** Recibo de liquidación para mandarlo por WhatsApp: noche a noche con la regla y el total. */
export function promoterReceipt(
  data: ProData,
  p: ProPromoter,
  nights: { eventId: string; scanned: number; commissionCents: number }[],
): string {
  const rows = nights.map((n) => {
    const ev = data.events.find((e) => e.id === n.eventId);
    const when = ev ? shortDay(ev.doorsOpen) : "";
    return `- ${ev?.name ?? "Noche"} (${when}): ${n.scanned} entradas en puerta, ${money(n.commissionCents)}`;
  });
  const total = sum(nights, (n) => n.commissionCents);
  const scanned = sum(nights, (n) => n.scanned);
  return [
    `Hola ${p.name.split(" ")[0]}, esta es tu liquidación de ${data.space.name}:`,
    ...rows,
    `Regla: ${ruleLabel(p.spec, p.rule)}.`,
    `Total: ${money(total)} por ${scanned} personas que entraron con tu enlace.`,
  ].join("\n");
}

/** Filas del mes (YYYY-MM) para el CSV de RRPP: una por RRPP y noche. */
export function promoterMonthRows(data: ProData, month: string): string[][] {
  const rows: string[][] = [["RRPP", "Código", "Noche", "Fecha", "Vendidas", "Lista", "Entraron", "Comisión (€)"]];
  for (const p of data.promoters) {
    for (const n of promoterNights(data, p)) {
      const ev = data.events.find((e) => e.id === n.eventId);
      if (!ev || !ev.date.startsWith(month)) continue;
      rows.push([
        p.name,
        p.code,
        ev.name,
        ev.date,
        String(n.sold),
        String(n.list),
        String(n.scanned),
        (n.commissionCents / 100).toFixed(2).replace(".", ","),
      ]);
    }
  }
  return rows;
}

/** Si el RRPP tiene hora de corte propia, el instante de esa noche. */
export function promoterCutoffAt(p: ProPromoter, ev: ProEvent): string | null {
  const minute = p.cap?.cutoffMinute;
  if (typeof minute !== "number") return null;
  const doors = localMinutes(ev.doorsOpen);
  return minute > doors ? atLocal(ev.date, minute) : atLocal(addDays(ev.date, 1), minute);
}

