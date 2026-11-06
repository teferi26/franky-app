import type { NextRequest } from "next/server";
import { z } from "zod";
import { organizationBillingFailure, organizationJson } from "@/lib/organization-billing-api";
import { proRequest } from "@/lib/pro/onboarding";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { assertOrganizationCustomer } from "@/lib/organization-stripe-customer";
import { assertOrganizationPortal } from "@/lib/organization-billing-provider";
import { safeStripeUrl } from "../../../../../../../shared/payment-contract";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 500) return organizationJson({ error: "Solicitud demasiado grande." }, 413);
    let input;
    try { input = z.object({ workspaceId: z.uuid() }).strict().safeParse(JSON.parse(raw)); }
    catch { return organizationJson({ error: "Espacio no válido." }, 400); }
    if (!input.success) return organizationJson({ error: "Espacio no válido." }, 400);
    const { workspaceId } = input.data;
    const auth = await proRequest(req, workspaceId, true);
    if ("response" in auth) return auth.response;
    const context = async () => {
      const { data, error } = await createAdminSupabase().rpc("service_pro_portal_context", {
        p_organization_id: workspaceId, p_actor_id: auth.user.id,
      });
      if (error || !data?.customer_id || !data?.portal_config_id)
        throw Error(error?.message ?? "organization_portal_not_ready");
      return data;
    };
    const before = await context();
    const stripe = getStripe();
    await assertOrganizationCustomer(stripe, before.customer_id, before);
    assertOrganizationPortal(await stripe.billingPortal.configurations.retrieve(before.portal_config_id), before.environment, before.portal_config_id);
    const latest = await context();
    if (latest.account_id !== before.account_id || latest.customer_id !== before.customer_id
      || latest.portal_config_id !== before.portal_config_id) throw Error("organization_billing_forbidden");
    const session = await stripe.billingPortal.sessions.create({
      customer: before.customer_id,
      configuration: before.portal_config_id,
      return_url: `https://franky.es/pro/${workspaceId}/ajustes`,
    });
    const url = safeStripeUrl(session.url, ["billing.stripe.com"]);
    if (!url || session.customer !== before.customer_id) throw Error("organization_portal_mismatch");
    await context();
    return organizationJson({ url });
  } catch (error) { return organizationBillingFailure(error); }
}
