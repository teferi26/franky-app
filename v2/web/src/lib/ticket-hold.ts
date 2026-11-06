/**
 * Reserva de una entrada sin pagar (migración 165).
 *
 * Una reserva guarda la plaza SOLO hasta `reserved_until`. Pasado ese momento la
 * plaza vuelve al aforo, así que ni cuenta como ocupada ni se puede pagar: hay
 * que volver a reservar desde la ficha del evento, que es lo único que
 * comprueba si queda sitio.
 *
 * Esto vive en un solo archivo a propósito: el fallo que arreglamos venía de que
 * el conteo del aforo y la disponibilidad pública tenían criterios distintos
 * sobre qué reserva "está viva".
 */

/**
 * Cuánto retiene plaza una reserva. Tiene que coincidir con
 * `public.ticket_hold_window()` (35 min): los 30 mínimos de una sesión de Stripe
 * Checkout más 5 de margen, para no liberar nunca una plaza que una sesión viva
 * todavía podría cobrar.
 */
export const TICKET_HOLD_MS = 35 * 60 * 1000;

/**
 * ¿Esta reserva sigue guardando la plaza?
 *
 * Sin fecha (filas anteriores a la 165, o la columna aún sin aplicar) se
 * considera viva: es lo que hacía el sistema antes y así el cambio nunca le
 * quita una plaza a alguien por sorpresa. La base de datos aplica el mismo
 * criterio con COALESCE(reserved_until, created_at + ventana).
 */
export function holdIsLive(
  reservedUntil: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  if (!reservedUntil) return true;
  const until = reservedUntil instanceof Date
    ? reservedUntil.getTime()
    : new Date(reservedUntil).getTime();
  if (!Number.isFinite(until)) return true;
  return until > now;
}

/** Lo contrario, para leerlo mejor donde importa la caducidad. */
export function holdHasExpired(
  reservedUntil: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  return !!reservedUntil && !holdIsLive(reservedUntil, now);
}

/** "hasta las 20:45", para decirle al comprador cuánto le queda. */
export function holdDeadlineLabel(reservedUntil: string | Date): string {
  const d = reservedUntil instanceof Date ? reservedUntil : new Date(reservedUntil);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
