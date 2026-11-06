import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, atLocal, localDate } from "@/lib/pro/format";
import type { ProBooking, ProDailyMenu, ProData } from "@/lib/pro/types";
import type { ProPickupOrder, ProTablesOps } from "@/lib/pro/tables-types";
import { emptyTablesOps, mondayOf } from "@/lib/pro/tables-ops";
import {
  coversByHour,
  dailyMenuCost,
  dishCostOf,
  examStudyHours,
  nextPickupSlot,
  partyBand,
  pickupLoad,
  pickupPeak,
  pickupSlotOf,
  pickupSlots,
  seasonMoments,
  setDishCost,
  tableStay,
  tableTurnover,
  turnoverHeadline,
  weekLabor,
  weekReportMessage,
} from "@/lib/pro/tables-insights";

// Un martes de septiembre a media tarde.
const NOW = new Date("2026-09-29T17:10:00+02:00");
const TODAY = localDate(NOW);
const DASHES = /[–—]/;

function order(id: string, minute: number, extra: Partial<ProPickupOrder> = {}): ProPickupOrder {
  return {
    id,
    kind: "pickup",
    clientName: `Cliente ${id}`,
    lines: [{ name: "Café con leche", qty: 1, priceCents: 160 }],
    pickupAt: atLocal(TODAY, minute),
    status: "new",
    createdAt: NOW.toISOString(),
    source: "franky",
    ...extra,
  };
}

function opsWith(orders: ProPickupOrder[], capacity?: number): ProTablesOps {
  return { ...emptyTablesOps(), orders, pickupCapacity: capacity };
}

describe("franjas de recogida", () => {
  it("agrupa los pedidos de hoy en franjas de 10 minutos sin contar cancelados ni encargos", () => {
    const ops = opsWith([
      order("a", 8 * 60 + 31),
      order("b", 8 * 60 + 39),
      order("c", 8 * 60 + 40),
      order("d", 8 * 60 + 35, { status: "cancelled" }),
      order("e", 8 * 60 + 33, { kind: "encargo" }),
    ]);
    const load = pickupLoad(ops, TODAY);
    expect(load.get(8 * 60 + 30)).toBe(2);
    expect(load.get(8 * 60 + 40)).toBe(1);
    expect(pickupSlotOf(8 * 60 + 39)).toBe(8 * 60 + 30);
  });

  it("marca llena una franja al llegar al límite y propone la siguiente con sitio", () => {
    const ops = opsWith(
      [order("a", 8 * 60 + 30), order("b", 8 * 60 + 32), order("c", 8 * 60 + 41), order("d", 8 * 60 + 44)],
      2,
    );
    const slots = pickupSlots(ops, TODAY, 8 * 60 + 30, 9 * 60);
    expect(slots.map((s) => s.full)).toEqual([true, true, false]);
    expect(nextPickupSlot(ops, TODAY, 8 * 60 + 33)).toBe(8 * 60 + 50);
  });

  it("sin límite de barra acepta cualquier franja", () => {
    const ops = opsWith([order("a", 8 * 60 + 30), order("b", 8 * 60 + 30)]);
    expect(pickupSlots(ops, TODAY, 8 * 60 + 30, 8 * 60 + 40)[0]).toMatchObject({ count: 2, capacity: null, full: false });
    expect(nextPickupSlot(ops, TODAY, 8 * 60 + 34)).toBe(8 * 60 + 30);
  });

  it("devuelve null si todo el horizonte está lleno", () => {
    const orders = Array.from({ length: 13 }, (_, i) => order(`o${i}`, 8 * 60 + i * 10));
    expect(nextPickupSlot(opsWith(orders, 1), TODAY, 8 * 60, 120)).toBeNull();
  });

  it("encuentra la punta del día", () => {
    const ops = opsWith([order("a", 9 * 60), order("b", 8 * 60 + 30), order("c", 8 * 60 + 31)]);
    expect(pickupPeak(ops, TODAY)).toEqual({ minute: 8 * 60 + 30, count: 2 });
    expect(pickupPeak(opsWith([]), TODAY)).toBeNull();
  });

  it("la demo de cafetería trae límite de barra", () => {
    const data = buildDemo("cafe", NOW);
    expect(data.tablesOps?.pickupCapacity).toBe(4);
  });
});

describe("temporada universitaria", () => {
  it("avisa de las cenas de Navidad de clase seis semanas antes en bar y restaurante, no en cafetería", () => {
    const list = seasonMoments("restaurant", "2026-10-10");
    const dinners = list.find((m) => m.id === "class_dinners");
    expect(dinners).toMatchObject({ phase: "soon", from: "2026-11-15" });
    expect(dinners?.inDays).toBe(36);
    expect(dinners?.action.section).toBe("grupos");
    expect(seasonMoments("cafe", "2026-10-10").some((m) => m.id === "class_dinners")).toBe(false);
  });

  it("en diciembre ya avisa de los exámenes de enero del año siguiente", () => {
    const list = seasonMoments("cafe", "2027-01-03");
    expect(list[0]).toMatchObject({ id: "exams_winter", phase: "soon", from: "2027-01-08" });
    const during = seasonMoments("cafe", "2027-01-20");
    expect(during[0]).toMatchObject({ id: "exams_winter", phase: "now", inDays: 0, title: "Modo exámenes" });
  });

  it("pone primero lo que está en marcha y los textos no llevan guiones largos", () => {
    const list = seasonMoments("bar", "2027-05-25");
    expect(list.map((m) => m.id)).toEqual(["graduations", "exams_summer"]);
    for (const vertical of ["cafe", "bar", "restaurant"] as const)
      for (const day of ["2026-10-10", "2027-01-20", "2027-02-05", "2027-05-25"])
        for (const m of seasonMoments(vertical, day)) expect(`${m.title} ${m.body} ${m.action.label}`).not.toMatch(DASHES);
  });

  it("en semanas sin temporada no propone nada", () => {
    expect(seasonMoments("restaurant", "2026-08-10")).toEqual([]);
  });

  it("amplía el sitio para estudiar dos horas sin pasar de las 22:00 ni del cierre", () => {
    expect(examStudyHours({ fromMinute: 600, toMinute: 1140 }, 1320)).toEqual({ fromMinute: 600, toMinute: 1260 });
    expect(examStudyHours({ fromMinute: 600, toMinute: 1140 }, 1200)).toEqual({ fromMinute: 600, toMinute: 1200 });
    expect(examStudyHours({ fromMinute: 600, toMinute: 1290 }, null)).toEqual({ fromMinute: 600, toMinute: 1320 });
  });
});

describe("tiempo de mesa y rotación", () => {
  const base: ProBooking = {
    id: "b1",
    kind: "table",
    clientName: "Nerea",
    resourceId: "t1",
    start: atLocal(TODAY, 21 * 60),
    end: atLocal(TODAY, 22 * 60 + 40),
    partySize: 4,
    status: "done",
    priceCents: 0,
    paidCents: 0,
    source: "phone",
  };

  it("usa la llegada y la salida reales si existen", () => {
    const real: ProBooking = {
      ...base,
      status: "confirmed",
      tableOperation: {
        tableId: "t1",
        seatedAt: atLocal(TODAY, 21 * 60 + 10),
        leftAt: atLocal(TODAY, 22 * 60 + 25),
        cleanedAt: null,
        cleaningMinutes: 10,
      },
    };
    expect(tableStay(real)).toBe(75);
    expect(tableStay(base)).toBe(100);
    expect(tableStay({ ...base, status: "arrived" })).toBeNull();
    expect(tableStay({ ...base, end: atLocal(TODAY, 21 * 60 + 5) })).toBeNull();
  });

  it("clasifica el tamaño de la mesa", () => {
    expect([1, 2, 3, 4, 5, 12].map(partyBand)).toEqual(["1-2", "1-2", "3-4", "3-4", "5+", "5+"]);
  });

  it("calcula la media por turno y si cabe una segunda mesa", () => {
    const data = buildDemo("restaurant", NOW);
    const bookings: ProBooking[] = Array.from({ length: 6 }, (_, i) => ({
      ...base,
      id: `x${i}`,
      start: atLocal(addDays(TODAY, -1), 20 * 60),
      end: atLocal(addDays(TODAY, -1), 20 * 60 + 70),
    }));
    const turnover = tableTurnover({ ...data, bookings }, NOW);
    const cena = turnover.byTurn.find((t) => t.turn === "cena");
    expect(cena).toMatchObject({ samples: 6, avgMinutes: 70, plannedMinutes: 120 });
    // 20:00 + 70 min + 10 de limpieza = 21:20, redondeado al cuarto: 21:30.
    expect(cena?.secondSeatAt).toBe(21 * 60 + 30);
    expect(turnover.byTurn.find((t) => t.turn === "comida")?.avgMinutes).toBeNull();
    expect(turnoverHeadline(cena!)).toBe("Cena: 1 h 10 min de media, 50 min menos de lo que reservas.");
  });

  it("la demo de restaurante tiene estancias reales variadas", () => {
    const data = buildDemo("restaurant", NOW);
    const turnover = tableTurnover(data, NOW);
    expect(turnover.samples).toBeGreaterThan(10);
    const cena = turnover.byTurn.find((t) => t.turn === "cena");
    expect(cena?.avgMinutes).not.toBeNull();
    expect(cena!.avgMinutes!).toBeLessThan(cena!.plannedMinutes);
  });
});

describe("escandallo del menú del día", () => {
  const menu: ProDailyMenu = {
    date: TODAY,
    priceCents: 1650,
    studentPriceCents: 1390,
    starters: ["Ensalada", "Tellinas"],
    mains: ["Arroz del señoret"],
    desserts: ["Flan"],
    includes: "Pan, bebida y café",
    published: true,
  };

  it("suma la media de cada plato elegible más los extras", () => {
    let ops: ProTablesOps = { ...emptyTablesOps(), dailyMenuExtrasCents: 120 };
    ops = setDishCost(ops, "Ensalada", 100);
    ops = setDishCost(ops, "Tellinas", 300);
    ops = setDishCost(ops, "Arroz del señoret", 340);
    ops = setDishCost(ops, "flan", 60);
    const cost = dailyMenuCost(ops, menu);
    // 200 + 340 + 60 + 120
    expect(cost.perDinerCents).toBe(720);
    expect(cost.missing).toEqual([]);
    // 1650 con IVA son 1500 sin IVA: 720 / 1500 = 48 %.
    expect(cost.foodCostPct).toBe(48);
    expect(cost.marginCents).toBe(780);
    expect(cost.studentMarginCents).toBe(1264 - 720);
    expect(cost.targetPriceCents).toBeGreaterThan(menu.priceCents);
  });

  it("sin coste en un curso entero no da cifra, y enseña lo que falta", () => {
    const ops = setDishCost(emptyTablesOps(), "Ensalada", 100);
    const cost = dailyMenuCost(ops, menu);
    expect(cost.perDinerCents).toBeNull();
    expect(cost.foodCostPct).toBeNull();
    expect(cost.missing).toEqual(["Tellinas", "Arroz del señoret", "Flan"]);
  });

  it("guarda, cambia y borra el coste de un plato sin duplicarlo", () => {
    let ops = setDishCost(emptyTablesOps(), "Flan casero", 50);
    ops = setDishCost(ops, "flan casero ", 60);
    expect(ops.dailyMenuCosts).toEqual([{ dish: "flan casero", costCents: 60 }]);
    expect(dishCostOf(ops.dailyMenuCosts, "Flan casero")).toBe(60);
    ops = setDishCost(ops, "Flan casero", null);
    expect(ops.dailyMenuCosts).toEqual([]);
  });

  it("la demo de restaurante calcula el menú y deja un plato por apuntar", () => {
    const data = buildDemo("restaurant", NOW);
    const cost = dailyMenuCost(data.tablesOps!, data.dailyMenu!);
    expect(cost.perDinerCents).not.toBeNull();
    expect(cost.missing).toEqual(["Crema de marisco"]);
  });
});

describe("informe de la semana", () => {
  function withShift(data: ProData): ProData {
    return {
      ...data,
      shifts: [
        ...data.shifts,
        {
          id: "sh-x",
          staffId: data.staff[0].id,
          date: TODAY,
          inAt: atLocal(TODAY, 12 * 60),
          outAt: atLocal(TODAY, 16 * 60),
          breakMinutes: 30,
        },
      ],
    };
  }

  it("suma horas fichadas y previstas del equipo", () => {
    const data = withShift(buildDemo("restaurant", NOW));
    const labor = weekLabor(data, data.tablesOps!, mondayOf(TODAY), NOW);
    expect(labor.workedMinutes).toBeGreaterThanOrEqual(210);
    expect(labor.plannedMinutes).toBeGreaterThan(0);
  });

  it("reparte los cubiertos sentados por hora de llegada", () => {
    const data = buildDemo("restaurant", NOW);
    const hours = coversByHour(data, mondayOf(TODAY), NOW);
    expect(hours).toHaveLength(12);
    expect(hours[0].hour).toBe(12);
    expect(hours.reduce((a, h) => a + h.covers, 0)).toBeGreaterThan(0);
  });

  it("escribe el mensaje de la semana solo con cifras apuntadas", () => {
    const data = withShift(buildDemo("restaurant", NOW));
    const text = weekReportMessage({ data, ops: data.tablesOps!, monday: mondayOf(TODAY), now: NOW });
    expect(text).toContain(`Semana de ${data.space.name}`);
    expect(text).toContain("Cubiertos:");
    expect(text).toContain("h fichadas");
    expect(text).not.toMatch(DASHES);
    const cafe = buildDemo("cafe", NOW);
    const cafeText = weekReportMessage({ data: cafe, ops: cafe.tablesOps!, monday: mondayOf(TODAY), now: NOW });
    expect(cafeText).not.toContain("Cubiertos:");
  });
});
