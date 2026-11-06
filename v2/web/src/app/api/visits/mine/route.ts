import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createRequestSupabase} from '@/lib/supabase-server';
export async function GET(req:NextRequest){const after=req.nextUrl.searchParams.get('after');if(after&&!z.string().uuid().safeParse(after).success)return NextResponse.json({error:'Página inválida.'},{status:400});const s=await createRequestSupabase(req);const{data,error}=await s.rpc('get_my_workspace_visits',{p_cursor:after});return NextResponse.json(error?{error:'Inicia sesión con la cuenta que reservó las visitas.'}:data,{status:error?403:200,headers:{'Cache-Control':'private, no-store'}});}
