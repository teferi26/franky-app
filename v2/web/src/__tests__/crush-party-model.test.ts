import { describe, expect, it } from 'vitest';
import { normaliseInstagram, validInstagram, screenMode } from '../app/crush/fiesta/model';
describe('Party profile input keeps the intended Instagram account', () => {
  it.each(['@Mi.Cuenta','mi.cuenta','https://www.instagram.com/mi.cuenta/?igsh=abc','instagram.com/mi.cuenta','www.instagram.com/mi.cuenta/'])('accepts a handle or profile URL: %s', input => {
    expect(validInstagram(input)).toBe(true); expect(normaliseInstagram(input)).toBe('mi.cuenta');
  });
  it.each(['https://evil.invalid/mi.cuenta','https://instagram.com/p/reel-id/','javascript:alert(1)','nombre con espacios','a'.repeat(31),'@@micuenta'])('does not transform %s into somebody else’s valid account', input => expect(validInstagram(input)).toBe(false));
  it('uses only the supported OBS modes', () => { expect(screenMode('qr')).toBe('qr'); expect(screenMode('muro')).toBe('muro'); expect(screenMode('<script>')).toBe('completa'); });
});
