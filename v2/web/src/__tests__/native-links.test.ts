import { describe, expect, it, vi } from 'vitest';
import { createNativeIntentHandler, resolveIncomingLink } from '../../../mobile/src/lib/native-links';
const id = '12345678-1234-4234-8234-123456789012';

describe('incoming website links in the native app', () => {
  it('maps payment returns to an owned lookup and drops untrusted success claims', async () => {
    expect(await resolveIncomingLink(`https://franky.es/pago/retorno?order_id=${id}&pay=ok&status=paid`, vi.fn())).toBe(`/pago-retorno?order_id=${id}`);
    expect(await resolveIncomingLink('https://franky.es/pago/retorno?order_id=invalid&pay=ok', vi.fn())).toBe('/pago-retorno');
  });
  it('opens a contract invitation without trusting signing or identity query flags', async () => {
    expect(await resolveIncomingLink(`/contratos/${id}?id=other&signed=true`, vi.fn())).toBe(`/contrato/${id}`);
    expect(await resolveIncomingLink('/contratos/invalid', vi.fn())).toBe('/mi-alquiler');
  });
  it('does not reopen a stale campus when a newer incoming link already resolved', async () => {
    let finish!: (value: string) => void;
    const slow = new Promise<string>(resolve => { finish = resolve; });
    const redirect = createNativeIntentHandler(path => path === '/universidades/slow' ? slow : Promise.resolve('/roomie'));
    const first = redirect({ path: '/universidades/slow', initial: false });
    expect(await redirect({ path: '/roomie-match', initial: false })).toBe('/roomie');
    finish(`/uni/${id}`);
    expect(await first).toBe('');
  });
  it('opens the exact FOMO thread from a shared web URL without a lookup', async () => {
    const find = vi.fn();
    expect(await resolveIncomingLink(`https://franky.es/fomo/universidad-de-alicante/${id}`, find)).toBe(`/fomo/${id}`);
    expect(find).not.toHaveBeenCalled();
  });
  it('resolves a campus slug to its native campus board', async () => {
    const find = vi.fn().mockResolvedValue(id);
    expect(await resolveIncomingLink('/fomo/universidad-de-alicante', find)).toBe(`/fomo-uni/${id}`);
    expect(find).toHaveBeenCalledWith('universities', 'universidad-de-alicante');
  });
  it.each([
    ['/universidades/universidad-de-alicante', `/uni/${id}`, 'universities'],
    ['/carreras/grado-en-medicina', `/carrera/${id}`, 'careers'],
  ])('resolves the catalog URL %s', async (url, expected, table) => {
    const find = vi.fn().mockResolvedValue(id);
    expect(await resolveIncomingLink(url, find)).toBe(expected);
    expect(find.mock.calls[0][0]).toBe(table);
  });
  it.each([
    [`/becas/${id}`, `/beca/${id}`], [`/eventos/${id}`, `/evento/${id}`],
    [`/fomo/${id}`, `/fomo/${id}`], ['/roomie-match/conexiones', '/roomie-conexiones'],
    ['/roomie-match', '/roomie'],
    ['/noticias/nuevo-franky', '/noticia/nuevo-franky'], ['/noticias', '/novedades'],
    [`/alojamiento/${id}`, `/piso/${id}`], ['/alojamiento', '/pisos'],
    ['/universidades/comparar', '/comparar-unis'], ['/fomo', '/(tabs)/feed'],
  ])('uses existing native screens for %s', async (url, expected) => {
    expect(await resolveIncomingLink(url, vi.fn())).toBe(expected);
  });
  it('retains callbacks, unhandled paths and other domains without querying the catalog', async () => {
    const find = vi.fn();
    for (const url of ['franky://auth/callback?code=example', 'https://other.test/carreras/grado', '/auth/callback?code=example']) {
      expect(await resolveIncomingLink(url, find)).toBe(url);
    }
    expect(find).not.toHaveBeenCalled();
  });
  it('uses the real list when offline or when the slug no longer exists', async () => {
    expect(await resolveIncomingLink('/universidades/unknown', vi.fn().mockRejectedValue(new Error('offline')))).toBe('/universidades');
    expect(await resolveIncomingLink('/carreras/unknown', vi.fn().mockResolvedValue(null))).toBe('/notas-corte');
  });
  it('does not query invalid or encoded paths', async () => {
    const find = vi.fn();
    expect(await resolveIncomingLink('/universidades/%2Fadmin', find)).toBe('/+not-found');
    expect(await resolveIncomingLink('/universidades/%E0%A4%A', find)).toBe('/+not-found');
    expect(find).not.toHaveBeenCalled();
  });
  it('keeps the path resource identity when the query contains an id', async () => {
    expect(await resolveIncomingLink(`/becas/${id}?id=other&from=share`, vi.fn())).toBe(`/beca/${id}?from=share`);
  });
});
