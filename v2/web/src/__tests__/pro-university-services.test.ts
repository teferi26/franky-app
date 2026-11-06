import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import { atLocal } from "@/lib/pro/format";
import {
  bookAppointment,
  dayAgenda,
  daySummary,
  demandByDesk,
  helpCountLabel,
  helpSeries,
  helpTrend,
  isCellFree,
  noShowRate,
  officeOf,
  openDays,
  setAppointmentStatus,
  slotConflicts,
  slotProblem,
  slotTimes,
  slotsForDate,
  weekLoad,
  weekStart,
  withOffice,
} from "@/lib/pro/university-office";
import {
  assignMentor,
  autoMatch,
  mentorLoad,
  mentoringByFaculty,
  mentorsOf,
  pauseMentor,
  pickMentor,
  silentMatches,
  waitingDays,
  withMentors,
} from "@/lib/pro/university-mentors";
import {
  boardProblem,
  confirmRenewal,
  courseLabel,
  courseOf,
  handoverBoard,
  inheritanceOf,
  presidentOf,
  renewalState,
  renewalSummary,
  requestRenewals,
} from "@/lib/pro/university-renewal";
import { copyMatches, looksCopied, suspectedCopies, textSimilarity, words } from "@/lib/pro/university-listings";
import { uniExtrasOf } from "@/lib/pro/university";
import type {
  ProUniMentor,
  ProUniMentorRequest,
  ProUniOfficeSlot,
  UniAssociation,
  UniHousing,
} from "@/lib/pro/university-types";

/** Domingo: la demo se construye este día, como la de los otros tests. */
const now = new Date("2026-09-27T10:00:00Z");
/** Martes siguiente a las 11:00 de Madrid: hay becas y alojamiento. */
const tuesday = "2026-09-29";
const tuesdayMorning = new Date(atLocal(tuesday, 11 * 60));

function demo(): ProData {
  return buildDemo("university", now);
}

const slot = (patch: Partial<ProUniOfficeSlot> = {}): ProUniOfficeSlot => ({
  id: "s",
  weekday: 1,
  start: 10 * 60,
  end: 12 * 60,
  minutes: 20,
  desk: "becas",
  staff: "Lucía Ferrer",
  place: "Mesa 2",
  online: false,
  ...patch,
});

describe("cita previa", () => {
  it("parte cada franja en huecos de su duración sin pasarse del final", () => {
    expect(slotTimes(slot())).toEqual([600, 620, 640, 660, 680, 700]);
    expect(slotTimes(slot({ end: 10 * 60 + 50 }))).toEqual([600, 620]);
    expect(slotTimes(slot({ end: 10 * 60 + 10 }))).toEqual([]);
  });

  it("solo devuelve las franjas del día de la semana pedido", () => {
    const slots = [slot({ id: "a" }), slot({ id: "b", weekday: 3 })];
    expect(slotsForDate(slots, tuesday).map((s) => s.id)).toEqual(["a"]);
  });

  it("detecta a la misma persona en dos franjas que se pisan", () => {
    const slots = [slot({ id: "a" })];
    expect(slotConflicts(slots, slot({ id: "b", start: 11 * 60, end: 13 * 60 }))).toHaveLength(1);
    expect(slotConflicts(slots, slot({ id: "b", start: 12 * 60, end: 13 * 60 }))).toHaveLength(0);
    expect(slotConflicts(slots, slot({ id: "b", staff: "Pablo Esteve" }))).toHaveLength(0);
    expect(slotProblem(slots, slot({ id: "b", start: 11 * 60 }))).toMatch(/ya atiende/);
    expect(slotProblem([], slot({ staff: " " }))).toBe("Falta quién atiende.");
    expect(slotProblem([], slot({ end: 9 * 60 }))).toMatch(/terminar después/);
    expect(slotProblem([], slot())).toBeNull();
  });

  it("no deja dar dos veces el mismo hueco, salvo que la cita se cancele", () => {
    const base = {
      id: "x",
      slotId: "s",
      date: tuesday,
      start: 600,
      desk: "becas" as const,
      student: "Ana Pérez",
      faculty: "Derecho",
      topic: "Beca",
      via: "desk" as const,
    };
    const one = bookAppointment([], base, now)!;
    expect(one).toHaveLength(1);
    expect(one[0].status).toBe("booked");
    expect(bookAppointment(one, { ...base, id: "y" }, now)).toBeNull();
    const cancelled = setAppointmentStatus(one, "x", "cancelled");
    expect(isCellFree(cancelled, "s", tuesday, 600)).toBe(true);
    expect(bookAppointment(cancelled, { ...base, id: "y" }, now)).toHaveLength(2);
  });

  it("la agenda del día marca los huecos pasados y cuenta libres y pendientes", () => {
    const office = {
      slots: [slot()],
      appointments: [
        { id: "a", slotId: "s", date: tuesday, start: 600, desk: "becas" as const, student: "A", faculty: "F", topic: "t", status: "done" as const, via: "franky" as const, createdAt: "" },
        { id: "b", slotId: "s", date: tuesday, start: 680, desk: "becas" as const, student: "B", faculty: "F", topic: "t", status: "booked" as const, via: "franky" as const, createdAt: "" },
      ],
      helpWeeks: [],
    };
    const columns = dayAgenda(office, tuesday, tuesdayMorning);
    expect(columns).toHaveLength(1);
    const cells = columns[0].cells;
    expect(cells.filter((c) => c.past).map((c) => c.start)).toEqual([600, 620, 640]);
    const summary = daySummary(columns);
    expect(summary).toMatchObject({ capacity: 6, booked: 1, done: 1, free: 2 });
    expect(summary.next?.start).toBe(680);
  });

  it("la demo trae franjas de lunes a viernes y citas pasadas y futuras sin dobles", () => {
    const office = officeOf(demo());
    expect(new Set(office.slots.map((s) => s.weekday))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(office.appointments.some((a) => a.status === "done")).toBe(true);
    expect(office.appointments.some((a) => a.status === "booked")).toBe(true);
    const keys = office.appointments.filter((a) => a.status !== "cancelled").map((a) => `${a.slotId}:${a.date}:${a.start}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(openDays(office, "2026-09-27", 3)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    const week = weekLoad(office, "2026-09-28");
    expect(week[5].capacity).toBe(0);
    expect(week[1].capacity).toBe(15);
    expect(demandByDesk(office.appointments, now)[0].count).toBeGreaterThan(0);
    expect(noShowRate(office.appointments, now)).toBeGreaterThan(0);
  });

  it("un espacio sin estos datos se lee vacío y se puede empezar a llenar", () => {
    const d = demo();
    delete d.uniExtras;
    expect(officeOf(d)).toEqual({ slots: [], appointments: [], helpWeeks: [] });
    const next = withOffice(d, () => ({ slots: [slot()] }));
    expect(officeOf(next).slots).toHaveLength(1);
    expect(uniExtrasOf(next).audiences.campus).toBe(0);
  });
});

describe("pedir ayuda", () => {
  it("rellena con ceros las semanas sin datos y acaba en la actual", () => {
    const series = helpSeries([{ week: "2026-09-21", presses: 30 }], now, 4);
    expect(series.map((w) => w.week)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
    expect(series.map((w) => w.presses)).toEqual([0, 0, 0, 30]);
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
  });

  it("compara la semana con la media de las cuatro anteriores y oculta cifras pequeñas", () => {
    const weeks = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"].map((week) => ({ week, presses: 20 }));
    const trend = helpTrend([...weeks, { week: "2026-09-21", presses: 30 }], now);
    expect(trend).toMatchObject({ current: 30, previous: 20, average: 20, deltaPct: 50, hidden: false });
    expect(helpTrend([{ week: "2026-09-21", presses: 4 }], now).hidden).toBe(true);
    expect(helpCountLabel(4)).toBe("Menos de 10");
    expect(helpCountLabel(12000)).toBe("12.000");
  });
});

describe("mentores de primero", () => {
  const mentor = (id: string, faculty: string, capacity = 2, since = "2026-09-01"): ProUniMentor => ({
    id,
    name: id,
    faculty,
    year: 3,
    capacity,
    active: true,
    since,
  });
  const request = (id: string, faculty: string, at: string, patch: Partial<ProUniMentorRequest> = {}): ProUniMentorRequest => ({
    id,
    faculty,
    at,
    status: "waiting",
    ...patch,
  });

  it("elige mentor de la misma facultad, con hueco y el menos cargado", () => {
    const mentors = [mentor("a", "Derecho"), mentor("b", "Derecho"), mentor("c", "Ciencias")];
    const requests = [request("r0", "Derecho", "2026-09-01", { status: "matched", mentorId: "a" })];
    expect(pickMentor(mentors, requests, { faculty: "Derecho" })?.id).toBe("b");
    expect(pickMentor(mentors, requests, { faculty: "Educación" })).toBeNull();
    expect(pickMentor([{ ...mentors[2], active: false }], [], { faculty: "Ciencias" })).toBeNull();
  });

  it("empareja a todos de una vez por orden de llegada y dice dónde faltan mentores", () => {
    const mentors = [mentor("a", "Derecho", 1), mentor("c", "Ciencias", 1)];
    const requests = [
      request("r2", "Derecho", "2026-09-20"),
      request("r1", "Derecho", "2026-09-10"),
      request("r3", "Ciencias", "2026-09-15"),
    ];
    const result = autoMatch(mentors, requests, now);
    expect(result.matched).toBe(2);
    expect(result.withoutMentor).toEqual(["Derecho"]);
    expect(result.requests.find((r) => r.id === "r1")?.mentorId).toBe("a");
    expect(result.requests.find((r) => r.id === "r2")?.status).toBe("waiting");
  });

  it("al pausar a un mentor puede devolver a su gente a la cola", () => {
    const data = {
      mentors: [mentor("a", "Derecho")],
      requests: [request("r1", "Derecho", "2026-09-10", { status: "matched", mentorId: "a", talked: true })],
    };
    const kept = pauseMentor(data, "a", false);
    expect(kept.mentors[0].active).toBe(false);
    expect(kept.requests[0].status).toBe("matched");
    const released = pauseMentor(data, "a", true);
    expect(released.requests[0]).toMatchObject({ status: "waiting", mentorId: undefined });
    expect(mentorLoad(data.mentors[0], released.requests)).toBe(0);
  });

  it("reasignar deja la conversación sin empezar", () => {
    const requests = [request("r1", "Derecho", "2026-09-10", { status: "matched", mentorId: "a", talked: true })];
    expect(assignMentor(requests, "r1", "b", now)[0]).toMatchObject({ mentorId: "b", talked: false });
  });

  it("cifras por facultad sin nombres y con el umbral de privacidad", () => {
    const d = demo();
    const m = mentorsOf(d);
    const rows = mentoringByFaculty(m);
    const ciencias = rows.find((r) => r.faculty === "Ciencias")!;
    expect(ciencias.waiting).toBe(3);
    expect(ciencias.room).toBe(0);
    expect(rows[0].faculty).toBe("Ciencias");
    for (const r of rows) expect(r.hidden).toBe(r.matched < 10);
    expect(JSON.stringify(rows)).not.toMatch(/Marta|Llorens/);
    const auto = autoMatch(m.mentors, m.requests, now);
    expect(auto.withoutMentor).toEqual(["Ciencias"]);
    expect(auto.matched).toBe(3);
  });

  it("cuenta los días de espera y los emparejados que no se han escrito", () => {
    expect(waitingDays(request("r", "Derecho", "2026-09-24T10:00:00Z"), now)).toBe(3);
    const silent = silentMatches(
      [
        request("a", "Derecho", "2026-09-01", { status: "matched", matchedAt: "2026-09-10T10:00:00Z", talked: false }),
        request("b", "Derecho", "2026-09-01", { status: "matched", matchedAt: "2026-09-26T10:00:00Z", talked: false }),
        request("c", "Derecho", "2026-09-01", { status: "matched", matchedAt: "2026-09-10T10:00:00Z", talked: true }),
      ],
      now,
    );
    expect(silent.map((r) => r.id)).toEqual(["a"]);
  });

  it("se puede empezar a dar de alta mentores en un espacio sin datos", () => {
    const d = demo();
    delete d.uniExtras;
    const next = withMentors(d, () => ({ mentors: [mentor("a", "Derecho")] }));
    expect(mentorsOf(next).mentors).toHaveLength(1);
    expect(mentorsOf(next).requests).toEqual([]);
  });
});

describe("renovación de asociaciones", () => {
  it("el curso empieza en septiembre", () => {
    expect(courseOf(now)).toBe("2026-27");
    expect(courseOf(new Date("2026-07-15T10:00:00Z"))).toBe("2025-26");
    expect(courseLabel("2026-27")).toBe("curso 2026/27");
  });

  it("la demo tiene renovadas, a medias, pedidas y sin pedir", () => {
    const list = demo().uniAssociations as UniAssociation[];
    const summary = renewalSummary(list, now);
    expect(summary.total).toBe(9);
    expect(summary.done).toBe(4);
    expect(summary.missing.map((a) => renewalState(a, summary.course)).sort()).toEqual([
      "partial",
      "pending",
      "pending",
      "pending",
      "requested",
    ]);
    expect(summary.notAsked.map((a) => a.id).sort()).toEqual(["as11", "as6", "as8"]);
  });

  it("pedir la renovación a todas marca solo a las que faltan y conserva lo confirmado", () => {
    const list = demo().uniAssociations as UniAssociation[];
    const next = requestRenewals(list, now);
    const summary = renewalSummary(next, now);
    expect(summary.notAsked).toEqual([]);
    expect(next.find((a) => a.id === "as3")?.renewal?.boardConfirmed).toBe(true);
    expect(next.find((a) => a.id === "as1")).toBe(list.find((a) => a.id === "as1"));
    expect(next.find((a) => a.id === "as9")?.renewal).toBeUndefined();
  });

  it("confirmar junta y socios completa la renovación y actualiza los socios", () => {
    const a = (demo().uniAssociations as UniAssociation[]).find((x) => x.id === "as3")!;
    const done = confirmRenewal(a, now, { members: true }, 71);
    expect(renewalState(done, "2026-27")).toBe("done");
    expect(done.members).toBe(71);
    expect(done.renewal?.completedAt).toBe(now.toISOString());
    const old = { ...a, renewal: { ...a.renewal!, course: "2025-26" } };
    expect(renewalState(old, "2026-27")).toBe("pending");
  });

  it("el traspaso guarda el cambio, confirma la junta y hereda documentos y créditos", () => {
    const d = demo();
    const a = (d.uniAssociations as UniAssociation[]).find((x) => x.id === "as4")!;
    expect(presidentOf(a)).toBe("Samuel Ruiz");
    const board = [
      { role: "presidencia" as const, name: " Nuria Sellés " },
      { role: "secretaria" as const, name: "Marco Tur" },
      { role: "vocal" as const, name: "" },
    ];
    expect(boardProblem(board)).toBeNull();
    expect(boardProblem([board[1]])).toMatch(/presidencia/);
    const next = handoverBoard(a, board, now);
    expect(next.board).toEqual([
      { role: "presidencia", name: "Nuria Sellés" },
      { role: "secretaria", name: "Marco Tur" },
    ]);
    expect(next.handovers?.at(-1)).toMatchObject({ from: "Samuel Ruiz", to: "Nuria Sellés", course: "2026-27" });
    expect(next.renewal?.boardConfirmed).toBe(true);
    const x = uniExtrasOf(d);
    const inherits = inheritanceOf(next, x.assocActivities, x.credits);
    expect(inherits.creditsValidated).toBeGreaterThan(0);
    expect(inherits.creditsPending).toBe(a.ectsRequests);
  });
});

describe("anuncios copiados", () => {
  it("normaliza tildes, mayúsculas y palabras vacías", () => {
    expect(words("Habitación EXTERIOR, en la calle")).toEqual(["habitacion", "exterior", "calle"]);
    expect(textSimilarity("Piso en Tómbola", "piso tombola")).toBe(1);
    expect(textSimilarity("", "algo")).toBe(0);
  });

  it("la demo detecta la copia del anuncio de otro propietario", () => {
    const all = demo().uniHousing as UniHousing[];
    const copy = all.find((h) => h.id === "h13")!;
    const matches = copyMatches(all, copy);
    expect(matches[0].listing.id).toBe("h7");
    expect(matches[0].reasons).toEqual(expect.arrayContaining(["title", "description"]));
    expect(matches[0].weak).toBe(false);
    expect(looksCopied(all, all.find((h) => h.id === "h7")!)).toBe(true);
    expect(suspectedCopies(all).map((h) => h.id)).toEqual(["h13"]);
  });

  it("no cuenta los anuncios del mismo propietario ni los parecidos solo de precio", () => {
    const base: UniHousing = {
      id: "a",
      title: "Habitación en piso de 4",
      owner: "Habitat Campus",
      zone: "Tómbola",
      priceCents: 30000,
      verified: false,
      complaints: 0,
      status: "pending",
      rooms: 4,
    };
    const same = { ...base, id: "b" };
    expect(copyMatches([base, same], base)).toEqual([]);
    const other = { ...base, id: "c", owner: "Otra persona", title: "Estudio luminoso" };
    const [match] = copyMatches([base, other], base);
    expect(match.reasons).toEqual(["price_zone"]);
    expect(match.weak).toBe(true);
    expect(looksCopied([base, other], base)).toBe(false);
  });
});
