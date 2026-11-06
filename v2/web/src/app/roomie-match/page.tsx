import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { isNonStudentRole, homeForRole } from "@/lib/roles";
import RoomieMatchClient from "./client";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "RoomieMatch: encuentra compañero de piso",
  description: "Encuentra tu compañero de piso ideal con nuestro sistema de afinidad de hábitos y preferencias. Compatible con tu estilo de vida y presupuesto.",
};

export default async function RoomieMatchPage() {
  // Un propietario alquila pisos: no busca compañero de piso. Si llega aquí
  // (enlace viejo o URL a mano) se le devuelve a lo suyo en vez de pedirle que
  // "complete su perfil de roomie" con presupuesto, ciudad, foto y bio.
  // Fail-soft: si la sesión no resuelve, la página se comporta como siempre.
  // El redirect va FUERA del try: `redirect()` funciona lanzando, y un catch
  // se lo tragaría.
  let salida: string | null = null;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const role = (profile?.role as string | null) ?? null;
      if (isNonStudentRole(role)) salida = homeForRole(role);
    }
  } catch {
    // sin sesión legible: se sigue como antes
  }
  if (salida) redirect(salida);

  return <RoomieMatchClient />;
}
