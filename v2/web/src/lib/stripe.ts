import Stripe from "stripe";

/**
 * Shared server-side Stripe client.
 *
 * The original codebase instantiated `new Stripe(...)` inline in every route.
 * This singleton centralises it so the marketplace (Connect) routes and the
 * webhook share one configured instance. Server-only — never import from a
 * client component (it reads STRIPE_SECRET_KEY).
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}
