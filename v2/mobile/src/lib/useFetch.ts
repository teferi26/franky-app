import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportOnline, reportMaybeOffline } from './net';

// Caché por clave en DOS niveles (stale-while-revalidate):
//   1. memoria: al volver a una pantalla ya visitada se pinta al instante lo
//      último conocido y se refresca en segundo plano, sin skeletons;
//   2. disco (AsyncStorage): al ABRIR la app, los catálogos públicos (unis,
//      becas, eventos, ocio...) se pintan con lo que había la última vez en
//      vez de un skeleton mientras llega la red. Es lo que hace que la app se
//      sienta rápida en un campus con wifi flojo.
// SOLO para fetchers de datos públicos (los autenticados usan useFetchGated o
// gestionan su propio estado): así un cambio de cuenta nunca puede enseñar
// datos de otro usuario. La entrada en disco caduca a las 24 h.
type CacheEntry = { at: number; rows: unknown[] };
const memCache = new Map<string, CacheEntry>();
const cacheRequests = new Map<string, number>();
const diskWrites = new Map<string, Promise<void>>();
let nextRequest = 0;
// v1 could contain only the first 400 rows. It cannot certify a complete list.
const DISK_PREFIX = 'franky.cache.v2:';
const DISK_TTL_MS = 24 * 60 * 60 * 1000;
const DISK_MAX_CHARS = 500_000;
const MEMORY_MAX_KEYS = 32;

function validTime(at: unknown): at is number {
  return typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= Date.now() && Date.now() - at <= DISK_TTL_MS;
}

function memoryRows<T>(key?: string): T[] | null {
  if (!key) return null;
  const entry = memCache.get(key);
  if (!entry) return null;
  if (!validTime(entry.at)) { memCache.delete(key); return null; }
  return entry.rows as T[];
}

async function readDisk<T>(key: string): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(DISK_PREFIX + key);
    if (!raw || raw.length > DISK_MAX_CHARS) return null;
    const parsed = JSON.parse(raw) as { version: number; at: number; rows: T[] };
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.rows) || !validTime(parsed.at)) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function cacheRows<T>(key: string, rows: T[], request: number) {
  if (cacheRequests.get(key) !== request) return;
  const at = Date.now();
  memCache.delete(key);
  memCache.set(key, { at, rows });
  if (memCache.size > MEMORY_MAX_KEYS) memCache.delete(memCache.keys().next().value!);
  // Writes are ordered per public key. A slow older write must finish before
  // the newer one. Oversized lists remain complete in memory, never truncated.
  const operation = (diskWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (cacheRequests.get(key) !== request) return;
    const raw = JSON.stringify({ version: 2, at, rows });
    if (raw.length <= DISK_MAX_CHARS) await AsyncStorage.setItem(DISK_PREFIX + key, raw);
    else await AsyncStorage.removeItem(DISK_PREFIX + key);
  }).catch(() => {});
  diskWrites.set(key, operation);
  void operation.then(() => { if (diskWrites.get(key) === operation) diskWrites.delete(key); });
}

export function useFetch<T>(fn: () => Promise<{ rows: T[]; live: boolean }>, cacheKey?: string) {
  const context = useMemo(() => ({ active: false, request: 0, succeeded: false, failed: false }), [fn, cacheKey]);
  const initial = () => ({ key: cacheKey, rows: memoryRows<T>(cacheKey), error: false, refreshError: false, refreshing: false });
  const [state, setState] = useState(initial);

  const load = useCallback(async (refreshing = false) => {
    if (!context.active) return;
    const id = ++context.request;
    const cacheRequest = ++nextRequest;
    if (cacheKey) cacheRequests.set(cacheKey, cacheRequest);
    const current = () => context.active && id === context.request;
    setState(previous => previous.key === cacheKey
      ? { ...previous, rows: previous.error ? memoryRows<T>(cacheKey) : previous.rows, error: false, refreshing }
      : { key: cacheKey, rows: memoryRows<T>(cacheKey), error: false, refreshError: false, refreshing });
    try {
      const r = await fn();
      if (!current()) return;
      if (!Array.isArray(r.rows) || (cacheKey && !r.live)) throw new Error('Catalogue unavailable');
      if (r.live) reportOnline();
      if (cacheKey && r.live) cacheRows(cacheKey, r.rows, cacheRequest);
      context.succeeded = true;
      context.failed = false;
      setState({ key: cacheKey, rows: r.rows, error: false, refreshError: false, refreshing: false });
    } catch {
      if (!current()) return;
      reportMaybeOffline();
      context.failed = true;
      setState(previous => {
        const cached = previous.key === cacheKey && !previous.error ? previous.rows : memoryRows<T>(cacheKey);
        return { key: cacheKey, rows: cached ?? [], error: cached === null, refreshError: cached !== null, refreshing: false };
      });
    }
  }, [fn, cacheKey, context]);

  useEffect(() => {
    context.active = true;
    if (cacheKey && memoryRows<T>(cacheKey) === null) {
      void readDisk<T>(cacheKey).then(diskRows => {
        if (!context.active || context.succeeded || diskRows === null) return;
        const rows = memoryRows<T>(cacheKey) ?? diskRows;
        setState(previous => previous.key === cacheKey && previous.rows !== null && !previous.error ? previous
          : { key: cacheKey, rows, error: false, refreshError: context.failed, refreshing: previous.key === cacheKey && previous.refreshing });
      });
    }
    void load();
    return () => { context.active = false; context.request++; };
  }, [load, cacheKey, context]);

  const refresh = useCallback(() => load(true), [load]);
  // Do not wait for an effect to hide the preceding city's results: this also
  // protects the render immediately after changing a filter.
  const visible = state.key === cacheKey ? state : initial();
  return { rows: visible.rows, error: visible.error, refreshError: visible.refreshError, loading: visible.rows === null, refreshing: visible.refreshing, refresh };
}

import { supabase } from './supabase';

type GateState = 'loading' | 'no-auth' | 'no-profile' | 'ok';

// Para feeds que requieren sesión (RPCs con auth required): distingue
// "sin sesión" y "sin universidad en el perfil" de "feed vacío".
export function useFetchGated<T>(fn: () => Promise<{ rows: T[]; live: boolean }>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState(false);
  const [gate, setGate] = useState<GateState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  // Protección anti-carrera: cada petición lleva un id; solo la última
  // (y solo si el componente sigue montado) puede escribir el estado.
  const reqId = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive.current || id !== reqId.current) return;
      if (!session) { setGate('no-auth'); setRows([]); return; }
      const r = await fn();
      reportOnline();
      if (!alive.current || id !== reqId.current) return;
      setRows(r.rows); setGate('ok');
    } catch (e) {
      reportMaybeOffline();
      if (!alive.current || id !== reqId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(!msg.includes('auth required') && !msg.includes('university') && !msg.includes('perfil'));
      setGate(msg.includes('auth required') ? 'no-auth' : msg.includes('university') || msg.includes('perfil') ? 'no-profile' : 'ok');
      // Sin red conservamos lo que hubiera en pantalla; si no había nada,
      // lista vacía (la pantalla decide si enseña "reintentar").
      setRows((prev) => prev ?? []);
    }
  }, [fn]);

  useEffect(() => {
    load();
    // Solo login/logout: TOKEN_REFRESHED (renovación silenciosa cada ~1h) no
    // debe resetear la pantalla a skeletons ni perder el scroll.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { setGate('loading'); setRows(null); load(); }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [load]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); if (alive.current) setRefreshing(false); }, [load]);
  return { rows, gate, refreshing, refresh, error };
}
