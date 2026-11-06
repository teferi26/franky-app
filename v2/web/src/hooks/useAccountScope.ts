'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';

/** Reset private forms even after signing out and back into the same account. */
export function useAccountScope() {
  const [scope, setScope] = useState<{ userId: string | null; revision: number; ready: boolean }>({ userId: null, revision: 0, ready: false });
  useEffect(() => {
    const client = createClient();
    let alive = true, authRevision = 0, current: string | null = null;
    const update = (userId: string | null) => {
      if (!alive) return;
      const changed = userId !== current;
      current = userId;
      setScope(previous => previous.ready && !changed ? previous : ({ userId, revision: previous.revision + (changed ? 1 : 0), ready: true }));
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      authRevision++;
      update(session?.user.id ?? null);
    });
    const initialRevision = authRevision;
    void client.auth.getSession().then(({ data: { session } }) => {
      if (alive && initialRevision === authRevision) update(session?.user.id ?? null);
    }).catch(() => {
      if (alive && initialRevision === authRevision) update(null);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  return scope;
}
