import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readLimitedBody } from '@/lib/read-limited-body';
import { constantTimeAuthorization, nativeBillingSettings, syncNativeEntitlements, verifyRevenueCatWebhook } from '@/lib/native-billing';

const eventSchema = z.object({ event: z.object({
  id: z.string().min(1).max(180), type: z.string().min(1).max(80), app_id: z.string(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']).optional(), app_user_id: z.string().optional(),
  transferred_from: z.array(z.string()).max(50).optional(), transferred_to: z.array(z.string()).max(50).optional(),
}) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_SIGNING_SECRET;
  const authorization = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
  if (!secret || !authorization) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!constantTimeAuthorization(req.headers.get('Authorization'), authorization)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let raw: string;
  try { raw = await readLimitedBody(req, 100_000); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!verifyRevenueCatWebhook(raw, req.headers.get('X-RevenueCat-Webhook-Signature'), secret)) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  let parsed: z.infer<typeof eventSchema>;
  try { parsed = eventSchema.parse(JSON.parse(raw)); } catch { return NextResponse.json({ error: 'invalid_event' }, { status: 400 }); }
  const event = parsed.event;
  if (!(process.env.REVENUECAT_APP_IDS ?? '').split(',').map(v => v.trim()).includes(event.app_id)) return NextResponse.json({ error: 'wrong_app' }, { status: 403 });
  if (event.type === 'TEST') return NextResponse.json({ received: true });
  try {
    const settings = await nativeBillingSettings();
    if (event.environment && event.environment !== settings.environment) return NextResponse.json({ received: true, ignored: 'different_environment' });
    // All purchases use an authenticated UUID. Never map anonymous IDs or
    // aliases to a guessed user. Canonical snapshots also verify original ID.
    const users = [...new Set(event.type === 'TRANSFER' ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])] : [event.app_user_id ?? ''])].filter(v => UUID.test(v));
    if (!users.length) return NextResponse.json({ error: 'unrecognized_owner' }, { status: 422 });
    for (const user of users) await syncNativeEntitlements(user, event.id);
    return NextResponse.json({ received: true });
  } catch {
    // Non-2xx is essential: RevenueCat retries transient DB/provider failures.
    console.error('[native-billing] verified webhook could not be persisted', event.id);
    return NextResponse.json({ error: 'synchronization_pending' }, { status: 503 });
  }
}
