import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RealNewSessionDrawer,
  RealSessionDrawer,
} from "@/components/pro/sections/classes/real-parts";
import { RealBundles } from "@/components/pro/sections/classes/real-bundles";
import { SetupChecklist } from "@/components/pro/sections/common/checklist";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import { deriveRoster } from "@/lib/pro/classes";
import { atLocal } from "@/lib/pro/format";
import type { ProData } from "@/lib/pro/types";
import { realTableFixture, tableDate, tableNow } from "./fixtures/pro-tables";

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
  canView: vi.fn<(section: string) => boolean>(),
}));
vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: (prefix: string) => `${prefix}-local`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success }),
}));

let data: ProData;
beforeEach(() => {
  vi.resetAllMocks();
  data = realTableFixture();
  data.space.vertical = "sports";
  data.calendar!.services[0] = {
    ...data.calendar!.services[0],
    name: "Pilates",
    mode: "session",
    capacity: 12,
  };
  data.sessions = [
    {
      id: "session-1",
      classTypeId: "service-a",
      start: atLocal(tableDate, 13 * 60),
      end: atLocal(tableDate, 14 * 60),
      capacity: 12,
      booked: 1,
      waitlist: 0,
      checkedIn: 0,
      room: "",
      coachId: "",
      resourceIds: [],
      status: "open",
    },
  ];
  data.classOperations = { rosterVisible: true, bundles: [], resources: [] };
  data.bookings = [
    {
      id: "booking-1",
      kind: "class",
      clientName: "Persona real",
      sessionId: "session-1",
      serviceId: "service-a",
      start: data.sessions[0].start,
      end: data.sessions[0].end,
      partySize: 1,
      status: "confirmed",
      priceCents: 2400,
      paidCents: null,
      source: "unknown",
    },
  ];
  mocks.update.mockResolvedValue(false);
  mocks.can.mockReturnValue(true);
  mocks.canView.mockReturnValue(true);
  mocks.usePro.mockImplementation(() => ({
    data,
    now: tableNow,
    vertical: PRO_VERTICALS.sports,
    pending: false,
    can: mocks.can,
    canView: mocks.canView,
    update: mocks.update,
    demo: false,
  }));
});
afterEach(cleanup);

describe("Clases reales: confirmación y permisos", () => {
  it.each([false, true])(
    "muestra asistencia registrada sólo tras confirmación %s",
    async (saved) => {
      let finish!: (value: boolean) => void;
      mocks.update.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      render(<RealSessionDrawer sessionId="session-1" onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Asistió" }));
      expect(mocks.update).toHaveBeenCalledWith(
        "class.checkin",
        expect.any(Function),
      );
      expect(mocks.success).not.toHaveBeenCalled();
      const next = mocks.update.mock.calls[0][1](data).bookings[0];
      expect(next).toMatchObject({
        status: "done",
        paidCents: null,
        priceCents: 2400,
      });
      await act(async () => {
        finish(saved);
      });
      expect(mocks.success).toHaveBeenCalledTimes(saved ? 1 : 0);
    },
  );

  it("bloquea cancelar sesiones con reservas y no ofrece promoción o asistencia masiva", () => {
    render(<RealSessionDrawer sessionId="session-1" onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Cancelar sesión" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Marcar a todos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dar plaza" }),
    ).not.toBeInTheDocument();
  });

  it("no admite inscripciones nuevas cuando la sesión ya ha empezado", () => {
    render(<RealSessionDrawer sessionId="session-1" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Apuntar" })).toBeDisabled();
  });

  it("el checklist real sólo muestra pasos ejecutables y accesibles", () => {
    data.sessions = [];
    const { rerender } = render(<SetupChecklist always />);
    expect(screen.getByText("Programa una clase")).toBeInTheDocument();
    expect(
      screen.queryByText("Define tus cuotas y bonos"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Invita a tus monitores"),
    ).not.toBeInTheDocument();
    mocks.canView.mockReturnValue(false);
    rerender(<SetupChecklist always />);
    expect(screen.queryByText("Puesta en marcha")).not.toBeInTheDocument();
  });

  it("guarda el precio real y mantiene el formulario cuando añadir falla", async () => {
    data.sessions[0].start = atLocal(tableDate, 18 * 60);
    data.sessions[0].end = atLocal(tableDate, 19 * 60);
    render(<RealSessionDrawer sessionId="session-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Apuntar" }));
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Marta nueva" },
    });
    fireEvent.change(screen.getByLabelText("Plazas"), {
      target: { value: "2" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar reserva" }));
    });
    const request = mocks.update.mock.calls[0];
    expect(request[0]).toBe("class.add");
    expect(request[1](data).bookings.at(-1)).toMatchObject({
      clientName: "Marta nueva",
      serviceId: "service-a",
      sessionId: "session-1",
      priceCents: 4800,
      paidCents: null,
      source: "walkin",
    });
    expect(screen.getByLabelText("Nombre")).toHaveValue("Marta nueva");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("crea sesiones con intención aparte y conserva la selección ante fallo", async () => {
    const close = vi.fn();
    render(
      <RealNewSessionDrawer
        preset={{ date: tableDate, minute: 18 * 60 }}
        onClose={close}
      />,
    );
    fireEvent.change(screen.getByLabelText("Repetir"), {
      target: { value: "4" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar sesión" }));
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "class.session.create",
      expect.any(Function),
      {
        type: "class.session.create",
        classTypeId: "service-a",
        startsAt: atLocal(tableDate, 18 * 60),
        resourceIds: [],
        capacity: 12,
        repeatWeeks: 4,
      },
    );
    expect(mocks.update.mock.calls[0][1](data)).toBe(data);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Repetir")).toHaveValue("4");
  });

  it("no inventa asistentes y mantiene las acciones cerradas sin permisos", () => {
    data.bookings = [];
    data.classOperations!.rosterVisible = false;
    mocks.can.mockReturnValue(false);
    expect(deriveRoster(data, data.sessions[0], tableNow)).toEqual([]);
    render(<RealSessionDrawer sessionId="session-1" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Apuntar" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Asistió" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/El listado de personas requiere acceso/),
    ).toBeInTheDocument();
  });

  it("muestra bonos personales sin cuotas, deuda ni pagos ficticios", () => {
    data.classOperations!.bundles = [
      {
        id: "bundle-1",
        customerId: "person-1",
        serviceId: "service-a",
        label: "Bono 10",
        remaining: 3,
        granted: 10,
      },
    ];
    render(<RealBundles />);
    expect(screen.getByText("3 de 10 sesiones")).toBeInTheDocument();
    expect(
      screen.queryByText(/Recurrente|Todo cobrado|Pago pendiente/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Cobrar|Renovar|Dar de alta/ }),
    ).not.toBeInTheDocument();
  });
});
