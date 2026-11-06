import type {
  ProBooking,
  ProClient,
  ProDailyMenu,
  ProGroupRequest,
  ProMenuItem,
  ProStaff,
  ProVerticalId,
} from "../types";
import type {
  ProBono,
  ProCashClosing,
  ProColdUnit,
  ProGroupChoice,
  ProGroupDeal,
  ProGroupMenu,
  ProHaccpEntry,
  ProHaccpTask,
  ProIngredient,
  ProPickupOrder,
  ProRecipe,
  ProRotaShift,
  ProStockItem,
  ProSupplier,
  ProTablesOps,
  ProVenueEvent,
  ProWasteEntry,
} from "../tables-types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import { emptyTablesOps, tempInRange } from "../tables-ops";
import { rng, type Rng } from "./common";

/**
 * Operación diaria de los tres negocios de ejemplo del motor de mesas:
 * Café Hilo (San Vicente), La Tasca del Campus (San Vicente) y Casa Marea
 * (Playa de San Juan). Todo es relativo a `now` y determinista: la misma
 * hora genera siempre los mismos datos.
 */

type Hours = ({ open: number; close: number } | null)[];

export type TablesOpsContext = {
  vertical: ProVerticalId;
  now: Date;
  hours: Hours;
  staff: ProStaff[];
  clients: ProClient[];
  menu: ProMenuItem[];
  bookings: ProBooking[];
  groupRequests: ProGroupRequest[];
  studyOccupied: number;
};

export function buildTablesOps(ctx: TablesOpsContext): ProTablesOps {
  const r = rng(ctx.vertical === "cafe" ? 71 : ctx.vertical === "bar" ? 83 : 97);
  const base = emptyTablesOps();
  const seed =
    ctx.vertical === "cafe"
      ? cafeOps(ctx, r)
      : ctx.vertical === "bar"
        ? barOps(ctx, r)
        : restaurantOps(ctx, r);
  const ops: ProTablesOps = { ...base, ...seed };
  return {
    ...ops,
    haccpLog: haccpHistory(ctx, r, ops.coldUnits, ops.haccpTasks),
    rota: rotaFor(ctx),
    closings: closingsFor(ctx, r),
    contacts: contactsFor(ctx),
    dailyMenuHistory: dailyMenuHistory(ctx, r),
    ...dailyMenuCosting(ctx.vertical),
    // La barra de la cafetería saca cuatro pedidos cada 10 minutos en la punta.
    pickupCapacity: ctx.vertical === "cafe" ? 4 : undefined,
    ownerPhone:
      ctx.vertical === "cafe"
        ? "655 204 318"
        : ctx.vertical === "bar"
          ? "644 118 902"
          : "611 473 560",
  };
}

/* ------------------------------------------------------------------ */
/* Menús del día anteriores                                            */
/* ------------------------------------------------------------------ */

const DAILY_POOLS: Record<
  "cafe" | "bar" | "restaurant",
  { price: number; student: number; starters: string[]; mains: string[]; desserts: string[] }
> = {
  cafe: {
    price: 990,
    student: 850,
    starters: ["Crema de calabaza", "Ensalada de pasta con atún", "Hummus con crudités", "Crema de calabacín", "Ensalada de lentejas"],
    mains: ["Quiche de verduras", "Wrap de pollo y aguacate", "Lasaña de verduras", "Tosta de salmón y queso crema", "Bocadillo de pisto"],
    desserts: ["Yogur con miel", "Fruta de temporada", "Porción de tarta del día"],
  },
  bar: {
    price: 1150,
    student: 990,
    starters: ["Ensalada mixta", "Gazpacho", "Macarrones con tomate", "Salmorejo", "Crema de verduras"],
    mains: ["Lomo con patatas", "Pollo al horno", "Merluza a la romana", "Albóndigas en salsa", "Arroz de verduras"],
    desserts: ["Flan casero", "Natillas", "Fruta de temporada"],
  },
  restaurant: {
    price: 1650,
    student: 1390,
    starters: ["Ensalada de la huerta", "Tellinas al ajillo", "Crema de marisco", "Esgarraet", "Pimientos asados con bacalao", "Gazpacho"],
    mains: ["Arroz del señoret", "Arroz negro", "Fideuà", "Dorada a la plancha", "Arroz con costra", "Albóndigas de sepia"],
    desserts: ["Flan casero", "Arroz con leche", "Tarta de almendra", "Fruta de temporada"],
  },
};

/**
 * Coste por ración de los platos del menú del día (escandallo rápido), en
 * céntimos. Uno de los platos del restaurante queda sin coste a propósito:
 * así la pantalla enseña qué falta por apuntar.
 */
const DAILY_COSTS: Record<"cafe" | "bar" | "restaurant", [string, number][]> = {
  cafe: [
    ["Crema de calabaza", 85],
    ["Ensalada de pasta con atún", 110],
    ["Hummus con crudités", 95],
    ["Pollo al curry con arroz basmati", 190],
    ["Lasaña de verduras", 165],
    ["Bocadillo de calamares con alioli", 175],
    ["Yogur con miel", 45],
    ["Fruta de temporada", 40],
  ],
  bar: [
    ["Ensalada mixta", 90],
    ["Gazpacho", 70],
    ["Macarrones con tomate", 65],
    ["Arroz al horno", 180],
    ["Pechuga a la plancha con patatas", 195],
    ["Merluza a la romana", 230],
    ["Flan casero", 40],
    ["Fruta", 35],
  ],
  restaurant: [
    ["Ensalada de la huerta", 120],
    ["Tellinas al ajillo", 290],
    ["Arroz del señoret", 340],
    ["Dorada a la espalda", 380],
    ["Pollo de corral al ajillo", 260],
    ["Flan de huevo casero", 55],
    ["Helado de turrón", 70],
  ],
};

function dailyMenuCosting(vertical: TablesOpsContext["vertical"]): Partial<ProTablesOps> {
  const key = vertical === "cafe" || vertical === "bar" ? vertical : "restaurant";
  return {
    dailyMenuCosts: DAILY_COSTS[key].map(([dish, costCents]) => ({ dish, costCents })),
    // Pan, bebida y café por comensal.
    dailyMenuExtrasCents: key === "restaurant" ? 120 : 95,
  };
}

/** Los menús de los últimos días laborables, para reutilizar platos. */
function dailyMenuHistory(ctx: TablesOpsContext, r: Rng) {
  const pool = DAILY_POOLS[ctx.vertical === "cafe" || ctx.vertical === "bar" ? ctx.vertical : "restaurant"];
  const today = localDate(ctx.now);
  const three = (list: string[]) => {
    const copy = [...list];
    const out: string[] = [];
    while (out.length < Math.min(3, copy.length)) out.push(copy.splice(r.int(0, copy.length - 1), 1)[0]);
    return out;
  };
  const out: ProDailyMenu[] = [];
  for (let d = 1; out.length < 12 && d < 30; d++) {
    const date = addDays(today, -d);
    if (weekdayIndex(date) >= 5) continue;
    out.push({
      date,
      priceCents: pool.price,
      studentPriceCents: pool.student,
      starters: three(pool.starters),
      mains: three(pool.mains),
      desserts: three(pool.desserts).slice(0, 2),
      includes: "Pan, bebida y postre o café",
      published: true,
    });
  }
  return out;
}

/**
 * Ajusta el fichaje de hoy al cuadrante: ha fichado quien ya ha empezado su
 * turno, salvo la última persona del equipo si su turno ha empezado hace
 * menos de 45 minutos: llega tarde y aún no ha fichado.
 */
export function staffForRota(
  staff: ProStaff[],
  rota: ProRotaShift[],
  now: Date,
): ProStaff[] {
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const lateId = staff[staff.length - 1]?.id;
  return staff.map((person) => {
    const shift = rota.find(
      (s) =>
        s.staffId === person.id &&
        s.date === today &&
        s.from <= nowMin &&
        s.to > nowMin,
    );
    const late = shift && person.id === lateId && nowMin - shift.from < 45;
    if (!shift || late) return { ...person, clockedInAt: null };
    return {
      ...person,
      clockedInAt: atLocal(today, Math.max(0, shift.from - 6)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Cafetería                                                           */
/* ------------------------------------------------------------------ */

function cafeOps(ctx: TablesOpsContext, r: Rng): Partial<ProTablesOps> {
  const today = localDate(ctx.now);
  const regulars = ctx.clients.filter((c) => c.cardMember).slice(0, 12);
  const suppliers: ProSupplier[] = [
    sup("p1", "Tostadores Levante", "Café", "611 408 223", [1, 4], 12 * 60),
    sup("p2", "Lácteos Vega Baja", "Leche y lácteos", "622 190 554", [0, 2, 4]),
    sup("p3", "Panadería La Espiga", "Pan y bollería", "633 872 019", [0, 1, 2, 3, 4, 5], 20 * 60),
    sup("p4", "Frutas Mercado de San Vicente", "Fruta", "644 310 876", [0, 3]),
    sup("p5", "Envases Alacant", "Vasos y envases", "655 772 140", [2]),
  ];
  const ingredients: ProIngredient[] = [
    ing("i1", "Café en grano de especialidad", "kg", 1850, 1580, "p1"),
    ing("i2", "Leche entera", "l", 98, 92, "p2"),
    ing("i3", "Bebida de avena", "l", 185, undefined, "p2"),
    ing("i4", "Pan de masa madre (barra)", "ud", 260, 240, "p3"),
    ing("i5", "Tomate triturado", "kg", 290, undefined, "p4"),
    ing("i6", "Aceite de oliva virgen extra", "l", 920, 780),
    ing("i7", "Croissant de mantequilla", "ud", 58, 52, "p3"),
    ing("i8", "Naranjas de zumo", "kg", 130, 120, "p4"),
    ing("i9", "Vaso para llevar", "ud", 9, undefined, "p5"),
    ing("i10", "Azúcar en sobre", "ud", 2),
  ];
  const byName = (name: string) => ctx.menu.find((m) => m.name === name)?.id;
  const recipes: ProRecipe[] = [
    rec(byName("Café solo"), [["i1", 0.008], ["i10", 1]], "8 g de café molido al momento. Extracción de 25 a 30 segundos, taza pequeña precalentada."),
    rec(byName("Café con leche"), [["i1", 0.008], ["i2", 0.15], ["i10", 1]], "8 g de café y 150 ml de leche entera a 60 grados. Taza de 200 ml."),
    rec(byName("Cortado con bebida de avena"), [["i1", 0.008], ["i3", 0.08], ["i10", 1]], "Café corto y 80 ml de avena calentada sin hervir. Avisa: la avena lleva gluten."),
    rec(byName("Flat white"), [["i1", 0.016], ["i2", 0.12]], "Doble ristretto y 120 ml de leche con microespuma fina. Taza de 180 ml."),
    rec(byName("Tostada con tomate y aceite"), [["i4", 0.25], ["i5", 0.04], ["i6", 0.012]], "Un cuarto de barra, tostada por los dos lados. 40 g de tomate y un hilo de aceite."),
    rec(byName("Croissant de mantequilla"), [["i7", 1]], "Calentar 20 segundos. Se sirve en plato de postre."),
    rec(byName("Zumo de naranja natural"), [["i8", 0.5]], "Medio kilo de naranjas por vaso, exprimido al momento."),
  ].filter((x): x is ProRecipe => x !== null);
  const stock: ProStockItem[] = [
    stk("k1", "Café en grano", "Café", "p1", "kg", 6, 4, 1850),
    stk("k2", "Leche entera", "Lácteos", "p2", "l", 24, 30, 98),
    stk("k3", "Bebida de avena", "Lácteos", "p2", "l", 6, 3, 185),
    stk("k4", "Leche sin lactosa", "Lácteos", "p2", "l", 6, 8, 115),
    stk("k5", "Vasos para llevar", "Envases", "p5", "ud", 200, 140, 9),
    stk("k6", "Naranjas de zumo", "Fruta", "p4", "kg", 10, 12, 130),
    stk("k7", "Azúcar en sobre", "Barra", "p5", "ud", 300, 420, 2),
  ];
  return {
    study: {
      enabled: true,
      seats: 20,
      plugs: 16,
      wifi: true,
      fromMinute: 9 * 60,
      toMinute: 20 * 60,
      rule: "every2h",
      noLaptopDays: [],
      occupied: Math.min(20, ctx.studyOccupied),
      occupiedAt: ctx.now.toISOString(),
    },
    bonoTemplates: [
      { id: "bt1", name: "Bono 10 cafés", itemName: "Café con leche", uses: 10, priceCents: 1350, regularCents: 1600, active: true },
      { id: "bt2", name: "Bono estudio", itemName: "Café y tostada", uses: 5, priceCents: 1600, regularCents: 1900, active: true },
    ],
    bonos: [...cafeBonos(ctx, r, regulars), studyGroupBono(ctx)],
    orders: cafeOrders(ctx, r),
    leftoversFrom: 18 * 60,
    showcase: cafeShowcase(ctx),
    coldUnits: [
      cold("f1", "Nevera de barra", "nevera", 0, 5),
      cold("f2", "Vitrina de dulces", "vitrina", 0, 8),
      cold("f3", "Congelador", "congelador", -25, -18),
    ],
    haccpTasks: [
      task("t1", "Desinfectar barra y mostrador", "Barra", "apertura"),
      task("t2", "Revisar fechas de la vitrina", "Vitrina", "apertura"),
      task("t3", "Limpiar cafetera y lanzas de vapor", "Barra", "cierre"),
      task("t4", "Vaciar y limpiar la vitrina", "Vitrina", "cierre"),
      task("t5", "Fregar suelo de sala y baño", "Sala", "cierre"),
      task("t6", "Descalcificar la cafetera", "Barra", "semanal"),
    ],
    waste: wasteHistory(ctx, r, [
      ["Croissants", "ud", 55, ["vendido", "vendido", "donado", "tirado"]],
      ["Porciones de tarta de zanahoria", "ud", 90, ["vendido", "aprovechado", "tirado"]],
      ["Pan de masa madre", "ud", 260, ["aprovechado", "donado"]],
      ["Bocadillos de tortilla", "ud", 120, ["vendido", "tirado"]],
    ]),
    suppliers,
    stock,
    shopping: [
      line("l1", "Bebida de avena", 12, "l", "p2", "k3", today, 9 * 60 + 40),
      line("l2", "Café en grano", 6, "kg", "p1", "k1", today, 10 * 60 + 5),
    ],
    purchaseOrders: [
      { id: "po1", supplierId: "p3", sentAt: atLocal(addDays(today, -1), 19 * 60 + 40), lines: [{ name: "Croissants", qty: 40, unit: "ud" }, { name: "Barras de masa madre", qty: 12, unit: "ud" }], received: true },
    ],
    ingredients,
    recipes,
    targetFoodCostPct: 35,
    groupMenus: [
      gmenu("gm1", "Desayuno de clase", "Desayuno de clase", 450, [["Bebida", ["Café con leche", "Zumo de naranja", "Cacao"]], ["Para comer", ["Tostada con tomate", "Croissant"]]], "Servido en la mesa larga", 10, 0),
      gmenu("gm2", "Merienda de estudio", "Grupo de estudio", 390, [["Bebida", ["Café", "Infusión"]], ["Dulce", ["Porción de tarta", "Cookie"]]], "Sitio reservado dos horas", 6, 0),
    ],
    usuals: regulars.slice(0, 6).map((c, i) => ({
      clientName: c.name,
      order: [
        "Café con leche de avena y tostada con tomate",
        "Flat white para llevar",
        "Cortado y croissant",
        "Café solo doble",
        "Chai latte y cookie",
        "Café con leche y zumo",
      ][i],
    })),
    reviewLink: "https://franky.es/n/cafe-hilo",
  };
}

function cafeBonos(ctx: TablesOpsContext, r: Rng, regulars: ProClient[]): ProBono[] {
  const today = localDate(ctx.now);
  const nowMin = localMinutes(ctx.now);
  return regulars.slice(0, 11).map((c, i) => {
    const template = i % 4 === 3 ? "bt2" : "bt1";
    const uses = template === "bt1" ? 10 : 5;
    const soldToday = i === 0 && nowMin > 9 * 60;
    const soldDay = soldToday ? 0 : r.int(2, 26);
    const soldAt = atLocal(addDays(today, -soldDay), soldToday ? 8 * 60 + 50 : r.int(8, 12) * 60);
    const used = soldToday ? 1 : Math.min(uses, Math.max(0, Math.round(soldDay / 2.3) + r.int(0, 2)));
    const usedAt = Array.from({ length: used }, (_, k) => {
      const day = Math.max(0, soldDay - 1 - k * 2);
      const minute = day === 0 ? Math.min(nowMin - 5, 9 * 60 + k * 7) : 8 * 60 + r.int(0, 180);
      return atLocal(addDays(today, -day), Math.max(7 * 60 + 35, minute));
    });
    return {
      id: `bn${i + 1}`,
      templateId: template,
      clientName: c.name,
      clientId: c.id,
      phone: c.phone,
      soldAt,
      paidCents: template === "bt1" ? 1350 : 1600,
      uses,
      usedAt,
      channel: i % 3 === 1 ? "franky" : "barra",
    };
  });
}

/** Bono compartido de un grupo de trabajo de Teleco que viene junto a estudiar. */
function studyGroupBono(ctx: TablesOpsContext): ProBono {
  const today = localDate(ctx.now);
  const members = ["Pau Ferrándiz", "Aitana Mira", "Samuel Botella", "Celia Marco"];
  const uses: [number, number, number][] = [
    [6, 17 * 60 + 5, 0],
    [6, 17 * 60 + 6, 1],
    [4, 16 * 60 + 40, 2],
    [4, 16 * 60 + 41, 0],
    [2, 17 * 60 + 20, 3],
    [2, 17 * 60 + 21, 1],
  ];
  return {
    id: "bn-grupo",
    templateId: "bt1",
    clientName: "TFG de Teleco",
    phone: "688 402 719",
    soldAt: atLocal(addDays(today, -7), 16 * 60 + 30),
    paidCents: 1350,
    uses: 10,
    usedAt: uses.map(([d, m]) => atLocal(addDays(today, -d), m)),
    usedBy: uses.map(([, , i]) => members[i]),
    members,
    channel: "barra",
  };
}

/** Vitrina de hoy: lo que ha llegado de la panadería y lo que queda. */
function cafeShowcase(ctx: TablesOpsContext) {
  const today = localDate(ctx.now);
  const nowMin = localMinutes(ctx.now);
  // Por la tarde ya se ha vendido buena parte de la mañana.
  const late = nowMin >= 17 * 60;
  const pick = (name: string, morning: number, afternoon: number) => {
    const item = ctx.menu.find((m) => m.name === name);
    return item ? { menuItemId: item.id, left: late ? afternoon : morning } : null;
  };
  return {
    date: today,
    items: [
      pick("Croissant de mantequilla", 14, 5),
      pick("Tarta de zanahoria", 8, 3),
      pick("Cookie de crema de cacahuete", 12, 4),
      pick("Bocadillo de tortilla", 6, 2),
      pick("Bizcocho de limón sin gluten", 0, 0),
    ].filter((x): x is { menuItemId: string; left: number } => x !== null),
  };
}

function cafeOrders(ctx: TablesOpsContext, r: Rng): ProPickupOrder[] {
  const today = localDate(ctx.now);
  const nowMin = localMinutes(ctx.now);
  const h = ctx.hours[weekdayIndex(today)];
  const openNow = Boolean(h && nowMin >= h.open && nowMin < h.close - 45);
  const students = ctx.clients.filter((c) => c.student).slice(20, 32);
  const pick = (i: number) => students[i % students.length];
  const day = openNow ? today : addDays(today, 1);
  const start = openNow ? Math.ceil(nowMin / 5) * 5 : (h?.open ?? 8 * 60) + 30;
  const menu: [string, number][] = [
    ["Café con leche", 160],
    ["Tostada con tomate y aceite", 220],
    ["Flat white", 240],
    ["Croissant de mantequilla", 180],
    ["Bocadillo de tortilla", 380],
    ["Zumo de naranja natural", 290],
  ];
  const offsets = [-40, -15, 10, 20, 35, 55];
  const pickups: ProPickupOrder[] = offsets.map((offset, i) => {
    const c = pick(i);
    const minute = start + offset;
    const past = openNow && offset < 0;
    const a = menu[i % menu.length];
    const b = menu[(i + 3) % menu.length];
    return {
      id: `or${i + 1}`,
      kind: "pickup",
      clientName: c.name,
      clientId: c.id,
      phone: c.phone,
      student: Boolean(c.student?.verified),
      lines: [
        { name: a[0], qty: 1, priceCents: a[1] },
        ...(i % 2 ? [{ name: b[0], qty: 1, priceCents: b[1] }] : []),
      ],
      pickupAt: atLocal(day, Math.max(7 * 60 + 40, minute)),
      status: past ? "collected" : offset <= 10 ? "preparing" : "new",
      note: i === 2 ? "Leche sin lactosa, por favor" : undefined,
      createdAt: atLocal(day, Math.max(7 * 60 + 30, minute - 25 - r.int(0, 20))),
      source: "franky",
    };
  });
  const encargos: ProPickupOrder[] = [
    {
      id: "en1",
      kind: "encargo",
      clientName: "Marina Cortés",
      phone: "611 204 377",
      lines: [{ name: "Tarta de zanahoria entera", qty: 1, priceCents: 2800 }],
      pickupAt: atLocal(addDays(today, 1), 11 * 60),
      status: "new",
      note: "Para 12 personas. Poner Felicidades, Irene",
      allergens: ["gluten", "huevo", "lacteos", "frutos_cascara"],
      depositCents: 1000,
      createdAt: atLocal(addDays(today, -3), 17 * 60),
      source: "phone",
    },
    {
      id: "en2",
      kind: "encargo",
      clientName: "Delegación de Educación UA",
      phone: "688 450 112",
      student: true,
      lines: [
        { name: "Bandeja de bocadillos variados (20 uds)", qty: 2, priceCents: 3600 },
        { name: "Termo de café (10 tazas)", qty: 2, priceCents: 1400 },
      ],
      pickupAt: atLocal(addDays(today, 3), 9 * 60 + 30),
      status: "new",
      note: "Jornada de bienvenida. Dos sin gluten aparte",
      allergens: ["gluten", "huevo", "lacteos"],
      depositCents: 2000,
      createdAt: atLocal(addDays(today, -1), 12 * 60),
      source: "franky",
    },
    {
      id: "en3",
      kind: "encargo",
      clientName: "Pablo Sanz",
      phone: "622 918 440",
      lines: [{ name: "Bizcocho de limón sin gluten", qty: 1, priceCents: 1800 }],
      pickupAt: atLocal(addDays(today, 5), 17 * 60 + 30),
      status: "new",
      allergens: ["huevo", "lacteos"],
      depositCents: 0,
      createdAt: atLocal(today, 8 * 60 + 15),
      source: "walkin",
    },
  ];
  return [...pickups, ...encargos];
}

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

function barOps(ctx: TablesOpsContext, r: Rng): Partial<ProTablesOps> {
  const today = localDate(ctx.now);
  const byName = (name: string) => ctx.menu.find((m) => m.name === name)?.id;
  return {
    coldUnits: [
      cold("f1", "Cámara de barriles", "camara", 2, 6),
      cold("f2", "Botellero de barra", "nevera", 2, 8),
      cold("f3", "Nevera de cocina", "nevera", 0, 5),
      cold("f4", "Congelador", "congelador", -25, -18),
    ],
    haccpTasks: [
      task("t1", "Revisar el aceite de la freidora", "Cocina", "apertura"),
      task("t2", "Desinfectar plancha y superficies", "Cocina", "apertura"),
      task("t3", "Limpiar freidora y campana", "Cocina", "cierre"),
      task("t4", "Limpiar grifos de cerveza y barra", "Barra", "cierre"),
      task("t5", "Fregar suelo y baños", "Sala", "cierre"),
      task("t6", "Cambiar el aceite de la freidora", "Cocina", "semanal"),
    ],
    waste: wasteHistory(ctx, r, [
      ["Raciones de ensaladilla", "raciones", 140, ["aprovechado", "tirado"]],
      ["Pan del día", "ud", 30, ["aprovechado", "donado", "tirado"]],
      ["Tortilla de patatas", "raciones", 90, ["vendido", "aprovechado"]],
    ]),
    suppliers: [
      sup("p1", "Distribuidora de Bebidas Raspeig", "Cerveza y refrescos", "611 902 334", [1, 4], 12 * 60),
      sup("p2", "Carnes Hermanos Pastor", "Carne", "622 318 775", [0, 3]),
      sup("p3", "Pescados de Santa Pola", "Pescado y marisco", "633 540 128", [1, 2, 3, 4, 5], 18 * 60),
      sup("p4", "Verduras Mercado Central", "Verdura y patata", "644 671 902", [0, 2, 4]),
      sup("p5", "Panadería La Espiga", "Pan", "633 872 019", [0, 1, 2, 3, 4, 5], 20 * 60),
    ],
    stock: [
      stk("k1", "Barril de cerveza 30 l", "Cerveza", "p1", "ud", 4, 3, 7200),
      stk("k2", "Tercio sin gluten", "Cerveza", "p1", "ud", 24, 30, 95),
      stk("k3", "Refresco de cola (caja 24)", "Refrescos", "p1", "cajas", 3, 2, 1450),
      stk("k4", "Vino tinto de la casa", "Vino", "p1", "botellas", 12, 18, 380),
      stk("k5", "Patatas", "Verdura", "p4", "kg", 25, 12, 90),
      stk("k6", "Aceite de girasol", "Cocina", "p4", "l", 20, 24, 210),
      stk("k7", "Calamar limpio", "Pescado", "p3", "kg", 5, 6, 1200),
      stk("k8", "Lomo de cerdo", "Carne", "p2", "kg", 4, 5, 890),
    ],
    shopping: [
      line("l1", "Barril de cerveza 30 l", 3, "ud", "p1", "k1", today, 13 * 60 + 10, "s3"),
      line("l2", "Patatas", 25, "kg", "p4", "k5", today, 13 * 60 + 25, "s4"),
      line("l3", "Limones", 3, "kg", "p4", undefined, today, 14 * 60, "s2"),
    ],
    purchaseOrders: [
      { id: "po1", supplierId: "p3", sentAt: atLocal(addDays(today, -1), 23 * 60 + 50), lines: [{ name: "Calamar limpio", qty: 5, unit: "kg" }, { name: "Boquerón", qty: 3, unit: "kg" }], received: true },
    ],
    ingredients: [
      ing("i1", "Patata", "kg", 90, 80, "p4"),
      ing("i2", "Aceite de girasol", "l", 210, 190, "p4"),
      ing("i3", "Salsa brava casera", "kg", 400),
      ing("i4", "Calamar limpio", "kg", 1200, 1050, "p3"),
      ing("i5", "Harina de freír", "kg", 110),
      ing("i6", "Gamba pelada", "kg", 2200, 1900, "p3"),
      ing("i7", "Aceite de oliva virgen extra", "l", 920, 780),
      ing("i8", "Pan de montadito", "ud", 22, 20, "p5"),
      ing("i9", "Lomo de cerdo", "kg", 890, 850, "p2"),
      ing("i10", "Queso en lonchas", "kg", 980),
      ing("i11", "Cerveza de barril", "l", 240, 225, "p1"),
      ing("i12", "Alitas de pollo", "kg", 520, 490, "p2"),
      ing("i13", "Salsa barbacoa", "kg", 450),
      ing("i14", "Huevo", "ud", 24, 20),
    ],
    recipes: [
      rec(byName("Patatas bravas"), [["i1", 0.3], ["i2", 0.05], ["i3", 0.05]], "300 g de patata en dados, doble fritura. Brava por encima y alioli al lado."),
      rec(byName("Calamares a la andaluza"), [["i4", 0.2], ["i5", 0.03], ["i2", 0.05]], "200 g de calamar en anillas, harina de freír y aceite a 180 grados."),
      rec(byName("Gambas al ajillo"), [["i6", 0.15], ["i7", 0.06]], "150 g de gamba en cazuela de barro con ajo y guindilla. Sale hirviendo."),
      rec(byName("Montadito de lomo con queso"), [["i8", 1], ["i9", 0.05], ["i10", 0.02]], "Lomo a la plancha, loncha de queso fundida encima."),
      rec(byName("Caña"), [["i11", 0.2]], "Vaso frío y enjuagado. Dos dedos de espuma."),
      rec(byName("Alitas con salsa barbacoa"), [["i12", 0.3], ["i13", 0.04], ["i2", 0.03]], "8 alitas. Fritas y salteadas con la barbacoa al momento."),
      rec(byName("Pincho de tortilla"), [["i14", 0.8], ["i1", 0.08], ["i7", 0.01]], "Un octavo de tortilla de 6 huevos, poco cuajada."),
    ].filter((x): x is ProRecipe => x !== null),
    targetFoodCostPct: 30,
    events: barEvents(ctx),
    groupMenus: [
      gmenu("gm1", "Menú previa", "Previa", 1200, [["Tapas para compartir", ["Bravas", "Nachos", "Alitas"]], ["Bebida", ["Dos cañas", "Dos refrescos", "Dos tintos de verano"]]], "Mesa larga y altas guardadas", 10, 20),
      gmenu("gm2", "Cena de clase", "Cena de clase", 1500, [["Para compartir", ["Bravas y ensaladilla", "Calamares y croquetas"]], ["Montaditos", ["Lomo con queso", "Salmón", "Pringá"]], ["Postre", ["Flan casero", "Fruta"]]], "Bebida incluida (dos consumiciones)", 12, 20),
      gmenu("gm3", "Cumpleaños", "Cumpleaños", 1400, [["Tapas", ["Bravas", "Alitas", "Tortilla"]], ["Bebida", ["Dos consumiciones"]]], "Vela y chupito para el cumpleañero", 8, 20),
      gmenu("gm4", "Partido", "Partido", 1000, [["Cubo", ["Cinco tercios", "Cuatro refrescos"]], ["Ración", ["Bravas", "Nachos"]]], "Mesa delante de la pantalla", 4, 0),
    ],
    groupDeals: barDeals(ctx),
    usuals: [],
    reviewLink: "https://franky.es/n/tasca-del-campus",
  };
}

function barEvents(ctx: TablesOpsContext): ProVenueEvent[] {
  const today = localDate(ctx.now);
  const nextWeekday = (target: number, min = 0) => {
    for (let i = min; i < 14; i++) {
      const d = addDays(today, i);
      if (weekdayIndex(d) === target) return d;
    }
    return addDays(today, 7);
  };
  const tuesday = nextWeekday(1);
  const saturday = nextWeekday(5, 1);
  const thursday = nextWeekday(3, 1);
  const people = [
    ["Grupo de Teleco", "622 104 983", 8, 2000, true],
    ["Rubén Ortiz", "644 219 870", 4, 0, false],
    ["Peña de Económicas", "611 330 452", 12, 3000, true],
    ["Claudia Navarro", "633 902 117", 6, 1500, false],
  ] as const;
  return [
    {
      id: "ev1",
      kind: "partido",
      title: "Champions: partido del martes",
      start: atLocal(tuesday, 20 * 60 + 30),
      end: atLocal(tuesday, 23 * 60),
      capacity: 60,
      minimumSpendCents: 1000,
      menu: "Cubo de cinco tercios y ración de bravas: 15 €",
      published: true,
      bookings: people.map(([name, phone, n, dep, paid], i) => ({
        id: `eb${i + 1}`,
        name,
        phone,
        people: n,
        depositCents: dep,
        depositPaid: paid,
      })),
    },
    {
      id: "ev2",
      kind: "partido",
      title: "Hércules CF: jornada de liga",
      start: atLocal(saturday, 18 * 60),
      end: atLocal(saturday, 20 * 60),
      capacity: 50,
      minimumSpendCents: 800,
      menu: "Caña y montadito: 4 €",
      published: false,
      bookings: [
        { id: "eb5", name: "Unai Llorca", phone: "688 551 023", people: 5, depositCents: 0, depositPaid: false },
      ],
    },
    {
      id: "ev3",
      kind: "evento",
      title: "Intercambio de idiomas ESN",
      start: atLocal(thursday, 21 * 60),
      end: atLocal(thursday, 23 * 60 + 30),
      capacity: 40,
      minimumSpendCents: 500,
      menu: "Tapa incluida con la primera consumición",
      published: true,
      bookings: [
        { id: "eb6", name: "ESN Alicante", phone: "611 908 334", people: 24, depositCents: 0, depositPaid: false },
      ],
    },
    {
      // Previa oficial: el bar como punto de encuentro antes de la fiesta.
      id: "ev4",
      kind: "previa",
      party: "Fiesta de Bienvenida de Teleco",
      title: "Previa en la terraza, mesas altas guardadas",
      start: atLocal(saturday, 22 * 60),
      end: atLocal(saturday, 24 * 60),
      capacity: 45,
      minimumSpendCents: 600,
      menu: "Dos cañas y nachos por persona: 6 €",
      published: true,
      bookings: [
        { id: "eb7", name: "Delegación de Teleco", phone: "622 740 118", people: 18, depositCents: 3000, depositPaid: true },
        { id: "eb8", name: "Marta Soler", phone: "655 310 294", people: 6, depositCents: 0, depositPaid: false },
      ],
    },
  ];
}

function barDeals(ctx: TablesOpsContext): ProGroupDeal[] {
  const today = localDate(ctx.now);
  const out: ProGroupDeal[] = [];
  const quoted = ctx.groupRequests.find((g) => g.id === "g3");
  if (quoted)
    out.push({
      requestId: quoted.id,
      menuId: "gm3",
      perPersonCents: 1200,
      depositCents: 3400,
      stage: "quoted",
      sentAt: atLocal(addDays(today, -1), 18 * 60),
      closeBy: addDays(localDate(quoted.date), -1),
      finalPeople: quoted.people,
      choices: [],
    });
  const accepted = ctx.groupRequests.find((g) => g.id === "g4");
  if (accepted)
    out.push({
      requestId: accepted.id,
      menuId: "gm1",
      perPersonCents: 1200,
      depositCents: 6600,
      depositPaidAt: atLocal(addDays(today, -3), 12 * 60),
      depositMethod: "bizum",
      stage: "deposit",
      closeBy: addDays(localDate(accepted.date), -1),
      finalPeople: accepted.people,
      choices: [],
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Restaurante                                                         */
/* ------------------------------------------------------------------ */

function restaurantOps(ctx: TablesOpsContext, r: Rng): Partial<ProTablesOps> {
  const today = localDate(ctx.now);
  const byName = (name: string) => ctx.menu.find((m) => m.name === name)?.id;
  return {
    coldUnits: [
      cold("f1", "Cámara de pescado", "camara", 0, 2),
      cold("f2", "Cámara de carne y verdura", "camara", 0, 4),
      cold("f3", "Nevera de postres", "nevera", 0, 5),
      cold("f4", "Congelador", "congelador", -25, -18),
    ],
    haccpTasks: [
      task("t1", "Desinfectar superficies de cocina", "Cocina", "apertura"),
      task("t2", "Revisar fechas y etiquetas", "Cámaras", "apertura"),
      task("t3", "Temperatura de la entrega de la lonja", "Recepción", "apertura"),
      task("t4", "Limpiar campana y fogones", "Cocina", "cierre"),
      task("t5", "Lavar paelleras y utensilios", "Cocina", "cierre"),
      task("t6", "Fregar suelos de cocina y sala", "Sala", "cierre"),
      task("t7", "Limpieza a fondo de cámaras", "Cámaras", "semanal"),
    ],
    waste: wasteHistory(ctx, r, [
      ["Arroz sobrante del servicio", "raciones", 320, ["aprovechado", "aprovechado", "tirado"]],
      ["Sobras que se llevó el cliente", "raciones", 400, ["aprovechado"]],
      ["Pescado fuera de fecha", "kg", 1400, ["tirado"]],
      ["Pan", "ud", 30, ["donado", "tirado"]],
    ]),
    suppliers: [
      sup("p1", "Lonja de Santa Pola", "Pescado y marisco", "633 540 128", [1, 2, 3, 4, 5], 18 * 60),
      sup("p2", "Arroces Albufera", "Arroz", "611 220 947", [2]),
      sup("p3", "Frutas y Verduras Mercado Central", "Verdura", "644 671 902", [0, 2, 4]),
      sup("p4", "Carnes Hermanos Pastor", "Carne", "622 318 775", [0, 3]),
      sup("p5", "Bodega del Vinalopó", "Vino", "655 108 336", [3]),
    ],
    stock: [
      stk("k1", "Arroz bomba", "Arroz", "p2", "kg", 20, 14, 380),
      stk("k2", "Fumet de pescado", "Cocina", "p1", "l", 30, 36, 250),
      stk("k3", "Sepia", "Pescado", "p1", "kg", 6, 7, 1100),
      stk("k4", "Gamba roja", "Marisco", "p1", "kg", 3, 2, 4200),
      stk("k5", "Aceite de oliva virgen extra", "Cocina", "p3", "l", 15, 18, 920),
      stk("k6", "Vino blanco Alicante DOP", "Vino", "p5", "botellas", 24, 20, 640),
      stk("k7", "Huevos", "Cocina", "p3", "docenas", 10, 12, 290),
      stk("k8", "Secreto ibérico", "Carne", "p4", "kg", 4, 5, 1700),
    ],
    shopping: [
      line("l1", "Gamba roja", 3, "kg", "p1", "k4", today, 12 * 60 + 40, "s2"),
      line("l2", "Limones", 4, "kg", "p3", undefined, today, 13 * 60, "s2"),
    ],
    purchaseOrders: [
      { id: "po1", supplierId: "p1", sentAt: atLocal(addDays(today, -1), 17 * 60 + 30), lines: [{ name: "Sepia", qty: 6, unit: "kg" }, { name: "Lubina", qty: 8, unit: "kg" }], received: true },
    ],
    ingredients: [
      ing("i1", "Arroz bomba", "kg", 380, 330, "p2"),
      ing("i2", "Fumet de pescado", "l", 250, undefined, "p1"),
      ing("i3", "Sepia", "kg", 1100, 1050, "p1"),
      ing("i4", "Aceite de oliva virgen extra", "l", 920, 820),
      ing("i5", "Gamba roja", "kg", 4200, 3800, "p1"),
      ing("i6", "Lubina", "kg", 1400, 1300, "p1"),
      ing("i7", "Sal gorda", "kg", 50),
      ing("i8", "Secreto ibérico", "kg", 1700, 1600, "p4"),
      ing("i9", "Patata", "kg", 90, 80, "p3"),
      ing("i10", "Huevo", "ud", 24, 20, "p3"),
      ing("i11", "Queso crema", "kg", 900, 850),
      ing("i12", "Nata para montar", "l", 400),
      ing("i13", "Carne de ternera picada", "kg", 1450, 1310, "p4"),
      ing("i14", "Pan de hamburguesa", "ud", 45),
      ing("i15", "Conejo troceado", "kg", 780, 740, "p4"),
      ing("i16", "Embutido de Elche", "kg", 1200),
    ],
    recipes: [
      rec(byName("Arroz a banda"), [["i1", 0.1], ["i2", 0.35], ["i3", 0.06], ["i4", 0.02]], "Por persona: 100 g de arroz, 350 ml de fumet. Sofrito de ñora y sepia, 18 minutos."),
      rec(byName("Arroz con costra"), [["i1", 0.1], ["i15", 0.15], ["i16", 0.06], ["i10", 1], ["i2", 0.3]], "Arroz de Elche: conejo, embutido y costra de huevo al horno 5 minutos."),
      rec(byName("Gamba roja a la plancha"), [["i5", 0.25], ["i7", 0.02]], "250 g por ración. Plancha muy fuerte y sal gorda, sin pelar."),
      rec(byName("Lubina a la sal"), [["i6", 0.5], ["i7", 0.8]], "Pieza de 500 g en costra de sal, 20 minutos a 200 grados. Se abre en sala."),
      rec(byName("Secreto ibérico con salsa de mostaza"), [["i8", 0.22], ["i9", 0.2], ["i4", 0.02]], "220 g de secreto a la brasa, patata panadera y salsa aparte."),
      rec(byName("Tarta de queso al horno"), [["i11", 0.1], ["i10", 1], ["i12", 0.05]], "Porción de un doceavo. Se sirve templada."),
      rec(byName("Hamburguesa de ternera con queso"), [["i13", 0.18], ["i14", 1], ["i9", 0.2], ["i4", 0.02]], "180 g de ternera al punto que pidan, queso fundido, patatas aparte."),
    ].filter((x): x is ProRecipe => x !== null),
    targetFoodCostPct: 32,
    groupMenus: [
      gmenu("gm1", "Menú graduación", "Graduación", 3200, [["Entrantes para compartir", ["Croquetas, tellinas y ensalada de tomate"]], ["Arroz", ["Arroz a banda", "Arroz negro", "Paella de verduras"]], ["Postre", ["Tarta de queso", "Helado de turrón"]]], "Pan, bebida y café", 20, 25),
      gmenu("gm2", "Cena de Navidad de clase", "Cena de clase", 2800, [["Entrantes", ["Para compartir al centro"]], ["Principal", ["Arroz del señoret", "Secreto ibérico", "Lubina"]], ["Postre", ["Flan casero", "Brownie"]]], "Pan, dos bebidas y café", 15, 20),
      gmenu("gm3", "Comida Erasmus", "Comida Erasmus", 2200, [["Entrante", ["Ensalada y croquetas"]], ["Arroz", ["Paella de verduras", "Arroz a banda"]], ["Postre", ["Fruta", "Helado de turrón"]]], "Pan y una bebida", 12, 20),
    ],
    groupDeals: restaurantDeals(ctx),
    usuals: [],
    reviewLink: "https://franky.es/n/casa-marea",
  };
}

function restaurantDeals(ctx: TablesOpsContext): ProGroupDeal[] {
  const today = localDate(ctx.now);
  const out: ProGroupDeal[] = [];
  const grad = ctx.groupRequests.find((g) => g.id === "g1");
  if (grad) {
    // 31 de 38 han elegido ya su plato desde el enlace.
    const names = [
      "Álex Molina", "Nerea Soto", "Iván Campos", "Laura Pérez", "Carla Ruiz",
      "Diego Martín", "Sara Gil", "Javier León", "Marta Sanz", "Paula Vidal",
      "Jorge Rubio", "Elena Cano", "Hugo Ferrer", "Lucía Mora", "Mario Pons",
      "Irene Gómez", "Adrián Rey", "Noelia Vera", "Pablo Ibáñez", "Ana Llorca",
      "Raúl Serna", "Julia Moll", "Óscar Lara", "Clara Ríos", "Sergio Pla",
      "Alba Costa", "Marcos Durá", "Inés Brotons", "Carlos Amat", "Eva Sirvent",
      "Rocío Pardo",
    ];
    const arroces = ["Arroz a banda", "Arroz negro", "Paella de verduras"];
    const postres = ["Tarta de queso", "Helado de turrón"];
    const choices: ProGroupChoice[] = names.map((name, i) => ({
      id: `ch${i + 1}`,
      name,
      dishes: [
        "Croquetas, tellinas y ensalada de tomate",
        i === 4 ? "Paella de verduras" : arroces[i % 5 === 0 ? 1 : i % 7 === 0 ? 2 : 0],
        postres[i % 3 === 0 ? 1 : 0],
      ],
      allergies:
        i === 1 || i === 9
          ? "Celiaquía"
          : i === 4
            ? "Vegana"
            : undefined,
    }));
    out.push({
      requestId: grad.id,
      menuId: "gm1",
      perPersonCents: 3200,
      depositCents: 38000,
      depositPaidAt: atLocal(addDays(today, -6), 13 * 60),
      depositMethod: "transferencia",
      stage: "deposit",
      closeBy: addDays(localDate(grad.date), -3),
      finalPeople: 38,
      sentAt: atLocal(addDays(today, -9), 18 * 60),
      choices,
    });
  }
  // Comida de hoy con el número cerrado: 10 de 12 ya han elegido arroz.
  const lunch = ctx.groupRequests.find((g) => g.id === "g4");
  if (lunch) {
    const names = [
      "Nuria Sempere", "Andrea Pastor", "Lola Richart", "Bruno Vidal",
      "Celia Ortuño", "Samuel Pérez", "Aitana Boix", "Jorge Llinares",
      "Noa Carbonell", "Víctor Such",
    ];
    out.push({
      requestId: lunch.id,
      menuId: "gm3",
      perPersonCents: 2200,
      depositCents: 6000,
      depositPaidAt: atLocal(addDays(today, -4), 10 * 60),
      depositMethod: "bizum",
      stage: "closed",
      closeBy: addDays(today, -1),
      finalPeople: 12,
      sentAt: atLocal(addDays(today, -7), 12 * 60),
      choices: names.map((name, i) => ({
        id: `cl${i + 1}`,
        name,
        dishes: [
          "Ensalada y croquetas",
          i % 4 === 1 ? "Paella de verduras" : "Arroz a banda",
          i % 3 === 0 ? "Helado de turrón" : "Fruta",
        ],
        allergies: i === 2 ? "Celiaquía" : i === 6 ? "Sin lactosa" : undefined,
      })),
    });
  }
  const erasmus = ctx.groupRequests.find((g) => g.id === "g3");
  if (erasmus)
    out.push({
      requestId: erasmus.id,
      menuId: "gm3",
      perPersonCents: 2400,
      depositCents: 11500,
      stage: "quoted",
      sentAt: atLocal(addDays(today, -2), 11 * 60),
      closeBy: addDays(localDate(erasmus.date), -2),
      finalPeople: erasmus.people,
      choices: [],
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Historial común: APPCC, desperdicio, cuadrante, cierres             */
/* ------------------------------------------------------------------ */

function haccpHistory(
  ctx: TablesOpsContext,
  r: Rng,
  units: ProColdUnit[],
  tasks: ProHaccpTask[],
): ProHaccpEntry[] {
  const today = localDate(ctx.now);
  const nowMin = localMinutes(ctx.now);
  const out: ProHaccpEntry[] = [];
  let n = 0;
  for (let d = 20; d >= 0; d--) {
    const date = addDays(today, -d);
    const h = ctx.hours[weekdayIndex(date)];
    if (!h) continue;
    const moments: ("apertura" | "cierre")[] = [];
    if (d > 0 || nowMin >= h.open + 20) moments.push("apertura");
    if (d > 0) moments.push("cierre");
    // Un día de hace una semana se olvidó el registro del cierre.
    if (d === 7) moments.pop();
    for (const moment of moments) {
      const minute = moment === "apertura" ? h.open + 10 : Math.min(h.close + 10, 24 * 60 - 5);
      const staffId = ctx.staff[(d + (moment === "cierre" ? 1 : 0)) % ctx.staff.length]?.id;
      for (const unit of units) {
        // Hace cinco días la vitrina o la cámara se calentó y se corrigió.
        const alert = d === 5 && unit === units[1] && moment === "apertura";
        const mid = (unit.min + unit.max) / 2;
        const value = alert
          ? unit.max + 2.5
          : Math.round((mid + (r.next() - 0.5) * (unit.max - unit.min) * 0.6) * 10) / 10;
        out.push({
          id: `hc${++n}`,
          at: atLocal(date, Math.min(minute + 1, 24 * 60 - 1)),
          date,
          moment,
          staffId,
          unitId: unit.id,
          value,
          ok: tempInRange(unit, value),
          action: alert
            ? "Puerta mal cerrada. Se cerró, se revisó a los 30 minutos (4 grados) y se retiró el producto expuesto."
            : undefined,
        });
      }
      for (const task of tasks.filter((t) => t.moment === moment)) {
        out.push({
          id: `hc${++n}`,
          at: atLocal(date, Math.min(minute + 5, 24 * 60 - 1)),
          date,
          moment,
          staffId,
          taskId: task.id,
          ok: true,
        });
      }
    }
  }
  return out;
}

function wasteHistory(
  ctx: TablesOpsContext,
  r: Rng,
  items: [string, ProWasteEntry["unit"], number, ProWasteEntry["fate"][]][],
): ProWasteEntry[] {
  const today = localDate(ctx.now);
  const out: ProWasteEntry[] = [];
  let n = 0;
  for (let d = 24; d >= 1; d--) {
    const date = addDays(today, -d);
    const h = ctx.hours[weekdayIndex(date)];
    if (!h || !r.chance(0.7)) continue;
    const [item, unit, cost, fates] = r.pick(items);
    const qty = unit === "kg" ? r.int(1, 3) : r.int(2, 9);
    const fate = r.pick(fates);
    out.push({
      id: `ws${++n}`,
      date,
      at: atLocal(date, Math.max(h.open, h.close - 20)),
      item,
      qty,
      unit,
      fate,
      valueCents: qty * cost,
      reason:
        fate === "vendido"
          ? "Pack de última hora para estudiantes"
          : fate === "donado"
            ? "Entregado a la parroquia de San Vicente"
            : fate === "aprovechado"
              ? item.startsWith("Sobras")
                ? "Se lo llevó el cliente en táper"
                : "Comida del personal"
              : undefined,
    });
  }
  return out;
}

/** Turnos de esta semana y la siguiente, según el horario del local. */
function rotaFor(ctx: TablesOpsContext): ProRotaShift[] {
  const today = localDate(ctx.now);
  const nowMin = localMinutes(ctx.now);
  const monday = addDays(today, -weekdayIndex(today));
  const out: ProRotaShift[] = [];
  let n = 0;
  const push = (staffId: string | undefined, date: string, from: number, to: number, label?: string) => {
    if (!staffId || to <= from) return;
    out.push({ id: `rt${++n}`, staffId, date, from, to, label });
  };
  const s = ctx.staff.map((p) => p.id);
  for (let i = 0; i < 14; i++) {
    const date = addDays(monday, i);
    const w = weekdayIndex(date);
    const h = ctx.hours[w];
    if (!h) continue;
    if (ctx.vertical === "cafe") {
      const mid = h.open + Math.round((h.close - h.open) / 2 / 15) * 15;
      if (w <= 4) {
        push(s[0], date, h.open - 15, mid + 30);
        push(s[1], date, mid - 30, h.close + 15);
        push(s[2], date, h.open - 15, h.open + 4 * 60);
      } else {
        push(s[2], date, h.open - 15, h.close + 15);
        push(w === 5 ? s[0] : s[1], date, h.open - 15, h.close + 15);
      }
    } else if (ctx.vertical === "bar") {
      const late = Math.min(h.close + 15, 24 * 60 + 15);
      push(s[0], date, h.open - 30, 16 * 60 + 30);
      if (h.close > 20 * 60) push(s[0], date, 20 * 60, late);
      if (w >= 1 && w <= 5) push(s[1], date, 18 * 60, late);
      if (w !== 2) push(s[2], date, h.open, 16 * 60 + 30);
      if (w !== 2 && h.close > 20 * 60) push(s[2], date, 20 * 60, late, w === 1 ? "Partido" : undefined);
      push(s[3], date, h.open - 30, 16 * 60);
      if (h.close > 20 * 60 && w !== 6) push(s[3], date, 20 * 60, 23 * 60 + 30);
    } else {
      const lunchEnd = 16 * 60 + 30;
      push(s[0], date, 12 * 60 + 30, lunchEnd);
      if (h.close > 20 * 60) push(s[0], date, 19 * 60 + 30, 24 * 60);
      push(s[1], date, 11 * 60, lunchEnd);
      if (h.close > 20 * 60 && w !== 0) push(s[1], date, 19 * 60, 23 * 60 + 45);
      if (w !== 1) push(s[2], date, 12 * 60 + 30, lunchEnd);
      if (w !== 1 && h.close > 20 * 60) push(s[2], date, 20 * 60, 24 * 60);
      if (w !== 3) push(s[3], date, 13 * 60, lunchEnd);
      if (w !== 3 && h.close > 20 * 60) push(s[3], date, 20 * 60, 24 * 60);
      if (w <= 4) push(s[4], date, 12 * 60, 16 * 60);
    }
  }
  // Quien entra justo ahora llega tarde: sirve para ver el aviso de fichaje.
  const h = ctx.hours[weekdayIndex(today)];
  const lateId = s[s.length - 1];
  if (h && lateId && nowMin >= h.open + 30 && nowMin < h.close - 60) {
    const from = Math.max(h.open, Math.floor((nowMin - 20) / 15) * 15);
    const kept = out.filter(
      (x) => !(x.staffId === lateId && x.date === today && x.from <= nowMin && x.to > nowMin),
    );
    kept.push({ id: `rt${++n}`, staffId: lateId, date: today, from, to: Math.min(h.close, from + 4 * 60) });
    return kept;
  }
  return out;
}

function closingsFor(ctx: TablesOpsContext, r: Rng): ProCashClosing[] {
  const today = localDate(ctx.now);
  const out: ProCashClosing[] = [];
  const scale = ctx.vertical === "cafe" ? 1 : ctx.vertical === "bar" ? 1.9 : 4.2;
  for (let d = 14; d >= 1; d--) {
    const date = addDays(today, -d);
    const h = ctx.hours[weekdayIndex(date)];
    if (!h) continue;
    const weekend = weekdayIndex(date) >= 4;
    const total = Math.round((r.int(52000, 78000) * scale * (weekend ? 1.25 : 1)) / 100) * 100;
    const card = Math.round((total * (0.58 + r.next() * 0.1)) / 10) * 10;
    const bizum = Math.round((total * (0.05 + r.next() * 0.04)) / 10) * 10;
    const cash = total - card - bizum;
    const diff = d === 4 ? -1250 : d === 9 ? 300 : 0;
    out.push({
      id: `cl${d}`,
      date,
      closedAt: atLocal(date, Math.min(h.close + 12, 24 * 60 - 1)),
      staffId: ctx.staff[d % ctx.staff.length]?.id,
      cashCents: cash + 15000 + diff,
      cardCents: card,
      bizumCents: bizum,
      floatCents: 15000,
      expectedCashCents: cash,
      tipsCents: Math.round((r.int(1500, 4800) * scale) / 50) * 50,
      covers: ctx.vertical === "cafe" ? undefined : Math.round(total / (ctx.vertical === "bar" ? 1400 : 3200)),
      nextDayNote:
        d === 1
          ? ctx.vertical === "cafe"
            ? "Queda poca bebida de avena. Mañana llega Lácteos Vega Baja."
            : ctx.vertical === "bar"
              ? "El grifo 2 pierde. Llamar al técnico de la distribuidora."
              : "Mañana entra pescado de la lonja a las 10:00. Recibe Raúl."
          : undefined,
    });
  }
  return out;
}

/** Algunas reservas de mañana ya avisadas por WhatsApp y alguna confirmada. */
function contactsFor(ctx: TablesOpsContext) {
  const tomorrow = addDays(localDate(ctx.now), 1);
  return ctx.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        b.status === "confirmed" &&
        localDate(b.start) === tomorrow,
    )
    .slice(0, 3)
    .map((b, i) => ({
      bookingId: b.id,
      remindedAt: atLocal(localDate(ctx.now), 11 * 60 + i * 3),
      confirmedAt: i === 0 ? atLocal(localDate(ctx.now), 11 * 60 + 20) : undefined,
    }));
}

/* ------------------------------------------------------------------ */
/* Atajos                                                              */
/* ------------------------------------------------------------------ */

function sup(
  id: string,
  name: string,
  category: string,
  phone: string,
  deliveryDays: number[],
  orderBefore?: number,
): ProSupplier {
  return { id, name, category, phone, deliveryDays, orderBefore };
}

function ing(
  id: string,
  name: string,
  unit: ProIngredient["unit"],
  costCents: number,
  previousCostCents?: number,
  supplierId?: string,
): ProIngredient {
  return {
    id,
    name,
    unit,
    costCents,
    previousCostCents,
    supplierId,
    updatedAt: "2026-09-01T09:00:00.000Z",
  };
}

function rec(
  menuItemId: string | undefined,
  lines: [string, number][],
  method?: string,
): ProRecipe | null {
  if (!menuItemId) return null;
  return {
    menuItemId,
    lines: lines.map(([ingredientId, qty]) => ({ ingredientId, qty })),
    method,
  };
}

function stk(
  id: string,
  name: string,
  category: string,
  supplierId: string,
  unit: string,
  min: number,
  current: number,
  costCents: number,
): ProStockItem {
  return { id, name, category, supplierId, unit, min, current, costCents, previousCount: current + Math.ceil(min / 2) };
}

function line(
  id: string,
  name: string,
  qty: number,
  unit: string,
  supplierId: string,
  itemId: string | undefined,
  date: string,
  minute: number,
  addedBy?: string,
) {
  return { id, name, qty, unit, supplierId, itemId, addedAt: atLocal(date, minute), addedBy };
}

function cold(
  id: string,
  name: string,
  kind: ProColdUnit["kind"],
  min: number,
  max: number,
): ProColdUnit {
  return { id, name, kind, min, max };
}

function task(
  id: string,
  name: string,
  zone: string,
  moment: ProHaccpTask["moment"],
): ProHaccpTask {
  return { id, name, zone, moment };
}

function gmenu(
  id: string,
  name: string,
  occasion: string,
  priceCents: number,
  courses: [string, string[]][],
  includes: string,
  minPeople: number,
  depositPct: number,
): ProGroupMenu {
  return {
    id,
    name,
    occasion,
    priceCents,
    courses: courses.map(([label, options]) => ({ label, options })),
    includes,
    minPeople,
    depositPct,
  };
}
