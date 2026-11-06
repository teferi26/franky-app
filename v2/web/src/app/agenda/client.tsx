"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  CheckSquare,
  Cloud,
  CloudOff,
  Flame,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Smartphone,
  Sun,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DAY_LABELS_SHORT,
  dayKey,
  examCountdown,
  fmtDateTime,
  groupClassesByDay,
  hasAnyData,
  sortTasks,
  summarizeToday,
  type ClassItem,
  type ExamItem,
  type StudyBlob,
  type TaskItem,
} from "@/lib/agenda-types";
import { ClassDialog, ExamDialog, TaskDialog } from "./forms";

// ─── Agenda del estudiante (cliente) ──────────────────────────────────────
// Recibe del servidor el blob de study_data y lo edita en memoria. Cada cambio
// se guarda ~1,5 s después (agrupa ráfagas, igual que la app) escribiendo el
// JSON COMPLETO con un savedAt nuevo: última escritura gana. Se conserva
// `notaMedia` tal cual llega para no pisar lo que guardó la calculadora.
//
// La racha se toca al cargar con la fecha local del navegador (touch_streak es
// idempotente por día) y se pinta con lo que devuelve el servidor.

type SaveState = "idle" | "saving" | "saved" | "error";
type Streak = { count: number; best: number };

type Props = {
  userId: string;
  initialBlob: StudyBlob;
  /** true si ya existía fila en study_data (creada aquí o desde la app). */
  hasRow: boolean;
  /** false si study_data no está disponible (migración sin aplicar). */
  storageReady: boolean;
  initialStreak: Streak | null;
};

type Dialogs =
  | { kind: "none" }
  | { kind: "class"; item: ClassItem | null; defaultDay?: number }
  | { kind: "exam"; item: ExamItem | null }
  | { kind: "task"; item: TaskItem | null };

const PRIORITY_STYLE: Record<TaskItem["priority"], string> = {
  alta: "text-error",
  normal: "text-violet",
  baja: "text-text-muted",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** Media ponderada si notaMedia trae la lista de la calculadora; null si no. */
function notaMediaOf(raw: unknown): { media: number; count: number } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  let credits = 0;
  let weighted = 0;
  for (const s of raw as { credits?: unknown; grade?: unknown }[]) {
    const c = Number(s?.credits);
    const g = Number(s?.grade);
    if (!Number.isFinite(c) || !Number.isFinite(g) || c <= 0) continue;
    credits += c;
    weighted += c * g;
  }
  if (credits === 0) return null;
  return { media: weighted / credits, count: raw.length };
}

export default function AgendaClient({ userId, initialBlob, hasRow, storageReady, initialStreak }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [blob, setBlob] = useState<StudyBlob>(initialBlob);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [streak, setStreak] = useState<Streak | null>(initialStreak);
  const [dialog, setDialog] = useState<Dialogs>({ kind: "none" });
  // Con reloj para que "próxima clase" y las cuentas atrás se muevan solas
  // si la pestaña se queda abierta toda la mañana.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Racha: un toque al cargar con la fecha local ──────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("touch_streak", { p_day: dayKey() });
        if (error || cancelled) return;
        const row = (Array.isArray(data) ? data[0] : data) as
          | { streak_count?: number; streak_best?: number }
          | null
          | undefined;
        if (row) {
          setStreak({ count: Number(row.streak_count ?? 0), best: Number(row.streak_best ?? 0) });
        }
      } catch {
        // sin RPC (migración 170 pendiente): la racha se queda como estaba
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Guardado en la nube, con retraso para agrupar cambios ─────────────
  const pendingRef = useRef<StudyBlob | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    setSaveState("saving");
    const payload: StudyBlob = { ...next, v: 1, savedAt: new Date().toISOString() };
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("study_data")
        .upsert({ user_id: userId, data: payload, updated_at: payload.savedAt });
      if (error) throw error;
      setBlob((b) => ({ ...b, savedAt: payload.savedAt }));
      setSaveState("saved");
    } catch {
      // Se deja el blob en pendiente para que "Reintentar" tenga qué enviar.
      pendingRef.current = payload;
      setSaveState("error");
      toast.error("No se pudo guardar tu agenda", "Revisa tu conexión y pulsa Reintentar.");
    }
  }, [userId, toast]);

  const commit = useCallback(
    (updater: (b: StudyBlob) => StudyBlob) => {
      setBlob((prev) => {
        const next = updater(prev);
        pendingRef.current = next;
        return next;
      });
      setSaveState("saving");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, 1500);
    },
    [flush]
  );

  // Si se cierra la pestaña con un guardado pendiente, se intenta al vuelo.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && pendingRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  // ── Mutaciones ───────────────────────────────────────────────────────
  const closeDialog = () => setDialog({ kind: "none" });

  const saveClass = (c: ClassItem) => {
    commit((b) => {
      const exists = b.classes.some((x) => x.id === c.id);
      return { ...b, classes: exists ? b.classes.map((x) => (x.id === c.id ? c : x)) : [...b.classes, c] };
    });
    closeDialog();
  };
  const deleteClass = async (id: string) => {
    if (!(await confirm({ title: "¿Borrar esta clase?", description: "Desaparecerá del horario también en la app.", variant: "danger", confirmText: "Borrar" }))) return;
    commit((b) => ({ ...b, classes: b.classes.filter((x) => x.id !== id) }));
    closeDialog();
  };

  const saveExam = (e: ExamItem) => {
    commit((b) => {
      const exists = b.exams.some((x) => x.id === e.id);
      const list = exists ? b.exams.map((x) => (x.id === e.id ? e : x)) : [...b.exams, e];
      return { ...b, exams: list.sort((a, c) => a.date.localeCompare(c.date)) };
    });
    closeDialog();
  };
  const deleteExam = async (id: string) => {
    if (!(await confirm({ title: "¿Borrar este examen?", description: "Se quitará de la lista y de la cuenta atrás.", variant: "danger", confirmText: "Borrar" }))) return;
    commit((b) => ({ ...b, exams: b.exams.filter((x) => x.id !== id) }));
    closeDialog();
  };

  const saveTask = (t: TaskItem) => {
    commit((b) => {
      const exists = b.tasks.some((x) => x.id === t.id);
      const list = exists ? b.tasks.map((x) => (x.id === t.id ? t : x)) : [...b.tasks, t];
      return { ...b, tasks: sortTasks(list) };
    });
    closeDialog();
  };
  const deleteTask = async (id: string) => {
    if (!(await confirm({ title: "¿Borrar esta entrega?", variant: "danger", confirmText: "Borrar" }))) return;
    commit((b) => ({ ...b, tasks: b.tasks.filter((x) => x.id !== id) }));
    closeDialog();
  };
  const toggleTask = (id: string) => {
    commit((b) => ({
      ...b,
      tasks: sortTasks(
        b.tasks.map((t) =>
          t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : t
        )
      ),
    }));
  };

  // ── Derivados ────────────────────────────────────────────────────────
  const today = useMemo(() => summarizeToday(blob, now), [blob, now]);
  const week = useMemo(() => groupClassesByDay(blob.classes), [blob.classes]);
  const tasks = useMemo(() => sortTasks(blob.tasks), [blob.tasks]);
  const upcomingExams = today.upcomingExams;
  const pastExams = useMemo(
    () => blob.exams.filter((e) => new Date(e.date).getTime() < now.getTime()).sort((a, b) => b.date.localeCompare(a.date)),
    [blob.exams, now]
  );
  const nota = useMemo(() => notaMediaOf(blob.notaMedia), [blob.notaMedia]);
  const empty = !hasAnyData(blob);
  const todayKey = dayKey(now);
  const dateLabel = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* ── Cabecera tipográfica (v3): fecha como eyebrow, título grande ── */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow capitalize text-violet">{dateLabel}</p>
              <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
                {greeting()}, esta es tu agenda
              </h1>
              <p className="mt-3 max-w-xl text-text-muted">
                Horario, exámenes y entregas. Lo que cambies aquí lo verás también en la app, y al revés.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <StreakBadge streak={streak} />
              <SaveIndicator state={saveState} ready={storageReady} onRetry={() => void flush()} />
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {!storageReady && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-sm shadow-card">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-text-secondary">
              La copia en la nube no está disponible ahora mismo. Puedes ver y editar tu agenda, pero los cambios no se
              guardarán hasta que vuelva.
            </p>
          </div>
        )}

        {/* ── Vacío: nada ni aquí ni en la app ───────────────────────── */}
        {empty && (
          <Reveal as="section" className="rounded-3xl border border-dashed border-border px-6 py-14 text-center sm:py-20">
            <CalendarDays className="mx-auto h-8 w-8 text-text-muted" strokeWidth={1.5} />
            <h2 className="mt-5 font-heading text-2xl font-bold tracking-tight text-text-primary">Tu agenda está vacía</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
              {hasRow
                ? "Todavía no has metido ninguna clase, examen ni entrega."
                : "Puedes empezar aquí mismo o desde la pestaña Estudio de la app: se sincroniza solo con tu cuenta."}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Button variant="dark" onClick={() => setDialog({ kind: "class", item: null })}>
                <Plus className="h-4 w-4" /> Añadir clase
              </Button>
              <Button variant="outline" onClick={() => setDialog({ kind: "exam", item: null })}>
                <GraduationCap className="h-4 w-4" /> Añadir examen
              </Button>
              <Button variant="outline" onClick={() => setDialog({ kind: "task", item: null })}>
                <CheckSquare className="h-4 w-4" /> Añadir entrega
              </Button>
            </div>
            <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-text-muted">
              <Smartphone className="h-3.5 w-3.5" /> En el móvil, además, te avisa el día antes de cada examen y entrega.
            </p>
          </Reveal>
        )}

        {/* ── Hoy: tres cifras en una fila, separadas por hairlines ────── */}
        {!empty && (
          <Reveal
            as="section"
            aria-labelledby="hoy-title"
            className="grid divide-y divide-border-light rounded-3xl border border-border bg-bg-primary shadow-card md:grid-cols-3 md:divide-x md:divide-y-0"
          >
            <div className="p-6">
              <h2 id="hoy-title" className="eyebrow flex items-center gap-1.5 text-text-muted">
                <Sun className="h-3.5 w-3.5" /> Hoy
              </h2>
              {today.nextClass ? (
                <>
                  <p className="mt-3 text-xs text-text-muted">Próxima clase</p>
                  <p className="mt-0.5 font-heading text-2xl font-bold tracking-tight text-text-primary">{today.nextClass.subject}</p>
                  <p className="mt-1 text-sm text-text-secondary tabular">
                    {today.nextClass.startTime} a {today.nextClass.endTime}
                    {today.nextClass.room ? ` · ${today.nextClass.room}` : ""}
                  </p>
                </>
              ) : today.todayClasses.length > 0 ? (
                <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-text-primary">Ya no te quedan clases por hoy.</p>
              ) : (
                <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-text-primary">Hoy no tienes clases.</p>
              )}
              {today.todayClasses.length > 0 && (
                <p className="mt-3 text-xs text-text-muted tabular">
                  {today.todayClasses.length} {today.todayClasses.length === 1 ? "clase" : "clases"} en total
                </p>
              )}
            </div>

            <div className="p-6">
              <h3 className="eyebrow flex items-center gap-1.5 text-text-muted">
                <GraduationCap className="h-3.5 w-3.5" /> Próximos exámenes
              </h3>
              {upcomingExams.length === 0 ? (
                <p className="mt-3 text-sm text-text-secondary">Sin exámenes a la vista.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {upcomingExams.slice(0, 3).map(({ item }) => (
                    <li key={item.id} className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium text-text-primary">{item.subject}</span>
                      <span className={`shrink-0 text-xs font-semibold tabular ${examCountdown(item.date, now.getTime()) === "es hoy" ? "text-error" : "text-violet"}`}>
                        {examCountdown(item.date, now.getTime())}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-6">
              <h3 className="eyebrow flex items-center gap-1.5 text-text-muted">
                <CheckSquare className="h-3.5 w-3.5" /> Entregas
              </h3>
              {today.pending === 0 ? (
                <p className="mt-3 text-sm text-text-secondary">Nada pendiente. Disfruta.</p>
              ) : (
                <div className="mt-3 space-y-1 text-sm tabular">
                  {today.overdue.length > 0 && (
                    <p className="font-semibold text-error">
                      {today.overdue.length} {today.overdue.length === 1 ? "vencida" : "vencidas"}
                    </p>
                  )}
                  {today.dueToday.length > 0 && (
                    <p className="font-semibold text-warning">
                      {today.dueToday.length} para hoy
                    </p>
                  )}
                  <p className="text-text-secondary">
                    {today.pending} {today.pending === 1 ? "pendiente" : "pendientes"} en total
                  </p>
                </div>
              )}
            </div>
          </Reveal>
        )}

        {/* ── Horario semanal, por días ──────────────────────────────── */}
        <Reveal as="section" aria-labelledby="horario-title">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow flex items-center gap-1.5 text-text-muted">
                <CalendarClock className="h-3.5 w-3.5" /> Semana
              </p>
              <h2 id="horario-title" className="mt-2 font-heading text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                Horario
              </h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "class", item: null })}>
              <Plus className="h-4 w-4" /> Clase
            </Button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-border bg-bg-primary shadow-card">
            <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))` }}>
              {week.map((d) => {
                const isToday = d.dayOfWeek === now.getDay();
                return (
                  <div key={d.dayOfWeek} className={`border-r border-border-light last:border-r-0 ${isToday ? "bg-bg-secondary/60" : ""}`}>
                    <div className={`flex items-center justify-center gap-1.5 border-b border-border-light px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] ${isToday ? "text-text-primary" : "text-text-muted"}`}>
                      {isToday && <span className="h-1.5 w-1.5 rounded-full bg-violet" aria-hidden="true" />}
                      {d.label}
                    </div>
                    <ul className="min-h-[160px] space-y-1.5 p-2">
                      {d.items.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "class", item: c })}
                            className="w-full rounded-xl border border-border bg-bg-primary p-2.5 text-left shadow-card transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-text-primary/30 hover:shadow-card-hover motion-reduce:hover:translate-y-0"
                            aria-label={`Editar ${c.subject}, ${DAY_LABELS_SHORT[c.dayOfWeek]} de ${c.startTime} a ${c.endTime}`}
                          >
                            <p className="text-[11px] font-semibold text-violet tabular">
                              {c.startTime} a {c.endTime}
                            </p>
                            <p className="truncate text-sm font-medium text-text-primary">{c.subject}</p>
                            {(c.room || c.teacher) && (
                              <p className="truncate text-[11px] text-text-muted">
                                {[c.room, c.teacher].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "class", item: null, defaultDay: d.dayOfWeek })}
                          className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-1.5 text-[11px] text-text-muted transition-colors hover:border-text-primary/40 hover:text-text-primary"
                          aria-label={`Añadir clase el ${d.label}`}
                        >
                          <Plus className="h-3 w-3" /> Añadir
                        </button>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* ── Exámenes ─────────────────────────────────────────────── */}
          <Reveal as="section" aria-labelledby="examenes-title">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow flex items-center gap-1.5 text-text-muted">
                  <GraduationCap className="h-3.5 w-3.5" /> Cuenta atrás
                </p>
                <h2 id="examenes-title" className="mt-2 font-heading text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                  Exámenes
                </h2>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "exam", item: null })}>
                <Plus className="h-4 w-4" /> Examen
              </Button>
            </div>
            {blob.exams.length === 0 ? (
              <EmptyCard text="Sin exámenes apuntados. Añade el primero y verás la cuenta atrás." />
            ) : (
              <ul className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
                {[...upcomingExams.map((x) => x.item), ...pastExams].map((e) => {
                  const past = new Date(e.date).getTime() < now.getTime();
                  const cd = examCountdown(e.date, now.getTime());
                  return (
                    <li key={e.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-bg-secondary ${past ? "opacity-60" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text-primary">{e.subject}</p>
                        <p className="text-xs text-text-muted tabular">
                          {fmtDateTime(e.date)}
                          {e.room ? ` · ${e.room}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold tabular ${past ? "text-text-muted" : cd === "es hoy" || cd === "es mañana" ? "text-error" : "text-violet"}`}>
                        {cd}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "exam", item: e })}
                        aria-label={`Editar examen de ${e.subject}`}
                        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>

          {/* ── Entregas ─────────────────────────────────────────────── */}
          <Reveal as="section" aria-labelledby="entregas-title" delay={80}>
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow flex items-center gap-1.5 text-text-muted">
                  <CheckSquare className="h-3.5 w-3.5" /> Pendientes
                </p>
                <h2 id="entregas-title" className="mt-2 font-heading text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                  Entregas
                </h2>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "task", item: null })}>
                <Plus className="h-4 w-4" /> Entrega
              </Button>
            </div>
            {tasks.length === 0 ? (
              <EmptyCard text="Sin entregas. Apunta trabajos y prácticas con su fecha límite." />
            ) : (
              <ul className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
                {tasks.map((t) => {
                  const dueDate = t.due ? new Date(t.due) : null;
                  const overdue = !t.done && dueDate !== null && dueDate < now && dayKey(dueDate) !== todayKey;
                  const dueToday = !t.done && dueDate !== null && dayKey(dueDate) === todayKey;
                  return (
                    <li key={t.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-bg-secondary ${t.done ? "opacity-60" : ""}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={t.done}
                        aria-label={t.done ? `Marcar "${t.title}" como pendiente` : `Marcar "${t.title}" como hecha`}
                        onClick={() => toggleTask(t.id)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${t.done ? "border-text-primary bg-text-primary text-bg-primary" : "border-border hover:border-text-primary"}`}
                      >
                        {t.done && <Check className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-medium text-text-primary ${t.done ? "line-through" : ""}`}>{t.title}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted tabular">
                          {t.subject && <span>{t.subject}</span>}
                          {t.due && (
                            <span className={overdue ? "font-semibold text-error" : dueToday ? "font-semibold text-warning" : ""}>
                              {overdue ? "Venció " : dueToday ? "Hoy, " : ""}
                              {fmtDateTime(t.due)}
                            </span>
                          )}
                        </p>
                      </div>
                      {!t.done && (
                        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] ${PRIORITY_STYLE[t.priority]}`}>
                          {t.priority}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "task", item: t })}
                        aria-label={`Editar entrega ${t.title}`}
                        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>
        </div>

        {/* ── Nota media (solo lectura, viene de la calculadora) ──────── */}
        {nota && (
          <Reveal as="section" className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
            <div className="flex items-center gap-5">
              <div className="font-heading text-5xl font-extrabold tracking-tight text-text-primary tabular">
                {nota.media.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div>
                <p className="eyebrow text-text-muted">Tu nota media</p>
                <p className="mt-1 max-w-sm text-sm text-text-secondary">
                  Ponderada por créditos, con {nota.count} {nota.count === 1 ? "asignatura" : "asignaturas"} guardadas desde la app.
                </p>
              </div>
            </div>
            <Link href="/nota-media" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              Abrir la calculadora
              <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
        )}
      </div>

      {/* ── Diálogos ─────────────────────────────────────────────────── */}
      <ClassDialog
        open={dialog.kind === "class"}
        item={dialog.kind === "class" ? dialog.item : null}
        defaultDay={dialog.kind === "class" ? dialog.defaultDay : undefined}
        onClose={closeDialog}
        onSave={saveClass}
        onDelete={(id) => void deleteClass(id)}
      />
      <ExamDialog
        open={dialog.kind === "exam"}
        item={dialog.kind === "exam" ? dialog.item : null}
        onClose={closeDialog}
        onSave={saveExam}
        onDelete={(id) => void deleteExam(id)}
      />
      <TaskDialog
        open={dialog.kind === "task"}
        item={dialog.kind === "task" ? dialog.item : null}
        onClose={closeDialog}
        onSave={saveTask}
        onDelete={(id) => void deleteTask(id)}
      />
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-text-muted">
      {text}
    </div>
  );
}

function StreakBadge({ streak }: { streak: Streak | null }) {
  if (!streak) return null;
  // Racha como cifra suelta (sin tarjeta): la llama solo se enciende con racha viva.
  return (
    <div
      className="flex items-center gap-3"
      title={`Mejor racha: ${streak.best} ${streak.best === 1 ? "día" : "días"}`}
    >
      <Flame className={`h-6 w-6 ${streak.count > 0 ? "text-orange" : "text-text-muted"}`} strokeWidth={1.75} aria-hidden="true" />
      <div className="leading-tight">
        <p className="font-heading text-2xl font-extrabold tracking-tight text-text-primary tabular">
          {streak.count} <span className="text-xs font-semibold text-text-muted">{streak.count === 1 ? "día" : "días"}</span>
        </p>
        <p className="flex items-center gap-1 text-[11px] text-text-muted tabular">
          <Trophy className="h-3 w-3" aria-hidden="true" /> Mejor: {streak.best}
        </p>
      </div>
    </div>
  );
}

function SaveIndicator({ state, ready, onRetry }: { state: SaveState; ready: boolean; onRetry: () => void }) {
  if (!ready) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warning" role="status">
        <CloudOff className="h-4 w-4" /> Sin copia en la nube
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
      </span>
    );
  }
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-semibold text-error hover:underline" role="status">
        <CloudOff className="h-4 w-4" /> No se guardó. Reintentar
      </button>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success" role="status">
        <Cloud className="h-4 w-4" /> Guardado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted" role="status">
      <Cloud className="h-4 w-4" /> Sincronizado con la app
    </span>
  );
}
