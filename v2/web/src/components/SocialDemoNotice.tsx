"use client";

import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase-client';

type Access = { demo: boolean; active?: boolean };
const DemoContext = createContext<Access | null | undefined>(undefined);
function useDemoAccess(enabled = true) {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const client = createClient();
    let generation = 0;
    let alive = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const current = ++generation;
      setAccess(null);
      if (!session) return;
      // Run outside the auth callback to avoid taking the auth lock recursively.
      queueMicrotask(() => { void client.rpc('get_social_demo_access').then(({ data: marker, error }) => {
        if (alive && current === generation && !error && typeof marker?.demo === 'boolean') setAccess(marker);
      }); });
    });
    return () => { alive = false; generation++; data.subscription.unsubscribe(); };
  }, [enabled]);
  return access;
}

export function SocialDemoNotice() {
  const context = useContext(DemoContext);
  const fallback = useDemoAccess(context === undefined);
  const access = context === undefined ? fallback : context;
  if (!access?.demo) return null;
  return <aside role="note" className="mx-auto my-3 max-w-5xl rounded-2xl border border-violet/25 bg-violet/5 px-4 py-3 text-sm text-text-primary">
    <strong>Demostración aislada · personas ficticias.</strong>{' '}
    Prueba FOMO, Crush, chats, denuncias y bloqueo. Los mensajes precargados no son respuestas de personas reales.
  </aside>;
}

export function SocialDemoProvider({ children }: { children: ReactNode }) {
  const access = useDemoAccess();
  return <DemoContext.Provider value={access}><SocialDemoNotice />{children}</DemoContext.Provider>;
}

/** A synthetic handle is never an outgoing URL, including middle-click/copy. */
export function SocialInstagramLink({ href, children, ...props }: ComponentProps<'a'>) {
  const context = useContext(DemoContext);
  const fallback = useDemoAccess(context === undefined);
  const access = context === undefined ? fallback : context;
  const [notice, setNotice] = useState(false);
  if (access && !access.demo) return <a {...props} href={href}>{children}</a>;
  return <>
    <button type="button" className={props.className} aria-label={props['aria-label']} onClick={() => setNotice(true)}>{children}</button>
    {notice ? <span role="status" className="block text-xs text-text-muted">{access?.demo
      ? 'Contacto ficticio: puedes probar el match y el chat dentro de Franky.'
      : 'Comprobando el contacto. Vuelve a intentarlo en unos segundos.'}</span> : null}
  </>;
}
