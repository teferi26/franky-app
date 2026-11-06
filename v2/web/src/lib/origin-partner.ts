/** ORIGIN's verified organiser. Never infer tenancy from an editable event title. */
export const ORIGIN_ORGANIZER_ID = 'efc99d1b-c713-4061-9146-e905fc599f56';
export const ORIGIN_MERCHANT_ACCOUNT = 'acct_1UFdIBDJDdryynxQ';
export const ORIGIN_SITE = 'https://www.orgnclub.com';
export const ORIGIN_EVENT_FIELDS = 'id,title,description,organizer_id,start_date,end_date,venue,address,city,price,payment_mode,price_without_shirt,price_with_shirt,max_capacity,show_participant_count,image_url,status,shirts_enabled';
export const ORIGIN_EVENT_ALIASES: Record<string, string> = {
  'cf5524cb-07ac-45fe-9151-758a2336a18f': 'origin-x-plantshack',
  'f15ca9d5-fb77-45f5-959b-ddc4c7f3459d': 'evento-002',
};
export function originEventSlug(id: string) { return ORIGIN_EVENT_ALIASES[id] ?? `origin-${id}`; }
