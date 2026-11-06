import "server-only";
import type Stripe from "stripe";
import { createAdminSupabase } from "./supabase-admin";
import { getStripe } from "./stripe";
import { CARD_SITE } from "./franky-card-api";
import type { CardCheckout, CardReadiness } from "../../../shared/franky-card";
import type { PaymentReply } from "../../../shared/payment-contract";

export function cardCheckoutReply(order: CardCheckout): PaymentReply {
  if (order.status === "paid")
    return { status: "paid", order_id: order.order_id };
  if (order.status === "expired" || order.status === "cancelled")
    return { status: "cancelled", order_id: order.order_id };
  if (order.status === "failed" || order.status === "refunded")
    return {
      status: "failed",
      order_id: order.order_id,
      error:
        order.status === "refunded"
          ? "Este pedido ya se ha reembolsado."
          : "El proveedor no ha confirmado el pago.",
    };
  if (order.status === "checkout" && order.checkout_url)
    return {
      status: "checkout",
      order_id: order.order_id,
      url: order.checkout_url,
    };
  return { status: "pending", order_id: order.order_id };
}

export function cardStripeEnvironment(): "test" | "live" | null {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}
export function cardProviderReady(config: CardReadiness | null): boolean {
  return (
    !!config &&
    config.enabled &&
    config.purchases_enabled &&
    config.provider_ready &&
    process.env.FRANKY_CARD_CHECKOUT_ENABLED === "true" &&
    !!process.env.STRIPE_WEBHOOK_SECRET &&
    config.environment === cardStripeEnvironment()
  );
}
export type CardCheckoutConsent = {
  acceptedAmountCents: number;
  priceVersion: string;
  termsVersion: string;
};
export async function beginCardCheckout(
  userId: string,
  requestId: string,
  consent: CardCheckoutConsent,
): Promise<CardCheckout> {
  const admin = createAdminSupabase();
  const { data: settings, error: settingsError } = await admin.rpc(
    "get_franky_card_readiness",
  );
  if (settingsError || !cardProviderReady(settings))
    throw Error("card_checkout_unavailable");
  const { data, error } = await admin.rpc(
    "service_begin_franky_card_checkout",
    {
      p_user_id: userId,
      p_request_key: requestId,
      p_environment: cardStripeEnvironment(),
      p_accepted_amount_cents: consent.acceptedAmountCents,
      p_accepted_price_version: consent.priceVersion,
      p_terms_version: consent.termsVersion,
    },
  );
  if (error || !data)
    throw Error(error?.message ?? "card_checkout_unavailable");
  const order = data as CardCheckout;
  if (
    order.amount_cents !== consent.acceptedAmountCents ||
    order.price_version !== consent.priceVersion
  )
    throw Error("card_price_changed");
  if (order.status !== "created") return order;
  if (
    order.status !== "created" ||
    !Number.isSafeInteger(order.amount_cents) ||
    order.amount_cents < 1
  )
    throw Error("card_checkout_unavailable");
  const metadata = {
    mode: "franky_card",
    card_order_id: order.order_id,
    supabase_user_id: userId,
    price_version: order.price_version,
  };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: order.order_id,
      metadata,
      payment_intent_data: { metadata },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency,
            unit_amount: order.amount_cents,
            product_data: {
              name: "Franky Card · 12 meses",
              description:
                "Descuentos en establecimientos adheridos. Renovación manual; consulta las condiciones de cada oferta.",
            },
          },
        },
      ],
      success_url: `${CARD_SITE}/franky-card/retorno?order=${order.order_id}`,
      cancel_url: `${CARD_SITE}/franky-card/retorno?order=${order.order_id}&return=cancel`,
    },
    { idempotencyKey: `franky-card:${order.order_id}` },
  );
  if (!session.url || session.livemode !== (order.environment === "live"))
    throw Error("card_provider_mismatch");
  const { data: attached, error: attachError } = await admin.rpc(
    "service_attach_franky_card_checkout",
    {
      p_order_id: order.order_id,
      p_checkout_id: session.id,
      p_checkout_url: session.url,
    },
  );
  // Never create a replacement after an uncertain response: the same order/session is retried.
  if (attachError || !attached) throw Error("card_checkout_pending");
  return attached as CardCheckout;
}

const paymentId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;
/** Runs after Stripe signature verification. Never honours Connect metadata or client amounts. */
export async function handleFrankyCardWebhook(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<boolean> {
  if (event.account) return false;
  const object = event.data.object;
  let intentId: string | undefined;
  let session: Stripe.Checkout.Session | undefined;
  let action:
    | "paid"
    | "refunded"
    | "partial_refund"
    | "disputed"
    | "dispute_won"
    | "failed"
    | undefined;
  if (event.type === "checkout.session.expired") {
    const expired = object as Stripe.Checkout.Session;
    if (expired.metadata?.mode !== "franky_card") return false;
    const admin = createAdminSupabase();
    const { data: order, error: readError } = await admin
      .from("franky_card_orders")
      .select("id,checkout_id,environment")
      .eq("id", expired.metadata.card_order_id)
      .single();
    if (
      readError ||
      !order ||
      order.checkout_id !== expired.id ||
      (order.environment === "live") !== event.livemode
    )
      throw Error("card_expiry_order_mismatch");
    const { error } = await admin.rpc("service_expire_franky_card_checkout", {
      p_order_id: order.id,
      p_checkout_id: expired.id,
    });
    if (error) throw Error("card_expiry_failed");
    return true;
  }
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    session = object as Stripe.Checkout.Session;
    if (session.metadata?.mode !== "franky_card") return false;
    if (session.payment_status !== "paid") return true;
    intentId = paymentId(session.payment_intent);
    action = "paid";
  } else if (event.type === "checkout.session.async_payment_failed") {
    // Un método de pago diferido rechazado: el pedido pasa a "failed" (la RPC
    // ya admite esa acción) en vez de quedarse "pending" para siempre.
    session = object as Stripe.Checkout.Session;
    if (session.metadata?.mode !== "franky_card") return false;
    intentId = paymentId(session.payment_intent);
    action = "failed";
  } else if (event.type === "charge.refunded") {
    const charge = object as Stripe.Charge;
    intentId = paymentId(charge.payment_intent);
    action = charge.refunded ? "refunded" : "partial_refund";
    if (!intentId) return false;
  } else if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.funds_withdrawn"
  ) {
    intentId = paymentId((object as Stripe.Dispute).payment_intent);
    action = "disputed";
    if (!intentId) return false;
  } else if (event.type === "charge.dispute.closed") {
    const dispute = object as Stripe.Dispute;
    intentId = paymentId(dispute.payment_intent);
    action = dispute.status === "won" ? "dispute_won" : "disputed";
    if (!intentId) return false;
  } else return false;
  if (!intentId) throw Error("card_payment_missing");
  const pi = await stripe.paymentIntents.retrieve(intentId);
  if (pi.metadata.mode !== "franky_card") {
    if (session) throw Error("card_payment_metadata_mismatch");
    return false;
  }
  const orderId = pi.metadata.card_order_id;
  if (!orderId || pi.livemode !== event.livemode)
    throw Error("card_payment_environment_mismatch");
  const admin = createAdminSupabase();
  const { data: order, error } = await admin
    .from("franky_card_orders")
    .select("id,user_id,amount_cents,currency,environment,checkout_id")
    .eq("id", orderId)
    .single();
  if (
    error ||
    !order ||
    pi.metadata.supabase_user_id !== order.user_id ||
    pi.currency !== order.currency ||
    pi.amount !== order.amount_cents ||
    (order.environment === "live") !== event.livemode ||
    (session &&
      (session.id !== order.checkout_id ||
        session.metadata?.card_order_id !== order.id ||
        session.client_reference_id !== order.id ||
        session.amount_total !== order.amount_cents ||
        session.currency !== order.currency))
  )
    throw Error("card_payment_order_mismatch");
  if (
    action === "paid" &&
    (pi.status !== "succeeded" || pi.amount_received !== order.amount_cents)
  )
    throw Error("card_payment_not_settled");
  const amount =
    action === "refunded" || action === "partial_refund"
      ? (object as Stripe.Charge).amount_refunded
      : order.amount_cents;
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > order.amount_cents ||
    (action === "refunded" && amount !== order.amount_cents)
  )
    throw Error("card_refund_amount_mismatch");
  const receivedAction = action;
  const orderEnvironment = order.environment;
  async function alreadyApplied(): Promise<boolean> {
    const { data: recorded, error: readError } = await admin
      .from("franky_card_payment_events")
      .select("order_id,payment_id,amount_cents,environment,provider,action")
      .eq("id", event.id)
      .maybeSingle();
    if (readError) throw Error("card_payment_reconciliation_failed");
    if (!recorded) return false;
    // A dispute's current provider state can change between deliveries of the SAME event.
    // Its immutable receipt must remain applied once, not be reinterpreted on every retry.
    const sameAction =
      receivedAction === "disputed" || receivedAction === "dispute_won"
        ? ["disputed", "dispute_won"].includes(recorded.action)
        : recorded.action === receivedAction;
    if (
      recorded.order_id !== orderId ||
      recorded.payment_id !== pi.id ||
      recorded.amount_cents !== amount ||
      recorded.environment !== orderEnvironment ||
      recorded.provider !== "stripe" ||
      !sameAction
    )
      throw Error("card_payment_event_mismatch");
    return true;
  }
  if (await alreadyApplied()) return true;
  if (action === "disputed" || action === "dispute_won") {
    // Deliveries can arrive out of order. A late "created" event must not re-suspend a won dispute.
    const current = await stripe.disputes.retrieve(
      (object as Stripe.Dispute).id,
    );
    if (
      paymentId(current.payment_intent) !== pi.id ||
      current.livemode !== event.livemode
    )
      throw Error("card_dispute_mismatch");
    action = current.status === "won" ? "dispute_won" : "disputed";
  }
  // Partial refunds adjust the immutable financial ledger without cancelling the annual entitlement.
  const { error: applyError } = await admin.rpc(
    "service_apply_franky_card_payment",
    {
      p_event_id: event.id,
      p_order_id: orderId,
      p_provider: "stripe",
      p_environment: order.environment,
      p_payment_id: pi.id,
      p_action: action,
      p_amount_cents: amount,
      p_currency: order.currency,
    },
  );
  // Another delivery may have committed while the provider state was being retrieved.
  if (applyError && !(await alreadyApplied()))
    throw Error("card_payment_reconciliation_failed");
  return true;
}
