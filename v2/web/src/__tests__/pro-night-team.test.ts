import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, atLocal } from "@/lib/pro/format";
import { nightOf } from "@/lib/pro/night";
import type { ProData, ProEvent, ProGuest, ProPromoter, ProShift } from "@/lib/pro/types";
import type { ProInvite, ProNightOps, ProPlannedShift } from "@/lib/pro/night-types";
import { EMPTY_NIGHT_OPS, nightOpsOf, withNightOps } from "@/lib/pro/night-ops";
import {
  addInvite,
  closeInvitesDraft,
  inviteCapLeft,
  inviteRows,
  invitesByPerson,
  invitesByReason,
  invitesOfNight,
  inviteTotals,
  invitableItems,
  removeInvite,
} from "@/lib/pro/night-invites";
import {
  expectedShare,
  nextTierHint,
  promoterNudge,
  promoterPanel,
  promoterTargetState,
  promoterTargets,
} from "@/lib/pro/night-promoters";
import {
  doorStaff,
  nightsWithoutLicensedDoor,
  setDoorLicense,
  shiftNight,
  timesheetRows,
  timesheetSummary,
  timesheetVsRota,
  workedMinutes,
} from "@/lib/pro/night-staff";
import {
  DEFAULT_ACCESS_CONDITIONS,
  accessConditionsOf,
  addBan,
  bansByCondition,
  bookerHistory,
  recordNoShow,
  setAccessConditions,
} from "@/lib/pro/night-guests";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const NOW = new Date("2026-09-24T09:30:00.000Z");

function invite(partial: Partial<ProInvite>): ProInvite {
  return {
    id: partial.id ?? `i-${Math.random()}`,
    night: "2026-09-23",
    at: atLocal("2026-09-23", 23 * 60),
    by: "Rubén Pastor",
    to: "Jorge",
    reason: "habitual",
    drinks: 1,
    cents: 700,
    ...partial,
  };
}

function ops(partial: Partial<ProNightOps>): ProNightOps {
  return { ...EMPTY_NIGHT_OPS, ...partial, settings: { ...EMPTY_NIGHT_OPS.settings, ...partial.settings } };
}

describe("Noche: invitaciones con nombre", () => {
  it("suma copas y valor por persona, marca a quien pasa su cupo y cuenta por motivo", () => {
    const list = [
      invite({ by: "Rubén Pastor", drinks: 4, cents: 1200 }),
      invite({ by: "Rubén Pastor", drinks: 2, cents: 1400, reason: "dj" }),
      invite({ by: "Celia Ruiz", drinks: 3, cents: 600, reason: "cumple" }),
    ];
    expect(inviteTotals(list)).toEqual({ count: 3, drinks: 9, cents: 3200 });
    const rows = invitesByPerson(list, 5);
    expect(rows.map((r) => [r.by, r.drinks, r.over])).toEqual([
      ["Rubén Pastor", 6, true],
      ["Celia Ruiz", 3, false],
    ]);
    // Sin cupo nadie se pasa.
    expect(invitesByPerson(list).every((r) => !r.over)).toBe(true);
    expect(invitesByReason(list)[0]).toEqual({ reason: "habitual", label: "Cliente habitual", drinks: 4 });
  });

  it("calcula lo que le queda a cada uno y prepara el cierre de la noche", () => {
    let o = ops({ settings: { peoplePerBartender: 60, invitesPerPerson: 5 } });
    o = addInvite(o, invite({ id: "a", drinks: 3, cents: 2100 }));
    o = addInvite(o, invite({ id: "b", by: "Celia Ruiz", drinks: 1, cents: 700 }));
    o = addInvite(o, invite({ id: "c", night: "2026-09-22", drinks: 5, cents: 1000 }));
    expect(inviteCapLeft(o, "2026-09-23", "rubén pastor")).toBe(2);
    expect(inviteCapLeft(o, "2026-09-23", "Iván")).toBe(5);
    expect(inviteCapLeft({ ...o, settings: { peoplePerBartender: 60 } }, "2026-09-23", "Rubén Pastor")).toBeNull();
    expect(closeInvitesDraft(o, "2026-09-23")).toEqual({ invitations: 4, invitationsCents: 2800, count: 2 });
    expect(invitesOfNight(removeInvite(o, "a"), "2026-09-23").map((i) => i.id)).toEqual(["b"]);
    // Los datos guardados antes de esta versión no traen la lista.
    expect(closeInvitesDraft(ops({}), "2026-09-23").count).toBe(0);
  });

  it("exporta el mes con coma decimal y sin guiones largos", () => {
    const o = ops({ invites: [invite({ drinks: 2, cents: 1400, itemName: "Ginebra con tónica" }), invite({ night: "2026-08-30" })] });
    const rows = inviteRows(o, "2026-09");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["2026-09-23", "23:00", "Rubén Pastor", "Jorge", "Cliente habitual", "Ginebra con tónica", "2", "14,00"]);
    expect(rows.flat().join(" ")).not.toMatch(/[\u2013\u2014]/);
  });

  it("propone copas de la carta, no botellas ni comida", () => {
    const pub = buildDemo("pub", NOW);
    const items = invitableItems(pub.menu);
    expect(items.length).toBeGreaterThan(2);
    expect(items.some((i) => /botella|cubo|nachos|bravas/i.test(i.name))).toBe(false);
  });

  it("la demo trae invitaciones que cuadran con los cierres guardados", () => {
    for (const vertical of ["pub", "nightclub"] as const) {
      const data = buildDemo(vertical, NOW);
      const o = nightOpsOf(data);
      expect((o.invites ?? []).length).toBeGreaterThan(5);
      const closed = o.closes.filter((c) => (o.invites ?? []).some((i) => i.night === c.night));
      expect(closed.length).toBeGreaterThan(0);
      for (const c of closed) {
        const draft = closeInvitesDraft(o, c.night);
        expect(c.invitations).toBe(draft.invitations);
        expect(c.invitationsCents).toBe(draft.invitationsCents);
      }
    }
  });
});

describe("Noche: objetivos y panel del RRPP", () => {
  const ev: ProEvent = {
    id: "e1",
    name: "Jueves Universitario",
    date: "2026-09-24",
    doorsOpen: atLocal("2026-09-24", 23 * 60 + 30),
    closes: atLocal("2026-09-25", 6 * 60),
    capacity: 700,
    checkedIn: 0,
    tiers: [],
    ageMin: 18,
    status: "on_sale",
    crushLive: false,
    poster: "violet",
  };
  const promoter: ProPromoter = {
    id: "rp1",
    name: "Hugo Llorca",
    code: "hugo26",
    listSize: 0,
    sold: 0,
    checkedIn: 0,
    commissionCents: 0,
    rule: "",
    active: true,
    spec: { kind: "tiers", upTo: 25, lowCents: 50, highCents: 150 },
    cap: { maxPerNight: 80, targetPerNight: 40 },
  };
  const guests = (n: number, checked = 0): ProGuest[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `g${i}`,
      name: `Persona ${i}`,
      eventId: "e1",
      kind: "list",
      promoterId: "rp1",
      checkedInAt: i < checked ? atLocal("2026-09-25", 60) : null,
      age18: true,
    }));
  const base = buildDemo("nightclub", NOW);
  const data = (n: number, checked = 0): ProData => ({ ...base, events: [ev], promoters: [promoter], guests: guests(n, checked) });

  it("antes de abrir mide lo apuntado frente a lo esperado por las horas que faltan", () => {
    // A 12 horas de abrir se espera el 70 % del objetivo (28 de 40).
    expect(expectedShare(12)).toBe(0.7);
    expect(promoterTargetState(data(20), promoter, ev, NOW).status).toBe("behind");
    expect(promoterTargetState(data(30), promoter, ev, NOW).status).toBe("on_track");
    expect(promoterTargetState(data(38), promoter, ev, NOW).status).toBe("ahead");
    const done = promoterTargetState(data(41), promoter, ev, NOW);
    expect(done.status).toBe("done");
    expect(done.missing).toBe(0);
    const behind = promoterTargetState(data(20), promoter, ev, NOW);
    expect(behind.missing).toBe(20);
    expect(behind.progress).toBe(50);
  });

  it("con la noche pasada cuenta a quien entró de verdad", () => {
    const after = new Date(atLocal("2026-09-25", 9 * 60));
    expect(promoterTargetState(data(50, 30), promoter, ev, after).status).toBe("missed");
    expect(promoterTargetState(data(50, 42), promoter, ev, after).status).toBe("done");
  });

  it("ordena primero a quien va flojo y le prepara un mensaje", () => {
    const d = data(10);
    const other: ProPromoter = { ...promoter, id: "rp2", name: "Carla Mora", cap: { maxPerNight: null, targetPerNight: 5 } };
    const withTwo: ProData = { ...d, promoters: [other, promoter], guests: [...d.guests, ...guests(6).map((g) => ({ ...g, id: `x${g.id}`, promoterId: "rp2" }))] };
    const list = promoterTargets(withTwo, ev, NOW);
    expect(list.map((t) => t.promoter.id)).toEqual(["rp1", "rp2"]);
    const text = promoterNudge(promoter, ev, list[0].state, "sala-aurora");
    expect(text).toContain("llevas 10 de 40");
    expect(text).toContain("Te faltan 30");
    expect(text).toContain("franky.es/n/sala-aurora?rrpp=hugo26");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("dice cuánto le falta para el siguiente tramo de comisión", () => {
    expect(nextTierHint(promoter, 20)).toContain("Con 6 entradas más");
    expect(nextTierHint(promoter, 30)).toContain("Ya cobras");
    expect(nextTierHint({ ...promoter, spec: { kind: "per_scan", cents: 100 } }, 3)).toBeNull();
  });

  it("el panel del RRPP solo lleva sus cifras", () => {
    const demo = buildDemo("nightclub", NOW);
    const p = demo.promoters[0];
    const panel = promoterPanel(demo, p, NOW);
    expect(panel.link).toContain(`rrpp=${p.code}`);
    expect(panel.event).not.toBeNull();
    expect(panel.cap?.max).toBe(p.cap?.maxPerNight ?? null);
    expect(panel.target?.target).toBe(p.cap?.targetPerNight ?? null);
    const own = demo.guests.filter((g) => g.eventId === panel.event?.id && g.promoterId === p.id).length;
    expect(panel.cap?.signedUp).toBe(own);
    expect(panel.recent.length).toBeLessThanOrEqual(4);
    expect(panel.monthCents).toBeGreaterThanOrEqual(0);
  });
});

describe("Noche: fichajes por noche frente al cuadrante", () => {
  const night = "2026-09-23";
  const rota: ProPlannedShift[] = [
    { id: "r1", staffId: "a", night, role: "barra", fromMinute: 22 * 60, toMinute: 3 * 60 },
    { id: "r2", staffId: "b", night, role: "puerta", fromMinute: 23 * 60, toMinute: 3 * 60 },
    { id: "r3", staffId: "c", night, role: "barra", fromMinute: 22 * 60, toMinute: 3 * 60 },
  ];
  const shifts: ProShift[] = [
    // A tiempo; el fichaje de salida es de madrugada.
    { id: "s1", staffId: "a", date: night, inAt: atLocal(night, 21 * 60 + 55), outAt: atLocal("2026-09-24", 3 * 60 + 10), breakMinutes: 15 },
    // Ficha a las 00:30: es la noche del miércoles aunque el día natural sea jueves.
    { id: "s2", staffId: "b", date: "2026-09-24", inAt: atLocal("2026-09-24", 30), outAt: atLocal("2026-09-24", 3 * 60), breakMinutes: 0 },
    // Sin turno en el cuadrante.
    { id: "s3", staffId: "d", date: night, inAt: atLocal(night, 23 * 60), outAt: atLocal("2026-09-24", 2 * 60), breakMinutes: 0 },
  ];
  const data = { shifts, nightOps: { ...EMPTY_NIGHT_OPS, rota }, staff: [] };

  it("cuenta un fichaje de madrugada en la noche anterior", () => {
    expect(shiftNight(shifts[1])).toBe(night);
    expect(workedMinutes(shifts[0], NOW)).toBe(5 * 60 + 15 - 15);
  });

  it("marca tarde, sin fichar y fichado sin turno", () => {
    const checks = timesheetVsRota(data, [night], NOW);
    const by = Object.fromEntries(checks.map((c) => [c.staffId, c]));
    expect(by.a.status).toBe("ok");
    expect(by.a.diffMinutes).toBe(5 * 60 - 5 * 60);
    expect(by.b.status).toBe("late");
    expect(by.b.lateMinutes).toBe(90);
    expect(by.c.status).toBe("missing");
    expect(by.d.status).toBe("unplanned");
    const sum = timesheetSummary(checks);
    expect([sum.issues, sum.missing, sum.late, sum.unplanned]).toEqual([3, 1, 1, 1]);
  });

  it("no juzga noches futuras ni una salida olvidada como horas", () => {
    expect(timesheetVsRota(data, ["2026-09-26"], NOW)).toEqual([]);
    const open = { ...data, shifts: [{ ...shifts[0], outAt: null }] };
    const check = timesheetVsRota(open, [night], NOW).find((c) => c.staffId === "a");
    expect(check?.status).toBe("open");
    expect(check?.workedMinutes).toBe(0);
  });

  it("saca el registro por noche en CSV", () => {
    const rows = timesheetRows({ ...data, staff: [{ id: "a", name: "Rubén Pastor", role: "staff", tone: "sky", title: "Barra", commissionPct: 0, clockedInAt: null, weekMinutes: 0 }] }, [night], NOW);
    expect(rows[0][0]).toBe("Noche");
    const ruben = rows.find((r) => r[1] === "Rubén Pastor");
    expect(ruben?.slice(2, 8)).toEqual(["Barra", "22:00 a 03:00", "21:55", "03:10", "15", "5,00"]);
    expect(rows).toHaveLength(5);
  });

  it("la demo de discoteca trae los tres casos para que se vean", () => {
    const demo = buildDemo("nightclub", NOW);
    const today = nightOf(NOW);
    const nights = Array.from({ length: 8 }, (_, i) => addDays(today, -7 + i));
    const statuses = new Set(timesheetVsRota(demo, nights, NOW).map((c) => c.status));
    expect(statuses.has("late")).toBe(true);
    expect(statuses.has("missing")).toBe(true);
    expect(statuses.has("unplanned")).toBe(true);
  });
});

describe("Noche: controladores habilitados en puerta", () => {
  it("avisa de las noches con puerta sin nadie habilitado, solo si el local lo pide", () => {
    const rota: ProPlannedShift[] = [
      { id: "1", staffId: "kike", night: "2026-09-24", role: "puerta", fromMinute: 23 * 60, toMinute: 6 * 60 },
      { id: "2", staffId: "samu", night: "2026-09-23", role: "puerta", fromMinute: 23 * 60, toMinute: 6 * 60 },
      { id: "3", staffId: "toni", night: "2026-09-22", role: "barra", fromMinute: 23 * 60, toMinute: 6 * 60 },
    ];
    let o = ops({ rota });
    const nights = ["2026-09-22", "2026-09-23", "2026-09-24"];
    expect(nightsWithoutLicensedDoor(o, nights)).toEqual([]);
    o = { ...o, settings: { ...o.settings, licenseRequired: true } };
    o = setDoorLicense(o, "kike", " 03-1187 ");
    expect(o.settings.doorLicenses).toEqual({ kike: "03-1187" });
    expect(nightsWithoutLicensedDoor(o, nights)).toEqual(["2026-09-23"]);
    o = setDoorLicense(o, "kike", "");
    expect(o.settings.doorLicenses).toEqual({});
  });

  it("la demo de discoteca tiene a Kike habilitado y a Samuel sin habilitar", () => {
    const demo = buildDemo("nightclub", NOW);
    const o = nightOpsOf(demo);
    expect(doorStaff(demo.staff, o).map((s) => s.id)).toEqual(expect.arrayContaining(["s3", "s4"]));
    expect(o.settings.doorLicenses?.s3).toBeTruthy();
    expect(o.settings.doorLicenses?.s4).toBeUndefined();
  });
});

describe("Noche: condiciones de acceso y vetos", () => {
  it("usa las condiciones del local o las habituales, sin repetidas", () => {
    expect(accessConditionsOf(ops({}))).toEqual(DEFAULT_ACCESS_CONDITIONS);
    const o = setAccessConditions(ops({}), ["Solo con invitación ", "Solo con invitación", ""]);
    expect(accessConditionsOf(o)).toEqual(["Solo con invitación"]);
  });

  it("al vetar con una condición lo apunta también en el libro de esa noche", () => {
    const at = atLocal("2026-09-25", 2 * 60);
    const o = addBan(
      ops({}),
      { id: "b1", name: "Raúl Ortiz", condition: "Sin actitud violenta o molesta", reason: "Empujó al portero.", since: "2026-09-24", until: null, by: "Kike Martínez" },
      { incidentId: "in1", at, eventId: "e1" },
    );
    expect(o.bans).toHaveLength(1);
    expect(o.incidents).toHaveLength(1);
    expect(o.incidents[0]).toMatchObject({ night: "2026-09-24", kind: "expulsion", by: "Kike Martínez", eventId: "e1" });
    expect(o.incidents[0].description).toContain("sin actitud violenta o molesta");
    expect(bansByCondition(o)).toEqual([{ condition: "Sin actitud violenta o molesta", count: 1 }]);
    const quiet = addBan(ops({}), { ...o.bans[0], id: "b2" }, null);
    expect(quiet.incidents).toHaveLength(0);
  });
});

describe("Noche: historial de quien reserva", () => {
  it("cuenta visitas, gasto medio y plantones de la demo", () => {
    const club = buildDemo("nightclub", NOW);
    const rugby = bookerHistory(club, { name: "Club de Rugby UA" });
    expect(rugby.visits).toBe(3);
    expect(rugby.avgCents).toBe(Math.round((52000 + 45500 + 39000) / 3));
    expect(rugby.askDeposit).toBe(false);
    const marcos = bookerHistory(club, { name: "marcos ruiz", phone: "622407518" });
    expect(marcos.noShows).toBe(1);
    expect(marcos.askDeposit).toBe(true);
    expect(bookerHistory(club, { name: "Nadie" }).visits).toBe(0);
  });

  it("un plantón libera la zona, guarda la señal y queda en el historial", () => {
    const club = buildDemo("nightclub", NOW);
    const zone = club.zones.find((z) => z.status === "booked" && z.bookedBy && z.depositCents > 0);
    expect(zone).toBeTruthy();
    if (!zone) return;
    const at = atLocal("2026-09-25", 2 * 60);
    const next = recordNoShow(club, zone.id, at, "nsx");
    const freed = next.zones.find((z) => z.id === zone.id);
    expect(freed?.status).toBe("free");
    expect(freed?.bookedBy).toBeUndefined();
    const entry = nightOpsOf(next).noShows?.find((n) => n.id === "nsx");
    expect(entry).toMatchObject({ night: "2026-09-24", bookedBy: zone.bookedBy, depositKeptCents: zone.depositCents });
    expect(bookerHistory(next, { name: zone.bookedBy as string }).askDeposit).toBe(true);
    // Sin datos de operación previos también funciona.
    const bare = recordNoShow({ ...club, nightOps: undefined }, zone.id, at, "nsy");
    expect(nightOpsOf(bare).noShows).toHaveLength(1);
    expect(withNightOps(bare, (o) => o).nightOps?.bans).toEqual([]);
  });
});
