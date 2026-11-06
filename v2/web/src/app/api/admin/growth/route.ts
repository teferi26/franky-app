import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
async function clientFor(req: Request) {
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.rpc('is_admin');
  return !error && data === true ? client : null;
}
export async function GET(req: Request) {
  const client = await clientFor(req);
  if (!client) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await client.rpc('growth_admin_snapshot');
  return error ? NextResponse.json({ error: 'unavailable' }, { status: 503 }) : NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: 'admin-growth', limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const client = await clientFor(req);
  if (!client) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await validateBody(req, z.object({ action: z.enum(['settings','creator_review','content_review','referral_reject','referral_approve','budget_create','budget_increase','cost_record','tariff_create','commission_create','commission_status','organization_affiliate','organization_tariff']), id: z.string().uuid().nullable().optional(), data: z.record(z.string(), z.unknown()).default({}) }));
  if (body instanceof NextResponse) return body;
  const { data, error } = await client.rpc('growth_admin_action', { p_action: body.action, p_id: body.id ?? null, p_data: body.data });
  if (error) return NextResponse.json({ error: 'action_rejected', message: 'No se ha aplicado el cambio. Revisa los requisitos, el presupuesto y el estado actual.' }, { status: 409 });
  return NextResponse.json(data);
}
