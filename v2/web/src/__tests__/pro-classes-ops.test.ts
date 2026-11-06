import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, atLocal, localDate, weekdayIndex } from "@/lib/pro/format";
import type { ProClassSession, ProData } from "@/lib/pro/types";
import { extrasOf } from "@/lib/pro/classes-care";
import { sessionRoster } from "@/lib/pro/classes";
import {
  acceptWaitOffer,
  applyIntensive,
  arrivalWindow,
  bookLinkedRooms,
  boardOf,
  cancelVerdict,
  coachHours,
  examsAhead,
  expireWaitOffers,
  intensiveDates,
  isRoomMode,
  linkedSessions,
  occupancyGrid,
  priceForPlayers,
  removeAndOffer,
  reviewCandidates,
  roomConflicts,
  saveBoard,
  setPlayers,
  siblingRooms,
  staffFor,
  substituteCoach,
  tomorrowGroups,
  waitTrace,
  weakSessions,
} from "@/lib/pro/classes-ops";

const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

function fullSessionWithWaitlist(d: ProData): ProClassSession {
  const s = d.sessions.find((x) => x.waitlist > 0 && new Date(x.start).getTime() > now.getTime() + 4 * 3600000);
  if (!s) throw new Error("La demo debería tener una clase llena con espera");
  return s;
}

describe("Franky Pro clases: lista de espera que se mueve sola", () => {
  it("al quitar a alguien la plaza se ofrece a la primera persona con plazo", () => {
    const d = buildDemo("sports", now);
    const s = fullSessionWithWaitlist(d);
    const before = sessionRoster(d, s, now);
    const first = before.waitlist[0];
    const next = removeAndOffer(d, s.id, before.booked[0].id, now, "wo-1");
    const trace = waitTrace(next, s.id);
    expect(trace).toHaveLength(1);
    expect(trace[0].bookingId).toBe(first.id);
    expect(trace[0].status).toBe("pending");
    const hold = new Date(trace[0].expiresAt).getTime() - now.getTime();
    expect(hold).toBeLessThanOrEqual(2 * 3600000);
    // La plaza queda guardada: el aforo sigue completo mientras decide.
    const after = next.sessions.find((x) => x.id === s.id)!;
    expect(after.booked).toBe(s.booked);
    expect(after.waitlist).toBe(s.waitlist - 1);
  });

  it("si no confirma a tiempo pasa a la siguiente; si confirma, se queda", () => {
    const d = buildDemo("sports", now);
    const s = fullSessionWithWaitlist(d);
    const { booked, waitlist } = sessionRoster(d, s, now);
    const offered = removeAndOffer(d, s.id, booked[0].id, now, "wo-1");
    const late = new Date(now.getTime() + 3 * 3600000);
    const expired = expireWaitOffers(offered, late, (i) => `wo-next-${i}`);
    const trace = waitTrace(expired, s.id);
    expect(trace.find((o) => o.id === "wo-1")?.status).toBe("expired");
    if (waitlist.length > 1) expect(trace.find((o) => o.id === "wo-next-0")?.bookingId).toBe(waitlist[1].id);
    const accepted = acceptWaitOffer(offered, "wo-1", now);
    expect(extrasOf(accepted).waitOffers[0].status).toBe("accepted");
    expect(accepted.bookings.find((b) => b.id === waitlist[0].id)?.status).toBe("confirmed");
  });
});

describe("Franky Pro clases: salas de ocio", () => {
  it("el modo sala lo dice el tipo y el taller se vende por plaza", () => {
    const d = buildDemo("culture", now);
    expect(isRoomMode(d, d.classTypes.find((c) => c.id === "ct1"))).toBe(true);
    expect(isRoomMode(d, d.classTypes.find((c) => c.id === "ct3"))).toBe(false);
    // Una sala de 10 configurada como sala sigue siéndolo aunque pase de 8.
    const big = { ...d.classTypes[0], id: "big", capacity: 10 };
    const conf: ProData = { ...d, classExtras: { ...extrasOf(d), types: { big: { roomMode: { minPlayers: 4, maxPlayers: 10 } } } } };
    expect(isRoomMode(conf, big)).toBe(true);
    expect(isRoomMode(buildDemo("sports", now), d.classTypes[0])).toBe(false);
  });

  it("el precio sigue la tabla de jugadores y se recalcula en recepción", () => {
    const table = extrasOf(buildDemo("culture", now)).types.ct1.playerPrices;
    expect(priceForPlayers(table, 4, false)).toBe(7000);
    expect(priceForPlayers(table, 4, true)).toBe(6000);
    expect(priceForPlayers(table, 7, false)).toBe(8400 + 1400);
    expect(priceForPlayers(undefined, 3, false)).toBe(4200);
    const d = buildDemo("culture", now);
    const s = d.sessions.find((x) => x.classTypeId === "ct1" && x.booked >= 4 && localDate(x.start) === today)!;
    const b = sessionRoster(d, s, now).booked[0];
    const next = setPlayers(d, s.id, b.id, 3, now);
    const nb = next.bookings.find((x) => x.id === b.id)!;
    expect(nb.partySize).toBe(3);
    expect(nb.priceCents).toBe(priceForPlayers(table, 3, Boolean(b.student)));
    expect(next.sessions.find((x) => x.id === s.id)?.booked).toBe(3);
  });

  it("el montaje impide pegar una partida a otra en la misma sala", () => {
    const d = buildDemo("culture", now);
    const s = d.sessions.find((x) => x.classTypeId === "ct1" && localDate(x.start) === today)!;
    const end = new Date(s.end).getTime();
    const glued = { room: s.room, start: new Date(end).toISOString(), end: new Date(end + 3600000).toISOString(), classTypeId: "ct1" };
    expect(roomConflicts(d, glued).map((x) => x.id)).toContain(s.id);
    const otherRoom = { ...glued, room: "Sala 3" };
    expect(roomConflicts(d, otherRoom)).toHaveLength(0);
  });

  it("la cortesía cuenta los minutos y luego da la reserva por perdida", () => {
    const d = buildDemo("culture", now);
    const s = d.sessions[0];
    const at = (min: number) => new Date(new Date(s.start).getTime() + min * 60000);
    expect(arrivalWindow(s, at(-20), 10)).toEqual({ phase: "before", minutes: 20 });
    expect(arrivalWindow(s, at(4), 10)).toEqual({ phase: "courtesy", minutesLeft: 6 });
    expect(arrivalWindow(s, at(12), 10)).toEqual({ phase: "lost", minutesLate: 12 });
  });

  it("la norma de cancelación dice qué toca", () => {
    const policy = { freeChangeHours: 48, lateNoticeVoucher: true, courtesyMin: 10 };
    const in3days = new Date(now.getTime() + 72 * 3600000).toISOString();
    const in5h = new Date(now.getTime() + 5 * 3600000).toISOString();
    expect(cancelVerdict(policy, in3days, now).free).toBe(true);
    expect(cancelVerdict(policy, in5h, now).title).toBe("Aviso tardío");
    expect(cancelVerdict({ ...policy, lateNoticeVoucher: false }, in5h, now).title).toBe("Fuera de plazo");
  });

  it("recordatorios de mañana y reseñas al salir", () => {
    const d = buildDemo("culture", now);
    const tomorrow = tomorrowGroups(d, now);
    expect(tomorrow.length).toBeGreaterThan(0);
    expect(tomorrow.every((g) => localDate(g.session.start) === addDays(today, 1))).toBe(true);
    const evening = new Date(`${today}T17:40:00.000Z`);
    expect(reviewCandidates(d, evening).every((g) => g.booking.status === "arrived")).toBe(true);
  });

  it("un grupo grande se reparte en dos salas enlazadas", () => {
    const d = buildDemo("culture", now);
    const future = d.sessions.find(
      (s) => new Date(s.start).getTime() > now.getTime() && s.booked === 0 && isRoomMode(d, d.classTypes.find((c) => c.id === s.classTypeId)) && siblingRooms(d, s).length > 0,
    );
    if (!future) return;
    const pair = [future, siblingRooms(d, future)[0]];
    const next = bookLinkedRooms(d, { sessions: pair, clientName: "AEGEE Alicante", people: 11, student: true, linkId: "lk1", bookingId: (i) => `lb${i}` }, now);
    expect(next.sessions.find((s) => s.id === pair[0].id)?.booked).toBe(6);
    expect(next.sessions.find((s) => s.id === pair[1].id)?.booked).toBe(5);
    expect(linkedSessions(next, pair[0].id).map((s) => s.id)).toEqual([pair[1].id]);
  });

  it("sugiere game master que habla inglés y conoce la sala", () => {
    const d = buildDemo("culture", now);
    const start = atLocal(addDays(today, 7), 10 * 60);
    const end = atLocal(addDays(today, 7), 11 * 60);
    const list = staffFor(d, { room: "Sala 1", language: "en", start, end });
    const candela = list.find((x) => x.staffId === "s2")!;
    expect(candela.ok).toBe(false);
    expect(candela.why).toContain("inglés");
    expect(list[0].ok).toBe(true);
  });
});

describe("Franky Pro clases: pizarra, sustituciones y horas", () => {
  it("la pizarra se copia a las clases del mismo tipo ese día", () => {
    const d = buildDemo("sports", now);
    const s = d.sessions.find((x) => x.classTypeId === "ct1" && localDate(x.start) === addDays(today, 1))!;
    const board = [{ id: "b1", title: "WOD", body: "Fran" }];
    const next = saveBoard(d, s.id, board, true);
    const same = next.sessions.filter((x) => x.classTypeId === "ct1" && localDate(x.start) === localDate(s.start));
    expect(same.length).toBeGreaterThan(1);
    expect(same.every((x) => boardOf(next, x.id)[0]?.body === "Fran")).toBe(true);
    expect(boardOf(buildDemo("sports", now), d.sessions.find((x) => x.classTypeId === "ct1" && localDate(x.start) === today)!.id).length).toBeGreaterThan(0);
  });

  it("la sustitución cuenta las horas a quien la da", () => {
    const d = buildDemo("academy", now);
    const s = d.sessions.find((x) => localDate(x.start) === today)!;
    const other = d.staff.find((x) => x.id !== s.coachId)!;
    const next = substituteCoach(d, s.id, other.id);
    const hours = coachHours(next, today, today);
    expect(hours.find((h) => h.staffId === other.id)?.covered).toBe(1);
    expect(hours.find((h) => h.staffId === s.coachId)?.coveredByOthers).toBe(1);
    // Volver a ponerle quita la marca.
    const back = substituteCoach(next, s.id, s.coachId);
    expect(coachHours(back, today, today).every((h) => h.covered === 0)).toBe(true);
  });
});

describe("Franky Pro clases: ocupación y valle", () => {
  it("el mapa de ocupación marca las peores franjas", () => {
    const d = buildDemo("sports", now);
    const grid = occupancyGrid(d, addDays(today, -7), addDays(today, 7));
    expect(grid.cells.length).toBeGreaterThan(5);
    expect(grid.worst).toHaveLength(3);
    expect(grid.worst[0].pct).toBeLessThanOrEqual(grid.worst[2].pct);
    const weak = weakSessions(d, now);
    expect(weak.every((s) => s.booked / s.capacity < 0.5)).toBe(true);
  });
});

describe("Franky Pro clases: intensivo de examen", () => {
  it("propone las semanas antes del examen y crea sesiones, bono y oferta", () => {
    const d = buildDemo("academy", now);
    const exams = examsAhead(d, now, 120);
    expect(exams.length).toBeGreaterThan(0);
    const exam = exams[0];
    const dates = intensiveDates({ examOn: exam.examOn, days: [0, 2, 4], weeks: 3 }, today);
    expect(dates.every((x) => x < exam.examOn && x > today)).toBe(true);
    expect(dates.every((x) => [0, 2, 4].includes(weekdayIndex(x)))).toBe(true);
    const { data, sessions, hours } = applyIntensive(
      d,
      {
        classType: exam.classType,
        examOn: exam.examOn,
        days: [0, 2, 4],
        minute: 10 * 60,
        durationMin: 120,
        weeks: 3,
        priceCents: 12000,
        capacity: 10,
        room: "Aula 1",
        coachId: exam.classType.coachId,
      },
      now,
      { type: "t-int", plan: "pl-int", offer: "o-int", series: "sr-int", session: (i) => `s-int-${i}` },
    );
    expect(sessions).toBe(dates.length);
    expect(hours).toBe(dates.length * 2);
    expect(data.sessions.filter((s) => s.classTypeId === "t-int")).toHaveLength(dates.length);
    expect(data.plans.find((p) => p.id === "pl-int")?.sessions).toBe(dates.length);
    expect(data.offers[0].kind).toBe("exam");
  });
});
