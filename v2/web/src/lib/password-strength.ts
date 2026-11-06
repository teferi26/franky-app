import { z } from "zod";

/**
 * Politica de contrasenas, inspirada en NIST SP 800-63B (sin reglas de composicion):
 *  - minimo 10 caracteres (PASSWORD_MIN_LENGTH). Se subio a 12 y se volvio a
 *    bajar a 10 en sep-2026 por friccion en el alta desde el movil. Para
 *    compensar, la comprobacion contra HaveIBeenPwned se hace en cliente Y en
 *    servidor (api/auth/signup y signup-propietario).
 *  - SIN reglas de composicion (mayus/minus/numero/simbolo)
 *  - se rechaza lo que aparece en filtraciones (HaveIBeenPwned, ver abajo)
 *  - se rechazan patrones basura evidentes (una sola letra repetida, secuencias)
 *
 * Por que se quitaron las 4 clases obligatorias: la propia guia de NIST las
 * desaconseja de forma explicita. Empujan a la gente hacia "Password1!" (que
 * cumple las cuatro y esta en todos los diccionarios) y hacia reutilizar la
 * misma contrasena en todas partes. Longitud + comprobacion contra filtraciones
 * da mas seguridad real y ademas deja pasar passphrases tipo
 * "el gato de mi abuela ronca", que son fuertes y faciles de recordar.
 */
/** Longitud mínima de contraseña en web y API (cliente y servidor). */
export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Una frase que recuerdes funciona genial`)
  .max(200, "Máximo 200 caracteres")
  // Un unico caracter repetido ("aaaaaaaaaa") cumple la longitud pero no
  // aporta entropia. Se rechaza explicitamente.
  .refine((p) => new Set(p).size >= 5, {
    message: "Demasiado repetitiva. Usa más variedad de caracteres",
  })
  .refine((p) => !/^\s+$/.test(p), { message: "No puede ser solo espacios" });

/** Mensaje común (cliente y servidor) para contraseñas filtradas. */
export const PWNED_PASSWORD_MESSAGE =
  "Contraseña: aparece en filtraciones públicas de datos. Elige otra distinta.";

export type PasswordStrengthLevel = "weak" | "fair" | "good" | "strong";

/**
 * Cheap entropy estimate. Used only to drive the UI meter — never for gating.
 */
export function passwordStrength(p: string): { level: PasswordStrengthLevel; score: number } {
  if (!p) return { level: "weak", score: 0 };
  let score = 0;
  // La longitud manda: es lo que de verdad mueve la entropia. Una frase larga
  // en minusculas puntua mas que "Aa1!aa1!" y eso es lo correcto.
  if (p.length >= PASSWORD_MIN_LENGTH) score += 2;
  if (p.length >= 16) score++;
  if (p.length >= 20) score++;
  // La variedad suma, pero no es obligatoria (ver passwordSchema).
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (new Set(p).size >= 10) score++;
  if (/(.)\1{2,}/.test(p)) score--; // penalise "aaaa"
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(p)) score--;
  if (/^(password|contrase|qwerty|letmein|admin|123456|iloveyou)/i.test(p)) score = 0;
  if (score <= 2) return { level: "weak", score };
  if (score <= 4) return { level: "fair", score };
  if (score <= 6) return { level: "good", score };
  return { level: "strong", score };
}

/**
 * HaveIBeenPwned k-anonymity check. Only the first 5 SHA-1 chars leave the
 * browser; the server returns ~500 hashes starting with that prefix and we
 * scan locally for an exact match. We never send the password or its full
 * hash to a third party.
 *
 * Returns true if the password APPEARS in a known breach.
 */
export async function isPwnedPassword(
  password: string,
  opts: { timeoutMs?: number } = {}
): Promise<boolean> {
  if (typeof crypto === "undefined" || !crypto.subtle) return false;
  try {
    const enc = new TextEncoder().encode(password);
    const hashBuf = await crypto.subtle.digest("SHA-1", enc);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    // En servidor se pasa un tope de tiempo: si HIBP va lento, el alta no
    // se queda colgada (fail open, igual que cuando el servicio cae).
    const signal =
      opts.timeoutMs && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(opts.timeoutMs)
        : undefined;
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "add-padding": "true" },
      cache: "no-store",
      signal,
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split("\n").some((line) => {
      const [s] = line.split(":");
      return s.trim().toUpperCase() === suffix;
    });
  } catch {
    return false; // Fail open — don't block signup if HIBP API is down.
  }
}
