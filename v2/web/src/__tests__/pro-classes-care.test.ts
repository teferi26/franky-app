import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, atLocal, localDate } from "@/lib/pro/format";
import type { ProData, ProMember } from "@/lib/pro/types";
import {
  atRiskMembers,
  bundlesExpiring,
  chargeSummary,
  convertTrial,
  declineTrial,
  extrasOf,
  forecastNextMonth,
  leaveMember,
  leaveSummary,
  markChargePaid,
  markContacted,
  markTouchDone,
  memberRisk,
  monthOf,
  pauseMember,
  pausesReturning,
  pendingRecoveries,
  addRecovery,
  spendRecovery,
  recordCharge,
  resumeMember,
  shiftMonth,
  suggestedReturn,
  touchesDue,
  trialConversion,
  trialsToFollow,
  wasContactedRecently,
  winbackCandidates,
} from "@/lib/pro/classes-care";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

function gym(): ProData {
  return buildDemo("sports", now);
}

function member(data: ProData, changes: Partial<ProMember> = {}): ProMember {
  return {
    id: "mx",
    clientId: "mx",
    name: "Lucía Soler",
    planId: data.plans[0].id,
    status: "active",
    nextChargeAt: atLocal(addDays(today, 10), 9 * 60),
    sessionsLeft: null,
    since: atLocal(addDays(today, -200), 12 * 60),
    attendanceLast30: 10,
    ...changes,
  };
}

describe("Franky Pro clases: riesgo de baja", () => {
  it("detecta a quien lleva días sin venir y sube de nivel si es nuevo", () => {
    const d = gym();
    const old = member(d);
    const withCare = (m: ProMember, days: number): ProData => ({
      ...d,
      members: [m],
      classExtras: { ...extrasOf(d), members: { [m.id]: { lastVisitAt: atLocal(addDays(today, -days), 19 * 60) } } },
    });
    expect(memberRisk(withCare(old, 3), old, now)).toBeNull();
    expect(memberRisk(withCare(old, 13), old, now)?.level).toBe("medium");
    expect(memberRisk(withCare(old, 20), old, now)?.level).toBe("high");
    const fresh = member(d, { since: atLocal(addDays(today, -20), 12 * 60) });
    const risk = memberRisk(withCare(fresh, 8), fresh, now);
    expect(risk?.level).toBe("high");
    expect(risk?.isNew).toBe(true);
    expect(risk?.reason).toContain("es nuevo");
  });

  it("no avisa de pausados ni bajas y deja al final a quien ya se escribió", () => {
    const d = gym();
    const list = atRiskMembers(d, now);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((r) => r.member.status === "active" || r.member.status === "overdue")).toBe(true);
    const first = list[0].member.id;
    const after = atRiskMembers(markContacted(d, first, now), now);
    const idx = after.findIndex((r) => r.member.id === first);
    // Quien ya recibió mensaje queda en el grupo del final, tras los pendientes.
    expect(after.slice(idx).every((r) => wasContactedRecently(r, now))).toBe(true);
    expect(wasContactedRecently(after[0], now)).toBe(false);
  });
});

describe("Franky Pro clases: primeros 90 días", () => {
  it("la demo tiene toques pendientes y marcarlos los quita", () => {
    const d = gym();
    const due = touchesDue(d, now);
    expect(due.length).toBeGreaterThan(0);
    const t = due[0];
    const next = markTouchDone(d, t.member.id, t.week);
    expect(touchesDue(next, now).some((x) => x.member.id === t.member.id && x.week === t.week)).toBe(false);
  });

  it("un toque que se pasó más de 7 días se deja atrás", () => {
    const d = gym();
    const m = member(d, { since: atLocal(addDays(today, -23), 12 * 60) });
    const due = touchesDue({ ...d, members: [m], classExtras: { ...extrasOf(d), members: {} } }, now);
    // La semana 1 venció hace 16 días y la 2 hace 9: se dejan atrás. La 4 aún no toca.
    expect(due).toHaveLength(0);
  });
});

describe("Franky Pro clases: pausas y bajas", () => {
  it("pausar con fecha deja de cobrar y avisa la semana antes de volver", () => {
    const d = gym();
    const m = d.members.find((x) => x.status === "active")!;
    const until = addDays(today, 5);
    const paused = pauseMember(d, m.id, until, "exams", now, true);
    const pm = paused.members.find((x) => x.id === m.id)!;
    expect(pm.status).toBe("paused");
    expect(pm.nextChargeAt).toBeNull();
    expect(pausesReturning(paused, now).some((p) => p.member.id === m.id && p.daysLeft === 5)).toBe(true);
    expect(leaveSummary(paused, now).avoided).toBeGreaterThan(leaveSummary(d, now).avoided);
    const back = resumeMember(paused, m.id, now);
    const bm = back.members.find((x) => x.id === m.id)!;
    expect(bm.status).toBe("active");
    expect(localDate(bm.nextChargeAt!)).toBe(until);
  });

  it("sugiere vuelta en septiembre para el verano", () => {
    expect(suggestedReturn("summer", new Date("2026-06-20T10:00:00Z"))).toBe("2026-09-01");
    expect(suggestedReturn("summer", now)).toBe("2027-09-01");
  });

  it("la baja guarda el motivo y entra en el resumen y en recuperar bajas", () => {
    const d = gym();
    const m = d.members.find((x) => x.status === "active")!;
    const left = leaveMember(d, m.id, "schedule", now);
    const summary = leaveSummary(left, now);
    expect(summary.reasons.find((r) => r.reason === "schedule")?.count).toBeGreaterThan(0);
    expect(winbackCandidates(left, now).list.some((w) => w.member.id === m.id)).toBe(true);
    expect(winbackCandidates(leaveMember(d, m.id, "moving", now), now).list.some((w) => w.member.id === m.id)).toBe(false);
  });
});

describe("Franky Pro clases: bonos y cobros", () => {
  it("avisa de bonos con pocas sesiones o a punto de caducar", () => {
    const d = gym();
    const pack = d.plans.find((p) => p.period === "pack")!;
    const m = member(d, { planId: pack.id, sessionsLeft: 6 });
    const base: ProData = { ...d, members: [m], classExtras: { ...extrasOf(d), members: { mx: { bundleExpiresOn: addDays(today, 4) } } } };
    expect(bundlesExpiring(base, now)[0]?.reason).toBe("date");
    const low: ProData = { ...base, members: [{ ...m, sessionsLeft: 1 }] };
    expect(bundlesExpiring(low, now)[0]?.reason).toBe("sessions");
  });

  it("el resumen del mes cuadra y cobrar pone al día con número de recibo", () => {
    const d = gym();
    const period = monthOf(today);
    const s = chargeSummary(d, period, now);
    expect(s.paidCents).toBeGreaterThan(0);
    expect(s.counts.returned + s.counts.late).toBeGreaterThan(0);
    const owed = extrasOf(d).charges.find((c) => c.period === period && c.status !== "paid" && d.members.find((m) => m.id === c.memberId)?.status === "overdue")!;
    const seq = extrasOf(d).receiptSeq;
    const paid = markChargePaid(d, owed.id, "bizum", now);
    const charge = extrasOf(paid).charges.find((c) => c.id === owed.id)!;
    expect(charge.status).toBe("paid");
    expect(charge.method).toBe("bizum");
    expect(charge.receiptNo).toBe(`R2026-${String(seq + 1).padStart(4, "0")}`);
    expect(paid.members.find((m) => m.id === owed.memberId)?.status).toBe("active");
    // Cobrar dos veces no duplica recibos.
    expect(extrasOf(markChargePaid(paid, owed.id, "cash", now)).receiptSeq).toBe(seq + 1);
  });

  it("registrar un cobro en mano deja recibo correlativo", () => {
    const d = gym();
    const m = d.members[0];
    const next = recordCharge(d, { id: "ch-new", member: m, concept: "Cuota", amountCents: 4900, method: "cash" }, now);
    const c = extrasOf(next).charges.find((x) => x.id === "ch-new")!;
    expect(c.status).toBe("paid");
    expect(c.receiptNo).toMatch(/^R2026-\d{4}$/);
  });

  it("los meses se desplazan bien entre años", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("la previsión suma sus líneas", () => {
    const f = forecastNextMonth(gym(), now);
    expect(f.period).toBe("2026-10");
    expect(f.totalCents).toBe(f.lines.reduce((a, l) => a + l.cents, 0));
    expect(f.lines[0].cents).toBeGreaterThan(0);
  });
});

describe("Franky Pro clases: pruebas que se convierten", () => {
  it("las pruebas de ayer esperan respuesta y el alta crea socio y cobro", () => {
    const d = gym();
    const list = trialsToFollow(d, now);
    expect(list.length).toBeGreaterThan(0);
    const t = list[0];
    const plan = d.plans[0];
    const joined = convertTrial(d, t, { memberId: "m-new", chargeId: "ch-trial", planId: plan.id, student: true, method: "card" }, now);
    expect(joined.members[0].id).toBe("m-new");
    expect(joined.members[0].student?.verified).toBe(true);
    expect(extrasOf(joined).charges.some((c) => c.id === "ch-trial" && c.amountCents === plan.studentPriceCents)).toBe(true);
    expect(trialsToFollow(joined, now).some((x) => x.bookingId === t.bookingId)).toBe(false);
    const conv = trialConversion(joined);
    expect(conv.joined).toBe(trialConversion(d).joined + 1);
  });

  it("decir que no también cierra la prueba", () => {
    const d = gym();
    const t = trialsToFollow(d, now)[0];
    const next = declineTrial(d, t, "Precio", now);
    expect(trialsToFollow(next, now).some((x) => x.bookingId === t.bookingId)).toBe(false);
  });
});

describe("Franky Pro clases: recuperaciones", () => {
  it("una falta genera recuperación que caduca y se descuenta al usarla", () => {
    const d = buildDemo("academy", now);
    const m = d.members.find((x) => x.status === "active")!;
    const missed = addDays(today, -3);
    const withRec = addRecovery({ ...d, classExtras: { ...extrasOf(d), members: {} } }, m.id, "ss-x", missed, "rc-x");
    expect(pendingRecoveries(withRec, m.id, now)).toHaveLength(1);
    expect(addRecovery(withRec, m.id, "ss-x", missed, "rc-y")).toBe(withRec);
    const used = spendRecovery(withRec, m.id, "ss-y", now);
    expect(pendingRecoveries(used, m.id, now)).toHaveLength(0);
    expect(pendingRecoveries(withRec, m.id, new Date(`${addDays(missed, 31)}T10:00:00Z`))).toHaveLength(0);
  });

  it("la demo de la academia trae recuperaciones pendientes y exámenes", () => {
    const d = buildDemo("academy", now);
    const withRecoveries = d.members.filter((m) => pendingRecoveries(d, m.id, now).length > 0);
    expect(withRecoveries.length).toBeGreaterThan(0);
    expect(Object.values(extrasOf(d).types).some((t) => t.examOn)).toBe(true);
  });
});
