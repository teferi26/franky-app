"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // createClient dentro del effect → no corre durante SSR/prerender
    const supabase = createClient();
    let alive = true;
    let revision = 0;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive || revision !== 0) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (alive && revision === 0) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      revision += 1;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  }, []);

  return { user, session, loading, signOut };
}
