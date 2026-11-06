import { describe, expect, it } from "vitest";
import { isTrial, isWaitlist, sessionRoster, withRoster } from "@/lib/pro/classes";
import { buildDemo } from "@/lib/pro/demo";
import type { ProBooking } from "@/lib/pro/types";

const now = new Date("2026-09-24T09:30:00.000Z");

function booking(fields: Partial<ProBooking> = {}): ProBooking {
  return {
    id: "booking",
    kind: "class",
    clientName: "Lucía Soler",
    start: "2026-09-24T16:00:00.000Z",
    end: "2026-09-24T17:00:00.000Z",
    partySize: 1,
    status: "confirmed",
    priceCents: 0,
    paidCents: 0,
    source: "franky",
    ...fields,
  };
}

describe("Franky Pro: datos de espera y prueba", () => {
  it("lee las sesiones antiguas y da prioridad a los campos explícitos", () => {
    const waiting = booking({ status: "requested", note: "Lista de espera" });
    const trial = booking({ note: "Clase de prueba" });

    expect(isWaitlist(waiting)).toBe(true);
    expect(isWaitlist({ ...waiting, waitlisted: false })).toBe(false);
    expect(isWaitlist({ ...waiting, status: "confirmed", waitlisted: true })).toBe(false);
    expect(isTrial(trial)).toBe(true);
    expect(isTrial({ ...trial, trial: false })).toBe(false);
    expect(isTrial(booking({ note: "Primera visita" }))).toBe(false);
  });

  it("admite notas libres sin perder la espera ni la clase de prueba", () => {
    expect(isWaitlist(booking({ status: "requested", waitlisted: true, note: "Llamar por la tarde" }))).toBe(true);
    expect(isTrial(booking({ trial: true, note: "Quiere conocer el nivel del grupo" }))).toBe(true);
  });

  it("recuenta el aforo al confirmar una plaza de espera y conserva sus datos", () => {
    const data = buildDemo("sports", now);
    const session = data.sessions[0];
    const waiting = booking({
      sessionId: session.id,
      status: "requested",
      waitlisted: true,
      trial: true,
      note: "Llamar por la tarde",
    });
    const initial = { ...data, bookings: [waiting] };

    expect(sessionRoster(initial, session, now).waitlist).toHaveLength(1);
    const next = withRoster(initial, session.id, now, (list) =>
      list.map((item) => ({ ...item, status: "confirmed", waitlisted: false })),
    );
    const updatedSession = next.sessions.find((item) => item.id === session.id)!;

    expect(updatedSession).toMatchObject({ booked: 1, waitlist: 0, checkedIn: 0 });
    expect(sessionRoster(next, updatedSession, now).waitlist).toHaveLength(0);
    expect(sessionRoster(next, updatedSession, now).booked[0]).toMatchObject({
      trial: true,
      note: "Llamar por la tarde",
    });
  });
});
