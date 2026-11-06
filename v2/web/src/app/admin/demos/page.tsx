import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import DemoAdministration from './demo-administration';
export const dynamic='force-dynamic';
export default async function Page(){
 const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const{data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();if(profile?.role!=='admin')redirect('/');
 return <DemoAdministration/>;
}
