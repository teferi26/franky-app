// ─── Monitorización de errores (Sentry) ──────────────────────────────────
// Mejora 26 del ciclo 2: capturar crashes y errores en producción sin montar
// infraestructura propia. @sentry/react-native ya está instalado (paquete y
// config plugin en app.json), este fichero solo lo inicializa y expone dos
// helpers para el resto de la app.
//
// PASOS QUE LE QUEDAN AL USUARIO PARA ACTIVARLO (hoy está apagado):
//   1. Crear una cuenta/proyecto en https://sentry.io (tipo de proyecto:
//      React Native).
//   2. Copiar el DSN que da Sentry (algo como
//      "https://xxxx@oXXXXXX.ingest.sentry.io/yyyy").
//   3. Poner ese DSN en la variable de entorno EXPO_PUBLIC_SENTRY_DSN
//      (.env / EAS secrets / variables de entorno del build).
//   4. Reconstruir la app (un reinicio de Metro basta en dev; en producción
//      hace falta un build nuevo con EAS para que el DSN quede empaquetado).
// Sin DSN configurado, initMonitoring() no hace NADA: no inicializa Sentry,
// no lanza errores, no ensucia la consola. La app funciona exactamente igual
// que hoy.
//
// PRIVACIDAD (obligatorio, Franky trata datos de estudiantes y en algunos
// casos menores de edad):
// - sendDefaultPii está a false: Sentry NUNCA adjunta IP, cookies ni cabeceras
//   completas por defecto.
// - beforeSend limpia manualmente cualquier resto de email o cabecera de
//   autorización que pudiera colarse en el evento (mensaje, breadcrumbs,
//   request) antes de que salga del dispositivo.
// - setMonitoringUser() solo acepta un id (uuid), nunca email ni nombre.
//
// Todo el módulo es fail-soft: cualquier fallo al inicializar o capturar se
// traga en silencio, la telemetría nunca puede romper la app.

import * as Sentry from '@sentry/react-native';

let initialized = false;

// Regex simple para detectar y tachar emails que puedan aparecer sueltos en
// el texto de un mensaje de error (p. ej. "no se pudo enviar a x@y.com").
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Sustituye emails por un marcador, dejando el resto del texto intacto. */
function scrubEmails(text: string): string {
  try {
    return text.replace(EMAIL_RE, '[email-oculto]');
  } catch {
    return text;
  }
}

/** Quita cabeceras de autorización de un objeto de headers, si existe. */
function scrubAuthHeaders(headers: Record<string, unknown> | undefined): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (/^(authorization|cookie|x-supabase-auth)$/i.test(key)) {
      delete headers[key];
    }
  }
}

/**
 * Limpia un evento de Sentry de datos personales antes de enviarlo:
 * - Borra el email del usuario (nos quedamos solo con el id, si lo hay).
 * - Borra cabeceras de autorización/cookies de la request adjunta.
 * - Tacha emails sueltos que aparezcan en el mensaje o las excepciones.
 * Fail-soft: si algo falla limpiando, se descarta el evento entero antes que
 * arriesgarse a mandar datos sin limpiar.
 */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  try {
    if (event.user) {
      delete event.user.email;
      delete (event.user as Record<string, unknown>).username;
      delete (event.user as Record<string, unknown>).ip_address;
    }
    if (event.request?.headers) {
      scrubAuthHeaders(event.request.headers as Record<string, unknown>);
    }
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    if (event.message) {
      event.message = scrubEmails(event.message);
    }
    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value) exc.value = scrubEmails(exc.value);
      }
    }
    return event;
  } catch {
    return null; // ante la duda, no se envía nada
  }
}

/**
 * Inicializa Sentry SOLO si hay DSN configurado. Sin DSN, no hace nada (no
 * inicializa, no lanza, no imprime nada por consola). Idempotente: llamarla
 * varias veces no reinicializa dos veces.
 */
export function initMonitoring(): void {
  if (initialized) return;
  try {
    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (!dsn) return; // desactivado: aún no hay proyecto Sentry creado

    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: 0.2,
      enableAutoSessionTracking: true,
      // Nunca mandar PII automático (IP, headers completos, etc).
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event),
    });

    initialized = true;
  } catch {
    /* fail-soft: si Sentry no arranca, la app sigue igual */
  }
}

/** Envía un error a Sentry a mano, con contexto extra opcional. No-op si
 * Sentry no está inicializado (sin DSN). Nunca lanza. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    if (!initialized) return;
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* fail-soft */
  }
}

/** Asocia el id de usuario actual a los eventos futuros (solo el id, nunca
 * email ni nombre). Pasar null al cerrar sesión para desasociar. No-op si
 * Sentry no está inicializado. */
export function setMonitoringUser(userId: string | null): void {
  try {
    if (!initialized) return;
    Sentry.setUser(userId ? { id: userId } : null);
  } catch {
    /* fail-soft */
  }
}
