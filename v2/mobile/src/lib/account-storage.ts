import type { SessionIdentity } from './session-cache';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Identity = { capture(): SessionIdentity | null; current(owner: SessionIdentity): boolean };

const erasedAccounts = new Set<string>();
const erasureMarker = 'franky.account-erasure.pending:';
type ErasureStorage = Storage & { getAllKeys(): Promise<readonly string[]>; multiRemove(keys: string[]): Promise<void> };
const writes = new Map<string, Set<Promise<unknown>>>();
async function trackWrite<T>(uid: string, work: () => Promise<T>): Promise<T> {
  const pending = writes.get(uid) ?? new Set<Promise<unknown>>();
  writes.set(uid, pending);
  const task = work(); pending.add(task);
  try { return await task; }
  finally { pending.delete(task); if (!pending.size) writes.delete(uid); }
}

/** Called only after the server has persisted the irreversible deletion.
 * Existing writes finish first; queued/new writes cannot resurrect this account. */
export async function eraseAccountStorage(storage: ErasureStorage, userId: string) {
  erasedAccounts.add(userId);
  await storage.setItem(erasureMarker + userId, '1');
  await Promise.allSettled([...(writes.get(userId) ?? [])]);
  const keys = (await storage.getAllKeys()).filter(key => key.endsWith(`:user:${userId}`));
  if (keys.length) await storage.multiRemove(keys);
  await storage.removeItem(erasureMarker + userId);
}

export async function resumeAccountStorageErasure(storage: ErasureStorage) {
  const keys = await storage.getAllKeys();
  const users = keys.filter(key => key.startsWith(erasureMarker)).map(key => key.slice(erasureMarker.length));
  users.forEach(userId => erasedAccounts.add(userId));
  await Promise.all(users.map(userId => eraseAccountStorage(storage, userId)));
}

/** Legacy keys are deliberately never read or reassigned: their owner is unknown. */
export function createAccountStorage(storage: Storage, identity: Identity) {
  const queues = new Map<string, Promise<unknown>>();
  const current = (owner: SessionIdentity | null): owner is SessionIdentity => !!owner && !erasedAccounts.has(owner.userId) && identity.current(owner);
  const check = (owner: SessionIdentity | null): SessionIdentity => {
    if (!current(owner)) throw new Error('session_changed');
    return owner;
  };
  const key = (owner: SessionIdentity, name: string) => `${name}:user:${owner.userId}`;
  return {
    capture: identity.capture, current, check, key,
    async get(owner: SessionIdentity | null, name: string) {
      const scoped = key(check(owner), name);
      const value = await storage.getItem(scoped);
      check(owner);
      return value;
    },
    async set(owner: SessionIdentity | null, name: string, value: string) {
      const scoped = key(check(owner), name);
      await trackWrite(owner!.userId, () => storage.setItem(scoped, value));
      check(owner);
    },
    async remove(owner: SessionIdentity | null, name: string) {
      const scoped = key(check(owner), name);
      await trackWrite(owner!.userId, () => storage.removeItem(scoped));
      check(owner);
    },
    async mutate<T>(owner: SessionIdentity | null, work: () => Promise<T>): Promise<T> {
      const id = check(owner).userId;
      const previous = queues.get(id) ?? Promise.resolve();
      const task = previous.catch(() => {}).then(async () => { check(owner); const result = await work(); check(owner); return result; });
      queues.set(id, task);
      try { return await task; } finally { if (queues.get(id) === task) queues.delete(id); }
    },
  };
}
