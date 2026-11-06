import { workspaceRpc } from './workspaces';
import type { SessionIdentity } from './session';
import type { CardRpcArguments, CardPersonal, CardProfile, CardCredential, CardPage, CardOffer, CardMerchant, CardVenue, CardProgram, CardRequest, CardConsumption, CardReverseResult, CardBookingQuote, CardOfferUsage } from '../../../shared/franky-card';
export * from '../../../shared/franky-card';
export * from './franky-card-model';

type Results = {
  get_franky_card_offer_usage: CardOfferUsage; get_franky_card: CardPersonal; save_franky_card_profile: CardProfile;
  list_franky_card_offers: CardPage<CardOffer>; issue_franky_card_credential: CardCredential;
  revoke_franky_card_credentials: unknown; get_franky_card_merchant: CardMerchant;
  save_franky_card_venue: CardVenue; save_franky_card_offer: CardOffer; save_franky_card_program: CardProgram;
  create_franky_card_request: CardRequest; get_franky_card_request: CardRequest;
  respond_franky_card_request: CardRequest; get_franky_card_history: CardPage<CardConsumption>;
  reverse_franky_card_consumption: CardReverseResult;
  card_quote_professional_booking: CardBookingQuote; create_franky_card_booking_request: CardRequest;
};
export function cardRpc<N extends keyof CardRpcArguments>(name: N, args: CardRpcArguments[N], owner: SessionIdentity, signal?: AbortSignal): Promise<Results[N]> {
  return workspaceRpc<Results[N]>(name, args, owner, signal);
}
