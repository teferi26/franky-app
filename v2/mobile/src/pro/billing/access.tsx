import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { withOwnedRequest } from "@/lib/owned-request";
import { useSessionOwner } from "@/lib/useSessionOwner";
import type { SessionIdentity } from "@/lib/session";
import type { ProSectionId, ProVerticalId } from "../../../../shared/pro/types";
import { isSectionLocked, parseProAccess, type ProAccess } from "./logic";

/**
 * Acceso a Franky Pro de la persona que usa la app (RPC get_my_pro_access).
 * Se guarda por usuario en memoria y en el teléfono para pintar al instante y
 * se refresca al volver a la app. Si la RPC falla o aún no existe en el
 * servidor, el acceso queda "desconocido" (null) y no se cierra nada.
 */

type Entry = { access: ProAccess | null; at: number };

const STALE_MS = 60_000;
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const storageKey = (userId: string) => `franky-pro-access:v1:${userId}`;

function emit() {
  listeners.forEach((listener) => listener());
}

/** Lo usa la compra: la respuesta del servidor ya es el acceso nuevo. */
export function setCachedProAccess(userId: string, access: ProAccess | null) {
  memory.set(userId, { access, at: Date.now() });
  if (access) void AsyncStorage.setItem(storageKey(userId), JSON.stringify(access)).catch(() => {});
  emit();
}

export function getCachedProAccess(userId: string): ProAccess | null {
  return memory.get(userId)?.access ?? null;
}

async function hydrate(userId: string) {
  if (memory.has(userId)) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw || memory.has(userId)) return;
    const saved = JSON.parse(raw) as ProAccess;
    if (typeof saved?.pro === "boolean") {
      // Marca antigua: se pinta ya, pero se vuelve a pedir enseguida.
      memory.set(userId, { access: saved, at: 0 });
      emit();
    }
  } catch {
    // Sin copia local: se espera al servidor.
  }
}

export async function refreshProAccess(owner: SessionIdentity, force = false): Promise<void> {
  const current = memory.get(owner.userId);
  if (!force && current && Date.now() - current.at < STALE_MS) return;
  const running = inflight.get(owner.userId);
  if (running) return running;
  const job = (async () => {
    try {
      const raw = await withOwnedRequest(owner, async (request) => {
        const { data, error } = await request.query(supabase.rpc("get_my_pro_access"));
        request.check();
        if (error) throw error;
        return data as unknown;
      });
      const access = parseProAccess(raw);
      if (access) setCachedProAccess(owner.userId, access);
      else if (!memory.has(owner.userId)) setCachedProAccess(owner.userId, null);
    } catch {
      // Falla o no existe todavía: se mantiene lo último conocido o se queda
      // en desconocido, que no bloquea nada.
      if (!memory.has(owner.userId)) {
        memory.set(owner.userId, { access: null, at: Date.now() });
        emit();
      }
    } finally {
      inflight.delete(owner.userId);
    }
  })();
  inflight.set(owner.userId, job);
  return job;
}

export type ProAccessHook = {
  userId: string | null;
  owner: SessionIdentity | null;
  /** null: desconocido (sin sesión, cargando o sin servidor). No bloquea. */
  access: ProAccess | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useProAccess(): ProAccessHook {
  const owner = useSessionOwner();
  const userId = owner?.userId ?? null;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  useEffect(() => {
    if (!owner) return;
    void hydrate(owner.userId).then(() => refreshProAccess(owner));
    const sub = AppState.addEventListener("change", (state) => {
      // Al volver de Ajustes (p. ej. tras cancelar) se vuelve a mirar.
      if (state === "active") void refreshProAccess(owner);
    });
    return () => sub.remove();
  }, [owner]);

  const refresh = useCallback(async () => {
    if (owner) await refreshProAccess(owner, true);
  }, [owner]);

  const entry = userId ? memory.get(userId) : undefined;
  return { userId, owner, access: entry?.access ?? null, loading: Boolean(owner) && !entry, refresh };
}

/* ------------------------------------------------------------------ */
/* Acceso dentro de un negocio                                          */
/* ------------------------------------------------------------------ */

const teamCache = new Map<string, boolean>();

/**
 * Pro efectivo en un espacio: el tuyo o, si no lo tienes, el del dueño o un
 * administrador (pro_access_for_organization). Mientras no se sabe, null.
 */
export function useSpaceProAccess(spaceId: string, demo: boolean): { access: ProAccess | null; refresh: () => Promise<void> } {
  const { owner, access, refresh } = useProAccess();
  const key = owner ? `${owner.userId}:${spaceId}` : "";
  const needsTeam = !demo && Boolean(owner) && access !== null && !access.pro;
  const [team, setTeam] = useState<boolean | null>(() => (key ? (teamCache.get(key) ?? null) : null));

  useEffect(() => {
    if (!needsTeam || !owner) return;
    let alive = true;
    setTeam(teamCache.get(key) ?? null);
    withOwnedRequest(owner, async (request) => {
      const { data, error } = await request.query(supabase.rpc("pro_access_for_organization", { p_org: spaceId }));
      request.check();
      if (error) throw error;
      return data === true;
    })
      .then((value) => {
        teamCache.set(key, value);
        if (alive) setTeam(value);
      })
      .catch(() => {
        // Sin respuesta: desconocido, sin candados.
        if (alive) setTeam(null);
      });
    return () => {
      alive = false;
    };
  }, [needsTeam, owner, key, spaceId]);

  const effective = useMemo<ProAccess | null>(() => {
    if (demo || !access) return null;
    if (access.pro) return access;
    if (team === true) return { ...access, pro: true, isTrial: false, viaTeam: true };
    if (team === false) return access;
    return null;
  }, [demo, access, team]);

  return { access: effective, refresh };
}

type SpaceAccess = {
  access: ProAccess | null;
  locked: (section: ProSectionId) => boolean;
};

const SpaceAccessContext = createContext<SpaceAccess>({ access: null, locked: () => false });

/** Lo monta la carcasa de cada negocio; las pantallas lo leen con useSpaceAccess. */
export function SpaceAccessProvider({ spaceId, demo, vertical, children }: { spaceId: string; demo: boolean; vertical: ProVerticalId; children: ReactNode }) {
  const { access } = useSpaceProAccess(spaceId, demo);
  const value = useMemo<SpaceAccess>(
    () => ({ access, locked: (section) => isSectionLocked({ demo, access, section, vertical }) }),
    [access, demo, vertical],
  );
  return <SpaceAccessContext.Provider value={value}>{children}</SpaceAccessContext.Provider>;
}

export function useSpaceAccess(): SpaceAccess {
  return useContext(SpaceAccessContext);
}
