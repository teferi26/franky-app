"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  LifeBuoy,
  MapPin,
  MessageCircleQuestion,
  Pencil,
  Send,
  Trash2,
  UserX,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import { addDays, dayLabel, localDate, localMinutes, minutesToLabel, relative } from "@/lib/pro/format";
import { uniExtrasOf } from "@/lib/pro/university";
import { faqForTopic, faqsOf, sendFaqToAppointment } from "@/lib/pro/university-faq";
import {
  APPOINTMENT_STATUS_LABEL,
  DESK_LABEL,
  DESK_ORDER,
  WEEKDAY_LABEL,
  bookAppointment,
  demandByDesk,
  helpCountLabel,
  helpSeries,
  helpTrend,
  officeOf,
  setAppointmentStatus,
  slotProblem,
  withOffice,
  type OfficeCell,
} from "@/lib/pro/university-office";
import type { ProUniAppointmentStatus, ProUniDesk, ProUniOfficeSlot } from "@/lib/pro/university-types";
import { Bars, ChoiceChips, Detail, Drawer, FormField, Meter, Panel, Pill, Row, RowList, inputClass, textareaClass } from "../../kit";
import { sectionHref } from "../../shell";
import { ToggleRow, facultyOptions, useUniAction } from "./ui";

/** "10:30" a minutos desde medianoche; NaN si no es una hora. */
function parseTime(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : Number.NaN;
}

/* ------------------------------------------------------------------ */
/* Franja: publicar, editar y retirar                                   */
/* ------------------------------------------------------------------ */

type SlotForm = Omit<ProUniOfficeSlot, "id" | "start" | "end"> & { start: string; end: string };

const EMPTY_FORM: SlotForm = {
  weekday: 1,
  start: "10:00",
  end: "13:00",
  minutes: 20,
  desk: "general",
  staff: "",
  place: "",
  online: false,
};

export function SlotDrawer({ id, onClose }: { id: string | "new" | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const office = officeOf(data);
  const existing = id && id !== "new" ? office.slots.find((s) => s.id === id) ?? null : null;
  const [form, setForm] = React.useState<SlotForm>(EMPTY_FORM);

  React.useEffect(() => {
    if (!id) return;
    if (existing) {
      setForm({ ...existing, start: minutesToLabel(existing.start), end: minutesToLabel(existing.end) });
    } else {
      // Por defecto, quien lleva el espacio y el lugar de la última franja.
      const last = office.slots.at(-1);
      setForm({ ...EMPTY_FORM, staff: data.space.owner.name, place: last?.place ?? data.space.address });
    }
    // Solo al abrir: mientras se edita no se pisa lo que escribe la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const today = localDate(now);
  const pending = existing
    ? office.appointments.filter((a) => a.slotId === existing.id && a.status === "booked" && a.date >= today)
    : [];
  // Con citas pendientes no se mueve la hora: se quedarían fuera de la franja.
  const locked = pending.length > 0;
  const candidate = { ...form, id: existing?.id, start: parseTime(form.start), end: parseTime(form.end) };
  const problem = Number.isNaN(candidate.start) || Number.isNaN(candidate.end) ? "Revisa las horas." : slotProblem(office.slots, candidate);
  const set = <K extends keyof SlotForm>(key: K, value: SlotForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (problem) return;
    const slot: ProUniOfficeSlot = {
      ...candidate,
      id: existing?.id ?? localId("o"),
      staff: form.staff.trim(),
      place: form.place.trim(),
    };
    const ok = await run(
      existing ? "office.slot.update" : "office.slot.create",
      (d) =>
        withOffice(d, (o) => ({
          slots: existing ? o.slots.map((s) => (s.id === slot.id ? slot : s)) : [...o.slots, slot],
        })),
      existing ? "Franja actualizada" : "Franja publicada",
      existing
        ? undefined
        : `Los estudiantes ya pueden pedir hueco los ${WEEKDAY_LABEL[slot.weekday].toLowerCase()} de ${minutesToLabel(slot.start)} a ${minutesToLabel(slot.end)}.`,
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!existing || locked) return;
    const ok = await run(
      "office.slot.remove",
      (d) => withOffice(d, (o) => ({ slots: o.slots.filter((s) => s.id !== existing.id) })),
      "Franja retirada",
      "Ya no se puede pedir cita en ella. Las citas pasadas siguen en el historial.",
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Editar franja" : "Publicar franja"}
      description="Se repite cada semana el mismo día."
      footer={
        <>
          {existing ? (
            <Button variant="ghost" onClick={remove} disabled={locked}>
              <Trash2 className="h-4 w-4" /> Retirar
            </Button>
          ) : null}
          <Button variant="dark" onClick={save} disabled={Boolean(problem)}>
            {existing ? "Guardar cambios" : "Publicar franja"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Mesa">
          <ChoiceChips<ProUniDesk>
            value={form.desk}
            onChange={(v) => set("desk", v)}
            options={DESK_ORDER.map((d) => ({ value: d, label: DESK_LABEL[d] }))}
          />
        </FormField>
        <FormField label="Día" hint={locked ? `Tiene ${pending.length} citas pendientes: el día y la hora no se pueden cambiar.` : undefined}>
          <ChoiceChips<string>
            value={String(form.weekday)}
            onChange={(v) => !locked && set("weekday", Number(v))}
            options={WEEKDAY_LABEL.slice(0, 5).map((label, i) => ({ value: String(i), label }))}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde" htmlFor="slot-start">
            <input id="slot-start" type="time" step={300} className={inputClass} value={form.start} disabled={locked} onChange={(e) => set("start", e.target.value)} />
          </FormField>
          <FormField label="Hasta" htmlFor="slot-end">
            <input id="slot-end" type="time" step={300} className={inputClass} value={form.end} disabled={locked} onChange={(e) => set("end", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Cada cita dura">
          <ChoiceChips<string>
            value={String(form.minutes)}
            onChange={(v) => !locked && set("minutes", Number(v))}
            options={[10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} min` }))}
          />
        </FormField>
        <FormField label="Quién atiende" htmlFor="slot-staff">
          <input id="slot-staff" className={inputClass} value={form.staff} onChange={(e) => set("staff", e.target.value)} list="slot-staff-list" placeholder="Nombre y apellido" />
          <datalist id="slot-staff-list">
            {data.staff.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </FormField>
        <ToggleRow id="slot-online" label="Por videollamada" hint="El estudiante entra desde Franky a su hora." checked={form.online} onChange={(v) => set("online", v)} />
        <FormField label={form.online ? "Enlace o sala" : "Lugar"} htmlFor="slot-place">
          <input
            id="slot-place"
            className={inputClass}
            value={form.place}
            onChange={(e) => set("place", e.target.value)}
            placeholder={form.online ? "Videollamada desde Franky" : "Mostrador del SAE, Rectorado"}
          />
        </FormField>
        {problem ? (
          <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">
            {problem}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Apuntar una cita en un hueco libre                                  */
/* ------------------------------------------------------------------ */

export function BookDrawer({ cell, onClose }: { cell: OfficeCell | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const faculties = facultyOptions(data);
  const slot = cell ? officeOf(data).slots.find((s) => s.id === cell.slotId) : undefined;
  const [student, setStudent] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [taken, setTaken] = React.useState(false);

  React.useEffect(() => {
    setStudent("");
    setFaculty("");
    setTopic("");
    setTaken(false);
  }, [cell]);

  const valid = student.trim().length > 2 && topic.trim().length > 2;

  const save = async () => {
    if (!cell || !slot || !valid) return;
    let clash = false;
    const ok = await run(
      "office.appointment.create",
      (d) =>
        withOffice(d, (o) => {
          const next = bookAppointment(
            o.appointments,
            {
              id: localId("ap"),
              slotId: slot.id,
              date: cell.date,
              start: cell.start,
              desk: slot.desk,
              student: student.trim(),
              faculty: faculty || "Sin indicar",
              topic: topic.trim(),
              via: "desk",
            },
            now,
          );
          // Otra persona del equipo lo ha dado a la vez: no se pisa.
          if (!next) clash = true;
          return { appointments: next ?? o.appointments };
        }),
      "Cita apuntada",
      `${student.trim()}, ${dayLabel(`${cell.date}T12:00:00Z`)} a las ${minutesToLabel(cell.start)}.`,
    );
    if (clash) setTaken(true);
    else if (ok) onClose();
  };

  return (
    <Drawer
      open={Boolean(cell)}
      onOpenChange={(o) => !o && onClose()}
      title="Apuntar una cita"
      description={
        cell && slot
          ? `${DESK_LABEL[slot.desk]}, ${dayLabel(`${cell.date}T12:00:00Z`)} a las ${minutesToLabel(cell.start)}`
          : undefined
      }
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          Apuntar cita
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">Para quien llama o pasa por el mostrador. Los demás la piden desde Franky.</p>
        <FormField label="Estudiante" htmlFor="ap-student">
          <input id="ap-student" className={inputClass} value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Nombre y apellido" />
        </FormField>
        <FormField label="Facultad" htmlFor="ap-faculty">
          {faculties.length ? (
            <select id="ap-faculty" className={inputClass} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
              <option value="">Sin indicar</option>
              {faculties.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          ) : (
            <input id="ap-faculty" className={inputClass} value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="Derecho" />
          )}
        </FormField>
        <FormField label="Qué necesita" htmlFor="ap-topic">
          <textarea id="ap-topic" className={textareaClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Dudas con la beca del Ministerio" />
        </FormField>
        {taken ? (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
            Ese hueco se acaba de dar. Elige otro en la agenda.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de una cita                                                 */
/* ------------------------------------------------------------------ */

export function AppointmentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const office = officeOf(data);
  const a = id ? office.appointments.find((x) => x.id === id) : undefined;
  const slot = a ? office.slots.find((s) => s.id === a.slotId) : undefined;

  if (!a) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Cita">
        <span />
      </Drawer>
    );
  }

  const mark = async (status: ProUniAppointmentStatus, title: string, detail?: string) => {
    const ok = await run(
      "office.appointment.status",
      (d) => withOffice(d, (o) => ({ appointments: setAppointmentStatus(o.appointments, a.id, status) })),
      title,
      detail,
    );
    if (ok) onClose();
  };

  const today = localDate(now);
  const started = a.date < today || (a.date === today && a.start <= localMinutes(now));

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={a.student}
      description={`${dayLabel(`${a.date}T12:00:00Z`)} a las ${minutesToLabel(a.start)}`}
      footer={
        a.status === "booked" ? (
          <>
            <Button variant="ghost" onClick={() => mark("cancelled", "Cita cancelada", "El hueco vuelve a estar libre.")}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            {started ? (
              <Button variant="outline" onClick={() => mark("no_show", "Apuntado que no vino")}>
                <UserX className="h-4 w-4" /> No vino
              </Button>
            ) : null}
            <Button variant="dark" onClick={() => mark("done", "Cita atendida")}>
              <Check className="h-4 w-4" /> Atendida
            </Button>
          </>
        ) : a.status !== "cancelled" ? (
          <Button variant="outline" onClick={() => mark("booked", "Cita pendiente otra vez")}>
            Deshacer
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={a.status === "done" ? "success" : a.status === "no_show" ? "danger" : a.status === "booked" ? "info" : "neutral"}>
            {APPOINTMENT_STATUS_LABEL[a.status]}
          </Pill>
          <Pill>{a.via === "franky" ? "Pedida desde Franky" : "Apuntada por el equipo"}</Pill>
        </div>
        <div className="rounded-2xl bg-bg-secondary/70 px-4 py-3 text-sm">
          <p className="text-xs font-semibold text-text-muted">Qué necesita</p>
          <p className="mt-0.5 text-text-primary">{a.topic}</p>
        </div>
        <FaqSuggestion appointmentId={a.id} onSent={onClose} />
        <div className="divide-y divide-border-light">
          <Detail label="Mesa">{DESK_LABEL[a.desk]}</Detail>
          {slot ? <Detail label="Atiende">{slot.staff}</Detail> : null}
          {slot ? (
            <Detail label={slot.online ? "Videollamada" : "Lugar"}>
              <span className="inline-flex items-center gap-1">
                {slot.online ? <Video className="h-3.5 w-3.5 text-text-muted" /> : <MapPin className="h-3.5 w-3.5 text-text-muted" />}
                {slot.place}
              </span>
            </Detail>
          ) : null}
          <Detail label="Facultad">{a.faculty}</Detail>
          {a.createdAt ? <Detail label="Pedida">{relative(a.createdAt, now.getTime())}</Detail> : null}
        </div>
      </div>
    </Drawer>
  );
}

/**
 * "Esto ya está en las preguntas": si la duda de la cita ya tiene respuesta,
 * se le envía con un toque. La cita no se cancela: decide el estudiante.
 */
function FaqSuggestion({ appointmentId, onSent }: { appointmentId: string; onSent: () => void }) {
  const { data, now, spaceId } = usePro();
  const run = useUniAction();
  const office = officeOf(data);
  const faqs = faqsOf(data);
  const a = office.appointments.find((x) => x.id === appointmentId);
  if (!a || !faqs.length) return null;

  const sentFaq = a.faqId ? faqs.find((f) => f.id === a.faqId) : undefined;
  if (sentFaq) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-border px-4 py-3 text-sm">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
        <p className="min-w-0 text-text-secondary">
          Le enviaste la respuesta {a.faqSentAt ? relative(a.faqSentAt, now.getTime()) : ""}:{" "}
          <span className="font-semibold text-text-primary">{sentFaq.question}</span>
        </p>
      </div>
    );
  }

  const match = a.status === "booked" ? faqForTopic(faqs, a.topic, a.desk) : null;
  if (!match) return null;

  const send = async () => {
    const ok = await run(
      "office.appointment.faq",
      (d) => withOffice(d, (o) => ({ appointments: sendFaqToAppointment(o.appointments, a.id, match.id, now) })),
      "Respuesta enviada",
      "Le llega en Franky. Si con eso le basta, puede anular la cita y el hueco queda libre.",
    );
    if (ok) onSent();
  };

  return (
    <section className="rounded-2xl border border-violet/25 bg-violet-50 px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-violet-deep">Esto ya está en las preguntas</p>
      <p className="mt-1 font-heading text-[0.95rem] font-bold leading-snug text-text-primary">{match.question}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{match.answer}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="dark" onClick={send}>
          <Send className="h-3.5 w-3.5" /> Enviarle la respuesta
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={sectionHref(spaceId, "preguntas")}>Ver preguntas</Link>
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Paneles laterales                                                   */
/* ------------------------------------------------------------------ */

/** Contador semanal del botón "Pedir ayuda": solo totales. */
export function HelpPanel() {
  const { data, now } = usePro();
  const extras = uniExtrasOf(data);
  const office = officeOf(data);
  const series = helpSeries(office.helpWeeks, now, 8);
  const trend = helpTrend(office.helpWeeks, now);

  return (
    <Panel title="Pedir ayuda" description="Veces que se pulsó el botón fijo de las publicaciones de bienestar. Solo el total, nunca quién.">
      {office.helpWeeks.length ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{helpCountLabel(trend.current)}</p>
              <p className="text-xs text-text-muted">esta semana</p>
            </div>
            {trend.deltaPct !== null && !trend.hidden ? (
              <Pill tone={trend.deltaPct >= 25 ? "warning" : "neutral"}>
                {trend.deltaPct >= 0 ? "+" : ""}
                {trend.deltaPct} % sobre la media
              </Pill>
            ) : null}
          </div>
          <Bars
            className="mt-4 h-24"
            values={series.map((w) => w.presses)}
            labels={series.map((w) => `${Number(w.week.slice(8, 10))}/${Number(w.week.slice(5, 7))}`)}
            format={helpCountLabel}
          />
          {trend.deltaPct !== null && trend.deltaPct >= 25 ? (
            <p className="mt-3 text-sm text-text-secondary">
              Más que de costumbre. Si el servicio psicológico va justo, publica sus horas sin cita en una publicación con el botón de ayuda.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-text-muted">
          Cuando una publicación lleve el botón “Pedir ayuda”, aquí verás cuántas veces se pulsa cada semana.
        </p>
      )}
      {extras.help.length ? (
        <ul className="mt-4 flex flex-col gap-2 border-t border-border-light pt-4 text-sm">
          {extras.help.map((h) => (
            <li key={h.label}>
              <Link href={h.href} className="group flex min-h-10 items-start gap-2">
                <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold group-hover:underline">{h.label}</span>
                  <span className="block text-xs text-text-muted">{h.detail}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

/** Qué mesas tienen más demanda, para mover franjas donde hacen falta. */
export function DemandPanel() {
  const { data, now } = usePro();
  const demand = demandByDesk(officeOf(data).appointments, now);
  if (!demand.length) return null;
  const max = demand[0].count;
  return (
    <Panel title="Qué os piden" description="Citas por mesa en las últimas cuatro semanas.">
      <ul className="flex flex-col gap-3">
        {demand.map((d) => (
          <li key={d.desk}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="truncate">{DESK_LABEL[d.desk]}</span>
              <span className="font-semibold tabular">{d.count}</span>
            </div>
            <Meter value={d.count} max={max} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Franjas publicadas por día de la semana; tocar una la abre para editarla. */
export function SlotsPanel({ onEdit }: { onEdit: (id: string) => void }) {
  const { data, now } = usePro();
  const office = officeOf(data);
  if (!office.slots.length) return null;
  const today = localDate(now);
  const horizon = addDays(today, 14);
  const sorted = [...office.slots].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  return (
    <Panel title="Franjas publicadas" description={`${office.slots.length} a la semana. Toca una para cambiarla.`} flush>
      <RowList>
        {sorted.map((s) => {
          const upcoming = office.appointments.filter(
            (a) => a.slotId === s.id && a.status === "booked" && a.date >= today && a.date <= horizon,
          ).length;
          return (
            <Row key={s.id} onClick={() => onEdit(s.id)}>
              <span className="w-10 shrink-0 text-xs font-semibold uppercase text-text-muted">{WEEKDAY_LABEL[s.weekday].slice(0, 3)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{DESK_LABEL[s.desk]}</span>
                <span className="block truncate text-xs text-text-muted tabular">
                  {minutesToLabel(s.start)} a {minutesToLabel(s.end)} · {s.staff}
                </span>
              </span>
              {upcoming ? <span className="text-xs tabular text-text-muted">{upcoming} citas</span> : null}
              <Pencil className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.9} />
            </Row>
          );
        })}
      </RowList>
    </Panel>
  );
}
