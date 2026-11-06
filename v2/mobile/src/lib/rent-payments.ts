import * as WebBrowser from 'expo-web-browser';
import { captureSessionIdentity, type SessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { parsePaymentReply } from './payment-contract';
import { readPaymentReturn, type PaymentReturnState } from './payment-return';
import { supabase, WEB_URL, fetchConTimeout } from './supabase';

export type RentPayment = { id: string; status: string; amount_cents: number; refunded_cents: number; created_at: string; metadata: { kind?: 'rent' | 'deposit' | 'both' } };
export type RentPaymentResult = { status: Exclude<PaymentReturnState, 'unavailable'>; orderId?: string; message?: string };
const inFlight = new Map<string, Promise<RentPaymentResult>>();

/** One operation per owned contract, including taps on different payment kinds. */
export function payContractRent(contractId: string, kind: 'rent' | 'deposit' | 'both', owner: SessionIdentity | null = captureSessionIdentity()): Promise<RentPaymentResult> {
  if (!owner) return Promise.reject(new Error('session_required'));
  const key = `${owner.userId}:${owner.generation}:${contractId}`;
  const running = inFlight.get(key); if (running) return running;
  const task = withOwnedRequest<RentPaymentResult>(owner, async request => {
    let orderId: string | undefined;
    try {
      const response = await fetchConTimeout(WEB_URL + '/api/stripe/pay/rent', {
        method: 'POST', signal: request.signal, headers: { Authorization: request.authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, kind, return_to: 'app' }),
      }, 30000);
      request.check(); const raw = await response.json(); request.check(); const reply = parsePaymentReply(raw); orderId = reply.order_id;
      if (!response.ok) return { status: response.status >= 500 || reply.status === 'pending' ? 'pending' as const : 'failed' as const, orderId, message: reply.error ?? 'No se pudo iniciar el pago. Revisa el contrato.' };
      if (reply.invalid_url) return { status: 'failed' as const, orderId, message: 'No se pudo verificar el enlace de pago.' };
      if (reply.status === 'checkout') {
        if (!reply.url) return { status: 'pending' as const, orderId };
        request.check(); await WebBrowser.openBrowserAsync(reply.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }); request.check();
      }
      if (orderId) {
        const evidence = await readPaymentReturn(orderId, owner); request.check();
        return { status: evidence.status === 'unavailable' ? 'pending' as const : evidence.status, orderId };
      }
      // Neither the browser return nor a paid response without an owned ledger
      // lookup proves a transfer. The contract history can recover it later.
      return { status: 'pending' as const, orderId };
    } catch {
      request.check(); return { status: 'pending' as const, orderId };
    }
  }).finally(() => { if (inFlight.get(key) === task) inFlight.delete(key); });
  inFlight.set(key, task); return task;
}

export async function getContractPayments(contractId: string, owner: SessionIdentity | null): Promise<RentPayment[]> {
  return withOwnedRequest(owner, async request => {
    const { data, error } = await request.query(supabase.from('payments')
      .select('id,status,amount_cents,refunded_cents,created_at,metadata').eq('type', 'rent').eq('buyer_id', request.owner.userId)
      .eq('metadata->>contract_id', contractId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30));
    request.check(); if (error) throw error; return (data ?? []) as RentPayment[];
  });
}
