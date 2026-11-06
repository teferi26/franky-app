// ─── Catálogos académicos por páginas (becas, notas de corte, universidades) ─
// Antes estas pantallas descargaban la tabla entera con select('*') antes de
// pintar nada: 4.384 titulaciones (~2,5 MB en 9 peticiones seguidas) para las
// notas de corte y 634 becas (~2,4 MB, sobre todo textos largos de requisitos
// que la lista no enseña). Aquí viven las consultas ligeras que las sustituyen:
//   · notas de corte: páginas de 30 con búsqueda y filtros resueltos en el
//     servidor (PostgREST), y las opciones de ciudad/universidad solo cuando
//     se abre la hoja de filtros;
//   · becas y universidades: solo las columnas que pinta la lista.
// Las funciones antiguas de api.ts siguen igual: otras pantallas las usan.
import { supabase } from './supabase';
import type { CutOffRow } from './api';
import type { Scholarship, University } from './types';
import { SCHOLARSHIP_ALIASES } from './scholarship-aliases';
import { completeCatalogue } from './complete-catalogue';
import { ADMISSION_MODES, admissionModeLabel, normalizeAdmissionText } from './admission-search';

// ── Universidades (lista y comparador) ─────────────────────────────────────
export type UniversityListItem = Pick<University,
  'id' | 'name' | 'slug' | 'short_name' | 'type' | 'city' | 'comunidad_autonoma' |
  'founded_year' | 'student_count' | 'campus_count' | 'image_url' | 'logo_url' | 'institutional_sources'>;

// Sin description, curiosidades ni enlaces: ~30 KB en vez de ~185 KB.
const UNIVERSITY_LIST_COLUMNS =
  'id, name, slug, short_name, type, city, comunidad_autonoma, founded_year, student_count, campus_count, image_url, logo_url, institutional_sources';

export async function getUniversityList(): Promise<{ rows: UniversityListItem[]; live: boolean }> {
  const { data, error } = await supabase.from('universities')
    .select(UNIVERSITY_LIST_COLUMNS).order('name').limit(200);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as UniversityListItem[], live: true };
}

// Índice pequeño de universidades para traducir búsqueda, ciudad y nombre a
// ids en las consultas de titulaciones. Se pide una vez por sesión.
type UniversityIndexRow = { id: string; name: string; short_name: string | null; city: string | null };
let universityIndex: Promise<UniversityIndexRow[]> | null = null;
function getUniversityIndex(): Promise<UniversityIndexRow[]> {
  if (!universityIndex) {
    universityIndex = (async () => {
      const { data, error } = await supabase.from('universities').select('id, name, short_name, city').order('name').limit(500);
      if (error) throw error;
      return (data ?? []) as UniversityIndexRow[];
    })();
    universityIndex.catch(() => { universityIndex = null; });
  }
  return universityIndex;
}

// ── Becas ──────────────────────────────────────────────────────────────────
export type ScholarshipListItem = Pick<Scholarship,
  'id' | 'name' | 'provider' | 'type' | 'description' | 'amount_min' | 'amount_max' |
  'opens_at' | 'closes_at' | 'deadline' | 'comunidad_autonoma' | 'target_audience' |
  'coverage' | 'income_threshold' | 'gpa_requirement'>;

// Lo que pinta la fila y lo que necesitan el buscador, el plazo y el perfil
// (matchesPerfil). Requisitos, documentos, fuentes y proceso se leen en la
// ficha: eran el 80 % del peso de la descarga.
const SCHOLARSHIP_LIST_COLUMNS =
  'id, name, provider, type, description, amount_min, amount_max, opens_at, closes_at, deadline, comunidad_autonoma, target_audience, coverage, income_threshold, gpa_requirement';

export async function getScholarshipList(): Promise<{ rows: ScholarshipListItem[]; live: boolean }> {
  const all = await completeCatalogue<ScholarshipListItem>((from, to) => supabase.from('scholarships')
    .select(SCHOLARSHIP_LIST_COLUMNS).eq('is_active', true).order('id').range(from, to) as unknown as
    PromiseLike<{ data: ScholarshipListItem[] | null; error: unknown }>);
  return { rows: all.filter(row => !SCHOLARSHIP_ALIASES[row.id]), live: true };
}

// ── Notas de corte ─────────────────────────────────────────────────────────
export const CUTOFF_PAGE_SIZE = 30;

export type CutOffFilters = {
  q: string;
  branch: string;   // 'todas' = sin filtro
  city: string;     // '' = todas
  mode: string;     // '' = cualquiera
  uni: string;      // nombre; '' = todas
  sort: 'desc' | 'asc';
  withoutCutoff: boolean;
};

const CUTOFF_COLUMNS =
  'id, slug, name, branch, cut_off_score, cut_off_year, admission_without_cutoff, campus, modality, places_offered, demand_ratio, duration_years, universities(name, short_name, city, comunidad_autonoma, slug)';

/** Valor entre comillas para los filtros or() de PostgREST. */
function quoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// El buscador de la app ignora tildes (normalizeAdmissionText). En el servidor
// se consigue lo mismo con una expresión regular sin distinguir mayúsculas en
// la que cada letra acepta sus variantes acentuadas.
const ACCENTS: Record<string, string> = {
  a: 'aáàâäãAÁÀÂÄÃ', e: 'eéèêëEÉÈÊË', i: 'iíìîïIÍÌÎÏ', o: 'oóòôöõOÓÒÔÖÕ',
  u: 'uúùûüUÚÙÛÜ', n: 'nñNÑ', c: 'cçCÇ', y: 'yýÿYÝ',
};
// Algunos nombres guardan la tilde descompuesta ("i" + U+0301): tras cada
// letra se aceptan marcas combinantes, que normalizeAdmissionText también quita.
const COMBINING_MARKS = '[̀-ͯ]*';
export function accentInsensitivePattern(term: string): string {
  return [...term].map(ch => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : escapeRegex(ch)) + COMBINING_MARKS).join('');
}

const MODE_VALUES = [...ADMISSION_MODES.map(m => m.value as string), 'semipresencial'];

/** Cada palabra debe aparecer en la titulación, el campus, la universidad (nombre, siglas o ciudad) o la modalidad, igual que matchesAdmissionSearch. */
function searchClause(term: string, unis: UniversityIndexRow[]): string {
  const rx = quoted(accentInsensitivePattern(term));
  const parts = [`name.imatch.${rx}`, `campus.imatch.${rx}`];
  const uniIds = unis.filter(u => [u.name, u.short_name, u.city].some(v => v && normalizeAdmissionText(v).includes(term))).map(u => u.id);
  if (uniIds.length) parts.push(`university_id.in.(${uniIds.join(',')})`);
  const modes = MODE_VALUES.filter(m => normalizeAdmissionText(admissionModeLabel(m)).includes(term));
  if (modes.length) parts.push(`modality.in.(${modes.join(',')})`);
  return parts.join(',');
}

/** Misma regla que admissionLocation: el campus y, si no hay, la ciudad de la universidad. */
function cityClause(city: string, unis: UniversityIndexRow[]): string {
  const exact = `campus.match.${quoted(`^\\s*${escapeRegex(city)}\\s*$`)}`;
  const ids = unis.filter(u => (u.city ?? '').trim() === city).map(u => u.id);
  if (!ids.length) return exact;
  return `${exact},and(or(campus.is.null,campus.match.${quoted('^\\s*$')}),university_id.in.(${ids.join(',')}))`;
}

function normalizeCutOffRow(r: unknown): CutOffRow {
  const c = r as CutOffRow & { universities: CutOffRow['universities'] | CutOffRow['universities'][] };
  return { ...c, universities: Array.isArray(c.universities) ? (c.universities[0] ?? null) : c.universities } as CutOffRow;
}

/**
 * Una página de titulaciones con los filtros resueltos en el servidor. Mismo
 * orden que la lista completa: nota (mayor o menor) y las que no tienen nota
 * publicada siempre al final, por nombre. `total` solo llega en la primera
 * página (count exacto de PostgREST).
 */
export async function getCutOffPage(filters: CutOffFilters, offset: number, limit = CUTOFF_PAGE_SIZE):
  Promise<{ rows: CutOffRow[]; total: number | null; hasMore: boolean }> {
  const terms = normalizeAdmissionText(filters.q).split(/\s+/).filter(Boolean);
  const needsUnis = terms.length > 0 || !!filters.city || !!filters.uni;
  const unis = needsUnis ? await getUniversityIndex() : [];

  let query = supabase.from('careers').select(CUTOFF_COLUMNS, offset === 0 ? { count: 'exact' } : undefined);
  if (filters.withoutCutoff) query = query.eq('admission_without_cutoff', true);
  if (filters.branch !== 'todas') query = query.eq('branch', filters.branch);
  if (filters.mode) query = query.eq('modality', filters.mode);
  if (filters.uni) {
    const ids = unis.filter(u => u.name === filters.uni).map(u => u.id);
    if (!ids.length) return { rows: [], total: 0, hasMore: false };
    query = query.in('university_id', ids);
  }
  if (filters.city) query = query.or(cityClause(filters.city, unis));
  for (const term of terms) query = query.or(searchClause(term, unis));

  const { data, error, count } = await query
    .order('cut_off_score', { ascending: filters.sort === 'asc', nullsFirst: false })
    .order('name', { ascending: true })
    // Desempate estable: sin él, dos titulaciones empatadas pueden cambiar de
    // página entre peticiones y duplicarse o perderse.
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data ?? []).map(normalizeCutOffRow);
  const total = typeof count === 'number' ? count : null;
  const hasMore = total != null ? offset + rows.length < total : rows.length === limit;
  return { rows, total, hasMore };
}

// Opciones de la hoja de filtros (campus/ciudad y universidad). Solo pares
// campus + universidad (~40 B por titulación, en paralelo) y solo cuando el
// usuario abre los filtros; se guardan para toda la sesión.
export type CutOffFacets = {
  cities: string[];
  /** Nombres de universidad con titulaciones en cada ciudad ('' = todas). */
  universitiesByCity: Map<string, string[]>;
};
let facetsPromise: Promise<CutOffFacets> | null = null;

export function getCutOffFacets(): Promise<CutOffFacets> {
  if (!facetsPromise) {
    facetsPromise = (async () => {
      const PAGE = 500;
      const page = (from: number) => supabase.from('careers').select('campus, university_id', from === 0 ? { count: 'exact' } : undefined)
        .order('id', { ascending: true }).range(from, from + PAGE - 1);
      const [first, unis] = await Promise.all([page(0), getUniversityIndex()]);
      if (first.error) throw first.error;
      const total = first.count ?? 0;
      const rest = [];
      for (let from = PAGE; from < total; from += PAGE) rest.push(page(from));
      const pages = await Promise.all(rest);
      const pairs = [...(first.data ?? [])];
      for (const p of pages) { if (p.error) throw p.error; pairs.push(...(p.data ?? [])); }

      const byId = new Map(unis.map(u => [u.id, u]));
      const unisByCity = new Map<string, Set<string>>();
      const all = new Set<string>();
      for (const row of pairs as { campus: string | null; university_id: string | null }[]) {
        const uni = row.university_id ? byId.get(row.university_id) : undefined;
        const location = row.campus?.trim() || uni?.city?.trim() || '';
        if (uni?.name) all.add(uni.name);
        if (!location) continue;
        let set = unisByCity.get(location);
        if (!set) { set = new Set(); unisByCity.set(location, set); }
        if (uni?.name) set.add(uni.name);
      }
      const sort = (list: Iterable<string>) => [...list].sort((a, b) => a.localeCompare(b, 'es'));
      const universitiesByCity = new Map<string, string[]>([['', sort(all)]]);
      for (const [city, set] of unisByCity) universitiesByCity.set(city, sort(set));
      return { cities: sort(unisByCity.keys()), universitiesByCity };
    })();
    facetsPromise.catch(() => { facetsPromise = null; });
  }
  return facetsPromise;
}
