// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({token:vi.fn(),account:vi.fn(),update:vi.fn(),single:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/stripe',()=>({getStripe:()=>({oauth:{token:m.token},accounts:{retrieve:m.account}})}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({from:()=>({update:m.update})})}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));
import {GET} from '@/app/api/partners/origin/connect/callback/route';
import {createOriginConnectState,originConnectCookie,ORIGIN_CONNECT_COOKIE} from '@/lib/origin-connect';
const account='acct_1UFdIBDJDdryynxQ';
function request(valid=true){const state=createOriginConnectState();return new NextRequest(`https://franky.es/api/partners/origin/connect/callback?code=ac_fixture&state=${state}`,{headers:{cookie:`${ORIGIN_CONNECT_COOKIE}=${valid?originConnectCookie(state):'tampered'}`}});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ORIGIN_PARTNER_SECRET','test-secret');m.limit.mockResolvedValue({ok:true});m.token.mockResolvedValue({stripe_user_id:account,livemode:true,scope:'read_write'});m.account.mockResolvedValue({id:account,type:'standard',charges_enabled:true,payouts_enabled:true,details_submitted:true,capabilities:{transfers:'active'}});m.update.mockReturnValue({eq:()=>({select:()=>({single:m.single})})});m.single.mockResolvedValue({data:{id:'row'},error:null});});
describe('Origin OAuth account ownership boundary',()=>{
 it('rejects forged state before exchange or database changes',async()=>{expect((await GET(request(false))).status).toBe(400);expect(m.token).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();});
 it.each([{stripe_user_id:'acct_other'},{livemode:false},{scope:'read_only'}])('rejects incorrect account authorization %j',async patch=>{m.token.mockResolvedValue({stripe_user_id:account,livemode:true,scope:'read_write',...patch});expect((await GET(request())).status).toBe(409);expect(m.update).not.toHaveBeenCalled();});
 it('links only the pinned active Standard account and clears state',async()=>{const r=await GET(request());expect(r.status).toBe(200);expect(m.account).toHaveBeenCalledWith(account);expect(m.update).toHaveBeenCalledWith(expect.objectContaining({stripe_connect_account_id:account,charges_enabled:true}));expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0');});
 it('does not mark a connection successful when saving fails',async()=>{m.single.mockResolvedValue({error:{message:'database unavailable'}});const r=await GET(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain('database');});
 it('refuses inactive payout accounts',async()=>{m.account.mockResolvedValue({type:'standard',charges_enabled:true,payouts_enabled:false});expect((await GET(request())).status).toBe(409);expect(m.update).not.toHaveBeenCalled();});
});
