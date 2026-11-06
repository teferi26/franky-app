"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, DoorOpen, UserRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { inputClass } from "@/components/pro/kit";
import { findDemoBySlug, readDemo, writeDemo } from "@/lib/pro/demo-bridge";
import type { ProData, ProVerticalId } from "@/lib/pro/types";
import { localDate, time } from "@/lib/pro/format";
import { sessionsOn } from "@/lib/pro/classes";
import { firstName } from "@/lib/pro/classes-care";
import { doorCheckIn, doorSessions, type DoorOutcome } from "@/lib/pro/classes-growth";
import { cn } from "@/lib/utils";

/**
 * Lo que ve quien escanea el QR de la puerta de una sala. En los negocios de
 * demostración la llegada aparece al momento en la app del negocio (mismo
 * almacenamiento de la sesión). En un negocio real se registra con la cuenta
 * de Franky de quien entra, contra su reserva de ahora.
 */

type Result = { tone: "ok" | "warn"; title: string; body: string; showBooking?: boolean };

export default function DoorCheckin({ slug, room }: { slug: string; room?: string }) {
  const [demo, setDemo] = React.useState<
    { vertical: ProVerticalId; data: ProData } | null | undefined
  >(undefined);

  React.useEffect(() => {
    // El almacenamiento de la demo solo existe en el navegador.
    setDemo(findDemoBySlug(slug));
  }, [slug]);

  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg-secondary px-4 py-10 sm:items-center">
      <section className="w-full max-w-md rounded-3xl border border-border bg-bg-primary p-6 shadow-card sm:p-7">
        {demo === undefined ? (
          <div className="h-56 rounded-2xl skeleton-shimmer" />
        ) : demo ? (
          <DemoDoor vertical={demo.vertical} initial={demo.data} room={room} slug={slug} />
        ) : (
          <RealDoor slug={slug} room={room} />
        )}
      </section>
    </main>
  );
}

function Heading({ place, room }: { place: string; room?: string }) {
  return (
    <header>
      <p className="eyebrow flex items-center gap-1.5">
        <DoorOpen className="h-3.5 w-3.5" strokeWidth={1.9} /> Entrada{room ? `, ${room}` : ""}
      </p>
      <h1 className="mt-2 font-heading text-[1.7rem] font-extrabold leading-tight tracking-[-0.025em]">
        {place}
      </h1>
    </header>
  );
}

function ResultView({
  result,
  slug,
  onBack,
}: {
  result: Result;
  slug: string;
  onBack?: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col items-center text-center" role="status">
      {result.tone === "ok" ? (
        <CheckCircle2 className="h-12 w-12 text-emerald-600" strokeWidth={1.6} />
      ) : (
        <CalendarClock className="h-12 w-12 text-amber-600" strokeWidth={1.6} />
      )}
      <p className="mt-4 font-heading text-2xl font-extrabold tracking-[-0.02em]">{result.title}</p>
      <p className="mt-2 max-w-xs text-text-muted">{result.body}</p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {result.showBooking ? (
          <Link
            href={`/n/${encodeURIComponent(slug)}`}
            className={buttonVariants({ variant: "dark" })}
          >
            Ver clases y reservar
          </Link>
        ) : null}
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            Registrar a otra persona
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Demo: se escribe en la app del negocio                              */
/* ------------------------------------------------------------------ */

function DemoDoor({
  vertical,
  initial,
  room,
  slug,
}: {
  vertical: ProVerticalId;
  initial: ProData;
  room?: string;
  slug: string;
}) {
  const [data, setData] = React.useState(initial);
  const [now] = React.useState(() => new Date());
  const sessions = doorSessions(data, now, room);
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const typeName = (id: string) => {
    const s = data.sessions.find((x) => x.id === id);
    return data.classTypes.find((c) => c.id === s?.classTypeId)?.name ?? "la clase";
  };

  const later = sessionsOn(data, localDate(now)).find(
    (s) => new Date(s.start).getTime() > now.getTime() && (!room || s.room === room),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) return;
    // Se lee lo último guardado: la app del negocio puede haber cambiado algo.
    const at = new Date();
    const res = doorCheckIn(
      readDemo(vertical, at),
      sessionId,
      name,
      at,
      `ci-${at.getTime().toString(36)}`,
    );
    writeDemo(vertical, res.data, at);
    setData(res.data);
    const outcome: DoorOutcome = res.outcome;
    const matched = res.matched ?? name.trim();
    const who = firstName(matched);
    const when = `${typeName(s.id)} de las ${time(s.start)}`;
    if (outcome === "ambiguous") {
      setError("Hay más de una persona con ese nombre. Escribe también tu apellido.");
      return;
    }
    setError(null);
    if (outcome === "booked")
      setResult({ tone: "ok", title: `¡Dentro, ${who}!`, body: `${when}. Que vaya genial.` });
    else if (outcome === "walkin")
      setResult({
        tone: "ok",
        title: `¡Dentro, ${who}!`,
        body: `No tenías reserva y quedaba plaza: te hemos apuntado a ${when}.`,
      });
    else if (outcome === "already")
      setResult({
        tone: "ok",
        title: "Ya estabas dentro",
        body: `Tu llegada a ${when} ya constaba.`,
      });
    else if (outcome === "full")
      setResult({
        tone: "warn",
        title: "La clase está completa",
        body: "Habla con el monitor: a veces alguien con reserva no viene.",
      });
    else
      setResult({
        tone: "warn",
        title: "Esta clase ya no admite entradas",
        body: "Mira la siguiente en la ficha del centro.",
        showBooking: true,
      });
  };

  if (result)
    return (
      <>
        <Heading place={data.space.name} room={room} />
        <ResultView
          result={result}
          slug={slug}
          onBack={() => {
            setResult(null);
            setName("");
          }}
        />
      </>
    );

  return (
    <>
      <Heading place={data.space.name} room={room} />
      {sessions.length ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          {sessions.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-[0.82rem] font-semibold">¿A qué clase vienes?</legend>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === sessionId}
                  onClick={() => setSessionId(s.id)}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm transition-colors",
                    s.id === sessionId
                      ? "border-violet bg-violet-50 text-violet-deep"
                      : "border-border text-text-secondary",
                  )}
                >
                  <span className="font-semibold">{typeName(s.id)}</span>
                  <span className="tabular">{time(s.start)}</span>
                </button>
              ))}
            </fieldset>
          ) : (
            <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm">
              <span className="font-semibold">{typeName(sessions[0].id)}</span> de las{" "}
              {time(sessions[0].start)}
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.82rem] font-semibold">Tu nombre y apellido</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Como en tu reserva"
              aria-invalid={Boolean(error)}
              required
            />
            {error ? (
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {error}
              </span>
            ) : null}
          </label>
          <Button type="submit" variant="dark" size="lg" disabled={!name.trim()}>
            Registrar mi llegada
          </Button>
        </form>
      ) : (
        <div className="mt-6 flex flex-col items-center text-center">
          <CalendarClock className="h-10 w-10 text-text-muted" strokeWidth={1.6} />
          <p className="mt-3 font-heading text-lg font-bold">
            Ahora no hay ninguna clase para entrar
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {later
              ? `La siguiente es ${typeName(later.id)} a las ${time(later.start)}. Se abre la entrada media hora antes.`
              : "Hoy ya no quedan clases en esta sala."}
          </p>
          <Link
            href={`/n/${encodeURIComponent(slug)}`}
            className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
          >
            Ver horario
          </Link>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Negocio real: con la cuenta de quien entra                          */
/* ------------------------------------------------------------------ */

type RealOutcome = "booked" | "already" | "no_booking" | "bundle_empty" | "unknown";

function RealDoor({ slug, room }: { slug: string; room?: string }) {
  const { user, loading } = useSession();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const here = `/n/${encodeURIComponent(slug)}/entrada${room ? `?sala=${encodeURIComponent(room)}` : ""}`;

  const checkIn = async () => {
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc("pro_class_door_checkin", {
        p_slug: slug,
        p_room: room ?? null,
      });
      const outcome = (data as { outcome?: RealOutcome; starts_at?: string } | null)?.outcome;
      const startsAt = (data as { starts_at?: string } | null)?.starts_at;
      if (error || !outcome) {
        setResult({
          tone: "warn",
          title: "No hemos podido registrarte",
          body: "Díselo al monitor al entrar y te apunta él.",
        });
      } else if (outcome === "booked" || outcome === "already") {
        setResult({
          tone: "ok",
          title: outcome === "booked" ? "¡Dentro!" : "Ya estabas dentro",
          body: startsAt
            ? `Tu clase de las ${time(startsAt)} ya cuenta tu llegada.`
            : "Tu llegada ya consta.",
        });
      } else if (outcome === "no_booking") {
        setResult({
          tone: "warn",
          title: "No vemos tu reserva de ahora",
          body: "Resérvala en la ficha del centro o díselo al monitor.",
          showBooking: true,
        });
      } else if (outcome === "bundle_empty") {
        setResult({
          tone: "warn",
          title: "Tu bono no tiene sesiones",
          body: "Renuévalo en recepción antes de entrar.",
        });
      } else {
        setResult({
          tone: "warn",
          title: "No encontramos este centro",
          body: "Revisa el QR o pregunta en recepción.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Heading place="Registrar tu llegada" room={room} />
      {result ? (
        <ResultView result={result} slug={slug} />
      ) : loading ? (
        <div className="mt-6 h-24 rounded-2xl skeleton-shimmer" />
      ) : user ? (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-text-muted">
            Buscamos tu reserva de ahora y la marcamos como llegada. Sin esperar a que pasen lista.
          </p>
          <Button variant="dark" size="lg" onClick={checkIn} disabled={busy}>
            {busy ? "Registrando" : "Registrar mi llegada"}
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <p className="flex items-start gap-2 text-text-muted">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
            Entra con tu cuenta de Franky, la misma con la que reservaste.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(here)}`}
            className={buttonVariants({ variant: "dark", size: "lg" })}
          >
            Entrar
          </Link>
        </div>
      )}
    </>
  );
}
