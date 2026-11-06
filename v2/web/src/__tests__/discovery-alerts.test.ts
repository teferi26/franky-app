import { describe, expect, it } from 'vitest';
import { expoResults, pushCategory, pushSuppression, validExpoToken } from '../lib/push-delivery';
import { foldSearch, leisureQuery, readLeisureFilters, safeOcioReturn } from '../lib/discovery-filters';

describe('public discovery filters', () => {
  it('finds cities and places independently of accents', () => expect(foldSearch('  Café de Alcalá  ')).toBe('cafe de alcala'));
  it('round-trips a complete saved search including free admission and map view', () => {
    const f = readLeisureFilters(new URLSearchParams('ciudad=Alcalá&q=café&precio=0,2&servicios=has_wifi,has_terrace&valoracion=4.5&orden=price-asc&vista=map'));
    expect(readLeisureFilters(new URLSearchParams(leisureQuery(f)))).toEqual(f);
    expect(f.prices).toEqual([0, 2]);
  });
  it('bounds unknown filters and rejects external return destinations', () => {
    const f = readLeisureFilters(new URLSearchParams('precio=0,0,8,-1&orden=hack&vista=else&servicios=<script>&valoracion=999'));
    expect(f.prices).toEqual([0]); expect(f.sort).toBe('destacados'); expect(f.rating).toBe(0); expect(f.features).toEqual([]);
    for (const target of ['//evil.test', 'javascript:alert(1)', '/ocio/../../admin', '/ociox']) expect(safeOcioReturn(target)).toBe('/ocio');
    expect(safeOcioReturn('/ocio?ciudad=Madrid')).toBe('/ocio?ciudad=Madrid');
  });
});
describe('push preferences and provider acknowledgement', () => {
  it('respects separate housing/news choices without muting transactional requests', () => {
    expect(pushCategory('news')).toBe('news'); expect(pushCategory('accommodation')).toBe('housing');
    expect(pushCategory('accommodation_request')).toBe('other');
    expect(pushSuppression({ housing: false }, 'accommodation')).toBe('muted');
    expect(pushSuppression({ news: false }, 'message')).toBeNull();
    expect(pushSuppression({ all: false }, 'news')).toBe('muted');
  });
  it('evaluates quiet hours in Madrid, including midnight and malformed legacy values', () => {
    const prefs = { dnd: true, dnd_from: '23:00', dnd_to: '8:00' };
    expect(pushSuppression(prefs, 'news', new Date('2026-09-05T22:00:00Z'))).toBe('dnd');
    expect(pushSuppression(prefs, 'news', new Date('2026-09-05T06:00:00Z'))).toBeNull();
    expect(pushSuppression({ ...prefs, dnd_from: '99:99' }, 'news', new Date('2026-09-05T22:00:00Z'))).toBe('dnd');
    expect(pushSuppression({ dnd: true, dnd_from: '08:00', dnd_to: '08:00' }, 'news')).toBeNull();
  });
  it('accepts both Expo token formats without accepting native or malformed tokens', () => {
    expect(validExpoToken('ExpoPushToken[abc-123_456]')).toBe(true);
    expect(validExpoToken('ExponentPushToken[abc123]')).toBe(true);
    expect(validExpoToken('ExponentPushToken[abc] trailing')).toBe(false);
    expect(validExpoToken('native-token')).toBe(false);
  });
  it('does not count HTTP errors or malformed tickets as accepted', () => {
    expect(expoResults(['a'], { data: [{ status: 'ok', id: 'ticket' }] }, false)[0].status).toBe('retry');
    expect(expoResults(['a'], { data: [{ status: 'ok' }] }, true)[0].status).toBe('unknown');
    expect(expoResults(['a'], null, true)[0].status).toBe('unknown');
  });
  it('retains per-device receipts on partial success and separates permanent errors', () => {
    expect(expoResults(['a', 'b', 'c', 'd'], { data: [
      { status: 'ok', id: 'ticket-a' }, { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'MessageRateExceeded' } },
    ] }, true)).toEqual([
      { device_id: 'a', status: 'accepted', ticket_id: 'ticket-a' },
      { device_id: 'b', status: 'permanent_error', error: 'DeviceNotRegistered' },
      { device_id: 'c', status: 'retry', error: 'MessageRateExceeded' },
      { device_id: 'd', status: 'unknown', error: 'invalid_ticket' },
    ]);
  });
});
