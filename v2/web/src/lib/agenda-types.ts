// ─── Agenda del estudiante: tipos y utilidades puras (paridad con la app) ───
// La app móvil guarda el horario, los exámenes y las entregas en el dispositivo
// y sube una copia a la tabla study_data (migración 170): una fila por usuario
// con un JSON `{ v: 1, classes, exams, tasks, notaMedia, savedAt }`. La web
// lee y escribe EXACTAMENTE ese mismo JSON, así que los tipos de aquí tienen
// que ir a la par con mobile/src/lib/horario.ts y mobile/src/lib/study.ts.
//
// Diferencia deliberada: en la nube no viaja `notificationId` (es un id de
// expo-notifications, solo tiene sentido en el móvil). Por eso los tipos de
// examen y tarea de este fichero ya van sin él.
//
// Sin dependencias de React ni de Supabase: todo lo de aquí es puro para que
// se pueda usar tanto en el servidor como en el cliente.

/** dayOfWeek sigue el criterio de Date.getDay(): 0 = domingo … 6 = sábado. */
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
  /** ISO completo (fecha + hora del examen). */
  date: string;
  room: string | null;
};

export type TaskPriority = "alta" | "normal" | "baja";

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
};

/** Forma exacta de study_data.data (CloudBlob en mobile/src/lib/study.ts). */
export type StudyBlob = {
  v: 1;
  classes: ClassItem[];
  exams: ExamItem[];
  tasks: TaskItem[];
  /** Lo que guarda la calculadora de nota media; aquí solo se conserva. */
  notaMedia: unknown;
  savedAt: string;
};

export const EMPTY_BLOB: StudyBlob = {
  v: 1,
  classes: [],
  exams: [],
  tasks: [],
  notaMedia: null,
  savedAt: "",
};

/**
 * Convierte lo que haya en la fila (o nada) en un blob con la forma correcta.
 * Tolera versiones futuras o filas a medias: nunca lanza, y descarta lo que
 * no sea una lista para que un JSON roto no tumbe la página.
 */
export function parseStudyBlob(raw: unknown): StudyBlob {
  if (!raw || typeof raw !== "object") return { ...EMPTY_BLOB };
  const b = raw as Partial<StudyBlob>;
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    v: 1,
    classes: list<ClassItem>(b.classes).filter((c) => c && typeof c.id === "string"),
    exams: list<ExamItem>(b.exams).filter((e) => e && typeof e.id === "string"),
    tasks: list<TaskItem>(b.tasks).filter((t) => t && typeof t.id === "string"),
    notaMedia: b.notaMedia ?? null,
    savedAt: typeof b.savedAt === "string" ? b.savedAt : "",
  };
}

export function hasAnyData(b: StudyBlob): boolean {
  return b.classes.length > 0 || b.exams.length > 0 || b.tasks.length > 0;
}

/** Mismo formato de id que la app (fecha + sufijo aleatorio). */
export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Fecha local como 'YYYY-MM-DD' (la medianoche del usuario, no la UTC). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DAY_LABELS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Vista semanal: lunes a viernes SIEMPRE (aunque un día no tenga nada, para
 * que la semana se vea completa) y sábado/domingo solo si hay algo metido
 * ahí. Cada día sale ordenado por hora de inicio. Igual que en la app.
 */
export function groupClassesByDay(
  list: ClassItem[]
): { dayOfWeek: number; label: string; items: ClassItem[] }[] {
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const WEEKEND = [6, 0];
  const byDay = (d: number) =>
    list.filter((c) => c.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const out: { dayOfWeek: number; label: string; items: ClassItem[] }[] = [];
  for (const d of WEEKDAYS) out.push({ dayOfWeek: d, label: DAY_LABELS[d], items: byDay(d) });
  for (const d of WEEKEND) {
    const items = byDay(d);
    if (items.length > 0) out.push({ dayOfWeek: d, label: DAY_LABELS[d], items });
  }
  return out;
}

/** Cuenta atrás legible para la lista de exámenes (misma frase que la app). */
export function examCountdown(dateIso: string, now: number = Date.now()): string {
  const diffMs = new Date(dateIso).getTime() - now;
  if (diffMs < 0) return "ya pasó";
  const days = Math.floor(diffMs / 864e5);
  if (days === 0) return "es hoy";
  if (days === 1) return "es mañana";
  return `faltan ${days} días`;
}

const PRIO_RANK: Record<TaskPriority, number> = { alta: 0, normal: 1, baja: 2 };

/** Pendientes primero (por fecha, luego prioridad), hechas al final. */
export function sortTasks(list: TaskItem[]): TaskItem[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt ?? "").localeCompare(a.doneAt ?? "");
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  });
}

/** 'HH:MM' del día dado como Date (hora local). */
export function atTime(day: Date, hm: string): Date {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export type TodaySummary = {
  /** Clases de hoy en orden. */
  todayClasses: ClassItem[];
  /** La próxima clase que aún no ha terminado, o null. */
  nextClass: ClassItem | null;
  /** Exámenes por venir, ordenados, con los días que faltan. */
  upcomingExams: { item: ExamItem; days: number }[];
  /** Entregas pendientes que vencen hoy. */
  dueToday: TaskItem[];
  /** Entregas pendientes ya vencidas (antes de hoy). */
  overdue: TaskItem[];
  /** Total de entregas sin hacer. */
  pending: number;
};

/** Resumen de "hoy", el mismo criterio que summarizeToday en la app. */
export function summarizeToday(b: StudyBlob, now: Date = new Date()): TodaySummary {
  const dow = now.getDay();
  const todayClasses = b.classes
    .filter((c) => c.dayOfWeek === dow)
    .sort((a, c) => a.startTime.localeCompare(c.startTime));
  const nextClass = todayClasses.find((c) => atTime(now, c.endTime) > now) ?? null;
  const upcomingExams = b.exams
    .map((e) => ({ item: e, days: Math.ceil((new Date(e.date).getTime() - now.getTime()) / 864e5) }))
    .filter((x) => x.days >= 0)
    .sort((a, c) => a.days - c.days);
  const todayKey = dayKey(now);
  const pendingList = b.tasks.filter((t) => !t.done);
  const dueToday = pendingList.filter((t) => t.due && dayKey(new Date(t.due)) === todayKey);
  const overdue = pendingList.filter(
    (t) => t.due && new Date(t.due) < now && dayKey(new Date(t.due)) !== todayKey
  );
  return { todayClasses, nextClass, upcomingExams, dueToday, overdue, pending: pendingList.length };
}

/** 'YYYY-MM-DDTHH:MM' en hora local, que es lo que espera <input type="datetime-local">. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Lo contrario: el valor del input (hora local) a ISO. Vacío devuelve null. */
export function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
