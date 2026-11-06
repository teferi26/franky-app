import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NewReservationDrawer,
  RealWaitlistPanel,
  ReservationDrawer,
} from "@/components/pro/sections/tables/table-kit";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import TablesSala from "@/components/pro/sections/tables/sala";
import type { ProData } from "@/lib/pro/types";
import {
  addTableBooking,
  realTableFixture,
  tableDate,
  tableNow,
} from "./fixtures/pro-tables";

const mocks = vi.hoisted(() => ({
  usePro: vi.fn(),
  update:
    vi.fn<
      (
        label: string,
        recipe: (data: ProData) => ProData,
        intent?: unknown,
      ) => Promise<boolean>
    >(),
  success: vi.fn(),
  can: vi.fn<(label: string) => boolean>(),
  loadDate: vi.fn(),
}));
vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: (prefix: string) => `${prefix}-local`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success, info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/components/pro/shell", () => ({
  sectionHref: (id: string, section: string) => `/pro/${id}/${section}`,
}));
let data: ProData;
beforeEach(() => {
  vi.resetAllMocks();
  data = realTableFixture();
  mocks.update.mockResolvedValue(false);
  mocks.can.mockReturnValue(true);
  mocks.usePro.mockImplementation(() => ({
    data,
    now: tableNow,
    vertical: PRO_VERTICALS.restaurant,
    demo: false,
    pending: false,
    update: mocks.update,
    can: mocks.can,
    loadDate: mocks.loadDate,
  }));
});
afterEach(cleanup);

describe("Sala real: acciones confirmadas", () => {
  it.each([false, true])(
    "permite colocar mesas anteriores aunque el plano esté vacío %s",
    async (empty) => {
      if (empty) data.tables = [];
      data.tableOperations!.unmappedResourceIds = ["legacy"];
      data.tableOperations!.unmappedResources = [
        {
          id: "legacy",
          organization_id: data.space.id,
          kind: "table",
          name: "Mesa anterior",
          capacity: 6,
          active: true,
        },
      ];
      render(<TablesSala />);
      fireEvent.click(screen.getByText("Colocar mesas", { exact: true }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByLabelText("Mesa existente")).toHaveValue(
        "legacy",
      );
      expect(
        within(dialog).getByText(
          "Conserva sus reservas y su capacidad de 6 personas.",
        ),
      ).toBeVisible();
      fireEvent.change(within(dialog).getByLabelText("Zona"), {
        target: { value: "Terraza" },
      });
      fireEvent.change(within(dialog).getByLabelText("Columna"), {
        target: { value: "3" },
      });
      fireEvent.change(within(dialog).getByLabelText("Fila"), {
        target: { value: "2" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Redonda" }));
      await act(async () =>
        fireEvent.click(
          within(dialog).getByRole("button", {
            name: "Colocar mesa",
          }),
        ),
      );
      expect(mocks.update).toHaveBeenCalledWith(
        "table.adopt",
        expect.any(Function),
        {
          type: "table.adopt",
          resourceId: "legacy",
          zone: "Terraza",
          x: 3,
          y: 2,
          w: 3,
          h: 2,
          shape: "round",
        },
      );
      expect(mocks.update.mock.calls[0][1](data)).toBe(data);
      expect(screen.getByRole("dialog")).toBeVisible();
      expect(mocks.success).not.toHaveBeenCalled();
      mocks.update.mockResolvedValueOnce(true);
      await act(async () =>
        fireEvent.click(
          within(dialog).getByRole("button", {
            name: "Colocar mesa",
          }),
        ),
      );
      expect(mocks.success).toHaveBeenCalledWith(
        "Mesa colocada",
        "Mesa anterior ya está en Terraza.",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
  it("bloquea posiciones ocupadas y respeta el permiso de editar el plano", () => {
    data.tableOperations!.unmappedResourceIds = ["legacy"];
    data.tableOperations!.unmappedResources = [
      {
        id: "legacy",
        organization_id: data.space.id,
        kind: "table",
        name: "Mesa anterior",
        capacity: 4,
        active: true,
      },
    ];
    render(<TablesSala />);
    fireEvent.click(screen.getByRole("button", { name: "Colocar mesas" }));
    fireEvent.change(screen.getByLabelText("Columna"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Fila"), { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ese sitio ya tiene una mesa",
    );
    expect(
      screen.getByRole("button", { name: "Colocar mesa" }),
    ).toBeDisabled();
    cleanup();
    mocks.can.mockImplementation((label) => label !== "table.adopt");
    render(<TablesSala />);
    expect(
      screen.getByRole("button", { name: "Colocar mesas" }),
    ).toBeDisabled();
  });
  it.each([false, true])(
    "sólo cierra al sentar cuando el servidor confirma %s",
    async (saved) => {
      const booking = addTableBooking(data);
      const close = vi.fn();
      let finish!: (saved: boolean) => void;
      mocks.update.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      render(<ReservationDrawer bookingId={booking.id} onClose={close} />);
      fireEvent.click(screen.getByRole("button", { name: "Sentar" }));
      expect(mocks.update).toHaveBeenCalledWith(
        "table.seat",
        expect.any(Function),
      );
      expect(close).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      await act(async () => {
        finish(saved);
      });
      expect(close).toHaveBeenCalledTimes(saved ? 1 : 0);
      expect(mocks.success).toHaveBeenCalledTimes(saved ? 1 : 0);
    },
  );

  it("salir no altera el precio, el cobro ni las horas de la reserva", async () => {
    const booking = addTableBooking(data);
    booking.status = "arrived";
    const close = vi.fn();
    render(<ReservationDrawer bookingId={booking.id} onClose={close} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Se fue" }));
    });
    const recipe = mocks.update.mock.calls[0][1];
    expect(recipe(data).bookings[0]).toMatchObject({
      status: "done",
      paidCents: null,
      priceCents: 4800,
      start: booking.start,
      end: booking.end,
    });
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByText("Cambiar de mesa")).not.toBeInTheDocument();
  });

  it("crea la espera separada con precio del servicio y conserva el formulario ante fallo", async () => {
    const close = vi.fn();
    render(
      <NewReservationDrawer
        preset={{ date: tableDate, waitlist: true }}
        onClose={close}
      />,
    );
    const dialog = screen.getByRole("dialog", {
      name: "Apuntar en lista de espera",
    });
    fireEvent.change(within(dialog).getByLabelText("Nombre"), {
      target: { value: "Diego de prueba" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Apuntar" }),
    ).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Servicio"), {
      target: { value: "service-a" },
    });
    expect(within(dialog).getByText(/48\s*€/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Apuntar" }));
    });
    expect(mocks.update.mock.calls[0][0]).toBe("table.waitlist");
    const result = mocks.update.mock.calls[0][1](data);
    expect(result.bookings).toHaveLength(0);
    expect(result.tableOperations?.waitlist[0]).toMatchObject({
      serviceId: "service-a",
      partySize: 2,
      customerName: "Diego de prueba",
      expectedTotalCents: 4800,
      serviceVersion: 3,
    });
    expect(close).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Nombre")).toHaveValue(
      "Diego de prueba",
    );
  });

  it("sienta la espera con intención explícita sin fabricar ni confirmar una reserva local", async () => {
    data.tableOperations!.waitlist = [
      {
        id: "waitlist-a",
        customerId: "customer-a",
        customerName: "Diego",
        serviceId: "service-a",
        partySize: 2,
        requestedAt: tableNow.toISOString(),
        expiresAt: new Date(tableNow.getTime() + 60 * 60_000).toISOString(),
        status: "waiting",
        bookingId: null,
        serviceVersion: 3,
        expectedTotalCents: null,
      },
    ];
    render(<RealWaitlistPanel onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Diego/ }));
    const dialog = screen.getByRole("dialog", { name: "Diego" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Sentar" }));
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "table.waitlist.seat",
      expect.any(Function),
      {
        type: "table.waitlist.seat",
        waitlistId: "waitlist-a",
        tableId: "table-a",
      },
    );
    expect(mocks.update.mock.calls[0][1](data)).toBe(data);
    expect(dialog).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("deshabilita operaciones sin permiso y no ofrece cambios de mesa reales", () => {
    const booking = addTableBooking(data);
    mocks.can.mockReturnValue(false);
    render(<ReservationDrawer bookingId={booking.id} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sentar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No vino" })).toBeDisabled();
    expect(screen.queryByText("Cambiar de mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Gasto previsto")).not.toBeInTheDocument();
  });

  it("permite volver a sentar dentro del mismo minuto de confirmar la limpieza", () => {
    const booking = addTableBooking(data);
    booking.status = "done";
    data.calendar!.bookings[0].status = "attended";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: booking.start,
      leftAt: new Date(tableNow.getTime() + 20_000).toISOString(),
      cleanedAt: new Date(tableNow.getTime() + 30_000).toISOString(),
      cleaningMinutes: 15,
    };
    data.tableOperations!.waitlist = [
      {
        id: "waitlist-after-cleaning",
        customerId: "customer-b",
        customerName: "Siguiente grupo",
        serviceId: "service-a",
        partySize: 2,
        requestedAt: tableNow.toISOString(),
        expiresAt: new Date(tableNow.getTime() + 60 * 60_000).toISOString(),
        status: "waiting",
        bookingId: null,
        serviceVersion: 3,
        expectedTotalCents: 4800,
      },
    ];
    mocks.usePro.mockReturnValue({
      ...mocks.usePro(),
      now: new Date(tableNow.getTime() + 45_500),
    });
    render(<RealWaitlistPanel onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Siguiente grupo/ }));
    const dialog = screen.getByRole("dialog", { name: "Siguiente grupo" });
    expect(within(dialog).getByLabelText("Mesa libre")).toHaveValue("table-a");
    expect(
      within(dialog).getByRole("button", { name: "Sentar" }),
    ).toBeEnabled();
  });
});
