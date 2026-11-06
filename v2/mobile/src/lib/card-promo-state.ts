// Estado de la Franky Card para las tarjetas de promoción (Perfil y FOMO).
// Antes cada foco de cada pestaña lanzaba get_franky_card y, mientras llegaba,
// la tarjeta desaparecía y volvía a salir. Ahora se recuerda por cuenta y solo
// se vuelve a pedir pasado un minuto; dos pestañas a la vez comparten petición.
import { cardRpc } from '@/lib/franky-card';
import { isCurrentSessionIdentity, type SessionIdentity } from './session';
import { markOwnedCacheFresh, ownedCacheAge, readOwnedCache, writeOwnedCache } from './owner-cache';

export type CardPromoState = { enabled: boolean; member: boolean };

const KEY = 'card-promo';
const MIN_AGE_MS = 60_000;
const inflight = new Map<string, Promise<CardPromoState>>();

/** Último estado conocido para esta cuenta (null si aún no se ha pedido). */
export function peekCardPromoState(owner: SessionIdentity | null | undefined): CardPromoState | null {
  return readOwnedCache<CardPromoState>(owner, KEY);
}

/** Pide el estado si el guardado tiene más de un minuto (o si `force`). */
export async function loadCardPromoState(owner: SessionIdentity, options: { force?: boolean } = {}): Promise<CardPromoState> {
  const known = peekCardPromoState(owner);
  if (known && !options.force && ownedCacheAge(owner, KEY) < MIN_AGE_MS) return known;
  const flight = `${owner.userId}:${owner.generation}`;
  const running = inflight.get(flight);
  if (running) return running;
  const task = (async () => {
    try {
      const card = await cardRpc('get_franky_card', {}, owner);
      const state: CardPromoState = { enabled: !!card.enabled, member: card.membership?.status === 'active' };
      if (isCurrentSessionIdentity(owner)) {
        writeOwnedCache(owner, KEY, state);
        markOwnedCacheFresh(owner, KEY);
      }
      return state;
    } finally {
      inflight.delete(flight);
    }
  })();
  inflight.set(flight, task);
  return task;
}
