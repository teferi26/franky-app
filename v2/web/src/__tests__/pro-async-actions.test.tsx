import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServiciosSection from "@/components/pro/sections/agenda/servicios";
import { BookingDrawer } from "@/components/pro/sections/agenda/booking-drawers";
import ClientesSection from "@/components/pro/sections/common/clientes";
import { buildDemo } from "@/lib/pro/demo";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import type { ProData } from "@/lib/pro/types";

const mocks = vi.hoisted(() => ({
  usePro: vi.fn(),
  update:
    vi.fn<
      (label: string, recipe: (data: ProData) => ProData) => Promise<boolean>
    >(),
  success: vi.fn(),
  can: vi.fn<(command: string) => boolean>(),
}));

vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: (prefix: string) => `${prefix}-test`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success }),
}));
vi.mock("@/components/pro/shell", () => ({
  sectionHref: (spaceId: string, section: string) =>
    `/pro/${spaceId}/${section}`,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const now = new Date("2026-09-24T09:30:00.000Z");
let data: ProData;

beforeEach(() => {
  vi.resetAllMocks();
  data = buildDemo("hairdresser", now);
  data.services = [data.services[0]];
  data.clients = [data.clients[0]];
  data.bookings = [
    { ...data.bookings[0], id: "booking-test", status: "confirmed" },
  ];
  mocks.update.mockResolvedValue(false);
  mocks.can.mockReturnValue(true);
  mocks.usePro.mockReturnValue({
    data,
    now,
    vertical: PRO_VERTICALS.hairdresser,
    spaceId: "space-test",
    demo: false,
    pending: false,
    update: mocks.update,
    can: mocks.can,
  });
});

afterEach(cleanup);

function openNewService() {
  render(<ServiciosSection />);
  fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo servicio" });
  fireEvent.change(within(dialog).getByLabelText("Nombre"), {
    target: { value: "Corte de prueba" },
  });
  fireEvent.change(within(dialog).getByLabelText("Precio (€)"), {
    target: { value: "20" },
  });
  return dialog;
}

describe("Franky Pro: resultado del guardado", () => {
  it.each([false, true])(
    "espera el resultado %s antes de cerrar un servicio o confirmar su guardado",
    async (saved) => {
      let finish!: (value: boolean) => void;
      mocks.update.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const dialog = openNewService();

      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
      expect(mocks.update).toHaveBeenCalledWith(
        "service.create",
        expect.any(Function),
      );
      expect(dialog).toBeInTheDocument();
      expect(mocks.success).not.toHaveBeenCalled();

      await act(async () => {
        finish(saved);
      });

      if (saved) {
        expect(
          screen.queryByRole("dialog", { name: "Nuevo servicio" }),
        ).not.toBeInTheDocument();
        expect(mocks.success).toHaveBeenCalledWith(
          "Servicio añadido",
          "Corte de prueba",
        );
      } else {
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Nombre")).toHaveValue(
          "Corte de prueba",
        );
        expect(mocks.success).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["pending", "forbidden"] as const)(
    "impide guardar un servicio cuando está %s",
    (reason) => {
      if (reason === "pending") {
        mocks.usePro.mockReturnValue({ ...mocks.usePro(), pending: true });
      } else {
        mocks.can.mockReturnValue(false);
      }
      const dialog = openNewService();
      const save = within(dialog).getByRole("button", { name: "Guardar" });

      expect(save).toBeDisabled();
      fireEvent.click(save);
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("mantiene la cita abierta si falla su cancelación", async () => {
    const onClose = vi.fn();
    render(<BookingDrawer bookingId="booking-test" onClose={onClose} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancelar cita" }));
    });

    expect(mocks.update).toHaveBeenCalledWith(
      "booking.cancelled",
      expect.any(Function),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("registra solo el saldo que quedaba por cobrar tras una señal", async () => {
    data.bookings[0] = {
      ...data.bookings[0],
      status: "arrived",
      priceCents: 2000,
      paidCents: 500,
    };
    mocks.update.mockResolvedValue(true);
    render(<BookingDrawer bookingId="booking-test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /^Registrar cobro / }),
      );
    });

    expect(mocks.update).toHaveBeenCalledWith(
      "booking.charge",
      expect.any(Function),
    );
    const changed = mocks.update.mock.calls[0][1](data);
    expect(changed.payments.at(-1)).toMatchObject({
      bookingId: "booking-test",
      amountCents: 1500,
    });
    expect(mocks.success).toHaveBeenCalledWith(
      "Cobro registrado",
      expect.stringContaining("ya cobrados con tarjeta"),
    );
  });

  it("oculta gasto y ticket medio cuando no se puede consultar información económica", () => {
    mocks.can.mockImplementation((command) => command !== "finance.read");
    render(<ClientesSection />);
    expect(
      screen.queryByText("Gasto", { exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(data.clients[0].name, { exact: true }));
    const dialog = screen.getByRole("dialog", { name: data.clients[0].name });

    expect(
      within(dialog).queryByText("Gasto", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Ticket medio", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("conserva los datos del nuevo cliente si falla su creación", async () => {
    render(<ClientesSection />);
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    const dialog = screen.getByRole("dialog", { name: "Añadir cliente" });
    fireEvent.change(within(dialog).getByLabelText("Nombre y apellido"), {
      target: { value: "Ana Prueba" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Añadir" }));
    });

    expect(mocks.update).toHaveBeenCalledWith(
      "client.create",
      expect.any(Function),
    );
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Nombre y apellido")).toHaveValue(
      "Ana Prueba",
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("permite abrir clientes después de los primeros ochenta", () => {
    const base = data.clients[0];
    data.clients = Array.from({ length: 81 }, (_, index) => ({
      ...base,
      id: `client-${index}`,
      name: `Cliente ${index}`,
    }));
    render(<ClientesSection />);
    expect(
      screen.queryByText("Cliente 80", { exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver más clientes", { exact: true }));
    fireEvent.click(screen.getByText("Cliente 80", { exact: true }));
    expect(
      screen.getByRole("dialog", { name: "Cliente 80" }),
    ).toBeInTheDocument();
  });
});
