import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture() {
  let owner = { userId: 'a', generation: 1 };
  const listeners = new Set<() => void>();
  const getSession = vi.fn(async (): Promise<any> => ({ data: { session: { user: { id: owner.userId }, access_token: `token-${owner.userId}` } } }));
  const fetch = vi.fn(async (): Promise<any> => ({ ok: true, json: async () => ({ balance: 10 }) }));
  const load = nativeLoader({
    './supabase': { supabase: { auth: { getSession } }, WEB_URL: 'https://example.invalid', fetchConTimeout: fetch },
    './session': { captureSessionIdentity: () => owner, isCurrentSessionIdentity: (expected: any) => expected === owner,
      onSessionIdentityChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } },
  });
  const { growthRequest } = load('../mobile/src/lib/growth.ts');
  return { growthRequest, fetch, getSession, change(userId = 'b') { owner = { userId, generation: owner.generation + 1 }; listeners.forEach(listener => listener()); } };
}
describe('native growth request ownership', () => {
  it('never submits an old action with the new account returned by a delayed session read', async () => {
    const f = fixture(), session = deferred<any>(); f.getSession.mockReturnValueOnce(session.promise);
    const result = f.growthRequest({ action: 'redeem', reward: 'planning_pack' }).catch((e: Error) => e.message);
    f.change(); session.resolve({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } } });
    expect(await result).toBe('session_changed'); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('cancels a request and discards its response after an account switch', async () => {
    const f = fixture(), response = deferred<any>(); f.fetch.mockReturnValueOnce(response.promise);
    const result = f.growthRequest().catch((e: Error) => e.message);
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
    const options = (f.fetch.mock.calls as unknown as [string, RequestInit][])[0][1];
    expect(options.headers).toMatchObject({ Authorization: 'Bearer token-a' });
    f.change(); expect(options.signal?.aborted).toBe(true);
    response.resolve({ ok: true, json: async () => ({ secret: 'account-a' }) });
    expect(await result).toBe('session_changed');
  });
  it('also rejects logout and login of the same UID while waiting for credentials', async () => {
    const f = fixture(), session = deferred<any>(); f.getSession.mockReturnValueOnce(session.promise);
    const result = f.growthRequest({ action: 'apply' }).catch((e: Error) => e.message);
    f.change('a'); session.resolve({ data: { session: { user: { id: 'a' }, access_token: 'new-token-a' } } });
    expect(await result).toBe('session_changed'); expect(f.fetch).not.toHaveBeenCalled();
  });
});
