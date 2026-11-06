"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProData, ProVerticalId } from "./types";
import { PRO_VERTICALS, verticalFromDemoSlug, type ProVertical } from "./verticals";
import { buildDemo } from "./demo";
import { localDate } from "./format";
import { RealProProvider } from "./store-real";
import type { ProMutationIntent } from "./remote-intents";

/**
 * Estado de un espacio de Franky Pro.
 *
 * En modo demo los datos viven en memoria y se guardan en sessionStorage para
 * que los cambios sobrevivan a la navegación entre pantallas durante la visita
 * (y se reinician al día siguiente). En un espacio real las pantallas usan la
 * misma API: `update` se sustituye por la llamada a la RPC correspondiente.
 */
export type ProStore = {
  spaceId: string;
  vertical: ProVertical;
  data: ProData;
  demo: boolean;
  now: Date;
  /** Aplica un cambio y lo recuerda. `label` sirve para depurar y para el historial. */
  update: (label: string, fn: (draft: ProData) => ProData, intent?: ProMutationIntent) => Promise<boolean>;
  pending: boolean;
  can: (command: string) => boolean;
  canView: (section: string) => boolean;
  error: string | null;
  refresh: () => Promise<void>;
  spaces: { id: string; name: string }[];
  loadDate: (date: string) => Promise<void>;
  resetDemo: () => void;
};

export const ProContext = createContext<ProStore | null>(null);

export function useProStore(): ProStore {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error("useProStore debe usarse dentro de <ProProvider>");
  return ctx;
}

/** Acceso cómodo a los datos: `const { data, vertical } = usePro()`. */
export const usePro = useProStore;

function storageKey(spaceId: string, now: Date) {
  return `franky-pro:${spaceId}:${localDate(now)}:v1`;
}

function readStored(key: string): ProData | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ProData) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, data: ProData) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Sin almacenamiento (modo privado, cuota llena): la demo sigue en memoria.
  }
}

export function resolveDemoVertical(spaceId: string): ProVerticalId | null {
  if (!spaceId.startsWith("demo-")) return null;
  return verticalFromDemoSlug(spaceId.slice(5));
}

export function ProProvider({
  spaceId,
  children,
  fallback,
}: {
  spaceId: string;
  children: ReactNode;
  fallback: ReactNode;
}) {
  if (!resolveDemoVertical(spaceId)) {
    return <RealProProvider key={spaceId} spaceId={spaceId} fallback={fallback}>{children}</RealProProvider>;
  }
  return <DemoProProvider key={spaceId} spaceId={spaceId} fallback={fallback}>{children}</DemoProProvider>;
}

function DemoProProvider({ spaceId, children, fallback }: {
  spaceId: string; children: ReactNode; fallback: ReactNode;
}) {
  const demoVertical = resolveDemoVertical(spaceId);
  const [data, setData] = useState<ProData | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const keyRef = useRef<string>("");

  // Los datos se crean al montar, no en el servidor: dependen de la hora del
  // dispositivo y de sessionStorage, y así no hay diferencias de hidratación.
  useEffect(() => {
    if (!demoVertical) return;
    const current = new Date();
    const key = storageKey(spaceId, current);
    keyRef.current = key;
    setNow(current);
    setData(readStored(key) ?? buildDemo(demoVertical, current));
  }, [spaceId, demoVertical]);

  // La línea de "ahora" y los estados de las citas avanzan solos.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const update = useCallback(async (label: string, fn: (draft: ProData) => ProData) => {
    void label;
    setData((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (keyRef.current) writeStored(keyRef.current, next);
      return next;
    });
    return true;
  }, []);

  const resetDemo = useCallback(() => {
    if (!demoVertical) return;
    const current = new Date();
    const fresh = buildDemo(demoVertical, current);
    try {
      window.sessionStorage.removeItem(keyRef.current);
    } catch {
      // nada que limpiar
    }
    setNow(current);
    setData(fresh);
  }, [demoVertical]);

  const value = useMemo<ProStore | null>(() => {
    if (!data || !now || !demoVertical) return null;
    return {
      spaceId,
      vertical: PRO_VERTICALS[demoVertical],
      data,
      demo: true,
      now,
      update,
      resetDemo,
      pending: false,
      can: () => true,
      canView: () => true,
      error: null,
      refresh: async () => {},
      spaces: [],
      loadDate: async () => {},
    };
  }, [data, now, demoVertical, spaceId, update, resetDemo]);

  if (!value) return <>{fallback}</>;
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

/** Genera identificadores locales para lo que se crea en la demo. */
export function localId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
