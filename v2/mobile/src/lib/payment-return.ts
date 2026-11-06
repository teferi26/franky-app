import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { supabase } from './supabase';

export const PAYMENT_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PaymentReturnState = 'paid' | 'pending' | 'cancelled' | 'failed' | 'unavailable';

/** The link is only a lookup hint. The owned ledger is the source of truth. */
export async function readPaymentReturn(orderId: string, owner = captureSessionIdentity()): Promise<{ status: PaymentReturnState; type?: string }> {
  if (!owner || !PAYMENT_ORDER_ID.test(orderId)) return { status: 'unavailable' };
  return withOwnedRequest(owner, async request => {
    const { data, error } = await request.query(supabase.from('payments')
      .select('status,type').eq('id', orderId).eq('buyer_id', owner.userId)).maybeSingle();
    request.check();
    if (error || !data) return { status: 'unavailable' };
    const status: PaymentReturnState = data.status === 'succeeded' || data.status === 'partially_refunded' ? 'paid'
      : data.status === 'cancelled' || data.status === 'canceled' || data.status === 'refunded' ? 'cancelled'
      : data.status === 'failed' ? 'failed' : 'pending';
    return { status, type: data.type };
  });
}
