"use client";

import * as React from "react";
import { BadgeCheck, CalendarDays, Heart, Plus, Repeat2, Sparkles, Trash2, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData, ProEvent, ProGuest, ToneKey } from "@/lib/pro/types";
import { addDays, atLocal, dayLabel, localDate, minutesToLabel, money, pct, shortDay, time } from "@/lib/pro/format";
import {
  FRANKY_TICKET_FEE,
  PHASE_LABEL,
  activeTier,
  crushStats,
  eventPhase,
  eventStats,
  guestsOf,
  nightOf,
  promoterTotals,
  shortUni,
  tierState,
  type EventPhase,
} from "@/lib/pro/night";
import { applyRepeatWeekly, isKaraokeNight, nightDateNotes, repeatPreview } from "@/lib/pro/night-ops";
import { KaraokePanel } from "./ops-ui";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, Meter, Pill, RowList, SearchInput, Segmented, Tip, inputClass } from "../../kit";
import { TONES, TONE_ORDER } from "../../tones";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";

/* ------------------------------------------------------------------ */
/* Cartel y estados                                                    */
/* ------------------------------------------------------------------ */

/** Cartel del evento: color propio, día y mes. Sin imágenes externas. */
export function Poster({ event, size = "md", className }: { event: ProEvent; size?: "sm" | "md" | "lg"; className?: string }) {
  const d = new Date(event.doorsOpen);
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
  const month = d.toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" }).replace(".", "");
  const sizes = { sm: "h-12 w-12 rounded-xl", md: "h-16 w-16 rounded-2xl", lg: "h-24 w-24 rounded-3xl" };
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 flex-col items-center justify-center overflow-hidden text-white",
        TONES[event.poster].bar,
        event.status === "draft" && "opacity-60",
        sizes[size],
        className,
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1/3 bg-black/15" />
      <span className={cn("relative font-heading font-extrabold leading-none tabular", size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-lg")}>{day}</span>
      <span className={cn("relative font-semibold uppercase tracking-wider", size === "sm" ? "text-[0.55rem]" : "text-[0.65rem]")}>{month}</span>
    </span>
  );
}

export function PhasePill({ phase }: { phase: EventPhase }) {
  const tone = phase === "live" ? "success" : phase === "today" ? "violet" : phase === "draft" ? "warning" : phase === "past" ? "neutral" : "info";
  return (
    <Pill tone={tone}>
      {phase === "live" ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500 pro-live" /> : null}
      {PHASE_LABEL[phase]}
    </Pill>
  );
}

export function eventWhen(ev: ProEvent): string {
  return `${shortDay(ev.doorsOpen)} · ${time(ev.doorsOpen)} a ${time(ev.closes)}`;
}

/** Tramos con su barra de venta. El tramo activo se marca: el precio sube solo al agotarse. */
export function TierList({ event, now, compact }: { event: ProEvent; now: Date; compact?: boolean }) {
  if (!event.tiers.length) {
    return <p className="text-sm text-text-muted">Entrada libre. El aforo se cuenta en puerta.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {event.tiers.map((t) => {
        const state = tierState(t, event, now);
        const door = t.until === null;
        return (
          <li key={t.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("truncate font-semibold", state === "sold_out" || state === "closed" ? "text-text-muted" : "text-text-primary")}>{t.name}</span>
                <span className="font-heading font-bold tabular">{money(t.priceCents)}</span>
                {state === "active" ? <Pill tone="violet">A la venta</Pill> : null}
                {state === "sold_out" ? <Pill>Agotada</Pill> : null}
                {state === "closed" && !compact ? <Pill>Cerrada</Pill> : null}
              </span>
              <span className="shrink-0 text-xs text-text-muted tabular">
                {t.sold}/{t.quantity}
              </span>
            </div>
            <Meter value={t.sold} max={t.quantity} className="mt-1.5" tone={state === "sold_out" ? "success" : "violet"} />
            {!compact ? (
              <p className="mt-1 text-xs text-text-muted">
                {door ? "Se vende en la puerta" : t.until ? `Hasta ${shortDay(t.until)}, ${time(t.until)} o hasta agotar` : "Hasta agotar"}
                {t.includes ? ` · ${t.includes}` : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function priceNowLabel(event: ProEvent, now: Date): string | null {
  const tier = activeTier(event, now);
  if (!tier) return null;
  const idx = event.tiers.findIndex((t) => t.id === tier.id);
  const next = event.tiers[idx + 1];
  const left = tier.quantity - tier.sold;
  return next
    ? `Ahora ${money(tier.priceCents)}. Sube a ${money(next.priceCents)} ${left <= 40 ? `en ${left} entradas` : tier.until ? `el ${shortDay(tier.until)}` : "al agotarse"}.`
    : `Ahora ${money(tier.priceCents)} en ${tier.until === null ? "taquilla" : "venta online"}.`;
}

export function guestLabel(g: ProGuest): string {
  if (g.kind === "list") return "Lista";
  if (g.kind === "reserved") return g.tierName ? `Reservado ${g.tierName}` : "Reservado";
  return g.tierName ?? "Entrada";
}

export function promoterName(data: ProData, id?: string): string | null {
  if (!id) return null;
  return data.promoters.find((p) => p.id === id)?.name ?? null;
}

/* ------------------------------------------------------------------ */
/* Detalle de un evento                                                */
/* ------------------------------------------------------------------ */

type GuestFilter = "all" | "ticket" | "list" | "reserved";

export function EventDrawer({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const [filter, setFilter] = React.useState<GuestFilter>("all");
  const [q, setQ] = React.useState("");
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const ev = eventId ? data.events.find((e) => e.id === eventId) : undefined;

  React.useEffect(() => {
    setFilter("all");
    setQ("");
  }, [eventId]);

  if (!ev) return <Drawer open={false} onOpenChange={() => onClose()} title="Evento">{null}</Drawer>;

  const phase = eventPhase(ev, now);
  const stats = eventStats(data, ev);
  const guests = guestsOf(data, ev.id);
  const shown = guests
    .filter((g) => filter === "all" || g.kind === filter)
    .filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? "") || a.name.localeCompare(b.name));
  const unis = guests.filter((g) => g.university).reduce<Record<string, number>>((acc, g) => {
    const k = shortUni(g.university);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const uniTotal = Object.values(unis).reduce((a, b) => a + b, 0);
  const promoterRows = data.promoters
    .map((p) => ({ p, t: promoterTotals(data, p, ev.id) }))
    .filter((x) => x.t.sold + x.t.list > 0)
    .sort((a, b) => b.t.scanned - a.t.scanned);
  const crush = crushStats(ev, stats.sold);
  const organizer = ev.organizer;

  const setEvent = (label: string, fn: (e: ProEvent) => ProEvent) =>
    update(label, (d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? fn(e) : e)) }));

  const footer =
    phase === "draft" ? (
      <>
        <Button
          variant="ghost"
          onClick={() => {
            update("event.delete", (d) => ({ ...d, events: d.events.filter((e) => e.id !== ev.id) }));
            toast.success("Borrador eliminado");
            onClose();
          }}
        >
          <Trash2 className="h-4 w-4" /> Eliminar
        </Button>
        <Button
          variant="dark"
          onClick={() => {
            setEvent("event.publish", (e) => ({ ...e, status: "on_sale" }));
            toast.success("Evento a la venta", "Ya aparece en Ocio para los estudiantes de Alicante.");
          }}
        >
          Poner a la venta
        </Button>
      </>
    ) : phase !== "past" ? (
      <Button
        variant="dark"
        onClick={() =>
          setOffer({
            what: `${ev.name}: entrada con copa`,
            date: ev.date,
            from: 23 * 60,
            to: 23 * 60 + 59,
            priceCents: activeTier(ev, now)?.priceCents ?? 1000,
            slots: 50,
          })
        }
      >
        <Zap className="h-4 w-4" /> Lanzar a estudiantes
      </Button>
    ) : null;

  return (
    <>
      <Drawer open={Boolean(ev)} onOpenChange={(v) => !v && onClose()} wide title={ev.name} description={eventWhen(ev)} footer={footer}>
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Poster event={ev} size="lg" />
            <div className="min-w-0">
              <PhasePill phase={phase} />
              {ev.lineup ? <p className="mt-2 text-sm text-text-secondary">{ev.lineup}</p> : null}
              <p className="mt-1 text-xs text-text-muted">
                Aforo {ev.capacity.toLocaleString("es-ES")} · +{ev.ageMin}
                {organizer ? ` · Con ${organizer}` : ""}
                {ev.listCutoff ? ` · Lista hasta las ${time(ev.listCutoff)}` : ""}
              </p>
            </div>
          </div>

          {phase === "past" ? (
            <section>
              <p className="eyebrow mb-2">Resultados</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Stat label="Vendidas" value={stats.sold} hint={`${stats.list} en lista`} />
                <Stat label="Pasaron por puerta" value={stats.inside} hint={`${pct(stats.inside, ev.capacity)} % del aforo`} />
                <Stat label="No vinieron" value={stats.noShows} hint="Con entrada o en lista" />
                <Stat label="Entradas" value={money(stats.revenueCents, { round: true })} hint="Íntegro para ti" />
                <Stat label="Estudiantes" value={`${pct(stats.students, Math.max(1, guests.filter((g) => g.kind === "ticket").length))} %`} hint="De las entradas" />
                <Stat label="Franky, 2,5 %" value={money(stats.frankyFeeCents, { round: true })} hint="Lo pagó el comprador" />
              </div>
              <Tip title="Cuentas claras" className="mt-3">
                Franky cobra un {Math.round(FRANKY_TICKET_FEE * 1000) / 10} % por entrada y lo paga quien la compra, encima del precio. De los{" "}
                {money(stats.revenueCents, { round: true })} de entradas no se descuenta nada: te llegan íntegros con tu cuota de {vertical.price.monthly} € al mes.
              </Tip>
            </section>
          ) : (
            <section>
              <div className="grid grid-cols-3 gap-2.5">
                <Stat label="Vendidas" value={stats.sold} hint={money(stats.revenueCents, { round: true })} />
                <Stat label="En lista" value={stats.list} hint={ev.listCutoff ? `Hasta ${time(ev.listCutoff)}` : "Sin corte"} />
                <Stat label="Dentro" value={stats.inside} hint={`de ${ev.capacity}`} />
              </div>
            </section>
          )}

          <section>
            <p className="eyebrow mb-3">Tramos</p>
            <TierList event={ev} now={now} />
            {priceNowLabel(ev, now) ? <p className="mt-3 text-sm font-medium text-violet-deep">{priceNowLabel(ev, now)}</p> : null}
          </section>

          {phase !== "past" ? (
            <section className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Heart className="h-4 w-4 text-violet" strokeWidth={1.9} /> Crush Live
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {ev.crushLive
                    ? `Pantallas de matches encendidas. ${crush.players} personas ya se han apuntado a jugar.`
                    : "Enciende las pantallas de matches: la gente se apunta desde Franky al entrar."}
                </p>
              </div>
              <Switch
                checked={ev.crushLive}
                aria-label="Activar Crush Live"
                onCheckedChange={(v) => {
                  setEvent("event.crush", (e) => ({ ...e, crushLive: v }));
                  toast.success(v ? "Crush Live activado" : "Crush Live apagado", v ? "Se enciende al abrir puertas." : undefined);
                }}
              />
            </section>
          ) : null}

          {phase !== "past" && phase !== "draft" ? <RepeatWeekly event={ev} /> : null}

          {phase !== "past" && phase !== "draft" && isKaraokeNight(data, ev) ? <KaraokePanel event={ev} /> : null}

          {uniTotal ? (
            <section>
              <p className="eyebrow mb-3">De dónde vienen</p>
              <div className="flex flex-col gap-2">
                {Object.entries(unis)
                  .sort((a, b) => b[1] - a[1])
                  .map(([u, n]) => (
                    <div key={u} className="flex items-center gap-3 text-sm">
                      <span className="w-12 shrink-0 font-semibold">{u}</span>
                      <Meter value={n} max={uniTotal} className="flex-1" />
                      <span className="w-20 shrink-0 text-right text-xs text-text-muted tabular">
                        {n} · {pct(n, uniTotal)} %
                      </span>
                    </div>
                  ))}
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs text-text-muted">
                <BadgeCheck className="h-3.5 w-3.5 text-violet" /> Estudiantes verificados en Franky
              </p>
            </section>
          ) : null}

          {promoterRows.length ? (
            <section>
              <p className="eyebrow mb-2">RRPP de esta noche</p>
              <div className="overflow-x-auto rounded-2xl border border-border pro-scroll">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border-light text-left text-xs text-text-muted">
                      <th className="px-3 py-2 font-medium">RRPP</th>
                      <th className="px-3 py-2 text-right font-medium">Vendidas</th>
                      <th className="px-3 py-2 text-right font-medium">Lista</th>
                      <th className="px-3 py-2 text-right font-medium">En puerta</th>
                      <th className="px-3 py-2 text-right font-medium">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoterRows.map(({ p, t }) => (
                      <tr key={p.id} className="border-b border-border-light last:border-0">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-right tabular">{t.sold}</td>
                        <td className="px-3 py-2 text-right tabular">{t.list}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular">{t.scanned}</td>
                        <td className="px-3 py-2 text-right tabular">{money(t.commissionCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section>
            <p className="eyebrow mb-2">Asistentes</p>
            <div className="flex flex-col gap-2">
              <Segmented<GuestFilter>
                size="sm"
                value={filter}
                onChange={setFilter}
                label="Tipo de asistente"
                options={[
                  { value: "all", label: "Todos", count: guests.length },
                  { value: "ticket", label: "Entradas", count: guests.filter((g) => g.kind === "ticket").length },
                  { value: "list", label: "Lista", count: stats.list },
                  { value: "reserved", label: "Reservados", count: stats.reserved },
                ]}
              />
              <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre" />
            </div>
            {shown.length ? (
              <RowList className="mt-2 rounded-2xl border border-border">
                {shown.slice(0, 40).map((g) => (
                  <div key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={g.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-semibold">
                        {g.name}
                        {g.university ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {guestLabel(g)}
                        {g.university ? ` · ${shortUni(g.university)}` : ""}
                        {promoterName(data, g.promoterId) ? ` · de ${promoterName(data, g.promoterId)?.split(" ")[0]}` : ""}
                      </span>
                    </span>
                    {g.checkedInAt ? (
                      <Pill tone="success">{time(g.checkedInAt)}</Pill>
                    ) : phase === "past" ? (
                      <Pill tone="danger">No vino</Pill>
                    ) : (
                      <Pill>Pendiente</Pill>
                    )}
                  </div>
                ))}
                {shown.length > 40 ? <p className="px-3 py-2.5 text-xs text-text-muted">Y {shown.length - 40} más. Busca por nombre para encontrar a alguien.</p> : null}
              </RowList>
            ) : (
              <Empty icon={Users} title="Nadie por aquí" body={q ? "No hay nadie con ese nombre." : "Cuando se venda la primera entrada aparecerá aquí."} className="py-6" />
            )}
          </section>
        </div>
      </Drawer>
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Repetir la noche cada semana                                        */
/* ------------------------------------------------------------------ */

const REPEAT_WEEKS = [
  { value: "4", label: "4 semanas" },
  { value: "8", label: "8 semanas" },
  { value: "12", label: "12 semanas", hint: "El cuatrimestre" },
];

/** Crea las próximas noches iguales con un toque, avisando de festivos y vísperas. */
function RepeatWeekly({ event }: { event: ProEvent }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [weeks, setWeeks] = React.useState("4");
  const preview = repeatPreview(data, event, Number(weeks));
  const fresh = preview.filter((p) => !p.exists);
  const weekday = new Date(`${event.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" });

  const repeat = () => {
    if (!fresh.length) return;
    // Se calcula sobre los datos del momento del cambio, no sobre los pintados.
    void update("event.repeat", (d) => applyRepeatWeekly(d, event, Number(weeks), (prefix) => localId(prefix)).data);
    const last = fresh[fresh.length - 1].date;
    toast.success(
      `${fresh.length} ${fresh.length === 1 ? "noche creada" : "noches creadas"}`,
      `${event.name} cada ${weekday} hasta el ${shortDay(atLocal(last, 12 * 60))}, con los mismos tramos y reservados.`,
    );
  };

  return (
    <section className="rounded-2xl border border-border p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Repeat2 className="h-4 w-4 text-violet" strokeWidth={1.9} /> Repetir cada {weekday}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">Mismos tramos, lista, aforo y reservados. Las ventas empiezan de cero.</p>
      <ChoiceChips value={weeks} onChange={setWeeks} options={REPEAT_WEEKS} className="mt-3" />
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {preview.map((p) => (
          <li key={p.date} className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.9} />
            <span className={cn("min-w-0 flex-1 truncate", p.exists && "text-text-muted line-through")}>
              {shortDay(atLocal(p.date, 12 * 60))}
            </span>
            {p.exists ? <Pill>Ya creada</Pill> : p.notes.length ? <Pill tone="warning">{p.notes[0]}</Pill> : null}
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-3 w-full sm:w-auto" onClick={repeat} disabled={!fresh.length}>
        <Repeat2 className="h-3.5 w-3.5" />
        {fresh.length ? `Crear ${fresh.length} ${fresh.length === 1 ? "noche" : "noches"}` : "Ya están todas creadas"}
      </Button>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border px-3 py-2.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-extrabold tabular">{value}</p>
      {hint ? <p className="truncate text-[0.7rem] text-text-muted">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo evento                                                        */
/* ------------------------------------------------------------------ */

type TierDraft = { key: string; name: string; price: string; quantity: string; door: boolean };

function toMinutes(v: string) {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function nextThursday(now: Date): string {
  const night = nightOf(now);
  const wd = (new Date(`${night}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(night, (3 - wd + 7) % 7 || 7);
}

export function NewEventDrawer({
  open,
  onClose,
  onCreated,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string, draft: boolean) => void;
  /** Fecha elegida desde el calendario de la noche. */
  initialDate?: string;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const club = data.space.vertical === "nightclub";
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState(nextThursday(now));
  const [doors, setDoors] = React.useState(club ? "23:30" : "22:00");
  const [closes, setCloses] = React.useState(club ? "06:00" : "02:30");
  const [capacity, setCapacity] = React.useState(String(data.events[0]?.capacity ?? (club ? 900 : 160)));
  const [ageMin, setAgeMin] = React.useState("18");
  const [cutoff, setCutoff] = React.useState(club ? "01:30" : "00:30");
  const [crush, setCrush] = React.useState(true);
  const [poster, setPoster] = React.useState<ToneKey>("violet");
  const [tiers, setTiers] = React.useState<TierDraft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setDate(initialDate ?? nextThursday(now));
    setPoster("violet");
    setCrush(true);
    setTiers(
      club
        ? [
            { key: "a", name: "Anticipada", price: "8", quantity: "250", door: false },
            { key: "b", name: "Segunda", price: "10", quantity: "300", door: false },
            { key: "c", name: "Taquilla", price: "12", quantity: "150", door: true },
          ]
        : [{ key: "a", name: "Entrada con copa", price: "6", quantity: "80", door: true }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doorsMin = toMinutes(doors);
  const at = (hhmm: string) => {
    const m = toMinutes(hhmm);
    return m > doorsMin ? atLocal(date, m) : atLocal(addDays(date, 1), m);
  };
  const valid = name.trim().length > 2 && date >= localDate(now) && Number(capacity) > 0;

  const create = (draft: boolean) => {
    const id = localId("ev");
    const ev: ProEvent = {
      id,
      name: name.trim(),
      date,
      doorsOpen: atLocal(date, doorsMin),
      closes: at(closes),
      capacity: Number(capacity),
      checkedIn: 0,
      tiers: tiers
        .filter((t) => t.name.trim())
        .map((t, i) => ({
          id: `${id}-t${i + 1}`,
          name: t.name.trim(),
          priceCents: Math.round(Number(t.price.replace(",", ".")) * 100) || 0,
          quantity: Math.max(1, Number(t.quantity) || 1),
          sold: 0,
          until: t.door ? null : atLocal(date, doorsMin),
        })),
      listCutoff: cutoff ? at(cutoff) : undefined,
      ageMin: Math.max(16, Number(ageMin) || 18),
      status: draft ? "draft" : "on_sale",
      crushLive: crush,
      poster,
      walkIns: 0,
    };
    update("event.create", (d) => ({ ...d, events: [...d.events, ev] }));
    toast.success(draft ? "Guardado como borrador" : "Evento a la venta", draft ? undefined : `${dayLabel(ev.doorsOpen)}. Ya lo ven los estudiantes en Ocio.`);
    onCreated?.(id, draft);
    onClose();
  };

  const setTier = (key: string, patch: Partial<TierDraft>) => setTiers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title="Nuevo evento"
      description="Tramos que suben solos, lista con hora de corte y Crush Live."
      footer={
        <>
          <Button variant="ghost" onClick={() => create(true)} disabled={!name.trim()}>
            Guardar borrador
          </Button>
          <Button variant="dark" onClick={() => create(false)} disabled={!valid}>
            Poner a la venta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="ne-name">
          <input id="ne-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={club ? "Jueves Universitario" : "Miércoles de karaoke"} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FormField label="Fecha" htmlFor="ne-date" className="col-span-2 sm:col-span-1">
            <input id="ne-date" type="date" value={date} min={localDate(now)} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            {nightDateNotes(date).length ? (
              <p className="mt-1 text-xs font-semibold text-violet-deep">{nightDateNotes(date).join(" · ")}</p>
            ) : null}
          </FormField>
          <FormField label="Puertas" htmlFor="ne-doors">
            <input id="ne-doors" type="time" step={900} value={doors} onChange={(e) => setDoors(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Cierre" htmlFor="ne-close">
            <input id="ne-close" type="time" step={900} value={closes} onChange={(e) => setCloses(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Aforo" htmlFor="ne-cap">
            <input id="ne-cap" type="number" min={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Edad mínima" htmlFor="ne-age">
            <input id="ne-age" type="number" min={16} max={30} inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Corte de lista" htmlFor="ne-cut">
            <input id="ne-cut" type="time" step={900} value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={inputClass} />
          </FormField>
        </div>

        <FormField label="Tramos de precio" hint="Cuando un tramo se agota o caduca, se abre el siguiente. La taquilla se vende en puerta.">
          <div className="flex flex-col gap-2">
            {tiers.map((t) => (
              <div key={t.key} className="grid grid-cols-[minmax(0,1fr)_68px_72px_36px] items-center gap-2">
                <input aria-label="Nombre del tramo" value={t.name} onChange={(e) => setTier(t.key, { name: e.target.value })} className={inputClass} />
                <input aria-label="Precio en euros" inputMode="decimal" value={t.price} onChange={(e) => setTier(t.key, { price: e.target.value })} className={cn(inputClass, "px-2 text-right")} />
                <input aria-label="Cantidad" inputMode="numeric" value={t.quantity} onChange={(e) => setTier(t.key, { quantity: e.target.value })} className={cn(inputClass, "px-2 text-right")} />
                <button
                  type="button"
                  aria-label={`Quitar tramo ${t.name}`}
                  onClick={() => setTiers((prev) => prev.filter((x) => x.key !== t.key))}
                  className="inline-flex h-10 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Nombre · € · Plazas</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTiers((prev) => [...prev, { key: localId("t"), name: `Tramo ${prev.length + 1}`, price: "10", quantity: "100", door: false }])}
              >
                <Plus className="h-3.5 w-3.5" /> Añadir tramo
              </Button>
            </div>
          </div>
        </FormField>

        <FormField label="Color del cartel">
          <div className="flex flex-wrap gap-2">
            {TONE_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`Color ${t}`}
                aria-pressed={poster === t}
                onClick={() => setPoster(t)}
                className={cn("h-10 w-10 rounded-xl ring-offset-2 ring-offset-bg-primary transition-shadow", TONES[t].bar, poster === t && "ring-2 ring-text-primary")}
              />
            ))}
          </div>
        </FormField>

        <label className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-violet" strokeWidth={1.9} /> Activar Crush Live
            </span>
            <span className="mt-0.5 block text-xs text-text-muted">Pantallas con los matches de la fiesta. Solo lo tiene tu sala.</span>
          </span>
          <Switch checked={crush} onCheckedChange={setCrush} aria-label="Activar Crush Live" />
        </label>

        {name.trim() ? (
          <div className="flex items-center gap-3 rounded-2xl bg-bg-secondary p-3">
            <Poster
              event={{ id: "x", name, date, doorsOpen: atLocal(date, doorsMin), closes: at(closes), capacity: 0, checkedIn: 0, tiers: [], ageMin: 18, status: "on_sale", crushLive: crush, poster }}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate font-heading font-bold">{name}</p>
              <p className="text-xs text-text-muted">
                {dayLabel(atLocal(date, doorsMin))} · {minutesToLabel(doorsMin)} · desde {money(Math.round(Number((tiers[0]?.price ?? "0").replace(",", ".")) * 100) || 0)}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

/** Fila de evento para listas (Hoy y Eventos). */
export function EventRow({ event, onClick }: { event: ProEvent; onClick: () => void }) {
  const { data, now } = usePro();
  const stats = eventStats(data, event);
  const phase = eventPhase(event, now);
  const sellable = event.tiers.reduce((a, t) => a + t.quantity, 0);
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5">
      <Poster event={event} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{event.name}</span>
          {event.crushLive ? <Heart className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Crush Live" /> : null}
        </span>
        <span className="block truncate text-xs text-text-muted">{eventWhen(event)}</span>
        {sellable ? <Meter value={stats.sold} max={sellable} className="mt-1.5 max-w-[220px]" /> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-heading text-base font-bold tabular">{phase === "past" ? stats.inside : stats.sold + stats.list}</span>
        <span className="block text-[0.7rem] text-text-muted">{phase === "past" ? "entraron" : "con entrada o lista"}</span>
      </span>
    </button>
  );
}
