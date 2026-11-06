import { NextResponse } from 'next/server';
import { createRequestSupabase } from '@/lib/supabase-server';
import { buildGrowthDeliverable } from '@/lib/growth-deliverables';
import type { GrowthRewardKey } from '../../../../../../../shared/growth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  const { data: redemption, error } = await client.from('growth_redemptions').select('reward_key').eq('id',id).eq('user_id',user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!redemption) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data: profile } = await client.from('profiles').select('full_name').eq('id',user.id).single();
  let universities: Parameters<typeof buildGrowthDeliverable>[2] = [];
  if (redemption.reward_key === 'university_report') {
    const { data: favorites, error: favoritesError } = await client.from('favorites').select('target_id').eq('user_id',user.id).eq('target_type','university').limit(50);
    if (favoritesError) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    if (favorites?.length) {
      const { data, error: reportError } = await client.from('universities').select('name,city,type,website,updated_at').in('id',favorites.map(f=>f.target_id)).order('name');
      if (reportError) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
      universities = data ?? [];
    }
  }
  const output = buildGrowthDeliverable(redemption.reward_key as GrowthRewardKey, profile?.full_name ?? 'Mi campus', universities, new URL(req.url).searchParams.get('palette') ?? 'violet');
  if (new URL(req.url).searchParams.get('format') === 'json') return NextResponse.json(output, { headers: { 'Cache-Control': 'private, no-store' } });
  return new Response(output.html, { headers: { 'Content-Type':'text/html; charset=utf-8', 'Content-Disposition':`attachment; filename="${output.filename}"`, 'Cache-Control':'private, no-store', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox", 'X-Content-Type-Options':'nosniff' } });
}
