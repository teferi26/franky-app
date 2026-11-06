import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { getServerEnv } from '@/lib/env';
import { closeMarketplacePayment } from '@/lib/marketplace-checkout';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const secret = getServerEnv().NOTIFY_EMAIL_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const supplied = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminSupabase();
  const { data, error } = await admin.from('payment_checkout_state').select('payment_id,expires_at')
    .in('state', ['legacy', 'prepared', 'creating', 'open', 'closing'])
    .lt('expires_at', new Date().toISOString()).order('updated_at').limit(12);
  if (error) return NextResponse.json({ error: 'queue_unavailable' }, { status: 503 });
  let resolved = 0;
  const started = Date.now();
  for (const row of data ?? []) {
    if (Date.now() - started > 25_000) break;
    try { await closeMarketplacePayment(row.payment_id); resolved++; }
    catch {
      // Rotate failed items instead of starving later rows. No automatic refund.
      const tooOld = Date.now() - Date.parse(row.expires_at) > 22 * 60 * 60_000;
      await admin.from('payment_checkout_state').update({ updated_at: new Date().toISOString(),
        ...(tooOld ? { state: 'review', issue: 'remote_checkout_unconfirmed' } : {}) })
        .eq('payment_id', row.payment_id).in('state', ['legacy', 'prepared', 'creating', 'open', 'closing']);
    }
  }
  return NextResponse.json({ checked: data?.length ?? 0, resolved });
}
