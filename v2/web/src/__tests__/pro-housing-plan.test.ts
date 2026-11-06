import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate } from "@/lib/pro/format";
import type { ProData } from "@/lib/pro/types";
import { courseRange, housingOpsOf, monthKey, renewalState, seasonMoment } from "@/lib/pro/housing-ops";
import {
  accountsSummary,
  addExpense,
  addUtilityBill,
  answerRenewal,
  courseLabel,
  courseSummary,
  expensesByMonth,
  lastClosedMonth,
  launchSeason,
  monthlyOccupancy,
  offerGapToLead,
  ownerStatements,
  removeExpense,
  renewalBoard,
  seasonPlan,
  segmentBox,
  segmentDaysInMonth,
  sendRenewalOffers,
  setSummer,
  settleOwner,
  statementBalance,
  statementMessage,
  statementMonth,
  waitlist,
  freedRoomText,
  markWaitlistNotified,
} from "@/lib/pro/housing-plan";

/* Curso, temporada, renovaciones y cuentas del motor de vivienda. */
const now = new Date("2026-09-27T09:30:00Z");
const today = localDate(now);

const agency = (): ProData => buildDemo("agency", now);
const landlord = (): ProData => buildDemo("landlord", now);

describe("curso de un vistazo", () => {
  it("nombra el curso como en la universidad", () => {
    expect(courseLabel(2026)).toBe("2026/27");
  });

  it("coloca cada tramo dentro de la barra del curso", () => {
    const range = courseRange(2026);
    expect(segmentBox(range, range)).toEqual({ left: 0, width: 100 });
    const oct = segmentBox({ from: "2026-10-01", to: "2026-10-31" }, range);
    expect(oct.left).toBeGreaterThan(8);
    expect(oct.left + oct.width).toBeLessThanOrEqual(100);
  });

  it("cuenta los días de un tramo que caen en cada mes", () => {
    expect(segmentDaysInMonth({ from: "2026-09-20", to: "2026-10-05" }, "2026-09")).toBe(11);
    expect(segmentDaysInMonth({ from: "2026-09-20", to: "2026-10-05" }, "2026-10")).toBe(5);
    expect(segmentDaysInMonth({ from: "2026-09-20", to: "2026-10-05" }, "2026-11")).toBe(0);
    expect(segmentDaysInMonth({ from: "2027-02-01", to: "2027-03-31" }, "2027-02")).toBe(28);
  });

  it("da la ocupación de los doce meses entre 0 y 100", () => {
    const months = monthlyOccupancy(agency(), 2026);
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2026-09");
    for (const m of months) {
      expect(m.pct).toBeGreaterThanOrEqual(0);
      expect(m.pct).toBeLessThanOrEqual(100);
    }
  });

  it("resume huecos y habitaciones de verano", () => {
    const s = courseSummary(agency(), 2026);
    expect(s.rooms).toBeGreaterThan(0);
    expect(s.summerRooms).toBeGreaterThan(0);
    expect(s.occupancyPct).toBeGreaterThanOrEqual(0);
  });

  it("propone una habitación a un interesado y abre el verano", () => {
    const d = agency();
    const p = d.properties[0];
    const r = p.rooms[0];
    const lead = d.leads.find((l) => l.stage === "new")!;
    const next = offerGapToLead(d, lead.id, p.id, r.id);
    expect(next.leads.find((l) => l.id === lead.id)).toMatchObject({ propertyId: p.id, roomId: r.id });
    const summer = setSummer(d, p.id, r.id, true);
    expect(summer.properties[0].rooms[0].summer).toBe(true);
  });
});

describe("campaña de temporada", () => {
  it("en septiembre toca preparar febrero", () => {
    expect(seasonMoment(now).id).toBe("february");
    expect(seasonMoment(new Date("2027-04-10T10:00:00Z")).id).toBe("september");
  });

  it("publica solo los pisos con los datos obligatorios y deja la campaña en marcha", () => {
    const d = agency();
    const moment = seasonMoment(now);
    const plan = seasonPlan(d, moment);
    const next = launchSeason(d, moment, now);
    if (!plan.ready.length) {
      expect(next).toBe(d);
      return;
    }
    const after = seasonPlan(next, moment);
    expect(after.launched?.status).toBe("live");
    for (const p of plan.ready) expect(next.properties.find((x) => x.id === p.id)?.published).toBe(true);
    for (const b of plan.blocked) expect(next.properties.find((x) => x.id === b.property.id)?.published).toBe(b.property.published);
    // Lanzarla dos veces no duplica la campaña.
    const twice = launchSeason(next, moment, now);
    expect(twice.campaigns.length).toBe(next.campaigns.length);
  });
});

describe("renovaciones en bloque", () => {
  it("manda la oferta solo a quien aún no se le ha preguntado", () => {
    const d = agency();
    const board = renewalBoard(d, now);
    const ids = board.all.map((t) => t.id);
    const next = sendRenewalOffers(d, ids, 3, now);
    const after = renewalBoard(next, now);
    expect(after.not_asked).toHaveLength(0);
    expect(after.waiting.length).toBe(board.waiting.length + board.not_asked.length);
    // Quien ya había contestado conserva su respuesta.
    for (const t of board.staying) expect(renewalState(next.tenants.find((x) => x.id === t.id)!)).toBe("staying");
  });

  it("si no sigue, su habitación sale como libre al acabar el contrato", () => {
    const d = agency();
    const t = d.tenants.find((x) => {
      const room = d.properties.find((p) => p.id === x.propertyId)?.rooms.find((r) => r.id === x.roomId);
      return room?.status === "occupied" && room.tenantId === x.id && !x.leavingAt;
    })!;
    const next = answerRenewal(d, t.id, "no", now);
    const room = next.properties.find((p) => p.id === t.propertyId)!.rooms.find((r) => r.id === t.roomId)!;
    expect(room.status).toBe("leaving");
    expect(room.availableFrom).toBe(addDays(t.contractEnd.slice(0, 10), 1));
    expect(renewalState(next.tenants.find((x) => x.id === t.id)!)).toBe("leaving");
  });
});

describe("cuentas", () => {
  it("añade y quita gastos", () => {
    const d = landlord();
    const before = housingOpsOf(d).expenses.length;
    const next = addExpense(d, { propertyId: d.properties[0].id, date: today, category: "reparacion", concept: "Grifo", amountCents: 6000 }, "e-test");
    expect(housingOpsOf(next).expenses).toHaveLength(before + 1);
    expect(expensesByMonth(next, 2026)[8]).toBeGreaterThanOrEqual(6000);
    expect(housingOpsOf(removeExpense(next, "e-test")).expenses).toHaveLength(before);
  });

  it("guarda una factura de suministros", () => {
    const d = landlord();
    const next = addUtilityBill(
      d,
      { propertyId: d.properties[0].id, kind: "gas", from: "2026-08-01", to: "2026-08-31", amountCents: 4200, split: "equal" },
      "u-test",
    );
    expect(housingOpsOf(next).utilities.some((u) => u.id === "u-test")).toBe(true);
  });

  it("resume el mes y el año", () => {
    const s = accountsSummary(agency(), now);
    expect(s.month).toBe(monthKey(today));
    expect(s.paidCents).toBeLessThanOrEqual(s.expectedCents);
    expect(s.yearExpensesCents).toBeGreaterThan(0);
  });

  it("liquida a mes vencido y marca el mes como liquidado", () => {
    const d = agency();
    const month = lastClosedMonth(now);
    expect(month).toBe("2026-08");
    const list = ownerStatements(d, month, now);
    expect(list.length).toBeGreaterThan(0);
    const pending = list.find((s) => !s.settled)!;
    const next = settleOwner(d, pending.owner.id, month);
    expect(ownerStatements(next, month, now).find((s) => s.owner.id === pending.owner.id)?.settled).toBe(true);
  });

  it("un propietario particular no tiene liquidaciones a terceros", () => {
    expect(ownerStatements(landlord(), lastClosedMonth(now), now)).toHaveLength(0);
  });
});

describe("lista de espera", () => {
  it("guarda a quien se le dijo que no había hueco y solo si llega al precio", () => {
    const d = agency();
    const list = waitlist(d);
    expect(list.length).toBeGreaterThan(0);
    for (const l of list) expect(l.replies?.some((r) => r.id === "full")).toBe(true);
    const cheap = { ...d.properties[0].rooms[0], priceCents: 1 };
    const pricey = { ...d.properties[0].rooms[0], priceCents: 999999 };
    expect(waitlist(d, cheap).length).toBe(list.length);
    expect(waitlist(d, pricey)).toHaveLength(0);
  });

  it("el aviso lleva habitación, piso, fecha y precio", () => {
    const d = agency();
    const lead = waitlist(d)[0];
    const property = d.properties[0];
    const room = property.rooms[0];
    const text = freedRoomText(d, lead, property, room, "2026-10-15");
    expect(text).toContain(lead.name.split(" ")[0]);
    expect(text).toContain(property.title);
    expect(text).toContain("15 oct");
    const next = markWaitlistNotified(d, lead.id, now.toISOString());
    expect(next.leads.find((l) => l.id === lead.id)?.lastContactAt).toBe(now.toISOString());
  });
});

describe("liquidación con gastos mayores que las rentas", () => {
  it("no pide transferir un número negativo", () => {
    const d = agency();
    const s = ownerStatements(d, lastClosedMonth(now), now)[0];
    const owes = { ...s, rentCents: 0, feeCents: 0, expensesCents: 5000, netCents: -5000 };
    expect(statementBalance(owes)).toEqual({ label: "A su cargo", cents: 5000, owes: true });
    expect(statementMessage(owes, "agosto 2026")).toContain("a tu cargo");
    const pays = { ...s, netCents: 12000 };
    expect(statementBalance(pays).label).toBe("A transferir");
    expect(statementMessage(pays, "agosto 2026")).toContain("Te transferimos");
  });

  it("abre el último mes cerrado si ese mes hubo rentas", () => {
    const d = agency();
    const month = statementMonth(d, now);
    expect(["2026-08", "2026-09"]).toContain(month);
    const empty = { ...d, tenants: [] };
    expect(statementMonth(empty, now)).toBe("2026-08");
  });
});
