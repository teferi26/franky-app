import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nativeLoader } from './helpers/native-module';

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  let owner = { userId: 'admin-a', generation: 1 };
  const mfa = { challenge: vi.fn(async () => ({ data: { id: 'challenge' }, error: null })), verify: vi.fn(async () => ({ data: {}, error: null })), listFactors: vi.fn(async (): Promise<any> => ({ data: { all: [{ id: 'pending-factor', status: 'unverified' }] }, error: null })), unenroll: vi.fn(async () => ({ error: null })), enroll: vi.fn(async () => ({ data: { id: 'new-factor', totp: { uri: 'otpauth://fixture', secret: 'synthetic' } }, error: null })) };
  const supabase = { rpc: vi.fn(async () => ({ data: {}, error: null })), auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: owner.userId }, access_token: `test-${owner.userId}` } }, error: null })), mfa } };
  const fetcher = vi.fn(async (): Promise<any> => ({ ok: true, status: 200, json: async () => ({ total_users: 3, pending_reports: 5, mrr_estimate: 100, _scope: { complete: true } }) }));
  const mocks: Record<string, any> = { '@/lib/supabase': { supabase, WEB_URL: 'https://example.invalid', fetchConTimeout: fetcher }, '@/lib/session': { captureSessionIdentity: () => ({ ...owner }), isCurrentSessionIdentity: (captured: typeof owner) => captured.generation === owner.generation && captured.userId === owner.userId } };
  mocks['@/lib/owned-request'] = {};
  mocks['./admin-operation-result'] = nativeLoader({})('../mobile/src/lib/admin-operation-result.ts');
  const path = resolve('../mobile/src/lib/admin.ts'), mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports: mod.exports, module: mod, console, Date, Error, setTimeout, clearTimeout, require: (name: string) => { if (name in mocks) return mocks[name]; throw Error(name); } }, { filename: path });
  return { api: mod.exports as any, mfa, supabase, fetcher, changeSession() { owner = { userId: 'admin-b', generation: owner.generation + 1 }; } };
}

describe('Native administrative summaries use the complete authenticated source', () => {
  it('keeps multi-step MFA bound to its initial account even without a screen guard', async () => {
    const f = fixture(), pending = deferred<any>(); f.mfa.challenge.mockReturnValueOnce(pending.promise);
    const request = f.api.elevateWithTotp('factor-a', '123456'); const rejected = expect(request).rejects.toThrow('session_changed');
    f.changeSession(); pending.resolve({ data: { id: 'old-challenge' }, error: null }); await rejected; expect(f.mfa.verify).not.toHaveBeenCalled();
  });
  it('loads KPI totals from the web endpoint with the selected period and bearer', async () => {
    const f = fixture(); expect(await f.api.getKpis(7)).toMatchObject({ pending_reports: 5, mrr_estimate: 100 });
    expect(f.fetcher).toHaveBeenCalledWith('https://example.invalid/api/admin/analytics/kpis?range=7d', { headers: { Authorization: 'Bearer test-admin-a' } }); expect(f.supabase.rpc).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])('does not fall back to an incomplete financial RPC for HTTP %s', async status => {
    const f = fixture(); f.fetcher.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'unavailable' }) });
    await expect(f.api.getMonetizacion()).rejects.toThrow(); expect(f.supabase.rpc).not.toHaveBeenCalled();
  });
  it('preserves MFA errors so the screen can request verification', async () => {
    const f = fixture(); f.fetcher.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'mfa_required' }) }); await expect(f.api.getKpis()).rejects.toBeInstanceOf(f.api.MfaRequiredError);
  });
  it('rejects a nominally successful but explicitly incomplete result', async () => {
    const f = fixture(); f.fetcher.mockResolvedValue({ ok: true, status: 200, json: async () => ({ _scope: { complete: false } }) }); await expect(f.api.getMonetizacion()).rejects.toThrow(/verificar/);
  });
  it('discards a delayed JSON body from a previous session', async () => {
    const f = fixture(), pending = deferred<any>(), json = vi.fn(() => pending.promise); f.fetcher.mockResolvedValue({ ok: true, status: 200, json });
    const request = f.api.getProductAnalytics(30); const rejected = expect(request).rejects.toThrow('session_changed');
    await vi.waitFor(() => expect(json).toHaveBeenCalled()); f.changeSession(); pending.resolve({ current_careers: [{ name: 'private-a' }] }); await rejected;
  });
  it('does not verify the previous factor after the account changes during its challenge', async () => {
    const f = fixture(), pending = deferred<any>(); let current = true; f.mfa.challenge.mockReturnValueOnce(pending.promise);
    const request = f.api.elevateWithTotp('factor-a', '123456', () => current); const rejected = expect(request).rejects.toThrow('session_changed'); current = false; pending.resolve({ data: { id: 'challenge-a' }, error: null }); await rejected; expect(f.mfa.verify).not.toHaveBeenCalled();
  });
  it('does not remove or enroll factors after a stale list response', async () => {
    const f = fixture(), pending = deferred<any>(); let current = true; f.mfa.listFactors.mockReturnValueOnce(pending.promise);
    const request = f.api.empezarAltaTotp('Franky', () => current); const rejected = expect(request).rejects.toThrow('session_changed'); current = false; pending.resolve({ data: { all: [{ id: 'factor-a', status: 'unverified' }] }, error: null }); await rejected; expect(f.mfa.unenroll).not.toHaveBeenCalled(); expect(f.mfa.enroll).not.toHaveBeenCalled();
  });
  it('does not enroll a new factor when the existing factor list could not be checked', async () => {
    const f = fixture(); f.mfa.listFactors.mockResolvedValue({ data: null, error: new Error('offline') }); await expect(f.api.empezarAltaTotp()).rejects.toThrow('offline'); expect(f.mfa.enroll).not.toHaveBeenCalled();
  });
});
