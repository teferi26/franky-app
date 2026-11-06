import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/origin-checkout';
import { processPublicationReviews } from '@/lib/publication-review';
export const maxDuration=60;
export async function GET(req:Request){
 if(!secretMatches(req.headers.get('authorization'),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return NextResponse.json({error:'unauthorized'},{status:401});
 try{const reviews=await processPublicationReviews();return NextResponse.json({checked:reviews.length,pending:reviews.filter(r=>r.status==='pending').length});}
 catch{return NextResponse.json({error:'review_unavailable'},{status:503});}
}
