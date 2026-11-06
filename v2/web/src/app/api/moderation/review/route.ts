import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/api-helpers';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { copyApprovedReviewMedia, type PublicationReview } from '@/lib/publication-review';
import { socialPendingBucket } from '@/lib/social-media-upload';

export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
const input=z.object({id:z.uuid(),revision:z.uuid(),decision:z.enum(['approved','rejected']),note:z.string().trim().min(3).max(1000),reviewed_all_content:z.literal(true)}).strict();

export async function GET(req:Request){
 const auth=await createRequestSupabase(req);
 const {data:{user}}=await auth.auth.getUser();
 if(!user)return json({message:'Inicia sesión.'},401);
 const id=new URL(req.url).searchParams.get('id');
 if(!z.uuid().safeParse(id).success)return json({message:'Caso no válido.'},400);
 // This RPC checks the caller's live staff role AND MFA before any service use.
 const {data,error}=await auth.rpc('admin_get_publication_review',{p_id:id});
 if(error)return json({message:'Verifica tu acceso de moderación con doble factor.'},403);
 if(!data)return json({message:'El caso ya no existe.'},404);
 const job=data as PublicationReview;
 let preview:string|null=null;
 if(job.media){
  const signed=await createAdminSupabase().storage.from(socialPendingBucket(job.media.media_kind)).createSignedUrl(job.media.path,300);
  if(signed.error)return json({message:'No se pudo abrir el adjunto. No apruebes contenido sin revisarlo.'},503);
  preview=signed.data.signedUrl;
 }
 return json({id:job.id,revision:job.revision,document:job.document,preview});
}

export async function POST(req:Request){
 const auth=await createRequestSupabase(req);
 const {data:{user}}=await auth.auth.getUser();
 if(!user)return json({message:'Inicia sesión.'},401);
 const body=await validateBody(req,input,{maxBytes:2048});
 if(body instanceof NextResponse)return body;
 const claimed=await auth.rpc('admin_claim_publication_review',{p_id:body.id,p_revision:body.revision,p_note:body.note});
 if(claimed.error||!claimed.data)return json({message:'El caso ha cambiado, está siendo revisado o falta verificar tu sesión con doble factor. Actualiza la cola.'},409);
 const job=claimed.data as PublicationReview;
 try{
  if(body.decision==='approved')await copyApprovedReviewMedia(job);
  const finished=await createAdminSupabase().rpc('finish_publication_review',{p_id:job.id,p_revision:job.revision,p_lease:job.lease_id,p_decision:body.decision,p_reason:'human_review'});
  if(finished.error||finished.data!==true)throw new Error('review_not_committed');
  return json({ok:true});
 }catch{
  return json({message:'No se ha publicado. El contenido permanece retenido; vuelve a revisar el caso en unos minutos.'},503);
 }
}
