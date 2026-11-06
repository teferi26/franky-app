import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Lista paginada contra el servidor (por offset) ───────────────────────
// Para listados que crecen (apuntes, noticias...): se pide una página de
// `pageSize` filas y la siguiente solo al acercarse al final de la lista, en
// vez de traer la tabla entera y filtrar en el móvil.
//
// `key` identifica la consulta (filtros + búsqueda). Al cambiar, se descarta lo
// cargado y se pide la primera página de nuevo. Cada petición lleva un número:
// solo la última de la clave vigente puede escribir estado, así una respuesta
// lenta de un filtro anterior nunca pisa la lista actual.
//
// No guarda nada en disco ni entre montajes: vale igual para datos públicos
// que para los del propio usuario que el llamador ya protege.
export type OffsetPageFetcher<T> = (offset: number, limit: number) => Promise<T[]>;

export function useServerPages<T extends { id: string }>(fetchPage: OffsetPageFetcher<T>, key: string, pageSize = 20) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const request = useRef(0);
  const offset = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);

  const loadFirst = useCallback(async (mode: 'reset' | 'refresh') => {
    const id = ++request.current;
    busy.current = true;
    setLoadingMore(false);
    if (mode === 'reset') setRows(null);
    else setRefreshing(true);
    setError(null);
    try {
      const page = await fetchRef.current(0, pageSize);
      if (!alive.current || id !== request.current) return;
      offset.current = page.length;
      setRows(page);
      setHasMore(page.length === pageSize);
    } catch (err) {
      if (!alive.current || id !== request.current) return;
      setError(err);
      // Sin red al refrescar se conserva lo que había en pantalla.
      setRows(previous => (mode === 'refresh' ? previous : null) ?? []);
      setHasMore(false);
    } finally {
      if (alive.current && id === request.current) { busy.current = false; setRefreshing(false); }
    }
  }, [pageSize]);

  // key cambia con los filtros: primera página nueva, lista vacía mientras llega.
  useEffect(() => { void loadFirst('reset'); }, [key, loadFirst]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    const id = request.current;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchRef.current(offset.current, pageSize);
      if (!alive.current || id !== request.current) return;
      offset.current += page.length;
      // Sin duplicados si entre página y página se publicó algo nuevo.
      setRows(previous => {
        const base = previous ?? [];
        const seen = new Set(base.map(row => row.id));
        return [...base, ...page.filter(row => !seen.has(row.id))];
      });
      setHasMore(page.length === pageSize);
    } catch {
      // Sin red al paginar: se reintenta al volver a llegar al final.
    } finally {
      if (alive.current && id === request.current) { busy.current = false; setLoadingMore(false); }
    }
  }, [hasMore, pageSize]);

  const refresh = useCallback(() => loadFirst('refresh'), [loadFirst]);
  const reload = useCallback(() => loadFirst('reset'), [loadFirst]);

  return { rows, error, loading: rows === null, refreshing, loadingMore, hasMore, loadMore, refresh, reload };
}

/** Valor con retardo: la búsqueda no lanza una consulta por cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
