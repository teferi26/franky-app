import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase-server";
import { validateBody } from "@/lib/api-helpers";
import { normalizeVocationalBigFive } from '@/lib/vocational-big-five';

/**
 * Persiste el resultado completo de un test vocacional para el usuario logueado.
 *
 * El body se valida con zod (vocationalSaveSchema). Sin esto, un atacante con
 * sesión podía insertar JSON arbitrario en columnas jsonb del DB.
 */

// RIASEC scores — six categories, integers 0..40 (max questions). We accept
// reasonable bounds so we don't break legit results but reject obvious junk.
const riasecScoresSchema = z.object({
  R: z.number().int().min(0).max(100).optional(),
  I: z.number().int().min(0).max(100).optional(),
  A: z.number().int().min(0).max(100).optional(),
  S: z.number().int().min(0).max(100).optional(),
  E: z.number().int().min(0).max(100).optional(),
  C: z.number().int().min(0).max(100).optional(),
}).strict();

const legacyBigFiveSchema = z.object({
  openness: z.number().min(0).max(100).optional(),
  conscientiousness: z.number().min(0).max(100).optional(),
  extraversion: z.number().min(0).max(100).optional(),
  agreeableness: z.number().min(0).max(100).optional(),
  neuroticism: z.number().min(0).max(100).optional(),
}).strict();

const bigFiveSchema = z.union([z.object({
  O: z.number().min(0).max(100).optional(),
  C: z.number().min(0).max(100).optional(),
  E: z.number().min(0).max(100).optional(),
  A: z.number().min(0).max(100).optional(),
  N: z.number().min(0).max(100).optional(),
}).strict(), legacyBigFiveSchema]).transform(normalizeVocationalBigFive);

const careerMatchSchema = z.object({
  career_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  branch: z.string().max(200).optional(),
  score: z.number().min(0).max(100),
  justification: z.string().max(2000).optional(),
  university_name: z.string().max(200).optional(),
  university_short: z.string().max(50).optional(),
  university_id: z.string().uuid().optional(),
  university_type: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  comunidad: z.string().max(100).optional(),
  cut_off: z.number().nullable().optional(),
  cut_off_year: z.number().int().min(1990).max(2100).nullable().optional(),
  campus: z.string().max(200).nullable().optional(),
  modality: z.string().max(80).nullable().optional(),
  location_region: z.string().max(60).nullable().optional(),
  duration_years: z.number().min(0.5).max(10).multipleOf(0.1).nullable().optional(),
  employment_rate: z.number().min(0).max(100).nullable().optional(),
  is_aspirational: z.boolean().optional(),
}).passthrough();

const universityMatchSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().max(200),
  short_name: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  score: z.number().min(0).max(100).optional(),
  campus: z.string().max(200).nullable().optional(),
  modality: z.string().max(80).nullable().optional(),
  location_region: z.string().max(60).nullable().optional(),
  cut_off_year: z.number().int().min(1990).max(2100).nullable().optional(),
}).passthrough();

const cityMatchSchema = z.object({
  name: z.string().max(100),
  score: z.number().min(0).max(100).optional(),
  comunidad: z.string().max(100).optional(),
}).passthrough();

const vocationalSaveSchema = z.object({
  expectedUserId: z.string().uuid().optional(),
  attemptId: z.string().uuid().optional(),
  profile: z.record(z.string(), z.unknown()).refine(
    (p) => p.riasec === undefined || typeof p.riasec === "object",
    "profile.riasec must be an object"
  ),
  bigFive: bigFiveSchema.optional(),
  mbtiType: z.string().max(8).nullable().optional(),
  hollandCode: z.string().max(8).nullable().optional(),
  personalityNarrative: z.string().max(10_000).nullable().optional(),
  workStyle: z.string().max(2_000).nullable().optional(),
  strengths: z.array(z.string().max(100)).max(12).optional(),
  topCareers: z.array(careerMatchSchema).max(30).optional(),
  topUniversities: z.array(universityMatchSchema).max(30).optional(),
  topCities: z.array(cityMatchSchema).max(30).optional(),
  answeredIds: z.array(z.string().max(50)).max(500).optional(),
  completionSeconds: z.number().int().min(0).max(36_000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = await validateBody(req, vocationalSaveSchema, { maxBytes: 200_000 });
  if (parsed instanceof NextResponse) return parsed;
  if (parsed.expectedUserId && parsed.expectedUserId !== user.id) {
    return NextResponse.json({ error: "La sesión ha cambiado. Vuelve a abrir tu test." }, { status: 409 });
  }

  const profile = parsed.profile;
  const riasecScores = riasecScoresSchema.safeParse(profile.riasec ?? {}).data ?? {};
  const topCategories = Object.entries(riasecScores)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, 3)
    .map(([k]) => k);

  const { data, error } = await supabase
    .from("vocational_results")
    .insert({
      ...(parsed.attemptId ? { id: parsed.attemptId } : {}),
      user_id: user.id,
      scores: riasecScores,
      top_categories: topCategories,
      answers: { answered_ids: parsed.answeredIds ?? [], profile },
      big_five: parsed.bigFive ?? {},
      mbti_type: parsed.mbtiType ?? null,
      holland_code: parsed.hollandCode ?? null,
      personality_narrative: parsed.personalityNarrative ?? null,
      strengths: parsed.strengths ?? [],
      work_style: parsed.workStyle ?? null,
      top_careers: parsed.topCareers ?? [],
      top_universities: parsed.topUniversities ?? [],
      top_cities: parsed.topCities ?? [],
      profile_snapshot: profile,
      completion_seconds: parsed.completionSeconds ?? null,
      questions_answered: (parsed.answeredIds ?? []).length,
    })
    .select("id")
    .single();

  if (error || !data) {
    // A lost response can be retried without creating a second result. RLS and
    // the explicit owner filter prevent recovering somebody else's attempt.
    if (error?.code === "23505" && parsed.attemptId) {
      const { data: existing } = await supabase.from("vocational_results")
        .select("id").eq("id", parsed.attemptId).eq("user_id", user.id).maybeSingle();
      if (existing) return NextResponse.json({ resultId: existing.id });
    }
    console.error("save vocational result failed", { code: error?.code });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }

  return NextResponse.json({ resultId: data.id });
}
