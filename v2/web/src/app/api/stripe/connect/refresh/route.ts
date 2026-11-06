import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { getSellerConnectAccount } from "@/lib/connect";
import { ORIGIN_ORGANIZER_ID } from '@/lib/origin-partner';
import { isDemoPaymentActor } from '@/lib/payment-demo-guard';

// Same-origin guard: the return target is carried in the query string across the
// Stripe redirect, so reject absolute and protocol-relative URLs to avoid an
// open redirect. Falls back to the owner payouts dashboard.
function safeReturnTo(value: string | null): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/propietario/dashboard/pagos?onboarded=1";
}

/**
 * Stripe Account Links are single-use and expire. This is the `refresh_url`:
 * it re-mints a fresh onboarding link and 302-redirects the user back into the
 * Stripe flow. Preserves the original `return_to` so the user lands back where
 * they started (owner dashboard, event page, etc.).
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Los cobros reales están desactivados en demostración.' }, { status: 403 });
  if(user.id===ORIGIN_ORGANIZER_ID)return NextResponse.redirect('https://franky.es/api/partners/origin/connect');
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("return_to"));

  const account = await getSellerConnectAccount(user.id);
  if (!account) {
    return NextResponse.redirect(
      new URL("/propietario/dashboard/pagos", req.nextUrl.origin)
    );
  }

  const stripe = getStripe();
  const refreshUrl = `${req.nextUrl.origin}/api/stripe/connect/refresh?return_to=${encodeURIComponent(returnTo)}`;
  // V2 account-link creation must be scoped to the connected account via the
  // Stripe-Context header, otherwise the platform key gets "Permission denied".
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

  return NextResponse.redirect(link.url);
}
