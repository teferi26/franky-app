// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reconcile: vi.fn() }));
vi.mock('@/lib/organization-billing', () => ({ reconcileOrganizationBillingBatch: mocks.reconcile }));
vi.mock('@/lib/origin-checkout', () => ({ secretMatches: (a: string, b?: string) => !!b && a === b }));
import { GET } from '@/app/api/cron/organization-billing/route';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('CRON_SECRET', 'synthetic'); });
it('requires scheduler authentication before selecting organizations', async () => {
  expect((await GET(new Request('https://franky.es/api/cron/organization-billing'))).status).toBe(401); expect(mocks.reconcile).not.toHaveBeenCalled();
});
it('cannot accept a caller-selected organization, test/live environment, or cohort', async () => {
  mocks.reconcile.mockResolvedValue({ examined: 5, reconciled: 5, failed: 0, invoices: 10 });
  const result = await GET(new Request('https://franky.es/api/cron/organization-billing?environment=live&demo=bad', { headers: { authorization: 'Bearer synthetic' } }));
  expect(result.status).toBe(200); expect(mocks.reconcile.mock.calls).toEqual([[]]); expect(result.headers.get('cache-control')).toBe('no-store');
});
it('reports partial failure for operational alerts instead of claiming a completed reconciliation', async () => {
  mocks.reconcile.mockResolvedValue({ examined: 5, reconciled: 4, failed: 1, invoices: 8 });
  const result = await GET(new Request('https://franky.es/api/cron/organization-billing', { headers: { authorization: 'Bearer synthetic' } }));
  expect(result.status).toBe(503); expect((await result.json()).failed).toBe(1);
});
it('provider and database failures remain retryable without leaking financial details', async () => {
  mocks.reconcile.mockRejectedValue(Error('sensitive provider details'));
  const result = await GET(new Request('https://franky.es/api/cron/organization-billing', { headers: { authorization: 'Bearer synthetic' } }));
  expect(result.status).toBe(503); expect(JSON.stringify(await result.json())).not.toContain('sensitive');
});
