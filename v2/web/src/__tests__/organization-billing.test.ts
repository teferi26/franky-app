// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { OrganizationCheckoutContext } from '../../../shared/organization-billing';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), stripe: {} as Stripe }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => mocks.stripe }));
import { handleOrganizationBillingWebhook, reconcileOrganizationInvoice, recoverOrganizationCheckout, startOrganizationCheckout, organizationPaymentReply, reconcileOrganizationBillingBatch } from '@/lib/organization-billing';
import { organizationMetadata } from '@/lib/organization-billing-provider';
let context: OrganizationCheckoutContext;
let sub: Stripe.Subscription, invoice: Stripe.Invoice, session: Stripe.Checkout.Session, price: Stripe.Price;
const list = (values: unknown[]) => ({ async *[Symbol.asyncIterator]() { yield* values; } });
const spy = (path: string) => path.split('.').reduce((v, key) => v[key], mocks.stripe as unknown as Record<string, any>) as ReturnType<typeof vi.fn>;
const events = () => mocks.rpc.mock.calls.filter(([name]) => name === 'service_reconcile_organization_billing').map(([, args]) => args);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'synthetic'); vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'true');
  context = { attempt_id: 'attempt', organization_id: 'org', account_id: 'account', contract_id: 'attempt', actor_id: 'actor', environment: 'test', customer_id: 'cus_org',
    subscription_id: 'sub_org', invoice_cursor: null, session_id: 'cs_org', checkout_url: 'https://checkout.stripe.com/c/pay/test', created_at: new Date().toISOString(), status: 'open',
    plan_key: 'beauty', plan_version: 1, price_id: 'price_year', product_id: 'prod_org', coupon_id: 'coupon_founder', first_base_cents: 19900,
    renewal_base_cents: 29000, interval: 'year', founder: true, currency: 'eur', terms_version: 'v1', sales_enabled: true, provider_ready: true,
    account: { legal_name: 'Synthetic entity', country: 'ES' }, tax_behavior: 'exclusive', modules: [], limits: { staff_limit: 3, resource_limit: 20, service_limit: 50 }, terms: 'Terms', portal_config_id: 'bpc_org' };
  price = { id: 'price_year', product: { id: 'prod_org', active: true, livemode: false }, active: true, livemode: false, currency: 'eur', unit_amount: 29000,
    type: 'recurring', billing_scheme: 'per_unit', tax_behavior: 'exclusive', recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } } as Stripe.Price;
  sub = { id: 'sub_org', object: 'subscription', metadata: organizationMetadata(context), customer: 'cus_org', livemode: false, collection_method: 'charge_automatically', status: 'active',
    automatic_tax: { enabled: true }, cancel_at_period_end: false, items: { has_more: false, data: [{ price, quantity: 1, current_period_end: 1821700000 }] }, latest_invoice: 'in_org' } as unknown as Stripe.Subscription;
  invoice = { id: 'in_org', object: 'invoice', parent: { subscription_details: { subscription: 'sub_org', metadata: organizationMetadata(context) } }, customer: 'cus_org',
    customer_name: 'Synthetic entity', customer_address: { country: 'ES' },
    livemode: false, currency: 'eur', collection_method: 'charge_automatically', starting_balance: 0, ending_balance: 0, pre_payment_credit_notes_amount: 0, post_payment_credit_notes_amount: 0,
    billing_reason: 'subscription_create', automatic_tax: { enabled: true, status: 'complete' }, status: 'paid', subtotal: 29000, total: 24079, total_excluding_tax: 19900,
    total_discount_amounts: [{ amount: 9100 }], total_taxes: [{ amount: 4179 }], amount_paid: 24079, amount_remaining: 0,
    discounts: [{ id: 'di_founder', source: { coupon: 'coupon_founder' } }],
    lines: { has_more: false, data: [{ id: 'il_org', quantity: 1, subtotal: 29000, currency: 'eur', pricing: { price_details: { price: 'price_year', product: 'prod_org' } },
      parent: { subscription_item_details: { subscription: 'sub_org', proration: false } }, period: { start: 1758500000, end: 1790036000 }, discount_amounts: [{ amount: 9100 }] }] },
  } as unknown as Stripe.Invoice;
  session = { id: 'cs_org', object: 'checkout.session', metadata: organizationMetadata(context), client_reference_id: 'attempt', customer: 'cus_org', mode: 'subscription',
    livemode: false, status: 'complete', payment_status: 'paid', subscription: 'sub_org', invoice: 'in_org', url: null } as Stripe.Checkout.Session;
  const customer = { id: 'cus_org', livemode: false, metadata: { mode: 'organization_saas', organization_id: 'org', billing_account_id: 'account', environment: 'test' } };
  mocks.stripe = { prices: { retrieve: vi.fn(async () => price) }, coupons: { retrieve: vi.fn(async () => ({ id: 'coupon_founder', livemode: false, currency: 'eur', duration: 'once', amount_off: 9100, percent_off: null, valid: true, applies_to: { products: ['prod_org'] } })) },
    customers: { retrieve: vi.fn(async () => customer), create: vi.fn(async () => customer) }, subscriptions: { retrieve: vi.fn(async () => sub) },
    invoices: { retrieve: vi.fn(async () => invoice), list: vi.fn(() => list([invoice])) },
    invoicePayments: { list: vi.fn(() => list([{ id: 'inpay_org', invoice: 'in_org', status: 'paid', currency: 'eur', livemode: false, amount_paid: 24079,
      payment: { type: 'payment_intent', payment_intent: 'pi_org' } }])) },
    paymentIntents: { retrieve: vi.fn(async () => ({ id: 'pi_org', status: 'succeeded', customer: 'cus_org', currency: 'eur', livemode: false, amount_received: 24079, latest_charge: 'ch_org' })) },
    charges: { retrieve: vi.fn(async () => ({ id: 'ch_org', paid: true, captured: true, amount: 24079, currency: 'eur', livemode: false, customer: 'cus_org', payment_intent: 'pi_org' })) },
    refunds: { list: vi.fn(() => list([])) }, disputes: { list: vi.fn(() => list([])) },
    checkout: { sessions: { retrieve: vi.fn(async () => session), create: vi.fn(async () => session), list: vi.fn(() => list([session])),
      listLineItems: vi.fn(async () => ({ has_more: false, data: [{ price, quantity: 1 }] })) } },
  } as unknown as Stripe;
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, any>) => {
    if (name === 'service_get_organization_checkout') return { data: { ...context }, error: null };
    if (name === 'service_bind_organization_customer') { context.customer_id = 'cus_org'; return { data: { customer_id: 'cus_org' }, error: null }; }
    if (name === 'service_attach_organization_checkout') { context.session_id = args.p_session_id; context.checkout_url = args.p_checkout_url; if (context.status !== 'paid') context.status = args.p_checkout_url ? 'open' : 'pending'; }
    if (name === 'service_reconcile_organization_billing' && args.p_payload.kind === 'invoice_snapshot' && args.p_payload.paid) context.status = 'paid';
    if (name === 'service_reconcile_organization_billing' && args.p_payload.kind === 'checkout_expired') context.status = 'cancelled';
    return { data: true, error: null };
  });
});
it('grants the exact paid founder invoice, with no dependence on a subsequently deleted coupon', async () => {
  spy('coupons.retrieve').mockRejectedValue(Error('deleted'));
  expect(await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_paid')).toBe(true);
  expect(events()[0].p_payload).toMatchObject({ kind: 'invoice_snapshot', invoice_id: 'in_org', paid: true, paid_cents: 24079, discount_cents: 9100, refunded_cents: 0, coupon_id: 'coupon_founder' });
  expect(spy('coupons.retrieve')).not.toHaveBeenCalled();
});
it.each(['legal_name', 'tax'])('grants a paid invoice with a mismatching %s but sends it to manual review', async field => {
  if (field === 'legal_name') invoice.customer_name = 'Another legal entity';
  if (field === 'tax') invoice.automatic_tax.status = 'requires_location_inputs';
  expect(await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_review')).toBe(true);
  expect(events()[0].p_payload).toMatchObject({ kind: 'invoice_snapshot', paid: true });
  expect(mocks.rpc).toHaveBeenCalledWith('flag_payment_review', expect.objectContaining({ p_kind: 'organization_invoice', p_reference: 'in_org',
    p_detail: expect.objectContaining({ issues: [field === 'tax' ? 'automatic_tax:requires_location_inputs' : 'legal_name'] }) }));
});
it.each(['customer', 'currency', 'amount', 'period', 'price', 'proration', 'more_lines', 'coupon', 'quantity', 'parent', 'country'])('rejects a mismatching %s before any paid grant', async field => {
  if (field === 'customer') invoice.customer = 'cus_other';
  if (field === 'legal_name') invoice.customer_name = 'Another legal entity';
  if (field === 'country') invoice.customer_address!.country = 'DE';
  if (field === 'currency') invoice.currency = 'usd';
  if (field === 'amount') invoice.total--;
  if (field === 'tax') invoice.automatic_tax.status = 'requires_location_inputs';
  if (field === 'period') invoice.lines.data[0].period.end = invoice.lines.data[0].period.start + 86400;
  if (field === 'price') invoice.lines.data[0].pricing!.price_details!.price = 'price_other';
  if (field === 'proration') invoice.lines.data[0].parent!.subscription_item_details!.proration = true;
  if (field === 'more_lines') invoice.lines.has_more = true;
  if (field === 'coupon') invoice.discounts = [];
  if (field === 'quantity') invoice.lines.data[0].quantity = 2;
  if (field === 'parent') invoice.lines.data[0].parent!.subscription_item_details!.subscription = 'sub_other';
  await expect(reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_bad')).rejects.toThrow(); expect(events()).toEqual([]);
});
it('a completed Checkout without a paid invoice cannot confer access', async () => {
  invoice.status = 'open'; invoice.amount_paid = 0; invoice.amount_remaining = invoice.total;
  await handleOrganizationBillingWebhook(mocks.stripe, { id: 'evt_complete', type: 'checkout.session.completed', livemode: false, data: { object: session } } as Stripe.Event);
  expect(events().filter(event => event.p_payload.kind === 'invoice_snapshot')).toHaveLength(1);
  expect(events()[0].p_payload.paid).toBe(false); expect(context.status).toBe('pending');
  expect(organizationPaymentReply(context)).toEqual({ status: 'pending', order_id: 'attempt' });
});
it('an ordinary renewal must not repeat the founder discount', async () => {
  invoice.billing_reason = 'subscription_cycle';
  await expect(reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_renew')).rejects.toThrow('amount');
  invoice.discounts = []; invoice.total_discount_amounts = []; invoice.lines.data[0].discount_amounts = [];
  invoice.total = 35090; invoice.total_excluding_tax = 29000; invoice.amount_paid = 35090; invoice.total_taxes = [{ amount: 6090 }] as Stripe.Invoice.TotalTax[];
  spy('invoicePayments.list').mockReturnValue(list([{ id: 'inpay_org', invoice: 'in_org', status: 'paid', currency: 'eur', livemode: false, amount_paid: 35090, payment: { type: 'charge', charge: 'ch_org' } }]));
  spy('charges.retrieve').mockResolvedValue({ id: 'ch_org', paid: true, captured: true, amount: 35090, currency: 'eur', livemode: false, customer: 'cus_org' });
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_renew');
  expect(events()[0].p_payload).toMatchObject({ paid: true, subtotal_cents: 29000, discount_cents: 0, coupon_id: null });
});
it('ignores pending refunds and sums only provider-confirmed evidence', async () => {
  spy('refunds.list').mockReturnValue(list([{ charge: 'ch_org', currency: 'eur', amount: 1000, status: 'pending' }, { charge: 'ch_org', currency: 'eur', amount: 500, status: 'succeeded' }]));
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_refund'); expect(events()[0].p_payload.refunded_cents).toBe(500);
});
it('a won dispute never erases a completed full refund', async () => {
  spy('refunds.list').mockReturnValue(list([{ charge: 'ch_org', currency: 'eur', amount: 24079, status: 'succeeded' }]));
  spy('disputes.list').mockReturnValue(list([{ charge: 'ch_org', currency: 'eur', livemode: false, status: 'won' }]));
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_won'); expect(events()[0].p_payload).toMatchObject({ refunded_cents: 24079, dispute_status: 'won' });
});
it('manual/out-of-band paid and customer credit cannot be treated as a Stripe cash receipt', async () => {
  spy('invoicePayments.list').mockReturnValue(list([]));
  await expect(reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_manual')).rejects.toThrow('funding');
  invoice.starting_balance = -24079;
  await expect(reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_credit')).rejects.toThrow('invoice');
});
it('retries economic persistence instead of acknowledging a paid invoice', async () => {
  mocks.rpc.mockImplementation(async name => name === 'service_get_organization_checkout' ? { data: context } : { error: { message: 'db down' } });
  await expect(reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_paid')).rejects.toThrow('persistence_pending');
});
it('Connect and personal metadata cannot reach organization fulfillment', async () => {
  expect(await handleOrganizationBillingWebhook(mocks.stripe, { account: 'acct_other', data: { object: session } } as Stripe.Event)).toBe(false);
  const foreign = { ...invoice, parent: { subscription_details: { metadata: { mode: 'personal' } } } };
  expect(await handleOrganizationBillingWebhook(mocks.stripe, { data: { object: foreign } } as unknown as Stripe.Event)).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects a signed event from the wrong environment even when the canonical ID looks right', async () => {
  await expect(handleOrganizationBillingWebhook(mocks.stripe, { id: 'evt_wrong', livemode: true, data: { object: invoice } } as Stripe.Event)).rejects.toThrow('environment');
  expect(events()).toEqual([]);
});
it('an old unknown create remains pending and cannot create another checkout', async () => {
  context.session_id = null; context.status = 'creating'; context.created_at = new Date(Date.now() - 21 * 3600_000).toISOString();
  expect(await startOrganizationCheckout('attempt', 'actor', 'org')).toEqual({ status: 'pending', order_id: 'attempt' });
  expect(spy('checkout.sessions.create')).not.toHaveBeenCalled();
});
it('a lost session response is recovered by exact metadata without creating a purchase', async () => {
  context.session_id = null; context.status = 'creating';
  await recoverOrganizationCheckout('attempt', 'org');
  expect(spy('checkout.sessions.create')).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith('service_attach_organization_checkout', { p_attempt_id: 'attempt', p_session_id: 'cs_org', p_checkout_url: null });
  expect(context.status).toBe('paid');
});
it('two provider sessions for a single durable intent require review, never silently pick one', async () => {
  context.session_id = null;
  spy('checkout.sessions.list').mockReturnValue(list([session, { ...session, id: 'cs_duplicate' }]));
  await expect(recoverOrganizationCheckout('attempt', 'org')).rejects.toThrow('duplicate_provider_sessions');
});
it('confirms expiry only from the provider unpaid/expired state without a subscription', async () => {
  session.status = 'expired'; session.payment_status = 'unpaid'; session.subscription = null; session.invoice = null;
  await recoverOrganizationCheckout('attempt', 'org'); expect(context.status).toBe('cancelled');
  expect(organizationPaymentReply(context)).toEqual({ status: 'cancelled', order_id: 'attempt' });
});
it('the same economic snapshot has a stable dedup key even if observation time changes', async () => {
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_duplicate');
  const first = events()[0].p_event_id;
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_duplicate'); expect(events()[2].p_event_id).toBe(first);
  spy('refunds.list').mockReturnValue(list([{ charge: 'ch_org', currency: 'eur', amount: 500, status: 'succeeded' }]));
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_duplicate'); expect(events()[4].p_event_id).not.toBe(first);
});
it('native status is neutral and provider URLs require the approved host', () => {
  expect(organizationPaymentReply(context, false)).toEqual({ status: 'pending', order_id: 'attempt' });
  expect(organizationPaymentReply({ ...context, checkout_url: 'https://evil.invalid' })).toEqual({ status: 'pending', order_id: 'attempt' });
});
it('revocation after product/customer reads prevents opening a purchase', async () => {
  context.session_id = null; context.status = 'creating';
  const original = mocks.rpc.getMockImplementation()!; let reads = 0;
  mocks.rpc.mockImplementation((name, args) => name === 'service_get_organization_checkout' && ++reads === 2
    ? { error: { message: 'organization_billing_forbidden' } } : original(name, args));
  await expect(startOrganizationCheckout('attempt', 'actor', 'org')).rejects.toThrow('forbidden');
  expect(spy('checkout.sessions.create')).not.toHaveBeenCalled();
});
it('revocation after provider recovery prevents returning the checkout secret URL', async () => {
  const original = mocks.rpc.getMockImplementation()!; let reads = 0;
  session.status = 'open'; session.invoice = null; session.subscription = null; session.url = context.checkout_url;
  mocks.rpc.mockImplementation((name, args) => name === 'service_get_organization_checkout' && ++reads === 2
    ? { error: { message: 'organization_billing_forbidden' } } : original(name, args));
  await expect(startOrganizationCheckout('attempt', 'actor', 'org')).rejects.toThrow('forbidden');
});
it('a delayed subscription read retains its older observation time rather than winning by network delay', async () => {
  const old = structuredClone(sub), current = { ...structuredClone(sub), status: 'past_due' as const };
  old.latest_invoice = null; current.latest_invoice = null;
  let resolveOld!: (value: Stripe.Subscription) => void;
  const held = new Promise<Stripe.Subscription>(resolve => { resolveOld = resolve; });
  spy('subscriptions.retrieve').mockReturnValueOnce(held).mockResolvedValueOnce(current);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const first = handleOrganizationBillingWebhook(mocks.stripe, { id: 'evt_old', livemode: false, data: { object: old } } as Stripe.Event);
  clock.mockReturnValue(2000);
  await handleOrganizationBillingWebhook(mocks.stripe, { id: 'evt_current', livemode: false, data: { object: current } } as Stripe.Event);
  clock.mockReturnValue(3000); resolveOld(old); await first; clock.mockRestore();
  expect(events().map(entry => [entry.p_payload.status, entry.p_payload.provider_snapshot_ms])).toEqual([['past_due', 2000], ['active', 1000]]);
});
it('a delayed invoice read cannot acquire a newer timestamp than a later refund snapshot', async () => {
  let resolveOld!: (value: Stripe.Invoice) => void;
  const held = new Promise<Stripe.Invoice>(resolve => { resolveOld = resolve; });
  spy('invoices.retrieve').mockReturnValueOnce(held).mockResolvedValueOnce(invoice);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const first = reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_old_invoice');
  clock.mockReturnValue(2000); await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_current_invoice');
  clock.mockReturnValue(3000); resolveOld(invoice); await first; clock.mockRestore();
  expect(events().filter(entry => entry.p_payload.kind === 'invoice_snapshot').map(entry => entry.p_payload.provider_snapshot_ms)).toEqual([2000, 1000]);
});
it('draft and upcoming invoices are acknowledged without claiming a paid period', async () => {
  invoice.status = 'draft'; invoice.automatic_tax.status = null;
  expect(await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_draft')).toBe(true); expect(events()).toEqual([]);
  expect(await handleOrganizationBillingWebhook(mocks.stripe, { id: 'evt_preview', type: 'invoice.upcoming', data: { object: invoice } } as Stripe.Event)).toBe(true);
});
it('the worker advances a bounded historical invoice cursor only after all canonical snapshots succeed', async () => {
  context.invoice_cursor = 'in_previous';
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name, args) => name === 'service_organization_billing_reconcile_batch' ? { data: { attempts: [context] } }
    : name === 'service_advance_organization_invoice_cursor' ? { data: { advanced: true } } : original(name, args));
  spy('invoices.list').mockResolvedValue({ data: [invoice], has_more: true });
  expect(await reconcileOrganizationBillingBatch()).toEqual({ examined: 1, reconciled: 1, failed: 0, invoices: 1 });
  expect(spy('invoices.list')).toHaveBeenCalledWith({ subscription: 'sub_org', customer: 'cus_org', limit: 5, starting_after: 'in_previous' });
  expect(mocks.rpc).toHaveBeenCalledWith('service_advance_organization_invoice_cursor', { p_attempt_id: 'attempt', p_expected_cursor: 'in_previous', p_next_cursor: 'in_org' });
});
it('a failed historical page retains its cursor for retry', async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name, args) => name === 'service_organization_billing_reconcile_batch' ? { data: { attempts: [context] } } : original(name, args));
  spy('invoices.list').mockRejectedValue(Error('provider network'));
  expect((await reconcileOrganizationBillingBatch()).failed).toBe(1);
  expect(mocks.rpc.mock.calls.some(([name]) => name === 'service_advance_organization_invoice_cursor')).toBe(false);
});

it('a Pro trial zero invoice activates only the bounded trial, never a paid period', async () => {
  const start = Math.floor(Date.now() / 1000);
  context.checkout_scope = 'pro'; context.trial_days = 7; context.founder = false;
  context.first_base_cents = context.renewal_base_cents; context.coupon_id = null;
  sub.status = 'trialing'; sub.trial_start = start; sub.trial_end = start + 7 * 86400;
  invoice.total = 0; invoice.subtotal = 0; invoice.total_excluding_tax = 0;
  invoice.amount_paid = 0; invoice.total_discount_amounts = []; invoice.total_taxes = []; invoice.discounts = [];
  invoice.lines.data[0].subtotal = 0; invoice.lines.data[0].discount_amounts = [];
  invoice.lines.data[0].period = { start, end: start + 7 * 86400 };
  await reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_pro_trial');
  expect(events().filter(entry => entry.p_payload.kind === 'invoice_snapshot')).toHaveLength(0);
  expect(mocks.rpc).toHaveBeenCalledWith('service_reconcile_pro_trial', {
    p_payload: expect.objectContaining({ attempt_id: 'attempt', subscription_id: 'sub_org',
      trial_start: new Date(start * 1000).toISOString(), trial_end: new Date((start + 7 * 86400) * 1000).toISOString() }),
  });
});

it('a legacy contract still rejects a trial before entitlement writes', async () => {
  const start = Math.floor(Date.now() / 1000);
  sub.status = 'trialing'; sub.trial_start = start; sub.trial_end = start + 7 * 86400;
  await expect(reconcileOrganizationInvoice(mocks.stripe, 'in_org', 'evt_wrong_trial')).rejects.toThrow('trial_mismatch');
  expect(events()).toHaveLength(0);
});

it('failure persisting a Pro trial causes webhook retry', async () => {
  const start = Math.floor(Date.now() / 1000);
  context.checkout_scope = 'pro'; context.trial_days = 7; context.founder = false;
  sub.status = 'trialing'; sub.trial_start = start; sub.trial_end = start + 7 * 86400; sub.latest_invoice = null;
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name, args) => name === 'service_reconcile_pro_trial'
    ? { error: { message: 'temporary database outage' } } : original(name, args));
  await expect(handleOrganizationBillingWebhook(mocks.stripe, {
    id: 'evt_trial_retry', livemode: false, data: { object: sub },
  } as Stripe.Event)).rejects.toThrow('persistence_pending');
});
