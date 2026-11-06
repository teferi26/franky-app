import 'server-only';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { createAdminSupabase } from './supabase-admin';
import { getStripe } from './stripe';
import { safeStripeUrl, type PaymentReply } from '../../../shared/payment-contract';
import { ORGANIZATION_BILLING_RPC as RPC, type OrganizationBillingEventPayload, type OrganizationCheckoutContext } from '../../../shared/organization-billing';
import { organizationCustomer, assertOrganizationCustomer } from './organization-stripe-customer';
import { assertOrganizationCoupon, assertOrganizationEnvironment, assertOrganizationMetadata, assertOrganizationPrice,
  assertOrganizationTrial, organizationCheckoutParameters, organizationProviderId as id, organizationSalesReady, ORGANIZATION_BILLING_MODE } from './organization-billing-provider';
import { confirmedStripeRefunds } from './stripe-refund-evidence';

export async function organizationCheckoutContext(attemptId: string, actorId: string | null) {
  const { data, error } = await createAdminSupabase().rpc(RPC.context, { p_attempt_id: attemptId, p_actor_id: actorId });
  if (error || !data) throw Error(error?.message ?? 'organization_checkout_unavailable');
  const context = data as OrganizationCheckoutContext;
  if (context.attempt_id !== attemptId || context.contract_id !== attemptId) throw Error('organization_checkout_identity_mismatch');
  return context;
}
export function organizationPaymentReply(context: OrganizationCheckoutContext, allowUrl = true): PaymentReply {
  if (context.status === 'paid') return { status: 'paid', order_id: context.attempt_id };
  if (context.status === 'cancelled' || context.status === 'failed') return { status: context.status, order_id: context.attempt_id };
  const url = allowUrl && context.status === 'open' ? safeStripeUrl(context.checkout_url) : null;
  return url ? { status: 'checkout', order_id: context.attempt_id, url } : { status: 'pending', order_id: context.attempt_id };
}
/** Cola de revisión manual (migración 20260924200000). Nunca lanza. */
async function flagOrganizationInvoice(invoiceId: string, context: OrganizationCheckoutContext, issues: string[]) {
  console.error(`[organization-billing] factura en revisión ${invoiceId}: ${issues.join(', ')}`);
  try {
    const { error } = await createAdminSupabase().rpc('flag_payment_review', { p_kind: 'organization_invoice', p_reference: invoiceId,
      p_detail: { issues, organization_id: context.organization_id, attempt_id: context.attempt_id } });
    if (error) console.error(`[organization-billing] no se pudo guardar la revisión de ${invoiceId}`);
  } catch { console.error(`[organization-billing] no se pudo guardar la revisión de ${invoiceId}`); }
}
async function apply(context: OrganizationCheckoutContext, eventId: string, payload: OrganizationBillingEventPayload) {
  // A replay can observe a subsequent refund. Deduplicate the canonical economic snapshot, not only its trigger.
  const { provider_snapshot_ms: _observed, ...economicSnapshot } = payload;
  const digest = createHash('sha256').update(JSON.stringify(economicSnapshot)).digest('hex');
  const { error } = await createAdminSupabase().rpc(RPC.reconcile, { p_event_id: `${eventId}:${digest}`, p_environment: context.environment, p_payload: payload });
  if (error) throw Error('organization_billing_persistence_pending');
}
function identity(context: OrganizationCheckoutContext, subscriptionId: string, observed: number) {
  if (!context.customer_id) throw Error('organization_customer_unbound');
  return { attempt_id: context.attempt_id, organization_id: context.organization_id, account_id: context.account_id,
    customer_id: context.customer_id, subscription_id: subscriptionId, provider_snapshot_ms: observed };
}
async function assertSubscription(stripe: Stripe, subscription: Stripe.Subscription, context: OrganizationCheckoutContext) {
  assertOrganizationEnvironment(subscription.livemode, context);
  assertOrganizationMetadata(subscription.metadata, context);
  if (id(subscription.customer) !== context.customer_id || subscription.items.has_more || subscription.items.data.length !== 1
    || subscription.items.data[0].quantity !== 1 || subscription.collection_method !== 'charge_automatically'
    || subscription.transfer_data || subscription.on_behalf_of || subscription.application_fee_percent
    || !subscription.automatic_tax.enabled) throw Error('organization_subscription_mismatch');
  assertOrganizationTrial(subscription, context);
  const price = await stripe.prices.retrieve(subscription.items.data[0].price.id, { expand: ['product'] });
  assertOrganizationPrice(price, context);
}
async function recordSubscription(stripe: Stripe, subscription: Stripe.Subscription, context: OrganizationCheckoutContext, eventId: string, observed: number) {
  await assertSubscription(stripe, subscription, context);
  const end = subscription.items.data[0].current_period_end;
  await apply(context, `${eventId}:subscription`, { ...identity(context, subscription.id, observed), kind: 'subscription_state',
    status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: Number.isSafeInteger(end) ? new Date(end * 1000).toISOString() : null,
    price_id: context.price_id, product_id: context.product_id, currency: 'eur', quantity: 1 });
  if (context.checkout_scope === 'pro') {
    const { error } = await createAdminSupabase().rpc('service_reconcile_pro_trial', {
      p_payload: {
        ...identity(context, subscription.id, observed), environment: context.environment,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      },
    });
    if (error) throw Error('organization_billing_persistence_pending');
  }
}

/** Fully paid provider charges, not a dashboard "mark paid" action, establish the period. */
async function invoicePaymentEvidence(stripe: Stripe, invoice: Stripe.Invoice, context: OrganizationCheckoutContext) {
  let paid = 0, refunded = 0;
  let dispute: 'none' | 'open' | 'won' | 'lost' = 'none';
  const seen = new Set<string>();
  for await (const payment of stripe.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 100 })) {
    if (id(payment.invoice) !== invoice.id || payment.currency !== 'eur' || payment.livemode !== invoice.livemode
      || payment.status !== 'paid' || !Number.isSafeInteger(payment.amount_paid) || !payment.amount_paid) throw Error('organization_invoice_payment_mismatch');
    let chargeId = id(payment.payment.charge);
    if (payment.payment.type === 'payment_intent') {
      const intentId = id(payment.payment.payment_intent);
      if (!intentId) throw Error('organization_invoice_payment_mismatch');
      const intent = await stripe.paymentIntents.retrieve(intentId);
      if (intent.status !== 'succeeded' || id(intent.customer) !== context.customer_id || intent.currency !== 'eur'
        || intent.livemode !== invoice.livemode || intent.amount_received !== payment.amount_paid || intent.transfer_data || intent.on_behalf_of)
        throw Error('organization_invoice_payment_mismatch');
      chargeId = id(intent.latest_charge);
    } else if (payment.payment.type !== 'charge') throw Error('organization_invoice_manual_payment_unsupported');
    if (!chargeId || seen.has(chargeId)) throw Error('organization_invoice_payment_mismatch');
    seen.add(chargeId);
    const charge = await stripe.charges.retrieve(chargeId);
    if (!charge.paid || !charge.captured || charge.amount !== payment.amount_paid || charge.currency !== 'eur'
      || charge.livemode !== invoice.livemode || id(charge.customer) !== context.customer_id || charge.transfer_data || charge.on_behalf_of)
      throw Error('organization_invoice_charge_mismatch');
    paid += payment.amount_paid!;
    refunded += (await confirmedStripeRefunds(stripe, charge)).confirmedCents;
    for await (const item of stripe.disputes.list({ charge: charge.id, limit: 100 })) {
      if (id(item.charge) !== charge.id || item.currency !== 'eur' || item.livemode !== invoice.livemode) throw Error('organization_dispute_mismatch');
      if (item.status === 'lost') dispute = 'lost';
      else if (['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes(item.status) && dispute !== 'lost') dispute = 'open';
      else if (['won', 'warning_closed'].includes(item.status) && dispute === 'none') dispute = 'won';
    }
  }
  // Credit notes may already include the same refund. Never double-count it.
  refunded = Math.max(refunded, invoice.post_payment_credit_notes_amount);
  if (paid !== invoice.amount_paid || paid !== invoice.total || refunded > paid) throw Error('organization_invoice_funding_mismatch');
  return { paid, refunded, dispute };
}

export async function reconcileOrganizationInvoice(stripe: Stripe, invoiceId: string, eventId: string, eventLivemode?: boolean): Promise<boolean> {
  const observed = Date.now();
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['discounts', 'lines.data.discounts'] });
  const subscriptionId = id(invoice.parent?.subscription_details?.subscription);
  if (!subscriptionId) return false;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata.mode !== ORGANIZATION_BILLING_MODE) return false;
  const context = await organizationCheckoutContext(subscription.metadata.checkout_attempt_id, null);
  if (eventLivemode !== undefined) assertOrganizationEnvironment(eventLivemode, context);
  await assertSubscription(stripe, subscription, context);
  await assertOrganizationCustomer(stripe, context.customer_id!, context);
  assertOrganizationEnvironment(invoice.livemode, context);
  assertOrganizationMetadata(invoice.parent!.subscription_details!.metadata, context);
  // Draft invoices have no finalized price/tax/payment evidence. Finalization and paid events (or the worker) revisit them.
  if (invoice.status === 'draft') return true;
  const legalName = (value: string | null | undefined) => (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-ES');
  if (invoice.customer_address?.country !== context.account.country) throw Error('organization_invoice_legal_entity_mismatch');
  if (id(invoice.customer) !== context.customer_id || invoice.currency !== 'eur' || invoice.collection_method !== 'charge_automatically'
    || invoice.on_behalf_of || invoice.lines.has_more || invoice.lines.data.length !== 1 || invoice.starting_balance !== 0
    || (invoice.ending_balance !== null && invoice.ending_balance !== 0) || invoice.pre_payment_credit_notes_amount !== 0
    || !['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason ?? '')
    || !invoice.automatic_tax.enabled) throw Error('organization_invoice_mismatch');
  // Un nombre fiscal escrito distinto en Stripe o un cálculo de IVA incompleto
  // son defectos de la FACTURA, no del cobro: lanzar aquí dejaba sin acceso a
  // una organización que ya había pagado. Se concede según el dinero cobrado y
  // la factura queda en la cola de revisión manual para corregirla.
  const invoiceIssues: string[] = [];
  if (legalName(invoice.customer_name) !== legalName(context.account.legal_name)) invoiceIssues.push('legal_name');
  if (invoice.automatic_tax.status !== 'complete') invoiceIssues.push(`automatic_tax:${invoice.automatic_tax.status ?? 'unknown'}`);
  if (invoiceIssues.length) await flagOrganizationInvoice(invoice.id, context, invoiceIssues);
  const line = invoice.lines.data[0];
  if (context.checkout_scope === 'pro' && context.trial_days === 7
    && invoice.billing_reason === 'subscription_create' && invoice.total === 0) {
    // La factura inicial de una prueba no es un cobro. El acceso procede de
    // la suscripción verificada y vence exactamente cuando termina la prueba.
    if (invoice.status !== 'paid' || invoice.amount_paid !== 0 || invoice.amount_remaining !== 0
      || invoice.subtotal !== 0 || line.subtotal !== 0 || line.quantity !== 1
      || id(line.pricing?.price_details?.price) !== context.price_id
      || id(line.pricing?.price_details?.product) !== context.product_id
      || line.parent?.subscription_item_details?.subscription !== subscription.id
      || line.parent?.subscription_item_details?.proration
      || line.period.start !== subscription.trial_start || line.period.end !== subscription.trial_end
      || invoice.discounts.length || (invoice.total_discount_amounts ?? []).some(entry => entry.amount !== 0)
      || (invoice.total_taxes ?? []).some(entry => entry.amount !== 0))
      throw Error('organization_trial_invoice_mismatch');
    await recordSubscription(stripe, subscription, context, eventId, observed);
    return true;
  }
  if (line.quantity !== 1 || id(line.pricing?.price_details?.price) !== context.price_id
    || id(line.pricing?.price_details?.product) !== context.product_id || line.parent?.subscription_item_details?.subscription !== subscription.id
    || line.parent?.subscription_item_details?.proration || line.currency !== 'eur' || line.subtotal !== context.renewal_base_cents
    || invoice.subtotal !== context.renewal_base_cents) throw Error('organization_invoice_line_mismatch');
  const first = invoice.billing_reason === 'subscription_create';
  const expectedDiscount = first && context.founder ? context.renewal_base_cents - context.first_base_cents : 0;
  const discount = (invoice.total_discount_amounts ?? []).reduce((sum, entry) => sum + entry.amount, 0);
  const tax = (invoice.total_taxes ?? []).reduce((sum, entry) => sum + entry.amount, 0);
  if (discount !== expectedDiscount || invoice.total !== invoice.subtotal - discount + tax
    || invoice.total_excluding_tax !== invoice.subtotal - discount || !Number.isSafeInteger(tax) || tax < 0)
    throw Error('organization_invoice_amount_mismatch');
  const coupons = invoice.discounts.map(entry => typeof entry === 'string' ? null : id(entry.source.coupon));
  if (expectedDiscount > 0) {
    if (coupons.length !== 1 || coupons[0] !== context.coupon_id) throw Error('organization_invoice_coupon_mismatch');
    // A once-only coupon can be expired or deleted after consumption. Its immutable
    // invoice discount ID and exact amount are the evidence for this paid period.
  } else if (coupons.length || (line.discount_amounts ?? []).some(entry => entry.amount !== 0)) throw Error('organization_invoice_coupon_mismatch');
  const duration = line.period.end - line.period.start;
  if (!Number.isSafeInteger(line.period.start) || !Number.isSafeInteger(line.period.end) || line.period.start <= 0
    || duration < (context.interval === 'year' ? 364 : 27) * 86400 || duration > (context.interval === 'year' ? 367 : 32) * 86400)
    throw Error('organization_invoice_period_mismatch');
  const paid = invoice.status === 'paid' && invoice.amount_remaining === 0 && invoice.amount_paid === invoice.total;
  const evidence = paid ? await invoicePaymentEvidence(stripe, invoice, context) : { paid: 0, refunded: 0, dispute: 'none' as const };
  await apply(context, `${eventId}:invoice:${invoice.id}`, { ...identity(context, subscription.id, observed), kind: 'invoice_snapshot',
    invoice_id: invoice.id, price_id: context.price_id, product_id: context.product_id, currency: 'eur', quantity: 1,
    billing_reason: first ? 'subscription_create' : 'subscription_cycle', period_start: new Date(line.period.start * 1000).toISOString(),
    period_end: new Date(line.period.end * 1000).toISOString(), subtotal_cents: invoice.subtotal, discount_cents: discount,
    tax_cents: tax, total_cents: invoice.total, paid_cents: evidence.paid, refunded_cents: evidence.refunded,
    paid, dispute_status: evidence.dispute, coupon_id: expectedDiscount > 0 ? context.coupon_id : null });
  await recordSubscription(stripe, subscription, context, `${eventId}:invoice:${invoice.id}`, observed);
  return true;
}

async function attachSession(stripe: Stripe, session: Stripe.Checkout.Session, context: OrganizationCheckoutContext) {
  assertOrganizationEnvironment(session.livemode, context);
  assertOrganizationMetadata(session.metadata, context);
  if (session.mode !== 'subscription' || id(session.customer) !== context.customer_id || session.client_reference_id !== context.attempt_id
    || (context.session_id && context.session_id !== session.id) || session.recovered_from || session.after_expiration?.recovery?.enabled)
    throw Error('organization_checkout_session_mismatch');
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
  if (items.has_more || items.data.length !== 1 || items.data[0].quantity !== 1 || items.data[0].price?.id !== context.price_id)
    throw Error('organization_checkout_line_mismatch');
  const url = session.status === 'open' ? safeStripeUrl(session.url) : null;
  if (session.status === 'open' && !url) throw Error('organization_checkout_url_invalid');
  const { error } = await createAdminSupabase().rpc(RPC.attachCheckout, { p_attempt_id: context.attempt_id, p_session_id: session.id, p_checkout_url: url });
  if (error) throw Error('organization_checkout_persistence_pending');
}
async function reconcileSession(stripe: Stripe, session: Stripe.Checkout.Session, context: OrganizationCheckoutContext, eventId: string) {
  await attachSession(stripe, session, context);
  if (session.status === 'expired' && session.payment_status === 'unpaid' && !session.subscription) {
    await apply(context, `${eventId}:expiry`, { kind: 'checkout_expired', attempt_id: context.attempt_id, organization_id: context.organization_id,
      account_id: context.account_id, customer_id: context.customer_id!, session_id: session.id, payment_status: 'unpaid', provider_snapshot_ms: Date.now() });
  }
  // A completed browser session is not economic evidence. Only the invoice grants access.
  const invoiceId = id(session.invoice);
  if (invoiceId) await reconcileOrganizationInvoice(stripe, invoiceId, eventId);
  else if (id(session.subscription)) {
    const observed = Date.now();
    const subscription = await stripe.subscriptions.retrieve(id(session.subscription)!);
    await recordSubscription(stripe, subscription, context, eventId, observed);
    if (id(subscription.latest_invoice)) await reconcileOrganizationInvoice(stripe, id(subscription.latest_invoice)!, eventId);
  }
}

export async function startOrganizationCheckout(attemptId: string, actorId: string, organizationId: string) {
  let context = await organizationCheckoutContext(attemptId, actorId);
  if (context.organization_id !== organizationId) throw Error('organization_checkout_identity_mismatch');
  if (['paid', 'cancelled', 'failed'].includes(context.status)) return organizationPaymentReply(context);
  const stripe = getStripe();
  if (!context.session_id) {
    if (!organizationSalesReady(context)) throw Error('organization_sales_disabled');
    if (!Number.isFinite(Date.parse(context.created_at)) || Date.now() - Date.parse(context.created_at) > 20 * 60 * 60_000)
      return { status: 'pending', order_id: context.attempt_id } as PaymentReply;
    assertOrganizationPrice(await stripe.prices.retrieve(context.price_id, { expand: ['product'] }), context, true);
    if (context.founder) assertOrganizationCoupon(await stripe.coupons.retrieve(context.coupon_id!), context, true);
    context.customer_id = await organizationCustomer(stripe, context);
    // Revalidate current membership after provider reads and before any purchase is opened.
    context = await organizationCheckoutContext(attemptId, actorId);
    if (context.organization_id !== organizationId || !context.customer_id || !organizationSalesReady(context)) throw Error('organization_sales_disabled');
    const session = await stripe.checkout.sessions.create(organizationCheckoutParameters(context, context.customer_id), { idempotencyKey: `org-saas:checkout:${context.attempt_id}` });
    await reconcileSession(stripe, session, context, `recover:${context.attempt_id}:${Date.now()}`);
  } else {
    await assertOrganizationCustomer(stripe, context.customer_id!, context);
    await reconcileSession(stripe, await stripe.checkout.sessions.retrieve(context.session_id), context, `recover:${context.attempt_id}:${Date.now()}`);
  }
  context = await organizationCheckoutContext(attemptId, actorId);
  return organizationPaymentReply(context);
}

/** Read-only provider recovery; it never creates a second checkout. */
export async function recoverOrganizationCheckout(attemptId: string, organizationId: string) {
  const context = await organizationCheckoutContext(attemptId, null);
  if (context.organization_id !== organizationId) throw Error('organization_checkout_identity_mismatch');
  // Recover a lost create response without ever reusing an old provider idempotency key.
  if (!context.session_id && context.customer_id && !['cancelled', 'failed'].includes(context.status)) {
    await assertOrganizationCustomer(getStripe(), context.customer_id, context);
    let match: Stripe.Checkout.Session | undefined, scanned = 0;
    for await (const session of getStripe().checkout.sessions.list({ customer: context.customer_id,
      created: { gte: Math.max(0, Math.floor(Date.parse(context.created_at) / 1000) - 60) }, limit: 100 })) {
      if (++scanned > 200) throw Error('organization_checkout_reconciliation_limit');
      if (session.metadata?.mode === ORGANIZATION_BILLING_MODE && session.metadata.checkout_attempt_id === context.attempt_id) {
        if (match) throw Error('organization_checkout_duplicate_provider_sessions');
        match = session;
      }
    }
    if (match) await reconcileSession(getStripe(), await getStripe().checkout.sessions.retrieve(match.id), context, `poll:${context.attempt_id}:${Date.now()}`);
  }
  if (context.session_id) {
    await assertOrganizationCustomer(getStripe(), context.customer_id!, context);
    await reconcileSession(getStripe(), await getStripe().checkout.sessions.retrieve(context.session_id), context, `poll:${context.attempt_id}:${Date.now()}`);
  }
  return organizationCheckoutContext(attemptId, null);
}

export async function reconcileOrganizationBillingBatch() {
  const batch = await createAdminSupabase().rpc('service_organization_billing_reconcile_batch', { p_limit: 5 });
  if (batch.error || !batch.data || !Array.isArray(batch.data.attempts)) throw Error('organization_billing_batch_unavailable');
  const counts = { examined: 0, reconciled: 0, failed: 0, invoices: 0 };
  for (const entry of batch.data.attempts as OrganizationCheckoutContext[]) {
    counts.examined++;
    try {
      const context = await recoverOrganizationCheckout(entry.attempt_id, entry.organization_id);
      if (context.subscription_id) {
        const observed = Date.now();
        const subscription = await getStripe().subscriptions.retrieve(context.subscription_id);
        const runId = `cron:${context.attempt_id}:${Date.now()}`;
        await recordSubscription(getStripe(), subscription, context, runId, observed);
        if (id(subscription.latest_invoice)) await reconcileOrganizationInvoice(getStripe(), id(subscription.latest_invoice)!, runId);
        // One bounded page per entity; a durable compare-and-set cursor eventually reaches old refunds too.
        const page = await getStripe().invoices.list({ subscription: subscription.id, customer: context.customer_id!, limit: 5,
          ...(context.invoice_cursor ? { starting_after: context.invoice_cursor } : {}) });
        for (const invoice of page.data) {
          if (invoice.status === 'draft') continue;
          await reconcileOrganizationInvoice(getStripe(), invoice.id, runId);
          counts.invoices++;
        }
        if (page.has_more && !page.data.length) throw Error('organization_invoice_pagination_invalid');
        const cursor = await createAdminSupabase().rpc('service_advance_organization_invoice_cursor', {
          p_attempt_id: context.attempt_id, p_expected_cursor: context.invoice_cursor ?? null,
          p_next_cursor: page.has_more ? page.data.at(-1)!.id : null,
        });
        if (cursor.error || cursor.data?.advanced !== true) throw Error('organization_invoice_cursor_pending');
      }
      counts.reconciled++;
    } catch { counts.failed++; }
  }
  return counts;
}

/** Caller has verified Stripe's signature and platform account. */
export async function handleOrganizationBillingWebhook(stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  if (event.account) return false;
  const object = event.data.object;
  if (object.object === 'checkout.session') {
    if (object.metadata?.mode !== ORGANIZATION_BILLING_MODE) return false;
    const context = await organizationCheckoutContext(object.metadata.checkout_attempt_id, null);
    assertOrganizationEnvironment(event.livemode, context);
    await assertOrganizationCustomer(stripe, context.customer_id!, context);
    await reconcileSession(stripe, await stripe.checkout.sessions.retrieve(object.id), context, event.id);
    return true;
  }
  if (object.object === 'subscription') {
    if (object.metadata.mode !== ORGANIZATION_BILLING_MODE) return false;
    const observed = Date.now();
    const subscription = await stripe.subscriptions.retrieve(object.id);
    const context = await organizationCheckoutContext(subscription.metadata.checkout_attempt_id, null);
    assertOrganizationEnvironment(event.livemode, context);
    await assertOrganizationCustomer(stripe, context.customer_id!, context);
    await recordSubscription(stripe, subscription, context, event.id, observed);
    if (id(subscription.latest_invoice)) await reconcileOrganizationInvoice(stripe, id(subscription.latest_invoice)!, event.id);
    return true;
  }
  if (object.object === 'invoice') {
    if (object.parent?.subscription_details?.metadata?.mode !== ORGANIZATION_BILLING_MODE) return false;
    if (event.type === 'invoice.upcoming') return true;
    return reconcileOrganizationInvoice(stripe, object.id, event.id, event.livemode);
  }
  // Filtro barato ANTES de llamar a Stripe: este handler corre para todos los
  // eventos de cargo, disputa y devolución de la plataforma (entradas, visitas,
  // Origin...). Un charges.retrieve fallido aquí tumbaba también esos flujos.
  let chargeId: string | undefined;
  let customerId: string | undefined;
  let intentId: string | undefined;
  if (object.object === 'charge') {
    chargeId = object.id;
    intentId = id(object.payment_intent);
    // El cliente de un cargo no cambia: el snapshot del evento basta.
    customerId = id(object.customer);
    if (!customerId || object.transfer_data || object.on_behalf_of) return false;
  } else if (object.object === 'dispute' || object.object === 'refund') {
    // Los flujos de pago puntual etiquetan sus devoluciones; nunca son de SaaS.
    if (object.object === 'refund' && (object.metadata?.order_id || object.metadata?.workspace_refund_case || object.metadata?.mode)) return false;
    chargeId = id(object.charge);
    intentId = id(object.payment_intent);
  }
  if (!chargeId) return false;
  if (!customerId) {
    const charge = await stripe.charges.retrieve(chargeId);
    customerId = id(charge.customer);
    intentId ??= id(charge.payment_intent);
    if (!customerId) return false;
    // Las facturas de organización se cobran con un PaymentIntent de factura,
    // nunca con destination charge: un cargo con transferencia es de otro flujo.
    if (charge.transfer_data || charge.on_behalf_of) return false;
  }
  const known = await createAdminSupabase().rpc('service_is_organization_billing_customer', { p_customer_id: customerId, p_environment: event.livemode ? 'live' : 'test' });
  if (known.error) throw Error('organization_billing_customer_lookup_unavailable');
  if (known.data !== true) return false;
  if (!intentId) return false;
  let handled = false;
  const seen = new Set<string>();
  for await (const payment of stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: intentId }, limit: 100 })) {
    const invoiceId = id(payment.invoice);
    if (invoiceId && !seen.has(invoiceId)) {
      seen.add(invoiceId);
      handled = await reconcileOrganizationInvoice(stripe, invoiceId, event.id, event.livemode) || handled;
    }
  }
  return handled;
}
