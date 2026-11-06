"use client";

import * as React from "react";
import { CalendarX2, Lock, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProAgendaBlock } from "@/lib/pro/agenda-types";
import {
  addDays,
  capitalize,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  weekdayIndex,
} from "@/lib/pro/format";
import {
  absenceOn,
  blocksOn,
  bookingDaySpan,
  bookingsOn,
  daySummary,
  freeGaps,
  hoursOn,
  openingIntervals,
  startTimes,
  type Gap,
} from "@/lib/pro/agenda";
import { cn } from "@/lib/utils";
import { Avatar, Empty, PageHeader, Segmented, StepNav } from "../../kit";
import { TONES } from "../../tones";
import {
  BookingDrawer,
  NewBookingDrawer,
  type NewBookingPreset,
} from "./booking-drawers";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { BlockDrawer, BlockInfoDrawer, type BlockPreset } from "./block-drawer";
import {
  BlockBlock,
  BookingBlock,
  CabinGrid,
  CategoryLegend,
  ROW,
  SLOT,
  bookingTone,
  nestedInPose,
  type ColorBy,
} from "./grid-parts";

const COLOR_KEY = "franky-pro-agenda-color";

/** Cómo se colorea la agenda: se recuerda en este dispositivo. */
function useColorBy() {
  const [colorBy, setColorBy] = React.useState<ColorBy>("staff");
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLOR_KEY);
      if (saved === "category" || saved === "staff") setColorBy(saved);
    } catch {
      // Sin almacenamiento: por profesional.
    }
  }, []);
  const choose = (value: ColorBy) => {
    setColorBy(value);
    try {
      window.localStorage.setItem(COLOR_KEY, value);
    } catch {
      // Vale para esta visita.
    }
  };
  return [colorBy, choose] as const;
}

export default function AgendaSection() {
  const { data, now, loadDate, can, pending } = usePro();
  const today = localDate(now);
  const [date, setDate] = React.useState(today);
  const [view, setView] = React.useState<"day" | "week">("day");
  const [staffFilter, setStaffFilter] = React.useState<string>("all");
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewBookingPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [blockPreset, setBlockPreset] = React.useState<BlockPreset>(null);
  const [openBlock, setOpenBlock] = React.useState<ProAgendaBlock | null>(null);
  const [columns, setColumns] = React.useState<"staff" | "cabin">("staff");
  const [colorBy, setColorBy] = useColorBy();
  const ops = data.agendaOps;
  const canBlock = Boolean(ops) && !pending && can("agenda.block");
  const hasCabins = Boolean(ops?.cabins.length);

  React.useEffect(() => {
    void loadDate(view === "week" ? weekStart(date) : date);
  }, [date, view, loadDate]);

  // En móvil empezamos con la vista de día; en escritorio también: es la que se usa trabajando.
  const nowMin = localMinutes(now);
  const summary = daySummary(data, date, date === today ? nowMin : 0);
  const gaps =
    date >= today ? freeGaps(data, date, date === today ? nowMin : 0, 30) : [];
  const staff =
    staffFilter === "all"
      ? data.staff
      : data.staff.filter((s) => s.id === staffFilter);

  const title =
    view === "day" ? dayLabel(`${date}T12:00:00Z`) : weekTitle(date);

  return (
    <div>
      <PageHeader
        eyebrow="Agenda"
        title={capitalize(title)}
        description={
          view === "day"
            ? `${summary.total} ${summary.total === 1 ? "cita" : "citas"} · ${gaps.length} ${gaps.length === 1 ? "hueco libre" : "huecos libres"}${can("finance.read") ? ` · ${money(summary.expectedCents, { round: true })} previstos` : ""}`
            : "Toca un día para verlo por profesional."
        }
        actions={
          <>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: "day", label: "Día" },
                { value: "week", label: "Semana" },
              ]}
            />
            {ops ? (
              <Button
                variant="outline"
                disabled={!canBlock}
                onClick={() =>
                  setBlockPreset({
                    date,
                    staffId: staffFilter === "all" ? undefined : staffFilter,
                  })
                }
              >
                <Lock className="h-4 w-4" /> Bloquear
              </Button>
            ) : null}
            <Button
              variant="dark"
              disabled={pending || !can("booking.create")}
              onClick={() =>
                setPreset({
                  date,
                  staffId: staffFilter === "all" ? undefined : staffFilter,
                })
              }
            >
              <Plus className="h-4 w-4" /> Nueva cita
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <StepNav
          label={
            view === "day" && date === addDays(today, 1)
              ? "Mañana"
              : view === "day" && date === addDays(today, -1)
                ? "Ayer"
                : ""
          }
          onPrev={() => setDate(addDays(date, view === "day" ? -1 : -7))}
          onNext={() => setDate(addDays(date, view === "day" ? 1 : 7))}
          onToday={() => setDate(today)}
          isToday={date === today}
        />
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pro-scroll">
          <Segmented
            size="sm"
            label="Color de las citas"
            value={colorBy}
            onChange={setColorBy}
            options={[
              { value: "staff", label: "Color por persona" },
              { value: "category", label: "Por servicio" },
            ]}
            className="mr-1.5 shrink-0"
          />
          {hasCabins && view === "day" ? (
            <Segmented
              size="sm"
              label="Columnas"
              value={columns}
              onChange={setColumns}
              options={[
                { value: "staff", label: "Por profesional" },
                { value: "cabin", label: "Por cabina" },
              ]}
              className="mr-1.5 shrink-0"
            />
          ) : null}
          <FilterChip
            active={staffFilter === "all"}
            onClick={() => setStaffFilter("all")}
          >
            Todos
          </FilterChip>
          {data.staff
            .filter((s) =>
              data.services.some((sv) => sv.staffIds.includes(s.id)),
            )
            .map((s) => (
              <FilterChip
                key={s.id}
                active={staffFilter === s.id}
                onClick={() => setStaffFilter(s.id)}
              >
                <span
                  className={cn("h-2 w-2 rounded-full", TONES[s.tone].dot)}
                />
                {s.name.split(" ")[0]}
              </FilterChip>
            ))}
        </div>
      </div>

      {colorBy === "category" ? <CategoryLegend data={data} /> : null}

      {view === "day" && columns === "cabin" && hasCabins ? (
        <CabinGrid
          date={date}
          colorBy={colorBy}
          onOpen={setOpenBooking}
          onNew={(minute, serviceId) => setPreset({ date, minute, serviceId })}
        />
      ) : view === "day" ? (
        <DayGrid
          date={date}
          staffIds={staff
            .filter((s) =>
              data.services.some((sv) => sv.staffIds.includes(s.id)),
            )
            .map((s) => s.id)}
          gaps={gaps}
          colorBy={colorBy}
          onOpen={setOpenBooking}
          onNew={(staffId, minute) => setPreset({ date, staffId, minute })}
          onOffer={(g) => setOffer({ gap: g })}
          onBlock={
            canBlock
              ? (staffId, minute) => setBlockPreset({ date, staffId, minute })
              : undefined
          }
          onOpenBlock={canBlock ? setOpenBlock : undefined}
        />
      ) : (
        <WeekGrid
          date={date}
          staffFilter={staffFilter}
          colorBy={colorBy}
          onOpen={setOpenBooking}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      )}

      <BookingDrawer
        bookingId={openBooking}
        onClose={() => setOpenBooking(null)}
        onNewBooking={setPreset}
      />
      <NewBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      {/* Solo se montan al usarse: la agenda no carga lo que no se abre. */}
      {blockPreset ? (
        <BlockDrawer
          preset={blockPreset}
          onClose={() => setBlockPreset(null)}
        />
      ) : null}
      {openBlock ? (
        <BlockInfoDrawer block={openBlock} onClose={() => setOpenBlock(null)} />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.82rem] font-semibold transition-colors",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Vista de día: una columna por profesional                           */
/* ------------------------------------------------------------------ */

function DayGrid({
  date,
  staffIds,
  gaps,
  colorBy,
  onOpen,
  onNew,
  onOffer,
  onBlock,
  onOpenBlock,
}: {
  date: string;
  staffIds: string[];
  gaps: Gap[];
  colorBy: ColorBy;
  onOpen: (id: string) => void;
  onNew: (staffId: string, minute: number) => void;
  onOffer: (gap: Gap) => void;
  /** Mantener pulsado un hueco (o clic derecho) para bloquearlo. */
  onBlock?: (staffId: string, minute: number) => void;
  onOpenBlock?: (block: ProAgendaBlock) => void;
}) {
  const { data, now, can, pending } = usePro();
  const press = React.useRef<{ timer: number | null; fired: boolean }>({
    timer: null,
    fired: false,
  });
  const startPress = (staffId: string, minute: number) => {
    if (!onBlock) return;
    press.current.fired = false;
    press.current.timer = window.setTimeout(() => {
      press.current.fired = true;
      onBlock(staffId, minute);
    }, 550);
  };
  const endPress = () => {
    if (press.current.timer) window.clearTimeout(press.current.timer);
    press.current.timer = null;
  };
  const hours = hoursOn(data, date);
  const visible = bookingsOn(data, date).filter((booking) =>
    staffIds.some(
      (id) => booking.staffId === id || booking.resourceIds?.includes(id),
    ),
  );
  const spans = visible.map((booking) => bookingDaySpan(booking, date)!);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const today = localDate(now);
  const nowMin = localMinutes(now);

  const start =
    Math.floor(
      Math.min(hours?.open ?? 540, ...spans.map((span) => span.from)) / 60,
    ) * 60;
  const end =
    Math.ceil(
      Math.max(hours?.close ?? 1200, ...spans.map((span) => span.to)) / 60,
    ) * 60;
  const rows = (end - start) / SLOT;

  // Al abrir hoy, colocamos la línea de "ahora" a la vista.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const y = date === today ? ((nowMin - start) / SLOT) * ROW - 120 : 0;
    el.scrollTo({ top: Math.max(0, y) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!hours && !visible.length) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={CalendarX2}
          title="Cerrado este día"
          body="Cambia tu horario en Ajustes si abres de forma excepcional."
        />
      </div>
    );
  }

  const hourMarks = Array.from(
    { length: (end - start) / 60 + 1 },
    (_, i) => start + i * 60,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div
        ref={scrollRef}
        className="max-h-[calc(100dvh-15rem)] min-h-[420px] overflow-auto pro-scroll"
      >
        <div
          className="relative"
          style={{ minWidth: `${56 + staffIds.length * 150}px` }}
        >
          {/* Cabecera pegajosa con cada profesional */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-bg-primary/95 backdrop-blur">
            <div className="w-14 shrink-0" />
            {staffIds.map((id) => {
              const s = data.staff.find((x) => x.id === id)!;
              const count = bookingsOn(data, date, id).filter(
                (b) => b.status !== "no_show",
              ).length;
              const absence = absenceOn(data, date, id);
              return (
                <div
                  key={id}
                  className="flex min-w-[150px] flex-1 items-center gap-2.5 border-l border-border-light px-3 py-2.5"
                >
                  <Avatar name={s.name} tone={s.tone} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {s.name.split(" ")[0]}
                    </p>
                    <p className="text-xs text-text-muted">
                      {absence
                        ? absence.reason
                        : `${count} ${count === 1 ? "cita" : "citas"}`}
                      {s.clockedInAt && date === today ? " · fichado" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height: rows * ROW }}>
            {/* Columna de horas */}
            <div className="relative w-14 shrink-0">
              {hourMarks.map((m) => (
                <span
                  key={m}
                  className="absolute right-2 -translate-y-1/2 text-[0.7rem] font-medium text-text-muted tabular"
                  style={{ top: ((m - start) / SLOT) * ROW }}
                >
                  {m < end ? minutesToLabel(m) : ""}
                </span>
              ))}
            </div>

            {/* Rejilla de fondo */}
            <div className="pointer-events-none absolute inset-y-0 left-14 right-0">
              {Array.from({ length: rows }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "border-t",
                    (start + i * SLOT) % 60 === 0
                      ? "border-border-light"
                      : "border-transparent",
                  )}
                  style={{ height: ROW }}
                />
              ))}
            </div>

            {staffIds.map((id) => {
              const s = data.staff.find((x) => x.id === id)!;
              const list = bookingsOn(data, date, id);
              const nested = nestedInPose(data, list);
              const absence = absenceOn(data, date, id);
              const staffGaps = gaps.filter((g) => g.staffId === id);
              const available = new Set(
                startTimes(
                  data,
                  date,
                  id,
                  SLOT,
                  date < today ? 1440 : date === today ? nowMin + 1 : 0,
                ),
              );
              return (
                <div
                  key={id}
                  className="relative min-w-[150px] flex-1 border-l border-border-light"
                >
                  {/* Huecos pulsables para citar */}
                  {Array.from({ length: rows }, (_, i) => {
                    const minute = start + i * SLOT;
                    const closed = !openingIntervals(data, date, id).some(
                      (shift) =>
                        minute >= shift.open && minute + SLOT <= shift.close,
                    );
                    return (
                      <button
                        key={minute}
                        type="button"
                        disabled={
                          pending ||
                          !can("booking.create") ||
                          closed ||
                          !available.has(minute)
                        }
                        aria-label={`Nueva cita a las ${minutesToLabel(minute)} con ${s.name.split(" ")[0]}`}
                        onClick={() => {
                          // Tras mantener pulsado ya se abrió el bloqueo.
                          if (press.current.fired) {
                            press.current.fired = false;
                            return;
                          }
                          onNew(id, minute);
                        }}
                        onPointerDown={() => startPress(id, minute)}
                        onPointerUp={endPress}
                        onPointerLeave={endPress}
                        onPointerCancel={endPress}
                        onContextMenu={(e) => {
                          if (!onBlock) return;
                          e.preventDefault();
                          endPress();
                          onBlock(id, minute);
                        }}
                        className={cn(
                          "group absolute inset-x-1 rounded-md transition-colors hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none disabled:pointer-events-none",
                          closed && "bg-bg-secondary/70",
                        )}
                        style={{
                          top: ((minute - start) / SLOT) * ROW,
                          height: ROW,
                        }}
                      >
                        <span className="hidden items-center gap-1 pl-1.5 text-[0.68rem] font-semibold text-violet group-hover:flex group-focus-visible:flex">
                          <Plus className="h-3 w-3" /> {minutesToLabel(minute)}
                        </span>
                      </button>
                    );
                  })}

                  {/* Huecos libres que se pueden ofrecer a estudiantes */}
                  {staffGaps.map((g) => {
                    const top = ((g.from - start) / SLOT) * ROW;
                    const height = ((g.to - g.from) / SLOT) * ROW;
                    if (height < ROW * 2) return null;
                    return (
                      <div
                        key={`${g.staffId}-${g.from}`}
                        className="pointer-events-none absolute inset-x-1.5 rounded-lg border border-dashed border-violet/35"
                        style={{ top: top + 2, height: height - 4 }}
                      >
                        <button
                          type="button"
                          onClick={() => onOffer(g)}
                          aria-label="Ofrecer a estudiantes"
                          className="pointer-events-auto absolute bottom-1.5 left-1.5 inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1 whitespace-nowrap rounded-full bg-violet px-2 py-0.5 text-[0.68rem] font-semibold text-white shadow-card transition-transform hover:-translate-y-px"
                        >
                          <Zap className="h-3 w-3 shrink-0" />
                          {/* En columnas estrechas (móvil) cabe solo el verbo. */}
                          <span className="truncate sm:hidden">Ofrecer</span>
                          <span className="hidden truncate sm:inline">
                            Ofrecer a estudiantes
                          </span>
                        </button>
                      </div>
                    );
                  })}

                  {blocksOn(data, date, id).map((block) => (
                    <BlockBlock
                      key={block.id}
                      block={block}
                      start={start}
                      onOpen={onOpenBlock}
                    />
                  ))}

                  {absence ? (
                    <p className="pointer-events-none absolute inset-x-1 top-2 z-[3] rounded-lg bg-bg-secondary px-2 py-1.5 text-center text-xs font-semibold text-text-muted">
                      {absence.reason}
                    </p>
                  ) : null}

                  {list.map((b) => (
                    <BookingBlock
                      key={b.id}
                      booking={b}
                      date={date}
                      start={start}
                      onOpen={onOpen}
                      nested={nested.has(b.id)}
                      colorBy={colorBy}
                    />
                  ))}
                </div>
              );
            })}

            {/* Línea de ahora */}
            {date === today && nowMin >= start && nowMin <= end ? (
              <div
                className="pointer-events-none absolute left-11 right-0 z-10 flex items-center"
                style={{ top: ((nowMin - start) / SLOT) * ROW }}
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

/* ------------------------------------------------------------------ */
/* Vista de semana                                                     */
/* ------------------------------------------------------------------ */

function weekStart(date: string) {
  return addDays(date, -weekdayIndex(date));
}

function weekTitle(date: string) {
  const from = weekStart(date);
  const to = addDays(from, 6);
  const f = new Date(`${from}T12:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
  return `Semana del ${f} al ${t}`;
}

function WeekGrid({
  date,
  staffFilter,
  colorBy,
  onOpen,
  onDay,
}: {
  date: string;
  staffFilter: string;
  colorBy: ColorBy;
  onOpen: (id: string) => void;
  onDay: (date: string) => void;
}) {
  const { data, now } = usePro();
  const today = localDate(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const hours = days
    .map((day) => hoursOn(data, day))
    .filter((value) => value !== null);
  const spans = days.flatMap((day) =>
    bookingsOn(data, day).map((booking) => bookingDaySpan(booking, day)!),
  );
  const open = Math.min(
    ...(hours.length ? hours.map((h) => h.open) : [540]),
    ...spans.map((span) => span.from),
  );
  const close = Math.max(
    ...(hours.length ? hours.map((h) => h.close) : [1200]),
    ...spans.map((span) => span.to),
  );
  const start = Math.floor(open / 60) * 60;
  const end = Math.ceil(close / 60) * 60;
  const rowH = 12;
  const lanes = data.staff.filter(
    (s) =>
      (staffFilter === "all" || s.id === staffFilter) &&
      data.services.some((sv) => sv.staffIds.includes(s.id)),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="overflow-x-auto pro-scroll">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border">
            <div />
            {days.map((d) => {
              const count = bookingsOn(data, d).filter(
                (b) => staffFilter === "all" || b.staffId === staffFilter,
              ).length;
              const closed = !hoursOn(data, d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDay(d)}
                  className="flex flex-col items-start border-l border-border-light px-3 py-2.5 text-left transition-colors hover:bg-bg-secondary"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", {
                      weekday: "short",
                    })}
                  </span>
                  <span
                    className={cn(
                      "font-heading text-lg font-bold",
                      d === today && "text-violet",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className="text-xs text-text-muted">
                    {closed && !count ? "Cerrado" : plural(count, "cita", "citas")}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="relative grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
            style={{ height: ((end - start) / SLOT) * rowH }}
          >
            <div className="relative">
              {Array.from(
                { length: (end - start) / 60 },
                (_, i) => start + i * 60,
              ).map((m) => (
                <span
                  key={m}
                  className="absolute right-1.5 -translate-y-1/2 text-[0.65rem] text-text-muted tabular"
                  style={{ top: ((m - start) / SLOT) * rowH }}
                >
                  {minutesToLabel(m)}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const list = bookingsOn(data, d).filter((b) =>
                lanes.some((l) => l.id === b.staffId),
              );
              const closed = !hoursOn(data, d);
              return (
                <div
                  key={d}
                  className={cn(
                    "relative border-l border-border-light",
                    closed && "bg-bg-secondary/70",
                  )}
                >
                  {Array.from({ length: (end - start) / 60 }, (_, i) => (
                    <div
                      key={i}
                      className="border-t border-border-light"
                      style={{ height: (60 / SLOT) * rowH }}
                    />
                  ))}
                  {list.map((b) => {
                    const lane = lanes.findIndex((l) => l.id === b.staffId);
                    const tone = TONES[bookingTone(data, b, colorBy)];
                    const { from, to } = bookingDaySpan(b, d)!;
                    const width = 100 / lanes.length;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onOpen(b.id)}
                        title={`${minutesToLabel(from)} ${b.clientName}`}
                        className={cn(
                          "absolute overflow-hidden rounded-[5px] px-1 text-left text-[0.62rem] font-semibold leading-tight transition-opacity hover:opacity-80",
                          tone.block,
                          tone.text,
                          b.status === "requested" &&
                            "border border-dashed border-amber-500",
                          (b.status === "done" || b.status === "no_show") &&
                            "opacity-55",
                        )}
                        style={{
                          top: ((from - start) / SLOT) * rowH + 1,
                          height: Math.max(
                            rowH,
                            ((to - from) / SLOT) * rowH - 2,
                          ),
                          left: `calc(${lane * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                        }}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 w-[2px]",
                            tone.bar,
                          )}
                        />
                        <span className="block truncate pl-0.5">
                          {b.clientName.split(" ")[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
