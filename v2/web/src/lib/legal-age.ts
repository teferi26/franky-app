/**
 * Reglas de edad de Franky.
 *
 * - 14 años: edad mínima para crear una cuenta (art. 7 LOPDGDD: a partir de
 *   los 14 años una persona puede consentir por sí misma el tratamiento de
 *   sus datos).
 * - 18 años: Crush y la mensajería con desconocidos. En base de datos lo
 *   comprueba public.is_adult() (migración 20260924201000_age_gate.sql).
 *
 * Las fechas llegan como "YYYY-MM-DD" (input type=date y columna date de
 * Postgres). Se calcula con aritmética de calendario, sin zonas horarias:
 * `new Date("2008-09-23")` es medianoche UTC y en España puede caer el día
 * anterior, lo que daría un año de más o de menos justo el día del cumpleaños.
 */

export const MIN_ACCOUNT_AGE = 14;
export const ADULT_AGE = 18;
/** Edad máxima razonable: evita años de nacimiento tecleados mal (p. ej. 0199). */
export const MAX_REASONABLE_AGE = 100;

type Ymd = { y: number; m: number; d: number };

function parseYmd(value: string | null | undefined): Ymd | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  // Días reales del mes (Date.UTC con día 0 del mes siguiente = último día).
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return { y, m, d };
}

function todayYmd(today: Date): Ymd {
  return { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Edad cumplida en años, o null si la fecha no es válida o es futura. */
export function ageFromBirthDate(
  birthDate: string | null | undefined,
  today: Date = new Date()
): number | null {
  const b = parseYmd(birthDate);
  if (!b) return null;
  const t = todayYmd(today);
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age < 0 ? null : age;
}

export type BirthDateCheck =
  | { ok: true; age: number }
  | { ok: false; reason: "missing" | "invalid" | "future" | "too_old" | "under_min_age"; age?: number };

/** Valida la fecha de nacimiento del alta (mínimo 14 años). */
export function checkBirthDate(
  birthDate: string | null | undefined,
  today: Date = new Date()
): BirthDateCheck {
  if (!birthDate || !birthDate.trim()) return { ok: false, reason: "missing" };
  const b = parseYmd(birthDate);
  if (!b) return { ok: false, reason: "invalid" };
  const age = ageFromBirthDate(birthDate, today);
  if (age === null) return { ok: false, reason: "future" };
  if (age > MAX_REASONABLE_AGE) return { ok: false, reason: "too_old", age };
  if (age < MIN_ACCOUNT_AGE) return { ok: false, reason: "under_min_age", age };
  return { ok: true, age };
}

/** Mensaje amable para cada motivo (null si la fecha es válida o falta). */
export function birthDateMessage(check: BirthDateCheck): string | null {
  if (check.ok) return null;
  switch (check.reason) {
    case "missing":
      return null;
    case "invalid":
      return "Esa fecha no existe. Revísala, por favor.";
    case "future":
      return "La fecha de nacimiento no puede ser futura.";
    case "too_old":
      return "Revisa el año de nacimiento: parece que hay un error al escribirlo.";
    case "under_min_age":
      return "Franky es para personas de 14 años o más. ¡Te esperamos cuando los cumplas! Mientras tanto puedes consultar notas de corte y becas sin cuenta.";
  }
}

/** true solo si hay fecha válida y la persona tiene 18 años o más. */
export function isAdultBirthDate(
  birthDate: string | null | undefined,
  today: Date = new Date()
): boolean {
  const age = ageFromBirthDate(birthDate, today);
  return age !== null && age >= ADULT_AGE && age <= MAX_REASONABLE_AGE;
}

/**
 * Límites para el `<input type="date">`: `max` = hoy hace 14 años y
 * `min` = hoy hace 100 años (formato YYYY-MM-DD).
 */
export function birthDateInputBounds(today: Date = new Date()): { min: string; max: string } {
  const t = todayYmd(today);
  const shift = (years: number) => {
    const y = t.y - years;
    // 29 de febrero en un año no bisiesto: se usa el 28.
    const last = new Date(Date.UTC(y, t.m, 0)).getUTCDate();
    return `${y}-${pad(t.m)}-${pad(Math.min(t.d, last))}`;
  };
  return { min: shift(MAX_REASONABLE_AGE), max: shift(MIN_ACCOUNT_AGE) };
}

export type CrushAgeGate = "ok" | "missing_birth_date" | "under_18";

/** Estado de la puerta de edad de Crush a partir de la fecha del perfil. */
export function crushAgeGate(
  birthDate: string | null | undefined,
  today: Date = new Date()
): CrushAgeGate {
  const age = ageFromBirthDate(birthDate, today);
  // Sin fecha, fecha imposible o un año claramente mal tecleado: hay que
  // completarla o corregirla en el perfil.
  if (age === null || age > MAX_REASONABLE_AGE) return "missing_birth_date";
  return age >= ADULT_AGE ? "ok" : "under_18";
}
