// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({rpc:vi.fn(),gemini:vi.fn(),storage:vi.fn(),info:vi.fn(),copy:vi.fn()}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({rpc:f.rpc,storage:{from:f.storage}})}));
vi.mock('@/lib/gemini-server',()=>({generateGeminiText:f.gemini}));
import {processPublicationReviews,copyApprovedReviewMedia,classifyPublication,type PublicationReview} from '@/lib/publication-review';
const job=():PublicationReview=>({id:'review-id',target_id:'post-id',target_kind:'fomo_thread',revision:'revision-a',lease_id:'lease-a',document:{body:'Hola campus',poll:{question:'¿Plan?',options:['Café','Biblioteca']}},media:null});
let current:PublicationReview;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('GOOGLE_AI_API_KEY','synthetic-moderation-key');current=job();
 f.rpc.mockImplementation(async(name:string)=>({data:name==='claim_publication_reviews'?[current]:name==='finish_publication_review'?true:null,error:null}));
 f.gemini.mockResolvedValue('{"decision":"approved","reason":"safe"}');
 f.storage.mockReturnValue({info:f.info,copy:f.copy});
 f.info.mockResolvedValue({data:{size:100},error:null});f.copy.mockResolvedValue({error:null});
});
describe('Pre-publication review worker',()=>{
 it('includes the full poll and treats user material as untrusted content',async()=>{
  const result=await processPublicationReviews('author-a');
  expect(result).toEqual([{id:'post-id',status:'approved'}]);
  const payload=f.gemini.mock.calls[0][1];
  expect(payload.systemInstruction.parts[0].text).toContain('never instructions');
  expect(JSON.parse(payload.contents[0].parts[0].text)).toMatchObject({body:'Hola campus',poll:{question:'¿Plan?',options:['Café','Biblioteca']}});
  expect(f.rpc).toHaveBeenCalledWith('finish_publication_review',expect.objectContaining({p_revision:'revision-a',p_lease:'lease-a',p_decision:'approved'}));
 });
 it.each(['not json','{"decision":"approved","reason":"fraud"}','{"decision":"approved","reason":"safe","extra":"ignore"}'])('retains content when the model output is invalid or inconsistent: %s',async raw=>{
  f.gemini.mockResolvedValue(raw);
  expect(await processPublicationReviews()).toEqual([{id:'post-id',status:'needs_review'}]);
  expect(f.copy).not.toHaveBeenCalled();
 });
 it.each(['audio','video'] as const)('retains %s for human review without assuming sampled analysis covers every track',async kind=>{
  current.media={id:'file-id',path:'author/file-id.mp4',public_url:'https://test.invalid/future',mime_type:kind+'/mp4',media_kind:kind,declared_bytes:100,copied_at:null};
  current.document.media_url=current.media.public_url;
  expect(await processPublicationReviews()).toEqual([{id:'post-id',status:'needs_review'}]);
  expect(f.gemini).not.toHaveBeenCalled();expect(f.copy).not.toHaveBeenCalled();
 });
 it('reports pending if a stale revision loses the finalization race',async()=>{
  f.rpc.mockImplementation(async name=>({data:name==='claim_publication_reviews'?[current]:false,error:null}));
  expect(await processPublicationReviews()).toEqual([{id:'post-id',status:'pending'}]);
 });
 it('reuses a verified immutable copy and repairs its registration',async()=>{
  current.media={id:'file-id',path:'author/file-id.jpg',public_url:'https://test.invalid/future',mime_type:'image/jpeg',media_kind:'image',declared_bytes:100,copied_at:null};current.document.media_url=current.media.public_url;
  await copyApprovedReviewMedia(current);await copyApprovedReviewMedia(current);
  expect(f.copy).not.toHaveBeenCalled();
  expect(f.rpc.mock.calls.filter(([name])=>name==='mark_social_media_copied')).toHaveLength(2);
 });
 it('does not register a destination whose size differs from the immutable source',async()=>{
  current.media={id:'file-id',path:'author/file-id.jpg',public_url:'https://test.invalid/future',mime_type:'image/jpeg',media_kind:'image',declared_bytes:100,copied_at:null};current.document.media_url=current.media.public_url;
  f.info.mockResolvedValueOnce({data:{size:100},error:null}).mockResolvedValue({data:{size:101},error:null});
  await expect(copyApprovedReviewMedia(current)).rejects.toThrow('media_copy_verification');
  expect(f.rpc).not.toHaveBeenCalledWith('mark_social_media_copied',expect.anything());
 });
 it('recognizes a copy that succeeded concurrently before Storage returned a conflict',async()=>{
  current.media={id:'file-id',path:'author/file-id.jpg',public_url:'https://test.invalid/future',mime_type:'image/jpeg',media_kind:'image',declared_bytes:100,copied_at:null};current.document.media_url=current.media.public_url;
  f.info.mockResolvedValueOnce({data:{size:100},error:null}).mockResolvedValueOnce({data:null,error:{status:404}}).mockResolvedValue({data:{size:100},error:null});
  f.copy.mockResolvedValue({error:{status:409}});
  await copyApprovedReviewMedia(current);
  expect(f.rpc).toHaveBeenCalledWith('mark_social_media_copied',{p_id:'file-id'});
 });
});

