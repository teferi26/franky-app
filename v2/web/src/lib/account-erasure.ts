import 'server-only';
import type Stripe from 'stripe';
import { createAdminSupabase } from './supabase-admin';
import { getStripe } from './stripe';
import { assertCustomerOwner } from './stripe-customer';
import { sendEmail } from './email';
import { revokeAppleCredentials } from './apple-account';

type Erasure = {
  user_id: string; lease_id: string; requested_at: string;
  completion_email: string | null; apple_subject: string | null;
  auth_erased_at: string | null; state: 'requested' | 'purged';
  billing_stopped_at: string | null; apple_revoked_at: string | null;
  notification_sent_at: string | null; notification_attempts: number;
  billing: { customers?: string[]; subscriptions?: string[]; checkouts?: string[] };
};
type ErasureFile = { bucket_id: string; name: string };
type Admin = ReturnType<typeof createAdminSupabase>;

async function rpc<T>(admin: Admin, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`erasure_${name}_failed`);
  return data as T;
}

/** Only cancel renewals belonging to this verified account. No refunds, ticket
 * invalidation or connected-account deletion is part of account erasure. */
export async function stopAccountRenewals(stripe: Stripe, job: Erasure) {
  const customers = new Set(job.billing.customers ?? []);
  const subscriptionIds = new Set(job.billing.subscriptions ?? []);
  const checkoutIds = new Set(job.billing.checkouts ?? []);
  // Resolve customers from subscriptions BEFORE enumerating their schedules and
  // checkouts. A stale/missing customer reference must not skip another renewal.
  for (const id of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(id);
    customers.add(typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id);
  }
  // Complete/guest checkouts may identify a customer absent from the snapshot.
  for (const id of checkoutIds) {
    const checkout = await stripe.checkout.sessions.retrieve(id);
    const customer = typeof checkout.customer === 'string' ? checkout.customer : checkout.customer?.id;
    if (customer) { await assertCustomerOwner(stripe, customer, job.user_id); customers.add(customer); }
    else if (checkout.metadata?.supabase_user_id !== job.user_id) throw new Error('erasure_checkout_ownership_unverified');
  }
  // A stale local record is insufficient: verify the Stripe customer itself.
  for (const id of customers) await assertCustomerOwner(stripe, id, job.user_id);
  for (const customer of customers) {
    for await (const schedule of stripe.subscriptionSchedules.list({ customer, limit: 100 })) {
      if (schedule.status === 'active') {
        await stripe.subscriptionSchedules.release(schedule.id, { preserve_cancel_date: true });
      } else if (schedule.status === 'not_started') {
        await stripe.subscriptionSchedules.cancel(schedule.id);
      }
    }
    for await (const checkout of stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 })) checkoutIds.add(checkout.id);
  }
  for (const id of checkoutIds) {
    const checkout = await stripe.checkout.sessions.retrieve(id);
    const customer = typeof checkout.customer === 'string' ? checkout.customer : checkout.customer?.id;
    if (checkout.metadata?.supabase_user_id !== job.user_id && (!customer || !customers.has(customer))) {
      throw new Error('erasure_checkout_ownership_unverified');
    }
    if (checkout.status === 'open') await stripe.checkout.sessions.expire(id);
    if (checkout.subscription) subscriptionIds.add(typeof checkout.subscription === 'string' ? checkout.subscription : checkout.subscription.id);
  }
  // Expire checkouts BEFORE the subscription sweep: a checkout completing in
  // between must have its newly created subscription included in this pass.
  for (const customer of customers) {
    for await (const subscription of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) subscriptionIds.add(subscription.id);
  }
  for (const id of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(id);
    const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    if (!customers.has(customer)) throw new Error('erasure_subscription_customer_changed');
    if (!['canceled', 'incomplete_expired'].includes(subscription.status) && !subscription.cancel_at_period_end) {
      await stripe.subscriptions.update(id, { cancel_at_period_end: true });
    }
  }
}

/** One leased job per invocation; incomplete work stays durable and retryable. */
export async function processAccountErasure() {
  const admin = createAdminSupabase();
  const job = await rpc<Erasure | null>(admin, 'claim_account_erasure');
  if (!job) return { processed: 0 };
  const args = { p_user: job.user_id, p_lease: job.lease_id };
  const step = (p_step: string, p_files: ErasureFile[] = []) => rpc(admin, 'finish_account_erasure_step', { ...args, p_step, p_files });
  const started = Date.now();
  const finalPass = started - Date.parse(job.requested_at) >= 130 * 60_000;
  try {
    await rpc(admin, 'purge_account_erasure', args);
    // Financial/provider retries must not retain the profile or Auth PII.
    if (!job.auth_erased_at) {
      const { error } = await admin.auth.admin.deleteUser(job.user_id, true);
      if (error && error.code !== 'user_not_found') throw new Error('erasure_auth_failed');
      await step('auth');
    }
    while (Date.now() - started < 40_000) {
      const files = await rpc<ErasureFile[]>(admin, 'account_erasure_files', args);
      if (!files.length) break;
      const buckets = new Map<string, ErasureFile[]>();
      for (const file of files) buckets.set(file.bucket_id, [...(buckets.get(file.bucket_id) ?? []), file]);
      for (const [bucket, entries] of buckets) {
        const { error } = await admin.storage.from(bucket).remove(entries.map(file => file.name));
        if (error) throw new Error('erasure_storage_failed');
        await step('files', entries);
      }
    }
    const remaining = await rpc<ErasureFile[]>(admin, 'account_erasure_files', args);
    if (remaining.length) { await step('retry'); return { processed: 1, complete: false }; }
    let externalReady = true;
    if (!job.billing_stopped_at || finalPass) {
      try {
        if (Object.values(job.billing).some(ids => ids?.length)) await stopAccountRenewals(getStripe(), job);
        await step('billing');
      } catch { externalReady = false; }
    }
    if (!job.apple_revoked_at) {
      try { await revokeAppleCredentials(admin, job.user_id); await step('apple'); }
      catch { externalReady = false; }
    }
    if (!externalReady) throw new Error('erasure_external_retry_required');
    if (!finalPass) {
      await step('wait'); return { processed: 1, complete: false };
    }
    if (job.completion_email && !job.notification_sent_at && job.notification_attempts < 5) {
      const apple = job.apple_subject
        ? ' Si usabas Iniciar sesión con Apple, retira también el acceso de Franky desde los ajustes de tu cuenta Apple: https://support.apple.com/es-es/102571.' : '';
      const text = 'Hemos eliminado tu perfil y los datos personales de uso de la app. La cuenta ya no se puede recuperar. Solo conservamos los registros necesarios para obligaciones legales, operaciones pendientes y derechos de otras personas, con acceso restringido.' + apple;
      const sent = await sendEmail({
        to: job.completion_email, subject: 'Tu cuenta de Franky se ha eliminado',
        text, html: `<p>${text}</p>`, idempotencyKey: `account-erasure:${job.user_id}`,
      });
      if (!sent.ok) {
        await step('notice_failed');
        if (job.notification_attempts + 1 < 5) throw new Error('erasure_confirmation_failed');
      } else await step('notice_sent');
    }
    await step('complete');
    return { processed: 1, complete: true };
  } catch {
    // Never log addresses, tokens, provider error bodies or user content.
    await step('retry').catch(() => {});
    throw new Error('account_erasure_retry_required');
  }
}
