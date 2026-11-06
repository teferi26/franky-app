// @vitest-environment node
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),send:vi.fn()}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({rpc:mocks.rpc})}));
vi.mock('resend',()=>({Resend:class{emails={send:mocks.send};}}));
beforeEach(()=>{vi.resetModules();vi.stubEnv('RESEND_API_KEY','re_fixture');vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:true,error:null});mocks.send.mockResolvedValue({data:{id:'mail-fixture'},error:null});});
afterEach(()=>vi.unstubAllEnvs());
describe('central email demo boundary',()=>{
 it('blocks simulated recipients and sends no message',async()=>{mocks.rpc.mockResolvedValue({data:false,error:null});const{sendEmail}=await import('../lib/email');expect((await sendEmail({to:'demo@franky.invalid',subject:'Test',html:'Test',text:'Test'})).ok).toBe(false);expect(mocks.send).not.toHaveBeenCalled();});
 it('does not infer permission from a database failure',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{code:'offline'}});const{sendEmail}=await import('../lib/email');expect((await sendEmail({to:'real@example.com',subject:'Test',html:'Test',text:'Test'})).ok).toBe(false);expect(mocks.send).not.toHaveBeenCalled();});
 it('checks parsed destination, actor and source payload before real send',async()=>{const{sendEmail}=await import('../lib/email');const result=await sendEmail({to:'Persona <real@example.com>',subject:'Test',html:'Test',text:'Test',actorUserId:'actor',demoContext:{sender_id:'sender'}});expect(result.ok).toBe(true);expect(mocks.rpc).toHaveBeenCalledWith('workspace_email_allowed',{p_to:['real@example.com'],p_actor:'actor',p_payload:{sender_id:'sender'}});expect(mocks.send).toHaveBeenCalledOnce();});
});
