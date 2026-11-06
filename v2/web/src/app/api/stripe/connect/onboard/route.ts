import { isDemoPaymentActor } from '@/lib/payment-demo-guard';
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { getOrCreateConnectAccount } from "@/lib/connect";
import { ORIGIN_ORGANIZER_ID } from '@/lib/origin-partner';

// Only allow same-origin relative paths as the post-onboarding return target;
// Stripe's return_url is attacker-influenceable via the request body, so reject
// absolute URLs and protocol-relative ("//evil.com") paths to avoid an open
// redirect. Falls back to the owner payouts dashboard.
function safeReturnTo(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/propietario/dashboard/pagos?onboarded=1";
}

/**
 * Starts (or resumes) Stripe Connect onboarding for the current user. Returns a
 * single-use hosted onboarding URL the client redirects to. On completion the
 * V2 thin-events webhook (/api/stripe/connect/webhook) refreshes the
 * connect_accounts row from the account's recipient capability state.
 *
 * Accepts an optional `return_to` (same-origin path) so flows outside the owner
 * dashboard — e.g. an event organizer connecting payouts — return to where they
 * started instead of the role-gated payouts page.
 */
export async function POST(req: NextRequest) {
  try {
    // createRequestSupabase acepta también el Bearer de la app móvil (que no
    // tiene cookies de Next): sin esto, un organizador no podía iniciar el
    // alta de cobros de Stripe desde la app. Para la web no cambia nada.
    const supabase = await createRequestSupabase(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Esta cuenta es de demostración. Los servicios de cobro reales están desactivados.' }, { status: 403 });

    if(user.id===ORIGIN_ORGANIZER_ID)return NextResponse.json({url:'https://franky.es/api/partners/origin/connect'});
    const body = await req.json().catch(() => ({}));
    const returnTo = safeReturnTo(body?.return_to);

    const account = await getOrCreateConnectAccount(user.id, user.email);
    const stripe = getStripe();

    const refreshUrl = `${req.nextUrl.origin}/api/stripe/connect/refresh?return_to=${encodeURIComponent(returnTo)}`;
    // V2 account-link creation must be scoped to the connected account via the
    // Stripe-Context header; with only the platform key (no context) Stripe
    // returns "Permission denied … supply an Account ID in the Stripe-Context
    // header" even though account creation itself succeeds.
    const link = await stripe.v2.core.accountLinks.create(
      {
        account: account.stripe_connect_account_id,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["recipient"],
            refresh_url: refreshUrl,
            return_url: `${req.nextUrl.origin}${returnTo}`,
          },
        },
      },
      { stripeContext: account.stripe_connect_account_id }
    );

    return NextResponse.json({ url: link.url });
  } catch (error) {
    // Detalle completo SOLO en logs del servidor (Vercel los captura via
    // console.error). Al cliente nunca se le devuelven message/code/type de
    // Stripe: revelan configuración interna de la plataforma a cualquier
    // usuario autenticado.
    const raw = error as { message?: string; code?: string; type?: string };
    console.error("Connect onboard error:", raw?.type, raw?.code, raw?.message, error);
    const isProd = process.env.NODE_ENV === "production";
    return NextResponse.json(
      isProd
        ? { error: "No se pudo iniciar el alta de cobros. Inténtalo de nuevo o contacta con soporte." }
        : { error: raw?.message || "Error al iniciar el alta de cobros", code: raw?.code, type: raw?.type },
      { status: 500 }
    );
  }
}
