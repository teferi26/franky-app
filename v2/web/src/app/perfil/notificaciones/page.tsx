import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { parsePushPrefs } from "@/lib/push-prefs";
import NotificacionesPrefsClient from "./client";

// ─── Ajustes de notificaciones ───────────────────────────────────────────
// Paridad con la app móvil (mobile/app/ajustes-notificaciones.tsx). Las
// preferencias se leen en el servidor para que la página salga ya con los
// interruptores en su sitio, sin parpadeo; el cliente solo guarda cambios.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajustes de notificaciones",
  description: "Elige qué avisos quieres recibir de Franky y en qué horas no molestar.",
  robots: { index: false, follow: false },
};

export default async function NotificacionesPrefsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/perfil/notificaciones");

  // Consulta aparte y fail-soft: si la columna push_prefs no existiera en
  // este entorno (migración 125 sin aplicar), se parte de "todo activo" en
  // vez de romper la página.
  let initial = {};
  const { data, error } = await supabase
    .from("profiles")
    .select("push_prefs")
    .eq("id", user.id)
    .maybeSingle();
  if (!error && data) initial = parsePushPrefs(data.push_prefs);

  return <NotificacionesPrefsClient userId={user.id} initial={initial} />;
}
