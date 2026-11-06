import type { SessionIdentity } from './session-cache';

export function createSessionExit(services: {
  current: (owner: SessionIdentity) => boolean;
  revoke: (owner: SessionIdentity) => Promise<void>;
  clearLocal: (owner: SessionIdentity) => Promise<void>;
  clearQueue: () => Promise<void>;
  signOut: () => Promise<{ error: unknown }>;
  resume: (owner: SessionIdentity) => void;
}) {
  let busy = false;
  return async (owner: SessionIdentity, beforeSignOut?: () => Promise<void>) => {
    if (busy || !services.current(owner)) return false;
    busy = true;
    const check = () => { if (!services.current(owner)) throw new Error('session_changed'); };
    try {
      // Both prevent new account-owned work synchronously, before the first await.
      const revoked = services.revoke(owner);
      const cleared = services.clearLocal(owner);
      const cleanup = await Promise.allSettled([revoked, cleared]);
      const failed = cleanup.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      check();
      await services.clearQueue(); check();
      if (beforeSignOut) { await beforeSignOut(); check(); }
      const { error } = await services.signOut();
      if (error) throw error;
      return true;
    } finally { busy = false; services.resume(owner); }
  };
}
