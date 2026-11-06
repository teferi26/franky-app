import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSessionIdentity } from "@/lib/useSessionIdentity";
import { useSessionOwner } from "@/lib/useSessionOwner";
import {
  captureSessionIdentity,
  isCurrentSessionIdentity,
} from "@/lib/session";
import { supabase } from "@/lib/supabase";
import {
  ACTIVE_WORKSPACE_KEY,
  workspaceRpc,
  workspaceStorage,
  type Workspace,
} from "@/lib/workspaces";

type Context = {
  ready: boolean;
  enabled: boolean;
  canCreate: boolean;
  error: string | null;
  demoEpoch: number | null;
  workspaces: Workspace[];
  active: Workspace | null;
  revision: number;
  refresh(): Promise<void>;
  select(id: string | null): Promise<void>;
  run<T>(name: string, args?: Record<string, unknown>): Promise<T>;
  isCurrent(id: string): boolean;
  signal: AbortSignal;
};
const WorkspaceContext = createContext<Context | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { uid } = useSessionIdentity();
  const sessionOwner = useSessionOwner();
  const generation = sessionOwner?.generation;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState<{
    enabled: boolean;
    can_create: boolean;
    demo_epoch: number | null;
  }>({ enabled: false, can_create: false, demo_epoch: null });
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const current = useRef<{
    uid: string | null | undefined;
    activeId: string | null;
    generation: number | undefined;
  }>({ uid, activeId: null, generation });
  const controller = useRef(new AbortController());
  const sequence = useRef(0);
  const mounted = useRef(true);
  const selectionVersion = useRef(0);
  const availableRef = useRef<Workspace[]>([]);
  const enabledRef = useRef(false);
  const resolvedIdentity = useRef<{
    userId: string;
    generation: number;
  } | null>(null);

  const invalidate = useCallback(() => {
    controller.current.abort();
    controller.current = new AbortController();
    setRevision((value) => value + 1);
  }, []);
  // Updating the identity guard during render closes the gap before effect cleanup.
  if (
    current.current.uid !== uid ||
    current.current.generation !== generation
  ) {
    current.current = { uid, activeId: null, generation };
    resolvedIdentity.current = null;
    controller.current.abort();
  }

  const refresh = useCallback(async () => {
    const owner = sessionOwner;
    if (!owner || owner.userId !== uid || !isCurrentSessionIdentity(owner))
      return;
    const version = ++sequence.current;
    const selection = selectionVersion.current;
    try {
      const [availability, list, stored] = await Promise.all([
        workspaceRpc<{
          enabled: boolean;
          can_create: boolean;
          demo_epoch?: number | null;
        }>("get_workspace_access", {}, owner),
        workspaceRpc<Workspace[]>("list_my_workspaces", {}, owner),
        workspaceStorage.get(owner, ACTIVE_WORKSPACE_KEY).catch(() => null),
      ]);
      if (
        !mounted.current ||
        !isCurrentSessionIdentity(owner) ||
        version !== sequence.current
      )
        return;
      const available = availability?.enabled === true;
      const safeList = Array.isArray(list)
        ? list.filter((item) => item.status === "active")
        : [];
      const previous = availableRef.current.find(
        (item) => item.id === current.current.activeId,
      );
      availableRef.current = safeList;
      enabledRef.current = available;
      setAccess({
        enabled: available,
        can_create: available && availability.can_create === true,
        demo_epoch:
          Number.isSafeInteger(availability.demo_epoch) &&
          (availability.demo_epoch ?? -1) >= 0
            ? availability.demo_epoch!
            : null,
      });
      setWorkspaces(safeList);
      setError(null);
      const candidate =
        selection === selectionVersion.current
          ? stored
          : current.current.activeId;
      const next =
        (available || safeList.some((item) => !!item.demo_cohort_id)) &&
        safeList.some((item) => item.id === candidate)
          ? candidate
          : null;
      if (next !== current.current.activeId) {
        current.current.activeId = next;
        invalidate();
        setActiveId(next);
      } else if (
        next &&
        JSON.stringify(previous?.permissions) !==
          JSON.stringify(safeList.find((item) => item.id === next)?.permissions)
      ) {
        invalidate();
      }
      if (candidate && !next)
        await workspaceStorage
          .remove(owner, ACTIVE_WORKSPACE_KEY)
          .catch(() => {});
    } catch {
      if (
        !mounted.current ||
        !isCurrentSessionIdentity(owner) ||
        version !== sequence.current
      )
        return;
      // Fail closed on a membership refresh: stale capabilities are never displayed.
      current.current.activeId = null;
      invalidate();
      setActiveId(null);
      setWorkspaces([]);
      setAccess({ enabled: false, can_create: false, demo_epoch: null });
      availableRef.current = [];
      enabledRef.current = false;
      setError(
        "No pudimos comprobar tus espacios. Puedes seguir usando tu cuenta y volver a intentarlo.",
      );
    } finally {
      if (
        mounted.current &&
        isCurrentSessionIdentity(owner) &&
        version === sequence.current
      ) {
        resolvedIdentity.current = {
          userId: owner.userId,
          generation: owner.generation,
        };
        setReady(true);
      }
    }
  }, [uid, generation, invalidate]);

  useEffect(() => {
    mounted.current = true;
    ++sequence.current;
    ++selectionVersion.current;
    setReady(uid === null);
    setActiveId(null);
    setWorkspaces([]);
    setAccess({ enabled: false, can_create: false, demo_epoch: null });
    setError(null);
    availableRef.current = [];
    enabledRef.current = false;
    invalidate();
    if (uid) void refresh();
    return () => {
      mounted.current = false;
      ++sequence.current;
      controller.current.abort();
    };
  }, [uid, generation, refresh, invalidate]);

  useEffect(() => {
    if (!uid) return;
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const channel = supabase
      .channel(`workspace-memberships:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organization_memberships",
          filter: `user_id=eq.${uid}`,
        },
        () => void refresh(),
      )
      .subscribe();
    // Foreground refresh + bounded polling covers deployments without realtime enabled.
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 60_000);
    return () => {
      app.remove();
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [uid, refresh]);

  const select = useCallback(
    async (id: string | null) => {
      const owner = sessionOwner;
      if (!owner || owner.userId !== uid || !isCurrentSessionIdentity(owner))
        throw new Error("session_changed");
      if (
        id &&
        !availableRef.current.some(
          (item) =>
            item.id === id && (enabledRef.current || !!item.demo_cohort_id),
        )
      )
        throw new Error("workspace_changed");
      ++selectionVersion.current;
      current.current.activeId = id;
      invalidate();
      setActiveId(id);
      await workspaceStorage
        .set(owner, ACTIVE_WORKSPACE_KEY, id ?? "")
        .catch(() => {});
    },
    [uid, generation, invalidate],
  );

  const operationSignal = controller.current.signal;
  const run = useCallback(
    async <T,>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> => {
      const owner = sessionOwner;
      const expectedId = activeId;
      const signal = operationSignal;
      if (
        !owner ||
        !isCurrentSessionIdentity(owner) ||
        signal.aborted ||
        owner.userId !== uid ||
        !expectedId ||
        current.current.activeId !== expectedId
      )
        throw new Error("workspace_changed");
      const result = await workspaceRpc<T>(
        name,
        { ...args, p_organization_id: expectedId },
        owner,
        signal,
      );
      if (
        !mounted.current ||
        current.current.activeId !== expectedId ||
        signal.aborted
      )
        throw new Error("workspace_changed");
      return result;
    },
    [activeId, uid, generation, operationSignal],
  );
  const isCurrent = useCallback(
    (id: string) =>
      mounted.current &&
      !!sessionOwner &&
      isCurrentSessionIdentity(sessionOwner) &&
      current.current.uid === uid &&
      current.current.activeId === id &&
      !operationSignal.aborted,
    [uid, generation, operationSignal],
  );
  // A new account renders before effects clear old state. Do not expose that
  // previous account's availability, list or demo mode even for that first frame.
  const identityResolved =
    !!uid &&
    resolvedIdentity.current?.userId === uid &&
    resolvedIdentity.current.generation === generation;
  const effectiveReady = uid === null || (ready && identityResolved);
  const active =
    effectiveReady && identityResolved
      ? (workspaces.find((item) => item.id === activeId) ?? null)
      : null;
  return (
    <WorkspaceContext.Provider
      value={{
        ready: effectiveReady,
        enabled: identityResolved && access.enabled,
        canCreate: identityResolved && access.can_create,
        demoEpoch: identityResolved ? access.demo_epoch : null,
        error: identityResolved ? error : null,
        workspaces: identityResolved ? workspaces : [],
        active,
        revision,
        refresh,
        select,
        run,
        isCurrent,
        signal: controller.current.signal,
      }}
    >
      <WorkspaceRouteGuard />
      {children}
    </WorkspaceContext.Provider>
  );
}

function WorkspaceRouteGuard() {
  const { ready, workspaces, active } = useWorkspace();
  const router = useRouter();
  const segments = useSegments();
  const demo = workspaces.some((workspace) => !!workspace.demo_cohort_id);
  const route = segments[0] ?? "";
  const activeId = active?.id;
  const activeKind = active?.kind;
  useEffect(() => {
    if (!ready || !demo) return;
    const allowed =
      [
        "welcome",
        "espacios",
        "(workspace)",
        "pro",
        "seguridad",
        "terminos",
        "privacidad",
        "cookies",
        "centro-seguridad",
        "creadores",
        "recompensas",
        "invitar",
        "compras",
        "franky-card",
      ].includes(route) ||
      route.startsWith("espacio-") ||
      route.startsWith("card-");
    const home = !activeId ? "/pro" : activeKind === "leisure" ? `/pro/${activeId}` : "/(workspace)/resumen";
    if (!allowed) router.replace(home as never);
  }, [ready, demo, route, activeId, activeKind, router]);
  return null;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider required");
  return value;
}
