import { describe, expect, it } from 'vitest';
import { sanitizeNext } from '@/lib/safe-next';
import { isCrushPartyEntry, isCrushPartyPublicApi, isCrushPartyScreen, partyPath } from '@/lib/crush-party-route';

describe('Party access opens only the entry, projection and QR', () => {
  it('preserves the specific party through authentication', () => {
    const route = partyPath('franky-11-septiembre');
    expect(sanitizeNext(route)).toBe(route); expect(isCrushPartyEntry(route)).toBe(true);
    expect(isCrushPartyEntry(`${route}?source=qr`)).toBe(true); expect(isCrushPartyScreen(`${route}/pantalla`)).toBe(true);
  });
  it.each(['join','posts','state','action','admin','feed/extra'])('keeps the %s API private', action => {
    expect(isCrushPartyPublicApi(`/api/crush/fiesta/franky-11-septiembre/${action}`)).toBe(false);
  });
  it.each(['feed','qr'])('allows exactly the public %s endpoint', action => {
    expect(isCrushPartyPublicApi(`/api/crush/fiesta/franky-11-septiembre/${action}`)).toBe(true);
  });
  it.each(['/crush/fiesta/../admin','/crush/fiesta/x/private','/crush/fiesta/x/pantalla/extra','/crush/fiesta/X','/crush/fiesta/-x','/crush/fiesta/%2fadmin'])('does not bypass onboarding for %s', route => {
    expect(isCrushPartyEntry(route)).toBe(false); expect(isCrushPartyScreen(route)).toBe(false);
  });
});
describe('Safe post-login destinations withstand browser normalization', () => {
  it.each(['//evil.invalid','/\\evil.invalid','/\n/evil.invalid','/%5cevil.invalid','/%2fexample.invalid','/%252fexample.invalid','/\t/evil.invalid','https://evil.invalid','javascript:alert(1)','/javascript:alert(1)','/bad%xy'])('rejects %s', route => expect(sanitizeNext(route)).toBe('/'));
  it('preserves internal filters and accented university names', () => {
    expect(sanitizeNext('/alojamiento?ciudad=Alcal%C3%A1')).toBe('/alojamiento?ciudad=Alcal%C3%A1');
    expect(sanitizeNext('/crush?tab=requests')).toBe('/crush?tab=requests');
  });
});
