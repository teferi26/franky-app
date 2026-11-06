import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate } from "@/lib/pro/format";
import { extrasOf } from "@/lib/pro/classes-care";
import { patchSessionExtra, roomBookingOf } from "@/lib/pro/classes-ops";
import {
  birthdayMessage,
  birthdaysComing,
  companyComplete,
  erasmusSuggestion,
  inErasmusWindow,
  invoiceTotals,
  issueInvoice,
  knownRooms,
  setStaffSkills,
  staffGaps,
  markBirthdayGreeted,
  materialNeeds,
  setBirthday,
  setCompany,
  setMaterialStock,
  setSeatMaterial,
  toggleBookingExtra,
  validTaxId,
} from "@/lib/pro/classes-leisure";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

describe("cumpleaños", () => {
  it("la demo trae cumpleaños del año pasado por felicitar, los más cercanos primero", () => {
    const data = buildDemo("culture", now);
    const coming = birthdaysComing(data, now);
    expect(coming.length).toBe(2);
    expect(coming[0].daysLeft).toBeLessThanOrEqual(coming[1].daysLeft);
    expect(coming[0].anniversary).toBe(addDays(today, 6));
    const text = birthdayMessage(coming[0], "Sara", "Laberinto Escape");
    expect(text).toContain("tu cumpleaños");
    expect(text).not.toMatch(/[\u2014\u2013]/);
    const other = birthdayMessage(coming[1], "Sara", "Laberinto Escape");
    expect(other).toContain(`el cumpleaños de ${coming[1].honoree}`);
  });

  it("una vez felicitado no vuelve a salir este año", () => {
    const data = buildDemo("culture", now);
    const first = birthdaysComing(data, now)[0];
    const greeted = markBirthdayGreeted(data, first.bookingId, now);
    expect(birthdaysComing(greeted, now).some((b) => b.bookingId === first.bookingId)).toBe(false);
  });

  it("el cumpleaños de este año no se felicita hasta el siguiente", () => {
    const data = buildDemo("culture", now);
    const booking = data.bookings.find((b) => b.sessionId)!;
    const session = data.sessions.find((s) => s.id === booking.sessionId)!;
    const withParty = setBirthday(data, booking, session, "Irene");
    const info = roomBookingOf(withParty, booking.id);
    expect(info.partyOn).toBe(localDate(session.start));
    expect(info.contactName).toBe(booking.clientName);
    expect(birthdaysComing(withParty, now).some((b) => b.bookingId === booking.id)).toBe(false);
    const cleared = setBirthday(withParty, booking, session, "  ");
    expect(roomBookingOf(cleared, booking.id).birthdayOf).toBeUndefined();
  });

  it("marca y desmarca extras del pack", () => {
    const data = buildDemo("culture", now);
    const id = data.bookings[0].id;
    const on = toggleBookingExtra(data, id, "Tarta propia");
    expect(roomBookingOf(on, id).extras).toContain("Tarta propia");
    const off = toggleBookingExtra(on, id, "Tarta propia");
    expect(roomBookingOf(off, id).extras).toBeUndefined();
  });
});

describe("material por plaza", () => {
  it("la demo avisa de que falta barro para tres plazas", () => {
    const data = buildDemo("culture", now);
    const needs = materialNeeds(data, now);
    const clay = needs.find((n) => n.classType.id === "ct3")!;
    expect(clay.material.item).toBe("barro");
    if (clay.seats >= 3) expect(clay.shortSeats).toBe(3);
    const restocked = setMaterialStock(data, "ct3", clay.need + 5);
    expect(materialNeeds(restocked, now).find((n) => n.classType.id === "ct3")!.shortSeats).toBe(0);
  });

  it("no guarda un material sin nombre o sin gasto por plaza", () => {
    const data = buildDemo("culture", now);
    const bad = setSeatMaterial(data, "ct1", { item: "", perSeat: 1, unit: "ud", stock: 3 });
    expect(bad).toBe(data);
    const none = setSeatMaterial(data, "ct3", undefined);
    expect(extrasOf(none).types.ct3?.seatMaterial).toBeUndefined();
  });
});

describe("factura para empresas", () => {
  it("valida NIF, NIE y CIF por su forma", () => {
    expect(validTaxId("B54872136")).toBe(true);
    expect(validTaxId("12345678z")).toBe(true);
    expect(validTaxId("X1234567L")).toBe(true);
    expect(validTaxId("1234")).toBe(false);
  });

  it("emite número correlativo una sola vez por reserva", () => {
    const data = buildDemo("culture", now);
    const [a, b] = data.bookings;
    const company = { name: "Empresa S.L.", taxId: "b-54872136", address: "Calle Mayor 1, Alicante" };
    let next = setCompany(data, a.id, company);
    expect(roomBookingOf(next, a.id).company?.taxId).toBe("B54872136");
    expect(companyComplete(roomBookingOf(next, a.id).company)).toBe(true);
    const seq = extrasOf(next).invoiceSeq ?? 0;
    next = issueInvoice(next, a.id, now);
    const no = roomBookingOf(next, a.id).invoiceNo;
    expect(no).toBe(`F2026-${String(seq + 1).padStart(4, "0")}`);
    expect(issueInvoice(next, a.id, now)).toBe(next);
    // Sin datos de empresa no hay factura.
    expect(issueInvoice(next, b.id, now)).toBe(next);
  });

  it("desglosa base e IVA incluido", () => {
    const t = invoiceTotals(12100);
    expect(t.baseCents).toBe(10000);
    expect(t.vatCents).toBe(2100);
  });
});

describe("Erasmus", () => {
  it("solo en septiembre y octubre o en febrero", () => {
    expect(inErasmusWindow(now)).toBe(true);
    expect(inErasmusWindow(new Date("2026-11-20T10:00:00Z"))).toBe(false);
    expect(inErasmusWindow(new Date("2027-02-10T10:00:00Z"))).toBe(true);
  });

  it("propone las sesiones en inglés con sitio", () => {
    const data = buildDemo("culture", now);
    const suggestion = erasmusSuggestion(data, now);
    expect(suggestion?.sessions.length).toBeGreaterThan(0);
    const en = suggestion!.sessions.every(
      (x) => extrasOf(data).sessions[x.session.id]?.language === "en",
    );
    expect(en).toBe(true);
    // Sin sesiones en inglés, nada que proponer.
    const spanishOnly = suggestion!.sessions.reduce(
      (d, x) => patchSessionExtra(d, x.session.id, { language: "es" }),
      data,
    );
    expect(erasmusSuggestion(spanishOnly, now)).toBeNull();
    expect(erasmusSuggestion(data, new Date("2026-11-20T10:00:00Z"))).toBeNull();
  });
});

describe("game masters", () => {
  it("lista las salas del horario y avisa si alguien no puede llevar su partida", () => {
    const data = buildDemo("culture", now);
    const rooms = knownRooms(data);
    expect(rooms).toContain("Sala 1");
    const base = staffGaps(data, now).length;
    // Si el game master de la Sala 1 deja de llevarla, sus partidas salen como aviso.
    const session = data.sessions.find(
      (s) => s.room === "Sala 1" && new Date(s.start).getTime() > now.getTime(),
    )!;
    const narrowed = setStaffSkills(data, session.coachId, { languages: ["es", "en"], rooms: ["Taller"] });
    const gaps = staffGaps(narrowed, now);
    expect(gaps.length).toBeGreaterThan(base);
    expect(gaps.some((g) => g.why === "No conoce Sala 1")).toBe(true);
  });
});
