import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, atLocal, localDate } from "@/lib/pro/format";
import type { ProBooking, ProData, ProMenuItem } from "@/lib/pro/types";
import type { ProBonoTemplate, ProCashClosing, ProTablesOps } from "@/lib/pro/tables-types";
import {
  activeBonosFor,
  bookingsToConfirm,
  consumeBono,
  emptyTablesOps,
  joinOptions,
} from "@/lib/pro/tables-ops";
import {
  allergenMatrix,
  allergensInNote,
  bonoHistory,
  bonoNudgeMessage,
  bonoSaving,
  bonoUnitCents,
  bonoUsageByMember,
  bonosByState,
  bonosToNudge,
  canAskReview,
  closingSummaryMessage,
  dailyMenuMessage,
  defaultStudySettings,
  droppedTables,
  groupsClosingSoon,
  groupsOn,
  lastClosingNote,
  leftoversOffer,
  leftoversWindow,
  marginAlerts,
  markContact,
  markDropped,
  recentDishes,
  rememberDailyMenu,
  rotaToday,
  safeDishes,
  sellBono,
  sellLeftovers,
  setShowcaseItem,
  showcaseCandidates,
  showcaseToday,
  stampCandidates,
  stampStatus,
  stampValidation,
  studyCount,
  weekReport,
} from "@/lib/pro/tables-day";

// Un martes de septiembre a media tarde: cafetería abierta, cena por llegar.
const NOW = new Date("2026-09-29T17:10:00+02:00");
const TODAY = localDate(NOW);
const DASHES = /[–—]/;

const template: ProBonoTemplate = {
  id: "bt1",
  name: "Bono 10 cafés",
  itemName: "Café con leche",
  uses: 10,
  priceCents: 1350,
  regularCents: 1600,
  active: true,
};

function item(id: string, name: string, extra: Partial<ProMenuItem> = {}): ProMenuItem {
  return {
    id,
    section: "Dulces",
    name,
    priceCents: 300,
    allergens: [],
    available: true,
    ...extra,
  };
}

describe("sello en un toque", () => {
  it("crea un sello sin importe y cuenta la tarjeta", () => {
    const v = stampValidation({ id: "v1", at: NOW.toISOString(), clientName: "Lucía Pérez" });
    expect(v).toMatchObject({ kind: "stamp", amountCents: 0, discountCents: 0 });
    const list = Array.from({ length: 10 }, (_, i) => ({ ...v, id: `v${i}` }));
    expect(stampStatus(list.slice(0, 7), "Lucía Pérez", 10)).toEqual({ stamps: 7, full: false, left: 3 });
    expect(stampStatus(list, "Lucía Pérez", 10).full).toBe(true);
    // Un premio vacía la tarjeta.
    const after = [...list, { ...v, id: "r", kind: "reward" as const, at: addDays(TODAY, 1) }];
    expect(stampStatus(after, "Lucía Pérez", 10).stamps).toBe(0);
  });

  it("busca habituales sin importar tildes y pone primero al último que vino", () => {
    const data = buildDemo("cafe", NOW);
    const needed = data.loyalty!.stampsNeeded;
    const all = stampCandidates(data, "", needed, 50);
    expect(all.length).toBeGreaterThan(3);
    for (let i = 1; i < all.length; i++)
      expect((all[i - 1].seen ?? "") >= (all[i].seen ?? "")).toBe(true);
    const someone = all[0].client.name;
    const plainQuery = someone
      .split(" ")[0]
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
    expect(stampCandidates(data, plainQuery, needed).some((c) => c.client.name === someone)).toBe(true);
  });
});

describe("bonos", () => {
  it("precio por uso, ahorro y venta de un bono personal", () => {
    expect(bonoUnitCents(template)).toBe(135);
    expect(bonoSaving(template)).toBe(250);
    const bono = sellBono({ id: "b1", template, at: NOW.toISOString(), buyer: "  Marta Soler " });
    expect(bono).toMatchObject({ clientName: "Marta Soler", paidCents: 1350, uses: 10, usedAt: [] });
    expect(bono.members).toBeUndefined();
  });

  it("un bono de grupo apunta quién gasta cada uso", () => {
    let bono = sellBono({
      id: "b2",
      template,
      at: NOW.toISOString(),
      buyer: "TFG de Teleco",
      members: ["Pau", "Aitana", "Pau", " "],
    });
    expect(bono.members).toEqual(["Pau", "Aitana"]);
    bono = consumeBono(bono, atLocal(TODAY, 16 * 60), "Pau");
    bono = consumeBono(bono, atLocal(TODAY, 16 * 60 + 5), "Aitana");
    bono = consumeBono(bono, atLocal(TODAY, 16 * 60 + 9), "Pau");
    expect(bono.usedBy).toEqual(["Pau", "Aitana", "Pau"]);
    expect(bonoHistory(bono)[0]).toMatchObject({ by: "Pau" });
    expect(bonoUsageByMember(bono)).toEqual([
      { name: "Pau", uses: 2 },
      { name: "Aitana", uses: 1 },
    ]);
    // Cualquier miembro lo encuentra al validar.
    const ops: ProTablesOps = { ...emptyTablesOps(), bonoTemplates: [template], bonos: [bono] };
    expect(activeBonosFor(ops, "aitana")).toHaveLength(1);
  });

  it("no descuenta de un bono gastado y separa vivos de gastados", () => {
    let bono = sellBono({ id: "b3", template: { ...template, uses: 2 }, at: NOW.toISOString(), buyer: "Hugo" });
    bono = consumeBono(consumeBono(bono, NOW.toISOString()), NOW.toISOString());
    expect(consumeBono(bono, NOW.toISOString())).toBe(bono);
    const ops: ProTablesOps = { ...emptyTablesOps(), bonos: [bono] };
    expect(bonosByState(ops)).toMatchObject({ live: [], spent: [bono] });
  });

  it("avisa de los bonos con un uso o parados tres semanas", () => {
    const old = sellBono({ id: "b4", template, at: atLocal(addDays(TODAY, -40), 9 * 60), buyer: "Irene Gil" });
    const last = { ...sellBono({ id: "b5", template, at: NOW.toISOString(), buyer: "Iván Soto" }), usedAt: Array(9).fill(NOW.toISOString()) };
    const fresh = sellBono({ id: "b6", template, at: NOW.toISOString(), buyer: "Nerea Vidal" });
    const ids = bonosToNudge({ ...emptyTablesOps(), bonos: [old, last, fresh] }, NOW).map((b) => b.id);
    expect(ids.sort()).toEqual(["b4", "b5"]);
    expect(bonoNudgeMessage(last, "Café con leche", "Café Hilo")).toContain("te queda 1 café con leche");
  });
});

describe("vitrina y sobras", () => {
  const menu = [item("m1", "Croissant", { priceCents: 180 }), item("m2", "Tarta de zanahoria", { priceCents: 350 }), item("m3", "Café solo", { section: "Cafés" })];

  it("propone solo lo que va a la vitrina", () => {
    expect(showcaseCandidates(menu).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("vende sobras: baja la vitrina y lo apunta como vendido", () => {
    let ops = setShowcaseItem(emptyTablesOps(), TODAY, "m1", 3);
    ops = setShowcaseItem(ops, TODAY, "m2", 1);
    const next = sellLeftovers(ops, { id: "w1", date: TODAY, at: NOW.toISOString(), item: menu[0], qty: 5 });
    const rows = showcaseToday(next, menu, TODAY);
    expect(rows.find((r) => r.item.id === "m1")).toMatchObject({ left: 0, soldLate: 3 });
    expect(next.waste[0]).toMatchObject({ fate: "vendido", qty: 3, item: "Croissant" });
    expect(next.waste[0].valueCents).toBeGreaterThan(0);
    // La vitrina de ayer no cuenta hoy.
    expect(showcaseToday(next, menu, addDays(TODAY, 1))).toEqual([]);
  });

  it("abre la franja de sobras a su hora y prepara la oferta", () => {
    const ops = { ...setShowcaseItem(emptyTablesOps(), TODAY, "m1", 4), leftoversFrom: 18 * 60 };
    const hours = { open: 7 * 60 + 30, close: 20 * 60 + 30 };
    expect(leftoversWindow(ops, hours, 17 * 60)).toMatchObject({ active: false, startsIn: 60 });
    const slot = leftoversWindow(ops, hours, 18 * 60 + 20)!;
    expect(slot.active).toBe(true);
    const offer = leftoversOffer(showcaseToday(ops, menu, TODAY), slot, 18 * 60 + 20)!;
    expect(offer).toMatchObject({ from: 18 * 60 + 30, to: 20 * 60 + 30, slots: 4, priceCents: 90 });
    expect(leftoversWindow({ ...ops, leftoversFrom: undefined }, hours, 19 * 60)).toBeNull();
    expect(leftoversWindow(ops, null, 19 * 60)).toBeNull();
  });
});

describe("sitio para estudiar", () => {
  it("el contador no pasa del aforo ni baja de cero", () => {
    const base = { ...defaultStudySettings({ open: 8 * 60, close: 21 * 60 }), seats: 3 };
    expect(studyCount(base, 5, NOW.toISOString()).occupied).toBe(3);
    expect(studyCount(base, -2, NOW.toISOString()).occupied).toBe(0);
    expect(base.fromMinute).toBe(15 * 60);
  });
});

describe("cierre", () => {
  const closing: ProCashClosing = {
    id: "c1",
    date: TODAY,
    closedAt: atLocal(TODAY, 20 * 60 + 40),
    cashCents: 42_300,
    cardCents: 51_020,
    bizumCents: 3_400,
    floatCents: 15_000,
    expectedCashCents: 27_500,
    tipsCents: 2_450,
    nextDayNote: "Falta leche de avena",
  };

  it("resume el día para el dueño con cifras apuntadas", () => {
    const text = closingSummaryMessage({
      spaceName: "Café Hilo",
      closing,
      closedBy: "Lucía",
      card: { count: 12, chargedCents: 3_840 },
      bonosUsed: 7,
      pending: { haccpPending: 2, wasteLogged: false, shoppingLines: 0 },
    });
    expect(text).toContain("Cierre de Café Hilo");
    expect(text).toMatch(/Total: 817,20/);
    expect(text).toMatch(/Caja: faltan 2\s€/);
    expect(text).toContain("APPCC del cierre (faltan 2)");
    expect(text).toContain("Para mañana: Falta leche de avena");
    expect(text).toContain("Cerró Lucía a las 20:40");
    expect(text).not.toMatch(DASHES);
  });

  it("la nota de ayer sale hoy y no la de hace una semana", () => {
    const ops = { ...emptyTablesOps(), closings: [{ ...closing, date: addDays(TODAY, -1) }] };
    expect(lastClosingNote(ops, TODAY)?.note).toBe("Falta leche de avena");
    expect(lastClosingNote({ ...ops, closings: [{ ...closing, date: addDays(TODAY, -7) }] }, TODAY)).toBeNull();
  });
});

describe("alérgenos", () => {
  const menu = [
    item("a", "Croquetas", { section: "Entrantes", allergens: ["gluten", "lacteos", "huevo"] }),
    item("b", "Ensalada", { section: "Entrantes" }),
    item("c", "Arroz a banda", { section: "Arroces", allergens: ["pescado", "crustaceos"] }),
    item("d", "Tarta", { section: "Postres", allergens: ["gluten"], available: false }),
  ];

  it("lee la nota de la reserva", () => {
    expect(allergensInNote("Una celíaca y otra sin lactosa")).toEqual(["gluten", "lacteos"]);
    expect(allergensInNote("Alergia al marisco")).toEqual(["crustaceos", "moluscos"]);
    expect(allergensInNote("Trona para un bebé")).toEqual([]);
  });

  it("dice qué puede tomar y arma la matriz de 14 columnas", () => {
    expect(safeDishes(menu, ["gluten"]).map((m) => m.id)).toEqual(["b", "c"]);
    const matrix = allergenMatrix(menu);
    expect(matrix.map((s) => s.section)).toEqual(["Entrantes", "Arroces", "Postres"]);
    expect(matrix[0].rows[0].has).toHaveLength(14);
    expect(matrix[0].rows[0].has.filter(Boolean)).toHaveLength(3);
  });
});

describe("menú del día en un minuto", () => {
  const day = (date: string, mains: string[]) => ({
    date,
    priceCents: 1400,
    studentPriceCents: 1200,
    starters: ["Gazpacho"],
    mains,
    desserts: ["Flan"],
    includes: "Pan y bebida",
    published: true,
  });

  it("recuerda los platos más repetidos y no repite los ya puestos", () => {
    const history = [day("2026-09-28", ["Arroz negro", "Dorada"]), day("2026-09-25", ["arroz negro"]), day("2026-09-24", ["Fideuà"])];
    expect(recentDishes(history, "mains")).toEqual(["Arroz negro", "Dorada", "Fideuà"]);
    expect(recentDishes(history, "mains", ["ARROZ NEGRO"])).toEqual(["Dorada", "Fideuà"]);
  });

  it("guarda uno por día y comparte el texto", () => {
    const ops = rememberDailyMenu(rememberDailyMenu(emptyTablesOps(), day(TODAY, ["A"])), day(TODAY, ["B"]));
    expect(ops.dailyMenuHistory).toHaveLength(1);
    expect(ops.dailyMenuHistory?.[0].mains).toEqual(["B"]);
    const text = dailyMenuMessage(day(TODAY, ["Arroz negro"]), "Casa Marea", "https://franky.es/n/casa-marea");
    expect(text).toMatch(/Menú del día en Casa Marea: 14\s€/);
    expect(text).toMatch(/Con Franky verificado: 12\s€/);
    expect(text).not.toMatch(DASHES);
  });
});

describe("servicio de mesas", () => {
  it("confirmar marca y no duplica contactos", () => {
    const ops = markContact(markContact(emptyTablesOps(), "r1", "remindedAt", "a"), "r1", "confirmedAt", "b");
    expect(ops.contacts).toEqual([{ bookingId: "r1", remindedAt: "a", confirmedAt: "b" }]);
  });

  it("la demo de restaurante tiene reservas que confirmar para mañana", () => {
    const data = buildDemo("restaurant", NOW);
    const list = bookingsToConfirm(data, data.tablesOps!, NOW);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((x) => x.state === "confirmed")).toBe(true);
  });

  it("encuentra la mesa caída de hoy y quién puede ocuparla", () => {
    const data = buildDemo("restaurant", NOW);
    const table = data.tables.find((t) => t.seats >= 4 && t.shape !== "bar")!;
    const dropped: ProBooking = {
      id: "x1",
      kind: "table",
      clientName: "Rubén Ortiz",
      resourceId: table.id,
      start: atLocal(TODAY, 21 * 60),
      end: atLocal(TODAY, 23 * 60),
      partySize: 4,
      status: "no_show",
      priceCents: 0,
      paidCents: 0,
      source: "phone",
    };
    const waiting: ProBooking = {
      ...dropped,
      id: "w1",
      clientName: "Nerea Vidal",
      resourceId: undefined,
      status: "requested",
      source: "walkin",
      partySize: 2,
      note: "tel. 611 222 333",
    };
    const withBoth: ProData = { ...data, bookings: [...data.bookings, dropped, waiting] };
    const list = droppedTables(withBoth, data.tablesOps!, NOW);
    const found = list.find((x) => x.booking.id === "x1")!;
    expect(found.seats).toBe(table.seats);
    expect(found.candidates[0]).toMatchObject({ phone: "611 222 333" });
    const handled = markDropped(data.tablesOps!, "x1", "waitlist", NOW.toISOString());
    expect(droppedTables(withBoth, handled, NOW).some((x) => x.booking.id === "x1")).toBe(false);
  });

  it("une mesas contando como libres las de la propia reserva", () => {
    const data = buildDemo("restaurant", NOW);
    const date = addDays(TODAY, 3);
    const options = joinOptions(data, date, 14 * 60, 105, 9);
    for (const set of options) {
      expect(set.reduce((a, t) => a + t.seats, 0)).toBeGreaterThanOrEqual(9);
      expect(new Set(set.map((t) => t.zone)).size).toBe(1);
    }
  });

  it("el grupo de hoy trae su recuento de platos y alergias", () => {
    const data = buildDemo("restaurant", NOW);
    const groups = groupsOn(data, data.tablesOps!, TODAY);
    expect(groups).toHaveLength(1);
    const tally = groups[0].tally!;
    expect(tally.answered).toBe(10);
    expect(tally.missing).toBe(2);
    expect(tally.allergies.map((a) => a.allergies)).toEqual(["Celiaquía", "Sin lactosa"]);
  });

  it("avisa del grupo del bar que cierra número mañana", () => {
    const data = buildDemo("bar", NOW);
    const soon = groupsClosingSoon(data, data.tablesOps!, TODAY);
    expect(soon.some((x) => x.request.id === "g4" && !x.today)).toBe(true);
  });

  it("solo pide reseña con permiso y una vez", () => {
    const data = buildDemo("restaurant", NOW);
    const client = data.clients.find((c) => c.phone && c.marketingConsent)!;
    const done: ProBooking = {
      id: "d1",
      kind: "table",
      clientId: client.id,
      clientName: client.name,
      start: atLocal(TODAY, 14 * 60),
      end: atLocal(TODAY, 15 * 60 + 45),
      partySize: 2,
      status: "done",
      priceCents: 0,
      paidCents: 0,
      source: "franky",
    };
    const ops = data.tablesOps!;
    expect(canAskReview(data, ops, done)).toBe(true);
    expect(canAskReview(data, markContact(ops, "d1", "reviewAskedAt", "x"), done)).toBe(false);
    expect(canAskReview(data, ops, { ...done, status: "confirmed" })).toBe(false);
  });

  it("el cuadrante dice quién trabaja hoy en orden", () => {
    const data = buildDemo("bar", NOW);
    const list = rotaToday(data.tablesOps!, data.staff, TODAY);
    for (let i = 1; i < list.length; i++) expect(list[i].from).toBeGreaterThanOrEqual(list[i - 1].from);
  });
});

describe("márgenes e informe", () => {
  it("avisa de los platos que un proveedor ha sacado del objetivo", () => {
    const data = buildDemo("bar", NOW);
    const alerts = marginAlerts(data.tablesOps!, data.menu);
    for (const a of alerts) {
      expect(a.foodCostPct).toBeGreaterThan(data.tablesOps!.targetFoodCostPct);
      expect(a.suggestedPriceCents).toBeGreaterThan(0);
    }
  });

  it("la semana suma solo los días cerrados y cuenta plantones", () => {
    const data = buildDemo("restaurant", NOW);
    const monday = addDays(TODAY, -1);
    const week = weekReport(data, data.tablesOps!, monday, NOW);
    expect(week.days.map((d) => d.date)).toEqual([monday, TODAY]);
    expect(week.totalCents).toBe(
      week.days.reduce((a, d) => a + (d.totalCents ?? 0), 0),
    );
    expect(week.noShows).toBeLessThanOrEqual(week.bookings);
  });
});

describe("demo de cafetería", () => {
  it("trae vitrina de hoy, bono de grupo y menús anteriores", () => {
    const data = buildDemo("cafe", NOW);
    const ops = data.tablesOps!;
    expect(showcaseToday(ops, data.menu, TODAY).length).toBeGreaterThanOrEqual(4);
    expect(ops.bonos.some((b) => b.members?.length)).toBe(true);
    expect(ops.dailyMenuHistory?.length).toBeGreaterThan(5);
    expect(ops.ownerPhone).toBeTruthy();
  });
});
