import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalyticsExport } from '../app/admin/analytics/hooks/useAnalyticsExport';

const identity = vi.hoisted(() => ({ owner: 'admin-a' as string | null, valid: true }));
const downloaded = vi.hoisted(() => vi.fn());
const isCurrent = () => identity.valid;
vi.mock('@/components/AccountScope', () => ({ useAccountGuard: () => ({ owner: identity.owner, isCurrent }) }));
vi.mock('@/lib/csv-export', () => ({ downloadJson: downloaded }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; };
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;
beforeEach(() => { identity.owner = 'admin-a'; identity.valid = true; downloaded.mockClear(); vi.stubGlobal('fetch', vi.fn(async () => response({ actual: 0, _scope: { complete: true } }))); });

describe('Administrative export', () => {
  it('includes current careers and screen usage, with explicit coverage and requested filters', async () => {
    const hook = renderHook(() => useAnalyticsExport('range=7d&city=Madrid'));
    await act(() => hook.result.current.downloadSnapshot());
    expect(fetch).toHaveBeenCalledTimes(8); expect(downloaded).toHaveBeenCalledOnce();
    const payload = downloaded.mock.calls[0][1]; expect(payload.complete).toBe(true); expect(payload.data.product).toEqual({ actual: 0, _scope: { complete: true } });
    expect(payload.requested_filters).toEqual({ range: '7d', city: 'Madrid' }); expect(payload.included_blocks).toHaveLength(8);
  });
  it('prevents double downloads before React can disable the button', async () => {
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const hook = renderHook(() => useAnalyticsExport('')); let first!: Promise<void>;
    act(() => { first = hook.result.current.downloadSnapshot(); void hook.result.current.downloadSnapshot(); }); expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => { pending.resolve(response({ actual: 2, _scope: { complete: true } })); await first; }); expect(downloaded).toHaveBeenCalledOnce();
  });
  it.each([['filters'], ['account'], ['logout'], ['unmount']])('discards a late export after %s changes', async change => {
    const json = deferred<unknown>(); vi.mocked(fetch).mockResolvedValue({ ...response(null), json: () => json.promise } as Response);
    const hook = renderHook(({ query }) => useAnalyticsExport(query), { initialProps: { query: '' } }); let task!: Promise<void>;
    act(() => { task = hook.result.current.downloadSnapshot(); }); await act(async () => {});
    if (change === 'filters') hook.rerender({ query: 'range=7d' });
    if (change === 'account') { identity.owner = 'admin-b'; hook.rerender({ query: '' }); }
    if (change === 'logout') identity.valid = false;
    if (change === 'unmount') hook.unmount();
    await act(async () => { json.resolve({ private: true }); await task; }); expect(downloaded).not.toHaveBeenCalled();
  });
  it.each([503, 403, 401])('does not present HTTP %s as a complete export', async status => {
    vi.mocked(fetch).mockResolvedValueOnce(response(null, status)); const hook = renderHook(() => useAnalyticsExport(''));
    await act(() => hook.result.current.downloadSnapshot()); expect(downloaded).not.toHaveBeenCalled(); expect(hook.result.current.message).toContain('No se ha exportado nada');
    expect(hook.result.current.downloading).toBe(false);
    await act(() => hook.result.current.downloadSnapshot()); await waitFor(() => expect(downloaded).toHaveBeenCalledOnce());
  });
  it('rejects a nominal 200 response marked incomplete by its source', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ _scope: { complete: false } })); const hook = renderHook(() => useAnalyticsExport(''));
    await act(() => hook.result.current.downloadSnapshot()); expect(downloaded).not.toHaveBeenCalled(); expect(hook.result.current.message).toContain('Resumen');
  });
  it.each([{ value: 0 }, { error: 'missing_source', _scope: { complete: true } }])('does not certify an unverified 200 result as complete', async body => {
    vi.mocked(fetch).mockResolvedValueOnce(response(body)); const hook = renderHook(() => useAnalyticsExport(''));
    await act(() => hook.result.current.downloadSnapshot()); expect(downloaded).not.toHaveBeenCalled();
  });
});
