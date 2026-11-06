import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { businessSubscriptionFields } from "@/lib/business-billing";
import { handleOriginWebhook } from '@/lib/origin-checkout';
import { ORIGIN_MERCHANT_ACCOUNT } from '@/lib/origin-partner';
import { refreshConnectAccount } from '@/lib/connect';
import { acceptsPlatformStripeEvent } from '@/lib/stripe-event-source';
import { handleHousingBillingWebhook } from '@/lib/housing-billing';
import { handleFrankyCardWebhook } from '@/lib/franky-card-billing';
import { handleOrganizationBillingWebhook } from '@/lib/organization-billing';
import { confirmedStripeRefunds } from '@/lib/stripe-refund-evidence';
import { handleMarketplaceDispute } from '@/lib/marketplace-disputes';
import { createClient } from "@supabase/supabase-js";
import {
  assertWrite,
  upsertUserSubscription,
  markUserSubscriptionPastDue,
  flagPaymentReview,
  ownerSubscriptionStatus,
  userSubscriptionStatus,
  sendPaymentFailedEmail,
  WebhookCriticalError,
  type EventContext,
} from "@/lib/entitlements";
import { claimWebhookEvent, finishWebhookEvent } from "./event-ledger";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type ListingTable = "leisure_spots" | "accommodations";

async function syncBusinessAttempt(supabase: ReturnType<typeof getSupabaseAdmin>, ctx: EventContext, sub: Stripe.Subscription) {
  const attemptId = sub.metadata.checkout_attempt_id;
  if (!attemptId) return; // Subscriptions created before durable checkouts.
  await assertWrite(ctx, "business_checkout_attempts.sync", await supabase.from("business_checkout_attempts")
    .update({ state: sub.status === "canceled" || sub.status === "incomplete_expired" ? "closed" : "complete" })
    .eq("id", attemptId).eq("owner_id", sub.metadata.supabase_user_id).eq("listing_id", sub.metadata.listing_id)
    .in("state", ["creating", "open", "complete"]));
}

function tableForType(type: string | null | undefined): ListingTable | null {
  if (type === "leisure") return "leisure_spots";
  if (type === "housing") return "accommodations";
  return null;
}

/**
 * Map the checkout metadata `plan` value (matches PRICING keys in
 * `lib/pricing.ts`: "pro" | "premium") to the `subscriptions.plan` enum
 * accepted by the DB (CHECK constraint: 'free' | 'student' | 'premium').
 *
 * Historical detail: "Pro" is the public product name; the constraint was
 * authored when it was called "Student". Mapping here avoids a destructive
 * constraint change.
 */
function mapPlanToDbEnum(plan: string | undefined): "student" | "premium" | "free" {
  if (plan === "pro") return "student";
  if (plan === "premium") return "premium";
  return "free";
}

/**
 * Pull the period_start / period_end timestamps from a Stripe Subscription.
 * Stripe SDK 20 moved these to subscription.items[].current_period_*; older
 * SDK versions had them at the top level. We accept both shapes.
 */
function extractPeriodTimestamps(subscription: Stripe.Subscription): {
  startIso: string | null;
  endIso: string | null;
} {
  const sub = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    items?: {
      data?: Array<{ current_period_start?: number; current_period_end?: number }>;
    };
  };
  const item = sub.items?.data?.[0];
  const startUnix = item?.current_period_start ?? sub.current_period_start;
  const endUnix = item?.current_period_end ?? sub.current_period_end;
  return {
    startIso: startUnix ? new Date(startUnix * 1000).toISOString() : null,
    endIso: endUnix ? new Date(endUnix * 1000).toISOString() : null,
  };
}

/**
 * Plan Propietario contratado con el trimestre inicial (-20%, 192€ de golpe):
 * tras ese primer trimestre la suscripción debe pasar a 80€/mes. Lo
 * conseguimos con un subscription schedule de 2 fases:
 *   fase 1 = el precio trimestral ya cobrado (hasta el fin del periodo),
 *   fase 2 = 1 mes al precio mensual, y `release` para que continúe
 *            indefinidamente a 80€/mes como suscripción normal.
 *
 * Idempotente de verdad: create y update llevan clave de idempotencia y, si la
 * suscripción ya cuelga de un schedule de UNA fase (un intento anterior que
 * creó el schedule pero falló al programar la fase mensual), se completa en
 * vez de darlo por hecho. Si falla, el llamador lo manda a revisión manual.
 */
async function scheduleOwnerIntroRollover(
  stripe: Stripe,
  subscriptionId: string,
  userId: string,
) {
  const monthlyPrice = process.env.STRIPE_OWNER_MONTHLY_PRICE_ID;
  if (!monthlyPrice) {
    throw new Error("STRIPE_OWNER_MONTHLY_PRICE_ID no configurado; el plan trimestral no rotará a mensual.");
  }
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  const scheduleId = stripeId((current as unknown as { schedule?: string | { id: string } | null }).schedule);
  const schedule = scheduleId
    ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : await stripe.subscriptionSchedules.create(
        { from_subscription: subscriptionId },
        { idempotencyKey: `owner-rollover:${subscriptionId}` },
      );
  // Ya tiene la fase mensual programada: nada que hacer.
  if (schedule.phases.length > 1) return;
  // IMPORTANTE: solo llamar a esta función cuando el trimestre ya se está
  // cobrando (status active). Si se llamara durante la prueba de 7 días,
  // phase0 sería la fase de trial y la fase mensual pisaría el trimestre.
  const phase0 = schedule.phases[0];
  const ownerMeta = {
    supabase_user_id: userId,
    owner_plan: "true",
    owner_billing: "quarterly",
  };
  await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      end_behavior: "release",
      phases: [
        {
          items: phase0.items.map((it) => ({
            price: typeof it.price === "string" ? it.price : it.price.id,
            quantity: it.quantity ?? 1,
          })),
          start_date: phase0.start_date,
          end_date: phase0.end_date,
          metadata: ownerMeta,
        },
        {
          items: [{ price: monthlyPrice, quantity: 1 }],
          duration: { interval: "month", interval_count: 1 },
          metadata: ownerMeta,
        },
      ],
    },
    { idempotencyKey: `owner-rollover-phases:${subscriptionId}` },
  );
}

const stripeId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id ?? null;

/**
 * Garantiza que una suscripción Propietario trimestral ACTIVA tiene programada
 * su rotación a 80€/mes. Se invoca desde subscription.updated, que es donde
 * aterriza el fin de la prueba de 7 días (trialing -> active). Idempotente:
 * si la fase mensual ya está programada, o ya rodó al precio mensual, no hace
 * nada (y un schedule a medias se completa).
 */
/**
 * Aviso al propietario de que una visita PAGADA acaba de confirmarse.
 *
 * Va aparte de book_visit_slot porque esa función solo notifica en el camino
 * gratuito: la visita de pago nace pendiente y solo se confirma cuando Stripe
 * responde, o sea aquí. Todo es best-effort y silencioso: un fallo avisando no
 * puede tumbar la liquidación de un pago ya cobrado.
 */
async function notificarVisitaPagada(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string,
): Promise<void> {
  try {
    const { data: reserva } = await supabase
      .from("visit_bookings")
      .select("id, visitor_id, slot_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!reserva?.slot_id) return;

    const { data: hueco } = await supabase
      .from("visit_slots")
      .select("accommodation_id, slot_date, start_time")
      .eq("id", reserva.slot_id)
      .maybeSingle();
    if (!hueco?.accommodation_id) return;

    const { data: piso } = await supabase
      .from("accommodations")
      .select("owner_id, title")
      .eq("id", hueco.accommodation_id)
      .maybeSingle();
    if (!piso?.owner_id) return;

    // dd/mm a las hh:mm, en la zona del piso (todos son de España).
    const [, mes, dia] = String(hueco.slot_date).split("-");
    const hora = String(hueco.start_time ?? "").slice(0, 5);
    const cuando = dia && mes ? `${dia}/${mes}${hora ? ` a las ${hora}` : ""}` : "próximamente";

    await supabase.from("notifications").insert({
      user_id: piso.owner_id,
      type: "visit",
      title: "Visita confirmada y pagada",
      body: `Tienes una visita el ${cuando} en «${piso.title ?? "tu piso"}». El visitante ya ha pagado.`,
      data: {
        kind: "visit_paid",
        booking_id: reserva.id,
        accommodation_id: hueco.accommodation_id,
      },
    });
  } catch (e) {
    console.error("[webhook] aviso de visita pagada:", e);
  }
}

async function ensureOwnerQuarterlyRollover(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  userId: string,
): Promise<void> {
  const quarterlyPrice = process.env.STRIPE_OWNER_QUARTERLY_PRICE_ID;
  if (!quarterlyPrice) return;
  // `subscription` ya es la lectura fresca de Stripe (no el snapshot del evento).
  if (subscription.status !== "active") return;

  const currentPriceId = subscription.items?.data?.[0]?.price?.id;
  // Solo aplica mientras la suscripción sigue en el precio trimestral; tras el
  // release del schedule queda en el mensual y no hay nada que programar.
  if (currentPriceId !== quarterlyPrice) return;

  // scheduleOwnerIntroRollover distingue un schedule completo (no hace nada)
  // de uno a medias (lo completa), y es idempotente ante reintentos.
  await scheduleOwnerIntroRollover(stripe, subscription.id, userId);
}

/**
 * Mantiene sincronizado el Plan Propietario en BD y propaga la visibilidad
 * (is_paid) a todos los pisos cubiertos por ese plan.
 */
async function upsertOwnerSubscription(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  event: EventContext,
  row: {
    ownerId: string;
    customerId: string | null;
    subscriptionId: string;
    status: string;
    billing?: string | null;
    periodEndIso?: string | null;
  },
) {
  // Estados de Stripe fuera del CHECK de la tabla (incomplete_expired,
  // paused) harían fallar la escritura crítica en bucle.
  const status = ownerSubscriptionStatus(row.status);
  const isActive = status === "active" || status === "trialing";
  const upsert: Record<string, unknown> = {
    owner_id: row.ownerId,
    stripe_customer_id: row.customerId,
    stripe_subscription_id: row.subscriptionId,
    status,
  };
  // Solo tocar el fin de periodo cuando el evento lo trae; evita pisar el
  // valor bueno si checkout.completed llega después de subscription.updated.
  if (row.periodEndIso !== undefined) {
    upsert.current_period_end = row.periodEndIso;
  }
  if (row.billing) {
    upsert.billing = row.billing === "quarterly" ? "quarterly_intro" : "monthly";
  }
  // Idempotente: owner_subscriptions.stripe_subscription_id tiene UNIQUE
  // (migracion 105), asi que el upsert dedupe en reintentos de Stripe.
  // Escritura critica: si falla, lanzamos para forzar reintento.
  const { data: ownerSub, error: upErr } = await supabase
    .from("owner_subscriptions")
    .upsert(upsert, { onConflict: "stripe_subscription_id" })
    .select("id")
    .single();
  await assertWrite(event, "owner_subscriptions.upsert", { error: upErr });

  if (ownerSub?.id) {
    // Propaga la visibilidad a los pisos cubiertos. Idempotente (mismo valor).
    await assertWrite(
      event,
      "accommodations.set_is_paid_by_owner_sub",
      await supabase
        .from("accommodations")
        .update({ is_paid: isActive })
        .eq("owner_subscription_id", ownerSub.id),
    );
  }
  return ownerSub?.id ?? null;
}

async function setListingPaid(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  event: EventContext,
  table: ListingTable,
  listingId: string,
  _isPaid: boolean,
  _subscriptionId?: string | null,
) {
  // A cancellation from an older subscription must not hide a still-paid listing.
  await assertWrite(
    event,
    `${table}.set_is_paid`,
    await supabase.rpc("reconcile_business_listing", { p_type: table === "leisure_spots" ? "leisure" : "housing", p_listing: listingId }),
  );
}

/**
 * Marketplace fulfilment (Stripe Connect destination charges). Settles the
 * `payments` ledger row and advances the domain row for the paid flow. Keyed
 * by the pre-created order so it is idempotent (re-running on a duplicate
 * webhook is a no-op once status is already 'succeeded').
 */
async function fulfilMarketplacePayment(
  supabase: ReturnType<typeof getSupabaseAdmin>, event: EventContext, orderId: string,
  patch: { paymentIntentId?: string | null; chargeId?: string | null; sessionId?: string | null; amount: number | null; currency: string | null },
) {
  await assertWrite(event, "marketplace.atomic_settlement", await supabase.rpc("settle_marketplace_payment", {
    p_order: orderId, p_intent: patch.paymentIntentId ?? null, p_charge: patch.chargeId ?? null,
    p_session: patch.sessionId ?? null, p_amount: patch.amount, p_currency: patch.currency,
  }));
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/** Suscripción de una factura con las dos formas del SDK. */
function invoiceSubscriptionId(invoice: {
  subscription?: string | { id?: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
}): string | null {
  const rawSub = invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
  return typeof rawSub === "string" ? rawSub : rawSub?.id ?? null;
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Sin cabecera de firma no hay nada que verificar: 400 explícito (antes el
  // `!` la daba por presente y el fallo salía por el catch genérico).
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if(!acceptsPlatformStripeEvent(event))return NextResponse.json({received:true,ignored:true});

  const supabase = getSupabaseAdmin();

  // Idempotencia por event.id (webhook_events): un evento ya procesado con
  // éxito no se vuelve a aplicar aunque Stripe lo reenvíe.
  const claim = await claimWebhookEvent(supabase, event);
  if (claim.state === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim.state !== "process") {
    return NextResponse.json({ error: "Evento pendiente; se reintentara" }, { status: 503, headers: { "Retry-After": "60" } });
  }

  // Contexto del evento para registrar fallos y para los helpers idempotentes.
  const ctx: EventContext = { id: event.id, type: event.type };

  // M-COD-001 / M-BIZ-015: si una escritura critica en BD falla dentro de un
  // handler, lanzamos y respondemos 500 para que Stripe REINTENTE el mismo
  // evento. Por eso todos los handlers son idempotentes (upsert sobre UNIQUE o
  // comprobaciones leer-antes-de-escribir). Antes esto respondia 200 aunque la
  // BD fallara y el pago quedaba cobrado sin reflejarse.
  try {
    await processEvent(stripe, supabase, event, ctx);
  } catch (err) {
    // M-COD-001 / M-BIZ-015: una escritura critica fallo. Respondemos no-2xx
    // (500) para que Stripe reintente el MISMO evento mas tarde. Gracias a la
    // idempotencia de los handlers, el reintento no duplica efectos.
    if (err instanceof WebhookCriticalError) {
      console.error(
        `[stripe-webhook] respondiendo 500 para reintento de Stripe event.id=${event.id} type=${event.type} op=${err.context.op}`,
      );
    } else {
      console.error(
        "[stripe-webhook] error inesperado procesando event.id=%s type=%s:",
        event.id,
        event.type,
        err,
      );
    }
    // El fallo queda registrado con su contador (webhook_events.failures).
    await finishWebhookEvent(
      supabase,
      event,
      claim.token,
      "failed",
      err instanceof WebhookCriticalError ? `op=${err.context.op}` : err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json(
      { error: "Error procesando el evento; se reintentara" },
      { status: 500 },
    );
  }

  if (!(await finishWebhookEvent(supabase, event, claim.token, "succeeded"))) {
    return NextResponse.json({ error: "Confirmacion pendiente; se reintentara" }, { status: 503, headers: { "Retry-After": "60" } });
  }
  return NextResponse.json({ received: true });
}

async function processEvent(stripe: Stripe, supabase: SupabaseAdmin, event: Stripe.Event, ctx: EventContext): Promise<void> {
  if (await handleFrankyCardWebhook(stripe, event)) return;
  if (await handleOrganizationBillingWebhook(stripe, event)) return;
  if (await handleOriginWebhook(event)) return;
  // Deferred contracts have their own consent and billing mirror. Their
  // reconciliation remains available after closing new sales; the helper
  // returns immediately while the separately verified service is disabled
  // (except to send deferred-contract events to manual review).
  if (await handleHousingBillingWebhook(stripe, event)) return;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const sessionMode = session.metadata?.mode;

      // ===== Marketplace (visitas / alquiler / tickets, Stripe Connect) =====
      if (sessionMode === "marketplace") {
        const orderId = session.metadata?.order_id;
        if (orderId && ["paid", "no_payment_required"].includes(session.payment_status)) {
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id;
          await fulfilMarketplacePayment(supabase, ctx, orderId, {
            paymentIntentId: piId, sessionId: session.id, amount: session.amount_total, currency: session.currency,
          });
        }
        break;
      }

      // ===== B2B (zonas de ocio + inmobiliarias) =====
      if (sessionMode === "business") {
        const businessType = session.metadata?.business_type;
        const listingId = session.metadata?.listing_id;
        const table = tableForType(businessType);
        if (!userId || !listingId || !table) break;

        const stripeSubId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!stripeSubId) throw new Error("Business checkout has no subscription");
        // Read the current subscription: completion can arrive after an update
        // or cancellation, and must never reset an annual term or revive access.
        const businessSub = await stripe.subscriptions.retrieve(stripeSubId);
        if (businessSub.metadata.supabase_user_id !== userId || businessSub.metadata.listing_id !== listingId ||
            businessSub.metadata.business_type !== businessType) throw new Error("Business subscription identity mismatch");
        const billing = businessSubscriptionFields(businessSub);

        // Upsert business subscription (idempotente: stripe_subscription_id
        // tiene UNIQUE en la migracion 028). Escritura critica.
        const { data: bizSub, error: bizErr } = await supabase
          .from("business_subscriptions")
          .upsert(
            {
              owner_id: userId,
              type: businessType,
              listing_id: listingId,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: stripeSubId,
              ...billing,
            },
            { onConflict: "stripe_subscription_id" }
          )
          .select("id")
          .single();
        await assertWrite(ctx, "business_subscriptions.upsert", { error: bizErr });
        await syncBusinessAttempt(supabase, ctx, businessSub);

        await setListingPaid(supabase, ctx, table, listingId, billing.status === "active" || billing.status === "trialing", bizSub?.id ?? null);
        break;
      }

      // ===== Plan Usuario Propietario (cuenta, hasta 40 pisos) =====
      if (sessionMode === "owner") {
        const billing = session.metadata?.owner_billing;
        const stripeSubIdOwner =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!userId || !stripeSubIdOwner) break;

        // Las dos modalidades (mensual y trimestral) nacen con 7 días de
        // prueba, así que el estado normal aquí es "trialing" (los pisos se
        // publican igual). Leemos la suscripción para no inventar el estado ni
        // el fin de periodo.
        //
        // Si la lectura falla, el fallback tiene que ser el CONSERVADOR:
        // asumir "trialing". Asumir "active" en el alta trimestral programaría
        // la rotación durante la prueba y la fase mensual pisaría el cobro del
        // trimestre (192€ perdidos, y sin reintento porque el schedule ya
        // existiría). Con "trialing", la rotación la asegura
        // ensureOwnerQuarterlyRollover cuando el trial convierte de verdad.
        // owner_trial lo pone el checkout: "true" solo si ese propietario
        // estrenaba la prueba. Un cliente que vuelve nace ya "active".
        let retrieveOk = false;
        let ownerStatus = session.metadata?.owner_trial === "false" ? "active" : "trialing";
        let ownerPeriodEnd: string | null | undefined = undefined;
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubIdOwner);
          ownerStatus = sub.status;
          ownerPeriodEnd = extractPeriodTimestamps(sub).endIso;
          retrieveOk = true;
        } catch (err) {
          console.error("No se pudo leer la suscripción owner tras el checkout:", err);
        }

        await upsertOwnerSubscription(supabase, ctx, {
          ownerId: userId,
          customerId: session.customer as string,
          subscriptionId: stripeSubIdOwner,
          status: ownerStatus,
          billing,
          periodEndIso: ownerPeriodEnd,
        });

        // Trimestre inicial con -20%: programar el paso a 80€/mes. Con la
        // prueba de 7 días la suscripción nace "trialing", así que en la
        // práctica esto no se ejecuta en el alta normal: la rotación se
        // programa cuando el trimestre se cobra de verdad (ver
        // ensureOwnerQuarterlyRollover en subscription.updated). Se mantiene
        // por si Stripe salta la prueba (prevención de abuso de trials en un
        // cliente que ya la disfrutó) y la suscripción nace ya activa.
        // Solo con estado CONFIRMADO por Stripe: nunca programar la rotación
        // sobre un estado supuesto (ver comentario del fallback de arriba).
        if (billing === "quarterly" && retrieveOk && ownerStatus === "active") {
          try {
            await scheduleOwnerIntroRollover(stripe, stripeSubIdOwner, userId);
          } catch (err) {
            // El plan ya está activo; si la programación falla solo se
            // pierde la rotación automática. Queda en la cola de revisión
            // manual (con aviso al equipo) además del log.
            await flagPaymentReview(supabase, "owner_rollover", stripeSubIdOwner, {
              event_id: event.id, owner_id: userId, error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        break;
      }

      // ===== User Pro/Premium =====
      // Was: update profiles.subscription_plan/status (columns that do NOT
      // exist — the constraint check at writes-time would have eaten this).
      // Now: upsert the real `subscriptions` table. stripe_customer_id is
      // also mirrored back on the profile for cross-reference.
      const plan = session.metadata?.plan;
      const stripeSubIdUser =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (userId && plan && stripeSubIdUser) {
        const dbPlan = mapPlanToDbEnum(plan);
        // La suscripción nace con su estado y periodo REALES (antes se
        // escribía "active" sin periodo y el panel la contaba siempre como
        // mensual). Si la lectura falla, Stripe reintenta el evento.
        const userSub = await stripe.subscriptions.retrieve(stripeSubIdUser);
        const { startIso, endIso } = extractPeriodTimestamps(userSub);
        // Escritura critica e idempotente. Usamos el helper porque la tabla
        // `subscriptions` NO tiene UNIQUE en stripe_subscription_id (001), asi
        // que el helper hace "leer y luego insertar/actualizar" para no
        // duplicar filas si Stripe reintrega el evento.
        await upsertUserSubscription(supabase, ctx, {
          userId,
          customerId: session.customer as string,
          subscriptionId: stripeSubIdUser,
          plan: dbPlan,
          status: userSub.status,
          periodStartIso: startIso,
          periodEndIso: endIso,
        });
        // Keep customer id on profile for fast joins (avoids cross-table
        // lookup for "is this user paying"). This column already exists.
        // Idempotente (mismo valor) y critico para los joins de facturacion.
        await assertWrite(
          ctx,
          "profiles.stripe_customer_id",
          await supabase
            .from("profiles")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", userId),
        );
      }
      break;
    }

    // ===== Marketplace: el comprador abandonó el pago (sesión caducada) =====
    // Stripe manda este evento cuando expira el checkout (30 min en las
    // entradas). Sin él, la reserva 'pending_payment' retenía el aforo de por
    // vida y el evento se "agotaba" con entradas que nadie pagó.
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.mode !== "marketplace") break;
      const orderId = session.metadata?.order_id;
      if (!orderId) break;
      await assertWrite(ctx, "marketplace.close_expired", await supabase.rpc("finish_marketplace_close", {
        p_order: orderId, p_expired_session: session.id,
      }));
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const meta = subscription.metadata || {};
      const businessType = meta.business_type;
      const listingId = meta.listing_id;
      const ownerId = meta.supabase_user_id;
      const table = tableForType(businessType);

      // Contrato diferido de vivienda: lo gestiona (o lo manda a revisión)
      // handleHousingBillingWebhook, nunca la rama legacy de abajo.
      if (meta.housing_enrollment_id) break;

      // ===== Plan Propietario updated (renovación, impago, fase mensual…) =====
      if (meta.owner_plan === "true" && ownerId) {
        // El objeto del evento es un snapshot: un updated que llega tarde
        // (después de un deleted) resucitaba un plan cancelado. Se relee la
        // suscripción actual, igual que en la rama B2B.
        const current = await stripe.subscriptions.retrieve(subscription.id);
        const currentMeta = current.metadata || {};
        if (currentMeta.owner_plan !== "true" || currentMeta.supabase_user_id !== ownerId) {
          throw new Error("Owner subscription identity mismatch");
        }
        const { endIso } = extractPeriodTimestamps(current);
        // Reflejar el billing real según el precio vigente: tras el release
        // del schedule la suscripción pasa al precio mensual y la BD debe
        // dejar de anunciar "trimestre inicial".
        const currentPriceId = current.items?.data?.[0]?.price?.id;
        const billingFromPrice =
          currentPriceId && currentPriceId === process.env.STRIPE_OWNER_QUARTERLY_PRICE_ID
            ? "quarterly"
            : currentPriceId && currentPriceId === process.env.STRIPE_OWNER_MONTHLY_PRICE_ID
            ? "monthly"
            : null;
        await upsertOwnerSubscription(supabase, ctx, {
          ownerId,
          customerId: stripeId(current.customer as string | { id: string } | null) ?? customerId,
          subscriptionId: current.id,
          status: current.status,
          periodEndIso: endIso,
          billing: billingFromPrice,
        });

        // Fin de la prueba de 7 días del alta trimestral (trialing->active):
        // aquí es donde se programa la rotación 192€/trimestre -> 80€/mes.
        // No-crítico: si falla, el plan sigue activo; la rotación queda en la
        // cola de revisión manual con aviso al equipo.
        if (currentMeta.owner_billing === "quarterly") {
          try {
            await ensureOwnerQuarterlyRollover(stripe, current, ownerId);
          } catch (err) {
            await flagPaymentReview(supabase, "owner_rollover", current.id, {
              event_id: event.id, owner_id: ownerId, error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        break;
      }

      // ===== B2B subscription updated =====
      if (table && listingId && ownerId) {
        const current = await stripe.subscriptions.retrieve(subscription.id);
        if (current.metadata.supabase_user_id !== ownerId || current.metadata.listing_id !== listingId ||
            current.metadata.business_type !== businessType) throw new Error("Business subscription identity mismatch");
        const billing = businessSubscriptionFields(current);
        const isActive = billing.status === "active" || billing.status === "trialing";
        // Idempotente (upsert sobre UNIQUE) y critico.
        const { error: bizUpdErr } = await supabase
          .from("business_subscriptions")
          .upsert(
            {
              owner_id: ownerId,
              type: businessType,
              listing_id: listingId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              ...billing,
            },
            { onConflict: "stripe_subscription_id" }
          );
        await assertWrite(ctx, "business_subscriptions.update", { error: bizUpdErr });
        await syncBusinessAttempt(supabase, ctx, current);
        await setListingPaid(supabase, ctx, table, listingId, isActive);
        break;
      }

      // ===== User subscription updated =====
      // Update the row in `subscriptions` keyed by Stripe subscription id.
      // Se relee la suscripción: un updated tardío no puede devolver a
      // "active" una suscripción que ya se canceló. Periodo real para que el
      // MRR sepa si es mensual o anual.
      const current = await stripe.subscriptions.retrieve(subscription.id);
      const { startIso, endIso } = extractPeriodTimestamps(current);
      // Idempotente (UPDATE por clave de Stripe) y critico.
      await assertWrite(
        ctx,
        "subscriptions.update_status",
        await supabase
          .from("subscriptions")
          .update({
            status: userSubscriptionStatus(current.status),
            current_period_start: startIso,
            current_period_end: endIso,
          })
          .eq("stripe_subscription_id", current.id),
      );
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const meta = subscription.metadata || {};
      const businessType = meta.business_type;
      const listingId = meta.listing_id;
      const table = tableForType(businessType);
      if (meta.housing_enrollment_id) break;

      // ===== Plan Propietario canceled: ocultar sus pisos cubiertos =====
      if (meta.owner_plan === "true") {
        // Idempotente (poner canceled dos veces = igual) y critico.
        // maybeSingle: si el deleted llega antes que el checkout.completed no
        // hay fila todavía, y eso NO es un error (con .single() lanzaba y
        // Stripe reintentaba el evento en bucle).
        const { data: ownerSub, error: ownerCancelErr } = await supabase
          .from("owner_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subscription.id)
          .select("id")
          .maybeSingle();
        await assertWrite(ctx, "owner_subscriptions.cancel", { error: ownerCancelErr });
        if (ownerSub?.id) {
          await assertWrite(
            ctx,
            "accommodations.unpaid_on_cancel",
            await supabase
              .from("accommodations")
              .update({ is_paid: false })
              .eq("owner_subscription_id", ownerSub.id),
          );
        }
        break;
      }

      // ===== B2B subscription canceled =====
      if (table && listingId) {
        await assertWrite(
          ctx,
          "business_subscriptions.cancel",
          await supabase
            .from("business_subscriptions")
            .update({ status: "canceled" })
            .eq("stripe_subscription_id", subscription.id),
        );
        await syncBusinessAttempt(supabase, ctx, subscription);
        await setListingPaid(supabase, ctx, table, listingId, false);
        break;
      }

      // ===== User subscription canceled =====
      // Mark the subscription row as canceled (don't delete — we keep the
      // history for churn analytics in the admin dashboard). Idempotente y critico.
      await assertWrite(
        ctx,
        "subscriptions.cancel",
        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subscription.id),
      );
      break;
    }

    // ===== Marketplace: payment backstop (idempotent) =====
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (orderId && pi.metadata?.mode === "marketplace") {
        const chargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id;
        await fulfilMarketplacePayment(supabase, ctx, orderId, {
          paymentIntentId: pi.id,
          chargeId, amount: pi.amount_received, currency: pi.currency,
        });
      }
      break;
    }

    // ===== Dunning: cobro de suscripcion fallido (M-BIZ-099) =====
    // Marca la suscripcion afectada como past_due y avisa (app + correo con
    // enlace para pagar). NO despublicamos nada aqui: durante past_due se
    // mantiene la visibilidad y solo se retira en unpaid/canceled (eso ya lo
    // gestionan los handlers de subscription.updated/deleted).
    case "invoice.payment_failed": {
      const invoice = event.data.object as unknown as {
        id?: string | null;
        hosted_invoice_url?: string | null;
        subscription?: string | { id?: string } | null;
        parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
      };
      // Stripe SDK reciente puede traer la suscripcion en invoice.subscription
      // o, en facturas de suscripcion, en parent.subscription_details. Aceptamos ambas.
      const subId = invoiceSubscriptionId(invoice);
      const invoiceId = invoice.id ?? null;
      const invoiceUrl = invoice.hosted_invoice_url ?? null;

      // Factura sin suscripcion (pago suelto): no aplica dunning de suscripcion.
      if (!subId) break;

      // El fallo puede llegar tarde: un reintento de cobro ya pudo salir bien
      // (active) o la suscripción ya pudo cancelarse. Solo se marca impagada
      // si Stripe dice AHORA que lo está.
      const current = await stripe.subscriptions.retrieve(subId);
      if (current.status !== "past_due" && current.status !== "unpaid") {
        console.error(`[stripe-webhook] invoice.payment_failed sin efecto: la suscripción ${subId} está ${current.status}`);
        break;
      }
      const dunningStatus = current.status;

      // Si la factura corresponde a una suscripcion B2B u owner (identificadas
      // por sus tablas con UNIQUE en stripe_subscription_id), las marcamos
      // ahi. Estos UPDATE afectan a 0 filas si no es su caso, lo cual es
      // seguro e idempotente.
      const { data: ownerRows, error: ownerDunningErr } = await supabase
        .from("owner_subscriptions")
        .update({ status: dunningStatus })
        .eq("stripe_subscription_id", subId)
        .select("owner_id");
      await assertWrite(ctx, "owner_subscriptions.past_due", { error: ownerDunningErr });
      const { data: bizRows, error: bizDunningErr } = await supabase
        .from("business_subscriptions")
        .update({ status: dunningStatus })
        .eq("stripe_subscription_id", subId)
        .select("owner_id");
      await assertWrite(ctx, "business_subscriptions.past_due", { error: bizDunningErr });

      // Correo de impago a propietarios y negocios (best-effort, idempotente
      // por factura). Antes solo se avisaba a usuarios Pro, y solo en la app.
      const notified = new Set<string>();
      const dunningTargets: [unknown, "owner" | "business"][] = [[ownerRows, "owner"], [bizRows, "business"]];
      for (const [rows, kind] of dunningTargets) {
        for (const row of (rows ?? []) as { owner_id?: string | null }[]) {
          if (!row.owner_id || notified.has(row.owner_id)) continue;
          notified.add(row.owner_id);
          await sendPaymentFailedEmail(supabase, { userId: row.owner_id, invoiceId, invoiceUrl, kind });
        }
      }
      if (notified.size) break;

      // Suscripcion de usuario Pro/Premium: marcar past_due + notificar.
      // Idempotente: el UPDATE repite el mismo estado y la notificacion solo se
      // inserta si no hay ya un aviso de dunning sin leer para esa suscripcion.
      await markUserSubscriptionPastDue(supabase, ctx, { subscriptionId: subId, invoiceId, invoiceUrl });
      break;
    }

    // ===== Connect: onboarding / capability state changed =====
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      if(acct.id===ORIGIN_MERCHANT_ACCOUNT) {
        await refreshConnectAccount(acct.id);
        break;
      }
      const reqs = acct.requirements as
        | { currently_due?: string[]; disabled_reason?: string | null }
        | undefined;
      const onboardingStatus = acct.charges_enabled
        ? "active"
        : reqs?.disabled_reason
        ? "disabled"
        : "restricted";
      // Idempotente (UPDATE por clave de Connect) y critico.
      await assertWrite(
        ctx,
        "connect_accounts.update",
        await supabase
          .from("connect_accounts")
          .update({
            charges_enabled: acct.charges_enabled ?? false,
            payouts_enabled: acct.payouts_enabled ?? false,
            details_submitted: acct.details_submitted ?? false,
            requirements_currently_due: reqs?.currently_due ?? [],
            onboarding_status: onboardingStatus,
          })
          .eq("stripe_connect_account_id", acct.id),
      );
      break;
    }

    case "account.application.deauthorized": {
      if(event.account===ORIGIN_MERCHANT_ACCOUNT)await assertWrite(ctx,'origin_connect_deauthorized',await supabase.from('connect_accounts').update({charges_enabled:false,payouts_enabled:false,transfers_status:'inactive',onboarding_status:'disabled'}).eq('stripe_connect_account_id',ORIGIN_MERCHANT_ACCOUNT));
      break;
    }

    // ===== Marketplace: refund =====
    case "charge.refunded":
    case "refund.updated":
    case "refund.created": {
      const refundEvent = event.type === 'charge.refunded' ? null : event.data.object as Stripe.Refund;
      const refundCharge = typeof refundEvent?.charge === 'string' ? refundEvent.charge : refundEvent?.charge?.id;
      const charge = event.type === 'charge.refunded' ? event.data.object as Stripe.Charge : refundCharge ? await stripe.charges.retrieve(refundCharge) : null;
      if (!charge) break;
      const piId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!piId) break;

      // Refund may arrive before checkout.completed. Resolve the signed
      // Stripe payment intent, then atomically apply a monotonic refund total.
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.metadata?.mode !== "marketplace" || !pi.metadata.order_id) break;
      const evidence = await confirmedStripeRefunds(stripe, charge);
      if (!evidence.confirmedCents) break;
      await assertWrite(ctx, "marketplace.atomic_refund", await supabase.rpc("refund_marketplace_payment", {
        p_order: pi.metadata.order_id, p_intent: pi.id, p_charge: charge.id,
        p_amount: charge.amount, p_currency: charge.currency, p_refunded: evidence.confirmedCents,
      }));
      break;
    }

    // ===== Marketplace: disputas (contracargos) =====
    // Antes no se escuchaban: el banco retiraba el dinero a Franky, la entrada
    // seguía válida y el organizador conservaba su parte. Ahora se marca el
    // pago en revisión, se intenta revertir la transferencia al organizador y
    // se avisa al equipo (lib/marketplace-disputes.ts).
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated": {
      await handleMarketplaceDispute(stripe, supabase, event);
      break;
    }
  }
}
