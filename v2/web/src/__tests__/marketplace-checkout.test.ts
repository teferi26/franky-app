// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startMarketplaceCheckout, closeMarketplacePayment, type MarketplacePayment } from '@/lib/marketplace-checkout';
import { assertCustomerOwner } from '@/lib/stripe-customer';

type StripeCustomerModule = typeof import('@/lib/stripe-customer');

const m = vi.hoisted(() => ({ rpc: vi.fn(), create: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), customer: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: m.rpc }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ checkout: { sessions: { create: m.create, retrieve: m.retrieve, expire: m.expire } } }) }));
vi.mock('@/lib/stripe-customer', async (original) => ({ ...(await original<StripeCustomerModule>()), getOrCreateOwnedCustomer: m.customer }));
vi.mock('@/lib/payment-demo-guard', () => ({ assertRealPaymentActors: vi.fn().mockResolvedValue(undefined) }));

const payment = (): MarketplacePayment => ({ id: 'order-one', type: 'ticket', buyer_id: 'buyer', seller_id: 'seller', amount_cents: 1000,
  application_fee_cents: 120, currency: 'eur', stripe_connect_account_id: 'acct_fixture', stripe_checkout_session_id: null,
  created_at: new Date().toISOString(), metadata: {} });
const openSession = () => ({ id: 'cs_fixture', status: 'open', payment_status: 'unpaid', metadata: { order_id: 'order-one' }, url: 'https://checkout.stripe.com/fixture' });
const input = () => ({ type: 'ticket' as const, resourceId: 'ticket', user: { id: 'buyer' }, kind: 'ticket', amount: 1000, connectAccount: 'acct_fixture',
  label: 'Fixture ticket', successUrl: 'https://franky.es/mis-entradas?pay=ok', cancelUrl: 'https://franky.es/mis-entradas?pay=cancel' });
beforeEach(() => { vi.clearAllMocks(); m.customer.mockResolvedValue('cus_fixture'); m.create.mockResolvedValue(openSession()); });

describe('durable Checkout lifecycle', () => {
  it('returns a paid state for an already settled checkout instead of asking native to open a web URL', async () => {
    m.rpc.mockImplementation(async name => name === 'prepare_marketplace_payment'
      ? { data: { payment: { ...payment(), stripe_checkout_session_id: 'cs_fixture' }, checkout: { state: 'open' } } } : { data: true });
    m.retrieve.mockResolvedValue({ ...openSession(), payment_status: 'paid', payment_intent: 'pi_fixture', amount_total: 1000, currency: 'eur' });
    expect(await startMarketplaceCheckout(input())).toMatchObject({ status: 'paid', order_id: 'order-one' });
    expect(m.create).not.toHaveBeenCalled();
  });
  it('places the server order identifier on mobile return URLs without trusting client claims', async () => {
    m.rpc.mockImplementation(async (name, args) => name === 'prepare_marketplace_payment'
      ? { data: { payment: payment(), checkout: { state: 'prepared', expires_at: new Date(Date.now() + 35 * 60_000).toISOString(), request_params: null } } }
      : name === 'freeze_marketplace_checkout' ? { data: { request_params: args.p_request } } : { data: null });
    const result = await startMarketplaceCheckout({ ...input(), successUrl: 'https://franky.es/pago/retorno?pay=ok', cancelUrl: 'https://franky.es/pago/retorno?pay=cancel' });
    expect(result.status).toBe('checkout');
    expect(m.create.mock.calls[0][0]).toMatchObject({ success_url: 'https://franky.es/pago/retorno?pay=ok&order_id=order-one', cancel_url: 'https://franky.es/pago/retorno?pay=cancel&order_id=order-one' });
  });
  it('keeps the Franky fee when Origin receives marketplace ticket sales',async()=>{
    const p={...payment(),seller_id:'efc99d1b-c713-4061-9146-e905fc599f56',stripe_connect_account_id:'acct_1UFdIBDJDdryynxQ'};
    m.rpc.mockImplementation(async(name,args)=>name==='prepare_marketplace_payment'?{data:{payment:p,checkout:{state:'prepared',expires_at:new Date(Date.now()+35*60_000).toISOString(),request_params:null}}}:name==='freeze_marketplace_checkout'?{data:{request_params:args.p_request}}:{data:null});
    await startMarketplaceCheckout({...input(),connectAccount:p.stripe_connect_account_id});
    expect(m.create.mock.calls[0][0].payment_intent_data).toMatchObject({application_fee_amount:p.application_fee_cents,transfer_data:{destination:p.stripe_connect_account_id}});
    expect(m.create.mock.calls[0][0].payment_intent_data.application_fee_amount).toBeGreaterThan(0);
  });
  it('does not open a new Origin purchase into its superseded Express account',async()=>{
    m.rpc.mockResolvedValue({data:{payment:{...payment(),seller_id:'efc99d1b-c713-4061-9146-e905fc599f56'},checkout:{state:'prepared',request_params:null}}});
    await expect(startMarketplaceCheckout(input())).rejects.toThrow('connection_required');expect(m.create).not.toHaveBeenCalled();
  });
  it('concurrent requests use the same frozen payload and idempotency key', async () => {
    let frozen: unknown = null;
    const p = payment();
    m.rpc.mockImplementation(async (name, args) => {
      if (name === 'prepare_marketplace_payment') return { data: { payment: p, checkout: { state: 'prepared', expires_at: new Date(Date.now()+35*60_000).toISOString(), request_params: null } } };
      if (name === 'freeze_marketplace_checkout') { frozen ??= args.p_request; return { data: { request_params: frozen } }; }
      return { data: null };
    });
    await Promise.all([startMarketplaceCheckout(input()), startMarketplaceCheckout({ ...input(), label: 'Changed label in second request' })]);
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create.mock.calls[0]).toEqual(m.create.mock.calls[1]);
    expect(m.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'marketplace:order-one' });
  });

  it('a failed session attachment preserves the same remote request for retry', async () => {
    const frozen = { mode: 'payment', expires_at: 2000000000, metadata: { order_id: 'order-one' } };
    let attempts = 0;
    m.rpc.mockImplementation(async name => name === 'prepare_marketplace_payment'
      ? { data: { payment: payment(), checkout: { state: 'creating', request_params: frozen } } }
      : name === 'attach_marketplace_checkout' && attempts++ === 0 ? { error: { message: 'timeout' } } : { data: null });
    await expect(startMarketplaceCheckout(input())).rejects.toThrow('timeout');
    await startMarketplaceCheckout(input());
    expect(m.create.mock.calls[0]).toEqual(m.create.mock.calls[1]);
    expect(m.customer).not.toHaveBeenCalled();
  });

  it('never recreates an unknown Checkout after Stripe can prune its key', async () => {
    m.rpc.mockResolvedValue({ data: { payment: { ...payment(), created_at: new Date(Date.now()-25*60*60_000).toISOString() }, checkout: { state: 'creating', request_params: { mode: 'payment' } } } });
    await expect(startMarketplaceCheckout(input())).rejects.toThrow('reconciliation');
    expect(m.create).not.toHaveBeenCalled();
  });

  it('cannot release a ticket when expiry fails and Stripe still reports open', async () => {
    m.rpc.mockResolvedValue({ data: { payment: { ...payment(), stripe_checkout_session_id: 'cs_fixture' }, checkout: { state: 'closing' } } });
    m.retrieve.mockResolvedValue(openSession()); m.expire.mockRejectedValue(new Error('network lost'));
    await expect(closeMarketplacePayment('order-one')).rejects.toThrow('unconfirmed');
    expect(m.rpc.mock.calls.some(([name]) => name === 'finish_marketplace_close')).toBe(false);
  });

  it('settles a payment that wins the race with cancellation instead of deleting its ticket', async () => {
    m.rpc.mockImplementation(async name => name === 'begin_marketplace_close'
      ? { data: { payment: { ...payment(), stripe_checkout_session_id: 'cs_fixture' }, checkout: { state: 'closing' } } } : { data: { ok: true } });
    m.retrieve.mockResolvedValueOnce(openSession()).mockResolvedValueOnce({ ...openSession(), status: 'complete', payment_status: 'paid', payment_intent: 'pi_fixture', amount_total: 1000, currency: 'eur' });
    m.expire.mockRejectedValue(new Error('already complete'));
    expect(await closeMarketplacePayment('order-one')).toBe(false);
    expect(m.rpc.mock.calls.some(([name]) => name === 'settle_marketplace_payment')).toBe(true);
    expect(m.rpc.mock.calls.some(([name]) => name === 'finish_marketplace_close')).toBe(false);
  });

  it('accepts closure only after an expired unpaid session with matching order', async () => {
    m.rpc.mockImplementation(async name => name === 'begin_marketplace_close'
      ? { data: { payment: { ...payment(), stripe_checkout_session_id: 'cs_fixture' }, checkout: { state: 'closing' } } } : { data: { closed: true } });
    m.retrieve.mockResolvedValue({ ...openSession(), status: 'expired' });
    expect(await closeMarketplacePayment('order-one')).toBe(true);
    expect(m.rpc).toHaveBeenLastCalledWith('finish_marketplace_close', { p_order: 'order-one', p_expired_session: 'cs_fixture' });
  });

  it('rejects a remote session belonging to another order', async () => {
    m.rpc.mockResolvedValue({ data: { payment: { ...payment(), stripe_checkout_session_id: 'cs_other' }, checkout: { state: 'closing' } } });
    m.retrieve.mockResolvedValue({ ...openSession(), metadata: { order_id: 'another-order' } });
    await expect(closeMarketplacePayment('order-one')).rejects.toThrow('identity_mismatch');
    expect(m.expire).not.toHaveBeenCalled();
  });
});

describe('Stripe customer ownership', () => {
  it.each([{ deleted: true }, { metadata: { supabase_user_id: 'another-account' } }, { metadata: {} }])('rejects unowned/deleted customers before invoice or portal access', async customer => {
    const stripe = { customers: { retrieve: vi.fn().mockResolvedValue(customer) } };
    await expect(assertCustomerOwner(stripe as never, 'cus_fixture', 'buyer')).rejects.toThrow('ownership_unverified');
  });
  it('accepts the authenticated owner recorded in Stripe metadata', async () => {
    const stripe = { customers: { retrieve: vi.fn().mockResolvedValue({ metadata: { supabase_user_id: 'buyer' } }) } };
    await expect(assertCustomerOwner(stripe as never, 'cus_fixture', 'buyer')).resolves.toBeTruthy();
  });
});
