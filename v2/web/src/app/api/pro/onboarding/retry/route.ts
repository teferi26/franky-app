import type { NextRequest } from "next/server";
import { z } from "zod";
import { organizationBillingFailure, organizationJson } from "@/lib/organization-billing-api";
import { proOnboardingState, proReply, proRequest } from "@/lib/pro/onboarding";
import { startOrganizationCheckout } from "@/lib/organization-billing";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 500) return organizationJson({ error: "Solicitud demasiado grande." }, 413);
    let input;
    try { input = z.object({ workspaceId: z.uuid(), orderId: z.uuid() }).strict().safeParse(JSON.parse(raw)); }
    catch { return organizationJson({ error: "Pedido no válido." }, 400); }
    if (!input.success) return organizationJson({ error: "Pedido no válido." }, 400);
    const { workspaceId, orderId } = input.data;
    const auth = await proRequest(req, workspaceId, true);
    if ("response" in auth) return auth.response;
    await proOnboardingState(auth.client, workspaceId, orderId);
    let payment;
    try { payment = await startOrganizationCheckout(orderId, auth.user.id, workspaceId); }
    catch { payment = { status: "pending" }; }
    const state = await proOnboardingState(auth.client, workspaceId, orderId);
    return organizationJson(proReply(state, payment));
  } catch (error) { return organizationBillingFailure(error); }
}
