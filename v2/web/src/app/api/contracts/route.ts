import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabase } from "@/lib/supabase-server";
import { validateBody, uuid } from "@/lib/api-helpers";

// Respuestas del asistente: valores primitivos por clave (sin objetos anidados).
const answersSchema = z.record(
  z.string().max(4000),
  z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])
);

// GET /api/contracts → contratos del propietario (vía RLS).
export async function GET(req: Request) {
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("contracts")
    .select("id, title, status, accommodation_id, rent_cents, deposit_cents, locked_at, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const accIds = [...new Set((rows ?? []).map((r) => r.accommodation_id))];
  const titles = new Map<string, string>();
  if (accIds.length > 0) {
    const { data: accs } = await supabase
      .from("accommodations")
      .select("id, title")
      .in("id", accIds);
    for (const a of accs ?? []) titles.set(a.id as string, (a.title as string) ?? "");
  }

  const contracts = (rows ?? []).map((r) => ({
    ...r,
    accommodation_title: titles.get(r.accommodation_id) ?? "",
  }));
  return NextResponse.json({ contracts });
}

// POST /api/contracts → crea un borrador para un piso del propietario.
const createSchema = z.object({
  accommodation_id: uuid,
  title: z.string().max(200).optional(),
  answers: answersSchema.optional(),
});

export async function POST(req: Request) {
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, createSchema);
  if (body instanceof NextResponse) return body;

  // La policy contracts_insert_owner exige que el piso sea del usuario.
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      owner_id: user.id,
      accommodation_id: body.accommodation_id,
      title: body.title ?? null,
      answers: body.answers ?? {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: data.id });
}
