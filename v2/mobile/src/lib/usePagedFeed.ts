"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Ignore responses from an old campus/filter and serialize pagination. */
export function usePagedFeed<T extends { id: string }>(fetchPage: (offset: number) => Promise<T[]>, pageSize: number) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const offset = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const current = ++generation.current;
    busy.current = true;
    offset.current = 0;
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setError(false);
    setMoreError(false);
    void fetchPage(0).then(rows => {
      if (current !== generation.current) return;
      setItems(rows);
      offset.current = rows.length;
      setHasMore(rows.length === pageSize);
    }).catch(() => {
      if (current === generation.current) setError(true);
    }).finally(() => {
      if (current !== generation.current) return;
      busy.current = false;
      setLoading(false);
    });
    return () => { generation.current++; };
  }, [fetchPage, pageSize, revision]);

  const loadMore = useCallback(async () => {
    if (busy.current || loading || !hasMore || error) return;
    const current = generation.current;
    busy.current = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const rows = await fetchPage(offset.current);
      if (current !== generation.current) return;
      offset.current += rows.length;
      setItems(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...rows.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })];
      });
      setHasMore(rows.length === pageSize);
    } catch {
      if (current === generation.current) setMoreError(true);
    } finally {
      if (current === generation.current) { busy.current = false; setLoadingMore(false); }
    }
  }, [fetchPage, pageSize, loading, hasMore, error]);

  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { items, loading, loadingMore, hasMore, error, moreError, loadMore, reload };
}
