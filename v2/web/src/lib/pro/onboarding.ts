import "server-only";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { PRO_VERTICALS } from "../../../../shared/pro/verticals";
import { proPlanAmount, type ProOnboardingReply } from "../../../../shared/pro/billing";
import type { ProVerticalId } from "../../../../shared/pro/types";
import { organizationBillingRequest, organizationJson } from "../organization-billing-api";
import { organizationCheckoutContext, recoverOrganizationCheckout, startOrganizationCheckout } from "../organization-billing";
import { organizationSalesReady } from "../organization-billing-provider";

export const proOnboardingInput = z.object({
  sector: z.enum(Object.keys(PRO_VERTICALS) as [ProVerticalId, ...ProVerticalId[]]),
  name: z.string().trim().min(3).max(100),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(3).max(300),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/),
  interval: z.enum(["month", "year"]),
  requestKey: z.uuid(),
  attribution: z.array(z.string().max(80)).max(8).optional(),
}).strict();

export async function proRequest(req: NextRequest, workspaceId: string, mutation: boolean) {
  return organizationBillingRequest(req, workspaceId, mutation);
}

type Client = Exclude<Awaited<ReturnType<typeof proRequest>>, { response: unknown }>["client"];
type State = {
  organization_id: string;
  attempt_id: string;
  public_slug: string;
  active: boolean;
  status: string;
};

export async function proOnboardingState(client: Client, workspaceId: string, orderId: string) {
  const { data, error } = await client.rpc("get_pro_onboarding_status", {
    p_organization_id: workspaceId,
    p_attempt_id: orderId,
  });
  if (error || !data || data.organization_id !== workspaceId || data.attempt_id !== orderId)
    throw Error(error?.message ?? "organization_billing_forbidden");
  return data as State;
}

export function proReply(state: State, payment?: { status: string; url?: string }): ProOnboardingReply {
  return {
    status: state.active ? "active" : payment?.status === "checkout" ? "checkout"
      : state.status === "cancelled" || state.status === "failed" ? state.status : "pending",
    workspaceId: state.organization_id,
    slug: state.public_slug,
    orderId: state.attempt_id,
    href: `/pro/${state.organization_id}/guia`,
    ...(payment?.url && !state.active ? { url: payment.url } : {}),
  };
}

export async function startProOnboarding(req: NextRequest) {
  // La autenticación se comprueba antes de abrir una organización o un cobro.
  const auth = await proRequest(req, "00000000-0000-4000-8000-000000000000", true);
  if ("response" in auth) return auth.response;
  const raw = await req.text();
  if (raw.length > 4096) return organizationJson({ error: "Solicitud demasiado grande." }, 413);
  let parsed;
  try { parsed = proOnboardingInput.safeParse(JSON.parse(raw)); }
  catch { return organizationJson({ error: "Revisa los datos del negocio." }, 400); }
  if (!parsed.success) return organizationJson({ error: "Revisa los datos del negocio." }, 400);
  const input = parsed.data;
  if (input.sector === "university")
    return organizationJson({ error: "Accede al espacio verificado de tu universidad para continuar.", code: "institution_required" }, 409);
  const amount = proPlanAmount(input.sector, input.interval);
  if (amount <= 0) return organizationJson({ error: "Ese plan no está disponible." }, 409);
  const { data: ready, error: configError } = await auth.client.rpc("get_pro_checkout_configuration");
  if (configError || !ready || !organizationSalesReady(ready))
    return organizationJson({ error: "Estamos preparando el alta online. Vuelve a intentarlo en unos minutos.", code: "sales_unavailable" }, 409);
  const { data, error } = await auth.client.rpc("prepare_pro_onboarding", {
    p_data: {
      sector: input.sector, name: input.name, city: input.city, address: input.address,
      phone: input.phone, attribution: input.attribution ?? [],
    },
    p_request_key: input.requestKey,
    p_interval: input.interval,
    p_base_cents: amount,
  });
  if (error || !data) throw Error(error?.message ?? "pro_onboarding_unavailable");
  const workspaceId = String(data.organization_id);
  const orderId = String(data.attempt_id);
  let payment;
  try { payment = await startOrganizationCheckout(orderId, auth.user.id, workspaceId); }
  catch {
    // La intención está guardada. Reintentar conserva el espacio y el pedido.
    payment = { status: "pending" };
  }
  const state = await proOnboardingState(auth.client, workspaceId, orderId);
  return organizationJson(proReply(state, payment));
}

export async function readProOnboarding(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspace") ?? "";
  const orderId = req.nextUrl.searchParams.get("order") ?? "";
  const auth = await proRequest(req, workspaceId, false);
  if ("response" in auth) return auth.response;
  if (!z.uuid().safeParse(orderId).success) return organizationJson({ error: "Pedido no válido." }, 400);
  await proOnboardingState(auth.client, workspaceId, orderId);
  let payment: { status: string; url?: string } = { status: "pending" };
  try {
    await recoverOrganizationCheckout(orderId, workspaceId);
    // Se vuelve a comprobar el propietario después de consultar Stripe.
    const context = await organizationCheckoutContext(orderId, auth.user.id);
    if (context.organization_id !== workspaceId) throw Error("organization_billing_forbidden");
    if (context.status === "open" && context.checkout_url) {
      const { organizationPaymentReply } = await import("../organization-billing");
      payment = organizationPaymentReply(context);
    }
  } catch { /* El reintento de la pantalla recupera un webhook que todavía no llegó. */ }
  const state = await proOnboardingState(auth.client, workspaceId, orderId);
  return organizationJson(proReply(state, payment));
}
