import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createRequestSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import {
  ContractPdf,
  type ContractSignerView,
} from "@/lib/contracts/pdf-document";
import type { ContractAnswers } from "@/lib/contracts/questions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/contracts/[id]/pdf → renderiza el contrato (propietario o firmante).
// El borrador muestra una marca de agua; el firmado incluye la página de firmas.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autenticado", { status: 401 });

  // Cada GET renderiza un PDF entero (CPU, maxDuration 30). Sin límite, un
  // firmante legítimo en bucle basta para quemar las horas de ejecución del
  // plan. Por usuario, no por IP: en el campus se comparte NAT.
  const rl = await rateLimit(req, {
    key: "contracts-pdf",
    subject: user.id,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) return rl.response;

  // RLS deja leer al propietario y a los firmantes.
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, accommodation_id, title, answers, status, content_sha256, locked_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!contract) return new Response("Contrato no encontrado", { status: 404 });

  const { data: acc } = await supabase
    .from("accommodations")
    .select("title")
    .eq("id", contract.accommodation_id)
    .maybeSingle();

  const { data: signerRows } = await supabase
    .from("contract_signers")
    .select("user_id, role, status, signed_at")
    .eq("contract_id", id)
    .order("sign_order", { ascending: true });

  // IPs solo desde el registro de firmas (visible para propietario/firmante).
  const { data: sigRows } = await supabase
    .from("contract_signatures")
    .select("user_id, ip")
    .eq("contract_id", id);
  const ipByUser = new Map<string, string | null>();
  for (const s of sigRows ?? []) ipByUser.set(s.user_id as string, (s.ip as string) ?? null);

  const userIds = [...new Set((signerRows ?? []).map((s) => s.user_id))];
  const names = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) names.set(p.id as string, (p.full_name as string) ?? null);
  }

  const signers: ContractSignerView[] = (signerRows ?? []).map((s) => ({
    full_name: names.get(s.user_id) ?? null,
    role: s.role as "owner" | "tenant",
    status: s.status as "pending" | "signed",
    signed_at: s.signed_at as string | null,
    ip: ipByUser.get(s.user_id) ?? null,
  }));

  const buffer = await renderToBuffer(
    <ContractPdf
      contract={{
        id: contract.id,
        title: contract.title,
        status: contract.status,
        created_at: contract.created_at,
        locked_at: contract.locked_at,
        content_sha256: contract.content_sha256,
      }}
      answers={(contract.answers ?? {}) as ContractAnswers}
      accommodationTitle={acc?.title ?? ""}
      signers={signers}
    />
  );

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contrato-${contract.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
