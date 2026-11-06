import { NextRequest } from 'next/server';
import { organizationBillingFailure, organizationBillingRequest, organizationJson, organizationNativeRequest, ORGANIZATION_UUID } from '@/lib/organization-billing-api';
import { organizationCheckoutContext, organizationPaymentReply, recoverOrganizationCheckout } from '@/lib/organization-billing';
import { organizationSalesReady } from '@/lib/organization-billing-provider';
import { ORGANIZATION_BILLING_RPC as RPC, type OrganizationBillingState } from '../../../../../../../../shared/organization-billing';

export async function GET(req: NextRequest, route: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await route.params;
    const auth = await organizationBillingRequest(req, id, false);
    if ('response' in auth) return auth.response;
    let order = req.nextUrl.searchParams.get('order');
    const requestKey = req.nextUrl.searchParams.get('request_key');
    if (order && !ORGANIZATION_UUID.test(order)) return organizationJson({ error: 'Pedido no válido.' }, 400);
    if (requestKey && !ORGANIZATION_UUID.test(requestKey)) return organizationJson({ error: 'Solicitud no válida.' }, 400);
    if (order || requestKey) {
      const { data: permission, error: denied } = await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: false });
      if (denied || !permission || permission.organization_id !== id) throw Error('organization_billing_forbidden');
    }
    let attemptKnown: boolean | undefined;
    if (requestKey) {
      const lookup = await auth.client.rpc('lookup_organization_checkout', { p_organization_id: id, p_request_key: requestKey });
      if (lookup.error || !lookup.data || typeof lookup.data.attempt_known !== 'boolean') throw Error('organization_checkout_lookup_unavailable');
      attemptKnown = lookup.data.attempt_known;
      if (lookup.data.attempt_id) {
        if (order && order !== lookup.data.attempt_id) return organizationJson({ error: 'La solicitud pertenece a otro pedido.' }, 400);
        order = lookup.data.attempt_id;
      }
    }
    let payment;
    if (order) {
      const context = await organizationCheckoutContext(order, null);
      if (context.organization_id !== id) return organizationJson({ error: 'Pedido no disponible en este espacio.' }, 404);
      let refreshed = null;
      try { refreshed = await recoverOrganizationCheckout(order, id); }
      catch { payment = { status: 'pending', order_id: order }; }
      const finalAccess = await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: false });
      if (finalAccess.error || !finalAccess.data || finalAccess.data.organization_id !== id) throw Error('organization_billing_forbidden');
      if (refreshed) {
        // A finance reader can see status, but continuing a purchase requires current management + AAL2.
        const manage = organizationNativeRequest(req) ? null : await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: true });
        let allowUrl = false;
        if (manage && !manage.error && manage.data?.organization_id === id) {
          try { allowUrl = (await organizationCheckoutContext(order, auth.user.id)).organization_id === id; }
          catch { /* Suspended entities keep history/cancellation, never a new purchase URL. */ }
        }
        payment = organizationPaymentReply(refreshed, allowUrl);
      }
    }
    // Rechecking after provider I/O also catches an access revoked while the response was in flight.
    const { data, error } = await auth.client.rpc(RPC.state, { p_organization_id: id });
    if (error || !data) throw Error(error?.message ?? 'organization_billing_forbidden');
    if (order || requestKey) {
      const permission = await auth.client.rpc(RPC.access, { p_organization_id: id, p_manage: !!payment?.url });
      if (permission.error || permission.data?.organization_id !== id) throw Error('organization_billing_forbidden');
    }
    const state = data as OrganizationBillingState;
    return organizationJson({ billing: { ...state, can_checkout_web: !organizationNativeRequest(req) && organizationSalesReady(state)
      && state.can_manage_billing && state.account?.verified === true && !state.access.paused && state.catalog.some(plan => plan.status === 'active') },
      ...(payment ? { payment } : {}), ...(attemptKnown === undefined ? {} : { attempt_known: attemptKnown }) });
  } catch (error) { return organizationBillingFailure(error); }
}
