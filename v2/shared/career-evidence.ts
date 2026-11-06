// Kept identical in mobile/src/lib/career-evidence.ts: both clients apply the
// same boundaries to catalogue facts and historical guidance.
export function finiteNumber(value: unknown, min = 0, max = Infinity): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

export function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

export function salaryRange(value: unknown, currency = '€'): string | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const low = positiveNumber(value[0]);
  const high = positiveNumber(value[1]);
  if (low == null || high == null || low > high) return null;
  return `${Math.round(low).toLocaleString('es-ES')} – ${Math.round(high).toLocaleString('es-ES')} ${currency}`;
}

export function researchDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
}

export const PROFILE_SCOPE = 'Guía general de la titulación. El plan, la admisión y los resultados pueden variar según universidad y campus.';
export const DIFFICULTY_SCOPE = 'Valoración orientativa de Franky, no una medida oficial. La carga depende del plan de estudios, tu preparación y tus circunstancias.';
export function workloadGuidance(scoreValue: unknown, rationaleValue: unknown) {
  const score = finiteNumber(scoreValue, 0, 10);
  const rationale = typeof rationaleValue === 'string' ? rationaleValue.trim() : '';
  if (score == null && !rationale) return null;
  return { score, rationale,
    title: score == null ? 'Cómo preparar el estudio' : 'Dificultad orientativa',
    scope: score == null ? 'Consejos de preparación. La carga real depende del plan, tu forma de estudiar y tus circunstancias.' : DIFFICULTY_SCOPE,
  };
}
export const LABOUR_SCOPE = 'Referencias de estudios y publicaciones: describen sus muestras y periodos, no predicen tu resultado personal ni el de esta universidad.';

export interface LabourReference {
  provider?: string | null;
  scope?: string | null;
  field_code?: string | null;
  field_name?: string | null;
  cohort?: string | null;
  last_follow_up_year?: number | null;
  source_url?: string | null;
  verified_at?: string | null;
}

export function nationalLabourReference(value?: LabourReference | null) {
  if (!value || value.provider !== 'SIIU' || value.scope !== 'national_field' ||
      !/^\d{6}$/.test(value.field_code ?? '') || !value.field_name?.trim() ||
      !/^\d{4}-\d{4}$/.test(value.cohort ?? '') || !value.source_url) return null;
  const [first, last] = value.cohort!.split('-').map(Number);
  if (last !== first + 1 || value.last_follow_up_year !== last + 4) return null;
  try {
    const source = new URL(value.source_url);
    if (source.protocol !== 'https:' || source.hostname !== 'estadisticas.ciencia.gob.es' || source.username || source.password) return null;
    return { field: value.field_name, cohort: value.cohort!, followUpYear: value.last_follow_up_year,
      sourceUrl: source.href, checkedDate: researchDate(value.verified_at) };
  } catch { return null; }
}
