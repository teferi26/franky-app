/** Serialises native token work; cancellation starts before any logout await. */
export type PushOwner = { userId: string; generation: number };
export function createPushRegistration(services: {
  current: (owner: PushOwner) => boolean;
  prepare: () => Promise<string | null>;
  existing: () => Promise<string | null>;
  claim: (owner: PushOwner, token: string) => Promise<void>;
  remove: (owner: PushOwner, token: string) => Promise<void>;
}) {
  let tail = Promise.resolve();
  let cancelled = 0;
  let suspended: PushOwner | null = null;
  let registered: { owner: PushOwner; token: string } | null = null;
  const same = (a: PushOwner, b: PushOwner) => a.userId === b.userId && a.generation === b.generation;
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const task = tail.then(work);
    tail = task.then(() => {}, () => {});
    return task;
  };
  return {
    register(owner: PushOwner) {
      const revision = cancelled;
      const valid = () => services.current(owner) && revision === cancelled && !(suspended && same(suspended, owner));
      return queue(async () => {
        if (!valid()) return;
        const token = await services.prepare();
        if (!token || !valid()) return;
        await services.claim(owner, token);
        registered = { owner, token };
      });
    },
    unregister(owner: PushOwner) {
      cancelled++;
      suspended = owner;
      return queue(async () => {
        if (!services.current(owner)) throw new Error('session_changed');
        const token = registered && same(registered.owner, owner) ? registered.token : await services.existing();
        if (!services.current(owner)) throw new Error('session_changed');
        if (token) await services.remove(owner, token);
        registered = null;
      });
    },
    resume(owner: PushOwner) { if (suspended && same(suspended, owner)) suspended = null; },
  };
}
