import React, { useState } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSessionScope, useAdminRequest } from '../app/admin/components/AdminSessionScope';
import { useAdminData, useAdminAction } from '../app/admin/components/useAdminManagement';

const sdk = vi.hoisted(() => ({ session: null as any, role: 'admin', discarded: false, callbacks: new Set<(event: string, session: any) => void>(), records: [] as any[], getSession: vi.fn(), reply: vi.fn() }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: {
  getSession: sdk.getSession,
  onAuthStateChange(callback: any) { sdk.callbacks.add(callback); return { data: { subscription: { unsubscribe: () => sdk.callbacks.delete(callback) } } }; },
}, from(table: string) {
  const record = { table, headers: {} as Record<string, string>, signal: undefined as AbortSignal | undefined };
  const builder: any = { select: () => builder, eq: () => builder, maybeSingle: () => builder,
    setHeader(name: string, value: string) { record.headers[name] = value; return builder; },
    abortSignal(signal: AbortSignal) { record.signal = signal; return builder; },
    then(yes: any, no: any) { sdk.records.push(record); return sdk.reply(record).then(yes, no); },
  }; return builder;
} }) }));
const session = (id: string, aal = 'aal2') => ({ user: { id }, access_token: `header.${btoa(JSON.stringify({ sub: id, aal }))}.signature` });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const emit = (event: string, value: any) => { sdk.session = value; for (const callback of sdk.callbacks) callback(event, value); };
const wrapper = ({ children }: { children: React.ReactNode }) => <AdminSessionScope viewerId="a">{children}</AdminSessionScope>;
beforeEach(() => {
  sdk.session = session('a'); sdk.role = 'admin'; sdk.discarded = false; sdk.records.length = 0; sdk.callbacks.clear();
  sdk.getSession.mockReset().mockImplementation(async () => ({ data: { session: sdk.session }, error: null }));
  sdk.reply.mockReset().mockImplementation(async () => ({ data: { role: sdk.role, is_discarded: sdk.discarded }, error: null }));
});

describe('Web management owns its reads, confirmations and mutations', () => {
  it('pins the original token on permission and data queries', async () => {
    const { createClient } = await import('@/lib/supabase-client');
    const h = renderHook(() => useAdminRequest(), { wrapper });
    await act(async () => { await h.result.current.run(async r => { await r.query(createClient().from('user_reports').select('id')); }); });
    expect(sdk.records.map(r => r.headers.Authorization)).toEqual([`Bearer ${session('a').access_token}`, `Bearer ${session('a').access_token}`]);
  });
  it('rejects completion after account change during getSession', async () => {
    const pending = deferred<any>(); sdk.getSession.mockReturnValueOnce(pending.promise);
    const h = renderHook(() => useAdminRequest(), { wrapper }), work = vi.fn();
    const operation = h.result.current.run(work), rejected = expect(operation).rejects.toThrow(/sesión ha cambiado/);
    act(() => emit('SIGNED_IN', session('b'))); pending.resolve({ data: { session: session('a') }, error: null }); await rejected;
    expect(work).not.toHaveBeenCalled(); expect(sdk.records).toHaveLength(0);
  });
  it('invalidates old confirmations even after logout and login of the same UID in one render batch', async () => {
    const h = renderHook(() => useAdminRequest(), { wrapper }), previous = h.result.current.run, work = vi.fn();
    act(() => { emit('SIGNED_OUT', null); emit('SIGNED_IN', session('a')); });
    await expect(previous(work)).rejects.toThrow(/sesión ha cambiado/); expect(work).not.toHaveBeenCalled();
    await h.result.current.run(async () => 'new');
  });
  it('clears a private draft on a same-UID logout/login', () => {
    function Draft() { const [value, set] = useState(''); return <input aria-label="Draft" value={value} onChange={e => set(e.target.value)} />; }
    render(wrapper({ children: <Draft /> })); fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Private draft' } });
    act(() => { emit('SIGNED_OUT', null); emit('SIGNED_IN', session('a')); }); expect(screen.getByLabelText('Draft')).toHaveValue('');
  });
  it.each(['aal1', 'analyst', 'discarded'])('blocks unauthorized writes for %s before work', async condition => {
    if (condition === 'aal1') sdk.session = session('a', 'aal1');
    if (condition === 'analyst') sdk.role = 'analyst';
    if (condition === 'discarded') sdk.discarded = true;
    const h = renderHook(() => useAdminRequest(), { wrapper }), work = vi.fn();
    await expect(h.result.current.run(work, { write: true })).rejects.toThrow(); expect(work).not.toHaveBeenCalled();
  });
  it('aborts requests when only the management section unmounts', async () => {
    const pending = deferred<void>(), h = renderHook(() => useAdminRequest(), { wrapper }); let signal!: AbortSignal;
    const operation = h.result.current.run(async r => { signal = r.signal; await pending.promise; }), rejected = expect(operation).rejects.toThrow(/sesión ha cambiado/);
    await waitFor(() => expect(signal).toBeDefined()); h.unmount(); expect(signal.aborted).toBe(true); pending.resolve(); await rejected;
  });
  it('does not replace new filter data with a late old response', async () => {
    const pending = deferred<string>();
    const h = renderHook(({ key }) => useAdminData(async () => key === 'old' ? pending.promise : 'new-data', key), { wrapper, initialProps: { key: 'old' } });
    await waitFor(() => expect(sdk.records).toHaveLength(1)); h.rerender({ key: 'new' }); expect(h.result.current.data).toBeNull();
    await waitFor(() => expect(h.result.current.data).toBe('new-data')); await act(async () => pending.resolve('stale')); expect(h.result.current.data).toBe('new-data');
  });
  it('retries failed list reads without presenting an empty list', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const h = renderHook(() => useAdminData(loader), { wrapper }); await waitFor(() => expect(h.result.current.error).toBe('offline'));
    expect(h.result.current.data).toBeNull(); await act(async () => h.result.current.reload()); expect(h.result.current.data).toEqual([]);
  });
  it('coalesces simultaneous clicks and releases the action after failure', async () => {
    const pending = deferred<void>(), first = vi.fn(() => pending.promise), second = vi.fn(async () => {});
    const h = renderHook(() => useAdminAction(), { wrapper });
    let operation!: Promise<void>;
    act(() => { operation = h.result.current.act(first); void h.result.current.act(second); });
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1)); expect(second).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(); await operation; });
    await act(async () => { await h.result.current.act(async () => { throw Error('failed'); }); }); expect(h.result.current.error).toBe('failed'); expect(h.result.current.saving).toBe(false);
    await act(async () => h.result.current.act(second)); expect(second).toHaveBeenCalledTimes(1);
  });
});
