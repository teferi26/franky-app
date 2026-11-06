import { createHash, timingSafeEqual } from 'node:crypto';
import type Stripe from 'stripe';
import { createAdminSupabase } from './supabase-admin';
import { getStripe } from './stripe';
import { sendEmail } from './email';
import { ORIGIN_SITE, originEventSlug } from './origin-partner';
import { applicationFeeCents } from './pricing';
import { getOriginStripe, originMerchantAccount, ORIGIN_MERCHANT_ACCOUNT } from './origin-stripe';
import { ORIGIN_ORGANIZER_ID } from './origin-partner';
import { recordPaymentDispute, reverseOrganizerTransfer } from './marketplace-disputes';

export type OriginOrder = {
  id: string; event_id: string; token_hash: string; buyer_name: string; buyer_email: string;
  size: string; amount_cents: number; currency: string; stripe_account: string; livemode: boolean;
  status: 'pending'|'paid'|'expired'|'refunded'|'review'; created_at: string; paid_at: string|null;
  checkout_params: Stripe.Checkout.SessionCreateParams|null; stripe_session_id: string|null;
  stripe_payment_intent: string|null; receipt_sent_at: string|null;
  base_amount_cents?: number|null; discount_cents?: number; discount_code?: string|null;
  routing_version: 1|2|3; organizer_id: string|null; destination_account: string|null; application_fee_cents: number|null;
  event_snapshot: { title: string; start_at: string; venue: string|null; city: string|null; address: string|null };
};
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function secretMatches(actual: string|null, expected: string|undefined) {
  if (!expected || !actual) return false;
  const a=Buffer.from(actual), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
export async function originRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const {data,error}=await createAdminSupabase().rpc(name,args);
  if(error) throw new Error(error.message);
  return data as T;
}
export async function getOriginOrder(id: string, token?: string): Promise<OriginOrder> {
  const {data,error}=await createAdminSupabase().from('origin_event_orders').select('*').eq('id',id).maybeSingle();
  if(error) throw new Error('No se puede consultar la compra ahora');
  if(!data) throw new Error('Solicitud no encontrada');
  if(token!==undefined && !secretMatches(data.token_hash,tokenHash(token))) throw new Error('Solicitud no válida');
  return data as OriginOrder;
}
async function updateOrder(id:string, patch:Record<string,unknown>, statuses?:string[]) {
  let query=createAdminSupabase().from('origin_event_orders').update(patch).eq('id',id);
  if(statuses) query=query.in('status',statuses);
  const {error}=await query;
  if(error) throw new Error('No se pudo guardar el estado del pago');
}
let accountPromise: Promise<string>|undefined;
export function platformAccount() {
  // Discover the platform belonging to Franky's secret key, never an organizer's Connect account.
  accountPromise??=getStripe().accounts.retrieve(null).then(a=>{if(a.id!=='acct_1QBf2CEa4An6HvQo')throw new Error('Unexpected Franky platform account');return a.id;}).catch(e=>{accountPromise=undefined;throw e;});
  return accountPromise;
}
async function orderStripe(order:OriginOrder) {
  if(order.routing_version===3) {
    if(order.stripe_account!==ORIGIN_MERCHANT_ACCOUNT || (await originMerchantAccount()).id!==order.stripe_account)throw new Error('Payment account mismatch');
    return getOriginStripe();
  }
  if(await platformAccount()!==order.stripe_account)throw new Error('Payment account mismatch');
  return getStripe();
}
function isOriginMerchantOrder(order:OriginOrder) {
  return order.routing_version===3 && order.organizer_id===ORIGIN_ORGANIZER_ID
    && order.stripe_account===ORIGIN_MERCHANT_ACCOUNT && order.destination_account===ORIGIN_MERCHANT_ACCOUNT && order.livemode===true;
}
export function originCheckoutParams(order:OriginOrder): Stripe.Checkout.SessionCreateParams {
  const direct=isOriginMerchantOrder(order);
  if(!direct && (order.routing_version!==2 || !order.organizer_id || !order.destination_account || order.destination_account===order.stripe_account)) throw new Error('El organizador debe activar su cuenta de cobro antes de vender entradas');
  const fee=direct?0:order.application_fee_cents??applicationFeeCents(order.amount_cents,'ticket');
  if(!Number.isInteger(fee)||fee<0||fee>=order.amount_cents)throw new Error('Invalid organizer fee');
  const metadata={mode:'origin_event',order_id:order.id,event_id:order.event_id};
  const option=order.size==='ninguna'?'Sin camiseta':`Con camiseta · talla ${order.size}`;
  const returnUrl=`${ORIGIN_SITE}/eventos/compra?order=${order.id}`;
  return {
    mode:'payment',payment_method_types:['card'],locale:'es',customer_email:order.buyer_email,
    expires_at:Math.floor(Date.now()/1000)+35*60,
    line_items:[{quantity:1,price_data:{currency:'eur',unit_amount:order.amount_cents,product_data:{name:`${order.event_snapshot.title} · ${option}`,description:direct?'Entrada para 1 persona. Vendida por ORIGIN.':'Entrada para 1 persona. Pago gestionado por Franky.'}}}],
    payment_intent_data:{metadata,receipt_email:order.buyer_email,...(direct?{}:{transfer_data:{destination:order.destination_account!},application_fee_amount:fee})},metadata,
    success_url:returnUrl,cancel_url:returnUrl,
    branding_settings:{display_name:direct?'ORIGIN':'ORIGIN · entradas por Franky',background_color:'#f5f2ea',button_color:'#646b50',border_style:'rectangular',font_family:'inter'},
    custom_text:{submit:{message:direct?'Tu entrada se confirmará tras completar el pago. El vendedor y responsable del cobro es ORIGIN.':'Tu entrada se confirmará tras completar el pago. El cobro de este evento lo gestiona Franky.'}},
    // Franky processes the charge; Stripe transfers the organizer's share automatically.
  };
}
const stripeId=(value: string|{id:string}|null|undefined)=>typeof value==='string'?value:value?.id;
class OriginOrganizerUnavailable extends Error {
  constructor(){super('El organizador debe activar su cuenta de cobro antes de vender entradas');}
}
async function originPaymentIssue(message:string,order:OriginOrder) {
  // No buyer names, email addresses, browser tokens or request bodies in alerts.
  console.error(`[origin-payment] ${message}; order=${order.id}`);
  try {await originRpc('flag_origin_payment_issue',{p_id:order.id,p_reason:message});}
  catch {console.error(`[origin-payment] Could not persist routing alert; order=${order.id}`);}
  return new Error(message);
}
export function assertOriginFrozenRouting(order:OriginOrder) {
  const p=order.checkout_params, intent=p?.payment_intent_data;
  if(order.routing_version===3) {
    if(!isOriginMerchantOrder(order)||order.application_fee_cents!==0||!p||!intent
      || intent.transfer_data!==undefined || intent.application_fee_amount!==undefined || intent.on_behalf_of!==undefined
      || p.mode!=='payment'||p.line_items?.length!==1||p.line_items[0].quantity!==1
      || p.line_items[0].price_data?.unit_amount!==order.amount_cents||p.line_items[0].price_data?.currency!==order.currency
      || p.metadata?.mode!=='origin_event'||p.metadata?.order_id!==order.id||p.metadata?.event_id!==order.event_id
      || intent.metadata?.mode!=='origin_event'||intent.metadata?.order_id!==order.id||intent.metadata?.event_id!==order.event_id
      || p.discounts!==undefined||p.allow_promotion_codes!==undefined||p.automatic_tax!==undefined)throw new Error('Checkout destination mismatch');
    return;
  }
  if(order.routing_version!==2||!order.organizer_id||!order.destination_account||order.destination_account===order.stripe_account
    || !p || intent?.transfer_data?.destination!==order.destination_account || intent.transfer_data.amount!==undefined
    || intent.on_behalf_of || !Number.isInteger(order.application_fee_cents) || order.application_fee_cents!<0 || order.application_fee_cents!>=order.amount_cents
    || intent.application_fee_amount!==order.application_fee_cents
    || p.line_items?.length!==1 || p.line_items[0].quantity!==1 || p.line_items[0].price_data?.unit_amount!==order.amount_cents || p.line_items[0].price_data?.currency!==order.currency
    || p.metadata?.order_id!==order.id || p.metadata?.event_id!==order.event_id || intent.metadata?.order_id!==order.id) throw new Error('Checkout destination mismatch');
}
export async function assertOriginOrganizerReady(order:OriginOrder) {
  if(order.routing_version===3) {
    if(!isOriginMerchantOrder(order))throw new OriginOrganizerUnavailable();
    const {data:event,error}=await createAdminSupabase().from('events').select('organizer_id').eq('id',order.event_id).maybeSingle();
    if(error)throw new Error('No se puede verificar el destinatario del pago');
    const account=await originMerchantAccount();
    if(event?.organizer_id!==ORIGIN_ORGANIZER_ID||!account.charges_enabled||!account.payouts_enabled||account.capabilities?.card_payments!=='active')throw new OriginOrganizerUnavailable();
    return;
  }
  if(order.routing_version!==2||!order.organizer_id||!order.destination_account||order.destination_account===order.stripe_account)throw new OriginOrganizerUnavailable();
  const db=createAdminSupabase();
  const [{data:event,error:eventError},{data:connect,error:connectError}]=await Promise.all([
    db.from('events').select('organizer_id').eq('id',order.event_id).maybeSingle(),
    db.from('connect_accounts').select('stripe_connect_account_id,charges_enabled,payouts_enabled,transfers_status,onboarding_status').eq('user_id',order.organizer_id).maybeSingle(),
  ]);
  if(eventError||connectError)throw new Error('No se puede verificar el destinatario del pago');
  if(event?.organizer_id!==order.organizer_id||connect?.stripe_connect_account_id!==order.destination_account||connect.charges_enabled!==true||connect.payouts_enabled!==true||connect.transfers_status!=='active'||connect.onboarding_status!=='active')throw new OriginOrganizerUnavailable();
  // A stale database flag must never be enough to take a new payment.
  const account=await getStripe().v2.core.accounts.retrieve(order.destination_account,{include:['configuration.recipient','requirements']});
  const capability=account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if(account.id!==order.destination_account||account.metadata?.supabase_user_id!==order.organizer_id||capability!=='active')throw new OriginOrganizerUnavailable();
}
export function assertOriginSession(session:Stripe.Checkout.Session, order:OriginOrder) {
  if(session.metadata?.mode!=='origin_event' || session.metadata?.order_id!==order.id || session.metadata?.event_id!==order.event_id || session.livemode!==order.livemode || session.amount_total!==order.amount_cents || session.currency!==order.currency || (order.stripe_session_id && order.stripe_session_id!==session.id)) throw new Error('Payment integrity mismatch');
}
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function sendOriginReceipt(order:OriginOrder) {
  if(order.status!=='paid'||order.receipt_sent_at)return;
  const e=order.event_snapshot;
  const when=new Date(e.start_at).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'long',timeStyle:'short'});
  const amount=(order.amount_cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
  const lines=[`Hola, ${order.buyer_name}.`,`Tu plaza en ${e.title} está confirmada.`,`${when} · ${e.venue??''}, ${e.city??''}`,order.size==='ninguna'?'Entrada sin camiseta':`Entrada con camiseta · talla ${order.size}`,`Pagado: ${amount}`,`Referencia: ${order.id}`,`Presenta este correo y tu nombre en el acceso.`,`Detalles: ${ORIGIN_SITE}/eventos/${originEventSlug(order.event_id)}`,order.routing_version===3?'El vendedor y responsable del cobro es ORIGIN. Gestiona tu compra en '+ORIGIN_SITE+'/eventos/compra?order='+order.id:'El pago de la entrada lo gestiona Franky. Para cualquier incidencia: info@franky.es.'];
  if(order.discount_cents)lines.splice(4,0,`Cupón ${order.discount_code??''}: descuento de ${(order.discount_cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})}.`);
  if(order.amount_cents===0)lines[lines.findIndex(line=>line.startsWith('Pagado:'))]='Entrada gratuita con cupón.';
  const result=await sendEmail({to:order.buyer_email,subject:`Entrada confirmada · ${e.title}`,text:lines.join('\n\n'),html:`<div style="font-family:Arial,sans-serif;background:#f5f2ea;color:#292c25;padding:32px;max-width:600px"><p style="letter-spacing:5px">ORIGIN</p>${lines.map(line=>`<p>${escapeHtml(line)}</p>`).join('')}</div>`,idempotencyKey:`origin-receipt/${order.id}`});
  if(!result.ok)throw new Error('No se pudo enviar la confirmación');
  await updateOrder(order.id,{receipt_sent_at:new Date().toISOString()});
}
export async function reconcileOriginSession(session:Stripe.Checkout.Session, order:OriginOrder, account?:string) {
  assertOriginSession(session,order);
  const stripe=await orderStripe(order);
  const platform=account??order.stripe_account;
  if(platform!==order.stripe_account) throw new Error('Payment account mismatch');
  if(session.payment_status==='paid') {
    const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
    if(!intent)throw new Error('Missing payment intent');
    // Inspect the actual charge destination as well as the Checkout snapshot.
    const pi=await stripe.paymentIntents.retrieve(intent);
    if(pi.status!=='succeeded' || pi.amount_received!==order.amount_cents || pi.currency!==order.currency || pi.livemode!==order.livemode || pi.metadata?.order_id!==order.id) throw new Error('Payment destination mismatch');
    if(order.routing_version===2) {
      assertOriginFrozenRouting(order);
      if(stripeId(pi.transfer_data?.destination)!==order.destination_account||pi.transfer_data?.amount!=null||pi.on_behalf_of||pi.application_fee_amount!==order.application_fee_cents)throw await originPaymentIssue('Payment destination mismatch',order);
    } else if(order.routing_version===3) {
      assertOriginFrozenRouting(order);
      if(pi.transfer_data||pi.on_behalf_of||pi.application_fee_amount)throw new Error('Origin direct payment has an unexpected fee or transfer');
    } else if(order.routing_version!==1 || pi.transfer_data || pi.on_behalf_of || pi.application_fee_amount)throw new Error('Historical payment destination mismatch');
    const chargeId=typeof pi.latest_charge==='string'?pi.latest_charge:pi.latest_charge?.id;
    if(!chargeId)throw new Error('Missing paid charge');
    const charge=await stripe.charges.retrieve(chargeId);
    if(charge.amount!==order.amount_cents||charge.currency!==order.currency||charge.livemode!==order.livemode)throw new Error('Charge integrity mismatch');
    if(order.routing_version===3 && (stripeId(charge.payment_intent)!==intent||charge.transfer||charge.transfer_data||charge.application_fee||charge.application_fee_amount||charge.on_behalf_of))throw new Error('Origin charge has an unexpected fee or transfer');
    if(order.routing_version===2) {
      const transferId=stripeId(charge.transfer);
      if(!transferId||stripeId(charge.payment_intent)!==intent||stripeId(charge.transfer_data?.destination)!==order.destination_account||charge.application_fee_amount!==order.application_fee_cents)throw await originPaymentIssue('Organizer transfer missing',order);
      const transfer=await stripe.transfers.retrieve(transferId);
      if(stripeId(transfer.destination)!==order.destination_account||stripeId(transfer.source_transaction)!==chargeId||transfer.amount!==order.amount_cents||transfer.currency!==order.currency||transfer.livemode!==order.livemode)throw await originPaymentIssue('Organizer transfer mismatch',order);
    }
    await originRpc('settle_origin_event_order',{p_id:order.id,p_session:session.id,p_intent:intent,p_amount:session.amount_total,p_currency:session.currency,p_live:session.livemode,p_account:platform,p_refunded:charge.amount_refunded});
  } else if(session.status==='expired' && session.payment_status==='unpaid') {
    await updateOrder(order.id,{status:'expired',stripe_session_id:session.id},['pending','review']);
  }
  return getOriginOrder(order.id);
}
export async function recoverOriginSession(order:OriginOrder):Promise<Stripe.Checkout.Session|null> {
  const stripe=await orderStripe(order);
  if(order.stripe_session_id)return stripe.checkout.sessions.retrieve(order.stripe_session_id);
  if(!order.checkout_params) return null; // No request was frozen: no charge could have been created.
  // Reconciliation may read old sessions, but must never mint a new legacy charge.
  if(order.routing_version!==2&&order.routing_version!==3)throw new Error('El pago necesita revisión. Contacta con Franky antes de repetirlo');
  if(Date.now()-Date.parse(order.created_at)>=23*60*60_000) {
    await updateOrder(order.id,{status:'review'},['pending']);
    throw new Error('El pago necesita revisión. Contacta con Franky antes de repetirlo');
  }
  assertOriginFrozenRouting(order);
  await assertOriginOrganizerReady(order);
  const session=await stripe.checkout.sessions.create(order.checkout_params,{idempotencyKey:`origin-event:${order.id}`});
  assertOriginSession(session,order);
  await updateOrder(order.id,{stripe_session_id:session.id});
  return session;
}
export async function startOriginCheckout(order:OriginOrder) {
  if(order.status==='paid'||order.status==='refunded') {
    // Complimentary entries have no Stripe webhook. The existing receipt cron
    // retries delivery if the email provider is temporarily unavailable.
    if(order.status==='paid'&&order.amount_cents===0)await sendOriginReceipt(order).catch(()=>{});
    return {orderId:order.id,state:order.status};
  }
  if(order.status!=='pending')throw new Error('Esta solicitud ha terminado. Inicia una nueva compra');
  if(order.routing_version!==2&&order.routing_version!==3) {
    // A cached legacy URL must not remain payable when its owner resumes it.
    if(order.stripe_session_id) {
      const fresh=await inspectOriginOrder(order,true);
      if(fresh.status==='paid'||fresh.status==='refunded')return {orderId:fresh.id,state:fresh.status};
    }
    throw new Error('Esta solicitud ha terminado. Inicia una nueva compra');
  }
  if(!order.checkout_params) {
    await assertOriginOrganizerReady(order);
    order.checkout_params=await originRpc('freeze_origin_checkout',{p_id:order.id,p_params:originCheckoutParams(order)});
    if(!order.checkout_params)throw new Error('La solicitud ha cambiado. Vuelve a consultarla');
    order=await getOriginOrder(order.id); // Read the destination and fee actually frozen by PostgreSQL.
  }
  const session=await recoverOriginSession(order);
  if(!session)throw new Error('No se pudo abrir el pago');
  const fresh=await reconcileOriginSession(session,order);
  if(fresh.status==='paid')return {orderId:order.id,state:'paid'};
  if(session.status!=='open'||!session.url)throw new Error('El pago ha caducado. Inicia una nueva compra');
  assertOriginFrozenRouting(order);
  try {await assertOriginOrganizerReady(order);}
  catch(error) {
    if(error instanceof OriginOrganizerUnavailable) {
      const stripe=await orderStripe(order);
      let closed:Stripe.Checkout.Session;
      try {closed=await stripe.checkout.sessions.expire(session.id);}
      catch {closed=await stripe.checkout.sessions.retrieve(session.id);}
      // A payment may have completed just before expiry. Verify it, never refund it here.
      const reconciled=await reconcileOriginSession(closed,order);
      if(reconciled.status==='paid')return {orderId:order.id,state:'paid'};
    }
    throw error;
  }
  return {orderId:order.id,state:'pending',url:session.url};
}
export async function inspectOriginOrder(order:OriginOrder,cancel=false) {
  if(['pending','review'].includes(order.status)) {
    let session=await recoverOriginSession(order);
    if(!session && cancel) {
      await originRpc('close_unstarted_origin_order',{p_id:order.id});
      order=await getOriginOrder(order.id);
      if(order.status==='pending' && order.checkout_params) return inspectOriginOrder(order,true);
      return order;
    }
    if(session && cancel && session.status==='open') {
      const stripe=await orderStripe(order);
      try {session=await stripe.checkout.sessions.expire(session.id);}
      catch {session=await stripe.checkout.sessions.retrieve(session.id);}
    }
    if(session)order=await reconcileOriginSession(session,order);
  }
  return order;
}
export async function reconcileOriginPending(eventId?:string) {
  let query=createAdminSupabase().from('origin_event_orders').select('*').eq('status','pending').lt('created_at',new Date(Date.now()-40*60_000).toISOString()).order('created_at').limit(20);
  if(eventId)query=query.eq('event_id',eventId);
  const {data,error}=await query; if(error)throw new Error('No se pueden revisar las reservas');
  let failures=0;
  for(const row of data??[]) {
    try {
      const order=row as OriginOrder;
      if(!order.checkout_params)await originRpc('close_unstarted_origin_order',{p_id:order.id});
      else await inspectOriginOrder(order);
    } catch {failures++;} // Uncertain orders retain capacity for manual reconciliation.
  }
  return {checked:data?.length??0,failures};
}
/** Disputa de un pedido Origin: estado actual de Stripe, reversión de la
 * transferencia al organizador en routing 2 (en routing 3 el cobro es de
 * ORIGIN y no hay transferencia) y registro con aviso al equipo. */
async function recordOriginDispute(stripe:Stripe,order:OriginOrder,intent:Stripe.PaymentIntent,disputeId:string) {
  const dispute=await stripe.disputes.retrieve(disputeId);
  const chargeId=stripeId(dispute.charge as string|{id:string}|null);
  if(!chargeId||stripeId(dispute.payment_intent as string|{id:string}|null)!==intent.id||dispute.livemode!==order.livemode)throw new Error('Dispute integrity mismatch');
  const charge=await stripe.charges.retrieve(chargeId);
  if(stripeId(charge.payment_intent as string|{id:string}|null)!==intent.id)throw new Error('Dispute integrity mismatch');
  const reversal=order.routing_version===2?await reverseOrganizerTransfer(stripe,charge,dispute)
    :{transferId:null,reversalId:null,status:'not_applicable' as const,reversedCents:0};
  await recordPaymentDispute(createAdminSupabase(),{source:'origin',originOrderId:order.id,dispute,charge,intentId:intent.id,reversal});
}
export async function handleOriginWebhook(event:Stripe.Event, sourceAccount?:string):Promise<boolean> {
  if(event.type.startsWith('checkout.session.')) {
    const session=event.data.object as Stripe.Checkout.Session;
    if(session.metadata?.mode!=='origin_event')return false;
    if(event.account)throw new Error('Origin event received from a connected account');
    const order=await getOriginOrder(session.metadata.order_id);
    if(order.stripe_account!==(sourceAccount??await platformAccount()))throw new Error('Webhook payment account mismatch');
    if(event.livemode!==order.livemode)throw new Error('Payment mode mismatch');
    const fresh=await reconcileOriginSession(session,order);
    await sendOriginReceipt(fresh);
    return true;
  }
  // Devoluciones y disputas: la metadata (mode/order_id) va en el
  // PaymentIntent, NO en el cargo (Stripe no la copia). Antes se leía
  // charge.metadata y ninguna devolución de Origin se reconocía por webhook.
  const isRefund=event.type==='charge.refunded'||event.type==='refund.created'||event.type==='refund.updated';
  const isDispute=event.type.startsWith('charge.dispute.');
  if(isRefund||isDispute) {
    const object=event.data.object as Stripe.Charge|Stripe.Refund|Stripe.Dispute;
    const intentId=stripeId(object.payment_intent as string|{id:string}|null);
    if(!intentId)return false;
    // Cliente del mismo origen que el evento: plataforma o cuenta de ORIGIN.
    const source=sourceAccount===ORIGIN_MERCHANT_ACCOUNT?getOriginStripe():getStripe();
    const intent=await source.paymentIntents.retrieve(intentId);
    if(intent.metadata?.mode!=='origin_event'||!intent.metadata.order_id)return false;
    if(event.account)throw new Error('Origin refund received from a connected account');
    const order=await getOriginOrder(intent.metadata.order_id);
    if(order.stripe_account!==(sourceAccount??await platformAccount()))throw new Error('Webhook payment account mismatch');
    const stripe=await orderStripe(order);
    if(intent.livemode!==order.livemode||event.livemode!==order.livemode)throw new Error('Refund integrity mismatch');
    if(isDispute) {
      await recordOriginDispute(stripe,order,intent,(event.data.object as Stripe.Dispute).id);
      return true;
    }
    // A refund can arrive before checkout.completed or before we saved its session ID.
    const sessions=await stripe.checkout.sessions.list({payment_intent:intentId,limit:2});
    const session=sessions.data.find(s=>s.metadata?.order_id===order.id);
    if(!session)throw new Error('Refund checkout not found');
    await reconcileOriginSession(session,order);
    return true;
  }
  return false;
}
