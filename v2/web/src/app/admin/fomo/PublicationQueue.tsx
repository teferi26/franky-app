'use client';
import { useCallback,useEffect,useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useAccountGuard } from '@/components/AccountScope';
import { Button } from '@/components/ui/button';
import { Panel,Quiet } from '../components/panel-ui';
type Item={id:string;revision:string;target_kind:string;status:string;created_at:string;document:{body?:string;offer?:string;media_type?:string;media_url?:string;poll?:{question:string;options:string[]}}};
export default function PublicationQueue({readOnly}:{readOnly:boolean}){
 const {owner,isCurrent}=useAccountGuard();
 const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [opened,setOpened]=useState<Record<string,{revision:string;preview:string|null}>>({});
 const [notes,setNotes]=useState<Record<string,string>>({}),[checked,setChecked]=useState<Record<string,boolean>>({});
 const request=useCallback(async(path:string,body?:unknown)=>{
  const client=createClient(),controller=new AbortController();
  const listener=client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user.id!==owner)controller.abort();});
  const timer=setTimeout(()=>controller.abort(),55000);
  try{
   const {data:{session}}=await client.auth.getSession();
   if(!isCurrent()||controller.signal.aborted||session?.user.id!==owner)throw new Error('La sesión ha cambiado.');
   const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json();
   if(!isCurrent()||controller.signal.aborted)throw new Error('La sesión ha cambiado.');
   if(!response.ok)throw new Error(data.message??'No se completó la revisión.');
   return data;
  }finally{clearTimeout(timer);controller.abort();listener.data.subscription.unsubscribe();}
 },[owner,isCurrent]);
 const load=useCallback(async()=>{
  try{
   const client=createClient();const {data:{session}}=await client.auth.getSession();
   if(!isCurrent()||session?.user.id!==owner)return;
   const {data,error}=await client.rpc('admin_list_publication_reviews').setHeader('Authorization',`Bearer ${session.access_token}`);
   if(!isCurrent())return;
   if(error)throw new Error('Verifica tu sesión con doble factor para abrir la cola de revisión.');
   setItems(data??[]);setError('');
  }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'No se pudo cargar la cola.');}
 },[owner,isCurrent]);
 useEffect(()=>{void load();},[load]);
 async function open(item:Item){setBusy(true);try{
  const data=await request(`/api/moderation/review?id=${item.id}`);
  if(data.revision!==item.revision){await load();throw new Error('El contenido ha cambiado. Abre la versión actual.');}
  setOpened(old=>({...old,[item.id]:{revision:data.revision,preview:data.preview}}));
 }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'No se pudo abrir.');}finally{if(isCurrent())setBusy(false);}}
 async function decide(item:Item,decision:'approved'|'rejected'){setBusy(true);setError('');try{
  await request('/api/moderation/review',{id:item.id,revision:item.revision,decision,note:notes[item.id],reviewed_all_content:checked[item.id]===true});
  await load();
 }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'No se pudo resolver.');}finally{if(isCurrent())setBusy(false);}}
 return <section className="mb-8 space-y-3" aria-label="Publicaciones pendientes"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Antes de publicar</h2><Button variant="outline" size="sm" disabled={busy} onClick={()=>void load()}>Actualizar</Button></div>
 {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 {!items.length&&!error&&<Quiet>No hay publicaciones pendientes de revisión.</Quiet>}
 {items.map(item=>{const detail=opened[item.id],seen=detail?.revision===item.revision;return <Panel key={item.id} className="space-y-3 p-5"><p className="text-xs text-text-muted">{item.target_kind} · {new Date(item.created_at).toLocaleString('es-ES')} · {item.status==='processing'?'Revisión en curso':'Retenido'}</p><p className="whitespace-pre-wrap break-words">{item.document.body}</p>{item.document.offer&&<p className="whitespace-pre-wrap">{item.document.offer}</p>}{item.document.poll&&<div><p>{item.document.poll.question}</p><ul>{item.document.poll.options.map((label,index)=><li key={index}>{label}</li>)}</ul></div>}
 <Button variant="outline" size="sm" disabled={busy} onClick={()=>void open(item)}>Abrir contenido para revisar</Button>
 {seen&&detail.preview&&(item.document.media_type==='image'?<img src={detail.preview} alt="Contenido pendiente de revisión" className="max-h-96 max-w-full rounded-xl"/>:<video src={detail.preview} controls playsInline className="max-h-96 max-w-full"/>)}
 {!readOnly&&seen&&<><label className="block text-sm"><input type="checkbox" checked={checked[item.id]??false} onChange={e=>setChecked(old=>({...old,[item.id]:e.target.checked}))}/> He revisado el texto completo, la encuesta y todo el adjunto, incluida su duración completa.</label><label className="block text-sm">Motivo de la decisión<textarea className="mt-1 w-full rounded-xl border border-border bg-bg-primary p-3" rows={2} maxLength={1000} value={notes[item.id]??''} onChange={e=>setNotes(old=>({...old,[item.id]:e.target.value}))}/></label><div className="flex gap-2"><Button disabled={busy||!checked[item.id]||(notes[item.id]?.trim().length??0)<3} onClick={()=>void decide(item,'approved')}>Aprobar</Button><Button variant="destructive" disabled={busy||!checked[item.id]||(notes[item.id]?.trim().length??0)<3} onClick={()=>void decide(item,'rejected')}>Rechazar</Button></div></>}
 </Panel>;})}</section>;
}
