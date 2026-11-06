import { NextRequest, NextResponse } from "next/server";
import { cardRequest, CARD_PRIVATE_HEADERS } from "@/lib/franky-card-api";
import { cardProviderReady } from "@/lib/franky-card-billing";
import { cardWalletAvailability } from "@/lib/franky-card-wallet";
export async function GET(req: NextRequest) {
  const auth = await cardRequest(req, "config", 20);
  if (auth.response) return auth.response;
  const { data, error } = await auth.client.rpc("get_franky_card_readiness");
  const checkoutEnabled = !error && cardProviderReady(data);
  return NextResponse.json(
    {
      checkoutEnabled,
      annualPriceCents: data?.annual_cents ?? 1990,
      introPriceCents: data?.introductory_cents ?? 1490,
      ...cardWalletAvailability(),
      reason: checkoutEnabled
        ? null
        : "La venta se abrirá cuando la red de establecimientos y los pagos estén preparados.",
    },
    { headers: CARD_PRIVATE_HEADERS },
  );
}
