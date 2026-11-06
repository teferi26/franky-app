vi.mock('@/lib/payment-demo-guard', () => ({ assertRealPaymentActors: vi.fn().mockResolvedValue(undefined), isDemoPaymentActor: vi.fn().mockResolvedValue(false) }));
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { businessPriceCents, businessSubscriptionFields } from "@/lib/business-billing";

const m = vi.hoisted(() => ({ user: vi.fn(), listing: vi.fn(), existing: vi.fn(), create: vi.fn(), price: vi.fn(), subscriptions: vi.fn(), customer: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createRequestSupabase: async () => ({ auth: { getUser: m.user }, from: (table: string) => {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "limit"]) query[method] = () => query;
  query.single = m.listing; query.maybeSingle = m.existing; return query;
} }) }));
vi.mock("@/lib/stripe-customer", () => ({ getOrCreateOwnedCustomer: m.customer }));
vi.mock("@/lib/housing-billing", () => ({ startHousingEnrollment: vi.fn(async () => ({ url: "https://checkout.stripe.com/setup-fixture" })), HousingBillingError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/business-checkout", () => ({ startBusinessCheckout: (_stripe: unknown, input: { params: unknown }) => m.create(input.params), BusinessCheckoutError: class extends Error {} }));
vi.mock("stripe", () => ({ default: class { checkout = { sessions: { create: m.create } }; prices = { retrieve: m.price }; subscriptions = { list: m.subscriptions }; } }));
let POST: typeof import("@/app/api/stripe/checkout/route").POST;
beforeAll(async () => {
  vi.stubEnv("STRIPE_LEISURE_YEARLY_PRICE_ID", "price_year");
  vi.stubEnv("STRIPE_LEISURE_PRICE_ID", "price_month");
  vi.stubEnv("STRIPE_HOUSING_PRICE_ID", "price_housing");
  POST = (await import("@/app/api/stripe/checkout/route")).POST;
});
const owner = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const price = (interval = "year") => ({ active: true, unit_amount: interval === "year" ? 10000 : 999, currency: "eur", recurring: { interval, interval_count: 1 }, tax_behavior: "inclusive" });
const request = (patch = {}) => new NextRequest("https://franky.es/api/stripe/checkout", { method: "POST", body: JSON.stringify({ mode: "business", businessType: "leisure", listingId, interval: "year", ...patch }) });
beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('HOUSING_DEFERRED_BILLING_READY', 'false');
  vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED', 'false');
  vi.clearAllMocks(); m.user.mockResolvedValue({ data: { user: { id: owner } } });
  m.listing.mockResolvedValue({ data: { id: listingId, owner_id: owner } }); m.existing.mockResolvedValue({ data: null });
  m.customer.mockResolvedValue("cus_owner"); m.price.mockResolvedValue(price());
  m.subscriptions.mockImplementation(() => (async function* () {})());
  m.create.mockResolvedValue({ url: "https://checkout.stripe.com/fixture" });
});

describe("business annual checkout", () => {
  it('does not create a customer or checkout for a demo account', async () => {
    const { isDemoPaymentActor } = await import('@/lib/payment-demo-guard');
    vi.mocked(isDemoPaymentActor).mockResolvedValueOnce(true);
    expect((await POST(request())).status).toBe(403);
    expect(m.customer).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("charges the fixed annual price for the owned leisure listing and carries cadence to Stripe", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(m.create.mock.calls[0][0]).toMatchObject({ mode: "subscription", customer: "cus_owner", line_items: [{ price: "price_year", quantity: 1 }], automatic_tax: { enabled: true }, metadata: { billing_interval: "year", listing_id: listingId }, subscription_data: { metadata: { billing_interval: "year" } } });
  });
  it("keeps old callers monthly by default", async () => {
    m.price.mockResolvedValue(price("month"));
    expect((await POST(request({ interval: undefined }))).status).toBe(200);
    expect(m.create.mock.calls[0][0].line_items[0].price).toBe("price_month");
  });
  it("preserves the legacy housing subscription while the deferred offer is disabled", async () => {
    m.price.mockResolvedValue(price("month"));
    expect((await POST(request({ businessType: "housing", interval: "month" }))).status).toBe(200);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({mode:'subscription',line_items:[{price:'price_housing',quantity:1}]}));
    const { startHousingEnrollment } = await import("@/lib/housing-billing");
    expect(startHousingEnrollment).not.toHaveBeenCalled();
  });
  it('uses deferred setup only after the service, dedicated prices and explicit offer consent are enabled',async()=>{
    vi.stubEnv('HOUSING_DEFERRED_BILLING_READY','true');vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED','true');
    for(const name of ['LISTING','MONTHLY','QUARTERLY'])vi.stubEnv('STRIPE_HOUSING_DEFERRED_'+name+'_PRICE_ID','price_deferred_'+name);
    expect((await POST(request({businessType:'housing',interval:'month',offerVersion:'first-interest-v1'}))).status).toBe(200);
    const {startHousingEnrollment}=await import('@/lib/housing-billing');
    expect(startHousingEnrollment).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({billing:'listing',listing:listingId,offerVersion:'first-interest-v1'}));expect(m.create).not.toHaveBeenCalled();
  });
  it.each([{ businessType: "housing" }, { interval: "week" }, { amount: 1 }, { priceId: "attacker" }])("rejects unsupported or client-priced payloads %j", async patch => {
    expect((await POST(request(patch))).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => { m.user.mockResolvedValue({ data: { user: null } }); expect((await POST(request())).status).toBe(401); expect(m.customer).not.toHaveBeenCalled(); });
  it("requires ownership", async () => { m.listing.mockResolvedValue({ data: { owner_id: "other" } }); expect((await POST(request())).status).toBe(404); expect(m.create).not.toHaveBeenCalled(); });
  it.each([{ data: { id: "already-active" } }, { data: null, error: { message: "database unavailable" } }])("does not charge when subscription verification fails %j", async result => {
    m.existing.mockResolvedValue(result); expect((await POST(request())).status).toBe(result.error ? 500 : 409); expect(m.create).not.toHaveBeenCalled();
  });
  it("detects an existing Stripe subscription before its webhook arrives", async () => {
    m.subscriptions.mockImplementation(() => (async function* () { yield { metadata: { listing_id: listingId }, status: "past_due" }; })());
    expect((await POST(request())).status).toBe(409); expect(m.create).not.toHaveBeenCalled();
  });
  it.each([{ unit_amount: 999 }, { currency: "usd" }, { recurring: { interval: "month", interval_count: 1 } }, { tax_behavior: "exclusive" }, { active: false }])("fails closed for wrong configured price %j", async patch => {
    m.price.mockResolvedValue({ ...price(), ...patch }); expect((await POST(request())).status).toBe(500); expect(m.create).not.toHaveBeenCalled();
  });
});

describe("Stripe billing mirror", () => {
  const subscription = (patch = {}) => ({ status: "active", metadata: { business_type: "leisure", billing_interval: "month" }, cancel_at_period_end: false, items: { data: [{ price: price(), quantity: 1, current_period_end: 2000000000 }] }, ...patch });
  it("reads the real annual price, not stale metadata, and its renewal date", () => {
    expect(businessSubscriptionFields(subscription() as never)).toMatchObject({ billing_interval: "year", amount_cents: 10000, current_period_end: new Date(2000000000000).toISOString(), status: "active" });
  });
  it("preserves a cancelled renewal without ending paid access", () => {
    expect(businessSubscriptionFields(subscription({ cancel_at_period_end: true }) as never)).toMatchObject({ cancel_at_period_end: true, status: "active" });
  });
  it.each(["canceled", "past_due", "incomplete", "unpaid"])("preserves status %s instead of marking it active", status => {
    expect(businessSubscriptionFields(subscription({ status }) as never).status).toBe(status);
  });
  it("maps expired unpaid checkouts to a final state", () => expect(businessSubscriptionFields(subscription({ status: "incomplete_expired" }) as never).status).toBe("canceled"));
  it("rejects annual housing", () => expect(() => businessSubscriptionFields(subscription({ metadata: { business_type: "housing" } }) as never)).toThrow());
  it("rejects missing items", () => expect(() => businessSubscriptionFields(subscription({ items: { data: [] } }) as never)).toThrow());
  it("only leisure has an annual public price", () => { expect(businessPriceCents("leisure", "year")).toBe(10000); expect(businessPriceCents("housing", "month")).toBe(999); expect(() => businessPriceCents("housing", "year")).toThrow(); });
});
