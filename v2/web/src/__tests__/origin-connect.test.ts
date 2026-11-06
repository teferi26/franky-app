// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type Stripe from 'stripe';
vi.mock('server-only',()=>({}));
import {createOriginConnectState,originConnectCookie,validOriginConnectState} from '@/lib/origin-connect';
import {acceptsPlatformStripeEvent} from '@/lib/stripe-event-source';
beforeEach(()=>{vi.stubEnv('ORIGIN_PARTNER_SECRET','test-only-secret');});
describe('Origin account connection state',()=>{
 it('requires both browser cookie and signed state',()=>{const s=createOriginConnectState(),c=originConnectCookie(s);expect(validOriginConnectState(s,c)).toBe(true);expect(validOriginConnectState(s,undefined)).toBe(false);expect(validOriginConnectState(null,c)).toBe(false);expect(validOriginConnectState(s,c.slice(0,-1)+'x')).toBe(false);expect(validOriginConnectState(createOriginConnectState(),c)).toBe(false);});
 it('rejects expired and future states even with valid signatures',()=>{for(const offset of [-16*60_000,60_000]){const s=`${Date.now()+offset}.${'a'.repeat(64)}`;expect(validOriginConnectState(s,originConnectCookie(s))).toBe(false);}});
 it('requires the configured signing secret',()=>{vi.stubEnv('ORIGIN_PARTNER_SECRET','');expect(()=>originConnectCookie(createOriginConnectState())).toThrow();});
});
describe('Stripe event account boundary',()=>{
 it.each(['checkout.session.completed','checkout.session.async_payment_succeeded','invoice.paid','customer.subscription.created','charge.refunded'])('ignores a connected-account %s',type=>{expect(acceptsPlatformStripeEvent({type,account:'acct_origin',data:{object:{id:'obj'}}} as Stripe.Event)).toBe(false);expect(acceptsPlatformStripeEvent({type,data:{object:{id:'obj'}}} as Stripe.Event)).toBe(true);});
 it('only accepts account lifecycle updates about the signed source account',()=>{expect(acceptsPlatformStripeEvent({type:'account.updated',account:'acct_origin',data:{object:{id:'acct_origin'}}} as Stripe.Event)).toBe(true);expect(acceptsPlatformStripeEvent({type:'account.updated',account:'acct_origin',data:{object:{id:'acct_other'}}} as Stripe.Event)).toBe(false);});
});
