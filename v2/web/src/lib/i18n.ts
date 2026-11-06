/**
 * Infraestructura mínima de i18n para la web.
 *
 * NO es un sistema de routing completo (eso sería next-intl y un refactor de
 * las 60 páginas). Es el andamiaje para ir añadiendo páginas en otros idiomas
 * de forma ordenada, empezando por la landing en inglés para estudiantes
 * internacionales (/en), que es el mercado que de verdad abre el inglés.
 *
 * Locales soportados hoy: es (por defecto) y en. Preparado para 'ca' cuando se
 * traduzcan las páginas de mayor valor para Cataluña.
 */
export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** URLs alternas por idioma para el `alternates.languages` de los metadatos. */
export function hreflangAlternates(pathByLocale: Partial<Record<Locale, string>>) {
  const languages: Record<string, string> = {};
  for (const [loc, path] of Object.entries(pathByLocale)) {
    if (path) languages[loc] = `https://franky.es${path}`;
  }
  // x-default apunta a la versión española (el público mayoritario).
  if (pathByLocale.es) languages["x-default"] = `https://franky.es${pathByLocale.es}`;
  return languages;
}
