import Stripe from "stripe";
import { createAdminSupabase } from "@/lib/supabase-admin";

/**
 * Red de seguridad del Plan Propietario: si Stripe dice que hay plan y nuestra
 * base de datos no, se copia el estado de Stripe.
 *
 * Por qué existe (incidente 05-ago-2026): la cuenta de Stripe no tenía NINGÚN
 * webhook apuntando a franky.es, así que `checkout.session.completed` no
 * llegaba nunca. Dos inmobiliarias contrataron el plan, pagaron con su tarjeta
 * y la web les seguía pidiendo pagar y cobrándoles 9,99 € por piso, porque la
 * única fuente de verdad era una tabla que nadie rellenaba. Con esto, un
 * webhook perdido (mal configurado, caído o borrado) deja de ser un cliente
 * enfadado: la primera vez que el propietario abre su panel o intenta
 * publicar, el plan aparece solo.
 *
 * No sustituye al webhook (que sigue siendo el camino rápido y el que gestiona
 * bajas y renovaciones): es el cinturón por si falla.
 */

/** Estados de Stripe en los que el plan da servicio o sigue vivo. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type SyncedOwnerPlan = {
  id: string;
  status: string;
  billing: string | null;
  max_listings: number | null;
  current_period_end: string | null;
} | null;

function periodEndIso(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const unix = s.items?.data?.[0]?.current_period_end ?? s.current_period_end;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

/**
 * Devuelve el plan vivo del propietario, sincronizando desde Stripe si en la
 * base de datos no hay ninguno. Nunca lanza: ante cualquier problema devuelve
 * lo que hubiera en la base de datos, porque esto se llama en caminos donde el
 * usuario está esperando (panel y alta de piso).
 */
export async function getOwnerPlanWithFallback(userId: string): Promise<SyncedOwnerPlan> {
  const admin = createAdminSupabase();

  const { data: rows } = await admin
    .from("owner_subscriptions")
    .select("id, status, billing, max_listings, current_period_end, stripe_subscription_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  const live = (rows ?? []).find((r) => LIVE_STATUSES.has(r.status));
  if (live) return live;

  // Nada vivo en BD. ¿Lo sabe Stripe?
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;

  try {
    const stripe = new Stripe(secret);

    // El customer puede estar en el perfil o, si el webhook nunca llegó,
    // solo en Stripe: se busca también por metadato del usuario.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id ?? null;
    if (!customerId) {
      const found = await stripe.customers.search({
        query: `metadata['supabase_user_id']:'${userId}'`,
        limit: 1,
      });
      customerId = found.data[0]?.id ?? null;
      if (customerId) {
        await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
      }
    }
    if (!customerId) return null;

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const plan = subs.data.find(
      (s) => s.metadata?.owner_plan === "true" && LIVE_STATUSES.has(s.status),
    );
    if (!plan) return null;

    const quarterly = process.env.STRIPE_OWNER_QUARTERLY_PRICE_ID;
    const priceId = plan.items?.data?.[0]?.price?.id;
    const billing = priceId && priceId === quarterly ? "quarterly_intro" : "monthly";

    console.warn(
      `[owner-plan-sync] plan de ${userId} recuperado desde Stripe (${plan.id}): ` +
        "el webhook no lo registró. Revisa la configuración de webhooks.",
    );

    const { data: upserted } = await admin
      .from("owner_subscriptions")
      .upsert(
        {
          owner_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: plan.id,
          status: plan.status,
          billing,
          current_period_end: periodEndIso(plan),
        },
        { onConflict: "stripe_subscription_id" },
      )
      .select("id, status, billing, max_listings, current_period_end")
      .single();

    if (upserted?.id) {
      // Los pisos que subió mientras el plan no constaba estaban invisibles
      // (is_paid=false): al aparecer el plan se publican, que es lo que el
      // propietario ya había pagado.
      await admin
        .from("accommodations")
        .update({ is_paid: true, owner_subscription_id: upserted.id })
        .eq("owner_id", userId)
        .eq("status", "active")
        .is("owner_subscription_id", null);
    }

    return upserted ?? null;
  } catch (err) {
    console.error("[owner-plan-sync] no se pudo consultar Stripe:", err);
    return null;
  }
}
