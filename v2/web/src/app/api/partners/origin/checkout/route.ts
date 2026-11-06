import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { getOriginOrder, originRpc, reconcileOriginPending, secretMatches, startOriginCheckout, tokenHash, type OriginOrder } from '@/lib/origin-checkout';

import { originMerchantAccount } from '@/lib/origin-stripe';
export const maxDuration=60;
const identity=z.object({requestId:z.uuid(),eventId:z.uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)});
const schema=z.union([identity.extend({action:z.literal('resume')}).strict(),identity.extend({name:z.string().trim().min(2).max(120),email:z.email().max(254),size:z.enum(['ninguna','XS','S','M','L','XL','XXL']),termsAccepted:z.literal(true),code:z.string().trim().max(64).optional(),expectedAmountCents:z.number().int().min(0).max(1000000).optional()}).strict()]);
export async function POST(req:NextRequest) {
  if(!secretMatches(req.headers.get('authorization'),process.env.ORIGIN_PARTNER_SECRET?`Bearer ${process.env.ORIGIN_PARTNER_SECRET}`:undefined))return NextResponse.json({error:'No autorizado'},{status:401});
  const data=await validateBody(req,schema,{maxBytes:4096});if(data instanceof NextResponse)return data;
  const ip=req.headers.get('x-origin-client-ip')||'unknown';
  const limited=await rateLimit(req,{key:'origin-checkout',subject:ip,limit:20,windowMs:60_000});if(!limited.ok)return limited.response;
  try {
    if('action' in data) {
      const existing=await getOriginOrder(data.requestId,data.token);
      if(existing.event_id!==data.eventId)throw new Error('Solicitud no válida');
      return NextResponse.json(await startOriginCheckout(existing),{headers:{'Cache-Control':'no-store'}});
    }
    await reconcileOriginPending(data.eventId);
    const order=await originRpc<OriginOrder>('prepare_origin_discount_order',{p_id:data.requestId,p_event:data.eventId,p_token_hash:tokenHash(data.token),p_name:data.name,p_email:data.email,p_size:data.size,p_ip_hash:tokenHash(ip),p_account:(await originMerchantAccount()).id,p_live:/^(sk|rk)_live_/.test(process.env.ORIGIN_STRIPE_SECRET_KEY??''),p_code:data.code??null,p_expected_amount:data.expectedAmountCents??null});
    return NextResponse.json(await startOriginCheckout(order),{headers:{'Cache-Control':'no-store'}});
  }catch(e) {
    const message=e instanceof Error?e.message:'';
    const canEdit=/^(El cupón|El precio ha cambiado|El importe de la entrada)/.test(message);
    const safe=canEdit||/^(El organizador debe activar|Aforo completo|Las inscripciones|Evento no disponible|Elige una opción|No podemos completar|Hay varias compras|Esta solicitud|El pago ha caducado|El pago necesita revisión|Solicitud no)/.test(message);
    return NextResponse.json({error:safe?message:'No se pudo confirmar el inicio del pago. Reintenta para recuperar la misma solicitud.',...(canEdit?{canEdit:true}:{}),...(message==='Solicitud no encontrada'?{notFound:true}:{})},{status:safe?409:503,headers:{'Cache-Control':'no-store'}});
  }
}
