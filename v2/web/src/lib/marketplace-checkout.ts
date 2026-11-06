import type Stripe from 'stripe';
import { createAdminSupabase } from './supabase-admin';
import { getStripe } from './stripe';
import { getOrCreateOwnedCustomer } from './stripe-customer';
import { feeBreakdown, ticketInvoiceFooter } from './pricing';
import { ORIGIN_ORGANIZER_ID } from './origin-partner';
import { ORIGIN_MERCHANT_ACCOUNT } from './origin-partner';
import { assertRealPaymentActors } from './payment-demo-guard';

export type MarketplacePayment = {
  id: string; type: 'ticket' | 'visit' | 'rent'; buyer_id: string; seller_id: string;
  amount_cents: number; application_fee_cents: number; currency: string;
  stripe_connect_account_id: string; stripe_checkout_session_id: string | null;
  created_at: string; metadata: Record<string, string | number | boolean>;
};
export type CheckoutState = {
  state: string; request_params: Stripe.Checkout.SessionCreateParams | null;
  expires_at: string; issue: string | null;
};
type Prepared = { payment: MarketplacePayment; checkout: CheckoutState; reused?: boolean };

export async function paymentRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createAdminSupabase().rpc(name, args);
  if (error) throw new Error(`payment_operation:${error.message}`);
  return data as T;
}

export function checkoutIdempotencyKey(orderId: string) { return `marketplace:${orderId}`; }
export function canReplayCheckout(payment: MarketplacePayment, now = Date.now()) {
  // Stripe may prune idempotency records after 24 hours. Never create again
  // after that boundary; an unknown legacy checkout needs manual reconciliation.
  return now - Date.parse(payment.created_at) < 23 * 60 * 60_000;
}

export async function settleCheckout(session: Stripe.Checkout.Session, orderId: string) {
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) return false;
  await paymentRpc('settle_marketplace_payment', {
    p_order: orderId, p_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    p_charge: null, p_session: session.id, p_amount: session.amount_total, p_currency: session.currency,
  });
  return true;
}

export async function startMarketplaceCheckout(input: {
  type: MarketplacePayment['type']; resourceId: string; user: { id: string; email?: string };
  kind: string; code?: string; amount: number; connectAccount: string | null;
  label: string; successUrl: string; cancelUrl: string;
}) {
  await assertRealPaymentActors(input.user.id);
  const fee = feeBreakdown(input.amount, input.type);
  const prepared = await paymentRpc<Prepared>('prepare_marketplace_payment', {
    p_type: input.type, p_resource_id: input.resourceId, p_buyer_id: input.user.id,
    p_kind: input.kind, p_code: input.code ?? null, p_expected_amount: input.amount,
    p_fee: fee.feeCents, p_connect_account: input.connectAccount,
    p_fee_breakdown: { franky_fee_cents: fee.frankyCents, stripe_fee_cents: fee.stripeCents },
  });
  const p = prepared.payment;
  await assertRealPaymentActors(p.seller_id);
  const successUrl = new URL(input.successUrl);
  const cancelUrl = new URL(input.cancelUrl);
  for (const url of [successUrl, cancelUrl]) {
    if (url.pathname === '/pago/retorno') url.searchParams.set('order_id', p.id);
  }
  let state = prepared.checkout;
  if (p.amount_cents === 0) {
    await paymentRpc('settle_marketplace_payment', { p_order: p.id, p_intent: null, p_charge: null, p_session: null, p_amount: 0, p_currency: 'eur' });
    return { status: 'paid' as const, url: successUrl.href, free: true, order_id: p.id };
  }
  const stripe = getStripe();
  if(p.seller_id===ORIGIN_ORGANIZER_ID && p.stripe_connect_account_id!==ORIGIN_MERCHANT_ACCOUNT)throw new Error('origin_account_connection_required');
  if (p.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(p.stripe_checkout_session_id);
    if (session.metadata?.order_id !== p.id) throw new Error('checkout_identity_mismatch');
    if (await settleCheckout(session, p.id)) return { status: 'paid' as const, url: successUrl.href, order_id: p.id };
    if (session.status !== 'open' || !session.url) throw new Error('checkout_not_open');
    return { status: 'checkout' as const, url: session.url, order_id: p.id, reused: true };
  }
  if (state.state === 'legacy' || !canReplayCheckout(p)) throw new Error('payment_requires_reconciliation');
  if (!state.request_params) {
    const customer = await getOrCreateOwnedCustomer(input.user);
    const metadata = { mode: 'marketplace', type: p.type, order_id: p.id, supabase_user_id: input.user.id };
    const request: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment', payment_method_types: ['card'], customer,
      expires_at: Math.floor(Date.parse(state.expires_at) / 1000),
      line_items: [{ price_data: { currency: p.currency, unit_amount: p.amount_cents, product_data: { name: input.label } }, quantity: 1 }],
      payment_intent_data: { application_fee_amount: p.application_fee_cents, transfer_data: { destination: p.stripe_connect_account_id }, metadata },
      success_url: successUrl.href, cancel_url: cancelUrl.href, metadata,
      ...(p.type === 'ticket' ? { invoice_creation: { enabled: true, invoice_data: { footer: ticketInvoiceFooter(p.amount_cents, p.application_fee_cents) } } } : {}),
    };
    state = await paymentRpc<CheckoutState>('freeze_marketplace_checkout', { p_order: p.id, p_request: request });
  }
  if (!state.request_params) throw new Error('checkout_request_missing');
  const session = await stripe.checkout.sessions.create(state.request_params, { idempotencyKey: checkoutIdempotencyKey(p.id) });
  await paymentRpc('attach_marketplace_checkout', { p_order: p.id, p_session: session.id });
  if (await settleCheckout(session, p.id)) return { status: 'paid' as const, url: successUrl.href, order_id: p.id };
  if (session.status !== 'open' || !session.url) throw new Error('checkout_not_open');
  return { status: 'checkout' as const, url: session.url, order_id: p.id, reused: !!prepared.reused };
}

/** Returns only after Stripe has confirmed expiry. Network errors preserve the hold. */
export async function closeMarketplacePayment(orderId: string) {
  const { payment: p, checkout: s } = await paymentRpc<Prepared>('begin_marketplace_close', { p_order: orderId });
  await assertRealPaymentActors(p.buyer_id, p.seller_id);
  if (s.state === 'closed') return true;
  if (s.state === 'review') throw new Error('payment_requires_reconciliation');
  const stripe = getStripe();
  let session: Stripe.Checkout.Session | null = null;
  if (p.stripe_checkout_session_id) session = await stripe.checkout.sessions.retrieve(p.stripe_checkout_session_id);
  else if (s.request_params) {
    if (!canReplayCheckout(p)) throw new Error('payment_requires_reconciliation');
    session = await stripe.checkout.sessions.create(s.request_params, { idempotencyKey: checkoutIdempotencyKey(p.id) });
    await paymentRpc('attach_marketplace_checkout', { p_order: p.id, p_session: session.id });
  }
  if (session) {
    if (session.metadata?.order_id !== p.id) throw new Error('checkout_identity_mismatch');
    if (await settleCheckout(session, p.id)) return false;
    if (session.status === 'open') {
      try { session = await stripe.checkout.sessions.expire(session.id); }
      catch {
        // Expire can race with successful payment. Re-read instead of treating
        // a network error or completed checkout as an expired one.
        session = await stripe.checkout.sessions.retrieve(session.id);
      }
    }
    if (await settleCheckout(session, p.id)) return false;
    if (session.status !== 'expired' || session.payment_status !== 'unpaid') throw new Error('remote_checkout_unconfirmed');
  }
  const result = await paymentRpc<{ closed: boolean }>('finish_marketplace_close', { p_order: p.id, p_expired_session: session?.id ?? null });
  return result.closed;
}
