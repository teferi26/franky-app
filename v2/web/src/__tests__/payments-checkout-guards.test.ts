// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** Doble suscripción y precios mal configurados en /api/stripe/checkout (auditoría 23-sep-2026). */
const m = vi.hoisted(() => ({
  create: vi.fn(), price: vi.fn(), expire: vi.fn(), customer: vi.fn(),
  openSessions: [] as Record<string, unknown>[], stripeSubs: [] as Record<string, unknown>[],
  tables: {} as Record<string, unknown>,
}));
const owner = '11111111-1111-4111-8111-111111111111';
function db() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: owner, email: 'owner@example.test' } } }) },
    rpc: vi.fn(),
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const key of ['select', 'eq', 'in', 'limit', 'gt']) chain[key] = () => chain;
      const result = () => ({ data: m.tables[table] ?? null, error: null });
      chain.maybeSingle = async () => result(); chain.single = async () => result();
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: m.tables[table] ?? [], error: null }).then(resolve);
      return chain;
    },
  };
}
const iterable = (rows: () => Record<string, unknown>[]) => () => ({ data: rows(), async *[Symbol.asyncIterator]() { yield* rows(); } });
vi.mock('@/lib/supabase-server', () => ({ createRequestSupabase: async () => db() }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => db() }));
vi.mock('@/lib/stripe-customer', () => ({ getOrCreateOwnedCustomer: m.customer, assertCustomerOwner: vi.fn() }));
vi.mock('@/lib/payment-demo-guard', () => ({ isDemoPaymentActor: async () => false, assertRealPaymentActors: async () => undefined }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock('@/lib/business-checkout', () => ({ BusinessCheckoutError: class extends Error {}, startBusinessCheckout: vi.fn() }));
vi.mock('stripe', () => ({ default: class {
  checkout = { sessions: { create: m.create, expire: m.expire, list: iterable(() => m.openSessions) } };
  prices = { retrieve: m.price };
  subscriptions = { list: iterable(() => m.stripeSubs) };
} }));

let POST: typeof import('@/app/api/stripe/checkout/route').POST;
const PRICES: Record<string, { unit_amount: number; interval: string; interval_count: number }> = {
  price_owner_month: { unit_amount: 8000, interval: 'month', interval_count: 1 },
  price_owner_quarter: { unit_amount: 19200, interval: 'month', interval_count: 3 },
  price_pro_month: { unit_amount: 499, interval: 'month', interval_count: 1 },
  price_pro_year: { unit_amount: 3999, interval: 'year', interval_count: 1 },
};
beforeAll(async () => {
  vi.stubEnv('STRIPE_OWNER_MONTHLY_PRICE_ID', 'price_owner_month'); vi.stubEnv('STRIPE_OWNER_QUARTERLY_PRICE_ID', 'price_owner_quarter');
  vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro_month'); vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_pro_year');
  POST = (await import('@/app/api/stripe/checkout/route')).POST;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture'); vi.stubEnv('HOUSING_DEFERRED_BILLING_READY', 'false'); vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED', 'false');
  m.openSessions = []; m.stripeSubs = []; m.tables = {};
  m.customer.mockResolvedValue('cus_owner');
  m.price.mockImplementation(async (id: string) => ({ id, active: true, currency: 'eur', tax_behavior: 'inclusive', unit_amount: PRICES[id].unit_amount,
    recurring: { interval: PRICES[id].interval, interval_count: PRICES[id].interval_count } }));
  m.create.mockResolvedValue({ id: 'cs_new', status: 'open', url: 'https://checkout.stripe.com/new' });
});
const request = (body: unknown) => new NextRequest('https://franky.es/api/stripe/checkout', { method: 'POST', body: JSON.stringify(body) });

describe('owner plan checkout', () => {
  it('reuses an already open checkout of the same plan instead of opening a second charge', async () => {
    m.openSessions = [{ id: 'cs_open', url: 'https://checkout.stripe.com/open', metadata: { mode: 'owner', supabase_user_id: owner, owner_billing: 'monthly', owner_trial: 'true' } }];
    const response = await POST(request({ mode: 'owner', billing: 'monthly' }));
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.com/open' });
    expect(m.create).not.toHaveBeenCalled();
  });
  it('expires an open checkout of the other cadence and creates the new one with an idempotency key', async () => {
    m.openSessions = [{ id: 'cs_open', url: 'https://checkout.stripe.com/open', metadata: { mode: 'owner', supabase_user_id: owner, owner_billing: 'monthly', owner_trial: 'true' } }];
    expect((await POST(request({ mode: 'owner', billing: 'quarterly' }))).status).toBe(200);
    expect(m.expire).toHaveBeenCalledWith('cs_open');
    expect(m.create.mock.calls[0][1]).toEqual({ idempotencyKey: expect.stringMatching(new RegExp(`^owner-checkout:${owner}:quarterly:true:\\d+$`)) });
  });
  it('does not open a second charge if the old checkout cannot be expired (it may have just been paid)', async () => {
    m.openSessions = [{ id: 'cs_open', url: 'https://checkout.stripe.com/open', metadata: { mode: 'owner', supabase_user_id: owner, owner_billing: 'monthly', owner_trial: 'true' } }];
    m.expire.mockRejectedValue(new Error('already complete'));
    expect((await POST(request({ mode: 'owner', billing: 'quarterly' }))).status).toBe(409);
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each([
    ['amount', { unit_amount: 7000 }], ['tax', { tax_behavior: 'exclusive' }], ['currency', { currency: 'usd' }], ['cadence', { recurring: { interval: 'month', interval_count: 1 } }],
  ])('refuses to charge a quarterly price with the wrong %s (500, no session)', async (_label, patch) => {
    m.price.mockImplementation(async (id: string) => ({ id, active: true, currency: 'eur', tax_behavior: 'inclusive', unit_amount: PRICES[id].unit_amount,
      recurring: { interval: PRICES[id].interval, interval_count: PRICES[id].interval_count }, ...(id === 'price_owner_quarter' ? patch : {}) }));
    const response = await POST(request({ mode: 'owner', billing: 'quarterly' }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('No se ha realizado ningún cobro');
    expect(m.create).not.toHaveBeenCalled();
  });
  it('also validates the promised monthly renewal before selling the quarter', async () => {
    m.price.mockImplementation(async (id: string) => ({ id, active: true, currency: 'eur', tax_behavior: id === 'price_owner_month' ? 'exclusive' : 'inclusive',
      unit_amount: PRICES[id].unit_amount, recurring: { interval: PRICES[id].interval, interval_count: PRICES[id].interval_count } }));
    expect((await POST(request({ mode: 'owner', billing: 'quarterly' }))).status).toBe(500);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('keeps selling prices with unspecified tax behavior (how the live owner prices are configured)', async () => {
    m.price.mockImplementation(async (id: string) => ({ id, active: true, currency: 'eur', tax_behavior: 'unspecified',
      unit_amount: PRICES[id].unit_amount, recurring: { interval: PRICES[id].interval, interval_count: PRICES[id].interval_count } }));
    expect((await POST(request({ mode: 'owner', billing: 'quarterly' }))).status).toBe(200);
    expect(m.create).toHaveBeenCalled();
  });
});

describe('Pro / Premium checkout', () => {
  it('blocks a web subscription when the user already bought one in the app', async () => {
    m.tables.native_entitlements = { entitlement: 'franky.pro' };
    expect((await POST(request({ mode: 'subscription', planId: 'pro', interval: 'month' }))).status).toBe(409);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('blocks when Stripe already has a live Pro subscription the database has not seen yet', async () => {
    m.stripeSubs = [{ id: 'sub_live', status: 'active', items: { data: [{ price: { id: 'price_pro_year' } }] } }];
    expect((await POST(request({ mode: 'subscription', planId: 'pro', interval: 'month' }))).status).toBe(409);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('reuses the open checkout of the same plan and cadence', async () => {
    m.openSessions = [{ id: 'cs_pro', url: 'https://checkout.stripe.com/pro', metadata: { supabase_user_id: owner, plan: 'pro', billing_interval: 'month' } }];
    expect(await (await POST(request({ mode: 'subscription', planId: 'pro', interval: 'month' }))).json()).toEqual({ url: 'https://checkout.stripe.com/pro' });
    expect(m.create).not.toHaveBeenCalled();
  });
  it('creates with idempotency, metadata on the subscription and a validated VAT-inclusive price', async () => {
    expect((await POST(request({ mode: 'subscription', planId: 'pro', interval: 'year' }))).status).toBe(200);
    const [params, options] = m.create.mock.calls[0];
    expect(params).toMatchObject({ line_items: [{ price: 'price_pro_year', quantity: 1 }], automatic_tax: { enabled: true },
      subscription_data: { metadata: { supabase_user_id: owner, plan: 'pro', billing_interval: 'year' } } });
    expect(options.idempotencyKey).toMatch(new RegExp(`^user-checkout:${owner}:pro:year:\\d+$`));
  });
  it('refuses a Pro price that is not VAT inclusive', async () => {
    m.price.mockImplementation(async (id: string) => ({ id, active: true, currency: 'eur', tax_behavior: 'exclusive', unit_amount: PRICES[id].unit_amount,
      recurring: { interval: PRICES[id].interval, interval_count: 1 } }));
    expect((await POST(request({ mode: 'subscription', planId: 'pro', interval: 'month' }))).status).toBe(500);
    expect(m.create).not.toHaveBeenCalled();
  });
});
