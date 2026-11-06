import {NextResponse} from 'next/server';
import {secretMatches} from '@/lib/origin-checkout';
import {processEventRefundBatch} from '@/lib/event-refunds';
export const maxDuration=60;
export async function GET(req:Request){if(!secretMatches(req.headers.get('authorization'),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return NextResponse.json({error:'unauthorized'},{status:401});try{return NextResponse.json({processed:await processEventRefundBatch()});}catch{return NextResponse.json({error:'refund_review_unavailable'},{status:503});}}
