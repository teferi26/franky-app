import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {supabase} from '@/lib/supabase';
import {C,F} from '@/theme';
export function OrganizationEventBadge({eventId}:{eventId:string}){
 const[identity,setIdentity]=useState<{name:string;kind:string;verified:boolean}|null>(null);
 useEffect(()=>{let alive=true;setIdentity(null);void supabase.rpc('get_event_organizer_identity',{p_event_id:eventId}).then(({data,error})=>{if(alive&&!error)setIdentity(data);});return()=>{alive=false;};},[eventId]);
 if(!identity)return null;
 return <View style={{borderWidth:1,borderColor:C.border,borderRadius:14,padding:10}}><Text style={[F.small,{color:C.blue}]}>Organiza {identity.name}{identity.verified&&identity.kind==='university'?' · Universidad verificada':''}</Text></View>;
}
