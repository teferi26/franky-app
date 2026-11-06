import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import ResultDashboard from "./ResultDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis resultados | Test vocacional Franky",
  description: "Tus resultados del test vocacional: personalidad, carreras, universidades y ciudades.",
};

export default async function ResultadoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Ftest-vocacional%2Fresultado");
  }

  const { data } = await supabase
    .from("vocational_results")
    .select("id, created_at, scores, top_categories, big_five, mbti_type, holland_code, personality_narrative, strengths, work_style, top_careers, top_universities, top_cities, profile_snapshot, questions_answered, completion_seconds")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    redirect("/test-vocacional?empty=1");
  }

  return <ResultDashboard result={data} />;
}
