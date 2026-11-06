import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { parseFilters, parseRange, requireStaff } from "@/lib/analytics-filters";
import { buildAnalyticsScope } from '@/lib/analytics-scope';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const filters = parseFilters(sp);
  const range = parseRange(sp.get("range"));
  const supabase = await createRequestSupabase(req);

  // Demographics aggregation
  const demoPromise = supabase.rpc("admin_users_demographics", { p_filters: filters });

  // The SQL end date is inclusive; date-only UI ranges have an exclusive until.
  const end = range.until ? new Date(Date.parse(range.until) - 1) : new Date();
  let start = range.since ? new Date(range.since) : new Date(end.getTime() - range.days * 86_400_000);
  if (!range.since) {
    const first = await supabase.from('profiles').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (first.error) return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    if (first.data?.created_at && Date.parse(first.data.created_at) > start.getTime()) start = new Date(Math.min(Date.parse(first.data.created_at), end.getTime()));
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const seriesPromise = supabase.rpc("admin_signups_daily", {
    p_start: fmt(start),
    p_end: fmt(end),
    p_filters: filters,
  });

  const [demoRes, seriesRes] = await Promise.all([demoPromise, seriesPromise]);

  if (demoRes.error || seriesRes.error) {
    const err = demoRes.error ?? seriesRes.error;
    console.error("[analytics/users] RPC error:", err);
    return NextResponse.json(
      {
        error: "rpc_failed",
        detail: err?.message,
        source: demoRes.error ? "demographics" : "signups_daily",
      },
      { status: 500 }
    );
  }

  if (demoRes.data == null || seriesRes.data == null) return NextResponse.json({ error: 'incomplete_source' }, { status: 503 });
  return NextResponse.json({
    demographics: demoRes.data,
    signups_daily: seriesRes.data,
    range_days: range.days,
    _scope: { ...buildAnalyticsScope('users', sp, Date.now(), filters), series_start: fmt(start), series_end_inclusive: fmt(end) },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
