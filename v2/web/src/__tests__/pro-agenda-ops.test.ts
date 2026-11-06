import { describe, expect, it } from "vitest";
import {
  absenceOn,
  freeGaps,
  openingIntervals,
  poseWindow,
  startTimes,
} from "@/lib/pro/agenda";
import {
  addAbsence,
  addBlock,
  addWaitlist,
  addWalkin,
  bookFromWaitlist,
  bookingMessage,
  createSeries,
  depositRule,
  fillTemplate,
  freedGap,
  markConfirmed,
  markReminded,
  receiveDeposit,
  reminderStats,
  remindersOn,
  removeCabin,
  requestDeposit,
  returnDeposit,
  saveCabin,
  saveStaffRules,
  saveTemplate,
  serveWalkin,
  seriesPlan,
  setBookingStatus,
  studentPriceApplies,
  valleyLabel,
  waitlistMatches,
  walkinQueue,
} from "@/lib/pro/agenda-ops";
import { atLocal } from "@/lib/pro/format";
import type { ProData } from "@/lib/pro/types";
import {
  NOW,
  TODAY,
  TOMORROW,
  agendaFixture,
  booking,
} from "./pro-agenda-fixture";

const LONG_DASH = /[–—]/;

describe("agenda: plantillas de mensajes", () => {
  it("rellena las variables conocidas y deja las demás", () => {
    expect(fillTemplate("Hola {nombre}, a las {hora} {otra}", { nombre: "Ana", hora: "17:00" })).toBe(
      "Hola Ana, a las 17:00 {otra}",
    );
  });

  it("el recordatorio sale con día, hora, servicio y profesional", () => {
    const data = agendaFixture();
    data.bookings = [booking("b1", TOMORROW, 17 * 60)];
    const text = bookingMessage(data, "reminder", data.bookings[0]);
    expect(text).toContain("Pablo");
    expect(text).toContain("17:00");
    expect(text).toContain("degradado");
    expect(text).toContain("Dani");
    expect(text).not.toMatch(LONG_DASH);
  });

  it("una plantilla guardada vacía vuelve a la de Franky", () => {
    const data = saveTemplate(agendaFixture(), "reminder", "   ");
    expect(data.agendaOps!.templates.reminder).toContain("{nombre}");
  });
});

describe("agenda: recordatorios y confirmación", () => {
  it("cuenta recordadas, confirmadas y pendientes de mañana", () => {
    let data = agendaFixture();
    data.bookings = [
      booking("b1", TOMORROW, 10 * 60),
      booking("b2", TOMORROW, 11 * 60, { staffId: "s3" }),
      booking("b3", TOMORROW, 12 * 60, { status: "cancelled" }),
    ];
    data = markReminded(data, "b1", NOW.toISOString());
    data = markConfirmed(data, "b2", NOW.toISOString());
    const rows = remindersOn(data, TOMORROW);
    expect(rows).toHaveLength(2);
    expect(reminderStats(rows)).toMatchObject({
      total: 2,
      reminded: 2,
      confirmed: 1,
      toRemind: 0,
      unconfirmed: 1,
    });
  });
});

describe("agenda: no presentados y señal", () => {
  it("la regla pide señal a partir de N faltas y la del servicio manda", () => {
    const data = agendaFixture();
    data.clients[0].noShows = 2;
    expect(depositRule(data, "c1", "sv2")).toEqual({ cents: 500, reason: "noshows" });
    expect(depositRule(data, "c2", "sv2")).toBeNull();
    // Las mechas llevan su propia señal de 15 €.
    expect(depositRule(data, "c2", "sv7")).toEqual({ cents: 1500, reason: "service" });
  });

  it("la señal entra en caja, se descuenta de lo pendiente y se devuelve", () => {
    let data = agendaFixture();
    data.bookings = [booking("b1", TOMORROW, 10 * 60)];
    data = requestDeposit(data, "b1", 500);
    data = receiveDeposit(data, "b1", { method: "bizum", at: NOW.toISOString(), paymentId: "p1" });
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0]).toMatchObject({ amountCents: 500, method: "bizum" });
    expect(data.bookings[0].paidCents).toBe(500);
    expect(data.bookings[0].agenda?.deposit?.status).toBe("paid");
    data = returnDeposit(data, "b1");
    expect(data.payments).toHaveLength(0);
    expect(data.bookings[0].paidCents).toBe(0);
    expect(data.bookings[0].agenda?.deposit?.status).toBe("returned");
  });

  it("si no viene, suma una falta y la señal se queda", () => {
    let data = agendaFixture();
    data.bookings = [booking("b1", TODAY, 11 * 60)];
    data = requestDeposit(data, "b1", 500);
    data = receiveDeposit(data, "b1", { method: "bizum", at: NOW.toISOString(), paymentId: "p1" });
    data = setBookingStatus(data, "b1", "no_show");
    expect(data.clients[0].noShows).toBe(1);
    expect(data.bookings[0].agenda?.deposit?.status).toBe("kept");
    expect(data.payments).toHaveLength(1);
  });
});

describe("agenda: lista de espera", () => {
  function withCancelled(): ProData {
    let data = agendaFixture();
    data.bookings = [
      booking("b1", TODAY, 11 * 60, { status: "cancelled" }),
      booking("b0", TODAY, 10 * 60, { durationMin: 60 }),
      booking("b2", TODAY, 11 * 60 + 30, { durationMin: 60 * 9 }),
    ];
    data = addWaitlist(data, {
      id: "w1",
      clientId: "c2",
      name: "Marta Gil",
      phone: "600 333 444",
      serviceId: "sv2",
      date: TODAY,
      from: 9 * 60,
      to: 14 * 60,
      createdAt: "2026-09-23T10:00:00.000Z",
      status: "waiting",
    });
    return data;
  }

  it("enseña quién quería el hueco que deja una cancelación", () => {
    const data = withCancelled();
    const gap = freedGap(data, data.bookings[0], NOW);
    expect(gap).toMatchObject({ staffId: "s1", from: 11 * 60, to: 11 * 60 + 30 });
    const matches = waitlistMatches(data, gap!);
    expect(matches.map((m) => m.entry.id)).toEqual(["w1"]);
    expect(matches[0].start).toBe(11 * 60);
  });

  it("darle el hueco crea la cita y la marca como recuperada", () => {
    const data = bookFromWaitlist(withCancelled(), "w1", {
      bookingId: "nb",
      staffId: "s1",
      date: TODAY,
      minute: 11 * 60,
    });
    const created = data.bookings.find((b) => b.id === "nb")!;
    expect(created).toMatchObject({ clientName: "Marta Gil", status: "confirmed", staffId: "s1" });
    expect(created.agenda?.recoveredFrom).toBe("waitlist");
    expect(data.agendaOps!.waitlist[0]).toMatchObject({ status: "booked", bookingId: "nb" });
  });

  it("un hueco pasado no se ofrece", () => {
    const data = agendaFixture();
    data.bookings = [booking("old", "2026-09-23", 11 * 60, { status: "cancelled" })];
    expect(freedGap(data, data.bookings[0], NOW)).toBeNull();
  });
});

describe("agenda: bloqueos, ausencias y pose", () => {
  it("un bloqueo quita esas horas y un bloqueo semanal se repite", () => {
    let data = agendaFixture();
    data = addBlock(data, { id: "bl", staffId: "s1", date: TODAY, from: 13 * 60, to: 14 * 60, reason: "Descanso", weekly: true });
    const today = startTimes(data, TODAY, "s1", 30);
    expect(today).not.toContain(13 * 60);
    expect(today).not.toContain(12 * 60 + 45);
    expect(today).toContain(14 * 60);
    expect(startTimes(data, "2026-10-01", "s1", 30)).not.toContain(13 * 60);
    expect(startTimes(data, TOMORROW, "s1", 30)).toContain(13 * 60);
  });

  it("unas vacaciones cierran la columna esos días", () => {
    const data = addAbsence(agendaFixture(), { id: "ab", staffId: "s3", from: TODAY, to: TOMORROW, reason: "Vacaciones" });
    expect(absenceOn(data, TOMORROW, "s3")?.reason).toBe("Vacaciones");
    expect(openingIntervals(data, TODAY, "s3")).toEqual([]);
    expect(openingIntervals(data, TODAY, "s1").length).toBeGreaterThan(0);
    expect(freeGaps(data, TODAY, 0).some((g) => g.staffId === "s3")).toBe(false);
  });

  it("durante la pose del color el profesional queda libre para otra cita", () => {
    const data = agendaFixture();
    // Color raíz de 11:00 a 12:15: 25 min de aplicación, 35 de pose y 15 de aclarado.
    data.bookings = [booking("color", TODAY, 11 * 60, { staffId: "s2", serviceId: "sv6", durationMin: 75 })];
    const pose = poseWindow(data, data.bookings[0]);
    expect(pose).toEqual({ start: atLocal(TODAY, 11 * 60 + 25), end: atLocal(TODAY, 12 * 60) });
    const times = startTimes(data, TODAY, "s2", 15, 0, undefined, "sv10");
    expect(times).toContain(11 * 60 + 30);
    expect(times).not.toContain(11 * 60 + 15);
    expect(times).not.toContain(12 * 60);
  });
});

describe("agenda: citas fijas", () => {
  it("avisa de las fechas que chocan y solo reserva las libres", () => {
    const data = agendaFixture();
    data.bookings = [booking("busy", "2026-10-15", 17 * 60)];
    const plan = seriesPlan(data, { serviceId: "sv2", staffId: "s1", date: TODAY, minute: 17 * 60, everyWeeks: 3, count: 4 });
    expect(plan.map((s) => s.date)).toEqual(["2026-09-24", "2026-10-15", "2026-11-05", "2026-11-26"]);
    expect(plan.map((s) => s.free)).toEqual([true, false, true, true]);
    const { id: _id, start: _s, end: _e, ...model } = booking("m", TODAY, 17 * 60);
    const next = createSeries(data, model, plan, ["n1", "n2", "n3"], "serie", 30);
    const created = next.bookings.filter((b) => b.agenda?.seriesId === "serie");
    expect(created).toHaveLength(3);
    expect(created.map((b) => b.id)).toEqual(["n1", "n2", "n3"]);
  });
});

describe("agenda: cola de sin cita", () => {
  it("calcula la espera con la agenda real y en orden de llegada", () => {
    let data = agendaFixture();
    // Dani ocupado hasta las 10:30 y Marcos hasta las 11:00.
    data.bookings = [
      booking("d", TODAY, 9 * 60 + 30, { durationMin: 60 }),
      booking("m", TODAY, 9 * 60 + 30, { staffId: "s3", durationMin: 90 }),
    ];
    data = addWalkin(data, { id: "w1", name: "Hugo", serviceId: "sv2", arrivedAt: "2026-09-24T07:50:00.000Z", status: "waiting" });
    data = addWalkin(data, { id: "w2", name: "Iker", serviceId: "sv2", arrivedAt: "2026-09-24T07:55:00.000Z", status: "waiting" });
    const queue = walkinQueue(data, NOW);
    expect(queue.map((t) => [t.entry.name, t.staffId, t.startMinute])).toEqual([
      ["Hugo", "s1", 10 * 60 + 30],
      ["Iker", "s1", 11 * 60],
    ]);
    expect(queue[0].waitMin).toBe(30);
  });

  it("cuando le toca pasa a ser una cita en marcha", () => {
    let data = addWalkin(agendaFixture(), { id: "w1", name: "Hugo", serviceId: "sv2", arrivedAt: NOW.toISOString(), status: "waiting" });
    data = serveWalkin(data, "w1", { bookingId: "wb", staffId: "s3", start: NOW.toISOString() });
    expect(data.bookings.at(-1)).toMatchObject({ id: "wb", status: "in_service", source: "walkin", staffId: "s3" });
    expect(data.agendaOps!.walkins[0]).toMatchObject({ status: "served", bookingId: "wb" });
  });
});

describe("agenda: precio estudiante en horas valle", () => {
  it("solo vale en las franjas del servicio", () => {
    const service = agendaFixture().services.find((s) => s.id === "sv2")!;
    expect(studentPriceApplies(service, TODAY, 10 * 60)).toBe(true);
    expect(studentPriceApplies(service, TODAY, 17 * 60)).toBe(false);
    expect(studentPriceApplies(service, "2026-09-26", 10 * 60)).toBe(false);
    expect(valleyLabel(service)).toBe("L a V de 09:30 a 13:00");
  });

  it("sin franja, vale siempre si hay precio estudiante", () => {
    const service = { ...agendaFixture().services[0], agenda: undefined };
    expect(studentPriceApplies(service, TODAY, 19 * 60)).toBe(true);
  });
});

describe("agenda: reglas del equipo y cabinas", () => {
  it("quien alquila sillón no lleva comisión", () => {
    const data = saveStaffRules(agendaFixture(), "s3", { commissionPct: 30, productCommissionPct: 10, chairRentCents: 40000 });
    const person = data.staff.find((s) => s.id === "s3")!;
    expect(person.commissionPct).toBe(0);
    expect(person.agenda).toMatchObject({ chairRentCents: 40000, productCommissionPct: undefined });
  });

  it("quitar una cabina la quita de sus tratamientos", () => {
    let data = saveCabin(agendaFixture(), { id: "cb", name: "Cabina 1", kind: "room" });
    data.services = data.services.map((s) => (s.id === "sv5" ? { ...s, agenda: { cabinId: "cb" } } : s));
    data = removeCabin(data, "cb");
    expect(data.agendaOps!.cabins).toEqual([]);
    expect(data.services.find((s) => s.id === "sv5")!.agenda?.cabinId).toBeUndefined();
  });
});
