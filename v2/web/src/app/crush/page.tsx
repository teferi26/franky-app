import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { isNonStudentRole, homeForRole } from "@/lib/roles";
import { crushAgeGate, type CrushAgeGate } from "@/lib/legal-age";
import LigarClient from "./client";
import CrushAgeGateScreen from "./AgeGate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crush",
  description: "Intercambia Instagram con gente de tu universidad. Solo mayores de 18.",
  robots: { index: false, follow: false },
};

export default async function LigarPage() {
  // Crush es para estudiantes del campus. A un propietario no se le ofrece:
  // se le devuelve a su panel. El redirect va FUERA del try porque
  // `redirect()` funciona lanzando y el catch se lo tragaría.
  let salida: string | null = null;
  let ageGate: CrushAgeGate = "ok";
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, birth_date")
        .eq("id", user.id)
        .maybeSingle();
      const role = (profile?.role as string | null) ?? null;
      if (isNonStudentRole(role)) salida = homeForRole(role);
      // Puerta de 18 años: sin fecha de nacimiento o con menos de 18, no se
      // entra (la base de datos lo repite en public.is_adult()).
      else ageGate = crushAgeGate((profile?.birth_date as string | null) ?? null);
    }
  } catch {
    // sin sesión legible: se sigue como antes
  }
  if (salida) redirect(salida);
  if (ageGate !== "ok") return <CrushAgeGateScreen reason={ageGate} />;

  return <LigarClient />;
}
