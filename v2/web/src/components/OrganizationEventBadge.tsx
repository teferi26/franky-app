'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase-client';
export default function OrganizationEventBadge({eventId}:{eventId:string}){
 const[identity,setIdentity]=useState<{name:string;kind:string;verified:boolean}|null>(null);
 useEffect(()=>{let alive=true;setIdentity(null);void createClient().rpc('get_event_organizer_identity',{p_event_id:eventId}).then(({data,error})=>{if(alive&&!error)setIdentity(data);});return()=>{alive=false;};},[eventId]);
 if(!identity)return null;
 return <span className="inline-flex rounded-full border border-violet/20 bg-violet/5 px-3 py-1 text-xs font-semibold text-violet">Organiza {identity.name}{identity.verified&&identity.kind==='university'?' · Universidad verificada':''}</span>;
}
