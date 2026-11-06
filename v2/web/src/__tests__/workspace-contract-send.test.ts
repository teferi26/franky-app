// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from '@/app/api/contracts/[id]/send/route';
import {validateContractAnswers} from '../../../shared/contracts';
import {moneyInputCents} from '../../../shared/housing-operations';

const state=vi.hoisted(()=>({client:vi.fn(),rpc:vi.fn(),contract:null as any,user:{id:'finance-user'} as {id:string}|null}));
vi.mock('@/lib/supabase-server',()=>({createRequestSupabase:state.client}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({rpc:state.rpc})}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:async()=>({ok:true})}));
const id='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002';
const answers={landlord_name:'Titular',landlord_nif:'Documento',property_address:'Dirección del contrato',start_date:'2026-10-01',duration_years:1,rent_monthly_eur:600,deposit_months:1};
beforeEach(()=>{vi.clearAllMocks();state.user={id:'finance-user'};state.contract={id,owner_id:'legal-owner',status:'draft',answers,updated_at:'2026-09-22T12:01:00.123456+00:00'};state.rpc.mockResolvedValue({data:{ok:true},error:null});state.client.mockImplementation(async()=>{const q:any={};for(const method of ['select','eq'])q[method]=()=>q;q.maybeSingle=async()=>({data:state.contract,error:null});return{auth:{getUser:async()=>({data:{user:state.user}})},from:()=>q};});});
const send=(extra:object={})=>{const request=new NextRequest(`https://franky.es/api/contracts/${id}/send`,{method:'POST',headers:{Authorization:'Bearer native-token'},body:JSON.stringify({tenant_ids:[tenant],...extra})});return {request,response:POST(request,{params:Promise.resolve({id})})};};
describe('professional contract send',()=>{
 it('uses request authentication and computes the frozen digest/amounts while retaining actor identity',async()=>{const {request,response}=send({expected_updated_at:state.contract.updated_at});expect((await response).status).toBe(200);expect(state.client).toHaveBeenCalledWith(request);expect(state.rpc).toHaveBeenCalledWith('send_contract_verified',expect.objectContaining({p_actor:'finance-user',p_expected_updated_at:state.contract.updated_at,p_expected_answers:answers,p_rent_cents:60000,p_deposit_cents:60000,p_content_sha256:expect.stringMatching(/^[a-f0-9]{64}$/)}));});
 it('does not send another version than the one the teammate reviewed',async()=>{const {response}=send({expected_updated_at:'2026-09-22T12:01:00.123455+00:00'});expect((await response).status).toBe(409);expect(state.rpc).not.toHaveBeenCalled();});
 it('validates complete data before any service privilege is used',async()=>{state.contract.answers={...answers,start_date:'2026-02-31'};expect((await send().response).status).toBe(400);expect(state.rpc).not.toHaveBeenCalled();});
 it('propagates an atomic database revocation instead of claiming the document was sent',async()=>{state.rpc.mockResolvedValue({data:null,error:{message:'contract_not_found'}});expect((await send().response).status).toBe(409);});
 it('requires a real authenticated actor',async()=>{state.user=null;expect((await send().response).status).toBe(401);expect(state.rpc).not.toHaveBeenCalled();});
});
describe('rental form validation',()=>{
 it('rejects numeric strings and out-of-range legal form inputs',()=>{expect(validateContractAnswers({...answers,duration_years:'2'})).toBeTruthy();expect(validateContractAnswers({...answers,deposit_months:3})).toBeTruthy();expect(validateContractAnswers(answers)).toBeNull();});
 it('accepts exact decimal money but rejects precision loss and nonpositive amounts',()=>{expect(moneyInputCents('600,50')).toBe(60050);expect(moneyInputCents('12.345')).toBeNull();expect(moneyInputCents('-10')).toBeNull();expect(moneyInputCents('0')).toBeNull();});
});
