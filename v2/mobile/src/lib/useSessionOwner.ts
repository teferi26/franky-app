import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { captureSessionIdentity, isCurrentSessionIdentity, onSessionIdentityChange, type SessionIdentity } from './session';

function snapshot(): string {
  const owner = captureSessionIdentity();
  return owner ? JSON.stringify(owner) : '';
}

/** Includes generation: signing out and back into the same UID resets state. */
export function useSessionOwner(): SessionIdentity | null {
  const value = useSyncExternalStore(onSessionIdentityChange, snapshot, () => '');
  return useMemo(() => value ? JSON.parse(value) as SessionIdentity : null, [value]);
}

/** Survives batched logout/login of the same UID; callbacks also stop on unmount. */
export function useOwnerGuard(owner: SessionIdentity) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return useCallback(() => alive.current && isCurrentSessionIdentity(owner), [owner]);
}
