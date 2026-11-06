import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseFilters, requireStaff } from "@/lib/analytics-filters";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;
  const supabase = await createRequestSupabase(req);
  const filters = parseFilters(req.nextUrl.searchParams);
  const { data, error } = await supabase.rpc("admin_product_insights", { p_filters: filters });
  if (error) return NextResponse.json({ error: "No se pudieron cargar las métricas. Comprueba tu sesión de administrador y segundo factor." }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'incomplete_product' }, { status: 503 });
  return NextResponse.json({ ...data, _scope: buildAnalyticsScope('product', req.nextUrl.searchParams, Date.now(), filters) }, { headers: { "Cache-Control": "private, no-store" } });
}
