import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseRange, requireRollingRange, requireStaff } from "@/lib/analytics-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;
  const rangeError = requireRollingRange(req.nextUrl.searchParams);
  if (rangeError) return rangeError;

  const { days } = parseRange(req.nextUrl.searchParams.get("range"));
  const supabase = await createRequestSupabase(req);
  const { data, error } = await supabase.rpc("admin_growth_attribution", { p_range_days: days });

  if (error) {
    console.error("[analytics/growth] RPC error:", error);
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 });
  }
  if (data == null) return NextResponse.json({ error: 'incomplete_source' }, { status: 503 });
  return NextResponse.json({ ...data, _scope: buildAnalyticsScope('growth', req.nextUrl.searchParams) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
