import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { withOwnedRequest } from './owned-request';
import { WEB_URL, fetchConTimeout } from './supabase';
import type { SessionIdentity } from './session';
export async function contractRequest<T>(id:string,action:'send'|'sign'|'cancel'|'',body:unknown,owner:SessionIdentity|null):Promise<T> {
 return withOwnedRequest(owner,async request=>{
  const response=await fetchConTimeout(`${WEB_URL}/api/contracts/${encodeURIComponent(id)}${action?`/${action}`:''}`,{method:body===undefined?'GET':'POST',headers:{Authorization:request.authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:request.signal},30000);
  request.check();const result=await response.json();request.check();if(!response.ok)throw new Error(result.error??'No se pudo completar la operación.');return result as T;
 });
}
export async function shareContractPdf(id:string,owner:SessionIdentity|null,stillCurrent:()=>boolean=()=>true):Promise<void> {
 return withOwnedRequest(owner,async request=>{
  let file:File|null=null;
  try {
   const response=await fetchConTimeout(`${WEB_URL}/api/contracts/${encodeURIComponent(id)}/pdf`,{headers:{Authorization:request.authorization},signal:request.signal},45000);
   request.check();if(!stillCurrent())throw new Error('workspace_changed');if(!response.ok)throw new Error('No se pudo generar el documento.');
   const bytes=new Uint8Array(await response.arrayBuffer());request.check();
   if(bytes.byteLength>10*1024*1024||!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('Documento no disponible.');
   if(!await Sharing.isAvailableAsync())throw new Error('Este dispositivo no permite compartir documentos.');request.check();if(!stillCurrent())throw new Error('workspace_changed');
   file=new File(Paths.cache,`contrato-${request.owner.userId}-${Date.now()}.pdf`);file.create();file.write(bytes);request.check();
   await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf',dialogTitle:'Revisar contrato Franky'});request.check();
  } finally { if(file?.exists)file.delete(); }
 });
}
