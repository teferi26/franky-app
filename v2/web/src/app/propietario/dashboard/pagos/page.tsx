import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import PagosClient from "./pagos-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cobros · Panel de Propietario",
  description: "Conecta tu cuenta para recibir cobros desde Franky.",
  robots: { index: false, follow: false },
};

export default async function PagosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "propietario" && profile?.role !== "admin") redirect("/");

  const { data: account } = await supabase
    .from("connect_accounts")
    .select(
      "charges_enabled, payouts_enabled, details_submitted, onboarding_status"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return <PagosClient account={account ?? null} />;
}
