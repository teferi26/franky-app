import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate } from "@/lib/pro/format";
import type { ProData } from "@/lib/pro/types";
import { extrasOf, pauseMember } from "@/lib/pro/classes-care";
import { sessionRoster, sessionsOn } from "@/lib/pro/classes";
import {
  addLead,
  addReferral,
  bookRecovery,
  doorCheckIn,
  doorRooms,
  doorSessions,
  doorUrl,
  inSeasonWindow,
  leadFunnel,
  leadMessage,
  leadsOf,
  leadsToCall,
  moveLead,
  nextCourseSummary,
  recoveriesPending,
  recoverySlots,
  referralBoard,
  referralUrl,
  rewardReferral,
  sameName,
  seasonTasks,
  snoozeLead,
  toggleSeasonTask,
} from "@/lib/pro/classes-growth";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

describe("embudo de interesados", () => {
  it("la demo trae interesados y hoy hay a quién llamar", () => {
    const data = buildDemo("sports", now);
    const toCall = leadsToCall(data, now);
    expect(leadsOf(data).length).toBeGreaterThan(5);
    expect(toCall.length).toBeGreaterThan(2);
    // Los vencidos van primero.
    expect(toCall[0].followUpOn! <= toCall.at(-1)!.followUpOn!).toBe(true);
    expect(toCall.every((l) => l.stage !== "joined" && l.stage !== "lost")).toBe(true);
  });

  it("un interesado nuevo se llama hoy y al pasar de fase cambia el seguimiento", () => {
    const base = buildDemo("academy", now);
    let data = addLead(
      base,
      { name: "  Sara Llorens ", source: "franky", interest: "Cálculo I" },
      now,
      "ldx",
    );
    const lead = leadsOf(data).find((l) => l.id === "ldx")!;
    expect(lead.name).toBe("Sara Llorens");
    expect(lead.stage).toBe("new");
    expect(lead.followUpOn).toBe(today);
    expect(leadsToCall(data, now).some((l) => l.id === "ldx")).toBe(true);

    data = moveLead(data, "ldx", "trial_booked", now, { trialOn: addDays(today, 3) });
    expect(leadsOf(data).find((l) => l.id === "ldx")!.followUpOn).toBe(addDays(today, 2));
    expect(leadsToCall(data, now).some((l) => l.id === "ldx")).toBe(false);

    data = moveLead(data, "ldx", "came", now);
    expect(leadsOf(data).find((l) => l.id === "ldx")!.followUpOn).toBe(addDays(today, 1));

    data = moveLead(data, "ldx", "lost", now, { lostReason: "Precio" });
    const lost = leadsOf(data).find((l) => l.id === "ldx")!;
    expect(lost.lostReason).toBe("Precio");
    expect(lost.followUpOn).toBeUndefined();
  });

  it("aplazar mueve el seguimiento sin cambiar de fase", () => {
    const data = addLead(
      buildDemo("sports", now),
      { name: "Pau Mira", source: "walkin" },
      now,
      "ldy",
    );
    const later = snoozeLead(data, "ldy", 3, now);
    const lead = leadsOf(later).find((l) => l.id === "ldy")!;
    expect(lead.stage).toBe("new");
    expect(lead.followUpOn).toBe(addDays(today, 3));
  });

  it("el embudo cuenta fases y conversión", () => {
    const funnel = leadFunnel(buildDemo("sports", now), now);
    expect(funnel.total).toBeGreaterThan(0);
    expect(funnel.counts.joined).toBeGreaterThan(0);
    expect(funnel.trialToJoin).toBeGreaterThan(0);
    expect(funnel.trialToJoin).toBeLessThanOrEqual(100);
  });

  it("el mensaje va en primera persona y sin guiones largos", () => {
    const data = buildDemo("academy", now);
    const lead = leadsOf(data)[0];
    const text = leadMessage(lead, "Nuria", "Academia Vértice", "academy");
    expect(text).toContain("soy Nuria de Academia Vértice");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("entrada con el QR de la puerta", () => {
  it("el enlace lleva la sala", () => {
    expect(doorUrl("box-levante", "Sala 1")).toBe(
      "https://franky.es/n/box-levante/entrada?sala=Sala%201",
    );
    expect(doorRooms(buildDemo("sports", now)).length).toBeGreaterThan(0);
  });

  it("compara nombres sin tildes ni mayúsculas", () => {
    expect(sameName("lucia", "Lucía Soler")).toBe(true);
    expect(sameName("LUCÍA SOLER", "Lucía Soler")).toBe(true);
    expect(sameName("Luc", "Lucía Soler")).toBe(false);
  });

  it("quien tiene reserva pasa a llegó y la segunda vez ya consta", () => {
    const data = buildDemo("sports", now);
    const next = sessionsOn(data, today).find(
      (s) => new Date(s.start).getTime() > now.getTime() && s.booked > 0,
    )!;
    const at = new Date(new Date(next.start).getTime() - 10 * 60000);
    const person = sessionRoster(data, next, at).booked.find((b) => b.status === "confirmed")!;
    expect(doorSessions(data, at).some((s) => s.id === next.id)).toBe(true);

    const first = doorCheckIn(data, next.id, person.clientName, at, "ci1");
    expect(first.outcome).toBe("booked");
    const roster = sessionRoster(first.data, next, at).booked;
    expect(roster.find((b) => b.id === person.id)!.status).toBe("arrived");
    expect(extrasOf(first.data).checkins).toHaveLength(1);

    const again = doorCheckIn(first.data, next.id, person.clientName, at, "ci2");
    expect(again.outcome).toBe("already");
  });

  it("sin reserva entra de paso si hay plaza; si no, está completa", () => {
    const data = buildDemo("sports", now);
    const s = sessionsOn(data, today).find((x) => new Date(x.start).getTime() > now.getTime())!;
    const at = new Date(new Date(s.start).getTime() - 5 * 60000);
    const open: ProData = {
      ...data,
      sessions: data.sessions.map((x) => (x.id === s.id ? { ...x, capacity: x.booked + 1 } : x)),
    };
    const walk = doorCheckIn(open, s.id, "Visitante Nuevo", at, "ci3");
    expect(walk.outcome).toBe("walkin");
    const after = walk.data.sessions.find((x) => x.id === s.id)!;
    expect(after.booked).toBe(s.booked + 1);
    const full = doorCheckIn(walk.data, s.id, "Otra Persona", at, "ci4");
    expect(full.outcome).toBe("full");
  });

  it("una clase terminada no admite entradas", () => {
    const data = buildDemo("sports", now);
    const past = data.sessions.find((s) => new Date(s.end).getTime() < now.getTime())!;
    expect(doorCheckIn(data, past.id, "Alguien", now, "ci5").outcome).toBe("closed");
  });
});

describe("trae a un amigo", () => {
  it("cuenta invitados, pruebas y altas, y el premio pendiente", () => {
    let data = buildDemo("sports", now);
    const board = referralBoard(data);
    expect(board.length).toBeGreaterThan(0);
    const pending = board.flatMap((r) => r.unrewarded);
    expect(pending.length).toBeGreaterThan(0);
    data = rewardReferral(data, pending[0].id, now);
    expect(referralBoard(data).flatMap((r) => r.unrewarded).length).toBe(pending.length - 1);
  });

  it("el enlace es personal y el alta del interesado avanza su invitación", () => {
    const base = buildDemo("sports", now);
    const member = base.members.find((m) => m.status === "active")!;
    expect(referralUrl("box-levante", member.id)).toContain(`amigo=${member.id}`);
    let data = addReferral(base, member.id, "Sofía Brotons", now, "rfx");
    data = addLead(
      data,
      { name: "Sofía Brotons", source: "friend", referredBy: member.id },
      now,
      "ldz",
    );
    data = moveLead(data, "ldz", "joined", now);
    const ref = extrasOf(data).referrals!.find((r) => r.id === "rfx")!;
    expect(ref.status).toBe("joined");
  });
});

describe("recuperaciones y curso que viene", () => {
  it("lista las pendientes y propone clases con hueco antes de que caduquen", () => {
    const data = buildDemo("academy", now);
    const items = recoveriesPending(data, now);
    expect(items.length).toBeGreaterThan(0);
    const item = items[0];
    const slots = recoverySlots(data, item, now);
    for (const s of slots) {
      expect(localDate(s.start) <= item.recovery.expiresOn).toBe(true);
      expect(s.capacity - s.booked).toBeGreaterThan(0);
    }
    if (slots[0]) {
      const booked = bookRecovery(data, item.member.id, item.recovery.id, slots[0].id, now, "bk1");
      expect(recoveriesPending(booked, now).some((i) => i.recovery.id === item.recovery.id)).toBe(
        false,
      );
      expect(booked.bookings.some((b) => b.id === "bk1" && b.note === "Recuperación")).toBe(true);
    }
  });

  it("resume quién sigue el curso que viene", () => {
    const summary = nextCourseSummary(buildDemo("academy", now));
    expect(summary.confirmed.length).toBeGreaterThan(0);
    expect(summary.pending.length).toBeGreaterThan(0);
  });
});

describe("temporada de septiembre", () => {
  it("solo se enseña de mediados de julio a septiembre", () => {
    expect(inSeasonWindow(now)).toBe(true);
    expect(inSeasonWindow(new Date("2026-11-10T10:00:00Z"))).toBe(false);
    expect(inSeasonWindow(new Date("2026-07-20T10:00:00Z"))).toBe(true);
  });

  it("marca sola lo que se ve en los datos y a mano lo demás", () => {
    let data = buildDemo("sports", now);
    const tasks = seasonTasks(data, now, "sports");
    expect(tasks.find((t) => t.id === "schedule")!.done).toBe(true);
    expect(tasks.find((t) => t.id === "student_price")!.done).toBe(true);
    const groups = tasks.find((t) => t.id === "groups")!;
    expect(groups.auto).toBe(false);
    expect(groups.done).toBe(false);
    data = toggleSeasonTask(data, "2026", "groups");
    expect(seasonTasks(data, now, "sports").find((t) => t.id === "groups")!.done).toBe(true);
  });

  it("avisar a los que vuelven queda pendiente si alguien vuelve pronto sin aviso", () => {
    const base = buildDemo("sports", now);
    const member = base.members.find((m) => m.status === "active")!;
    const data = pauseMember(base, member.id, addDays(today, 10), "summer", now, false);
    expect(seasonTasks(data, now, "sports").find((t) => t.id === "returning")!.done).toBe(false);
  });

  it("en la academia pide confirmar las plazas", () => {
    const tasks = seasonTasks(buildDemo("academy", now), now, "academy");
    expect(tasks.some((t) => t.id === "next_course")).toBe(true);
  });
});
