// Identificadores de las tiendas de apps (App Store / Google Play) y
// utilidades de detección de dispositivo (iOS / Android / escritorio).
//
// LA APP MÓVIL DE FRANKY AÚN NO ESTÁ PUBLICADA. Por eso las dos constantes de
// abajo están vacías (null): NO hay que inventarse un ID de App Store ni un
// package name, porque un enlace de tienda con un identificador falso da 404.
//
// RELLENAR AL PUBLICAR LA APP:
// - APP_STORE_ID: el ID numérico de App Store Connect (solo dígitos, SIN el
//   prefijo "id"). Aparece en la URL del listado una vez publicada la app,
//   p. ej. en "https://apps.apple.com/es/app/franky/id1234567890" sería
//   "1234567890".
// - ANDROID_PACKAGE_NAME: el applicationId de Google Play, el mismo que usa
//   el proyecto móvil (v2/mobile/app.json → android.package), con forma
//   "es.franky.app" o similar.
//
// Mientras cualquiera de las dos siga a null, todo el código que las consume
// (SmartAppBanner y la ruta /app) trata esa plataforma como "todavía no
// disponible": nunca construye una URL de tienda y cae a un aviso o a la
// propia web en su lugar.
export const APP_STORE_ID: string | null = null;
export const ANDROID_PACKAGE_NAME: string | null = null;

export type DevicePlatform = "ios" | "android" | "desktop";

/**
 * Detecta la plataforma a partir de un user agent, como función PURA (sin
 * tocar `navigator`), para poder usarla tanto en cliente como en servidor
 * (la ruta /app la resuelve con el header de la petición).
 */
export function detectPlatformFromUA(ua: string): DevicePlatform {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/** Plataforma del navegador actual. En servidor (sin `navigator`) devuelve "desktop". */
export function detectClientPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const platform = detectPlatformFromUA(ua);
  if (platform !== "desktop") return platform;
  // iPadOS 13+ camufla el user agent como "Macintosh" normal. Se distingue
  // porque un Mac de verdad no tiene pantalla táctil multitouch. Solo
  // aplica en cliente (aquí), no en la ruta /app (que resuelve en servidor
  // a partir del header y no puede consultar `maxTouchPoints`).
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

/** URL de la ficha en App Store, o null si la app todavía no está publicada ahí. */
export function iosStoreUrl(): string | null {
  if (!APP_STORE_ID) return null;
  return `https://apps.apple.com/es/app/id${APP_STORE_ID}`;
}

/** URL de la ficha en Google Play, o null si la app todavía no está publicada ahí. */
export function androidStoreUrl(): string | null {
  if (!ANDROID_PACKAGE_NAME) return null;
  return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
}

/**
 * URL de tienda para la plataforma dada, o null si es escritorio o si esa
 * plataforma todavía no tiene id configurado (app no publicada ahí aún).
 */
export function storeUrlForPlatform(platform: DevicePlatform): string | null {
  if (platform === "ios") return iosStoreUrl();
  if (platform === "android") return androidStoreUrl();
  return null;
}
