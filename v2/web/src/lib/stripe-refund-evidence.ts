import type Stripe from 'stripe';
/** A refund can reserve funds while its provider status is still pending. The
 * economic ledger uses completed refunds only, never charge.amount_refunded alone. */
export async function confirmedStripeRefunds(stripe:Stripe,charge:Pick<Stripe.Charge,'id'|'amount'|'currency'>){
 let confirmedCents=0,pending=false;
 for await(const refund of stripe.refunds.list({charge:charge.id,limit:100})){
  const chargeId=typeof refund.charge==='string'?refund.charge:refund.charge?.id;
  if(chargeId!==charge.id||refund.currency!==charge.currency||!Number.isSafeInteger(refund.amount)||refund.amount<0)throw new Error('refund_evidence_mismatch');
  if(refund.status==='succeeded')confirmedCents+=refund.amount;
  else if(!['failed','canceled'].includes(refund.status??''))pending=true;
 }
 if(confirmedCents>charge.amount)throw new Error('refund_evidence_mismatch');
 return{confirmedCents,pending};
}
