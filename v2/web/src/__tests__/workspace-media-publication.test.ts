// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {GET} from '@/app/api/workspaces/media/[...path]/route';
const state=vi.hoisted(()=>({draft:'' as string,published:'' as string,canonical:'' as string,demo:false,suspended:false,versionError:false,user:false,enabled:false,permission:false,accessError:false,sign:vi.fn()}));
const org='00000000-0000-4000-8000-000000000001';
const a=org+'/actor/accepted.jpg',b=org+'/actor/draft.jpg';
vi.mock('@/lib/rate-limit',()=>({rateLimit:async()=>({ok:true})}));
vi.mock('@/lib/supabase-server',()=>({createRequestSupabase:async()=>({auth:{getUser:async()=>({data:{user:state.user?{id:'actor'}:null}})},rpc:async(name:string)=>name==='get_workspace_access'?{data:{enabled:state.enabled},error:state.accessError?{message:'unavailable'}:null}:{data:state.permission,error:null}})}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({
 from:(table:string)=>{let selectedVersion='';let image='';const q:any={};
 for(const method of ['select','eq','in','neq'])q[method]=()=>q;
 q.contains=(column:string,value:{images:string[]}|string[])=>{selectedVersion=column;image=Array.isArray(value)?value[0]:value.images[0];return q;};
 q.limit=async()=>({error:state.versionError?{message:'unavailable'}:null,data:image===(selectedVersion==='data'?state.draft:state.published)?[{source_id:'home',type:'housing'}]:[]});
 q.maybeSingle=async()=>table==='organizations'?{data:{status:state.suspended?'suspended':'active',demo_cohort_id:state.demo?'demo':null},error:null}:{data:image===state.canonical?{id:'home'}:null,error:null};return q;
 },storage:{from:()=>({createSignedUrl:state.sign})}
})}));
const request=(name:string)=>GET(new NextRequest('https://franky.es/api/workspaces/media/'+name),{params:Promise.resolve({path:name.split('/')})});
beforeEach(()=>{vi.clearAllMocks();state.draft=b;state.published=a;state.canonical='https://franky.es/api/workspaces/media/'+a;state.demo=false;state.suspended=false;state.versionError=false;state.user=false;state.enabled=false;state.permission=false;state.accessError=false;state.sign.mockResolvedValue({data:{signedUrl:'https://storage.invalid/private/short-lived'},error:null});});
describe('workspace media publication boundary',()=>{
 it('keeps photo A public when an unpublished draft replaces it with B',async()=>{const response=await request(a);expect(response.status).toBe(307);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(state.sign).toHaveBeenCalledWith(a,60);});
 it('never exposes draft B merely because it is in a resource data field',async()=>{expect((await request(b)).status).toBe(404);expect(state.sign).not.toHaveBeenCalled();});
 it('requires the exact current canonical photo even when a published snapshot still references A',async()=>{state.canonical='https://franky.es/api/workspaces/media/'+b;expect((await request(a)).status).toBe(404);expect(state.sign).not.toHaveBeenCalled();});
 it('keeps all demo and suspended organization images private',async()=>{state.demo=true;expect((await request(a)).status).toBe(404);state.demo=false;state.suspended=true;expect((await request(a)).status).toBe(404);expect(state.sign).not.toHaveBeenCalled();});
 it('does not convert an unavailable publication check into public access',async()=>{state.versionError=true;expect((await request(a)).status).toBe(503);expect(state.sign).not.toHaveBeenCalled();});
 it('allows an authorized active workspace to preview its private draft',async()=>{state.user=true;state.permission=true;state.enabled=true;expect((await request(b)).status).toBe(307);expect(state.sign).toHaveBeenCalledWith(b,60);});
 it('does not use imported ownership to expose a private draft while rollout is off',async()=>{state.user=true;state.permission=true;expect((await request(b)).status).toBe(404);expect(state.sign).not.toHaveBeenCalled();});
 it('fails closed when workspace availability cannot be checked',async()=>{state.user=true;state.permission=true;state.enabled=true;state.accessError=true;expect((await request(b)).status).toBe(404);expect(state.sign).not.toHaveBeenCalled();});
 it('preserves an already public canonical image when rollout is disabled',async()=>{state.user=true;state.permission=true;expect((await request(a)).status).toBe(307);expect(state.sign).toHaveBeenCalledWith(a,60);});
});
