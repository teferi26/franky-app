import { describe, expect, it } from "vitest";
import {
  TICKET_HOLD_MS,
  holdDeadlineLabel,
  holdHasExpired,
  holdIsLive,
} from "@/lib/ticket-hold";

/**
 * Este archivo existe por un fallo real: entrar en la pasarela de pago reservaba
 * la plaza y esa plaza no se soltaba nunca, así que un evento con aforo se podía
 * llenar de reservas que nadie pagó. La causa de fondo era que dos sitios del
 * código tenían criterios distintos sobre qué reserva sigue "viva". Aquí se fija
 * uno solo.
 */

const AHORA = new Date("2026-08-13T20:00:00.000Z").getTime();

describe("holdIsLive", () => {
  it("una reserva con caducidad futura guarda la plaza", () => {
    expect(holdIsLive("2026-08-13T20:10:00.000Z", AHORA)).toBe(true);
  });

  it("una reserva caducada NO guarda la plaza", () => {
    expect(holdIsLive("2026-08-13T19:59:59.000Z", AHORA)).toBe(false);
  });

  it("justo en el instante de caducar, la plaza ya está libre", () => {
    expect(holdIsLive("2026-08-13T20:00:00.000Z", AHORA)).toBe(false);
  });

  it("sin fecha se considera viva: no le quitamos la plaza a nadie por sorpresa", () => {
    // Filas anteriores a la 165 (o la columna todavía sin aplicar en la BD).
    expect(holdIsLive(null, AHORA)).toBe(true);
    expect(holdIsLive(undefined, AHORA)).toBe(true);
    expect(holdIsLive("", AHORA)).toBe(true);
  });

  it("una fecha ilegible no se interpreta como caducada", () => {
    expect(holdIsLive("no-es-una-fecha", AHORA)).toBe(true);
  });

  it("acepta Date además de texto ISO", () => {
    expect(holdIsLive(new Date(AHORA + 60_000), AHORA)).toBe(true);
    expect(holdIsLive(new Date(AHORA - 60_000), AHORA)).toBe(false);
  });
});

describe("holdHasExpired", () => {
  it("solo es cierto cuando hay fecha Y ya pasó", () => {
    expect(holdHasExpired("2026-08-13T19:00:00.000Z", AHORA)).toBe(true);
    expect(holdHasExpired("2026-08-13T21:00:00.000Z", AHORA)).toBe(false);
    // Sin fecha no se puede afirmar que haya caducado.
    expect(holdHasExpired(null, AHORA)).toBe(false);
  });
});

describe("TICKET_HOLD_MS", () => {
  it("dura más que la sesión de Stripe (30 min es su mínimo)", () => {
    // Si la reserva caducara antes que la sesión, otra persona podría comprar la
    // última entrada y luego llegar el pago del primero: dos pagos, una plaza.
    expect(TICKET_HOLD_MS).toBeGreaterThan(30 * 60 * 1000);
  });
});

describe("holdDeadlineLabel", () => {
  it("da una hora legible para decirle al comprador cuánto le queda", () => {
    expect(holdDeadlineLabel(new Date("2026-08-13T18:45:00.000Z"))).toMatch(/\d{2}:\d{2}/);
  });
});
