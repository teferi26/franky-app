"use client";
import type { SupabaseClient } from '@supabase/supabase-js';
import { socialPendingBucket } from './social-media-upload';
export async function uploadPrivateSocialMedia(client:SupabaseClient,owner:string,body:Blob,mime:string){
 const controller=new AbortController();
 const {data:listener}=client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user.id!==owner)controller.abort();});
 try{
  const {data:{session}}=await client.auth.getSession();
  if(controller.signal.aborted||session?.user.id!==owner)throw new Error('La sesión ha cambiado.');
  const response=await fetch('/api/moderation/upload',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({mime,bytes:body.size}),signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw new Error('No se pudo preparar la subida privada. Inténtalo de nuevo.');
  const data=await response.json() as {bucket:string;path:string;token:string;publicUrl:string;type:'image'|'audio'|'video'};
  if(controller.signal.aborted)throw new Error('La sesión ha cambiado.');
  if(data.bucket!==socialPendingBucket(data.type))throw new Error('Destino de subida inválido.');
  const uploaded=await client.storage.from(data.bucket).uploadToSignedUrl(data.path,data.token,body,{contentType:mime});
  if(controller.signal.aborted)throw new Error('La sesión ha cambiado.');
  if(uploaded.error)throw new Error('No se pudo subir el archivo. Inténtalo de nuevo.');
  return {url:data.publicUrl,type:data.type};
 }finally{controller.abort();listener.subscription.unsubscribe();}
}
