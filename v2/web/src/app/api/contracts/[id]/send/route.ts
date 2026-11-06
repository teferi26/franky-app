import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody, uuid } from "@/lib/api-helpers";
import { contentSha256 } from "@/lib/contracts/content";
import {
  rentCentsFromAnswers,
  depositCentsFromAnswers,
  type ContractAnswers,
  validateContractAnswers,
} from "@/lib/contracts/questions";

export const runtime = "nodejs";

// POST /api/contracts/[id]/send → congela y envía el contrato a los inquilinos.
const schema = z.object({ tenant_ids: z.array(uuid).min(1).max(10), expected_updated_at: z.string().datetime({ offset: true }).optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  const rl = await rateLimit(req, { key: "contract-send", limit: 10, windowMs: 600_000 });
  if (!rl.ok) return rl.response;
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;

  // Lee las respuestas actuales (RLS: solo el propietario lee su borrador).
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, owner_id, status, answers, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!contract) {
    return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  }
  if (contract.status !== "draft") {
    return NextResponse.json({ error: "El contrato ya fue enviado." }, { status: 409 });
  }
  if (body.expected_updated_at && body.expected_updated_at !== contract.updated_at) {
    return NextResponse.json({ error: "El contrato ha cambiado. Actualiza y revisa la nueva versión antes de enviarlo." }, { status: 409 });
  }

  const answers = (contract.answers ?? {}) as ContractAnswers;
  const validation = validateContractAnswers(answers);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const hash = contentSha256(answers);
  const rentCents = rentCentsFromAnswers(answers);
  const depositCents = depositCentsFromAnswers(answers);

  if (!Number.isSafeInteger(rentCents) || !Number.isSafeInteger(depositCents) || Math.max(rentCents, depositCents) > 2_147_483_647) {
    return NextResponse.json({ error: "Revisa los importes del contrato antes de enviarlo." }, { status: 400 });
  }
  const { data, error } = await createAdminSupabase().rpc("send_contract_verified", {
    p_actor: user.id,
    p_contract_id: id,
    p_expected_answers: contract.answers,
    p_expected_updated_at: contract.updated_at,
    p_tenant_ids: body.tenant_ids,
    p_content_sha256: hash,
    p_rent_cents: rentCents > 0 ? rentCents : null,
    p_deposit_cents: depositCents > 0 ? depositCents : null,
  });
  if (error) return NextResponse.json({ error: error.message === "contract_changed"
    ? "El contrato ha cambiado mientras lo enviabas. Revísalo y vuelve a enviarlo."
    : "No se pudo enviar el contrato. Comprueba que sigue en borrador y revisa los firmantes." }, { status: 409 });

  return NextResponse.json(data ?? { ok: true });
}
