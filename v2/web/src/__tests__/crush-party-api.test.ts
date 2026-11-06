// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as feed } from '../app/api/crush/fiesta/[slug]/feed/route';
import { GET as state } from '../app/api/crush/fiesta/[slug]/state/route';
import { POST as join } from '../app/api/crush/fiesta/[slug]/join/route';
import { POST as post } from '../app/api/crush/fiesta/[slug]/posts/route';
import { POST as action } from '../app/api/crush/fiesta/[slug]/action/route';
import { PARTY_DEMO } from '../app/crush/fiesta/model';
type NextServerModule = typeof import('next/server');

const f = vi.hoisted(() => ({ user: 'user-a' as string | null, rpc: vi.fn(), publicRpc: vi.fn(), createRequest: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock('@/lib/publication-review',()=>({processPublicationReviews:vi.fn(async()=>[])}));
vi.mock('next/server',async importOriginal=>({...(await importOriginal<NextServerModule>()),after:vi.fn()}));
vi.mock('@/lib/supabase-server', () => ({ createPublicSupabase: () => ({ rpc: f.publicRpc }), createRequestSupabase: (req: Request) => { f.createRequest(req); return { auth: { getUser: async () => ({ data: { user: f.user ? { id: f.user } : null }, error: null }) }, rpc: f.rpc }; } }));
const id = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const context = { params: Promise.resolve({ slug: 'franky-11-septiembre' }) };
const currentPost = { id, body:'Un hola para la fiesta', display_name:'Nombre', instagram_handle:null, is_anonymous:false, created_at:'2026-09-06T11:00:00Z', reaction_count:0 };
const feedData = () => ({ party:{ ...PARTY_DEMO, id:other }, posts:[currentPost], generated_at:'2026-09-06T11:00:00Z' });
const make = (path: string, body?: unknown, headers: Record<string,string> = {}) => new Request(`https://franky.es/api/crush/fiesta/franky-11-septiembre/${path}`, { method:body === undefined ? 'GET' : 'POST', headers:{ ...(body === undefined ? {} : { 'Content-Type':'application/json' }), ...headers }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
const joinBody = { university_id:PARTY_DEMO.university_id, career:'Enfermería', instagram_handle:'cuenta', display_name:'Mar', birth_date:'2001-01-01', accept_terms:true };
const postBody = { body:'Hola, fiesta', is_anonymous:true, share_instagram:false, screen_consent:true, client_request_id:other,expected_instagram_handle:null,expected_display_name:null };
const stateData = () => ({ party:{...PARTY_DEMO,id:other}, profile:{full_name:'Nombre de prueba',university_id:PARTY_DEMO.university_id,career:'Enfermería',instagram_handle:'cuenta',birth_date:'2001-01-01',opted_in:true,role:'user'}, my_post_ids:[], my_posts:[], joined:true,eligible:true,posting_open:true,needs_birth_date:false,ineligibility_reasons:[],display_name:'Mar' });
const receipt = () => ({ id, party_slug:PARTY_DEMO.slug, available:true, already_created:false, created_at:'2026-09-06T11:00:00Z' });
beforeEach(() => {
  vi.clearAllMocks(); f.user = 'user-a'; f.publicRpc.mockResolvedValue({ data:feedData(), error:null });
  f.rpc.mockImplementation(async name => {
    if (name === 'own_publication_review_status' || name === 'accept_community_terms') return {data:null,error:null};
    if (name === 'get_crush_party_state') return { data:stateData(), error:null };
    if (name === 'get_crush_party_feed') return { data:feedData(), error:null };
    if (name === 'request_ig_for_post') return { data:{ matched:false, instagram_handle:'must_not_leak' }, error:null };
    if (name === 'join_crush_party') return { data:stateData(), error:null };
    return { data:receipt(), error:null };
  });
});
describe('Public party projection exposes only consented display fields', () => {
  it('does not read a session and strips extra user fields even if the RPC adds them', async () => {
    f.publicRpc.mockResolvedValue({ data:{ ...feedData(), profiles:['private'], posts:[{ ...currentPost, author_id:'private-user', email:'private@example.invalid', career:'Private' }] }, error:null });
    const response = await feed(make('feed'),context); expect(response.status).toBe(200); expect(f.createRequest).not.toHaveBeenCalled();
    const body = await response.json(); expect(Object.keys(body.posts[0])).toHaveLength(7); expect(JSON.stringify(body)).not.toContain('private'); expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('never publishes a name or Instagram alongside an anonymous post', async () => {
    f.publicRpc.mockResolvedValue({ data:{ ...feedData(), posts:[{ ...currentPost, is_anonymous:true, instagram_handle:'hidden_handle' }] }, error:null });
    const body = await (await feed(make('feed'),context)).json(); expect(body.posts[0]).toMatchObject({ display_name:null, instagram_handle:null });
  });
  it('distinguishes unavailable data from an empty party wall', async () => {
    f.publicRpc.mockResolvedValue({ data:null, error:{ message:'database unavailable' } }); expect((await feed(make('feed'),context)).status).toBe(503);
  });
});
describe('Minimal party registration cannot add privileges or bypass consent', () => {
  it('requires authentication for private state and mutations', async () => {
    f.user = null; expect((await state(make('state'),context)).status).toBe(401); expect((await join(make('join',joinBody),context)).status).toBe(401); expect(f.rpc).not.toHaveBeenCalled();
  });
  it('sends only the basic profile fields and explicit consent to the atomic RPC', async () => {
    expect((await join(make('join',joinBody),context)).status).toBe(200);
    expect(f.rpc).toHaveBeenCalledWith('join_crush_party',{p_slug:'franky-11-septiembre',p_university_id:PARTY_DEMO.university_id,p_career:'Enfermería',p_instagram_handle:'cuenta',p_birth_date:'2001-01-01',p_display_name:'Mar',p_accept_terms:true});
  });
  it.each([{role:'admin'},{is_premium:true},{accept_terms:false},{birth_date:'2001-02-30'}])('rejects invalid or unrequested profile fields %j', async extra => {
    expect((await join(make('join',{...joinBody,...extra}),context)).status).toBe(400); expect(f.rpc).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin write before inspecting the session', async () => {
    expect((await join(make('join',joinBody,{Origin:'https://evil.invalid'}),context)).status).toBe(403); expect(f.createRequest).not.toHaveBeenCalled();
  });
  it('does not acknowledge an incomplete or cross-party registration receipt', async () => {
    f.rpc.mockResolvedValueOnce({data:{joined:true},error:null});
    expect((await join(make('join',joinBody),context)).status).toBe(503);
    f.rpc.mockResolvedValueOnce({data:{...stateData(),party:{...stateData().party,slug:'another-party'}},error:null});
    expect((await join(make('join',joinBody),context)).status).toBe(503);
  });
  it('projects the private state without extra profile fields and never caches it', async () => {
    f.rpc.mockResolvedValueOnce({data:{...stateData(),profile:{...stateData().profile,email:'private@example.invalid',secret:'strip-me'}},error:null});
    const response = await state(make('state'),context), body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store'); expect(body.profile).not.toHaveProperty('email'); expect(body.profile).not.toHaveProperty('secret');
  });
  it('does not cache a rejected profile containing personal data', async () => {
    const response = await join(make('join',{...joinBody,accept_terms:false}),context);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
describe('Publishing and contact actions preserve ownership and retry semantics', () => {
  it.each([{screen_consent:false},{share_instagram:true},{body:'W'.repeat(321)}])('rejects an invalid public message %j', async extra => {
    expect((await post(make('posts',{...postBody,...extra}),context)).status).toBe(400); expect(f.rpc).not.toHaveBeenCalled();
  });
  it('retains the client request ID so a retry cannot create a second post', async () => {
    expect((await post(make('posts',postBody),context)).status).toBe(200);
    expect(f.rpc).toHaveBeenCalledWith('create_crush_party_post',expect.objectContaining({p_client_request_id:other,p_screen_consent:true,p_is_anonymous:true,p_share_instagram:false}));
  });
  it('pins the name and handle that were shown in the consent checkboxes', async () => {
    expect((await post(make('posts',{...postBody,is_anonymous:false,share_instagram:true,expected_display_name:'Mar',expected_instagram_handle:'cuenta_visible'}),context)).status).toBe(200);
    expect(f.rpc).toHaveBeenCalledWith('create_crush_party_post',expect.objectContaining({p_expected_display_name:'Mar',p_expected_instagram_handle:'cuenta_visible'}));
  });
  it.each([{is_anonymous:false},{is_anonymous:false,share_instagram:true,expected_display_name:'Mar'},{expected_display_name:'Nombre innecesario'}])('rejects an ambiguous public identity snapshot %j', async extra => {
    expect((await post(make('posts',{...postBody,...extra}),context)).status).toBe(400); expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([{id}, {...receipt(),party_slug:'different-party'}, {...receipt(),available:undefined}])('requires a complete receipt for the same party %j', async data => {
    f.rpc.mockResolvedValueOnce({data,error:null}); expect((await post(make('posts',postBody),context)).status).toBe(503);
  });
  it('reports a previously withdrawn idempotent submission without claiming it is visible', async () => {
    f.rpc.mockResolvedValueOnce({data:{...receipt(),available:false,already_created:true},error:null});
    const response = await post(make('posts',postBody),context); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({id,available:false,already_created:true});
  });
  it.each([['party_rate_limit',429],['adult_required',403],['client_request_conflict',409],['party_closed',409]])('returns an actionable error for %s', async (message,status) => {
    f.rpc.mockResolvedValueOnce({data:null,error:{message,code:'P0001'}}); expect((await post(make('posts',postBody),context)).status).toBe(status);
  });
  it('never reveals a handle without a mutual match', async () => {
    const body = await (await action(make('action',{post_id:id,action:'request'}),context)).json(); expect(body.matched).toBe(false); expect(body.instagram_handle).toBeNull();
  });
  it('does not accept another campus post that is absent from the consented party feed', async () => {
    expect((await action(make('action',{post_id:other,action:'request'}),context)).status).toBe(404); expect(f.rpc).not.toHaveBeenCalledWith('request_ig_for_post',expect.anything());
  });
  it('does not allow deletion of somebody else’s party post', async () => {
    expect((await action(make('action',{post_id:id,action:'delete'}),context)).status).toBe(404); expect(f.rpc).not.toHaveBeenCalledWith('delete_ligar_post',expect.anything());
  });
  it('lets the author remove their own post even after the event closes', async () => {
    f.rpc.mockImplementation(async name => name === 'get_crush_party_state' ? {data:{party:{...PARTY_DEMO,active:false},my_post_ids:[id],joined:true,eligible:false},error:null} : {data:null,error:null});
    expect((await action(make('action',{post_id:id,action:'delete'}),context)).status).toBe(200); expect(f.rpc).toHaveBeenCalledWith('delete_ligar_post',{p_post_id:id});
  });
});
