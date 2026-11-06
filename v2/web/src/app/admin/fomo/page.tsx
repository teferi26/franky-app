import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import AdminFomoClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moderación FOMO",
  robots: { index: false, follow: false },
};

export default async function AdminFomoPage() {
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
  const isStaff = profile?.role === "admin" || profile?.role === "analyst";
  if (!isStaff) redirect("/");

  // Staff completo: el analista también modera FOMO (decisión 12-jun-2026;
  // la RPC admin_fomo_moderate acepta staff desde la migración 112).
  return <AdminFomoClient />;
}
