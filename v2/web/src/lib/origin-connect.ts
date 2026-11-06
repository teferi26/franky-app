import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ORIGIN_MERCHANT_ACCOUNT } from './origin-partner';

export const ORIGIN_CONNECT_CLIENT = 'ca_Uc5PRBlSgu9v3VO7Z9WAOhSnhaNdbdtm';
export const ORIGIN_CONNECT_CALLBACK = 'https://franky.es/api/partners/origin/connect/callback';
export const ORIGIN_CONNECT_COOKIE = 'origin_stripe_oauth';
export function createOriginConnectState() { return `${Date.now()}.${randomBytes(32).toString('hex')}`; }
function sign(state: string) {
  const secret=process.env.ORIGIN_PARTNER_SECRET;
  if(!secret)throw new Error('Origin connection not configured');
  return createHmac('sha256',secret).update(`${ORIGIN_MERCHANT_ACCOUNT}:${state}`).digest('hex');
}
export function originConnectCookie(state: string) { return `${state}.${sign(state)}`; }
export function validOriginConnectState(state: string|null, cookie: string|undefined) {
  if(!state||!cookie||!/^\d{13}\.[a-f0-9]{64}$/.test(state))return false;
  const age=Date.now()-Number(state.split('.')[0]);
  if(age<0||age>15*60_000)return false;
  const expected=Buffer.from(originConnectCookie(state)), actual=Buffer.from(cookie);
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
