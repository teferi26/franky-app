import type { Metadata } from "next";
import { createPublicSupabase } from "@/lib/supabase-server";
import BusinessPage, { type RealProfile } from "./business-page";

async function loadProfile(slug: string): Promise<RealProfile | null> {
  try {
    const { data, error } = await createPublicSupabase().rpc("get_pro_public_profile", { p_slug: slug });
    if (error || !data || typeof data !== "object") return null;
    return data as RealProfile;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  return {
    title: profile?.name ?? "Negocio en Franky",
    description: profile?.description || "Reserva, ofertas para estudiantes y ventajas de Franky Card.",
    robots: profile ? undefined : { index: false, follow: false },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ piso?: string | string[] }>;
}) {
  const { slug } = await params;
  // ?piso=<id> abre la ficha de un piso concreto (inmobiliarias y propietarios).
  const { piso } = await searchParams;
  const profile = await loadProfile(slug);
  return <BusinessPage slug={slug} real={profile} piso={typeof piso === "string" ? piso : undefined} />;
}
