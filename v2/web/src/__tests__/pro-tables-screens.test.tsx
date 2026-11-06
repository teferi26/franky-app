import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import type { ProData, ProVerticalId } from "@/lib/pro/types";
import { bonoRemaining } from "@/lib/pro/tables-ops";
import { showcaseToday } from "@/lib/pro/tables-day";
import { localDate } from "@/lib/pro/format";
import TablesHoy from "@/components/pro/sections/tables/hoy";
import TablesBonos from "@/components/pro/sections/tables/bonos";
import TablesValidar from "@/components/pro/sections/tables/validar";
import TablesCaja from "@/components/pro/sections/tables/caja";
import TablesCarta from "@/components/pro/sections/tables/carta";
import TablesReservas from "@/components/pro/sections/tables/reservas";

/**
 * Las pantallas nuevas del motor de mesas en la demo: pintan sin romperse,
 * sin guiones largos y sus acciones cambian de verdad los datos.
 */

const NOW = new Date("2026-09-29T18:20:00+02:00");
const DASHES = /[–—]/;

const store = vi.hoisted(() => ({
  data: null as unknown as ProData,
  vertical: "cafe" as string,
}));

vi.mock("@/lib/pro/store", () => ({
  usePro: () => ({
    data: store.data,
    now: NOW,
    vertical: PRO_VERTICALS[store.vertical as ProVerticalId],
    demo: true,
    pending: false,
    spaceId: "demo-x",
    can: () => true,
    canView: () => true,
    loadDate: async () => {},
    update: async (_label: string, fn: (d: ProData) => ProData) => {
      store.data = fn(store.data);
      return true;
    },
  }),
  localId: (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/components/pro/shell", () => ({
  sectionHref: (id: string, section: string) => `/pro/${id}/${section}`,
}));

function use(vertical: ProVerticalId) {
  store.vertical = vertical;
  store.data = buildDemo(vertical, NOW);
}

beforeEach(() => use("cafe"));
afterEach(cleanup);

describe("Hoy", () => {
  it.each(["cafe", "bar", "restaurant"] as const)("pinta el Hoy de %s sin guiones largos", (v) => {
    use(v);
    const { container } = render(<TablesHoy />);
    expect(container.textContent).not.toMatch(DASHES);
    expect(container.textContent).not.toMatch(/simulad|ficticio/i);
  });

  it("la cafetería enseña vitrina, sitio para estudiar y nota del cierre", () => {
    render(<TablesHoy />);
    expect(screen.getByText("Vitrina de hoy")).toBeInTheDocument();
    expect(screen.getByText("Sitio para estudiar")).toBeInTheDocument();
    expect(screen.getByText(/Nota del cierre/)).toBeInTheDocument();
  });

  it("agotar en la vitrina lo quita de la carta", async () => {
    const { rerender } = render(<TablesHoy />);
    const panel = screen.getByText("Vitrina de hoy").closest("section")!;
    const today = localDate(NOW);
    const first = showcaseToday(store.data.tablesOps!, store.data.menu, today).find(
      (r) => r.item.available && r.left > 0,
    )!;
    // A las 18:20 ya es hora de sobras: el botón es Vendida.
    const row = within(panel).getByText(first.item.name).closest("div")!;
    await act(async () => fireEvent.click(within(row).getByRole("button", { name: "Vendida" })));
    rerender(<TablesHoy />);
    const after = showcaseToday(store.data.tablesOps!, store.data.menu, today).find(
      (r) => r.item.id === first.item.id,
    )!;
    expect(after.left).toBe(first.left - 1);
    expect(store.data.tablesOps!.waste[0]).toMatchObject({ fate: "vendido", item: first.item.name });
  });

  it("el restaurante enseña el grupo del día con su recuento", () => {
    use("restaurant");
    render(<TablesHoy />);
    expect(screen.getAllByText("Comida de fin de prácticas").length).toBeGreaterThan(0);
    expect(screen.getByText(/Faltan 2 personas por elegir/)).toBeInTheDocument();
  });
});

describe("Sellos y bonos", () => {
  it("sella a un habitual sin importe", async () => {
    render(<TablesValidar />);
    const before = store.data.validations.length;
    fireEvent.click(screen.getByRole("button", { name: /Sellar a un habitual/ }));
    const dialog = await screen.findByRole("dialog");
    const buttons = within(dialog).getAllByRole("button").filter((b) => /\+1 sello/.test(b.textContent ?? ""));
    await act(async () => fireEvent.click(buttons[0]));
    expect(store.data.validations.length).toBe(before + 1);
    expect(store.data.validations[0]).toMatchObject({ kind: "stamp", amountCents: 0 });
    expect(within(dialog).getByText(/Sello \d+ de \d+|Invita la casa/)).toBeInTheDocument();
  });

  it("vende un bono y lo descuenta", async () => {
    const first = render(<TablesBonos />);
    expect(document.body.textContent).not.toMatch(DASHES);
    fireEvent.click(screen.getByRole("button", { name: "Vender bono" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "Marta Soler" } });
    const count = store.data.tablesOps!.bonos.length;
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /Vender por/ })));
    expect(store.data.tablesOps!.bonos.length).toBe(count + 1);
    const sold = store.data.tablesOps!.bonos[0];
    expect(sold).toMatchObject({ clientName: "Marta Soler", usedAt: [] });
    first.unmount();
    render(<TablesBonos />);
    // El bono recién vendido sale el primero de la lista de vivos.
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Descontar" })[0]));
    const now = store.data.tablesOps!.bonos.find((b) => b.id === sold.id)!;
    expect(bonoRemaining(now)).toBe(sold.uses - 1);
  });
});

describe("trastienda", () => {
  it("el cierre ya hecho ofrece mandar el resumen", () => {
    use("restaurant");
    const today = localDate(NOW);
    const ops = store.data.tablesOps!;
    store.data = {
      ...store.data,
      tablesOps: {
        ...ops,
        closings: [
          ...ops.closings.filter((c) => c.date !== today),
          { ...ops.closings[0], id: "hoy", date: today, closedAt: NOW.toISOString() },
        ],
      },
    };
    render(<TablesCaja />);
    const link = screen.getByRole("link", { name: /Mandar resumen/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("Cierre de");
    expect(screen.getByText("Tu semana")).toBeInTheDocument();
  });

  it("la carta sugiere platos de otros días en el menú", () => {
    use("restaurant");
    render(<TablesCarta />);
    fireEvent.click(screen.getByRole("tab", { name: /Menú del día/ }));
    expect(screen.getAllByText("Otros días:").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Compartir/ })).toBeInTheDocument();
  });

  it("las reservas del bar piden confirmación por WhatsApp", () => {
    use("bar");
    render(<TablesReservas />);
    expect(screen.getByText("Confirma las reservas")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(DASHES);
  });
});
