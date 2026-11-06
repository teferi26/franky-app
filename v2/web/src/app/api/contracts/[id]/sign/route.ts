import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { validateBody, uuid } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { SIGNATURE_CONSENT } from "@/lib/contracts/questions";

export const runtime = "nodejs";

// El cliente confirma el consentimiento; IP y user-agent los captura el servidor
// (no son falsificables por el cliente) y se guardan como prueba de la firma.
const schema = z.object({ accept: z.literal(true) });

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

  const rl = await rateLimit(req, { key: "contract-sign", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");

  const { data, error } = await createAdminSupabase().rpc("sign_contract_verified", {
    p_actor: user.id,
    p_contract_id: id,
    p_ip: ip,
    p_user_agent: userAgent,
    p_consent_text: SIGNATURE_CONSENT,
    p_audit: { signed_via: "web", at: new Date().toISOString() },
  });
  if (error) return NextResponse.json({ error: "No se puede firmar este contrato. Comprueba que sigues siendo firmante y que no se ha cancelado." }, { status: 409 });

  return NextResponse.json(data ?? { ok: true });
}
