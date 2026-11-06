import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionIdentity } from './session-cache';

type Auth = SupabaseClient['auth'];
type IdentitySource = {
  captureSessionIdentity(): SessionIdentity | null;
  isCurrentSessionIdentity(owner: SessionIdentity): boolean;
};
type Lock = <T>(name: string, timeout: number, work: () => Promise<T>) => Promise<T>;
type TransitionName = 'exchangeCodeForSession' | 'setSession' | 'signOut' | 'signInWithPassword' | 'signInWithIdToken' |
  'signUp' | 'signInAnonymously' | 'verifyOtp' | 'signInWithOtp' | 'signInWithOAuth' | 'signInWithSSO' | 'resetPasswordForEmail';
export type AuthAttempt = {
  run<K extends TransitionName>(name: K, ...args: Parameters<Auth[K]>): ReturnType<Auth[K]>;
  isCurrent(): boolean;
  cancel(): void;
};

/** processLock retains a second promise which otherwise rejects unobserved. */
export function withHandledLockErrors(lock: Lock): Lock {
  return async <T>(name: string, timeout: number, work: () => Promise<T>): Promise<T> => {
    const outcome = await lock(name, timeout, async () => {
      try { return { ok: true as const, value: await work() }; }
      catch (error) { return { ok: false as const, error }; }
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  };
}

/**
 * auth-js 2.108.1 does not lock every session/PKCE mutation. Serialize public
 * mutations and bridge only methods that do not already acquire the SDK lock.
 * Internal token refresh uses the same lock. See the pinned postinstall fix
 * for the INITIAL_SESSION callback, which must retain that lock until done.
 * Auth callbacks must stay synchronous: never await a queued mutation there.
 */
export function coordinateAuth(auth: Auth, identity: IdentitySource, storageKey: string, lock: Lock, timeout = 20_000) {
  let tail: Promise<void> = Promise.resolve();
  let intention = 0;
  const transitions = new Map<string, (args: unknown[], check: () => void) => Promise<unknown>>();

  function enqueue(original: Function, target: object, args: unknown[], bridge: boolean, check: () => void) {
    const result = tail.then(async () => {
      await auth.initialize();
      const execute = () => { check(); return original.apply(target, args); };
      return bridge ? lock(`lock:${storageKey}`, timeout, execute) : execute();
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function wrap<T extends object, K extends keyof T>(target: T, name: K, bridge: boolean, owned: boolean) {
    const original = target[name];
    if (typeof original !== 'function') throw new Error(`Unsupported Auth method: ${String(name)}`);
    if (!owned) transitions.set(String(name), (args, check) => enqueue(original, target, args, bridge, check));
    target[name] = ((...args: unknown[]) => {
      // A direct login/logout also cancels an older external browser attempt,
      // immediately on invocation, even while another operation holds the lock.
      if (!owned) intention++;
      // Capture before queueing: a later login must never adopt this operation.
      const owner = owned ? identity.captureSessionIdentity() : null;
      const check = () => {
        if (owned && (!owner || !identity.isCurrentSessionIdentity(owner))) throw new Error('session_changed');
      };
      return enqueue(original, target, args, bridge, check);
    }) as T[K];
  }

  // These methods already acquire the lock inside auth-js; an outer one would deadlock.
  for (const name of ['exchangeCodeForSession', 'setSession', 'signOut'] as const) wrap(auth, name, false, false);
  for (const name of ['updateUser', 'refreshSession', 'reauthenticate'] as const) wrap(auth, name, false, true);
  for (const name of ['challenge', 'verify', 'challengeAndVerify'] as const) wrap(auth.mfa, name, false, true);

  for (const name of ['signInWithPassword', 'signInWithIdToken', 'signUp', 'signInAnonymously', 'verifyOtp',
    'signInWithOtp', 'signInWithOAuth', 'signInWithSSO', 'resetPasswordForEmail'] as const) wrap(auth, name, true, false);
  for (const name of ['enroll', 'unenroll'] as const) wrap(auth.mfa, name, true, true);

  return {
    captureOwnedSignOut(owner: SessionIdentity) {
      const token = intention;
      return () => transitions.get('signOut')!([{ scope: 'local' }], () => {
        if (token !== intention || !identity.isCurrentSessionIdentity(owner)) throw new Error('session_changed');
      }) as ReturnType<Auth['signOut']>;
    },
    beginAttempt(): AuthAttempt {
      const token = ++intention, owner = identity.captureSessionIdentity();
      const check = () => {
        if (token !== intention || (owner ? !identity.isCurrentSessionIdentity(owner) : identity.captureSessionIdentity() !== null)) {
          throw new Error('session_changed');
        }
      };
      return {
        run(name, ...args) { return transitions.get(name)!(args, check) as ReturnType<Auth[typeof name]>; },
        isCurrent: () => token === intention,
        cancel() { if (token === intention) intention++; },
      };
    },
  };
}
