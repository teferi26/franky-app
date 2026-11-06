import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Devuelve el último resultado vigente del usuario autenticado, o null si no
 * ha completado el test todavía.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ result: null }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("vocational_results")
    .select("id, created_at, scores, top_categories, big_five, mbti_type, holland_code, personality_narrative, strengths, work_style, top_careers, top_universities, top_cities, profile_snapshot, questions_answered, completion_seconds")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ result: data || null });
}
