// Lista paginada con caché en memoria (volver atrás es instantáneo).
//
// Pensada para catálogos grandes: se pide la página 0 al entrar o al cambiar
// la clave (filtros), y las siguientes con loadMore() desde onEndReached. Si
// la clave ya se visitó en esta sesión se pinta lo guardado al momento y, si
// tiene más de STALE_MS, se revalida la primera página por detrás.
//
// Estados, con la misma semántica que useFetch:
//   loading       sin nada que enseñar todavía (esqueleto);
//   error         falló y no hay nada guardado (pantalla de reintentar);
//   refreshError  falló una recarga, pero se siguen viendo los datos guardados.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type PageResult<T> = { rows: T[]; total: number | null; hasMore: boolean };

type Entry<T> = { rows: T[]; total: number | null; hasMore: boolean; page: number; at: number };

const memory = new Map<string, Entry<unknown>>();
const MEMORY_MAX_KEYS = 24;
const STALE_MS = 5 * 60 * 1000;

function remember<T>(key: string, entry: Entry<T>) {
  memory.delete(key);
  memory.set(key, entry as Entry<unknown>);
  if (memory.size > MEMORY_MAX_KEYS) memory.delete(memory.keys().next().value!);
}

type State<T> = {
  key: string | undefined;
  entry: Entry<T> | null;
  error: boolean;
  refreshError: boolean;
  refreshing: boolean;
  loadingMore: boolean;
};

export function useLeisurePages<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  cacheKey: string | undefined,
) {
  const fromMemory = (key: string | undefined) => (key ? (memory.get(key) as Entry<T> | undefined) ?? null : null);
  const initial = (): State<T> => ({
    key: cacheKey, entry: fromMemory(cacheKey), error: false, refreshError: false, refreshing: false, loadingMore: false,
  });
  const [state, setState] = useState<State<T>>(initial);
  // Cada petición lleva un número: solo la última de la clave actual escribe.
  const request = useRef(0);
  const alive = useRef(true);
  const current = useRef({ cacheKey, fetchPage });
  current.current = { cacheKey, fetchPage };
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);

  const loadFirst = useCallback(async (refreshing: boolean) => {
    if (cacheKey === undefined) return;
    const id = ++request.current;
    setState(prev => prev.key === cacheKey
      ? { ...prev, error: false, refreshing, loadingMore: false }
      : { key: cacheKey, entry: fromMemory(cacheKey), error: false, refreshError: false, refreshing, loadingMore: false });
    try {
      const r = await fetchPage(0);
      if (!alive.current || id !== request.current) return;
      const entry: Entry<T> = { rows: r.rows, total: r.total, hasMore: r.hasMore, page: 0, at: Date.now() };
      remember(cacheKey, entry);
      setState({ key: cacheKey, entry, error: false, refreshError: false, refreshing: false, loadingMore: false });
    } catch {
      if (!alive.current || id !== request.current) return;
      setState(prev => {
        const kept = prev.key === cacheKey ? prev.entry : fromMemory(cacheKey);
        return { key: cacheKey, entry: kept, error: kept === null, refreshError: kept !== null, refreshing: false, loadingMore: false };
      });
    }
    // fromMemory es pura; fetchPage y cacheKey son las dependencias reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, cacheKey]);

  useEffect(() => {
    if (cacheKey === undefined) return;
    const cached = fromMemory(cacheKey);
    if (cached && Date.now() - cached.at < STALE_MS) {
      setState(prev => prev.key === cacheKey && prev.entry === cached ? prev
        : { key: cacheKey, entry: cached, error: false, refreshError: false, refreshing: false, loadingMore: false });
      return;
    }
    void loadFirst(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFirst, cacheKey]);

  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(async () => {
    const key = current.current.cacheKey;
    if (key === undefined || loadingMoreRef.current) return;
    const snapshot = state.key === key ? state.entry : null;
    if (!snapshot || !snapshot.hasMore || state.refreshing) return;
    loadingMoreRef.current = true;
    const id = request.current;
    setState(prev => ({ ...prev, loadingMore: true }));
    try {
      const nextPage = snapshot.page + 1;
      const r = await current.current.fetchPage(nextPage);
      if (!alive.current || id !== request.current || current.current.cacheKey !== key) return;
      // Sin duplicados si el catálogo cambió entre páginas.
      const seen = new Set(snapshot.rows.map(row => (row as { id?: unknown }).id));
      const fresh = r.rows.filter(row => !seen.has((row as { id?: unknown }).id));
      const entry: Entry<T> = {
        rows: [...snapshot.rows, ...fresh], total: r.total ?? snapshot.total, hasMore: r.hasMore, page: nextPage, at: snapshot.at,
      };
      remember(key, entry);
      setState(prev => ({ ...prev, entry, loadingMore: false }));
    } catch {
      if (alive.current && id === request.current) setState(prev => ({ ...prev, loadingMore: false }));
    } finally {
      loadingMoreRef.current = false;
    }
  }, [state]);

  const refresh = useCallback(() => loadFirst(true), [loadFirst]);

  // Al cambiar de filtros no se espera a un efecto para ocultar lo anterior.
  const visible = state.key === cacheKey ? state : initial();
  return useMemo(() => ({
    rows: visible.entry?.rows ?? null,
    total: visible.entry?.total ?? null,
    hasMore: visible.entry?.hasMore ?? false,
    loading: visible.entry === null && !visible.error,
    error: visible.error,
    refreshError: visible.refreshError,
    refreshing: visible.refreshing,
    loadingMore: visible.loadingMore,
    loadMore,
    refresh,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visible.entry, visible.error, visible.refreshError, visible.refreshing, visible.loadingMore, loadMore, refresh]);
}
