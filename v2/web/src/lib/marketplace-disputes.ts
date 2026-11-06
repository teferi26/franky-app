import type Stripe from 'stripe';

/**
 * Disputas (contracargos) de pagos con destino a un organizador (Stripe Connect,
 * destination charges): entradas, visitas y alquiler del marketplace, y
 * pedidos Origin con routing 2.
 *
 * En un destination charge el banco retira el dinero de la cuenta de la
 * PLATAFORMA, no del organizador. Si no hacemos nada, Franky paga el
 * contracargo entero mientras el organizador conserva su parte. Por eso, cuando
 * el dinero sale (disputa abierta o perdida), intentamos revertir la
 * transferencia al organizador. Si la disputa se gana, Stripe devuelve el
 * dinero a Franky y la reversión queda anotada para devolvérsela a mano (no se
 * automatiza: mover dinero a un tercero merece una persona delante).
 *
 * Todo lo que se escribe pasa por la RPC record_payment_dispute (migración
 * 20260924200000), que deja el pago en la revisión del panel y avisa al equipo.
 */

type RpcDb = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

export const stripeObjectId = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id ?? null;

/** Estados en los que el banco ya ha retirado (o retirará) el dinero. Los
 * "warning_*" son consultas previas sin retirada de fondos: no se revierte. */
const FUNDS_WITHDRAWN = new Set(['needs_response', 'under_review', 'lost']);

export type ReversalResult = {
  transferId: string | null;
  reversalId: string | null;
  status: 'none' | 'not_applicable' | 'reversed' | 'failed';
  reversedCents: number;
};

export function disputeReversalKey(disputeId: string) {
  return `dispute-reversal:${disputeId}`;
}

/**
 * Revierte (una sola vez por disputa) la parte del organizador. Nunca lanza por
 * un rechazo de Stripe (saldo insuficiente del organizador, transferencia ya
 * revertida por una devolución...): devuelve 'failed' y la RPC avisa al equipo.
 */
export async function reverseOrganizerTransfer(
  stripe: Stripe,
  charge: Stripe.Charge,
  dispute: Stripe.Dispute,
): Promise<ReversalResult> {
  const transferId = stripeObjectId(charge.transfer as string | { id: string } | null);
  if (!transferId) return { transferId: null, reversalId: null, status: 'not_applicable', reversedCents: 0 };
  if (!FUNDS_WITHDRAWN.has(dispute.status)) return { transferId, reversalId: null, status: 'none', reversedCents: 0 };
  try {
    // Las claves de idempotencia de Stripe caducan a las 24 h: antes de crear,
    // buscamos una reversión ya hecha para esta disputa.
    for await (const existing of stripe.transfers.listReversals(transferId, { limit: 100 })) {
      if (existing.metadata?.dispute_id === dispute.id) {
        return { transferId, reversalId: existing.id, status: 'reversed', reversedCents: existing.amount };
      }
    }
    const transfer = await stripe.transfers.retrieve(transferId);
    const remaining = transfer.amount - transfer.amount_reversed;
    if (remaining <= 0) return { transferId, reversalId: null, status: 'not_applicable', reversedCents: 0 };
    // Parte del organizador proporcional al importe disputado.
    const share = charge.amount > 0 ? Math.round((dispute.amount * transfer.amount) / charge.amount) : remaining;
    const amount = Math.min(remaining, Math.max(0, share));
    if (amount <= 0) return { transferId, reversalId: null, status: 'not_applicable', reversedCents: 0 };
    const reversal = await stripe.transfers.createReversal(
      transferId,
      { amount, metadata: { dispute_id: dispute.id, reason: 'dispute' } },
      { idempotencyKey: disputeReversalKey(dispute.id) },
    );
    return { transferId, reversalId: reversal.id, status: 'reversed', reversedCents: reversal.amount };
  } catch (error) {
    console.error('[payments] no se pudo revertir la transferencia de la disputa', { disputeId: dispute.id, error: error instanceof Error ? error.message : error });
    return { transferId, reversalId: null, status: 'failed', reversedCents: 0 };
  }
}

export async function recordPaymentDispute(
  db: RpcDb,
  input: {
    source: 'marketplace' | 'origin';
    paymentId?: string | null;
    originOrderId?: string | null;
    dispute: Stripe.Dispute;
    charge: Stripe.Charge;
    intentId: string;
    reversal: ReversalResult;
  },
) {
  const { dispute, charge, reversal } = input;
  const { error } = await db.rpc('record_payment_dispute', {
    p_dispute: dispute.id, p_source: input.source, p_payment: input.paymentId ?? null, p_origin_order: input.originOrderId ?? null,
    p_charge: charge.id, p_intent: input.intentId, p_amount: dispute.amount, p_currency: dispute.currency,
    p_status: dispute.status, p_reason: dispute.reason ?? null, p_livemode: dispute.livemode,
    p_transfer: reversal.transferId, p_reversal: reversal.reversalId, p_reversal_status: reversal.status,
    p_reversed_cents: reversal.reversedCents,
  });
  if (!error) return;
  // Mientras la migración 20260924200000 no esté aplicada la RPC no existe:
  // reintentar no lo arreglaría y Stripe insistiría durante días. La reversión
  // ya está hecha; se deja la traza en el log para revisarla a mano.
  const missing = error as { code?: string; message?: string };
  if (missing.code === 'PGRST202' || missing.code === '42883' || /could not find the function|does not exist/i.test(missing.message ?? '')) {
    console.error(`[disputes] DISPUTA SIN REGISTRAR (falta la migración 20260924200000) dispute=${dispute.id} charge=${charge.id} status=${dispute.status} amount=${dispute.amount} reversal=${reversal.status}`);
    return;
  }
  // Cualquier otro fallo: sin registro no hay aviso ni revisión. Lanzar hace
  // que Stripe reintente; la reversión ya hecha no se repite (idempotencia arriba).
  throw new Error(`dispute_record_failed:${error.message ?? 'unknown'}`);
}

/**
 * Disputa de un pago del marketplace (mode=marketplace en el PaymentIntent).
 * Devuelve false si el evento no es de este flujo.
 */
export async function handleMarketplaceDispute(stripe: Stripe, db: RpcDb, event: Stripe.Event): Promise<boolean> {
  if (!event.type.startsWith('charge.dispute.')) return false;
  const received = event.data.object as Stripe.Dispute;
  const intentId = stripeObjectId(received.payment_intent as string | { id: string } | null);
  if (!intentId) return false;
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.metadata?.mode !== 'marketplace' || !intent.metadata.order_id) return false;
  // Los eventos llegan desordenados: el estado que vale es el actual.
  const dispute = await stripe.disputes.retrieve(received.id);
  const chargeId = stripeObjectId(dispute.charge as string | { id: string } | null);
  if (!chargeId || dispute.livemode !== event.livemode || stripeObjectId(dispute.payment_intent as string | { id: string } | null) !== intent.id) {
    throw new Error('dispute_identity_mismatch');
  }
  const charge = await stripe.charges.retrieve(chargeId);
  if (stripeObjectId(charge.payment_intent as string | { id: string } | null) !== intent.id) throw new Error('dispute_identity_mismatch');
  const reversal = await reverseOrganizerTransfer(stripe, charge, dispute);
  await recordPaymentDispute(db, {
    source: 'marketplace', paymentId: intent.metadata.order_id, dispute, charge, intentId: intent.id, reversal,
  });
  return true;
}
