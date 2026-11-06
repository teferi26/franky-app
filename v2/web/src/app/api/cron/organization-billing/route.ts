import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/origin-checkout';
import { reconcileOrganizationBillingBatch } from '@/lib/organization-billing';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
export async function GET(req: Request) {
  if (!secretMatches(req.headers.get('authorization'), process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  try {
    // The durable server cursor chooses real accounts. The URL cannot select another environment or cohort.
    const counts = await reconcileOrganizationBillingBatch();
    return NextResponse.json(counts, { status: counts.failed ? 503 : 200, headers });
  } catch { return NextResponse.json({ error: 'organization_billing_reconciliation_unavailable' }, { status: 503, headers }); }
}
