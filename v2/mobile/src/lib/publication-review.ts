import { WEB_URL,fetchConTimeout } from './supabase';
import type { OwnedRequest } from './owned-request';
export async function requestPublicationReview(request:OwnedRequest,id:string):Promise<'approved'|'rejected'|'pending'>{
 try{
  const response=await fetchConTimeout(`${WEB_URL}/api/moderation/process`,{method:'POST',headers:{Authorization:request.authorization},signal:request.signal},55000);
  request.check();
  if(!response.ok)return 'pending';
  const data=await response.json() as {reviews?:{id:string;status:string}[]};
  const status=data.reviews?.find(row=>row.id===id)?.status;
  return status==='approved'||status==='rejected'?status:'pending';
 }catch{request.check();return 'pending';}
}
