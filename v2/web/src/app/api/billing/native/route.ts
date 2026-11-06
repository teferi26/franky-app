import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRequestSupabase } from '@/lib/supabase-server';
import { getNativeBillingConfiguration, syncNativeEntitlements } from '@/lib/native-billing';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { data: usable, error: accountError } = await client.rpc('account_session_usable');
  if (accountError || usable !== true) return NextResponse.json({ error: 'Cuenta no disponible' }, { status: 403 });
  try { return NextResponse.json(await getNativeBillingConfiguration(user.id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ configured: false, salesEnabled: false, canRestore: false, products: [], entitlements: [] }, { headers: { 'Cache-Control': 'no-store' } }); }
}

/** A receipt or product identifier submitted by a client never grants access. */
export async function POST(req: NextRequest) {
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { data: usable, error: accountError } = await client.rpc('account_session_usable');
  if (accountError || usable !== true) return NextResponse.json({ error: 'Cuenta no disponible' }, { status: 403 });
  const limit = await rateLimit(req, { key: 'native-purchase-sync', limit: 6, windowMs: 60_000, subject: user.id });
  if (!limit.ok) return limit.response;
  try {
    await syncNativeEntitlements(user.id, `sync:${randomUUID()}`);
    return NextResponse.json(await getNativeBillingConfiguration(user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'La compra todavía no se ha podido verificar. Puedes volver a restaurar tus compras.' }, { status: 503 }); }
}
