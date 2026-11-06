import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/origin-checkout';
import { processModerationAuth } from '@/lib/moderation-auth';

export const maxDuration = 30;
export async function GET(req: Request) {
  if (!secretMatches(req.headers.get('authorization'), process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try { return NextResponse.json(await processModerationAuth()); }
  catch { return NextResponse.json({ error: 'moderation_auth_retry_required' }, { status: 503 }); }
}
