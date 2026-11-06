import { describe, expect, it, vi } from 'vitest';
import { completeCatalogue as web } from '../lib/complete-catalogue';
import { completeCatalogue as mobile } from '../../../mobile/src/lib/complete-catalogue';

describe.each([['web', web], ['mobile', mobile]] as const)('%s complete academic catalogue', (_, read) => {
  it('includes records beyond the server row cap without overlaps', async () => {
    const all = Array.from({ length: 4384 }, (_, id) => ({ id }));
    const fetch = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    expect(await read(fetch)).toEqual(all);
    expect(fetch).toHaveBeenCalledTimes(9);
    expect(fetch).toHaveBeenLastCalledWith(4000, 4499);
  });
  it('rejects a later-page failure instead of reporting partial counts', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    await expect(read(fetch, 2)).rejects.toThrow('catálogo completo');
  });
  it('rejects an unavailable response but accepts a genuinely empty catalogue', async () => {
    await expect(read(async () => ({ data: null, error: null }))).rejects.toThrow();
    expect(await read(async () => ({ data: [], error: null }))).toEqual([]);
  });
  it('checks one more page at an exact boundary and does not silently truncate at the safety limit', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    expect(await read(fetch, 2)).toEqual([1, 2]);
    await expect(read(async () => ({ data: [1, 2], error: null }), 2, 2)).rejects.toThrow('límite');
  });
});
