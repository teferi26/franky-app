"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminRequest, type AdminRequest } from './AdminSessionScope';

export function useAdminData<T>(loader: (request: AdminRequest) => Promise<T>, key = '', delay = 0) {
  const { run, isCurrent } = useAdminRequest();
  const latest = useRef(loader);
  latest.current = loader;
  const revision = useRef(0);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; data: T | null; error: string; loading: boolean }>({ key, data: null, error: '', loading: true });
  const reload = useCallback(async () => {
    if (!isCurrent()) return;
    const version = ++revision.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const current = () => isCurrent() && version === revision.current && !controller.signal.aborted;
    setState({ key, data: null, error: '', loading: true });
    try {
      const data = await run(request => latest.current(request), { signal: controller.signal });
      if (current()) setState({ key, data, error: '', loading: false });
    } catch (error) {
      if (current()) setState({ key, data: null, error: error instanceof Error ? error.message : 'No se pudieron cargar los datos.', loading: false });
    }
  }, [key, run, isCurrent]);
  useEffect(() => {
    const timer = setTimeout(() => { void reload(); }, delay);
    return () => { clearTimeout(timer); revision.current++; active.current?.abort(); };
  }, [reload, delay]);
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : '', loading: state.key !== key || state.loading, reload };
}

export function useAdminAction(readOnly = false) {
  const { run, isCurrent } = useAdminRequest();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const act = useCallback(async (work: (request: AdminRequest) => Promise<void>, after?: () => void | Promise<void>) => {
    if (readOnly || busy.current || !isCurrent()) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await run(work, { write: true });
      if (isCurrent()) await after?.();
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      busy.current = false;
      if (isCurrent()) setSaving(false);
    }
  }, [run, isCurrent, readOnly]);
  return { act, saving, error, isCurrent };
}

export async function logManagementAction(request: AdminRequest, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) {
  const { createClient } = await import('@/lib/supabase-client');
  request.check();
  const { error } = await request.query(createClient().rpc('log_admin_action', {
    p_admin_id: request.owner, p_action: action, p_target_type: targetType, p_target_id: targetId, p_details: details,
  }));
  if (error) throw new Error('El cambio se guardó, pero no se pudo confirmar su auditoría. Actualiza antes de repetirlo.');
}
