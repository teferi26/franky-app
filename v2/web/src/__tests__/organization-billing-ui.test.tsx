import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationBillingPanel } from "@/components/professional/ProfessionalBilling";
import type {
  OrganizationBillingState,
  OrganizationBillingQuote,
} from "../../../shared/organization-billing";
const hooks = vi.hoisted(() => ({ api: vi.fn(), quote: vi.fn() }));
vi.mock("@/components/professional/useOrganizationBillingClient", () => ({
  useOrganizationBillingClient: () => hooks,
}));
const org = "10000000-0000-0000-0000-000000000001",
  quoteId = "20000000-0000-0000-0000-000000000001",
  order = "30000000-0000-0000-0000-000000000001";
const billing = (
  overrides: Partial<OrganizationBillingState> & {
    can_checkout_web?: boolean;
  } = {},
): OrganizationBillingState & { can_checkout_web: boolean } => ({
  organization_id: org,
  environment: "test",
  sales_enabled: true,
  provider_ready: true,
  can_manage_billing: true,
  can_read_finance: true,
  can_checkout_web: true,
  account: {
    id: "account",
    legal_name: "Peluquería de prueba",
    country: "ES",
    verified: true,
  },
  founder: { approved: true, reason: "approved" },
  catalog: [
    {
      plan_key: "hairdresser",
      version: 1,
      title: "Peluquerías",
      categories: ["hairdresser"],
      monthly_cents: 2900,
      annual_cents: 29000,
      founder_cents: 19900,
      currency: "eur",
      tax_behavior: "exclusive",
      terms_version: "v1",
      terms: "Condiciones verificadas de prueba",
      modules: ["appointments", "bundles"],
      limits: { staff_limit: 3, resource_limit: 20, service_limit: 50 },
      status: "active",
    },
  ],
  subscription: null,
  pending_attempt_id: null,
  access: {
    source: "free",
    active: false,
    paused: false,
    until: null,
    existing_obligations_access: true,
  },
  reason: null,
  ...overrides,
});
const offer = (
  extra: Partial<OrganizationBillingQuote> = {},
): OrganizationBillingQuote => ({
  id: quoteId,
  organization_id: org,
  environment: "test",
  plan_key: "hairdresser",
  plan_version: 1,
  interval: "year",
  first_base_cents: 19900,
  renewal_base_cents: 29000,
  currency: "eur",
  tax_behavior: "exclusive",
  founder: true,
  expires_at: new Date(Date.now() + 600000).toISOString(),
  terms_version: "v1",
  terms: "Condiciones verificadas de prueba",
  modules: ["appointments"],
  limits: { staff_limit: 3, resource_limit: 20, service_limit: 50 },
  available: true,
  reason: null,
  ...extra,
});
function mount(props: { key?: string; organization?: string } = {}) {
  return render(
    <OrganizationBillingPanel
      key={props.key ?? org}
      owner="owner"
      organization={props.organization ?? org}
      name="Peluquería de prueba"
    />,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  hooks.api.mockReset();
  hooks.quote.mockReset();
  hooks.api.mockImplementation(async (path: string) =>
    path.startsWith("invoices")
      ? { invoices: [], next_cursor: null }
      : { billing: billing() },
  );
  hooks.quote.mockImplementation(async () => offer());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function acceptOffer() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Revisar oferta/ }),
  );
  await screen.findByRole("region", { name: "Oferta de contratación" });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Acepto las condiciones/ }),
  );
}
describe("organization billing consent and recovery", () => {
  it.each([401, 403])(
    "removes an issued checkout link after authorization fails with %s without cancelling its order",
    async (status) => {
      hooks.api
        .mockResolvedValueOnce({
          billing: billing(),
          payment: {
            status: "checkout",
            order_id: order,
            url: "https://checkout.stripe.com/c/pay/test",
          },
        })
        .mockRejectedValue(
          Object.assign(Error("organization_permission_denied"), { status }),
        );
      mount();
      expect(
        await screen.findByRole("link", { name: "Continuar pago" }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Comprobar estado" }));
      await screen.findByText("Estado contractual sin confirmar.");
      expect(screen.queryByRole("link", { name: "Continuar pago" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Recuperar el mismo intento" }),
      ).toBeNull();
      expect(screen.queryByText("Intento cerrado sin contratación")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Comprobar estado" }));
      await waitFor(() =>
        expect(hooks.api).toHaveBeenLastCalledWith(`status?order=${order}`),
      );
    },
  );
  it("recovers an organization-wide pending attempt before offering another contract", async () => {
    hooks.api.mockResolvedValue({
      billing: billing({ pending_attempt_id: order }),
    });
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "Comprobando la contratación",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Revisar oferta/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar estado" }));
    await waitFor(() =>
      expect(hooks.api).toHaveBeenCalledWith(`status?order=${order}`),
    );
  });
  it("only allows replacing a retained request after the server confirms no attempt exists", async () => {
    const saved = {
      consent: {
        quote_id: quoteId,
        request_key: quoteId,
        accepted_terms_version: "v1",
        accepted_first_base_cents: 19900,
        accepted_renewal_base_cents: 29000,
        accepted: true,
      },
    };
    sessionStorage.setItem(
      `franky:organization-checkout:v1:owner:${org}`,
      JSON.stringify(saved),
    );
    hooks.api.mockResolvedValue({ billing: billing(), attempt_known: false });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Revisar una nueva oferta" }),
    );
    expect(hooks.api).toHaveBeenCalledWith(`status?request_key=${quoteId}`);
    expect(
      sessionStorage.getItem(`franky:organization-checkout:v1:owner:${org}`),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Revisar oferta y condiciones/ }),
    ).toBeTruthy();
  });
  it("does not offer checkout when the server or provider has sales closed", async () => {
    hooks.api.mockResolvedValue({
      billing: billing({
        can_checkout_web: false,
        sales_enabled: false,
        provider_ready: false,
      }),
    });
    mount();
    expect(
      await screen.findByText(/nuevas contrataciones todavía están cerradas/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Revisar oferta/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Continuar al pago/ }),
    ).toBeNull();
  });
  it("requires explicit first and renewal consent and freezes the same key after an uncertain response", async () => {
    const sent: unknown[] = [];
    hooks.api.mockImplementation(async (path: string, body?: unknown) => {
      if (path === "checkout") {
        sent.push(body);
        if (sent.length === 1) throw Error("network_lost");
        return { status: "pending", order_id: order };
      }
      return { billing: billing() };
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Revisar oferta/ }),
    );
    const pay = await screen.findByRole("button", {
      name: /Continuar al pago/,
    });
    expect(pay).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Acepto las condiciones/ }),
    );
    fireEvent.click(pay);
    const retry = await screen.findByRole("button", {
      name: "Recuperar el mismo intento",
    });
    await waitFor(() => expect(retry).not.toBeDisabled());
    fireEvent.click(retry);
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[0]).toMatchObject({
      quote_id: quoteId,
      accepted_first_base_cents: 19900,
      accepted_renewal_base_cents: 29000,
      accepted_terms_version: "v1",
      accepted: true,
    });
    expect(screen.queryByText("Pago confirmado")).toBeNull();
    expect(screen.queryByRole("button", { name: /Revisar oferta/ })).toBeNull();
  });
  it("a period change removes the old quote and its consent", async () => {
    mount();
    await acceptOffer();
    fireEvent.click(screen.getByRole("button", { name: /^Mensual/ }));
    expect(
      screen.queryByRole("region", { name: "Oferta de contratación" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Continuar al pago/ }),
    ).toBeNull();
  });
  it("does not enable an expired quote or silently accept the founder discount", async () => {
    hooks.quote.mockResolvedValue(
      offer({ expires_at: "2000-01-01T00:00:00Z" }),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Revisar oferta/ }),
    );
    expect(
      await screen.findByRole("button", { name: /Continuar al pago/ }),
    ).toBeDisabled();
    expect(hooks.quote).toHaveBeenCalledWith(
      expect.objectContaining({ p_founder: false }),
    );
  });
  it("keeps pending payment unknown when the state request fails", async () => {
    const saved = {
      consent: {
        quote_id: quoteId,
        request_key: quoteId,
        accepted_terms_version: "v1",
        accepted_first_base_cents: 19900,
        accepted_renewal_base_cents: 29000,
        accepted: true,
      },
      order,
    };
    sessionStorage.setItem(
      `franky:organization-checkout:v1:owner:${org}`,
      JSON.stringify(saved),
    );
    hooks.api.mockRejectedValue(Error("network_lost"));
    mount();
    expect(
      await screen.findByText("Estado contractual sin confirmar."),
    ).toBeTruthy();
    expect(screen.queryByText("Intento cerrado sin contratación")).toBeNull();
    expect(
      sessionStorage.getItem(`franky:organization-checkout:v1:owner:${org}`),
    ).not.toBeNull();
  });
  it("does not leak late financial state into another organization", async () => {
    let finish!: (value: unknown) => void;
    hooks.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount();
    await waitFor(() => expect(hooks.api).toHaveBeenCalled());
    view.rerender(
      <OrganizationBillingPanel
        key="other"
        owner="owner"
        organization="40000000-0000-0000-0000-000000000001"
        name="Otro negocio"
      />,
    );
    await screen.findByText("Sin suscripción de pago");
    finish({
      billing: billing({
        account: {
          id: "private",
          legal_name: "PRIVATE OLD ENTITY",
          country: "ES",
          verified: true,
        },
      }),
    });
    await waitFor(() =>
      expect(screen.queryByText(/PRIVATE OLD ENTITY/)).toBeNull(),
    );
  });
  it("financial reading does not grant a checkout or a portal", async () => {
    hooks.api.mockResolvedValue({
      billing: billing({
        can_manage_billing: false,
        subscription: {
          id: "sub",
          status: "active",
          interval: "year",
          plan_key: "hairdresser",
          plan_version: 1,
          current_period_end: "2027-09-23T00:00:00Z",
          cancel_at_period_end: false,
        },
      }),
    });
    mount();
    expect(
      await screen.findByRole("button", { name: "Consultar facturas" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Medio de pago/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Revisar oferta/ })).toBeNull();
  });
  it("paginates invoices without exposing an arbitrary payment link", async () => {
    const row = {
      id: "in_1",
      number: "TEST-1",
      status: "paid",
      currency: "eur",
      total: 29000,
      amount_paid: 29000,
      created: 1800000000,
      invoice_pdf: null,
      hosted_invoice_url: "https://evil.invalid/pay",
    };
    hooks.api.mockImplementation(async (path: string) =>
      path === "invoices"
        ? { invoices: [row], next_cursor: "in_1" }
        : path.startsWith("invoices?")
          ? {
              invoices: [
                {
                  ...row,
                  id: "in_2",
                  number: "TEST-2",
                  hosted_invoice_url: "https://invoice.stripe.com/i/test",
                },
              ],
              next_cursor: null,
            }
          : { billing: billing() },
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Consultar facturas" }),
    );
    expect(await screen.findByText("TEST-1")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Abrir factura" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver más facturas" }));
    await screen.findByText("TEST-2");
    expect(screen.getAllByRole("link", { name: "Abrir factura" })).toHaveLength(
      1,
    );
    expect(hooks.api).toHaveBeenCalledWith("invoices?cursor=in_1");
  });
});
