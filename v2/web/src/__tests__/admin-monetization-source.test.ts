// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { loadAdminMonetization } from '../lib/admin-monetization';
import { GET as getMonetization } from '../app/api/admin/analytics/monetization/route';
import { GET as getKpis } from '../app/api/admin/analytics/kpis/route';

type AnalyticsFiltersModule = typeof import('../lib/analytics-filters');

const state = vi.hoisted(() => ({
  allowed: true, active: 0 as number | null, quarterly: 0 as number | null, trialing: 0 as number | null,
  reports: 4 as number | null, ownerError: false, reportError: false, summaryError: false,
  calls: [] as { table: string; options: unknown }[],
  summary: { active_subscriptions: { total_paying: 2 }, mrr_normalized: 20, arr_estimate: 240, avg_revenue_per_paying_user: 10 },
}));
const supabase = vi.hoisted(() => ({
  rpc: vi.fn(async (name: string) => ({ data: name === 'admin_monetization_summary' ? state.summary : { pending_reports: 0, mrr_estimate: 999 }, error: state.summaryError ? new Error('unavailable') : null })),
  from: vi.fn(() => ({ select: () => ({ eq: async () => ({ count: state.reports, error: state.reportError ? new Error('unavailable') : null }) }) })),
}));
vi.mock('@/lib/supabase-server', () => ({ createRequestSupabase: async () => supabase }));
vi.mock('@/lib/analytics-filters', async importOriginal => ({
  ...(await importOriginal<AnalyticsFiltersModule>()),
  requireStaff: async () => state.allowed
    ? { ok: true, userId: 'admin', role: 'admin' }
    : { ok: false, response: NextResponse.json({ error: 'mfa_required' }, { status: 403 }) },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({
  // Fuentes nuevas del panel (auditoría 23-sep): vacías en estas pruebas.
  rpc: async () => ({ data: { available: true, active: 0, mrr_net_cents: 0 }, error: null }),
  from: (table: string) => ({ select: (_columns: string, options: unknown) => {
  state.calls.push({ table, options }); const conditions: Record<string, string> = {};
  const query = { eq: (key: string, value: string) => { conditions[key] = value; return query; }, gt: () => query, gte: () => query, in: () => query,
    range: async () => ({ data: [], error: null }),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ count: conditions.status === 'trialing' ? state.trialing : conditions.billing ? state.quarterly : state.active, error: state.ownerError ? new Error('unavailable') : null })) };
  return query;
} }) }) }));
// El MRR del panel es NETO de IVA (precios con IVA incluido / 1,21).
const net = (gross: number) => Math.round(gross / 1.21 * 100) / 100;
beforeEach(() => { state.allowed = true; state.active = 0; state.quarterly = 0; state.trialing = 0; state.reports = 4; state.ownerError = false; state.reportError = false; state.summaryError = false; state.calls = []; supabase.rpc.mockClear(); supabase.from.mockClear(); });
const request = (path: string) => new NextRequest(`https://franky.es/api/admin/analytics/${path}`);

describe('One complete monetization source for web and mobile API callers', () => {
  it('counts more than 1,000 owners without fetching a truncated row list', async () => {
    state.active = 1002; state.quarterly = 1; state.trialing = 12;
    const result = await loadAdminMonetization(supabase as never);
    expect(result?.mrr_normalized).toBe(net(20 + 1001 * 80 + 64)); expect(result?.mrr_gross).toBe(20 + 1001 * 80 + 64); expect(result?.owner_plan_trialing).toBe(12);
    expect(result?.active_subscriptions.total_paying).toBe(1004);
    const ownerCalls = state.calls.filter(call => call.table === 'owner_subscriptions'); expect(ownerCalls).toHaveLength(3); expect(ownerCalls.every(call => (call.options as { count: string; head: boolean }).count === 'exact' && (call.options as { head: boolean }).head)).toBe(true);
  });
  it('never promotes owner trial accounts to revenue', async () => { state.trialing = 30; expect((await loadAdminMonetization(supabase as never))?.mrr_normalized).toBe(net(20)); });
  it.each(['ownerError', 'summaryError', 'missingCount', 'inconsistentCount'])('refuses incomplete or inconsistent sources: %s', async failure => {
    if (failure === 'ownerError') state.ownerError = true;
    if (failure === 'summaryError') state.summaryError = true;
    if (failure === 'missingCount') state.active = null;
    if (failure === 'inconsistentCount') state.quarterly = 1;
    expect(await loadAdminMonetization(supabase as never)).toBeNull(); expect((await getMonetization(request('monetization'))).status).toBe(503);
  });
  it('replaces the legacy constant reports and outdated monetary estimate in the overview', async () => {
    state.active = 1;
    const response = await getKpis(request('kpis')); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pending_reports: 4, mrr_estimate: net(100), arr_estimate: Math.round(net(100) * 12 * 100) / 100 });
  });
  it('does not show zero pending reports when their query fails', async () => { state.reportError = true; expect((await getKpis(request('kpis'))).status).toBe(503); });
  it('rejects MFA before any privileged billing query', async () => {
    state.allowed = false; expect((await getMonetization(request('monetization'))).status).toBe(403); expect((await getKpis(request('kpis'))).status).toBe(403);
    expect(state.calls).toHaveLength(0); expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('rejects custom ranges instead of presenting recent KPI counts as historical counts', async () => {
    expect((await getKpis(request('kpis?range=custom:2026-01-01,2026-01-03'))).status).toBe(400); expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
