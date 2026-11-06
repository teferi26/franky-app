import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { parseStudyBlob } from "@/lib/agenda-types";
import AgendaClient from "./client";

/**
 * Agenda del estudiante: horario, exámenes y entregas.
 *
 * Es la misma agenda que la pestaña "Estudio" de la app móvil. Los datos
 * viven en study_data (migración 170), una fila por usuario con todo en JSON:
 * la app la escribe cada vez que cambia algo y aquí se lee y se vuelve a
 * escribir el JSON completo (última escritura gana, como acordó la 170).
 *
 * Solo con sesión: es información personal y no hay versión pública.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi agenda",
  description: "Tu horario de clases, tus exámenes con cuenta atrás y tus entregas, sincronizados con la app.",
  robots: { index: false, follow: false },
};

export default async function AgendaPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agenda");

  // Fail-soft en las dos lecturas: si la migración 170 no estuviera aplicada
  // (tabla o columnas ausentes) la página se pinta vacía y avisa, no revienta.
  let hasRow = false;
  let initialBlob = parseStudyBlob(null);
  let storageReady = true;
  try {
    const { data, error } = await supabase
      .from("study_data")
      .select("data, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) storageReady = false;
    else if (data) {
      hasRow = true;
      initialBlob = parseStudyBlob(data.data);
    }
  } catch {
    storageReady = false;
  }

  let streak: { count: number; best: number } | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("streak_count, streak_best")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      streak = {
        count: Number(data.streak_count ?? 0),
        best: Number(data.streak_best ?? 0),
      };
    }
  } catch {
    // sin columnas de racha: se enseña sin ella
  }

  return (
    <AgendaClient
      userId={user.id}
      initialBlob={initialBlob}
      hasRow={hasRow}
      storageReady={storageReady}
      initialStreak={streak}
    />
  );
}
