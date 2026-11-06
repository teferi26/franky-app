import type Stripe from 'stripe';
import { createAdminSupabase } from './supabase-admin';
import type { OrganizationCheckoutContext } from '../../../shared/organization-billing';
import { assertOrganizationEnvironment, ORGANIZATION_BILLING_MODE } from './organization-billing-provider';

export async function assertOrganizationCustomer(stripe: Stripe, customerId: string, context: Pick<OrganizationCheckoutContext, 'organization_id' | 'account_id' | 'environment'>) {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) throw Error('organization_customer_unavailable');
  assertOrganizationEnvironment(customer.livemode, context);
  if (customer.metadata.mode !== ORGANIZATION_BILLING_MODE || customer.metadata.organization_id !== context.organization_id
    || customer.metadata.billing_account_id !== context.account_id || customer.metadata.environment !== context.environment
    || customer.metadata.supabase_user_id) throw Error('organization_customer_mismatch');
  return customer;
}

/** A distinct entity customer never exposes a member's personal invoices. */
export async function organizationCustomer(stripe: Stripe, context: OrganizationCheckoutContext): Promise<string> {
  if (context.customer_id) {
    await assertOrganizationCustomer(stripe, context.customer_id, context);
    return context.customer_id;
  }
  const customer = await stripe.customers.create({ name: context.account.legal_name,
    metadata: { mode: ORGANIZATION_BILLING_MODE, organization_id: context.organization_id, billing_account_id: context.account_id, environment: context.environment },
  }, { idempotencyKey: `org-saas:customer:${context.account_id}:${context.environment}` });
  assertOrganizationEnvironment(customer.livemode, context);
  const { data, error } = await createAdminSupabase().rpc('service_bind_organization_customer', {
    p_account_id: context.account_id, p_environment: context.environment, p_customer_id: customer.id,
  });
  if (error || !data) throw Error('organization_customer_persistence_pending');
  // The durable winner can differ after a retry beyond provider idempotency retention.
  const winner = typeof data === 'string' ? data : data.customer_id;
  if (typeof winner !== 'string') throw Error('organization_customer_persistence_pending');
  await assertOrganizationCustomer(stripe, winner, context);
  return winner;
}
