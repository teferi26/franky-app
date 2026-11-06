// ─── Racha diaria: el motivo para volver a abrir la app ────────────────────
// Cada día que se abre la app cuenta. Se lleva en local (AsyncStorage) para
// que funcione al instante y sin red, y se confirma con el servidor
// (touch_streak, migración 170) cuando hay sesión: el servidor es la fuente de
// verdad entre dispositivos, el local es la caché que pinta la pantalla.
import { studyStorage, type SessionIdentity } from './study-storage';
import { onSessionIdentityChange } from './session';
import { supabase } from './supabase';

export type Streak = {
  /** Días seguidos, contando hoy si ya se ha abierto. */
  count: number;
  best: number;
  /** Último día contado, 'YYYY-MM-DD' en hora local. */
  lastDay: string | null;
  /** Últimos 14 días abiertos ('YYYY-MM-DD'), para pintar los puntitos de la semana. */
  days: string[];
};

const KEY = 'franky.racha.v1';
const listeners = new Set<(s: Streak) => void>();
let cache: { owner: string; value: Streak } | null = null;
const emptyStreak = (): Streak => ({ count: 0, best: 0, lastDay: null, days: [] });
onSessionIdentityChange(() => { cache = null; for (const listener of listeners) listener(emptyStreak()); });

/** Fecha local como 'YYYY-MM-DD' (la medianoche del usuario, no la UTC). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
}

async function load(owner: SessionIdentity | null): Promise<Streak> {
  if (!studyStorage.current(owner)) return emptyStreak();
  if (cache?.owner === owner.userId) return cache.value;
  try {
    const raw = await studyStorage.get(owner, KEY);
    const value: Streak = raw ? JSON.parse(raw) : emptyStreak();
    cache = { owner: owner.userId, value };
    return value;
  } catch { return emptyStreak(); }
}

async function save(s: Streak, owner: SessionIdentity | null) {
  await studyStorage.set(owner, KEY, JSON.stringify(s));
  cache = { owner: owner!.userId, value: s };
  for (const l of listeners) l(s);
}

/** Racha en memoria (0 hasta que touchStreak/getStreak carguen). */
export function getStreakSync(): Streak {
  const owner = studyStorage.capture();
  return owner && cache?.owner === owner.userId ? cache.value : emptyStreak();
}

export async function getStreak(owner: SessionIdentity | null = studyStorage.capture()): Promise<Streak> {
  const s = await load(owner);
  // Si el último día contado fue antes de ayer, la racha visible es 0 (se ha
  // roto), aunque el contador guardado siga hasta que se vuelva a abrir.
  if (s.lastDay && daysBetween(s.lastDay, dayKey()) >= 2) return { ...s, count: 0 };
  return s;
}

export function onStreakChange(listener: (s: Streak) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Marca hoy como día abierto. Idempotente: llamar en cada arranque y al volver
 *  a primer plano. Best-effort con el servidor. */
export async function touchStreak(owner: SessionIdentity | null = studyStorage.capture()): Promise<Streak> {
  if (!studyStorage.current(owner)) return emptyStreak();
  const today = dayKey();
  const s = await load(owner);
  let next = s;
  if (s.lastDay !== today) {
    const gap = s.lastDay ? daysBetween(s.lastDay, today) : Infinity;
    const count = gap === 1 ? s.count + 1 : gap <= 0 ? s.count : 1;
    const days = [...s.days.filter((d) => d !== today), today].slice(-14);
    next = { count, best: Math.max(s.best, count), lastDay: today, days };
    await save(next, owner);
  }
  // Servidor: si la RPC existe y hay sesión, su valor manda (otro dispositivo
  // puede haber sumado días). Si no, nos quedamos con lo local.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (studyStorage.current(owner) && session?.user.id === owner.userId) {
      const { data, error } = await supabase.rpc('touch_streak', { p_day: today });
      if (!studyStorage.current(owner)) return emptyStreak();
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row && typeof row.streak_count === 'number') {
        const merged: Streak = {
          count: Math.max(row.streak_count, next.count),
          best: Math.max(row.streak_best ?? 0, next.best),
          lastDay: today,
          days: next.days,
        };
        if (merged.count !== next.count || merged.best !== next.best) await save(merged, owner);
        return merged;
      }
    }
  } catch { /* best-effort */ }
  return studyStorage.current(owner) ? next : emptyStreak();
}

/** Hito de racha para celebrar (3, 7, 14, 30, 50, 100...). null si no toca. */
export function streakMilestone(count: number): number | null {
  const marks = [3, 7, 14, 30, 50, 100, 200, 365];
  return marks.includes(count) ? count : null;
}
