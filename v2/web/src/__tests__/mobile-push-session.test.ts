import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionCache } from '../../../mobile/src/lib/session-cache';
import { createPushRegistration } from '../../../mobile/src/lib/push-registration';
import { createNotificationResponseHandler, type PushResponse } from '../../../mobile/src/lib/notification-response';
import { createSessionExit } from '../../../mobile/src/lib/session-exit';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), refreshSession: vi.fn(), listener: null as null | ((event: string, session: any) => void) }));
function makeSession() { return createSessionCache({
  getSession: auth.getSession, getUser: auth.getUser, refreshSession: auth.refreshSession,
  onAuthStateChange: (listener: typeof auth.listener) => { auth.listener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
} as any); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const account = (id: string) => ({ user: { id }, access_token: id });
const owner = { userId: 'a', generation: 1 };
beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); auth.listener = null; });

describe('mobile session cache isolation', () => {
  it('does not restore A after receiving the authenticated session of B', async () => {
    const slow = deferred<any>(); auth.getSession.mockReturnValueOnce(slow.promise);
    const session = makeSession();
    const read = session.getCachedSession(); auth.listener!('SIGNED_IN', account('b'));
    slow.resolve({ data: { session: account('a') }, error: null });
    expect(await read).toBeNull();
    expect((await session.getCachedSession())?.user.id).toBe('b');
  });
  it('never combines a user from A with the token from B', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'a' } }, error: null });
    auth.getSession.mockResolvedValue({ data: { session: account('b') }, error: null });
    const session = makeSession();
    expect(await session.getCachedUser()).toBeNull();
  });
  it('does not retry a failed action under the next account', async () => {
    const session = makeSession(); auth.listener!('SIGNED_IN', account('a'));
    const slow = deferred<void>(); const action = vi.fn().mockReturnValue(slow.promise);
    const result = session.withFreshSession(action);
    auth.listener!('SIGNED_IN', account('b')); slow.reject(new Error('jwt expired'));
    await expect(result).rejects.toThrow('session_changed');
    expect(action).toHaveBeenCalledTimes(1); expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it('allows a token refresh for the same identity, with one retry', async () => {
    const session = makeSession(); auth.listener!('SIGNED_IN', account('a'));
    auth.refreshSession.mockImplementation(async () => { auth.listener!('TOKEN_REFRESHED', account('a')); return { data: { session: account('a') }, error: null }; });
    const action = vi.fn().mockRejectedValueOnce(new Error('jwt expired')).mockResolvedValue('ok');
    expect(await session.withFreshSession(action)).toBe('ok'); expect(action).toHaveBeenCalledTimes(2);
  });
});

describe('native push registration lifecycle', () => {
  it('waits for the in-flight claim before deleting and rejects registrations started during logout', async () => {
    const claim = deferred<void>(); const events: string[] = [];
    const registry = createPushRegistration({ current: () => true, prepare: async () => 'token', existing: async () => 'token',
      claim: async () => { events.push('claim'); await claim.promise; }, remove: async () => { events.push('delete'); } });
    const registering = registry.register(owner); await vi.waitFor(() => expect(events).toEqual(['claim']));
    const removing = registry.unregister(owner); const late = registry.register(owner);
    expect(events).toEqual(['claim']); claim.resolve(); await Promise.all([registering, removing, late]);
    expect(events).toEqual(['claim', 'delete']);
  });
  it('does not swallow a failed remote revocation', async () => {
    const registry = createPushRegistration({ current: () => true, prepare: async () => 'token', existing: async () => 'token', claim: vi.fn(), remove: async () => { throw new Error('offline'); } });
    await expect(registry.unregister(owner)).rejects.toThrow('offline');
  });
  it('discards token acquisition if the account changed while requesting permission', async () => {
    let current = true; const token = deferred<string | null>(); const claim = vi.fn();
    const registry = createPushRegistration({ current: () => current, prepare: () => token.promise, existing: async () => null, claim, remove: vi.fn() });
    const pending = registry.register(owner); await Promise.resolve(); current = false; token.resolve('token'); await pending;
    expect(claim).not.toHaveBeenCalled();
  });
});

describe('notification tap ownership', () => {
  const response = (recipient = 'a'): PushResponse => ({ actionIdentifier: 'default', notification: { request: { identifier: 'notice', content: { data: { recipient_user_id: recipient, url: '/novedades' } } } } });
  const setup = () => { const navigate = vi.fn(); const consume = vi.fn().mockResolvedValue(undefined); const handler = createNotificationResponseHandler({ owner: 'a', isCurrent: () => true, destination: () => '/novedades', navigate, consume, seen: new Set() }); return { handler, navigate, consume }; };
  it('does not navigate after cleanup or twice for a cold-start/live duplicate', () => {
    const one = setup(); one.handler.handle(response()); one.handler.handle(response()); expect(one.navigate).toHaveBeenCalledOnce();
    const two = setup(); two.handler.stop(); two.handler.handle(response()); expect(two.navigate).not.toHaveBeenCalled();
  });
  it('consumes but does not open another account notification or an unowned legacy payload', () => {
    for (const recipient of ['b', '']) { const { handler, navigate, consume } = setup(); handler.handle(response(recipient)); expect(navigate).not.toHaveBeenCalled(); expect(consume).toHaveBeenCalledOnce(); }
  });
});

describe('logout belongs to the account that requested it', () => {
  it('does not sign B out when A finishes cleaning up', async () => {
    let current = true; const revoke = deferred<void>(); const signOut = vi.fn();
    const exit = createSessionExit({ current: () => current, revoke: () => revoke.promise, clearLocal: async () => {}, clearQueue: async () => {}, signOut, resume: vi.fn() });
    const pending = exit(owner); current = false; revoke.resolve();
    await expect(pending).rejects.toThrow('session_changed'); expect(signOut).not.toHaveBeenCalled();
  });
  it('keeps the session when device revocation fails, and waits for the other cleanup to stop', async () => {
    const clear = deferred<void>(); const signOut = vi.fn(); const resume = vi.fn();
    const exit = createSessionExit({ current: () => true, revoke: async () => { throw new Error('offline'); }, clearLocal: () => clear.promise, clearQueue: async () => {}, signOut, resume });
    const pending = exit(owner); await Promise.resolve(); await Promise.resolve(); expect(resume).not.toHaveBeenCalled();
    clear.resolve(); await expect(pending).rejects.toThrow('offline'); expect(signOut).not.toHaveBeenCalled();
  });
});
