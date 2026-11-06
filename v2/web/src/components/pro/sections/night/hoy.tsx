"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarClock, Clock3, DoorOpen, Heart, ListChecks, Megaphone, Sofa, Sparkles, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProEvent } from "@/lib/pro/types";
import { dayLabel, greeting, money, pct, relative, time } from "@/lib/pro/format";
import {
  MARKETPLACE_TICKET_FEE,
  countdown,
  crushStats,
  entryCurve,
  entryRate,
  eventPhase,
  eventStats,
  focusEvent,
  listClosed,
  nightFranky,
  promoterTotals,
  shortUni,
  upcomingEvents,
  zoneTotals,
} from "@/lib/pro/night";
import { cn } from "@/lib/utils";
import { Avatar, Bars, Empty, Kpi, KpiRow, LiveDot, Meter, PageHeader, Panel, Pill, Row, RowList } from "../../kit";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { EventDrawer, EventRow, PhasePill, Poster, TierList, priceNowLabel } from "./night-ui";
import { ForecastPanel, KaraokePanel, OfferClock, ReviewAskPanel } from "./ops-ui";
import { isKaraokeNight, nightDateNotes, nightForecast } from "@/lib/pro/night-ops";
import { InvitesTonightCard } from "./invites";

export default function NightHoy() {
  const { data, now, spaceId, vertical } = usePro();
  const [openEvent, setOpenEvent] = React.useState<string | null>(null);

  const ev = focusEvent(data, now);
  const phase = ev ? eventPhase(ev, now) : null;
  const tonight = phase === "today" || phase === "live";
  const stats = ev ? eventStats(data, ev) : null;
  const zones = ev ? data.zones.filter((z) => !z.eventId || z.eventId === ev.id) : data.zones;
  const zt = zoneTotals(zones);
  const franky = nightFranky(data, now, 30);
  const requests = data.groupRequests.filter((g) => g.status === "new");
  const held = zones.filter((z) => z.status === "held");
  const upcoming = upcomingEvents(data, now).filter((e) => e.id !== ev?.id).slice(0, 4);

  const summary = (() => {
    if (!ev || !stats) return "No tienes ninguna noche a la venta. Crea la próxima y la verán los estudiantes de tu zona.";
    const extras = `${stats.sold ? `${stats.sold} entradas vendidas` : "entrada libre"}${stats.list ? `, ${stats.list} en lista` : ""} y ${zt.taken} reservados`;
    if (phase === "live") return `${ev.name} en marcha: ${stats.inside} personas dentro de ${ev.capacity}. ${extras}.`;
    if (phase === "today") return `Esta noche, ${ev.name}: ${extras}. Puertas a las ${time(ev.doorsOpen)}.`;
    return `Hoy no abres. La próxima es ${ev.name}, ${dayLabel(ev.doorsOpen)}: ${extras}.`;
  })();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={
          <Button asChild variant="dark">
            <Link href={sectionHref(spaceId, vertical.primary.section)}>
              {vertical.primary.section === "puerta" ? <DoorOpen className="h-4 w-4" /> : <Sofa className="h-4 w-4" />}
              {vertical.primary.label}
            </Link>
          </Button>
        }
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi
          icon={Users}
          label={phase === "live" ? "Dentro ahora" : "Aforo"}
          value={ev ? `${ev.checkedIn}/${ev.capacity}` : "0"}
          hint={phase === "live" && ev ? `${entryRate(data, ev, now).toLocaleString("es-ES")} entradas por minuto` : tonight ? `Abres a las ${ev ? time(ev.doorsOpen) : ""}` : "Se llena en la puerta"}
          emphasis={phase === "live"}
        />
        <Kpi
          icon={Ticket}
          label={tonight ? "Vendidas esta noche" : "Vendidas próxima"}
          value={stats?.sold ?? 0}
          hint={stats?.revenueCents ? `${money(stats.revenueCents, { round: true })} en entradas` : "Entrada libre"}
        />
        <Kpi icon={ListChecks} label="En lista" value={stats ? `${stats.listIn}/${stats.list}` : "0"} hint={ev?.listCutoff ? `Hasta las ${time(ev.listCutoff)}` : "Sin hora de corte"} />
        <Kpi icon={Sparkles} label="A estudiantes, 30 días" value={franky.studentTickets.toLocaleString("es-ES")} hint="En Franky, sin comisión para ti" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {ev ? <TonightHero event={ev} onOpen={() => setOpenEvent(ev.id)} /> : <NoEvent />}

          {requests.length || held.length ? (
            <Panel title="Esperan tu respuesta" description="Reservados pedidos por estudiantes y señales sin pagar." flush>
              <RowList>
                {requests.map((g) => (
                  <Row key={g.id} href={sectionHref(spaceId, "reservados")}>
                    <Avatar name={g.organizer} size="sm" tone="violet" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {g.kind} · {g.people} personas
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {g.organizer} · {dayLabel(g.date)} · pedido {relative(g.createdAt, now.getTime())}
                      </span>
                    </span>
                    <Pill tone="violet">Nueva</Pill>
                  </Row>
                ))}
                {held.map((z) => (
                  <Row key={z.id} href={sectionHref(spaceId, "reservados")}>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
                      <Sofa className="h-4 w-4 text-text-secondary" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {z.name} apartado para {z.bookedBy}
                      </span>
                      <span className="block truncate text-xs text-text-muted">Falta la señal de {money(z.depositCents)} para confirmarlo</span>
                    </span>
                    <Pill tone="warning">Señal</Pill>
                  </Row>
                ))}
              </RowList>
            </Panel>
          ) : null}

          <Panel
            title="Próximas noches"
            description="Ventas de cada evento y lo que falta para llenarlo."
            action={
              <Link href={sectionHref(spaceId, "eventos")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                Eventos <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {upcoming.length ? (
              <RowList>
                {upcoming.map((e) => (
                  <EventRow key={e.id} event={e} onClick={() => setOpenEvent(e.id)} />
                ))}
              </RowList>
            ) : (
              <Empty icon={CalendarClock} title="No hay más noches a la venta" body="Crea la siguiente con tiempo: la anticipada se vende mejor con una semana de margen." />
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <OfferClock />
          {ev && phase === "live" ? <InvitesTonightCard /> : null}
          {ev && tonight && isKaraokeNight(data, ev) ? <KaraokePanel event={ev} /> : null}
          {ev && phase !== "past" ? <ForecastPanel event={ev} /> : null}
          {ev?.listCutoff && stats && stats.list ? <ListCutoffCard event={ev} /> : null}
          {ev && data.promoters.length ? <TopPromoters event={ev} /> : null}
          {ev ? <CrushCard event={ev} /> : null}
          <ReviewAskPanel />
          <FrankyCard />
        </div>
      </div>

      <EventDrawer eventId={openEvent} onClose={() => setOpenEvent(null)} />
    </div>
  );
}

/** La noche en grande: aforo en directo, ritmo de entrada, tramos, lista y reservados. */
function TonightHero({ event, onOpen }: { event: ProEvent; onOpen: () => void }) {
  const { data, now, spaceId } = usePro();
  const phase = eventPhase(event, now);
  const stats = eventStats(data, event);
  const rate = entryRate(data, event, now);
  const curve = entryCurve(data, event, now, 24);
  const lastBucket = curve.reduce((last, v, i) => (v > 0 ? i : last), -1);
  const fill = pct(event.checkedIn, event.capacity);
  const zones = data.zones.filter((z) => !z.eventId || z.eventId === event.id);
  const zt = zoneTotals(zones);
  const priceNow = priceNowLabel(event, now);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="flex items-start gap-4 border-b border-border-light p-4 sm:p-5">
        <Poster event={event} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PhasePill phase={phase} />
            {phase === "today" ? <span className="text-xs text-text-muted">Abres en {countdown(now.getTime(), event.doorsOpen)}</span> : null}
            {phase === "upcoming" ? <span className="text-xs text-text-muted">Faltan {countdown(now.getTime(), event.doorsOpen)}</span> : null}
            {phase === "live" ? <span className="text-xs text-text-muted">Cierra a las {time(event.closes)}</span> : null}
          </div>
          <h2 className="mt-1.5 truncate font-heading text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">{event.name}</h2>
          <p className="truncate text-sm text-text-muted">
            {dayLabel(event.doorsOpen)} · puertas {time(event.doorsOpen)}
            {event.lineup ? ` · ${event.lineup}` : ""}
          </p>
          {nightDateNotes(event.date).length ? (
            <p className="mt-1 text-xs font-semibold text-violet-deep">{nightDateNotes(event.date).join(" · ")}</p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={onOpen} className="hidden sm:inline-flex">
          Detalle
        </Button>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col">
          <p className="text-sm font-medium text-text-muted">{phase === "live" ? "Dentro ahora" : "Aforo de la noche"}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-5xl font-extrabold leading-none tracking-[-0.03em] tabular">{event.checkedIn}</span>
            <span className="text-lg font-semibold text-text-muted tabular">/ {event.capacity}</span>
          </p>
          <Meter value={event.checkedIn} max={event.capacity} className="mt-3 h-2.5" tone={fill >= 95 ? "danger" : fill >= 80 ? "warning" : "violet"} />
          <p className="mt-2 text-xs text-text-muted">
            {phase === "live"
              ? `${fill} % del aforo · ${rate.toLocaleString("es-ES")} entradas por minuto · quedan ${Math.max(0, event.capacity - event.checkedIn)} plazas`
              : `${stats.sold + stats.list + stats.reserved} personas con entrada, lista o reservado`}
          </p>
          {phase === "live" && lastBucket >= 0 ? (
            <div className="mt-4">
              <Bars values={curve.slice(0, lastBucket + 1)} className="h-16" format={(v) => `${v} en 15 min`} />
              <p className="mt-1 text-[0.7rem] text-text-muted">Entradas cada 15 minutos desde las {time(event.doorsOpen)}</p>
            </div>
          ) : null}
          <div className="mt-auto grid grid-cols-3 gap-2 pt-4 text-center">
            <MiniStat label="Entradas" value={`${stats.ticketsIn}/${stats.sold}`} />
            <MiniStat label="Lista" value={`${stats.listIn}/${stats.list}`} />
            <Link href={sectionHref(spaceId, "reservados")} className="rounded-xl bg-bg-secondary px-2 py-2 transition-colors hover:bg-bg-tertiary">
              <span className="block font-heading text-base font-bold tabular">
                {zt.arrived}/{zt.taken}
              </span>
              <span className="block text-[0.7rem] text-text-muted">Reservados</span>
            </Link>
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-medium text-text-muted">Entradas por tramo</p>
          <TierList event={event} now={now} compact />
          {priceNow ? <p className="mt-3 text-sm font-medium text-violet-deep">{priceNow}</p> : null}
          <Button variant="outline" size="sm" onClick={onOpen} className="mt-4 w-full sm:hidden">
            Ver detalle y asistentes
          </Button>
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-2 py-2">
      <span className="block font-heading text-base font-bold tabular">{value}</span>
      <span className="block text-[0.7rem] text-text-muted">{label}</span>
    </div>
  );
}

function NoEvent() {
  const { spaceId } = usePro();
  return (
    <Panel>
      <Empty
        icon={CalendarClock}
        title="No hay ninguna noche a la venta"
        body="Crea tu próximo evento con tramos de precio y hora de corte de lista. Lo verán los estudiantes de Alicante en Franky."
        action={
          <Button asChild variant="dark">
            <Link href={sectionHref(spaceId, "eventos")}>Crear evento</Link>
          </Button>
        }
      />
    </Panel>
  );
}

function ListCutoffCard({ event }: { event: ProEvent }) {
  const { data, now } = usePro();
  const stats = eventStats(data, event);
  const closed = listClosed(event, now);
  const phase = eventPhase(event, now);
  // Lo que suele venir de la lista sale de las noches pasadas, no de una cifra fija.
  const forecast = nightForecast(data, event, now);
  return (
    <Panel title="Hora de corte de lista" description={`Gratis hasta las ${time(event.listCutoff as string)}. Después, taquilla.`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">
          {closed ? "Cerrada" : countdown(now.getTime(), event.listCutoff as string)}
        </p>
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <Clock3 className="h-3.5 w-3.5" /> {closed ? `desde las ${time(event.listCutoff as string)}` : "para cerrar"}
        </span>
      </div>
      <Meter value={stats.listIn} max={Math.max(1, stats.list)} className="mt-3" tone="success" />
      <p className="mt-2 text-xs text-text-muted">
        {phase === "live" || phase === "past"
          ? `${stats.listIn} de ${stats.list} de la lista ya han entrado (${pct(stats.listIn, stats.list)} %).`
          : forecast
            ? `${stats.list} personas apuntadas. En tus últimas noches vino el ${forecast.showListPct} % de la lista: cuenta con unas ${Math.round((stats.list * forecast.showListPct) / 100)}.`
            : `${stats.list} personas apuntadas.`}
      </p>
    </Panel>
  );
}

function TopPromoters({ event }: { event: ProEvent }) {
  const { data, now, spaceId } = usePro();
  const live = eventPhase(event, now) === "live";
  const rows = data.promoters
    .map((p) => ({ p, t: promoterTotals(data, p, event.id) }))
    .filter((x) => x.t.sold + x.t.list > 0)
    .sort((a, b) => (live ? b.t.scanned - a.t.scanned : b.t.sold + b.t.list - (a.t.sold + a.t.list)))
    .slice(0, 5);
  return (
    <Panel
      title="Top RRPP de la noche"
      description={live ? "Por entradas reales escaneadas en puerta." : "Por entradas vendidas y apuntados en lista."}
      action={
        <Link href={sectionHref(spaceId, "rrpp")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
          RRPP <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      {rows.length ? (
        <RowList>
          {rows.map(({ p, t }, i) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="w-4 shrink-0 text-center text-xs font-bold text-text-muted tabular">{i + 1}</span>
              <Avatar name={p.name} size="sm" tone={i === 0 ? "violet" : "slate"} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-sm font-semibold">
                  {p.name}
                  {p.university ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
                </span>
                <span className="block text-xs text-text-muted">
                  {shortUni(p.university)} · {t.sold} vendidas · {t.list} en lista
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-heading text-base font-bold tabular">{live ? t.scanned : t.sold + t.list}</span>
                <span className="block text-[0.68rem] text-text-muted">{live ? "dentro" : "personas"}</span>
              </span>
            </div>
          ))}
        </RowList>
      ) : (
        <Empty icon={Megaphone} title="Sin ventas de RRPP todavía" body="Comparte el enlace de cada RRPP: todo lo que vendan queda a su nombre." className="py-6" />
      )}
    </Panel>
  );
}

function CrushCard({ event }: { event: ProEvent }) {
  const { data, now, spaceId } = usePro();
  const phase = eventPhase(event, now);
  const stats = eventStats(data, event);
  const crush = crushStats(event, stats.sold);
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Heart className={cn("mt-0.5 h-5 w-5 shrink-0", event.crushLive ? "text-violet" : "text-text-muted")} strokeWidth={1.9} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-heading font-bold">
            Crush Live
            {event.crushLive && phase === "live" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <LiveDot /> En pantallas
              </span>
            ) : null}
          </p>
          {event.crushLive ? (
            <>
              <p className="mt-0.5 text-sm text-text-muted">
                {phase === "live"
                  ? `${crush.players} personas jugando y ${crush.matches} matches en las pantallas esta noche.`
                  : `Se enciende al abrir puertas. ${crush.players} de los que tienen entrada ya se han apuntado.`}
              </p>
              {phase === "live" ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat label="Jugando" value={String(crush.players)} />
                  <MiniStat label="Matches" value={String(crush.matches)} />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-text-muted">Apagado para esta noche. Enciende las pantallas de matches: la fiesta que nadie más tiene en Alicante.</p>
              <Link href={sectionHref(spaceId, "eventos")} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                Activarlo en el evento <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Lo que Franky ha traído: entradas a estudiantes sin comisión para la sala. */
function FrankyCard() {
  const { data, now, spaceId } = usePro();
  const f = nightFranky(data, now, 30);
  const unis = Object.entries(f.universities).sort((a, b) => b[1] - a[1]);
  const top = unis[0];
  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Franky, últimos 30 días</p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{f.studentTickets.toLocaleString("es-ES")}</p>
      <p className="text-sm text-white/70">entradas vendidas a estudiantes en Franky</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">{money(f.revenueCents, { round: true })}</p>
          <p className="text-xs text-white/60">íntegros para ti, sin comisión</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">{money(f.savedCents, { round: true })}</p>
          <p className="text-xs text-white/60">que un marketplace al {Math.round(MARKETPLACE_TICKET_FEE * 100)} % se habría quedado</p>
        </div>
      </div>
      {top ? (
        <p className="mt-3 text-xs text-white/60">
          {pct(top[1], f.studentTickets)} % de {shortUni(top[0])}. El 2,5 % de cada entrada lo paga el comprador.
        </p>
      ) : null}
      <Link href={sectionHref(spaceId, "estudiantes")} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-white">
        Ver resultados <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
