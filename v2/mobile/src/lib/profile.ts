// ─── Datos de perfil compartidos por Editar perfil y el onboarding ──────────
// Aquí viven las opciones y los accesos a `profiles` que la web ya tenía
// (web/src/app/onboarding/page.tsx y web/src/app/perfil/page.tsx) y que a la
// app le faltaban: carrera, curso, género, fecha de nacimiento y universidad.
// Todo apunta a columnas reales de la tabla profiles:
//   career TEXT (001), university_course INTEGER 1-6 (010), gender TEXT con
//   CHECK (010), birth_date DATE (001, cifrada además por el trigger de la
//   041), university_id UUID (001), interests TEXT[] (001).
import { supabase } from './supabase';
import type { University } from './types';
import { captureSessionIdentity, type SessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';

// Mismos valores y etiquetas que el RadioGroup de género del onboarding web.
// El value es lo que acepta el CHECK de la columna; la label solo se enseña.
export const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'hombre', label: 'Hombre' },
  { value: 'mujer', label: 'Mujer' },
  { value: 'no_binario', label: 'No binario' },
  { value: 'prefiero_no_decirlo', label: 'Prefiero no decirlo' },
];

// university_course admite 1..6 (CHECK de la migración 010). Etiqueta "1º".
export const COURSE_OPTIONS: { value: number; label: string }[] =
  [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}º` }));

// Mismas opciones de intereses que HOBBIES_OPTIONS del onboarding web, para
// que un perfil creado en la app y otro creado en la web hablen el mismo
// vocabulario y las coincidencias entre roomies cuadren.
export const INTEREST_OPTIONS: string[] = [
  'Deporte', 'Música', 'Lectura', 'Cine/Series', 'Videojuegos', 'Cocina',
  'Fotografía', 'Viajes', 'Arte', 'Tecnología', 'Naturaleza', 'Yoga/Meditación',
  'Idiomas', 'Voluntariado', 'Fiestas', 'Moda',
];
export const MAX_INTERESTS = 15;

// ── Fechas (birth_date es DATE: se guarda como 'YYYY-MM-DD', sin hora) ──
// Se construye en hora local a propósito: `new Date('2004-05-10')` se
// interpreta en UTC y en España saldría el día anterior al pintarla.
export function isoDateToLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function localDateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function formatDateEs(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}
// Edad en años cumplidos; null si no hay fecha válida.
export function ageFromIso(iso: string | null | undefined): number | null {
  const d = isoDateToLocal(iso);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth()
    || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Fecha por defecto del selector cuando aún no hay nacimiento: 20 años atrás
// (la edad típica del público) para que la rueda no arranque en hoy.
export function defaultBirthDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 20);
  return d;
}
// Tope: hay que tener al menos 16 años (Crush pide 16+, migración 098) y menos
// de 100 no es una restricción real, solo evita fechas absurdas por error.
export function birthDateBounds(): { min: Date; max: Date } {
  const max = new Date(); max.setFullYear(max.getFullYear() - 16);
  const min = new Date(); min.setFullYear(min.getFullYear() - 100);
  return { min, max };
}

// ── Lectura y escritura del perfil propio ──
export interface MyProfileFields {
  full_name: string | null;
  bio: string | null;
  city: string | null;
  avatar_url: string | null;
  interests: string[] | null;
  career: string | null;
  university_course: number | null;
  gender: string | null;
  birth_date: string | null;
  university_id: string | null;
}

const PROFILE_FIELDS = 'full_name, bio, city, avatar_url, interests, career, university_course, gender, birth_date, university_id';

// Devuelve null tanto si no hay sesión como si la fila no existe: la pantalla
// que llama decide qué hacer en cada caso (mandar a /welcome o avisar).
export async function getMyProfile(owner: SessionIdentity | null = captureSessionIdentity()): Promise<{ userId: string; profile: MyProfileFields | null } | null> {
  if (!owner) return null;
  return withOwnedRequest(owner, async request => {
    const { data, error } = await request.query(supabase.from('profiles').select(PROFILE_FIELDS).eq('id', owner.userId)).maybeSingle();
    if (error) throw error;
    return { userId: owner.userId, profile: (data as MyProfileFields | null) ?? null };
  });
}

// Update de profiles con la comprobación que ya usaban Editar perfil y el
// editor de roomie: el .select('id') no es decorativo. Un UPDATE que la RLS
// deja en 0 filas devuelve error=null y la pantalla cerraría cantando
// victoria sin haber guardado nada.
export async function updateMyProfile(userId: string, patch: Record<string, unknown>, owner: SessionIdentity | null = captureSessionIdentity()):
  Promise<{ ok: true } | { ok: false; message: string }> {
  if (!owner || owner.userId !== userId) throw new Error('session_changed');
  return withOwnedRequest(owner, async request => {
  const { data: rows, error } = await request.query(supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id'));
  if (error) return { ok: false, message: error.message || 'Inténtalo de nuevo en unos segundos.' };
  if (!rows?.length) {
    return { ok: false, message: 'No hemos podido actualizar tu perfil. Cierra sesión, vuelve a entrar e inténtalo de nuevo.' };
  }
  return { ok: true };
  });
}

// Nombres de carrera de una universidad, sin repetidos y ordenados, para
// sugerirlos como chips (la web hace lo mismo: si la uni tiene carreras en
// la BD se eligen de la lista; si no, texto libre). Fail-soft: lista vacía.
export async function getCareerNamesForUniversity(universityId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('careers').select('name').eq('university_id', universityId).order('name').limit(400);
    if (error || !data) return [];
    const names = new Set<string>();
    for (const row of data as { name: string }[]) if (row.name?.trim()) names.add(row.name.trim());
    return [...names];
  } catch {
    return [];
  }
}

// Una universidad por id (para pintar el nombre de la elegida sin cargar el
// catálogo entero). Null si no existe o no hay red.
export async function getUniversityById(id: string): Promise<University | null> {
  try {
    const { data } = await supabase.from('universities').select('*').eq('id', id).maybeSingle();
    return (data as University | null) ?? null;
  } catch {
    return null;
  }
}

// Normaliza y deduplica intereses (comparación sin mayúsculas ni espacios).
export function addInterestTo(list: string[], raw: string): string[] {
  const value = raw.trim().slice(0, 30);
  if (!value) return list;
  if (list.length >= MAX_INTERESTS) return list;
  if (list.some((i) => i.toLowerCase() === value.toLowerCase())) return list;
  return [...list, value];
}
