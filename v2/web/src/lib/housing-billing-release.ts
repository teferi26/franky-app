/** Server-only decisions. Pass the resulting booleans to client components. */
export function housingDeferredBillingReady(): boolean {
  return process.env.HOUSING_DEFERRED_BILLING_READY === 'true';
}

/** Opening new contracts is separate from servicing contracts already accepted. */
export function housingFirstInterestEnabled(): boolean {
  return housingDeferredBillingReady() && process.env.HOUSING_FIRST_INTEREST_ENABLED === 'true'
    && !!process.env.STRIPE_SECRET_KEY
    && !!process.env.STRIPE_HOUSING_DEFERRED_LISTING_PRICE_ID
    && !!process.env.STRIPE_HOUSING_DEFERRED_MONTHLY_PRICE_ID
    && !!process.env.STRIPE_HOUSING_DEFERRED_QUARTERLY_PRICE_ID;
}
