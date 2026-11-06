// @vitest-environment node
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/admin-request',()=>({requireAdminRequest:async()=>({user:{id:'admin'},supabase:{rpc:mocks.rpc}}),adminJson:(data:unknown,options?:ResponseInit)=>Response.json(data,{...options,headers:{'Cache-Control':'private, no-store'}})}));
vi.mock('@/lib/supabase-admin',()=>({createAdminSupabase:()=>({auth:{admin:{updateUserById:mocks.update}}})}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:async()=>({ok:true})}));
vi.mock('@/lib/api-helpers',()=>({validateBody:async(req:Request,schema:{parse:(value:unknown)=>unknown})=>schema.parse(await req.json())}));
import { POST } from '../app/api/admin/demos/route';
const id='10000000-0000-4000-8000-000000000001';
const request=(action:string)=>new NextRequest('http://localhost/api/admin/demos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,userId:id,reason:'Prueba interna autorizada'})});
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:{user_id:id},error:null});mocks.update.mockResolvedValue({data:{user:{email:'owner@demo.franky.invalid'}},error:null});});
describe('demo administration service boundary',()=>{
 it('cannot reach Auth when the live MFA/demo RPC rejects',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}});const response=await POST(request('rotate_password'));expect(response.status).toBe(403);expect(mocks.update).not.toHaveBeenCalled();});
 it('generates a strong unique password only after live authorization',async()=>{const response=await POST(request('rotate_password'));const data=await response.json();expect(data.credentials.password).toMatch(/^[A-Za-z0-9_-]{40}$/);expect(mocks.update).toHaveBeenCalledWith(id,{password:data.credentials.password});expect(response.headers.get('cache-control')).toContain('no-store');});
 it('data reset never changes credentials',async()=>{expect((await POST(request('reset'))).status).toBe(200);expect(mocks.update).not.toHaveBeenCalled();});
 it('reports incomplete Auth revocation without claiming login is banned',async()=>{mocks.update.mockResolvedValue({data:null,error:{message:'offline'}});const response=await POST(request('revoke'));expect(response.status).toBe(503);expect((await response.json()).error).toContain('datos ya está revocado');});
});
