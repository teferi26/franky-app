// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
vi.mock('@/lib/origin-stripe',()=>({originMerchantAccount:async()=>({id:'acct_1UFdIBDJDdryynxQ'})}));
const m=vi.hoisted(()=>({rpc:vi.fn(),limit:vi.fn(),start:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));
vi.mock('@/lib/origin-checkout',()=>({originRpc:m.rpc,secretMatches:(a:unknown,b:unknown)=>!!a&&!!b&&a===b,tokenHash:()=> 'hashed',platformAccount:async()=> 'acct_franky',reconcileOriginPending:async()=>{},startOriginCheckout:m.start,getOriginOrder:m.get}));
import {POST as quote} from '@/app/api/partners/origin/quote/route';
import {POST as checkout} from '@/app/api/partners/origin/checkout/route';
const eventId='f15ca9d5-fb77-45f5-959b-ddc4c7f3459d',requestId='00000000-0000-4000-8000-000000000001';
const req=(body:object,auth='Bearer test')=>new NextRequest('https://franky.es/api/partners/origin/quote',{method:'POST',headers:{authorization:auth,'Content-Type':'application/json','x-origin-client-ip':'192.0.2.10'},body:JSON.stringify(body)});
const purchase=()=>({requestId,eventId,token:'a'.repeat(64),name:'Test User',email:'buyer@example.test',size:'ninguna',termsAccepted:true,code:' ORIGIN15 ',expectedAmountCents:1692});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ORIGIN_PARTNER_SECRET','test');m.limit.mockResolvedValue({ok:true});m.start.mockResolvedValue({orderId:requestId,state:'pending',url:'https://checkout.stripe.com/test'});});
describe('ORIGIN coupons trust boundary',()=>{
 it('rejects a public caller before querying coupon data',async()=>{expect((await quote(req({eventId,size:'ninguna',code:'X'},''))).status).toBe(401);expect(m.rpc).not.toHaveBeenCalled();});
 it('quotes only the server amount and strips private coupon identifiers',async()=>{m.rpc.mockResolvedValue({base_amount_cents:1990,discount_cents:298,amount_cents:1692,discount_code:'ORIGIN15',discount_code_id:'private'});const response=await quote(req({eventId,size:'ninguna',code:' origin15 '}));expect(await response.json()).toEqual({baseAmountCents:1990,discountCents:298,amountCents:1692,code:'ORIGIN15'});expect(response.headers.get('Cache-Control')).toContain('no-store');expect(m.rpc).toHaveBeenCalledWith('quote_origin_event_order',{p_event:eventId,p_size:'ninguna',p_code:'origin15'});});
 it.each([{amountCents:1},{discountCents:9999},{code:'x'.repeat(65)},{size:'XXXL'}])('rejects tampered quote payload %j',async patch=>{expect((await quote(req({eventId,size:'ninguna',code:'X',...patch}))).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();});
 it('honors rate limiting before looking up a coupon',async()=>{m.limit.mockResolvedValue({ok:false,response:NextResponse.json({error:'Límite'},{status:429})});expect((await quote(req({eventId,size:'ninguna',code:'X'}))).status).toBe(429);expect(m.rpc).not.toHaveBeenCalled();});
 it('does not expose database errors',async()=>{m.rpc.mockRejectedValue(new Error('secret database detail'));const response=await quote(req({eventId,size:'ninguna',code:'X'}));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret');});
 it('passes code and expected total to atomic reservation, never a trusted discount',async()=>{m.rpc.mockResolvedValue({id:requestId,amount_cents:1692});expect((await checkout(req(purchase()))).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('prepare_origin_discount_order',expect.objectContaining({p_code:'ORIGIN15',p_expected_amount:1692,p_token_hash:'hashed'}));expect(m.start).toHaveBeenCalledWith({id:requestId,amount_cents:1692});});
 it('permits correcting a rejected coupon only after a rolled-back reservation',async()=>{m.rpc.mockRejectedValue(new Error('El cupón ha agotado sus usos'));const response=await checkout(req(purchase()));expect(response.status).toBe(409);expect(await response.json()).toMatchObject({canEdit:true,error:'El cupón ha agotado sus usos'});expect(m.start).not.toHaveBeenCalled();});
 it('keeps uncertain checkout attempts recoverable instead of allowing duplicate orders',async()=>{m.rpc.mockResolvedValue({id:requestId});m.start.mockRejectedValue(new Error('network timeout'));const response=await checkout(req(purchase()));expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('canEdit');});
 it('resume recovers the frozen order without redeeming or revalidating a coupon',async()=>{m.get.mockResolvedValue({id:requestId,event_id:eventId,amount_cents:1692});expect((await checkout(req({requestId,eventId,token:'a'.repeat(64),action:'resume'}))).status).toBe(200);expect(m.rpc).not.toHaveBeenCalled();});
});
