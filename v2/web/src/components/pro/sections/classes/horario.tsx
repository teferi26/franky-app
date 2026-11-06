"use client";

import * as React from "react";
import { BadgeCheck, CalendarX2, Plus, QrCode, Users, Zap } from "lucide-react";
import type { HeatCell } from "@/lib/pro/classes-ops";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProClassSession } from "@/lib/pro/types";
import { addDays, localDate, localMinutes, minutesToLabel, pct, time, weekdayIndex } from "@/lib/pro/format";
import { FALLBACK_PER_PLAYER_CENTS, classCopy, freeSpots, isRoomMode, sessionState, sessionsOn, weekStart } from "@/lib/pro/classes";
import { isWeak, sessionExtra, setupMinutes, weakSessions, type ExamAhead } from "@/lib/pro/classes-ops";
import { cn } from "@/lib/utils";
import { Empty, Kpi, KpiRow, Meter, PageHeader, Pill, Segmented, StepNav, Tip } from "../../kit";
import { TONES } from "../../tones";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { FilterChip, NewSessionDrawer, SessionDrawer, capitalize, fillTone, type NewSessionPreset } from "./parts";
import { OccupancyHeatmap, TeamHours } from "./insights";
import { ExamStrip, IntensiveDrawer } from "./intensive";
import { DoorDrawer } from "./door";
import { NoticeboardButton } from "./study";

const HOUR = 64;

export default function HorarioSection() {
  const { data, now, vertical, demo, can, pending, loadDate } = usePro();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const [anchor, setAnchor] = React.useState(today);
  const [day, setDay] = React.useState(today);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewSessionPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [view, setView] = React.useState<"week" | "heat" | "hours">("week");
  const [exam, setExam] = React.useState<ExamAhead | null>(null);
  const [door, setDoor] = React.useState(false);

  const monday = weekStart(anchor);
  React.useEffect(() => { void loadDate(monday); }, [loadDate, monday]);
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const days = allDays.filter((d, i) => data.space.hours[i] || sessionsOn(data, d).length);
  const visible = (s: ProClassSession) => typeFilter === "all" || s.classTypeId === typeFilter;
  const week = data.sessions.filter((s) => {
    const d = localDate(s.start);
    return s.status !== "cancelled" && d >= monday && d < addDays(monday, 7) && visible(s);
  });
  const booked = week.reduce((a, s) => a + s.booked, 0);
  const capacity = week.reduce((a, s) => a + s.capacity, 0);
  const waiting = week.reduce((a, s) => a + s.waitlist, 0);
  const full = week.filter((s) => s.booked >= s.capacity).length;
  const title = navLabel(vertical.nav, copy);

  // La sesión que más sitio tiene de aquí en adelante: la que conviene ofrecer.
  const emptiest = week
    .filter((s) => sessionState(s, now) === "next" && freeSpots(s) >= 3)
    .sort((a, b) => b.capacity - b.booked - (a.capacity - a.booked) || a.start.localeCompare(b.start))[0];
  const emptiestType = emptiest ? data.classTypes.find((c) => c.id === emptiest.classTypeId) : undefined;

  const offerSession = (s: ProClassSession) => {
    const ct = data.classTypes.find((c) => c.id === s.classTypeId);
    const room = isRoomMode(data, ct);
    setOffer({
      what: `${ct?.name ?? "Clase"} de las ${time(s.start)}`,
      date: localDate(s.start),
      from: localMinutes(s.start),
      to: localMinutes(s.end),
      priceCents: vertical.id === "academy" ? 1800 : room ? FALLBACK_PER_PLAYER_CENTS : 1200,
      slots: room ? 1 : freeSpots(s),
    });
  };

  // Desde el mapa de ocupación: la próxima sesión de esa franja.
  const fillCell = (cell: HeatCell) => {
    const next = data.sessions
      .filter((s) => s.status !== "cancelled" && new Date(s.start).getTime() > now.getTime())
      .filter((s) => weekdayIndex(localDate(s.start)) === cell.day && Math.floor(localMinutes(s.start) / 60) === cell.hour)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (next) offerSession(next);
  };

  const weak = demo ? weakSessions(data, now, 7).filter(visible).slice(0, 8) : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={title}
        title={<span>{weekTitle(monday)}</span>}
        description={
          week.length
            ? `${week.length} ${copy.sessionMany}, ${pct(booked, capacity)} % de ocupación${full ? `, ${full} completas` : ""}${waiting ? ` y ${waiting} personas en lista de espera` : ""}.`
            : `Esta semana no hay ${copy.sessionMany}. Crea la primera y aparecerá en tu ficha de Franky.`
        }
        actions={
          <>
            {vertical.id === "academy" ? <NoticeboardButton /> : null}
            {vertical.id !== "culture" ? (
              <Button variant="outline" onClick={() => setDoor(true)}>
                <QrCode className="h-4 w-4" /> QR de la puerta
              </Button>
            ) : null}
            {demo ? <Button variant="outline" onClick={() => setPreset({ date: day, createType: true })}>
              <Plus className="h-4 w-4" /> {copy.newType}
            </Button> : null}
            <Button variant="dark" disabled={pending || !can("class.session.create")} onClick={() => setPreset({ date: day })}>
              <Plus className="h-4 w-4" /> {copy.newSession}
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Users} label="Ocupación de la semana" value={`${pct(booked, capacity)} %`} hint={`${booked} de ${capacity} plazas`} />
        <Kpi label={`${capitalize(copy.sessionMany)} completas`} value={full} hint={full ? "con la lista de espera abierta" : "todas con sitio"} />
        <Kpi label="En lista de espera" value={waiting} hint={waiting ? "pendientes de una plaza" : "nadie esperando"} />
        <Kpi
          icon={Zap}
          label="Plazas libres por delante"
          value={week.filter((s) => sessionState(s, now) === "next").reduce((a, s) => a + freeSpots(s), 0)}
          hint={emptiest ? demo ? "Ofrécelas a estudiantes" : "Plazas disponibles" : "Sin plazas libres"}
          emphasis={Boolean(emptiest)}
          onClick={demo && emptiest ? () => offerSession(emptiest) : undefined}
        />
      </KpiRow>

      <Segmented
        label="Vista"
        value={view}
        onChange={setView}
        options={[
          { value: "week", label: "Semana" },
          { value: "heat", label: "Ocupación" },
          { value: "hours", label: vertical.id === "academy" ? "Horas por profesor" : "Horas del equipo" },
        ]}
      />

      {view === "heat" ? <OccupancyHeatmap onFill={fillCell} /> : null}
      {view === "hours" ? <TeamHours /> : null}

      {view === "week" && vertical.id === "academy" ? <ExamStrip onPrepare={setExam} /> : null}

      {view === "week" && weak.length ? (
        <section aria-label="Sesiones flojas" className="flex flex-col gap-2">
          <p className="text-sm font-semibold">
            {copy.groups ? "Salas sin reservar esta semana." : "Van por debajo de la mitad."}{" "}
            <span className="font-normal text-text-muted">Ofrécelas a estudiantes en dos toques.</span>
          </p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pro-scroll">
            {weak.map((s) => {
              const ct = data.classTypes.find((c) => c.id === s.classTypeId);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => offerSession(s)}
                  className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl border border-dashed border-violet/40 bg-bg-primary px-3 py-2 text-left transition-colors hover:border-violet"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", TONES[ct?.tone ?? "slate"].dot)} />
                  <span>
                    <span className="block text-sm font-semibold">{ct?.name}</span>
                    <span className="block text-xs text-text-muted">
                      {new Date(s.start).toLocaleDateString("es-ES", { weekday: "short", timeZone: "Europe/Madrid" })} {time(s.start)}
                      {isRoomMode(data, ct) ? " · libre" : ` · ${s.booked}/${s.capacity}`}
                    </span>
                  </span>
                  <Zap className="h-3.5 w-3.5 text-violet" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {view === "week" ? (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepNav
          label=""
          onPrev={() => {
            setAnchor(addDays(anchor, -7));
            setDay(addDays(monday, -7));
          }}
          onNext={() => {
            setAnchor(addDays(anchor, 7));
            setDay(addDays(monday, 7));
          }}
          onToday={() => {
            setAnchor(today);
            setDay(today);
          }}
          isToday={weekStart(today) === monday}
        />
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5 pro-scroll">
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            Todas
          </FilterChip>
          {data.classTypes.map((c) => (
            <FilterChip key={c.id} active={typeFilter === c.id} onClick={() => setTypeFilter(c.id)}>
              <span className={cn("h-2 w-2 rounded-full", TONES[c.tone].dot)} />
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

      {week.length || days.length ? (
        <>
          <div className="hidden md:block">
            <WeekGrid days={days} visible={visible} onOpen={setOpen} onNew={(d, m) => setPreset({ date: d, minute: m })} />
          </div>
          <div className="md:hidden">
            <DayList
              days={days}
              day={days.includes(day) ? day : days[0]}
              setDay={setDay}
              visible={visible}
              onOpen={setOpen}
              onNew={(d) => setPreset({ date: d })}
            />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary">
          <Empty icon={CalendarX2} title="Semana cerrada" body="Cambia tu horario en Ajustes si abres de forma excepcional." />
        </div>
      )}

        </>
      ) : null}

      {view === "week" && demo && emptiest && emptiestType ? (
        <Tip title="Llena lo que va flojo">
          {emptiestType.name} del {new Date(emptiest.start).toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" })} a las {time(emptiest.start)} tiene{" "}
          {freeSpots(emptiest)} plazas libres.{" "}
          {vertical.id === "academy"
            ? `Franky se la enseña a los estudiantes de ${emptiestType.category} que tienen esa asignatura este cuatrimestre.`
            : vertical.id === "culture"
              ? "Franky la enseña a grupos de estudiantes que buscan plan esa tarde cerca de ti."
              : "Los estudiantes con hueco entre clases a esa hora la ven en Franky sin que pagues comisión."}{" "}
          <button type="button" onClick={() => offerSession(emptiest)} className="font-semibold text-violet">
            Ofrecer ahora
          </button>
        </Tip>
      ) : null}

      <SessionDrawer sessionId={open} onClose={() => setOpen(null)} onOffer={demo ? setOffer : undefined} />
      <NewSessionDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      <IntensiveDrawer exam={exam} onClose={() => setExam(null)} />
      <DoorDrawer open={door} onClose={() => setDoor(false)} />
    </div>
  );
}

function navLabel(nav: { id: string; label?: string }[], copy: ReturnType<typeof classCopy>) {
  return nav.find((n) => n.id === "horario")?.label ?? (copy.typeOne === "clase" ? "Horario" : capitalize(copy.sessionMany));
}

function weekTitle(monday: string) {
  const to = addDays(monday, 6);
  const f = new Date(`${monday}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `Semana del ${f} al ${t}`;
}

/* ------------------------------------------------------------------ */
/* Escritorio: semana completa                                         */
/* ------------------------------------------------------------------ */

function WeekGrid({
  days,
  visible,
  onOpen,
  onNew,
}: {
  days: string[];
  visible: (s: ProClassSession) => boolean;
  onOpen: (id: string) => void;
  onNew: (date: string, minute: number) => void;
}) {
  const { data, now, pending, can } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const all = days.flatMap((d) => sessionsOn(data, d));
  const openHours = data.space.hours.filter(Boolean) as { open: number; close: number }[];
  const startMin = Math.floor(Math.min(...all.map((s) => localMinutes(s.start)), ...(all.length ? [] : openHours.map((h) => h.open)), 24 * 60) / 60) * 60;
  const endMin = Math.ceil(Math.max(...all.map((s) => localMinutes(s.end)), ...(all.length ? [] : openHours.map((h) => h.close)), startMin + 60) / 60) * 60;
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60);
  const height = ((endMin - startMin) / 60) * HOUR;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="overflow-x-auto pro-scroll">
        <div style={{ minWidth: `${56 + days.length * 130}px` }}>
          <div className="sticky top-0 z-20 grid border-b border-border bg-bg-primary" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => {
              const list = sessionsOn(data, d).filter(visible);
              const b = list.reduce((a, s) => a + s.booked, 0);
              const c = list.reduce((a, s) => a + s.capacity, 0);
              return (
                <div key={d} className={cn("border-l border-border-light px-3 py-2.5", d === today && "bg-violet-50/60 dark:bg-violet-950/20")}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short" })}
                  </p>
                  <p className={cn("font-heading text-lg font-bold leading-tight", d === today && "text-violet")}>{Number(d.slice(8))}</p>
                  <p className="text-xs text-text-muted tabular">{list.length ? `${list.length} · ${pct(b, c)} %` : "Sin sesiones"}</p>
                </div>
              );
            })}
          </div>

          <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`, height }}>
            <div className="relative">
              {hours.map((m) => (
                <span key={m} className="absolute right-2 -translate-y-1/2 text-[0.7rem] font-medium text-text-muted tabular" style={{ top: ((m - startMin) / 60) * HOUR }}>
                  {m > startMin ? minutesToLabel(m) : ""}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const list = sessionsOn(data, d).filter(visible);
              const { lane: lanes, lanes: laneCounts } = assignLanes(list);
              const past = d < today;
              return (
                <div key={d} className={cn("relative border-l border-border-light", d === today && "bg-violet-50/30 dark:bg-violet-950/10")}>
                  {hours.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={past || pending || !can("class.session.create")}
                      onClick={() => onNew(d, m)}
                      aria-label={`Nueva sesión el ${d} a las ${minutesToLabel(m)}`}
                      className="group block w-full border-t border-border-light text-left transition-colors hover:bg-bg-secondary/70 focus-visible:bg-bg-secondary focus-visible:outline-none disabled:pointer-events-none"
                      style={{ height: HOUR }}
                    >
                      <span className="hidden items-center gap-1 pl-2 pt-1 text-[0.68rem] font-semibold text-violet group-hover:flex group-focus-visible:flex">
                        <Plus className="h-3 w-3" /> {minutesToLabel(m)}
                      </span>
                    </button>
                  ))}
                  {list.map((s) => {
                    // Franja de montaje de la sala después de cada partida.
                    const setup = setupMinutes(data, s);
                    if (!setup) return null;
                    const endTop = ((localMinutes(s.end) - startMin) / 60) * HOUR;
                    return (
                      <div
                        key={`${s.id}-setup`}
                        aria-hidden
                        title={`Montaje ${setup} min`}
                        className="pointer-events-none absolute inset-x-1 z-[4] rounded-md border border-dashed border-border bg-bg-secondary"
                        style={{ top: endTop, height: Math.max(4, (setup / 60) * HOUR - 2) }}
                      />
                    );
                  })}
                  {list.map((s) => (
                    <SessionBlock
                      key={s.id}
                      session={s}
                      top={((localMinutes(s.start) - startMin) / 60) * HOUR}
                      height={((localMinutes(s.end) - localMinutes(s.start)) / 60) * HOUR}
                      lane={lanes.get(s.id) ?? 0}
                      lanes={laneCounts.get(s.id) ?? 1}
                      onOpen={onOpen}
                    />
                  ))}
                  {d === today && nowMin >= startMin && nowMin <= endMin ? (
                    <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - startMin) / 60) * HOUR }}>
                      <span className="h-2 w-2 -translate-x-1/2 rounded-full bg-rose-500" />
                      <span className="h-px flex-1 bg-rose-500" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reparte en carriles las clases que coinciden. Cada grupo de clases que se
 * solapan entre sí tiene su propio número de carriles: una clase sola a las
 * 7:00 ocupa todo el ancho aunque a las 17:00 haya dos a la vez.
 */
function assignLanes(list: ProClassSession[]): { lane: Map<string, number>; lanes: Map<string, number> } {
  const lane = new Map<string, number>();
  const lanes = new Map<string, number>();
  let group: ProClassSession[] = [];
  let ends: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    for (const s of group) lanes.set(s.id, Math.max(1, ends.length));
    group = [];
    ends = [];
  };
  for (const s of [...list].sort((a, b) => a.start.localeCompare(b.start))) {
    const from = new Date(s.start).getTime();
    const to = new Date(s.end).getTime();
    if (from >= groupEnd) flush();
    let l = ends.findIndex((e) => e <= from);
    if (l < 0) {
      l = ends.length;
      ends.push(0);
    }
    ends[l] = to;
    lane.set(s.id, l);
    group.push(s);
    groupEnd = Math.max(groupEnd, to);
  }
  flush();
  return { lane, lanes };
}

function SessionBlock({
  session: s,
  top,
  height,
  lane,
  lanes,
  onOpen,
}: {
  session: ProClassSession;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  onOpen: (id: string) => void;
}) {
  const { data, now, vertical } = usePro();
  const ct = data.classTypes.find((c) => c.id === s.classTypeId);
  const tone = TONES[ct?.tone ?? "slate"];
  const state = sessionState(s, now);
  const perGroup = isRoomMode(data, ct);
  const width = 100 / lanes;
  const roomy = height >= 56;
  const weak = isWeak(data, s, now);
  const english = sessionExtra(data, s.id).language === "en";

  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      aria-label={`${ct?.name}, ${time(s.start)}, ${s.booked} de ${s.capacity} plazas`}
      className={cn(
        "absolute z-[5] overflow-hidden rounded-lg text-left transition-[transform,box-shadow] duration-200 hover:z-[6] hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
        tone.block,
        state === "past" && "opacity-55",
        state === "live" && "ring-2 ring-offset-1 ring-offset-bg-primary " + tone.ring,
        weak && "outline-dashed outline-1 -outline-offset-1 outline-violet/60",
      )}
      style={{ top: top + 2, height: height - 4, left: `calc(${lane * width}% + 3px)`, width: `calc(${width}% - 6px)` }}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar)} />
      <span className={cn("flex h-full flex-col gap-0.5 px-2 py-1.5 pl-2.5", tone.text)}>
        <span className="truncate text-[0.8rem] font-bold leading-tight">{ct?.name}</span>
        {roomy ? (
          <span className="truncate text-[0.7rem] opacity-75">
            {vertical.id === "academy" ? ct?.category : `${time(s.start)} · ${s.room}`}
          </span>
        ) : null}
        <span className="mt-auto flex items-center gap-1.5 text-[0.72rem] font-semibold tabular">
          {perGroup ? (
            <span>{s.booked ? `Grupo de ${s.booked}` : "Libre"}</span>
          ) : (
            <span>
              {s.booked}/{s.capacity}
            </span>
          )}
          {s.waitlist ? <span className="rounded-full bg-rose-500/15 px-1.5 text-rose-700 dark:text-rose-300">+{s.waitlist}</span> : null}
          {english ? <span className="rounded-full bg-bg-primary/70 px-1.5 text-[0.62rem] uppercase">EN</span> : null}
          {weak && !perGroup ? <span className="text-[0.62rem] uppercase tracking-wider text-violet">Floja</span> : null}
          {state === "live" ? <span className="ml-auto text-[0.65rem] uppercase tracking-wider">Ahora</span> : null}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Móvil: un día cada vez                                              */
/* ------------------------------------------------------------------ */

function DayList({
  days,
  day,
  setDay,
  visible,
  onOpen,
  onNew,
}: {
  days: string[];
  day: string;
  setDay: (d: string) => void;
  visible: (s: ProClassSession) => boolean;
  onOpen: (id: string) => void;
  onNew: (date: string) => void;
}) {
  const { data, now, vertical, pending, can } = usePro();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const list = sessionsOn(data, day).filter(visible);

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pro-scroll">
        {days.map((d) => {
          const count = sessionsOn(data, d).filter(visible).length;
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              onClick={() => setDay(d)}
              className={cn(
                "flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border transition-colors",
                active ? "border-text-primary bg-text-primary text-bg-primary" : "border-border bg-bg-primary text-text-secondary",
              )}
            >
              <span className="text-[0.68rem] font-semibold uppercase">{new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short" })}</span>
              <span className={cn("font-heading text-lg font-bold leading-none", !active && d === today && "text-violet")}>{Number(d.slice(8))}</span>
              <span className={cn("mt-0.5 text-[0.62rem] tabular", active ? "text-bg-primary/70" : "text-text-muted")}>{count}</span>
            </button>
          );
        })}
      </div>

      {list.length ? (
        <ul className="flex flex-col gap-2">
          {list.map((s) => {
            const ct = data.classTypes.find((c) => c.id === s.classTypeId);
            const coach = data.staff.find((x) => x.id === s.coachId);
            const state = sessionState(s, now);
            const tone = TONES[ct?.tone ?? "slate"];
            const perGroup = isRoomMode(data, ct);
            const weakOne = isWeak(data, s, now);
            const english = sessionExtra(data, s.id).language === "en";
            const setup = setupMinutes(data, s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className={cn(
                    "flex w-full items-stretch gap-3 rounded-2xl border border-border bg-bg-primary p-3 text-left shadow-card transition-colors hover:border-text-primary/20",
                    state === "past" && "opacity-60",
                    state === "live" && "border-violet/40",
                  )}
                >
                  <span className="flex w-12 shrink-0 flex-col">
                    <span className="font-heading text-[0.95rem] font-bold tabular">{time(s.start)}</span>
                    <span className="text-xs text-text-muted tabular">{time(s.end)}</span>
                  </span>
                  <span className={cn("w-1 shrink-0 rounded-full", tone.bar)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{ct?.name}</span>
                      {state === "live" ? <Pill tone="success">Ahora</Pill> : null}
                      {english ? <Pill tone="info">EN</Pill> : null}
                      {weakOne && !perGroup ? <Pill tone="violet">Floja</Pill> : null}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {vertical.id === "academy" ? `${ct?.category} · ` : ""}
                      {coach?.name.split(" ")[0]} · {s.room}
                      {setup ? ` · montaje ${setup} min` : ""}
                    </span>
                    <span className="mt-2 flex items-center gap-2">
                      <Meter value={s.booked} max={s.capacity} className="flex-1" tone={fillTone(s) === "danger" ? "danger" : fillTone(s) === "warning" ? "warning" : "violet"} />
                      <span className="shrink-0 text-xs font-semibold tabular">
                        {perGroup ? (s.booked ? `Grupo de ${s.booked}` : "Libre") : `${s.booked}/${s.capacity}`}
                      </span>
                      {s.waitlist ? <Pill tone="danger">+{s.waitlist}</Pill> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary">
          <Empty
            icon={CalendarX2}
            title={`Sin ${copy.sessionMany} este día`}
            body={`Crea una ${copy.sessionOne} y tus ${copy.members} la podrán reservar en Franky.`}
            action={
              day >= today ? (
                <Button variant="outline" disabled={pending || !can("class.session.create")} onClick={() => onNew(day)}>
                  <Plus className="h-4 w-4" /> {copy.newSession}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      <p className="flex items-center gap-1.5 px-1 text-xs text-text-muted">
        <BadgeCheck className="h-3.5 w-3.5 text-violet" /> Toca una {copy.sessionOne} para pasar lista o gestionar la espera.
      </p>
    </div>
  );
}
