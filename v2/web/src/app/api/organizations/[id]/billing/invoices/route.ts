import { NextRequest } from 'next/server';
import { organizationBillingFailure, organizationBillingRequest, organizationJson, organizationNativeRequest } from '@/lib/organization-billing-api';
import { assertOrganizationCustomer } from '@/lib/organization-stripe-customer';
import { assertOrganizationEnvironment, organizationProviderId as providerId, ORGANIZATION_BILLING_MODE } from '@/lib/organization-billing-provider';
import { getStripe } from '@/lib/stripe';
import { safeStripeUrl } from '../../../../../../../../shared/payment-contract';
import { ORGANIZATION_BILLING_RPC as RPC } from '../../../../../../../../shared/organization-billing';

export async function GET(req: NextRequest, route: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await route.params;
    const auth = await organizationBillingRequest(req, id, false);
    if ('response' in auth) return auth.response;
    const access = async () => {
      const { data, error } = await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: false });
      if (error || !data || data.organization_id !== id) throw Error('organization_billing_forbidden');
      return data;
    };
    const context = await access();
    if (!context.customer_id) return organizationJson({ invoices: [], next_cursor: null });
    const cursor = req.nextUrl.searchParams.get('cursor');
    if (cursor && !/^in_[A-Za-z0-9]{1,120}$/.test(cursor)) return organizationJson({ error: 'Página no válida.' }, 400);
    const stripe = getStripe();
    await assertOrganizationCustomer(stripe, context.customer_id, context);
    if (cursor) {
      const anchor = await stripe.invoices.retrieve(cursor);
      if (providerId(anchor.customer) !== context.customer_id) return organizationJson({ error: 'Página no disponible.' }, 404);
      assertOrganizationEnvironment(anchor.livemode, context);
    }
    const page = await stripe.invoices.list({ customer: context.customer_id, limit: 50, ...(cursor ? { starting_after: cursor } : {}) });
    const native = organizationNativeRequest(req);
    const invoices = page.data.map(invoice => {
      assertOrganizationEnvironment(invoice.livemode, context);
      const metadata = invoice.parent?.subscription_details?.metadata;
      if (providerId(invoice.customer) !== context.customer_id || metadata?.mode !== ORGANIZATION_BILLING_MODE
        || metadata.organization_id !== id || metadata.billing_account_id !== context.account_id) throw Error('organization_invoice_identity_mismatch');
      return { id: invoice.id, number: invoice.number, status: invoice.status, currency: invoice.currency, total: invoice.total,
        amount_paid: invoice.amount_paid, created: invoice.created,
        invoice_pdf: safeStripeUrl(invoice.invoice_pdf, ['pay.stripe.com', 'invoice.stripe.com', 'files.stripe.com']),
        hosted_invoice_url: native ? null : safeStripeUrl(invoice.hosted_invoice_url, ['invoice.stripe.com', 'pay.stripe.com']) };
    });
    const latest = await access();
    if (latest.account_id !== context.account_id || latest.customer_id !== context.customer_id) throw Error('organization_billing_forbidden');
    return organizationJson({ invoices, next_cursor: page.has_more && page.data.length ? page.data.at(-1)!.id : null });
  } catch (error) { return organizationBillingFailure(error); }
}
