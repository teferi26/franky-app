/**
 * Datos de ejemplo de la operación de noche: carta de copas, consumo de
 * reservados, taquilla, cierres de caja, recuentos de barra, proveedores,
 * turnos, incidencias y vetados. The Loft (pub de San Vicente) y Sala Aurora
 * (discoteca del Puerto de Alicante). Todo relativo a `now` y estable.
 */
import type { Allergen, ProClient, ProData, ProEvent, ProMenuItem, ProShift, ProStaff, ProZone } from "../types";
import type {
  ProBan,
  ProDoorMove,
  ProDoorSale,
  ProInvite,
  ProInviteReason,
  ProKaraokeSong,
  ProNightClose,
  ProNightCost,
  ProNightIncident,
  ProNightOps,
  ProPlannedShift,
  ProRotaRole,
  ProStockCount,
  ProStockItem,
  ProStockUnit,
  ProSupplier,
  ProSupplierOrder,
  ProZoneBill,
  ProZoneNoShow,
  ProZoneTabLine,
} from "../night-types";
import { addDays, atLocal, localDate, weekdayIndex } from "../format";
import { nightOf } from "../night";
import { closeMath, doorTotals, EMPTY_NIGHT_OPS, reviewAskNight, shiftMinutes } from "../night-ops";
import { rng, seedFor, type Rng } from "./common";

/* ------------------------------------------------------------------ */
/* Carta de copas                                                      */
/* ------------------------------------------------------------------ */

type MenuSeed = [section: string, name: string, euros: number, allergens: Allergen[], description?: string];

function menuFrom(prefix: string, seeds: MenuSeed[], favorites: string[]): ProMenuItem[] {
  return seeds.map(([section, name, euros, allergens, description], i) => ({
    id: `${prefix}${i + 1}`,
    section,
    name,
    description,
    priceCents: Math.round(euros * 100),
    allergens,
    available: true,
    studentFavorite: favorites.includes(name),
  }));
}

const PUB_MENU: MenuSeed[] = [
  ["Cervezas", "Caña", 2, ["gluten"]],
  ["Cervezas", "Tercio", 3, ["gluten"]],
  ["Cervezas", "Jarra de medio litro", 4.5, ["gluten"]],
  ["Cervezas", "Cerveza sin gluten", 3.5, []],
  ["Combinados", "Ginebra con tónica", 7, [], "Puerto de Indias, Tanqueray o Beefeater"],
  ["Combinados", "Ron con cola", 6.5, [], "Barceló o Brugal"],
  ["Combinados", "Vodka con limón", 6.5, []],
  ["Combinados", "Whisky con cola", 7, ["gluten"]],
  ["Cócteles", "Mojito", 7, []],
  ["Cócteles", "Pisco sour", 8, ["huevo"]],
  ["Cócteles", "Tinto de verano", 3.5, ["sulfitos"]],
  ["Chupitos", "Chupito de la casa", 2, []],
  ["Chupitos", "Jägermeister", 3, []],
  ["Sin alcohol", "Refresco", 2.5, []],
  ["Sin alcohol", "Agua", 1.5, []],
  ["Sin alcohol", "Mocktail de frutos rojos", 5, []],
  ["Para compartir", "Cubo de 5 tercios", 10, ["gluten"]],
  ["Para compartir", "Ronda de 6 chupitos", 10, []],
  ["Para compartir", "Botella de ginebra con refrescos", 70, [], "Botella y 6 tónicas o refrescos"],
  ["Para compartir", "Botella de ron con refrescos", 65, [], "Botella y 6 refrescos"],
  ["Picoteo", "Nachos con queso", 6, ["lacteos", "gluten"]],
  ["Picoteo", "Patatas bravas", 4.5, ["huevo"]],
  ["Picoteo", "Frutos secos", 2.5, ["frutos_cascara", "cacahuete"]],
];

const CLUB_MENU: MenuSeed[] = [
  ["Botellas de reservado", "Ginebra premium", 150, [], "Con 6 tónicas o refrescos"],
  ["Botellas de reservado", "Vodka", 140, [], "Con 6 refrescos"],
  ["Botellas de reservado", "Ron añejo", 140, [], "Con 6 refrescos"],
  ["Botellas de reservado", "Whisky", 160, ["gluten"], "Con 6 refrescos"],
  ["Botellas de reservado", "Champán", 120, ["sulfitos"]],
  ["Botellas de reservado", "Cubo de 10 botellines", 60, ["gluten"]],
  ["Copas", "Combinado", 10, [], "Ginebra, ron, vodka o whisky"],
  ["Copas", "Combinado premium", 13, []],
  ["Copas", "Cerveza", 5, ["gluten"]],
  ["Chupitos", "Chupito", 4, []],
  ["Chupitos", "Ronda de 6 chupitos", 20, []],
  ["Sin alcohol", "Refresco", 4, []],
  ["Sin alcohol", "Agua", 3, []],
  ["Sin alcohol", "Bebida energética", 5, []],
];

export function pubMenu(): ProMenuItem[] {
  return menuFrom("pm", PUB_MENU, ["Cubo de 5 tercios", "Ginebra con tónica", "Chupito de la casa"]);
}

export function clubMenu(): ProMenuItem[] {
  return menuFrom("cm", CLUB_MENU, ["Combinado", "Ronda de 6 chupitos"]);
}

/* ------------------------------------------------------------------ */
/* Consumo de reservados y apartados                                   */
/* ------------------------------------------------------------------ */

function line(menu: ProMenuItem[], name: string, qty: number, at: string, by: string): ProZoneTabLine {
  const item = menu.find((m) => m.name === name);
  return {
    id: `tl-${item?.id ?? name}-${at.slice(11, 16)}`,
    itemId: item?.id,
    name,
    priceCents: item?.priceCents ?? 0,
    qty,
    at,
    by,
  };
}

/**
 * Consumo de los reservados que ya han llegado y hora límite de los apartados
 * sin señal. `order` indica qué se ha ido pidiendo en cada zona.
 */
export function seedZones(
  zones: ProZone[],
  menu: ProMenuItem[],
  now: Date,
  focus: ProEvent | undefined,
  orders: Record<string, [string, number, number][]>,
  holdHour: number,
  by: string,
): ProZone[] {
  return zones.map((z) => {
    if (z.status === "held" && focus) {
      // Si la hora de la señal ya ha pasado hoy, se deja hora y media de margen.
      const wanted = atLocal(focus.date, holdHour);
      const min = new Date(now.getTime() + 90 * 60000).toISOString();
      return { ...z, holdUntil: wanted > min ? wanted : min };
    }
    if (z.status !== "arrived" || !focus) return z;
    const doors = new Date(focus.doorsOpen).getTime();
    const tab = (orders[z.id] ?? [])
      .map(([name, qty, minutesAfterDoors]) => {
        const at = new Date(doors + minutesAfterDoors * 60000);
        return at.getTime() <= now.getTime() ? line(menu, name, qty, at.toISOString(), by) : null;
      })
      .filter((l): l is ProZoneTabLine => l !== null);
    return { ...z, tab };
  });
}

/* ------------------------------------------------------------------ */
/* Taquilla y entradas sin lista                                       */
/* ------------------------------------------------------------------ */

function doorSalesFor(r: Rng, data: ProData, cashShare: number): ProDoorSale[] {
  const out: ProDoorSale[] = [];
  for (const ev of data.events) {
    const doorTiers = new Map(ev.tiers.filter((t) => t.until === null).map((t) => [t.name, t]));
    for (const g of data.guests) {
      if (g.eventId !== ev.id || g.kind !== "ticket" || !g.checkedInAt) continue;
      const tier = g.tierName ? doorTiers.get(g.tierName) : undefined;
      if (!tier) continue;
      out.push({
        id: `ds-${g.id}`,
        eventId: ev.id,
        at: g.checkedInAt,
        cents: tier.priceCents,
        method: r.chance(cashShare) ? "cash" : "card",
        tierName: tier.name,
        guestName: g.name,
      });
    }
  }
  return out;
}

/** Pulsaciones de Entra para las personas sin entrada que ya han llegado. */
function doorMovesFor(r: Rng, events: ProEvent[], now: Date): ProDoorMove[] {
  const out: ProDoorMove[] = [];
  for (const ev of events) {
    const n = ev.walkIns ?? 0;
    if (!n) continue;
    const start = new Date(ev.doorsOpen).getTime();
    const end = Math.min(now.getTime(), new Date(ev.closes).getTime());
    for (let k = 0; k < n; k++) {
      // Más gente al principio de la noche, con un poco de desorden.
      const share = Math.pow((k + r.next()) / n, 1.35);
      const at = new Date(start + share * (end - start));
      out.push({ id: `dm-${ev.id}-${k + 1}`, eventId: ev.id, at: at.toISOString(), delta: 1 });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Barra: productos, proveedores, recuentos y pedidos                  */
/* ------------------------------------------------------------------ */

type StockSeed = {
  id: string;
  name: string;
  shelf: string;
  unit: ProStockUnit;
  par: number;
  target: number;
  pack: number;
  supplier: string;
  cost: number;
  /** Consumo típico en una noche normal. */
  use: number;
};

function buildStock(
  r: Rng,
  now: Date,
  seeds: StockSeed[],
  openDays: number[],
  countMinute: number,
  countedBy: string[],
  spike: string,
): { items: ProStockItem[]; counts: ProStockCount[]; orders: ProSupplierOrder[] } {
  const night = nightOf(now);
  const items: ProStockItem[] = seeds.map((s) => ({
    id: s.id,
    name: s.name,
    shelf: s.shelf,
    unit: s.unit,
    par: s.par,
    target: s.target,
    packSize: s.pack,
    supplierId: s.supplier,
    costCents: Math.round(s.cost * 100),
  }));
  // Las cinco últimas noches abiertas, de la más antigua a la más reciente.
  const nights: string[] = [];
  for (let d = 1; nights.length < 6 && d < 30; d++) {
    const date = addDays(night, -d);
    if (openDays.includes(weekdayIndex(date))) nights.unshift(date);
  }
  const level = new Map(seeds.map((s) => [s.id, s.target]));
  const counts: ProStockCount[] = [];
  const orders: ProSupplierOrder[] = [];
  const quarter = (n: number) => Math.round(n * 4) / 4;
  nights.forEach((date, i) => {
    const wd = weekdayIndex(date);
    const factor = wd === 3 ? 1.6 : wd >= 4 ? 1.3 : 0.75;
    // Lo que baja de la mitad del mínimo se repone esa mañana.
    const received = seeds.filter((s) => (level.get(s.id) ?? 0) < s.par * 0.5);
    const bySupplier = new Map<string, { itemId: string; qty: number }[]>();
    for (const s of received) {
      const need = s.target - (level.get(s.id) ?? 0);
      const qty = Math.ceil(need / s.pack) * s.pack;
      level.set(s.id, (level.get(s.id) ?? 0) + qty);
      bySupplier.set(s.supplier, [...(bySupplier.get(s.supplier) ?? []), { itemId: s.id, qty }]);
    }
    for (const [supplierId, lines] of bySupplier) {
      orders.push({
        id: `po-${supplierId}-${date}`,
        supplierId,
        at: atLocal(addDays(date, -1), 11 * 60),
        lines,
        status: "received",
        receivedAt: atLocal(date, 12 * 60),
      });
    }
    const values: Record<string, number> = {};
    for (const s of seeds) {
      let used = s.use * factor * (0.85 + r.next() * 0.3);
      // La última noche una botella baja mucho más de lo normal: la merma que hay que mirar.
      if (s.id === spike && i === nights.length - 1) used = s.use * factor * 2.6;
      const unitStep = s.unit === "botella" || s.unit === "barril" ? quarter : Math.round;
      const next = Math.max(0, unitStep((level.get(s.id) ?? 0) - used));
      level.set(s.id, next);
      values[s.id] = next;
    }
    counts.push({
      id: `sc-${date}`,
      at: atLocal(addDays(date, 1), countMinute),
      by: countedBy[i % countedBy.length],
      night: date,
      counts: values,
    });
  });
  return { items, counts, orders };
}

const PUB_SUPPLIERS: ProSupplier[] = [
  { id: "sup1", name: "Distribuciones Soler", contact: "Paco Soler", phone: "655 231 408", supplies: "Cerveza, barriles y refrescos" },
  { id: "sup2", name: "Licores Ivorra", contact: "Merche Ivorra", phone: "622 518 977", supplies: "Licores y destilados" },
  { id: "sup3", name: "Hielos Juanjo", contact: "Juanjo Pastor", phone: "678 402 115", supplies: "Hielo en bolsa" },
];

const PUB_STOCK: StockSeed[] = [
  { id: "st1", name: "Ginebra Puerto de Indias", shelf: "Botellero", unit: "botella", par: 3, target: 8, pack: 6, supplier: "sup2", cost: 14, use: 1.5 },
  { id: "st2", name: "Ginebra Tanqueray", shelf: "Botellero", unit: "botella", par: 2, target: 6, pack: 6, supplier: "sup2", cost: 16, use: 0.75 },
  { id: "st3", name: "Ron Barceló", shelf: "Botellero", unit: "botella", par: 3, target: 8, pack: 6, supplier: "sup2", cost: 12, use: 1.25 },
  { id: "st4", name: "Ron Brugal", shelf: "Botellero", unit: "botella", par: 2, target: 6, pack: 6, supplier: "sup2", cost: 12, use: 0.75 },
  { id: "st5", name: "Vodka Absolut", shelf: "Botellero", unit: "botella", par: 2, target: 6, pack: 6, supplier: "sup2", cost: 13, use: 0.75 },
  { id: "st6", name: "Whisky Ballantine's", shelf: "Botellero", unit: "botella", par: 2, target: 5, pack: 6, supplier: "sup2", cost: 13, use: 0.5 },
  { id: "st7", name: "Licor de chupito de la casa", shelf: "Botellero", unit: "botella", par: 3, target: 8, pack: 6, supplier: "sup2", cost: 7, use: 1.5 },
  { id: "st8", name: "Jägermeister", shelf: "Botellero", unit: "botella", par: 2, target: 5, pack: 6, supplier: "sup2", cost: 15, use: 0.5 },
  { id: "st9", name: "Barril de cerveza 30 L", shelf: "Cámara", unit: "barril", par: 2, target: 5, pack: 1, supplier: "sup1", cost: 95, use: 0.9 },
  { id: "st10", name: "Tercios", shelf: "Nevera", unit: "caja", par: 4, target: 10, pack: 1, supplier: "sup1", cost: 18, use: 2 },
  { id: "st11", name: "Tónica", shelf: "Nevera", unit: "caja", par: 2, target: 5, pack: 1, supplier: "sup1", cost: 14, use: 0.75 },
  { id: "st12", name: "Refresco de cola", shelf: "Nevera", unit: "caja", par: 2, target: 5, pack: 1, supplier: "sup1", cost: 13, use: 0.75 },
  { id: "st13", name: "Hielo en bolsa de 2 kg", shelf: "Arcón", unit: "unidad", par: 15, target: 40, pack: 10, supplier: "sup3", cost: 1.2, use: 9 },
];

const CLUB_SUPPLIERS: ProSupplier[] = [
  { id: "sup1", name: "Distribuciones Soler", contact: "Paco Soler", phone: "655 231 408", supplies: "Cerveza, agua y refrescos" },
  { id: "sup2", name: "Licores Ivorra", contact: "Merche Ivorra", phone: "622 518 977", supplies: "Destilados y champán" },
  { id: "sup3", name: "Hielos Juanjo", contact: "Juanjo Pastor", phone: "678 402 115", supplies: "Hielo en bolsa" },
];

const CLUB_STOCK: StockSeed[] = [
  { id: "st1", name: "Ginebra premium", shelf: "Barra principal", unit: "botella", par: 8, target: 24, pack: 6, supplier: "sup2", cost: 15, use: 7 },
  { id: "st2", name: "Ginebra de copa", shelf: "Barra principal", unit: "botella", par: 10, target: 30, pack: 6, supplier: "sup2", cost: 9, use: 9 },
  { id: "st3", name: "Ron añejo", shelf: "Barra principal", unit: "botella", par: 8, target: 24, pack: 6, supplier: "sup2", cost: 12, use: 6 },
  { id: "st4", name: "Vodka", shelf: "Barra principal", unit: "botella", par: 8, target: 24, pack: 6, supplier: "sup2", cost: 11, use: 6.5 },
  { id: "st5", name: "Whisky", shelf: "Barra principal", unit: "botella", par: 6, target: 18, pack: 6, supplier: "sup2", cost: 13, use: 4 },
  { id: "st6", name: "Champán", shelf: "Cámara VIP", unit: "botella", par: 6, target: 18, pack: 6, supplier: "sup2", cost: 32, use: 3 },
  { id: "st7", name: "Licor de chupito", shelf: "Barra principal", unit: "botella", par: 6, target: 18, pack: 6, supplier: "sup2", cost: 8, use: 5 },
  { id: "st8", name: "Botellines", shelf: "Cámara", unit: "caja", par: 8, target: 20, pack: 1, supplier: "sup1", cost: 16, use: 5 },
  { id: "st9", name: "Tónica", shelf: "Cámara", unit: "caja", par: 6, target: 16, pack: 1, supplier: "sup1", cost: 14, use: 4 },
  { id: "st10", name: "Refresco de cola", shelf: "Cámara", unit: "caja", par: 6, target: 16, pack: 1, supplier: "sup1", cost: 13, use: 4 },
  { id: "st11", name: "Agua", shelf: "Cámara", unit: "caja", par: 5, target: 14, pack: 1, supplier: "sup1", cost: 6, use: 3 },
  { id: "st12", name: "Hielo en bolsa de 2 kg", shelf: "Arcón", unit: "unidad", par: 60, target: 160, pack: 20, supplier: "sup3", cost: 1.2, use: 45 },
];

/* ------------------------------------------------------------------ */
/* Cierres de caja                                                     */
/* ------------------------------------------------------------------ */

type CloseSeed = {
  openDays: number[];
  /** Ventas de barra típicas por día de la semana (0 = lunes), en euros. */
  sales: Partial<Record<number, number>>;
  cashShare: number;
  float: number;
  closers: string[];
  closeMinute: number;
  /** Descuadres fijos por número de noche (0 = la más reciente cerrada). */
  diffs: Record<number, number>;
};

function buildCloses(r: Rng, now: Date, data: ProData, doorSales: ProDoorSale[], seed: CloseSeed): ProNightClose[] {
  const night = nightOf(now);
  const ops: ProNightOps = { ...EMPTY_NIGHT_OPS, doorSales };
  const out: ProNightClose[] = [];
  let index = 0;
  // La noche abierta más reciente se deja sin cerrar: es la que toca cuadrar.
  let skippedLatest = false;
  for (let d = 1; d <= 21; d++) {
    const date = addDays(night, -d);
    const wd = weekdayIndex(date);
    if (!seed.openDays.includes(wd)) continue;
    if (!skippedLatest) {
      skippedLatest = true;
      continue;
    }
    const base = seed.sales[wd] ?? 800;
    const total = Math.round(base * (0.85 + r.next() * 0.3)) * 100;
    const tpvCashCents = Math.round((total * seed.cashShare) / 100) * 100 + r.int(0, 9) * 50;
    const tpvCardCents = total - Math.round((total * seed.cashShare) / 100) * 100;
    const ev = data.events.find((e) => e.date === date && e.status !== "draft");
    const door = ev ? doorTotals(ops, ev.id) : { cashCents: 0, cardCents: 0 };
    const diff = Math.round((seed.diffs[index] ?? 0) * 100);
    const close: ProNightClose = {
      id: `cl-${date}`,
      night: date,
      eventId: ev?.id,
      closedBy: seed.closers[index % seed.closers.length],
      closedAt: atLocal(addDays(date, 1), seed.closeMinute + r.int(0, 25)),
      floatCents: seed.float * 100,
      tpvCashCents,
      tpvCardCents,
      cashCountedCents: 0,
      cardCountedCents: tpvCardCents + door.cardCents,
      invitations: r.int(3, 14),
      invitationsCents: 0,
      note: seed.diffs[index]
        ? seed.diffs[index] < 0
          ? "Revisado con el ticket Z: falta efectivo."
          : "Sobra efectivo: una invitación cobrada dos veces."
        : undefined,
    };
    close.invitationsCents = close.invitations * 600;
    const expected = closeMath({ ...close, cashCountedCents: 0 }, door).expectedCashCents;
    close.cashCountedCents = expected + diff;
    out.push(close);
    index++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

type RotaSeed = { staffId: string; role: ProRotaRole; days: number[]; from: number; to: number };

function buildRota(now: Date, seeds: RotaSeed[], gap?: { staffId: string; day: number }): ProPlannedShift[] {
  const night = nightOf(now);
  const monday = addDays(night, -weekdayIndex(night));
  const out: ProPlannedShift[] = [];
  for (const week of [-7, 0]) {
    const start = addDays(monday, week);
    for (const s of seeds) {
      for (const day of s.days) {
        // Esta semana hay un hueco sin cubrir, para que se vea el aviso.
        if (week === 0 && gap && gap.staffId === s.staffId && gap.day === day) continue;
        const date = addDays(start, day);
        out.push({
          id: `rt-${s.staffId}-${date}-${s.role}`,
          staffId: s.staffId,
          night: date,
          role: s.role,
          fromMinute: s.from,
          toMinute: s.to,
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Incidencias, vetados, costes y cumpleaños                           */
/* ------------------------------------------------------------------ */

function lastOpen(now: Date, openDays: number[], nth: number): string {
  const night = nightOf(now);
  let found = 0;
  for (let d = 1; d < 40; d++) {
    const date = addDays(night, -d);
    if (!openDays.includes(weekdayIndex(date))) continue;
    if (found === nth) return date;
    found++;
  }
  return addDays(night, -7);
}

type IncidentSeed = [nth: number, minute: number, kind: ProNightIncident["kind"], description: string, by: string];

function buildIncidents(now: Date, openDays: number[], data: ProData, seeds: IncidentSeed[]): ProNightIncident[] {
  return seeds.map(([nth, minute, kind, description, by], i) => {
    const night = lastOpen(now, openDays, nth);
    const at = minute < 12 * 60 ? atLocal(addDays(night, 1), minute) : atLocal(night, minute);
    const ev = data.events.find((e) => e.date === night);
    return { id: `in${i + 1}`, night, eventId: ev?.id, at, kind, description, by };
  });
}

function cost(id: string, kind: ProNightCost["kind"], label: string, euros: number): ProNightCost {
  return { id, kind, label, cents: euros * 100 };
}

/**
 * Cumpleaños: la mayoría repartidos en el año y algunos en los próximos días,
 * para que se vea la lista de la semana. Solo con consentimiento.
 */
/**
 * Algunos clientes con teléfono y permiso vinieron a la última noche: al día
 * siguiente aparecen para pedirles opinión.
 */
function withLastNightVisits(clients: ProClient[], data: ProData, now: Date, count: number): ProClient[] {
  const target = reviewAskNight(data, now);
  if (!target) return clients;
  // Llegan desde una hora después de abrir, repartidos cada 23 minutos.
  const start = target.from + 2 * 3600000;
  let n = 0;
  return clients.map((c) => {
    if (n >= count || !c.phone || !c.marketingConsent) return c;
    n++;
    return {
      ...c,
      lastVisit: new Date(Math.min(target.to - 3600000, start + n * 23 * 60000)).toISOString(),
      visits: c.visits + 1,
    };
  });
}

function withBirthdays(r: Rng, clients: ProClient[], now: Date): ProClient[] {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const soon = [1, 3, 5];
  return clients.map((c, i) => {
    const age = r.int(19, 24);
    if (i < soon.length) {
      const date = addDays(today, soon[i]);
      return { ...c, marketingConsent: true, birthday: `${year - age}${date.slice(4)}` };
    }
    const day = addDays(`${year}-01-01`, r.int(0, 364));
    return { ...c, birthday: `${year - age}${day.slice(4)}` };
  });
}

/* ------------------------------------------------------------------ */
/* Montaje por sector                                                  */
/* ------------------------------------------------------------------ */

const KARAOKE_SEED: [singer: string, song: string][] = [
  ["Lucía y Marta", "Mi gran noche"],
  ["Pablo Ferrer", "La flaca"],
  ["Los de 2.º de Magisterio", "Resistiré"],
  ["Irene Soler", "Sarà perché ti amo"],
  ["Álex Martí", "Devuélveme a mi chica"],
];

/* ------------------------------------------------------------------ */
/* Invitaciones con nombre, historial de reservados y fichajes         */
/* ------------------------------------------------------------------ */

type InviteSeed = [by: string, to: string, reason: ProInviteReason, item: string, drinks: number];

/**
 * Invitaciones de las últimas noches abiertas, una tanda por noche que va
 * rotando. Los cierres ya guardados pasan a cuadrar con lo apuntado.
 */
function buildInvites(
  r: Rng,
  now: Date,
  data: ProData,
  menu: ProMenuItem[],
  openDays: number[],
  seeds: InviteSeed[][],
): ProInvite[] {
  const night = nightOf(now);
  const out: ProInvite[] = [];
  let round = 0;
  for (let d = 0; d <= 28; d++) {
    const date = addDays(night, -d);
    if (!openDays.includes(weekdayIndex(date))) continue;
    const ev = data.events.find((e) => e.date === date && e.status !== "draft");
    // Esta noche solo hay invitaciones si ya ha abierto.
    if (d === 0 && (!ev || now.getTime() < new Date(ev.doorsOpen).getTime())) continue;
    const list = seeds[round % seeds.length];
    list.forEach(([by, to, reason, itemName, drinks], i) => {
      const item = menu.find((m) => m.name === itemName);
      const minute = 23 * 60 + 20 + i * 37 + r.int(0, 20);
      const at = minute >= 24 * 60 ? atLocal(addDays(date, 1), minute - 24 * 60) : atLocal(date, minute);
      if (d === 0 && new Date(at).getTime() > now.getTime()) return;
      out.push({
        id: `inv-${date}-${i}`,
        night: date,
        eventId: ev?.id,
        at,
        by,
        to,
        reason,
        drinks,
        cents: (item?.priceCents ?? 700) * drinks,
        itemName: item?.name,
      });
    });
    round++;
  }
  return out;
}

/** El cierre de cada noche apunta las invitaciones que quedaron con nombre. */
function syncCloseInvites(closes: ProNightClose[], invites: ProInvite[]): ProNightClose[] {
  return closes.map((c) => {
    const own = invites.filter((i) => i.night === c.night);
    if (!own.length) return c;
    return {
      ...c,
      invitations: own.reduce((a, i) => a + i.drinks, 0),
      invitationsCents: own.reduce((a, i) => a + i.cents, 0),
    };
  });
}

type BillSeed = [nth: number, zoneName: string, bookedBy: string, people: number, minimumEuros: number, consumedEuros: number, depositEuros: number];

/** Cuentas de reservados de noches pasadas: el historial de quien vuelve. */
function buildPastBills(now: Date, openDays: number[], seeds: BillSeed[], by: string): ProZoneBill[] {
  return seeds.map(([nth, zoneName, bookedBy, people, min, consumed, deposit], i) => {
    const night = lastOpen(now, openDays, nth);
    const minimumCents = min * 100;
    const consumedCents = consumed * 100;
    const depositCents = deposit * 100;
    return {
      id: `bill-past-${i + 1}`,
      zoneId: `past-${i + 1}`,
      zoneName,
      bookedBy,
      people,
      minimumCents,
      consumedCents,
      depositCents,
      dueCents: Math.max(0, Math.max(consumedCents, minimumCents) - depositCents),
      closedAt: atLocal(addDays(night, 1), 2 * 60 + 30 + i * 11),
      by,
    };
  });
}

type NoShowSeed = [nth: number, zoneName: string, bookedBy: string, phone: string, people: number, depositKeptEuros: number];

function buildNoShows(now: Date, openDays: number[], seeds: NoShowSeed[]): ProZoneNoShow[] {
  return seeds.map(([nth, zoneName, bookedBy, phone, people, kept], i) => {
    const night = lastOpen(now, openDays, nth);
    return {
      id: `ns${i + 1}`,
      night,
      zoneName,
      bookedBy,
      phone,
      people,
      depositKeptCents: kept * 100,
      at: atLocal(addDays(night, 1), 1 * 60 + 15),
    };
  });
}

/**
 * Fichajes de la última semana sacados del cuadrante, con lo que pasa de
 * verdad: casi todos a su hora, alguien que llega tarde, alguien que no ficha
 * y alguien que ficha sin tener turno. Se mantienen los fichajes abiertos de
 * esta noche.
 */
function shiftsFromRota(
  r: Rng,
  now: Date,
  rota: ProPlannedShift[],
  current: ProShift[],
  extra: { staffId: string; nth: number },
  openDays: number[],
): ProShift[] {
  const night = nightOf(now);
  const from = addDays(night, -7);
  const planned = rota
    .filter((s) => s.night >= from && s.night < night)
    .sort((a, b) => a.night.localeCompare(b.night) || a.staffId.localeCompare(b.staffId));
  const out: ProShift[] = [];
  planned.forEach((s, i) => {
    // El cuarto turno de la semana se queda sin fichar.
    if (i === 3) return;
    const start = s.fromMinute < 12 * 60 ? atLocal(addDays(s.night, 1), s.fromMinute) : atLocal(s.night, s.fromMinute);
    const endDay = s.toMinute <= s.fromMinute || s.toMinute < 12 * 60 ? addDays(s.night, 1) : s.night;
    const end = atLocal(endDay, s.toMinute);
    const late = i === 1 ? 38 : r.int(-12, 6);
    const inAt = new Date(new Date(start).getTime() + late * 60000).toISOString();
    const outAt = new Date(new Date(end).getTime() + r.int(-5, 20) * 60000).toISOString();
    out.push({ id: `sh-${s.id}`, staffId: s.staffId, date: localDate(inAt), inAt, outAt, breakMinutes: shiftMinutes(s) > 300 ? 20 : 0 });
  });
  // Alguien que echa una mano una noche sin estar en el cuadrante.
  const extraNight = [0, 1, 2, 3]
    .map((k) => lastOpen(now, openDays, extra.nth + k))
    .find((n) => n >= from && !planned.some((s) => s.night === n && s.staffId === extra.staffId));
  if (extraNight) {
    const inAt = atLocal(extraNight, 23 * 60 + 30);
    out.push({
      id: `sh-extra-${extraNight}`,
      staffId: extra.staffId,
      date: extraNight,
      inAt,
      outAt: atLocal(addDays(extraNight, 1), 2 * 60 + 45),
      breakMinutes: 0,
    });
  }
  return [...out, ...current.filter((sh) => sh.outAt === null)];
}

function withWeekMinutes(staff: ProStaff[], shifts: ProShift[]): ProStaff[] {
  return staff.map((s) => ({
    ...s,
    weekMinutes: shifts
      .filter((sh) => sh.staffId === s.id && sh.outAt)
      .reduce(
        (a, sh) => a + (new Date(sh.outAt as string).getTime() - new Date(sh.inAt).getTime()) / 60000 - sh.breakMinutes,
        0,
      ),
  }));
}

export function seedPubOps(data: ProData, now: Date): ProData {
  const r = rng(seedFor("pub") + 101);
  const openDays = [1, 2, 3, 4, 5];
  const menu = pubMenu();
  const focus = data.events
    .filter((e) => e.status === "tonight" || e.status === "on_sale")
    .sort((a, b) => a.doorsOpen.localeCompare(b.doorsOpen))[0];
  const zones = seedZones(
    data.zones,
    menu,
    now,
    focus,
    {
      z1: [
        ["Cubo de 5 tercios", 2, 25],
        ["Ronda de 6 chupitos", 1, 70],
        ["Botella de ginebra con refrescos", 1, 95],
      ],
    },
    20 * 60,
    "Rubén",
  );
  const events = data.events.map((e) => {
    if (e.name === "Jueves Universitario") return { ...e, costs: [cost(`${e.id}-c1`, "dj", "DJ del jueves", 150)] };
    if (e.name === "Miércoles de karaoke") return { ...e, costs: [cost(`${e.id}-c1`, "dj", "Técnico de karaoke", 80)] };
    if (e.name === "Noche de Champions") return { ...e, costs: [cost(`${e.id}-c1`, "other", "Canal de fútbol, parte proporcional", 60)] };
    return e;
  });
  const withEvents: ProData = { ...data, events, zones };
  const doorSales = doorSalesFor(r, withEvents, 0.55);
  const stock = buildStock(r, now, PUB_STOCK, openDays, 3 * 60 + 15, ["Rubén", "Celia"], "st1");
  const night = nightOf(now);
  // Un pedido de hielo enviado ayer y aún sin recibir.
  stock.orders.push({
    id: "po-hielo-pendiente",
    supplierId: "sup3",
    at: atLocal(addDays(night, -1), 12 * 60),
    lines: [{ itemId: "st13", qty: 30 }],
    status: "sent",
  });
  const bans: ProBan[] = [
    {
      id: "ban1",
      name: "Raúl Ortiz Navarro",
      reason: "Pelea en la barra. Empujó a Iván al pedirle que saliera.",
      since: addDays(night, -12),
      until: addDays(night, 170),
      by: "Marta Esteve",
    },
    {
      id: "ban2",
      name: "Dani Cortés",
      reason: "Intentó entrar con el DNI de otra persona.",
      since: addDays(night, -40),
      until: null,
      by: "Iván Molina",
    },
  ];
  // Quien está vetado intenta apuntarse otra vez a la lista del jueves.
  const guests = [...data.guests];
  const jueves = events.find((e) => e.name === "Jueves Universitario" && e.date >= night);
  if (jueves) {
    guests.push({
      id: `${jueves.id}-gvetado`,
      name: "Raúl Ortiz Navarro",
      eventId: jueves.id,
      kind: "list",
      checkedInAt: null,
      age18: true,
    });
  }
  // Cola del próximo karaoke: gente que ya se ha apuntado con su canción.
  const karaokeNight = events
    .filter((e) => /karaoke/i.test(e.name) && e.date >= night && e.status !== "draft")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const karaoke: ProKaraokeSong[] = karaokeNight
    ? KARAOKE_SEED.map(([singer, song], i) => ({
        id: `kk${i + 1}`,
        eventId: karaokeNight.id,
        singer,
        song,
        at: new Date(now.getTime() - (KARAOKE_SEED.length - i) * 9 * 60000).toISOString(),
        status: "waiting" as const,
      }))
    : [];
  const ops: ProNightOps = {
    ...EMPTY_NIGHT_OPS,
    karaoke,
    doorSales,
    doorMoves: doorMovesFor(r, events, now),
    stockItems: stock.items,
    stockCounts: stock.counts,
    orders: stock.orders,
    suppliers: PUB_SUPPLIERS,
    rota: buildRota(
      now,
      [
        { staffId: "s1", role: "encargado", days: [3, 4, 5], from: 21 * 60, to: 3 * 60 + 15 },
        { staffId: "s2", role: "barra", days: [1, 3, 4, 5], from: 19 * 60 + 30, to: 3 * 60 + 15 },
        { staffId: "s3", role: "barra", days: [3, 4, 5], from: 19 * 60 + 30, to: 3 * 60 + 15 },
        { staffId: "s3", role: "karaoke", days: [2], from: 21 * 60 + 30, to: 2 * 60 + 30 },
        { staffId: "s4", role: "puerta", days: [3, 4, 5], from: 22 * 60 + 45, to: 3 * 60 + 15 },
        { staffId: "s1", role: "barra", days: [1, 2], from: 19 * 60 + 30, to: 2 * 60 + 30 },
      ],
      { staffId: "s4", day: 4 },
    ),
    incidents: buildIncidents(now, openDays, withEvents, [
      [0, 2 * 60 + 10, "vecinos", "Un vecino del primero llama por el ruido de la terraza. Cerramos la terraza y bajamos la música.", "Marta Esteve"],
      [0, 23 * 60 + 40, "objeto", "Cartera negra encontrada en los sofás del fondo. Guardada en la caja fuerte.", "Celia Ruiz"],
      [2, 1 * 60 + 35, "expulsion", "Un grupo de cuatro insiste en entrar con bebida de fuera. Se les pide que se vayan y se van sin problema.", "Iván Molina"],
      [4, 0, "policia", "Visita de la Policía Local: revisan licencia, aforo y horario. Todo en regla.", "Marta Esteve"],
      [6, 1 * 60 + 50, "pelea", "Empujones en la barra entre dos clientes. Iván los separa y uno de ellos sale. Queda vetado.", "Iván Molina"],
    ]),
    bans,
    settings: { peoplePerBartender: 45 },
  };
  ops.closes = buildCloses(r, now, withEvents, doorSales, {
    openDays,
    sales: { 1: 700, 2: 950, 3: 2600, 4: 1900, 5: 2200 },
    cashShare: 0.42,
    float: 150,
    closers: ["Marta Esteve", "Rubén Pastor"],
    closeMinute: 3 * 60 + 20,
    diffs: { 1: -18.5, 4: 2 },
  });
  ops.invites = buildInvites(r, now, withEvents, menu, openDays, PUB_INVITES);
  ops.closes = syncCloseInvites(ops.closes, ops.invites);
  ops.zoneBills = buildPastBills(
    now,
    openDays,
    [
      [2, "Frente a la pantalla", "Peña madridista UA", 10, 90, 132, 20],
      [6, "Frente a la pantalla", "Peña madridista UA", 9, 90, 118, 20],
      [11, "Frente a la pantalla", "Peña madridista UA", 10, 90, 146, 20],
      [9, "Sofás del fondo", "Sara Molina", 8, 120, 128, 30],
    ],
    "Marta Esteve",
  );
  ops.noShows = buildNoShows(now, openDays, [[5, "Mesa alta de barra", "Pablo Gómez", "699 310 552", 6, 20]]);
  ops.settings = { ...ops.settings, invitesPerPerson: 5 };
  const shifts = shiftsFromRota(r, now, ops.rota, data.shifts, { staffId: "s3", nth: 1 }, openDays);
  // Objetivo por noche de los embajadores que siguen activos.
  const targets = [20, 15, 10];
  const promoters = withEvents.promoters.map((p, i) =>
    p.active && i < targets.length ? { ...p, cap: { maxPerNight: p.cap?.maxPerNight ?? null, ...p.cap, targetPerNight: targets[i] } } : p,
  );
  return {
    ...withEvents,
    promoters,
    guests,
    menu,
    staff: withWeekMinutes(data.staff, shifts),
    shifts,
    clients: withLastNightVisits(withBirthdays(r, data.clients, now), withEvents, now, 6),
    nightOps: ops,
  };
}

const PUB_INVITES: InviteSeed[][] = [
  [
    ["Rubén Pastor", "Jorge, habitual de los jueves", "habitual", "Ginebra con tónica", 1],
    ["Celia Ruiz", "Cumpleaños en los sofás", "cumple", "Chupito de la casa", 6],
    ["Rubén Pastor", "DJ del jueves", "dj", "Tercio", 2],
    ["Marta Esteve", "Mesa 3, copa mal servida", "compensacion", "Mojito", 1],
    ["Rubén Pastor", "Equipo al cerrar", "equipo", "Tercio", 4],
  ],
  [
    ["Celia Ruiz", "Ganadores del karaoke", "promo", "Chupito de la casa", 4],
    ["Rubén Pastor", "Delegada de Enfermería", "habitual", "Ginebra con tónica", 2],
    ["Iván Molina", "Grupo que esperó en la puerta", "compensacion", "Chupito de la casa", 3],
  ],
  [
    ["Rubén Pastor", "Amigos de Rubén", "otro", "Ginebra con tónica", 3],
    ["Rubén Pastor", "Jorge, habitual de los jueves", "habitual", "Tercio", 2],
    ["Marta Esteve", "Peña madridista UA", "habitual", "Jarra de medio litro", 2],
    ["Celia Ruiz", "Equipo al cerrar", "equipo", "Refresco", 3],
  ],
];

export function seedClubOps(data: ProData, now: Date): ProData {
  const r = rng(seedFor("nightclub") + 101);
  const openDays = [2, 3, 4, 5];
  const menu = clubMenu();
  const focus = data.events
    .filter((e) => e.status === "tonight" || e.status === "on_sale")
    .sort((a, b) => a.doorsOpen.localeCompare(b.doorsOpen))[0];
  const zones = seedZones(
    data.zones,
    menu,
    now,
    focus,
    {
      z1: [
        ["Ginebra premium", 1, 75],
        ["Ronda de 6 chupitos", 1, 110],
        ["Champán", 1, 150],
      ],
      z2: [
        ["Cubo de 10 botellines", 1, 45],
        ["Vodka", 1, 90],
      ],
      z5: [
        ["Ron añejo", 1, 100],
        ["Whisky", 1, 130],
        ["Cubo de 10 botellines", 2, 140],
        ["Ronda de 6 chupitos", 2, 160],
      ],
    },
    21 * 60,
    "Toni",
  );
  const clubCosts = (id: string, big: boolean): ProNightCost[] => [
    cost(`${id}-c1`, "dj", "Residentes Aurora", big ? 900 : 600),
    cost(`${id}-c2`, "security", big ? "Seguridad, 7 vigilantes" : "Seguridad, 5 vigilantes", big ? 840 : 600),
    cost(`${id}-c3`, "staff", "Camareros extra", big ? 420 : 280),
    cost(`${id}-c4`, "ads", "Anuncios en Instagram", big ? 200 : 120),
  ];
  const events = data.events.map((e) => {
    const big = weekdayIndex(e.date) === 5;
    const withCosts = e.status === "draft" ? e : { ...e, costs: clubCosts(e.id, big) };
    // En la noche del jueves, quien llega en lista pasada la hora paga 10 €.
    return e.id === "ev-jueves" ? { ...withCosts, afterCutoffCents: 1000 } : withCosts;
  });
  const promoters = data.promoters.map((p, i) => {
    const caps = [80, 60, 60, 50, 40, 40, 30];
    const cutoffs = [2 * 60, 90, 90, null, null, 90, null];
    // Objetivo de personas por noche: lo que el dueño espera de cada uno.
    const targets = [60, 45, 40, 35, 25, 25, 15];
    return i < caps.length
      ? { ...p, cap: { maxPerNight: caps[i], cutoffMinute: cutoffs[i], targetPerNight: targets[i] } }
      : p;
  });
  const withEvents: ProData = { ...data, events, zones, promoters };
  const doorSales = doorSalesFor(r, withEvents, 0.35);
  const stock = buildStock(r, now, CLUB_STOCK, openDays, 6 * 60 + 45, ["Toni Carbonell"], "st2");
  const night = nightOf(now);
  const bans: ProBan[] = [
    {
      id: "ban1",
      name: "Sergio Maciá Pons",
      reason: "Agresión a un portero en la Fiesta de Bienvenida.",
      since: addDays(night, -9),
      until: null,
      by: "Kike Martínez",
    },
    {
      id: "ban2",
      name: "Álex Ribera",
      reason: "Vendía entradas falsas en la cola.",
      since: addDays(night, -30),
      until: addDays(night, 335),
      by: "Nacho Berenguer",
    },
    {
      id: "ban3",
      name: "Javi Lledó",
      reason: "Acoso a una clienta en la pista. Denunciado.",
      since: addDays(night, -75),
      until: null,
      by: "Toni Carbonell",
    },
  ];
  const guests = [...data.guests];
  const jueves = events.find((e) => e.id === "ev-jueves");
  if (jueves) {
    guests.push({
      id: "ev-jueves-gvetado",
      name: "Sergio Maciá Pons",
      eventId: jueves.id,
      kind: "list",
      promoterId: "rp3",
      checkedInAt: null,
      age18: true,
      university: "Universidad de Alicante",
    });
  }
  const ops: ProNightOps = {
    ...EMPTY_NIGHT_OPS,
    doorSales,
    doorMoves: doorMovesFor(r, events, now),
    stockItems: stock.items,
    stockCounts: stock.counts,
    orders: stock.orders,
    suppliers: CLUB_SUPPLIERS,
    rota: buildRota(
      now,
      [
        { staffId: "s2", role: "encargado", days: [2, 3, 4, 5], from: 22 * 60 + 30, to: 6 * 60 + 45 },
        { staffId: "s3", role: "puerta", days: [3, 4, 5], from: 23 * 60, to: 6 * 60 + 30 },
        { staffId: "s4", role: "puerta", days: [2, 3, 4, 5], from: 23 * 60 + 15, to: 6 * 60 + 30 },
        { staffId: "s5", role: "taquilla", days: [3, 5], from: 23 * 60, to: 3 * 60 },
        { staffId: "s5", role: "guardarropa", days: [2, 4], from: 23 * 60, to: 6 * 60 + 30 },
        { staffId: "s1", role: "encargado", days: [5], from: 23 * 60, to: 6 * 60 + 30 },
      ],
      { staffId: "s4", day: 5 },
    ),
    incidents: buildIncidents(now, openDays, withEvents, [
      [0, 3 * 60 + 40, "sanitaria", "Chica mareada en el baño. Samuel la atiende, le damos agua y su amiga la acompaña a un taxi.", "Samuel Ortega"],
      [0, 4 * 60 + 15, "expulsion", "Chico muy bebido molestando en la pista. Se le acompaña fuera sin incidentes.", "Kike Martínez"],
      [1, 2 * 60 + 5, "reclamacion", "Pide la hoja de reclamaciones por el precio de la taquilla. Se le entrega y la rellena.", "Ana Llorca"],
      [1, 5 * 60 + 30, "objeto", "Móvil encontrado junto a la cabina. Guardado en taquilla con nota.", "Ana Llorca"],
      [3, 3 * 60 + 20, "pelea", "Pelea en la cola de fuera entre dos grupos. Intervienen los vigilantes y uno queda vetado.", "Kike Martínez"],
      [5, 1 * 60, "policia", "Inspección de la Policía Local: aforo y licencia. Enseñamos el registro de aforo. Sin incidencias.", "Nacho Berenguer"],
    ]),
    bans,
    settings: { peoplePerBartender: 90 },
  };
  ops.closes = buildCloses(r, now, withEvents, doorSales, {
    openDays,
    sales: { 2: 3800, 3: 7200, 4: 6100, 5: 10400 },
    cashShare: 0.3,
    float: 400,
    closers: ["Toni Carbonell", "Nacho Berenguer"],
    closeMinute: 6 * 60 + 40,
    diffs: { 0: -35, 3: 10 },
  });
  ops.invites = buildInvites(r, now, withEvents, menu, openDays, CLUB_INVITES);
  ops.closes = syncCloseInvites(ops.closes, ops.invites);
  ops.zoneBills = buildPastBills(
    now,
    openDays,
    [
      [1, "VIP 5", "Club de Rugby UA", 14, 400, 520, 100],
      [4, "VIP 5", "Club de Rugby UA", 12, 400, 455, 100],
      [9, "VIP 4", "Club de Rugby UA", 12, 300, 390, 100],
      [3, "VIP 2", "Delegación de Enfermería", 8, 180, 205, 50],
    ],
    "Toni Carbonell",
  );
  ops.noShows = buildNoShows(now, openDays, [[2, "VIP 6", "Marcos Ruiz", "622 407 518", 6, 50]]);
  // Kike tiene la habilitación; Samuel la está sacando.
  ops.settings = {
    ...ops.settings,
    invitesPerPerson: 8,
    licenseRequired: true,
    doorLicenses: { s3: "03-1187" },
  };
  const shifts = shiftsFromRota(r, now, ops.rota, data.shifts, { staffId: "s1", nth: 1 }, openDays);
  return {
    ...withEvents,
    guests,
    menu,
    staff: withWeekMinutes(data.staff, shifts),
    shifts,
    clients: withLastNightVisits(withBirthdays(r, data.clients, now), withEvents, now, 6),
    nightOps: ops,
  };
}

const CLUB_INVITES: InviteSeed[][] = [
  [
    ["Toni Carbonell", "DJ residente", "dj", "Combinado", 3],
    ["Alba Pastor", "Creadora de contenido de la UA", "promo", "Combinado premium", 2],
    ["Kike Martínez", "Grupo que esperó en la cola", "compensacion", "Chupito", 5],
    ["Nacho Berenguer", "Reservado del Club de Rugby", "habitual", "Chupito", 6],
    ["Toni Carbonell", "Equipo al cerrar", "equipo", "Cerveza", 6],
  ],
  [
    ["Alba Pastor", "RRPP que más trajo", "promo", "Combinado", 4],
    ["Toni Carbonell", "Cumpleaños en VIP 1", "cumple", "Chupito", 8],
    ["Ana Llorca", "Clienta con el abrigo perdido", "compensacion", "Combinado", 1],
  ],
  [
    ["Alba Pastor", "Amigas de Alba", "otro", "Combinado premium", 5],
    ["Toni Carbonell", "DJ invitado", "dj", "Combinado", 4],
    ["Alba Pastor", "Delegados de ADE", "promo", "Chupito", 6],
  ],
];
