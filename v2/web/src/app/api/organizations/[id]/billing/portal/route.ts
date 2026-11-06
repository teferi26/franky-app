import { NextRequest } from 'next/server';
import { organizationBillingFailure, organizationBillingRequest, organizationJson } from '@/lib/organization-billing-api';
import { assertOrganizationCustomer } from '@/lib/organization-stripe-customer';
import { assertOrganizationPortal } from '@/lib/organization-billing-provider';
import { getStripe } from '@/lib/stripe';
import { safeStripeUrl } from '../../../../../../../../shared/payment-contract';
import { ORGANIZATION_BILLING_RPC as RPC } from '../../../../../../../../shared/organization-billing';

export async function POST(req: NextRequest, route: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await route.params;
    const auth = await organizationBillingRequest(req, id, true);
    if ('response' in auth) return auth.response;
    const raw = await req.text();
    if (raw.length > 100 || (raw.trim() && raw.trim() !== '{}')) return organizationJson({ error: 'Solicitud no válida.' }, 400);
    const access = async () => {
      const { data, error } = await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: true });
      if (error || !data || data.organization_id !== id) throw Error(error?.message ?? 'organization_billing_forbidden');
      if (!data.customer_id || !data.portal_config_id) throw Error('organization_portal_not_ready');
      return data;
    };
    const context = await access();
    const stripe = getStripe();
    await assertOrganizationCustomer(stripe, context.customer_id, context);
    assertOrganizationPortal(await stripe.billingPortal.configurations.retrieve(context.portal_config_id), context.environment, context.portal_config_id);
    const latest = await access();
    if (latest.account_id !== context.account_id || latest.customer_id !== context.customer_id || latest.portal_config_id !== context.portal_config_id)
      throw Error('organization_billing_forbidden');
    const session = await stripe.billingPortal.sessions.create({ customer: context.customer_id, configuration: context.portal_config_id,
      return_url: `https://franky.es/espacios/facturacion?organization=${encodeURIComponent(id)}` });
    const url = safeStripeUrl(session.url, ['billing.stripe.com']);
    if (!url || session.customer !== context.customer_id) throw Error('organization_portal_mismatch');
    await access();
    return organizationJson({ url });
  } catch (error) { return organizationBillingFailure(error); }
}
