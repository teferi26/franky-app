import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import type { ProSchoolGroup, ProSpecialHours } from "@/lib/pro/courts-types";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import { addDays, atLocal, localDate } from "@/lib/pro/format";
import { courtsOps, emptyCourtsData, patchCourts } from "@/lib/pro/courts-base";
import { clubRanking } from "@/lib/pro/courts-compete";
import { closeCash } from "@/lib/pro/courts-desk";
import {
  addLocker,
  addStudent,
  addWarning,
  buildPass,
  carryOver,
  cashCheck,
  cashHistory,
  cashMonthRows,
  checkGroup,
  checkLesson,
  checkSpecialHours,
  clampPolicy,
  createLeague,
  createLesson,
  currentRound,
  lockerStats,
  mondayOf,
  occupancyCompare,
  passDays,
  passLeftLabel,
  passStats,
  passTemplates,
  penaltyFor,
  policyShareText,
  rankingByBand,
  rankingShareText,
  removeSpecialHours,
  removeStudent,
  rentLocker,
  resourceMonthHours,
  saveGroup,
  saveSpecialHours,
  schoolStats,
  setPolicy,
  warningsByPerson,
} from "@/lib/pro/courts-admin";
import {
  isCourtsStateLabel,
  loadProCourtsState,
  parseProCourtsState,
  planProCourtsStateCommand,
} from "@/lib/pro/remote-courts-state";
import { canProCommand, planProCommand, ProActionError } from "@/lib/pro/remote-actions";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

function ids() {
  let n = 0;
  return (prefix: string) => `${prefix}-t${++n}`;
}

const padel = () => buildDemo("sports_facility", now);
const study = () => buildDemo("coworking", now);

describe("pistas: normas del club", () => {
  it("deja la política dentro de límites con sentido", () => {
    const p = clampPolicy({
      ...emptyCourtsData().policy,
      noticeHours: 500,
      penaltyPct: -20,
      noShowWarnAt: 0,
      matchReleaseHours: 99,
      releaseAfterMinutes: 1,
      punctualityNote: `  ${"a".repeat(600)}  `,
    });
    expect(p).toMatchObject({ noticeHours: 72, penaltyPct: 0, noShowWarnAt: 1, matchReleaseHours: 24, releaseAfterMinutes: 10 });
    expect(p.punctualityNote.length).toBe(400);
  });

  it("guarda la política y calcula la penalización", () => {
    const d = setPolicy(padel(), { ...courtsOps(padel()).policy, penaltyPct: 50 });
    expect(courtsOps(d).policy.penaltyPct).toBe(50);
    expect(penaltyFor(courtsOps(d).policy, 3600)).toBe(1800);
  });

  it("escribe unas normas que se pueden mandar tal cual", () => {
    const policy = { ...emptyCourtsData().policy, noticeHours: 24, penaltyPct: 50, punctualityNote: "Llega 10 minutos antes." };
    const text = policyShareText(policy, "Pádel Raspeig", false);
    expect(text).toContain("24 h antes");
    expect(text).toContain("50 %");
    expect(text).toContain("llueve");
    expect(text).toContain("Llega 10 minutos antes.");
    expect(text).not.toMatch(/[–—]/);
    const room = policyShareText({ ...policy, penaltyPct: 0, releaseAfterMinutes: 30 }, "Sala", true, ["Silencio."]);
    expect(room).toContain("30 minutos");
    expect(room).toContain("Silencio.");
    expect(room).not.toContain("llueve");
  });
});

describe("pistas: horarios especiales", () => {
  const base: ProSpecialHours = {
    id: "x",
    label: "Navidad",
    from: "2026-12-20",
    to: "2026-12-31",
    open: 9 * 60,
    close: 14 * 60,
    announced: false,
  };

  it("pide fechas en orden, cierre después de apertura y sin pisar otro", () => {
    const d = study();
    expect(checkSpecialHours(d, { ...base, to: "2026-12-01" })).toEqual({ ok: false, reason: "dates" });
    expect(checkSpecialHours(d, { ...base, close: 8 * 60 })).toEqual({ ok: false, reason: "hours" });
    const withOne = saveSpecialHours(d, base);
    expect(checkSpecialHours(withOne, { ...base, id: "y", from: "2026-12-30", to: "2027-01-02" })).toMatchObject({ ok: false, reason: "overlap", with: "Navidad" });
    expect(checkSpecialHours(withOne, base)).toEqual({ ok: true });
  });

  it("guarda ordenado por fecha y se quita", () => {
    const d = saveSpecialHours(saveSpecialHours(emptyStudy(), { ...base, id: "b", from: "2027-03-01", to: "2027-03-02" }), base);
    expect(courtsOps(d).specialHours.map((s) => s.id)).toEqual(["x", "b"]);
    expect(courtsOps(removeSpecialHours(d, "x")).specialHours.map((s) => s.id)).toEqual(["b"]);
  });
});

function emptyStudy(): ProData {
  return { ...study(), courts: emptyCourtsData() };
}

describe("pistas: convivencia", () => {
  it("agrupa los avisos por persona, primero quien más lleva", () => {
    let d = emptyStudy();
    const at = (days: number) => atLocal(addDays(today, -days), 12 * 60);
    d = addWarning(d, { id: "1", name: "Ana Ruiz", memberId: "m1", kind: "noise", at: at(3) });
    d = addWarning(d, { id: "2", name: "Ana Ruiz", memberId: "m1", kind: "phone", at: at(1) });
    d = addWarning(d, { id: "3", name: "Luis Gil", kind: "food", at: at(2) });
    d = addWarning(d, { id: "4", name: "Luis Gil", kind: "food", at: at(200) });
    const people = warningsByPerson(d, today);
    expect(people.map((p) => [p.name, p.count])).toEqual([
      ["Ana Ruiz", 2],
      ["Luis Gil", 1],
    ]);
    expect(people[0].last.id).toBe("2");
  });
});

describe("pistas: bonos y monedero", () => {
  it("propone bonos con precio a partir de la tarifa del club", () => {
    const t = passTemplates(padel(), addDays(today, 1));
    expect(t.map((x) => x.id)).toEqual(expect.arrayContaining(["m5", "m10", "w50", "w100"]));
    for (const x of t) {
      expect(x.priceCents).toBeGreaterThan(0);
      expect(x.priceCents % 500).toBe(0);
    }
  });

  it("crea el bono con lo que queda igual al total y caducidad por días", () => {
    const p = buildPass(
      { kind: "matches", label: " Bono 10 partidos ", total: 10, priceCents: 32000, days: 90 },
      { name: " Hugo Pastor ", phone: "" },
      { id: "bn-1", now },
    );
    expect(p).toMatchObject({ label: "Bono 10 partidos", name: "Hugo Pastor", left: 10, total: 10, phone: undefined });
    expect(localDate(p.expiresAt)).toBe(addDays(today, 90));
    expect(passDays(p)).toBe(90);
  });

  it("al renovar pasa lo que quedaba solo si no había caducado", () => {
    const p = buildPass({ kind: "hours", label: "Mañanas", total: 10, priceCents: 1, days: 30 }, { name: "A" }, { id: "x", now });
    expect(carryOver({ ...p, left: 2.5 }, today)).toBe(2.5);
    expect(carryOver({ ...p, left: 2.5, expiresAt: atLocal(addDays(today, -1), 12 * 60) }, today)).toBe(0);
  });

  it("resume bonos en vigor, lo pendiente y lo vendido este mes", () => {
    const d = patchCourts(emptyStudy(), {
      passes: [
        buildPass({ kind: "matches", label: "B", total: 10, priceCents: 30000, days: 60 }, { name: "A" }, { id: "1", now }),
        { ...buildPass({ kind: "wallet", label: "M", total: 5500, priceCents: 5000, days: 60 }, { name: "B" }, { id: "2", now }), left: 800 },
        { ...buildPass({ kind: "matches", label: "C", total: 5, priceCents: 1000, days: 60 }, { name: "C" }, { id: "3", now }), left: 0 },
      ],
    });
    const s = passStats(d, today);
    expect(s).toMatchObject({ active: 2, matchesLeft: 10, walletLeftCents: 800, soldThisMonthCents: 36000 });
    expect(s.toRenew).toBeGreaterThanOrEqual(2);
  });

  it("dice lo que queda como lo diría la recepción", () => {
    expect(passLeftLabel({ kind: "matches", left: 1 })).toBe("1 partido");
    expect(passLeftLabel({ kind: "matches", left: 3 })).toBe("3 partidos");
    expect(passLeftLabel({ kind: "hours", left: 4.5 })).toBe("4,5 h");
    expect(passLeftLabel({ kind: "wallet", left: 640 })).toBe("6,40 €");
  });
});

describe("pistas: caja", () => {
  function withCash(): ProData {
    const d = emptyStudy();
    return {
      ...d,
      payments: [
        { id: "p1", at: atLocal(today, 10 * 60), clientName: "A", concept: "Bono 10 partidos", amountCents: 3000, tipCents: 0, method: "cash" },
        { id: "p2", at: atLocal(today, 11 * 60), clientName: "B", concept: "Pase de día", amountCents: 800, tipCents: 0, method: "card" },
        { id: "p3", at: atLocal(addDays(today, -1), 11 * 60), clientName: "=C", concept: "Extra: agua", amountCents: 150, tipCents: 0, method: "cash" },
      ],
    };
  }

  it("cuadra el efectivo con un euro de margen y tiene en cuenta el cambio", () => {
    const d = withCash();
    expect(cashCheck(d, today, 3000).status).toBe("ok");
    expect(cashCheck(d, today, 3080).status).toBe("ok");
    expect(cashCheck(d, today, 2500)).toMatchObject({ status: "short", diffCents: -500 });
    expect(cashCheck(d, today, 8000, 5000).status).toBe("ok");
    expect(cashCheck(d, today, 9000, 5000)).toMatchObject({ status: "over", diffCents: 1000 });
  });

  it("marca los días cerrados y su descuadre", () => {
    const d = closeCash(withCash(), { id: "c1", date: today, at: now.toISOString(), countedCashCents: 2800, by: "Celia" });
    const h = cashHistory(d, today, 3);
    expect(h.map((x) => x.date)).toEqual([addDays(today, -2), addDays(today, -1), today]);
    expect(h[2]).toMatchObject({ closed: true, diffCents: -200, totalCents: 3800 });
    expect(h[1]).toMatchObject({ closed: false, diffCents: null, totalCents: 150 });
  });

  it("exporta el mes con cabecera y coma decimal", () => {
    const rows = cashMonthRows(withCash(), today.slice(0, 7), () => "Tipo");
    expect(rows[0]).toEqual(["Fecha", "Cliente", "Concepto", "Tipo", "Método", "Importe (€)"]);
    expect(rows).toHaveLength(4);
    expect(rows[1][5]).toBe("1,50");
  });
});

describe("pistas: ocupación", () => {
  it("compara la semana con la anterior y separa el valle", () => {
    const d = padel();
    const c = occupancyCompare(d, today);
    expect(c.thisWeek.rows).toHaveLength(7);
    expect(c.thisWeek.rows[0].date).toBe(mondayOf(today));
    expect(c.lastWeek.rows[0].date).toBe(addDays(mondayOf(today), -7));
    expect(c.valley).toBeGreaterThanOrEqual(0);
    expect(c.valley).toBeLessThanOrEqual(1);
    expect(Math.abs(c.deltaPoints)).toBeLessThanOrEqual(100);
  }, 30_000);

  it("el lunes de una fecha es siempre un lunes", () => {
    expect(mondayOf("2026-09-24")).toBe("2026-09-21");
    expect(mondayOf("2026-09-21")).toBe("2026-09-21");
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
  });

  it("cuenta las horas jugadas por pista sin cancelaciones", () => {
    const d = padel();
    const rows = resourceMonthHours(d, today.slice(0, 7));
    expect(rows).toHaveLength(d.resources.length);
    expect(rows.some((r) => r.minutes > 0)).toBe(true);
  });
});

describe("pistas: escuela", () => {
  it("resume alumnos, plazas y cuotas pendientes", () => {
    const d = padel();
    const s = schoolStats(d);
    const school = courtsOps(d).school;
    expect(s.groups).toBe(school.length);
    expect(s.students).toBe(school.reduce((a, g) => a + g.students.length, 0));
    expect(s.freeSpots).toBe(school.reduce((a, g) => a + Math.max(0, g.capacity - g.students.length), 0));
  });

  it("apunta con cuota pendiente sin pasar del aforo y da de baja", () => {
    const d = padel();
    const g = courtsOps(d).school[0];
    const full = { ...g, capacity: g.students.length };
    const withFull = patchCourts(d, (o) => ({ school: o.school.map((x) => (x.id === g.id ? full : x)) }));
    expect(courtsOps(addStudent(withFull, g.id, { id: "n", name: "Nuevo" })).school[0].students).toHaveLength(g.students.length);
    const roomy = patchCourts(d, (o) => ({ school: o.school.map((x) => (x.id === g.id ? { ...g, capacity: g.students.length + 1 } : x)) }));
    const added = courtsOps(addStudent(roomy, g.id, { id: "n", name: " Nuevo " })).school.find((x) => x.id === g.id)!;
    expect(added.students.at(-1)).toMatchObject({ name: "Nuevo", feeStatus: "pending" });
    expect(courtsOps(removeStudent(addStudent(roomy, g.id, { id: "n", name: "Nuevo" }), g.id, "n")).school.find((x) => x.id === g.id)!.students).toHaveLength(g.students.length);
  });

  it("no deja un grupo nuevo encima de otro del mismo monitor o pista", () => {
    const d = padel();
    const g = courtsOps(d).school[0];
    const clone: ProSchoolGroup = { ...g, id: "nuevo", students: [], attendance: {} };
    expect(checkGroup(d, clone)).toEqual({ ok: false, reason: "coach" });
    expect(checkGroup(d, { ...clone, coachId: "otro" })).toEqual({ ok: false, reason: "court" });
    expect(checkGroup(d, { ...clone, coachId: "otro", resourceId: "otra" })).toEqual({ ok: true });
    expect(checkGroup(d, { ...clone, coachId: "otro", resourceId: "otra", from: 3 * 60 })).toEqual({ ok: false, reason: "hours" });
    const saved = saveGroup(d, { ...clone, coachId: "otro", resourceId: "otra" });
    expect(courtsOps(saved).school).toHaveLength(courtsOps(d).school.length + 1);
  });

  it("reserva la pista de una clase particular y no pisa al monitor", () => {
    const d = { ...padel(), bookings: [] };
    const date = addDays(today, 30);
    const input = { coachId: "s3", resourceId: d.resources[0].id, date, from: 11 * 60, duration: 60, studentName: "Marta", priceCents: 3000 };
    const made = createLesson(d, input, ids());
    expect(made).not.toBeNull();
    expect(made!.data.bookings).toHaveLength(1);
    expect(made!.data.bookings[0]).toMatchObject({ resourceId: input.resourceId, staffId: "s3", priceCents: 3000, clientName: "Marta" });
    expect(courtsOps(made!.data).lessons.at(-1)).toMatchObject({ bookingId: made!.data.bookings[0].id, status: "scheduled" });
    // Misma hora, otra pista: el monitor ya está ocupado.
    expect(checkLesson(made!.data, { ...input, resourceId: d.resources[1].id })).toEqual({ ok: false, reason: "coach" });
    // Misma pista, otro monitor: la pista está ocupada.
    expect(checkLesson(made!.data, { ...input, coachId: "s5" })).toEqual({ ok: false, reason: "court" });
  });
});

describe("pistas: taquillas", () => {
  it("cuenta libres, alquiladas y vencidas", () => {
    const s = lockerStats(
      [
        { id: "1", label: "T-01" },
        { id: "2", label: "T-02", name: "Ana", until: addDays(today, 3) },
        { id: "3", label: "T-03", name: "Luis", until: addDays(today, -3) },
      ],
      today,
    );
    expect(s).toEqual({ free: 1, active: 1, expired: 1 });
  });

  it("alquila un mes y renueva desde el vencimiento si aún no ha pasado", () => {
    const d = patchCourts(emptyStudy(), { lockers: [{ id: "1", label: "T-01" }] });
    const rented = courtsOps(rentLocker(d, "1", { name: " Ana " }, "2026-09-24")).lockers[0];
    expect(rented).toMatchObject({ name: "Ana", until: "2026-10-24" });
    const again = courtsOps(rentLocker(patchCourts(d, { lockers: [rented] }), "1", { name: "Ana" }, "2026-09-30")).lockers[0];
    expect(again.until).toBe("2026-11-24");
    expect(courtsOps(addLocker(d, "2")).lockers.at(-1)).toEqual({ id: "2", label: "T-02" });
  });
});

describe("pistas: liga y ranking", () => {
  const teams = ["Derecho", "Económicas", "Ciencias", "Salud", "Letras"].map((name, i) => ({
    id: `eq${i}`,
    name,
    faculty: name,
    players: [`${name} Uno`, `${name} Dos`] as [string, string],
  }));

  it("crea la liga con todos contra todos y bloquea sus pistas", () => {
    const d = createLeague(
      emptyStudy(),
      { id: "liga", name: " Liga ", weekday: 2, from: 12 * 60 + 30, startDate: today, resourceIds: ["r1", "r2"], teams },
      ids(),
    );
    const league = courtsOps(d).league!;
    expect(league.name).toBe("Liga");
    // Con 5 parejas: 5 jornadas y 10 partidos, una descansa cada semana.
    expect(new Set(league.fixtures.map((f) => f.round)).size).toBe(5);
    expect(league.fixtures).toHaveLength(10);
    expect(courtsOps(d).blocks.filter((b) => b.sourceId === "liga")).toHaveLength(10);
    expect(currentRound(league, today)).toBe(1);
    // Rehacerla sustituye los bloqueos, no los duplica.
    const again = createLeague(d, { id: "liga", name: "Liga", weekday: 2, from: 12 * 60 + 30, startDate: today, resourceIds: ["r1"], teams }, ids());
    expect(courtsOps(again).blocks.filter((b) => b.sourceId === "liga")).toHaveLength(10);
  });

  it("separa el ranking por nivel y lo comparte", () => {
    const rows = clubRanking(padel(), today);
    expect(rows.length).toBeGreaterThan(0);
    const low = rankingByBand(rows, "low");
    expect(low.every((r) => r.level !== undefined && r.level < 3)).toBe(true);
    expect(rankingByBand(rows, "all")).toBe(rows);
    const text = rankingShareText(rows, "Pádel Raspeig", "all");
    expect(text.startsWith("Ranking de Pádel Raspeig\n\n1. ")).toBe(true);
    expect(text).not.toMatch(/[–—]/);
  });
});

describe("pistas: documento del motor en la cuenta real", () => {
  const org = "0b6f2f4e-1111-4222-8333-444455556666";

  it("rellena lo que falta con valores por defecto y conserva la revisión", () => {
    const state = parseProCourtsState(
      { organization_id: org, revision: 4, data: { coveredIds: ["a"], policy: { noticeHours: 12 } } },
      org,
    );
    expect(state.revision).toBe(4);
    expect(state.coveredIds).toEqual(["a"]);
    expect(state.policy.noticeHours).toBe(12);
    expect(state.policy.penaltyPct).toBe(50);
    expect(state.passes).toEqual([]);
    expect(parseProCourtsState({ organization_id: org, revision: 0, data: null }, org).blocks).toEqual([]);
    expect(() => parseProCourtsState({ organization_id: "otro", revision: 0, data: null }, org)).toThrow();
  });

  it("sin la RPC en la base de datos no rompe: devuelve null", async () => {
    const missing = { rpc: async () => ({ data: null, error: { message: "Could not find the function", code: "PGRST202" } }) };
    await expect(loadProCourtsState(missing, org)).resolves.toBeNull();
    const denied = { rpc: async () => ({ data: null, error: { message: "workspace_forbidden", code: "42501" } }) };
    await expect(loadProCourtsState(denied, org)).rejects.toThrow();
  });

  it("solo trata como documento las etiquetas que no son de reservas", () => {
    const booking = { "court.create": "booking.create" };
    expect(isCourtsStateLabel("court.pass.sell", booking)).toBe(true);
    expect(isCourtsStateLabel("court.create", booking)).toBe(false);
    expect(isCourtsStateLabel("booking.create", booking)).toBe(false);
    expect(canProCommand({ "attendees.manage": true }, "court.policy.save")).toBe(true);
    expect(canProCommand({ "finance.read": true }, "court.policy.save")).toBe(false);
  });

  it("guarda el documento entero con la revisión de partida", () => {
    const before = { ...padel(), courts: { ...courtsOps(padel()), revision: 7 } };
    const after = setPolicy(before, { ...courtsOps(before).policy, noticeHours: 6 });
    const command = planProCommand("court.policy.save", before, after);
    expect(command.rpc).toBe("pro_save_courts_state");
    const payload = command.args.p_data as { expected_revision: number; label: string; state: Record<string, unknown> };
    expect(payload.expected_revision).toBe(7);
    expect(payload.label).toBe("court.policy.save");
    expect(payload.state).not.toHaveProperty("revision");
    expect((payload.state.policy as { noticeHours: number }).noticeHours).toBe(6);
  });

  it("rechaza un cambio que además toca reservas o cobros, o que no cambia nada", () => {
    const before = padel();
    const mixed = { ...setPolicy(before, { ...courtsOps(before).policy, noticeHours: 6 }), payments: [] };
    expect(() => planProCourtsStateCommand("court.pass.sell", before, mixed)).toThrow(ProActionError);
    expect(() => planProCourtsStateCommand("court.policy.save", before, before)).toThrow(ProActionError);
  });
});

describe("pistas: navegación de pádel y coworking", () => {
  const sections = resolve(__dirname, "../components/pro/sections");

  it("cada sección del menú tiene su pantalla", () => {
    for (const id of ["sports_facility", "coworking"] as const) {
      for (const item of PRO_VERTICALS[id].nav) {
        const own = existsSync(resolve(sections, "courts", `${item.id}.tsx`));
        const common = existsSync(resolve(sections, "common", `${item.id}.tsx`));
        const shared = item.id === "socios" || item.id === "clientes";
        expect(own || common || shared, `${id}: ${item.id}`).toBe(true);
      }
    }
  });

  it("el pádel abre mostrador, bonos, torneos, escuela, ocupación, caja y normas", () => {
    const nav = PRO_VERTICALS.sports_facility.nav.map((n) => n.id);
    for (const id of ["mostrador", "bonos", "torneos", "escuela", "ocupacion", "caja", "normas", "grupos"])
      expect(nav).toContain(id);
    const study = PRO_VERTICALS.coworking.nav.map((n) => n.id);
    for (const id of ["mostrador", "puestos", "ocupacion", "caja", "normas", "socios"]) expect(study).toContain(id);
    expect(JSON.stringify([PRO_VERTICALS.sports_facility, PRO_VERTICALS.coworking])).not.toMatch(/[–—]/);
  });
});
