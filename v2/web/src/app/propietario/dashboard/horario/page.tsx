import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import HorarioClient from "./horario-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Horario de visitas · Panel de Propietario",
  description: "Define tu horario semanal de visitas y previsualiza los huecos.",
  robots: { index: false, follow: false },
};

export default async function HorarioPage() {
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
    .select("id, title, city")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return <HorarioClient accommodations={accommodations ?? []} />;
}
