'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase-client';
export default function CityContentLink(){
 const[enabled,setEnabled]=useState(false);
 useEffect(()=>{let active=true,version=0;const client=createClient();const load=async()=>{const g=++version;setEnabled(false);const{data:{session}}=await client.auth.getSession();if(!session||!active||g!==version)return;const{data,error}=await client.rpc('get_workspace_access');if(active&&g===version)setEnabled(!error&&data?.enabled===true);};void load();const{data:{subscription}}=client.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT'||e==='SIGNED_IN')queueMicrotask(()=>void load());});return()=>{active=false;version++;subscription.unsubscribe();};},[]);
 return enabled?<Link href="/novedades-ciudad" className="my-4 inline-flex rounded-xl border border-violet/30 px-4 py-3 text-sm font-semibold text-violet">Qué pasa en tu ciudad: comunidades y negocios →</Link>:null;
}
