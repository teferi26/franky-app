import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('activity'),resourceId:z.string().uuid(),kind:z.enum(['view','open']),consent:z.boolean()}),
 z.object({action:z.literal('report'),resourceId:z.string().uuid(),reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.literal('mute'),resourceId:z.string().uuid()}),
]);
export async function GET(req:NextRequest){const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Inicia sesión para descubrir novedades.'},{status:401});
 const parsed=z.object({city:z.string().trim().min(2).max(100),cursor:z.string().uuid().nullable(),sponsored:z.enum(['true','false']).nullable(),organization:z.string().uuid().nullable()}).safeParse({city:req.nextUrl.searchParams.get('city'),cursor:req.nextUrl.searchParams.get('cursor'),sponsored:req.nextUrl.searchParams.get('sponsored'),organization:req.nextUrl.searchParams.get('organization')});if(!parsed.success)return NextResponse.json({error:'Elige una ciudad válida.'},{status:400});
 const limit=await rateLimit(req,{key:'city-content',subject:user.id,limit:90,windowMs:60_000});if(!limit.ok)return limit.response;
 const {data,error}=await s.rpc('get_city_workspace_posts',{p_city:parsed.data.city,p_cursor:parsed.data.cursor,p_cursor_sponsored:parsed.data.sponsored==='true',p_organization_id:parsed.data.organization,p_limit:20});
 return NextResponse.json(error?{error:'No se pudieron cargar las novedades.'}:data,{status:error?503:200,headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Inicia sesión.'},{status:401});const limited=await rateLimit(req,{key:'city-content-actions',subject:user.id,limit:90,windowMs:60_000});if(!limited.ok)return limited.response;const body=await validateBody(req,input);if(body instanceof NextResponse)return body;
 const result=body.action==='activity'?await s.rpc('record_city_workspace_activity',{p_resource_id:body.resourceId,p_kind:body.kind,p_consent:body.consent}):body.action==='report'?await s.rpc('report_city_workspace_post',{p_resource_id:body.resourceId,p_reason:body.reason}):await s.rpc('mute_city_workspace_org',{p_resource_id:body.resourceId});
 return NextResponse.json(result.error?{error:'No se pudo completar la acción.'}:{ok:true},{status:result.error?400:200,headers:{'Cache-Control':'private, no-store'}});
}
