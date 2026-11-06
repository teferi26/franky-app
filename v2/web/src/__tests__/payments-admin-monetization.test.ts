// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Panel de ingresos completo y neto de IVA (auditoría 23-sep-2026). */
const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  orgError: false,
  failTable: '' as string,
  housingReady: false,
}));
vi.mock('@/lib/housing-billing-release', () => ({ housingDeferredBillingReady: () => state.housingReady }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({
  rpc: async () => state.orgError ? { data: null, error: { message: 'missing' } } : { data: { available: true, active: 2, mrr_net_cents: 5800 }, error: null },
  from: (table: string) => ({ select: (_columns: string, options?: { head?: boolean }) => {
    const query: Record<string, unknown> = {};
    const conditions: Record<string, unknown> = {};
    for (const key of ['gt', 'gte', 'in']) query[key] = () => query;
    query.eq = (key: string, value: unknown) => { conditions[key] = value; return query; };
    query.range = async (from: number, to: number) => state.failTable === table
      ? { data: null, error: { message: 'unavailable' } }
      : { data: (state.rows[table] ?? []).slice(from, to + 1), error: null };
    // Plan Propietario: un pagador mensual, ninguno trimestral ni en prueba.
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      count: options?.head && conditions.status === 'active' && !conditions.billing ? 1 : 0, error: null }).then(resolve);
    return query;
  } }),
}) }));
import { loadAdminMonetization, marketplaceCommissionCents } from '@/lib/admin-monetization';

const summary = { active_subscriptions: { total_paying: 1 }, mrr_normalized: 9.99, arr_estimate: 119.88, avg_revenue_per_paying_user: 9.99 };
const supabase = { rpc: async () => ({ data: summary, error: null }) };
beforeEach(() => { state.rows = {}; state.orgError = false; state.failTable = ''; state.housingReady = false; });
const net = (eur: number) => Math.round(eur / 1.21 * 100) / 100;

describe('marketplace commission', () => {
  it('uses the recorded Franky fee, never the Stripe processing estimate, and discounts refunds', () => {
    expect(marketplaceCommissionCents({ type: 'visit', amount_cents: 2000, application_fee_cents: 260, refunded_cents: 0, metadata: { franky_fee_cents: 200, stripe_fee_cents: 60 } })).toBe(200);
    expect(marketplaceCommissionCents({ type: 'visit', amount_cents: 2000, application_fee_cents: 260, refunded_cents: 1000, metadata: { franky_fee_cents: 200 } })).toBe(100);
    expect(marketplaceCommissionCents({ type: 'rent', amount_cents: 50000, application_fee_cents: 3275, refunded_cents: 50000, metadata: {} })).toBe(0);
  });
  it('estimates the commission of legacy rows without a breakdown (rent 5%)', () => {
    expect(marketplaceCommissionCents({ type: 'rent', amount_cents: 50000, application_fee_cents: 3275, refunded_cents: 0, metadata: {} })).toBe(2500);
  });
});

describe('admin monetization sources', () => {
  it('adds app, organization, marketplace, Origin and Card revenue and reports MRR net of VAT', async () => {
    state.rows.native_entitlements = [{ entitlement: 'franky.pro', product_id: 'pro_monthly' }, { entitlement: 'franky.premium', product_id: 'premium_annual' }];
    state.rows.payments = [
      { type: 'visit', amount_cents: 2000, application_fee_cents: 260, refunded_cents: 0, metadata: { franky_fee_cents: 200 }, status: 'succeeded' },
      { type: 'ticket', amount_cents: 1000, application_fee_cents: 120, refunded_cents: 1000, metadata: { franky_fee_cents: 80 }, status: 'refunded' },
    ];
    state.rows.origin_event_orders = [{ amount_cents: 3490, refunded_cents: 0, routing_version: 2, livemode: true, status: 'paid' },
      { amount_cents: 3490, refunded_cents: 0, routing_version: 3, livemode: true, status: 'paid' }];
    state.rows.franky_card_orders = [{ amount_cents: 1210, refunded_cents: 0, status: 'paid', environment: 'live' }];
    const result = await loadAdminMonetization(supabase as never);
    expect(result).not.toBeNull();
    // Bruto con IVA: RPC 9,99 + propietario 80 + app 4,99 + 79,99/12. Organizaciones (58 €) ya netas.
    const grossVat = 9.99 + 80 + 4.99 + 79.99 / 12;
    expect(result!.mrr_normalized).toBe(Math.round((grossVat / 1.21 + 58) * 100) / 100);
    expect(result!.mrr_is_net_of_vat).toBe(true);
    expect(result!.active_subscriptions).toMatchObject({ native_app: 2, organizations: 2, total_paying: 1 + 1 + 2 + 2 });
    const breakdown = result!.revenue_breakdown as { one_off_30d_net: Record<string, number>; one_off_30d_refunded_eur: number };
    expect(breakdown.one_off_30d_net).toMatchObject({ marketplace_visit: net(2), marketplace_ticket: 0, franky_card: net(12.1) });
    expect(breakdown.one_off_30d_net.origin_commission).toBeGreaterThan(0);
    expect(breakdown.one_off_30d_net).not.toHaveProperty('origin_direct_sales');
    expect(breakdown.one_off_30d_refunded_eur).toBe(10);
    expect(result!.sources_unavailable).toEqual([]);
  });
  it('shows the rest of the panel and names the source when a new one is unavailable', async () => {
    state.orgError = true; state.failTable = 'payments';
    const result = await loadAdminMonetization(supabase as never);
    expect(result).not.toBeNull();
    expect(result!.sources_unavailable).toEqual(expect.arrayContaining(['organization_subscriptions', 'one_off_revenue']));
    expect(result!.mrr_normalized).toBe(net(9.99 + 80));
  });
  it('never reads deferred housing contracts while that service is off', async () => {
    state.failTable = 'housing_billing_enrollments';
    expect((await loadAdminMonetization(supabase as never))!.sources_unavailable).not.toContain('housing_billing_enrollments');
    state.housingReady = true; state.failTable = ''; state.rows.housing_billing_enrollments = [{ billing: 'quarterly', amount_cents: 19200, state: 'active' }];
    const result = await loadAdminMonetization(supabase as never);
    expect((result!.revenue_breakdown as { recurring_monthly_net: Record<string, number> }).recurring_monthly_net.housing_deferred_contracts).toBe(net(64));
  });
});
