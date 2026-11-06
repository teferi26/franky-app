import type { Session, User, SupabaseClient } from '@supabase/supabase-js';

export type SessionIdentity = { userId: string; generation: number };
type SessionAuth = Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'refreshSession' | 'onAuthStateChange'>;

/** Account-aware cache. Injectable auth keeps native dependencies out of its tests. */
export function createSessionCache(auth: SessionAuth) {
  const TTL_MS = 30_000;
  let cachedSession: Session | null = null;
  let cachedUser: User | null = null;
  let cachedAt = 0;
  let revision = 0;
  let identityGeneration = 0;
  let observedUser: string | null = null;
  const identityListeners = new Set<() => void>();
  let inflightSession: Promise<Session | null> | null = null;
  let inflightUser: Promise<User | null> | null = null;

  function captureSessionIdentity(): SessionIdentity | null {
    return observedUser ? { userId: observedUser, generation: identityGeneration } : null;
  }
  function isCurrentSessionIdentity(owner: SessionIdentity): boolean {
    return observedUser === owner.userId && identityGeneration === owner.generation;
  }
  function setCache(session: Session | null): void {
    cachedSession = session;
    cachedUser = session?.user ?? null;
    cachedAt = Date.now();
  }
  function invalidateSession(): void {
    revision++;
    cachedSession = null; cachedUser = null; cachedAt = 0;
    inflightSession = null; inflightUser = null;
  }
  auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    const changed = next !== observedUser;
    if (changed) identityGeneration++;
    observedUser = next;
    invalidateSession();
    setCache(session);
    if (changed) for (const listener of identityListeners) listener();
  });
  const isFresh = () => cachedAt > 0 && Date.now() - cachedAt < TTL_MS;

  async function getCachedSession(): Promise<Session | null> {
    if (isFresh()) return cachedSession;
    if (inflightSession) return inflightSession;
    const started = revision;
    let task!: Promise<Session | null>;
    task = (async () => {
      try {
        const { data, error } = await auth.getSession();
        if (error || started !== revision) return null;
        if (observedUser && data.session?.user.id !== observedUser) return null;
        setCache(data.session ?? null);
        return cachedSession;
      } catch { return null; }
      finally { if (inflightSession === task) inflightSession = null; }
    })();
    inflightSession = task;
    return task;
  }

  async function getCachedUser(): Promise<User | null> {
    if (isFresh()) return cachedUser;
    if (inflightUser) return inflightUser;
    const started = revision;
    let task!: Promise<User | null>;
    task = (async () => {
      try {
        const { data, error } = await auth.getUser();
        if (started !== revision) return null;
        if (error || !data.user) { setCache(null); return null; }
        const { data: sessionData, error: sessionError } = await auth.getSession();
        if (started !== revision || sessionError || sessionData.session?.user.id !== data.user.id) return null;
        if (observedUser && observedUser !== data.user.id) return null;
        setCache(sessionData.session);
        cachedUser = data.user;
        return cachedUser;
      } catch { return null; }
      finally { if (inflightUser === task) inflightUser = null; }
    })();
    inflightUser = task;
    return task;
  }

  async function withFreshSession<T>(fn: () => Promise<T>, isAuthError: (err: unknown) => boolean = defaultIsAuthError): Promise<T> {
    const owner = captureSessionIdentity();
    if (!owner) throw new Error('session_required');
    const check = () => { if (!isCurrentSessionIdentity(owner)) throw new Error('session_changed'); };
    try {
      const value = await fn(); check(); return value;
    } catch (error) {
      check();
      if (!isAuthError(error)) throw error;
      const { data, error: refreshError } = await auth.refreshSession();
      check();
      if (refreshError || data.session?.user.id !== owner.userId) throw error;
      setCache(data.session);
      const value = await fn(); check(); return value;
    }
  }

  function onSessionIdentityChange(listener: () => void) {
    identityListeners.add(listener);
    return () => { identityListeners.delete(listener); };
  }
  return { captureSessionIdentity, isCurrentSessionIdentity, invalidateSession, getCachedSession, getCachedUser, withFreshSession, onSessionIdentityChange };
}

function defaultIsAuthError(err: unknown): boolean {
  try {
    const message =
      (err as { message?: string } | null)?.message ??
      (typeof err === 'string' ? err : '') ??
      '';
    const code = (err as { code?: string; status?: number } | null) ?? {};
    const text = message.toLowerCase();
    return (
      code.status === 401 ||
      code.code === 'PGRST301' ||
      text.includes('jwt') ||
      text.includes('token') && text.includes('expired') ||
      text.includes('invalid token') ||
      text.includes('not authenticated') ||
      text.includes('unauthorized')
    );
  } catch {
    return false;
  }
}
