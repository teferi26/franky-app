// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { OrganizationCheckoutContext } from '../../../shared/organization-billing';
import { assertOrganizationCoupon, assertOrganizationMetadata, assertOrganizationPortal, assertOrganizationPrice, organizationCheckoutParameters,
  organizationMetadata, organizationSalesReady, organizationStripeEnvironment } from '@/lib/organization-billing-provider';

const context = { attempt_id: 'attempt', organization_id: 'org', account_id: 'account', contract_id: 'attempt', environment: 'test', plan_key: 'beauty', plan_version: 1,
  price_id: 'price_year', product_id: 'prod_org', coupon_id: 'coupon_founder', first_base_cents: 19900, renewal_base_cents: 29000, interval: 'year', founder: true,
  terms_version: 'v1', created_at: '2026-09-23T16:00:00.000Z', sales_enabled: true, provider_ready: true } as OrganizationCheckoutContext;
const price = () => ({ id: 'price_year', product: { id: 'prod_org', active: true, livemode: false }, active: true, livemode: false, currency: 'eur', unit_amount: 29000,
  type: 'recurring', billing_scheme: 'per_unit', tax_behavior: 'exclusive', recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } } as Stripe.Price);
const coupon = () => ({ id: 'coupon_founder', livemode: false, duration: 'once', currency: 'eur', amount_off: 9100, percent_off: null, valid: true,
  applies_to: { products: ['prod_org'] } } as Stripe.Coupon);
const portal = () => ({ id: 'bpc_org', livemode: false, active: true, login_page: { enabled: false }, features: { payment_method_update: { enabled: true },
  customer_update: { enabled: false }, subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' } } } as Stripe.BillingPortal.Configuration);
beforeEach(() => { vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_synthetic'); vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'false'); });
describe('organization product boundary', () => {
  it('requires both deployment opt-in and a verified environment', () => {
    expect(organizationSalesReady(context)).toBe(false);
    vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'true');
    expect(organizationSalesReady(context)).toBe(true);
    expect(organizationSalesReady({ ...context, environment: 'live' })).toBe(false);
    expect(organizationSalesReady({ ...context, provider_ready: false })).toBe(false);
    vi.stubEnv('STRIPE_SECRET_KEY', 'invalid'); expect(organizationStripeEnvironment()).toBeNull();
  });
  it.each([
    ['amount', { unit_amount: 19900 }], ['currency', { currency: 'usd' }], ['test/live', { livemode: true }], ['inclusive tax', { tax_behavior: 'inclusive' }],
    ['metered', { recurring: { interval: 'year', interval_count: 1, usage_type: 'metered' } }], ['two years', { recurring: { interval: 'year', interval_count: 2, usage_type: 'licensed' } }],
    ['wrong product', { product: { id: 'prod_personal', active: true, livemode: false } }], ['quantity transform', { transform_quantity: { divide_by: 10, round: 'up' } }],
  ])('rejects %s before checkout', (_label, patch) => { expect(() => assertOrganizationPrice({ ...price(), ...patch } as Stripe.Price, context, true)).toThrow(); });
  it('archived products still prove an old contract but cannot create a sale', () => {
    const archived = { ...price(), active: false, product: { id: 'prod_org', active: false, livemode: false } } as Stripe.Price;
    expect(() => assertOrganizationPrice(archived, context)).not.toThrow();
    expect(() => assertOrganizationPrice(archived, context, true)).toThrow();
  });
  it.each([
    ['recurring founder', { duration: 'forever' }], ['percentage', { amount_off: null, percent_off: 30 }], ['amount', { amount_off: 9000 }],
    ['unrestricted', { applies_to: undefined }], ['another product', { applies_to: { products: ['prod_other'] } }], ['extra product', { applies_to: { products: ['prod_org', 'prod_other'] } }],
  ])('rejects %s coupon', (_label, patch) => { expect(() => assertOrganizationCoupon({ ...coupon(), ...patch } as Stripe.Coupon, context, true)).toThrow(); });
  it('limits founder to the first annual invoice and restricts final consent', () => {
    const body = organizationCheckoutParameters(context, 'cus_org');
    expect(body.line_items).toEqual([{ price: 'price_year', quantity: 1 }]);
    expect(body.discounts).toEqual([{ coupon: 'coupon_founder' }]);
    expect(body.automatic_tax).toEqual({ enabled: true }); expect(body.consent_collection).toEqual({ terms_of_service: 'required' });
    expect(body.customer_update).toEqual({ address: 'auto', name: 'auto' }); expect(body.allow_promotion_codes).toBe(false);
    expect(body.metadata).toEqual(body.subscription_data?.metadata);
    expect(body.success_url).toBe('https://franky.es/espacios/facturacion?organization=org&order=attempt');
    expect(body.cancel_url).toContain('&return=cancel'); expect(body.subscription_data).not.toHaveProperty('trial_period_days');
    expect(organizationCheckoutParameters({ ...context, founder: false, interval: 'month' }, 'cus_org').discounts).toBeUndefined();
  });
  it('never accepts personal or another organization metadata', () => {
    expect(() => assertOrganizationMetadata(organizationMetadata(context), context)).not.toThrow();
    expect(() => assertOrganizationMetadata({ ...organizationMetadata(context), organization_id: 'other' }, context)).toThrow();
    expect(() => assertOrganizationMetadata({ ...organizationMetadata(context), supabase_user_id: 'person' }, context)).toThrow();
  });
  it('allows only the separately configured cancellation/payment-method portal', () => {
    expect(() => assertOrganizationPortal(portal(), 'test', 'bpc_org')).not.toThrow();
    for (const bad of [
      { ...portal(), login_page: { enabled: true } }, { ...portal(), id: 'bpc_personal' },
      { ...portal(), features: { ...portal().features, subscription_update: { enabled: true } } },
      { ...portal(), features: { ...portal().features, customer_update: { enabled: true } } },
      { ...portal(), features: { ...portal().features, subscription_cancel: { enabled: true, mode: 'immediately', proration_behavior: 'none' } } },
    ]) expect(() => assertOrganizationPortal(bad as Stripe.BillingPortal.Configuration, 'test', 'bpc_org')).toThrow();
  });
});
