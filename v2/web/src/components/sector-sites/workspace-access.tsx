"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, LogIn } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase-client";
import type { ProVerticalId } from "@/lib/pro/types";
import {
  loadSectorWorkspaces,
  sectorWorkspaceHref,
  type SectorWorkspace,
} from "@/lib/sector-workspace-access";

type Props = {
  vertical: ProVerticalId;
  sectorName: string;
  homeHref: string;
  accessHref: string;
};

export default function WorkspaceAccess(props: Props) {
  const { user, loading } = useSession();
  const startHref = `/pro/empezar?sector=${props.vertical}`;
  return (
    <section className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <Link
        href={props.homeHref}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft className="h-4 w-4" /> Volver a {props.sectorName}
      </Link>
      <p className="eyebrow mt-8">Tu espacio en Franky</p>
      <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold">
        Aquí empieza tu día.
      </h1>
      <p className="mt-4 max-w-xl text-text-muted">
        Accede con tu cuenta de Franky y abre el espacio que quieres gestionar.
      </p>
      <section
        className="mt-8 rounded-2xl border border-border bg-bg-primary p-5 sm:p-7"
        aria-label="Acceso a tus espacios"
      >
        {loading ? (
          <AccessLoading />
        ) : !user ? (
          <div className="space-y-5">
            <LogIn
              className="h-7 w-7 text-violet"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="font-heading text-xl font-bold">
              Entra con tu cuenta
            </h2>
            <p className="text-text-muted">
              Usa la misma cuenta que en la app. Verás los espacios de{" "}
              {props.sectorName.toLowerCase()} a los que pertenece tu equipo.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(props.accessHref)}`}
              className={buttonVariants({ variant: "dark", size: "lg" })}
            >
              Acceder <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <OwnedSpaces
            key={`${user.id}:${props.vertical}`}
            owner={user.id}
            vertical={props.vertical}
            startHref={startHref}
          />
        )}
      </section>
      <p className="mt-6 text-sm text-text-muted">
        ¿Todavía no formas parte?{" "}
        <Link
          href={startHref}
          className="font-semibold text-violet underline underline-offset-4"
        >
          Solicita la activación de tu espacio
        </Link>
        .
      </p>
    </section>
  );
}

function AccessLoading() {
  return (
    <div role="status" aria-label="Cargando tus espacios" className="space-y-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function OwnedSpaces({
  owner,
  vertical,
  startHref,
}: {
  owner: string;
  vertical: ProVerticalId;
  startHref: string;
}) {
  const [spaces, setSpaces] = useState<SectorWorkspace[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setSpaces(null);
    setError(false);
    const client = createClient();
    void (async () => {
      try {
        const { data, error: sessionError } = await client.auth.getUser();
        if (sessionError || data.user?.id !== owner)
          throw new Error("session_changed");
        const result = await loadSectorWorkspaces(client, vertical);
        const latest = await client.auth.getUser();
        if (latest.error || latest.data.user?.id !== owner)
          throw new Error("session_changed");
        if (alive) setSpaces(result);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [owner, vertical, attempt]);

  if (error)
    return (
      <div className="space-y-4" role="alert">
        <h2 className="font-heading text-xl font-bold">
          No hemos podido abrir tus espacios
        </h2>
        <p className="text-text-muted">
          Vuelve a intentarlo para consultar tus accesos actuales.
        </p>
        <Button variant="dark" onClick={() => setAttempt((value) => value + 1)}>
          Volver a intentar
        </Button>
        <Link href="/pro" className={buttonVariants({ variant: "ghost" })}>
          Ver todos mis espacios
        </Link>
      </div>
    );
  if (!spaces) return <AccessLoading />;
  if (!spaces.length)
    return (
      <EmptyState
        icon={Building2}
        title="Tu próximo espacio empieza aquí"
        description="Esta cuenta todavía no tiene un espacio de este sector. Solicita su activación o entra en tus otros espacios."
        action={{ href: startHref, label: "Solicitar activación" }}
        secondaryAction={{ href: "/pro", label: "Ver todos mis espacios" }}
        compact
      />
    );
  return (
    <div>
      <h2 className="font-heading text-xl font-bold">Elige tu espacio</h2>
      <ul className="mt-5 divide-y divide-border">
        {spaces.map((space) => (
          <li key={space.id}>
            <Link
              href={sectorWorkspaceHref(space)}
              className="group flex min-h-20 items-center justify-between gap-4 rounded-xl px-2 py-4 transition-colors hover:bg-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet"
            >
              <span className="min-w-0">
                <span className="block break-words font-semibold">
                  {space.name}
                </span>
                {space.city ? (
                  <span className="mt-1 block text-sm text-text-muted">
                    {space.city}
                  </span>
                ) : null}
              </span>
              <ArrowRight
                className="h-5 w-5 shrink-0 text-violet arrow-nudge"
                strokeWidth={1.75}
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
