import { isDemoPaymentActor } from '@/lib/payment-demo-guard';
import { getOrCreateOwnedCustomer } from "@/lib/stripe-customer";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabase } from "@/lib/supabase-server";
import { validateBody } from "@/lib/api-helpers";
import Stripe from "stripe";
import { businessPriceCents } from "@/lib/business-billing";
import { startBusinessCheckout, BusinessCheckoutError } from "@/lib/business-checkout";
import { rateLimit } from "@/lib/rate-limit";
import { housingFirstInterestEnabled, housingDeferredBillingReady } from "@/lib/housing-billing-release";
import { assertNoDeferredHousingContract, startHousingEnrollment, HousingBillingError } from "@/lib/housing-billing";
import { OWNER_PLAN, PRICING } from "@/lib/pricing";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const PRICE_IDS: Record<string, Record<string, string>> = {
  pro: {
    month: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "",
    year: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "",
  },
  premium: {
    month: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || "",
    year: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || "",
  },
};

const BUSINESS_PRICE_IDS: Record<string, Partial<Record<"month" | "year", string>>> = {
  leisure: { month: process.env.STRIPE_LEISURE_PRICE_ID || "", year: process.env.STRIPE_LEISURE_YEARLY_PRICE_ID || "" },
  housing: { month: process.env.STRIPE_HOUSING_PRICE_ID || "" },
};

const OWNER_PRICE_IDS: Record<string, string> = { monthly: process.env.STRIPE_OWNER_MONTHLY_PRICE_ID || "", quarterly: process.env.STRIPE_OWNER_QUARTERLY_PRICE_ID || "" };
// Altas nuevas: 7 días de prueba (antes 15). Las suscripciones ya creadas
// conservan la prueba con la que nacieron: Stripe la fija al crearlas.
const OWNER_TRIAL_DAYS = 7;

/** Precio de Stripe que no cuadra con lo anunciado: no se cobra. */
class PriceConfigError extends Error {}

/**
 * Todo precio que se cobra debe ser exactamente el anunciado: activo, en EUR,
 * con IVA INCLUIDO (tax_behavior inclusive, así automatic_tax no suma el 21%
 * encima del precio publicado), importe y cadencia esperados. Antes solo se
 * comprobaba así el anual de ocio (y validateHousingPrice en la oferta
 * diferida); un price ID mal copiado en Vercel cobraba otra cosa sin avisar.
 */
function assertExpectedPrice(
  price: Stripe.Price,
  label: string,
  expected: { cents: number; interval: "month" | "year"; count?: number },
) {
  const problems: string[] = [];
  if (!price.active) problems.push("inactivo");
  if (price.currency !== "eur") problems.push(`moneda ${price.currency}`);
  if (price.unit_amount !== expected.cents) problems.push(`importe ${price.unit_amount} (esperado ${expected.cents})`);
  // "unspecified" hereda el ajuste por defecto de la cuenta (IVA incluido): así
  // están hoy en producción el Plan Propietario (80/192) y los listados de 9,99
  // y cobran el importe anunciado. Solo "exclusive" sumaría el 21 % encima.
  if (price.tax_behavior === "exclusive") problems.push("tax_behavior exclusive (esperado inclusive)");
  else if (price.tax_behavior !== "inclusive") {
    console.warn(`[checkout] precio ${label} (${price.id}) con tax_behavior ${price.tax_behavior ?? "?"}: conviene marcarlo como inclusive en Stripe`);
  }
  if (price.recurring?.interval !== expected.interval || price.recurring?.interval_count !== (expected.count ?? 1)) {
    problems.push(`cadencia ${price.recurring?.interval ?? "?"}/${price.recurring?.interval_count ?? "?"}`);
  }
  if (problems.length) {
    console.error(`[checkout] precio ${label} (${price.id}) mal configurado en Stripe: ${problems.join(", ")}`);
    throw new PriceConfigError(label);
  }
}

/** Ventana corta para la clave de idempotencia: dos clics seguidos (o dos
 * pestañas) reciben la MISMA sesión en vez de abrir dos cobros. */
function idempotencyWindow(): number {
  return Math.floor(Date.now() / 60_000);
}

// Validate the body shape strictly. mode + planId + interval + businessType
// + listingId are all enums or UUIDs — no free-form strings reach the Stripe API.
const checkoutSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("subscription"),
    planId: z.enum(["pro", "premium"]),
    interval: z.enum(["month", "year"]),
  }),
  z.object({
    mode: z.literal("business"),
    businessType: z.enum(["leisure", "housing"]),
    listingId: z.string().uuid(),
    interval: z.enum(["month", "year"]).default("month"),
    offerVersion: z.string().max(80).optional(),
  }).strict(),
  z.object({
    mode: z.literal("owner"),
    billing: z.enum(["monthly", "quarterly"]),
    offerVersion: z.string().max(80).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createRequestSupabase(req);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Esta cuenta es de demostración. Los cobros reales están desactivados.' }, { status: 403 });

    const limited = await rateLimit(req, { key: "stripe-checkout", subject: user.id, limit: 10, windowMs: 60_000 });
    if (!limited.ok) return limited.response;

    const parsed = await validateBody(req, checkoutSchema);
    if (parsed instanceof NextResponse) return parsed;

    const isHousing = parsed.mode === "owner" || (parsed.mode === "business" && parsed.businessType === "housing");
    if (isHousing && parsed.offerVersion && !housingFirstInterestEnabled()) {
      return NextResponse.json({ error: "Esta oferta no está disponible. Revisa las condiciones actuales antes de continuar." }, { status: 409 });
    }
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Los pagos no están disponibles. Inténtalo más tarde." }, { status: 503 });
    const stripe = getStripe();

    const customerId = await getOrCreateOwnedCustomer(user);

    if (isHousing && parsed.offerVersion && housingFirstInterestEnabled()) {
      if (parsed.mode === "business" && parsed.interval !== "month") {
        return NextResponse.json({ error: "Los anuncios de pisos tienen tarifa mensual." }, { status: 400 });
      }
      const session = await startHousingEnrollment(stripe, {
        owner: user.id, customer: customerId, origin: req.nextUrl.origin,
        listing: parsed.mode === "business" ? parsed.listingId : null,
        billing: parsed.mode === "owner" ? parsed.billing : "listing", offerVersion: parsed.offerVersion,
      });
      return NextResponse.json(session);
    }

    // Legacy clients keep their own contract. An existing deferred agreement
    // prevents opening a second legacy subscription when the service is ready.
    if (isHousing && housingDeferredBillingReady()) {
      await assertNoDeferredHousingContract(user.id, parsed.mode === "business" ? parsed.listingId : null);
    }

    // ===== B2B flow (zonas de ocio + inmobiliarias) =====
    if (parsed.mode === "business") {
      const { businessType, listingId, interval } = parsed;
      if (businessType === "housing" && interval === "year") {
        return NextResponse.json({ error: "El pago anual solo está disponible para zonas de ocio y locales." }, { status: 400 });
      }
      const priceId = BUSINESS_PRICE_IDS[businessType][interval];
      if (!priceId) return NextResponse.json({ error: "Esta tarifa no está disponible. Inténtalo más tarde." }, { status: 503 });

      // Verify the listing belongs to the user
      const tableName = businessType === "leisure" ? "leisure_spots" : "accommodations";
      const { data: listing } = await supabase
        .from(tableName)
        .select("id, owner_id")
        .eq("id", listingId)
        .single();

      if (!listing || listing.owner_id !== user.id) {
        return NextResponse.json({ error: "Listing no encontrado" }, { status: 404 });
      }

      // Switching cadence must not create a second live subscription.
      const { data: existing, error: existingError } = await supabase.from("business_subscriptions")
        .select("id").eq("owner_id", user.id).eq("listing_id", listingId).eq("type", businessType)
        .in("status", ["active", "trialing", "past_due", "unpaid", "incomplete"]).limit(1).maybeSingle();
      if (existingError) throw new Error("Unable to verify business subscription");
      if (existing) return NextResponse.json({ error: "Esta ficha ya tiene una suscripción. Gestionala desde Facturación." }, { status: 409 });
      for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
        if (sub.metadata.listing_id === listingId && !["canceled", "incomplete_expired"].includes(sub.status)) {
          return NextResponse.json({ error: "Esta ficha ya tiene una suscripción. Gestionala desde Facturación." }, { status: 409 });
        }
      }
      assertExpectedPrice(await stripe.prices.retrieve(priceId), `business_${businessType}_${interval}`, {
        cents: businessPriceCents(businessType, interval), interval,
      });

      const session = await startBusinessCheckout(stripe, { owner: user.id, type: businessType, listing: listingId, interval, params: {
        customer: customerId,
        mode: "subscription",
        allow_promotion_codes: true,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${req.nextUrl.origin}/negocio/dashboard?success=true`,
        cancel_url: `${req.nextUrl.origin}/negocio/dashboard`,
        metadata: {
          supabase_user_id: user.id,
          mode: "business",
          business_type: businessType,
          listing_id: listingId,
          billing_interval: interval,
        },
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            business_type: businessType,
            listing_id: listingId,
            billing_interval: interval,
          },
        },
        // M-BIZ-093: IVA via Stripe Tax (ver nota en el flujo Pro/Premium).
        // Aqui el cliente suele ser empresa, asi que ademas permitimos
        // introducir el NIF/CIF (tax_id_collection).
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        tax_id_collection: { enabled: true },
      } });

      return NextResponse.json({ url: session.url });
    }

    // ===== Plan Usuario Propietario (80€/mes, hasta 40 pisos) =====
    if (parsed.mode === "owner") {
      const { billing } = parsed;

      // Historial completo de planes de este propietario. Sirve para dos cosas
      // distintas, por eso se lee entero y no solo los vivos.
      //
      // FAIL-CLOSED: si la consulta falla no se sigue adelante. Dejar pasar
      // sería regalar una segunda suscripción con una segunda prueba gratis.
      const { data: ownerSubs, error: ownerSubsErr } = await supabase
        .from("owner_subscriptions")
        .select("id, status")
        .eq("owner_id", user.id);

      if (ownerSubsErr) {
        console.error("[checkout owner] no se pudo leer owner_subscriptions:", ownerSubsErr.message);
        return NextResponse.json(
          { error: "No hemos podido comprobar tu plan. Inténtalo en unos segundos." },
          { status: 503 }
        );
      }

      // La BD puede ir por detrás de Stripe (webhook perdido o con retraso),
      // así que la verdad sobre "¿ya tiene plan?" se le pregunta también a
      // Stripe. Sin esto, un evento perdido deja crear una segunda suscripción
      // con su segunda prueba, y el cliente acaba pagando dos veces.
      let stripeOwnerSubs: Stripe.Subscription[] = [];
      try {
        const list = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
        });
        stripeOwnerSubs = list.data.filter((s) => s.metadata?.owner_plan === "true");
      } catch (err) {
        console.error("[checkout owner] no se pudo listar suscripciones en Stripe:", err);
        return NextResponse.json(
          { error: "No hemos podido comprobar tu plan. Inténtalo en unos segundos." },
          { status: 503 }
        );
      }

      // 1) Si ya tiene un plan vivo, no dejamos crear otro: que lo gestione
      //    desde el portal de facturación. 'unpaid' NO entra aquí a propósito:
      //    ahí Stripe ya dejó de cobrar y los pisos están despublicados, así
      //    que bloquear el alta solo dejaría al cliente atrapado.
      const LIVE = ["active", "trialing", "past_due"];
      const vivoEnBD = (ownerSubs ?? []).some((s) => LIVE.includes(s.status));
      const vivoEnStripe = stripeOwnerSubs.some((s) => LIVE.includes(s.status));
      if (vivoEnBD || vivoEnStripe) {
        return NextResponse.json(
          { error: "Ya tienes un Plan Propietario. Gestiónalo desde Facturación." },
          { status: 409 }
        );
      }

      // 2) La prueba gratis es UNA por propietario. Sin esto, cancelar el día
      //    6 y volver a darse de alta reinicia los 7 días: 40 pisos
      //    publicados para siempre sin pagar un céntimo. Las filas canceladas
      //    no se borran y solo las escribe el service role, así que el usuario
      //    no puede limpiarlas.
      //
      //    Los estados 'incomplete*' no cuentan: son altas que nunca llegaron a
      //    cobrarse ni a estrenar la prueba (la vía con prueba nace siempre en
      //    'trialing'), y quemarles el trial sería castigar un pago fallido.
      const NO_CUENTA = ["incomplete", "incomplete_expired"];
      const yaTuvoPlan =
        (ownerSubs ?? []).some((s) => !NO_CUENTA.includes(s.status)) ||
        stripeOwnerSubs.some((s) => !NO_CUENTA.includes(s.status));

      const priceId = OWNER_PRICE_IDS[billing];
      if (!priceId) {
        return NextResponse.json({ error: "Plan no configurado en Stripe" }, { status: 500 });
      }
      // 80 €/mes o 192 € por el trimestre de entrada; en el trimestral se
      // valida también la renovación a 80 €/mes que se promete.
      assertExpectedPrice(await stripe.prices.retrieve(priceId), `owner_${billing}`, billing === "monthly"
        ? { cents: Math.round(OWNER_PLAN.monthly * 100), interval: "month" }
        : { cents: Math.round(OWNER_PLAN.introQuarterTotal * 100), interval: "month", count: OWNER_PLAN.introMonths });
      if (billing === "quarterly") {
        if (!OWNER_PRICE_IDS.monthly) return NextResponse.json({ error: "Plan no configurado en Stripe" }, { status: 500 });
        assertExpectedPrice(await stripe.prices.retrieve(OWNER_PRICE_IDS.monthly), "owner_monthly_renewal", {
          cents: Math.round(OWNER_PLAN.monthly * 100), interval: "month",
        });
      }

      // 3) Un checkout del plan ya abierto (otra pestaña, doble clic, volver
      //    atrás) no debe abrir un segundo cobro: se reutiliza si es la misma
      //    modalidad, y si es otra se caduca antes de abrir la nueva.
      for await (const open of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
        if (open.metadata?.mode !== "owner" || open.metadata?.supabase_user_id !== user.id) continue;
        if (open.metadata?.owner_billing === billing && open.metadata?.owner_trial === String(!yaTuvoPlan) && open.url) {
          return NextResponse.json({ url: open.url });
        }
        try {
          await stripe.checkout.sessions.expire(open.id);
        } catch {
          // Pudo completarse justo ahora: no abrimos otro cobro a ciegas.
          return NextResponse.json(
            { error: "Tienes un pago del plan en curso. Espera un minuto y revisa Facturación." },
            { status: 409 }
          );
        }
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        allow_promotion_codes: true,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${req.nextUrl.origin}/negocio/dashboard?owner=success`,
        cancel_url: `${req.nextUrl.origin}/negocio/propietario?canceled=true`,
        // Los 7 días de prueba acompañan a las DOS modalidades (mensual y
        // trimestral), pero solo la primera vez (ver yaTuvoPlan). La tarjeta se
        // pide igualmente en el checkout (payment_method_collection always) y
        // Stripe cobra al acabar la prueba, sin más interacción: 80€ en la
        // mensual, 192€ en la trimestral. Si el cliente retirase la tarjeta
        // durante la prueba, la suscripción se cancela sola en vez de quedar
        // impagada.
        payment_method_collection: "always",
        metadata: {
          supabase_user_id: user.id,
          mode: "owner",
          owner_billing: billing,
          // También a nivel de sesión: es lo que lee el webhook en
          // checkout.session.completed (la de subscription_data viaja en la
          // suscripción, no en la sesión).
          owner_trial: String(!yaTuvoPlan),
        },
        subscription_data: {
          ...(yaTuvoPlan
            ? {}
            : {
                trial_period_days: OWNER_TRIAL_DAYS,
                trial_settings: {
                  end_behavior: { missing_payment_method: "cancel" as const },
                },
              }),
          metadata: {
            supabase_user_id: user.id,
            owner_plan: "true",
            owner_billing: billing,
            // El webhook lo necesita para no dar por hecho que hubo prueba si
            // falla al leer la suscripción (y como rastro de quién la gastó).
            owner_trial: String(!yaTuvoPlan),
          },
        },
        // M-BIZ-093: IVA via Stripe Tax (ver nota en el flujo Pro/Premium).
        // El propietario puede ser empresa: permitimos NIF/CIF.
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        tax_id_collection: { enabled: true },
      }, { idempotencyKey: `owner-checkout:${user.id}:${billing}:${!yaTuvoPlan}:${idempotencyWindow()}` });

      // Una clave repetida devuelve la sesión ya creada; si esa ya no está
      // abierta no se inventa otra en el mismo minuto.
      if (session.status && session.status !== "open") {
        return NextResponse.json(
          { error: "Tienes un pago del plan en curso. Espera un minuto y revisa Facturación." },
          { status: 409 }
        );
      }
      return NextResponse.json({ url: session.url });
    }

    // ===== User subscription flow (Pro / Premium) =====
    const { planId, interval } = parsed;
    const priceId = PRICE_IDS[planId]?.[interval];

    if (!priceId) {
      // This means the env var STRIPE_<plan>_<interval>_PRICE_ID isn't set.
      // Schema validation accepted the input but Stripe wouldn't have a price.
      return NextResponse.json({ error: "Plan no configurado en Stripe" }, { status: 500 });
    }

    // M-BIZ-004: evitar doble suscripcion. Si el usuario ya tiene una
    // suscripcion viva (active/trialing/past_due) no creamos otra sesion: que
    // la gestione desde el portal de facturacion. Incluimos past_due a
    // proposito porque durante el dunning la suscripcion sigue existiendo en
    // Stripe y crear una segunda generaria doble cobro.
    const { data: existingSub, error: existingSubErr } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .limit(1)
      .maybeSingle();
    if (existingSubErr) {
      return NextResponse.json({ error: "No hemos podido comprobar tu suscripción. Inténtalo en unos segundos." }, { status: 503 });
    }

    if (existingSub) {
      return NextResponse.json(
        { error: "Ya tienes una suscripcion activa. Gestionala desde tu cuenta." },
        { status: 409 }
      );
    }

    // Compra hecha en la app (App Store / Google Play vía RevenueCat): no se
    // vende una segunda suscripción por la web al mismo usuario.
    const { data: nativeSub, error: nativeErr } = await supabase
      .from("native_entitlements")
      .select("entitlement")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (nativeErr) {
      return NextResponse.json({ error: "No hemos podido comprobar tu suscripción. Inténtalo en unos segundos." }, { status: 503 });
    }
    if (nativeSub) {
      return NextResponse.json(
        { error: "Ya tienes una suscripción activa desde la app. Gestiónala en la tienda de tu móvil." },
        { status: 409 }
      );
    }

    // La BD puede ir por detrás de Stripe (webhook con retraso): se pregunta
    // también a Stripe por suscripciones vivas con un precio Pro/Premium.
    const userPriceIds = new Set(Object.values(PRICE_IDS).flatMap((byInterval) => Object.values(byInterval)).filter(Boolean));
    for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
      if (!["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status)) continue;
      if (sub.items.data.some((item) => userPriceIds.has(item.price.id))) {
        return NextResponse.json(
          { error: "Ya tienes una suscripcion activa. Gestionala desde tu cuenta." },
          { status: 409 }
        );
      }
    }

    assertExpectedPrice(await stripe.prices.retrieve(priceId), `${planId}_${interval}`, {
      cents: Math.round(PRICING[planId][interval === "month" ? "monthly" : "yearly"] * 100), interval,
    });

    // Un checkout de Pro/Premium ya abierto se reutiliza (mismo plan y
    // cadencia) o se caduca antes de abrir otro: dos sesiones abiertas son dos
    // suscripciones si el usuario paga en las dos pestañas.
    for await (const open of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
      if (open.metadata?.supabase_user_id !== user.id || !["pro", "premium"].includes(open.metadata?.plan ?? "") || open.metadata?.mode) continue;
      if (open.metadata.plan === planId && open.metadata.billing_interval === interval && open.url) {
        return NextResponse.json({ url: open.url });
      }
      try {
        await stripe.checkout.sessions.expire(open.id);
      } catch {
        return NextResponse.json(
          { error: "Tienes un pago en curso. Espera un minuto y vuelve a intentarlo." },
          { status: 409 }
        );
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/pricing?success=true`,
      cancel_url: `${req.nextUrl.origin}/pricing?canceled=true`,
      metadata: { supabase_user_id: user.id, plan: planId, billing_interval: interval },
      // Tambien en la suscripcion: el webhook y la conciliacion pueden
      // identificarla sin depender de la sesion.
      subscription_data: { metadata: { supabase_user_id: user.id, plan: planId, billing_interval: interval } },
      // M-BIZ-093: IVA gestionado por Stripe Tax. Se pide direccion en el
      // checkout (billing_address_collection) y se guarda en el customer
      // (customer_update address:auto) para que automatic_tax pueda calcular
      // el impuesto.
      // REQUIERE Stripe Tax activo en el dashboard (Settings > Tax) con el
      // registro de España: si no lo esta, Stripe RECHAZA la creacion de la
      // sesion (esta ruta responde 500) en lugar de cobrar sin IVA. Los precios
      // deben tener tax_behavior "inclusive" (lo comprueba assertExpectedPrice)
      // para que el IVA vaya dentro del precio anunciado y no se sume encima.
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto" },
    }, { idempotencyKey: `user-checkout:${user.id}:${planId}:${interval}:${idempotencyWindow()}` });

    if (session.status && session.status !== "open") {
      return NextResponse.json({ error: "Tienes un pago en curso. Espera un minuto y vuelve a intentarlo." }, { status: 409 });
    }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof HousingBillingError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof BusinessCheckoutError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof PriceConfigError) {
      return NextResponse.json({ error: "Esta tarifa no está disponible ahora mismo. No se ha realizado ningún cobro." }, { status: 500 });
    }
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Error al crear la sesión de pago" },
      { status: 500 }
    );
  }
}
