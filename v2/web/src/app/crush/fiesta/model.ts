export type CrushParty = {
  id: string; slug: string; title: string; university_id: string; university_name: string;
  starts_at: string; opens_at: string; ends_at: string; active: boolean; screen_paused: boolean;
};
export type PartyPost = {
  id: string; body: string; display_name: string | null; instagram_handle: string | null;
  is_anonymous: boolean; created_at: string; reaction_count: number;
  /** Party members who asked this author for their Instagram (needs the pulse migration). */
  request_count?: number;
};
export type PartyFeed = { party: CrushParty; posts: PartyPost[]; generated_at: string; matches?: number; requests?: number };
export type OwnPartyPost = { id: string; body: string; created_at: string; is_anonymous: boolean; available: boolean };
export type PartyState = {
  party: CrushParty; joined: boolean; eligible: boolean; display_name: string | null;
  needs_birth_date: boolean; ineligibility_reasons: string[]; posting_open: boolean;
  my_post_ids: string[];
  my_posts: OwnPartyPost[];
  profile: { full_name: string | null; university_id: string | null; career: string | null; instagram_handle: string | null; birth_date: string | null; opted_in: boolean; role: string | null };
};
export type PartyUniversity = { id: string; name: string };
export type PartyScreenMode = 'completa' | 'qr' | 'muro';
export const screenMode = (value: unknown): PartyScreenMode => value === 'qr' || value === 'muro' ? value : 'completa';
export function normaliseInstagram(value: string): string {
  let handle = value.trim();
  const profileUrl = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i;
  if (profileUrl.test(handle)) {
    const parts = handle.replace(profileUrl, '').split(/[?#]/)[0].split('/').filter(Boolean);
    if (parts.length !== 1) return '';
    handle = parts[0];
  }
  return handle.replace(/^@/, '').toLowerCase();
}
export function validInstagram(value: string): boolean { return /^[a-z0-9._]{1,30}$/.test(normaliseInstagram(value)); }

export const PARTY_DEMO: CrushParty = {
  id: 'demo', slug: 'franky-11-septiembre', title: 'Franky Event · Alicante', university_id: '28ef67ae-2ac4-4e41-935a-04681776e2cd', university_name: 'Universidad de Alicante',
  starts_at: '2026-09-11T22:00:00Z', opens_at: '2026-09-06T00:00:00Z', ends_at: '2026-09-12T06:00:00Z', active: true, screen_paused: false,
};
export const DEMO_POSTS: PartyPost[] = [
  { id: 'demo-1', body: 'Mi plan era bailar. Ahora es encontrar a quien estaba cantando a mi lado.', display_name: null, instagram_handle: null, is_anonymous: true, created_at: '2026-09-11T22:01:00Z', reaction_count: 0, request_count: 3 },
  { id: 'demo-2', body: 'Si te ha dado vergüenza decir hola, esta es tu segunda oportunidad.', display_name: 'Ejemplo', instagram_handle: null, is_anonymous: false, created_at: '2026-09-11T22:02:00Z', reaction_count: 0, request_count: 1 },
  { id: 'demo-3', body: 'Busco a alguien que se sepa la próxima canción entera. Se aceptan audiciones.', display_name: null, instagram_handle: null, is_anonymous: true, created_at: '2026-09-11T22:03:00Z', reaction_count: 0 },
];

export function partyDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' }).format(new Date(iso));
}
