import { NextResponse } from 'next/server';
import { createRequestSupabase } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { processPublicationReviews } from '@/lib/publication-review';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const auth=await createRequestSupabase(req);
 const {data:{user}}=await auth.auth.getUser();
 if(!user)return NextResponse.json({message:'Inicia sesión.'},{status:401});
 const limit=await rateLimit(req,{key:'publication-review',subject:user.id,limit:30,windowMs:3600000});
 if(!limit.ok)return limit.response;
 const {data:profile,error}=await auth.from('profiles').select('is_discarded').eq('id',user.id).maybeSingle();
 if(error||!profile||profile.is_discarded)return NextResponse.json({message:'Cuenta no disponible.'},{status:403});
 try{return NextResponse.json({reviews:await processPublicationReviews(user.id)},{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({message:'El contenido sigue pendiente de revisión.'},{status:503});}
}
