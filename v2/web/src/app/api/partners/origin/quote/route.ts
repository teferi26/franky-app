import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { originRpc, secretMatches } from '@/lib/origin-checkout';

const schema=z.object({eventId:z.uuid(),size:z.enum(['ninguna','XS','S','M','L','XL','XXL']),code:z.string().trim().min(1).max(64)}).strict();
export async function POST(req:NextRequest) {
  if(!secretMatches(req.headers.get('authorization'),process.env.ORIGIN_PARTNER_SECRET?`Bearer ${process.env.ORIGIN_PARTNER_SECRET}`:undefined))return NextResponse.json({error:'No autorizado'},{status:401});
  const data=await validateBody(req,schema,{maxBytes:1024});if(data instanceof NextResponse)return data;
  const limited=await rateLimit(req,{key:'origin-quote',subject:req.headers.get('x-origin-client-ip')||'unknown',limit:20,windowMs:60_000});if(!limited.ok)return limited.response;
  try {
    const quote=await originRpc<{base_amount_cents:number;discount_cents:number;amount_cents:number;discount_code:string}>('quote_origin_event_order',{p_event:data.eventId,p_size:data.size,p_code:data.code});
    return NextResponse.json({baseAmountCents:quote.base_amount_cents,discountCents:quote.discount_cents,amountCents:quote.amount_cents,code:quote.discount_code},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e) {
    const message=e instanceof Error?e.message:'';
    const safe=/^(El cupón|El importe|Las inscripciones|Evento no disponible|Elige una opción)/.test(message);
    return NextResponse.json({error:safe?message:'No se pudo comprobar el cupón. Inténtalo de nuevo.'},{status:safe?409:503,headers:{'Cache-Control':'no-store'}});
  }
}
