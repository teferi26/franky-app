import { NextRequest,NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { reconcileOriginPending,secretMatches,sendOriginReceipt,type OriginOrder } from '@/lib/origin-checkout';
export const maxDuration=60;
export async function GET(req:NextRequest) {
  if(!secretMatches(req.headers.get('authorization'),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return NextResponse.json({error:'unauthorized'},{status:401});
  try {
    const result=await reconcileOriginPending();
    const {data,error}=await createAdminSupabase().from('origin_event_orders').select('*').eq('status','paid').is('receipt_sent_at',null).order('paid_at').limit(20);
    if(error)throw error;
    let receiptsFailed=0;
    for(const order of data??[])try{await sendOriginReceipt(order as OriginOrder);}catch{receiptsFailed++;}
    return NextResponse.json({...result,receiptsChecked:data?.length??0,receiptsFailed},{status:result.failures||receiptsFailed?503:200});
  }catch{return NextResponse.json({error:'reconciliation_failed'},{status:503});}
}
