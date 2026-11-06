import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { randomUUID } from "expo-crypto";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { createNativeProClient } from "@/lib/pro-client";
import { isCurrentSessionIdentity, type SessionIdentity } from "@/lib/session";
import { addDays, atLocal, localDate } from "../../../../shared/pro/format";
import { loadProWorkspace } from "../../../../shared/pro/remote-data";
import {
  canProCommand,
  planProCommand,
  ProCommandRunner,
  publicProError,
} from "../../../../shared/pro/remote-actions";
import type {
  ProRemoteSnapshot,
  ProRpcClient,
} from "../../../../shared/pro/remote-contracts";
import type { ProData } from "../../../../shared/pro/types";
import { PRO_VERTICALS } from "../../../../shared/pro/verticals";

type NativeProContext = {
  snapshot: ProRemoteSnapshot | null;
  date: string;
  now: Date;
  loading: boolean;
  pending: boolean;
  error: string | null;
  client: ProRpcClient;
  changeDate(date: string): void;
  refresh(): Promise<void>;
  can(label: string): boolean;
  update(label: string, edit: (data: ProData) => void): Promise<boolean>;
};

const Context = createContext<NativeProContext | null>(null);

function rangeFor(date: string) {
  return {
    from: atLocal(addDays(date, -1), 0),
    until: atLocal(addDays(date, 2), 0),
  };
}

export function ProProvider({
  owner,
  organizationId,
  children,
}: {
  owner: SessionIdentity;
  organizationId: string;
  children: React.ReactNode;
}) {
  const {
    signal: workspaceSignal,
    isCurrent: workspaceIsCurrent,
    refresh: refreshWorkspace,
  } = useWorkspace();
  const [snapshot, setSnapshot] = useState<ProRemoteSnapshot | null>(null);
  const [date, setDate] = useState(() => localDate(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useRef<ProRemoteSnapshot | null>(null);
  const currentDate = useRef(date);
  const loadedDate = useRef<string | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  const reading = useRef(0);
  const invalidateReads = useCallback(() => {
    reading.current += 1;
  }, []);
  const controller = useRef(new AbortController());
  const current = useCallback(
    () =>
      mounted.current &&
      !controller.current.signal.aborted &&
      !workspaceSignal.aborted &&
      workspaceIsCurrent(organizationId) &&
      isCurrentSessionIdentity(owner),
    [controller, workspaceSignal, workspaceIsCurrent, organizationId, owner],
  );
  const client = useMemo(
    () =>
      createNativeProClient({
        owner,
        organizationId,
        get signal() {
          return controller.current.signal;
        },
        isCurrent: current,
      }),
    [owner, organizationId, controller, current],
  );
  const runner = useMemo(
    () => new ProCommandRunner(client, randomUUID),
    [client],
  );

  const accept = useCallback(
    (next: ProRemoteSnapshot, expectedDate: string) => {
      if (next.data.space.id !== organizationId)
        throw new Error("workspace_changed");
      if (
        PRO_VERTICALS[next.data.space.vertical].engine !== "agenda" ||
        next.settings.timezone !== "Europe/Madrid" ||
        !["content.manage", "attendees.manage", "finance.read"].some(
          (permission) => next.permissions[permission],
        )
      ) {
        throw new Error("pro_agenda_unavailable");
      }
      state.current = next;
      loadedDate.current = next.complete ? expectedDate : null;
      setSnapshot(next);
      setNow(new Date());
      setError(
        next.complete
          ? null
          : "Faltan citas por comprobar. Actualiza la agenda antes de seguir.",
      );
      return next.complete;
    },
    [organizationId],
  );

  const report = useCallback(
    (failure: unknown) => {
      if (!current()) return;
      const problem = failure as { message?: string; code?: string };
      if (
        problem?.code === "42501" ||
        /forbidden|unauthorized|permission|membership|revoked|jwt|session_required|session_expired/i.test(
          `${problem?.code ?? ""} ${problem?.message ?? ""}`,
        )
      ) {
        state.current = null;
        setSnapshot(null);
        void refreshWorkspace();
      }
      setError(
        problem?.message === "pro_agenda_unavailable"
          ? "Puedes gestionar este negocio desde sus herramientas habituales."
          : publicProError(problem ?? {}),
      );
    },
    [current, refreshWorkspace],
  );

  const refresh = useCallback(async () => {
    if (!current() || locked.current) return;
    const version = ++reading.current;
    const expectedDate = currentDate.current;
    const range = rangeFor(expectedDate);
    loadedDate.current = null;
    setLoading(true);
    try {
      const next = await loadProWorkspace(
        client,
        organizationId,
        range.from,
        range.until,
      );
      if (
        !current() ||
        reading.current !== version ||
        expectedDate !== currentDate.current
      )
        return;
      accept(next, expectedDate);
    } catch (failure) {
      if (reading.current === version) report(failure);
    } finally {
      if (current() && reading.current === version) setLoading(false);
    }
  }, [client, organizationId, current, accept, report]);

  useEffect(() => {
    mounted.current = true;
    if (controller.current.signal.aborted)
      controller.current = new AbortController();
    const ownedController = controller.current;
    const abort = () => ownedController.abort();
    workspaceSignal.addEventListener("abort", abort);
    return () => {
      mounted.current = false;
      invalidateReads();
      ownedController.abort();
      runner.clear();
      workspaceSignal.removeEventListener("abort", abort);
    };
  }, [controller, runner, workspaceSignal, invalidateReads]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 45_000);
    const clock = setInterval(() => setNow(new Date()), 30_000);
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      listener.remove();
    };
  }, [refresh]);

  const can = useCallback(
    (label: string) => {
      const value = state.current;
      return Boolean(
        current() &&
        !locked.current &&
        !loading &&
        loadedDate.current === currentDate.current &&
        value?.complete &&
        canProCommand(value.permissions, label),
      );
    },
    [current, loading],
  );

  const changeDate = useCallback(
    (next: string) => {
      if (
        !current() ||
        locked.current ||
        next === currentDate.current ||
        !/^\d{4}-\d{2}-\d{2}$/.test(next)
      )
        return;
      currentDate.current = next;
      loadedDate.current = null;
      ++reading.current;
      setDate(next);
      void refresh();
    },
    [current, refresh],
  );

  const update = useCallback(
    async (label: string, edit: (data: ProData) => void) => {
      const before = state.current;
      if (!before || !can(label)) return false;
      locked.current = true;
      ++reading.current;
      setPending(true);
      setError(null);
      const expectedDate = currentDate.current;
      try {
        const after = JSON.parse(JSON.stringify(before.data)) as ProData;
        edit(after);
        const command = planProCommand(label, before.data, after);
        await runner.run(command);
        if (!current()) return false;
        const range = rangeFor(expectedDate);
        const confirmed = await loadProWorkspace(
          client,
          organizationId,
          range.from,
          range.until,
        );
        if (!current() || currentDate.current !== expectedDate) return false;
        if (!accept(confirmed, expectedDate)) return false;
        runner.clear(command);
        return true;
      } catch (failure) {
        loadedDate.current = null;
        report(failure);
        return false;
      } finally {
        locked.current = false;
        if (current()) setPending(false);
      }
    },
    [can, runner, client, organizationId, current, accept, report],
  );

  return (
    <Context.Provider
      value={{
        snapshot: current() ? snapshot : null,
        date,
        now,
        loading,
        pending,
        error,
        client,
        changeDate,
        refresh,
        can,
        update,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useNativePro() {
  const context = useContext(Context);
  if (!context) throw new Error("ProProvider required");
  return context;
}
