import { captureSessionIdentity, scheduleOwnedNotification } from './local-notifications';
// ─── Estudio: tareas, agenda unificada, copia en la nube y resumen diario ──
// La organización académica vive en el dispositivo (AsyncStorage, como el
// horario y la nota media) y se copia a la nube (study_data, migración 170)
// para no perderla al cambiar de móvil y para que la web pinte la misma
// agenda. Aquí están:
//   · Tareas/entregas: alta, hecho/deshecho, borrado, recordatorio local.
//   · Agenda: mezcla de clases (semanales), exámenes, tareas con fecha y
//     eventos a los que estás apuntado (servidor), por día.
//   · Resumen de la mañana: notificaciones locales de los próximos 7 días
//     con lo que toca ese día, reprogramadas en cada arranque.
//   · Exportar al calendario del móvil (expo-calendar).
import { studyStorage, type SessionIdentity } from './study-storage';
import { onSessionIdentityChange } from './session';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  getClasses, getExams, saveClasses, saveExams, cancelExamReminder,
  scheduleExamReminder, type ClassItem, type ExamItem,
} from './horario';
import { dayKey } from './streak';

// ── Tareas ──────────────────────────────────────────────────────────────────
export type TaskPriority = 'alta' | 'normal' | 'baja';
export type TaskItem = {
  id: string;
  title: string;
  subject: string | null;
  /** ISO completo (fecha + hora límite) o null si no tiene fecha. */
  due: string | null;
  priority: TaskPriority;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
  /** Recordatorio local (el día antes a las 18:00, o 2 h antes si es hoy). */
  notificationId: string | null;
};

const TASKS_KEY = 'franky.estudio.tareas.v1';
const DIGEST_IDS_KEY = 'franky.estudio.resumen.ids.v1';
const DIGEST_PREF_KEY = 'franky.estudio.resumen.pref.v1';
const CLOUD_STAMP_KEY = 'franky.estudio.nube.v1';
const NOTAMEDIA_KEY = 'franky.notamedia.v1';

const listeners = new Set<() => void>();
/** Avisa a las pantallas de que algo del estudio ha cambiado (tareas, clases, exámenes). */
export function onStudyChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
function notify() { for (const l of listeners) l(); }

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getTasks(owner: SessionIdentity | null = captureSessionIdentity(), strict = false): Promise<TaskItem[]> {
  try {
    const raw = await studyStorage.get(owner, TASKS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list as TaskItem[] : [];
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

async function saveTasks(list: TaskItem[], owner: SessionIdentity | null): Promise<void> {
  await studyStorage.set(owner, TASKS_KEY, JSON.stringify(list));
  notify();
  scheduleCloudSync(owner);
  rescheduleDigest({ force: true }, owner).catch(() => {});
}

async function scheduleTaskReminder(t: Pick<TaskItem, 'title' | 'due' | 'subject'>, owner: SessionIdentity | null): Promise<string | null> {
  if (!studyStorage.current(owner)) return null;
  if (!t.due) return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return null; // el permiso se pide desde la pantalla, no aquí
    const due = new Date(t.due);
    // Día antes a las 18:00; si ya estamos dentro de ese margen, 2 h antes.
    const when = new Date(due); when.setDate(when.getDate() - 1); when.setHours(18, 0, 0, 0);
    let fire = when;
    if (fire.getTime() <= Date.now()) fire = new Date(due.getTime() - 2 * 3600e3);
    if (fire.getTime() <= Date.now()) return null;
    const id = await scheduleOwnedNotification(owner, {
      content: {
        title: `Entrega: ${t.title}`,
        body: `${t.subject ? `${t.subject} · ` : ''}vence ${due.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${due.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
        data: { route: '/tareas' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
    });
    return id;
  } catch {
    return null;
  }
}

export async function addTask(input: { title: string; subject?: string | null; due?: string | null; priority?: TaskPriority }, owner: SessionIdentity | null = captureSessionIdentity()): Promise<TaskItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getTasks(owner, true);
    const notificationId = await scheduleTaskReminder({ title: input.title, due: input.due ?? null, subject: input.subject ?? null }, owner);
    const item: TaskItem = {
      id: newId(), title: input.title, subject: input.subject ?? null, due: input.due ?? null,
      priority: input.priority ?? 'normal', done: false, doneAt: null, createdAt: new Date().toISOString(), notificationId,
    };
    const next = sortTasks([...list, item]);
    await saveTasks(next, owner);
    return next;
  });
}

export async function updateTask(id: string, patch: Partial<Pick<TaskItem, 'title' | 'subject' | 'due' | 'priority'>>, owner: SessionIdentity | null = captureSessionIdentity()): Promise<TaskItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getTasks(owner, true);
    studyStorage.check(owner);
    const target = list.find((t) => t.id === id);
    if (!target) return list;
    const merged = { ...target, ...patch };
    let notificationId = target.notificationId;
    if (patch.due !== undefined || patch.title !== undefined) {
      await cancelReminder(target.notificationId);
      notificationId = merged.done ? null : await scheduleTaskReminder(merged, owner);
    }
    const next = sortTasks(list.map((t) => (t.id === id ? { ...merged, notificationId } : t)));
    await saveTasks(next, owner);
    return next;
  });
}

export async function toggleTask(id: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<TaskItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getTasks(owner, true);
    studyStorage.check(owner);
    const target = list.find((t) => t.id === id);
    if (!target) return list;
    const done = !target.done;
    let notificationId = target.notificationId;
    if (done) { await cancelReminder(target.notificationId); notificationId = null; }
    else notificationId = await scheduleTaskReminder(target, owner);
    const next = sortTasks(list.map((t) => (t.id === id ? { ...t, done, doneAt: done ? new Date().toISOString() : null, notificationId } : t)));
    await saveTasks(next, owner);
    return next;
  });
}

export async function removeTask(id: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<TaskItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getTasks(owner, true);
    studyStorage.check(owner);
    const target = list.find((t) => t.id === id);
    if (target) await cancelReminder(target.notificationId);
    const next = list.filter((t) => t.id !== id);
    await saveTasks(next, owner);
    return next;
  });
}

/** Borra las tareas hechas hace más de 30 días (limpieza silenciosa). */
export async function pruneOldTasks(owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  return studyStorage.mutate(owner, async () => {
    const list = await getTasks(owner, true);
    const limit = Date.now() - 30 * 864e5;
    const next = list.filter((t) => !(t.done && t.doneAt && new Date(t.doneAt).getTime() < limit));
    if (next.length !== list.length) await saveTasks(next, owner);
  });
}

async function cancelReminder(id: string | null | undefined) {
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ya no existe */ }
}

const PRIO_RANK: Record<TaskPriority, number> = { alta: 0, normal: 1, baja: 2 };
export function sortTasks(list: TaskItem[]): TaskItem[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt ?? '').localeCompare(a.doneAt ?? '');
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  });
}

// ── Eventos a los que estoy apuntado (servidor) ────────────────────────────
export type MyEvent = { id: string; title: string; start_date: string; end_date: string | null; venue: string | null; city: string | null; image_url: string | null };

let myEventsCache: { owner: string; at: number; rows: MyEvent[] } | null = null;

/** Eventos futuros a los que voy: gratuitos (event_participants) y de pago
 *  (event_tickets). Caché de 5 min en memoria; fail-soft a lista vacía. */
export async function getMyUpcomingEvents(force = false, owner: SessionIdentity | null = captureSessionIdentity()): Promise<MyEvent[]> {
  if (!studyStorage.current(owner)) return [];
  if (!force && myEventsCache?.owner === owner.userId && myEventsCache && Date.now() - myEventsCache.at < 5 * 60e3) return myEventsCache.rows;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!studyStorage.current(owner) || user?.id !== owner.userId) return [];
    const [parts, tickets] = await Promise.all([
      supabase.from('event_participants').select('event_id').eq('user_id', user.id).neq('status', 'cancelled'),
      supabase.from('event_tickets').select('event_id').eq('holder_id', user.id).in('status', ['valid', 'used', 'pending_payment']),
    ]);
    if (!studyStorage.current(owner)) return [];
    const ids = new Set<string>();
    for (const r of parts.data ?? []) ids.add(r.event_id as string);
    for (const r of tickets.data ?? []) ids.add(r.event_id as string);
    if (ids.size === 0) { myEventsCache = { owner: owner.userId, at: Date.now(), rows: [] }; return []; }
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('events')
      .select('id, title, start_date, end_date, venue, city, image_url')
      .in('id', [...ids])
      .gte('start_date', since.toISOString())
      .order('start_date', { ascending: true })
      .limit(50);
    if (!studyStorage.current(owner)) return [];
    const rows = (data ?? []) as MyEvent[];
    myEventsCache = { owner: owner.userId, at: Date.now(), rows };
    return rows;
  } catch {
    return studyStorage.current(owner) && myEventsCache?.owner === owner.userId ? myEventsCache.rows : [];
  }
}

// ── Agenda unificada ───────────────────────────────────────────────────────
export type AgendaItem = {
  key: string;
  kind: 'class' | 'exam' | 'task' | 'event';
  title: string;
  subtitle: string | null;
  start: Date;
  end: Date | null;
  /** true si no tiene hora concreta (tarea sin hora). */
  allDay: boolean;
  route: string;
  done?: boolean;
  refId: string;
};

function atTime(day: Date, hm: string): Date {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(day); d.setHours(h || 0, m || 0, 0, 0); return d;
}

/** Items de la agenda entre dos días (ambos incluidos), ordenados por hora. */
export function buildAgenda(
  from: Date, to: Date,
  src: { classes: ClassItem[]; exams: ExamItem[]; tasks: TaskItem[]; events: MyEvent[] },
): AgendaItem[] {
  const out: AgendaItem[] = [];
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(23, 59, 59, 999);
  // Clases: una instancia por semana dentro del rango.
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    for (const c of src.classes) {
      if (c.dayOfWeek !== dow) continue;
      out.push({
        key: `class-${c.id}-${dayKey(d)}`, kind: 'class', title: c.subject,
        subtitle: [c.room, c.teacher].filter(Boolean).join(' · ') || null,
        start: atTime(d, c.startTime), end: atTime(d, c.endTime), allDay: false, route: '/horario', refId: c.id,
      });
    }
  }
  for (const e of src.exams) {
    const dt = new Date(e.date);
    if (dt < start || dt > end) continue;
    out.push({ key: `exam-${e.id}`, kind: 'exam', title: e.subject, subtitle: e.room, start: dt, end: null, allDay: false, route: '/horario?tab=examenes', refId: e.id });
  }
  for (const t of src.tasks) {
    if (!t.due) continue;
    const dt = new Date(t.due);
    if (dt < start || dt > end) continue;
    out.push({ key: `task-${t.id}`, kind: 'task', title: t.title, subtitle: t.subject, start: dt, end: null, allDay: false, route: '/tareas', done: t.done, refId: t.id });
  }
  for (const ev of src.events) {
    const dt = new Date(ev.start_date);
    if (dt < start || dt > end) continue;
    out.push({
      key: `event-${ev.id}`, kind: 'event', title: ev.title, subtitle: [ev.venue, ev.city].filter(Boolean).join(' · ') || null,
      start: dt, end: ev.end_date ? new Date(ev.end_date) : null, allDay: false, route: `/evento/${ev.id}`, refId: ev.id,
    });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type StudySnapshot = { classes: ClassItem[]; exams: ExamItem[]; tasks: TaskItem[]; events: MyEvent[] };

/** Carga todo lo necesario para la agenda de una vez. */
export async function loadStudySnapshot(opts: { events?: boolean } = {}, owner: SessionIdentity | null = captureSessionIdentity()): Promise<StudySnapshot> {
  const [classes, exams, tasks, events] = await Promise.all([
    getClasses(owner), getExams(owner), getTasks(owner, true), opts.events === false ? Promise.resolve([]) : getMyUpcomingEvents(false, owner),
  ]);
  if (!studyStorage.current(owner)) return { classes: [], exams: [], tasks: [], events: [] };
  return { classes, exams, tasks, events };
}

/** Resumen de "hoy" para la tira del feed y el hub. */
export function summarizeToday(snap: StudySnapshot, now: Date = new Date()): {
  items: AgendaItem[];
  nextClass: AgendaItem | null;
  nextExam: { item: ExamItem; days: number } | null;
  dueToday: number;
  overdue: number;
  hasAnyData: boolean;
} {
  const items = buildAgenda(now, now, snap).filter((i) => i.kind !== 'task' || !i.done);
  const nextClass = items.find((i) => i.kind === 'class' && (i.end ?? i.start) > now) ?? null;
  const upcomingExams = snap.exams
    .map((e) => ({ item: e, days: Math.ceil((new Date(e.date).getTime() - now.getTime()) / 864e5) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days);
  const todayKey = dayKey(now);
  const dueToday = snap.tasks.filter((t) => !t.done && t.due && dayKey(new Date(t.due)) === todayKey).length;
  const overdue = snap.tasks.filter((t) => !t.done && t.due && new Date(t.due) < now && dayKey(new Date(t.due)) !== todayKey).length;
  return {
    items, nextClass, nextExam: upcomingExams[0] ?? null, dueToday, overdue,
    hasAnyData: snap.classes.length > 0 || snap.exams.length > 0 || snap.tasks.length > 0,
  };
}

// ── Resumen de la mañana (notificaciones locales) ──────────────────────────
export type DigestPref = { enabled: boolean; hour: number; minute: number };
const DEFAULT_DIGEST: DigestPref = { enabled: false, hour: 8, minute: 0 };

export async function getDigestPref(owner: SessionIdentity | null = captureSessionIdentity()): Promise<DigestPref> {
  try {
    const raw = await studyStorage.get(owner, DIGEST_PREF_KEY);
    return raw ? { ...DEFAULT_DIGEST, ...(JSON.parse(raw) as Partial<DigestPref>) } : DEFAULT_DIGEST;
  } catch { return DEFAULT_DIGEST; }
}

export async function setDigestPref(p: DigestPref, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  try { await studyStorage.set(owner, DIGEST_PREF_KEY, JSON.stringify(p)); } catch { /* sin disco */ }
  await rescheduleDigest({ force: true }, owner);
}

function digestBody(day: Date, snap: StudySnapshot): string | null {
  const items = buildAgenda(day, day, snap).filter((i) => i.kind !== 'task' || !i.done);
  const classes = items.filter((i) => i.kind === 'class');
  const exams = items.filter((i) => i.kind === 'exam');
  const tasks = items.filter((i) => i.kind === 'task');
  const events = items.filter((i) => i.kind === 'event');
  const parts: string[] = [];
  if (exams.length) parts.push(exams.length === 1 ? `examen de ${exams[0].title}` : `${exams.length} exámenes`);
  if (classes.length) {
    const first = classes[0];
    parts.push(`${classes.length} ${classes.length === 1 ? 'clase' : 'clases'} (la primera a las ${first.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})`);
  }
  if (tasks.length) parts.push(tasks.length === 1 ? `entrega: ${tasks[0].title}` : `${tasks.length} entregas`);
  if (events.length) parts.push(events.length === 1 ? `plan: ${events[0].title}` : `${events.length} planes`);
  // Examen mañana: lo avisamos hoy también, es lo que más importa.
  const tomorrow = new Date(day); tomorrow.setDate(tomorrow.getDate() + 1);
  const examsTomorrow = buildAgenda(tomorrow, tomorrow, snap).filter((i) => i.kind === 'exam');
  if (examsTomorrow.length) parts.push(`mañana ${examsTomorrow.length === 1 ? `examen de ${examsTomorrow[0].title}` : `${examsTomorrow.length} exámenes`}`);
  if (parts.length === 0) return null;
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Reprograma el resumen de la mañana de los próximos 7 días con los datos
 *  actuales. Llamar en cada arranque y tras cambiar clases/exámenes/tareas.
 *  Fail-soft en todo. */
// Se reprograma como mucho una vez cada 30 min por arranque/foreground (cada
// reprogramación cancela y crea hasta 7 avisos: no hace falta repetirlo cada
// vez que se vuelve a la app). Un cambio de datos fuerza el reprogramado.
let lastDigestAt = 0;
export async function rescheduleDigest(opts: { force?: boolean } = {}, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  if (!studyStorage.current(owner)) return;
  return studyStorage.mutate(owner, async () => {
    if (!studyStorage.current(owner)) return;
    if (!opts.force && Date.now() - lastDigestAt < 30 * 60e3) return;
    lastDigestAt = Date.now();
    try {
      const prevRaw = await studyStorage.get(owner, DIGEST_IDS_KEY);
      const prev: string[] = prevRaw ? JSON.parse(prevRaw) : [];
      for (const id of prev) { try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* nada */ } }
      await studyStorage.set(owner, DIGEST_IDS_KEY, '[]');

      const pref = await getDigestPref(owner);
      if (!pref.enabled) return;
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) return;
      const snap = await loadStudySnapshot({}, owner);
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(); day.setDate(day.getDate() + i); day.setHours(pref.hour, pref.minute, 0, 0);
        if (day.getTime() <= Date.now()) continue;
        const body = digestBody(day, snap);
        if (!body) continue;
        const id = await scheduleOwnedNotification(owner, {
          content: { title: i === 0 ? 'Hoy en tu uni' : `${day.toLocaleDateString('es-ES', { weekday: 'long' })} en tu uni`, body, data: { route: '/(tabs)/estudio' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: day },
        });
        if (id) ids.push(id);
      }
      await studyStorage.set(owner, DIGEST_IDS_KEY, JSON.stringify(ids));
    } catch { /* best-effort */ }
  });
}

// ── Recordatorio de racha (una sola notificación, a las 20:00 de hoy) ──────
const STREAK_NOTIF_KEY = 'franky.racha.aviso.v1';
export async function scheduleStreakNudge(streakCount: number, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  if (!studyStorage.current(owner)) return;
  try {
    const prev = await studyStorage.get(owner, STREAK_NOTIF_KEY);
    if (prev) { try { await Notifications.cancelScheduledNotificationAsync(prev); } catch { /* nada */ } }
    await studyStorage.remove(owner, STREAK_NOTIF_KEY);
    if (streakCount < 2) return; // sin racha que proteger no molestamos
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    // Mañana a las 20:00: si mañana se abre la app antes, este aviso se cancela
    // al reprogramar (esta misma función se llama en cada arranque).
    const when = new Date(); when.setDate(when.getDate() + 1); when.setHours(20, 0, 0, 0);
    const id = await scheduleOwnedNotification(owner, {
      content: { title: `Tu racha de ${streakCount} días está en juego`, body: 'Abre Franky un momento y sigue sumando.', data: { route: '/(tabs)/estudio' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    if (id) await studyStorage.set(owner, STREAK_NOTIF_KEY, id);
  } catch { /* best-effort */ }
}

// ── Exportar al calendario del móvil ───────────────────────────────────────
async function defaultCalendarId(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      const cal = await Calendar.getDefaultCalendarAsync();
      return cal?.id ?? null;
    }
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = cals.find((c) => c.allowsModifications && c.accessLevel === Calendar.CalendarAccessLevel.OWNER)
      ?? cals.find((c) => c.allowsModifications);
    return writable?.id ?? null;
  } catch { return null; }
}

/** Vuelca clases (semanales, hasta fin de curso), exámenes y tareas con fecha
 *  al calendario del sistema. Devuelve cuántos elementos se crearon. */
export async function exportToDeviceCalendar(what: { classes?: boolean; exams?: boolean; tasks?: boolean } = { classes: true, exams: true, tasks: true }, owner: SessionIdentity | null = captureSessionIdentity()): Promise<{ ok: boolean; count: number; reason?: string }> {
  try {
    studyStorage.check(owner);
    const { granted } = await Calendar.requestCalendarPermissionsAsync();
    if (!granted) return { ok: false, count: 0, reason: 'permission' };
    const calId = await defaultCalendarId();
    if (!calId) return { ok: false, count: 0, reason: 'no-calendar' };
    const snap = await loadStudySnapshot({ events: false }, owner);
    let count = 0;
    if (what.classes) {
      // Fin de curso: 30 de junio del curso académico en vigor.
      const now = new Date();
      const endOfCourse = new Date(now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear(), 5, 30);
      for (const c of snap.classes) {
        const first = new Date(now); first.setHours(0, 0, 0, 0);
        while (first.getDay() !== c.dayOfWeek) first.setDate(first.getDate() + 1);
        studyStorage.check(owner);
        await Calendar.createEventAsync(calId, {
          title: c.subject,
          startDate: atTime(first, c.startTime),
          endDate: atTime(first, c.endTime),
          location: c.room ?? undefined,
          notes: c.teacher ? `Profesor/a: ${c.teacher}` : undefined,
          recurrenceRule: { frequency: Calendar.Frequency.WEEKLY, endDate: endOfCourse },
        });
        count++;
      }
    }
    if (what.exams) {
      for (const e of snap.exams) {
        const start = new Date(e.date);
        studyStorage.check(owner);
        await Calendar.createEventAsync(calId, {
          title: `Examen: ${e.subject}`, startDate: start, endDate: new Date(start.getTime() + 2 * 3600e3),
          location: e.room ?? undefined, alarms: [{ relativeOffset: -24 * 60 }],
        });
        count++;
      }
    }
    if (what.tasks) {
      for (const t of snap.tasks) {
        if (t.done || !t.due) continue;
        const start = new Date(t.due);
        studyStorage.check(owner);
        await Calendar.createEventAsync(calId, {
          title: `Entrega: ${t.title}`, startDate: start, endDate: new Date(start.getTime() + 30 * 60e3),
          notes: t.subject ?? undefined, alarms: [{ relativeOffset: -24 * 60 }],
        });
        count++;
      }
    }
    return { ok: true, count };
  } catch {
    return { ok: false, count: 0, reason: 'error' };
  }
}

// ── Copia en la nube (study_data, migración 170) ───────────────────────────
type CloudBlob = {
  v: 1;
  classes: ClassItem[];
  exams: Omit<ExamItem, 'notificationId'>[];
  tasks: Omit<TaskItem, 'notificationId'>[];
  notaMedia: unknown;
  savedAt: string;
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
onSessionIdentityChange(() => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  myEventsCache = null;
  lastDigestAt = 0;
});

/** The owner is captured when the edit happens, not when the timer fires. */
export function scheduleCloudSync(owner: SessionIdentity | null = captureSessionIdentity()) {
  if (!studyStorage.current(owner)) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void pushStudyToCloud(owner); }, 3000);
}

export async function pushStudyToCloud(owner: SessionIdentity | null = captureSessionIdentity()): Promise<boolean> {
  try {
    studyStorage.check(owner);
    const { data: { user } } = await supabase.auth.getUser();
    if (!studyStorage.current(owner) || user?.id !== owner.userId) return false;
    const [classes, exams, tasks] = await Promise.all([getClasses(owner, true), getExams(owner, true), getTasks(owner, true)]);
    const raw = await studyStorage.get(owner, NOTAMEDIA_KEY);
    const notaMedia: unknown = raw ? JSON.parse(raw) : null;
    const blob: CloudBlob = {
      v: 1, classes,
      exams: exams.map(({ notificationId: _n, ...e }) => e),
      tasks: tasks.map(({ notificationId: _n, ...t }) => t),
      notaMedia, savedAt: new Date().toISOString(),
    };
    studyStorage.check(owner);
    const { error } = await supabase.from('study_data').upsert({ user_id: owner!.userId, data: blob, updated_at: blob.savedAt });
    if (error || !studyStorage.current(owner)) return false;
    await studyStorage.set(owner, CLOUD_STAMP_KEY, blob.savedAt);
    return true;
  } catch { return false; }
}

/** Restore only this account's empty local store. Serializing with edits prevents overwriting a new draft. */
export async function pullStudyFromCloudIfEmpty(owner: SessionIdentity | null = captureSessionIdentity()): Promise<boolean> {
  try {
    return await studyStorage.mutate(owner, async () => {
      const [classes, exams, tasks, grades] = await Promise.all([getClasses(owner, true), getExams(owner, true), getTasks(owner, true), studyStorage.get(owner, NOTAMEDIA_KEY)]);
      if (classes.length || exams.length || tasks.length || grades) return false;
      const { data: { user } } = await supabase.auth.getUser();
      if (!studyStorage.current(owner) || user?.id !== owner.userId) return false;
      const { data, error } = await supabase.from('study_data').select('data').eq('user_id', owner.userId).maybeSingle();
      if (error || !data?.data || !studyStorage.current(owner)) return false;
      const blob = data.data as Partial<CloudBlob>;
      if (blob.v !== 1) return false;
      if (Array.isArray(blob.classes) && blob.classes.length) await saveClasses(blob.classes, owner);
      if (Array.isArray(blob.exams) && blob.exams.length) {
        const restored: ExamItem[] = [];
        for (const e of blob.exams) {
          studyStorage.check(owner);
          const notificationId = new Date(e.date) > new Date() ? await scheduleExamReminder(e.subject, new Date(e.date), e.room, owner) : null;
          restored.push({ ...e, notificationId });
        }
        await saveExams(restored, owner);
      }
      if (Array.isArray(blob.tasks) && blob.tasks.length) {
        const restored: TaskItem[] = [];
        for (const t of blob.tasks) {
          studyStorage.check(owner);
          const notificationId = !t.done ? await scheduleTaskReminder(t, owner) : null;
          restored.push({ ...t, notificationId });
        }
        await studyStorage.set(owner, TASKS_KEY, JSON.stringify(restored));
      }
      if (blob.notaMedia) await studyStorage.set(owner, NOTAMEDIA_KEY, JSON.stringify(blob.notaMedia));
      studyStorage.check(owner);
      notify();
      return true;
    });
  } catch { return false; }
}

// Pequeña utilidad compartida por las pantallas de estudio.
export const KIND_LABEL: Record<AgendaItem['kind'], string> = { class: 'Clase', exam: 'Examen', task: 'Entrega', event: 'Plan' };

/** Cierra sesión: borra los avisos programados para no avisar a otra cuenta. */
export async function clearStudyReminders(owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  try {
    const [exams, tasks] = await Promise.all([getExams(owner, true), getTasks(owner, true)]);
    for (const e of exams) await cancelExamReminder(e.notificationId);
    for (const t of tasks) await cancelReminder(t.notificationId);
    const prevRaw = await studyStorage.get(owner, DIGEST_IDS_KEY);
    const prev: string[] = prevRaw ? JSON.parse(prevRaw) : [];
    for (const id of prev) await cancelReminder(id);
  } catch { /* nada */ }
}
