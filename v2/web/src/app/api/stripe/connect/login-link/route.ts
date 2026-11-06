import { isDemoPaymentActor } from '@/lib/payment-demo-guard';
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { getSellerConnectAccount } from "@/lib/connect";
import { ORIGIN_MERCHANT_ACCOUNT } from '@/lib/origin-partner';

/**
 * Returns a URL to the seller's Stripe Express dashboard (manage payouts, bank
 * details, etc.). Only available once onboarding produced a usable account.
 * Acepta cookies (web) o Authorization: Bearer (app móvil, pantalla Cartera).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createRequestSupabase(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Esta cuenta es de demostración. Los servicios de cobro reales están desactivados.' }, { status: 403 });

    const account = await getSellerConnectAccount(user.id);
    if (!account) {
      return NextResponse.json(
        { error: "No tienes una cuenta de cobros" },
        { status: 404 }
      );
    }

    if(account.stripe_connect_account_id===ORIGIN_MERCHANT_ACCOUNT)return NextResponse.json({url:`https://dashboard.stripe.com/${ORIGIN_MERCHANT_ACCOUNT}`});
    const stripe = getStripe();
    const link = await stripe.accounts.createLoginLink(
      account.stripe_connect_account_id
    );
    return NextResponse.json({ url: link.url });
  } catch (error) {
    console.error("Connect login-link error:", error);
    return NextResponse.json(
      { error: "Error al abrir el panel de cobros" },
      { status: 500 }
    );
  }
}
