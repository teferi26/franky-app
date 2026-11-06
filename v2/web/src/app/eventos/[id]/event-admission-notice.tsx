'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { eventAdmissionMessage, type EventAdmission } from '../../../../../shared/event-admission';

export default function EventAdmissionNotice({ eventId }: { eventId: string }) {
 const [admission,setAdmission]=useState<EventAdmission|null>(null),[failed,setFailed]=useState(false),[loading,setLoading]=useState(false);const sequence=useRef(0);
 const load=useCallback(async()=>{
  const request=++sequence.current;setAdmission(null);setFailed(false);setLoading(true);
  try {const client=createClient();const {data:{session}}=await client.auth.getSession();if(!session)return;
   const {data,error}=await client.rpc('get_event_admission',{p_event_id:eventId});if(error)throw error;
   const current=await client.auth.getSession();if(request===sequence.current&&session.user.id===current.data.session?.user.id)setAdmission(data as EventAdmission);
  }catch{if(request===sequence.current)setFailed(true);}finally{if(request===sequence.current)setLoading(false);}
 },[eventId]);
 useEffect(()=>{void load();let refresh:ReturnType<typeof setTimeout>|undefined;const {data:{subscription}}=createClient().auth.onAuthStateChange((event)=>{if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;++sequence.current;setAdmission(null);setFailed(false);clearTimeout(refresh);refresh=setTimeout(()=>void load(),0);});const onFocus=()=>void load();window.addEventListener('focus',onFocus);return()=>{++sequence.current;clearTimeout(refresh);subscription.unsubscribe();window.removeEventListener('focus',onFocus);};},[load]);
 if(!failed&&(!admission||admission.audience==='public'&&admission.eligible))return null;
 return <section className="space-y-3 rounded-xl border border-border p-4"><h2 className="font-heading font-bold">Condiciones de asistencia</h2><p role="status" className="text-sm text-text-secondary">{failed?'No se pudieron consultar las condiciones de tu cuenta. Compruébalas antes de inscribirte.':eventAdmissionMessage(admission!)}</p><Button variant="outline" disabled={loading} onClick={()=>void load()}>Comprobar acceso</Button></section>;
}
