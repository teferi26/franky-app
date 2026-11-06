import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { createOriginConnectState, originConnectCookie, ORIGIN_CONNECT_CALLBACK, ORIGIN_CONNECT_CLIENT, ORIGIN_CONNECT_COOKIE } from '@/lib/origin-connect';

// This handoff is ONLY for the pinned Origin Stripe account and pinned organiser.
// Stripe authenticates ownership; the callback cannot attach any other account.
export async function GET(req: NextRequest) {
  const limited=await rateLimit(req,{key:'origin-connect',limit:10,windowMs:60_000});
  if(!limited.ok)return limited.response;
  const state=createOriginConnectState();
  const url=new URL('https://connect.stripe.com/oauth/authorize');
  url.search=new URLSearchParams({response_type:'code',client_id:ORIGIN_CONNECT_CLIENT,scope:'read_write',redirect_uri:ORIGIN_CONNECT_CALLBACK,state}).toString();
  const response=NextResponse.redirect(url);
  response.headers.set('Cache-Control','no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  response.cookies.set(ORIGIN_CONNECT_COOKIE,originConnectCookie(state),{httpOnly:true,secure:true,sameSite:'lax',path:'/api/partners/origin/connect',maxAge:15*60});
  return response;
}
