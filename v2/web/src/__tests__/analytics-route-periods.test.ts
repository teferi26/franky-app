// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as users } from '../app/api/admin/analytics/users/route';
import { GET as leads } from '../app/api/admin/analytics/ambassador-detail/route';
import { GET as product } from '../app/api/admin/analytics/product/route';

type AnalyticsFiltersModule = typeof import('../lib/analytics-filters');

const f = vi.hoisted(() => ({ rpc: vi.fn(), first: vi.fn(), not: vi.fn(), gte: vi.fn(), lt: vi.fn(), limit: vi.fn(), leads: [] as unknown[], error: null as unknown }));
vi.mock('@/lib/analytics-filters', async importOriginal => ({ ...(await importOriginal<AnalyticsFiltersModule>()), requireStaff: async () => ({ ok: true, userId: 'admin', role: 'admin' }) }));
vi.mock('@/lib/supabase-server', () => ({ createRequestSupabase: async () => {
  const q: any = { select: () => q, order: () => q, limit: (n: number) => { f.limit(n); return q; }, maybeSingle: f.first, not: (...args: unknown[]) => { f.not(...args); return q; }, gte: (...args: unknown[]) => { f.gte(...args); return q; }, lt: (...args: unknown[]) => { f.lt(...args); return q; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: f.leads, error: f.error }).then(resolve) };
  return { rpc: f.rpc, from: () => q };
} }));
const req = (path: string, query: string) => new NextRequest(`https://example.invalid/api/admin/analytics/${path}?${query}`);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T10:15:00Z')); vi.clearAllMocks(); f.rpc.mockResolvedValue({ data: [], error: null }); f.first.mockResolvedValue({ data: null, error: null }); f.leads = []; f.error = null; });
afterEach(() => vi.useRealTimers());

describe('Analytics routes report the period and filters actually applied', () => {
  it('uses both historic calendar boundaries for the signup series and profile cohort', async () => {
    const response = await users(req('users', 'range=custom:2026-03-28,2026-03-30&year=2junk,3&city=Madrid'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(f.rpc).toHaveBeenCalledWith('admin_signups_daily', { p_start: '2026-03-28', p_end: '2026-03-30', p_filters: { city: ['Madrid'], year: [3], since: '2026-03-28T00:00:00.000Z', until: '2026-03-31T00:00:00.000Z' } });
    expect((await response.json())._scope).toMatchObject({ applied_profile_filters: { city: ['Madrid'], year: [3] }, series_start: '2026-03-28', series_end_inclusive: '2026-03-30', profile_registration_window: { until_exclusive: '2026-03-31T00:00:00.000Z' } });
  });
  it('starts all-time charts at the first real registration without narrowing demographics', async () => {
    f.first.mockResolvedValue({ data: { created_at: '2025-11-15T11:00:00Z' }, error: null }); const response = await users(req('users', 'range=all'));
    expect(f.rpc).toHaveBeenCalledWith('admin_signups_daily', { p_start: '2025-11-15', p_end: '2026-09-06', p_filters: {} }); expect(response.status).toBe(200);
  });
  it('does not let a future-dated first row invert the chart interval', async () => {
    f.first.mockResolvedValue({ data: { created_at: '2027-11-15T11:00:00Z' }, error: null }); await users(req('users', 'range=all'));
    expect(f.rpc).toHaveBeenCalledWith('admin_signups_daily', { p_start: '2026-09-06', p_end: '2026-09-06', p_filters: {} });
  });
  it('fails clearly when historical coverage cannot be established', async () => {
    f.first.mockResolvedValue({ data: null, error: { message: 'offline' } }); expect((await users(req('users', 'range=all'))).status).toBe(500);
    expect(f.rpc).not.toHaveBeenCalledWith('admin_signups_daily', expect.anything());
  });
  it('excludes discarded attributed profiles and includes the entire selected final day', async () => {
    f.leads = Array.from({ length: 301 }, (_, i) => ({ full_name: `Fixture ${i}` })); const response = await leads(req('ambassador-detail', 'range=custom:2026-08-01,2026-08-31&city=Madrid'));
    expect(f.not).toHaveBeenCalledWith('is_discarded', 'is', true); expect(f.gte).toHaveBeenCalledWith('created_at', '2026-08-01T00:00:00.000Z'); expect(f.lt).toHaveBeenCalledWith('created_at', '2026-09-01T00:00:00.000Z'); expect(f.limit).toHaveBeenCalledWith(301);
    const body = await response.json(); expect(body.leads).toHaveLength(300); expect(body._scope).toMatchObject({ truncated: true, limit: 300, ignored_profile_filters: ['city'] }); expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('does not mark an exact 300-row result as truncated', async () => {
    f.leads = Array.from({ length: 300 }, () => ({})); expect((await (await leads(req('ambassador-detail', 'range=30d'))).json())._scope.truncated).toBe(false);
  });
  it('exports the sanitized filters passed to the product RPC', async () => {
    const response = await product(req('product', 'range=7d&gender=invalid,mujer&university=not-a-uuid'));
    expect((await response.json())._scope.applied_profile_filters).toEqual({ gender: ['mujer'] });
  });
  it('does not certify a null product source as complete', async () => {
    f.rpc.mockResolvedValue({ data: null, error: null }); expect((await product(req('product', 'range=7d'))).status).toBe(503);
  });
});
