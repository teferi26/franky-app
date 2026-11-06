// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),create:vi.fn(),customer:vi.fn(),price:vi.fn(),history:[] as {status:string;metadata:Record<string,string>}[],ownerRows:[] as {status:string}[],queryError:false}));
const owner='11111111-1111-4111-8111-111111111111',listing='22222222-2222-4222-8222-222222222222';
function db(){return {auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:m.rpc,from:m.from};}
vi.mock('@/lib/supabase-server',()=>({createRequestSupabase:async()=>db()}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>db()}));
vi.mock('@/lib/stripe-customer',()=>({getOrCreateOwnedCustomer:m.customer,assertCustomerOwner:vi.fn()}));
vi.mock('@/lib/payment-demo-guard',()=>({isDemoPaymentActor:async()=>false,assertRealPaymentActors:async()=>undefined}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:async()=>({ok:true})}));
vi.mock('@/lib/business-checkout',()=>({BusinessCheckoutError:class extends Error{},startBusinessCheckout:(_stripe:unknown,input:{params:unknown})=>m.create(input.params)}));
vi.mock('stripe',()=>({default:class{checkout={sessions:{create:m.create,list:()=>({data:[],async *[Symbol.asyncIterator](){}}),expire:vi.fn()}};prices={retrieve:m.price};subscriptions={list:()=>({data:m.history,async *[Symbol.asyncIterator](){yield* m.history;}})};}}));
let POST:typeof import('@/app/api/stripe/checkout/route').POST;
let offerGet:typeof import('@/app/api/negocio/housing-offer/route').GET;
let offerPost:typeof import('@/app/api/negocio/housing-offer/route').POST;
beforeAll(async()=>{
 vi.stubEnv('STRIPE_OWNER_MONTHLY_PRICE_ID','legacy_month');vi.stubEnv('STRIPE_OWNER_QUARTERLY_PRICE_ID','legacy_quarter');vi.stubEnv('STRIPE_HOUSING_PRICE_ID','legacy_listing');
 POST=(await import('@/app/api/stripe/checkout/route')).POST;
 const offer=await import('@/app/api/negocio/housing-offer/route');offerGet=offer.GET;offerPost=offer.POST;
});
beforeEach(()=>{
 vi.clearAllMocks();m.history=[];m.ownerRows=[];m.queryError=false;
 vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fixture');vi.stubEnv('HOUSING_DEFERRED_BILLING_READY','false');vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED','false');
 for(const name of ['LISTING','MONTHLY','QUARTERLY'])vi.stubEnv('STRIPE_HOUSING_DEFERRED_'+name+'_PRICE_ID','');
 m.customer.mockResolvedValue('cus_owner');m.create.mockResolvedValue({url:'https://checkout.stripe.com/fixture'});
 // Precios con IVA incluido: el checkout ya no cobra un precio que no cuadre con lo anunciado.
 m.price.mockImplementation(async(id:string)=>({id,active:true,currency:'eur',unit_amount:id==='legacy_month'?8000:id==='legacy_quarter'?19200:999,recurring:{interval:'month',interval_count:id==='legacy_quarter'?3:1},tax_behavior:'inclusive'}));
 m.from.mockImplementation((table:string)=>{
  if(table==='housing_billing_enrollments')throw new Error('Deferred schema must not be queried while OFF');
  const data=table==='owner_subscriptions'?m.ownerRows:table==='accommodations'?{id:listing,owner_id:owner}:null;
  const chain:Record<string,unknown>={};for(const key of ['select','eq','in','limit'])chain[key]=()=>chain;
  const result=()=>({data,error:m.queryError?{message:'unavailable'}:null});
  chain.single=async()=>result();chain.maybeSingle=async()=>result();chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve);return chain;
 });
});
afterEach(()=>{vi.unstubAllEnvs();});
const request=(body:unknown)=>new NextRequest('https://franky.es/api/stripe/checkout',{method:'POST',body:JSON.stringify(body)});
describe('housing release preserves existing billing while deferred contracts are OFF',()=>{
 it.each(['monthly','quarterly'])('retains the %s legacy price, trial and webhook metadata',async billing=>{
  expect((await POST(request({mode:'owner',billing}))).status).toBe(200);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({mode:'subscription',line_items:[{price:billing==='monthly'?'legacy_month':'legacy_quarter',quantity:1}],payment_method_collection:'always',subscription_data:expect.objectContaining({trial_period_days:7,metadata:expect.objectContaining({owner_plan:'true',owner_billing:billing,owner_trial:'true'})})}),expect.objectContaining({idempotencyKey:expect.stringContaining(`owner-checkout:${owner}:${billing}:true:`)}));
  expect(m.rpc).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalledWith('housing_billing_enrollments');
 });
 it('does not repeat the trial after a prior canceled contract',async()=>{
  m.ownerRows=[{status:'canceled'}];expect((await POST(request({mode:'owner',billing:'monthly'}))).status).toBe(200);
  expect(m.create.mock.calls[0][0].subscription_data.trial_period_days).toBeUndefined();expect(m.create.mock.calls[0][0].subscription_data.metadata.owner_trial).toBe('false');
 });
 it.each(['active','trialing','past_due'])('preserves a live %s contract without creating another',async status=>{
  m.history=[{status,metadata:{owner_plan:'true'}}];expect((await POST(request({mode:'owner',billing:'monthly'}))).status).toBe(409);expect(m.create).not.toHaveBeenCalled();
 });
 it('fails closed if the existing contract cannot be checked',async()=>{
  m.queryError=true;expect((await POST(request({mode:'owner',billing:'monthly'}))).status).toBe(503);expect(m.create).not.toHaveBeenCalled();
 });
 it('keeps individual listing billing and its legacy tax configuration',async()=>{
  expect((await POST(request({mode:'business',businessType:'housing',listingId:listing,interval:'month'}))).status).toBe(200);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({mode:'subscription',line_items:[{price:'legacy_listing',quantity:1}],metadata:expect.objectContaining({business_type:'housing'})}));expect(m.rpc).not.toHaveBeenCalled();
 });
 it('never silently changes an explicitly accepted deferred contract to an immediate charge',async()=>{
  expect((await POST(request({mode:'owner',billing:'monthly',offerVersion:'first-interest-v1'}))).status).toBe(409);
  expect(m.customer).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('cannot enable new deferred contracts with unconfigured dedicated prices',async()=>{
  vi.stubEnv('HOUSING_DEFERRED_BILLING_READY','true');vi.stubEnv('HOUSING_FIRST_INTEREST_ENABLED','true');
  expect((await POST(request({mode:'owner',billing:'monthly',offerVersion:'first-interest-v1'}))).status).toBe(409);expect(m.customer).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('returns unavailable before a provider call when Stripe is not configured',async()=>{
  vi.stubEnv('STRIPE_SECRET_KEY','');expect((await POST(request({mode:'owner',billing:'monthly'}))).status).toBe(503);expect(m.customer).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
 });
 it('disabled offer reads and cancellation avoid missing tables and RPCs',async()=>{
  expect(await(await offerGet(new NextRequest('https://franky.es/api/negocio/housing-offer'))).json()).toEqual({offers:[],enabled:false});
  expect((await offerPost(request({id:listing}))).status).toBe(409);expect(m.from).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
});
