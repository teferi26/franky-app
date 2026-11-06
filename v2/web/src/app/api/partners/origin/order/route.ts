import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/api-helpers';
import { getOriginOrder,inspectOriginOrder,secretMatches } from '@/lib/origin-checkout';
import { rateLimit } from '@/lib/rate-limit';
export const maxDuration=60;
const schema=z.object({orderId:z.uuid(),token:z.string().regex(/^[a-f0-9]{64}$/),cancel:z.boolean().optional()}).strict();
export async function POST(req:NextRequest) {
  if(!secretMatches(req.headers.get('authorization'),process.env.ORIGIN_PARTNER_SECRET?`Bearer ${process.env.ORIGIN_PARTNER_SECRET}`:undefined))return NextResponse.json({error:'No autorizado'},{status:401});
  const data=await validateBody(req,schema,{maxBytes:2048});if(data instanceof NextResponse)return data;
  const limit=await rateLimit(req,{key:'origin-order',subject:data.orderId,limit:30,windowMs:60_000});if(!limit.ok)return limit.response;
  try {
    const order=await inspectOriginOrder(await getOriginOrder(data.orderId,data.token),data.cancel);
    return NextResponse.json({orderId:order.id,state:order.status,eventId:order.event_id,event:order.event_snapshot,size:order.size,amountCents:order.amount_cents,baseAmountCents:order.base_amount_cents??order.amount_cents,discountCents:order.discount_cents??0,code:order.discount_code??null,name:order.buyer_name,paidAt:order.paid_at},{headers:{'Cache-Control':'private, no-store'}});
  }catch {return NextResponse.json({error:'No podemos confirmar el estado del pago. No repitas la compra; vuelve a consultar en unos segundos.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
