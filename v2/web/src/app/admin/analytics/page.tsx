import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import AnalyticsClient from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics | Admin Franky",
  robots: { index: false, follow: false },
};

/**
 * Server entry — gates non-admin users.
 *
 * Middleware already ensures the user is authenticated; here we also enforce
 * role=admin (the same RPCs do this server-side too, defense in depth).
 */
export default async function AnalyticsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/analytics");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_discarded")
    .eq("id", user.id)
    .maybeSingle();

  // admin y analyst (solo lectura) pueden ver analytics; las RPCs vuelven a
  // validar staff en SQL (defensa en profundidad).
  const isStaff = profile?.role === "admin" || profile?.role === "analyst";
  if (!profile || !isStaff || profile.is_discarded) {
    redirect("/");
  }

  return <AnalyticsClient />;
}
