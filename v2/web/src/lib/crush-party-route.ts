export const ALICANTE_PARTY_SLUG = 'franky-11-septiembre';
export const ALICANTE_UNIVERSITY_ID = '28ef67ae-2ac4-4e41-935a-04681776e2cd';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validPartySlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && SLUG.test(value);
}
export function isCrushPartyEntry(path: string): boolean {
  const pathname = path.split('?')[0];
  const match = /^\/crush\/fiesta\/([^/]+)\/?$/.exec(pathname);
  return !!match && validPartySlug(match[1]);
}
export function isCrushPartyScreen(pathname: string): boolean {
  const match = /^\/crush\/fiesta\/([^/]+)\/pantalla\/?$/.exec(pathname);
  return !!match && validPartySlug(match[1]);
}
export function isCrushPartyPublicApi(pathname: string): boolean {
  const match = /^\/api\/crush\/fiesta\/([^/]+)\/(feed|qr)\/?$/.exec(pathname);
  return !!match && validPartySlug(match[1]);
}
export const partyPath = (slug: string) => `/crush/fiesta/${encodeURIComponent(slug)}`;
