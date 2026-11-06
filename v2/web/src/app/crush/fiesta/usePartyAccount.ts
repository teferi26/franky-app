"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-client';

export type PartyAccount = {
  key: string; userId: string | null; ready: boolean;
  request: <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
  isCurrent: () => boolean;
};

/** A draft and its token belong to one login, including logout/login of the same account. */
export function usePartyAccount(): PartyAccount {
  const live = useRef({ userId: null as string | null, generation: 0, alive: false });
  const pending = useRef(new Set<AbortController>());
  const [state, setState] = useState({ userId: null as string | null, generation: 0, ready: false });
  useEffect(() => {
    live.current.alive = true;
    let active = true;
    let revision = 0;
    const accept = (session: Session | null) => {
      if (!active || !live.current.alive) return;
      const userId = session?.user.id ?? null;
      if (userId !== live.current.userId) {
        live.current.userId = userId; live.current.generation++;
        for (const request of pending.current) request.abort();
      }
      setState({ userId, generation: live.current.generation, ready: true });
    };
    const client = createClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => { revision++; accept(session); });
    client.auth.getSession().then(result => { if (!revision) accept(result.error ? null : result.data.session); }).catch(() => { if (!revision) accept(null); });
    return () => { active = false; live.current.alive = false; data.subscription.unsubscribe(); for (const request of pending.current) request.abort(); };
  }, []);
  const { userId, generation } = state;
  const isCurrent = useCallback(() => live.current.alive && live.current.userId === userId && live.current.generation === generation, [userId, generation]);
  const request = useCallback(async <T,>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
    const check = () => { if (!userId || !isCurrent() || signal?.aborted) throw new Error('La sesión ha cambiado. Vuelve a entrar.'); };
    check();
    const controller = new AbortController(); pending.current.add(controller);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    let rejectAborted!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(new Error('La conexión está tardando. Comprueba tu red y vuelve a intentarlo.'));
      controller.signal.addEventListener('abort', rejectAborted, { once: true });
    });
    try {
      // Supabase's auth lock has no AbortSignal. Race the session lookup too,
      // so a stalled lock cannot leave the form busy forever or send later.
      const { data, error } = await Promise.race([createClient().auth.getSession(), aborted]); check();
      if (controller.signal.aborted) throw new Error('La conexión está tardando. Comprueba tu red y vuelve a intentarlo.');
      if (error || data.session?.user.id !== userId) throw new Error('Vuelve a iniciar sesión para continuar.');
      const response = await Promise.race([fetch(path, {
        method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), aborted]);
      const result = await Promise.race([response.json(), aborted]); check();
      if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : response.status === 401 ? 'Vuelve a iniciar sesión para continuar.' : 'No se ha completado. Inténtalo de nuevo.');
      return result as T;
    } catch (error) {
      check();
      if (controller.signal.aborted) throw new Error('La conexión está tardando. Comprueba tu red y vuelve a intentarlo.');
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectAborted); pending.current.delete(controller); }
  }, [userId, isCurrent]);
  return { key: `${userId ?? 'guest'}:${generation}`, userId, ready: state.ready, request, isCurrent };
}
