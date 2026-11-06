import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import VisitasClient from "./visitas-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visitas · Panel de Propietario",
  description: "Publica huecos de visita y gestiona las reservas de tus pisos.",
  robots: { index: false, follow: false },
};

export default async function VisitasPage() {
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

  return <VisitasClient accommodations={accommodations ?? []} />;
}
