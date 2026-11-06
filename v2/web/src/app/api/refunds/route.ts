import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createRequestSupabase} from '@/lib/supabase-server';
import {validateBody} from '@/lib/api-helpers';
import {rateLimit} from '@/lib/rate-limit';
const body=z.object({type:z.enum(['ticket','visit']),id:z.string().uuid(),reason:z.string().trim().min(5).max(1000)});
export async function GET(req:NextRequest){const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Inicia sesión.'},{status:401});const{data,error}=await s.rpc('get_my_event_refund_requests');return NextResponse.json(error?{error:'No se pudieron consultar las solicitudes.'}:data,{status:error?403:200,headers:{'Cache-Control':'private, no-store'}});}
export async function POST(req:NextRequest){const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Inicia sesión.'},{status:401});const limited=await rateLimit(req,{key:'refund-request',subject:user.id,limit:10,windowMs:60_000});if(!limited.ok)return limited.response;const b=await validateBody(req,body);if(b instanceof NextResponse)return b;const{error}=await s.rpc(b.type==='ticket'?'request_my_event_refund':'request_my_visit_refund',{[b.type==='ticket'?'p_ticket_id':'p_booking_id']:b.id,p_reason:b.reason});return NextResponse.json(error?{error:'Solo la cuenta que hizo la compra puede solicitar su revisión. Comprueba que existe un cobro asociado.'}:{ok:true},{status:error?400:200,headers:{'Cache-Control':'private, no-store'}});}
