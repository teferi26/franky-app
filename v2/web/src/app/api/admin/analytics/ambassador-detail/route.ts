import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseRange, requireStaff } from "@/lib/analytics-filters";
import { buildAnalyticsScope } from '@/lib/analytics-scope';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detalle de leads atribuidos: qué usuario entró por qué link y en qué fecha.
 * Lista los perfiles con utm_source (links de embajador, QRs, campañas) del
 * período, más recientes primero. Solo lectura para staff: la RLS de SELECT
 * de profiles para staff (migración 110) vuelve a validar en BD.
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;

  const { since, until } = parseRange(req.nextUrl.searchParams.get("range"));
  const supabase = await createRequestSupabase(req);

  let query = supabase
    .from("profiles")
    .select(
      "created_at, full_name, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, signup_landing_path"
    )
    .not("utm_source", "is", null)
    .not('is_discarded', 'is', true)
    .order("created_at", { ascending: false })
    .limit(301);
  if (since) query = query.gte("created_at", since);
  if (until) query = query.lt('created_at', until);

  const { data, error } = await query;
  if (error) {
    // El detalle se queda en el log del servidor: no exponemos errores de
    // Postgres (nombres de tablas, hints) al cliente.
    console.error("[analytics/ambassador-detail] query error:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  return NextResponse.json({ leads: (data ?? []).slice(0, 300), _scope: { ...buildAnalyticsScope('ambassador-detail', req.nextUrl.searchParams), limit: 300, truncated: (data?.length ?? 0) > 300 } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
