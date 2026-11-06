// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn(),listener:null as any,unsubscribe:vi.fn(),confirm:vi.fn()}));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({auth:{getSession:f.session,onAuthStateChange:(cb:any)=>{f.listener=cb;return {data:{subscription:{unsubscribe:f.unsubscribe}}};}},rpc:f.rpc})}));
import {ensureCommunityTerms} from '@/lib/community-terms-client';
let token:string,signal:AbortSignal;
beforeEach(()=>{
 vi.clearAllMocks();token='';
 f.session.mockResolvedValue({data:{session:{user:{id:'a'},access_token:'synthetic-a'}}});
 f.confirm.mockResolvedValue(true);
 f.rpc.mockImplementation((name:string)=>{
  const query={setHeader:(_name:string,value:string)=>{token=value;return query;},abortSignal:(value:AbortSignal)=>{signal=value;return query;},then:(resolve:any)=>Promise.resolve({data:name==='community_terms_accepted'?false:null,error:null}).then(resolve)};return query;
 });
});
describe('Versioned community agreement',()=>{
 it('requires an explicit decision and saves the version using the original account token',async()=>{
  expect(await ensureCommunityTerms('a',()=>true,f.confirm)).toBe(true);
  expect(f.confirm).toHaveBeenCalledWith(expect.objectContaining({termsLink:true,confirmText:'He leído y acepto'}));
  expect(f.rpc).toHaveBeenCalledWith('accept_community_terms',{p_version:'2026-09-10'});
  expect(token).toBe('Bearer synthetic-a');expect(f.unsubscribe).toHaveBeenCalledOnce();
 });
 it('does not save consent when the person cancels',async()=>{
  f.confirm.mockResolvedValue(false);
  expect(await ensureCommunityTerms('a',()=>true,f.confirm)).toBe(false);
  expect(f.rpc).toHaveBeenCalledTimes(1);
 });
 it('cannot apply a confirmation after logout and login to the same account',async()=>{
  f.confirm.mockImplementation(async()=>{f.listener('SIGNED_OUT',null);f.listener('SIGNED_IN',{user:{id:'a'}});return true;});
  await expect(ensureCommunityTerms('a',()=>true,f.confirm)).rejects.toThrow('La sesión ha cambiado');
  expect(f.rpc).toHaveBeenCalledTimes(1);expect(signal.aborted).toBe(true);
 });
 it('refuses a different account before looking up or saving consent',async()=>{
  f.session.mockResolvedValue({data:{session:{user:{id:'b'},access_token:'synthetic-b'}}});
  await expect(ensureCommunityTerms('a',()=>true,f.confirm)).rejects.toThrow('Inicia sesión');
  expect(f.rpc).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
 });
});

