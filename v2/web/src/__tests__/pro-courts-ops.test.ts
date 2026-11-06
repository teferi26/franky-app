import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProBooking, ProData } from "@/lib/pro/types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "@/lib/pro/format";
import { hoursFor, isFree, occupancyAt, type OpenMatchX } from "@/lib/pro/courts";
import { blocksOn, courtsOps, emptyCourtsData, patchCourts } from "@/lib/pro/courts-base";
import {
  addBlock,
  addExtra,
  addNoShow,
  addWaiter,
  applyRain,
  blockConflicts,
  clashAlternatives,
  coldSpots,
  createSeries,
  dormantPlayers,
  endSeries,
  fourthPlayerCandidates,
  isFlagged,
  lateCancellation,
  levelValue,
  lightsPlan,
  matchDeadline,
  overdueMatches,
  passCost,
  passesOf,
  passesToRenew,
  payShare,
  pendingOn,
  planSeries,
  playerShares,
  rainPlan,
  releaseMatches,
  resolveClash,
  sellPass,
  setLevel,
  settlePenalty,
  shareAmounts,
  usePass,
  waitersFor,
  weekHeatmap,
  weeklyDates,
} from "@/lib/pro/courts-ops";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

function ids() {
  let n = 0;
  return (prefix: string) => `${prefix}-t${++n}`;
}

/** Club vacío con dos pistas (una cubierta) y horario de 8 a 23. */
function emptyClub(): ProData {
  const data = buildDemo("sports_facility", now);
  return {
    ...data,
    bookings: [],
    openMatches: [],
    payments: [],
    resources: data.resources.slice(0, 2).map((r, i) => ({
      ...r,
      id: `p${i + 1}`,
      name: `Pista ${i + 1}`,
    })),
    courts: { ...emptyCourtsData(), coveredIds: ["p2"] },
  };
}

function booking(patch: Partial<ProBooking> & { id: string }): ProBooking {
  return {
    kind: "court",
    clientName: "Hugo Pastor",
    resourceId: "p1",
    start: atLocal(today, 19 * 60),
    end: atLocal(today, 20 * 60 + 30),
    partySize: 4,
    status: "confirmed",
    priceCents: 3600,
    paidCents: 0,
    source: "phone",
    ...patch,
  };
}

describe("pistas: demo de pádel y sala", () => {
  it("las dos demos son estables y traen su operación", () => {
    for (const id of ["sports_facility", "coworking"] as const) {
      const a = buildDemo(id, now);
      expect(JSON.stringify(a)).toBe(JSON.stringify(buildDemo(id, now)));
      expect(a.courts).toBeDefined();
      expect(JSON.stringify(a.courts)).not.toMatch(/[–—]/);
    }
  });

  it("el pádel siembra turnos fijos, liga, escuela, bonos y lista de espera", () => {
    const d = buildDemo("sports_facility", now);
    const ops = courtsOps(d);
    expect(ops.series).toHaveLength(3);
    expect(ops.series.every((s) => s.bookingIds.length > 20)).toBe(true);
    expect(ops.league?.teams).toHaveLength(8);
    expect(ops.school.length).toBeGreaterThanOrEqual(4);
    expect(ops.passes.length).toBeGreaterThan(4);
    expect(ops.waitlist.length).toBeGreaterThan(0);
    expect(ops.coveredIds).toEqual(["r5", "r6"]);
  });

  it("en la demo de pádel ninguna pista tiene dos cosas a la vez", () => {
    const d = buildDemo("sports_facility", now);
    for (let k = -6; k <= 6; k++) {
      const date = addDays(today, k);
      const hours = hoursFor(d, date);
      if (!hours) continue;
      for (const r of d.resources) {
        for (let m = hours.open; m < hours.close; m += 30) {
          expect(occupancyAt(d, r, date, m)).toBeLessThanOrEqual(1);
        }
      }
    }
    // Recorre trece días de todas las pistas: en una máquina cargada pasa de 5 s.
  }, 30_000);
});

describe("pistas: pago por jugador", () => {
  it("reparte en múltiplos de 5 céntimos y cuadra el total", () => {
    expect(shareAmounts(3600, 4)).toEqual([900, 900, 900, 900]);
    expect(shareAmounts(2100, 4)).toEqual([525, 525, 525, 525]);
    const odd = shareAmounts(2230, 4);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(2230);
    expect(odd.slice(0, 3).every((v) => v % 5 === 0)).toBe(true);
  });

  it("cobra la parte de un jugador y deja el resto pendiente", () => {
    const data = { ...emptyClub(), bookings: [booking({ id: "b1" })] };
    let shares = playerShares(data, data.bookings[0]);
    expect(shares.map((s) => s.dueCents)).toEqual([900, 900, 900, 900]);
    const next = payShare(data, {
      bookingId: "b1",
      index: 2,
      method: "bizum",
      at: now.toISOString(),
      paymentId: "p-1",
    });
    shares = playerShares(next, next.bookings[0]);
    expect(shares[2].dueCents).toBe(0);
    expect(shares[2].method).toBe("bizum");
    expect(next.bookings[0].paidCents).toBe(900);
    expect(next.payments).toHaveLength(1);
    expect(next.payments[0].concept).toContain("parte de");
    expect(pendingOn(next, today)).toBe(2700);
    // Cobrar dos veces la misma parte no duplica el cobro.
    const again = payShare(next, {
      bookingId: "b1",
      index: 2,
      method: "card",
      at: now.toISOString(),
      paymentId: "p-2",
    });
    expect(again.payments).toHaveLength(1);
  });

  it("sin reparto guardado, lo ya pagado se asigna por orden", () => {
    const data = {
      ...emptyClub(),
      bookings: [booking({ id: "b1", paidCents: 1800 })],
    };
    const shares = playerShares(data, data.bookings[0]);
    expect(shares.map((s) => s.paidCents)).toEqual([900, 900, 0, 0]);
  });
});

describe("pistas: cancelaciones y no presentados", () => {
  it("detecta la cancelación tardía y calcula la penalización", () => {
    const data = emptyClub();
    const soon = booking({ id: "b1", start: atLocal(today, 19 * 60) });
    const far = booking({ id: "b2", start: atLocal(addDays(today, 3), 19 * 60) });
    expect(lateCancellation(data, soon, now).late).toBe(true);
    expect(lateCancellation(data, soon, now).penaltyCents).toBe(1800);
    expect(lateCancellation(data, far, now).late).toBe(false);
    const bono = { ...soon, note: "Con bono" };
    expect(lateCancellation(data, bono, now).penaltyCents).toBe(0);
  });

  it("cobra o perdona y lo deja en el historial", () => {
    const data = { ...emptyClub(), bookings: [booking({ id: "b1" })] };
    const input = {
      bookingId: "b1",
      kind: "late_cancel" as const,
      amountCents: 1800,
      at: now.toISOString(),
      penaltyId: "pn",
      paymentId: "pp",
    };
    const charged = settlePenalty(data, { ...input, charge: true, method: "card" });
    expect(charged.payments[0].amountCents).toBe(1800);
    expect(courtsOps(charged).penalties[0].status).toBe("charged");
    const forgiven = settlePenalty(data, { ...input, charge: false });
    expect(forgiven.payments).toHaveLength(0);
    expect(courtsOps(forgiven).penalties[0].status).toBe("forgiven");
  });

  it("avisa a partir de la tercera ausencia", () => {
    let data = emptyClub();
    const id = data.clients[0].id;
    data = { ...data, clients: data.clients.map((c) => (c.id === id ? { ...c, noShows: 2 } : c)) };
    expect(isFlagged(data, id)).toBe(false);
    data = addNoShow(data, id);
    expect(isFlagged(data, id)).toBe(true);
    // Los socios sin ficha de cliente se cuentan en el motor.
    const member = addNoShow(addNoShow(addNoShow(data, "m1"), "m1"), "m1");
    expect(isFlagged(member, "m1")).toBe(true);
  });
});

describe("pistas: lista de espera y bloqueos", () => {
  it("encuentra por orden a quien espera una franja que se libera", () => {
    let data = emptyClub();
    const base = { date: today, duration: 90, status: "waiting" as const };
    data = addWaiter(data, { ...base, id: "w2", from: 19 * 60, name: "Segunda", createdAt: "2026-09-24T08:00:00Z" });
    data = addWaiter(data, { ...base, id: "w1", from: 19 * 60 + 30, name: "Primera", createdAt: "2026-09-24T07:00:00Z" });
    data = addWaiter(data, { ...base, id: "w3", from: 9 * 60, name: "Otra hora", createdAt: "2026-09-24T06:00:00Z" });
    const list = waitersFor(data, { resourceId: "p1", date: today, from: 19 * 60, duration: 90 });
    expect(list.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("un bloqueo ocupa la pista y avisa de las reservas que pisa", () => {
    let data = { ...emptyClub(), bookings: [booking({ id: "b1" })] };
    const block = { id: "k1", resourceIds: ["p1"], date: today, from: 20 * 60, to: 22 * 60, reason: "maintenance" as const };
    expect(blockConflicts(data, block).map((b) => b.id)).toEqual(["b1"]);
    data = addBlock(data, block);
    const court = data.resources[0];
    expect(isFree(data, court, today, 21 * 60, 60)).toBe(false);
    expect(isFree(data, data.resources[1], today, 21 * 60, 60)).toBe(true);
  });

  it("los grupos de escuela bloquean su pista cada semana del curso", () => {
    const d = buildDemo("sports_facility", now);
    const group = courtsOps(d).school[0];
    let date = today;
    while (weekdayIndex(date) !== group.weekday) date = addDays(date, 1);
    const blocks = blocksOn(d, date, group.resourceId);
    expect(blocks.some((b) => b.sourceId === group.id && b.virtual)).toBe(true);
    const court = d.resources.find((r) => r.id === group.resourceId)!;
    expect(isFree(d, court, date, group.from, 60)).toBe(false);
  });
});

describe("pistas: turnos fijos", () => {
  it("genera las semanas y separa los choques para resolverlos uno a uno", () => {
    let data = emptyClub();
    let thursday = today;
    while (weekdayIndex(thursday) !== 3) thursday = addDays(thursday, 1);
    data = { ...data, bookings: [booking({ id: "x", start: atLocal(addDays(thursday, 7), 19 * 60), end: atLocal(addDays(thursday, 7), 20 * 60 + 30), clientName: "Otro grupo" })] };
    const spec = {
      resourceId: "p1",
      weekday: 3,
      from: 19 * 60,
      duration: 90,
      startDate: today,
      until: addDays(today, 27),
      clientName: "Los jueves de Irene",
    };
    expect(weeklyDates(spec.startDate, spec.until, 3)).toHaveLength(4);
    const plan = planSeries(data, spec);
    expect(plan.free).toHaveLength(3);
    expect(plan.clashes).toHaveLength(1);
    expect(plan.clashes[0].withName).toBe("Otro grupo");

    const created = createSeries(data, spec, { id: "s1", now: now.toISOString(), newId: ids() });
    expect(created.series.bookingIds).toHaveLength(3);
    expect(created.data.bookings.filter((b) => b.note === "Turno fijo")).toHaveLength(3);

    const clashDate = plan.clashes[0].date;
    const alternatives = clashAlternatives(created.data, created.series, clashDate);
    expect(alternatives[0]).toEqual({ resourceId: "p2", from: 19 * 60 });
    const moved = resolveClash(created.data, {
      seriesId: "s1",
      date: clashDate,
      action: { move: alternatives[0] },
      bookingId: "moved",
    });
    const series = courtsOps(moved).series[0];
    expect(series.clashes[0].status).toBe("moved");
    expect(series.bookingIds).toContain("moved");

    const ended = endSeries(moved, "s1", addDays(today, 8));
    const future = ended.bookings.filter((b) => series.bookingIds.includes(b.id) && localDate(b.start) >= addDays(today, 8));
    expect(future.every((b) => b.status === "cancelled")).toBe(true);
    expect(courtsOps(ended).series[0].active).toBe(false);
  });
});

describe("pistas: nivel, cuarto jugador y dormidos", () => {
  it("lee niveles y guarda el historial al cambiar", () => {
    expect(levelValue("3,5")).toBe(3.5);
    expect(levelValue("Iniciación")).toBe(1.5);
    let data = emptyClub();
    const id = data.clients[0].id;
    data = setLevel(data, id, { level: 3.25 }, now.toISOString());
    data = setLevel(data, id, { level: 3.5 }, now.toISOString());
    data = setLevel(data, id, { hand: "left" }, now.toISOString());
    const level = courtsOps(data).levels[id];
    expect(level.level).toBe(3.5);
    expect(level.hand).toBe("left");
    expect(level.history.map((h) => h.level)).toEqual([3.25, 3.5]);
  });

  it("propone jugadores de nivel parecido que suelen jugar a esa hora", () => {
    const d = buildDemo("sports_facility", now);
    const list = fourthPlayerCandidates(d, { level: 3, minute: 19 * 60, exclude: [] });
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) expect(Math.abs(s.level - 3)).toBeLessThanOrEqual(0.5);
    const counts = list.map((s) => s.sameHour);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("detecta a quien venía a menudo y lleva tres semanas sin reservar", () => {
    const data = emptyClub();
    data.clients = data.clients.slice(0, 3).map((c, i) => ({
      ...c,
      visits: 10,
      lastVisit: atLocal(addDays(today, i === 0 ? -30 : -5), 12 * 60),
    }));
    expect(dormantPlayers(data, today).map((c) => c.id)).toEqual([data.clients[0].id]);
  });
});

describe("pistas: partidos abiertos que liberan la pista", () => {
  it("un partido incompleto deja la pista libre al pasar su hora límite", () => {
    const data = emptyClub();
    const match: OpenMatchX = {
      id: "m1",
      resourceId: "p1",
      start: atLocal(today, 13 * 60),
      level: "3,0",
      players: ["A", "B"],
      needed: 2,
    };
    data.openMatches = [match];
    expect(localMinutes(matchDeadline(data, match))).toBe(10 * 60);
    const court = data.resources[0];
    expect(isFree(data, court, today, 13 * 60, 60)).toBe(false);
    expect(overdueMatches(data, now).map((m) => m.id)).toEqual(["m1"]);
    const released = releaseMatches(data, ["m1"], now.toISOString());
    expect(isFree(released, court, today, 13 * 60, 60)).toBe(true);
    expect(overdueMatches(released, now)).toHaveLength(0);
  });
});

describe("pistas: bonos y monedero", () => {
  it("vende, descuenta y avisa cuando queda uno", () => {
    let data = emptyClub();
    const pass = {
      id: "bn",
      clientId: data.clients[0].id,
      name: data.clients[0].name,
      kind: "matches" as const,
      label: "Bono 5 partidos",
      total: 5,
      left: 2,
      priceCents: 16500,
      soldAt: now.toISOString(),
      expiresAt: atLocal(addDays(today, 30), 23 * 60),
      uses: [],
    };
    data = sellPass(data, pass, { method: "card", paymentId: "pp" });
    expect(data.payments[0].amountCents).toBe(16500);
    expect(passesOf(data, { clientId: pass.clientId }, today)).toHaveLength(1);
    expect(passCost(pass, 90, 3600)).toBe(1);
    expect(passCost({ ...pass, kind: "hours" }, 90, 3600)).toBe(1.5);
    expect(passCost({ ...pass, kind: "wallet" }, 90, 3600)).toBe(3600);
    data = usePass(data, { passId: "bn", bookingId: "b1", amount: 1, at: now.toISOString() });
    expect(courtsOps(data).passes[0].left).toBe(1);
    expect(passesToRenew(data, today).map((p) => p.id)).toEqual(["bn"]);
    data = usePass(data, { passId: "bn", bookingId: "b2", amount: 1, at: now.toISOString() });
    expect(passesOf(data, { clientId: pass.clientId }, today)).toHaveLength(0);
  });
});

describe("pistas: lluvia", () => {
  it("mueve a la cubierta lo que cabe y cancela sin coste lo que no", () => {
    const data = {
      ...emptyClub(),
      bookings: [
        booking({ id: "a", resourceId: "p1", start: atLocal(today, 17 * 60), end: atLocal(today, 18 * 60 + 30) }),
        booking({ id: "b", resourceId: "p1", start: atLocal(today, 19 * 60), end: atLocal(today, 20 * 60 + 30) }),
        booking({ id: "c", resourceId: "p2", start: atLocal(today, 19 * 60), end: atLocal(today, 20 * 60 + 30) }),
      ],
    };
    // Una cubierta ocupada de 15 a 23: la de las 17 no cabe; la de las 19 tampoco.
    const plan = rainPlan(data, today, 12 * 60);
    expect(plan.map((m) => m.bookingId)).toEqual(["a", "b"]);
    expect(plan[0].to).toEqual({ resourceId: "p2", from: 17 * 60 });
    // La de las 19 se adelanta a las 17:30 o se retrasa a las 20:30 si cabe.
    const second = plan[1].to;
    expect(second === null || second.resourceId === "p2").toBe(true);
    const applied = applyRain(data, today, plan);
    const a = applied.bookings.find((b) => b.id === "a")!;
    expect(a.resourceId).toBe("p2");
  });
});

describe("pistas: luces, mapa de calor y extras", () => {
  it("las exteriores solo encienden desde que anochece", () => {
    const data = {
      ...emptyClub(),
      bookings: [
        booking({ id: "a", resourceId: "p1", start: atLocal(today, 17 * 60), end: atLocal(today, 18 * 60 + 30) }),
        booking({ id: "b", resourceId: "p1", start: atLocal(today, 18 * 60 + 30), end: atLocal(today, 22 * 60) }),
        booking({ id: "c", resourceId: "p2", start: atLocal(today, 12 * 60), end: atLocal(today, 13 * 60) }),
      ],
    };
    const plan = lightsPlan(data, today);
    const outdoor = plan.find((p) => p.resourceId === "p1")!;
    expect(outdoor.spans).toEqual([{ on: 20 * 60 + 5, off: 22 * 60 }]);
    const covered = plan.find((p) => p.resourceId === "p2")!;
    expect(covered.spans).toEqual([{ on: 12 * 60, off: 13 * 60 }]);
  });

  it("el mapa de calor marca lo lleno y encuentra franjas que se repiten vacías", () => {
    const data = emptyClub();
    let monday = today;
    while (weekdayIndex(monday) !== 0) monday = addDays(monday, -1);
    // Tardes llenas en las dos pistas; mañanas vacías.
    for (let i = 0; i < 5; i++) {
      const date = addDays(monday, i);
      for (const id of ["p1", "p2"])
        data.bookings.push(
          booking({ id: `${id}-${i}`, resourceId: id, start: atLocal(date, 17 * 60), end: atLocal(date, 23 * 60) }),
        );
    }
    const heat = weekHeatmap(data, monday, 7);
    const row = heat.rows[0];
    const at = (m: number) => row.cells[heat.slots.indexOf(m)];
    expect(at(18 * 60)).toBe(1);
    expect(at(10 * 60)).toBe(0);
    const spots = coldSpots(heat);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots[0].from).toBe(8 * 60);
    expect(spots[0].to).toBe(17 * 60);
    expect(spots[0].weekdays).toEqual([0, 1, 2, 3, 4]);
  });

  it("añade palas y bebidas a la reserva y descuenta existencias", () => {
    let data = { ...emptyClub(), bookings: [booking({ id: "b1" })] };
    data = patchCourts(data, {
      shop: [{ id: "i1", name: "Bote de bolas", kind: "sale", priceCents: 600, stock: 1 }],
    });
    const item = courtsOps(data).shop[0];
    data = addExtra(data, "b1", item, 1);
    expect(data.bookings[0].priceCents).toBe(4200);
    expect(courtsOps(data).shop[0].stock).toBe(0);
    // Sin existencias no se vende.
    const again = addExtra(data, "b1", courtsOps(data).shop[0], 1);
    expect(again).toBe(data);
  });
});
