import { useCallback, useEffect, useRef } from 'react';
import { supabase } from './supabase';

/** Pair with a UID-keyed screen; a stale callback cannot act for a new account. */
export function useSessionGuard(owner: string) {
  const current = useRef<string | null>(owner);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    current.current = owner;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      current.current = session?.user.id ?? null;
    });
    return () => { alive.current = false; current.current = null; data.subscription.unsubscribe(); };
  }, [owner]);
  return useCallback(() => alive.current && current.current === owner, [owner]);
}
