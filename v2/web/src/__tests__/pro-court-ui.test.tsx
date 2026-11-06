import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RealCourtBookingDrawer,
  RealNewCourtBookingDrawer,
} from "@/components/pro/sections/courts/real-booking-drawers";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
const mocks = vi.hoisted(() => ({
  pro: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.pro,
  localId: (prefix: string) => `${prefix}-new`,
}));
vi.mock("@/lib/pro/use-agenda-slots", () => ({
  useAgendaSlots: () => ({ minutes: [540], loading: false, error: null }),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success }),
}));
let data: ProData;
const now = new Date("2026-09-24T08:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  data = buildDemo("sports_facility", now);
  data.bookings = [
    {
      ...data.bookings[0],
      id: "booking",
      status: "confirmed",
      start: "2026-09-25T08:00:00Z",
      end: "2026-09-25T09:30:00Z",
      priceCents: 2400,
      paidCents: 0,
    },
  ];
  mocks.pro.mockImplementation(() => ({
    data,
    now,
    spaceId: data.space.id,
    pending: false,
    can: () => true,
    update: mocks.update,
  }));
  mocks.update.mockResolvedValue(false);
});
afterEach(cleanup);
describe("operaciones reales de pistas", () => {
  it("no registra una llegada ni una ausencia para mañana", () => {
    render(<RealCourtBookingDrawer bookingId="booking" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Ha llegado" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "No se presentó" }),
    ).toBeDisabled();
  });
  it("permite registrar un cobro pendiente después de la asistencia, sin simular éxito", async () => {
    data.bookings[0].status = "done";
    render(<RealCourtBookingDrawer bookingId="booking" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" })),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      "court.charge",
      expect.any(Function),
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(
      screen.getByText("Registra el importe que ya has cobrado en tu local."),
    ).toBeVisible();
  });
  it("explica cómo preparar un recurso sin tarifa, no lo anuncia como agotado", () => {
    data.resources = [{ ...data.resources[0], serviceIds: [] }];
    render(
      <RealNewCourtBookingDrawer
        preset={{ date: "2026-09-25" }}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Gestionar servicios" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/espacios/servicios?organization="),
    );
    expect(
      screen.getByRole("button", { name: "Guardar reserva" }),
    ).toBeDisabled();
    expect(screen.queryByText(/No quedan huecos/)).toBeNull();
  });
});
