import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import TenantsClient from "./tenants-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inquilinos · Panel de Propietario",
  description: "Marca qué estudiantes viven en cada piso.",
  robots: { index: false, follow: false },
};

export default async function TenantsPage() {
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

  const { data: accommodations } = await supabase
    .from("accommodations")
    .select("id, title, city, images")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return <TenantsClient accommodations={accommodations ?? []} />;
}
