// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({rpc:vi.fn(),gemini:vi.fn(),from:vi.fn(),download:vi.fn(),upsert:vi.fn()}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({rpc:f.rpc,from:f.from,storage:{from:()=>({download:f.download})}})}));
vi.mock('@/lib/gemini-server',()=>({generateGeminiText:f.gemini}));
import {processPublicationReviews} from '@/lib/publication-review';
const org='11111111-1111-4111-8111-111111111111';
const path=org+'/22222222-2222-4222-8222-222222222222/photo.png';
const url='https://franky.es/api/workspaces/media/'+path;
let canonical:{organization_id:string;image_url:string};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('GOOGLE_AI_API_KEY','synthetic-test-key');canonical={organization_id:org,image_url:url};
 f.rpc.mockImplementation(async(name:string)=>({data:name==='claim_publication_reviews'?[{id:'review',target_id:'community',target_kind:'community',revision:'revision-1',lease_id:'lease',document:{body:'Club de lectura',media_url:url},media:null}]:true,error:null}));
 f.gemini.mockResolvedValue('{"decision":"approved","reason":"safe"}');
 f.from.mockImplementation((table:string)=>table==='workspace_reviewed_media'?{upsert:f.upsert}:{select:()=>({eq:()=>({maybeSingle:async()=>({data:canonical,error:null})})})});
 f.upsert.mockResolvedValue({error:null});
 f.download.mockResolvedValue({data:new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=','base64')],{type:'image/png'}),error:null});
});
describe('private workspace community media review',()=>{
 it('downloads only the canonical private path and records the approved revision',async()=>{
  expect(await processPublicationReviews()).toEqual([{id:'community',status:'approved'}]);
  expect(f.download).toHaveBeenCalledWith(path);
  expect(f.upsert).toHaveBeenCalledWith(expect.objectContaining({path,review_id:'review',revision:'revision-1',mime:'image/png',sha256:expect.stringMatching(/^[0-9a-f]{64}$/)}),expect.anything());
 });
 it('rejects a photograph from another organization before downloading',async()=>{
  canonical.organization_id='33333333-3333-4333-8333-333333333333';
  expect(await processPublicationReviews()).toEqual([{id:'community',status:'needs_review'}]);expect(f.download).not.toHaveBeenCalled();expect(f.upsert).not.toHaveBeenCalled();
 });
 it('cannot approve media removed or replaced since the job was claimed',async()=>{
  canonical.image_url='https://franky.es/api/workspaces/media/'+org+'/another/new.png';
  expect(await processPublicationReviews()).toEqual([{id:'community',status:'needs_review'}]);expect(f.download).not.toHaveBeenCalled();
 });
 it('does not publish if the durable review evidence cannot be saved',async()=>{
  f.upsert.mockResolvedValue({error:{message:'unavailable'}});
  expect(await processPublicationReviews()).toEqual([{id:'community',status:'needs_review'}]);
  expect(f.rpc).toHaveBeenLastCalledWith('finish_publication_review',expect.objectContaining({p_decision:'needs_review'}));
 });
});
