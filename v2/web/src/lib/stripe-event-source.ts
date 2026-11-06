import type Stripe from 'stripe';

// A connected Standard account can write its own payment metadata. It must
// never be able to fulfil Franky's platform orders or subscriptions with it.
export function acceptsPlatformStripeEvent(event: Stripe.Event) {
  if(!event.account)return true;
  if(event.type==='account.application.deauthorized')return true;
  return event.type==='account.updated'&&event.data.object.id===event.account;
}
