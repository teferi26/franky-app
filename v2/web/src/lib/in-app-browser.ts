// Detección de navegadores in-app (webviews de Instagram, TikTok, WhatsApp…).
//
// Por qué existe esto: los QR del campus y los enlaces en redes se abren en el
// navegador INTERNO de la app, que no comparte cookies con Chrome/Safari. Ahí
// no existe la sesión de Google del dispositivo, así que "Continuar con Google"
// no puede mostrar el selector de cuentas: pide email y contraseña a mano. En
// muchos webviews Google directamente bloquea el flujo (403 disallowed_useragent).
// La salida correcta es llevar al usuario a su navegador real, donde sí verá
// sus cuentas de Google con un toque.

import { appendAttributionToUrl } from "@/lib/attribution";
import { inAppBrowserNameFromUA } from "@/lib/webview-ua";

/** Nombre legible de la app cuyo webview nos aloja, o null si es un navegador normal. */
export function inAppBrowserName(): string | null {
  if (typeof navigator === "undefined") return null;
  return inAppBrowserNameFromUA(navigator.userAgent || "");
}

export function isInAppBrowser(): boolean {
  return inAppBrowserName() !== null;
}

/**
 * URL actual con los UTMs del first-touch reinyectados. Es la URL que hay que
 * usar SIEMPRE al salir del webview (salto automático, copiar enlace…): el
 * navegador real no comparte localStorage con el webview y sin los UTMs en la
 * URL el lead perdería su atribución.
 */
export function externalUrlWithAttribution(url?: string): string {
  if (typeof window === "undefined") return url || "";
  const current = new URL(window.location.href);
  let target = current;
  try {
    const candidate = new URL(url || current.href, current);
    if (candidate.origin === current.origin && ['https:', 'http:'].includes(candidate.protocol)
      && !candidate.username && !candidate.password) target = candidate;
  } catch { /* Malformed destinations fall back to the current Franky page. */ }
  return appendAttributionToUrl(target.href);
}

/**
 * Intenta abrir la URL (por defecto, la actual) en el navegador real del
 * dispositivo, fuera del webview.
 * - Android: `intent://` abre Chrome/el navegador por defecto; si el webview
 *   lo ignora, cae a la propia URL (browser_fallback_url).
 * - iOS: `x-safari-https://` abre Safari (iOS 17+). Muchas apps (Instagram
 *   incluida, según versión) bloquean el esquema y no pasa NADA.
 *
 * Como el bloqueo es silencioso (o con un diálogo del sistema que oculta la
 * página un instante, imposible de distinguir de un salto con éxito), acepta
 * un `onAttempted`: se invoca casi al instante (~300 ms) tras el intento para
 * que la UI enseñe la salida manual (menú ⋯ → Abrir en el navegador) y el
 * enlace copiable SIN sensación de botón muerto. Si el salto funcionó, el
 * usuario ya no está en el webview y el aviso no molesta; en iOS Instagram el
 * salto automático está bloqueado siempre, así que la guía ES el camino.
 */
export function openInExternalBrowser(url?: string, onAttempted?: () => void): void {
  if (typeof window === "undefined") return;
  const target = externalUrlWithAttribution(url);
  const ua = navigator.userAgent || "";

  if (onAttempted) window.setTimeout(onAttempted, 300);

  if (/android/i.test(ua)) {
    const u = new URL(target);
    const scheme = u.protocol.replace(":", "");
    window.location.href =
      `intent://${u.host}${u.pathname}${u.search}` +
      `#Intent;scheme=${scheme};S.browser_fallback_url=${encodeURIComponent(target)};end`;
    return;
  }

  if (/iphone|ipad|ipod/i.test(ua)) {
    window.location.href = `x-safari-${target}`;
    return;
  }

  window.open(target, "_blank", "noopener");
}
