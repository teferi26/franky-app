import { File } from 'expo-file-system';
import { WEB_URL,SUPABASE_URL,SUPABASE_ANON_KEY,fetchConTimeout,UPLOAD_TIMEOUT_MS } from './supabase';
import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import type { UploadResult } from './media';

/** Reads file metadata only; XHR streams even large videos from local storage. */
export async function uploadPrivateSocialFile(uri:string,mime:string,maxBytes:number,onProgress?:(fraction:number)=>void,signal?:AbortSignal,expectedOwner?:string):Promise<UploadResult>{
 const owner=captureSessionIdentity();
 if(!owner||expectedOwner&&owner.userId!==expectedOwner)return {ok:false,message:'La sesión ha cambiado. Vuelve a entrar.'};
 try{return await withOwnedRequest(owner,async request=>{
  const file=new File(uri),bytes=file.size;
  if(!file.exists||!Number.isFinite(bytes)||bytes<=0||bytes>maxBytes)return {ok:false,message:'El archivo está vacío o supera el tamaño permitido.'};
  const response=await fetchConTimeout(`${WEB_URL}/api/moderation/upload`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:request.authorization},body:JSON.stringify({mime,bytes}),signal:request.signal});
  request.check();
  if(!response.ok)return {ok:false,message:'No se pudo preparar la subida privada. Comprueba las normas de la comunidad e inténtalo de nuevo.'};
  const data=await response.json() as {signedUrl:string;path:string;publicUrl:string};
  const destination=new URL(data.signedUrl);
  if(destination.origin!==new URL(SUPABASE_URL).origin||!destination.pathname.startsWith('/storage/v1/object/upload/sign/ugc-pending-'))throw new Error('invalid_upload_destination');
  request.check();
  return await new Promise<UploadResult>((resolve)=>{
   const xhr=new XMLHttpRequest();
   const abort=()=>xhr.abort();
   const done=(result:UploadResult)=>{request.signal.removeEventListener('abort',abort);resolve(result);};
   xhr.open('PUT',destination.toString());
   xhr.setRequestHeader('apikey',SUPABASE_ANON_KEY);
   xhr.setRequestHeader('Authorization',request.authorization);
   xhr.setRequestHeader('x-upsert','false');
   xhr.timeout=UPLOAD_TIMEOUT_MS;
   xhr.upload.onprogress=e=>{if(e.lengthComputable&&e.total>0&&!request.signal.aborted)onProgress?.(e.loaded/e.total);};
   xhr.onload=()=>done(xhr.status>=200&&xhr.status<300?{ok:true,path:data.path,publicUrl:data.publicUrl}:{ok:false,message:'No se pudo subir el archivo.'});
   xhr.onerror=()=>done({ok:false,message:'Se cortó la conexión durante la subida.'});
   xhr.onabort=()=>done({ok:false,message:'Subida cancelada.'});
   xhr.ontimeout=()=>done({ok:false,message:'La subida se ha detenido. Inténtalo de nuevo.'});
   const form=new FormData();
   form.append('file',{uri,name:data.path.split('/').pop()??'archivo',type:mime} as unknown as Blob);
   request.signal.addEventListener('abort',abort);
   if(request.signal.aborted){done({ok:false,message:'Subida cancelada.'});return;}
   xhr.send(form);
  });
 },signal);}catch{return {ok:false,message:'No se pudo completar la subida.'};}
}
