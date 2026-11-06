import { assertRealPaymentActors } from './payment-demo-guard';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { createAdminSupabase } from './supabase-admin';
import { getStripe } from './stripe';

/** A database reference alone does not prove ownership (including legacy rows). */
export async function assertCustomerOwner(stripe: Stripe, id: string, userId: string) {
  const customer = await stripe.customers.retrieve(id);
  if (customer.deleted || customer.metadata.supabase_user_id !== userId) {
    throw new Error('billing_customer_ownership_unverified');
  }
  return customer;
}

export async function getOrCreateOwnedCustomer(user: { id: string; email?: string }) {
  await assertRealPaymentActors(user.id);
  const admin = createAdminSupabase();
  const stripe = getStripe();
  const { data: profile, error } = await admin.from('profiles').select('stripe_customer_id,is_discarded').eq('id', user.id).single();
  if (error || !profile || profile.is_discarded) throw new Error('billing_profile_unavailable');
  if (profile.stripe_customer_id) {
    await assertCustomerOwner(stripe, profile.stripe_customer_id, user.id);
    return profile.stripe_customer_id as string;
  }
  // The same account always uses the same request, even if its email changes
  // during a retry. Email is collected by Checkout where needed.
  const customer = await stripe.customers.create({ metadata: { supabase_user_id: user.id } }, {
    idempotencyKey: `customer:${createHash('sha256').update(user.id).digest('hex')}`,
  });
  const { error: saveError } = await admin.from('profiles').update({ stripe_customer_id: customer.id })
    .eq('id', user.id).is('stripe_customer_id', null);
  if (saveError) throw new Error('billing_customer_save_failed');
  const { data: saved, error: readError } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
  if (readError || !saved?.stripe_customer_id) throw new Error('billing_customer_save_unconfirmed');
  await assertCustomerOwner(stripe, saved.stripe_customer_id, user.id);
  return saved.stripe_customer_id as string;
}
