"use client";

import * as React from "react";
import { CalendarCheck2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClassType } from "@/lib/pro/types";
import { dayLabel, durationLabel, localDate, minutesToLabel, money, plural } from "@/lib/pro/format";
import { applyIntensive, examsAhead, intensiveDates, type ExamAhead } from "@/lib/pro/classes-ops";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, FormField, Meter, Panel, Pill, inputClass } from "../../kit";
import { TONES } from "../../tones";

/**
 * Calendario de exámenes de las academias y el intensivo en un toque: desde
 * un grupo con examen se crean las sesiones en serie, el bono y la oferta que
 * Franky enseña a quien tiene esa asignatura, todo a la vez.
 */

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function ExamStrip({ onPrepare, compact }: { onPrepare: (exam: ExamAhead) => void; compact?: boolean }) {
  const { data, now } = usePro();
  const exams = examsAhead(data, now, 120);
  if (!exams.length) return null;

  return (
    <Panel
      title="Exámenes que vienen"
      description="Fecha de examen de cada grupo. Tres o cuatro semanas antes es cuando se llenan los intensivos."
      flush
    >
      <ul className="divide-y divide-border-light">
        {exams.slice(0, compact ? 3 : 6).map((e) => {
          const tone = TONES[e.classType.tone];
          const soon = e.daysLeft <= 30;
          return (
            <li key={e.classType.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
              <span className={cn("h-9 w-1 shrink-0 rounded-full", tone.bar)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{e.classType.name}</span>
                  {e.hasIntensive ? <Pill tone="success">Intensivo creado</Pill> : null}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {e.classType.category} · examen el {dayLabel(`${e.examOn}T12:00:00Z`, { weekday: false })}
                </span>
              </span>
              <span className="flex w-28 shrink-0 flex-col items-end">
                <span className={cn("font-heading text-lg font-extrabold tabular", soon && "text-violet")}>{e.daysLeft} días</span>
                <Meter value={e.avgBooked} max={e.capacity} className="mt-1 w-24" tone={e.avgBooked / e.capacity > 0.75 ? "warning" : "violet"} />
              </span>
              {!e.hasIntensive ? (
                <Button size="sm" variant={soon ? "dark" : "secondary"} onClick={() => onPrepare(e)} className="w-full sm:w-auto">
                  Preparar intensivo
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function IntensiveDrawer({ exam, onClose }: { exam: ExamAhead | null; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const coaches = data.staff.filter((s) => s.role !== "reception");
  const [days, setDays] = React.useState<number[]>([0, 2, 4]);
  const [weeks, setWeeks] = React.useState<"2" | "3" | "4">("3");
  const [minute, setMinute] = React.useState(10 * 60);
  const [duration, setDuration] = React.useState<"90" | "120" | "180">("120");
  const [price, setPrice] = React.useState("120");
  const [studentPrice, setStudentPrice] = React.useState("");
  const [capacity, setCapacity] = React.useState(10);
  const [room, setRoom] = React.useState("Aula 1");
  const [coachId, setCoachId] = React.useState("");

  React.useEffect(() => {
    if (!exam) return;
    // Mañanas por defecto: el universitario tiene horas libres y el aula está vacía.
    setDays([0, 2, 4]);
    setWeeks("3");
    setMinute(10 * 60);
    setDuration("120");
    setPrice("120");
    setStudentPrice("");
    setCapacity(exam.classType.capacity + 2);
    setRoom(data.sessions.find((s) => s.classTypeId === exam.classType.id)?.room ?? "Aula 1");
    setCoachId(exam.classType.coachId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.classType.id]);

  if (!exam) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const dates = intensiveDates({ examOn: exam.examOn, days, weeks: Number(weeks) }, today);
  const hours = Math.round((dates.length * Number(duration)) / 60);
  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const valid = dates.length > 0 && cents(price) > 0 && Boolean(coachId);

  const create = () => {
    const ct: ProClassType = exam.classType;
    void update("class.intensive", (d) =>
      applyIntensive(
        d,
        {
          classType: ct,
          examOn: exam.examOn,
          days,
          minute,
          durationMin: Number(duration),
          weeks: Number(weeks),
          priceCents: cents(price),
          studentPriceCents: cents(studentPrice) || undefined,
          capacity,
          room: room.trim() || "Aula 1",
          coachId,
        },
        now,
        { type: localId("ct"), plan: localId("pl"), offer: localId("o"), series: localId("sr"), session: () => localId("ss") },
      ).data,
    );
    toast.success("Intensivo listo", `${dates.length} clases, bono de ${money(cents(price))} y oferta programada para quien tiene ${ct.name}.`);
    onClose();
  };

  const toggleDay = (i: number) => setDays((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort()));

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Intensivo de ${exam.classType.name}`}
      description={`Examen el ${dayLabel(`${exam.examOn}T12:00:00Z`)}. Clases, bono y oferta en un solo paso.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={create} disabled={!valid}>
            Crear {plural(dates.length, "clase", "clases")} y la oferta
          </Button>
        </>
      }
      wide
    >
      <div className="flex flex-col gap-5">
        <FormField label="Días de clase">
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(i)}
                onClick={() => toggleDay(i)}
                className={cn(
                  "h-10 w-10 rounded-xl border text-sm font-semibold transition-colors",
                  days.includes(i) ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Semanas antes del examen">
            <ChoiceChips value={weeks} onChange={setWeeks} options={(["2", "3", "4"] as const).map((w) => ({ value: w, label: `${w} semanas` }))} />
          </FormField>
          <FormField label="Duración">
            <ChoiceChips value={duration} onChange={setDuration} options={(["90", "120", "180"] as const).map((v) => ({ value: v, label: durationLabel(Number(v)) }))} />
          </FormField>
          <FormField label="Hora" htmlFor="int-hour">
            <input
              id="int-hour"
              type="time"
              step={900}
              value={minutesToLabel(minute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                setMinute((h || 0) * 60 + (m || 0));
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label="Plazas" htmlFor="int-cap">
            <input id="int-cap" type="number" min={1} max={40} value={capacity} onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))} className={inputClass} />
          </FormField>
          <FormField label="Precio del intensivo (€)" htmlFor="int-price">
            <input id="int-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Precio estudiante (€)" htmlFor="int-student" hint="Opcional.">
            <input id="int-student" inputMode="decimal" value={studentPrice} onChange={(e) => setStudentPrice(e.target.value)} className={inputClass} placeholder="Igual" />
          </FormField>
          <FormField label="Aula" htmlFor="int-room">
            <input id="int-room" value={room} onChange={(e) => setRoom(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Profesor">
          <div className="flex flex-wrap gap-2">
            {coaches.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={coachId === s.id}
                onClick={() => setCoachId(s.id)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                  coachId === s.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                )}
              >
                <Avatar name={s.name} tone={s.tone} size="xs" /> {s.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </FormField>
        <div className="rounded-2xl border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarCheck2 className="h-4 w-4 text-violet" strokeWidth={1.8} /> {plural(dates.length, "clase", "clases")}, {hours} horas en total
          </p>
          {dates.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dates.map((d) => (
                <span key={d} className="rounded-lg bg-bg-secondary px-2 py-1 text-xs font-medium tabular">
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-muted">Elige al menos un día: no quedan fechas antes del examen.</p>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs text-text-muted">
            <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
            Franky lo enseña a los estudiantes de {exam.classType.category} las semanas antes del examen. Lo ves en Estudiantes con sus vistas y reservas.
          </p>
        </div>
      </div>
    </Drawer>
  );
}
