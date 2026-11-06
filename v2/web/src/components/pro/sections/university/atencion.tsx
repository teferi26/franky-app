"use client";

import * as React from "react";
import { CalendarClock, CalendarPlus, Clock3, LifeBuoy, MapPin, UserX, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { capitalize, dayLabel, localDate, minutesToLabel, shortDay } from "@/lib/pro/format";
import {
  APPOINTMENT_STATUS_LABEL,
  DESK_LABEL,
  dayAgenda,
  daySummary,
  helpCountLabel,
  helpTrend,
  noShowRate,
  officeOf,
  openDays,
  weekLoad,
  weekStart,
  type OfficeCell,
  type OfficeColumn,
} from "@/lib/pro/university-office";
import type { ProUniAppointmentStatus } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { Empty, Kpi, KpiRow, PageHeader, Pill } from "../../kit";
import { AppointmentDrawer, BookDrawer, DemandPanel, HelpPanel, SlotDrawer, SlotsPanel } from "./atencion-parts";

const STATUS_TONE: Record<ProUniAppointmentStatus, "neutral" | "success" | "danger" | "info"> = {
  booked: "info",
  done: "success",
  no_show: "danger",
  cancelled: "neutral",
};

export default function UniversityAtencion() {
  const { data, now } = usePro();
  const office = officeOf(data);
  const today = localDate(now);
  const days = openDays(office, today, 10);
  // Si hoy no se atiende (fin de semana), se abre el siguiente día con franjas.
  const [day, setDay] = React.useState<string | null>(null);
  const selected = day && days.includes(day) ? day : days[0] ?? today;

  const [slotEditing, setSlotEditing] = React.useState<string | "new" | null>(null);
  const [booking, setBooking] = React.useState<OfficeCell | null>(null);
  const [openAppointment, setOpenAppointment] = React.useState<string | null>(null);

  const columns = dayAgenda(office, selected, now);
  const summary = daySummary(columns);
  // Carga de cada día de las semanas que salen en la tira de días.
  const load = new Map(
    [...new Set(days.map(weekStart))].flatMap((monday) => weekLoad(office, monday)).map((d) => [d.date, d]),
  );
  const trend = helpTrend(office.helpWeeks, now);
  const noShow = noShowRate(office.appointments, now);
  const isToday = selected === today;
  const dayName = isToday ? "Hoy" : capitalize(dayLabel(`${selected}T12:00:00Z`));

  const description = office.slots.length
    ? `${dayName}: ${summary.booked === 1 ? "1 cita pendiente" : `${summary.booked} citas pendientes`} y ${
        summary.free === 1 ? "1 hueco libre" : `${summary.free} huecos libres`
      }${summary.next ? `. La siguiente, a las ${minutesToLabel(summary.next.start)}` : ""}.`
    : "Publica tus franjas y los estudiantes piden hueco desde Franky, sin colas en el mostrador.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Atención al estudiante"
        title="Horas de atención"
        description={description}
        actions={
          <Button variant="dark" onClick={() => setSlotEditing("new")}>
            <CalendarPlus className="h-4 w-4" /> Publicar franja
          </Button>
        }
      >
        {days.length ? (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pro-scroll" role="tablist" aria-label="Día">
            {days.map((d) => {
              const active = d === selected;
              const info = load.get(d);
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDay(d)}
                  className={cn(
                    "flex min-h-12 min-w-[84px] shrink-0 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition-colors",
                    active
                      ? "border-text-primary bg-text-primary text-bg-primary"
                      : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  <span className="text-[0.82rem] font-semibold">{d === today ? "Hoy" : capitalize(shortDay(`${d}T12:00:00Z`))}</span>
                  {info ? (
                    <span className={cn("text-[0.7rem] tabular", active ? "text-bg-primary/70" : "text-text-muted")}>
                      {info.booked} de {info.capacity}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </PageHeader>

      <KpiRow>
        <Kpi icon={CalendarClock} label={isToday ? "Citas hoy" : "Citas ese día"} value={summary.booked + summary.done + summary.noShow} hint={summary.done ? `${summary.done} ya atendidas` : "Sin atender aún"} emphasis={summary.booked > 0} />
        <Kpi icon={Clock3} label="Huecos libres" value={summary.free} hint={`De ${summary.capacity} del día`} />
        <Kpi icon={UserX} label="No vinieron" value={`${noShow} %`} hint="Últimas cuatro semanas" />
        <Kpi icon={LifeBuoy} label="Pedir ayuda" value={office.helpWeeks.length ? helpCountLabel(trend.current) : "0"} hint="Pulsaciones esta semana" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {office.slots.length ? (
            <DayBoard
              columns={columns}
              onBook={setBooking}
              onOpen={(id) => setOpenAppointment(id)}
            />
          ) : (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={CalendarClock}
                title="Aún no has publicado horas de atención"
                body="Crea una franja por mesa (becas, matrícula, alojamiento o internacional). Los estudiantes piden hueco desde Franky y aquí ves la agenda de cada día."
                action={
                  <Button variant="dark" onClick={() => setSlotEditing("new")}>
                    <CalendarPlus className="h-4 w-4" /> Publicar la primera franja
                  </Button>
                }
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <HelpPanel />
          <DemandPanel />
          <SlotsPanel onEdit={(id) => setSlotEditing(id)} />
        </div>
      </div>

      <SlotDrawer id={slotEditing} onClose={() => setSlotEditing(null)} />
      <BookDrawer cell={booking} onClose={() => setBooking(null)} />
      <AppointmentDrawer id={openAppointment} onClose={() => setOpenAppointment(null)} />
    </div>
  );
}

/**
 * Tablero del día: una columna por franja publicada, un hueco por cita. En
 * móvil las columnas se desplazan en su propio contenedor, no la página.
 */
function DayBoard({
  columns,
  onBook,
  onOpen,
}: {
  columns: OfficeColumn[];
  onBook: (cell: OfficeCell) => void;
  onOpen: (id: string) => void;
}) {
  if (!columns.length) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
        <Empty icon={CalendarClock} title="Ese día no hay franjas" body="Elige otro día o publica una franja nueva." />
      </div>
    );
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 pro-scroll sm:mx-0 sm:px-0 md:overflow-visible md:pb-0">
      <div className="flex gap-3 md:grid md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {columns.map(({ slot, cells }) => {
          const booked = cells.filter((c) => c.appointment && c.appointment.status !== "cancelled").length;
          return (
            <section
              key={slot.id}
              className="flex w-[260px] shrink-0 flex-col self-start rounded-2xl border border-border bg-bg-primary shadow-card md:w-auto"
            >
              <header className="border-b border-border-light px-4 py-3">
                <p className="font-heading text-[0.95rem] font-bold leading-snug">{DESK_LABEL[slot.desk]}</p>
                <p className="mt-0.5 text-xs text-text-muted tabular">
                  {minutesToLabel(slot.start)} a {minutesToLabel(slot.end)} · {slot.staff}
                </p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                  {slot.online ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{slot.place}</span>
                </p>
                <p className="mt-2 text-xs font-semibold tabular text-text-secondary">
                  {booked} de {cells.length} huecos dados
                </p>
              </header>
              <ol className="flex flex-col gap-1.5 p-2.5">
                {cells.map((cell) => (
                  <li key={cell.start}>
                    <CellButton cell={cell} onBook={onBook} onOpen={onOpen} />
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CellButton({
  cell,
  onBook,
  onOpen,
}: {
  cell: OfficeCell;
  onBook: (cell: OfficeCell) => void;
  onOpen: (id: string) => void;
}) {
  const a = cell.appointment;
  const hour = <span className="w-11 shrink-0 text-xs font-semibold tabular text-text-muted">{minutesToLabel(cell.start)}</span>;

  if (a) {
    return (
      <button
        type="button"
        onClick={() => onOpen(a.id)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors hover:border-text-primary/25",
          a.status === "booked" ? "border-violet/25 bg-violet-50" : "border-border bg-bg-primary",
        )}
      >
        {hour}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-semibold", a.status === "no_show" && "text-text-muted line-through")}>{a.student}</span>
          <span className="block truncate text-xs text-text-muted">{a.topic}</span>
        </span>
        {a.status !== "booked" ? <Pill tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Pill> : null}
      </button>
    );
  }

  if (cell.past) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-text-muted">
        {hour}
        <span>Sin cita</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onBook(cell)}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border px-2.5 py-2 text-left text-sm text-text-muted transition-colors hover:border-violet hover:text-violet"
      aria-label={`Apuntar una cita a las ${minutesToLabel(cell.start)}`}
    >
      {hour}
      <span>Libre</span>
    </button>
  );
}
