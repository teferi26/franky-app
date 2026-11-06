// ─── Cola offline persistente ────────────────────────────────────────────
// Mejora 33 del ciclo 2: infraestructura para encolar acciones (publicar un
// FOMO, enviar un mensaje de chat...) cuando no hay conexión, guardarlas en
// AsyncStorage para que sobrevivan a un cierre de la app, y reintentarlas
// solas en cuanto `subscribeNet` (net.ts) avisa de que hemos vuelto a tener
// red.
//
// Este fichero SOLO deja la infraestructura lista: ninguna pantalla queda
// enganchada aquí (eso lo hacen otros agentes). Uso previsto desde una
// pantalla:
//
//   // 1) Una vez, al arrancar la app (p. ej. en el _layout raíz), registra el
//   //    manejador de cada tipo de acción y arranca el drenado automático:
//   import { registerOfflineHandler, initOfflineQueue } from '@/lib/offline-queue';
//   registerOfflineHandler('fomo:publicar', async (payload) => {
//     await publicarFomo(payload); // debe lanzar si falla, para reintentar
//   });
//   initOfflineQueue();
//
//   // 2) Al publicar/enviar, si no hay red, encola en vez de perder la acción:
//   import { isOnline } from '@/lib/net';
//   import { enqueueOfflineAction } from '@/lib/offline-queue';
//   if (!isOnline()) {
//     await enqueueOfflineAction('fomo:publicar', { texto, fotoUri });
//     // avisar al usuario: "se publicará en cuanto vuelva la conexión"
//   } else {
//     await publicarFomo({ texto, fotoUri });
//   }
//
// Todo fail-soft: cualquier fallo de AsyncStorage o de un manejador se traga
// y se reintenta más tarde (o se descarta tras agotar intentos), nunca rompe
// la app ni bloquea el hilo de UI.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeNet, isOnline } from './net';
import { withRetry, isRetryableError } from './retry';

const STORAGE_KEY = '@franky/offline-queue-v1';
const MAX_ATTEMPTS_PER_ACTION = 5;

export type OfflineAction = {
  /** Identificador único de la acción (para poder quitarla/depurar). */
  id: string;
  /** Tipo de acción: debe tener un manejador registrado con `registerOfflineHandler`. */
  type: string;
  /** Payload serializable (JSON) con los datos necesarios para reproducir la acción. */
  payload: unknown;
  /** Marca de tiempo de creación (ms epoch), para ordenar/depurar. */
  createdAt: number;
  /** Número de intentos ya realizados. */
  attempts: number;
};

type Handler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, Handler>();

let queue: OfflineAction[] = [];
let loaded = false;
let draining = false;
let unsubscribeNet: (() => void) | null = null;

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Fail-soft: si no se puede persistir, la acción sigue en memoria para
    // esta sesión, pero no tumbamos nada.
  }
}

async function loadIfNeeded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) queue = parsed;
    }
  } catch {
    queue = [];
  }
}

/**
 * Registra el manejador que sabe ejecutar un tipo de acción concreto. Debe
 * lanzar (throw) si la acción falla, para que la cola sepa que hay que
 * reintentar; si resuelve sin error, la acción se da por completada y se
 * quita de la cola.
 */
export function registerOfflineHandler(type: string, handler: Handler): void {
  handlers.set(type, handler);
}

/**
 * Encola una acción para ejecutarla ahora (si hay manejador y red) o en
 * cuanto vuelva la conexión. Devuelve el id de la acción encolada.
 */
export async function enqueueOfflineAction(type: string, payload: unknown): Promise<string> {
  await loadIfNeeded();
  const action: OfflineAction = {
    id: randomId(),
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  queue.push(action);
  await persist();
  // Si ya hay red, intentamos drenar de inmediato en vez de esperar al
  // próximo evento de conectividad.
  if (isOnline()) void drainQueue();
  return action.id;
}

/** Número de acciones pendientes (útil para mostrar un indicador en la UI). */
export async function pendingOfflineActionsCount(): Promise<number> {
  await loadIfNeeded();
  return queue.length;
}

/** Vacía la cola sin ejecutar nada (p. ej. al cerrar sesión). Fail-soft. */
export async function clearOfflineQueue(): Promise<void> {
  queue = [];
  loaded = true;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // No pasa nada si falla: la próxima carga sobrescribirá igualmente.
  }
}

/**
 * Intenta ejecutar todas las acciones pendientes, en orden de creación. Cada
 * acción usa `withRetry` internamente (vía su manejador) solo si el propio
 * manejador lo desea; aquí solo controlamos reintentos ENTRE pasadas de la
 * cola (persistiendo el contador de intentos), no reintentos inmediatos.
 * Si una acción agota `MAX_ATTEMPTS_PER_ACTION`, se descarta para no
 * bloquear las siguientes indefinidamente.
 */
export async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    await loadIfNeeded();
    // Copia para iterar: si algo se re-encola durante el drenado, no lo
    // procesamos en esta misma pasada.
    const pending = [...queue];
    for (const action of pending) {
      if (!isOnline()) break; // nos hemos quedado sin red a mitad de drenado
      const handler = handlers.get(action.type);
      if (!handler) continue; // sin manejador registrado todavía: se queda para más tarde

      try {
        // Un solo intento aquí (con backoff interno breve): si falla,
        // guardamos el intento y seguimos con las demás; esta acción se
        // reintentará en el próximo drenado (reconexión o llamada manual).
        await withRetry(() => handler(action.payload), {
          maxAttempts: 2,
          baseDelayMs: 300,
          maxDelayMs: 2000,
          shouldRetry: isRetryableError,
        });
        queue = queue.filter((a) => a.id !== action.id);
        await persist();
      } catch {
        action.attempts += 1;
        if (action.attempts >= MAX_ATTEMPTS_PER_ACTION) {
          // Fail-soft: descartamos la acción para no bloquear la cola para
          // siempre; se pierde esa acción concreta, pero la app sigue viva.
          queue = queue.filter((a) => a.id !== action.id);
        } else {
          const idx = queue.findIndex((a) => a.id === action.id);
          if (idx >= 0) queue[idx] = action;
        }
        await persist();
      }
    }
  } catch {
    // Cualquier fallo inesperado del drenado no debe tumbar la app: se
    // reintentará en el próximo evento de conectividad.
  } finally {
    draining = false;
  }
}

/**
 * Arranca el drenado automático: se suscribe a `subscribeNet` (net.ts) y
 * lanza `drainQueue()` cada vez que se recupera la conexión. Llamar una
 * única vez (p. ej. en el layout raíz de la app). Idempotente: si ya estaba
 * arrancado, no se duplica la suscripción.
 */
export function initOfflineQueue(): void {
  if (unsubscribeNet) return;
  unsubscribeNet = subscribeNet((online) => {
    if (online) void drainQueue();
  });
}

/** Solo para tests/depuración: para el drenado automático. */
export function stopOfflineQueue(): void {
  unsubscribeNet?.();
  unsubscribeNet = null;
}
