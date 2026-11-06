import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseFilters, parseRange, requireStaff } from "@/lib/analytics-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const filters = parseFilters(sp);
  const { days } = parseRange(sp.get("range"));
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "20", 10) || 20, 1), 50);

  const supabase = await createRequestSupabase(req);
  const [metrics, topUnis, topCareers, topCities] = await Promise.all([
    supabase.rpc("admin_engagement_metrics", { p_range_days: days }),
    supabase.rpc("admin_top_universities", { p_limit: limit, p_filters: filters }),
    supabase.rpc("admin_top_careers", { p_limit: limit, p_filters: filters }),
    supabase.rpc("admin_top_cities", { p_limit: limit, p_filters: filters }),
  ]);

  const error = metrics.error ?? topUnis.error ?? topCareers.error ?? topCities.error;
  if (error) {
    console.error("[analytics/engagement] RPC error:", error);
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 });
  }

  if ([metrics.data, topUnis.data, topCareers.data, topCities.data].some(value => value == null)) return NextResponse.json({ error: 'incomplete_source' }, { status: 503 });
  return NextResponse.json({
    _scope: buildAnalyticsScope('engagement', sp, Date.now(), filters),
    metrics: metrics.data,
    top_universities: topUnis.data,
    top_careers: topCareers.data,
    top_cities: topCities.data,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
