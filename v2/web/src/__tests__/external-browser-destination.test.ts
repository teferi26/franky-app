import { afterEach, describe, expect, it, vi } from 'vitest';
import { externalUrlWithAttribution } from '@/lib/in-app-browser';

vi.mock('@/lib/attribution', () => ({ appendAttributionToUrl: (url: string) => url }));
afterEach(() => vi.unstubAllGlobals());

describe('leaving an embedded browser', () => {
  const current = 'https://franky.es/login?next=%2Fperfil';
  it.each(['https://attacker.test/', 'javascript:alert(1)', '//attacker.test/',
    'https://franky.es.attacker.test/', 'https://name:pass@franky.es/',
    'https://franky.es:444/', 'https://[malformed'])('keeps the current page for unsafe destination %s', destination => {
    vi.stubGlobal('window', { location: { href: current } });
    expect(externalUrlWithAttribution(destination)).toBe(current);
  });
  it('preserves the current page and relative or absolute same-origin links', () => {
    vi.stubGlobal('window', { location: { href: current } });
    expect(externalUrlWithAttribution()).toBe(current);
    expect(externalUrlWithAttribution('/registro?ref=campus')).toBe('https://franky.es/registro?ref=campus');
    expect(externalUrlWithAttribution('https://franky.es/perfil')).toBe('https://franky.es/perfil');
  });
});
