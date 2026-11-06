"use client";

import * as React from "react";
import { CalendarPlus, Check, GraduationCap, Plus, School, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProSchoolGroup } from "@/lib/pro/courts-types";
import { addDays, durationLabel, localDate, localMinutes, money, plural } from "@/lib/pro/format";
import { clockLabel, courtsOps, patchCourts } from "@/lib/pro/courts-base";
import { endOfCourse } from "@/lib/pro/courts-ops";
import {
  coachMonth,
  groupAttendance,
  groupDatesInMonth,
  lessonsOn,
  nextGroupDate,
  setAttendance,
  setFeeStatus,
} from "@/lib/pro/courts-compete";
import {
  addStudent,
  checkGroup,
  checkLesson,
  createLesson,
  groupsOn,
  removeStudent,
  saveGroup,
  schoolStats,
} from "@/lib/pro/courts-admin";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  inputClass,
} from "../../kit";
import { TONES } from "../../tones";
import { WhatsAppLink, firstName } from "./booking-ops";
import { CourtsNotReady, parseEuros, shortDate, useCourtsState, useInitialView } from "./state";

/**
 * Escuela en pista: grupos por nivel con monitor, pista y hora fija,
 * asistencia en dos toques, plazas libres y cuotas; clases particulares con
 * pista y monitor en un paso, y las horas de cada monitor a final de mes.
 */

const VIEWS = ["grupos", "particulares", "monitores"] as const;
type View = (typeof VIEWS)[number];
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function EscuelaSection() {
  const { ready } = useCourtsState();
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Escuela" title="Escuela del club" />
        <CourtsNotReady
          icon={School}
          title="Tu escuela, en la misma app"
          body="Grupos por nivel con su monitor y su pista, asistencia en dos toques y las cuotas al día."
        />
      </div>
    );
  return <Escuela />;
}

function Escuela() {
  const { data, now, demo } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const [view, setView] = useInitialView<View>(VIEWS, "grupos");
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const [newLesson, setNewLesson] = React.useState(false);
  const [newGroup, setNewGroup] = React.useState(false);
  const stats = schoolStats(data);
  const todayGroups = groupsOn(data, today);
  const upcomingLessons = ops.lessons
    .filter((l) => l.status === "scheduled" && l.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);

  const description =
    view === "grupos"
      ? stats.groups
        ? `${plural(stats.students, "alumno", "alumnos")} en ${plural(stats.groups, "grupo", "grupos")}, ${plural(stats.freeSpots, "plaza libre", "plazas libres")}.${stats.pendingFees ? ` ${plural(stats.pendingFees, "cuota pendiente", "cuotas pendientes")} (${money(stats.pendingCents, { round: true })}).` : ""}${todayGroups.length ? ` Hoy hay ${plural(todayGroups.length, "clase", "clases")}.` : ""}`
        : "Crea tus grupos por nivel: la pista queda bloqueada cada semana a su hora."
      : view === "particulares"
        ? upcomingLessons.length
          ? `${plural(upcomingLessons.length, "clase particular", "clases particulares")} por delante.`
          : "Pista y monitor en un solo paso. La clase cuenta para las horas del monitor."
        : "Horas de grupo y particulares de este mes, y lo que hay que pagar a cada uno.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Escuela"
        title={view === "grupos" ? "Grupos" : view === "particulares" ? "Clases particulares" : "Monitores"}
        description={description}
        actions={
          view === "grupos" ? (
            <Button variant="dark" onClick={() => setNewGroup(true)}>
              <Plus className="h-4 w-4" /> Nuevo grupo
            </Button>
          ) : view === "particulares" && demo ? (
            <Button variant="dark" onClick={() => setNewLesson(true)}>
              <CalendarPlus className="h-4 w-4" /> Nueva clase
            </Button>
          ) : null
        }
      >
        <Segmented
          label="Escuela"
          value={view}
          onChange={setView}
          options={[
            { value: "grupos", label: "Grupos", count: stats.groups },
            { value: "particulares", label: "Particulares", count: upcomingLessons.length },
            { value: "monitores", label: "Monitores" },
          ]}
        />
      </PageHeader>

      {view === "grupos" ? (
        <GroupsView onOpen={setOpenGroup} onNew={() => setNewGroup(true)} />
      ) : view === "particulares" ? (
        <LessonsView onNew={demo ? () => setNewLesson(true) : undefined} />
      ) : (
        <CoachesView />
      )}

      <GroupDrawer id={openGroup} onClose={() => setOpenGroup(null)} />
      <NewLessonDrawer open={newLesson} onClose={() => setNewLesson(false)} />
      <NewGroupDrawer open={newGroup} onClose={() => setNewGroup(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grupos                                                              */
/* ------------------------------------------------------------------ */

function GroupsView({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { data, now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const stats = schoolStats(data);
  if (!ops.school.length)
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={GraduationCap}
          title="Sin grupos todavía"
          body="Un grupo de iniciación los lunes a las 18:00 con cuatro alumnos es una pista vendida todo el curso. La pista queda bloqueada sola cada semana."
          action={
            <Button variant="dark" onClick={onNew}>
              <Plus className="h-4 w-4" /> Nuevo grupo
            </Button>
          }
        />
      </div>
    );
  const byDay = DAYS.map((_, weekday) => ops.school.filter((g) => g.weekday === weekday).sort((a, b) => a.from - b.from));
  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi label="Alumnos" value={stats.students} icon={GraduationCap} />
        <Kpi label="Plazas libres" value={stats.freeSpots} hint="para vender este mes" emphasis={stats.freeSpots > 0} />
        <Kpi label="Cuotas pendientes" value={stats.pendingFees} hint={stats.pendingFees ? money(stats.pendingCents) : "todo al día"} />
        <Kpi label="Grupos" value={stats.groups} hint="con pista fija" />
      </KpiRow>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {byDay.flatMap((groups, weekday) =>
          groups.map((g) => {
            const coach = data.staff.find((s) => s.id === g.coachId);
            const court = data.resources.find((r) => r.id === g.resourceId);
            const next = nextGroupDate(g, today);
            const attendance = groupAttendance(g);
            const pending = g.students.filter((s) => s.feeStatus === "pending").length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpen(g.id)}
                className="hover-lift flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/15"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{DAYS[weekday]}, {clockLabel(g.from)}</p>
                    <p className="mt-1 truncate font-heading text-base font-bold">{g.name}</p>
                    <p className="truncate text-sm text-text-muted">
                      {court?.name}, con {coach ? firstName(coach.name) : "monitor"}. Nivel {g.level}
                    </p>
                  </div>
                  {next === today ? <Pill tone="violet">Hoy</Pill> : null}
                </div>
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-heading text-xl font-extrabold tabular">
                      {g.students.length}
                      <span className="text-sm text-text-muted">/{g.capacity}</span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {attendance === null ? "Sin asistencia" : `Vienen el ${Math.round(attendance * 100)} %`}
                    </span>
                  </div>
                  <Meter value={g.students.length} max={g.capacity} className="mt-1.5" tone={g.students.length >= g.capacity ? "success" : "violet"} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.capacity - g.students.length > 0 ? (
                    <Pill>{plural(g.capacity - g.students.length, "plaza libre", "plazas libres")}</Pill>
                  ) : (
                    <Pill tone="success">Completo</Pill>
                  )}
                  {pending ? <Pill tone="warning">{plural(pending, "cuota pendiente", "cuotas pendientes")}</Pill> : null}
                  {g.students.some((s) => s.minor) ? <Pill>Menores</Pill> : null}
                </div>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function GroupDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const g = courtsOps(data).school.find((x) => x.id === id) ?? null;
  const [date, setDate] = React.useState(today);
  const [present, setPresent] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [minor, setMinor] = React.useState(false);

  // Fecha de clase por defecto: la de hoy o la última que ya pasó.
  const classDates = React.useMemo(() => {
    if (!g) return [];
    const dates: string[] = [];
    for (let i = 0; i <= 35 && dates.length < 5; i++) {
      const d = addDays(today, -i);
      if (groupDatesInMonth(g, d.slice(0, 7)).includes(d)) dates.push(d);
    }
    return dates;
  }, [g, today]);

  React.useEffect(() => {
    if (!g) return;
    const d = classDates[0] ?? today;
    setDate(d);
    setPresent(g.attendance[d] ?? []);
    setName("");
    setPhone("");
    setMinor(Boolean(g.students.some((s) => s.minor)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!g) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const coach = data.staff.find((s) => s.id === g.coachId);
  const court = data.resources.find((r) => r.id === g.resourceId);
  const saved = g.attendance[date];
  const dirty = JSON.stringify([...present].sort()) !== JSON.stringify([...(saved ?? [])].sort());

  const pickDate = (d: string) => {
    setDate(d);
    setPresent(g.attendance[d] ?? []);
  };

  const saveAttendance = async () => {
    const ok = await update("court.school.attendance", (d) => setAttendance(d, g.id, date, present));
    if (ok) toast.success("Lista pasada", `${present.length} de ${g.students.length} han venido.`);
  };

  const add = async () => {
    if (name.trim().length < 2 || g.students.length >= g.capacity) return;
    const ok = await update("court.school.student", (d) =>
      addStudent(d, g.id, { id: localId("al"), name, phone, minor }),
    );
    if (ok) {
      toast.success("Alumno apuntado", `${name.trim()} empieza en ${g.name}. Su cuota queda pendiente.`);
      setName("");
      setPhone("");
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={g.name}
      description={`${DAYS[g.weekday]} a las ${clockLabel(g.from)}, ${durationLabel(g.duration)} en ${court?.name ?? "pista"} con ${coach?.name ?? "su monitor"}`}
      wide
      footer={
        dirty ? (
          <Button variant="dark" onClick={saveAttendance}>
            <Check className="h-4 w-4" /> Guardar asistencia
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <section>
          <p className="eyebrow mb-2">Pasar lista</p>
          {classDates.length ? (
            <ChoiceChips value={date} onChange={pickDate} options={classDates.map((d) => ({ value: d, label: d === today ? "Hoy" : shortDate(d) }))} />
          ) : (
            <p className="text-sm text-text-muted">Aún no ha habido clase este curso.</p>
          )}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {g.students.map((s) => {
              const on = present.includes(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPresent((list) => (on ? list.filter((x) => x !== s.id) : [...list, s.id]))}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm transition-colors",
                      on ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30" : "border-border hover:border-text-primary/25",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        on ? "border-emerald-600 bg-emerald-600 text-white" : "border-border",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {g.students.length ? (
            <button
              type="button"
              onClick={() => setPresent(g.students.map((s) => s.id))}
              className="mt-2 min-h-10 text-sm font-semibold text-violet"
            >
              Han venido todos
            </button>
          ) : null}
        </section>

        <section>
          <p className="eyebrow mb-2">Alumnos y cuotas</p>
          <ul className="divide-y divide-border-light rounded-2xl border border-border px-3">
            {g.students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2.5 py-2.5">
                <Avatar name={s.name} size="sm" tone={s.feeStatus === "paid" ? "emerald" : "amber"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block text-xs text-text-muted">
                    {s.feeStatus === "paid" ? "Cuota al día" : `Debe ${money(g.monthlyFeeCents)}`}
                    {s.minor ? ", contacto de su familia" : ""}
                  </span>
                </span>
                {s.feeStatus === "pending" ? (
                  <>
                    <WhatsAppLink
                      phone={s.phone}
                      label="Recordar"
                      message={`Hola${s.minor ? "" : ` ${firstName(s.name)}`}, te recordamos la cuota de ${g.name} de este mes en ${data.space.name}: ${money(g.monthlyFeeCents)}. ¡Gracias!`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => void update("court.school.fee", (d) => setFeeStatus(d, g.id, s.id, "paid"))}
                    >
                      Pagada
                    </Button>
                  </>
                ) : (
                  <Pill tone="success">Pagada</Pill>
                )}
                <button
                  type="button"
                  aria-label={`Dar de baja a ${s.name}`}
                  onClick={() => void update("court.school.remove", (d) => removeStudent(d, g.id, s.id))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                </button>
              </li>
            ))}
          </ul>
          {g.students.length < g.capacity ? (
            <FormField label={`Apuntar alumno (${plural(g.capacity - g.students.length, "plaza libre", "plazas libres")})`} htmlFor="al-name" className="mt-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input id="al-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" autoComplete="off" className={inputClass} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder={minor ? "Móvil de la familia" : "Móvil"} aria-label="Móvil" className={inputClass} />
                <Button variant="outline" className="min-h-10" onClick={add} disabled={name.trim().length < 2}>
                  <UserPlus className="h-4 w-4" /> Apuntar
                </Button>
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
                Es menor: el móvil es de su madre, padre o tutor
              </label>
            </FormField>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Grupo completo. Si alguien pregunta, apúntalo en otro grupo de su nivel.</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Clases particulares                                                 */
/* ------------------------------------------------------------------ */

function LessonsView({ onNew }: { onNew?: () => void }) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const list = days.map((d) => ({ date: d, lessons: lessonsOn(data, d) })).filter((x) => x.lessons.length);
  if (!list.length)
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={CalendarPlus}
          title="Ninguna clase particular esta semana"
          body="Elige monitor, pista y hora: se reserva la pista y la clase suma a las horas del monitor."
          action={
            onNew ? (
              <Button variant="dark" onClick={onNew}>
                <Plus className="h-4 w-4" /> Nueva clase
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      {list.map(({ date, lessons }) => (
        <Panel key={date} title={date === today ? "Hoy" : shortDate(date)} flush>
          <RowList>
            {lessons.map((l) => {
              const coach = data.staff.find((s) => s.id === l.coachId);
              const court = data.resources.find((r) => r.id === l.resourceId);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="w-12 shrink-0 font-heading text-sm font-bold tabular">{clockLabel(l.from)}</span>
                  <span className={cn("h-8 w-1 shrink-0 rounded-full", TONES[coach?.tone ?? "slate"].bar)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l.studentName}</span>
                    <span className="block truncate text-xs text-text-muted">
                      Con {coach ? firstName(coach.name) : "monitor"} en {court?.name}, {durationLabel(l.duration)}, {money(l.priceCents)}
                    </span>
                  </span>
                  {l.date < today || (l.date === today && l.from + l.duration <= localMinutes(now)) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      onClick={() =>
                        void update("court.lesson.done", (d) =>
                          patchCourts(d, (o) => ({
                            lessons: o.lessons.map((x) => (x.id === l.id ? { ...x, status: "done" as const } : x)),
                          })),
                        )
                      }
                    >
                      Dada
                    </Button>
                  ) : (
                    <WhatsAppLink
                      phone={l.phone}
                      label="Recordar"
                      message={`Hola ${firstName(l.studentName)}, te esperamos ${date === today ? "hoy" : `el ${shortDate(date)}`} a las ${clockLabel(l.from)} en ${court?.name ?? "la pista"} para tu clase con ${coach ? firstName(coach.name) : "tu monitor"}.`}
                    />
                  )}
                </div>
              );
            })}
          </RowList>
        </Panel>
      ))}
    </div>
  );
}

function NewLessonDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const courts = data.resources.filter((r) => r.kind === "court");
  const coaches = coachList(data);
  const [coachId, setCoachId] = React.useState("");
  const [resourceId, setResourceId] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [from, setFrom] = React.useState(11 * 60);
  const [duration, setDuration] = React.useState(60);
  const [studentName, setStudentName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [price, setPrice] = React.useState("30");

  React.useEffect(() => {
    if (!open) return;
    setCoachId(coaches[0]?.id ?? "");
    setResourceId(courts[0]?.id ?? "");
    setDate(addDays(today, 1));
    setFrom(11 * 60);
    setDuration(60);
    setStudentName("");
    setPhone("");
    setPrice("30");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const check = coachId && resourceId ? checkLesson(data, { coachId, resourceId, date, from, duration }) : null;
  const priceCents = parseEuros(price);
  const valid = Boolean(check?.ok) && studentName.trim().length >= 2 && priceCents !== null;

  const save = async () => {
    if (!valid || priceCents === null) return;
    const ok = await update("court.lesson.create", (d) => {
      const made = createLesson(d, { coachId, resourceId, date, from, duration, studentName, phone, priceCents }, localId);
      return made ? made.data : d;
    });
    if (ok) {
      const coach = data.staff.find((s) => s.id === coachId);
      toast.success("Clase reservada", `${firstName(studentName)} con ${coach ? firstName(coach.name) : "su monitor"} el ${shortDate(date)} a las ${clockLabel(from)}. La pista queda reservada.`);
      onClose();
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nueva clase particular"
      description="Pista y monitor en un solo paso."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Reservar clase
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Monitor">
          <ChoiceChips value={coachId} onChange={setCoachId} options={coaches.map((c) => ({ value: c.id, label: firstName(c.name) }))} />
        </FormField>
        <FormField label="Pista">
          <ChoiceChips value={resourceId} onChange={setResourceId} options={courts.map((r) => ({ value: r.id, label: r.name }))} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Día" htmlFor="cl-date">
            <input id="cl-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hora" htmlFor="cl-from">
            <select id="cl-from" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: 30 }, (_, i) => 8 * 60 + i * 30).map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Duración">
          <ChoiceChips value={String(duration)} onChange={(v) => setDuration(Number(v))} options={[60, 90].map((m) => ({ value: String(m), label: durationLabel(m) }))} />
        </FormField>
        <FormField label="Alumno" htmlFor="cl-name">
          <div className="grid gap-2 sm:grid-cols-2">
            <input id="cl-name" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Nombre" className={inputClass} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Móvil" aria-label="Móvil" className={inputClass} />
          </div>
        </FormField>
        <FormField label="Precio (€)" htmlFor="cl-price">
          <input id="cl-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
        </FormField>
        {check && !check.ok ? (
          <p className="text-sm text-rose-600">
            {check.reason === "court" ? "La pista está ocupada o cerrada a esa hora." : "El monitor ya tiene clase a esa hora."}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Monitores                                                           */
/* ------------------------------------------------------------------ */

function coachList(data: ReturnType<typeof usePro>["data"]) {
  const ops = courtsOps(data);
  const ids = new Set([...ops.school.map((g) => g.coachId), ...ops.lessons.map((l) => l.coachId), ...Object.keys(ops.coachRates)]);
  const list = data.staff.filter((s) => ids.has(s.id));
  return list.length ? list : data.staff;
}

function CoachesView() {
  const { data, now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const month = today.slice(0, 7);
  const coaches = coachList(data);
  const rows = coaches.map((c) => ({ coach: c, month: coachMonth(data, c.id, month) }));
  const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const totalPay = rows.reduce((a, r) => a + r.month.payCents, 0);
  if (!coaches.length)
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty icon={School} title="Sin monitores" body="Invita a tus monitores desde Equipo: verán sus clases en el móvil y pasarán lista." />
      </div>
    );
  return (
    <Panel
      title={`Horas de ${monthName}`}
      description={totalPay ? `A pagar este mes: ${money(totalPay)} entre todos.` : "Pon el precio por hora de cada monitor para calcular lo que se le paga."}
      flush
    >
      <RowList>
        {rows.map(({ coach, month: m }) => {
          const groups = ops.school.filter((g) => g.coachId === coach.id);
          const minutes = m.groupMinutes + m.lessonMinutes;
          return (
            <div key={coach.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <Avatar name={coach.name} tone={coach.tone} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{coach.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  {plural(groups.length, "grupo", "grupos")} y {plural(m.lessons, "particular", "particulares")}
                  {ops.coachRates[coach.id] ? `, a ${money(ops.coachRates[coach.id])} la hora` : ""}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-heading text-lg font-extrabold tabular">{durationLabel(minutes)}</span>
                <span className="block text-xs text-text-muted tabular">{m.payCents ? money(m.payCents) : "Sin precio por hora"}</span>
              </span>
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo grupo                                                         */
/* ------------------------------------------------------------------ */

function NewGroupDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const courts = data.resources.filter((r) => r.kind === "court");
  const coaches = coachList(data);
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState("Iniciación");
  const [coachId, setCoachId] = React.useState("");
  const [resourceId, setResourceId] = React.useState("");
  const [weekday, setWeekday] = React.useState(0);
  const [from, setFrom] = React.useState(18 * 60);
  const [duration, setDuration] = React.useState(60);
  const [capacity, setCapacity] = React.useState(4);
  const [fee, setFee] = React.useState("40");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setLevel("Iniciación");
    setCoachId(coaches[0]?.id ?? "");
    setResourceId(courts[courts.length - 1]?.id ?? "");
    setWeekday(0);
    setFrom(18 * 60);
    setDuration(60);
    setCapacity(4);
    setFee("40");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const feeCents = parseEuros(fee);
  const group: ProSchoolGroup = {
    id: "nuevo",
    name: name.trim(),
    level,
    coachId,
    resourceId,
    weekday,
    from,
    duration,
    capacity,
    monthlyFeeCents: feeCents ?? 0,
    students: [],
    attendance: {},
    season: { from: today, to: endOfCourse(today) },
  };
  const check = coachId && resourceId ? checkGroup(data, group) : null;
  const valid = group.name.length >= 3 && feeCents !== null && Boolean(check?.ok);

  const save = async () => {
    if (!valid) return;
    const saved = { ...group, id: localId("gr") };
    const ok = await update("court.school.group", (d) => saveGroup(d, saved));
    if (ok) {
      toast.success(
        "Grupo creado",
        `${saved.name}: ${DAYS[weekday].toLowerCase()} a las ${clockLabel(from)}, con la pista bloqueada hasta fin de curso.`,
      );
      onClose();
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo grupo"
      description="Misma pista, mismo monitor y misma hora cada semana."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Crear grupo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="gr-name">
          <input
            id="gr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Iniciación adultos"
            className={inputClass}
          />
        </FormField>
        <FormField label="Nivel">
          <ChoiceChips
            value={level}
            onChange={setLevel}
            options={["Iniciación", "2,5", "3,0", "3,5", "4,0"].map((l) => ({ value: l, label: l }))}
          />
        </FormField>
        <FormField label="Monitor">
          <ChoiceChips
            value={coachId}
            onChange={setCoachId}
            options={coaches.map((c) => ({ value: c.id, label: firstName(c.name) }))}
          />
        </FormField>
        <FormField label="Pista">
          <ChoiceChips
            value={resourceId}
            onChange={setResourceId}
            options={courts.map((r) => ({ value: r.id, label: r.name }))}
          />
        </FormField>
        <FormField label="Día">
          <ChoiceChips
            value={String(weekday)}
            onChange={(v) => setWeekday(Number(v))}
            options={DAYS.map((d, i) => ({ value: String(i), label: d.slice(0, 3) }))}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Hora" htmlFor="gr-from">
            <select id="gr-from" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: 30 }, (_, i) => 8 * 60 + i * 30).map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Cuota al mes (€)" htmlFor="gr-fee">
            <input id="gr-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Duración">
          <ChoiceChips
            value={String(duration)}
            onChange={(v) => setDuration(Number(v))}
            options={[60, 90].map((m) => ({ value: String(m), label: durationLabel(m) }))}
          />
        </FormField>
        <FormField label="Plazas">
          <ChoiceChips
            value={String(capacity)}
            onChange={(v) => setCapacity(Number(v))}
            options={[2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </FormField>
        {check && !check.ok ? (
          <p className="text-sm text-rose-600">
            {check.reason === "coach"
              ? "El monitor ya tiene otro grupo a esa hora ese día."
              : check.reason === "court"
                ? "Otro grupo usa esa pista a esa hora."
                : "Esa hora queda fuera de tu horario."}
          </p>
        ) : (
          <p className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-muted">
            Del {shortDate(today)} al {shortDate(endOfCourse(today))}. Las reservas que ya haya a esa hora se
            respetan: revisa las próximas semanas en Pistas.
          </p>
        )}
      </div>
    </Drawer>
  );
}
