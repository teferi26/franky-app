// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

/** Devoluciones y disputas de Origin por webhook: la metadata va en el PaymentIntent, no en el cargo. */
const m = vi.hoisted(() => ({ intent: vi.fn(), charge: vi.fn(), list: vi.fn(), dispute: vi.fn(), transfer: vi.fn(), reversals: vi.fn(), reverse: vi.fn(),
  rpc: vi.fn(), maybeSingle: vi.fn(), directIntent: vi.fn() }));
vi.mock('@/lib/origin-stripe', () => ({ ORIGIN_MERCHANT_ACCOUNT: 'acct_1UFdIBDJDdryynxQ', originMerchantAccount: vi.fn(),
  getOriginStripe: () => ({ paymentIntents: { retrieve: m.directIntent } }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ accounts: { retrieve: async () => ({ id: 'acct_1QBf2CEa4An6HvQo' }) },
  checkout: { sessions: { list: m.list } }, paymentIntents: { retrieve: m.intent }, charges: { retrieve: m.charge },
  disputes: { retrieve: m.dispute }, transfers: { retrieve: m.transfer, listReversals: m.reversals, createReversal: m.reverse } }) }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: m.rpc, from: () => {
  const q: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'in', 'update']) q[k] = () => q;
  q.maybeSingle = () => m.maybeSingle(); q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve); return q;
} }) }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
import { handleOriginWebhook, originCheckoutParams, tokenHash, type OriginOrder } from '@/lib/origin-checkout';

const organizer = '00000000-0000-4000-8000-000000000003', destination = 'acct_organizer';
function order(): OriginOrder {
  const o: OriginOrder = { id: '00000000-0000-4000-8000-000000000001', event_id: '00000000-0000-4000-8000-000000000002', token_hash: tokenHash('a'.repeat(64)),
    buyer_name: 'Buyer', buyer_email: 'buyer@example.test', size: 'M', amount_cents: 3490, currency: 'eur', stripe_account: 'acct_1QBf2CEa4An6HvQo',
    livemode: true, status: 'paid', created_at: new Date().toISOString(), paid_at: null, checkout_params: null, stripe_session_id: 'cs_live', stripe_payment_intent: 'pi_paid',
    receipt_sent_at: 'x', routing_version: 2, organizer_id: organizer, destination_account: destination, application_fee_cents: null,
    event_snapshot: { title: 'ORIGIN', start_at: '2026-10-01T10:00:00Z', venue: 'Hotel', city: 'Altea', address: null } };
  o.checkout_params = originCheckoutParams(o); o.application_fee_cents = o.checkout_params.payment_intent_data!.application_fee_amount!;
  return o;
}
const event = (type: string, object: Record<string, unknown>) => ({ id: 'evt_origin', type, livemode: true, data: { object } }) as unknown as Stripe.Event;
beforeEach(() => {
  vi.clearAllMocks();
  const o = order();
  m.maybeSingle.mockResolvedValue({ data: o, error: null });
  m.intent.mockResolvedValue({ id: 'pi_paid', livemode: true, metadata: { mode: 'origin_event', order_id: o.id, event_id: o.event_id } });
  m.rpc.mockResolvedValue({ data: null, error: null });
  m.list.mockResolvedValue({ data: [] });
  m.reversals.mockImplementation(() => ({ async *[Symbol.asyncIterator]() {} }));
});

describe('Origin refunds and disputes', () => {
  it('recognises a refund whose charge carries no metadata by reading the PaymentIntent', async () => {
    // Sin la sesión el conciliador lanza: lo que importa es que el evento ya se reconoce como de Origin.
    await expect(handleOriginWebhook(event('charge.refunded', { id: 'ch_paid', object: 'charge', payment_intent: 'pi_paid', metadata: {} }))).rejects.toThrow('Refund checkout not found');
    expect(m.intent).toHaveBeenCalledWith('pi_paid');
    expect(m.list).toHaveBeenCalledWith({ payment_intent: 'pi_paid', limit: 2 });
  });
  it.each(['refund.created', 'refund.updated'])('handles %s for Origin orders too', async type => {
    await expect(handleOriginWebhook(event(type, { id: 're_1', object: 'refund', payment_intent: 'pi_paid', charge: 'ch_paid' }))).rejects.toThrow('Refund checkout not found');
    expect(m.list).toHaveBeenCalled();
  });
  it('ignores refunds of other flows', async () => {
    m.intent.mockResolvedValue({ id: 'pi_other', livemode: true, metadata: { mode: 'marketplace', order_id: 'x' } });
    expect(await handleOriginWebhook(event('charge.refunded', { id: 'ch_other', object: 'charge', payment_intent: 'pi_other', metadata: {} }))).toBe(false);
    expect(m.list).not.toHaveBeenCalled();
  });
  it('records an Origin dispute and reverses the organizer transfer (routing 2)', async () => {
    m.dispute.mockResolvedValue({ id: 'dp_origin', status: 'needs_response', amount: 3490, currency: 'eur', reason: 'fraudulent', livemode: true, charge: 'ch_paid', payment_intent: 'pi_paid' });
    m.charge.mockResolvedValue({ id: 'ch_paid', amount: 3490, payment_intent: 'pi_paid', transfer: 'tr_paid' });
    m.transfer.mockResolvedValue({ id: 'tr_paid', amount: 3000, amount_reversed: 0 });
    m.reverse.mockResolvedValue({ id: 'trr_origin', amount: 3000 });
    expect(await handleOriginWebhook(event('charge.dispute.created', { id: 'dp_origin', object: 'dispute', payment_intent: 'pi_paid', charge: 'ch_paid' }))).toBe(true);
    expect(m.reverse).toHaveBeenCalledWith('tr_paid', expect.objectContaining({ amount: 3000 }), { idempotencyKey: 'dispute-reversal:dp_origin' });
    expect(m.rpc).toHaveBeenCalledWith('record_payment_dispute', expect.objectContaining({ p_source: 'origin', p_origin_order: order().id, p_reversal_status: 'reversed' }));
  });
});
