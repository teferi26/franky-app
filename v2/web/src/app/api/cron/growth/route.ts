import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/origin-checkout';
import { createAdminSupabase } from '@/lib/supabase-admin';
export const maxDuration=60;
export async function GET(req:Request){
 if(!secretMatches(req.headers.get('authorization'),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return NextResponse.json({error:'unauthorized'},{status:401});
 const {data,error}=await createAdminSupabase().rpc('growth_process_due');
 if(error)return NextResponse.json({error:'growth_review_unavailable'},{status:503});
 return NextResponse.json({processed:data});
}
