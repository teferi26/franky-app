import type Stripe from 'stripe';
import type { OrganizationCheckoutContext, OrganizationBillingEnvironment } from '../../../shared/organization-billing';

export const ORGANIZATION_BILLING_MODE = 'organization_saas';
export const organizationProviderId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
export function organizationStripeEnvironment(): OrganizationBillingEnvironment | null {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : null;
}
export function organizationSalesReady(value: { environment: OrganizationBillingEnvironment; sales_enabled: boolean; provider_ready: boolean }) {
  return value.sales_enabled && value.provider_ready && process.env.ORGANIZATION_BILLING_CHECKOUT_ENABLED === 'true'
    && !!process.env.STRIPE_WEBHOOK_SECRET && value.environment === organizationStripeEnvironment();
}
export function organizationMetadata(context: OrganizationCheckoutContext): Record<string, string> {
  return { mode: ORGANIZATION_BILLING_MODE, organization_id: context.organization_id, billing_account_id: context.account_id,
    contract_id: context.contract_id, checkout_attempt_id: context.attempt_id, price_version: `${context.plan_key}:${context.plan_version}` };
}
export function assertOrganizationMetadata(metadata: Stripe.Metadata | null, context: OrganizationCheckoutContext) {
  for (const [key, value] of Object.entries(organizationMetadata(context))) {
    if (metadata?.[key] !== value) throw Error('organization_provider_identity_mismatch');
  }
  if (metadata?.supabase_user_id || metadata?.business_type || metadata?.listing_id) throw Error('organization_provider_identity_mismatch');
}
export function assertOrganizationEnvironment(livemode: boolean, context: Pick<OrganizationCheckoutContext, 'environment'>) {
  if (typeof livemode !== 'boolean' || livemode !== (context.environment === 'live') || context.environment !== organizationStripeEnvironment())
    throw Error('organization_provider_environment_mismatch');
}
export function assertOrganizationPrice(price: Stripe.Price, context: OrganizationCheckoutContext, forSale = false) {
  assertOrganizationEnvironment(price.livemode, context);
  const product = price.product;
  if (price.id !== context.price_id || organizationProviderId(product) !== context.product_id || price.currency !== 'eur'
    || price.unit_amount !== context.renewal_base_cents || price.type !== 'recurring' || price.billing_scheme !== 'per_unit'
    || price.tax_behavior !== 'exclusive' || price.recurring?.interval !== context.interval || price.recurring?.interval_count !== 1
    || price.recurring.usage_type !== 'licensed' || price.transform_quantity || (forSale && !price.active)) throw Error('organization_provider_price_mismatch');
  if (typeof product === 'string' || product.deleted || (forSale && !product.active) || product.livemode !== price.livemode)
    throw Error('organization_provider_product_mismatch');
}
export function assertOrganizationCoupon(coupon: Stripe.Coupon, context: OrganizationCheckoutContext, forSale = false) {
  assertOrganizationEnvironment(coupon.livemode, context);
  const expected = context.renewal_base_cents - context.first_base_cents;
  if (!context.founder || context.interval !== 'year' || coupon.id !== context.coupon_id || coupon.duration !== 'once'
    || coupon.currency !== 'eur' || coupon.amount_off !== expected || expected <= 0 || coupon.percent_off !== null
    || coupon.applies_to?.products.length !== 1 || coupon.applies_to.products[0] !== context.product_id
    || (forSale && !coupon.valid)) throw Error('organization_provider_coupon_mismatch');
}
export function assertOrganizationPortal(configuration: Stripe.BillingPortal.Configuration, environment: OrganizationBillingEnvironment, expectedId: string) {
  assertOrganizationEnvironment(configuration.livemode, { environment });
  const features = configuration.features;
  if (configuration.id !== expectedId || !configuration.active || configuration.login_page.enabled
    || !features.payment_method_update.enabled || !features.subscription_cancel.enabled
    || features.subscription_cancel.mode !== 'at_period_end' || features.subscription_cancel.proration_behavior !== 'none'
    || features.subscription_update.enabled || features.customer_update.enabled)
    throw Error('organization_portal_configuration_unsafe');
}
/** Solo una propuesta Pro inmutable puede conceder la prueba de siete días. */
export function assertOrganizationTrial(subscription: Stripe.Subscription, context: OrganizationCheckoutContext) {
  if (!subscription.trial_end && !subscription.trial_start) {
    if (subscription.status === 'trialing') throw Error('organization_subscription_trial_mismatch');
    return;
  }
  const start = subscription.trial_start;
  const end = subscription.trial_end;
  const created = Math.floor(Date.parse(context.created_at) / 1000);
  if (context.checkout_scope !== 'pro' || context.trial_days !== 7 || context.founder
    || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !start || !end
    || end - start !== 7 * 86400 || start < created - 60 || start > created + 86400)
    throw Error('organization_subscription_trial_mismatch');
}

export function proCheckoutOrigin(context: OrganizationCheckoutContext) {
  if (context.environment === 'live') return 'https://franky.es';
  const raw = process.env.PRO_CHECKOUT_RETURN_ORIGIN
    ?? (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000');
  const url = new URL(raw);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))))
    throw Error('organization_checkout_return_invalid');
  return url.origin;
}

export function organizationCheckoutParameters(context: OrganizationCheckoutContext, customerId: string): Stripe.Checkout.SessionCreateParams {
  const metadata = organizationMetadata(context);
  const returnUrl = context.checkout_scope === 'pro'
    ? `${proCheckoutOrigin(context)}/pro/activar?workspace=${encodeURIComponent(context.organization_id)}&order=${encodeURIComponent(context.attempt_id)}`
    : `https://franky.es/espacios/facturacion?organization=${encodeURIComponent(context.organization_id)}&order=${encodeURIComponent(context.attempt_id)}`;
  return { mode: 'subscription', customer: customerId, client_reference_id: context.attempt_id, metadata,
    subscription_data: { metadata, ...(context.checkout_scope === 'pro' && context.trial_days === 7
      ? { trial_period_days: 7, trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } } } : {}) }, line_items: [{ price: context.price_id, quantity: 1 }],
    ...(context.founder ? { discounts: [{ coupon: context.coupon_id! }] } : {}),
    allow_promotion_codes: false, automatic_tax: { enabled: true }, billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' }, tax_id_collection: { enabled: true },
    payment_method_types: ['card'], payment_method_collection: 'always', consent_collection: { terms_of_service: 'required' },
    success_url: returnUrl, cancel_url: `${returnUrl}&return=cancel`,
    expires_at: Math.floor(Date.parse(context.created_at) / 1000) + 23 * 60 * 60,
    custom_text: { submit: { message: `${context.checkout_scope === 'pro' && context.trial_days === 7 ? '7 días gratis. Después: ' : ''}Primera cuota: ${(context.first_base_cents / 100).toFixed(2)} EUR antes de impuestos. Renovación ${context.interval === 'year' ? 'anual' : 'mensual'}: ${(context.renewal_base_cents / 100).toFixed(2)} EUR antes de impuestos. Condiciones ${context.terms_version}. El total fiscal definitivo se muestra antes de pagar.` } },
  };
}
