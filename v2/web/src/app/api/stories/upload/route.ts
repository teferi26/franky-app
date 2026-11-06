import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/api-helpers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({media_url:z.string().url().max(600),media_type:z.enum(['image','video']),caption:z.string().max(500).nullable().optional()}).strict();
export async function POST(req:Request){
 const auth=await createRequestSupabase(req);
 const {data:{user}}=await auth.auth.getUser();
 if(!user)return NextResponse.json({message:'Inicia sesión.'},{status:401});
 const rl=await rateLimit(req,{key:'stories-upload',subject:user.id,limit:15,windowMs:3600000});
 if(!rl.ok)return rl.response;
 const body=await validateBody(req,schema,{maxBytes:4096});
 if(body instanceof NextResponse)return body;
 // The database validates ownership of the private upload, consent and account
 // state again in the same transaction, and keeps this story hidden for review.
 const {data,error}=await createAdminSupabase().from('stories').insert({author_id:user.id,media_url:body.media_url,media_type:body.media_type,caption:body.caption??null}).select('id').single();
 if(error||!data)return NextResponse.json({message:'No se pudo registrar la historia. Comprueba las normas y vuelve a intentarlo.'},{status:400});
 return NextResponse.json({ok:true,id:data.id,status:'pending'},{status:201,headers:{'Cache-Control':'private, no-store'}});
}
