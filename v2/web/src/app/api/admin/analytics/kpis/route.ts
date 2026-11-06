import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseRange, requireRollingRange, requireStaff } from "@/lib/analytics-filters";
import { loadAdminMonetization } from '@/lib/admin-monetization';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;
  const rangeError = requireRollingRange(req.nextUrl.searchParams);
  if (rangeError) return rangeError;

  const { days } = parseRange(req.nextUrl.searchParams.get("range"));
  const supabase = await createRequestSupabase(req);
  const [summary, reports, monetization] = await Promise.all([
    supabase.rpc('admin_kpis_summary', { p_range_days: days }),
    supabase.from('user_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    loadAdminMonetization(supabase),
  ]);
  const { data, error } = summary;

  if (error) {
    console.error("[analytics/kpis] RPC error:", error);
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 });
  }
  if (!data || reports.error || reports.count === null || !monetization) return NextResponse.json({ error: 'incomplete_summary' }, { status: 503 });
  return NextResponse.json({ ...data, pending_reports: reports.count, mrr_estimate: monetization.mrr_normalized, arr_estimate: monetization.arr_estimate, _scope: buildAnalyticsScope('kpis', req.nextUrl.searchParams) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
