import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { refreshConnectAccount } from "@/lib/connect";

/**
 * V2 Connect thin-events endpoint. V2 accounts do NOT emit the V1
 * `account.updated` event the platform webhook (/api/stripe/webhook) handles —
 * they emit thin event notifications signed by a SEPARATE secret
 * (STRIPE_CONNECT_WEBHOOK_SECRET). We parse the notification, then re-fetch the
 * account's live status and persist it onto connect_accounts.
 *
 * Relevant notifications:
 *  - v2.core.account[configuration.recipient].capability_status_updated
 *      → stripe_transfers capability went active/restricted/etc.
 *  - v2.core.account[requirements].updated
 *      → outstanding requirements changed.
 * Any other v2.core.account[...] notification is also handled the same way
 * (re-fetch + persist) so we never drift from Stripe's truth.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!secret) {
    // Sin este secreto, todos los eventos de Connect se rechazan y el estado
    // de las cuentas deja de sincronizarse. Lo logueamos de forma visible
    // porque es uno de los secretos a verificar en Vercel (no debe faltar).
    console.error(
      "STRIPE_CONNECT_WEBHOOK_SECRET no esta configurado: los eventos de Connect se estan rechazando y las cuentas no se sincronizan."
    );
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  if (!sig) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let notification;
  try {
    notification = stripe.parseEventNotification(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Only account-lifecycle notifications carry a related account to refresh.
  if (
    notification.type.startsWith("v2.core.account") &&
    "related_object" in notification
  ) {
    const accountId = notification.related_object?.id;
    if (accountId) {
      try {
        await refreshConnectAccount(accountId);
      } catch (error) {
        console.error("Connect thin-event refresh failed:", error);
        // 500 → Stripe retries the delivery.
        return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
