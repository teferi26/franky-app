import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
export const runtime='nodejs';
const schema=z.object({userId:z.string().uuid(),action:z.enum(['reset','revoke','restore','rotate_password']),reason:z.string().trim().min(5).max(1000)}).strict();
export async function GET(req:NextRequest){
 const auth=await requireAdminRequest(req);if(auth instanceof NextResponse)return auth;
 const {data,error}=await auth.supabase.rpc('admin_workspace_demos');
 if(error)return adminJson({error:'Se requiere una sesión administradora con verificación en dos pasos.'},{status:error.code==='42501'?403:503});
 return adminJson({items:data});
}
export async function POST(req:NextRequest){
 const auth=await requireAdminRequest(req);if(auth instanceof NextResponse)return auth;
 const limited=await rateLimit(req,{key:'admin-demos',subject:auth.user.id,limit:10,windowMs:60_000});if(!limited.ok)return limited.response;
 const body=await validateBody(req,schema);if(body instanceof NextResponse)return body;
 // The user-scoped RPC checks live admin + AAL2 and the reserved demo registry
 // before any service-level Auth call can touch an identity.
 const {data,error}=await auth.supabase.rpc('admin_workspace_demo_action',{p_user_id:body.userId,p_action:body.action,p_reason:body.reason});
 if(error)return adminJson({error:error.code==='42501'?'Verifica tu sesión en dos pasos.':'La operación demo no está disponible. No se ha modificado ninguna cuenta real.'},{status:error.code==='42501'?403:400});
 if(body.action==='reset')return adminJson({result:data});
 const service=createAdminSupabase();
 const password=body.action==='rotate_password'?randomBytes(30).toString('base64url'):undefined;
 const attributes=password?{password}:{ban_duration:body.action==='revoke'?'876000h':'none'};
 const updated=await service.auth.admin.updateUserById(body.userId,attributes);
 if(updated.error)return adminJson({error:body.action==='revoke'?'El acceso a los datos ya está revocado. Falta completar el bloqueo de inicio de sesión; vuelve a revocar.':'La actualización del acceso no se ha completado; repite la operación.'},{status:503});
 return adminJson({result:data,...(password?{credentials:{email:updated.data.user.email,password}}:{})});
}
