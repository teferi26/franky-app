import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import BloqueadosClient from "./client";

// ─── Cuentas bloqueadas ──────────────────────────────────────────────────
// Paridad con la app móvil (mobile/app/bloqueados.tsx). La sesión se
// comprueba en el servidor para que un anónimo vaya directo al login en vez
// de ver un spinner y un salto; la lista en sí la carga el cliente, que es
// quien puede desbloquear sin recargar la página.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cuentas bloqueadas",
  description: "Personas a las que has bloqueado en Franky y cómo desbloquearlas.",
  robots: { index: false, follow: false },
};

export default async function BloqueadosPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/perfil/bloqueados");

  return <BloqueadosClient userId={user.id} />;
}
