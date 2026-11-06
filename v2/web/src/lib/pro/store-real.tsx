"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-client";
import { addDays, atLocal, localDate } from "./format";
import { loadProWorkspace } from "./remote-data";
import type { ProRemoteSnapshot } from "./remote-contracts";
import {
  canProCommand,
  planProCommand,
  ProActionError,
  ProCommandRunner,
  publicProError,
} from "./remote-actions";
import { ProContext, type ProStore } from "./store";
import { PRO_VERTICALS } from "./verticals";

type ProviderProps = {
  spaceId: string;
  children: ReactNode;
  fallback: ReactNode;
};
type Range = ProRemoteSnapshot["range"];

function rangeForDate(date: string): Range {
  return {
    from: atLocal(addDays(date, -1), 0),
    until: atLocal(addDays(date, 8), 0),
  };
}

function errorDetails(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    return { message: error.message, code };
  }
  return { message: "" };
}

function accessChanged(error: unknown): boolean {
  const detail = errorDetails(error);
  return (
    detail.code === "42501" ||
    /forbidden|unauthorized|permission|membership|revoked|jwt|session_expired/i.test(
      `${detail.code ?? ""} ${detail.message}`,
    )
  );
}

function readError(error: unknown): string {
  const detail = errorDetails(error);
  if (accessChanged(error))
    return "Tu acceso ha cambiado. Vuelve a abrir el negocio para comprobar tus permisos.";
  if (detail.code === "pro_not_configured" || detail.code === "42883") {
    return "La conexión de esta agenda todavía está pendiente de activación.";
  }
  if (error instanceof ProActionError) return error.message;
  return publicProError(detail);
}

function sectionAllowed(snapshot: ProRemoteSnapshot, section: string): boolean {
  const p = snapshot.permissions;
  if (!p["resource.read"]) return false;
  if (section === "servicios") return true;
  if (section === "horario" || section === "pistas") return true;
  if (section === "socios")
    return Boolean(snapshot.data.classOperations?.rosterVisible);
  if (section === "validar") return p["attendees.manage"] === true;
  if (section === "clientes") return p["content.manage"] === true;
  if (section === "caja") return p["finance.read"] === true;
  if (section === "sala" || section === "reservas") {
    return Boolean(
      snapshot.data.tableOperations &&
      (p["content.manage"] || p["attendees.manage"]),
    );
  }
  if (section === "hoy" || section === "agenda") {
    return Boolean(
      p["content.manage"] || p["attendees.manage"] || p["finance.read"],
    );
  }
  return false;
}

export function RealProProvider({
  spaceId,
  children,
  fallback,
}: ProviderProps) {
  const { user, loading } = useSession();
  if (loading) return <>{fallback}</>;
  if (!user) {
    return (
      <ConnectionState
        title="Entra para abrir tu negocio"
        body="Usa la cuenta con la que formas parte del equipo."
        spaceId={spaceId}
        signIn
      />
    );
  }
  return (
    <OwnedProProvider
      key={`${user.id}:${spaceId}`}
      owner={user.id}
      spaceId={spaceId}
      fallback={fallback}
    >
      {children}
    </OwnedProProvider>
  );
}

function OwnedProProvider({
  owner,
  spaceId,
  children,
  fallback,
}: ProviderProps & { owner: string }) {
  const [snapshot, setSnapshot] = useState<ProRemoteSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionValid, setSessionValid] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const snapshotRef = useRef<ProRemoteSnapshot | null>(null);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const runnerRef = useRef<ProCommandRunner | null>(null);
  const alive = useRef(false);
  const validSession = useRef(true);
  const revision = useRef(0);
  const busy = useRef(false);
  const requestedRange = useRef(rangeForDate(localDate(now)));
  const queuedRefresh = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const current = useCallback(
    (ticket: number) =>
      alive.current && validSession.current && revision.current === ticket,
    [],
  );

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
      if (next.data.space.id !== spaceId)
        throw new ProActionError(
          "Tu acceso ha cambiado. Vuelve a abrir el negocio.",
          "42501",
        );
      snapshotRef.current = next;
      setSnapshot(next);
      setNow(new Date());
      setError(
        next.complete
          ? null
          : "No se ha podido cargar toda la agenda. Actualiza antes de guardar cambios.",
      );
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
    if (!client || !alive.current || !validSession.current || busy.current)
      return;
    busy.current = true;
    setPending(true);
    const ticket = ++revision.current;
    const range = { ...requestedRange.current };
    try {
      const next = await loadProWorkspace(
        client,
        spaceId,
        range.from,
        range.until,
      );
      acceptSnapshot(next, ticket);
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
      if (
        !alive.current ||
        !validSession.current ||
        busy.current ||
        !before ||
        !client ||
        !runner
      )
        return false;
      if (!before.complete || !canProCommand(before.permissions, label))
        return false;
      if (
        before.range.from > requestedRange.current.from ||
        before.range.until < requestedRange.current.until
      )
        return false;
      if (
        before.settings.timezone !== "Europe/Madrid" ||
        !["agenda", "tables", "classes", "courts"].includes(
          PRO_VERTICALS[before.data.space.vertical].engine,
        )
      )
        return false;

      // El bloqueo se toma antes del primer await: dos toques no crean dos operaciones.
      busy.current = true;
      setPending(true);
      const ticket = ++revision.current;
      try {
        const after = recipe(structuredClone(before.data));
        const command = planProCommand(label, before.data, after, intent);
        await runner.run(command);
        if (!current(ticket)) return false;
        const range = { ...requestedRange.current };
        const confirmed = await loadProWorkspace(
          client,
          spaceId,
          range.from,
          range.until,
        );
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
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T12:00:00Z`))
      )
        return;
      const next = rangeForDate(date);
      const loaded = snapshotRef.current?.range;
      const previous = requestedRange.current;
      requestedRange.current = next;
      if (busy.current) {
        if (previous.from !== next.from || previous.until !== next.until)
          queuedRefresh.current = true;
        return;
      }
      if (loaded && loaded.from <= next.from && loaded.until >= next.until)
        return;
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    alive.current = true;
    validSession.current = true;
    const client = createClient();
    clientRef.current = client;
    runnerRef.current = new ProCommandRunner(client);
    const { data: auth } = client.auth.onAuthStateChange((event, session) => {
      if (!alive.current) return;
      if (event === "SIGNED_OUT" || session?.user.id !== owner) {
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
      auth.subscription.unsubscribe();
    };
  }, [clearPrivate, owner, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(onVisible, 45_000);
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clock);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
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
            spaces: snapshot.spaces,
            can: (command) =>
              canProCommand(snapshot.permissions, command) &&
              (command.endsWith(".read") ||
                (!pending &&
                  snapshot.complete &&
                  snapshot.range.from <= requestedRange.current.from &&
                  snapshot.range.until >= requestedRange.current.until)),
            canView: (section) => sectionAllowed(snapshot, section),
            resetDemo: () => {},
          }
        : null,
    [
      snapshot,
      sessionValid,
      spaceId,
      now,
      pending,
      update,
      error,
      refresh,
      loadDate,
    ],
  );

  if (!sessionValid) {
    return (
      <ConnectionState
        title="La sesión ha cambiado"
        body="Vuelve a entrar para abrir el negocio con tu cuenta actual."
        spaceId={spaceId}
        signIn
      />
    );
  }
  if (!snapshot || !value) {
    if (!error) return <>{fallback}</>;
    return (
      <ConnectionState
        title={
          error.includes("pendiente de activación")
            ? "Tu agenda está pendiente de activación"
            : "No hemos podido abrir la agenda"
        }
        body={error}
        spaceId={spaceId}
        pending={pending}
        onRetry={refresh}
      />
    );
  }
  if (
    !["agenda", "tables", "classes", "courts"].includes(value.vertical.engine)
  ) {
    return (
      <ConnectionState
        title="Tu negocio sigue en su panel actual"
        body="Estamos preparando sus herramientas en Franky Pro. Puedes seguir trabajando con tus datos en el panel actual."
        spaceId={spaceId}
        workspacePanel
      />
    );
  }
  if (snapshot.settings.timezone !== "Europe/Madrid") {
    return (
      <ConnectionState
        title="Tu agenda sigue en el panel actual"
        body="Estamos adaptando Franky Pro al horario de tu negocio. Abre tu panel actual para consultar y gestionar las citas."
        spaceId={spaceId}
      />
    );
  }
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

function ConnectionState({
  title,
  body,
  spaceId,
  signIn,
  pending,
  onRetry,
  workspacePanel,
}: {
  title: string;
  body: string;
  spaceId: string;
  signIn?: boolean;
  pending?: boolean;
  onRetry?: () => Promise<void>;
  workspacePanel?: boolean;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-secondary px-4 py-16">
      <section className="w-full max-w-md rounded-3xl border border-border bg-bg-primary p-7 shadow-card">
        <p className="eyebrow">Franky Pro</p>
        <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-text-muted" role="status">
          {body}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {signIn ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/pro/${spaceId}`)}`}
              className={buttonVariants({ variant: "dark" })}
            >
              Entrar
            </Link>
          ) : onRetry ? (
            <Button variant="dark" disabled={pending} onClick={onRetry}>
              {pending ? "Actualizando" : "Volver a intentar"}
            </Button>
          ) : null}
          {!signIn ? (
            <Link
              href={
                workspacePanel
                  ? "/espacios?panel=1"
                  : `/espacios/servicios?organization=${encodeURIComponent(spaceId)}&panel=1`
              }
              className={buttonVariants({ variant: "outline" })}
            >
              Abrir panel actual
            </Link>
          ) : null}
          <Link href="/pro" className={buttonVariants({ variant: "ghost" })}>
            Volver a Franky Pro
          </Link>
        </div>
      </section>
    </div>
  );
}
