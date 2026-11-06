import type Stripe from 'stripe';
import {getStripe} from './stripe';
import {paymentRpc,closeMarketplacePayment} from './marketplace-checkout';
import {assertRealPaymentActors} from './payment-demo-guard';
import {confirmedStripeRefunds} from './stripe-refund-evidence';
import {frankyCommissionCents,type CommissionType} from './pricing';

type Payment={id:string;buyer_id:string;seller_id:string;status:string;amount_cents:number;refunded_cents:number;currency:string;stripe_payment_intent_id:string|null;stripe_charge_id:string|null;stripe_connect_account_id:string|null;type?:string;metadata?:Record<string,unknown>|null};
type Case={id:string;payment_id:string;attempt_id:string;request_params:Stripe.RefundCreateParams|null;request_frozen_at:string|null;stripe_refund_id:string|null};
type Claimed={refund:Case;payment:Payment};
const id=(value:string|{id:string}|null|undefined)=>typeof value==='string'?value:value?.id??null;
export function refundKey(refund:Pick<Case,'attempt_id'>){return `event-refund:${refund.attempt_id}`;}
export function feeRefundKey(refund:Pick<Case,'attempt_id'>){return `event-refund-fee:${refund.attempt_id}`;}
/** Parte de la application_fee que es comisión de Franky, sin la tasa estimada
 * de Stripe. Stripe NO devuelve su tasa de procesamiento al reembolsar, así que
 * devolver la application_fee entera (refund_application_fee:true) hacía que
 * Franky pagase de su bolsillo esa tasa en cada devolución. */
export function frankyFeeCents(payment:Payment,feeAmount:number){
 const recorded=Number(payment.metadata?.franky_fee_cents);
 const franky=Number.isSafeInteger(recorded)&&recorded>=0?recorded
  :['visit','rent','ticket'].includes(payment.type??'')?frankyCommissionCents(payment.amount_cents,payment.type as CommissionType):0;
 return Math.max(0,Math.min(franky,feeAmount));
}
/** Devuelve al organizador SOLO la comisión de Franky (proporcional a lo
 * reembolsado), una vez y con clave de idempotencia. Busca antes un reembolso
 * previo del mismo intento: las claves de Stripe caducan a las 24 h. */
async function refundFrankyFee(stripe:Stripe,payment:Payment,charge:Stripe.Charge,refund:Case,refundedCents:number){
 const feeId=id(charge.application_fee as string|{id:string}|null);
 if(!feeId||refundedCents<=0)return;
 const fee=await stripe.applicationFees.retrieve(feeId);
 for await(const prior of stripe.applicationFees.listRefunds(feeId,{limit:100})){
  if(prior.metadata?.workspace_refund_attempt===refund.attempt_id)return;
 }
 const share=Math.round(frankyFeeCents(payment,fee.amount)*Math.min(1,refundedCents/payment.amount_cents));
 const amount=Math.min(share,fee.amount-fee.amount_refunded);
 if(amount<=0)return;
 await stripe.applicationFees.createRefund(feeId,{amount,metadata:{workspace_refund_case:refund.id,workspace_refund_attempt:refund.attempt_id,order_id:payment.id}},{idempotencyKey:feeRefundKey(refund)});
}
export function assertRefundEvidence(payment:Payment,intent:Stripe.PaymentIntent,charge:Stripe.Charge,live:boolean){
 if(intent.id!==payment.stripe_payment_intent_id||intent.metadata.mode!=='marketplace'||intent.metadata.order_id!==payment.id||intent.amount!==payment.amount_cents||intent.currency!==payment.currency||intent.livemode!==live||charge.livemode!==live||charge.amount!==payment.amount_cents||charge.currency!==payment.currency||id(charge.payment_intent)!==intent.id||id(intent.transfer_data?.destination)!==payment.stripe_connect_account_id||charge.disputed)throw new Error('refund_evidence_mismatch');
}
/** A lease and a frozen request make uncertain retries safe. Only provider evidence
 * reaches the existing payments ledger; a client action cannot set money states. */
export async function processEventRefund(refundId?:string):Promise<boolean>{
 const claimed=await paymentRpc<Claimed|null>('claim_workspace_event_refund',{p_id:refundId??null});if(!claimed)return false;
 let f=claimed.refund;const p=claimed.payment;
 const finish=(status:string,provider:string|null=null,note:string|null=null)=>paymentRpc('finish_workspace_event_refund',{p_id:f.id,p_status:status,p_provider_refund:provider,p_note:note});
 try{
  await assertRealPaymentActors(p.buyer_id);await assertRealPaymentActors(p.seller_id);
  if(['pending','processing'].includes(p.status)){
   const closed=await closeMarketplacePayment(p.id);if(closed){await finish('closed_unpaid');return true;}
   // The close operation may settle a just-paid checkout. Release the lease and
   // read that durable result on the next pass, without guessing its new identity.
   await finish('pending',null,'Comprobando el cierre del cobro.');return true;
  }
  if(['canceled','failed'].includes(p.status)){await finish('closed_unpaid');return true;}
  // Un reembolso ya conciliado por el webhook aún puede deber la comisión de
  // Franky al organizador: esas peticiones siguen hasta devolverla.
  if(p.status==='refunded'&&f.request_params?.refund_application_fee!==false){await finish('refunded');return true;}
  if(p.amount_cents===0){await paymentRpc('close_zero_workspace_refund',{p_id:f.id});await finish('closed_unpaid');return true;}
  if(!p.stripe_payment_intent_id)throw new Error('refund_payment_needs_review');
  const stripe=getStripe();const intent=await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id,{expand:['latest_charge']});
  const chargeId=id(intent.latest_charge);if(!chargeId)throw new Error('refund_charge_missing');
  let charge=typeof intent.latest_charge==='object'&&intent.latest_charge?intent.latest_charge:await stripe.charges.retrieve(chargeId);
  assertRefundEvidence(p,intent,charge,process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')===true);
  const reconcile=async(c:Stripe.Charge)=>{const totals=await confirmedStripeRefunds(stripe,c);if(totals.confirmedCents>0)await paymentRpc('refund_marketplace_payment',{p_order:p.id,p_intent:intent.id,p_charge:c.id,p_amount:c.amount,p_currency:c.currency,p_refunded:totals.confirmedCents});return totals;};
  const before=await reconcile(charge);
  // Solo las peticiones nuevas (refund_application_fee:false) devuelven la
  // comisión aparte; las antiguas ya congeladas la devolvieron entera.
  const settleFee=async(refundedCents:number)=>{if(f.request_params?.refund_application_fee===false)await refundFrankyFee(stripe,p,charge,f,refundedCents);};
  if(before.confirmedCents>=charge.amount){
   if(f.request_params){
    try{await settleFee(f.request_params.amount??before.confirmedCents);}
    catch{await finish('review',f.stripe_refund_id,'Devolución completada; falta devolver la comisión de Franky al organizador.');return true;}
   }
   await finish('refunded');return true;
  }
  if(before.pending&&!f.request_params){await finish('pending',null,'Hay una devolución pendiente en el proveedor. Se comprobará antes de crear otra.');return true;}
  // Store the exact parameters before contacting Stripe. A second attempt can
  // only replay these parameters, even if totals changed in the meantime.
  if(!f.request_params)f=await paymentRpc<Case>('freeze_workspace_event_refund',{p_id:f.id,p_request:{charge:charge.id,amount:charge.amount-before.confirmedCents,reverse_transfer:!!intent.transfer_data,refund_application_fee:false,metadata:{workspace_refund_case:f.id,workspace_refund_attempt:f.attempt_id,order_id:p.id}}});
  let result:Stripe.Refund|undefined;
  if(f.stripe_refund_id)result=await stripe.refunds.retrieve(f.stripe_refund_id);
  else if(f.request_frozen_at&&Date.now()-Date.parse(f.request_frozen_at)>=23*60*60_000){
   // Idempotency keys can expire after 24h. Never create another refund blindly.
   for await(const candidate of stripe.refunds.list({charge:charge.id,limit:100})){
    if(candidate.metadata?.workspace_refund_attempt===f.attempt_id){result=candidate;break;}
   }
   if(!result){await finish('review',null,'La respuesta antigua no se ha podido conciliar; revisa Stripe antes de reintentar.');return true;}
  }else {f=await paymentRpc<Case>('freeze_workspace_event_refund',{p_id:f.id,p_request:f.request_params});result=await stripe.refunds.create(f.request_params!,{idempotencyKey:refundKey(f)});}
  if(id(result.charge)!==charge.id||result.metadata?.workspace_refund_case!==f.id)throw new Error('refund_identity_mismatch');
  charge=await stripe.charges.retrieve(charge.id);const after=await reconcile(charge);
  if(after.confirmedCents>=charge.amount){
   try{await settleFee(result.amount);}
   catch{await finish('review',result.id,'Devolución completada; falta devolver la comisión de Franky al organizador.');return true;}
   await finish('refunded',result.id);
  }
  else if(['failed','canceled'].includes(result.status??''))await finish('review',result.id,'El proveedor no ha completado la devolución. Revisa el expediente en Stripe.');
  else await finish('pending',result.id,'El proveedor está tramitando la devolución.');
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const review=/evidence_mismatch|identity_mismatch|needs_review|charge_missing|amount_changed|authority_revoked|demo_payment|connect|balance_insufficient/.test(message)||(error as {type?:string})?.type==='StripeInvalidRequestError';
  await finish(review?'review':'pending',null,review?'Se necesita una revisión financiera antes de continuar.':'No hay confirmación del proveedor. Se volverá a comprobar sin duplicar la devolución.');
 }
 return true;
}
export async function processEventRefundBatch(limit=40){let processed=0;const deadline=Date.now()+45_000;while(processed<limit&&Date.now()<deadline){const results=await Promise.all(Array.from({length:Math.min(4,limit-processed)},()=>processEventRefund()));const completed=results.filter(Boolean).length;processed+=completed;if(!completed)break;}return processed;}
