import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { validateBody } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { housingDeferredBillingReady, housingFirstInterestEnabled } from '@/lib/housing-billing-release';
export async function GET(req: NextRequest) {
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!housingDeferredBillingReady()) return NextResponse.json({ offers: [], enabled: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  const { data, error } = await supabase.from("housing_billing_enrollments")
    .select("id,listing_id,billing,state,amount_cents,terms_text,ready_at,first_interest_at,payment_url")
    .eq("owner_id", user.id).neq("state", "canceled").limit(50);
  if (error) return NextResponse.json({ error: "No se pudo consultar la oferta" }, { status: 503 });
  return NextResponse.json({ offers: data, enabled: housingFirstInterestEnabled() }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: NextRequest) {
  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!housingDeferredBillingReady()) return NextResponse.json({ error: 'Esta oferta no está disponible.' }, { status: 409 });
  const limited = await rateLimit(req, { key: "housing-offer-cancel", subject: user.id, limit: 10, windowMs: 60_000 });
  if (!limited.ok) return limited.response;
  const body = await validateBody(req, z.object({ id: z.string().uuid() }).strict());
  if (body instanceof NextResponse) return body;
  const { data, error } = await createAdminSupabase().rpc("cancel_housing_enrollment", { p_id: body.id, p_owner: user.id });
  if (error) return NextResponse.json({ error: "No se pudo cancelar. Inténtalo de nuevo." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "La activación ya ha comenzado. Gestiona la suscripción desde Facturación." }, { status: 409 });
  return NextResponse.json({ canceled: true });
}
