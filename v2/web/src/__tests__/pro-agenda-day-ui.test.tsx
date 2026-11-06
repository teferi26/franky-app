import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import { marksOn } from "@/lib/pro/agenda-day";
import { bookingsOn } from "@/lib/pro/agenda";
import type { ProData, ProVerticalId } from "@/lib/pro/types";

const mocks = vi.hoisted(() => ({
  usePro: vi.fn(),
  update:
    vi.fn<
      (label: string, recipe: (data: ProData) => ProData) => Promise<boolean>
    >(),
  success: vi.fn(),
}));

let counter = 0;
vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: (prefix: string) => `${prefix}-t${++counter}`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success, error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/components/pro/shell", () => ({
  sectionHref: (spaceId: string, section: string) =>
    `/pro/${spaceId}/${section}`,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import AgendaHoy from "@/components/pro/sections/agenda/hoy";
import AgendaSection from "@/components/pro/sections/agenda/agenda";
import { AgendaClientFile } from "@/components/pro/sections/agenda/client-file";
import { counterFlags } from "@/components/pro/sections/agenda/reception";

// Jueves 24 de septiembre de 2026, 11:00 en Madrid.
const now = new Date("2026-09-24T09:00:00.000Z");
const TODAY = "2026-09-24";
let data: ProData;

function setup(vertical: ProVerticalId, tweak?: (d: ProData) => ProData) {
  data = buildDemo(vertical, now);
  if (tweak) data = tweak(data);
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
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  try {
    window.localStorage.clear();
  } catch {
    // Sin almacenamiento en el entorno de pruebas.
  }
});
afterEach(cleanup);

describe("Franky Pro agenda: el día en el salón", () => {
  it("la apertura se marca en Hoy con quién la hizo", async () => {
    setup("hairdresser");
    render(<AgendaHoy />);
    const panel = screen
      .getByRole("heading", { name: "Apertura" })
      .closest("section")!;
    expect(within(panel).getByText(/3 de 4 hechas/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        within(panel).getByRole("button", { name: /Cambio en la caja/ }),
      );
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "agenda.checklist",
      expect.any(Function),
    );
    const marks = marksOn(data.agendaOps, TODAY);
    expect(marks).toHaveLength(4);
    expect(marks.every((mark) => mark.staffId)).toBe(true);
  });

  it("el día de cada profesional se abre desde Hoy", () => {
    setup("hairdresser");
    render(<AgendaHoy />);
    fireEvent.click(
      screen.getAllByRole("button", { name: /Su día con avisos/ })[0],
    );
    expect(screen.getByText(/^El día de /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mandar a / })).toBeInTheDocument();
  });

  it("recepción marca que ha llegado alguien y no enseña la salud", async () => {
    setup("hairdresser");
    render(<AgendaHoy />);
    fireEvent.click(screen.getByRole("button", { name: /Recepción/ }));
    const screenDialog = screen.getByRole("dialog", { name: "Recepción" });
    const arrive = within(screenDialog).getAllByRole("button", {
      name: "Ha llegado",
    })[0];
    await act(async () => {
      fireEvent.click(arrive);
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "booking.arrived",
      expect.any(Function),
    );
    expect(
      bookingsOn(data, TODAY).some((booking) => booking.status === "arrived"),
    ).toBe(true);
    expect(
      counterFlags([
        { label: "Alergia: Látex", tone: "danger" },
        { label: "Embarazo", tone: "danger" },
        { label: "Estudiante", tone: "violet" },
      ]),
    ).toEqual([
      { label: "Mira la ficha", tone: "danger" },
      { label: "Estudiante", tone: "violet" },
    ]);
  });

  it("la agenda se puede colorear por tipo de servicio con leyenda", () => {
    setup("beauty");
    render(<AgendaSection />);
    expect(screen.queryByLabelText("Colores por tipo de servicio")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Por servicio" }));
    const legend = screen.getByLabelText("Colores por tipo de servicio");
    expect(within(legend).getByText("Uñas")).toBeInTheDocument();
    expect(within(legend).getByText("Depilación")).toBeInTheDocument();
  });

  it("la ficha enseña el plan de láser en marcha", () => {
    setup("beauty");
    const planned = data.bookings.find(
      (b) => b.agenda?.seriesId === "sr-laser",
    );
    expect(planned).toBeDefined();
    render(<AgendaClientFile clientId={planned!.clientId!} />);
    expect(screen.getByText("Planes en marcha")).toBeInTheDocument();
    expect(screen.getByText(/Próxima:/)).toBeInTheDocument();
  });
});
