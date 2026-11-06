// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as contract from '../../../mobile/src/lib/payment-contract';

function fixture() {
  const owner = { userId: 'buyer-A', generation: 1 }; let active = true;
  const browser = vi.fn(async () => ({}));
  const fetch = vi.fn(async (_url: string, _options: { body?: string }) => ({ ok: true, status: 200, json: async () => ({ status: 'checkout', url: 'https://checkout.stripe.com/test', order_id: 'order' }) }));
  const rpc = vi.fn(async () => ({ data: { ticket_id: 'ticket' }, error: null }));
  const read = vi.fn(async () => ({ data: { status: 'valid' }, error: null as unknown }));
  const pages = vi.fn(async () => ({ data: [] as any[], error: null as unknown }));
  const equal = vi.fn();
  const cursor = vi.fn();
  const query = () => { const q: any = { select: () => q, eq: (...args: unknown[]) => { equal(...args); return q; }, maybeSingle: read,
    in: () => q, order: () => q, limit: () => q, or: (value: string) => { cursor(value); return q; }, then: (resolve: any) => pages().then(resolve) }; return q; };
  const check = () => { if (!active) throw new Error('session_changed'); };
  const mocks: Record<string, unknown> = {
    'expo-web-browser': { openBrowserAsync: browser, WebBrowserPresentationStyle: { PAGE_SHEET: 'sheet' } },
    'react-native': { Platform: { OS: 'ios' } },
    './session': { captureSessionIdentity: () => owner },
    './supabase': { WEB_URL: 'https://franky.es', fetchConTimeout: fetch, supabase: { rpc, from: query } },
    './owned-request': { withOwnedRequest: async (_owner: unknown, run: any) => { check(); const result = await run({ owner, check, signal: new AbortController().signal, authorization: 'Bearer synthetic-A', query: (q: unknown) => { check(); return q; } }); check(); return result; } },
    './payment-contract': contract,
  };
  const mod = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(resolve('../mobile/src/lib/payments.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports: mod.exports, module: mod, require: (name: string) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, setTimeout, clearTimeout, Promise, Map });
  return { api: mod.exports, fetch, rpc, browser, read, equal, pages, cursor, switchAccount: () => { active = false; } };
}
afterEach(() => vi.useRealTimers());
describe('native payment operation integrity', () => {
  it('loads seller earnings beyond 500 with a stable cursor rather than silently truncating totals', async () => {
    const f = fixture();
    const page = Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}`, created_at: '2026-09-22T12:00:00Z', metadata: {} }));
    f.pages.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: [{ id: 'older', created_at: '2026-09-21T12:00:00Z', metadata: {} }], error: null });
    const result = await f.api.getMyEarnings();
    expect(result.rows).toHaveLength(501);
    expect(f.cursor).toHaveBeenCalledWith('created_at.lt.2026-09-22T12:00:00Z,and(created_at.eq.2026-09-22T12:00:00Z,id.lt.id-499)');
    expect(f.equal).toHaveBeenCalledWith('seller_id', 'buyer-A');
  });
  it('deduplicates double taps before the ticket reservation starts', async () => {
    const f = fixture();
    const [a, b] = await Promise.all([f.api.buyTicket('event', 'PROMO'), f.api.buyTicket('event', 'PROMO')]);
    expect(a).toEqual({ ok: true, status: 'paid' }); expect(b).toEqual(a);
    expect(f.rpc).toHaveBeenCalledOnce(); expect(f.browser).toHaveBeenCalledOnce();
    expect(JSON.parse(f.fetch.mock.calls[0][1].body!)).toEqual({ ticket_id: 'ticket', code: 'PROMO', return_to: 'app' });
    expect(f.equal).toHaveBeenCalledWith('holder_id', 'buyer-A');
  });
  it('preserves the reservation if the network disappears after sending checkout', async () => {
    const f = fixture(); f.fetch.mockRejectedValue(new Error('response lost'));
    expect(await f.api.buyTicket('event')).toEqual({ ok: false, status: 'pending', ticketId: 'ticket' });
    expect(f.fetch).toHaveBeenCalledOnce(); expect(f.fetch.mock.calls[0][0]).not.toContain('/cancel');
    expect(f.browser).not.toHaveBeenCalled();
  });
  it('never opens a delayed A checkout after the account changes to B', async () => {
    const f = fixture();
    f.fetch.mockImplementation(async () => { f.switchAccount(); return { ok: true, status: 200, json: async () => ({ status: 'checkout', url: 'https://checkout.stripe.com/test', order_id: 'order' }) }; });
    await expect(f.api.buyTicket('event')).rejects.toThrow('session_changed');
    expect(f.browser).not.toHaveBeenCalled();
  });
  it('does not open a browser for a fully discounted already-issued ticket', async () => {
    const f = fixture(); f.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'paid', free: true }) } as any);
    expect(await f.api.buyTicket('event', 'FREE')).toEqual({ ok: true, status: 'paid' });
    expect(f.browser).not.toHaveBeenCalled();
  });
  it('returns pending, not cancelled, when owned ticket reads fail', async () => {
    vi.useFakeTimers(); const f = fixture(); f.read.mockResolvedValue({ data: null, error: new Error('offline') } as any);
    const result = f.api.resumeTicketPayment('ticket');
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: false, status: 'pending', ticketId: 'ticket' });
  });
  it('blocks native digital billing portal on Android as well as iOS at the library boundary', async () => {
    const f = fixture(); expect((await f.api.openBillingPortal()).ok).toBe(false);
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.browser).not.toHaveBeenCalled();
  });
});
