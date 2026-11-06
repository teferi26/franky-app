import { assertRealPaymentActors } from './payment-demo-guard';
import type Stripe from "stripe";
import { createAdminSupabase } from "@/lib/supabase-admin";
import type { BusinessInterval } from "@/lib/business-billing";

interface Attempt {
  id: string; owner_id: string; type: string; listing_id: string; billing_interval: BusinessInterval;
  state: string; stripe_session_id: string | null; request_params: Stripe.Checkout.SessionCreateParams; created_at: string;
}
export class BusinessCheckoutError extends Error {}

export async function startBusinessCheckout(stripe: Stripe, input: {
  owner: string; type: "leisure" | "housing"; listing: string; interval: BusinessInterval; params: Stripe.Checkout.SessionCreateParams;
}) {
  await assertRealPaymentActors(input.owner);
  const db = createAdminSupabase();
  // One retry after a confirmed expired session, including a cadence switch.
  for (let pass = 0; pass < 2; pass++) {
    const { data, error } = await db.rpc("prepare_business_checkout", {
      p_owner: input.owner, p_type: input.type, p_listing: input.listing, p_interval: input.interval, p_request: input.params,
    });
    if (error || !data) throw new Error("Unable to reserve business checkout");
    const attempt = data as Attempt;
    if (attempt.owner_id !== input.owner || attempt.listing_id !== input.listing || attempt.type !== input.type) throw new Error("Business checkout ownership mismatch");
    if (!attempt.stripe_session_id && Date.now() - new Date(attempt.created_at).getTime() > 20 * 60 * 60_000) {
      // Stripe may eventually prune idempotency keys. Never recreate an unknown
      // old attempt; it requires reconciliation rather than risking two charges.
      throw new BusinessCheckoutError("Hay un pago pendiente de comprobar. Contacta con soporte antes de abrir otro.");
    }
    let session = attempt.stripe_session_id
      ? await stripe.checkout.sessions.retrieve(attempt.stripe_session_id)
      : await stripe.checkout.sessions.create(attempt.request_params, { idempotencyKey: `business:${attempt.id}` });
    if (session.metadata?.checkout_attempt_id !== attempt.id || session.customer !== attempt.request_params.customer) throw new Error("Business checkout session mismatch");
    const attachment = await db.from("business_checkout_attempts").update({ stripe_session_id: session.id })
      .eq("id", attempt.id).in("state", ["creating", "open", "complete"]).select("id").single();
    if (attachment.error) throw new Error("Unable to persist business checkout session");
    if (session.status === "open" && attempt.billing_interval !== input.interval) {
      try { await stripe.checkout.sessions.expire(session.id); } catch { /* Retrieve decides whether expiry or payment won. */ }
      session = await stripe.checkout.sessions.retrieve(session.id);
    }
    if (session.status === "expired" && session.payment_status === "unpaid") {
      const closed = await db.from("business_checkout_attempts").update({ state: "closed" }).eq("id", attempt.id).eq("stripe_session_id", session.id);
      if (closed.error) throw new Error("Unable to close business checkout");
      continue;
    }
    if (session.status === "complete" || session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      const completed = await db.from("business_checkout_attempts").update({ state: "complete" }).eq("id", attempt.id).in("state", ["creating", "open", "complete"]);
      if (completed.error) throw new Error("Unable to confirm business checkout");
      throw new BusinessCheckoutError("El pago ya se ha completado. Revisa tu ficha y Facturación antes de iniciar otro.");
    }
    if (session.status !== "open" || !session.url || attempt.billing_interval !== input.interval) {
      throw new BusinessCheckoutError("No se pudo cerrar el pago anterior. Inténtalo de nuevo antes de cambiar de tarifa.");
    }
    return session;
  }
  throw new BusinessCheckoutError("El pago anterior ha caducado. Vuelve a intentarlo.");
}
