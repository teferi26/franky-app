import 'server-only';
import Stripe from 'stripe';

// Verified using Origin's own credential. Never accept this value from a buyer.
import { ORIGIN_MERCHANT_ACCOUNT } from './origin-partner';
export { ORIGIN_MERCHANT_ACCOUNT } from './origin-partner';
let client: Stripe | undefined;

export function getOriginStripe(): Stripe {
  const key = process.env.ORIGIN_STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_live_/.test(key)) throw new Error('Origin payments not configured');
  return client ??= new Stripe(key);
}

export async function originMerchantAccount() {
  const account = await getOriginStripe().accounts.retrieve(null);
  if (account.id !== ORIGIN_MERCHANT_ACCOUNT) throw new Error('Origin payment account mismatch');
  return account;
}
