// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { marketplacePay } from '@/lib/marketplace-pay-route';

const m = vi.hoisted(() => ({ previous: null as any, checkout: vi.fn(), discount: vi.fn(), guard: vi.fn() }));
const ticketId = '12345678-1234-4234-8234-123456789012';
function query(data: unknown) {
  const q: any = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) q[method] = () => q;
  q.maybeSingle = q.single = async () => ({ data, error: null });
  return q;
}
vi.mock('@/lib/supabase-server', () => ({ createRequestSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'buyer' } } }) },
  from: (table: string) => query(table === 'event_tickets'
    ? { id: ticketId, event_id: 'event', holder_id: 'buyer', status: 'pending_payment', price_cents: 1000 }
    : { title: 'Event', organizer_id: 'seller' }), rpc: m.discount,
}) }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ from: () => query(m.previous) }) }));
vi.mock('@/lib/connect', () => ({ getSellerConnectAccount: async () => ({ charges_enabled: true, stripe_connect_account_id: 'acct_seller' }), refreshConnectAccount: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock('@/lib/marketplace-checkout', () => ({ startMarketplaceCheckout: m.checkout }));
vi.mock('@/lib/payment-demo-guard', () => ({ assertRealPaymentActors: m.guard }));
beforeEach(() => { vi.clearAllMocks(); m.guard.mockResolvedValue(undefined); m.previous = null; m.checkout.mockResolvedValue({ status: 'checkout', order_id: 'order', url: 'https://checkout.stripe.com/test' }); });
function request(extra: object = {}) { return new NextRequest('https://franky.es/api/stripe/pay/ticket', { method: 'POST', body: JSON.stringify({ ticket_id: ticketId, ...extra }) }); }

describe('server-side ticket retry quote', () => {
  it('restores the exact discount when a resumed native checkout omits its code', async () => {
    m.previous = { amount_cents: 600, metadata: { discount_code: 'LASTUSE' } };
    expect((await marketplacePay(request({ return_to: 'app' }), 'ticket')).status).toBe(200);
    expect(m.checkout).toHaveBeenCalledWith(expect.objectContaining({ amount: 600, code: 'LASTUSE', successUrl: 'https://franky.es/pago/retorno?pay=ok' }));
    expect(m.discount).not.toHaveBeenCalled();
  });
  it('refuses to silently replace a frozen discount with another code', async () => {
    m.previous = { amount_cents: 600, metadata: { discount_code: 'FIRST' } };
    expect((await marketplacePay(request({ code: 'SECOND' }), 'ticket')).status).toBe(409);
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it('revalidates the code on a new order and keeps web return compatibility', async () => {
    m.discount.mockResolvedValue({ data: { valid: true, discount_cents: 200 } });
    expect((await marketplacePay(request({ code: 'NEW' }), 'ticket')).status).toBe(200);
    expect(m.checkout).toHaveBeenCalledWith(expect.objectContaining({ amount: 800, code: 'NEW', successUrl: 'https://franky.es/mis-entradas?pay=ok' }));
  });
  it('prevents demo buyers from reaching a real checkout', async () => {
    m.guard.mockRejectedValue(new Error('demo_payments_disabled'));
    const response = await marketplacePay(request(), 'ticket');
    expect(response.status).toBe(403); expect(m.checkout).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ status: 'failed' });
  });
});
