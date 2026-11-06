import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import PropietarioDashboard from "./dashboard";
import type { InterestedRequest, ListingStat } from "./rendimiento-section";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Panel de Propietario",
  description: "Gestiona tus propiedades en Franky.",
  robots: { index: false, follow: false },
};

export default async function PropietarioPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "propietario" && profile?.role !== "admin") redirect("/");

  // is_paid entra en el select porque un piso solo se ve en Franky si está
  // activo Y pagado: sin ese dato el panel contaba como "activos" pisos que
  // ningún estudiante llegaba a ver.
  const { data: accommodations } = await supabase
    .from("accommodations")
    .select("id, title, type, price, city, rooms, bathrooms, rooms_available, status, created_at, images, is_paid")
    .eq("owner_id", user.id)
    // Los retirados (163) siguen siendo suyos y la política se los deja
    // leer, pero no pintan nada en el panel de gestión.
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Plazas del plan, para que el contador diga la verdad: TODO piso subido
  // ocupa una, esté publicado u oculto (migración 163).
  const { data: planRow } = await supabase
    .from("owner_subscriptions")
    .select("max_listings")
    .eq("owner_id", user.id)
    .in("status", ["active", "trialing"])
    .order("max_listings", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Métricas por piso (RPC limitada a los pisos de auth.uid()).
  const { data: statsData } = await supabase.rpc("get_owner_listing_stats");
  const stats = (statsData ?? []) as ListingStat[];

  // Solicitudes de interés: el owner puede leerlas por RLS; el nombre/avatar
  // del estudiante sale de la vista public_profiles.
  const accIds = (accommodations ?? []).map((a) => a.id);
  let requests: InterestedRequest[] = [];
  if (accIds.length > 0) {
    const { data: reqRows } = await supabase
      .from("accommodation_requests")
      .select("id, accommodation_id, user_id, status, message, created_at")
      .in("accommodation_id", accIds)
      .order("created_at", { ascending: false });

    const userIds = [...new Set((reqRows ?? []).map((r) => r.user_id))];
    const profileById = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("public_profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      (profs ?? []).forEach((p) =>
        profileById.set(p.id as string, {
          full_name: (p.full_name as string) ?? null,
          avatar_url: (p.avatar_url as string) ?? null,
        })
      );
    }

    requests = (reqRows ?? []).map((r) => ({
      id: r.id,
      accommodation_id: r.accommodation_id,
      user_id: r.user_id,
      status: r.status,
      message: r.message,
      created_at: r.created_at,
      student_name: profileById.get(r.user_id)?.full_name ?? null,
      student_avatar: profileById.get(r.user_id)?.avatar_url ?? null,
    }));
  }

  return (
    <PropietarioDashboard
      userName={profile?.full_name || "Propietario"}
      accommodations={accommodations || []}
      stats={stats}
      requests={requests}
      maxListings={planRow?.max_listings ?? null}
    />
  );
}
