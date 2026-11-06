import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { normalizeReferralCode } from '../../../../../../shared/growth';
import { rateLimit } from '@/lib/rate-limit';
export async function GET(req: Request) {
  const rl = await rateLimit(req, { key: 'growth-touch', limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const code = normalizeReferralCode(new URL(req.url).searchParams.get('code'));
  if (!code) return NextResponse.json({ touch: null }, { status: 400 });
  const { data, error } = await createAdminSupabase().rpc('growth_record_touch', { p_code: code });
  return NextResponse.json({ touch: error ? null : data }, { status: error ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
