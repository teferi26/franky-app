import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_university'),name:z.string().trim().min(3).max(100),universityIds:z.array(z.string().uuid()).min(1).max(30),managerId:z.string().uuid()}).strict(),
 z.object({action:z.enum(['verify','unverify','suspend','restore']),organizationId:z.string().uuid(),reason:z.string().trim().min(5).max(1000)}).strict(),
 z.object({action:z.literal('release'),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('university_domain'),universityId:z.string().uuid(),domain:z.string().trim().min(3).max(253),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('university_affiliation'),universityId:z.string().uuid(),userId:z.string().uuid(),verified:z.boolean(),evidenceReference:z.string().trim().min(5).max(500),expiresAt:z.string().datetime({offset:true}).nullable()}).strict(),
 z.object({action:z.literal('appeal'),appealId:z.string().uuid(),overturn:z.boolean(),reason:z.string().trim().min(5).max(1000)}).strict(),
 z.object({action:z.literal('academic_patch'),resourceId:z.string().uuid(),updatedAt:z.string().datetime({offset:true}),approve:z.boolean(),reason:z.string().trim().min(5).max(1000)}).strict(),
 z.object({action:z.literal('academic'),resourceId:z.string().uuid(),updatedAt:z.string().datetime({offset:true}),approve:z.boolean(),reason:z.string().trim().min(5).max(1000),field:z.enum(['description','website','phone','email','jpa_url','jpa_label']).nullable(),value:z.string().max(10000).nullable()}).strict(),
]);
export async function GET(req:NextRequest){
 const auth=await requireAdminRequest(req);if(auth instanceof NextResponse)return auth;
 const cursor=req.nextUrl.searchParams.get('cursor');if(cursor&&!z.string().uuid().safeParse(cursor).success)return adminJson({error:'invalid_cursor'},{status:400});
 const mode=req.nextUrl.searchParams.get('mode');
 if(mode==='admission'){const id=req.nextUrl.searchParams.get('universityId');if(!z.string().uuid().safeParse(id).success)return adminJson({error:'Selecciona un campus válido.'},{status:400});const result=await auth.supabase.rpc('admin_list_university_admission_config',{p_university_id:id,p_cursor:cursor,p_limit:30});if(result.error)return adminJson({error:'No se pudo consultar la configuración.'},{status:400});return adminJson({workspaces:result.data});}
 const {data,error}=await auth.supabase.rpc(mode==='appeals'?'admin_workspace_appeals':mode==='proposals'?'admin_workspace_proposals':'admin_list_workspaces',mode==='appeals'||mode==='proposals'?{}:{p_cursor:cursor});
 if(error)return adminJson({error:'No se pudieron cargar los espacios.'},{status:503});
 return adminJson({workspaces:data});
}
export async function POST(req:NextRequest){
 const auth=await requireAdminRequest(req);if(auth instanceof NextResponse)return auth;
 const limit=await rateLimit(req,{key:'admin-workspaces',subject:auth.user.id,limit:20,windowMs:60_000});if(!limit.ok)return limit.response;
 const body=await validateBody(req,bodySchema);if(body instanceof NextResponse)return body;
 let result;
 if(body.action==='create_university')result=await auth.supabase.rpc('admin_create_university_workspace',{p_name:body.name,p_university_ids:body.universityIds,p_manager_id:body.managerId});
 else if(body.action==='release')result=await auth.supabase.rpc('admin_workspace_release',{p_enabled:body.enabled});
 else if(body.action==='university_domain')result=await auth.supabase.rpc('admin_set_university_email_domain',{p_university_id:body.universityId,p_domain:body.domain,p_enabled:body.enabled});
 else if(body.action==='university_affiliation')result=await auth.supabase.rpc('admin_set_university_affiliation',{p_user_id:body.userId,p_university_id:body.universityId,p_verified:body.verified,p_evidence_reference:body.evidenceReference,p_expires_at:body.expiresAt});
 else if(body.action==='appeal')result=await auth.supabase.rpc('admin_resolve_workspace_appeal',{p_appeal_id:body.appealId,p_overturn:body.overturn,p_reason:body.reason});
 else if(body.action==='academic')result=await auth.supabase.rpc('admin_review_workspace_academic',{p_resource_id:body.resourceId,p_updated_at:body.updatedAt,p_approve:body.approve,p_reason:body.reason,p_field:body.field,p_value:body.value});
 else if(body.action==='academic_patch')result=await auth.supabase.rpc('admin_review_workspace_academic_patch',{p_resource_id:body.resourceId,p_updated_at:body.updatedAt,p_approve:body.approve,p_reason:body.reason});
 else result=await auth.supabase.rpc('admin_workspace_action',{p_organization_id:body.organizationId,p_action:body.action,p_reason:body.reason});
 if(result.error)return adminJson({error:result.error.code==='42501'?'Se requiere una sesión de administrador con verificación en dos pasos.':'No se pudo completar la operación. Revisa la asignación y los datos.'},{status:result.error.code==='42501'?403:400});
 return adminJson({result:result.data});
}
