"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase-client';
import { decodeAal } from '@/lib/aal';

type Identity = { userId: string | null; generation: number };
type Boundary = { owner: string; isCurrent(): boolean; subscribe(cancel: () => void): () => void };
const Context = createContext<Boundary | null>(null);

/** A logout/login of the same UID also discards private drafts and pending confirmations. */
export function AdminSessionScope({ viewerId, children }: { viewerId: string; children: ReactNode }) {
  const initial = { userId: viewerId, generation: 0 };
  const live = useRef<Identity>(initial);
  const [identity, setIdentity] = useState<Identity>(initial);
  const listeners = useRef(new Set<() => void>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      const userId = session?.user.id ?? null;
      if (event !== 'SIGNED_OUT' && userId === live.current.userId) return;
      live.current = { userId, generation: live.current.generation + 1 };
      for (const cancel of listeners.current) cancel();
      setIdentity(live.current);
    });
    return () => {
      alive.current = false;
      for (const cancel of listeners.current) cancel();
      data.subscription.unsubscribe();
    };
  }, []);
  const boundary = useMemo<Boundary>(() => ({
    owner: viewerId,
    isCurrent: () => alive.current && live.current.userId === viewerId && live.current.generation === identity.generation,
    subscribe(cancel) { listeners.current.add(cancel); return () => { listeners.current.delete(cancel); }; },
  }), [viewerId, identity.generation]);
  if (identity.userId !== viewerId) return <p role="status" className="p-8 text-center text-sm text-text-muted">Comprobando la nueva sesión…</p>;
  return <Context.Provider key={`${viewerId}:${identity.generation}`} value={boundary}>{children}</Context.Provider>;
}

export type AdminRequest = {
  owner: string;
  authorization: string;
  signal: AbortSignal;
  check(): void;
  query<T extends { setHeader(name: string, value: string): unknown; abortSignal(signal: AbortSignal): unknown }>(builder: T): T;
};

export function useAdminRequest() {
  const boundary = useContext(Context);
  if (!boundary) throw new Error('admin_session_scope_required');
  const { owner, subscribe } = boundary;
  const mounted = useRef(true);
  const pending = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const controller of pending.current) controller.abort(); };
  }, []);
  const isCurrent = useCallback(() => mounted.current && boundary.isCurrent(), [boundary]);
  const run = useCallback(async <T,>(work: (request: AdminRequest) => Promise<T>, options: { write?: boolean; signal?: AbortSignal } = {}) => {
    const controller = new AbortController();
    pending.current.add(controller);
    const cancel = () => controller.abort();
    const unsubscribe = subscribe(cancel);
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel);
    const check = () => {
      if (!isCurrent() || controller.signal.aborted) throw new Error('La sesión ha cambiado. Vuelve a abrir el panel.');
    };
    try {
      check();
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      check();
      if (error || session?.user.id !== owner || !session.access_token) throw new Error('Inicia sesión de nuevo para continuar.');
      const authorization = `Bearer ${session.access_token}`;
      if (decodeAal(session.access_token) !== 'aal2') throw new Error('Verifica de nuevo tu acceso con el código de seguridad.');
      const query: AdminRequest['query'] = builder => {
        check(); builder.setHeader('Authorization', authorization); builder.abortSignal(controller.signal); return builder;
      };
      // This read uses the very same token as the operation. RLS remains authoritative.
      const profile = await query(supabase.from('profiles').select('role,is_discarded').eq('id', owner)).maybeSingle();
      check();
      if (profile.error || !profile.data || profile.data.is_discarded === true
        || !['admin', 'analyst'].includes(profile.data.role)
        || (options.write && profile.data.role !== 'admin')) throw new Error('No tienes permiso para esta operación.');
      const result = await work({ owner, authorization, signal: controller.signal, check, query });
      check();
      return result;
    } finally {
      unsubscribe(); options.signal?.removeEventListener('abort', cancel); cancel(); pending.current.delete(controller);
    }
  }, [owner, isCurrent, subscribe]);
  return { run, isCurrent };
}
