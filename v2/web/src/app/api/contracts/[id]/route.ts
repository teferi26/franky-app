import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabase } from "@/lib/supabase-server";
import { validateBody } from "@/lib/api-helpers";

const answersSchema = z.record(
  z.string().max(4000),
  z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])
);

// GET /api/contracts/[id] → contrato + firmantes (propietario o firmante, vía RLS).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, owner_id, accommodation_id, title, answers, status, rent_cents, deposit_cents, content_sha256, locked_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!contract) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

  const { data: signers } = await supabase
    .from("contract_signers")
    .select("id, user_id, role, sign_order, status, signed_at")
    .eq("contract_id", id)
    .order("sign_order", { ascending: true });

  const userIds = [...new Set((signers ?? []).map((s) => s.user_id))];
  const names = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) names.set(p.id as string, (p.full_name as string) ?? null);
  }

  const enrichedSigners = (signers ?? []).map((s) => ({
    ...s,
    full_name: names.get(s.user_id) ?? null,
  }));
  const mySigner = enrichedSigners.find((s) => s.user_id === user.id) ?? null;
  const accTitle = await supabase
    .from("accommodations")
    .select("title")
    .eq("id", contract.accommodation_id)
    .maybeSingle();

  return NextResponse.json({
    contract: { ...contract, accommodation_title: accTitle.data?.title ?? "" },
    signers: enrichedSigners,
    my_signer: mySigner,
    is_owner: contract.owner_id === user.id,
  });
}

// PATCH /api/contracts/[id] → edita título/respuestas (solo borrador, vía RLS).
const patchSchema = z.object({
  title: z.string().max(200).optional(),
  answers: answersSchema.optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, patchSchema);
  if (body instanceof NextResponse) return body;

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.answers !== undefined) update.answers = body.answers;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nada que actualizar" }, { status: 400 });
  }

  // contracts_update_owner solo permite si owner_id = uid Y locked_at IS NULL.
  const { data, error } = await supabase
    .from("contracts")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { error: "No se puede editar: el contrato ya fue enviado o no es tuyo." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/contracts/[id] → borra un borrador (solo status draft, vía RLS).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("contracts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { error: "Solo se pueden borrar borradores propios." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
