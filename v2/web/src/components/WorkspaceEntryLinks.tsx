'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase-client';
export default function WorkspaceEntryLinks({userId,onNavigate}:{userId:string;onNavigate?:()=>void}){
 const[enabled,setEnabled]=useState(false);
 useEffect(()=>{let active=true;setEnabled(false);const s=createClient();void s.rpc('get_workspace_access').then(({data,error})=>{if(active)setEnabled(!error&&data?.enabled===true)});return()=>{active=false}},[userId]);
 if(!enabled)return null;
 return <Link href="/pro" onClick={onNavigate} className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-bg-secondary">Franky Pro</Link>;
}
