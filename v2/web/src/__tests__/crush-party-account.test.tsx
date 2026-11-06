import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePartyAccount } from '../app/crush/fiesta/usePartyAccount';
const f = vi.hoisted(() => ({ session: null as any, getSession: vi.fn(), listeners: new Set<(event: string, session: any) => void>(), fetch: vi.fn() }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: {
  getSession: f.getSession, onAuthStateChange(callback: any) { f.listeners.add(callback); return { data: { subscription: { unsubscribe: () => f.listeners.delete(callback) } } }; },
} }) }));
const session = (id: string) => ({ user: { id }, access_token: `token-${id}` });
const emit = (event: string, value: any) => { f.session = value; f.listeners.forEach(listener => listener(event, value)); };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => {
  f.listeners.clear(); f.session = session('a'); f.getSession.mockReset().mockImplementation(async () => ({ data: { session: f.session }, error: null }));
  f.fetch.mockReset().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal('fetch', f.fetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function ready() { const hook = renderHook(() => usePartyAccount()); await waitFor(() => expect(hook.result.current.ready).toBe(true)); return hook; }
describe('Party drafts and requests stay with the login that created them', () => {
  it('pins the original bearer and never relies on another tab’s cookie', async () => {
    const h = await ready(); await h.result.current.request('/api/party', { body: 'hola' });
    expect(f.fetch).toHaveBeenCalledWith('/api/party', expect.objectContaining({ method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer token-a', 'Content-Type': 'application/json' }, body: '{"body":"hola"}' }));
  });
  it('ignores stale initial session resolution after a newer auth event', async () => {
    const pending = deferred<any>(); f.getSession.mockReturnValueOnce(pending.promise);
    const h = renderHook(() => usePartyAccount()); act(() => emit('SIGNED_IN', session('b')));
    await act(async () => pending.resolve({ data: { session: session('a') }, error: null })); expect(h.result.current.userId).toBe('b');
  });
  it('ignores the previous StrictMode effect’s delayed initial session', async () => {
    const old = deferred<any>(), fresh = deferred<any>();
    f.getSession.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const h = renderHook(() => usePartyAccount(), { reactStrictMode:true });
    expect(f.getSession).toHaveBeenCalledTimes(2);
    await act(async () => fresh.resolve({data:{session:session('b')},error:null})); expect(h.result.current.userId).toBe('b');
    await act(async () => old.resolve({data:{session:session('a')},error:null})); expect(h.result.current.userId).toBe('b');
  });
  it('times out an auth lock and never sends the old draft when the lock later resolves', async () => {
    const h = await ready(), pending = deferred<any>(); f.getSession.mockReturnValueOnce(pending.promise); vi.useFakeTimers();
    const action = h.result.current.request('/api/party',{draft:'Do not send later'}), rejection = expect(action).rejects.toThrow(/conexión está tardando/);
    await vi.advanceTimersByTimeAsync(20001); await rejection;
    pending.resolve({data:{session:session('a')},error:null}); await Promise.resolve(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('invalidates old actions even when the same account logs back in within one React batch', async () => {
    const h = await ready(), old = h.result.current, oldKey = old.key;
    act(() => { emit('SIGNED_OUT', null); emit('SIGNED_IN', session('a')); });
    expect(h.result.current.key).not.toBe(oldKey); expect(old.isCurrent()).toBe(false);
    await expect(old.request('/api/party', {})).rejects.toThrow(/sesión ha cambiado/); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('does not send a draft if the account changed while getting its token', async () => {
    const h = await ready(), pending = deferred<any>(); f.getSession.mockReturnValueOnce(pending.promise);
    const action = h.result.current.request('/api/party', { secret: 'a draft' }), rejection = expect(action).rejects.toThrow(/sesión ha cambiado/);
    act(() => emit('SIGNED_IN', session('b'))); pending.resolve({ data: { session: session('a') }, error: null }); await rejection; expect(f.fetch).not.toHaveBeenCalled();
  });
  it('aborts the old request and rejects its late success on logout', async () => {
    const h = await ready(), pending = deferred<Response>(); f.fetch.mockReturnValueOnce(pending.promise);
    const action = h.result.current.request('/api/party'), rejection = expect(action).rejects.toThrow(/sesión ha cambiado/);
    await waitFor(() => expect(f.fetch).toHaveBeenCalled()); const signal = f.fetch.mock.calls[0][1].signal;
    act(() => emit('SIGNED_OUT', null)); expect(signal.aborted).toBe(true); pending.resolve(Response.json({ private: 'a' })); await rejection;
  });
  it('aborts all requests when leaving the party', async () => {
    const h = await ready(), pending = deferred<Response>(); f.fetch.mockReturnValueOnce(pending.promise);
    const action = h.result.current.request('/api/party'), rejection = expect(action).rejects.toThrow(/sesión ha cambiado/);
    await waitFor(() => expect(f.fetch).toHaveBeenCalled()); h.unmount(); expect(f.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    pending.resolve(Response.json({ ok: true })); await rejection;
  });
  it('shows a real server validation failure instead of treating it as saved', async () => {
    const h = await ready(); f.fetch.mockResolvedValueOnce(Response.json({ message: 'Completa tu carrera.' }, { status: 400 }));
    await expect(h.result.current.request('/api/party', {})).rejects.toThrow('Completa tu carrera.');
  });
  it('does not silently authenticate a guest request', async () => {
    f.session = null; const h = await ready(); await expect(h.result.current.request('/api/party', {})).rejects.toThrow(); expect(f.fetch).not.toHaveBeenCalled();
  });
});
