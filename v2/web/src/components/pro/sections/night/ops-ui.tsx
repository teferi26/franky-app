"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Cake, Check, Clock3, MessageCircle, Mic2, Minimize2, MonitorPlay, NotebookPen, SkipForward, Star, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData, ProEvent, ProStaff } from "@/lib/pro/types";
import type { ProIncidentKind, ProNightOps } from "@/lib/pro/night-types";
import { atLocal, localDate, localMinutes, minutesToLabel, time } from "@/lib/pro/format";
import { countdown, nightOf } from "@/lib/pro/night";
import {
  INCIDENT_KINDS,
  birthdayInvite,
  karaokeNext,
  karaokeQueue,
  karaokeWait,
  nightForecast,
  nightOpsOf,
  offerWindows,
  releaseExpiredHolds,
  reviewAskMessage,
  reviewAskTargets,
  upcomingBirthdays,
  withNightOps,
} from "@/lib/pro/night-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { proCsvCell } from "@/lib/pro/csv";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, FixedPortal, FormField, Meter, Panel, RowList, inputClass, textareaClass } from "../../kit";
import { sectionHref } from "../../shell";

/* ------------------------------------------------------------------ */
/* Datos y utilidades                                                  */
/* ------------------------------------------------------------------ */

/** Operación de la noche y un atajo para cambiarla con `update`. */
export function useNightOps() {
  const { data, update } = usePro();
  const ops = nightOpsOf(data);
  const setOps = React.useCallback(
    (label: string, fn: (ops: ProNightOps) => ProNightOps) => update(label, (d) => withNightOps(d, fn)),
    [update],
  );
  return { ops, setOps };
}

/** "12,50" o "12.5" en céntimos; vacío o texto raro es 0. */
export function euros(value: string): number {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Céntimos a texto editable ("12,5"). */
export function eurosInput(cents: number): string {
  return String(cents / 100).replace(".", ",");
}

/** Descarga un CSV con separador ; y BOM para que Excel respete las tildes. */
export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(proCsvCell).join(";")).join("\n");
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Enlace de WhatsApp sin destinatario: quien lo abre elige el chat o el grupo. */
export function whatsAppShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Personas que pueden firmar algo (cierre, recuento, incidencia): primero el dueño y el encargado. */
export function signers(staff: ProStaff[]): ProStaff[] {
  const rank = (s: ProStaff) => (s.role === "owner" ? 0 : s.role === "manager" ? 1 : 2);
  return [...staff].filter((s) => s.role !== "rrpp").sort((a, b) => rank(a) - rank(b));
}

export function SignerChips({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { data } = usePro();
  const people = signers(data.staff);
  if (!people.length) {
    return (
      <input
        aria-label="Tu nombre"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tu nombre"
        className={inputClass}
      />
    );
  }
  return (
    <ChoiceChips
      value={value}
      onChange={onChange}
      options={people.map((s) => ({ value: s.name, label: s.name.split(" ")[0], hint: s.title }))}
    />
  );
}

/** Quién firma por defecto: el dueño (o la primera persona del equipo). */
export function defaultSigner(data: ProData): string {
  return signers(data.staff)[0]?.name ?? data.space.owner.name;
}

/** Libera los apartados sin señal que han caducado y avisa una vez. */
export function useReleaseExpiredHolds() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const expired = releaseExpiredHolds(data, now).released;
  const key = expired.map((z) => z.id).join(",");
  React.useEffect(() => {
    if (!key) return;
    void update("zone.release_expired", (d) => releaseExpiredHolds(d, new Date()).data);
    const names = expired.map((z) => z.name).join(", ");
    toast.info(
      expired.length === 1 ? `${names} vuelve a estar libre` : `${names} vuelven a estar libres`,
      "No llegó la señal a tiempo. Ya se pueden reservar.",
    );
    // Solo cuando cambian los apartados caducados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/* ------------------------------------------------------------------ */
/* Apuntar una incidencia                                              */
/* ------------------------------------------------------------------ */

const KIND_ORDER: ProIncidentKind[] = [
  "pelea",
  "expulsion",
  "sanitaria",
  "vecinos",
  "policia",
  "reclamacion",
  "objeto",
  "otro",
];

export function IncidentDrawer({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event?: ProEvent | null;
}) {
  const { data, now } = usePro();
  const { setOps } = useNightOps();
  const toast = useToast();
  const [kind, setKind] = React.useState<ProIncidentKind>("pelea");
  const [description, setDescription] = React.useState("");
  const [at, setAt] = React.useState("");
  const [by, setBy] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setKind("pelea");
    setDescription("");
    setAt(minutesToLabel(localMinutes(new Date())));
    setBy(defaultSigner(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const night = event?.date ?? nightOf(now);
  const valid = description.trim().length > 3 && Boolean(by.trim());

  const save = () => {
    const [h, m] = at.split(":").map(Number);
    const minute = (h || 0) * 60 + (m || 0);
    // De madrugada la hora pertenece al día siguiente de la noche.
    const iso = minute < 12 * 60 ? atLocal(addDay(night), minute) : atLocal(night, minute);
    void setOps("incident.create", (ops) => ({
      ...ops,
      incidents: [
        ...ops.incidents,
        {
          id: localId("in"),
          night,
          eventId: event?.id,
          at: iso,
          kind,
          description: description.trim(),
          by: by.trim(),
        },
      ],
    }));
    toast.success("Incidencia apuntada", `${INCIDENT_KINDS[kind].label} a las ${at}, por ${by.split(" ")[0]}.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Apuntar incidencia"
      description={event ? `${event.name}, noche del ${localDateLabel(night)}` : `Noche del ${localDateLabel(night)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            <NotebookPen className="h-4 w-4" /> Guardar en el libro
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Qué ha pasado">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={KIND_ORDER.map((k) => ({ value: k, label: INCIDENT_KINDS[k].label }))}
          />
        </FormField>
        <FormField label="Detalle" htmlFor="inc-desc" hint="Quién, dónde y qué se hizo. Sin juicios: lo que viste.">
          <textarea
            id="inc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dos chicos se empujan en la barra. Iván los separa y uno sale."
            className={textareaClass}
          />
        </FormField>
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
          <FormField label="Hora" htmlFor="inc-at">
            <input id="inc-at" type="time" value={at} onChange={(e) => setAt(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Lo apunta">
            <SignerChips value={by} onChange={setBy} />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}

function addDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function localDateLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------ */
/* Happy hour con reloj                                                */
/* ------------------------------------------------------------------ */

/** Precio especial activo ahora (o que empieza hoy), para que la barra no se equivoque. */
export function OfferClock({ className }: { className?: string }) {
  const { data, now } = usePro();
  const { active, later } = offerWindows(data, now);
  if (!active.length && !later.length) return null;
  const w = active[0] ?? later[0];
  const live = Boolean(active.length);
  return (
    <section
      className={cn(
        "rounded-2xl border p-4",
        live ? "border-violet/30 bg-violet-50" : "border-border bg-bg-primary",
        className,
      )}
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
        {live ? <span aria-hidden className="h-2 w-2 rounded-full bg-violet pro-live" /> : <Clock3 className="h-3.5 w-3.5" strokeWidth={1.9} />}
        {live ? "Precio activo ahora" : `Hoy a las ${time(w.startsAt)}`}
      </p>
      <p className="mt-1.5 font-heading text-lg font-bold tracking-[-0.01em]">{w.offer.title}</p>
      <p className="text-sm text-text-secondary">{w.offer.detail}</p>
      <p className={cn("mt-2 text-sm font-semibold", live ? "text-violet-deep" : "text-text-muted")}>
        {live
          ? `Hasta las ${time(w.endsAt)}, quedan ${countdown(now.getTime(), w.endsAt)}. Después vuelve el precio normal.`
          : `De ${time(w.startsAt)} a ${time(w.endsAt)}. La barra lo verá aquí al empezar.`}
      </p>
      {active.length > 1 ? (
        <p className="mt-1 text-xs text-text-muted">Y además: {active.slice(1).map((a) => a.offer.title).join(", ")}.</p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Previsión de la noche                                               */
/* ------------------------------------------------------------------ */

export function ForecastPanel({ event }: { event: ProEvent }) {
  const { data, now, spaceId } = usePro();
  const f = nightForecast(data, event, now);
  if (!f) {
    return (
      <Panel title="Previsión de la noche">
        <p className="text-sm text-text-muted">
          Cuando cierres tu primera noche, Franky calculará cuánta gente esperar con lo que de verdad vino.
        </p>
      </Panel>
    );
  }
  const short = f.plannedBar < f.bartenders;
  return (
    <Panel
      title="Previsión de la noche"
      description={`Con lo que vino en ${f.basis === 1 ? "la última noche" : `las últimas ${f.basis} noches`} de ${f.basisLabel}.`}
    >
      <div className="flex items-baseline gap-2">
        <TrendingUp className="h-4 w-4 self-center text-violet" strokeWidth={1.9} />
        <span className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{f.expected}</span>
        <span className="text-sm text-text-muted">personas de {event.capacity}</span>
      </div>
      <Meter value={f.expected} max={event.capacity} className="mt-2" />
      <ul className="mt-3 space-y-1 text-xs text-text-muted">
        <li>
          Vienen el {f.showTicketPct} % de quien compra y el {f.showListPct} % de la lista.
        </li>
        {f.walkIns || f.door ? (
          <li>
            Suelen sumarse {f.walkIns + f.door} en puerta sin entrada previa.
          </li>
        ) : null}
        <li>
          La última, {f.last.name}: {f.last.inside} dentro.
        </li>
      </ul>
      <div className={cn("mt-3 rounded-xl px-3 py-2.5 text-sm", short ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "bg-bg-secondary")}>
        <span className="font-semibold">
          {f.bartenders} {f.bartenders === 1 ? "persona" : "personas"} en barra
        </span>{" "}
        con tu regla de una cada {nightOpsOf(data).settings.peoplePerBartender} clientes.{" "}
        {short
          ? `En Turnos tienes ${f.plannedBar}.`
          : `En Turnos tienes ${f.plannedBar}: vas bien.`}
      </div>
      {short ? (
        <Link href={sectionHref(spaceId, "cuadrante")} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
          Completar turnos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cumpleaños de la semana                                             */
/* ------------------------------------------------------------------ */

export function BirthdaysPanel({ limit = 5 }: { limit?: number }) {
  const { data, now } = usePro();
  const list = upcomingBirthdays(data.clients, now, 7);
  if (!list.length) return null;
  const today = localDate(now);
  return (
    <Panel
      title="Cumplen años esta semana"
      description="Clientes que aceptan tus mensajes. Invítales a celebrarlo con un reservado."
      flush
    >
      <RowList>
        {list.slice(0, limit).map(({ client, date, inDays, turns }) => {
          const href = customerWhatsApp(client.phone, birthdayInvite(client, data.space, turns));
          return (
            <div key={client.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={client.name} size="sm" tone="violet" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  <Cake className="h-3.5 w-3.5 shrink-0 text-violet" strokeWidth={1.9} />
                  {client.name}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {date === today ? "Hoy" : inDays === 1 ? "Mañana" : `En ${inDays} días`}
                  {turns ? `, cumple ${turns}` : ""}
                  {client.visits ? ` · ${client.visits} ${client.visits === 1 ? "visita" : "visitas"}` : ""}
                </span>
              </span>
              {href ? (
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Invitar a ${client.name} por WhatsApp`}>
                    <MessageCircle className="h-3.5 w-3.5" /> Invitar
                  </a>
                </Button>
              ) : null}
            </div>
          );
        })}
      </RowList>
      {list.length > limit ? (
        <p className="border-t border-border-light px-4 py-2.5 text-xs text-text-muted sm:px-5">Y {list.length - limit} más esta semana.</p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Opiniones al día siguiente                                          */
/* ------------------------------------------------------------------ */

/**
 * Al día siguiente de una noche, los clientes que vinieron y aceptan mensajes.
 * Cada petición se apunta al tocarla para no repetirla.
 */
export function ReviewAskPanel({ limit = 5 }: { limit?: number }) {
  const { data, now } = usePro();
  const { setOps } = useNightOps();
  const { night, event, clients, asked } = reviewAskTargets(data, now);
  if (!night || (!clients.length && !asked)) return null;
  const where = event ? `a ${event.name}` : "anoche";

  const mark = (clientId: string) =>
    void setOps("review.ask", (ops) => ({
      ...ops,
      reviewAsks: [
        ...(ops.reviewAsks ?? []),
        { id: localId("ra"), clientId, night, eventId: event?.id, at: new Date().toISOString() },
      ],
    }));

  return (
    <Panel
      title="Pide su opinión"
      description={
        clients.length
          ? `${clients.length} ${clients.length === 1 ? "cliente vino" : "clientes vinieron"} ${where} y aceptan tus mensajes. Hoy es el mejor día para pedírsela.`
          : `Ya se la has pedido a los ${asked} que vinieron ${where}.`
      }
      flush
    >
      {clients.length ? (
        <RowList>
          {clients.slice(0, limit).map((client) => {
            const href = customerWhatsApp(client.phone, reviewAskMessage(client, data.space, event));
            return (
              <div key={client.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={client.name} size="sm" tone="violet" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{client.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {client.visits} {client.visits === 1 ? "visita" : "visitas"}
                    {client.student?.university ? ` · ${client.student.university}` : ""}
                  </span>
                </span>
                {href ? (
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => mark(client.id)}
                      aria-label={`Pedir opinión a ${client.name} por WhatsApp`}
                    >
                      <Star className="h-3.5 w-3.5" /> Pedir
                    </a>
                  </Button>
                ) : null}
              </div>
            );
          })}
        </RowList>
      ) : (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted sm:px-5">
          <Check className="h-4 w-4 text-emerald-600" strokeWidth={1.9} /> Todas las peticiones enviadas.
        </p>
      )}
      {clients.length > limit ? (
        <p className="border-t border-border-light px-4 py-2.5 text-xs text-text-muted sm:px-5">Y {clients.length - limit} más.</p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cola del karaoke                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cola del karaoke de una noche: quién canta, quién va después y un botón
 * para pasar a la siguiente. La pantalla grande enseña lo mismo en la tele.
 */
export function KaraokePanel({ event }: { event: ProEvent }) {
  const { setOps, ops } = useNightOps();
  const toast = useToast();
  const [singer, setSinger] = React.useState("");
  const [song, setSong] = React.useState("");
  const [screen, setScreen] = React.useState(false);
  const { singing, waiting, done } = karaokeQueue(ops, event.id);

  React.useEffect(() => {
    if (!screen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setScreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const add = () => {
    if (!singer.trim() || !song.trim()) return;
    void setOps("karaoke.add", (o) => ({
      ...o,
      karaoke: [
        ...(o.karaoke ?? []),
        { id: localId("kk"), eventId: event.id, singer: singer.trim(), song: song.trim(), at: new Date().toISOString(), status: "waiting" },
      ],
    }));
    toast.success(`${singer.trim()} a la cola`, `Le toca en unos ${karaokeWait(waiting.length + (singing ? 1 : 0))} minutos.`);
    setSinger("");
    setSong("");
  };

  const next = () => {
    void setOps("karaoke.next", (o) => karaokeNext(o, event.id));
    if (waiting[0]) toast.success(`Ahora canta ${waiting[0].singer}`, waiting[0].song);
  };

  const remove = (id: string) => void setOps("karaoke.remove", (o) => ({ ...o, karaoke: (o.karaoke ?? []).filter((s) => s.id !== id) }));

  return (
    <Panel
      title="Cola del karaoke"
      description={`${waiting.length} en cola${done ? ` y ${done} ya han cantado` : ""}. Por orden de llegada.`}
      action={
        <Button variant="ghost" size="sm" onClick={() => setScreen(true)}>
          <MonitorPlay className="h-3.5 w-3.5" /> Pantalla
        </Button>
      }
      flush
    >
      <div className="border-b border-border-light px-4 py-4 sm:px-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
          <Mic2 className="h-3.5 w-3.5" strokeWidth={1.9} /> {singing ? "Cantando ahora" : "Nadie en el micro"}
        </p>
        {singing ? (
          <>
            <p className="mt-1 font-heading text-2xl font-extrabold tracking-[-0.02em]">{singing.singer}</p>
            <p className="text-sm text-text-secondary">{singing.song}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-text-muted">{waiting.length ? "Da paso al primero de la cola." : "Apunta a quien quiera cantar."}</p>
        )}
        <Button variant="dark" size="sm" className="mt-3" onClick={next} disabled={!singing && !waiting.length}>
          <SkipForward className="h-3.5 w-3.5" /> {waiting.length ? `Siguiente: ${waiting[0].singer.split(" ")[0]}` : "Terminar la canción"}
        </Button>
      </div>
      {waiting.length ? (
        <RowList>
          {waiting.slice(0, 8).map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="w-5 shrink-0 text-center text-xs font-bold text-text-muted tabular">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.singer}</span>
                <span className="block truncate text-xs text-text-muted">
                  {s.song} · unos {karaokeWait(i + (singing ? 1 : 0))} min
                </span>
              </span>
              <button
                type="button"
                aria-label={`Quitar a ${s.singer} de la cola`}
                onClick={() => remove(s.id)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" strokeWidth={1.9} />
              </button>
            </div>
          ))}
        </RowList>
      ) : null}
      <div className="grid gap-2 border-t border-border-light px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-5">
        <input aria-label="Quién canta" value={singer} onChange={(e) => setSinger(e.target.value)} placeholder="Quién canta" className={inputClass} />
        <input
          aria-label="Canción"
          value={song}
          onChange={(e) => setSong(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Canción"
          className={inputClass}
        />
        <Button variant="outline" onClick={add} disabled={!singer.trim() || !song.trim()}>
          Apuntar
        </Button>
      </div>
      {screen ? (
        <FixedPortal>
          <div role="dialog" aria-modal="true" aria-label="Pantalla del karaoke" className="fixed inset-0 z-[60] flex flex-col bg-bg-dark p-8 text-white sm:p-14">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">{event.name}</p>
              <Button variant="glass" size="icon" onClick={() => setScreen(false)} aria-label="Cerrar la pantalla">
                <Minimize2 className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-lg font-semibold text-white/60">{singing ? "Cantando ahora" : "Apúntate en la barra"}</p>
              <p className="mt-2 font-heading text-6xl font-extrabold leading-none tracking-[-0.04em] sm:text-8xl">{singing?.singer ?? "Karaoke"}</p>
              {singing ? <p className="mt-4 text-2xl text-white/80 sm:text-4xl">{singing.song}</p> : null}
            </div>
            {waiting.length ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Después</p>
                <ol className="mt-3 grid gap-2 sm:grid-cols-3">
                  {waiting.slice(0, 3).map((s, i) => (
                    <li key={s.id} className="rounded-2xl border border-white/15 p-4">
                      <span className="text-sm text-white/50 tabular">{i + 1}</span>
                      <span className="block truncate font-heading text-xl font-bold">{s.singer}</span>
                      <span className="block truncate text-sm text-white/70">{s.song}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </FixedPortal>
      ) : null}
    </Panel>
  );
}

/** Descuadres: la lógica vive en shared/pro/night-ops para que la app nativa cuente igual. */
export { diffLabel, diffTone } from "@/lib/pro/night-ops";
