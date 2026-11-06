import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Btn } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { allowLegacyPanel } from "./legacy-panel";
import { C, F, S } from "@/theme";
import { useSessionOwner } from "@/lib/useSessionOwner";
import { isCurrentSessionIdentity, onSessionIdentityChange, type SessionIdentity } from "@/lib/session";
import { createNativeProClient } from "@/lib/pro-client";
import { addDays, atLocal, localDate } from "../../../shared/pro/format";
import { loadProWorkspace } from "../../../shared/pro/remote-data";
import type { ProRemoteSnapshot } from "../../../shared/pro/remote-contracts";
import { canProCommand, planProCommand, ProActionError, ProCommandRunner, publicProError } from "../../../shared/pro/remote-actions";
import { PRO_VERTICALS } from "../../../shared/pro/verticals";
import { ProContext, type ProStore } from "./store";

/**
 * Negocio real en la app. Es la misma lógica que la web
 * (web/src/lib/pro/store-real.tsx): carga el espacio con las RPC de Franky
 * Pro, traduce cada cambio a una operación del servidor y vuelve a leer para
 * confirmar. Si la sesión cambia, se borra todo lo privado de la memoria.
 */
type Range = ProRemoteSnapshot["range"];

function rangeForDate(date: string): Range {
  return { from: atLocal(addDays(date, -1), 0), until: atLocal(addDays(date, 8), 0) };
}

function errorDetails(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code = "code" in error && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
    return { message: error.message, code };
  }
  if (error && typeof error === "object" && "message" in error) {
    const e = error as { message?: string; code?: string };
    return { message: e.message ?? "", code: e.code };
  }
  return { message: "" };
}

function accessChanged(error: unknown): boolean {
  const d = errorDetails(error);
  return d.code === "42501" || /forbidden|unauthorized|permission|membership|revoked|jwt|session_expired|workspace_changed/i.test(`${d.code ?? ""} ${d.message}`);
}

function readError(error: unknown): string {
  const d = errorDetails(error);
  if (accessChanged(error)) return "Tu acceso ha cambiado. Vuelve a abrir el negocio para comprobar tus permisos.";
  if (d.code === "pro_not_configured" || d.code === "42883") return "La conexión de este negocio todavía está pendiente de activación.";
  if (error instanceof ProActionError) return error.message;
  return publicProError(d);
}

function sectionAllowed(snapshot: ProRemoteSnapshot, section: string): boolean {
  const p = snapshot.permissions;
  if (!p["resource.read"]) return false;
  if (section === "servicios" || section === "horario" || section === "pistas" || section === "guia" || section === "ajustes") return true;
  if (section === "socios") return Boolean(snapshot.data.classOperations?.rosterVisible);
  if (section === "validar") return p["attendees.manage"] === true;
  if (section === "clientes") return p["content.manage"] === true;
  if (section === "caja") return p["finance.read"] === true;
  if (section === "sala" || section === "reservas") return Boolean(snapshot.data.tableOperations && (p["content.manage"] || p["attendees.manage"]));
  if (section === "hoy" || section === "agenda") return Boolean(p["content.manage"] || p["attendees.manage"] || p["finance.read"]);
  return false;
}

export function RealProProvider({ spaceId, children, fallback }: { spaceId: string; children: ReactNode; fallback: ReactNode }) {
  const owner = useSessionOwner();
  if (!owner) {
    return <ConnectionState title="Entra para abrir tu negocio" body="Usa la cuenta con la que formas parte del equipo." signIn />;
  }
  return (
    <OwnedProProvider key={`${owner.userId}:${owner.generation}:${spaceId}`} owner={owner} spaceId={spaceId} fallback={fallback}>
      {children}
    </OwnedProProvider>
  );
}

function OwnedProProvider({ owner, spaceId, children, fallback }: { owner: SessionIdentity; spaceId: string; children: ReactNode; fallback: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ProRemoteSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionValid, setSessionValid] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const snapshotRef = useRef<ProRemoteSnapshot | null>(null);
  const clientRef = useRef<ReturnType<typeof createNativeProClient> | null>(null);
  const runnerRef = useRef<ProCommandRunner | null>(null);
  const alive = useRef(false);
  const validSession = useRef(true);
  const revision = useRef(0);
  const busy = useRef(false);
  const requestedRange = useRef(rangeForDate(localDate(now)));
  const queuedRefresh = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const current = useCallback((ticket: number) => alive.current && validSession.current && revision.current === ticket, []);

  const clearPrivate = useCallback(() => {
    revision.current += 1;
    snapshotRef.current = null;
    runnerRef.current?.clear();
    queuedRefresh.current = false;
    busy.current = false;
    setSnapshot(null);
    setPending(false);
  }, []);

  const acceptSnapshot = useCallback(
    (next: ProRemoteSnapshot, ticket: number) => {
      if (!current(ticket)) return false;
      if (next.data.space.id !== spaceId) throw new ProActionError("Tu acceso ha cambiado. Vuelve a abrir el negocio.", "42501");
      snapshotRef.current = next;
      setSnapshot(next);
      setNow(new Date());
      setError(next.complete ? null : "No se ha podido cargar todo. Actualiza antes de guardar cambios.");
      return next.complete;
    },
    [current, spaceId],
  );

  const fail = useCallback(
    (reason: unknown, ticket: number) => {
      if (!current(ticket)) return;
      if (accessChanged(reason)) clearPrivate();
      setError(readError(reason));
    },
    [clearPrivate, current],
  );

  const finish = useCallback(
    (ticket: number) => {
      if (!current(ticket)) return;
      busy.current = false;
      setPending(false);
      if (queuedRefresh.current) {
        queuedRefresh.current = false;
        void refreshRef.current();
      }
    },
    [current],
  );

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !alive.current || !validSession.current || busy.current) return;
    busy.current = true;
    setPending(true);
    const ticket = ++revision.current;
    const range = { ...requestedRange.current };
    try {
      acceptSnapshot(await loadProWorkspace(client, spaceId, range.from, range.until), ticket);
    } catch (reason) {
      fail(reason, ticket);
    } finally {
      finish(ticket);
    }
  }, [acceptSnapshot, fail, finish, spaceId]);
  refreshRef.current = refresh;

  const update = useCallback<ProStore["update"]>(
    async (label, recipe, intent) => {
      const before = snapshotRef.current;
      const client = clientRef.current;
      const runner = runnerRef.current;
      if (!alive.current || !validSession.current || busy.current || !before || !client || !runner) return false;
      if (!before.complete || !canProCommand(before.permissions, label)) return false;
      if (before.range.from > requestedRange.current.from || before.range.until < requestedRange.current.until) return false;
      if (before.settings.timezone !== "Europe/Madrid" || !["agenda", "tables", "classes", "courts"].includes(PRO_VERTICALS[before.data.space.vertical].engine)) return false;
      // El bloqueo se toma antes del primer await: dos toques no crean dos operaciones.
      busy.current = true;
      setPending(true);
      const ticket = ++revision.current;
      try {
        const after = recipe(JSON.parse(JSON.stringify(before.data)));
        const command = planProCommand(label, before.data, after, intent);
        await runner.run(command);
        if (!current(ticket)) return false;
        const confirmed = await loadProWorkspace(client, spaceId, requestedRange.current.from, requestedRange.current.until);
        const accepted = acceptSnapshot(confirmed, ticket);
        if (accepted) runner.clear(command);
        return accepted;
      } catch (reason) {
        fail(reason, ticket);
        return false;
      } finally {
        finish(ticket);
      }
    },
    [acceptSnapshot, current, fail, finish, spaceId],
  );

  const loadDate = useCallback(
    async (date: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const next = rangeForDate(date);
      const loaded = snapshotRef.current?.range;
      const previous = requestedRange.current;
      requestedRange.current = next;
      if (busy.current) {
        if (previous.from !== next.from || previous.until !== next.until) queuedRefresh.current = true;
        return;
      }
      if (loaded && loaded.from <= next.from && loaded.until >= next.until) return;
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    alive.current = true;
    validSession.current = true;
    const controller = new AbortController();
    const client = createNativeProClient({
      owner,
      organizationId: spaceId,
      signal: controller.signal,
      isCurrent: () => alive.current && validSession.current,
    });
    clientRef.current = client;
    runnerRef.current = new ProCommandRunner(client);
    const unsubscribe = onSessionIdentityChange(() => {
      if (!alive.current) return;
      if (!isCurrentSessionIdentity(owner)) {
        validSession.current = false;
        clearPrivate();
        setSessionValid(false);
        setError(null);
      }
    });
    void refresh();
    return () => {
      alive.current = false;
      validSession.current = false;
      revision.current += 1;
      snapshotRef.current = null;
      runnerRef.current?.clear();
      controller.abort();
      unsubscribe();
    };
  }, [clearPrivate, owner, refresh, spaceId]);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30_000);
    const poll = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 45_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      sub.remove();
    };
  }, [refresh]);

  const value = useMemo<ProStore | null>(
    () =>
      snapshot && sessionValid
        ? {
            spaceId,
            data: snapshot.data,
            vertical: PRO_VERTICALS[snapshot.data.space.vertical],
            demo: false,
            now,
            pending,
            update,
            error,
            refresh,
            loadDate,
            can: (command) =>
              canProCommand(snapshot.permissions, command) &&
              (command.endsWith(".read") ||
                (!pending && snapshot.complete && snapshot.range.from <= requestedRange.current.from && snapshot.range.until >= requestedRange.current.until)),
            canView: (section) => sectionAllowed(snapshot, section),
            resetDemo: () => {},
          }
        : null,
    [snapshot, sessionValid, spaceId, now, pending, update, error, refresh, loadDate],
  );

  if (!sessionValid) return <ConnectionState title="La sesión ha cambiado" body="Vuelve a entrar para abrir el negocio con tu cuenta actual." signIn />;
  if (!snapshot || !value) {
    if (!error) return <>{fallback}</>;
    return (
      <ConnectionState
        title={error.includes("pendiente de activación") ? "Tu negocio está pendiente de activación" : "No hemos podido abrir tu negocio"}
        body={error}
        onRetry={refresh}
        pending={pending}
      />
    );
  }
  if (!["agenda", "tables", "classes", "courts"].includes(value.vertical.engine)) {
    return (
      <ConnectionState
        title="Tu negocio sigue en su panel actual"
        body="Estamos preparando sus herramientas en Franky Pro. Mientras, sigues trabajando con tus datos en el panel actual."
        workspacePanel={spaceId}
      />
    );
  }
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

function ConnectionState({ title, body, signIn, onRetry, pending, workspacePanel }: {
  title: string;
  body: string;
  signIn?: boolean;
  onRetry?: () => void;
  pending?: boolean;
  /** Espacio que se abre en el panel actual. */
  workspacePanel?: string;
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const openPanel = async () => {
    if (workspacePanel) {
      allowLegacyPanel(workspacePanel);
      await workspace.select(workspacePanel).catch(() => {});
    }
    router.push("/(workspace)/resumen" as never);
  };
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: S.xl, gap: S.md, backgroundColor: C.bg }}>
      <Text style={F.h1} maxFontSizeMultiplier={1.4}>{title}</Text>
      <Text style={F.body} maxFontSizeMultiplier={1.6}>{body}</Text>
      <View style={{ gap: S.sm, marginTop: S.md }}>
        {signIn ? <Btn label="Entrar" onPress={() => router.push("/welcome" as never)} /> : null}
        {onRetry ? <Btn label={pending ? "Actualizando" : "Volver a intentar"} onPress={onRetry} disabled={pending} /> : null}
        {workspacePanel ? <Btn label="Abrir panel actual" variant="ghost" onPress={openPanel} /> : null}
        <Btn label="Volver a Franky Pro" variant="ghost" onPress={() => router.replace("/pro" as never)} />
      </View>
    </View>
  );
}
