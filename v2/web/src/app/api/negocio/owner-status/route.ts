import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { OWNER_PLAN } from "@/lib/pricing";
import { getOwnerPlanWithFallback } from "@/lib/owner-plan-sync";

export const dynamic = "force-dynamic";

/**
 * Estado del Plan Usuario Propietario del usuario autenticado.
 * Lo usa el formulario de alta de pisos para saltarse la pasarela de pago
 * y la página /negocio/propietario para mostrar el estado del plan.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ active: false, authenticated: false });
  }

  // Historial completo: hace falta saber si alguna vez tuvo plan para no
  // prometer una prueba gratis que el checkout ya no le va a conceder (la
  // prueba es una por propietario, ver /api/stripe/checkout).
  const { data: allSubs } = await supabase
    .from("owner_subscriptions")
    .select("id, status, billing, max_listings, current_period_end, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  type PlanRow = {
    id: string;
    status: string;
    billing: string | null;
    max_listings: number | null;
    current_period_end: string | null;
  };

  const LIVE = ["active", "trialing", "past_due", "unpaid"];
  let sub: PlanRow | null = (allSubs ?? []).find((s) => LIVE.includes(s.status)) ?? null;
  let trialAvailable = (allSubs ?? []).length === 0;

  // Sin plan en BD: preguntar a Stripe antes de decirle que no tiene nada. Si
  // el webhook falló (pasó el 05-ago-2026: no había ninguno configurado), esto
  // recupera el plan que el cliente YA está pagando.
  if (!sub) {
    const recuperado = await getOwnerPlanWithFallback(user.id);
    if (recuperado) {
      sub = recuperado;
      trialAvailable = false;
    }
  }

  const active = !!sub && (sub.status === "active" || sub.status === "trialing");

  let listingsUsed = 0;
  if (sub) {
    // Misma cuenta que aplica el trigger de la migración 163: todo lo subido y
    // sin archivar, descontando las fichas que pagan su propia suscripción
    // suelta de 9,99 €. La cuenta anterior filtraba por status='active' Y por
    // owner_subscription_id, así que infracontaba por partida doble y el panel
    // le decía al propietario que tenía plazas libres que en realidad no
    // tenía.
    const { data: usadas, error } = await supabase.rpc("owner_listing_quota_used", {
      p_owner: user.id,
    });
    if (error) {
      console.error("[owner-status] cupo:", error);
      // Igual que en el alta: si la migración 163 aún no está aplicada, se cae
      // al recuento antiguo en vez de enseñar un cero que asustaría.
      const { count } = await supabase
        .from("accommodations")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "active");
      listingsUsed = count ?? 0;
    } else {
      listingsUsed = usadas ?? 0;
    }
  }

  return NextResponse.json({
    authenticated: true,
    active,
    status: sub?.status ?? null,
    billing: sub?.billing ?? null,
    listingsUsed,
    maxListings: sub?.max_listings ?? OWNER_PLAN.maxListings,
    periodEnd: sub?.current_period_end ?? null,
    trialAvailable,
  });
}
