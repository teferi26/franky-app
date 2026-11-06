import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate } from "@/lib/pro/format";
import { careOf, extrasOf, patchCare, pauseMember } from "@/lib/pro/classes-care";
import { patchTypeExtra } from "@/lib/pro/classes-ops";
import { groupStudents } from "@/lib/pro/classes-play";
import { bookingLimited, limitBooking, limitMessage } from "@/lib/pro/classes-growth";
import {
  addGrade,
  addMaterial,
  addRecoveryWithRules,
  chargeEnrollment,
  continuityDue,
  continuityFor,
  continuityMessage,
  courseForecast,
  enrollmentFee,
  formatGrade,
  gradeTrend,
  groupLevel,
  groupsForLevel,
  hasLevelGroups,
  markContinuityOffered,
  materialsMessage,
  materialsOf,
  memberGrades,
  needsReinforcement,
  nextLevel,
  normalizeUrl,
  noticeboard,
  parseGrade,
  recoveryRulesOf,
  removeGrade,
  removeMaterial,
  setEnrollmentFee,
  setNextGroup,
  setRecoveryRules,
} from "@/lib/pro/classes-study";
import type { ProGrade } from "@/lib/pro/classes-types";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

function grade(id: string, memberId: string, on: string, value: number): ProGrade {
  return { id, memberId, classTypeId: "ct1", on, topic: "Tema", grade: value, kind: "mock" };
}

describe("notas y simulacros", () => {
  it("lee notas con coma o punto y rechaza lo que no es una nota", () => {
    expect(parseGrade("6,5")).toBe(6.5);
    expect(parseGrade("7.25")).toBe(7.3);
    expect(parseGrade("10")).toBe(10);
    expect(parseGrade("11")).toBeNull();
    expect(parseGrade("seis")).toBeNull();
    expect(parseGrade("")).toBeNull();
    expect(formatGrade(6.5)).toBe("6,5");
    expect(formatGrade(8)).toBe("8");
  });

  it("la tendencia compara la última nota con las anteriores", () => {
    expect(gradeTrend([]).direction).toBeNull();
    const up = gradeTrend([
      grade("a", "m", "2026-09-01", 4),
      grade("b", "m", "2026-09-08", 5),
      grade("c", "m", "2026-09-15", 7),
    ]);
    expect(up.last).toBe(7);
    expect(up.direction).toBe("up");
    expect(up.average).toBeCloseTo(5.3, 1);
    const flat = gradeTrend([grade("a", "m", "2026-09-01", 6), grade("b", "m", "2026-09-08", 6.2)]);
    expect(flat.direction).toBe("flat");
  });

  it("la demo de la academia trae notas y alumnos que necesitan refuerzo", () => {
    const data = buildDemo("academy", now);
    const weak = needsReinforcement(data, "ct1");
    expect(weak.length).toBeGreaterThan(0);
    // El más flojo va primero.
    const averages = weak.map((w) => w.trend.average ?? 0);
    expect([...averages].sort((a, b) => a - b)).toEqual(averages);
    expect(memberGrades(data, weak[0].member.id, "ct1").length).toBe(3);
  });

  it("añadir y quitar una nota", () => {
    const base = buildDemo("academy", now);
    const member = groupStudents(base, "ct2")[0];
    const before = memberGrades(base, member.id).length;
    const added = addGrade(base, grade("nuevo", member.id, today, 9));
    expect(memberGrades(added, member.id).length).toBe(before + 1);
    expect(memberGrades(removeGrade(added, "nuevo"), member.id).length).toBe(before);
  });
});

describe("niveles de idiomas", () => {
  it("lee el nivel del nombre o del rótulo del grupo", () => {
    const data = buildDemo("academy", now);
    const english = data.classTypes.find((c) => c.name.includes("Inglés"))!;
    expect(groupLevel(data, english)).toBe("B2");
    expect(groupLevel(data, data.classTypes.find((c) => c.id === "ct1")!)).toBeNull();
    expect(hasLevelGroups(data)).toBe(true);
    expect(nextLevel("B2")).toBe("C1");
    expect(nextLevel("C2")).toBeNull();
  });

  it("sugiere grupos del nivel con su próxima clase", () => {
    const data = buildDemo("academy", now);
    const b2 = groupsForLevel(data, "B2", now);
    expect(b2.length).toBe(1);
    expect(b2[0].nextSession).toBeDefined();
    expect(groupsForLevel(data, "C1", now)).toEqual([]);
  });
});

describe("continuidad al acabar un grupo", () => {
  it("propone el grupo siguiente a quien no está ya en él", () => {
    const data = buildDemo("academy", now);
    const item = continuityFor(data, "ct4", now);
    expect(item?.to.id).toBe("ct2");
    const inNext = new Set(groupStudents(data, "ct2").map((m) => m.id));
    expect(item!.students.every((m) => !inNext.has(m.id))).toBe(true);
    expect(continuityFor(data, "ct3", now)).toBeNull();
  });

  it("solo sale en Hoy alrededor del examen y no repite a quien ya se le propuso", () => {
    const base = buildDemo("academy", now);
    const soon = patchTypeExtra(base, "ct4", { examOn: addDays(today, 5) });
    const due = continuityDue(soon, now);
    expect(due.map((d) => d.from.id)).toContain("ct4");
    const far = patchTypeExtra(base, "ct4", { examOn: addDays(today, 60) });
    expect(continuityDue(far, now).some((d) => d.from.id === "ct4")).toBe(false);

    const item = due.find((d) => d.from.id === "ct4")!;
    const offered = markContinuityOffered(soon, item.students.map((m) => m.id), now);
    expect(continuityFor(offered, "ct4", now)!.students).toEqual([]);
    const text = continuityMessage(item.students[0], item, "el lunes", "Elena", "Academia Vértice");
    expect(text).toContain(item.to.name);
    expect(text).not.toMatch(/[\u2014\u2013]/);
  });

  it("un grupo no puede seguirse a sí mismo", () => {
    const base = buildDemo("academy", now);
    const same = setNextGroup(base, "ct1", "ct1");
    expect(extrasOf(same).types.ct1?.nextTypeId).toBeUndefined();
  });
});

describe("material de cada grupo", () => {
  it("normaliza enlaces y rechaza lo que no lo es", () => {
    expect(normalizeUrl("drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(normalizeUrl("https://example.com/a b")).toBeNull();
    expect(normalizeUrl("apuntes")).toBeNull();
  });

  it("añade, comparte y quita material", () => {
    const base = buildDemo("academy", now);
    const before = materialsOf(base, "ct2").length;
    const added = addMaterial(base, "ct2", { title: "Tabla normal", url: "drive.google.com/tabla" }, "mtx", now);
    expect(materialsOf(added, "ct2").length).toBe(before + 1);
    const ignored = addMaterial(base, "ct2", { title: "", url: "drive.google.com/tabla" }, "mty", now);
    expect(materialsOf(ignored, "ct2").length).toBe(before);
    const text = materialsMessage("Estadística", materialsOf(added, "ct2"), "Elena", "Academia Vértice");
    expect(text).toContain("https://drive.google.com/tabla");
    expect(materialsOf(removeMaterial(added, "ct2", "mtx"), "ct2").length).toBe(before);
  });
});

describe("matrícula", () => {
  it("se cobra una sola vez con su recibo", () => {
    const base = buildDemo("academy", now);
    expect(enrollmentFee(base, "pl1")).toBe(2000);
    const member = base.members.find((m) => m.planId === "pl1")!;
    const seq = extrasOf(base).receiptSeq;
    const once = chargeEnrollment(base, member, "pl1", "bizum", now, "ch-mat");
    const charge = extrasOf(once).charges.find((c) => c.id === "ch-mat")!;
    expect(charge.amountCents).toBe(2000);
    expect(charge.concept.startsWith("Matrícula")).toBe(true);
    expect(charge.receiptNo).toBe(`R2026-${String(seq + 1).padStart(4, "0")}`);
    const twice = chargeEnrollment(once, member, "pl1", "bizum", now, "ch-mat-2");
    expect(extrasOf(twice).charges.some((c) => c.id === "ch-mat-2")).toBe(false);
  });

  it("sin matrícula en el plan no cobra nada", () => {
    const base = setEnrollmentFee(buildDemo("academy", now), "pl1", 0);
    const member = base.members.find((m) => m.planId === "pl1")!;
    expect(chargeEnrollment(base, member, "pl1", "cash", now, "x")).toBe(base);
  });
});

describe("norma de recuperaciones", () => {
  it("respeta el tope de clases pendientes", () => {
    let data = setRecoveryRules(buildDemo("academy", now), { maxPending: 2 }, 30);
    expect(recoveryRulesOf(data).maxPending).toBe(2);
    const member = data.members[0];
    data = patchCare(data, member.id, { recoveries: [] });
    const first = addRecoveryWithRules(data, member.id, "s-a", today, "r1", now);
    const second = addRecoveryWithRules(first.data, member.id, "s-b", today, "r2", now);
    const third = addRecoveryWithRules(second.data, member.id, "s-c", today, "r3", now);
    expect(first.added && second.added).toBe(true);
    expect(third.added).toBe(false);
    expect(third.reason).toBe("limit");
    expect(careOf(third.data, member.id).recoveries?.length).toBe(2);
  });

  it("acota los valores de la norma", () => {
    const data = setRecoveryRules(buildDemo("academy", now), { maxPending: 0 }, 400);
    expect(recoveryRulesOf(data).maxPending).toBe(1);
    expect(extrasOf(data).recoveryDays).toBe(120);
  });
});

describe("tablón del centro", () => {
  it("saca grupos con sus días y horas y los planes con matrícula", () => {
    const data = buildDemo("academy", now);
    const board = noticeboard(data, now);
    expect(board.groups.length).toBeGreaterThan(3);
    const calc = board.groups.find((g) => g.id === "ct1")!;
    expect(calc.slots.some((s) => /Lunes y miércoles, 16:00/.test(s))).toBe(true);
    expect(board.plans.find((p) => p.id === "pl1")?.enrollment).toBe(2000);
    expect(JSON.stringify(board)).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("previsión del curso", () => {
  it("va de este mes a agosto y descuenta a quien ya no sigue en verano", () => {
    const base = buildDemo("academy", now);
    const forecast = courseForecast(base, now);
    expect(forecast.months[0].period).toBe("2026-09");
    expect(forecast.months.at(-1)?.period).toBe("2027-08");
    const member = base.members.find(
      (m) => m.status === "active" && m.planId === "pl1" && careOf(base, m.id).nextCourse !== "declined",
    )!;
    const declined = patchCare(base, member.id, { nextCourse: "declined" });
    const after = courseForecast(declined, now);
    const july = (f: typeof forecast) => f.months.find((m) => m.period === "2027-07")!;
    const june = (f: typeof forecast) => f.months.find((m) => m.period === "2027-06")!;
    expect(july(after).recurringCents).toBeLessThan(july(forecast).recurringCents);
    expect(june(after).recurringCents).toBe(june(forecast).recurringCents);
    expect(july(after).leaving).toBe(july(forecast).leaving + 1);
  });

  it("una pausa cuenta desde el mes en que vuelve", () => {
    const base = buildDemo("academy", now);
    const member = base.members.find((m) => m.status === "active" && m.planId === "pl1")!;
    const paused = pauseMember(base, member.id, "2026-11-10", "exams", now, false);
    const f = courseForecast(paused, now);
    const oct = f.months.find((m) => m.period === "2026-10")!;
    const nov = f.months.find((m) => m.period === "2026-11")!;
    expect(oct.paused).toBeGreaterThanOrEqual(1);
    expect(nov.recurringCents).toBeGreaterThan(oct.recurringCents);
  });
});

describe("reserva limitada tras faltas", () => {
  it("limita unos días y se quita", () => {
    const base = buildDemo("sports", now);
    const member = base.members[0];
    const until = addDays(today, 14);
    const limited = limitBooking(base, member.id, until);
    expect(bookingLimited(limited, member.id, today)).toBe(true);
    expect(bookingLimited(limited, member.id, addDays(today, 15))).toBe(false);
    expect(bookingLimited(limitBooking(limited, member.id, undefined), member.id, today)).toBe(false);
    const text = limitMessage(member.name, "Dani", "Box Levante", until);
    expect(text).toContain("8/10");
    expect(text).not.toMatch(/[\u2014\u2013]/);
  });
});
