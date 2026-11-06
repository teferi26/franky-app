'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from './supabase-client';
/** Remount financial state on each identity transition, including sign-out and
 * sign-in as the same account. Token refreshes do not discard an active form. */
export function useFinancialOwner(){const[current,setCurrent]=useState<{userId:string;key:string}|null>(null),revision=useRef(0),identity=useRef<string|null>(null);
 useEffect(()=>{let alive=true,received=false;const s=createClient();const update=(id:string|null)=>{if(!alive)return;if(identity.current!==id){identity.current=id;revision.current++;}setCurrent(id?{userId:id,key:`${id}:${revision.current}`}:null);};const{data:{subscription}}=s.auth.onAuthStateChange((_event,session)=>{received=true;update(session?.user.id??null);});void s.auth.getSession().then(({data:{session}})=>{if(!received)update(session?.user.id??null);});return()=>{alive=false;subscription.unsubscribe();};},[]);return current;
}
