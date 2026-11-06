/**
 * Shared helpers for the admin analytics API: parse `URLSearchParams` into
 * the jsonb shape that the SQL RPCs expect, and validate range presets.
 *
 * Filters recognised (all multi-value):
 *   comunidad      — comma-separated strings
 *   city           — comma-separated strings
 *   university     — comma-separated UUIDs
 *   gender         — comma-separated enum
 *   age            — comma-separated buckets (18-21, 22-25, 26-30, 30+, <18)
 *   studentType    — comma-separated enum
 *   year           — comma-separated ints (university_course)
 *   range          — 7d | 30d | 90d | 12m | all | custom:<from>,<to>
 */

import { NextResponse } from "next/server";
import { decodeAal } from "@/lib/aal";
import { getRequestBearer } from "@/lib/request-auth";
import { normalizeAnalyticsRange, resolveAnalyticsPeriod } from "@/lib/analytics-period";

export type AnalyticsFilters = {
  comunidad?: string[];
  city?: string[];
  university?: string[];
  gender?: string[];
  age_bucket?: string[];
  student_type?: string[];
  year?: number[];
  since?: string;
  until?: string;
};

const VALID_GENDER = new Set(["hombre", "mujer", "no_binario", "prefiero_no_decirlo"]);
const VALID_AGE = new Set(["<18", "18-21", "22-25", "26-30", "30+"]);
const VALID_STUDENT_TYPE = new Set(["bachillerato", "fp", "universidad", "master", "otro"]);

function splitCsv(value: string | null, max = 30): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFilters(searchParams: URLSearchParams): AnalyticsFilters {
  const filters: AnalyticsFilters = {};

  const comunidad = splitCsv(searchParams.get("comunidad")).filter((s) => s.length <= 60);
  if (comunidad.length) filters.comunidad = comunidad;

  const city = splitCsv(searchParams.get("city")).filter((s) => s.length <= 60);
  if (city.length) filters.city = city;

  const university = splitCsv(searchParams.get("university")).filter((s) => UUID_RE.test(s));
  if (university.length) filters.university = university;

  const gender = splitCsv(searchParams.get("gender")).filter((s) => VALID_GENDER.has(s));
  if (gender.length) filters.gender = gender;

  const age = splitCsv(searchParams.get("age")).filter((s) => VALID_AGE.has(s));
  if (age.length) filters.age_bucket = age;

  const studentType = splitCsv(searchParams.get("studentType")).filter((s) => VALID_STUDENT_TYPE.has(s));
  if (studentType.length) filters.student_type = studentType;

  const yearRaw = splitCsv(searchParams.get("year"));
  const year = yearRaw
    .filter((s) => /^[1-6]$/.test(s))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 6);
  if (year.length) filters.year = year;

  // Range → since
  const range = parseRange(searchParams.get("range"));
  if (range.since) filters.since = range.since;
  if (range.until) filters.until = range.until;

  return filters;
}

export function parseRange(raw: string | null): { days: number; since?: string; until?: string } {
  return resolveAnalyticsPeriod(raw);
}

/** Legacy rolling RPCs cannot truthfully represent an arbitrary historic interval. */
export function requireRollingRange(params: URLSearchParams): NextResponse | null {
  return normalizeAnalyticsRange(params.get('range')).startsWith('custom:')
    ? NextResponse.json({ error: 'unsupported_period', message: 'Esta sección admite periodos recientes. Selecciona 7, 30 o 90 días, 12 meses o Histórico.' }, { status: 400 })
    : null;
}

/**
 * Guard for admin endpoints. Returns either { ok: true, userId } or a
 * NextResponse (401/403) the route should return verbatim.
 *
 * Two levels:
 *   requireAdmin() — solo role=admin. Para TODA ruta que escriba algo.
 *   requireStaff() — admin o analyst. Para las rutas de SOLO LECTURA del
 *                    panel (analytics). El analista ve, nunca toca.
 */
async function requireRole(
  roles: readonly string[],
  /**
   * Pasa la request para que el guard acepte también la sesión de la app
   * móvil, que no tiene cookies de Next y viaja como `Authorization: Bearer`.
   * Sin esto, cualquier llamada desde la app moría en 401 aunque el usuario
   * fuera admin. La misma credencial debe satisfacer autenticación, rol y MFA;
   * el middleware y la base de datos añaden comprobaciones independientes.
   */
  req?: { headers: Headers }
): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; response: NextResponse }
> {
  const { createRequestSupabase, createServerSupabase } = await import(
    "@/lib/supabase-server"
  );
  const supabase = req
    ? await createRequestSupabase(req)
    : await createServerSupabase();
  const bearer = req ? getRequestBearer(req) : null;
  const token = bearer !== null
    ? bearer
    : (await supabase.auth.getSession()).data.session?.access_token;
  // Validate the exact token whose assurance level we inspect. Merely decoding
  // an AAL2 claim, or borrowing it from another cookie session, is insufficient.
  const { data: { user }, error: authError } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null };
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_discarded")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !roles.includes(profile.role ?? "") || profile.is_discarded) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  if (decodeAal(token) !== "aal2") {
    return {
      ok: false,
      response: NextResponse.json({ error: "mfa_required" }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, role: profile.role as string };
}

export async function requireAdmin(req?: { headers: Headers }) {
  return requireRole(["admin"], req);
}

export async function requireStaff(req?: { headers: Headers }) {
  return requireRole(["admin", "analyst"], req);
}
