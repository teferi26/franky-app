import { describe, expect, it } from "vitest";
import {
  helpersFor,
  openingIntervals,
  staffFreeFor,
} from "@/lib/pro/agenda";
import {
  applyCheckout,
  cabinStats,
  materialLines,
  serviceMargin,
  sessionsLeft,
} from "@/lib/pro/agenda-money";
import {
  PHOTOS_PER_CLIENT,
  addPhoto,
  canTakePhotos,
  photoPairs,
  removePhoto,
  setConsent,
  setShowcase,
  showcasePhotos,
} from "@/lib/pro/agenda-clients";
import {
  createGroupBookings,
  groupBookings,
  groupMemberName,
  groupPlan,
  groupScheduleText,
  parseNames,
} from "@/lib/pro/agenda-groups";
import { buildDemo } from "@/lib/pro/demo";
import type {
  ProClientPhoto,
  ProProduct,
} from "@/lib/pro/agenda-types";
import { atLocal, localMinutes } from "@/lib/pro/format";
import type { ProData, ProGroupRequest } from "@/lib/pro/types";
import { NOW, TODAY, agendaFixture, booking } from "./pro-agenda-fixture";

const LONG_DASH = /[–—]/;

/** Primera hora de apertura de una persona hoy en la demo. */
function opensAt(data: ProData, staffId: string): number {
  return openingIntervals(data, TODAY, staffId)[0].open;
}

/* ------------------------------------------------------------------ */
/* Dos personas en una cita                                            */
/* ------------------------------------------------------------------ */

describe("segunda persona en una cita", () => {
  it("solo está libre si no tiene nada durante toda la cita", () => {
    const base = agendaFixture();
    const open = opensAt(base, "s3");
    const data: ProData = {
      ...base,
      bookings: [booking("b1", TODAY, open + 30, { staffId: "s3" })],
    };
    expect(staffFreeFor(data, TODAY, "s3", open, open + 30)).toBe(true);
    expect(staffFreeFor(data, TODAY, "s3", open, open + 45)).toBe(false);
    expect(staffFreeFor(data, TODAY, "s3", open + 60, open + 90)).toBe(true);
  });

  it("fuera de su horario no puede ayudar", () => {
    const data = agendaFixture();
    const open = opensAt(data, "s3");
    expect(staffFreeFor(data, TODAY, "s3", open - 30, open + 30)).toBe(false);
  });

  it("una cita con ayudante ocupa también su columna", () => {
    const base = agendaFixture();
    const open = opensAt(base, "s1");
    const data: ProData = {
      ...base,
      bookings: [
        booking("b1", TODAY, open, {
          staffId: "s1",
          resourceIds: ["s1", "s3"],
          durationMin: 60,
        }),
      ],
    };
    expect(staffFreeFor(data, TODAY, "s3", open + 15, open + 45)).toBe(false);
    const helpers = helpersFor(data, TODAY, "s1", open, open + 60);
    expect(helpers.map((h) => h.staff.id)).not.toContain("s1");
    expect(helpers.find((h) => h.staff.id === "s3")?.free).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Material por servicio                                               */
/* ------------------------------------------------------------------ */

const dye: ProProduct = {
  id: "dye",
  name: "Tinte 7.1",
  kind: "tech",
  priceCents: 0,
  costCents: 720,
  stock: 2,
  min: 4,
};
const oxidant: ProProduct = {
  id: "ox",
  name: "Oxidante 20 vol",
  kind: "tech",
  priceCents: 0,
  costCents: 900,
  stock: 5,
  min: 2,
};

function withMaterials(): ProData {
  const data = agendaFixture();
  return {
    ...data,
    agendaOps: { ...data.agendaOps!, products: [dye, oxidant] },
    services: data.services.map((s) =>
      s.id === "sv6"
        ? {
            ...s,
            priceCents: 3800,
            agenda: {
              ...s.agenda,
              materials: [
                { productId: "dye", qty: 0.5 },
                { productId: "ox", qty: 0.25 },
              ],
            },
          }
        : s,
    ),
  };
}

describe("material que gasta cada servicio", () => {
  it("calcula coste y margen con fracciones de producto", () => {
    const data = withMaterials();
    const service = data.services.find((s) => s.id === "sv6")!;
    const margin = serviceMargin(data, service)!;
    // 0,5 x 7,20 + 0,25 x 9,00 = 3,60 + 2,25
    expect(margin.costCents).toBe(585);
    expect(margin.marginCents).toBe(3800 - 585);
    expect(margin.marginPct).toBe(85);
  });

  it("sin material apuntado no hay margen que enseñar", () => {
    const data = withMaterials();
    const cut = data.services.find((s) => s.id === "sv1")!;
    expect(serviceMargin(data, cut)).toBeNull();
    expect(sessionsLeft(data.agendaOps!.products, undefined)).toBeNull();
  });

  it("ignora productos borrados y cuenta las sesiones que quedan", () => {
    const products = [dye, oxidant];
    const lines = materialLines(products, [
      { productId: "dye", qty: 0.5 },
      { productId: "gone", qty: 1 },
    ]);
    expect(lines).toHaveLength(1);
    // 2 tubos a medio tubo por sesión: 4 sesiones.
    expect(
      sessionsLeft(products, [
        { productId: "dye", qty: 0.5 },
        { productId: "ox", qty: 0.25 },
      ]),
    ).toBe(4);
  });

  it("al cobrar la cita el material sale del stock", () => {
    const base = withMaterials();
    const data: ProData = {
      ...base,
      bookings: [
        booking("b1", TODAY, 600, { staffId: "s2", serviceId: "sv6" }),
      ],
    };
    const after = applyCheckout(data, {
      paymentId: "p1",
      at: atLocal(TODAY, 700),
      bookingId: "b1",
      clientId: "c1",
      clientName: "Pablo Ruiz",
      staffId: "s2",
      serviceId: "sv6",
      serviceName: "Color raíz",
      draft: {
        serviceCents: 3800,
        products: [],
        discount: { kind: "none" },
        useBundle: false,
        depositPaidCents: 0,
        giftCardCents: 0,
        tipCents: 0,
      },
      method: "card",
    });
    const stock = new Map(
      after.agendaOps!.products.map((p) => [p.id, p.stock]),
    );
    expect(stock.get("dye")).toBe(1.5);
    expect(stock.get("ox")).toBe(4.75);
  });

  it("una venta sin cita no gasta material de ningún servicio", () => {
    const data = withMaterials();
    const after = applyCheckout(data, {
      paymentId: "p1",
      at: atLocal(TODAY, 700),
      clientName: "Venta",
      serviceId: "sv6",
      draft: {
        serviceCents: 0,
        products: [],
        discount: { kind: "none" },
        useBundle: false,
        depositPaidCents: 0,
        giftCardCents: 0,
        tipCents: 0,
      },
      method: "cash",
    });
    expect(after.agendaOps!.products.find((p) => p.id === "dye")!.stock).toBe(
      2,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Rentabilidad por cabina                                             */
/* ------------------------------------------------------------------ */

describe("rentabilidad por cabina", () => {
  it("sin cabinas no hay filas", () => {
    expect(cabinStats(agendaFixture(), NOW)).toEqual([]);
  });

  it("cuenta sesiones, ocupación con preparación y facturación por hora", () => {
    const demo = buildDemo("beauty", NOW);
    const rows = cabinStats(demo, NOW);
    expect(rows.map((row) => row.cabin.id).sort()).toEqual(
      ["cb1", "cb2", "mq1"].sort(),
    );
    for (const row of rows) {
      expect(row.occupancyPct).toBeGreaterThanOrEqual(0);
      expect(row.occupancyPct).toBeLessThanOrEqual(100);
      if (row.sessions) {
        expect(row.perBusyHourCents).toBeGreaterThan(0);
        expect(row.perBusyHourCents).toBeGreaterThanOrEqual(
          row.perOpenHourCents,
        );
      }
    }
    const laser = rows.find((row) => row.cabin.id === "mq1")!;
    // El láser solo hace un tratamiento: 45 min + 10 de preparación.
    expect(laser.bookedMinutes).toBe(laser.sessions * 55);
  });
});

/* ------------------------------------------------------------------ */
/* Antes y después                                                     */
/* ------------------------------------------------------------------ */

function photo(
  id: string,
  at: string,
  kind: ProClientPhoto["kind"],
): ProClientPhoto {
  return { id, at, kind, src: "data:image/jpeg;base64,AAAA" };
}

function withPhotoConsent(): ProData {
  return setConsent(agendaFixture(), "c1", "photos", true, NOW.toISOString());
}

describe("fotos de antes y después", () => {
  it("sin permiso de fotos no se guarda nada", () => {
    const data = agendaFixture();
    const after = addPhoto(
      data,
      "c1",
      photo("f1", "2026-09-20T10:00:00Z", "before"),
    );
    expect(after).toBe(data);
    expect(canTakePhotos(after.clients[0])).toBe(false);
  });

  it("empareja antes y después del mismo día, la visita más reciente primero", () => {
    let data = withPhotoConsent();
    data = addPhoto(data, "c1", photo("f1", "2026-08-10T10:00:00Z", "before"));
    data = addPhoto(data, "c1", photo("f2", "2026-08-10T11:00:00Z", "after"));
    data = addPhoto(data, "c1", photo("f3", "2026-09-20T10:00:00Z", "after"));
    const pairs = photoPairs(data.clients.find((c) => c.id === "c1"));
    expect(pairs.map((p) => p.date)).toEqual(["2026-09-20", "2026-08-10"]);
    expect(pairs[1].before?.id).toBe("f1");
    expect(pairs[1].after?.id).toBe("f2");
    expect(pairs[0].before).toBeUndefined();
  });

  it("guarda solo las más recientes para no cargar la ficha", () => {
    let data = withPhotoConsent();
    for (let i = 0; i < PHOTOS_PER_CLIENT + 3; i++)
      data = addPhoto(
        data,
        "c1",
        photo(`f${i}`, new Date(Date.UTC(2026, 0, i + 1)).toISOString(), "after"),
      );
    const photos = data.clients.find((c) => c.id === "c1")!.agenda!.photos!;
    expect(photos).toHaveLength(PHOTOS_PER_CLIENT);
    expect(photos[0].id).toBe("f3");
  });

  it("el escaparate solo enseña lo marcado y de quien mantiene el permiso", () => {
    let data = withPhotoConsent();
    data = addPhoto(data, "c1", photo("f1", "2026-09-20T10:00:00Z", "after"));
    data = addPhoto(data, "c1", photo("f2", "2026-09-21T10:00:00Z", "after"));
    data = setShowcase(data, "c1", "f1", true);
    expect(showcasePhotos(data).map((row) => row.photo.id)).toEqual(["f1"]);

    // Retirar el permiso borra sus fotos de la ficha y del escaparate.
    data = setConsent(data, "c1", "photos", false, NOW.toISOString());
    expect(showcasePhotos(data)).toEqual([]);
    expect(data.clients.find((c) => c.id === "c1")!.agenda?.photos).toBe(
      undefined,
    );
  });

  it("no se puede marcar para el escaparate sin permiso y se puede quitar una foto", () => {
    let data = withPhotoConsent();
    data = addPhoto(data, "c1", photo("f1", "2026-09-20T10:00:00Z", "after"));
    data = removePhoto(data, "c1", "f1");
    expect(data.clients.find((c) => c.id === "c1")!.agenda!.photos).toEqual(
      [],
    );
    const noConsent = agendaFixture();
    expect(setShowcase(noConsent, "c2", "x", true)).toBe(noConsent);
  });
});

/* ------------------------------------------------------------------ */
/* Grupos con horario montado                                          */
/* ------------------------------------------------------------------ */

const GROUP: ProGroupRequest = {
  id: "g1",
  organizer: "Carla Soler",
  organization: "Delegación de Arquitectura",
  kind: "Peinados para la graduación",
  people: 5,
  date: atLocal("2026-10-15", 10 * 60),
  budgetPerPersonCents: 1800,
  message: "Somos 5 y queremos ir juntas.",
  status: "new",
  createdAt: NOW.toISOString(),
};

describe("grupos con horario montado", () => {
  it("reparte a las personas sin pisarse ni pisar lo que ya había", () => {
    const base = agendaFixture();
    const date = "2026-10-15";
    const from = 10 * 60;
    const data: ProData = {
      ...base,
      groupRequests: [GROUP],
      bookings: [booking("b1", date, from, { staffId: "s1" })],
    };
    const plan = groupPlan(data, {
      date,
      fromMinute: from,
      serviceId: "sv2",
      people: 5,
      staffIds: ["s1", "s3"],
    });
    expect(plan.slots).toHaveLength(5);
    expect(plan.missing).toBe(0);
    // s1 está ocupado a las 10:00: la primera cita va con s3.
    expect(plan.slots[0]).toMatchObject({ staffId: "s3", minute: from });
    for (const staffId of ["s1", "s3"]) {
      const mine = plan.slots
        .filter((s) => s.staffId === staffId)
        .map((s) => s.minute)
        .sort((a, b) => a - b);
      for (let i = 1; i < mine.length; i++)
        expect(mine[i] - mine[i - 1]).toBeGreaterThanOrEqual(30);
      if (staffId === "s1") expect(mine.every((m) => m >= from + 30)).toBe(true);
    }
    expect(plan.endMinute).toBe(
      Math.max(...plan.slots.map((s) => s.minute)) + 30,
    );
  });

  it("dice cuántos no caben si el día no da para todos", () => {
    const data = { ...agendaFixture(), groupRequests: [GROUP] };
    const close = openingIntervals(data, "2026-10-15", "s1").at(-1)!.close;
    const plan = groupPlan(data, {
      date: "2026-10-15",
      fromMinute: close - 60,
      serviceId: "sv2",
      people: 5,
      staffIds: ["s1"],
    });
    expect(plan.slots).toHaveLength(2);
    expect(plan.missing).toBe(3);
  });

  it("crea las citas con nombres, precio y la petición aceptada", () => {
    const data = { ...agendaFixture(), groupRequests: [GROUP] };
    const plan = groupPlan(data, {
      date: "2026-10-15",
      fromMinute: 600,
      serviceId: "sv2",
      people: 3,
      staffIds: ["s1", "s3"],
    });
    const names = parseNames("Carla\nMarta, Lucía");
    expect(names).toEqual(["Carla", "Marta", "Lucía"]);
    const after = createGroupBookings(data, {
      request: GROUP,
      plan,
      serviceId: "sv2",
      names: names.slice(0, 2),
      perPersonCents: 1200,
      ids: ["gb1", "gb2", "gb3"],
    });
    const created = groupBookings(after, "g1");
    expect(created).toHaveLength(3);
    expect(created.map((b) => b.clientName)).toEqual([
      "Carla",
      "Marta",
      "Delegación de Arquitectura 3",
    ]);
    expect(created.every((b) => b.source === "grupo")).toBe(true);
    expect(created.every((b) => b.priceCents === 1200)).toBe(true);
    expect(after.groupRequests[0]).toMatchObject({
      status: "accepted",
      quoteCents: 1200,
    });
    expect(localMinutes(created[0].start)).toBe(600);

    const text = groupScheduleText(after, GROUP, created);
    expect(text).toContain("Hola Carla");
    expect(text).toContain("10:00 Carla");
    expect(text).not.toMatch(LONG_DASH);
  });

  it("sin profesionales o sin servicio no monta nada", () => {
    const data = { ...agendaFixture(), groupRequests: [GROUP] };
    const empty = groupPlan(data, {
      date: "2026-10-15",
      fromMinute: 600,
      serviceId: "sv2",
      people: 4,
      staffIds: [],
    });
    expect(empty).toMatchObject({ slots: [], missing: 4, endMinute: null });
    expect(groupMemberName(GROUP, [], 0)).toBe("Delegación de Arquitectura 1");
    expect(
      createGroupBookings(data, {
        request: GROUP,
        plan: empty,
        serviceId: "sv2",
        names: [],
        perPersonCents: 1000,
        ids: [],
      }),
    ).toBe(data);
  });
});
