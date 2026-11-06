"use client";

import * as React from "react";
import { CalendarDays, CalendarPlus, Heart, PartyPopper, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProEvent } from "@/lib/pro/types";
import { atLocal, money, pct, shortDay } from "@/lib/pro/format";
import { FRANKY_TICKET_FEE, eventPhase, eventStats, pastEvents, sortedEvents, upcomingEvents } from "@/lib/pro/night";
import { nightCalendar } from "@/lib/pro/night-ops";
import { cn } from "@/lib/utils";
import { Empty, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, RowList, Segmented, Tip } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { EventDrawer, NewEventDrawer, PhasePill, Poster, eventWhen, priceNowLabel } from "./night-ui";

type View = "upcoming" | "past" | "draft";

export default function NightEventos() {
  const { data, now } = usePro();
  const [view, setView] = React.useState<View>("upcoming");
  const [openEvent, setOpenEvent] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [createDate, setCreateDate] = React.useState<string | undefined>(undefined);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const upcoming = upcomingEvents(data, now);
  const past = pastEvents(data, now);
  const drafts = sortedEvents(data).filter((e) => e.status === "draft");
  const list = view === "upcoming" ? upcoming : view === "past" ? past : drafts;

  const upcomingSold = upcoming.reduce((a, e) => a + eventStats(data, e).sold, 0);
  const upcomingRevenue = upcoming.reduce((a, e) => a + eventStats(data, e).revenueCents, 0);
  const lastPast = past[0];
  const lastStats = lastPast ? eventStats(data, lastPast) : null;
  const pastAvgFill = past.length ? Math.round(past.reduce((a, e) => a + pct(e.checkedIn, e.capacity), 0) / past.length) : 0;
  const pastFee = past.reduce((a, e) => a + eventStats(data, e).frankyFeeCents, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Tus noches"
        title="Eventos"
        description={
          upcoming.length
            ? `${upcoming.length} ${upcoming.length === 1 ? "noche" : "noches"} a la venta con ${upcomingSold} entradas vendidas (${money(upcomingRevenue, { round: true })}). Los precios suben solos al agotarse cada tramo.`
            : "Crea tu próxima noche: tramos de precio, lista con hora de corte y Crush Live."
        }
        actions={
          <Button variant="dark" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo evento
          </Button>
        }
      />

      <KpiRow>
        <Kpi label="A la venta" value={upcoming.length} hint={`${drafts.length} en borrador`} />
        <Kpi label="Entradas vendidas" value={upcomingSold} hint="En las próximas noches" />
        <Kpi label="Última noche" value={lastStats ? lastStats.inside : "0"} hint={lastPast ? `${lastPast.name}, ${pct(lastPast.checkedIn, lastPast.capacity)} % de aforo` : "Aún sin noches"} />
        <Kpi label="Aforo medio" value={`${pastAvgFill} %`} hint={`${past.length} noches terminadas`} />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          value={view}
          onChange={setView}
          label="Qué eventos ver"
          options={[
            { value: "upcoming", label: "Próximos", count: upcoming.length },
            { value: "past", label: "Pasados", count: past.length },
            { value: "draft", label: "Borradores", count: drafts.length },
          ]}
        />
      </div>

      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((e, i) => (
            <EventCard
              key={e.id}
              event={e}
              index={i}
              onOpen={() => setOpenEvent(e.id)}
              onOffer={() =>
                setOffer({
                  what: `${e.name}: entrada con copa`,
                  date: e.date,
                  from: 23 * 60,
                  to: 23 * 60 + 59,
                  priceCents: e.tiers.find((t) => t.sold < t.quantity)?.priceCents ?? 1000,
                  slots: 50,
                })
              }
            />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            icon={view === "past" ? PartyPopper : CalendarPlus}
            title={view === "past" ? "Todavía no hay noches terminadas" : view === "draft" ? "No tienes borradores" : "No tienes noches a la venta"}
            body={
              view === "past"
                ? "Cuando cierres tu primera noche verás aquí vendidas, escaneadas, no presentados e ingresos."
                : "Crea el evento con una semana de margen: la anticipada se vende sola entre quienes ya dijeron que salen."
            }
            action={
              view !== "past" ? (
                <Button variant="dark" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> Nuevo evento
                </Button>
              ) : undefined
            }
          />
        </Panel>
      )}

      <NightCalendar
        onOpen={setOpenEvent}
        onCreate={(date) => {
          setCreateDate(date);
          setCreating(true);
        }}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Tip title="Precio que sube solo">
          Pon la anticipada barata y con pocas plazas. Cuando se agota, se abre la segunda sin que toques nada, y la taquilla queda para la puerta. Así la gente compra antes y sabes con días de margen cómo va la noche.
        </Tip>
        <Tip title="Cuentas claras">
          Franky cobra un {Math.round(FRANKY_TICKET_FEE * 1000) / 10} % por entrada y lo paga el comprador. En tus noches terminadas han sido {money(pastFee, { round: true })}, y a ti no se te ha descontado nada.
        </Tip>
      </div>

      <EventDrawer eventId={openEvent} onClose={() => setOpenEvent(null)} />
      <NewEventDrawer
        open={creating}
        initialDate={createDate}
        onClose={() => {
          setCreating(false);
          setCreateDate(undefined);
        }}
        onCreated={(_, draft) => setView(draft ? "draft" : "upcoming")}
      />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

function EventCard({ event, index, onOpen, onOffer }: { event: ProEvent; index: number; onOpen: () => void; onOffer: () => void }) {
  const { data, now } = usePro();
  const phase = eventPhase(event, now);
  const stats = eventStats(data, event);
  const sellable = event.tiers.reduce((a, t) => a + t.quantity, 0);
  const priceNow = priceNowLabel(event, now);

  return (
    <article
      className="animate-list-in flex flex-col rounded-2xl border border-border bg-bg-primary shadow-card transition-shadow hover:shadow-card-hover"
      style={{ "--i": index } as React.CSSProperties}
    >
      <button type="button" onClick={onOpen} className="flex items-start gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30 sm:p-5">
        <Poster event={event} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <PhasePill phase={phase} />
            {event.crushLive ? (
              <Pill tone="violet">
                <Heart className="h-3 w-3" /> Crush Live
              </Pill>
            ) : null}
          </span>
          <span className="mt-1.5 block truncate font-heading text-lg font-bold tracking-[-0.01em]">{event.name}</span>
          <span className="block truncate text-sm text-text-muted">{eventWhen(event)}</span>
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-3 border-t border-border-light px-4 py-3.5 sm:px-5">
        {phase === "past" ? (
          <div className="grid grid-cols-4 gap-2 text-center">
            <Figure label="Vendidas" value={stats.sold} />
            <Figure label="Entraron" value={stats.inside} />
            <Figure label="No vinieron" value={stats.noShows} />
            <Figure label="Ingresos" value={money(stats.revenueCents, { round: true })} />
          </div>
        ) : sellable ? (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>
                <span className="font-heading text-xl font-extrabold tabular">{stats.sold}</span>
                <span className="text-text-muted"> de {sellable} entradas</span>
              </span>
              <span className="text-xs text-text-muted tabular">{stats.list} en lista</span>
            </div>
            <div className="flex gap-1" aria-hidden>
              {event.tiers.map((t) => (
                <div key={t.id} className="min-w-0" style={{ flex: t.quantity }}>
                  <Meter value={t.sold} max={t.quantity} tone={t.sold >= t.quantity ? "success" : "violet"} />
                  <p className="mt-1 truncate text-[0.68rem] text-text-muted">
                    {t.name} · {money(t.priceCents)}
                  </p>
                </div>
              ))}
            </div>
            {priceNow ? <p className="text-xs font-medium text-violet-deep">{priceNow}</p> : null}
          </>
        ) : (
          <p className="text-sm text-text-muted">
            Entrada libre{stats.list ? ` · ${stats.list} en lista` : ""}. Aforo de {event.capacity}, se cuenta en puerta.
          </p>
        )}
      </div>

      {phase !== "past" && phase !== "draft" ? (
        <div className={cn("flex items-center justify-between gap-2 border-t border-border-light px-4 py-2.5 sm:px-5")}>
          <span className="text-xs text-text-muted">{pct(stats.students, Math.max(1, stats.sold))} % estudiantes verificados</span>
          <Button variant="secondary" size="sm" onClick={onOffer}>
            <Zap className="h-3.5 w-3.5" /> Lanzar a estudiantes
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/** Festivos, vísperas y noches señaladas de las próximas ocho semanas. */
function NightCalendar({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: (date: string) => void }) {
  const { data, now } = usePro();
  const days = nightCalendar(data, now, 56);
  const missing = days.filter((d) => !d.event).length;
  if (!days.length) return null;
  return (
    <Panel
      title="Calendario de la noche"
      description={
        missing
          ? `${missing} ${missing === 1 ? "fecha fuerte" : "fechas fuertes"} en las próximas ocho semanas sin evento todavía.`
          : "Tienes evento en todas las fechas fuertes de las próximas ocho semanas."
      }
      flush
    >
      <RowList>
        {days.map((d) => (
          <div key={d.date} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <CalendarDays className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold first-letter:uppercase">{shortDay(atLocal(d.date, 12 * 60))}</span>
              <span className="block truncate text-xs text-text-muted">{d.notes.join(" · ")}</span>
            </span>
            {d.event ? (
              <button
                type="button"
                onClick={() => onOpen(d.event?.id ?? "")}
                className="inline-flex min-h-10 shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30"
              >
                <Pill tone="success">{d.event.name}</Pill>
              </button>
            ) : (
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => onCreate(d.date)}>
                <Plus className="h-3.5 w-3.5" /> Crear evento
              </Button>
            )}
          </div>
        ))}
      </RowList>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-heading text-base font-bold tabular">{value}</p>
      <p className="truncate text-[0.68rem] text-text-muted">{label}</p>
    </div>
  );
}
