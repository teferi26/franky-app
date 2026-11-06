import { describe, expect, it } from "vitest";
import { durationFor, startTimes } from "@/lib/pro/agenda";
import {
  createSeries,
  seriesPlan,
  serveWalkin,
  waitlistFit,
} from "@/lib/pro/agenda-ops";
import {
  CHECKLIST_KEEP_DAYS,
  bookingFlags,
  briefText,
  briefWarnings,
  categoryIndex,
  checklistItems,
  checklistMoment,
  checklistProgress,
  clientPlans,
  defaultChecklist,
  marksOn,
  saveChecklist,
  serviceCategories,
  seriesPosition,
  staffDayBrief,
  toggleCheck,
} from "@/lib/pro/agenda-day";
import { groupPlan } from "@/lib/pro/agenda-groups";
import { addDays, atLocal, localMinutes } from "@/lib/pro/format";
import type { ProData } from "@/lib/pro/types";
import {
  NOW,
  TODAY,
  TOMORROW,
  agendaFixture,
  booking,
  client,
} from "./pro-agenda-fixture";

/** El servicio sv1 (corte, 30 min) le lleva a Marcos 45 minutos. */
function slowMarcos(): ProData {
  const data = agendaFixture();
  data.services = data.services.map((service) =>
    service.id === "sv1"
      ? {
          ...service,
          agenda: { ...service.agenda, staffMin: { s3: 45 } },
        }
      : service,
  );
  return data;
}

describe("agenda: duración según la persona", () => {
  it("cada profesional usa su duración y el resto la general", () => {
    const data = slowMarcos();
    const service = data.services.find((s) => s.id === "sv1");
    expect(durationFor(service, "s3")).toBe(45);
    expect(durationFor(service, "s1")).toBe(30);
    expect(durationFor(undefined, "s1")).toBe(0);
  });

  it("la cola de sin cita reserva el tiempo real de quien atiende", () => {
    let data = slowMarcos();
    data = {
      ...data,
      agendaOps: {
        ...data.agendaOps!,
        walkins: [
          {
            id: "wk1",
            name: "Iker",
            serviceId: "sv1",
            arrivedAt: NOW.toISOString(),
            status: "waiting",
          },
        ],
      },
    };
    const start = atLocal(TODAY, 10 * 60);
    const next = serveWalkin(data, "wk1", {
      bookingId: "b-wk",
      staffId: "s3",
      start,
    });
    const created = next.bookings.find((b) => b.id === "b-wk")!;
    expect((Date.parse(created.end) - Date.parse(created.start)) / 60000).toBe(
      45,
    );
  });

  it("la lista de espera solo encaja si cabe el tiempo de esa persona", () => {
    const data = slowMarcos();
    const entry = {
      id: "w1",
      name: "Laura",
      serviceId: "sv1",
      from: 0,
      to: 1440,
      createdAt: NOW.toISOString(),
      status: "waiting" as const,
    };
    const gap = { staffId: "s3", date: TODAY, from: 600, to: 640 };
    expect(waitlistFit(data, entry, gap)).toBeNull();
    expect(waitlistFit(data, entry, { ...gap, staffId: "s1" })).toBe(600);
  });

  it("los grupos se montan con el tiempo de cada profesional", () => {
    const data = slowMarcos();
    const plan = groupPlan(data, {
      date: TOMORROW,
      serviceId: "sv1",
      staffIds: ["s3"],
      people: 2,
      fromMinute: 10 * 60,
    });
    expect(plan.slots.map((slot) => slot.minute)).toEqual([600, 645]);
    expect(plan.endMinute).toBe(690);
  });
});

describe("agenda: plan de sesiones", () => {
  it("sin margen, la fecha que choca se pierde como antes", () => {
    const data = agendaFixture();
    data.bookings = [booking("busy", "2026-10-08", 17 * 60)];
    const plan = seriesPlan(data, {
      serviceId: "sv2",
      staffId: "s1",
      date: TODAY,
      minute: 17 * 60,
      everyWeeks: 2,
      count: 3,
    });
    expect(plan.map((step) => step.free)).toEqual([true, false, true]);
    expect(plan[1].movedFrom).toBeUndefined();
  });

  it("con margen, mueve la sesión a la hora libre más cercana", () => {
    const data = agendaFixture();
    data.bookings = [booking("busy", "2026-10-08", 17 * 60)];
    const plan = seriesPlan(data, {
      serviceId: "sv2",
      staffId: "s1",
      date: TODAY,
      minute: 17 * 60,
      everyWeeks: 2,
      count: 3,
      shiftMin: 120,
    });
    expect(plan[1]).toEqual({
      date: "2026-10-08",
      // A igual distancia (16:30 y 17:30) gana la más temprana.
      minute: 16 * 60 + 30,
      free: true,
      movedFrom: 17 * 60,
    });
    const {
      id: _id,
      start: _s,
      end: _e,
      ...model
    } = booking("m", TODAY, 17 * 60);
    const next = createSeries(data, model, plan, ["a", "b", "c"], "plan", 30);
    const moved = next.bookings.find((b) => b.id === "b")!;
    expect(localMinutes(moved.start)).toBe(16 * 60 + 30);
  });

  it("si no hay nada dentro del margen, la sesión no se reserva", () => {
    const data = agendaFixture();
    // Dani lleno toda la tarde del 8 de octubre.
    data.bookings = [
      booking("tarde", "2026-10-08", 14 * 60, { durationMin: 6 * 60 + 30 }),
    ];
    const plan = seriesPlan(data, {
      serviceId: "sv2",
      staffId: "s1",
      date: TODAY,
      minute: 17 * 60,
      everyWeeks: 2,
      count: 2,
      shiftMin: 60,
    });
    expect(plan[1].free).toBe(false);
  });

  it("dice qué sesión es cada cita y cuál es la siguiente del plan", () => {
    const data = agendaFixture();
    data.bookings = [
      booking("p1", addDays(TODAY, -14), 11 * 60, {
        status: "done",
        agenda: { seriesId: "plan" },
      }),
      booking("p2", addDays(TODAY, 14), 11 * 60, {
        agenda: { seriesId: "plan" },
      }),
      booking("p3", addDays(TODAY, 28), 11 * 60, {
        agenda: { seriesId: "plan" },
      }),
      booking("px", addDays(TODAY, 42), 11 * 60, {
        status: "cancelled",
        agenda: { seriesId: "plan" },
      }),
    ];
    expect(seriesPosition(data, data.bookings[1])).toEqual({
      index: 2,
      total: 3,
    });
    expect(seriesPosition(data, booking("suelta", TODAY, 600))).toBeNull();
    const [plan] = clientPlans(data, "c1", NOW);
    expect(plan.done).toBe(1);
    expect(plan.total).toBe(3);
    expect(plan.next?.id).toBe("p2");
    expect(clientPlans(data, "c2", NOW)).toEqual([]);
  });
});

describe("agenda: apertura y cierre", () => {
  it("empieza con la lista del sector y la cambia el negocio", () => {
    const data = agendaFixture();
    const items = checklistItems(data.agendaOps, "hairdresser");
    expect(items).toEqual(defaultChecklist("hairdresser"));
    expect(checklistItems(data.agendaOps, "beauty", "close")[0].label).toMatch(
      /instrumental/,
    );
    const saved = saveChecklist(data, [
      { id: "a", label: "  Cuadrar la caja ", moment: "close" },
      { id: "b", label: "cuadrar la caja", moment: "close" },
      { id: "c", label: "", moment: "open" },
      { id: "d", label: "Cuadrar la caja", moment: "open" },
    ]);
    expect(saved.agendaOps!.checklist).toEqual([
      { id: "a", label: "Cuadrar la caja", moment: "close" },
      { id: "d", label: "Cuadrar la caja", moment: "open" },
    ]);
  });

  it("toca abrir por la mañana y cerrar por la tarde; cerrado, nada", () => {
    const data = agendaFixture();
    expect(checklistMoment(data, TODAY, 10 * 60)).toBe("open");
    expect(checklistMoment(data, TODAY, 19 * 60)).toBe("close");
    // El fixture cierra el domingo.
    const sunday = "2026-09-27";
    const closed = data.space.hours[6] === null;
    expect(checklistMoment(data, sunday, 10 * 60)).toBe(closed ? null : "open");
  });

  it("marca con quién y cuándo, desmarca y olvida lo antiguo", () => {
    let data = agendaFixture();
    const at = atLocal(TODAY, 9 * 60 + 35);
    data = {
      ...data,
      agendaOps: {
        ...data.agendaOps!,
        checklistLog: [
          {
            itemId: "ck1",
            date: addDays(TODAY, -CHECKLIST_KEEP_DAYS - 1),
            at,
          },
        ],
      },
    };
    data = toggleCheck(data, { itemId: "ck1", date: TODAY, at, staffId: "s1" });
    expect(data.agendaOps!.checklistLog).toEqual([
      { itemId: "ck1", date: TODAY, at, staffId: "s1" },
    ]);
    const items = checklistItems(data.agendaOps, "hairdresser", "open");
    expect(checklistProgress(items, marksOn(data.agendaOps, TODAY))).toEqual({
      done: 1,
      total: items.length,
    });
    data = toggleCheck(data, { itemId: "ck1", date: TODAY, at });
    expect(marksOn(data.agendaOps, TODAY)).toEqual([]);
  });

  it("sin datos del motor no cambia nada", () => {
    const data = { ...agendaFixture(), agendaOps: undefined };
    expect(toggleCheck(data, { itemId: "ck1", date: TODAY, at: TODAY })).toBe(
      data,
    );
    expect(saveChecklist(data, [])).toBe(data);
  });
});

describe("agenda: el día de cada profesional", () => {
  function withFlags(): ProData {
    const data = agendaFixture();
    data.clients = [
      client("c1", "Pablo Ruiz", {
        visits: 6,
        tags: ["Poca conversación"],
        agenda: {
          health: {
            allergies: ["latex"],
            updatedAt: NOW.toISOString(),
          },
        },
      }),
      client("c2", "Marta Gil"),
    ];
    data.bookings = [
      booking("b1", TODAY, 11 * 60, {
        agenda: { deposit: { cents: 500, status: "pending" } },
      }),
      booking("b2", TODAY, 12 * 60, {
        clientId: "c2",
        clientName: "Marta Gil",
        student: true,
        agenda: { confirmedAt: NOW.toISOString() },
      }),
      booking("b3", TODAY, 13 * 60, { staffId: "s3", status: "no_show" }),
    ];
    return data;
  }

  it("junta los avisos de la ficha, primero lo urgente", () => {
    const data = withFlags();
    const labels = bookingFlags(data, data.bookings[0], TODAY).map(
      (flag) => flag.label,
    );
    expect(labels).toEqual([
      "Alergia: Látex",
      "Señal sin cobrar",
      "Sin confirmar",
      "Poca conversación",
    ]);
    const second = bookingFlags(data, data.bookings[1], TODAY);
    expect(second.map((flag) => flag.label)).toEqual([
      "Primera visita",
      "Estudiante",
    ]);
  });

  it("el día de Dani no incluye las faltas ni las citas de otros", () => {
    const data = withFlags();
    const rows = staffDayBrief(data, TODAY, "s1");
    expect(rows.map((row) => row.booking.id)).toEqual(["b1", "b2"]);
    expect(rows[0].health).toBe(true);
    expect(briefWarnings(rows)).toBe(1);
  });

  it("el mensaje para el equipo no cuenta la salud de nadie", () => {
    const data = withFlags();
    const text = briefText(data, TODAY, "s1");
    expect(text.split("\n")[0]).toMatch(/^Dani, así va tu día/);
    expect(text).toContain("11:00 Pablo · Degradado · mira su ficha antes");
    expect(text).toContain("12:00 Marta · Degradado · primera visita");
    expect(text).not.toMatch(/Látex|látex|Señal|confirmar/);
    expect(briefText(data, TOMORROW, "s1")).toMatch(/no tienes citas/);
  });
});

describe("agenda: colores por tipo de servicio", () => {
  it("cada tipo conserva su lugar en la leyenda", () => {
    const data = agendaFixture();
    const categories = serviceCategories(data.services);
    expect(categories.slice(0, 2)).toEqual(["Corte", "Barba"]);
    expect(categories).toContain("Color");
    expect(categoryIndex(data, { serviceId: "sv4" })).toBe(1);
    expect(categoryIndex(data, { serviceId: "no-existe" })).toBe(-1);
  });
});

describe("agenda: huecos con duración propia", () => {
  it("una persona lenta no puede empezar donde no le cabe", () => {
    const data = slowMarcos();
    data.bookings = [
      booking("x", TOMORROW, 11 * 60, { staffId: "s3", durationMin: 30 }),
    ];
    const marcos = startTimes(
      data,
      TOMORROW,
      "s3",
      durationFor(data.services[0], "s3"),
      10 * 60,
      undefined,
      "sv1",
    );
    // 10:15 + 45 min llega a las 11:00: cabe justo; 10:30 ya no.
    expect(marcos).toContain(10 * 60 + 15);
    expect(marcos).not.toContain(10 * 60 + 30);
  });
});
