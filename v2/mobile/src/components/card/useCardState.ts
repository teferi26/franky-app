import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { cardError } from '@/lib/franky-card-model';

export function useCardState<T>(owner: SessionIdentity, loader: (signal: AbortSignal) => Promise<T>, poll = false, formatError: (error: unknown) => string = cardError) {
  const current = useOwnerGuard(owner);
  const controller = useRef(new AbortController()); const sequence = useRef(0); const lock = useRef(false);
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!current() || controller.current.signal.aborted) return; const version = ++sequence.current; const loadSignal = controller.current.signal; setLoading(true);
    try { const result = await loader(loadSignal); if (current() && !loadSignal.aborted && version === sequence.current) { setData(result); setError(null); } }
    catch (err) { if (current() && version === sequence.current && !loadSignal.aborted) { setData(null); setError(formatError(err)); } }
    finally { if (current() && version === sequence.current) setLoading(false); }
  }, [current, loader, formatError]);
  useFocusEffect(useCallback(() => {
    controller.current = new AbortController(); void load();
    const app = AppState.addEventListener('change', state => { if (state === 'active' && !lock.current) void load(); });
    const interval = poll ? setInterval(() => { if (AppState.currentState === 'active' && !lock.current) void load(); }, 8000) : undefined;
    return () => { controller.current.abort(); ++sequence.current; app.remove(); if (interval) clearInterval(interval); };
  }, [load, poll]));
  useEffect(() => () => controller.current.abort(), []);
  const act = useCallback(async (work: (signal: AbortSignal) => Promise<unknown>, message?: string, refresh = true) => {
    if (lock.current || !current() || controller.current.signal.aborted) return;
    const operationSignal = controller.current.signal;
    lock.current = true; ++sequence.current; setLoading(false); setBusy(true); setError(null); setNotice(null);
    try { await work(operationSignal); if (!current() || operationSignal.aborted) return; if (message) setNotice(message); if (refresh) await load(); }
    catch (err) { if (current() && !operationSignal.aborted) setError(formatError(err)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  }, [current, load, formatError]);
  return { data, loading, busy, error, notice, load, act, current, setError, setNotice };
}
