// Fuente única del curso vigente de notas de corte (web y móvil).
//
// public.careers guarda dos notas por titulación: cut_off_* (curso vigente) y
// cut_off_*_prev (curso anterior). La interfaz enseña por defecto SOLO la del
// curso vigente y deja consultar la del anterior con un único conmutador.
//
// Cada verano, cuando se carguen las notas del nuevo curso, basta con subir
// CURRENT_CUT_OFF_YEAR: todas las pantallas cambian de rótulo y de nota a la vez.

/** Primer año natural del curso vigente: 2026 significa el curso 2026/2027. */
export const CURRENT_CUT_OFF_YEAR = 2026;
/** Curso anterior, consultable con el conmutador. */
export const PREVIOUS_CUT_OFF_YEAR = CURRENT_CUT_OFF_YEAR - 1;

export type CutOffView = 'current' | 'previous';

export function cutOffViewYear(view: CutOffView): number {
  return view === 'previous' ? PREVIOUS_CUT_OFF_YEAR : CURRENT_CUT_OFF_YEAR;
}

/** Rótulo corto del curso: 2026 da "26/27". */
export function shortCutOffCourse(year: number): string {
  const two = (value: number) => String(value % 100).padStart(2, '0');
  return `${two(year)}/${two(year + 1)}`;
}

/** Rótulo corto del curso de una vista: "26/27" o "25/26". */
export function cutOffViewLabel(view: CutOffView): string {
  return shortCutOffCourse(cutOffViewYear(view));
}

/** Campos de nota que puede traer una fila de careers. */
export type CutOffRecord = {
  cut_off_score?: number | string | null;
  cut_off_year?: number | null;
  cut_off_round?: string | null;
  cut_off_source_url?: string | null;
  cut_off_score_prev?: number | string | null;
  cut_off_year_prev?: number | null;
  cut_off_round_prev?: string | null;
  cut_off_source_url_prev?: string | null;
};

export type ResolvedCutOff = {
  score: number;
  year: number;
  round: string | null;
  sourceUrl: string | null;
};

function validScore(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const score = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 14 ? score : null;
}

function httpsOnly(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/**
 * Nota de una titulación para un curso concreto, venga de la columna vigente o
 * de la anterior. Una nota sin año o de otro curso nunca se atribuye al curso
 * pedido: así una fila sin nota 26/27 no enseña la 25/26 como si fuera actual.
 */
export function cutOffForYear(record: CutOffRecord, year: number): ResolvedCutOff | null {
  const main = validScore(record.cut_off_score);
  if (main !== null && record.cut_off_year === year) {
    return { score: main, year, round: record.cut_off_round ?? null, sourceUrl: httpsOnly(record.cut_off_source_url) };
  }
  const prev = validScore(record.cut_off_score_prev);
  if (prev !== null && record.cut_off_year_prev === year) {
    return { score: prev, year, round: record.cut_off_round_prev ?? null, sourceUrl: httpsOnly(record.cut_off_source_url_prev) };
  }
  return null;
}

export function cutOffForView(record: CutOffRecord, view: CutOffView): ResolvedCutOff | null {
  return cutOffForYear(record, cutOffViewYear(view));
}

/** Texto cuando no hay nota en el curso mostrado: "Sin nota 26/27". */
export function missingCutOffLabel(view: CutOffView): string {
  return `Sin nota ${cutOffViewLabel(view)}`;
}
