import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import DashboardClient from "./client";
import { housingFirstInterestEnabled, housingDeferredBillingReady } from "@/lib/housing-billing-release";
import Stripe from "stripe";
import { completeHousingSetup } from "@/lib/housing-billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi negocio",
  description: "Gestiona tus zonas de ocio y pisos publicados en Franky.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; published?: string; owner?: string; housing_setup?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fnegocio%2Fdashboard");
  }
  // Recover a completed card setup even when its webhook is delayed. The URL
  // alone grants nothing: retrieve Stripe and verify this signed-in customer.
  if (housingDeferredBillingReady() && params.housing_setup && /^cs_[a-zA-Z0-9_]{1,240}$/.test(params.housing_setup)) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await stripe.checkout.sessions.retrieve(params.housing_setup);
      if (session.metadata?.supabase_user_id === user.id && session.status === "complete") {
        await completeHousingSetup(stripe, session);
      }
    } catch { console.error("[housing-billing] setup recovery pending"); }
  }

  const [{ data: leisure }, { data: housing }, { data: subs }, { data: ownerSub }, { data: profile }] = await Promise.all([
    supabase
      .from("leisure_spots")
      .select("id, name, city, category, image_url, is_paid")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("accommodations")
      .select("id, title, city, type, price, images, is_paid, status")
      .eq("owner_id", user.id)
      // Los retirados (163) siguen siendo suyos y la política se los deja
      // leer, pero no pintan nada en el panel de gestión.
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_subscriptions")
      .select("id, type, listing_id, status, current_period_end, stripe_subscription_id, billing_interval, amount_cents, cancel_at_period_end")
      .eq("owner_id", user.id),
    supabase
      .from("owner_subscriptions")
      .select("id, status, billing, max_listings, current_period_end")
      .eq("owner_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // El rol decide si se enseña el enlace al panel operativo: /propietario/**
    // rebota a "/" si el rol no es propietario o admin, y mandar a alguien a
    // una puerta cerrada es peor que no enseñarle la puerta.
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const canOwnerPanel = profile?.role === "propietario" || profile?.role === "admin";

  return (
    <DashboardClient
      deferredHousingEnabled={housingFirstInterestEnabled()}
      deferredHousingReady={housingDeferredBillingReady()}
      leisure={leisure || []}
      housing={housing || []}
      subscriptions={subs || []}
      ownerSub={ownerSub || null}
      success={params.success === "true"}
      published={params.published === "true"}
      ownerSuccess={params.owner === "success"}
      canOwnerPanel={canOwnerPanel}
    />
  );
}
