import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfessionalDashboard from "@/components/professional/ProfessionalDashboard";
import ProfessionalBooking from "@/components/professional/ProfessionalBooking";
import type {
  ProfessionalWorkspace,
  ProfessionalCatalog,
} from "../../../shared/professional-services";
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  owner: { userId: "user-one", key: "user-one:1" },
}));
vi.mock("@/components/professional/ProfessionalNotices", () => ({
  ProfessionalNotices: () => null,
}));
vi.mock("@/lib/use-financial-owner", () => ({
  useFinancialOwner: () => state.owner,
}));
vi.mock("@/components/professional/useProfessionalRpc", () => ({
  useProfessionalRpc: () => state.rpc,
}));
const org = "10000000-0000-0000-0000-000000000001",
  service = "20000000-0000-0000-0000-000000000001",
  slot = "2026-09-25T10:00:00Z";
const workspace = {
  id: org,
  name: "Peluquería Alba",
  kind: "leisure",
  subtype: "hairdresser",
  city: "Madrid",
  permissions: [
    "content.manage",
    "attendees.manage",
    "settings.manage",
    "finance.manage",
  ],
  status: "active",
  role: "owner",
  demo_cohort_id: null,
};
function data(): ProfessionalWorkspace {
  return {
    settings: {
      organization_id: org,
      category: "hairdresser",
      timezone: "Europe/Madrid",
      enabled: true,
      public_booking: true,
      require_approval: false,
      booking_horizon_days: 90,
      cancellation_hours: 24,
      terms: "Avisar 24 horas antes",
      staff_limit: 3,
      resource_limit: 20,
      service_limit: 50,
      sales_enabled: false,
      demo: false,
    },
    services: [],
    resources: [],
    availability: [],
    exceptions: [],
    sessions: [],
    bookings: [],
    customers: [],
    bundles: [],
    permissions: workspace.permissions,
    pricing: {
      monthly_cents: 2900,
      annual_cents: 29000,
      founder_cents: 19900,
      currency: "EUR",
      tax_included: false,
      sales_enabled: false,
    },
    has_more: false,
    demo: false,
  };
}
const catalog: ProfessionalCatalog = {
  organization: { id: org, name: "Peluquería Alba", city: "Madrid" },
  settings: {
    timezone: "Europe/Madrid",
    require_approval: false,
    booking_horizon_days: 90,
    cancellation_hours: 24,
    terms: "Avisar 24 horas antes",
  },
  services: [
    {
      id: service,
      organization_id: org,
      name: "Corte",
      description: "Corte y peinado",
      mode: "appointment",
      duration_minutes: 30,
      buffer_minutes: 0,
      price_cents: 1500,
      price_basis: "booking",
      deposit_cents: 0,
      capacity: 1,
      required_resource_ids: [],
      staff_required: true,
      active: true,
      menu: "",
      version: 7,
    },
  ],
  resources: [],
  sessions: [],
};
beforeEach(() => {
  state.owner = { userId: "user-one", key: "user-one:1" };
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (name: string) => {
    if (name === "professional_list_workspaces") return [workspace];
    if (name === "professional_get_workspace") return data();
    if (name === "professional_get_catalog") return catalog;
    if (name === "professional_get_slots") return [slot];
    if (name === "list_franky_card_offers")
      return { items: [], next_cursor: null };
    if (name === "professional_book")
      return {
        id: "booking",
        service_name: "Corte",
        starts_at: slot,
        status: "confirmed",
        total_cents: 1500,
        deposit_status: "not_required",
      };
    if (name === "professional_list_customer_bundles")
      return { items: [], next_cursor: null };
    return {};
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("professional sector surfaces", () => {
  it("reserves a session from the holder bundle with an accepted zero additional charge", async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "professional_get_catalog") return catalog;
      if (name === "professional_get_slots") return [slot];
      if (name === "list_franky_card_offers")
        return { items: [], next_cursor: null };
      if (name === "professional_list_customer_bundles")
        return {
          items: [
            {
              id: "bundle",
              service_id: service,
              remaining: 3,
              label: "Bono tres cortes",
            },
          ],
          next_cursor: null,
        };
      if (name === "professional_book")
        return {
          id: "booking",
          service_name: "Corte",
          starts_at: slot,
          status: "confirmed",
          total_cents: 0,
          deposit_status: "not_required",
        };
      return {};
    });
    render(<ProfessionalBooking organizationId={org} />);
    await screen.findByRole("heading", { name: "Peluquería Alba" });
    fireEvent.click(await screen.findByRole("radio"));
    fireEvent.change(
      await screen.findByLabelText("Tu bono para este servicio"),
      { target: { value: "bundle" } },
    );
    expect(
      await screen.findByText("Una sesión del bono · sin pago adicional"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByLabelText("He revisado precio, fecha y condiciones."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    await screen.findByRole("heading", { name: "Tu reserva está confirmada" });
    const args = state.rpc.mock.calls.find(
      (x) => x[0] === "professional_book",
    )?.[1];
    expect(args.p_bundle_id).toBe("bundle");
    expect(args.p_expected_total_cents).toBe(0);
    expect(args.p_card_quote_id).toBeNull();
  });
  it("shows a business agenda and category-specific work instead of student navigation", async () => {
    render(<ProfessionalDashboard organizationId={org} />);
    expect(
      await screen.findByRole("heading", { name: "Tus citas, a punto" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Añadir cita" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Abrir Franky Card" })
        .getAttribute("href"),
    ).toBe("/espacios/card?organization=" + org);
  });
  it("shows truthful launch pricing and cannot offer an active purchase", async () => {
    state.rpc.mockImplementation(async (name: string) =>
      name === "professional_list_workspaces"
        ? [workspace]
        : { ...data(), settings: null },
    );
    render(<ProfessionalDashboard organizationId={org} />);
    expect(
      await screen.findByRole("link", { name: /Consultar plan y facturación/ }),
    ).toHaveAttribute("href", `/espacios/facturacion?organization=${org}`);
    expect(
      screen.getByText(/El primer periodo y las renovaciones se aceptan/),
    ).toBeTruthy();
    expect(
      screen.getByText(/no contrata ni cobra una suscripción/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Comprar|Pagar/ })).toBeNull();
  });
  it("creates services through a persistent command with a retained retry key", async () => {
    let attempts = 0;
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "professional_list_workspaces") return [workspace];
      if (name === "professional_get_workspace") return data();
      if (name === "professional_save_record") {
        attempts++;
        throw Error("network_error");
      }
      if (name === "professional_list_customer_bundles")
        return { items: [], next_cursor: null };
      return {};
    });
    render(<ProfessionalDashboard organizationId={org} />);
    await screen.findByRole("heading", { name: "Tus citas, a punto" });
    fireEvent.click(await screen.findByRole("button", { name: "Servicios" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Añadir" })[0]);
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Corte y barba" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(attempts).toBe(1));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(attempts).toBe(2));
    const calls = state.rpc.mock.calls.filter(
      (x) => x[0] === "professional_save_record",
    );
    expect(calls[0][1].p_data.name).toBe("Corte y barba");
    expect(calls[0][1].p_data.client_request_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(calls[1][1].p_data.client_request_id).toBe(
      calls[0][1].p_data.client_request_id,
    );
  });
  it("client confirms the catalogue version, total and terms with server-generated slot", async () => {
    render(<ProfessionalBooking organizationId={org} />);
    await screen.findByRole("heading", { name: "Peluquería Alba" });
    const radio = await screen.findByRole("radio");
    fireEvent.click(radio);
    fireEvent.click(
      screen.getByLabelText("He revisado precio, fecha y condiciones."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    await screen.findByRole("heading", { name: "Tu reserva está confirmada" });
    const args = state.rpc.mock.calls.find(
      (x) => x[0] === "professional_book",
    )?.[1];
    expect(args.p_starts_at).toBe(slot);
    expect(args.p_expected_service_version).toBe(7);
    expect(args.p_expected_total_cents).toBe(1500);
    expect(args.p_expected_terms).toBe("Avisar 24 horas antes");
    expect(args.p_customer_name).toBeUndefined();
    expect(args.p_card_quote_id).toBeNull();
  });
  it("does not offer unrelated resources or another professional when the service fixes its agenda", async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "professional_get_catalog")
        return {
          ...catalog,
          services: [
            { ...catalog.services[0], required_resource_ids: ["staff-a"] },
          ],
          resources: [
            { id: "staff-a", name: "Ana", kind: "staff", capacity: 1 },
            { id: "staff-b", name: "Bruno", kind: "staff", capacity: 1 },
            { id: "room", name: "Sala privada", kind: "room", capacity: 1 },
          ],
        };
      if (name === "professional_get_slots") return [slot];
      if (name === "list_franky_card_offers")
        return { items: [], next_cursor: null };
      if (name === "professional_list_customer_bundles")
        return { items: [], next_cursor: null };
      return {};
    });
    render(<ProfessionalBooking organizationId={org} />);
    await screen.findByRole("heading", { name: "Peluquería Alba" });
    expect(screen.queryByRole("option", { name: "Bruno" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Sala privada" })).toBeNull();
  });
  it("an account switch removes the old form and ignores its late mutation response", async () => {
    let resolve!: (v: unknown) => void;
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "professional_list_workspaces") return [workspace];
      if (name === "professional_get_workspace") return data();
      if (name === "professional_save_record")
        return new Promise((r) => {
          resolve = r;
        });
      if (name === "professional_list_customer_bundles")
        return { items: [], next_cursor: null };
      return {};
    });
    const { rerender } = render(<ProfessionalDashboard organizationId={org} />);
    await screen.findByRole("heading", { name: "Tus citas, a punto" });
    fireEvent.click(await screen.findByRole("button", { name: "Servicios" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Añadir" })[0]);
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Privado de la cuenta anterior" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    state.owner = { userId: "user-two", key: "user-two:2" };
    rerender(<ProfessionalDashboard organizationId={org} />);
    resolve({ id: "old-operation" });
    await waitFor(() =>
      expect(
        screen.queryByDisplayValue("Privado de la cuenta anterior"),
      ).toBeNull(),
    );
    expect(
      screen.queryByText(
        "Guardado. La agenda y las reservas comparten estos cambios.",
      ),
    ).toBeNull();
  });
  it("a late save cannot close the different editor opened afterward", async () => {
    let finish!: (value: unknown) => void;
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "professional_list_workspaces") return [workspace];
      if (name === "professional_get_workspace") return data();
      if (name === "professional_save_record")
        return new Promise((r) => {
          finish = r;
        });
      return {};
    });
    render(<ProfessionalDashboard organizationId={org} />);
    await screen.findByRole("heading", { name: "Tus citas, a punto" });
    fireEvent.click(await screen.findByRole("button", { name: "Servicios" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Añadir" })[0]);
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Primer servicio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Añadir" })[1]);
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Nueva cabina sin guardar" },
    });
    finish({ id: "service-created" });
    await screen.findByText(
      "Guardado. La agenda y las reservas comparten estos cambios.",
    );
    expect(screen.getByDisplayValue("Nueva cabina sin guardar")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Profesional o espacio" }),
    ).toBeTruthy();
  });
});
