// ─── Guía de la app y "primeros pasos" ─────────────────────────────────────
// La guía (app/tour.tsx) se enseña UNA vez por dispositivo a cualquier
// persona que entre (alta nueva o login en un móvil nuevo) y se puede volver
// a ver desde el menú del perfil. La lista de primeros pasos (checklist) vive
// en el feed y en Estudio hasta que se completa o se descarta.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getClasses, getExams } from './horario';
import { getTasks } from './study';

const TOUR_KEY = 'franky_tour_seen_v2';
const CHECKLIST_KEY = 'franky_checklist_v1';

export async function hasSeenTour(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(TOUR_KEY)) === '1'; } catch { return false; }
}
export function markTourSeen() {
  AsyncStorage.setItem(TOUR_KEY, '1').catch(() => {});
}

export type ChecklistKey = 'perfil' | 'horario' | 'post' | 'evento' | 'crush' | 'roomie' | 'apuntes';
export type ChecklistState = { done: Partial<Record<ChecklistKey, boolean>>; dismissed: boolean };

const listeners = new Set<(s: ChecklistState) => void>();
let cache: ChecklistState | null = null;

async function load(): Promise<ChecklistState> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_KEY);
    cache = raw ? (JSON.parse(raw) as ChecklistState) : { done: {}, dismissed: false };
  } catch { cache = { done: {}, dismissed: false }; }
  return cache;
}
async function save(s: ChecklistState) {
  cache = s;
  try { await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(s)); } catch { /* nada */ }
  for (const l of listeners) l(s);
}

export function onChecklistChange(l: (s: ChecklistState) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Marca un paso como hecho (lo llaman las pantallas al completar la acción). */
export async function completeStep(k: ChecklistKey) {
  const s = await load();
  if (s.done[k]) return;
  await save({ ...s, done: { ...s.done, [k]: true } });
}

export async function dismissChecklist() {
  const s = await load();
  await save({ ...s, dismissed: true });
}

export async function resetChecklist() {
  await save({ done: {}, dismissed: false });
}

/** Estado actual, comprobando de paso lo que se puede deducir de los datos
 *  (perfil completo, horario con clases, tareas creadas) para no pedir
 *  pasos ya dados. Best-effort: sin red, solo lo local. */
export async function getChecklist(): Promise<ChecklistState> {
  const s = await load();
  const done = { ...s.done };
  try {
    const [classes, exams, tasks] = await Promise.all([getClasses(), getExams(), getTasks()]);
    if (classes.length || exams.length || tasks.length) done.horario = true;
  } catch { /* nada */ }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from('profiles')
        .select('avatar_url, bio, university_id, career, interests').eq('id', user.id).maybeSingle();
      if (p && p.avatar_url && p.university_id && (p.bio || p.career || (p.interests?.length ?? 0) > 0)) done.perfil = true;
      if (!done.post) {
        const { count } = await supabase.from('fomo_threads').select('id', { count: 'exact', head: true }).eq('author_id', user.id);
        if ((count ?? 0) > 0) done.post = true;
      }
      if (!done.evento) {
        const { count } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        if ((count ?? 0) > 0) done.evento = true;
      }
    }
  } catch { /* sin red: nos quedamos con lo local */ }
  const next = { ...s, done };
  if (JSON.stringify(next.done) !== JSON.stringify(s.done)) await save(next);
  return next;
}

/** Estado guardado en el dispositivo, sin red: para pintar la tarjeta ya. */
export async function peekChecklist(): Promise<ChecklistState> {
  return load();
}

let remoteChecked: { userId: string; at: number } | null = null;

/**
 * Como getChecklist, pero pensado para el foco de pantallas: usa el id de la
 * cuenta ya conocido (sin auth.getUser, que va a la red y retiene el candado
 * de auth), lanza las comprobaciones remotas EN PARALELO y solo las repite
 * cada `minAgeMs` por cuenta. Lo local se comprueba siempre.
 */
export async function refreshChecklist(userId: string | null, minAgeMs = 5 * 60_000): Promise<ChecklistState> {
  const s = await load();
  const done = { ...s.done };
  try {
    const [classes, exams, tasks] = await Promise.all([getClasses(), getExams(), getTasks()]);
    if (classes.length || exams.length || tasks.length) done.horario = true;
  } catch { /* nada */ }
  const due = userId && !(remoteChecked?.userId === userId && Date.now() - remoteChecked.at < minAgeMs);
  if (userId && due) {
    try {
      const [profile, posts, events] = await Promise.all([
        supabase.from('profiles').select('avatar_url, bio, university_id, career, interests').eq('id', userId).maybeSingle(),
        done.post ? Promise.resolve(null) : supabase.from('fomo_threads').select('id', { count: 'exact', head: true }).eq('author_id', userId),
        done.evento ? Promise.resolve(null) : supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      const p = profile.data;
      if (p && p.avatar_url && p.university_id && (p.bio || p.career || (p.interests?.length ?? 0) > 0)) done.perfil = true;
      if ((posts?.count ?? 0) > 0) done.post = true;
      if ((events?.count ?? 0) > 0) done.evento = true;
      if (!profile.error) remoteChecked = { userId, at: Date.now() };
    } catch { /* sin red: nos quedamos con lo local */ }
  }
  const latest = await load();
  const next = { ...latest, done: { ...latest.done, ...done } };
  if (JSON.stringify(next.done) !== JSON.stringify(latest.done)) await save(next);
  return next;
}

export const CHECKLIST_STEPS: { key: ChecklistKey; title: string; text: string; route: string }[] = [
  { key: 'perfil', title: 'Completa tu perfil', text: 'Foto, carrera y un par de intereses: así te encuentra tu gente.', route: '/editar-perfil' },
  { key: 'horario', title: 'Mete tu horario', text: 'Clases y exámenes. Te avisamos la víspera y ves tu día de un vistazo.', route: '/horario' },
  { key: 'post', title: 'Publica en el Fomo', text: 'Una duda, un plan o un cotilleo. En anónimo si quieres.', route: '/publicar?type=thread' },
  { key: 'evento', title: 'Apúntate a un plan', text: 'Fiestas, quedadas y eventos de tu ciudad, con la entrada en la app.', route: '/(tabs)/eventos' },
  { key: 'crush', title: 'Prueba el Crush', text: 'Anónimo hasta que es mutuo. Nadie sabe que le has dado.', route: '/(tabs)/crush' },
  { key: 'apuntes', title: 'Baja unos apuntes', text: 'Resúmenes y exámenes de tu carrera, subidos por gente como tú.', route: '/apuntes' },
];
