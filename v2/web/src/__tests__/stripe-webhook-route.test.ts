// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';

type StripeModule = typeof import('stripe');

/**
 * Webhook de Stripe (auditoría de pagos 23-sep-2026): firma, idempotencia por
 * event.id, checkout completado, updated tardío tras deleted y disputas. Firma
 * REAL (HMAC de Stripe); solo se sustituyen las llamadas a la API de Stripe y
 * a Supabase.
 */
const SECRET = 'whsec_test_fixture';
const api = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn() },
  paymentIntents: { retrieve: vi.fn() },
  disputes: { retrieve: vi.fn() },
  charges: { retrieve: vi.fn() },
  transfers: { retrieve: vi.fn(), listReversals: vi.fn(), createReversal: vi.fn() },
  subscriptionSchedules: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
  refunds: { list: vi.fn() },
}));
const db = vi.hoisted(() => ({
  ledger: new Map<string, string>(),
  rpc: [] as [string, Record<string, unknown>][],
  writes: [] as { table: string; op: string; payload: unknown; filters: [string, unknown][] }[],
  rows: {} as Record<string, unknown>,
  failRpc: '' as string,
}));

vi.mock('stripe', async importOriginal => {
  const Real = (await importOriginal<StripeModule>()).default;
  class FakeStripe extends (Real as unknown as new (key: string) => object) {
    constructor() {
      super('sk_test_fixture');
      Object.assign(this, api);
    }
  }
  return { default: FakeStripe };
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const from = (table: string) => {
      const call = { table, op: 'select', payload: undefined as unknown, filters: [] as [string, unknown][] };
      const result = () => {
        if (call.op !== 'select') db.writes.push(call);
        const key = `${table}.${call.op}`;
        return { data: key in db.rows ? db.rows[key] : null, error: null };
      };
      const q: Record<string, unknown> = {};
      for (const op of ['update', 'upsert', 'insert']) q[op] = (payload: unknown) => { call.op = op; call.payload = payload; return q; };
      q.select = () => q;
      for (const filter of ['eq', 'in', 'contains', 'limit', 'gt']) q[filter] = (...args: unknown[]) => { call.filters.push([filter, args]); return q; };
      q.single = async () => result();
      q.maybeSingle = async () => result();
      q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return q;
    };
    const rpc = async (name: string, args: Record<string, unknown>) => {
      db.rpc.push([name, args]);
      if (db.failRpc === name) return { data: null, error: { message: 'unavailable' } };
      if (name === 'claim_webhook_event_v2') {
        if (db.ledger.get(args.p_event_id as string) === 'succeeded') return { data: { duplicate: true }, error: null };
        if (db.ledger.get(args.p_event_id as string) === 'processing') return { data: { busy: true }, error: null };
        db.ledger.set(args.p_event_id as string, 'processing');
        return { data: { duplicate: false, token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, error: null };
      }
      if (name === 'finish_webhook_event_v2') {
        db.ledger.set(args.p_event_id as string, args.p_status as string);
        return { data: { finished: true }, error: null };
      }
      return { data: null, error: null };
    };
    return { from, rpc };
  },
}));
vi.mock('@/lib/franky-card-billing', () => ({ handleFrankyCardWebhook: async () => false }));
vi.mock('@/lib/organization-billing', () => ({ handleOrganizationBillingWebhook: async () => false }));
vi.mock('@/lib/origin-checkout', () => ({ handleOriginWebhook: async () => false }));
vi.mock('@/lib/housing-billing', () => ({ handleHousingBillingWebhook: async () => false }));
vi.mock('@/lib/connect', () => ({ refreshConnectAccount: vi.fn() }));
vi.mock('@/lib/origin-partner', () => ({ ORIGIN_MERCHANT_ACCOUNT: 'acct_origin_fixture' }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: 'email' })) }));

let POST: typeof import('@/app/api/stripe/webhook/route').POST;
let signer: { webhooks: { generateTestHeaderString: (opts: { payload: string; secret: string }) => string } };
beforeAll(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fixture');
  POST = (await import('@/app/api/stripe/webhook/route')).POST;
  const Real = (await vi.importActual<typeof import('stripe')>('stripe')).default;
  signer = new Real('sk_test_fixture') as unknown as typeof signer;
}, 60_000);
beforeEach(() => {
  vi.clearAllMocks();
  db.ledger.clear(); db.rpc = []; db.writes = []; db.rows = {}; db.failRpc = '';
  api.transfers.listReversals.mockImplementation(() => ({ async *[Symbol.asyncIterator]() {} }));
});

let seq = 0;
function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_${++seq}`) {
  return { id, object: 'event', type, livemode: false, created: 1758600000, api_version: '2026-08-27', data: { object } } as unknown as Stripe.Event;
}
function signed(event: Stripe.Event, signature?: string | null) {
  const payload = JSON.stringify(event);
  const headers: Record<string, string> = {};
  const header = signature === undefined ? signer.webhooks.generateTestHeaderString({ payload, secret: SECRET }) : signature;
  if (header !== null) headers['stripe-signature'] = header;
  return new NextRequest('https://franky.es/api/stripe/webhook', { method: 'POST', body: payload, headers });
}
const period = { current_period_start: 1758600000, current_period_end: 1761278400 };
const writesTo = (table: string, op?: string) => db.writes.filter(w => w.table === table && (!op || w.op === op));

describe('Stripe webhook: signature', () => {
  it('rejects a request without the stripe-signature header with an explicit 400', async () => {
    const response = await POST(signed(stripeEvent('checkout.session.completed', {}), null));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing signature' });
    expect(db.rpc).toHaveLength(0);
  });
  it('rejects an invalid signature with 400 and never touches the database', async () => {
    const response = await POST(signed(stripeEvent('checkout.session.completed', {}), 't=1758600000,v1=deadbeef'));
    expect(response.status).toBe(400);
    expect(db.rpc).toHaveLength(0); expect(db.writes).toHaveLength(0);
  });
});

describe('Stripe webhook: processing', () => {
  const proSession = { id: 'cs_pro', object: 'checkout.session', metadata: { supabase_user_id: 'user_1', plan: 'pro' }, subscription: 'sub_pro', customer: 'cus_1' };
  const proSub = { id: 'sub_pro', object: 'subscription', status: 'active', customer: 'cus_1', metadata: {}, items: { data: [{ ...period, price: { id: 'price_pro' } }] } };

  it('checkout.session.completed stores the real status and period of a Pro subscription and closes the ledger', async () => {
    api.subscriptions.retrieve.mockResolvedValue(proSub);
    const event = stripeEvent('checkout.session.completed', proSession);
    const response = await POST(signed(event));
    expect(response.status).toBe(200);
    const insert = writesTo('subscriptions', 'insert')[0];
    expect(insert.payload).toMatchObject({ user_id: 'user_1', stripe_subscription_id: 'sub_pro', plan: 'student', status: 'active',
      current_period_start: new Date(period.current_period_start * 1000).toISOString(), current_period_end: new Date(period.current_period_end * 1000).toISOString() });
    expect(db.ledger.get(event.id)).toBe('succeeded');
  });

  it('a repeated event already processed with success is acknowledged without reprocessing', async () => {
    api.subscriptions.retrieve.mockResolvedValue(proSub);
    const event = stripeEvent('checkout.session.completed', proSession);
    expect((await POST(signed(event))).status).toBe(200);
    const writes = db.writes.length;
    const again = await POST(signed(event));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ received: true, duplicate: true });
    expect(api.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    expect(db.writes).toHaveLength(writes);
  });

  it('a failed event is recorded as failed and answered 500 so Stripe retries it', async () => {
    api.subscriptions.retrieve.mockRejectedValue(new Error('stripe down'));
    const event = stripeEvent('checkout.session.completed', proSession);
    expect((await POST(signed(event))).status).toBe(500);
    expect(db.rpc).toContainEqual(['finish_webhook_event_v2', expect.objectContaining({ p_event_id: event.id, p_status: 'failed', p_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })]);
    // El reintento sí se procesa (no se marca como duplicado).
    api.subscriptions.retrieve.mockResolvedValue(proSub);
    expect((await POST(signed(event))).status).toBe(200);
    expect(db.ledger.get(event.id)).toBe('succeeded');
  });

  it('requests retry without processing when the durable ledger is unavailable', async () => {
    db.failRpc = 'claim_webhook_event_v2';
    api.subscriptions.retrieve.mockResolvedValue(proSub);
    expect((await POST(signed(stripeEvent('checkout.session.completed', proSession)))).status).toBe(503);
    expect(writesTo('subscriptions', 'insert')).toHaveLength(0);
    expect(api.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('does not acknowledge or process a concurrent in-flight event', async () => {
    const event = stripeEvent('checkout.session.completed', proSession);
    db.ledger.set(event.id, 'processing');
    const response = await POST(signed(event));
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(api.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });

  it('requests retry when effects succeeded but durable completion failed', async () => {
    const event = stripeEvent('checkout.session.completed', proSession);
    db.failRpc = 'finish_webhook_event_v2';
    api.subscriptions.retrieve.mockResolvedValue(proSub);
    expect((await POST(signed(event))).status).toBe(503);
    expect(db.ledger.get(event.id)).toBe('processing');
    expect(writesTo('subscriptions', 'insert')).toHaveLength(1);
  });

  it('a late owner customer.subscription.updated after deleted does not revive the plan', async () => {
    // Snapshot del evento: "active". Estado real en Stripe: cancelada.
    const snapshot = { id: 'sub_owner', object: 'subscription', status: 'active', customer: 'cus_owner',
      metadata: { owner_plan: 'true', supabase_user_id: 'owner_1', owner_billing: 'monthly' }, items: { data: [{ ...period, price: { id: 'price_owner' } }] } };
    api.subscriptions.retrieve.mockResolvedValue({ ...snapshot, status: 'canceled' });
    db.rows['owner_subscriptions.upsert'] = { id: 'owner_sub_row' };
    expect((await POST(signed(stripeEvent('customer.subscription.updated', snapshot))))).toHaveProperty('status', 200);
    expect(api.subscriptions.retrieve).toHaveBeenCalledWith('sub_owner');
    expect(writesTo('owner_subscriptions', 'upsert')[0].payload).toMatchObject({ status: 'canceled', stripe_subscription_id: 'sub_owner' });
    expect(writesTo('accommodations', 'update')[0].payload).toEqual({ is_paid: false });
    expect(api.subscriptionSchedules.create).not.toHaveBeenCalled();
  });

  it('a late Pro customer.subscription.updated after deleted keeps it canceled', async () => {
    api.subscriptions.retrieve.mockResolvedValue({ ...proSub, status: 'canceled' });
    expect((await POST(signed(stripeEvent('customer.subscription.updated', { ...proSub, status: 'active' })))).status).toBe(200);
    expect(writesTo('subscriptions', 'update')[0].payload).toMatchObject({ status: 'canceled' });
  });

  it('an owner cancellation before the checkout row exists is not an error', async () => {
    const sub = { id: 'sub_owner', object: 'subscription', status: 'canceled', metadata: { owner_plan: 'true', supabase_user_id: 'owner_1' } };
    expect((await POST(signed(stripeEvent('customer.subscription.deleted', sub)))).status).toBe(200);
    expect(writesTo('accommodations')).toHaveLength(0);
  });

  it('invoice.payment_failed does not mark past_due when Stripe already recovered the subscription', async () => {
    api.subscriptions.retrieve.mockResolvedValue({ ...proSub, status: 'active' });
    const invoice = { id: 'in_1', object: 'invoice', parent: { subscription_details: { subscription: 'sub_pro' } } };
    expect((await POST(signed(stripeEvent('invoice.payment_failed', invoice)))).status).toBe(200);
    expect(db.writes.filter(w => w.op === 'update')).toHaveLength(0);
  });

  it('a failed quarterly rollover goes to manual review instead of only a log', async () => {
    vi.stubEnv('STRIPE_OWNER_QUARTERLY_PRICE_ID', 'price_quarter');
    vi.stubEnv('STRIPE_OWNER_MONTHLY_PRICE_ID', 'price_month');
    const sub = { id: 'sub_q', object: 'subscription', status: 'active', customer: 'cus_owner', schedule: null,
      metadata: { owner_plan: 'true', supabase_user_id: 'owner_1', owner_billing: 'quarterly' }, items: { data: [{ ...period, price: { id: 'price_quarter' } }] } };
    api.subscriptions.retrieve.mockResolvedValue(sub);
    api.subscriptionSchedules.create.mockRejectedValue(new Error('schedule failure'));
    expect((await POST(signed(stripeEvent('customer.subscription.updated', sub)))).status).toBe(200);
    expect(api.subscriptionSchedules.create).toHaveBeenCalledWith({ from_subscription: 'sub_q' }, { idempotencyKey: 'owner-rollover:sub_q' });
    expect(db.rpc).toContainEqual(['flag_payment_review', expect.objectContaining({ p_kind: 'owner_rollover', p_reference: 'sub_q' })]);
  });
});

describe('Stripe webhook: disputes', () => {
  const dispute = { id: 'dp_1', object: 'dispute', status: 'needs_response', amount: 1000, currency: 'eur', reason: 'fraudulent',
    livemode: false, charge: 'ch_1', payment_intent: 'pi_1' };
  beforeEach(() => {
    api.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', metadata: { mode: 'marketplace', order_id: 'order_1' } });
    api.disputes.retrieve.mockResolvedValue(dispute);
    api.charges.retrieve.mockResolvedValue({ id: 'ch_1', amount: 1000, payment_intent: 'pi_1', transfer: 'tr_1' });
    api.transfers.retrieve.mockResolvedValue({ id: 'tr_1', amount: 870, amount_reversed: 0 });
    api.transfers.createReversal.mockResolvedValue({ id: 'trr_1', amount: 870 });
  });

  it('charge.dispute.created reverses the organizer transfer once and records the dispute for review', async () => {
    const response = await POST(signed(stripeEvent('charge.dispute.created', dispute)));
    expect(response.status).toBe(200);
    expect(api.transfers.createReversal).toHaveBeenCalledWith('tr_1', { amount: 870, metadata: { dispute_id: 'dp_1', reason: 'dispute' } },
      { idempotencyKey: 'dispute-reversal:dp_1' });
    expect(db.rpc).toContainEqual(['record_payment_dispute', expect.objectContaining({
      p_dispute: 'dp_1', p_source: 'marketplace', p_payment: 'order_1', p_status: 'needs_response',
      p_transfer: 'tr_1', p_reversal: 'trr_1', p_reversal_status: 'reversed', p_reversed_cents: 870,
    })]);
  });

  it('uses the current dispute state: a late created event after a win does not reverse anything', async () => {
    api.disputes.retrieve.mockResolvedValue({ ...dispute, status: 'won' });
    expect((await POST(signed(stripeEvent('charge.dispute.created', dispute)))).status).toBe(200);
    expect(api.transfers.createReversal).not.toHaveBeenCalled();
    expect(db.rpc).toContainEqual(['record_payment_dispute', expect.objectContaining({ p_status: 'won', p_reversal_status: 'none' })]);
  });

  it('a reversal rejected by Stripe is recorded as failed (admin alert) without failing the webhook', async () => {
    api.transfers.createReversal.mockRejectedValue(new Error('insufficient funds'));
    expect((await POST(signed(stripeEvent('charge.dispute.created', dispute)))).status).toBe(200);
    expect(db.rpc).toContainEqual(['record_payment_dispute', expect.objectContaining({ p_reversal_status: 'failed' })]);
  });

  it('does not touch disputes of other flows', async () => {
    api.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', metadata: { mode: 'franky_card' } });
    expect((await POST(signed(stripeEvent('charge.dispute.created', dispute)))).status).toBe(200);
    expect(db.rpc.map(([name]) => name)).not.toContain('record_payment_dispute');
  });

  it('answers 500 (Stripe retries) if the dispute cannot be recorded', async () => {
    db.failRpc = 'record_payment_dispute';
    expect((await POST(signed(stripeEvent('charge.dispute.created', dispute)))).status).toBe(500);
  });
});
