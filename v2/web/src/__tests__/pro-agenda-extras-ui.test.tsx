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
import { setConsent } from "@/lib/pro/agenda-clients";
import { groupBookings } from "@/lib/pro/agenda-groups";
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
import { GroupPlanDrawer } from "@/components/pro/sections/agenda/group-plan";
import { ClientPhotos } from "@/components/pro/sections/agenda/client-photos";
import { MonthView } from "@/components/pro/sections/agenda/caja-mes";

// Jueves 24 de septiembre de 2026, 11:00 en Madrid.
const now = new Date("2026-09-24T09:00:00.000Z");
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
});
afterEach(cleanup);

describe("Franky Pro agenda: grupos, fotos y cabinas", () => {
  it("Hoy abre el grupo y monta el horario en la agenda", async () => {
    setup("hairdresser");
    render(<AgendaHoy />);
    const panel = screen
      .getByText("Grupos que quieren venir")
      .closest("section")!;
    fireEvent.click(
      within(panel).getByRole("button", { name: /Delegación de Arquitectura/ }),
    );
    const create = await screen.findByRole("button", {
      name: /Montar \d+ citas/,
    });
    await act(async () => {
      fireEvent.click(create);
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "agenda.group",
      expect.any(Function),
    );
    const created = groupBookings(data, "g1");
    expect(created.length).toBeGreaterThan(0);
    expect(data.groupRequests.find((g) => g.id === "g1")?.status).toBe(
      "accepted",
    );
  });

  it("un grupo ya montado enseña el horario para mandarlo", async () => {
    setup("beauty");
    const { unmount } = render(
      <GroupPlanDrawer requestId="g1" onClose={() => {}} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Montar \d+ citas/ }));
    });
    unmount();
    render(<GroupPlanDrawer requestId="g1" onClose={() => {}} />);
    expect(screen.getByText("Copiar horario")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Montar/ })).toBeNull();
  });

  it("sin permiso de fotos la ficha lo explica y no deja subir", () => {
    setup("beauty", (d) => ({
      ...d,
      clients: d.clients.map((c, i) =>
        i === 0 ? { ...c, agenda: { ...c.agenda, consents: {} } } : c,
      ),
    }));
    render(<ClientPhotos clientId={data.clients[0].id} />);
    expect(screen.getByText(/Activa su permiso de fotos/)).toBeInTheDocument();
    expect(screen.queryByText("Foto de antes")).toBeNull();
  });

  it("con permiso de fotos se puede subir el antes y el después", () => {
    setup("beauty", (d) =>
      setConsent(d, d.clients[0].id, "photos", true, now.toISOString()),
    );
    render(<ClientPhotos clientId={data.clients[0].id} />);
    expect(screen.getByText("Foto de antes")).toBeInTheDocument();
    expect(screen.getByText("Foto de después")).toBeInTheDocument();
  });

  it("Caja del mes enseña la rentabilidad de cada cabina en estética", () => {
    setup("beauty");
    render(<MonthView month="2026-09" />);
    expect(screen.getByText("Rentabilidad por cabina")).toBeInTheDocument();
    expect(screen.getByText("Láser de diodo")).toBeInTheDocument();
  });
});
