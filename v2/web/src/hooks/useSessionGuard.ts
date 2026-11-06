"use client";
import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-client";

/** Pair with a UID-keyed screen. Invalidates async callbacks before React renders a new session. */
export function useSessionGuard(owner: string | null) {
  const current = useRef<string | null>(owner);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    current.current = owner;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      current.current = session?.user.id ?? null;
    });
    return () => { alive.current = false; current.current = null; data.subscription.unsubscribe(); };
  }, [owner]);
  return useCallback(() => alive.current && owner !== null && current.current === owner, [owner]);
}
