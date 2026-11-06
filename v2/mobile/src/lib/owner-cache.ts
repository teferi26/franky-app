// ─── Caché en memoria POR CUENTA (stale-while-revalidate) ───────────────────
// Las pestañas privadas (Perfil, FOMO, historias) pintan al instante lo último
// que se cargó para esa misma cuenta y refrescan en segundo plano. Reglas:
//   · la clave incluye userId y generación de sesión: cerrar sesión y volver a
//     entrar con la misma cuenta NO reutiliza datos de la sesión anterior;
//   · al cambiar de identidad se vacía entera (onSessionIdentityChange);
//   · solo memoria: nada privado se escribe en disco desde aquí.
import { isCurrentSessionIdentity, onSessionIdentityChange, type SessionIdentity } from './session';

type Entry = { value: unknown; loadedAt: number };

const store = new Map<string, Entry>();
const MAX_KEYS = 64;

onSessionIdentityChange(() => { store.clear(); });

function keyFor(owner: SessionIdentity, key: string): string {
  return `${owner.userId}:${owner.generation}:${key}`;
}

/** Último valor guardado para esta cuenta, o null si no hay o la sesión cambió. */
export function readOwnedCache<T>(owner: SessionIdentity | null | undefined, key: string): T | null {
  if (!owner || !isCurrentSessionIdentity(owner)) return null;
  const entry = store.get(keyFor(owner, key));
  return entry ? (entry.value as T) : null;
}

/** Guarda el valor sin tocar su marca de frescura (útil para ediciones locales). */
export function writeOwnedCache<T>(owner: SessionIdentity | null | undefined, key: string, value: T): void {
  if (!owner || !isCurrentSessionIdentity(owner)) return;
  const k = keyFor(owner, key);
  const previous = store.get(k);
  store.delete(k);
  store.set(k, { value, loadedAt: previous?.loadedAt ?? 0 });
  if (store.size > MAX_KEYS) store.delete(store.keys().next().value!);
}

/** Marca que el valor acaba de llegar del servidor. */
export function markOwnedCacheFresh(owner: SessionIdentity | null | undefined, key: string): void {
  if (!owner || !isCurrentSessionIdentity(owner)) return;
  const entry = store.get(keyFor(owner, key));
  if (entry) entry.loadedAt = Date.now();
  else store.set(keyFor(owner, key), { value: undefined, loadedAt: Date.now() });
}

/** Milisegundos desde la última carga real (Infinity si nunca). */
export function ownedCacheAge(owner: SessionIdentity | null | undefined, key: string): number {
  if (!owner || !isCurrentSessionIdentity(owner)) return Infinity;
  const entry = store.get(keyFor(owner, key));
  return entry && entry.loadedAt > 0 ? Date.now() - entry.loadedAt : Infinity;
}

export function dropOwnedCache(owner: SessionIdentity | null | undefined, key: string): void {
  if (!owner) return;
  store.delete(keyFor(owner, key));
}
