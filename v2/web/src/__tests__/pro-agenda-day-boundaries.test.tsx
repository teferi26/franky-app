import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingDaySpan, bookingsOn } from "@/lib/pro/agenda";
import { buildDemo } from "@/lib/pro/demo";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import AgendaSection from "@/components/pro/sections/agenda/agenda";

const mocks = vi.hoisted(() => ({ usePro: vi.fn() }));
vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: () => "local-id",
}));
vi.mock("@/components/pro/sections/agenda/booking-drawers", () => ({
  BookingDrawer: () => null,
  NewBookingDrawer: () => null,
  isFromFranky: () => false,
}));
vi.mock("@/components/pro/sections/common/offer-composer", () => ({
  OfferComposer: () => null,
}));
afterEach(cleanup);

const now = new Date("2026-09-25T08:00:00Z");
function overnight() {
  const data = buildDemo("hairdresser", now);
  data.bookings = [
    {
      ...data.bookings[0],
      id: "overnight",
      clientName: "Cita de medianoche",
      start: "2026-09-24T21:30:00Z",
      end: "2026-09-24T22:30:00Z",
      status: "confirmed",
      staffId: data.staff[0].id,
    },
  ];
  return data;
}

describe("agenda al cambiar de día u horario", () => {
  it("muestra ambas partes de una cita y excluye el instante final", () => {
    const data = overnight();
    expect(bookingDaySpan(data.bookings[0], "2026-09-24")).toEqual({
      from: 1410,
      to: 1440,
    });
    expect(bookingDaySpan(data.bookings[0], "2026-09-25")).toEqual({
      from: 0,
      to: 30,
    });
    expect(bookingsOn(data, "2026-09-25")).toHaveLength(1);
    data.bookings[0].end = "2026-09-24T22:00:00Z";
    expect(bookingsOn(data, "2026-09-25")).toHaveLength(0);
  });

  it("conserva una cita durante la hora repetida de octubre", () => {
    const booking = overnight().bookings[0];
    booking.start = "2026-10-25T00:45:00Z";
    booking.end = "2026-10-25T01:15:00Z";
    expect(bookingDaySpan(booking, "2026-10-25")).toEqual({
      from: 165,
      to: 195,
    });
  });

  it("un cierre posterior no oculta las citas existentes ni permite reservar", () => {
    const data = overnight();
    data.space.hours = data.space.hours.map(() => null);
    mocks.usePro.mockReturnValue({
      data,
      now,
      vertical: PRO_VERTICALS.hairdresser,
      demo: false,
      pending: false,
      can: () => false,
      loadDate: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    render(<AgendaSection />);
    expect(
      screen.getByRole("button", { name: /Cita de medianoche/ }),
    ).toBeInTheDocument();
    const slots = screen.getAllByRole("button", { name: /Nueva cita a las/ });
    expect(slots.every((slot) => slot.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Semana" }));
    expect(
      screen.getAllByRole("button", { name: /Cita/ }).length,
    ).toBeGreaterThan(0);
  });
});
