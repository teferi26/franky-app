import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ProData, ProVerticalId } from "../../../shared/pro/types";
import type { ProMutationIntent } from "../../../shared/pro/remote-intents";
import { PRO_VERTICALS, verticalFromDemoSlug, type ProVertical } from "../../../shared/pro/verticals";
import { buildDemo } from "../../../shared/pro/demo";
import { localDate } from "../../../shared/pro/format";
import { RealProProvider } from "./store-real";

/**
 * Estado de un espacio de Franky Pro en la app. Mismo contrato que la web
 * (web/src/lib/pro/store.tsx): las pantallas no saben si están en la demo o
 * en un negocio real. En la demo los cambios se guardan en el teléfono y se
 * reinician al día siguiente; en un negocio real `update` llama a la RPC.
 */
export type ProStore = {
  spaceId: string;
  vertical: ProVertical;
  data: ProData;
  demo: boolean;
  now: Date;
  update: (label: string, fn: (draft: ProData) => ProData, intent?: ProMutationIntent) => Promise<boolean>;
  pending: boolean;
  can: (command: string) => boolean;
  canView: (section: string) => boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadDate: (date: string) => Promise<void>;
  resetDemo: () => void;
};

export const ProContext = createContext<ProStore | null>(null);

export function usePro(): ProStore {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error("usePro debe usarse dentro de <ProProvider>");
  return ctx;
}

export function resolveDemoVertical(spaceId: string): ProVerticalId | null {
  if (!spaceId.startsWith("demo-")) return null;
  return verticalFromDemoSlug(spaceId.slice(5));
}

export function ProProvider({ spaceId, children, fallback }: { spaceId: string; children: ReactNode; fallback: ReactNode }) {
  if (!resolveDemoVertical(spaceId)) {
    return (
      <RealProProvider key={spaceId} spaceId={spaceId} fallback={fallback}>
        {children}
      </RealProProvider>
    );
  }
  return (
    <DemoProProvider key={spaceId} spaceId={spaceId} fallback={fallback}>
      {children}
    </DemoProProvider>
  );
}

function storageKey(spaceId: string, now: Date) {
  return `franky-pro:${spaceId}:${localDate(now)}:v1`;
}

function DemoProProvider({ spaceId, children, fallback }: { spaceId: string; children: ReactNode; fallback: ReactNode }) {
  const vertical = resolveDemoVertical(spaceId);
  const [data, setData] = useState<ProData | null>(null);
  const [now, setNow] = useState(() => new Date());
  const keyRef = useRef("");
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!vertical) return;
    let alive = true;
    const current = new Date();
    const key = storageKey(spaceId, current);
    keyRef.current = key;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!alive) return;
        setNow(current);
        setData(raw ? (JSON.parse(raw) as ProData) : buildDemo(vertical, current));
      })
      .catch(() => {
        if (alive) setData(buildDemo(vertical, current));
      });
    return () => {
      alive = false;
    };
  }, [spaceId, vertical]);

  // La línea de "ahora" y los estados avanzan solos.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback((next: ProData) => {
    // Se agrupan las escrituras: algunas demos pesan cientos de KB.
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      if (keyRef.current) void AsyncStorage.setItem(keyRef.current, JSON.stringify(next)).catch(() => {});
    }, 400);
  }, []);

  const update = useCallback(
    async (_label: string, fn: (draft: ProData) => ProData) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        persist(next);
        return next;
      });
      return true;
    },
    [persist],
  );

  const resetDemo = useCallback(() => {
    if (!vertical) return;
    const current = new Date();
    void AsyncStorage.removeItem(keyRef.current).catch(() => {});
    setNow(current);
    setData(buildDemo(vertical, current));
  }, [vertical]);

  const value = useMemo<ProStore | null>(() => {
    if (!data || !vertical) return null;
    return {
      spaceId,
      vertical: PRO_VERTICALS[vertical],
      data,
      demo: true,
      now,
      update,
      pending: false,
      can: () => true,
      canView: () => true,
      error: null,
      refresh: async () => {},
      loadDate: async () => {},
      resetDemo,
    };
  }, [data, vertical, spaceId, now, update, resetDemo]);

  if (!value) return <>{fallback}</>;
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function localId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
