import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const nativeRequire = createRequire(resolve('../mobile/package.json'));
const { GoTrueClient, processLock } = nativeRequire('@supabase/auth-js');
function nativeModule(name: string) {
  const filename = resolve(`../mobile/src/lib/${name}.ts`), mod = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module: mod, exports: mod.exports, Error, Date, Set, console }, { filename });
  return mod.exports;
}
const { coordinateAuth, withHandledLockErrors } = nativeModule('auth-coordinator');
const authLock = withHandledLockErrors(processLock);
const { createSessionCache } = nativeModule('session-cache');
const pause = <T = void,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const turn = () => new Promise<void>(yes => setImmediate(yes));
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
function session(id: string, aal = 'aal1', ttl = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return { access_token: [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: id, aal, exp })).toString('base64url'), 'fixture'].join('.'),
    refresh_token: `fixture-${id}`, expires_in: ttl, expires_at: exp, token_type: 'bearer',
    user: { id, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
let sequence = 0;
async function fixture(onFetch?: (url: URL, init: RequestInit) => Promise<Response | undefined>) {
  const key = `auth-coordinator-test-${++sequence}`, storage = new Map([[key, JSON.stringify(session(A))]]);
  const requests: { path: string; grant: string | null; actor: string | null }[] = [];
  const auth = new GoTrueClient({ url: 'https://fixture.invalid', storageKey: key,
    storage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); } },
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, lock: authLock, lockAcquireTimeout: 2000,
    fetch: async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input)); expect(url.origin).toBe('https://fixture.invalid');
      const token = new Headers(init.headers).get('Authorization')?.replace(/^Bearer /, '');
      const actor = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : null;
      requests.push({ path: url.pathname, grant: url.searchParams.get('grant_type'), actor });
      if (onFetch) { const value = await onFetch(url, init); if (value !== undefined) return value; }
      if (url.pathname === '/logout') return new Response(null, { status: 204 });
      if (url.pathname === '/user') return Response.json(session(actor).user);
      if (url.pathname === '/token' && url.searchParams.get('grant_type') === 'password') return Response.json(session(B));
      if (url.pathname.endsWith('/challenge')) return Response.json({ id: 'challenge', expires_at: Date.now() / 1000 + 300 });
      if (url.pathname.endsWith('/verify')) return Response.json(session(A, 'aal2'));
      if (url.pathname === '/factors') return Response.json({ id: 'factor-new', type: 'totp', totp: { secret: 'fixture', qr_code: 'fixture', uri: 'otpauth://fixture' } });
      throw Error(`Unexpected fixture fetch ${url.pathname}`);
    },
  });
  const cache = createSessionCache(auth);
  const coordinator = coordinateAuth(auth, cache, key, authLock, 2000);
  await auth.initialize(); await turn();
  return { auth, cache, requests, key, storage, coordinator,
    stored: () => { const raw = storage.get(key); return raw ? JSON.parse(raw) : null; },
    close: () => auth.stopAutoRefresh(),
  };
}
const verify = (auth: any) => auth.mfa.verify({ factorId: 'factor-a', challengeId: 'challenge', code: '123456' });
const login = (auth: any) => auth.signInWithPassword({ email: 'b@fixture.invalid', password: 'synthetic-fixture' });

describe('Native Auth coordinator with the real installed SDK and patched INITIAL_SESSION', () => {
  it('an owned background logout cannot cancel a newer browser login intention', async () => {
    const f = await fixture();
    try {
      const signOut = f.coordinator.captureOwnedSignOut(f.cache.captureSessionIdentity());
      const incoming = f.coordinator.beginAttempt();
      await expect(signOut()).rejects.toThrow('session_changed');
      await incoming.run('signInWithPassword', { email: 'b@fixture.invalid', password: 'synthetic-fixture' });
      expect(f.stored().user.id).toBe(B);
      expect(f.requests.filter(r => r.path === '/logout')).toHaveLength(0);
    } finally { await f.close(); }
  });
  it('an owned background logout cannot clear the newer session already in the queue', async () => {
    const f = await fixture();
    try {
      const owner = f.cache.captureSessionIdentity();
      const incoming = login(f.auth);
      const signOut = f.coordinator.captureOwnedSignOut(owner);
      await incoming;
      await expect(signOut()).rejects.toThrow('session_changed');
      expect(f.stored().user.id).toBe(B);
    } finally { await f.close(); }
  });
  it.each(['logout', 'new-attempt', 'cancel'])('rejects an external login returning after %s', async action => {
    const f = await fixture();
    try {
      const attempt = f.coordinator.beginAttempt();
      if (action === 'logout') void f.auth.signOut({ scope: 'local' });
      else if (action === 'new-attempt') f.coordinator.beginAttempt();
      else attempt.cancel();
      await expect(attempt.run('signInWithPassword', { email: 'old@fixture.invalid', password: 'stale-fixture' })).rejects.toThrow('session_changed');
      expect(f.requests.filter(r => r.grant === 'password')).toHaveLength(0);
      expect(attempt.isCurrent()).toBe(false);
    } finally { await f.close(); }
  });
  it('rechecks an external attempt when it reaches the queue, after a later logout intent', async () => {
    const started = pause(), reply = pause<Response>();
    const f = await fixture(async url => { if (url.pathname.endsWith('/verify')) { started.resolve(); return reply.promise; } });
    try {
      const pending = verify(f.auth); await started.promise;
      const attempt = f.coordinator.beginAttempt();
      const login = attempt.run('signInWithPassword', { email: 'old@fixture.invalid', password: 'stale-fixture' });
      const rejected = expect(login).rejects.toThrow('session_changed');
      const logout = f.auth.signOut({ scope: 'local' });
      reply.resolve(Response.json(session(A, 'aal2'))); await Promise.all([pending, rejected, logout]);
      expect(f.stored()).toBeNull(); expect(f.requests.filter(r => r.grant === 'password')).toHaveLength(0);
    } finally { await f.close(); }
  });
  it('allows the current external attempt to establish its own session', async () => {
    const f = await fixture();
    try {
      await f.auth.signOut({ scope: 'local' });
      const attempt = f.coordinator.beginAttempt();
      const result = await attempt.run('signInWithPassword', { email: 'b@fixture.invalid', password: 'synthetic-fixture' });
      expect(result.error).toBeNull(); expect(f.stored().user.id).toBe(B); expect(attempt.isCurrent()).toBe(true);
    } finally { await f.close(); }
  });
  it('ships the identical awaited callback in source, CJS and ESM entry points', () => {
    for (const relative of ['src/GoTrueClient.ts', 'dist/main/GoTrueClient.js', 'dist/module/GoTrueClient.js']) {
      const source = readFileSync(resolve('../mobile/node_modules/@supabase/auth-js', relative), 'utf8');
      expect(source).toMatch(/async \(\) => \{\s+return this\._emitInitialSession\(id\)/);
      expect(source).not.toMatch(/^\s*this\._emitInitialSession\(id\);?$/m);
    }
  });
  it.each([false, true])('finishes logout after pending MFA; later login=%s stays authoritative', async withLogin => {
    const started = pause(), reply = pause<Response>();
    const f = await fixture(async url => { if (url.pathname.endsWith('/verify')) { started.resolve(); return reply.promise; } });
    try {
      const first = verify(f.auth); await started.promise;
      let completedLogout = false;
      const logout = f.auth.signOut({ scope: 'local' }).then(() => { completedLogout = true; });
      const second = withLogin ? login(f.auth) : Promise.resolve(); await turn(); expect(completedLogout).toBe(false);
      reply.resolve(Response.json(session(A, 'aal2'))); await Promise.all([first, logout, second]);
      expect(f.stored()?.user.id ?? null).toBe(withLogin ? B : null);
      expect(f.cache.captureSessionIdentity()?.userId ?? null).toBe(withLogin ? B : null);
    } finally { await f.close(); }
  });
  it.each(['mfa.verify', 'mfa.enroll', 'updateUser', 'refreshSession', 'reauthenticate'])('rejects queued %s from A after logout/login B, without poisoning the queue', async method => {
    const f = await fixture();
    try {
      const logout = f.auth.signOut({ scope: 'local' }), second = login(f.auth);
      const stale = method === 'mfa.verify' ? verify(f.auth) : method === 'mfa.enroll' ? f.auth.mfa.enroll({ factorType: 'totp' }) : method === 'updateUser' ? f.auth.updateUser({ password: 'stale-password' }) : f.auth[method]();
      await expect(stale).rejects.toThrow('session_changed'); await Promise.all([logout, second]);
      expect(f.requests.filter(r => r.path.includes('/factors') || r.path === '/reauthenticate' || r.path === '/user' && r.actor === B)).toHaveLength(0);
      expect(f.stored().user.id).toBe(B); await f.auth.signOut({ scope: 'local' }); expect(f.stored()).toBeNull();
    } finally { await f.close(); }
  });
  it('runs challengeAndVerify and synchronous subscriber reads without recursive queue deadlock', async () => {
    const f = await fixture(), reads: Promise<unknown>[] = [];
    const subscription = f.auth.onAuthStateChange((event: string) => { if (event === 'MFA_CHALLENGE_VERIFIED') reads.push(f.auth.getUser()); });
    try {
      const result = await f.auth.mfa.challengeAndVerify({ factorId: 'factor-a', code: '123456' });
      expect(result.error).toBeNull(); await Promise.all(reads); expect(reads).toHaveLength(1); expect(f.stored().user.id).toBe(A);
    } finally { subscription.data.subscription.unsubscribe(); await f.close(); }
  });
  it.each([{ initial: false, failure: false }, { initial: false, failure: true }, { initial: true, failure: false }, { initial: true, failure: true }])('serializes internal refresh $initial/$failure before password login B', async ({ initial, failure }) => {
    const started = pause(), reply = pause<Response>();
    const f = await fixture(async url => { if (url.searchParams.get('grant_type') === 'refresh_token') { started.resolve(); return reply.promise; } });
    let subscription: any;
    try {
      f.storage.set(f.key, JSON.stringify(session(A, 'aal1', 60)));
      const refresh = initial ? (subscription = f.auth.onAuthStateChange(() => {}), Promise.resolve()) : f.auth._autoRefreshTokenTick();
      await started.promise; const second = login(f.auth); await turn();
      expect(f.requests.filter(r => r.grant === 'password')).toHaveLength(0);
      reply.resolve(failure ? Response.json({ msg: 'invalid refresh', error_code: 'refresh_token_not_found' }, { status: 400, headers: { 'x-supabase-api-version': '2024-01-01' } }) : Response.json(session(A)));
      await Promise.all([refresh, second]); await turn();
      expect(f.stored().user.id).toBe(B); expect(f.cache.captureSessionIdentity().userId).toBe(B);
    } finally { subscription?.data.subscription.unsubscribe(); await f.close(); }
  });
  it('checks the owner again inside the bridge after an internal refresh invalidates it', async () => {
    const started = pause(), reply = pause<Response>();
    const f = await fixture(async url => { if (url.searchParams.get('grant_type') === 'refresh_token') { started.resolve(); return reply.promise; } });
    try {
      f.storage.set(f.key, JSON.stringify(session(A, 'aal1', 60)));
      const tick = f.auth._autoRefreshTokenTick(); await started.promise;
      const stale = f.auth.mfa.enroll({ factorType: 'totp' }); const rejected = expect(stale).rejects.toThrow('session_changed'); await turn();
      reply.resolve(Response.json({ msg: 'invalid refresh', error_code: 'refresh_token_not_found' }, { status: 400, headers: { 'x-supabase-api-version': '2024-01-01' } }));
      await Promise.all([tick, rejected]); expect(f.requests.filter(r => r.path === '/factors')).toHaveLength(0);
    } finally { await f.close(); }
  });
});
