import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { homeForRole, isNonStudentRole } from "@/lib/roles";
import { crushAgeGate, type CrushAgeGate } from "@/lib/legal-age";
import CrushAgeGateScreen from "../AgeGate";
import CrushLiveClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crush Live",
  description:
    "Conoce a personas afines en los eventos oficiales de Franky. Los likes son privados.",
  robots: { index: false, follow: false },
};

export default async function CrushLivePage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId } = await searchParams;
  let salida: string | null = null;
  let ageGate: CrushAgeGate = "ok";
  let needsLogin = false;

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      needsLogin = true;
    } else {
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
    needsLogin = true;
  }

  if (needsLogin) {
    const nextPath = eventId
      ? `/crush/live?eventId=${encodeURIComponent(eventId)}`
      : "/crush/live";
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (salida) redirect(salida);
  if (ageGate !== "ok") return <CrushAgeGateScreen reason={ageGate} />;

  return <CrushLiveClient initialEventId={eventId ?? null} />;
}
