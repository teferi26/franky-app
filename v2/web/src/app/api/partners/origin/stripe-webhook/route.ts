import { NextRequest, NextResponse } from 'next/server';
import { getOriginStripe, ORIGIN_MERCHANT_ACCOUNT } from '@/lib/origin-stripe';
import { handleOriginWebhook } from '@/lib/origin-checkout';

export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const secret = process.env.ORIGIN_STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!secret) return NextResponse.json({error:'Webhook not configured'}, {status:503});
  if (!signature) return NextResponse.json({error:'Invalid signature'}, {status:400});
  const body = await req.text();
  if (Buffer.byteLength(body) > 1024 * 1024) return NextResponse.json({error:'Payload too large'}, {status:413});
  let event;
  try { event = getOriginStripe().webhooks.constructEvent(body, signature, secret); }
  catch { return NextResponse.json({error:'Invalid signature'}, {status:400}); }
  try {
    await handleOriginWebhook(event, ORIGIN_MERCHANT_ACCOUNT);
    return NextResponse.json({received:true});
  } catch {
    // Stripe retries; do not expose buyer data, keys or raw events in logs.
    console.error('[origin-webhook] Verification or settlement failed', event.id);
    return NextResponse.json({error:'Payment verification failed'}, {status:500});
  }
}
