import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseRange, requireRollingRange, requireStaff } from "@/lib/analytics-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leads captados por embajador (Tafa vs Pau) vía UTM. Solo lectura: el RPC
 * vuelve a validar staff dentro (defensa en profundidad).
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;
  const rangeError = requireRollingRange(req.nextUrl.searchParams);
  if (rangeError) return rangeError;

  const { days } = parseRange(req.nextUrl.searchParams.get("range"));
  const supabase = await createRequestSupabase(req);
  const { data, error } = await supabase.rpc("admin_ambassador_leads", { p_range_days: days });

  if (error) {
    // El detalle se queda en el log del servidor: no exponemos errores de
    // Postgres (nombres de tablas, hints) al cliente.
    console.error("[analytics/ambassadors] RPC error:", error);
    return NextResponse.json({ error: "rpc_failed" }, { status: 500 });
  }
  if (data == null) return NextResponse.json({ error: 'incomplete_source' }, { status: 503 });
  return NextResponse.json({ ...data, _scope: buildAnalyticsScope('ambassadors', req.nextUrl.searchParams) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
