import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

/** Remount private screens by UID; invalidate delayed actions synchronously. */
export function useSessionIdentity() {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const current = useRef<string | null | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      current.current = session?.user.id ?? null;
      setUid(current.current);
    });
    return () => { alive.current = false; current.current = undefined; data.subscription.unsubscribe(); };
  }, []);
  const isCurrent = useCallback(() => alive.current && current.current === uid, [uid]);
  return { uid, isCurrent };
}
