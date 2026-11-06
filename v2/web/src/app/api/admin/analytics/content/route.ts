import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/analytics-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;

  const supabase = await createRequestSupabase(req);
  const { data, error } = await supabase.rpc("admin_content_inventory");

  if (error) {
    console.error("[analytics/content] RPC error:", error);
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 });
  }
  if (data == null) return NextResponse.json({ error: 'incomplete_source' }, { status: 503 });
  return NextResponse.json({ ...data, _scope: buildAnalyticsScope('content', req.nextUrl.searchParams) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
