// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { NextRequest } from "next/server";
import { proPlanAmount, proStripeLookupKey } from "../../../shared/pro/billing";
import { proWebPrice } from "../../../shared/pro/web-pricing";
import { PRO_VERTICALS } from "../../../shared/pro/verticals";
import type { OrganizationCheckoutContext } from "../../../shared/organization-billing";
import { assertOrganizationTrial, organizationCheckoutParameters } from "@/lib/organization-billing-provider";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), start: vi.fn(), recover: vi.fn(), context: vi.fn(), auth: vi.fn(),
}));
vi.mock("@/lib/organization-billing", () => ({
  startOrganizationCheckout: mocks.start, recoverOrganizationCheckout: mocks.recover,
  organizationCheckoutContext: mocks.context,
  organizationPaymentReply: (value: { checkout_url: string }) => ({ status: "checkout", url: value.checkout_url }),
}));
vi.mock("@/lib/organization-billing-api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    organizationBillingRequest: mocks.auth,
    organizationJson: (body: unknown, status = 200) => NextResponse.json(body, { status }),
    organizationBillingFailure: () => NextResponse.json({ error: "Unavailable" }, { status: 503 }),
  };
});
import { POST, GET } from "@/app/api/pro/onboarding/route";
import { POST as retry } from "@/app/api/pro/onboarding/retry/route";

const org = "00000000-0000-4000-8000-000000000001";
const order = "00000000-0000-4000-8000-000000000002";
const requestKey = "00000000-0000-4000-8000-000000000003";
const input = { sector: "hairdresser", name: "PeluquerÃ­a Ana", city: "Alicante",
  address: "Calle Mayor 1", phone: "+34 600 111 222", interval: "month", requestKey };
const state = { organization_id: org, attempt_id: order, public_slug: "peluqueria-ana", active: false, status: "pending" };
const request = (body: unknown, route = "onboarding") => new NextRequest("https://franky.es/api/pro/" + route, {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: "https://franky.es" },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_synthetic");
  vi.stubEnv("ORGANIZATION_BILLING_CHECKOUT_ENABLED", "true");
  vi.stubEnv("PRO_CHECKOUT_RETURN_ORIGIN", "http://localhost:3000");
  mocks.auth.mockResolvedValue({ client: { rpc: mocks.rpc }, user: { id: "actor" } });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "get_pro_checkout_configuration" ? { environment: "test", sales_enabled: true, provider_ready: true }
      : name === "prepare_pro_onboarding" ? { organization_id: org, attempt_id: order } : { ...state },
    error: null,
  }));
  mocks.start.mockResolvedValue({ status: "checkout", url: "https://checkout.stripe.com/c/pay/test", order_id: order });
  mocks.context.mockResolvedValue({ organization_id: org, status: "pending" });
});

describe("catÃ¡logo y prueba de Pro", () => {
  it("usa el importe anual completo y una clave estable por sector", () => {
    expect(proPlanAmount("hairdresser", "month")).toBe(1000);
    expect(proPlanAmount("hairdresser", "year")).toBe(10000);
    expect(proStripeLookupKey("hairdresser", "year")).toBe("franky_pro_hairdresser_year_v1");
    for (const vertical of Object.values(PRO_VERTICALS)) {
      expect(proPlanAmount(vertical.id, "month")).toBe(Math.round(proWebPrice(vertical.id).monthly * 100));
      expect(proPlanAmount(vertical.id, "year")).toBe(Math.round(proWebPrice(vertical.id).annual * 100));
    }
  });
  const context = () => ({
    checkout_scope: "pro", trial_days: 7, created_at: new Date().toISOString(),
    environment: "test", organization_id: org, attempt_id: order, founder: false,
  } as OrganizationCheckoutContext);
  it("Checkout exige tarjeta, calcula IVA y vuelve a la activaciÃ³n del mismo pedido", () => {
    const params = organizationCheckoutParameters(context(), "cus_pro");
    expect(params.subscription_data?.trial_period_days).toBe(7);
    expect(params.payment_method_collection).toBe("always");
    expect(params.payment_method_types).toEqual(["card"]);
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.success_url).toBe(`http://localhost:3000/pro/activar?workspace=${org}&order=${order}`);
  });
  it("solo acepta los siete dÃ­as exactos de un contrato Pro y rechaza extensiones", () => {
    const ctx = context();
    const start = Math.floor(Date.parse(ctx.created_at) / 1000);
    const sub = { status: "trialing", trial_start: start, trial_end: start + 7 * 86400 } as Stripe.Subscription;
    expect(() => assertOrganizationTrial(sub, ctx)).not.toThrow();
    expect(() => assertOrganizationTrial(sub, { ...ctx, checkout_scope: "organization" })).toThrow();
    expect(() => assertOrganizationTrial(sub, { ...ctx, trial_days: 0 })).toThrow();
    expect(() => assertOrganizationTrial({ ...sub, trial_end: start + 8 * 86400 }, ctx)).toThrow();
  });
});

describe("alta autoservicio", () => {
  it("no crea el espacio sin sesiÃ³n", async () => {
    const { NextResponse } = await import("next/server");
    mocks.auth.mockResolvedValue({ response: NextResponse.json({ error: "Login" }, { status: 401 }) });
    expect((await POST(request(input))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("prepara una intenciÃ³n duradera con el precio del catÃ¡logo y devuelve Checkout", async () => {
    const result = await POST(request(input));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ status: "checkout", workspaceId: org, orderId: order, slug: "peluqueria-ana" });
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_pro_onboarding", {
      p_request_key: requestKey, p_interval: "month", p_base_cents: 1000,
      p_data: { sector: "hairdresser", name: input.name, city: input.city, address: input.address, phone: input.phone, attribution: [] },
    });
    expect(mocks.start).toHaveBeenCalledWith(order, "actor", org);
  });
  it("rechaza importes o destinos enviados por el navegador", async () => {
    expect((await POST(request({ ...input, amount: 1 }))).status).toBe(400);
    expect((await POST(request({ ...input, returnUrl: "https://evil.invalid" }))).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("mantiene las ventas cerradas cuando no estÃ¡n verificadas", async () => {
    vi.stubEnv("ORGANIZATION_BILLING_CHECKOUT_ENABLED", "false");
    expect((await POST(request(input))).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalledWith("prepare_pro_onboarding", expect.anything());
  });
  it("un fallo de Stripe conserva el pedido para reintentar, sin crear otro", async () => {
    mocks.start.mockRejectedValue(Error("network"));
    expect(await (await POST(request(input))).json()).toMatchObject({ status: "pending", workspaceId: org, orderId: order });
    await retry(request({ workspaceId: org, orderId: order }, "onboarding/retry"));
    expect(mocks.start).toHaveBeenLastCalledWith(order, "actor", org);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "prepare_pro_onboarding")).toHaveLength(1);
  });
  it("no reintenta un pedido ajeno", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "organization_billing_forbidden" } });
    expect((await retry(request({ workspaceId: org, orderId: order }, "onboarding/retry"))).status).toBe(503);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("espera el webhook sin convertir el retorno del navegador en acceso", async () => {
    mocks.recover.mockRejectedValue(Error("not yet"));
    const req = new NextRequest(`https://franky.es/api/pro/onboarding?workspace=${org}&order=${order}`);
    expect(await (await GET(req)).json()).toMatchObject({ status: "pending" });
    mocks.rpc.mockResolvedValue({ data: { ...state, active: true } });
    expect(await (await GET(req)).json()).toMatchObject({ status: "active", href: `/pro/${org}/guia` });
  });
});
