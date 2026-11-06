import { NextRequest } from 'next/server';
import { organizationBillingFailure, organizationBillingRequest, organizationJson, ORGANIZATION_UUID } from '@/lib/organization-billing-api';
import { startOrganizationCheckout } from '@/lib/organization-billing';
import { ORGANIZATION_BILLING_RPC as RPC } from '../../../../../../../../shared/organization-billing';

export async function POST(req: NextRequest, route: { params: Promise<{ id: string }> }) {
  let orderId: string | undefined;
  try {
    const { id } = await route.params;
    const auth = await organizationBillingRequest(req, id, true);
    if ('response' in auth) return auth.response;
    if (Number(req.headers.get('content-length') ?? 0) > 4096) return organizationJson({ error: 'Solicitud demasiado grande.' }, 413);
    const raw = await req.text();
    if (raw.length > 4096) return organizationJson({ error: 'Solicitud demasiado grande.' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return organizationJson({ error: 'Solicitud no válida.' }, 400); }
    const allowed = ['quote_id', 'request_key', 'accepted_terms_version', 'accepted', 'accepted_first_base_cents', 'accepted_renewal_base_cents'];
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || body.accepted !== true
      || typeof body.quote_id !== 'string' || !ORGANIZATION_UUID.test(body.quote_id)
      || typeof body.request_key !== 'string' || !ORGANIZATION_UUID.test(body.request_key)
      || typeof body.accepted_terms_version !== 'string' || body.accepted_terms_version.length > 160 || !body.accepted_terms_version.trim()
      || !Number.isSafeInteger(body.accepted_first_base_cents) || Number(body.accepted_first_base_cents) <= 0
      || !Number.isSafeInteger(body.accepted_renewal_base_cents) || Number(body.accepted_renewal_base_cents) <= 0)
      return organizationJson({ error: 'Revisa la propuesta y acepta sus condiciones.' }, 400);
    const { data, error } = await auth.client.rpc(RPC.prepare, { p_organization_id: id, p_quote_id: body.quote_id,
      p_request_key: body.request_key, p_terms_version: body.accepted_terms_version,
      p_first_base_cents: body.accepted_first_base_cents, p_renewal_base_cents: body.accepted_renewal_base_cents });
    if (error || !data) throw Error(error?.message ?? 'organization_checkout_unavailable');
    orderId = data.attempt_id;
    if (!orderId || !ORGANIZATION_UUID.test(orderId) || data.organization_id !== id) throw Error('organization_checkout_identity_mismatch');
    const result = await startOrganizationCheckout(orderId, auth.user.id, id);
    const permission = await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: true });
    if (permission.error || permission.data?.organization_id !== id) throw Error('organization_billing_forbidden');
    return organizationJson(result);
  } catch (error) {
    // A durable intent exists: a timeout is uncertainty, never proof of failure or permission to buy again.
    if (orderId) return organizationJson({ status: 'pending', order_id: orderId });
    return organizationBillingFailure(error);
  }
}
