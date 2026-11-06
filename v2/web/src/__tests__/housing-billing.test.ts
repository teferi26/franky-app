vi.mock('@/lib/payment-demo-guard', () => ({ assertRealPaymentActors: vi.fn().mockResolvedValue(undefined), isDemoPaymentActor: vi.fn().mockResolvedValue(false) }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
const fake=vi.hoisted(()=>({row:{} as Record<string,any>,queue:true,rpc:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({
 rpc:fake.rpc,
 from:()=>{
  const chain:any={select:()=>chain,eq:()=>chain,update:(patch:any)=>{fake.update(patch);Object.assign(fake.row,patch);return chain;},
   single:async()=>({data:fake.row,error:null}),then:(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve)};
  return chain;
 }
})}));
vi.mock('@/lib/stripe-customer',()=>({assertCustomerOwner:vi.fn(async()=>({}))}));
import { completeHousingSetup, handleHousingBillingWebhook, housingSubscriptionParams, processHousingActivations, startHousingEnrollment, validateHousingPrice } from '@/lib/housing-billing';
import { housingOfferTerms } from '@/lib/housing-offer';

function price(billing='monthly') { return {id:billing==='listing'?'price_listing':billing==='quarterly'?'price_quarter':'price_owner',active:true,currency:'eur',unit_amount:billing==='listing'?999:billing==='quarterly'?19200:8000,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:billing==='quarterly'?3:1}} as Stripe.Price; }
function subscription(status='active') {return {id:'sub_one',customer:'cus_owner',status,metadata:{housing_enrollment_id:'enrollment',supabase_user_id:'owner',owner_plan:'true',owner_billing:'monthly'},items:{data:[{quantity:1,price:price(),current_period_end:1800000000}]},latest_invoice:{status:status==='active'?'paid':'open',hosted_invoice_url:'https://invoice.stripe.com/test'}} as unknown as Stripe.Subscription;}
function stripeMock() {
 const remote:Stripe.Subscription[]=[];
 const stripe={
  prices:{retrieve:vi.fn(async(id:string)=>price(id==='price_listing'?'listing':id==='price_quarter'?'quarterly':'monthly'))},
  checkout:{sessions:{list:vi.fn(async function*(){}),create:vi.fn(async(params:any)=>({id:'cs_one',mode:'setup',status:'open',url:'https://checkout.stripe.com/test',customer:'cus_owner',metadata:params.metadata})),retrieve:vi.fn()}},
  setupIntents:{retrieve:vi.fn(async()=>({status:'succeeded',customer:'cus_owner',usage:'off_session',payment_method:'pm_card'}))},
  subscriptions:{list:vi.fn(async function*(){yield*remote;}),retrieve:vi.fn(async(id:string)=>remote.find(s=>s.id===id)!),create:vi.fn(async()=>{const s=subscription();remote.push(s);return s;})},
  subscriptionSchedules:{create:vi.fn(),retrieve:vi.fn(),update:vi.fn()},
 };
 return {stripe:stripe as unknown as Stripe,mocks:stripe,remote};
}
beforeEach(()=>{
 vi.stubEnv('HOUSING_DEFERRED_BILLING_READY','true');vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED','true');vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fixture');
 vi.stubEnv('STRIPE_HOUSING_DEFERRED_MONTHLY_PRICE_ID','price_owner');vi.stubEnv('STRIPE_HOUSING_DEFERRED_QUARTERLY_PRICE_ID','price_quarter');vi.stubEnv('STRIPE_HOUSING_DEFERRED_LISTING_PRICE_ID','price_listing');
 fake.queue=true;fake.update.mockReset();fake.rpc.mockReset();
 fake.row={id:'enrollment',owner_id:'owner',listing_id:null,billing:'monthly',state:'activating',stripe_customer_id:'cus_owner',stripe_price_id:'price_owner',amount_cents:8000,stripe_payment_method_id:'pm_card',stripe_session_id:null,stripe_subscription_id:null,activation_started_at:new Date().toISOString(),created_at:new Date().toISOString(),activation_request:null};
 fake.rpc.mockImplementation(async(name:string,params:any)=>{
  if(name==='prepare_housing_enrollment') {fake.row.state='setup';fake.row.setup_request={...params.p_request,metadata:{...params.p_request.metadata,housing_enrollment_id:'enrollment'}};return {data:fake.row,error:null};}
  if(name==='claim_housing_activations')return {data:fake.queue?[{...fake.row}]:[],error:null};
  if(name==='sync_housing_subscription'){fake.row.stripe_subscription_id=params.p_subscription;fake.row.state=params.p_status==='active'?'active':'payment_required';fake.queue=false;}
  return {data:null,error:null};
 });
});
afterEach(()=>vi.unstubAllEnvs());
describe('housing billing contract',()=>{
 it('does not touch the deferred schema or Stripe while the service is disabled',async()=>{
  vi.stubEnv('HOUSING_DEFERRED_BILLING_READY','false');const {stripe,mocks}=stripeMock();
  expect(await processHousingActivations(stripe)).toEqual({processed:0,failed:0,skipped:true});
  expect(await handleHousingBillingWebhook(stripe,{type:'invoice.paid'} as Stripe.Event)).toBe(false);
  await expect(startHousingEnrollment(stripe,{owner:'owner',customer:'cus_owner',listing:null,billing:'monthly',origin:'https://franky.es',offerVersion:'first-interest-v1'})).rejects.toThrow('no está disponible');
  expect(fake.rpc).not.toHaveBeenCalled();expect(mocks.subscriptions.list).not.toHaveBeenCalled();expect(mocks.prices.retrieve).not.toHaveBeenCalled();
 });
 it('closing new sales preserves servicing of an already accepted deferred contract',async()=>{
  vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED','false');const {stripe,mocks}=stripeMock();
  await expect(startHousingEnrollment(stripe,{owner:'owner',customer:'cus_owner',listing:null,billing:'monthly',origin:'https://franky.es',offerVersion:'first-interest-v1'})).rejects.toThrow('no está disponible');
  expect(await processHousingActivations(stripe)).toEqual({processed:1,failed:0});expect(mocks.subscriptions.create).toHaveBeenCalledTimes(1);
 });
 it('does not fall back to a legacy tariff when a deferred price is missing',async()=>{
  vi.stubEnv('STRIPE_HOUSING_DEFERRED_MONTHLY_PRICE_ID','');vi.stubEnv('STRIPE_OWNER_MONTHLY_PRICE_ID','legacy_must_not_change');
  const {stripe,mocks}=stripeMock();await expect(startHousingEnrollment(stripe,{owner:'owner',customer:'cus_owner',listing:null,billing:'monthly',origin:'https://franky.es',offerVersion:'first-interest-v1'})).rejects.toThrow('no está disponible');
  expect(fake.rpc).not.toHaveBeenCalled();expect(mocks.prices.retrieve).not.toHaveBeenCalled();
 });
 it('does not create a checkout without explicit consent',async()=>{
  const {stripe,mocks}=stripeMock();await expect(startHousingEnrollment(stripe,{owner:'owner',customer:'cus_owner',listing:null,billing:'monthly',origin:'https://franky.es'})).rejects.toThrow('Acepta');
  expect(mocks.checkout.sessions.create).not.toHaveBeenCalled();expect(mocks.subscriptions.create).not.toHaveBeenCalled();
 });
 it('collects a card with setup mode, no charge, fixed terms, no trial deadline and durable idempotency',async()=>{
  const {stripe,mocks}=stripeMock();await startHousingEnrollment(stripe,{owner:'owner',customer:'cus_owner',listing:null,billing:'monthly',origin:'https://franky.es',offerVersion:'first-interest-v1'});
  const args=mocks.checkout.sessions.create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams,Stripe.RequestOptions];
  expect(args[0].mode).toBe('setup');expect(args[0].line_items).toBeUndefined();expect(args[0].subscription_data).toBeUndefined();
  expect(args[0].custom_text?.submit).toEqual(expect.objectContaining({message:expect.stringContaining('80,00')}));expect(args[1].idempotencyKey).toBe('housing-setup:enrollment');
  expect(mocks.subscriptions.create).not.toHaveBeenCalled();
 });
 it('refuses overlapping legacy subscription checkouts',async()=>{
  const {stripe,mocks}=stripeMock();mocks.checkout.sessions.list.mockImplementation(async function*(){yield {mode:'subscription',metadata:{mode:'owner'}} as never;});
  await expect(startHousingEnrollment(stripe,{owner:'owner',customer:'cus_owner',listing:null,billing:'monthly',origin:'https://franky.es',offerVersion:'first-interest-v1'})).rejects.toThrow('anterior pendiente');
  expect(mocks.checkout.sessions.create).not.toHaveBeenCalled();
 });
 it('grants publication only after a successful reusable card setup for the same customer',async()=>{
  const {stripe,mocks}=stripeMock();const session={id:'cs_one',mode:'setup',status:'complete',customer:'cus_owner',setup_intent:'seti_one',metadata:{housing_enrollment_id:'enrollment'}} as unknown as Stripe.Checkout.Session;
  mocks.setupIntents.retrieve.mockResolvedValueOnce({status:'succeeded',customer:'cus_attacker',usage:'off_session',payment_method:'pm_card'});
  await expect(completeHousingSetup(stripe,session)).rejects.toThrow('not ready');expect(fake.rpc).not.toHaveBeenCalled();
  await completeHousingSetup(stripe,session);expect(fake.rpc).toHaveBeenCalledWith('complete_housing_setup',expect.objectContaining({p_method:'pm_card',p_customer:'cus_owner'}));
 });
 it('does nothing when no qualifying contact is queued',async()=>{
  fake.queue=false;const {stripe,mocks}=stripeMock();expect(await processHousingActivations(stripe)).toEqual({processed:0,failed:0});expect(mocks.subscriptions.create).not.toHaveBeenCalled();
 });
 it('charges automatically off session once, with no trial, starting the paid period at activation',async()=>{
  const {stripe,mocks}=stripeMock();expect(await processHousingActivations(stripe)).toEqual({processed:1,failed:0});
  expect(mocks.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({off_session:true,payment_behavior:'allow_incomplete',collection_method:'charge_automatically',default_payment_method:'pm_card'}),{idempotencyKey:'housing-activate:enrollment'});
  expect((mocks.subscriptions.create.mock.calls[0] as unknown as [Stripe.SubscriptionCreateParams])[0].trial_end).toBeUndefined();
  await processHousingActivations(stripe);expect(mocks.subscriptions.create).toHaveBeenCalledTimes(1);
 });
 it('recovers a subscription created before a lost response without creating or charging again',async()=>{
  const {stripe,mocks,remote}=stripeMock();remote.push(subscription());expect(await processHousingActivations(stripe)).toEqual({processed:1,failed:0});expect(mocks.subscriptions.create).not.toHaveBeenCalled();
 });
 it('retries a failed quarterly rollover without duplicating the charge and releases onto the monthly price',async()=>{
  fake.row.billing='quarterly';fake.row.stripe_price_id='price_quarter';fake.row.amount_cents=19200;
  const {stripe,mocks,remote}=stripeMock();const sub=subscription();sub.items.data[0].price=price('quarterly');sub.metadata.owner_billing='quarterly';remote.push(sub);
  const schedule={id:'sched_one',phases:[{start_date:1800000000,end_date:1807948800}]};
  mocks.subscriptionSchedules.create.mockImplementation(async()=>{sub.schedule='sched_one';return schedule;});
  mocks.subscriptionSchedules.retrieve.mockResolvedValue(schedule);
  mocks.subscriptionSchedules.update.mockRejectedValueOnce(new Error('Transient schedule failure')).mockResolvedValueOnce({});
  expect(await processHousingActivations(stripe)).toEqual({processed:0,failed:1});
  expect(fake.row.state).toBe('activating');
  expect(await processHousingActivations(stripe)).toEqual({processed:1,failed:0});
  expect(mocks.subscriptionSchedules.create).toHaveBeenCalledTimes(1);expect(mocks.subscriptions.create).not.toHaveBeenCalled();
  expect(mocks.subscriptionSchedules.update).toHaveBeenLastCalledWith('sched_one',expect.objectContaining({end_behavior:'release',phases:[
   expect.objectContaining({items:[{price:'price_quarter',quantity:1}],end_date:1807948800}),
   expect.objectContaining({items:[{price:'price_owner',quantity:1}],metadata:expect.objectContaining({owner_billing:'monthly'})}),
  ]}),{idempotencyKey:'housing-rollover-phases:enrollment'});
 });
 it('sends old ambiguous activation attempts to review rather than reusing an expired Stripe key',async()=>{
  fake.row.activation_started_at=new Date(Date.now()-21*3600_000).toISOString();const {stripe,mocks}=stripeMock();
  expect(await processHousingActivations(stripe)).toEqual({processed:0,failed:1});expect(mocks.subscriptions.create).not.toHaveBeenCalled();expect(fake.row.state).toBe('review');
 });
 it('handles out-of-order subscription events using current Stripe state and exposes bank confirmation',async()=>{
  const {stripe,remote}=stripeMock();remote.push(subscription('incomplete'));
  const event={type:'customer.subscription.updated',data:{object:subscription('active')}} as unknown as Stripe.Event;
  expect(await handleHousingBillingWebhook(stripe,event)).toBe(true);
  expect(fake.rpc).toHaveBeenCalledWith('sync_housing_subscription',expect.objectContaining({p_status:'incomplete',p_payment_url:'https://invoice.stripe.com/test'}));
 });
 it('rejects price drift and exclusive tax and fits the complete agreed terms in Stripe Checkout',()=>{
  for(const billing of ['listing','monthly','quarterly'] as const){expect(()=>validateHousingPrice(price(billing),billing)).not.toThrow();expect(housingOfferTerms(billing).length).toBeLessThanOrEqual(1200);}
  expect(()=>validateHousingPrice({...price(),tax_behavior:'exclusive'},'monthly')).toThrow();
  expect(()=>validateHousingPrice({...price(),unit_amount:9000},'monthly')).toThrow();
  expect(housingSubscriptionParams(fake.row as any).metadata).toEqual(expect.objectContaining({housing_enrollment_id:'enrollment'}));
 });
});
