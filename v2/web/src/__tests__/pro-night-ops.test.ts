import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, atLocal, localDate, weekdayIndex } from "@/lib/pro/format";
import { crushStats, eventStats, focusEvent, nightOf } from "@/lib/pro/night";
import type { ProData, ProEvent, ProZone } from "@/lib/pro/types";
import type { ProNightOps, ProStockItem } from "@/lib/pro/night-types";
import {
  EMPTY_NIGHT_OPS,
  addToTab,
  afterCutoffPrice,
  banFor,
  birthdayInvite,
  capacityState,
  closableNights,
  closeMath,
  closeZoneBill,
  cloneEventTo,
  copyPreviousWeek,
  holidaysOf,
  nightAccount,
  nightDateNotes,
  nightForecast,
  nightOpsOf,
  nightsReport,
  occupancyLog,
  offerWindows,
  openNightsOfWeek,
  orderMessage,
  promoterCapState,
  promoterMonthRows,
  promoterReceipt,
  releaseExpiredHolds,
  removeFromTab,
  repeatWeekly,
  rotaGaps,
  rotaMessage,
  shiftMinutes,
  stockLevel,
  stockRows,
  suggestedOrder,
  upcomingBirthdays,
  usageSeries,
  zoneTab,
} from "@/lib/pro/night-ops";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const NOW = new Date("2026-09-24T09:30:00.000Z");

function zone(patch: Partial<ProZone> = {}): ProZone {
  return {
    id: "z1",
    name: "VIP 1",
    capacity: 10,
    minimumSpendCents: 20000,
    depositCents: 5000,
    status: "arrived",
    bookedBy: "Lucía",
    people: 8,
    ...patch,
  };
}

function withOps(data: ProData, patch: Partial<ProNightOps>): ProData {
  return { ...data, nightOps: { ...nightOpsOf(data), ...patch } };
}

describe("Noche: consumo de reservados", () => {
  it("cobra el mayor entre consumo y mínimo, menos la señal cobrada", () => {
    let z = zone();
    expect(zoneTab(z)).toMatchObject({ consumedCents: 0, missingCents: 20000, dueCents: 15000, reached: false });
    const at = NOW.toISOString();
    z = addToTab(z, { id: "l1", itemId: "gin", name: "Ginebra", priceCents: 15000, qty: 1, at });
    z = addToTab(z, { id: "l2", itemId: "gin", name: "Ginebra", priceCents: 15000, qty: 1, at });
    expect(z.tab).toHaveLength(1);
    expect(z.tab?.[0].qty).toBe(2);
    const t = zoneTab(z);
    expect(t.consumedCents).toBe(30000);
    expect(t.missingCents).toBe(0);
    expect(t.dueCents).toBe(25000);
    expect(t.reached).toBe(true);
    z = removeFromTab(z, "l1");
    expect(zoneTab(z).consumedCents).toBe(15000);
    z = removeFromTab(z, "l1");
    expect(z.tab).toHaveLength(0);
  });

  it("un apartado sin señal no descuenta la señal", () => {
    expect(zoneTab(zone({ status: "held" })).dueCents).toBe(20000);
  });

  it("cerrar la cuenta guarda el resumen y deja el consumo a cero", () => {
    const base = buildDemo("pub", NOW);
    const data: ProData = {
      ...base,
      zones: [zone({ tab: [{ id: "l", name: "Cubo", priceCents: 1000, qty: 3, at: NOW.toISOString() }] })],
    };
    const next = closeZoneBill(data, "z1", "Rubén", NOW.toISOString(), "bill1");
    const bill = nightOpsOf(next).zoneBills.find((b) => b.id === "bill1");
    expect(bill).toMatchObject({ consumedCents: 3000, minimumCents: 20000, depositCents: 5000, dueCents: 15000 });
    expect(next.zones[0].tab).toEqual([]);
  });
});

describe("Noche: apartados que caducan", () => {
  it("libera solo los apartados cuya hora ya ha pasado", () => {
    const base = buildDemo("pub", NOW);
    const past = new Date(NOW.getTime() - 60000).toISOString();
    const future = new Date(NOW.getTime() + 3600000).toISOString();
    const data: ProData = {
      ...base,
      zones: [
        zone({ id: "a", status: "held", holdUntil: past, bookedBy: "Pablo", phone: "600000000" }),
        zone({ id: "b", status: "held", holdUntil: future }),
        zone({ id: "c", status: "booked" }),
      ],
    };
    const { data: next, released } = releaseExpiredHolds(data, NOW);
    expect(released.map((z) => z.id)).toEqual(["a"]);
    expect(next.zones.find((z) => z.id === "a")).toMatchObject({ status: "free", bookedBy: undefined, phone: undefined });
    expect(next.zones.find((z) => z.id === "b")?.status).toBe("held");
    expect(releaseExpiredHolds(next, NOW).released).toHaveLength(0);
  });
});

describe("Noche: puerta", () => {
  it("avisa al 90 % y bloquea al 100 % del aforo", () => {
    const ev = { capacity: 100, checkedIn: 89 } as ProEvent;
    expect(capacityState(ev).level).toBe("ok");
    expect(capacityState({ ...ev, checkedIn: 90 }).level).toBe("high");
    expect(capacityState({ ...ev, checkedIn: 100 })).toMatchObject({ level: "full", left: 0 });
  });

  it("la lista pasada la hora paga su precio propio o la taquilla", () => {
    const data = buildDemo("nightclub", NOW);
    const jueves = data.events.find((e) => e.id === "ev-jueves") as ProEvent;
    expect(afterCutoffPrice(jueves)).toBe(1000);
    expect(afterCutoffPrice({ ...jueves, afterCutoffCents: undefined })).toBe(1200);
    expect(afterCutoffPrice({ ...jueves, afterCutoffCents: undefined, tiers: [] })).toBeNull();
  });

  it("el registro de aforo suma entradas y salidas cada 15 minutos", () => {
    const data = buildDemo("pub", NOW);
    const ev = data.events.find((e) => e.name === "Jueves Universitario" && e.date < nightOf(NOW)) as ProEvent;
    const rows = occupancyLog(data, ev, NOW);
    expect(rows.length).toBeGreaterThan(4);
    const entries = rows.reduce((a, r) => a + r.entries, 0);
    const scanned = data.guests.filter((g) => g.eventId === ev.id && g.checkedInAt).length;
    expect(entries).toBe(scanned);
    const withExit = withOps(data, {
      doorMoves: [{ id: "m", eventId: ev.id, at: new Date(new Date(ev.doorsOpen).getTime() + 5 * 60000).toISOString(), delta: -1 }],
    });
    const again = occupancyLog(withExit, ev, NOW);
    expect(again[0].exits).toBe(1);
  });
});

describe("Noche: cierre de caja y cuenta de la noche", () => {
  it("calcula el descuadre en efectivo y tarjeta", () => {
    const close = { floatCents: 15000, tpvCashCents: 80000, tpvCardCents: 120000, cashCountedCents: 97000, cardCountedCents: 125000 };
    const m = closeMath(close, { cashCents: 3000, cardCents: 5000 });
    expect(m.expectedCashCents).toBe(98000);
    expect(m.cashDiffCents).toBe(-1000);
    expect(m.expectedCardCents).toBe(125000);
    expect(m.cardDiffCents).toBe(0);
    expect(m.diffCents).toBe(-1000);
  });

  it("la demo deja la última noche por cerrar y trae descuadres reales", () => {
    const data = buildDemo("pub", NOW);
    const ops = nightOpsOf(data);
    expect(ops.closes.length).toBeGreaterThan(5);
    const pending = closableNights(data, NOW);
    expect(pending.length).toBeGreaterThan(0);
    expect(ops.closes.some((c) => c.night === pending[0])).toBe(false);
    const report = nightsReport(data, NOW);
    expect(report.length).toBeGreaterThan(0);
  });

  it("la cuenta de la noche resta costes y comisiones de los ingresos", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = data.events.find((e) => e.id === "ev-past-sat") as ProEvent;
    const a = nightAccount(data, ev);
    expect(a.costsCents).toBe(90000 + 84000 + 42000 + 20000);
    expect(a.onlineCents + a.doorCents).toBe(eventStats(data, ev).revenueCents);
    expect(a.resultCents).toBe(a.incomeCents - a.costsCents - a.commissionsCents);
    expect(a.doorCashCents + a.doorCardCents).toBe(a.doorCents);
  });
});

describe("Noche: barra y pedidos", () => {
  const item = (id: string, patch: Partial<ProStockItem> = {}): ProStockItem => ({
    id,
    name: id,
    shelf: "Botellero",
    unit: "botella",
    par: 3,
    target: 8,
    packSize: 6,
    supplierId: "s1",
    costCents: 1000,
    ...patch,
  });
  const ops: ProNightOps = {
    ...EMPTY_NIGHT_OPS,
    suppliers: [{ id: "s1", name: "Licores", contact: "Merche Ivorra", phone: "622 518 977", supplies: "Licores" }],
    stockItems: [item("gin"), item("ron")],
    stockCounts: [
      { id: "c1", at: "2026-09-10T01:00:00.000Z", by: "x", night: "2026-09-09", counts: { gin: 8, ron: 8 } },
      { id: "c2", at: "2026-09-11T01:00:00.000Z", by: "x", night: "2026-09-10", counts: { gin: 7, ron: 7 } },
      { id: "c3", at: "2026-09-12T01:00:00.000Z", by: "x", night: "2026-09-11", counts: { gin: 6, ron: 6 } },
      { id: "c4", at: "2026-09-13T01:00:00.000Z", by: "x", night: "2026-09-12", counts: { gin: 2, ron: 5 } },
    ],
    orders: [
      {
        id: "o1",
        supplierId: "s1",
        at: "2026-09-12T09:00:00.000Z",
        lines: [{ itemId: "ron", qty: 6 }],
        status: "received",
        receivedAt: "2026-09-12T10:00:00.000Z",
      },
    ],
  };

  it("el consumo entre recuentos tiene en cuenta lo recibido", () => {
    expect(usageSeries(ops, "gin")).toEqual([1, 1, 4]);
    expect(usageSeries(ops, "ron")).toEqual([1, 1, 7]);
    expect(stockLevel(ops, "gin")).toBe(2);
  });

  it("marca lo que ha bajado bastante más de lo normal", () => {
    const rows = stockRows(ops);
    expect(rows.find((r) => r.item.id === "gin")).toMatchObject({ unusual: true, below: true, avgUsed: 1 });
    expect(rows.find((r) => r.item.id === "ron")?.unusual).toBe(true);
  });

  it("propone el pedido por proveedor en cajas completas y lo escribe", () => {
    const order = suggestedOrder(ops);
    expect(order).toHaveLength(1);
    expect(order[0].lines.map((l) => [l.item.id, l.qty, l.packs])).toEqual([["gin", 6, 1]]);
    const msg = orderMessage({ name: "The Loft Pub", owner: { name: "Marta Esteve", firstName: "Marta" } }, order[0].supplier, order[0].lines);
    expect(msg).toContain("Hola Merche");
    expect(msg).toContain("6 botellas de gin");
    const pending: ProNightOps = { ...ops, orders: [...ops.orders, { id: "o2", supplierId: "s1", at: "x", lines: [{ itemId: "gin", qty: 6 }], status: "sent" }] };
    expect(suggestedOrder(pending)).toHaveLength(0);
  });

  it("la demo del pub tiene una merma marcada y un pedido que proponer", () => {
    const data = buildDemo("pub", NOW);
    const rows = stockRows(nightOpsOf(data));
    expect(rows.some((r) => r.unusual)).toBe(true);
    expect(suggestedOrder(nightOpsOf(data)).length).toBeGreaterThan(0);
  });
});

describe("Noche: turnos", () => {
  it("cuenta los minutos aunque el turno cruce la medianoche", () => {
    expect(shiftMinutes({ fromMinute: 22 * 60, toMinute: 3 * 60 })).toBe(300);
    expect(shiftMinutes({ fromMinute: 20 * 60, toMinute: 23 * 60 })).toBe(180);
  });

  it("detecta noches sin puerta y copia la semana anterior", () => {
    const data = buildDemo("pub", NOW);
    const ops = nightOpsOf(data);
    const monday = addDays(nightOf(NOW), -weekdayIndex(nightOf(NOW)));
    const nights = openNightsOfWeek(data.space, monday);
    expect(nights.length).toBe(5);
    const gaps = rotaGaps(ops, nights);
    expect(gaps.some((g) => g.missing.includes("puerta"))).toBe(true);
    const nextWeek = addDays(monday, 7);
    let n = 0;
    const copied = copyPreviousWeek(ops, nextWeek, () => `x${n++}`);
    const inNext = copied.filter((s) => s.night >= nextWeek && s.night < addDays(nextWeek, 7));
    const inThis = ops.rota.filter((s) => s.night >= monday && s.night < nextWeek);
    expect(inNext.length).toBe(inThis.length);
    const text = rotaMessage(data.space, data.staff, ops, nights);
    expect(text).toContain("Turnos de The Loft Pub");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("Noche: vetados", () => {
  const ops: ProNightOps = {
    ...EMPTY_NIGHT_OPS,
    bans: [
      { id: "b1", name: "Raúl Ortiz Navarro", reason: "Pelea", since: "2026-09-01", until: null, by: "x" },
      { id: "b2", name: "Dani", reason: "DNI falso", since: "2026-09-01", until: null, by: "x" },
      { id: "b3", name: "Pepe Gil", reason: "Antiguo", since: "2025-01-01", until: "2026-01-01", by: "x" },
    ],
  };

  it("reconoce el nombre sin tildes ni mayúsculas y con más apellidos", () => {
    expect(banFor(ops, "raul ortiz navarro", NOW)?.id).toBe("b1");
    expect(banFor(ops, "Raúl Ortiz Navarro López", NOW)?.id).toBe("b1");
    expect(banFor(ops, "Raúl Ortiz", NOW)).toBeNull();
  });

  it("un nombre suelto solo coincide exacto y los vetos caducados no cuentan", () => {
    expect(banFor(ops, "Dani", NOW)?.id).toBe("b2");
    expect(banFor(ops, "Dani Pérez", NOW)).toBeNull();
    expect(banFor(ops, "Pepe Gil", NOW)).toBeNull();
  });

  it("en la demo, quien está vetado aparece en la lista del jueves", () => {
    const data = buildDemo("pub", NOW);
    const ops = nightOpsOf(data);
    const flagged = data.guests.filter((g) => banFor(ops, g.name, NOW));
    expect(flagged.length).toBeGreaterThan(0);
  });
});

describe("Noche: previsión, happy hour y cumpleaños", () => {
  it("prevé la noche con la asistencia real de noches iguales", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = focusEvent(data, NOW) as ProEvent;
    const f = nightForecast(data, ev, NOW);
    expect(f).not.toBeNull();
    expect(f?.expected).toBeGreaterThan(0);
    expect(f?.expected).toBeLessThanOrEqual(ev.capacity);
    expect(f?.bartenders).toBe(Math.ceil((f?.expected ?? 0) / 90));
  });

  it("sin noches pasadas no inventa una previsión", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = focusEvent(data, NOW) as ProEvent;
    expect(nightForecast({ ...data, events: [ev] }, ev, NOW)).toBeNull();
  });

  it("la happy hour se activa en su franja y la del jueves cruza la medianoche", () => {
    const data = buildDemo("pub", NOW);
    // Martes a las 21:00: la happy hour de 20:00 a 22:00 está activa.
    const tuesday = new Date(atLocal("2026-09-22", 21 * 60));
    expect(offerWindows(data, tuesday).active.map((w) => w.offer.title)).toContain("Happy hour universitaria");
    // Martes a las 19:00: empieza más tarde.
    const early = new Date(atLocal("2026-09-22", 19 * 60));
    expect(offerWindows(data, early).later.map((w) => w.offer.title)).toContain("Happy hour universitaria");
    // Viernes a las 0:15: sigue el jueves universitario (23:00 a 0:30).
    const lateThu = new Date(atLocal("2026-09-25", 15));
    expect(offerWindows(data, lateThu).active.map((w) => w.offer.title)).toContain("Jueves universitario");
  });

  it("lista los cumpleaños de la semana con consentimiento", () => {
    const data = buildDemo("pub", NOW);
    const list = upcomingBirthdays(data.clients, NOW, 7);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.every((b) => b.client.marketingConsent)).toBe(true);
    expect(list[0].inDays).toBeLessThanOrEqual(list[list.length - 1].inDays);
    const text = birthdayInvite(list[0].client, data.space, list[0].turns);
    expect(text).toContain("franky.es/n/the-loft");
  });
});

describe("Noche: noches que se repiten y calendario", () => {
  it("copia el evento a otra fecha con la misma hora local y sin ventas", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = data.events.find((e) => e.id === "ev-jueves") as ProEvent;
    // Cinco semanas después cruza el cambio de hora de octubre.
    const date = addDays(ev.date, 35);
    const copy = cloneEventTo(ev, date, "ev-copy", "serie");
    expect(copy.date).toBe(date);
    expect(localDate(copy.doorsOpen)).toBe(date);
    expect(copy.doorsOpen.slice(0, 10) <= date).toBe(true);
    expect(copy.tiers.every((t) => t.sold === 0)).toBe(true);
    expect(copy.checkedIn).toBe(0);
    expect(copy.seriesId).toBe("serie");
    expect(copy.crush).toBeUndefined();
    const hours = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
    expect(hours(copy.doorsOpen)).toBe(hours(ev.doorsOpen));
    expect(hours(copy.closes)).toBe(hours(ev.closes));
  });

  it("repite cada semana y se salta las fechas que ya tienen esa noche", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = data.events.find((e) => e.id === "ev-jueves") as ProEvent;
    const first = repeatWeekly(data, ev, 4, (i) => `r${i}`, "s1");
    expect(first.events).toHaveLength(4);
    expect(first.events.map((e) => weekdayIndex(e.date))).toEqual([3, 3, 3, 3]);
    const again = repeatWeekly({ ...data, events: [...data.events, ...first.events] }, ev, 4, (i) => `q${i}`, "s2");
    expect(again.events).toHaveLength(0);
    expect(again.skipped).toHaveLength(4);
  });

  it("conoce los festivos y las vísperas", () => {
    const h = holidaysOf(2026);
    expect(h["2026-10-12"]).toBe("Fiesta Nacional");
    expect(h["2026-04-03"]).toBe("Viernes Santo");
    expect(h["2026-04-06"]).toBe("Lunes de Pascua");
    expect(nightDateNotes("2026-10-11")).toEqual(["Víspera de festivo: Fiesta Nacional"]);
    expect(nightDateNotes("2026-10-09")).toEqual(["Festivo: Día de la Comunitat Valenciana"]);
    expect(nightDateNotes("2026-10-15")).toEqual([]);
  });
});

describe("Noche: RRPP", () => {
  it("controla el cupo de apuntados por noche", () => {
    const data = buildDemo("nightclub", NOW);
    const p = data.promoters[0];
    const ev = focusEvent(data, NOW) as ProEvent;
    const state = promoterCapState(data, p, ev.id);
    expect(state.max).toBe(80);
    expect(state.full).toBe(state.signedUp >= 80);
    const unlimited = promoterCapState(data, { ...p, cap: undefined }, ev.id);
    expect(unlimited.max).toBeNull();
    expect(unlimited.full).toBe(false);
  });

  it("escribe el recibo de liquidación y las filas del mes", () => {
    const data = buildDemo("nightclub", NOW);
    const p = data.promoters[0];
    const text = promoterReceipt(data, p, [{ eventId: "ev-past-sat", scanned: 30, commissionCents: 2750 }]);
    expect(text).toContain("Total: 27,50");
    expect(text).not.toMatch(/[\u2013\u2014]/);
    const rows = promoterMonthRows(data, nightOf(NOW).slice(0, 7));
    expect(rows[0][0]).toBe("RRPP");
    expect(rows.length).toBeGreaterThan(1);
  });
});

describe("Noche: Crush Live y demos", () => {
  it("Crush Live solo enseña cifras medidas", () => {
    const ev = { checkedIn: 300, crushLive: true } as ProEvent;
    expect(crushStats(ev, 500)).toEqual({ players: 0, matches: 0, live: true, known: false });
    expect(crushStats({ ...ev, crush: { players: 120, matches: 30 } }).known).toBe(true);
  });

  it.each(["pub", "nightclub"] as const)("la demo de %s trae operación de noche completa y estable", (id) => {
    const a = buildDemo(id, NOW);
    const ops = nightOpsOf(a);
    expect(ops.stockItems.length).toBeGreaterThan(8);
    expect(ops.suppliers.length).toBeGreaterThan(1);
    expect(ops.incidents.length).toBeGreaterThan(3);
    expect(ops.bans.length).toBeGreaterThan(1);
    expect(ops.rota.length).toBeGreaterThan(5);
    expect(a.menu.length).toBeGreaterThan(8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(buildDemo(id, NOW)));
    expect(JSON.stringify(ops)).not.toMatch(/[\u2013\u2014]/);
  });

  it("una noche sin datos de operación se lee con listas vacías", () => {
    const data = buildDemo("pub", NOW);
    const bare: ProData = { ...data, nightOps: undefined };
    expect(nightOpsOf(bare)).toEqual(EMPTY_NIGHT_OPS);
    expect(closableNights(bare, NOW).length).toBeGreaterThan(0);
  });
});
