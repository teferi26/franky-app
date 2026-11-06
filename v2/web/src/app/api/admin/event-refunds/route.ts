import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createRequestSupabase} from '@/lib/supabase-server';
import {validateBody} from '@/lib/api-helpers';
const body=z.object({id:z.string().uuid(),action:z.enum(['approve','reject']),reason:z.string().trim().min(5).max(1000)});
export async function GET(req:NextRequest){const s=await createRequestSupabase(req);const cursor=req.nextUrl.searchParams.get('after');if(cursor&&!z.string().uuid().safeParse(cursor).success)return NextResponse.json({error:'Página inválida.'},{status:400});const{data,error}=await s.rpc('admin_event_refunds',{p_cursor:cursor});return NextResponse.json(error?{error:'Accede como administrador y confirma el segundo factor.'}:data,{status:error?403:200,headers:{'Cache-Control':'private, no-store'}});}
export async function POST(req:NextRequest){const s=await createRequestSupabase(req);const b=await validateBody(req,body);if(b instanceof NextResponse)return b;const{error}=await s.rpc('admin_event_refund_action',{p_id:b.id,p_action:b.action,p_reason:b.reason});return NextResponse.json(error?{error:'No se pudo guardar la decisión. Comprueba el segundo factor y el estado actual del expediente.'}:{ok:true},{status:error?400:200,headers:{'Cache-Control':'private, no-store'}});}
