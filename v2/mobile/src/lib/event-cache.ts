// Caché en memoria de fichas de evento (solo datos públicos del evento).
//
// La lista y el mapa de Eventos ya tienen la fila completa: al tocarla se deja
// aquí y la ficha se pinta al instante, sin esqueleto, mientras se revalida
// por detrás. Volver a una ficha ya vista también es inmediato.
import type { EventItem } from './types';

const cache = new Map<string, EventItem>();
const MAX = 80;

export function primeEventCache(e: EventItem): void {
  cache.delete(e.id);
  cache.set(e.id, e);
  if (cache.size > MAX) cache.delete(cache.keys().next().value!);
}

export function cachedEvent(id: string): EventItem | undefined {
  return cache.get(id);
}

export function forgetEvent(id: string): void {
  cache.delete(id);
}
