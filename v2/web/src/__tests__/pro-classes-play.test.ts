import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate } from "@/lib/pro/format";
import { extrasOf } from "@/lib/pro/classes-care";
import {
  addChallengeBonus,
  addRecord,
  challengeShareText,
  challengeStandings,
  cheerRecord,
  createChallenge,
  currentChallenge,
  findVoucher,
  formatRecord,
  isPersonalBest,
  memberBests,
  overallPassRate,
  parseRecordValue,
  passRates,
  playerCollection,
  rankingByUniversity,
  recordsToCheer,
  redeemVoucher,
  roomRanking,
  saveRoomResult,
  sellVoucher,
  setExamResult,
  voucherCode,
  voucherStatus,
  vouchersExpiring,
} from "@/lib/pro/classes-play";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

describe("reto entre carreras", () => {
  it("la demo del box trae un reto en marcha con clasificación", () => {
    const data = buildDemo("sports", now);
    const ch = currentChallenge(data, now)!;
    expect(ch).toBeDefined();
    const rows = challengeStandings(data, ch, now);
    expect(rows.length).toBeGreaterThan(2);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1].visits).toBeGreaterThanOrEqual(rows[i].visits);
    expect(rows.reduce((a, r) => a + r.visits, 0)).toBeGreaterThan(0);
  });

  it("las asistencias apuntadas a mano suman y el texto se puede compartir", () => {
    let data = buildDemo("sports", now);
    data = createChallenge(
      data,
      { title: "Reto de octubre", startsOn: today, endsOn: addDays(today, 30), prize: "Camisetas" },
      "rt9",
    );
    const ch = () => extrasOf(data).challenges!.find((c) => c.id === "rt9")!;
    data = addChallengeBonus(data, "rt9", "Derecho", 5);
    const rows = challengeStandings(data, ch(), now);
    expect(rows.find((r) => r.team === "Derecho")!.visits).toBeGreaterThanOrEqual(5);
    const text = challengeShareText(ch(), rows, "Box Levante", 30);
    expect(text).toContain("Reto de octubre en Box Levante");
    expect(text).toContain("Quedan 30 días");
  });
});

describe("marcas personales", () => {
  it("formatea y entiende tiempos, kilos y repeticiones", () => {
    expect(formatRecord(245, "s")).toBe("4:05");
    expect(formatRecord(102.5, "kg")).toBe("102,5 kg");
    expect(formatRecord(21, "reps")).toBe("21 reps");
    expect(parseRecordValue("3:25", "s")).toBe(205);
    expect(parseRecordValue("102,5", "kg")).toBe(102.5);
    expect(parseRecordValue("3:75", "s")).toBeNull();
    expect(parseRecordValue("", "kg")).toBeNull();
  });

  it("detecta la mejor marca: más kilos o menos tiempo", () => {
    const base = buildDemo("sports", now);
    const member = base.members.find((m) => m.status === "active")!;
    let data = addRecord(base, {
      id: "a",
      memberId: member.id,
      lift: "Test lift",
      unit: "kg",
      value: 100,
      on: addDays(today, -10),
    });
    data = addRecord(data, {
      id: "b",
      memberId: member.id,
      lift: "Test lift",
      unit: "kg",
      value: 105,
      on: today,
    });
    data = addRecord(data, {
      id: "c",
      memberId: member.id,
      lift: "Test run",
      unit: "s",
      value: 300,
      on: addDays(today, -5),
    });
    data = addRecord(data, {
      id: "d",
      memberId: member.id,
      lift: "Test run",
      unit: "s",
      value: 310,
      on: today,
    });
    const recs = extrasOf(data).records!;
    expect(isPersonalBest(data, recs.find((r) => r.id === "b")!)).toBe(true);
    expect(isPersonalBest(data, recs.find((r) => r.id === "d")!)).toBe(false);
    const bests = memberBests(data, member.id);
    expect(bests.find((b) => b.lift === "Test lift")!.best.value).toBe(105);
    expect(bests.find((b) => b.lift === "Test lift")!.previous!.value).toBe(100);
    expect(bests.find((b) => b.lift === "Test run")!.best.value).toBe(300);
  });

  it("las marcas nuevas salen para felicitar hasta que el coach lo hace", () => {
    let data = buildDemo("sports", now);
    const list = recordsToCheer(data, now);
    expect(list.length).toBeGreaterThan(0);
    data = cheerRecord(data, list[0].record.id, now);
    expect(recordsToCheer(data, now).some((x) => x.record.id === list[0].record.id)).toBe(false);
  });
});

describe("ranking de salas y colección", () => {
  it("ordena por escapar, tiempo y pistas", () => {
    const data = buildDemo("culture", now);
    const all = roomRanking(data, "all", "all", now);
    expect(all.length).toBeGreaterThan(5);
    for (let i = 1; i < all.length; i++)
      expect(all[i - 1].seconds!).toBeLessThanOrEqual(all[i].seconds!);
    expect(all.every((r) => r.escaped)).toBe(true);
    expect(rankingByUniversity(data, "university").length).toBeGreaterThan(0);
  });

  it("guardar el resultado de una reserva lo sustituye, no lo duplica", () => {
    const base = buildDemo("culture", now);
    const room = base.classTypes[0];
    let data = saveRoomResult(base, {
      id: "x1",
      bookingId: "bk",
      classTypeId: room.id,
      team: "Equipo",
      players: 4,
      escaped: true,
      seconds: 2400,
      hints: 1,
      on: today,
    });
    data = saveRoomResult(data, {
      id: "x2",
      bookingId: "bk",
      classTypeId: room.id,
      team: "Equipo",
      players: 4,
      escaped: true,
      seconds: 2300,
      hints: 1,
      on: today,
    });
    expect(extrasOf(data).roomResults!.filter((r) => r.bookingId === "bk")).toHaveLength(1);
    expect(
      roomRanking(data, room.id, "month", now).find((r) => r.bookingId === "bk")!.seconds,
    ).toBe(2300);
  });

  it("sabe qué salas le quedan a un grupo", () => {
    const data = buildDemo("culture", now);
    const played = data.bookings.find((b) => b.clientId && b.status === "arrived");
    if (!played) return;
    const client = data.clients.find((c) => c.id === played.clientId)!;
    const collection = playerCollection(data, client, now);
    expect(collection.played.length + collection.next.length).toBeGreaterThan(0);
  });
});

describe("bonos regalo", () => {
  it("código corto con el prefijo del negocio", () => {
    expect(voucherCode("laberinto-escape", 7)).toBe("LAB-0007");
  });

  it("vender deja el bono y el cobro en la caja; canjear lo cierra", () => {
    const base = buildDemo("culture", now);
    const { data, voucher } = sellVoucher(
      base,
      {
        concept: "Sala para 4",
        amountCents: 7000,
        buyer: "Ana",
        recipient: "Luis",
        expiresOn: addDays(today, 180),
        method: "bizum",
      },
      now,
      "vcx",
    );
    expect(voucher.code).toBe(voucherCode(base.space.slug, (extrasOf(base).voucherSeq ?? 0) + 1));
    expect(data.payments.length).toBe(base.payments.length + 1);
    expect(findVoucher(data, voucher.code.toLowerCase())?.id).toBe("vcx");

    const redeemed = redeemVoucher(data, voucher.code, now);
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) return;
    expect(voucherStatus(redeemed.voucher, today)).toBe("redeemed");
    const twice = redeemVoucher(redeemed.data, voucher.code, now);
    expect(twice).toEqual({ ok: false, reason: "redeemed" });
    expect(redeemVoucher(data, "NOEXISTE", now)).toEqual({ ok: false, reason: "unknown" });
  });

  it("sin cobro en caja si se paga por transferencia", () => {
    const base = buildDemo("culture", now);
    const { data } = sellVoucher(
      base,
      {
        concept: "Taller",
        amountCents: 3500,
        buyer: "Ana",
        recipient: "",
        expiresOn: addDays(today, 90),
        method: "transfer",
      },
      now,
      "vcy",
    );
    expect(data.payments.length).toBe(base.payments.length);
  });

  it("avisa de los que caducan pronto", () => {
    const data = buildDemo("culture", now);
    const soon = vouchersExpiring(data, now, 30);
    expect(soon.length).toBeGreaterThan(0);
    expect(soon.every((v) => v.expiresOn <= addDays(today, 30))).toBe(true);
  });
});

describe("tasa de aprobados", () => {
  it("se calcula sobre presentados, por grupo y en total", () => {
    const data = buildDemo("academy", now);
    const rates = passRates(data);
    expect(rates.length).toBeGreaterThan(0);
    const overall = overallPassRate(data);
    expect(overall.rate).not.toBeNull();
    expect(overall.rate!).toBeGreaterThan(40);
    const member = data.members[0];
    const ct = data.classTypes[4];
    const next = setExamResult(data, {
      memberId: member.id,
      classTypeId: ct.id,
      result: "passed",
      grade: 8.5,
      on: today,
    });
    const row = passRates(next).find((r) => r.classType.id === ct.id)!;
    expect(row.passed).toBe(1);
    expect(row.rate).toBe(100);
    expect(row.averageGrade).toBe(8.5);
    // Volver a apuntarlo lo cambia, no lo duplica.
    const again = setExamResult(next, {
      memberId: member.id,
      classTypeId: ct.id,
      result: "failed",
      on: today,
    });
    expect(passRates(again).find((r) => r.classType.id === ct.id)!.passed).toBe(0);
  });
});
