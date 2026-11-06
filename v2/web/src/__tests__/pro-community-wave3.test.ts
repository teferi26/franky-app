import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import type {
  CommunityActivity,
  CommunityItem,
  CommunityMerchOrder,
  ProCommunityOps,
} from "@/lib/pro/community-types";
import {
  activityAttendees,
  communityLedger,
  communityOps,
  emptyCommunityOps,
  ledgerCsv,
  withCommunityOps,
} from "@/lib/pro/community";
import {
  defaultInstallments,
  enableTrip,
  markTripReminded,
  missingTravellerData,
  payEverything,
  payInstallment,
  setInstallments,
  setTraveller,
  travellerMoney,
  travellersCsv,
  tripGroupMessage,
  tripIncome,
  tripReminderMessage,
  tripSummary,
  undoInstallment,
} from "@/lib/pro/community-trips";
import {
  currentLoan,
  inventoryCsv,
  inventoryDocumentBody,
  inventoryNumbers,
  itemState,
  lendItem,
  loanReminderMessage,
  loansAtRisk,
  overdueLoans,
  restoreItem,
  retireItem,
  returnItem,
  saveItem,
} from "@/lib/pro/community-inventory";
import {
  addMerchLine,
  merchCallMessage,
  merchIncomeId,
  merchOrderCsv,
  merchReminderMessage,
  merchSummary,
  placeMerchOrder,
  removeMerchLine,
  reopenMerchOrder,
  saveMerchOrder,
  setLineDelivered,
  setLinePaid,
  sizeTotals,
  supplierOrderText,
} from "@/lib/pro/community-merch";
import { communityTodayItems } from "@/lib/pro/community-today";

// Un sábado de octubre, igual que el resto de pruebas del motor.
const now = new Date("2026-10-03T10:00:00.000Z");
const today = "2026-10-03";
const demo = () => buildDemo("community", now);
const LONG_DASH = /[–—]/;
const at = "2026-10-03T10:00:00.000Z";

function trip(extra: Partial<CommunityActivity> = {}): CommunityActivity {
  return {
    id: "v1",
    title: "Viaje a Granada",
    date: "2026-10-30T06:00:00.000Z",
    place: "Parada del campus",
    capacity: 40,
    registered: 3,
    checkedIn: 0,
    priceCents: 12000,
    status: "published",
    kind: "viaje",
    trip: {
      installments: [
        { id: "i1", label: "Señal", cents: 4000, due: "2026-10-01" },
        { id: "i2", label: "Resto", cents: 8000, due: "2026-10-23" },
      ],
      payments: [],
    },
    ...extra,
  };
}

/* ------------------------------------------------------------------ */

describe("viajes con pagos a plazos", () => {
  it("propone señal de un tercio redondeada y el resto una semana antes", () => {
    const list = defaultInstallments(14500, "2026-10-30T06:00:00.000Z", today, "x");
    expect(list.map((i) => i.cents)).toEqual([5000, 9500]);
    expect(list[0].due).toBe("2026-10-06");
    expect(list[1].due).toBe("2026-10-23");
    expect(list.reduce((a, i) => a + i.cents, 0)).toBe(14500);
  });

  it("si el viaje está muy cerca, todo vence el día antes", () => {
    const list = defaultInstallments(3000, "2026-10-05T06:00:00.000Z", today, "x");
    expect(list.every((i) => i.due <= "2026-10-04")).toBe(true);
    expect(defaultInstallments(0, "2026-10-30T06:00:00.000Z", today, "x")).toEqual([]);
  });

  it("activar el pago a plazos conserva el precio", () => {
    const a = enableTrip({ ...trip(), trip: undefined, priceCents: 9000 }, today);
    expect(a.trip?.installments.length).toBe(2);
    expect(a.priceCents).toBe(9000);
    // Activarlo dos veces no cambia nada.
    expect(enableTrip(a, today)).toBe(a);
  });

  it("sabe quién va atrasado, al día o con todo pagado", () => {
    let a = trip();
    expect(travellerMoney(a.trip!, "p1", today).state).toBe("atrasado");
    a = payInstallment(a, "p1", "i1", "bizum", at);
    const m = travellerMoney(a.trip!, "p1", today);
    expect(m.state).toBe("al_dia");
    expect(m.paidCents).toBe(4000);
    expect(m.next?.id).toBe("i2");
    a = payEverything(a, "p2", "efectivo", at);
    expect(travellerMoney(a.trip!, "p2", today).state).toBe("pagado");
    // Pagar dos veces el mismo plazo no duplica el cobro.
    a = payInstallment(a, "p1", "i1", "bizum", at);
    expect(a.trip!.payments.filter((p) => p.attendeeId === "p1")).toHaveLength(1);
  });

  it("resume el viaje por plazo y separa lo cobrado por Franky de lo cobrado a mano", () => {
    let a = trip();
    a = payInstallment(a, "p1", "i1", "franky", at);
    a = payEverything(a, "p2", "bizum", at);
    const s = tripSummary(a.trip!, ["p1", "p2", "p3"], today);
    expect(s.collectedCents).toBe(16000);
    expect(s.expectedCents).toBe(36000);
    expect(s.late).toBe(1);
    expect(s.paidInFull).toBe(1);
    expect(s.byInstallment[0]).toMatchObject({ paid: 2, due: true });
    expect(tripIncome(a)).toEqual({ frankyCents: 4000, handCents: 12000 });
    expect(tripIncome({ ...a, trip: undefined })).toBeNull();
  });

  it("deshacer un pago y cambiar plazos descarta los pagos de plazos que ya no existen", () => {
    let a = payEverything(trip(), "p1", "bizum", at);
    a = undoInstallment(a, "p1", "i2");
    expect(travellerMoney(a.trip!, "p1", today).paidCents).toBe(4000);
    a = setInstallments(a, [
      { id: "i1", label: "Señal", cents: 5000, due: "2026-10-01" },
      { id: "i3", label: "Resto", cents: 0, due: "2026-10-20" },
      { id: "i4", label: " ", cents: 7000, due: "2026-10-20" },
    ]);
    expect(a.priceCents).toBe(12000);
    expect(a.trip!.installments.map((i) => i.label)).toEqual(["Señal", "Plazo"]);
    expect(a.trip!.payments).toHaveLength(1);
  });

  it("guarda los datos del seguro limpios y avisa de los que faltan", () => {
    let a = setTraveller(trip(), "p1", { idDoc: " 12345678z ", phone: "", emergency: "Madre, 600 111 222" });
    expect(a.trip!.travellers!.p1).toEqual({ idDoc: "12345678Z", emergency: "Madre, 600 111 222" });
    a = markTripReminded(a, ["p2"], at);
    expect(a.trip!.remindedAt!.p2).toBe(at);
    const people = [
      { id: "p1", name: "Ana Pérez", studies: "Derecho", university: "UA", member: true, viaFranky: false, verified: true },
      { id: "p2", name: "=HYPERLINK(1)", studies: "ADE", university: "UA", member: false, viaFranky: true, verified: true },
    ];
    expect(missingTravellerData(a, people).map((p) => p.id)).toEqual(["p2"]);
    const csv = travellersCsv(a, people, today);
    expect(csv).toContain('"12345678Z"');
    // Protegido contra fórmulas en Excel.
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });

  it("el recordatorio dice lo vencido con importe; el aviso al grupo, el próximo plazo", () => {
    const a = trip();
    const late = tripReminderMessage({
      name: "Ana Pérez",
      activity: a,
      money: travellerMoney(a.trip!, "p1", today),
      spaceName: "Hilo Rojo",
      howToPay: "Por Bizum a Pablo.",
    });
    expect(late).toContain("Hola Ana");
    expect(late).toMatch(/señal de 40\s€/);
    expect(late).not.toMatch(LONG_DASH);
    const group = tripGroupMessage(a, today, "Por Bizum a Pablo.");
    expect(group).toContain("resto");
    expect(group).toMatch(/80\s€/);
  });

  it("la caja suma los plazos cobrados y no el precio por inscrito", () => {
    const base = buildDemo("community", now);
    const a = payEverything(trip({ id: "v9", date: "2026-10-20T06:00:00.000Z" }), "p1", "bizum", at);
    const withTrip: ProData = { ...base, activities: [...base.activities, payInstallment(a, "p2", "i1", "franky", at)] };
    const before = communityLedger(base, now);
    const after = communityLedger(withTrip, now);
    expect(after.incomes.find((l) => l.key === "viajes")?.cents ?? 0).toBe(
      (before.incomes.find((l) => l.key === "viajes")?.cents ?? 0) + 12000,
    );
    const tickets = (l: typeof before) => l.incomes.find((x) => x.key === "entradas")?.cents ?? 0;
    expect(tickets(after) - tickets(before)).toBe(4000);
    expect(ledgerCsv(after, communityOps(withTrip).movements, withTrip.activities as CommunityActivity[])).toContain(
      "Cobrado a mano",
    );
  });
});

/* ------------------------------------------------------------------ */

function ops(items: CommunityItem[]): ProCommunityOps {
  return { ...emptyCommunityOps(), inventory: items };
}

const projector: CommunityItem = {
  id: "p",
  name: "Proyector",
  category: "imagen",
  units: 1,
  valueCents: 50000,
  location: "Local 3",
  loans: [],
};

describe("material y préstamos", () => {
  it("presta, devuelve y guarda el historial", () => {
    let o = lendItem(ops([projector]), "p", { id: "l1", holder: " Marcos ", from: at, due: "2026-10-05" });
    let item = o.inventory![0];
    expect(currentLoan(item)?.holder).toBe("Marcos");
    expect(itemState(item, today)).toBe("prestado");
    expect(itemState(item, "2026-10-06")).toBe("atrasado");
    // Prestarlo a otra persona cierra el préstamo anterior.
    o = lendItem(o, "p", { id: "l2", holder: "Irene", from: "2026-10-04T10:00:00.000Z" });
    item = o.inventory![0];
    expect(item.loans).toHaveLength(2);
    expect(item.loans[1].returnedAt).toBe("2026-10-04T10:00:00.000Z");
    o = returnItem(o, "p", at);
    expect(currentLoan(o.inventory![0])).toBeUndefined();
    // Sin nombre no se presta.
    expect(lendItem(o, "p", { id: "l3", holder: "  ", from: at })).toBe(o);
  });

  it("da de baja sin borrar y se puede recuperar", () => {
    let o = lendItem(ops([projector]), "p", { id: "l1", holder: "Marcos", from: at });
    o = retireItem(o, "p", at, "Roto");
    expect(itemState(o.inventory![0], today)).toBe("baja");
    expect(currentLoan(o.inventory![0])).toBeUndefined();
    expect(inventoryNumbers(o.inventory!, today).items).toBe(0);
    o = restoreItem(o, "p");
    expect(itemState(o.inventory![0], today)).toBe("en_local");
  });

  it("cuenta unidades, valor y atrasos", () => {
    let o = saveItem(ops([projector]), { ...projector, id: "t", name: " Trípodes ", units: 3, valueCents: 3500, location: " Caja " });
    o = lendItem(o, "p", { id: "l1", holder: "Marcos", from: at, due: "2026-10-01" });
    const n = inventoryNumbers(o.inventory!, today);
    expect(n).toMatchObject({ items: 2, units: 4, valueCents: 60500, lent: 1, late: 1, holders: ["Marcos"] });
    expect(o.inventory![0].name).toBe("Trípodes");
    expect(overdueLoans(o.inventory!, today).map((x) => x.item.id)).toEqual(["p"]);
  });

  it("marca el material en casa de la junta saliente antes del relevo", () => {
    const d = demo();
    const leaving = d.board[1].name;
    const next = withCommunityOps(d, (o) => ({
      ...lendItem({ ...o, inventory: [projector] }, "p", { id: "l1", holder: leaving, from: at }),
      scheduledBoard: d.board.filter((b) => b.name !== leaving),
    }));
    const risk = loansAtRisk(next);
    expect(risk).toHaveLength(1);
    expect(risk[0].reason).toBe("Deja la junta");
  });

  it("exporta el inventario protegido y lo escribe para el archivo", () => {
    const o = lendItem(ops([{ ...projector, name: "+Proyector" }]), "p", { id: "l1", holder: "Marcos", from: at });
    const csv = inventoryCsv(o.inventory!, today);
    expect(csv.split("\n")[0]).toContain("Dónde se guarda");
    expect(csv).toContain(`"'+Proyector"`);
    const body = inventoryDocumentBody(o.inventory!, "Hilo Rojo", today);
    expect(body).toContain("lo tiene Marcos");
    expect(body).not.toMatch(LONG_DASH);
    const msg = loanReminderMessage({ item: projector, loan: currentLoan(o.inventory![0])!, spaceName: "Hilo Rojo", today });
    expect(msg).toContain("Hola Marcos");
  });
});

/* ------------------------------------------------------------------ */

const hoodie: CommunityMerchOrder = {
  id: "o1",
  title: "Sudadera 26/27",
  garment: "Sudadera con capucha",
  priceCents: 2800,
  unitCostCents: 1750,
  sizes: ["S", "M", "L"],
  closesOn: "2026-10-10",
  status: "abierto",
  lines: [],
};

describe("pedidos de merchandising", () => {
  const line = (id: string, name: string, size: string, qty = 1) => ({ id, name, size, qty });

  it("apunta tallas, suma repetidas y cuenta por talla", () => {
    let o = saveMerchOrder(emptyCommunityOps(), hoodie);
    o = addMerchLine(o, "o1", line("a", "Ana", "M"));
    o = addMerchLine(o, "o1", line("b", "Ana", "M"));
    o = addMerchLine(o, "o1", line("c", "Luis", "XL", 2));
    o = addMerchLine(o, "o1", line("d", " ", "S"));
    const order = o.merch![0];
    expect(order.lines).toHaveLength(2);
    expect(sizeTotals(order)).toEqual([
      { size: "S", qty: 0 },
      { size: "M", qty: 2 },
      { size: "L", qty: 0 },
      { size: "XL", qty: 2 },
    ]);
    expect(supplierOrderText(order, "Hilo Rojo")).toContain("Total: 4 unidades.");
  });

  it("lo cobrado entra en la caja como un único ingreso que se ajusta solo", () => {
    let o = saveMerchOrder(emptyCommunityOps(), hoodie);
    o = addMerchLine(o, "o1", line("a", "Ana", "M"));
    o = addMerchLine(o, "o1", line("b", "Luis", "L", 2));
    o = setLinePaid(o, "o1", "a", { at, via: "bizum" });
    o = setLinePaid(o, "o1", "b", { at, via: "efectivo" });
    const income = () => o.movements.filter((m) => m.id === merchIncomeId("o1"));
    expect(income()).toHaveLength(1);
    expect(income()[0]).toMatchObject({ kind: "income", category: "venta", amountCents: 8400 });
    o = setLinePaid(o, "o1", "b", null);
    expect(income()[0].amountCents).toBe(2800);
    o = removeMerchLine(o, "o1", "a");
    expect(income()).toHaveLength(0);
    const s = merchSummary(o.merch![0]);
    expect(s).toMatchObject({ units: 2, paidCents: 0, pendingCents: 5600, marginCents: 2100 });
  });

  it("encargar apunta el gasto del proveedor; reabrir lo quita", () => {
    let o = saveMerchOrder(emptyCommunityOps(), hoodie);
    // Sin nadie apuntado no se encarga.
    expect(placeMerchOrder(o, "o1", at, { movementId: "mv" })).toBe(o);
    o = addMerchLine(o, "o1", line("a", "Ana", "M", 4));
    o = placeMerchOrder(o, "o1", at, { movementId: "mv", paidBy: "Pablo Esteve" });
    expect(o.merch![0].status).toBe("encargado");
    expect(o.movements.find((m) => m.id === "mv")).toMatchObject({
      kind: "expense",
      amountCents: 7000,
      category: "material",
      paidBy: "Pablo Esteve",
    });
    o = setLineDelivered(o, "o1", "a", at);
    expect(o.merch![0].status).toBe("entregado");
    o = setLineDelivered(o, "o1", "a", null);
    expect(o.merch![0].status).toBe("encargado");
    o = reopenMerchOrder(o, "o1");
    expect(o.merch![0].status).toBe("abierto");
    expect(o.movements.some((m) => m.id === "mv")).toBe(false);
  });

  it("mensajes y lista de entrega sin guiones largos y sin fórmulas", () => {
    const order = { ...hoodie, lines: [{ id: "a", name: "@Ana Pérez", size: "M", qty: 1, phone: "600111222" }] };
    expect(merchCallMessage(order, "Hilo Rojo")).toContain("Tallas: S, M, L.");
    const msg = merchReminderMessage({ line: order.lines[0], order, spaceName: "Hilo Rojo", howToPay: "Bizum." });
    expect(msg).toMatch(/28\s€/);
    expect(msg).not.toMatch(LONG_DASH);
    expect(merchOrderCsv(order)).toContain(`"'@Ana Pérez"`);
  });
});

/* ------------------------------------------------------------------ */

describe("la demo y el Resumen", () => {
  it("siembra un viaje a plazos con atrasados y datos por completar", () => {
    const d = demo();
    const a = (d.activities as CommunityActivity[]).find((x) => x.id === "a-sitges")!;
    expect(a.trip).toBeDefined();
    const people = activityAttendees(a, d.communityMembers);
    const s = tripSummary(a.trip!, people.map((p) => p.id), today);
    expect(s.late).toBe(4);
    expect(s.travellers).toBe(34);
    expect(missingTravellerData(a, people).length).toBeGreaterThan(0);
  });

  it("siembra material con un préstamo atrasado y pedidos que cuadran con la caja", () => {
    const d = demo();
    const o = communityOps(d);
    expect(overdueLoans(o.inventory ?? [], today)).toHaveLength(1);
    for (const order of o.merch ?? []) {
      const s = merchSummary(order);
      const income = o.movements.find((m) => m.id === merchIncomeId(order.id));
      expect(income?.amountCents ?? 0).toBe(s.paidCents);
    }
  });

  it("el Resumen avisa del viaje atrasado, del material y del pedido", () => {
    const items = communityTodayItems(demo(), now);
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("trip");
    expect(kinds).toContain("loans");
    expect(kinds).toContain("merch");
    const trip = items.find((i) => i.kind === "trip")!;
    expect(trip.query).toBe("a=a-sitges&pestana=viaje");
    expect(items.find((i) => i.kind === "loans")!.section).toBe("material");
    for (const i of items) expect(`${i.title} ${i.detail}`).not.toMatch(LONG_DASH);
  });

  it("un espacio sin operación no rompe nada", () => {
    const d = { ...demo(), communityOps: undefined };
    expect(loansAtRisk(d)).toEqual([]);
    expect(() => communityTodayItems(d, now)).not.toThrow();
  });
});
