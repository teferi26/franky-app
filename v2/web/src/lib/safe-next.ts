// Saneado del parámetro `next` (destino post-login) para evitar open redirects.
// Se usa en login, registro, onboarding y el callback de OAuth/confirmación de
// email para llevar al usuario a la página que pedía (p. ej. /crush desde el
// cartel) en vez de soltarlo siempre en la home.

/**
 * Devuelve `raw` solo si es una ruta interna segura; si no, `fallback`.
 * Acepta únicamente rutas absolutas internas: empiezan por "/" pero NO por
 * "//" (protocol-relative → //evil.com) ni "/\" (truco con backslash).
 */
export function sanitizeNext(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Bloquea esquemas peligrosos incrustados (defensa en profundidad).
  if (/^\/\s*(javascript|data|vbscript):/i.test(value)) return fallback;
  // URL parsers remove controls and treat backslashes as slashes. Check
  // encoded forms too, before a later navigation layer can decode them.
  let decoded = value;
  for (let pass = 0; pass < 3; pass++) {
    try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; }
    catch { return fallback; }
    if (/^[\/\\]{2}/.test(decoded) || /[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback;
  }
  try { if (new URL(value, 'https://franky.invalid').origin !== 'https://franky.invalid') return fallback; }
  catch { return fallback; }
  return value;
}

/**
 * Construye `path` añadiendo `?next=<dest>` solo cuando el destino saneado no
 * es la home. `path` debe ir sin query previa (login/registro/onboarding/callback).
 */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = sanitizeNext(next);
  return safe === "/" ? path : `${path}?next=${encodeURIComponent(safe)}`;
}

/** El alta profesional recoge sus propios datos, sin pasar por el alta estudiantil. */
export function isProOnboardingNext(raw: string | null | undefined): boolean {
  const path = sanitizeNext(raw).split(/[?#]/)[0];
  return path === "/pro/empezar" || path === "/pro/activar";
}
