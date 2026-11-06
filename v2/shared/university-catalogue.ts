// Keep identical in mobile/src/lib/university-catalogue.ts.
import { cutOffForView, cutOffViewYear, missingCutOffLabel, type CutOffRecord, type CutOffView } from './cut-off-year';

export interface UniversityCourse {
  id: string;
  name: string;
  branch?: string | null;
  campus?: string | null;
  cut_off_score?: number | null;
  cut_off_year?: number | null;
  admission_without_cutoff?: boolean | null;
}

export const COURSE_BRANCH_LABELS: Record<string, string> = {
  ciencias: 'Ciencias',
  ciencias_salud: 'Ciencias de la Salud',
  ingenieria_arquitectura: 'Ingeniería y Arquitectura',
  artes_humanidades: 'Artes y Humanidades',
  ciencias_sociales_juridicas: 'Ciencias Sociales y Jurídicas',
};

export const normalizeCourseSearch = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');

export function courseAdmission(course: UniversityCourse) {
  const year = course.cut_off_year;
  const period = typeof year === 'number' && Number.isInteger(year) && year >= 2000 && year <= 2100
    ? `${year}/${year + 1}` : 'Curso por confirmar';
  if (course.admission_without_cutoff === true) return { label: 'Sin corte', period, note: 'Consulta los requisitos de acceso', score: null };
  const score = course.cut_off_score;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 5 || score > 14) {
    return { label: 'Consultar', period, note: 'Nota no publicada en esta ficha', score: null };
  }
  return { label: score.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }), period, note: 'Nota de corte de referencia', score };
}

/**
 * Admisión de una oferta para el curso elegido con el conmutador (vigente o
 * anterior). Sin nota de ese curso da "Sin nota" y nunca la de otro curso.
 */
export function courseAdmissionForView(course: UniversityCourse & CutOffRecord, view: CutOffView) {
  const resolved = course.admission_without_cutoff === true ? null : cutOffForView(course, view);
  const admission = courseAdmission({ ...course, cut_off_score: resolved?.score ?? null, cut_off_year: cutOffViewYear(view) });
  return admission.score === null && course.admission_without_cutoff !== true
    ? { ...admission, label: 'Sin nota', note: missingCutOffLabel(view) }
    : admission;
}

export function universityCourseOptions(courses: readonly UniversityCourse[], field: 'branch' | 'campus') {
  return [...new Set(courses.map(c => c[field]?.trim()).filter((value): value is string => !!value))]
    .sort((a, b) => (field === 'branch' ? COURSE_BRANCH_LABELS[a] ?? a : a).localeCompare(field === 'branch' ? COURSE_BRANCH_LABELS[b] ?? b : b, 'es'));
}

export function filterUniversityCourses<T extends UniversityCourse>(courses: readonly T[], filters: {
  query?: string; branch?: string; campus?: string;
}) {
  const words = normalizeCourseSearch(filters.query ?? '').split(' ').filter(Boolean);
  return courses.filter(course => {
    if (filters.branch && course.branch?.trim() !== filters.branch) return false;
    if (filters.campus && course.campus?.trim() !== filters.campus) return false;
    const haystack = normalizeCourseSearch(`${course.name} ${course.campus ?? ''} ${COURSE_BRANCH_LABELS[course.branch ?? ''] ?? course.branch ?? ''}`);
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => a.name.localeCompare(b.name, 'es') || (a.campus ?? '').localeCompare(b.campus ?? '', 'es') || a.id.localeCompare(b.id));
}
