import { buildAnalyticsScope } from '@/lib/analytics-scope';
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/analytics-filters";
import { loadAdminMonetization } from '@/lib/admin-monetization';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;

  const supabase = await createRequestSupabase(req);
  const data = await loadAdminMonetization(supabase);
  if (!data) {
    return NextResponse.json({ error: 'incomplete_monetization' }, { status: 503 });
  }
  return NextResponse.json({ ...data, _scope: buildAnalyticsScope('monetization', req.nextUrl.searchParams) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
