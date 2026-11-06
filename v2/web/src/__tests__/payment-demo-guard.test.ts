// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { assertRealPaymentActors } from '@/lib/payment-demo-guard';
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.read }) }) }) }) }));
describe('server-controlled payment demo isolation', () => {
  it('rejects a demo actor', async () => {
    m.read.mockResolvedValue({ data: { user_id: 'demo' }, error: null });
    await expect(assertRealPaymentActors('demo')).rejects.toThrow('demo_payments_disabled');
  });
  it('fails closed if registry lookup is unavailable', async () => {
    m.read.mockResolvedValue({ data: null, error: { code: '42P01' } });
    await expect(assertRealPaymentActors('user')).rejects.toThrow('payment_demo_registry_unavailable');
  });
  it('checks both the real buyer and demo seller', async () => {
    m.read.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: { user_id: 'seller' } });
    await expect(assertRealPaymentActors('buyer', 'seller')).rejects.toThrow('demo_payments_disabled');
  });
});
