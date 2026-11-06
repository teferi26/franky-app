import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackAcademicConsultation } from '@/lib/academic-analytics';
const fixture=vi.hoisted(()=>({getSession:vi.fn(),rpc:vi.fn(),setHeader:vi.fn(),createClient:vi.fn()}));
vi.mock('@/lib/supabase-client',()=>({createClient:fixture.createClient}));
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();
 fixture.getSession.mockResolvedValue({data:{session:{access_token:'synthetic-user-a'}}});
 fixture.setHeader.mockResolvedValue({data:true,error:null});fixture.rpc.mockReturnValue({setHeader:fixture.setHeader});
 fixture.createClient.mockReturnValue({auth:{getSession:fixture.getSession},rpc:fixture.rpc});
});
describe('optional academic consultation telemetry',()=>{
 it('does not initialize analytics without affirmative consent',async()=>{
  await trackAcademicConsultation('university','fixture-id');expect(fixture.createClient).not.toHaveBeenCalled();
  localStorage.setItem('franky_cookie_consent','{"analytics":false}');await trackAcademicConsultation('career','fixture-id');expect(fixture.createClient).not.toHaveBeenCalled();
 });
 it('pins authorization and sends identifiers rather than free text',async()=>{
  localStorage.setItem('franky_cookie_consent','{"analytics":true}');await trackAcademicConsultation('cutoff','fixture-id');
  expect(fixture.rpc).toHaveBeenCalledWith('track_institutional_consultation',{p_kind:'cutoff',p_entity_id:'fixture-id',p_consent:true,p_platform:'web'});
  expect(fixture.setHeader).toHaveBeenCalledWith('Authorization','Bearer synthetic-user-a');
 });
 it('does not record guests and never breaks browsing on a telemetry failure',async()=>{
  localStorage.setItem('franky_cookie_consent','{"analytics":true}');fixture.getSession.mockResolvedValueOnce({data:{session:null}});
  await trackAcademicConsultation('career','fixture-id');expect(fixture.rpc).not.toHaveBeenCalled();
  fixture.setHeader.mockRejectedValueOnce(Error('offline'));await expect(trackAcademicConsultation('career','fixture-id')).resolves.toBeUndefined();
 });
});
