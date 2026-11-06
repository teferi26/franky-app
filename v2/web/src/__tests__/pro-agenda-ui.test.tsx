import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import type { ProData, ProVerticalId } from "@/lib/pro/types";
import { localDate } from "@/lib/pro/format";

const mocks = vi.hoisted(() => ({
  usePro: vi.fn(),
  update: vi.fn<(label: string, recipe: (data: ProData) => ProData) => Promise<boolean>>(),
  success: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: (prefix: string) => `${prefix}-test`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success, error: vi.fn() }),
}));
vi.mock("@/components/pro/shell", () => ({
  sectionHref: (spaceId: string, section: string) => `/pro/${spaceId}/${section}`,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
}));

import AgendaHoy from "@/components/pro/sections/agenda/hoy";
import SeguimientoSection from "@/components/pro/sections/agenda/seguimiento";
import CajaSection from "@/components/pro/sections/agenda/caja";
import ServiciosSection from "@/components/pro/sections/agenda/servicios";
import AgendaSection from "@/components/pro/sections/agenda/agenda";
import { BookingDrawer } from "@/components/pro/sections/agenda/booking-drawers";

// Jueves 24 de septiembre de 2026, 18:00 en Madrid: ya toca recordar mañana.
const now = new Date("2026-09-24T16:00:00.000Z");
let data: ProData;

function setup(vertical: ProVerticalId) {
  data = buildDemo(vertical, now);
  mocks.update.mockImplementation(async (_label, recipe) => {
    data = recipe(data);
    return true;
  });
  mocks.usePro.mockImplementation(() => ({
    data,
    now,
    vertical: PRO_VERTICALS[vertical],
    spaceId: `demo-${vertical}`,
    demo: true,
    pending: false,
    update: mocks.update,
    can: () => true,
    loadDate: vi.fn().mockResolvedValue(undefined),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(cleanup);

describe("Franky Pro agenda: pantallas", () => {
  it.each(["hairdresser", "beauty"] as const)("Hoy de %s pinta recordatorios y avisos", (vertical) => {
    setup(vertical);
    render(<AgendaHoy />);
    expect(screen.getByText("Recuerda las citas de mañana")).toBeInTheDocument();
    if (vertical === "hairdresser") expect(screen.getByText("Sin cita")).toBeInTheDocument();
  });

  it("recordar desde Hoy apunta la cita como recordada", async () => {
    setup("hairdresser");
    render(<AgendaHoy />);
    const panel = screen.getByText("Recuerda las citas de mañana").closest("section")!;
    const confirm = within(panel).getAllByRole("button", { name: /ha confirmado/ })[0];
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(mocks.update).toHaveBeenCalledWith("agenda.confirm", expect.any(Function));
    const tomorrow = localDate(new Date(now.getTime() + 86400000));
    expect(
      data.bookings.some(
        (b) => localDate(b.start) === tomorrow && b.agenda?.confirmedAt,
      ),
    ).toBe(true);
  });

  it.each(["hairdresser", "beauty"] as const)("Vuelven de %s enseña a quién le toca", (vertical) => {
    setup(vertical);
    render(<SeguimientoSection />);
    expect(screen.getByRole("tab", { name: /Toca volver/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /En espera/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Cumpleaños/ }));
    fireEvent.click(screen.getByRole("tab", { name: /En riesgo/ }));
  });

  it("Caja del mes trae comisiones y el resumen para la gestoría", () => {
    setup("beauty");
    render(<CajaSection />);
    fireEvent.click(screen.getByRole("tab", { name: "Mes" }));
    expect(screen.getByText("Para tu gestoría")).toBeInTheDocument();
    expect(screen.getByText("Equipo y comisiones")).toBeInTheDocument();
    expect(screen.getAllByText("Alquila sillón").length).toBeGreaterThan(0);
  });

  it("Servicios enseña productos con pedido y las cabinas de estética", () => {
    setup("beauty");
    render(<ServiciosSection />);
    fireEvent.click(screen.getByRole("tab", { name: "Productos" }));
    expect(screen.getByText("Pedido al proveedor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Cabinas" }));
    expect(screen.getAllByText(/Láser|Cabina/).length).toBeGreaterThan(0);
  });

  it("la agenda de estética se ve por cabina", () => {
    setup("beauty");
    render(<AgendaSection />);
    fireEvent.click(screen.getByRole("tab", { name: "Por cabina" }));
    expect(screen.getAllByRole("button", { name: /Nueva cita a las .* en / }).length).toBeGreaterThan(0);
  });

  it("cobrar una cita en marcha usa el cobro completo y enseña la reseña después", async () => {
    setup("hairdresser");
    const target = data.bookings.find((b) => b.status === "in_service" || b.status === "arrived");
    expect(target).toBeDefined();
    const { rerender } = render(<BookingDrawer bookingId={target!.id} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Registrar cobro / }));
    });
    expect(mocks.update).toHaveBeenCalledWith("booking.charge", expect.any(Function));
    rerender(<BookingDrawer bookingId={target!.id} onClose={vi.fn()} />);
    expect(data.bookings.find((b) => b.id === target!.id)?.status).toBe("done");
    expect(screen.getByText("Pide la reseña")).toBeInTheDocument();
  });
});
