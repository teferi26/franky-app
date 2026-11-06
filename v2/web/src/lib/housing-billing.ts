import { assertRealPaymentActors } from './payment-demo-guard';
import Stripe from "stripe";
import { createAdminSupabase } from "./supabase-admin";
import { assertCustomerOwner } from "./stripe-customer";
import { HOUSING_OFFER_VERSION, housingOfferTerms, type HousingBilling } from "./housing-offer";
import { OWNER_PLAN, PRICING } from "./pricing";
import { housingDeferredBillingReady, housingFirstInterestEnabled } from './housing-billing-release';

export class HousingBillingError extends Error {}
export async function assertNoDeferredHousingContract(owner: string, listing: string | null) {
  if (!housingDeferredBillingReady()) return;
  let query = db().from('housing_billing_enrollments').select('id').eq('owner_id', owner).neq('state', 'canceled');
  if (listing) query = query.or(`listing_id.is.null,listing_id.eq.${listing}`);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new HousingBillingError('No se pudo comprobar tu contrato actual. Inténtalo más tarde.');
  if (data) throw new HousingBillingError('Ya tienes un contrato para estos pisos. Gestiónalo desde Facturación.');
}
type Enrollment = {
  id: string; owner_id: string; listing_id: string | null; billing: HousingBilling; state: string;
  stripe_customer_id: string; stripe_price_id: string; amount_cents: number;
  stripe_session_id: string | null; stripe_payment_method_id: string | null; stripe_subscription_id: string | null;
  setup_request: Stripe.Checkout.SessionCreateParams; activation_request: Stripe.SubscriptionCreateParams | null;
  created_at: string; activation_started_at: string | null;
};
const db = () => createAdminSupabase();
const amountFor = (billing: HousingBilling) => Math.round(100 * (billing === "listing" ? PRICING.business_housing.monthly
  : billing === "monthly" ? OWNER_PLAN.monthly : OWNER_PLAN.introQuarterTotal));
// Never repoint legacy price variables: their quarterly contracts still use
// those identifiers for their agreed monthly rollover.
const priceFor = (billing: HousingBilling) => billing === "listing" ? process.env.STRIPE_HOUSING_DEFERRED_LISTING_PRICE_ID
  : billing === "monthly" ? process.env.STRIPE_HOUSING_DEFERRED_MONTHLY_PRICE_ID : process.env.STRIPE_HOUSING_DEFERRED_QUARTERLY_PRICE_ID;

export function validateHousingPrice(price: Stripe.Price, billing: HousingBilling) {
  if (!price.active || price.currency !== "eur" || price.unit_amount !== amountFor(billing) || price.tax_behavior !== "inclusive"
    || price.recurring?.interval !== "month" || price.recurring.interval_count !== (billing === "quarterly" ? 3 : 1)) {
    throw new HousingBillingError("La tarifa aún no está preparada. Inténtalo más tarde.");
  }
}

export async function startHousingEnrollment(stripe: Stripe, input: {
  owner: string; customer: string; listing: string | null; billing: HousingBilling; origin: string; offerVersion?: string;
}) {
  if (!housingFirstInterestEnabled()) throw new HousingBillingError("Esta oferta no está disponible. Revisa las condiciones actuales antes de continuar.");
  await assertRealPaymentActors(input.owner);
  if (input.offerVersion !== HOUSING_OFFER_VERSION) throw new HousingBillingError("Acepta las condiciones de publicación gratis hasta el primer interesado en la web de Franky.");
  const priceId = priceFor(input.billing);
  if (!priceId) throw new HousingBillingError("Esta tarifa aún no está disponible.");
  await assertCustomerOwner(stripe, input.customer, input.owner);
  validateHousingPrice(await stripe.prices.retrieve(priceId), input.billing);
  // Also validate the promised renewal price before selling the introductory quarter.
  if (input.billing === "quarterly") {
    const monthly = priceFor("monthly");
    if (!monthly) throw new HousingBillingError("La tarifa mensual aún no está disponible.");
    validateHousingPrice(await stripe.prices.retrieve(monthly), "monthly");
  }
  for await (const sub of stripe.subscriptions.list({ customer: input.customer, status: "all", limit: 100 })) {
    if (["canceled", "incomplete_expired"].includes(sub.status)) continue;
    if (sub.metadata.owner_plan === "true" || (sub.metadata.business_type === "housing" && (!input.listing || sub.metadata.listing_id === input.listing))) {
      throw new HousingBillingError("Ya tienes una suscripción para estos pisos. Gestiónala desde Facturación.");
    }
  }
  // A still-open legacy checkout could otherwise charge after the free offer
  // was accepted. Do not create overlapping paid and deferred contracts.
  for await (const checkout of stripe.checkout.sessions.list({ customer: input.customer, status: "open", limit: 100 })) {
    if (checkout.mode !== "subscription") continue;
    if (checkout.metadata?.mode === "owner" || (checkout.metadata?.business_type === "housing" &&
      (!input.listing || checkout.metadata.listing_id === input.listing))) {
      throw new HousingBillingError("Tienes un alta de pago anterior pendiente. Contacta con soporte para cerrarla antes de comenzar gratis.");
    }
  }
  const terms = housingOfferTerms(input.billing);
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "setup", currency: "eur", customer: input.customer, payment_method_types: ["card"],
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    success_url: `${input.origin}/negocio/dashboard?housing_setup={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/negocio/dashboard`,
    custom_text: { submit: { message: terms } },
    metadata: { supabase_user_id: input.owner, mode: "housing_setup", offer_version: HOUSING_OFFER_VERSION },
  };
  const { data, error } = await db().rpc("prepare_housing_enrollment", {
    p_owner: input.owner, p_listing: input.listing, p_billing: input.billing, p_customer: input.customer,
    p_price: priceId, p_amount: amountFor(input.billing), p_terms_version: HOUSING_OFFER_VERSION, p_terms: terms, p_request: params,
  });
  if (error || !data) throw new HousingBillingError("No se pudo preparar el alta. Comprueba en tu panel si ya tienes una oferta o suscripción para estos pisos.");
  const e = data as Enrollment;
  if (e.state !== "setup") throw new HousingBillingError("El alta ya está completada. Consulta tu panel de negocio.");
  if (e.billing !== input.billing) throw new HousingBillingError("Tienes un alta pendiente con otra tarifa. Cancélala desde tu panel antes de cambiarla.");
  if (!e.stripe_session_id && Date.now() - Date.parse(e.created_at) > 20 * 3600_000) {
    throw new HousingBillingError("Tu alta pendiente necesita una comprobación. Contacta con soporte.");
  }
  const session = e.stripe_session_id ? await stripe.checkout.sessions.retrieve(e.stripe_session_id)
    : await stripe.checkout.sessions.create(e.setup_request, { idempotencyKey: `housing-setup:${e.id}` });
  if (session.customer !== input.customer || session.metadata?.housing_enrollment_id !== e.id) throw new Error("Housing setup identity mismatch");
  const saved = await db().from("housing_billing_enrollments").update({ stripe_session_id: session.id }).eq("id", e.id);
  if (saved.error) throw new Error("Unable to save housing setup");
  if (session.status === "complete") {
    await completeHousingSetup(stripe, session);
    return { url: `${input.origin}/negocio/dashboard` };
  }
  if (session.status === "expired") {
    const closed = await db().rpc("cancel_housing_enrollment", { p_id: e.id, p_owner: input.owner });
    if (closed.error) throw new Error("Unable to close expired setup");
    throw new HousingBillingError("El alta ha caducado. Vuelve a intentarlo.");
  }
  if (!session.url) throw new Error("Missing housing setup URL");
  return { url: session.url };
}

export async function completeHousingSetup(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!housingDeferredBillingReady()) throw new HousingBillingError("La oferta todavía no está preparada.");
  const id = session.metadata?.housing_enrollment_id;
  if (!id || session.mode !== "setup" || session.status !== "complete" || typeof session.customer !== "string") throw new Error("Invalid housing setup");
  const setupId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!setupId) throw new Error("Missing housing setup intent");
  const setup = await stripe.setupIntents.retrieve(setupId);
  if (setup.status !== "succeeded" || setup.customer !== session.customer || setup.usage !== "off_session" || typeof setup.payment_method !== "string") {
    throw new Error("Housing card not ready for future payments");
  }
  const result = await db().rpc("complete_housing_setup", { p_id: id, p_customer: session.customer, p_session: session.id, p_method: setup.payment_method });
  if (result.error) throw new Error("Unable to complete housing setup");
}

export function housingSubscriptionParams(e: Enrollment): Stripe.SubscriptionCreateParams {
  const metadata: Record<string, string> = { housing_enrollment_id: e.id, supabase_user_id: e.owner_id };
  if (e.billing === "listing") Object.assign(metadata, { business_type: "housing", listing_id: e.listing_id!, billing_interval: "month" });
  else Object.assign(metadata, { owner_plan: "true", owner_billing: e.billing });
  return {
    customer: e.stripe_customer_id, default_payment_method: e.stripe_payment_method_id!,
    items: [{ price: e.stripe_price_id, quantity: 1 }], metadata,
    collection_method: "charge_automatically", payment_behavior: "allow_incomplete", off_session: true,
    automatic_tax: { enabled: true }, expand: ["latest_invoice"],
  };
}

// Preserve the agreed 192 € first quarter -> 80 €/month, with durable Stripe
// idempotency and metadata on both phases, even if a webhook arrives twice.
async function ensureRollover(stripe: Stripe, sub: Stripe.Subscription, e: Enrollment) {
  if (e.billing !== "quarterly" || sub.status !== "active" || sub.items.data[0]?.price.id !== e.stripe_price_id) return;
  const monthlyId = priceFor("monthly");
  if (!monthlyId) throw new Error("Missing owner monthly renewal price");
  validateHousingPrice(await stripe.prices.retrieve(monthlyId), "monthly");
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  const schedule = scheduleId ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : await stripe.subscriptionSchedules.create({ from_subscription: sub.id }, { idempotencyKey: `housing-rollover:${e.id}` });
  if (schedule.phases.length > 1) return;
  const phase = schedule.phases[0];
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      { items: [{ price: e.stripe_price_id, quantity: 1 }], start_date: phase.start_date, end_date: phase.end_date,
        metadata: sub.metadata, automatic_tax: { enabled: true } },
      { items: [{ price: monthlyId, quantity: 1 }], duration: { interval: "month", interval_count: 1 },
        metadata: { ...sub.metadata, owner_billing: "monthly" }, automatic_tax: { enabled: true } },
    ],
  }, { idempotencyKey: `housing-rollover-phases:${e.id}` });
}

async function syncHousingSubscription(stripe: Stripe, sub: Stripe.Subscription) {
  const { data, error } = await db().from("housing_billing_enrollments").select("*").eq("id", sub.metadata.housing_enrollment_id).single();
  const e = data as Enrollment | null;
  if (error || !e || sub.customer !== e.stripe_customer_id || sub.metadata.supabase_user_id !== e.owner_id) throw new Error("Housing subscription ownership mismatch");
  const item = sub.items.data[0];
  const billing = item?.price.id === priceFor("monthly") && e.billing !== "listing" ? "monthly" : e.billing;
  if (sub.items.data.length !== 1 || (item.quantity ?? 1) !== 1 ||
    ![e.stripe_price_id, ...(e.billing === "quarterly" ? [priceFor("monthly")] : [])].includes(item.price.id)) throw new Error("Housing subscription price mismatch");
  validateHousingPrice({ ...item.price, active: true }, billing);
  const invoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  await ensureRollover(stripe, sub, e);
  const result = await db().rpc("sync_housing_subscription", {
    p_id: e.id, p_customer: e.stripe_customer_id, p_subscription: sub.id, p_status: sub.status,
    p_end: item.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    p_payment_url: invoice?.status === "open" ? invoice.hosted_invoice_url : null, p_billing: billing,
  });
  if (result.error) throw new Error("Unable to sync housing subscription");
}

export async function processHousingActivations(provider?: Stripe) {
  if (!housingDeferredBillingReady()) return { processed: 0, failed: 0, skipped: true };
  if (!provider && !process.env.STRIPE_SECRET_KEY) throw new HousingBillingError("La facturación no está configurada.");
  const stripe = provider ?? new Stripe(process.env.STRIPE_SECRET_KEY!);
  const { data, error } = await db().rpc("claim_housing_activations");
  if (error) throw new Error("Unable to claim housing activations");
  let processed = 0, failed = 0;
  for (const e of (data ?? []) as Enrollment[]) {
    try {
      await assertRealPaymentActors(e.owner_id);
      let sub: Stripe.Subscription | undefined;
      if (e.stripe_subscription_id) sub = await stripe.subscriptions.retrieve(e.stripe_subscription_id, { expand: ["latest_invoice"] });
      // Recover lost responses before ever creating a subscription again.
      if (!sub) for await (const found of stripe.subscriptions.list({ customer: e.stripe_customer_id, status: "all", limit: 100 })) {
        if (found.metadata.housing_enrollment_id === e.id) { sub = await stripe.subscriptions.retrieve(found.id, { expand: ["latest_invoice"] }); break; }
      }
      if (!sub) {
        if (!e.activation_started_at || Date.now() - Date.parse(e.activation_started_at) > 20 * 3600_000) {
          const review = await db().from("housing_billing_enrollments").update({ state: "review" }).eq("id", e.id);
          if (review.error) throw new Error("Unable to queue housing billing review");
          failed++; continue;
        }
        const params = e.activation_request ?? housingSubscriptionParams(e);
        if (!e.activation_request) {
          const saved = await db().from("housing_billing_enrollments").update({ activation_request: params }).eq("id", e.id).eq("state", "activating");
          if (saved.error) throw new Error("Unable to freeze housing activation request");
        }
        sub = await stripe.subscriptions.create(params, { idempotencyKey: `housing-activate:${e.id}` });
      }
      await syncHousingSubscription(stripe, sub);
      processed++;
    } catch (err) {
      console.error("[housing-billing] activation failed", e.id, err instanceof Error ? err.message : "unknown");
      failed++;
    }
  }
  return { processed, failed };
}

/** housing_enrollment_id del objeto del evento, sin llamadas a Stripe ni a la BD. */
function deferredEnrollmentId(event: Stripe.Event): string | null {
  const object = event.data?.object as {
    metadata?: Record<string, string> | null;
    parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
  } | undefined;
  return object?.metadata?.housing_enrollment_id ?? object?.parent?.subscription_details?.metadata?.housing_enrollment_id ?? null;
}

export async function handleHousingBillingWebhook(stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  if (!housingDeferredBillingReady()) {
    // Con el servicio apagado su tabla puede no existir, pero un evento de un
    // contrato diferido ya aceptado NO puede caer en las ramas legacy del
    // webhook (lo tratarían como un Plan Propietario normal). Se consume y
    // queda en la cola de revisión manual para reenviarlo desde Stripe cuando
    // el servicio vuelva a estar listo.
    const enrollment = deferredEnrollmentId(event);
    if (!enrollment) return false;
    const { error } = await db().rpc("flag_payment_review", {
      p_kind: "housing_deferred_event", p_reference: event.id,
      p_detail: { enrollment_id: enrollment, type: event.type },
    });
    // Sin traza durable no se consume: Stripe lo reintentará.
    if (error) throw new Error(`housing_deferred_event_unrecorded:${event.id}`);
    return true;
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.metadata?.housing_enrollment_id) return false;
    await completeHousingSetup(stripe, await stripe.checkout.sessions.retrieve(session.id));
    return true;
  }
  let subId: string | undefined;
  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    if (!sub.metadata.housing_enrollment_id) return false;
    subId = sub.id;
  } else if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const ref = invoice.parent?.subscription_details?.subscription;
    subId = typeof ref === "string" ? ref : ref?.id;
  }
  if (!subId) return false;
  const current = await stripe.subscriptions.retrieve(subId, { expand: ["latest_invoice"] });
  if (!current.metadata.housing_enrollment_id) return false;
  await syncHousingSubscription(stripe, current);
  return true;
}
