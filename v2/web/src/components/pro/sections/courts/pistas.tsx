"use client";

import * as React from "react";
import {
  BadgeCheck,
  CalendarX2,
  Check,
  CloudRain,
  Lock,
  Plus,
  Repeat,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProBooking, ProResource } from "@/lib/pro/types";
import {
  addDays,
  capitalize,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  time,
} from "@/lib/pro/format";
import {
  MATCH_MINUTES,
  SLOT_MINUTES,
  VALLEY_FROM,
  VALLEY_TO,
  dayOccupancy,
  hoursFor,
  isBusy,
  isShared,
  isValley,
  matchesOn,
  occupancyAt,
  perPlayer,
  priceFor,
  resourceBookings,
  resourceOpenings,
  valleyGaps,
  type OpenMatchX,
} from "@/lib/pro/courts";
import { shortUni } from "@/lib/pro/classes";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Empty,
  LiveDot,
  Meter,
  PageHeader,
  Pill,
  Segmented,
  StepNav,
  Tip,
} from "../../kit";
import { TONES } from "../../tones";
import { ResourceDrawer } from "./resource-drawer";
import {
  BLOCK_REASON_LABEL,
  blocksOn,
  clockLabel,
  courtsOps,
} from "@/lib/pro/courts-base";
import {
  isSplitBooking,
  playerShares,
  seriesOf,
  waitingOn,
} from "@/lib/pro/courts-ops";
import { BLOCK_STYLE, BlockDrawer, type BlockTarget } from "./block-drawer";
import { RainDrawer } from "./rain-drawer";
import { NewSeriesDrawer, SeriesView } from "./turnos";
import { useAutoRelease } from "./use-courts";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import {
  CourtBookingDrawer,
  MatchDrawer,
  NewCourtBookingDrawer,
  NewMatchDrawer,
  courtsCopy,
  fromFranky,
  matchReach,
  type NewCourtPreset,
  type NewMatchPreset,
} from "./parts";

const ROW = 42; // Mantiene un objetivo táctil cómodo por media hora.

export default function PistasSection() {
  const { data, now, vertical, update, demo, can, pending, loadDate } =
    usePro();
  const copy = courtsCopy(vertical.id);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [view, setView] = React.useState<"calendar" | "matches" | "fixed">(
    "calendar",
  );
  const [block, setBlock] = React.useState<BlockTarget>(null);
  const [rain, setRain] = React.useState(false);
  const [newSeries, setNewSeries] = React.useState(false);
  useAutoRelease();
  const [date, setDate] = React.useState(today);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [openMatch, setOpenMatch] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  const [newMatch, setNewMatch] = React.useState<NewMatchPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [resourcesOpen, setResourcesOpen] = React.useState(false);
  React.useEffect(() => {
    if (!demo) void loadDate(date);
  }, [date, demo, loadDate]);

  // Desde Hoy se puede llegar directo a partidos abiertos o a turnos fijos.
  React.useEffect(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("vista");
      if (demo && !coworking && wanted === "partidos") setView("matches");
      if (demo && !coworking && wanted === "fijos") setView("fixed");
    } catch {
      // sin URL no hay nada que leer
    }
  }, [coworking, demo]);

  const label =
    vertical.nav.find((n) => n.id === "pistas")?.label ?? copy.section;
  const list = resourceBookings(data, date).filter(
    (b) => b.status !== "no_show",
  );
  const occ = dayOccupancy(data, date);
  const expected = list.reduce((a, b) => a + b.priceCents, 0);
  const people = data.resources
    .filter(isShared)
    .reduce((a, r) => a + occupancyAt(data, r, today, nowMin), 0);
  const seats = data.resources
    .filter(isShared)
    .reduce((a, r) => a + r.capacity, 0);
  const matches = (data.openMatches as OpenMatchX[])
    .filter(
      (m) =>
        new Date(m.start).getTime() + MATCH_MINUTES * 60000 > now.getTime(),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const gaps =
    date >= today ? valleyGaps(data, date, date === today ? nowMin : 0) : [];

  const dayName =
    date === today ? "Hoy" : date === addDays(today, 1) ? "Mañana" : "";
  const waiting = demo ? waitingOn(data, date).length : 0;
  const outdoorLeft =
    demo && !coworking && date >= today
      ? list.some(
          (b) =>
            (b.status === "confirmed" || b.status === "requested") &&
            !courtsOps(data).coveredIds.includes(b.resourceId ?? "") &&
            data.resources.find((r) => r.id === b.resourceId)?.kind ===
              "court" &&
            (date > today || localMinutes(b.start) >= nowMin),
        )
      : false;

  const publishAll = () => {
    const pending = matches.filter((m) => !m.publishedAt);
    update("match.publish.all", (d) => ({
      ...d,
      openMatches: d.openMatches.map((m) =>
        pending.some((p) => p.id === m.id)
          ? ({
              ...m,
              publishedAt: now.toISOString(),
              reach: matchReach(m.level),
            } as OpenMatchX)
          : m,
      ),
    }));
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title={
          view === "calendar"
            ? capitalize(dayLabel(`${date}T12:00:00Z`))
            : view === "fixed"
              ? "Turnos fijos"
              : "Partidos abiertos"
        }
        description={
          view === "calendar"
            ? coworking
              ? `${date === today ? `Ahora ${people} de ${seats} puestos ocupados. ` : ""}${plural(list.length, "reserva", "reservas")}, ${occ} % de ocupación del día.`
              : `${plural(list.length, "reserva", "reservas")}, pistas al ${occ} %${demo || can("finance.read") ? ` y ${money(expected, { round: true })} previstos` : ""}${demo && gaps.length ? `. ${plural(gaps.length, "franja valle libre", "franjas valle libres")}` : ""}${waiting ? `. ${plural(waiting, "persona", "personas")} en lista de espera.` : "."}`
            : view === "fixed"
              ? "Los grupos que juegan cada semana a la misma hora, reservados hasta fin de curso."
              : matches.length
                ? `${plural(matches.length, "partido espera", "partidos esperan")} jugadores. Franky los enseña a estudiantes de nivel parecido y de su universidad.`
                : "Para quien quiere jugar y no tiene con quién. Se completan con estudiantes de nivel parecido."
        }
        actions={
          <>
            {demo && !coworking ? (
              <Segmented
                label="Vista"
                value={view}
                onChange={setView}
                options={[
                  { value: "calendar", label: "Calendario" },
                  {
                    value: "matches",
                    label: "Partidos abiertos",
                    count: matches.filter((m) => !m.releasedAt).length,
                  },
                  {
                    value: "fixed",
                    label: "Turnos fijos",
                    count: courtsOps(data).series.filter((x) => x.active)
                      .length,
                  },
                ]}
              />
            ) : null}
            {view === "calendar" ? (
              <Button
                variant="dark"
                disabled={pending || !can("court.create")}
                onClick={() => setPreset({ date: date < today ? today : date })}
              >
                <Plus className="h-4 w-4" /> {copy.newBooking}
              </Button>
            ) : view === "fixed" ? (
              <Button variant="dark" onClick={() => setNewSeries(true)}>
                <Plus className="h-4 w-4" /> Nuevo turno fijo
              </Button>
            ) : (
              <Button
                variant="dark"
                onClick={() => setNewMatch({ date: today })}
              >
                <Plus className="h-4 w-4" /> Nuevo partido abierto
              </Button>
            )}
          </>
        }
      />

      {view === "calendar" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!demo && can("resource.save") ? (
              <Button variant="ghost" onClick={() => setResourcesOpen(true)}>
                Gestionar espacios
              </Button>
            ) : null}
            <StepNav
              label={date === today ? "" : dayName}
              onPrev={() => setDate(addDays(date, -1))}
              onNext={() => setDate(addDays(date, 1))}
              onToday={() => setDate(today)}
              isToday={date === today}
            />
            {demo ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  onClick={() =>
                    setBlock({ mode: "new", date: date < today ? today : date })
                  }
                >
                  <Lock className="h-3.5 w-3.5" /> Bloquear
                </Button>
                {outdoorLeft ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    onClick={() => setRain(true)}
                  >
                    <CloudRain className="h-3.5 w-3.5" /> Llueve
                  </Button>
                ) : null}
              </div>
            ) : null}
            {demo && gaps.length ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  data.resources.find(
                    (resource) => resource.id === gaps[0].resourceId,
                  )?.pricePerHourCents === null
                }
                onClick={() => {
                  const g = gaps[0];
                  const r = data.resources.find((x) => x.id === g.resourceId)!;
                  const price =
                    r.kind === "court"
                      ? priceFor(
                          { ...r, valleyPricePerHourCents: undefined },
                          g.date,
                          g.from,
                          MATCH_MINUTES,
                        )
                      : r.pricePerHourCents === null
                        ? null
                        : r.pricePerHourCents * (isShared(r) ? 4 : 2);
                  if (price === null) return;
                  setOffer({
                    what: copy.what(r),
                    date: g.date,
                    from: g.from,
                    to: g.to,
                    priceCents: price,
                    slots: isShared(r)
                      ? g.free
                      : Math.max(
                          1,
                          Math.floor((g.to - g.from) / MATCH_MINUTES),
                        ),
                  });
                }}
              >
                <Send className="h-3.5 w-3.5" /> Ofrecer la franja valle a
                estudiantes
              </Button>
            ) : null}
          </div>

          {coworking && date === today ? (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {data.resources.map((r) => {
                const o = occupancyAt(data, r, today, nowMin);
                const cap = isShared(r) ? r.capacity : 1;
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-border bg-bg-primary px-4 py-3"
                  >
                    <p className="flex items-center gap-2 text-[0.8rem] font-medium text-text-muted">
                      <LiveDot /> {r.name}
                    </p>
                    <p className="mt-1 font-heading text-xl font-extrabold tabular">
                      {isShared(r) ? (
                        <>
                          {o}
                          <span className="text-sm text-text-muted">
                            /{r.capacity}
                          </span>
                        </>
                      ) : o ? (
                        "Ocupada"
                      ) : (
                        "Libre"
                      )}
                    </p>
                    <Meter
                      value={Math.min(cap, o)}
                      max={cap}
                      className="mt-2"
                      tone={
                        o >= cap
                          ? "danger"
                          : o / cap > 0.75
                            ? "warning"
                            : "success"
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <CourtCalendar
            date={date}
            onOpen={setOpenBooking}
            onOpenMatch={setOpenMatch}
            onOpenBlock={(blockId) => setBlock({ mode: "view", date, blockId })}
            onNew={(resourceId, minute) =>
              setPreset({ date, resourceId, minute })
            }
          />
          {!demo && list.length > 0 ? (
            <section
              aria-label="Reservas del día"
              className="rounded-2xl border border-border bg-bg-primary"
            >
              <p className="eyebrow px-4 pt-4">Reservas del día</p>
              {list.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => setOpenBooking(booking.id)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border-light px-4 py-3 text-left last:border-0 hover:bg-bg-secondary"
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {booking.clientName}
                    </span>
                    <span className="text-xs text-text-muted">
                      {
                        data.resources.find(
                          (resource) => resource.id === booking.resourceId,
                        )?.name
                      }{" "}
                      · {booking.partySize}{" "}
                      {booking.partySize === 1 ? "persona" : "personas"}
                    </span>
                  </span>
                  <span className="text-sm tabular">
                    {time(booking.start)} a {time(booking.end)}
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          {demo ? (
            <Tip title={coworking ? "Mapa de estudio" : "Precio valle"}>
              {coworking
                ? "Los estudiantes ven en Franky cuántos puestos te quedan libres en cada zona, en directo. Si ven sitio, vienen andando desde el campus."
                : `La banda verde es la franja valle (de ${minutesToLabel(VALLEY_FROM)} a ${minutesToLabel(VALLEY_TO)} entre semana). Al reservar en ella el precio baja solo y se enseña a estudiantes, no al resto.`}
            </Tip>
          ) : null}
        </>
      ) : view === "fixed" ? (
        <SeriesView onNew={() => setNewSeries(true)} />
      ) : (
        <MatchesList
          matches={matches}
          onOpen={setOpenMatch}
          onPublishAll={publishAll}
          onNew={() => setNewMatch({ date: today })}
        />
      )}

      <CourtBookingDrawer
        bookingId={openBooking}
        onClose={() => setOpenBooking(null)}
      />
      {!demo ? (
        <ResourceDrawer
          open={resourcesOpen}
          onClose={() => setResourcesOpen(false)}
        />
      ) : null}
      <MatchDrawer matchId={openMatch} onClose={() => setOpenMatch(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <NewMatchDrawer preset={newMatch} onClose={() => setNewMatch(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      {demo ? (
        <>
          <BlockDrawer target={block} onClose={() => setBlock(null)} />
          <RainDrawer date={date} open={rain} onClose={() => setRain(false)} />
          <NewSeriesDrawer
            open={newSeries}
            onClose={() => setNewSeries(false)}
          />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendario por pista o espacio                                      */
/* ------------------------------------------------------------------ */

function CourtCalendar({
  date,
  onOpen,
  onOpenMatch,
  onOpenBlock,
  onNew,
}: {
  date: string;
  onOpen: (id: string) => void;
  onOpenMatch: (id: string) => void;
  onOpenBlock: (id: string) => void;
  onNew: (resourceId: string, minute: number) => void;
}) {
  const { data, now, demo, pending, can } = usePro();
  const windows = data.resources.flatMap((resource) =>
    resourceOpenings(data, date, resource.id),
  );
  const hours = demo
    ? hoursFor(data, date)
    : windows.length
      ? {
          open: Math.min(...windows.map((window) => window.open)),
          close: Math.max(...windows.map((window) => window.close)),
        }
      : null;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const today = localDate(now);
  const nowMin = localMinutes(now);

  const start = hours ? Math.floor(hours.open / 60) * 60 : 8 * 60;
  const end = hours ? Math.ceil(hours.close / 60) * 60 : 22 * 60;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (date !== today) {
      el.scrollTo({ top: 0 });
      return;
    }
    el.scrollTo({
      top: Math.max(0, ((nowMin - start) / SLOT_MINUTES) * ROW - 90),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!data.resources.length) {
    return (
      <Empty
        icon={CalendarX2}
        title="Añade tu primera pista o espacio"
        body="Configura los espacios que se pueden reservar para empezar a organizar tu calendario."
      />
    );
  }
  if (!hours) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={CalendarX2}
          title="Cerrado este día"
          body="Elige otro día o revisa los horarios del espacio."
        />
      </div>
    );
  }

  const slots = Array.from(
    { length: (hours.close - hours.open) / SLOT_MINUTES },
    (_, i) => hours.open + i * SLOT_MINUTES,
  );
  const marks = Array.from(
    { length: (end - start) / 60 + 1 },
    (_, i) => start + i * 60,
  );
  const y = (m: number) => ((m - start) / SLOT_MINUTES) * ROW;
  const valleyToday = demo && isValley(date, VALLEY_FROM);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div
        ref={scrollRef}
        className="max-h-[calc(100dvh-14rem)] min-h-[420px] overflow-auto pro-scroll"
      >
        <div
          className="relative"
          style={{ minWidth: `${56 + data.resources.length * 140}px` }}
        >
          <div className="sticky top-0 z-20 flex border-b border-border bg-bg-primary">
            <div className="w-14 shrink-0" />
            {data.resources.map((r) => {
              const count = resourceBookings(data, date, r.id).filter(
                (b) => b.status !== "no_show",
              ).length;
              const openSlots = slots.filter((minute) =>
                resourceOpenings(data, date, r.id).some(
                  (window) => window.open <= minute && window.close > minute,
                ),
              );
              const busySlots = openSlots.filter(
                (m) => occupancyAt(data, r, date, m) > 0,
              ).length;
              return (
                <div
                  key={r.id}
                  className="min-w-[140px] flex-1 border-l border-border-light px-3 py-2.5"
                >
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        TONES[r.tone].dot,
                      )}
                    />
                    <span className="truncate">{r.name}</span>
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {isShared(r)
                      ? `${r.capacity} puestos · ${count} reservas`
                      : `${count} ${count === 1 ? "reserva" : "reservas"} · ${Math.round((busySlots / Math.max(1, openSlots.length)) * 100)} %`}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height: y(end) }}>
            <div className="relative w-14 shrink-0">
              {marks.map((m) => (
                <span
                  key={m}
                  className="absolute right-2 -translate-y-1/2 text-[0.7rem] font-medium text-text-muted tabular"
                  style={{ top: y(m) }}
                >
                  {m < end && m > start ? clockLabel(m) : ""}
                </span>
              ))}
              {valleyToday ? (
                <span
                  className="absolute left-1 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
                  style={{ top: y(VALLEY_FROM) + 4 }}
                >
                  Valle
                </span>
              ) : null}
            </div>

            {/* Rejilla, franja valle y horas cerradas */}
            <div className="pointer-events-none absolute inset-y-0 left-14 right-0">
              {valleyToday ? (
                <div
                  className="absolute inset-x-0 bg-emerald-50/70 dark:bg-emerald-950/25"
                  style={{
                    top: y(Math.max(VALLEY_FROM, hours.open)),
                    height:
                      y(Math.min(VALLEY_TO, hours.close)) -
                      y(Math.max(VALLEY_FROM, hours.open)),
                  }}
                />
              ) : null}
              {marks.slice(0, -1).map((m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t border-border-light"
                  style={{ top: y(m) }}
                />
              ))}
              <div
                className="absolute inset-x-0 top-0 bg-bg-secondary/70"
                style={{ height: y(hours.open) }}
              />
              <div
                className="absolute inset-x-0 bottom-0 bg-bg-secondary/70"
                style={{ height: y(end) - y(hours.close) }}
              />
            </div>

            {data.resources.map((r) => (
              <div
                key={r.id}
                className="relative min-w-[140px] flex-1 border-l border-border-light"
              >
                {slots
                  .filter(
                    (minute) =>
                      !resourceOpenings(data, date, r.id).some(
                        (window) =>
                          window.open <= minute && window.close > minute,
                      ),
                  )
                  .map((minute) => (
                    <span
                      key={`closed-${minute}`}
                      className="pointer-events-none absolute inset-x-0 bg-bg-secondary/80 px-2 pt-2 text-xs text-text-muted"
                      style={{ top: y(minute), height: ROW }}
                    >
                      {minute % 60 === 0 ? "Cerrado" : ""}
                    </span>
                  ))}
                {demo
                  ? blocksOn(data, date, r.id).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onOpenBlock(b.id)}
                        aria-label={`${BLOCK_REASON_LABEL[b.reason]} en ${r.name} de ${clockLabel(b.from)} a ${clockLabel(b.to)}`}
                        className={cn(
                          "absolute inset-x-1 z-[6] overflow-hidden rounded-lg border border-dashed px-2.5 py-1 text-left transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
                          BLOCK_STYLE[b.reason],
                        )}
                        style={{
                          top: y(Math.max(start, b.from)) + 1,
                          height:
                            y(Math.min(end, b.to)) -
                            y(Math.max(start, b.from)) -
                            2,
                        }}
                      >
                        <span className="flex items-center gap-1 text-[0.72rem] font-bold uppercase tracking-wide">
                          <Lock
                            className="h-3 w-3 shrink-0"
                            strokeWidth={1.9}
                          />
                          {BLOCK_REASON_LABEL[b.reason]}
                        </span>
                        {b.note ? (
                          <span className="block truncate text-[0.72rem]">
                            {b.note}
                          </span>
                        ) : null}
                      </button>
                    ))
                  : null}
                {isShared(r) ? (
                  slots.map((m) => {
                    if (
                      !resourceOpenings(data, date, r.id).some(
                        (window) => window.open <= m && window.close > m,
                      )
                    )
                      return null;
                    const o = occupancyAt(data, r, date, m);
                    const ratio = o / r.capacity;
                    const past =
                      date < today ||
                      (date === today && m + SLOT_MINUTES <= nowMin);
                    const full = isBusy(data, r, date, m);
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={
                          past || full || pending || !can("court.create")
                        }
                        onClick={() => onNew(r.id, m)}
                        aria-label={`${r.name} a las ${clockLabel(m)}: ${Math.min(o, r.capacity)} de ${r.capacity} puestos`}
                        className={cn(
                          "absolute inset-x-1 flex items-center justify-between rounded-md px-2 text-[0.7rem] font-semibold tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
                          ratio === 0
                            ? "text-text-muted hover:bg-violet-50"
                            : ratio < 0.5
                              ? "bg-violet/15 text-violet-deep hover:bg-violet/25"
                              : ratio < 0.85
                                ? "bg-violet/35 text-violet-deep hover:bg-violet/45"
                                : "bg-violet text-white",
                          past && "opacity-50",
                        )}
                        style={{ top: y(m) + 1, height: ROW - 2 }}
                      >
                        <span>{m % 60 === 0 ? clockLabel(m) : ""}</span>
                        <span>
                          {Math.min(o, r.capacity)}/{r.capacity}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <>
                    {slots.map((m) => {
                      const past =
                        date < today ||
                        (date === today && m + SLOT_MINUTES <= nowMin);
                      if (past || isBusy(data, r, date, m)) return null;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={pending || !can("court.create")}
                          onClick={() => onNew(r.id, m)}
                          aria-label={`Reservar ${r.name} a las ${clockLabel(m)}`}
                          className="group absolute inset-x-1 rounded-md transition-colors hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none"
                          style={{ top: y(m), height: ROW }}
                        >
                          <span className="hidden items-center gap-1 pl-1.5 text-[0.68rem] font-semibold text-violet group-hover:flex group-focus-visible:flex">
                            <Plus className="h-3 w-3" /> {clockLabel(m)}
                          </span>
                        </button>
                      );
                    })}
                    {resourceBookings(data, date, r.id).map((b) => (
                      <BookingBlock
                        key={b.id}
                        booking={b}
                        resource={r}
                        top={y(
                          localDate(b.start) < date
                            ? start
                            : Math.max(start, localMinutes(b.start)),
                        )}
                        height={
                          y(
                            localDate(b.end) > date
                              ? end
                              : Math.min(end, localMinutes(b.end)),
                          ) -
                          y(
                            localDate(b.start) < date
                              ? start
                              : Math.max(start, localMinutes(b.start)),
                          )
                        }
                        onOpen={onOpen}
                      />
                    ))}
                    {matchesOn(data, date, r.id)
                      .filter((m) => !m.releasedAt)
                      .map((m) => {
                        const from = localMinutes(m.start);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => onOpenMatch(m.id)}
                            className="absolute inset-x-1 z-[5] overflow-hidden rounded-lg border border-dashed border-violet bg-violet-50 px-2.5 py-1 text-left text-violet-deep transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet dark:bg-violet-950/40"
                            style={{
                              top: y(from) + 1,
                              height: y(from + MATCH_MINUTES) - y(from) - 2,
                            }}
                          >
                            <span className="block truncate text-[0.8rem] font-bold">
                              Partido abierto
                            </span>
                            <span className="block truncate text-[0.7rem]">
                              Nivel {m.level} · faltan {m.needed}
                            </span>
                            <span className="mt-1 flex -space-x-1.5">
                              {m.players.map((p) => (
                                <Avatar
                                  key={p}
                                  name={p}
                                  size="xs"
                                  tone="violet"
                                  className="ring-2 ring-violet-50"
                                />
                              ))}
                            </span>
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            ))}

            {date === today && nowMin >= start && nowMin <= end ? (
              <div
                className="pointer-events-none absolute left-11 right-0 z-10 flex items-center"
                style={{ top: y(nowMin) }}
              >
                <span className="h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-rose-500 ring-4 ring-rose-500/15" />
                <span className="h-px flex-1 bg-rose-500" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingBlock({
  booking: b,
  resource: r,
  top,
  height,
  onOpen,
}: {
  booking: ProBooking;
  resource: ProResource;
  top: number;
  height: number;
  onOpen: (id: string) => void;
}) {
  const { demo, data } = usePro();
  const tone = TONES[r.tone];
  const paid =
    b.priceCents > 0 && b.paidCents !== null && b.paidCents >= b.priceCents;
  const fixed = demo && Boolean(seriesOf(data, b.id));
  const shares = demo && isSplitBooking(data, b) ? playerShares(data, b) : null;
  const sharesPaid = shares ? shares.filter((x) => x.dueCents === 0).length : 0;
  const short = height < ROW * 2.2;
  return (
    <button
      type="button"
      onClick={() => onOpen(b.id)}
      aria-label={`${b.clientName}, ${r.name} de ${time(b.start)} a ${time(b.end)}`}
      className={cn(
        "absolute inset-x-1 z-[5] overflow-hidden rounded-lg text-left transition-[transform,box-shadow] duration-200 hover:z-[6] hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
        tone.block,
        b.status === "requested" &&
          "border border-dashed border-amber-500 bg-amber-50 dark:bg-amber-950/40",
        b.status === "in_service" &&
          "ring-2 ring-offset-1 ring-offset-bg-primary " + tone.ring,
        (b.status === "done" || b.status === "no_show") && "opacity-60",
      )}
      style={{ top: top + 1, height: height - 2 }}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          b.status === "requested" ? "bg-amber-500" : tone.bar,
        )}
      />
      <span className={cn("flex h-full flex-col px-2.5 py-1", tone.text)}>
        <span className="flex items-center gap-1">
          <span className="truncate text-[0.8rem] font-semibold leading-tight">
            {b.clientName}
          </span>
          {b.student ? (
            <BadgeCheck
              className="h-3.5 w-3.5 shrink-0 opacity-70"
              aria-label="Estudiante verificado"
            />
          ) : null}
          {fromFranky(b.source) ? (
            <Sparkles
              className="h-3 w-3 shrink-0 text-violet"
              aria-label="Vino por Franky"
            />
          ) : null}
          {fixed ? (
            <Repeat
              className="h-3 w-3 shrink-0 opacity-70"
              aria-label="Turno fijo"
            />
          ) : null}
          {paid ? (
            <Check
              className="ml-auto h-3.5 w-3.5 shrink-0"
              aria-label="Pagada"
            />
          ) : null}
        </span>
        {!short ? (
          <span className="truncate text-[0.72rem] opacity-75 tabular">
            {time(b.start)} a {time(b.end)}
            {shares && !paid
              ? ` · ${sharesPaid} de 4 pagados`
              : demo && r.kind === "court" && b.priceCents
                ? ` · 4 × ${money(perPlayer(b.priceCents))}`
                : b.partySize > 1
                  ? ` · ${b.partySize} personas`
                  : ""}
          </span>
        ) : null}
        {!short && b.status === "requested" ? (
          <span className="mt-auto text-[0.68rem] font-semibold text-amber-700 dark:text-amber-300">
            Por confirmar
          </span>
        ) : null}
        {!short && b.note && b.status !== "requested" && r.kind !== "court" ? (
          <span className="mt-auto truncate text-[0.68rem]">{b.note}</span>
        ) : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Partidos abiertos                                                   */
/* ------------------------------------------------------------------ */

function MatchesList({
  matches,
  onOpen,
  onPublishAll,
  onNew,
}: {
  matches: OpenMatchX[];
  onOpen: (id: string) => void;
  onPublishAll: () => void;
  onNew: () => void;
}) {
  const { data, now } = usePro();
  const today = localDate(now);
  const pending = matches.filter((m) => !m.publishedAt).length;
  const days = [...new Set(matches.map((m) => localDate(m.start)))];

  if (!matches.length) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={Users}
          title="Ningún partido abierto"
          body="Cuando un jugador quiera partido y le falte gente, créalo aquí. Franky lo completa con estudiantes de su nivel."
          action={
            <Button variant="dark" onClick={onNew}>
              <Plus className="h-4 w-4" /> Nuevo partido abierto
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet/25 bg-violet-50 px-4 py-3">
          <p className="text-sm text-violet-deep">
            <span className="font-semibold">
              {plural(pending, "partido sin publicar", "partidos sin publicar")}
              .
            </span>{" "}
            Publícalos y los verán estudiantes de nivel parecido que suelen
            jugar a esa hora.
          </p>
          <Button variant="dark" size="sm" onClick={onPublishAll}>
            <Send className="h-3.5 w-3.5" /> Publicar a estudiantes de nivel
            parecido
          </Button>
        </div>
      ) : null}

      {days.map((d) => (
        <section key={d}>
          <p className="eyebrow mb-2">
            {d === today
              ? "Hoy"
              : d === addDays(today, 1)
                ? "Mañana"
                : dayLabel(`${d}T12:00:00Z`)}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {matches
              .filter((m) => localDate(m.start) === d)
              .map((m) => {
                const r = data.resources.find((x) => x.id === m.resourceId);
                const price = r
                  ? priceFor(r, d, localMinutes(m.start), MATCH_MINUTES)
                  : 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpen(m.id)}
                    className="flex flex-col rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,transform] hover:-translate-y-px hover:border-text-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block font-heading text-lg font-bold tabular">
                          {time(m.start)}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {r?.name} ·{" "}
                          {price === null
                            ? "Precio según servicio"
                            : `${money(perPlayer(price))} por jugador`}
                        </span>
                      </span>
                      <Pill tone="violet">Nivel {m.level}</Pill>
                    </span>
                    <span className="mt-3 flex items-center gap-2">
                      <span className="flex -space-x-2">
                        {m.players.map((p) => (
                          <Avatar
                            key={p}
                            name={p}
                            size="sm"
                            tone="violet"
                            className="ring-2 ring-bg-primary"
                          />
                        ))}
                        {Array.from({ length: m.needed }, (_, i) => (
                          <span
                            key={i}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border bg-bg-primary text-xs text-text-muted ring-2 ring-bg-primary"
                          >
                            +
                          </span>
                        ))}
                      </span>
                      <span className="text-sm font-semibold">
                        Faltan {m.needed}
                      </span>
                    </span>
                    <Meter
                      value={m.players.length}
                      max={4}
                      className="mt-3"
                      tone={m.needed === 1 ? "warning" : "violet"}
                    />
                    <span className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-muted">
                        {m.university ? shortUni(m.university) : "Abierto"}
                      </span>
                      {m.publishedAt ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                          <Check className="h-3.5 w-3.5" /> Visto por{" "}
                          {m.reach ?? matchReach(m.level)} estudiantes
                        </span>
                      ) : (
                        <span className="font-semibold text-violet">
                          Sin publicar
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}

      <Tip title="Por qué funciona">
        Un jugador que se queda sin pareja se va a otro club. Con el partido
        abierto la pista se reserva igual, Franky busca a los que faltan entre
        estudiantes de nivel parecido y cada uno paga su parte. Tú no pagas nada
        por jugador.
      </Tip>
    </div>
  );
}
