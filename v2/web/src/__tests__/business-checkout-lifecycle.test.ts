vi.mock('@/lib/payment-demo-guard', () => ({ assertRealPaymentActors: vi.fn().mockResolvedValue(undefined), isDemoPaymentActor: vi.fn().mockResolvedValue(false) }));
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startBusinessCheckout } from '@/lib/business-checkout';
const m=vi.hoisted(()=>({rpc:vi.fn(),update:vi.fn(),write:vi.fn(),create:vi.fn(),retrieve:vi.fn(),expire:vi.fn()}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({rpc:m.rpc,from:()=>({update:(patch:unknown)=>{
 m.update(patch);const q:Record<string,unknown>={};for(const method of ['eq','in','select'])q[method]=()=>q;
 q.single=m.write;q.then=(resolve:(x:unknown)=>void)=>m.write().then(resolve);return q;
}})})}));
const stripe=()=>({checkout:{sessions:{create:m.create,retrieve:m.retrieve,expire:m.expire}}}) as never;
const input=(interval:'month'|'year'='year')=>({owner:'owner',listing:'listing',type:'leisure' as const,interval,params:{customer:'cus_owner',mode:'subscription' as const,line_items:[{price:'new-price'}]}});
const attempt=(patch={})=>({id:'attempt-one',owner_id:'owner',listing_id:'listing',type:'leisure',billing_interval:'year',state:'creating',stripe_session_id:null,created_at:new Date().toISOString(),request_params:{customer:'cus_owner',mode:'subscription',metadata:{checkout_attempt_id:'attempt-one'},line_items:[{price:'frozen-price'}]},...patch});
const session=(patch={})=>({id:'cs_one',status:'open',payment_status:'unpaid',customer:'cus_owner',metadata:{checkout_attempt_id:'attempt-one'},url:'https://checkout.stripe.com/fixture',...patch});
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue({data:attempt()});m.write.mockResolvedValue({data:{id:'attempt-one'},error:null});m.create.mockResolvedValue(session());m.retrieve.mockResolvedValue(session());m.expire.mockResolvedValue(session({status:'expired'}));});
describe('durable per-listing Stripe checkout',()=>{
 it('concurrent opens send the same frozen request and idempotency key',async()=>{
  await Promise.all([startBusinessCheckout(stripe(),input()),startBusinessCheckout(stripe(),input())]);
  expect(m.create.mock.calls[0]).toEqual(m.create.mock.calls[1]);expect(m.create.mock.calls[0][1]).toEqual({idempotencyKey:'business:attempt-one'});
  expect(m.create.mock.calls[0][0].line_items[0].price).toBe('frozen-price');
 });
 it('a lost creation response retries the identical request',async()=>{m.create.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(session());await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow('timeout');await startBusinessCheckout(stripe(),input());expect(m.create.mock.calls[0]).toEqual(m.create.mock.calls[1]);});
 it('a lost persistence response never creates a fresh logical checkout',async()=>{m.write.mockResolvedValueOnce({error:{message:'timeout'}});await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow();await startBusinessCheckout(stripe(),input());expect(m.create.mock.calls[0]).toEqual(m.create.mock.calls[1]);});
 it('reuses an existing matching session',async()=>{m.rpc.mockResolvedValue({data:attempt({stripe_session_id:'cs_one'})});await startBusinessCheckout(stripe(),input());expect(m.create).not.toHaveBeenCalled();});
 it('blocks a completed checkout before webhook delivery',async()=>{m.create.mockResolvedValue(session({status:'complete',payment_status:'paid'}));await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow('completado');expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.update).toHaveBeenCalledWith({state:'complete'});});
 it('does not release a previous cadence when Stripe expiry cannot be confirmed',async()=>{m.rpc.mockResolvedValue({data:attempt({billing_interval:'month'})});m.expire.mockRejectedValue(new Error('timeout'));await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow('cerrar');expect(m.update).not.toHaveBeenCalledWith({state:'closed'});expect(m.rpc).toHaveBeenCalledTimes(1);});
 it('a payment that wins the cancellation race blocks any new cadence',async()=>{m.rpc.mockResolvedValue({data:attempt({billing_interval:'month'})});m.expire.mockRejectedValue(new Error('already paid'));m.retrieve.mockResolvedValue(session({status:'complete',payment_status:'paid'}));await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow('completado');expect(m.update).not.toHaveBeenCalledWith({state:'closed'});});
 it('only opens the new annual attempt after confirmed expiry of the old monthly session',async()=>{
  m.rpc.mockResolvedValueOnce({data:attempt({billing_interval:'month'})}).mockResolvedValueOnce({data:attempt({id:'attempt-two',request_params:{customer:'cus_owner',metadata:{checkout_attempt_id:'attempt-two'}}})});
  m.create.mockResolvedValueOnce(session()).mockResolvedValueOnce(session({id:'cs_two',metadata:{checkout_attempt_id:'attempt-two'}}));
  m.retrieve.mockResolvedValueOnce(session({status:'expired'}));
  const result=await startBusinessCheckout(stripe(),input());expect(result.id).toBe('cs_two');expect(m.update).toHaveBeenCalledWith({state:'closed'});
  expect(m.expire.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[1]);
 });
 it('unknown old attempts cannot outlive the idempotency safety window',async()=>{m.rpc.mockResolvedValue({data:attempt({created_at:new Date(Date.now()-25*60*60_000).toISOString()})});await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow('pendiente de comprobar');expect(m.create).not.toHaveBeenCalled();});
 it('rejects a session from another attempt',async()=>{m.create.mockResolvedValue(session({metadata:{checkout_attempt_id:'other'}}));await expect(startBusinessCheckout(stripe(),input())).rejects.toThrow('mismatch');expect(m.update).not.toHaveBeenCalled();});
});
