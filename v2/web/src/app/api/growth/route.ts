import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { growthMessage } from '../../../../../shared/growth';

export const dynamic = 'force-dynamic';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('redeem'), reward: z.enum(['profile_palette','planning_pack','university_report']), request: z.string().uuid() }),
  z.object({ action: z.literal('claim'), code: z.string().max(64).nullable().optional(), first: z.string().uuid().nullable().optional(), last: z.string().uuid().nullable().optional() }),
  z.object({ action: z.literal('apply'), mode: z.enum(['ugc','affiliate','both']), channels: z.string().trim().min(3).max(1000), proposal: z.string().trim().min(20).max(3000) }),
  z.object({ action: z.literal('content'), title: z.string().trim().min(3).max(140), url: z.string().url().startsWith('https://').max(2000), rights: z.string().trim().min(20).max(3000) }),
]);

function fail(message: string) {
  const known = ['growth_disabled','insufficient_points','reward_unavailable','referral_locked','invalid_referral','self_referral','forbidden','creator_not_approved','request_conflict','cash_disabled'];
  const code = known.includes(message) ? message : 'growth_unavailable';
  return NextResponse.json({ error: code, message: growthMessage(code) }, { status: code === 'growth_unavailable' ? 503 : 409 });
}
export async function GET(req: Request) {
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  const { data, error } = await client.rpc('growth_snapshot');
  if (error) return fail(error.message);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: 'growth-action', limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  const body = await validateBody(req, schema);
  if (body instanceof NextResponse) return body;
  const args = body.action === 'redeem' ? ['growth_redeem', { p_reward: body.reward, p_request: body.request }] as const
    : body.action === 'claim' ? ['growth_claim_referral', { p_code: body.code ?? null, p_first: body.first ?? null, p_last: body.last ?? null }] as const
    : body.action === 'apply' ? ['growth_creator_apply', { p_mode: body.mode, p_channels: body.channels, p_proposal: body.proposal }] as const
    : ['growth_content_submit', { p_title: body.title, p_url: body.url, p_rights: body.rights }] as const;
  const { data, error } = await client.rpc(args[0], args[1]);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true, result: data }, { headers: { 'Cache-Control': 'no-store' } });
}
