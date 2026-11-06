/** Franky Card v1. Money is integer EUR cents; the server owns eligibility, prices and grants. */
export const FRANKY_CARD_RPC = {
  personal: 'get_franky_card', profile: 'save_franky_card_profile', offers: 'list_franky_card_offers',
  credential: 'issue_franky_card_credential', revokeCredentials: 'revoke_franky_card_credentials',
  merchant: 'get_franky_card_merchant', saveVenue: 'save_franky_card_venue', saveOffer: 'save_franky_card_offer',
  saveProgram: 'save_franky_card_program', request: 'create_franky_card_request',
  detail: 'get_franky_card_request', respond: 'respond_franky_card_request',
  history: 'get_franky_card_history', reverse: 'reverse_franky_card_consumption',
  admin: 'admin_franky_card', readiness: 'get_franky_card_readiness',
  bookingQuote: 'card_quote_professional_booking', bookingRequest: 'create_franky_card_booking_request',
  offerUsage: 'get_franky_card_offer_usage',
} as const;
export const CARD_AGREEMENT_VERSION = '2026-adhesion-v1';
/** Native QR codes are versioned; Wallet and existing web codes may contain the raw locator. */
export function parseCardCredential(value: string): string | null {
  const token = value.trim().replace(/^franky:card:v1:/, '');
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
export type CardMembershipState = 'inactive' | 'active' | 'expired' | 'suspended';
export type CardRequestState = 'pending' | 'customer_confirmed' | 'completed' | 'rejected' | 'expired';
export type CardRequestKind = 'discount' | 'loyalty' | 'reward' | 'protected';
export type CardProfile = {
  full_name: string; photo_path: string | null; university: string | null; studies: string | null;
  cohort_year: number | null; academic_visibility: boolean;
  student_verified_until: string | null;
};
export type CardMoney = {
  gross_cents: number; public_price_cents: number; discount_cents: number;
  final_cents: number; incremental_savings_cents: number; currency: 'eur';
};
/** One line refers to one indivisible unit; split quantity into distinct IDs before quoting. */
export type CardLineInput = { id: string; label: string; service_key: string; gross_cents: number; public_price_cents: number };
export type CardLine = CardLineInput & { discount_cents: number; final_cents: number; incremental_savings_cents: number; reversed: boolean };
export type CardOfferWindow = {weekday: number; start_minute: number; end_minute: number};
export type CardOffer = {
  id: string; venue_id: string; version: number; title: string; kind: 'base' | 'campaign';
  percent: number; service_keys: string[]; minimum_cents: number; starts_at: string; ends_at: string | null;
  student_only: boolean; minimum_age: number | null; terms: string;
  status: 'draft' | 'pending' | 'active' | 'retired';
  venue_name?: string; city?: string; organization_name?: string; organization_id?: string;
  max_redemptions?: number | null; max_per_user?: number | null; budget_cents?: number | null;
  validity_windows?: CardOfferWindow[]; timezone?: string;
};
export type CardOfferUsage = {offer_id:string;committed_uses:number;completed_uses:number;committed_cents:number;completed_cents:number;max_redemptions:number|null;budget_cents:number|null;remaining_uses:number|null;remaining_cents:number|null};
export function cardCampaignConditions(offer: Pick<CardOffer,'kind'|'max_redemptions'|'max_per_user'|'budget_cents'|'validity_windows'|'timezone'>):string[] {
  if(offer.kind!=='campaign')return[];
  const lines:string[]=[];
  if(offer.max_redemptions)lines.push(`Máximo ${offer.max_redemptions} usos de la campaña`);
  if(offer.max_per_user)lines.push(`Máximo ${offer.max_per_user} usos por persona`);
  if(offer.budget_cents)lines.push('Hasta agotar el presupuesto de la campaña');
  const days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const time=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  for(const w of offer.validity_windows??[])lines.push(`${days[w.weekday]} ${time(w.start_minute)}–${time(w.end_minute)}${w.end_minute<w.start_minute?' del día siguiente':''} (${offer.timezone??'hora del establecimiento'})`);
  return lines;
}
export type CardProgram = {
  id: string; venue_id: string; version: number; title: string; service_keys: string[];
  required_stamps: number; reward_service_key: string; reward_label: string;
  reward_max_cents: number; terms: string; status: 'active' | 'retired';
};
export type CardLoyaltyBalance = {
  program: CardProgram; stamps: number; available_rewards: number; progress: number;
};
export type CardVenue = {
  id: string; organization_id: string; name: string; city: string; category: string;
  address: string; timezone: string; status: 'pending' | 'active' | 'suspended';
  agreement_version: string; offers: CardOffer[]; programs: CardProgram[];
};
export type CardRequest = {
  id: string; kind: CardRequestKind; status: CardRequestState; venue_id: string; venue_name: string;
  organization_id: string; expires_at: string; created_at: string; completed_at: string | null;
  lines: CardLine[]; money: CardMoney; offer: CardOffer | null; program: CardProgram | null;
  customer_confirmed: boolean; merchant_confirmed: boolean; actor: 'customer' | 'merchant';
  /** Present only to holder or currently-authorized cashier AFTER holder confirmation. */
  identity: { full_name: string; photo_path: string | null } | null;
  consumption_id: string | null; external_reference: string | null;
  booking_id: string | null; expected_external_reference: string | null;
  demo: boolean;
};
export type CardConsumption = {
  id: string; request_id: string; venue_id: string; venue_name: string; kind: CardRequestKind;
  created_at: string; lines: CardLine[]; money: CardMoney; reversed_savings_cents: number;
  source: 'merchant_declared'; external_reference: string;
};
export type CardPage<T> = { items: T[]; next_cursor: string | null };
export type CardPersonal = {
  enabled: boolean; demo: boolean; profile: CardProfile | null;
  membership: { status: CardMembershipState; starts_at: string | null; ends_at: string | null; renewal: 'manual'; fee_paid_cents: number };
  pricing: { annual_cents: number; introductory_cents: number; currency: 'eur'; purchases_available: boolean; checkout_quote: {amount_cents:number;price_version:string} | null };
  savings: { recorded_cents: number; membership_cost_cents: number; balance_cents: number; source: 'merchant_declared' };
  pending_requests: CardRequest[]; loyalty: CardLoyaltyBalance[];
};
export type CardMerchant = {
  enabled: boolean; demo: boolean; organization_id: string;
  permissions: { manage: boolean; redeem: boolean; finance: boolean; reverse: boolean };
  venues: CardVenue[]; pending_requests: CardRequest[];
  totals: { confirmed_consumptions: number; gross_cents: number; discount_cents: number; reversed_savings_cents: number } | null;
};
export type CardCredential = { token: string; expires_at: string | null; kind: 'temporary' | 'wallet'; card_active: boolean; loyalty_available: true };
export type CardVenueInput = { name: string; city: string; category: string; address: string; timezone: string; agreement_version: string; agreement_accepted: boolean };
export type CardOfferInput = Omit<CardOffer, 'id' | 'venue_id' | 'version' | 'status' | 'venue_name' | 'city' | 'organization_name' | 'organization_id'>;
export type CardProgramInput = Omit<CardProgram, 'id' | 'venue_id' | 'version' | 'status'>;
export type CardRequestInput = {
  p_venue_id: string; p_token: string; p_kind: CardRequestKind; p_offer_id: string | null;
  p_program_id: string | null; p_lines: CardLineInput[]; p_request_key: string;
};
export type CardResponseInput = {
  p_request_id: string; p_action: 'confirm' | 'reject';
  /** Mandatory only for cashier's final confirmation. Stable receipt/booking reference, never cardholder PII. */
  p_external_reference?: string | null;
};
export type CardReverseInput = { p_consumption_id: string; p_line_ids: string[]; p_reason: string; p_request_key: string };
export type CardReverseResult = { adjustment_id: string; refund_cents: number; reversed_savings_cents: number; stamps_adjusted: number; idempotent: boolean };
export type CardCheckout = {
  order_id: string; status: 'created' | 'checkout' | 'pending' | 'paid' | 'refunded' | 'disputed' | 'failed' | 'expired' | 'cancelled' | 'review';
  amount_cents: number; currency: 'eur'; price_version: string; environment: 'test' | 'live';
  checkout_url: string | null; payment_id: string | null; refunded_cents:number;
};
export type CardReadiness = { enabled: boolean; purchases_enabled: boolean; provider_ready: boolean; environment: 'test' | 'live'; annual_cents: number; introductory_cents: number; currency: 'eur' };
export type CardBookingQuote = {id:string;ordinary_cents:number;final_cents:number;discount_cents:number;incremental_savings_cents:number;expires_at:string;offer:CardOffer;lines:CardLine[]};
/** RPC arguments (all personal calls require a pinned, authenticated session). */
export type CardRpcArguments = {
  get_franky_card: Record<string, never>;
  save_franky_card_profile: { p_profile: Omit<CardProfile, 'student_verified_until'> };
  list_franky_card_offers: { p_city?: string | null; p_cursor?: string | null; p_limit?: number; p_organization_id?:string|null };
  card_quote_professional_booking: {p_organization_id:string;p_service_id:string;p_party_size:number;p_starts_at:string;p_offer_id:string};
  create_franky_card_booking_request: {p_booking_id:string;p_token:string;p_request_key:string;p_program_id?:string|null};
  issue_franky_card_credential: { p_kind?: 'temporary' | 'wallet' };
  revoke_franky_card_credentials: Record<string, never>;
  get_franky_card_merchant: { p_organization_id: string };
  get_franky_card_offer_usage: { p_offer_id: string };
  save_franky_card_venue: { p_organization_id: string; p_venue_id: string | null; p_data: CardVenueInput; p_request_key?:string|null };
  save_franky_card_offer: { p_venue_id: string; p_data: CardOfferInput; p_request_key?:string|null };
  save_franky_card_program: { p_venue_id: string; p_data: CardProgramInput; p_request_key?:string|null };
  create_franky_card_request: CardRequestInput;
  get_franky_card_request: { p_request_id: string };
  respond_franky_card_request: CardResponseInput;
  get_franky_card_history: { p_organization_id?: string | null; p_cursor?: string | null; p_limit?: number };
  reverse_franky_card_consumption: CardReverseInput;
};
export const CARD_MEMBERSHIP_LABELS: Record<CardMembershipState, string> = { inactive: 'Sin Card activa', active: 'Card activa', expired: 'Card caducada', suspended: 'Card suspendida' };
export const CARD_REQUEST_LABELS: Record<CardRequestState, string> = { pending: 'Pendiente de tu confirmación', customer_confirmed: 'Pendiente del comercio', completed: 'Consumo confirmado', rejected: 'Rechazado', expired: 'Solicitud caducada' };
export function cardCents(value: number): string { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value / 100); }
