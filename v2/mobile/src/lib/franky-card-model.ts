/** Presentation helpers only. Prices, savings, validity and permissions come from the server. */
export function cardMoney(cents: number | null | undefined, currency = 'EUR'): string {
  if (!Number.isSafeInteger(cents)) return '—';
  return ((cents as number) / 100).toLocaleString('es-ES', { style: 'currency', currency });
}

export function cardDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Fecha no disponible';
}

/** Decimal keypad input; deliberately rejects exponent notation, signs and rounding. */
export function cardAmountCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [units, decimal = ''] = normalized.split('.');
  const result = Number(units) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

export function cardSecondsRemaining(expiresAt: string | null | undefined, now: number): number {
  const end = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(end) && Number.isFinite(now) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
}

export function cardCode(token: string): string {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('card_credential_invalid');
  return `franky:card:v1:${token}`;
}

export function parseCardCode(value: string): string | null {
  const token = value.trim().replace(/^franky:card:v1:/, '');
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

/** Free Card businesses enter names, never internal identifiers. Catalog IDs stay server-issued. */
export function cardServiceKey(name: string): string {
  return name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
export function cardServiceLabel(key: string, services: { id: string; name: string }[]): string {
  if (key === '*') return 'Todos los servicios elegibles';
  const known = services.find(service => service.id === key)?.name;
  return known ?? (/^[0-9a-f-]{36}$/i.test(key) ? 'Servicio de la oferta' : key.replace(/[-_]/g, ' '));
}

export function cardStatus(value: string): string {
  return ({ active: 'Activa', pending: 'Pendiente', inactive: 'Sin membresía activa', expired: 'Caducada', suspended: 'Suspendida', cancelled: 'Cancelada', confirmed: 'Confirmado', completed: 'Completado', rejected: 'Rechazado', reversed: 'Revertido', available: 'Disponible', redeemed: 'Canjeado', awaiting_customer: 'Pendiente de tu confirmación', awaiting_merchant: 'Pendiente del comercio' } as Record<string, string>)[value] ?? 'En revisión';
}

export function cardError(error: unknown): string {
  const value = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const known: Record<string, string> = {
    card_campaign_schedule: 'Esta campaña no se aplica en el horario elegido. Revisa sus días y horas.', card_campaign_exhausted: 'La campaña ha agotado un límite de usos o de presupuesto. No se ha registrado otro consumo.',
    card_forbidden: 'Tu cuenta ya no tiene acceso a esta sede u operación.', card_invalid_input: 'Revisa los conceptos, importes y condiciones de la operación.',
    card_profile_required: 'Completa tu nombre y foto privados antes de presentar la tarjeta.', card_not_active: 'Esta ventaja requiere Card activa. Tus sellos y premios siguen disponibles.',
    card_credential_invalid: 'El código no es válido o ha caducado. Pide uno nuevo al titular.', card_request_expired: 'La solicitud ha caducado. Vuelve a iniciar y revisar la operación.',
    card_request_conflict: 'Los datos han cambiado. Revisa de nuevo la operación antes de confirmar.', card_customer_confirmation_required: 'El titular debe confirmar primero el comercio y el importe.',
    card_offer_unavailable: 'Esta ventaja ya no está disponible para el consumo.', card_program_unavailable: 'Este programa de fidelización no está disponible.',
    card_reward_unavailable: 'La persona todavía no tiene esta recompensa disponible o ya la ha utilizado.', card_receipt_duplicate: 'Esta referencia de recibo ya se registró. Revisa el comprobante existente.',
    card_reversal_invalid: 'No se puede revertir esta selección. Actualiza el comprobante.', card_network_not_ready: 'La red de esta ciudad todavía no está preparada para vender Card.',
    card_checkout_unavailable: 'La compra todavía no está disponible. No se ha iniciado otro cargo.', card_photo_permission: 'Permite acceder a tus fotos para elegir una imagen privada.',
    card_price_changed: 'El precio ha cambiado. Hemos actualizado la propuesta; vuelve a revisarla y aceptarla antes de comprar.',
    card_photo_invalid: 'Elige una imagen JPEG, PNG o WebP de hasta 3 MB.', card_wallet_unavailable: 'Wallet todavía no está disponible en este dispositivo.',
    session_required: 'Inicia sesión para continuar.', session_changed: 'La cuenta ha cambiado. Abre de nuevo esta pantalla.',
    workspace_changed: 'El espacio o tus permisos han cambiado. Vuelve a abrir la operación.', request_cancelled: 'La operación se ha interrumpido. Actualiza su estado antes de repetirla.',
    card_unavailable: 'Franky Card todavía no está disponible para tu cuenta o ciudad.', card_sales_disabled: 'Las compras de Card todavía no están habilitadas.',
    card_expired: 'La membresía ha caducado. Tus sellos y recompensas siguen disponibles.', card_inactive: 'Necesitas una membresía activa para esta ventaja Card.',
    credential_expired: 'El código ha caducado. Pide a la persona que genere uno nuevo.', credential_invalid: 'Este código no permite iniciar la operación.',
    redemption_expired: 'La solicitud ha caducado. Inicia una nueva y revisa de nuevo el importe.', redemption_changed: 'Han cambiado las condiciones. Revisa de nuevo la operación antes de confirmar.',
    permission_denied: 'Tu cuenta no tiene permiso para esta operación.', forbidden: 'Tu cuenta no tiene permiso para esta operación.',
    offer_unavailable: 'Esta ventaja ya no está disponible. Actualiza las condiciones.', loyalty_reward_unavailable: 'Esta recompensa todavía no está disponible o ya se utilizó.',
  };
  const key = Object.keys(known).find(candidate => value === candidate || value.includes(candidate));
  return key ? known[key] : 'No se pudo comprobar la operación. Reintenta con conexión; todavía no la damos por confirmada.';
}
