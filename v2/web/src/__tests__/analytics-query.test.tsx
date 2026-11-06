import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalyticsQuery } from '../app/admin/analytics/hooks/useAnalyticsQuery';

const identity = vi.hoisted(() => ({ owner: 'admin-a' as string | null, valid: true }));
const isCurrent = () => identity.valid;
vi.mock('@/components/AccountScope', () => ({ useAccountGuard: () => ({ owner: identity.owner, isCurrent }) }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; };
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
beforeEach(() => { identity.owner = 'admin-a'; identity.valid = true; vi.stubGlobal('fetch', vi.fn()); });

describe('Administrative analytics query ownership and context', () => {
  it('never exposes the previous filters in the new filter render', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ users: 3 }) as Response).mockImplementationOnce(() => new Promise(() => {}));
    const q = renderHook(({ url }) => useAnalyticsQuery<{ users: number }>(url), { initialProps: { url: '/a' } });
    await waitFor(() => expect(q.result.current.data?.users).toBe(3)); q.rerender({ url: '/b' });
    expect(q.result.current.data).toBeNull(); expect(q.result.current.loading).toBe(true);
  });
  it('ignores a stale JSON body that resolves after a later filter', async () => {
    const old = deferred<unknown>(); vi.mocked(fetch).mockResolvedValueOnce({ ...response(null), json: () => old.promise } as Response).mockResolvedValueOnce(response({ users: 7 }) as Response);
    const q = renderHook(({ url }) => useAnalyticsQuery<{ users: number }>(url), { initialProps: { url: '/a' } }); await act(async () => {}); q.rerender({ url: '/b' });
    await waitFor(() => expect(q.result.current.data?.users).toBe(7)); await act(async () => old.resolve({ users: 99 }));
    expect(q.result.current.data?.users).toBe(7);
  });
  it('clears the response when the query is disabled', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ users: 3 }) as Response);
    const q = renderHook(({ url }: { url: string | null }) => useAnalyticsQuery(url), { initialProps: { url: '/a' as string | null } });
    await waitFor(() => expect(q.result.current.data).toEqual({ users: 3 })); q.rerender({ url: null });
    expect(q.result.current.data).toBeNull(); expect(q.result.current.loading).toBe(false);
  });
  it('does not show or retain the old administrator response after account changes', async () => {
    const old = deferred<unknown>(); vi.mocked(fetch).mockResolvedValueOnce({ ...response(null), json: () => old.promise } as Response).mockResolvedValueOnce(response({ users: 2 }) as Response);
    const q = renderHook(() => useAnalyticsQuery('/a')); await act(async () => {}); identity.owner = 'admin-b'; q.rerender();
    await waitFor(() => expect(q.result.current.data).toEqual({ users: 2 })); await act(async () => old.resolve({ users: 80 }));
    expect(q.result.current.data).toEqual({ users: 2 });
  });
  it('discards completion immediately after session invalidation', async () => {
    const old = deferred<Response>(); vi.mocked(fetch).mockReturnValue(old.promise);
    const q = renderHook(() => useAnalyticsQuery('/a')); identity.valid = false;
    await act(async () => old.resolve(response({ private: true }) as Response)); expect(q.result.current.data).toBeNull();
  });
  it('retries a failed request and recovers its actual data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: 'failed' }, 503) as Response).mockResolvedValueOnce(response({ users: 0 }) as Response);
    const q = renderHook(() => useAnalyticsQuery('/a')); await waitFor(() => expect(q.result.current.error).toMatch(/reintentar/));
    act(() => q.result.current.refetch()); await waitFor(() => expect(q.result.current.data).toEqual({ users: 0 })); expect(q.result.current.error).toBeNull();
  });
  it.each([[401, 'iniciar sesión'], [403, 'permiso'], [400, 'filtros']])('explains HTTP %s without substituting a zero', async (status, message) => {
    vi.mocked(fetch).mockResolvedValue(response({ error: 'failure' }, status) as Response); const q = renderHook(() => useAnalyticsQuery('/a'));
    await waitFor(() => expect(q.result.current.error).toContain(message)); expect(q.result.current.data).toBeNull();
  });
  it('identifies second-factor rejection without displaying server internals', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ detail: 'mfa_required', error: 'rpc_failed' }, 500) as Response);
    const q = renderHook(() => useAnalyticsQuery('/a')); await waitFor(() => expect(q.result.current.error).toContain('segundo factor'));
  });
  it('treats an invalid successful response as missing data, not an empty result', async () => {
    vi.mocked(fetch).mockResolvedValue(response(null) as Response); const q = renderHook(() => useAnalyticsQuery('/a'));
    await waitFor(() => expect(q.result.current.error).toContain('respuesta')); expect(q.result.current.data).toBeNull();
  });
});
