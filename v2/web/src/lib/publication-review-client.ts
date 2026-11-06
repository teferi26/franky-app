"use client";
import { createClient } from './supabase-client';
export async function requestPublicationReview(owner:string,isCurrent:()=>boolean,id:string):Promise<'approved'|'rejected'|'pending'>{
 const client=createClient(),controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),55000);
 const {data:listener}=client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user.id!==owner)controller.abort();});
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!isCurrent()||controller.signal.aborted||session?.user.id!==owner)return 'pending';
  const res=await fetch('/api/moderation/process',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:'no-store'});
  if(!res.ok)return 'pending';
  const data=await res.json() as {reviews?:{id:string;status:string}[]};
  const status=data.reviews?.find(row=>row.id===id)?.status;
  return status==='approved'||status==='rejected'?status:'pending';
 }catch{return 'pending';}finally{clearTimeout(timeout);controller.abort();listener.subscription.unsubscribe();}
}
