import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import AdminWorkspaces from './workspace-admin';
export const dynamic='force-dynamic';
export default async function Page(){const s=await createServerSupabase();const{data:{user}}=await s.auth.getUser();if(!user)redirect('/login');const{data:p}=await s.from('profiles').select('role').eq('id',user.id).single();if(p?.role!=='admin')redirect('/');return <AdminWorkspaces/>;}
