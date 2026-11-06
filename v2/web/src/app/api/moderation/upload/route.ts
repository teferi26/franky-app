import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/api-helpers';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { SOCIAL_MEDIA_TYPES,socialPendingBucket,SOCIAL_APPROVED_BUCKET } from '@/lib/social-media-upload';
export const dynamic='force-dynamic';
const input=z.object({mime:z.string().max(60),bytes:z.number().int().positive().max(1024*1024*1024)}).strict();
export async function POST(req:Request){
 const auth=await createRequestSupabase(req);
 const {data:{user}}=await auth.auth.getUser();
 if(!user)return NextResponse.json({message:'Inicia sesión.'},{status:401});
 const limit=await rateLimit(req,{key:'social-private-upload',subject:user.id,limit:20,windowMs:3600000});
 if(!limit.ok)return limit.response;
 const body=await validateBody(req,input,{maxBytes:1024});
 if(body instanceof NextResponse)return body;
 const type=SOCIAL_MEDIA_TYPES[body.mime];
 if(!type||body.bytes>type.max)return NextResponse.json({message:'El formato o tamaño no es válido.'},{status:400});
 const {data:accepted,error:termsError}=await auth.rpc('community_terms_accepted');
 if(termsError)return NextResponse.json({message:'No se pudieron comprobar las normas.'},{status:503});
 if(accepted!==true)return NextResponse.json({message:'Acepta las normas de la comunidad antes de publicar.'},{status:403});
 const admin=createAdminSupabase(),id=crypto.randomUUID(),path=`${user.id}/${id}.${type.ext}`;
 const publicPath=`${id}.${type.ext}`;
 const {data:{publicUrl}}=admin.storage.from(SOCIAL_APPROVED_BUCKET).getPublicUrl(publicPath);
 const {error}=await admin.rpc('register_staged_social_media',{p_id:id,p_author:user.id,p_path:path,p_public_url:publicUrl,p_mime:body.mime,p_kind:type.kind,p_bytes:body.bytes});
 if(error)return NextResponse.json({message:'No se pudo preparar la subida.'},{status:503});
 const bucket=socialPendingBucket(type.kind);
 const signed=await admin.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
 if(signed.error||!signed.data)return NextResponse.json({message:'No se pudo preparar la subida.'},{status:503});
 // Signed tokens are short lived and returned only to their authenticated owner.
 return NextResponse.json({id,bucket,path,token:signed.data.token,signedUrl:signed.data.signedUrl,publicUrl,type:type.kind},{headers:{'Cache-Control':'private, no-store'}});
}
