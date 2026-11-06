import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { rateLimit } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { ORIGIN_ORGANIZER_ID } from '@/lib/origin-partner';
import { ORIGIN_MERCHANT_ACCOUNT } from '@/lib/origin-partner';
import { validOriginConnectState, ORIGIN_CONNECT_COOKIE } from '@/lib/origin-connect';

function result(message:string,status:number) {
  const response=new NextResponse(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
  response.cookies.set(ORIGIN_CONNECT_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/partners/origin/connect',maxAge:0});
  return response;
}
export async function GET(req:NextRequest) {
  const limited=await rateLimit(req,{key:'origin-connect-callback',limit:10,windowMs:60_000});
  if(!limited.ok)return limited.response;
  if(!validOriginConnectState(req.nextUrl.searchParams.get('state'),req.cookies.get(ORIGIN_CONNECT_COOKIE)?.value))return result('La vinculación ha caducado. Abre de nuevo el enlace de conexión de ORIGIN.',400);
  const code=req.nextUrl.searchParams.get('code');
  if(!code||code.length>512)return result('No se ha autorizado la conexión. Puedes volver a intentarlo.',400);
  try {
    const stripe=getStripe();
    const token=await stripe.oauth.token({grant_type:'authorization_code',code});
    // Neither query parameters nor Stripe's editable metadata choose the payee.
    if(token.stripe_user_id!==ORIGIN_MERCHANT_ACCOUNT||token.livemode!==true||token.scope!=='read_write')return result('Selecciona la cuenta Stripe de Origin club al autorizar la conexión.',409);
    const account=await stripe.accounts.retrieve(ORIGIN_MERCHANT_ACCOUNT);
    if(account.type!=='standard'||!account.charges_enabled||!account.payouts_enabled||account.capabilities?.transfers!=='active')return result('Stripe todavía tiene que activar los cobros y abonos de esta cuenta. Completa los datos en Stripe y vuelve a conectar.',409);
    const db=createAdminSupabase();
    const {error}=await db.from('connect_accounts').update({stripe_connect_account_id:ORIGIN_MERCHANT_ACCOUNT,charges_enabled:true,payouts_enabled:true,details_submitted:account.details_submitted,transfers_status:'active',requirements_status:null,onboarding_status:'active',updated_at:new Date().toISOString()}).eq('user_id',ORIGIN_ORGANIZER_ID).select('id').single();
    if(error)throw new Error('Could not persist Origin connection');
    return result('Cuenta de Origin club conectada. Las nuevas ventas en Franky llegarán a esta cuenta descontando la comisión de Franky y los gastos de Stripe. Las ventas de orgnclub.com se cobrarán directamente en esta cuenta sin comisión de Franky.',200);
  } catch {
    return result('No se pudo completar la conexión. Vuelve a abrir el enlace de ORIGIN e inténtalo de nuevo.',503);
  }
}
