// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

/** Casos de borde de facturación (auditoría 23-sep-2026): Franky Card con pago
 * diferido rechazado y eventos de contratos de vivienda con el servicio apagado. */
const m = vi.hoisted(() => ({ rpc: vi.fn(), order: vi.fn(), recorded: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: m.rpc, from: (table: string) => {
  const q: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'neq', 'or', 'limit']) q[k] = () => q;
  q.single = () => m.order(table); q.maybeSingle = () => m.recorded(table); return q;
} }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({}) }));
vi.mock('@/lib/franky-card-api', () => ({ CARD_SITE: 'https://franky.es' }));
import { handleFrankyCardWebhook } from '@/lib/franky-card-billing';
import { handleHousingBillingWebhook } from '@/lib/housing-billing';

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('HOUSING_DEFERRED_BILLING_READY', 'false'); m.rpc.mockResolvedValue({ data: {}, error: null }); m.recorded.mockResolvedValue({ data: null, error: null }); });

describe('Franky Card: checkout.session.async_payment_failed', () => {
  it('marks the order failed through the existing payment RPC instead of leaving it pending', async () => {
    const orderId = '00000000-0000-4000-8000-00000000000c';
    m.order.mockResolvedValue({ data: { id: orderId, user_id: 'user_1', amount_cents: 1500, currency: 'eur', environment: 'test', checkout_id: 'cs_card' }, error: null });
    const stripe = { paymentIntents: { retrieve: vi.fn(async () => ({ id: 'pi_card', status: 'requires_payment_method', amount: 1500, currency: 'eur', livemode: false,
      metadata: { mode: 'franky_card', card_order_id: orderId, supabase_user_id: 'user_1' } })) } } as unknown as Stripe;
    const session = { id: 'cs_card', object: 'checkout.session', metadata: { mode: 'franky_card', card_order_id: orderId }, client_reference_id: orderId,
      amount_total: 1500, currency: 'eur', payment_status: 'unpaid', payment_intent: 'pi_card' };
    expect(await handleFrankyCardWebhook(stripe, { id: 'evt_card_failed', type: 'checkout.session.async_payment_failed', livemode: false, data: { object: session } } as unknown as Stripe.Event)).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith('service_apply_franky_card_payment', expect.objectContaining({ p_action: 'failed', p_order_id: orderId, p_payment_id: 'pi_card', p_amount_cents: 1500 }));
  });
  it('ignores async failures of other flows', async () => {
    expect(await handleFrankyCardWebhook({} as Stripe, { id: 'evt', type: 'checkout.session.async_payment_failed', livemode: false, data: { object: { metadata: { mode: 'marketplace' } } } } as unknown as Stripe.Event)).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe('Deferred housing contracts while the service is off', () => {
  it('consumes the event into manual review so the legacy owner branch never applies it', async () => {
    const sub = { id: 'sub_deferred', object: 'subscription', metadata: { housing_enrollment_id: 'enr_1', owner_plan: 'true', supabase_user_id: 'owner_1' } };
    expect(await handleHousingBillingWebhook({} as Stripe, { id: 'evt_deferred', type: 'customer.subscription.updated', data: { object: sub } } as unknown as Stripe.Event)).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith('flag_payment_review', { p_kind: 'housing_deferred_event', p_reference: 'evt_deferred', p_detail: { enrollment_id: 'enr_1', type: 'customer.subscription.updated' } });
  });
  it('finds the enrollment on invoices through the subscription details', async () => {
    const invoice = { id: 'in_1', object: 'invoice', parent: { subscription_details: { subscription: 'sub_deferred', metadata: { housing_enrollment_id: 'enr_2' } } } };
    expect(await handleHousingBillingWebhook({} as Stripe, { id: 'evt_inv', type: 'invoice.payment_failed', data: { object: invoice } } as unknown as Stripe.Event)).toBe(true);
  });
  it('lets Stripe retry if the review cannot be recorded', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const sub = { id: 'sub_deferred', object: 'subscription', metadata: { housing_enrollment_id: 'enr_1' } };
    await expect(handleHousingBillingWebhook({} as Stripe, { id: 'evt_x', type: 'customer.subscription.deleted', data: { object: sub } } as unknown as Stripe.Event)).rejects.toThrow('housing_deferred_event_unrecorded');
  });
  it('leaves ordinary legacy events to the webhook without touching the database', async () => {
    const sub = { id: 'sub_legacy', object: 'subscription', metadata: { owner_plan: 'true' } };
    expect(await handleHousingBillingWebhook({} as Stripe, { id: 'evt_l', type: 'customer.subscription.updated', data: { object: sub } } as unknown as Stripe.Event)).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
