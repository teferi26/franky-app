import { captureSessionIdentity, scheduleOwnedNotification } from './local-notifications';
// ─── Horario de clases y exámenes (mejora 81) ────────────────────────────
// Capa de datos 100% local: es información personal del usuario (su horario
// de clases, sus exámenes) que no necesita servidor, así que vive en
// AsyncStorage (igual que nota-media.tsx). Aquí están los tipos, la
// carga/guardado, el alta/baja de clases y exámenes, la agrupación semanal
// y el recordatorio local (expo-notifications) que se programa un día antes
// de cada examen, copiando el patrón de app/evento/[id].tsx (pide permiso,
// falla en silencio si no lo hay).
import { studyStorage, type SessionIdentity } from './study-storage';
import * as Notifications from 'expo-notifications';

const CLASSES_KEY = 'franky.horario.clases.v1';
const EXAMS_KEY = 'franky.horario.examenes.v1';

// dayOfWeek sigue el criterio de Date.getDay(): 0 = domingo … 6 = sábado.
export type ClassItem = {
  id: string;
  subject: string;
  dayOfWeek: number;
  startTime: string; // 'HH:MM'
  endTime: string;   // 'HH:MM'
  room: string | null;
  teacher: string | null;
};

export type ExamItem = {
  id: string;
  subject: string;
  date: string; // ISO completo (fecha + hora del examen)
  room: string | null;
  // id que devuelve expo-notifications al programar el recordatorio, para
  // poder cancelarlo si el usuario borra el examen. null si no se pudo
  // programar (sin permiso o sin margen de un día antes).
  notificationId: string | null;
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Clases ────────────────────────────────────────────────────────────
export async function getClasses(owner: SessionIdentity | null = captureSessionIdentity(), strict = false): Promise<ClassItem[]> {
  try {
    const raw = await studyStorage.get(owner, CLASSES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list as ClassItem[] : [];
  } catch (error) { if (strict) throw error; return []; }
}

export async function saveClasses(list: ClassItem[], owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  await studyStorage.set(owner, CLASSES_KEY, JSON.stringify(list));
}

export async function addClass(input: Omit<ClassItem, 'id'>, owner: SessionIdentity | null = captureSessionIdentity()): Promise<ClassItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getClasses(owner, true);
    const next = [...list, { id: newId(), ...input }];
    await saveClasses(next, owner);
    return next;
  });
}

export async function updateClass(id: string, patch: Partial<Omit<ClassItem, 'id'>>, owner: SessionIdentity | null = captureSessionIdentity()): Promise<ClassItem[]> {
  return studyStorage.mutate(owner, async () => {
    const next = (await getClasses(owner, true)).map((c) => (c.id === id ? { ...c, ...patch } : c));
    await saveClasses(next, owner);
    return next;
  });
}

export async function removeClass(id: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<ClassItem[]> {
  return studyStorage.mutate(owner, async () => {
    const next = (await getClasses(owner, true)).filter((c) => c.id !== id);
    await saveClasses(next, owner);
    return next;
  });
}

// Etiquetas de día, en el índice de Date.getDay() (0=domingo).
export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAY_LABELS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Vista semanal: lunes a viernes SIEMPRE (aunque un día no tenga nada, para
// que la semana se vea completa), y sábado/domingo solo si hay algo metido
// ahí. Cada día sale ordenado por hora de inicio.
export function groupClassesByDay(list: ClassItem[]): { dayOfWeek: number; label: string; items: ClassItem[] }[] {
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const WEEKEND = [6, 0];
  const byDay = (d: number) => list.filter((c) => c.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const out: { dayOfWeek: number; label: string; items: ClassItem[] }[] = [];
  for (const d of WEEKDAYS) out.push({ dayOfWeek: d, label: DAY_LABELS[d], items: byDay(d) });
  for (const d of WEEKEND) {
    const items = byDay(d);
    if (items.length > 0) out.push({ dayOfWeek: d, label: DAY_LABELS[d], items });
  }
  return out;
}

// ── Exámenes ──────────────────────────────────────────────────────────
export async function getExams(owner: SessionIdentity | null = captureSessionIdentity(), strict = false): Promise<ExamItem[]> {
  try {
    const raw = await studyStorage.get(owner, EXAMS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list as ExamItem[] : [];
  } catch (error) { if (strict) throw error; return []; }
}

export async function saveExams(list: ExamItem[], owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  await studyStorage.set(owner, EXAMS_KEY, JSON.stringify(list));
}

// Programa el recordatorio LOCAL un día antes del examen. Fail-soft en
// cualquier punto: sin permiso, sin margen de un día antes, o cualquier
// fallo del sistema de notificaciones, devuelve null y el examen se guarda
// igual (solo que sin aviso).
export async function scheduleExamReminder(subject: string, examDate: Date, room?: string | null, owner: SessionIdentity | null = captureSessionIdentity()): Promise<string | null> {
  if (!studyStorage.current(owner)) return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted;
    if (!studyStorage.current(owner)) return null;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
    const when = new Date(examDate.getTime() - 24 * 60 * 60 * 1000);
    if (when.getTime() <= Date.now()) return null; // ya no queda un día de margen
    const hora = examDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const id = await scheduleOwnedNotification(owner, {
      content: {
        title: `Examen mañana: ${subject}`,
        body: room ? `A las ${hora} en ${room}` : `A las ${hora}`,
        data: { route: '/horario' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelExamReminder(notificationId: string | null | undefined): Promise<void> {
  if (!notificationId) return;
  try { await Notifications.cancelScheduledNotificationAsync(notificationId); } catch { /* si ya no existe, no pasa nada */ }
}

export async function addExam(input: { subject: string; date: string; room?: string | null }, owner: SessionIdentity | null = captureSessionIdentity()): Promise<ExamItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getExams(owner, true);
    const notificationId = await scheduleExamReminder(input.subject, new Date(input.date), input.room ?? null, owner);
    const item: ExamItem = { id: newId(), subject: input.subject, date: input.date, room: input.room ?? null, notificationId };
    const next = [...list, item].sort((a, b) => a.date.localeCompare(b.date));
    await saveExams(next, owner);
    return next;
  });
}

// Editar un examen: si cambia la fecha se reprograma el recordatorio.
export async function updateExam(id: string, patch: { subject?: string; date?: string; room?: string | null }, owner: SessionIdentity | null = captureSessionIdentity()): Promise<ExamItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getExams(owner, true);
    const target = list.find((e) => e.id === id);
    if (!target) return list;
    let notificationId = target.notificationId;
    const merged = { ...target, ...patch };
    if (patch.date && patch.date !== target.date || patch.subject && patch.subject !== target.subject) {
      studyStorage.check(owner);
      await cancelExamReminder(target.notificationId);
      notificationId = await scheduleExamReminder(merged.subject, new Date(merged.date), merged.room, owner);
    }
    const next = list.map((e) => (e.id === id ? { ...merged, notificationId } : e)).sort((a, b) => a.date.localeCompare(b.date));
    await saveExams(next, owner);
    return next;
  });
}

export async function removeExam(id: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<ExamItem[]> {
  return studyStorage.mutate(owner, async () => {
    const list = await getExams(owner, true);
    const target = list.find((e) => e.id === id);
    studyStorage.check(owner);
    if (target) await cancelExamReminder(target.notificationId);
    const next = list.filter((e) => e.id !== id);
    await saveExams(next, owner);
    return next;
  });
}

// Cuenta atrás legible para la lista de exámenes.
export function examCountdown(dateIso: string, now: number = Date.now()): string {
  const diffMs = new Date(dateIso).getTime() - now;
  if (diffMs < 0) return 'ya pasó';
  const days = Math.floor(diffMs / 864e5);
  if (days === 0) return 'es hoy';
  if (days === 1) return 'es mañana';
  return `faltan ${days} días`;
}
