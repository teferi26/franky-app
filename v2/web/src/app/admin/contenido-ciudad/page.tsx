import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import CityContentAdministration from './city-content-administration';
export const dynamic='force-dynamic';
export default async function Page(){const s=await createServerSupabase();const{data:{user}}=await s.auth.getUser();if(!user)redirect('/login');const{data:profile}=await s.from('profiles').select('role').eq('id',user.id).single();if(profile?.role!=='admin')redirect('/');return <CityContentAdministration/>;}
