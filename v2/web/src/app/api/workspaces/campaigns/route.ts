import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('request'),organizationId:z.string().uuid(),resourceId:z.string().uuid(),title:z.string().trim().min(3).max(140),city:z.string().trim().min(2).max(100),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),budgetCents:z.number().int().min(100).max(10000000),minimumAge:z.union([z.literal(0),z.literal(18)]),requestKey:z.string().uuid()}),
 z.object({action:z.literal('pause'),organizationId:z.string().uuid(),campaignId:z.string().uuid()}),
]);
export async function GET(req:NextRequest){const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Inicia sesión.'},{status:401});const organizationId=req.nextUrl.searchParams.get('organization');if(!z.string().uuid().safeParse(organizationId).success)return NextResponse.json({error:'Elige un espacio.'},{status:400});const{data,error}=await s.rpc('get_workspace_campaigns',{p_organization_id:organizationId});return NextResponse.json(error?{error:'No tienes acceso a estas campañas.'}:data,{status:error?403:200,headers:{'Cache-Control':'private, no-store'}});}
export async function POST(req:NextRequest){const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Inicia sesión.'},{status:401});const limited=await rateLimit(req,{key:'workspace-campaigns',subject:user.id,limit:20,windowMs:60_000});if(!limited.ok)return limited.response;const b=await validateBody(req,schema);if(b instanceof NextResponse)return b;
 const result=b.action==='pause'?await s.rpc('pause_workspace_campaign',{p_organization_id:b.organizationId,p_campaign_id:b.campaignId}):await s.rpc('request_workspace_campaign',{p_organization_id:b.organizationId,p_resource_id:b.resourceId,p_title:b.title,p_city:b.city,p_starts_at:b.startsAt,p_ends_at:b.endsAt,p_budget_cents:b.budgetCents,p_minimum_age:b.minimumAge,p_request_key:b.requestKey});
 const messages:Record<string,string>={reviewed_city_post_required:'La publicación debe estar aprobada para esa ciudad y franja de edad.',campaign_limit:'Ya tienes veinte campañas pendientes o activas.',invalid_campaign:'Revisa las fechas y el presupuesto. La duración máxima es 90 días.',request_conflict:'Esta solicitud ya se registró con otros datos. Recarga para revisarla.'};
 return NextResponse.json(result.error?{error:messages[result.error.message]??'No se pudo completar la operación. Revisa tus permisos y los datos.'}:{result:result.data},{status:result.error?400:200,headers:{'Cache-Control':'private, no-store'}});
}
